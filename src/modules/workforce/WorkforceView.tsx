import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  AlertCircle,
  AlertTriangle,
  Award,
  Bell,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  Info,
  Loader2,
  Mail,
  Plus,
  RefreshCw,
  Search,
  Ticket,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  Workflow,
  X,
  XCircle,
} from "lucide-react";

import { supabase } from "../../lib/supabase";
import { useAuth } from "../auth/AuthContext";
import {
  DAY_OF_WEEK_LABELS,
  NOTIFICATION_TYPE_LABELS,
  ORGANIZATION_ROLE_LABELS,
  TECHNICIAN_AVAILABILITY_LABELS,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  formatDatabaseError,
  type ClientRow,
  type DispatchSkillInsert,
  type DispatchSkillRow,
  type NotificationRow,
  type OrganizationMemberRow,
  type ProfileRow,
  type TechnicianAvailabilityStatus,
  type TechnicianProfileRow,
  type TechnicianScheduleRow,
  type TechnicianSkillRow,
  type TechnicianUnavailabilityRow,
  type TicketAssignmentRow,
  type TicketRow,
} from "../../types/database";
import {
  atomicAcceptAssignment,
  calculateTechnicianWorkload,
  validateTechnicianAvailability,
} from "../../lib/workforce/dispatch-service";

interface WorkforceViewProps {
  globalSearch: string;
  onNavigateToTicket?: (ticketId: string) => void;
  onNavigateToClient?: (clientId: string) => void;
}

type TabType = "technicians" | "dispatch" | "skills" | "notifications";

interface InviteMemberFormState {
  email: string;
  role: "technician_internal" | "technician_external" | "dispatcher";
}

const INITIAL_INVITE_FORM: InviteMemberFormState = {
  email: "",
  role: "technician_internal",
};

interface NewSkillFormState {
  name: string;
  category: string;
  description: string;
}

const INITIAL_SKILL_FORM: NewSkillFormState = {
  name: "",
  category: "Sistemas Operativos",
  description: "",
};

interface UnavailabilityFormState {
  start_date: string;
  end_date: string;
  reason: string;
}

const INITIAL_UNAVAILABILITY_FORM: UnavailabilityFormState = {
  start_date: "",
  end_date: "",
  reason: "",
};

interface AssignTicketFormState {
  ticket_id: string;
  membership_id: string;
}

const INITIAL_ASSIGN_FORM: AssignTicketFormState = {
  ticket_id: "",
  membership_id: "",
};

export default function WorkforceView({
  globalSearch,
  onNavigateToTicket,
  onNavigateToClient,
}: WorkforceViewProps) {
  const { activeOrganization, user, activeRole } = useAuth();
  const organizationId = activeOrganization?.id ?? null;

  const [activeTab, setActiveTab] = useState<TabType>("technicians");

  // Datos principales
  const [members, setMembers] = useState<OrganizationMemberRow[]>([]);
  const [profiles, setProfiles] = useState<Map<string, ProfileRow>>(new Map());
  const [techProfiles, setTechProfiles] = useState<TechnicianProfileRow[]>([]);
  const [skills, setSkills] = useState<DispatchSkillRow[]>([]);
  const [techSkills, setTechSkills] = useState<TechnicianSkillRow[]>([]);
  const [schedules, setSchedules] = useState<TechnicianScheduleRow[]>([]);
  const [unavailabilities, setUnavailabilities] = useState<
    TechnicianUnavailabilityRow[]
  >([]);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [assignments, setAssignments] = useState<TicketAssignmentRow[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);

  // Estados de carga y feedback
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Filtros locales
  const [techSearch, setTechSearch] = useState<string>("");
  const [techRoleFilter, setTechRoleFilter] = useState<string>("all");
  const [techStatusFilter, setTechStatusFilter] = useState<string>("all");

  const [dispatchSearch, setDispatchSearch] = useState<string>("");

  // Técnico seleccionado para detalle
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  // Modales
  const [inviteModalOpen, setInviteModalOpen] = useState<boolean>(false);
  const [inviteForm, setInviteForm] =
    useState<InviteMemberFormState>(INITIAL_INVITE_FORM);
  const [inviteSubmitting, setInviteSubmitting] = useState<boolean>(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const [skillModalOpen, setSkillModalOpen] = useState<boolean>(false);
  const [skillForm, setSkillForm] =
    useState<NewSkillFormState>(INITIAL_SKILL_FORM);
  const [skillSubmitting, setSkillSubmitting] = useState<boolean>(false);
  const [skillError, setSkillError] = useState<string | null>(null);

  const [unavailabilityModalOpen, setUnavailabilityModalOpen] =
    useState<boolean>(false);
  const [unavailabilityForm, setUnavailabilityForm] =
    useState<UnavailabilityFormState>(INITIAL_UNAVAILABILITY_FORM);
  const [unavailabilitySubmitting, setUnavailabilitySubmitting] =
    useState<boolean>(false);
  const [unavailabilityError, setUnavailabilityError] = useState<string | null>(
    null,
  );

  const [assignModalOpen, setAssignModalOpen] = useState<boolean>(false);
  const [assignForm, setAssignForm] =
    useState<AssignTicketFormState>(INITIAL_ASSIGN_FORM);
  const [assignSubmitting, setAssignSubmitting] = useState<boolean>(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  const listRequestIdRef = useRef<number>(0);

  const canManageWorkforce = useMemo(() => {
    return (
      activeRole === "owner" ||
      activeRole === "admin" ||
      activeRole === "dispatcher"
    );
  }, [activeRole]);

  // Carga general de datos
  const loadWorkforceData = useCallback(
    async (targetOrgId: string) => {
      const requestId = ++listRequestIdRef.current;
      setLoading(true);
      setError(null);

      const client = supabase;
      if (!client) {
        setError("Cliente de Supabase no disponible en variables de entorno.");
        setLoading(false);
        return;
      }

      try {
        const [
          membersRes,
          profilesRes,
          techProfilesRes,
          skillsRes,
          techSkillsRes,
          schedulesRes,
          unavailRes,
          ticketsRes,
          assignmentsRes,
          clientsRes,
          notificationsRes,
        ] = await Promise.all([
          client
            .from("organization_members")
            .select(
              "id, organization_id, user_id, role, membership_type, status, created_at, updated_at",
            )
            .eq("organization_id", targetOrgId)
            .order("created_at", { ascending: true }),
          client
            .from("profiles")
            .select("id, display_name, avatar_path, created_at, updated_at"),
          client
            .from("technician_profiles")
            .select(
              "id, organization_id, user_id, specialties, availability_status, notes, created_at, updated_at",
            )
            .eq("organization_id", targetOrgId),
          client
            .from("dispatch_skills")
            .select(
              "id, organization_id, name, category, description, is_active, created_at",
            )
            .eq("organization_id", targetOrgId)
            .order("category", { ascending: true })
            .order("name", { ascending: true }),
          client
            .from("technician_skills")
            .select(
              "id, organization_id, technician_profile_id, skill_id, years_experience, created_at",
            )
            .eq("organization_id", targetOrgId),
          client
            .from("technician_schedules")
            .select(
              "id, organization_id, technician_profile_id, day_of_week, start_time, end_time, is_active, created_at",
            )
            .eq("organization_id", targetOrgId)
            .order("day_of_week", { ascending: true }),
          client
            .from("technician_unavailabilities")
            .select(
              "id, organization_id, technician_profile_id, start_date, end_date, reason, created_at",
            )
            .eq("organization_id", targetOrgId)
            .order("start_date", { ascending: true }),
          client
            .from("tickets")
            .select(
              "id, organization_id, client_id, device_id, ticket_number, subject, description, priority, status, source, created_by, resolved_at, closed_at, archived_at, created_at, updated_at",
            )
            .eq("organization_id", targetOrgId)
            .order("created_at", { ascending: false }),
          client
            .from("ticket_assignments")
            .select(
              "id, organization_id, ticket_id, membership_id, assigned_by, status, assigned_at, responded_at, completed_at",
            )
            .eq("organization_id", targetOrgId)
            .order("assigned_at", { ascending: false }),
          client
            .from("clients")
            .select(
              "id, organization_id, name, email, phone, status, created_at, updated_at, archived_at",
            )
            .eq("organization_id", targetOrgId)
            .order("name", { ascending: true }),
          client
            .from("notifications")
            .select(
              "id, organization_id, user_id, ticket_id, type, title, message, read, read_at, metadata, created_at",
            )
            .eq("organization_id", targetOrgId)
            .order("created_at", { ascending: false }),
        ]);

        if (listRequestIdRef.current !== requestId) {
          return;
        }

        if (membersRes.error) {
          throw membersRes.error;
        }

        const memberRows = (membersRes.data ?? []) as OrganizationMemberRow[];
        const profileMap = new Map<string, ProfileRow>(
          ((profilesRes.data ?? []) as ProfileRow[]).map((p) => [p.id, p]),
        );
        const techProfileRows = techProfilesRes.error
          ? []
          : ((techProfilesRes.data ?? []) as TechnicianProfileRow[]);
        const skillRows = skillsRes.error
          ? []
          : ((skillsRes.data ?? []) as DispatchSkillRow[]);
        const techSkillRows = techSkillsRes.error
          ? []
          : ((techSkillsRes.data ?? []) as TechnicianSkillRow[]);
        const scheduleRows = schedulesRes.error
          ? []
          : ((schedulesRes.data ?? []) as TechnicianScheduleRow[]);
        const unavailRows = unavailRes.error
          ? []
          : ((unavailRes.data ?? []) as TechnicianUnavailabilityRow[]);
        const ticketRows = ticketsRes.error
          ? []
          : ((ticketsRes.data ?? []) as TicketRow[]);
        const assignmentRows = assignmentsRes.error
          ? []
          : ((assignmentsRes.data ?? []) as TicketAssignmentRow[]);
        const clientRows = clientsRes.error
          ? []
          : ((clientsRes.data ?? []) as ClientRow[]);
        const notificationRows = notificationsRes.error
          ? []
          : ((notificationsRes.data ?? []) as NotificationRow[]);

        setMembers(memberRows);
        setProfiles(profileMap);
        setTechProfiles(techProfileRows);
        setSkills(skillRows);
        setTechSkills(techSkillRows);
        setSchedules(scheduleRows);
        setUnavailabilities(unavailRows);
        setTickets(ticketRows);
        setAssignments(assignmentRows);
        setClients(clientRows);
        setNotifications(notificationRows);

        // Seleccionar primer miembro por defecto
        if (!selectedMemberId && memberRows.length > 0) {
          setSelectedMemberId(memberRows[0].id);
        }
      } catch (err) {
        if (listRequestIdRef.current !== requestId) {
          return;
        }
        setError(
          formatDatabaseError(
            err,
            "Error al cargar la información del equipo y despacho.",
          ),
        );
      } finally {
        if (listRequestIdRef.current === requestId) {
          setLoading(false);
        }
      }
    },
    [selectedMemberId],
  );

  useEffect(() => {
    if (!organizationId) {
      return;
    }
    void Promise.resolve().then(() => {
      void loadWorkforceData(organizationId);
    });
  }, [organizationId, loadWorkforceData]);

  // Diccionarios auxiliares
  const memberMap = useMemo(
    () => new Map<string, OrganizationMemberRow>(members.map((m) => [m.id, m])),
    [members],
  );

  const clientMap = useMemo(
    () => new Map<string, ClientRow>(clients.map((c) => [c.id, c])),
    [clients],
  );

  const ticketMap = useMemo(
    () => new Map<string, TicketRow>(tickets.map((t) => [t.id, t])),
    [tickets],
  );

  const techProfileByUserId = useMemo(
    () => new Map<string, TechnicianProfileRow>(techProfiles.map((tp) => [tp.user_id, tp])),
    [techProfiles],
  );

  // Lista de miembros clasificados como técnicos o dispatchers
  const technicalMembers = useMemo(() => {
    return members.filter(
      (m) =>
        m.role === "technician_internal" ||
        m.role === "technician_external" ||
        m.role === "dispatcher" ||
        m.role === "admin" ||
        m.role === "owner",
    );
  }, [members]);

  const selectedMember = useMemo(
    () => (selectedMemberId ? memberMap.get(selectedMemberId) ?? null : null),
    [memberMap, selectedMemberId],
  );

  const selectedTechProfile = useMemo(
    () =>
      selectedMember
        ? techProfileByUserId.get(selectedMember.user_id) ?? null
        : null,
    [selectedMember, techProfileByUserId],
  );

  // Especialidades del técnico seleccionado
  const selectedMemberSkills = useMemo(() => {
    if (!selectedTechProfile) {
      return [];
    }
    const boundSkillIds = new Set(
      techSkills
        .filter((ts) => ts.technician_profile_id === selectedTechProfile.id)
        .map((ts) => ts.skill_id),
    );
    return skills.filter((s) => boundSkillIds.has(s.id));
  }, [selectedTechProfile, techSkills, skills]);

  // Horarios e indisponibilidades del técnico seleccionado
  const selectedMemberSchedules = useMemo(() => {
    if (!selectedTechProfile) {
      return [];
    }
    return schedules.filter(
      (s) => s.technician_profile_id === selectedTechProfile.id,
    );
  }, [selectedTechProfile, schedules]);

  const selectedMemberUnavailabilities = useMemo(() => {
    if (!selectedTechProfile) {
      return [];
    }
    return unavailabilities.filter(
      (u) => u.technician_profile_id === selectedTechProfile.id,
    );
  }, [selectedTechProfile, unavailabilities]);

  // Asignaciones del técnico seleccionado
  const selectedMemberAssignments = useMemo(() => {
    if (!selectedMemberId) {
      return [];
    }
    return assignments.filter((a) => a.membership_id === selectedMemberId);
  }, [assignments, selectedMemberId]);

  // Métricas de disponibilidad general
  const availabilityMetrics = useMemo(() => {
    let availableCount = 0;
    let busyCount = 0;
    let unavailableCount = 0;
    let externalCount = 0;

    for (const member of technicalMembers) {
      if (member.role === "technician_external") {
        externalCount++;
      }
      const tp = techProfileByUserId.get(member.user_id);
      const status = tp?.availability_status ?? "available";

      if (member.status !== "active") {
        unavailableCount++;
      } else if (status === "available") {
        availableCount++;
      } else if (status === "busy") {
        busyCount++;
      } else {
        unavailableCount++;
      }
    }

    const unassignedTicketsCount = tickets.filter(
      (t) =>
        (t.status === "new" || t.status === "open") &&
        !assignments.some(
          (a) => a.ticket_id === t.id && (a.status === "active" || a.status === "accepted"),
        ),
    ).length;

    return {
      availableCount,
      busyCount,
      unavailableCount,
      externalCount,
      unassignedTicketsCount,
    };
  }, [technicalMembers, techProfileByUserId, tickets, assignments]);

  // Filtros de directorio de técnicos
  const effectiveTechSearch = (techSearch.trim() || globalSearch.trim()).toLowerCase();

  const filteredTechnicalMembers = useMemo(() => {
    return technicalMembers.filter((m) => {
      const prof = profiles.get(m.user_id);
      const tp = techProfileByUserId.get(m.user_id);
      const name = prof?.display_name?.toLowerCase() ?? "";

      if (techRoleFilter !== "all" && m.role !== techRoleFilter) {
        return false;
      }

      if (techStatusFilter !== "all") {
        const currentAvail = tp?.availability_status ?? "available";
        if (currentAvail !== techStatusFilter) {
          return false;
        }
      }

      if (effectiveTechSearch) {
        const matchesName = name.includes(effectiveTechSearch);
        const matchesRole = ORGANIZATION_ROLE_LABELS[m.role]
          .toLowerCase()
          .includes(effectiveTechSearch);
        const matchesNotes = (tp?.notes ?? "").toLowerCase().includes(effectiveTechSearch);
        if (!matchesName && !matchesRole && !matchesNotes) {
          return false;
        }
      }

      return true;
    });
  }, [
    technicalMembers,
    profiles,
    techProfileByUserId,
    techRoleFilter,
    techStatusFilter,
    effectiveTechSearch,
  ]);

  // Tickets en cola de despacho
  const dispatchQueueTickets = useMemo(() => {
    return tickets.filter((t) => {
      if (t.status === "closed" || t.status === "cancelled") {
        return false;
      }
      if (dispatchSearch.trim()) {
        const term = dispatchSearch.trim().toLowerCase();
        const client = clientMap.get(t.client_id);
        const subjectMatch = t.subject.toLowerCase().includes(term);
        const numberMatch = String(t.ticket_number ?? "").includes(term);
        const clientMatch = client?.name.toLowerCase().includes(term);
        if (!subjectMatch && !numberMatch && !clientMatch) {
          return false;
        }
      }
      return true;
    });
  }, [tickets, dispatchSearch, clientMap]);

  // ---------------------------------------------------------------------------
  // OPERACIONES: GESTIÓN DE DISPONIBILIDAD Y PERFIL TÉCNICO
  // ---------------------------------------------------------------------------
  const handleUpdateAvailability = async (
    targetUserId: string,
    newStatus: TechnicianAvailabilityStatus,
  ) => {
    if (!organizationId) {
      return;
    }

    const client = supabase;
    if (!client) {
      return;
    }

    try {
      const existingTp = techProfileByUserId.get(targetUserId);

      if (existingTp) {
        const { error: updateError } = await client
          .from("technician_profiles")
          .update({
            availability_status: newStatus,
            updated_at: new Date().toISOString(),
          })
          .eq("organization_id", organizationId)
          .eq("id", existingTp.id);

        if (updateError) {
          throw updateError;
        }

        setTechProfiles((prev) =>
          prev.map((tp) =>
            tp.id === existingTp.id ? { ...tp, availability_status: newStatus } : tp,
          ),
        );
      } else {
        const { data: inserted, error: insertError } = await client
          .from("technician_profiles")
          .insert({
            organization_id: organizationId,
            user_id: targetUserId,
            availability_status: newStatus,
          })
          .select(
            "id, organization_id, user_id, specialties, availability_status, notes, created_at, updated_at",
          )
          .single();

        if (insertError) {
          throw insertError;
        }

        const newTp = inserted as TechnicianProfileRow;
        setTechProfiles((prev) => [...prev, newTp]);
      }

      setActionSuccess(
        `Disponibilidad actualizada a "${TECHNICIAN_AVAILABILITY_LABELS[newStatus]}".`,
      );
    } catch (err) {
      setError(
        formatDatabaseError(
          err,
          "No fue posible actualizar el estado de disponibilidad del técnico.",
        ),
      );
    }
  };

  // ---------------------------------------------------------------------------
  // OPERACIONES: ACTIVAR / SUSPENDER MIEMBRO
  // ---------------------------------------------------------------------------
  const handleToggleMemberStatus = async (
    memberId: string,
    nextStatus: "active" | "suspended",
  ) => {
    if (!organizationId || !canManageWorkforce) {
      return;
    }

    const client = supabase;
    if (!client) {
      return;
    }

    try {
      const { error: updateError } = await client
        .from("organization_members")
        .update({
          status: nextStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("organization_id", organizationId)
        .eq("id", memberId);

      if (updateError) {
        throw updateError;
      }

      setMembers((prev) =>
        prev.map((m) => (m.id === memberId ? { ...m, status: nextStatus } : m)),
      );

      setActionSuccess(
        nextStatus === "active"
          ? "Colaborador activado en el equipo."
          : "Colaborador suspendido temporalmente.",
      );
    } catch (err) {
      setError(
        formatDatabaseError(
          err,
          "No se pudo actualizar el estado de la membresía.",
        ),
      );
    }
  };

  // ---------------------------------------------------------------------------
  // OPERACIONES: VINCULAR / DESVINCULAR ESPECIALIDADES
  // ---------------------------------------------------------------------------
  const handleToggleTechnicianSkill = async (
    technicianProfileId: string,
    skillId: string,
    hasSkill: boolean,
  ) => {
    if (!organizationId) {
      return;
    }

    const client = supabase;
    if (!client) {
      return;
    }

    try {
      if (hasSkill) {
        // Eliminar
        const { error: deleteError } = await client
          .from("technician_skills")
          .delete()
          .eq("organization_id", organizationId)
          .eq("technician_profile_id", technicianProfileId)
          .eq("skill_id", skillId);

        if (deleteError) {
          throw deleteError;
        }

        setTechSkills((prev) =>
          prev.filter(
            (ts) =>
              !(
                ts.technician_profile_id === technicianProfileId &&
                ts.skill_id === skillId
              ),
          ),
        );
      } else {
        // Insertar
        const { data: inserted, error: insertError } = await client
          .from("technician_skills")
          .insert({
            organization_id: organizationId,
            technician_profile_id: technicianProfileId,
            skill_id: skillId,
            years_experience: 1,
          })
          .select(
            "id, organization_id, technician_profile_id, skill_id, years_experience, created_at",
          )
          .single();

        if (insertError) {
          throw insertError;
        }

        setTechSkills((prev) => [...prev, inserted as TechnicianSkillRow]);
      }
    } catch (err) {
      setError(
        formatDatabaseError(
          err,
          "No se pudo actualizar las especialidades del técnico.",
        ),
      );
    }
  };

  // ---------------------------------------------------------------------------
  // OPERACIONES: REGISTRAR INDISPONIBILIDAD PROGRAMADA
  // ---------------------------------------------------------------------------
  const handleSubmitUnavailability = async (e: FormEvent) => {
    e.preventDefault();
    if (!organizationId || !selectedTechProfile) {
      return;
    }

    if (!unavailabilityForm.start_date || !unavailabilityForm.end_date) {
      setUnavailabilityError("Debes especificar fecha de inicio y término.");
      return;
    }
    if (!unavailabilityForm.reason.trim()) {
      setUnavailabilityError("Es obligatorio indicar el motivo de la ausencia.");
      return;
    }

    const client = supabase;
    if (!client) {
      return;
    }

    setUnavailabilitySubmitting(true);
    setUnavailabilityError(null);

    try {
      const { data, error: insertError } = await client
        .from("technician_unavailabilities")
        .insert({
          organization_id: organizationId,
          technician_profile_id: selectedTechProfile.id,
          start_date: new Date(unavailabilityForm.start_date).toISOString(),
          end_date: new Date(unavailabilityForm.end_date).toISOString(),
          reason: unavailabilityForm.reason.trim(),
        })
        .select(
          "id, organization_id, technician_profile_id, start_date, end_date, reason, created_at",
        )
        .single();

      if (insertError) {
        throw insertError;
      }

      setUnavailabilities((prev) => [...prev, data as TechnicianUnavailabilityRow]);
      setUnavailabilityModalOpen(false);
      setUnavailabilityForm(INITIAL_UNAVAILABILITY_FORM);
      setActionSuccess("Periodo de indisponibilidad registrado.");
    } catch (err) {
      setUnavailabilityError(
        formatDatabaseError(
          err,
          "No se pudo registrar la indisponibilidad programada.",
        ),
      );
    } finally {
      setUnavailabilitySubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // OPERACIONES: CREAR NUEVA ESPECIALIDAD EN EL CATÁLOGO
  // ---------------------------------------------------------------------------
  const handleSubmitNewSkill = async (e: FormEvent) => {
    e.preventDefault();
    if (!organizationId) {
      return;
    }

    const trimmedName = skillForm.name.trim();
    if (!trimmedName) {
      setSkillError("El nombre de la especialidad es obligatorio.");
      return;
    }

    const client = supabase;
    if (!client) {
      return;
    }

    setSkillSubmitting(true);
    setSkillError(null);

    try {
      const payload: DispatchSkillInsert = {
        organization_id: organizationId,
        name: trimmedName,
        category: skillForm.category.trim() || "General",
        description: skillForm.description.trim() || null,
        is_active: true,
      };

      const { data, error: insertError } = await client
        .from("dispatch_skills")
        .insert(payload)
        .select(
          "id, organization_id, name, category, description, is_active, created_at",
        )
        .single();

      if (insertError) {
        throw insertError;
      }

      setSkills((prev) => [...prev, data as DispatchSkillRow]);
      setSkillModalOpen(false);
      setSkillForm(INITIAL_SKILL_FORM);
      setActionSuccess(`Especialidad "${trimmedName}" creada en el catálogo.`);
    } catch (err) {
      setSkillError(
        formatDatabaseError(
          err,
          "No se pudo crear la especialidad en el catálogo.",
        ),
      );
    } finally {
      setSkillSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // OPERACIONES: INVITAR TÉCNICO O COLABORADOR
  // ---------------------------------------------------------------------------
  const handleSubmitInvite = async (e: FormEvent) => {
    e.preventDefault();
    if (!organizationId || !user) {
      return;
    }

    const email = inviteForm.email.trim().toLowerCase();
    if (!email) {
      setInviteError("El correo electrónico es obligatorio.");
      return;
    }

    const client = supabase;
    if (!client) {
      return;
    }

    setInviteSubmitting(true);
    setInviteError(null);

    try {
      // Token determinista / seguro para la invitación
      const randomBytes = new Uint8Array(24);
      crypto.getRandomValues(randomBytes);
      const tokenHash = Array.from(randomBytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const expiresAt = new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000,
      ).toISOString();

      const { error: inviteErr } = await client
        .from("organization_invitations")
        .insert({
          organization_id: organizationId,
          email,
          role: inviteForm.role,
          token_hash: tokenHash,
          invited_by: user.id,
          status: "pending",
          expires_at: expiresAt,
        });

      if (inviteErr) {
        throw inviteErr;
      }

      // Registro de notificación in-app (no bloqueante)
      try {
        await client.from("notifications").insert({
          organization_id: organizationId,
          user_id: user.id,
          type: "invitation_received",
          title: "Invitación de colaborador generada",
          message: `Se ha emitido una invitación formal para ${email} como ${ORGANIZATION_ROLE_LABELS[inviteForm.role]}.`,
          metadata: { email, role: inviteForm.role },
        });
      } catch {
        // Log interno silencioso
      }

      setInviteModalOpen(false);
      setInviteForm(INITIAL_INVITE_FORM);
      setActionSuccess(`Invitación enviada exitosamente a ${email}.`);
      void loadWorkforceData(organizationId);
    } catch (err) {
      setInviteError(
        formatDatabaseError(
          err,
          "No se pudo registrar la invitación para el profesional.",
        ),
      );
    } finally {
      setInviteSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // OPERACIONES: DESPACHO Y ASIGNACIÓN DE TICKET
  // ---------------------------------------------------------------------------
  const handleOpenAssignModal = (ticketId: string) => {
    setAssignForm({
      ticket_id: ticketId,
      membership_id: technicalMembers[0]?.id ?? "",
    });
    setAssignError(null);
    setAssignModalOpen(true);
  };

  const handleSubmitAssignment = async (e: FormEvent) => {
    e.preventDefault();
    if (!organizationId || !user) {
      return;
    }

    if (!assignForm.ticket_id || !assignForm.membership_id) {
      setAssignError("Debes seleccionar el ticket y el profesional asignado.");
      return;
    }

    const client = supabase;
    if (!client) {
      return;
    }

    setAssignSubmitting(true);
    setAssignError(null);

    try {
      const targetMember = memberMap.get(assignForm.membership_id);
      if (!targetMember) {
        throw new Error("El miembro seleccionado no es válido.");
      }

      // 1. Crear la asignación en ticket_assignments
      const { data: newAssignment, error: assignInsertError } = await client
        .from("ticket_assignments")
        .insert({
          organization_id: organizationId,
          ticket_id: assignForm.ticket_id,
          membership_id: assignForm.membership_id,
          assigned_by: user.id,
          status: "active",
        })
        .select(
          "id, organization_id, ticket_id, membership_id, assigned_by, status, assigned_at, responded_at, completed_at",
        )
        .single();

      if (assignInsertError) {
        throw assignInsertError;
      }

      // 2. Generar notificación para el técnico asignado
      await client.from("notifications").insert({
        organization_id: organizationId,
        user_id: targetMember.user_id,
        ticket_id: assignForm.ticket_id,
        type: "assignment_received",
        title: "Nueva solicitud asignada",
        message: `Se te ha asignado el ticket de soporte #${
          ticketMap.get(assignForm.ticket_id)?.ticket_number ?? ""
        }.`,
      });

      // Actualizar estados locales
      setAssignments((prev) => [newAssignment as TicketAssignmentRow, ...prev]);
      setAssignModalOpen(false);
      setActionSuccess("Ticket asignado exitosamente y notificación enviada.");
    } catch (err) {
      setAssignError(
        formatDatabaseError(err, "No se pudo completar la asignación del ticket."),
      );
    } finally {
      setAssignSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // OPERACIONES: ACEPTACIÓN ATÓMICA DE SERVICIO POR EL TÉCNICO
  // ---------------------------------------------------------------------------
  const handleAcceptAssignment = async (assignment: TicketAssignmentRow) => {
    if (!organizationId) {
      return;
    }

    const client = supabase;
    if (!client) {
      return;
    }

    try {
      const result = await atomicAcceptAssignment(
        client,
        assignment.id,
      );

      if (!result.success) {
        setError(result.message);
        return;
      }

      // Actualizar estado local
      setAssignments((prev) =>
        prev.map((a) =>
          a.id === assignment.id
            ? {
                ...a,
                status: "accepted",
                responded_at: new Date().toISOString(),
              }
            : a.ticket_id === assignment.ticket_id && a.status === "active"
              ? { ...a, status: "cancelled" }
              : a,
        ),
      );

      setTickets((prev) =>
        prev.map((t) =>
          t.id === assignment.ticket_id &&
          (t.status === "new" || t.status === "open")
            ? { ...t, status: "in_progress" }
            : t,
        ),
      );

      setActionSuccess(result.message);
    } catch (err) {
      setError(
        formatDatabaseError(err, "Error al procesar la aceptación del servicio."),
      );
    }
  };

  // ---------------------------------------------------------------------------
  // RENDERIZADO
  // ---------------------------------------------------------------------------
  return (
    <div className="module-container">
      {/* Alertas y avisos */}
      {error && (
        <div className="banner error-banner" role="alert">
          <AlertCircle size={18} />
          <span>{error}</span>
          <button
            type="button"
            className="icon-button"
            onClick={() => setError(null)}
            aria-label="Cerrar error"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {actionSuccess && (
        <div className="banner success-banner" role="status">
          <CheckCircle2 size={18} />
          <span>{actionSuccess}</span>
          <button
            type="button"
            className="icon-button"
            onClick={() => setActionSuccess(null)}
            aria-label="Cerrar notificación"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Métricas Principales de Disponibilidad del Equipo */}
      <section className="workforce-metrics-grid">
        <div className="metric-box status-available">
          <div className="metric-icon">
            <UserCheck size={22} />
          </div>
          <div>
            <strong className="metric-number">
              {availabilityMetrics.availableCount}
            </strong>
            <span className="metric-label">Técnicos disponibles</span>
          </div>
        </div>

        <div className="metric-box status-busy">
          <div className="metric-icon">
            <Clock size={22} />
          </div>
          <div>
            <strong className="metric-number">
              {availabilityMetrics.busyCount}
            </strong>
            <span className="metric-label">En servicio activo</span>
          </div>
        </div>

        <div className="metric-box status-unavailable">
          <div className="metric-icon">
            <XCircle size={22} />
          </div>
          <div>
            <strong className="metric-number">
              {availabilityMetrics.unavailableCount}
            </strong>
            <span className="metric-label">No disponibles / Ausentes</span>
          </div>
        </div>

        <div className="metric-box status-external">
          <div className="metric-icon">
            <Users size={22} />
          </div>
          <div>
            <strong className="metric-number">
              {availabilityMetrics.externalCount}
            </strong>
            <span className="metric-label">Colaboradores externos</span>
          </div>
        </div>

        <div className="metric-box status-dispatch">
          <div className="metric-icon">
            <Ticket size={22} />
          </div>
          <div>
            <strong className="metric-number">
              {availabilityMetrics.unassignedTicketsCount}
            </strong>
            <span className="metric-label">Tickets pendientes de asignación</span>
          </div>
        </div>
      </section>

      {/* Pestañas de Navegación del Módulo Workforce */}
      <div className="module-tabs-header">
        <div className="module-tabs">
          <button
            type="button"
            className={`module-tab-button ${
              activeTab === "technicians" ? "active" : ""
            }`}
            onClick={() => setActiveTab("technicians")}
          >
            <Users size={16} />
            Directorio de profesionales ({technicalMembers.length})
          </button>
          <button
            type="button"
            className={`module-tab-button ${
              activeTab === "dispatch" ? "active" : ""
            }`}
            onClick={() => setActiveTab("dispatch")}
          >
            <Workflow size={16} />
            Bandeja de despacho ({dispatchQueueTickets.length})
          </button>
          <button
            type="button"
            className={`module-tab-button ${
              activeTab === "skills" ? "active" : ""
            }`}
            onClick={() => setActiveTab("skills")}
          >
            <Award size={16} />
            Especialidades ({skills.length})
          </button>
          <button
            type="button"
            className={`module-tab-button ${
              activeTab === "notifications" ? "active" : ""
            }`}
            onClick={() => setActiveTab("notifications")}
          >
            <Bell size={16} />
            Notificaciones ({notifications.length})
          </button>
        </div>

        <div className="module-tabs-actions">
          {activeTab === "technicians" && canManageWorkforce && (
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                setInviteForm(INITIAL_INVITE_FORM);
                setInviteError(null);
                setInviteModalOpen(true);
              }}
            >
              <UserPlus size={16} />
              Invitar profesional
            </button>
          )}

          {activeTab === "skills" && canManageWorkforce && (
            <button
              type="button"
              className="primary-button"
              onClick={() => setSkillModalOpen(true)}
            >
              <Plus size={16} />
              Nueva especialidad
            </button>
          )}

          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              if (organizationId) {
                void loadWorkforceData(organizationId);
              }
            }}
            disabled={loading}
            aria-label="Actualizar datos"
          >
            <RefreshCw size={16} className={loading ? "auth-spinner" : ""} />
            Actualizar
          </button>
        </div>
      </div>

      {/* --------------------------------------------------------------------- */}
      {/* PESTAÑA 1: DIRECTORIO DE TÉCNICOS Y COLABORADORES */}
      {/* --------------------------------------------------------------------- */}
      {activeTab === "technicians" && (
        <div className="two-column-layout">
          {/* Columna Izquierda: Listado */}
          <div className="list-column panel">
            <div className="filter-bar">
              <div className="search-input-wrapper">
                <Search size={16} />
                <input
                  type="text"
                  placeholder="Buscar técnico por nombre o especialidad..."
                  value={techSearch}
                  onChange={(e) => setTechSearch(e.target.value)}
                />
              </div>

              <select
                value={techRoleFilter}
                onChange={(e) => setTechRoleFilter(e.target.value)}
                className="filter-select"
              >
                <option value="all">Todos los roles</option>
                <option value="technician_internal">Técnico interno</option>
                <option value="technician_external">Colaborador externo</option>
                <option value="dispatcher">Coordinador (Dispatcher)</option>
              </select>

              <select
                value={techStatusFilter}
                onChange={(e) => setTechStatusFilter(e.target.value)}
                className="filter-select"
              >
                <option value="all">Toda disponibilidad</option>
                <option value="available">Disponible</option>
                <option value="busy">En servicio</option>
                <option value="unavailable">No disponible</option>
              </select>
            </div>

            {loading ? (
              <div className="loading-state-box">
                <Loader2 size={24} className="auth-spinner" />
                <span>Cargando equipo de soporte...</span>
              </div>
            ) : filteredTechnicalMembers.length === 0 ? (
              <div className="empty-state-box">
                <Users size={32} />
                <strong>No se encontraron profesionales</strong>
                <p>No hay técnicos que coincidan con los filtros aplicados.</p>
              </div>
            ) : (
              <div className="entity-list">
                {filteredTechnicalMembers.map((member) => {
                  const prof = profiles.get(member.user_id);
                  const tp = techProfileByUserId.get(member.user_id);
                  const memberWorkload = calculateTechnicianWorkload(
                    assignments.filter((a) => a.membership_id === member.id),
                  );
                  const isSelected = member.id === selectedMemberId;
                  const currentAvail = tp?.availability_status ?? "available";

                  return (
                    <button
                      type="button"
                      key={member.id}
                      className={`entity-list-item ${isSelected ? "selected" : ""}`}
                      onClick={() => setSelectedMemberId(member.id)}
                    >
                      <div className="entity-item-header">
                        <span className="entity-item-title">
                          {prof?.display_name ?? "Técnico sin nombre"}
                        </span>
                        <span
                          className={`badge ${
                            currentAvail === "available"
                              ? "badge-success"
                              : currentAvail === "busy"
                                ? "badge-warning"
                                : "badge-danger"
                          }`}
                        >
                          {TECHNICIAN_AVAILABILITY_LABELS[currentAvail]}
                        </span>
                      </div>

                      <div className="entity-item-meta">
                        <span>
                          <strong>Rol:</strong> {ORGANIZATION_ROLE_LABELS[member.role]}
                        </span>
                        <span>
                          <strong>Membresía:</strong>{" "}
                          {member.membership_type === "internal"
                            ? "Interno"
                            : "Externo / Independiente"}
                        </span>
                      </div>

                      <div className="entity-item-footer">
                        <span className="badge badge-outline">
                          {memberWorkload.totalPendingCount} tickets asignados
                        </span>
                        <span
                          className={`badge ${
                            member.status === "active" ? "badge-neutral" : "badge-danger"
                          }`}
                        >
                          {member.status === "active" ? "Activo" : "Suspendido"}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Columna Derecha: Ficha Técnica del Profesional */}
          <div className="detail-column panel">
            {!selectedMember ? (
              <div className="empty-state-box">
                <Info size={32} />
                <strong>Selecciona un técnico</strong>
                <p>
                  Elige un profesional del directorio para administrar sus especialidades,
                  horarios y disponibilidad.
                </p>
              </div>
            ) : (
              <div className="technician-profile-view">
                <div className="detail-header">
                  <div>
                    <div className="eyebrow">
                      {ORGANIZATION_ROLE_LABELS[selectedMember.role].toUpperCase()} •{" "}
                      {selectedMember.membership_type === "internal"
                        ? "EQUIPO INTERNO"
                        : "COLABORADOR EXTERNO"}
                    </div>
                    <h2>
                      {profiles.get(selectedMember.user_id)?.display_name ??
                        "Técnico de la organización"}
                    </h2>
                  </div>

                  <div className="detail-actions">
                    {canManageWorkforce && (
                      <button
                        type="button"
                        className={
                          selectedMember.status === "active"
                            ? "secondary-button"
                            : "primary-button"
                        }
                        onClick={() =>
                          handleToggleMemberStatus(
                            selectedMember.id,
                            selectedMember.status === "active" ? "suspended" : "active",
                          )
                        }
                      >
                        {selectedMember.status === "active" ? (
                          <>
                            <UserMinus size={15} /> Suspender
                          </>
                        ) : (
                          <>
                            <UserCheck size={15} /> Activar
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* Control Rápido de Estado de Disponibilidad */}
                <div className="availability-selector-card">
                  <div>
                    <strong>Estado de disponibilidad operativa:</strong>
                    <p>Actualiza la condición del profesional para el despacho automático.</p>
                  </div>
                  <div className="availability-buttons-group">
                    <button
                      type="button"
                      className={`avail-btn ${
                        selectedTechProfile?.availability_status === "available"
                          ? "selected-available"
                          : ""
                      }`}
                      onClick={() =>
                        handleUpdateAvailability(selectedMember.user_id, "available")
                      }
                    >
                      <CheckCircle2 size={14} /> Disponible
                    </button>
                    <button
                      type="button"
                      className={`avail-btn ${
                        selectedTechProfile?.availability_status === "busy"
                          ? "selected-busy"
                          : ""
                      }`}
                      onClick={() =>
                        handleUpdateAvailability(selectedMember.user_id, "busy")
                      }
                    >
                      <Clock size={14} /> En atención
                    </button>
                    <button
                      type="button"
                      className={`avail-btn ${
                        selectedTechProfile?.availability_status === "unavailable"
                          ? "selected-unavailable"
                          : ""
                      }`}
                      onClick={() =>
                        handleUpdateAvailability(selectedMember.user_id, "unavailable")
                      }
                    >
                      <XCircle size={14} /> No disponible
                    </button>
                  </div>
                </div>

                {/* Especialidades Asociadas */}
                <div className="section-block">
                  <div className="section-block-header">
                    <div>
                      <h3>
                        <Award size={18} />
                        Especialidades técnicas
                      </h3>
                      <p>Competencias administrables vinculadas a este profesional.</p>
                    </div>
                  </div>

                  {skills.length === 0 ? (
                    <p className="text-muted text-xs">
                      No hay especialidades creadas en el catálogo aún.
                    </p>
                  ) : (
                    <div className="skills-tags-container">
                      {skills.map((skill) => {
                        const hasSkill = selectedMemberSkills.some(
                          (s) => s.id === skill.id,
                        );
                        return (
                          <button
                            type="button"
                            key={skill.id}
                            className={`skill-tag-pill ${hasSkill ? "active" : ""}`}
                            onClick={() => {
                              if (selectedTechProfile) {
                                void handleToggleTechnicianSkill(
                                  selectedTechProfile.id,
                                  skill.id,
                                  hasSkill,
                                );
                              }
                            }}
                          >
                            {hasSkill && <Check size={12} />}
                            {skill.name}
                            <span className="skill-cat-label">({skill.category})</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Horario Semanal de Atención */}
                <div className="section-block">
                  <div className="section-block-header">
                    <div>
                      <h3>
                        <Clock size={18} />
                        Horario semanal de atención
                      </h3>
                      <p>Jornada operativa programada para despacho de solicitudes.</p>
                    </div>
                  </div>

                  {selectedMemberSchedules.length === 0 ? (
                    <div className="empty-state-box empty-state-compact">
                      <p>Horario operativo estándar (Lunes a Viernes 09:00 - 18:00 hrs).</p>
                    </div>
                  ) : (
                    <div className="schedules-list">
                      {selectedMemberSchedules.map((sch) => (
                        <div className="schedule-row" key={sch.id}>
                          <span className="schedule-day">
                            {DAY_OF_WEEK_LABELS[sch.day_of_week] ?? `Día ${sch.day_of_week}`}
                          </span>
                          <span className="schedule-hours">
                            {sch.is_active ? (
                              <span className="badge badge-success">
                                {sch.start_time.slice(0, 5)} - {sch.end_time.slice(0, 5)} hrs
                              </span>
                            ) : (
                              <span className="badge badge-neutral">Descanso</span>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Ausencias e Indisponibilidades Programadas */}
                <div className="section-block">
                  <div className="section-block-header">
                    <div>
                      <h3>
                        <Calendar size={18} />
                        Periodos de indisponibilidad
                      </h3>
                      <p>Vacaciones, licencias o ausencias programadas que evitan asignación.</p>
                    </div>

                    <button
                      type="button"
                      className="small-button secondary-button"
                      onClick={() => {
                        setUnavailabilityForm(INITIAL_UNAVAILABILITY_FORM);
                        setUnavailabilityError(null);
                        setUnavailabilityModalOpen(true);
                      }}
                    >
                      <Plus size={14} /> Registrar ausencia
                    </button>
                  </div>

                  {selectedMemberUnavailabilities.length === 0 ? (
                    <div className="empty-state-box empty-state-compact">
                      <p>Sin periodos de ausencia programados.</p>
                    </div>
                  ) : (
                    <div className="sub-entity-list">
                      {selectedMemberUnavailabilities.map((unavail) => (
                        <div className="sub-entity-card" key={unavail.id}>
                          <div>
                            <strong>{unavail.reason}</strong>
                            <div className="text-muted text-xs">
                              {new Date(unavail.start_date).toLocaleDateString("es-ES")}{" "}
                              al {new Date(unavail.end_date).toLocaleDateString("es-ES")}
                            </div>
                          </div>
                          <span className="badge badge-warning">Ausencia</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Tickets Asignados Activos */}
                <div className="section-block">
                  <div className="section-block-header">
                    <div>
                      <h3>
                        <Ticket size={18} />
                        Tickets en servicio asignados ({selectedMemberAssignments.length})
                      </h3>
                      <p>Historial de solicitudes de soporte vinculadas al técnico.</p>
                    </div>
                  </div>

                  {selectedMemberAssignments.length === 0 ? (
                    <div className="empty-state-box empty-state-compact">
                      <p>No tiene tickets asignados actualmente.</p>
                    </div>
                  ) : (
                    <div className="sub-entity-list">
                      {selectedMemberAssignments.map((a) => {
                        const t = ticketMap.get(a.ticket_id);
                        return (
                          <div className="sub-entity-card" key={a.id}>
                            <div>
                              <strong>
                                #{t?.ticket_number ?? "—"} {t?.subject ?? "Sin título"}
                              </strong>
                              <div className="text-muted text-xs">
                                Asignado el{" "}
                                {new Date(a.assigned_at).toLocaleString("es-ES")} •
                                Estado: <strong>{a.status}</strong>
                              </div>
                            </div>

                            <div className="sub-entity-actions">
                              {a.status === "active" && (
                                <button
                                  type="button"
                                  className="small-button primary-button"
                                  onClick={() => handleAcceptAssignment(a)}
                                >
                                  Aceptar servicio
                                </button>
                              )}
                              {onNavigateToTicket && t && (
                                <button
                                  type="button"
                                  className="small-button secondary-button"
                                  onClick={() => onNavigateToTicket(t.id)}
                                >
                                  Ver ticket <ExternalLink size={12} />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* PESTAÑA 2: BANDEJA DE DESPACHO Y ASIGNACIONES */}
      {/* --------------------------------------------------------------------- */}
      {activeTab === "dispatch" && (
        <div className="dispatch-container panel">
          <div className="dispatch-header-bar">
            <div>
              <h3>Cola de despacho y asignación de tickets</h3>
              <p>
                Asigna solicitudes a los profesionales disponibles verificando carga de
                trabajo y especialidades.
              </p>
            </div>

            <div className="search-input-wrapper">
              <Search size={16} />
              <input
                type="text"
                placeholder="Buscar ticket en cola..."
                value={dispatchSearch}
                onChange={(e) => setDispatchSearch(e.target.value)}
              />
            </div>
          </div>

          {dispatchQueueTickets.length === 0 ? (
            <div className="empty-state-box">
              <CheckCircle2 size={36} className="text-success" />
              <strong>Cola de despacho al día</strong>
              <p>No hay tickets pendientes de despacho en este momento.</p>
            </div>
          ) : (
            <div className="dispatch-tickets-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th># Ticket</th>
                    <th>Asunto</th>
                    <th>Cliente</th>
                    <th>Prioridad</th>
                    <th>Estado</th>
                    <th>Técnico Asignado</th>
                    <th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {dispatchQueueTickets.map((t) => {
                    const client = clientMap.get(t.client_id);
                    const activeAssign = assignments.find(
                      (a) =>
                        a.ticket_id === t.id &&
                        (a.status === "active" || a.status === "accepted"),
                    );
                    const assignedMember = activeAssign
                      ? memberMap.get(activeAssign.membership_id)
                      : null;
                    const assignedProf = assignedMember
                      ? profiles.get(assignedMember.user_id)
                      : null;

                    return (
                      <tr key={t.id}>
                        <td>
                          <strong>#{t.ticket_number ?? "—"}</strong>
                        </td>
                        <td>{t.subject}</td>
                        <td>
                          {client ? (
                            onNavigateToClient ? (
                              <button
                                type="button"
                                className="link-button"
                                onClick={() => onNavigateToClient(client.id)}
                              >
                                {client.name}
                              </button>
                            ) : (
                              client.name
                            )
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>
                          <span
                            className={`badge ${
                              t.priority === "urgent"
                                ? "badge-danger"
                                : t.priority === "high"
                                  ? "badge-warning"
                                  : "badge-neutral"
                            }`}
                          >
                            {TICKET_PRIORITY_LABELS[t.priority]}
                          </span>
                        </td>
                        <td>
                          <span className="badge badge-outline">
                            {TICKET_STATUS_LABELS[t.status]}
                          </span>
                        </td>
                        <td>
                          {assignedProf ? (
                            <div className="inline-icon-text">
                              <UserCheck size={14} className="text-success" />
                              <span>{assignedProf.display_name}</span>
                              <span className="text-muted text-xs">
                                ({activeAssign?.status === "accepted" ? "Aceptado" : "Pendiente"})
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted text-xs">
                              Sin técnico asignado
                            </span>
                          )}
                        </td>
                        <td>
                          <div className="table-actions">
                            {canManageWorkforce && (
                              <button
                                type="button"
                                className="small-button primary-button"
                                onClick={() => handleOpenAssignModal(t.id)}
                              >
                                {activeAssign ? "Reasignar" : "Despachar"}
                              </button>
                            )}

                            {onNavigateToTicket && (
                              <button
                                type="button"
                                className="small-button secondary-button"
                                onClick={() => onNavigateToTicket(t.id)}
                              >
                                Ver
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* PESTAÑA 3: CATÁLOGO DE ESPECIALIDADES */}
      {/* --------------------------------------------------------------------- */}
      {activeTab === "skills" && (
        <div className="skills-catalog-view panel">
          <div className="detail-header">
            <div>
              <h3>Catálogo de especialidades técnicas</h3>
              <p>
                Competencias técnicas administrables por la organización para optimizar
                el enrutamiento de solicitudes de soporte.
              </p>
            </div>

            {canManageWorkforce && (
              <button
                type="button"
                className="primary-button"
                onClick={() => setSkillModalOpen(true)}
              >
                <Plus size={16} />
                Agregar especialidad
              </button>
            )}
          </div>

          {skills.length === 0 ? (
            <div className="empty-state-box">
              <Award size={36} />
              <strong>Catálogo de especialidades vacío</strong>
              <p>
                Crea especialidades como "MikroTik", "Windows", "Cámaras IP", etc., para
                vincularlas a los perfiles técnicos.
              </p>
            </div>
          ) : (
            <div className="skills-grid">
              {skills.map((skill) => {
                const countAssigned = techSkills.filter(
                  (ts) => ts.skill_id === skill.id,
                ).length;
                return (
                  <div className="skill-card" key={skill.id}>
                    <div className="skill-card-top">
                      <span className="skill-category-badge">{skill.category}</span>
                      <span className="badge badge-outline">
                        {countAssigned} {countAssigned === 1 ? "profesional" : "profesionales"}
                      </span>
                    </div>
                    <strong>{skill.name}</strong>
                    {skill.description && (
                      <p className="skill-description">{skill.description}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* PESTAÑA 4: NOTIFICACIONES DE DESPACHO */}
      {/* --------------------------------------------------------------------- */}
      {activeTab === "notifications" && (
        <div className="notifications-view panel">
          <div className="detail-header">
            <div>
              <h3>Notificaciones y eventos del equipo</h3>
              <p>
                Historial de invitaciones, asignaciones y respuestas operativas en el
                espacio de trabajo.
              </p>
            </div>
          </div>

          {notifications.length === 0 ? (
            <div className="empty-state-box">
              <Bell size={36} />
              <strong>Sin notificaciones recientes</strong>
              <p>Los avisos de despacho y asignación se registrarán aquí.</p>
            </div>
          ) : (
            <div className="sub-entity-list">
              {notifications.map((notif) => (
                <div
                  className={`sub-entity-card ${notif.read ? "read" : "unread"}`}
                  key={notif.id}
                >
                  <div className="inline-icon-text">
                    <Bell size={16} />
                    <div>
                      <strong>{notif.title}</strong>
                      <p>{notif.message}</p>
                      <span className="text-muted text-xs">
                        {new Date(notif.created_at).toLocaleString("es-ES")} • Tipo:{" "}
                        {NOTIFICATION_TYPE_LABELS[notif.type]}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* MODAL: ASIGNAR TICKET (DESPACHO) */}
      {/* --------------------------------------------------------------------- */}
      {assignModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3>Despachar ticket de soporte</h3>
              <button
                type="button"
                className="icon-button"
                onClick={() => setAssignModalOpen(false)}
                disabled={assignSubmitting}
                aria-label="Cerrar modal"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmitAssignment}>
              <div className="modal-body">
                {assignError && (
                  <div className="form-error-banner" role="alert">
                    <AlertTriangle size={16} />
                    <span>{assignError}</span>
                  </div>
                )}

                <div className="form-field">
                  <label>Ticket a asignar:</label>
                  <div className="ticket-summary-pill">
                    #{ticketMap.get(assignForm.ticket_id)?.ticket_number ?? "—"}{" "}
                    {ticketMap.get(assignForm.ticket_id)?.subject}
                  </div>
                </div>

                <div className="form-field">
                  <label htmlFor="assign-member">Selecciona el profesional asignado *</label>
                  <select
                    id="assign-member"
                    value={assignForm.membership_id}
                    onChange={(e) =>
                      setAssignForm((prev) => ({
                        ...prev,
                        membership_id: e.target.value,
                      }))
                    }
                    disabled={assignSubmitting}
                    required
                  >
                    {technicalMembers.map((m) => {
                      const prof = profiles.get(m.user_id);
                      const tp = techProfileByUserId.get(m.user_id);
                      const avail = tp
                        ? validateTechnicianAvailability(
                            tp,
                            unavailabilities.filter((u) => u.technician_profile_id === tp.id),
                            schedules.filter((s) => s.technician_profile_id === tp.id),
                          )
                        : { isAvailable: true, isOffDuty: false, reason: null };

                      return (
                        <option key={m.id} value={m.id}>
                          {prof?.display_name ?? "Técnico"} (
                          {ORGANIZATION_ROLE_LABELS[m.role]}) —{" "}
                          {avail.isAvailable
                            ? "Disponible"
                            : avail.isOffDuty
                              ? "Fuera de horario"
                              : "No disponible"}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setAssignModalOpen(false)}
                  disabled={assignSubmitting}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={assignSubmitting}
                >
                  {assignSubmitting ? (
                    <>
                      <Loader2 size={16} className="auth-spinner" />
                      Asignando...
                    </>
                  ) : (
                    "Confirmar asignación"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* MODAL: REGISTRAR INDISPONIBILIDAD */}
      {/* --------------------------------------------------------------------- */}
      {unavailabilityModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3>Registrar periodo de indisponibilidad</h3>
              <button
                type="button"
                className="icon-button"
                onClick={() => setUnavailabilityModalOpen(false)}
                disabled={unavailabilitySubmitting}
                aria-label="Cerrar modal"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmitUnavailability}>
              <div className="modal-body">
                {unavailabilityError && (
                  <div className="form-error-banner" role="alert">
                    <AlertTriangle size={16} />
                    <span>{unavailabilityError}</span>
                  </div>
                )}

                <div className="form-field">
                  <label htmlFor="unavail-start">Fecha y hora de inicio *</label>
                  <input
                    id="unavail-start"
                    type="datetime-local"
                    value={unavailabilityForm.start_date}
                    onChange={(e) =>
                      setUnavailabilityForm((prev) => ({
                        ...prev,
                        start_date: e.target.value,
                      }))
                    }
                    disabled={unavailabilitySubmitting}
                    required
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="unavail-end">Fecha y hora de término *</label>
                  <input
                    id="unavail-end"
                    type="datetime-local"
                    value={unavailabilityForm.end_date}
                    onChange={(e) =>
                      setUnavailabilityForm((prev) => ({
                        ...prev,
                        end_date: e.target.value,
                      }))
                    }
                    disabled={unavailabilitySubmitting}
                    required
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="unavail-reason">Motivo de la ausencia *</label>
                  <input
                    id="unavail-reason"
                    type="text"
                    placeholder="Ej. Vacaciones anuales, Licencia médica, Capacitación"
                    value={unavailabilityForm.reason}
                    onChange={(e) =>
                      setUnavailabilityForm((prev) => ({
                        ...prev,
                        reason: e.target.value,
                      }))
                    }
                    disabled={unavailabilitySubmitting}
                    required
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setUnavailabilityModalOpen(false)}
                  disabled={unavailabilitySubmitting}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={unavailabilitySubmitting}
                >
                  {unavailabilitySubmitting ? (
                    <>
                      <Loader2 size={16} className="auth-spinner" />
                      Registrando...
                    </>
                  ) : (
                    "Guardar indisponibilidad"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* MODAL: NUEVA ESPECIALIDAD EN EL CATÁLOGO */}
      {/* --------------------------------------------------------------------- */}
      {skillModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3>Agregar especialidad técnica</h3>
              <button
                type="button"
                className="icon-button"
                onClick={() => setSkillModalOpen(false)}
                disabled={skillSubmitting}
                aria-label="Cerrar modal"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmitNewSkill}>
              <div className="modal-body">
                {skillError && (
                  <div className="form-error-banner" role="alert">
                    <AlertTriangle size={16} />
                    <span>{skillError}</span>
                  </div>
                )}

                <div className="form-field">
                  <label htmlFor="skill-category">Categoría *</label>
                  <select
                    id="skill-category"
                    value={skillForm.category}
                    onChange={(e) =>
                      setSkillForm((prev) => ({
                        ...prev,
                        category: e.target.value,
                      }))
                    }
                    disabled={skillSubmitting}
                  >
                    <option value="Sistemas Operativos">Sistemas Operativos</option>
                    <option value="Redes y Conectividad">Redes y Conectividad</option>
                    <option value="MikroTik">MikroTik y Enrutamiento</option>
                    <option value="Hardware y Estaciones">Hardware y Estaciones</option>
                    <option value="Servidores">Servidores y Virtualización</option>
                    <option value="Seguridad Informática">Seguridad Informática</option>
                    <option value="Cámaras y Videovigilancia">Cámaras y Videovigilancia</option>
                    <option value="Soporte de Software">Soporte de Software</option>
                    <option value="General">General</option>
                  </select>
                </div>

                <div className="form-field">
                  <label htmlFor="skill-name">Nombre de la competencia *</label>
                  <input
                    id="skill-name"
                    type="text"
                    placeholder="Ej. Diagnóstico MikroTik RouterOS, Windows 11 Enterprise, Firewalls"
                    value={skillForm.name}
                    onChange={(e) =>
                      setSkillForm((prev) => ({ ...prev, name: e.target.value }))
                    }
                    disabled={skillSubmitting}
                    required
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="skill-desc">Descripción (opcional)</label>
                  <textarea
                    id="skill-desc"
                    rows={2}
                    placeholder="Detalles sobre el alcance de la competencia..."
                    value={skillForm.description}
                    onChange={(e) =>
                      setSkillForm((prev) => ({
                        ...prev,
                        description: e.target.value,
                      }))
                    }
                    disabled={skillSubmitting}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setSkillModalOpen(false)}
                  disabled={skillSubmitting}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={skillSubmitting || !skillForm.name.trim()}
                >
                  {skillSubmitting ? (
                    <>
                      <Loader2 size={16} className="auth-spinner" />
                      Creando...
                    </>
                  ) : (
                    "Guardar especialidad"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* MODAL: INVITAR TÉCNICO O COLABORADOR */}
      {/* --------------------------------------------------------------------- */}
      {inviteModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3>Invitar profesional a la organización</h3>
              <button
                type="button"
                className="icon-button"
                onClick={() => setInviteModalOpen(false)}
                disabled={inviteSubmitting}
                aria-label="Cerrar modal"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmitInvite}>
              <div className="modal-body">
                {inviteError && (
                  <div className="form-error-banner" role="alert">
                    <AlertTriangle size={16} />
                    <span>{inviteError}</span>
                  </div>
                )}

                <div className="form-field">
                  <label htmlFor="invite-email">Correo electrónico *</label>
                  <div className="input-with-icon">
                    <Mail size={16} />
                    <input
                      id="invite-email"
                      type="email"
                      placeholder="profesional@empresa.com"
                      value={inviteForm.email}
                      onChange={(e) =>
                        setInviteForm((prev) => ({
                          ...prev,
                          email: e.target.value,
                        }))
                      }
                      disabled={inviteSubmitting}
                      required
                    />
                  </div>
                </div>

                <div className="form-field">
                  <label htmlFor="invite-role">Rol en el equipo técnico *</label>
                  <select
                    id="invite-role"
                    value={inviteForm.role}
                    onChange={(e) =>
                      setInviteForm((prev) => ({
                        ...prev,
                        role: e.target.value as InviteMemberFormState["role"],
                      }))
                    }
                    disabled={inviteSubmitting}
                  >
                    <option value="technician_internal">
                      Técnico interno (Personal de planta)
                    </option>
                    <option value="technician_external">
                      Colaborador externo (Especialista por demanda)
                    </option>
                    <option value="dispatcher">
                      Coordinador / Dispatcher (Gestor de despacho)
                    </option>
                  </select>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setInviteModalOpen(false)}
                  disabled={inviteSubmitting}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={inviteSubmitting || !inviteForm.email.trim()}
                >
                  {inviteSubmitting ? (
                    <>
                      <Loader2 size={16} className="auth-spinner" />
                      Enviando invitación...
                    </>
                  ) : (
                    "Enviar invitación"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
