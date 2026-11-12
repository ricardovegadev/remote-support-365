import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Database,
  TechnicianProfileRow,
  TechnicianScheduleRow,
  TechnicianUnavailabilityRow,
  TicketAssignmentRow,
} from "../../types/database";

export interface AvailabilityValidationResult {
  isAvailable: boolean;
  isOffDuty: boolean;
  reason: string | null;
}

/**
 * Valida si un técnico se encuentra operativo y habilitado para recibir una nueva asignación.
 * Evalúa:
 * 1. Estado explícito de disponibilidad (available vs busy vs unavailable).
 * 2. Ausencias o indisponibilidades programadas que coincidan con la fecha.
 * 3. Horarios semanales de trabajo configurados.
 */
export function validateTechnicianAvailability(
  profile: TechnicianProfileRow,
  unavailabilities: TechnicianUnavailabilityRow[],
  schedules: TechnicianScheduleRow[],
  checkDate: Date = new Date(),
): AvailabilityValidationResult {
  // 1. Estado explícito en perfil
  if (profile.availability_status === "unavailable") {
    return {
      isAvailable: false,
      isOffDuty: false,
      reason: "El profesional ha marcado su estado como 'No disponible'.",
    };
  }

  if (profile.availability_status === "busy") {
    return {
      isAvailable: false,
      isOffDuty: false,
      reason: "El profesional está actualmente en atención / ocupado.",
    };
  }

  // 2. Comprobación de indisponibilidades programadas (vacaciones, licencias)
  const activeUnavailability = unavailabilities.find((u) => {
    const start = new Date(u.start_date).getTime();
    const end = new Date(u.end_date).getTime();
    const check = checkDate.getTime();
    return check >= start && check <= end;
  });

  if (activeUnavailability) {
    return {
      isAvailable: false,
      isOffDuty: false,
      reason: `Indisponibilidad programada: ${activeUnavailability.reason}`,
    };
  }

  // 3. Comprobación de horario de trabajo semanal (si tiene horarios configurados)
  const activeSchedules = schedules.filter((s) => s.is_active);
  if (activeSchedules.length > 0) {
    const dayOfWeek = checkDate.getDay(); // 0 = Domingo, 1 = Lunes, ...
    const todaySchedule = activeSchedules.find((s) => s.day_of_week === dayOfWeek);

    if (!todaySchedule) {
      return {
        isAvailable: false,
        isOffDuty: true,
        reason: "Fuera de jornada laboral (sin horario programado para hoy).",
      };
    }

    const currentHours = checkDate.getHours();
    const currentMinutes = checkDate.getMinutes();
    const currentTimeMinutes = currentHours * 60 + currentMinutes;

    const [startH, startM] = todaySchedule.start_time.split(":").map(Number);
    const [endH, endM] = todaySchedule.end_time.split(":").map(Number);
    const startTimeMinutes = startH * 60 + (startM || 0);
    const endTimeMinutes = endH * 60 + (endM || 0);

    if (currentTimeMinutes < startTimeMinutes || currentTimeMinutes >= endTimeMinutes) {
      return {
        isAvailable: false,
        isOffDuty: true,
        reason: `Fuera del horario de atención de hoy (${todaySchedule.start_time.slice(0, 5)} - ${todaySchedule.end_time.slice(0, 5)}).`,
      };
    }
  }

  return {
    isAvailable: true,
    isOffDuty: false,
    reason: null,
  };
}

/**
 * Calcula la carga de trabajo activa para un conjunto de asignaciones de un técnico.
 */
export function calculateTechnicianWorkload(assignments: TicketAssignmentRow[]): {
  activeCount: number;
  acceptedCount: number;
  totalPendingCount: number;
} {
  const activeCount = assignments.filter((a) => a.status === "active").length;
  const acceptedCount = assignments.filter((a) => a.status === "accepted").length;
  return {
    activeCount,
    acceptedCount,
    totalPendingCount: activeCount + acceptedCount,
  };
}

export interface AtomicAcceptResult {
  success: boolean;
  message: string;
  ticketId?: string;
}

/**
 * Ejecuta la aceptación atómica de una asignación previniendo condiciones de carrera
 * donde dos técnicos intenten aceptar simultáneamente el mismo servicio.
 *
 * REGLA ARQUITECTÓNICA OBLIGATORIA:
 * La RPC SQL `public.accept_ticket_assignment` es la única autoridad transaccional
 * con bloqueo `FOR UPDATE`. Se prohíben fallbacks en cliente que simulen atomicidad
 * mediante operaciones CRUD secuenciales.
 */
export async function atomicAcceptAssignment(
  client: SupabaseClient<Database>,
  assignmentId: string,
): Promise<AtomicAcceptResult> {
  try {
    const { data, error: rpcError } = await client.rpc(
      "accept_ticket_assignment",
      { p_assignment_id: assignmentId },
    );

    if (rpcError) {
      const code = rpcError.code ?? "";
      const msg = (rpcError.message ?? "").toLowerCase();

      // Conflicto de concurrencia: el servicio ya fue aceptado por otro técnico
      if (
        code === "23505" ||
        msg.includes("already accepted") ||
        msg.includes("ya fue aceptado") ||
        msg.includes("unique")
      ) {
        return {
          success: false,
          message: "El servicio ya fue aceptado previamente por otro profesional.",
        };
      }

      // Control de acceso y autorización
      if (
        code === "42501" ||
        msg.includes("no estás autorizado") ||
        msg.includes("permission denied")
      ) {
        return {
          success: false,
          message: "No tienes autorización para aceptar esta asignación.",
        };
      }

      // Registro no encontrado o ya inactivo
      if (
        code === "P0002" ||
        msg.includes("no encontrada") ||
        msg.includes("ya no está en estado activo")
      ) {
        return {
          success: false,
          message:
            "La asignación no existe o ya no se encuentra en estado disponible.",
        };
      }

      // RPC no migrada o ausente en el entorno
      if (
        code === "PGRST202" ||
        code === "42883" ||
        msg.includes("not found") ||
        msg.includes("function")
      ) {
        return {
          success: false,
          message:
            "La función RPC 'accept_ticket_assignment' no está instalada en Supabase DEV. Aplica la migración 20261111180000_workforce_and_dispatch.sql.",
        };
      }

      return {
        success: false,
        message:
          rpcError.message ||
          "Error al procesar la aceptación atómica de la asignación.",
      };
    }

    if (data && typeof data === "object") {
      const dataObj = data as { ticket_id?: string; success?: boolean };
      return {
        success: true,
        message:
          "Servicio aceptado correctamente mediante función atómica transaccional.",
        ticketId: dataObj.ticket_id,
      };
    }

    return {
      success: true,
      message: "Servicio aceptado correctamente.",
    };
  } catch (err) {
    const errorMsg = (err as Error)?.message || "";
    if (
      errorMsg.includes("already accepted") ||
      errorMsg.includes("ya fue aceptado") ||
      errorMsg.includes("23505")
    ) {
      return {
        success: false,
        message: "El servicio ya fue aceptado por otro técnico.",
      };
    }

    return {
      success: false,
      message: `Error al procesar la aceptación de la asignación: ${errorMsg}`,
    };
  }
}
