/**
 * Tipos de dominio y contrato de base de datos alineados con
 * supabase/migrations/20261109140000_initial_core.sql
 */

export type OrganizationStatus = "active" | "suspended" | "archived";

export type OrganizationRole =
  | "owner"
  | "admin"
  | "dispatcher"
  | "technician_internal"
  | "technician_external"
  | "viewer";

export type MembershipType = "internal" | "external";

export type MembershipStatus = "invited" | "active" | "suspended" | "removed";

export type ClientStatus = "active" | "inactive" | "archived";

export type DeviceAgentType = "temporary" | "installed";

export type DeviceStatus = "registered" | "active" | "inactive" | "revoked";

export type TicketPriority = "low" | "normal" | "high" | "urgent";

export type TicketStatus =
  | "new"
  | "open"
  | "in_progress"
  | "waiting_client"
  | "waiting_third_party"
  | "resolved"
  | "closed"
  | "cancelled";

export type TicketSource = "portal" | "technician_invitation" | "internal";

export type TicketAssignmentStatus =
  | "active"
  | "accepted"
  | "declined"
  | "completed"
  | "cancelled";

export type TicketVisibility = "internal" | "client";

/**
 * Tabla: public.profiles
 */
export type ProfileRow = {
  id: string;
  display_name: string | null;
  avatar_path: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Tabla: public.organizations
 */
export type OrganizationRow = {
  id: string;
  name: string;
  slug: string;
  status: OrganizationStatus;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

/**
 * Tabla: public.organization_members
 */
export type OrganizationMemberRow = {
  id: string;
  organization_id: string;
  user_id: string;
  role: OrganizationRole;
  membership_type: MembershipType;
  status: MembershipStatus;
  created_at: string;
  updated_at: string;
};

export type OrganizationMemberUpdate = {
  role?: OrganizationRole;
  membership_type?: MembershipType;
  status?: MembershipStatus;
  updated_at?: string;
};

/**
 * Membresía activa enriquecida con su organización activa correspondiente.
 */
export type UserOrganizationMembership = OrganizationMemberRow & {
  organization: OrganizationRow;
};

/**
 * Tabla: public.organization_invitations
 */
export type InvitationStatus = "pending" | "accepted" | "expired" | "revoked";

export type OrganizationInvitationRow = {
  id: string;
  organization_id: string;
  email: string;
  role: OrganizationRole;
  token_hash: string;
  invited_by: string;
  status: InvitationStatus;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
};

export type OrganizationInvitationInsert = {
  id?: string;
  organization_id: string;
  email: string;
  role: OrganizationRole;
  token_hash: string;
  invited_by: string;
  status?: InvitationStatus;
  expires_at?: string;
  accepted_at?: string | null;
};

export type OrganizationInvitationUpdate = {
  status?: InvitationStatus;
  accepted_at?: string | null;
};

/**
 * Tabla: public.clients
 */
export type ClientRow = {
  id: string;
  organization_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: ClientStatus;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type ClientInsert = {
  id?: string;
  organization_id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  status?: ClientStatus;
  archived_at?: string | null;
};

export type ClientUpdate = {
  name?: string;
  email?: string | null;
  phone?: string | null;
  status?: ClientStatus;
  updated_at?: string;
  archived_at?: string | null;
};

/**
 * Tabla: public.client_contacts
 */
export type ClientContactRow = {
  id: string;
  organization_id: string;
  client_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  position: string | null;
  is_primary: boolean;
  created_at: string;
};

export type ClientContactInsert = {
  id?: string;
  organization_id: string;
  client_id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  position?: string | null;
  is_primary?: boolean;
};

export type ClientContactUpdate = {
  name?: string;
  email?: string | null;
  phone?: string | null;
  position?: string | null;
  is_primary?: boolean;
};

/**
 * Tabla: public.devices
 */
export type DeviceRow = {
  id: string;
  organization_id: string;
  client_id: string;
  device_name: string;
  operating_system: string | null;
  device_identifier: string | null;
  agent_type: DeviceAgentType;
  status: DeviceStatus;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DeviceInsert = {
  id?: string;
  organization_id: string;
  client_id: string;
  device_name: string;
  operating_system?: string | null;
  device_identifier?: string | null;
  agent_type?: DeviceAgentType;
  status?: DeviceStatus;
  last_seen_at?: string | null;
};

export type DeviceUpdate = {
  client_id?: string;
  device_name?: string;
  operating_system?: string | null;
  device_identifier?: string | null;
  agent_type?: DeviceAgentType;
  status?: DeviceStatus;
  last_seen_at?: string | null;
  updated_at?: string;
};

/**
 * Tabla: public.tickets
 */
export type TicketRow = {
  id: string;
  organization_id: string;
  client_id: string;
  device_id: string | null;
  ticket_number: number | null;
  subject: string;
  description: string | null;
  priority: TicketPriority;
  status: TicketStatus;
  source: TicketSource;
  created_by: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TicketInsert = {
  id?: string;
  organization_id: string;
  client_id: string;
  device_id?: string | null;
  ticket_number?: number | null;
  subject: string;
  description?: string | null;
  priority?: TicketPriority;
  status?: TicketStatus;
  source?: TicketSource;
  created_by?: string | null;
  resolved_at?: string | null;
  closed_at?: string | null;
  archived_at?: string | null;
};

export type TicketUpdate = {
  client_id?: string;
  device_id?: string | null;
  subject?: string;
  description?: string | null;
  priority?: TicketPriority;
  status?: TicketStatus;
  source?: TicketSource;
  resolved_at?: string | null;
  closed_at?: string | null;
  archived_at?: string | null;
  updated_at?: string;
};

/**
 * Tabla: public.ticket_assignments
 */
export type TicketAssignmentRow = {
  id: string;
  organization_id: string;
  ticket_id: string;
  membership_id: string;
  assigned_by: string | null;
  status: TicketAssignmentStatus;
  assigned_at: string;
  responded_at: string | null;
  completed_at: string | null;
};

export type TicketAssignmentInsert = {
  id?: string;
  organization_id: string;
  ticket_id: string;
  membership_id: string;
  assigned_by?: string | null;
  status?: TicketAssignmentStatus;
  assigned_at?: string;
  responded_at?: string | null;
  completed_at?: string | null;
};

export type TicketAssignmentUpdate = {
  status?: TicketAssignmentStatus;
  responded_at?: string | null;
  completed_at?: string | null;
};

/**
 * Tabla: public.ticket_transitions
 */
export type TicketTransitionRow = {
  id: string;
  organization_id: string;
  ticket_id: string;
  previous_status: TicketStatus | null;
  new_status: TicketStatus;
  changed_by: string | null;
  reason: string | null;
  created_at: string;
};

export type TicketTransitionInsert = {
  id?: string;
  organization_id: string;
  ticket_id: string;
  previous_status?: TicketStatus | null;
  new_status: TicketStatus;
  changed_by?: string | null;
  reason?: string | null;
};

/**
 * Tabla: public.ticket_comments
 */
export type TicketCommentRow = {
  id: string;
  organization_id: string;
  ticket_id: string;
  author_user_id: string | null;
  body: string;
  visibility: TicketVisibility;
  created_at: string;
};

export type TicketCommentInsert = {
  id?: string;
  organization_id: string;
  ticket_id: string;
  author_user_id?: string | null;
  body: string;
  visibility?: TicketVisibility;
  created_at?: string;
};

export type TechnicianAvailabilityStatus =
  | "available"
  | "busy"
  | "unavailable";

/**
 * Tabla: public.technician_profiles
 */
export type TechnicianProfileRow = {
  id: string;
  organization_id: string;
  user_id: string;
  specialties: string[];
  availability_status: TechnicianAvailabilityStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type TechnicianProfileInsert = {
  id?: string;
  organization_id: string;
  user_id: string;
  specialties?: string[];
  availability_status?: TechnicianAvailabilityStatus;
  notes?: string | null;
};

export type TechnicianProfileUpdate = {
  specialties?: string[];
  availability_status?: TechnicianAvailabilityStatus;
  notes?: string | null;
  updated_at?: string;
};

/**
  * Tipos y tablas para asistencia remota y dispositivos (Fase 4.3)
  */
export type RemoteSessionAccessMode = "attended";

export type RemoteSessionRequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "expired"
  | "cancelled"
  | "completed";

export type RemoteSessionRequestRow = {
  id: string;
  organization_id: string;
  ticket_id: string;
  client_id: string;
  device_id: string;
  requested_by: string | null;
  access_mode: RemoteSessionAccessMode;
  status: RemoteSessionRequestStatus;
  requested_at: string;
  expires_at: string | null;
  responded_at: string | null;
};

export type RemoteSessionRequestInsert = {
  id?: string;
  organization_id: string;
  ticket_id: string;
  client_id: string;
  device_id: string;
  requested_by?: string | null;
  access_mode?: RemoteSessionAccessMode;
  status?: RemoteSessionRequestStatus;
  requested_at?: string;
  expires_at?: string | null;
  responded_at?: string | null;
};

export type RemoteSessionRequestUpdate = {
  status?: RemoteSessionRequestStatus;
  expires_at?: string | null;
  responded_at?: string | null;
};

export type ConsentMethod =
  | "local_confirmation"
  | "portal_confirmation"
  | "other";

export type SessionConsentRow = {
  id: string;
  organization_id: string;
  request_id: string;
  device_id: string;
  granted_by_user_id: string | null;
  granted_by_name: string | null;
  consent_method: ConsentMethod;
  evidence_reference: string | null;
  granted_at: string;
};

export type SessionConsentInsert = {
  id?: string;
  organization_id: string;
  request_id: string;
  device_id: string;
  granted_by_user_id?: string | null;
  granted_by_name?: string | null;
  consent_method: ConsentMethod;
  evidence_reference?: string | null;
  granted_at?: string;
};

export type ConsentRevocationRow = {
  id: string;
  organization_id: string;
  consent_id: string;
  revoked_by: string | null;
  reason: string | null;
  revoked_at: string;
};

export type ConsentRevocationInsert = {
  id?: string;
  organization_id: string;
  consent_id: string;
  revoked_by?: string | null;
  reason?: string | null;
  revoked_at?: string;
};

export type RemoteSessionAttemptStatus =
  | "created"
  | "connecting"
  | "connected"
  | "failed"
  | "ended";

export type RemoteSessionAttemptRow = {
  id: string;
  organization_id: string;
  request_id: string;
  attempt_number: number;
  engine: "rustdesk";
  engine_session_ref: string | null;
  status: RemoteSessionAttemptStatus;
  failure_code: string | null;
  failure_detail: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
};

export type RemoteSessionAttemptInsert = {
  id?: string;
  organization_id: string;
  request_id: string;
  attempt_number: number;
  engine?: "rustdesk";
  engine_session_ref?: string | null;
  status?: RemoteSessionAttemptStatus;
  failure_code?: string | null;
  failure_detail?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  created_at?: string;
};

export type RemoteSessionAttemptUpdate = {
  status?: RemoteSessionAttemptStatus;
  engine_session_ref?: string | null;
  failure_code?: string | null;
  failure_detail?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
};

export type RemoteSessionStatus = "active" | "ended" | "interrupted";

export type RemoteSessionRow = {
  id: string;
  organization_id: string;
  request_id: string;
  attempt_id: string;
  device_id: string;
  technician_user_id: string | null;
  status: RemoteSessionStatus;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  created_at: string;
};

export type RemoteSessionInsert = {
  id?: string;
  organization_id: string;
  request_id: string;
  attempt_id: string;
  device_id: string;
  technician_user_id?: string | null;
  status?: RemoteSessionStatus;
  started_at?: string;
  ended_at?: string | null;
  duration_seconds?: number | null;
  created_at?: string;
};

export type RemoteSessionUpdate = {
  status?: RemoteSessionStatus;
  ended_at?: string | null;
  duration_seconds?: number | null;
};

/**
 * Tablas y tipos para Workforce & Dispatch (Fase 4.4)
 */
export type TechnicianClassification = "internal" | "external" | "independent";

export type DispatchSkillRow = {
  id: string;
  organization_id: string;
  name: string;
  category: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
};

export type DispatchSkillInsert = {
  id?: string;
  organization_id: string;
  name: string;
  category?: string;
  description?: string | null;
  is_active?: boolean;
};

export type DispatchSkillUpdate = {
  name?: string;
  category?: string;
  description?: string | null;
  is_active?: boolean;
};

export type TechnicianSkillRow = {
  id: string;
  organization_id: string;
  technician_profile_id: string;
  skill_id: string;
  years_experience: number;
  created_at: string;
};

export type TechnicianSkillInsert = {
  id?: string;
  organization_id: string;
  technician_profile_id: string;
  skill_id: string;
  years_experience?: number;
};

export type TechnicianScheduleRow = {
  id: string;
  organization_id: string;
  technician_profile_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
  created_at: string;
};

export type TechnicianScheduleInsert = {
  id?: string;
  organization_id: string;
  technician_profile_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active?: boolean;
};

export type TechnicianScheduleUpdate = {
  start_time?: string;
  end_time?: string;
  is_active?: boolean;
};

export type TechnicianUnavailabilityRow = {
  id: string;
  organization_id: string;
  technician_profile_id: string;
  start_date: string;
  end_date: string;
  reason: string;
  created_at: string;
};

export type TechnicianUnavailabilityInsert = {
  id?: string;
  organization_id: string;
  technician_profile_id: string;
  start_date: string;
  end_date: string;
  reason: string;
};

export type NotificationType =
  | "invitation_received"
  | "assignment_received"
  | "assignment_accepted"
  | "assignment_declined"
  | "assignment_cancelled"
  | "assignment_reassigned"
  | "availability_changed";

export type NotificationRow = {
  id: string;
  organization_id: string;
  user_id: string;
  ticket_id: string | null;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  read_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type NotificationInsert = {
  id?: string;
  organization_id: string;
  user_id: string;
  ticket_id?: string | null;
  type: NotificationType;
  title: string;
  message: string;
  read?: boolean;
  read_at?: string | null;
  metadata?: Record<string, unknown>;
};

export type NotificationUpdate = {
  read?: boolean;
  read_at?: string | null;
};

/**
 * Etiquetas de presentación en español para los roles de organización.
 * Exclusivamente para visualización en UI; la autorización real reside en RLS.
 */
export const ORGANIZATION_ROLE_LABELS: Record<OrganizationRole, string> = {
  owner: "Propietario",
  admin: "Administrador",
  dispatcher: "Coordinador (Dispatcher)",
  technician_internal: "Técnico interno",
  technician_external: "Técnico externo",
  viewer: "Supervisor (Lectura)",
};

export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  active: "Activo",
  inactive: "Inactivo",
  archived: "Archivado",
};

export const TICKET_PRIORITY_LABELS: Record<TicketPriority, string> = {
  low: "Baja",
  normal: "Normal",
  high: "Alta",
  urgent: "Urgente",
};

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  new: "Nuevo",
  open: "Abierto",
  in_progress: "En atención",
  waiting_client: "Esperando cliente",
  waiting_third_party: "Esperando tercero",
  resolved: "Resuelto",
  closed: "Cerrado",
  cancelled: "Cancelado",
};

export const TICKET_SOURCE_LABELS: Record<TicketSource, string> = {
  portal: "Portal de cliente",
  technician_invitation: "Invitación técnica",
  internal: "Registro interno",
};

export const TICKET_ASSIGNMENT_STATUS_LABELS: Record<
  TicketAssignmentStatus,
  string
> = {
  active: "Asignado (Pendiente)",
  accepted: "Aceptado",
  declined: "Rechazado",
  completed: "Completado",
  cancelled: "Cancelado",
};

export const DEVICE_STATUS_LABELS: Record<DeviceStatus, string> = {
  registered: "Registrado",
  active: "Activo",
  inactive: "Inactivo",
  revoked: "Revocado",
};

export const DEVICE_AGENT_TYPE_LABELS: Record<DeviceAgentType, string> = {
  temporary: "Agente temporal (QS)",
  installed: "Agente instalado",
};

export const REMOTE_SESSION_REQUEST_STATUS_LABELS: Record<
  RemoteSessionRequestStatus,
  string
> = {
  pending: "Pendiente de consentimiento",
  approved: "Aprobada",
  rejected: "Rechazada",
  expired: "Expirada",
  cancelled: "Cancelada",
  completed: "Completada",
};

export const CONSENT_METHOD_LABELS: Record<ConsentMethod, string> = {
  local_confirmation: "Confirmación presencial / telefónica",
  portal_confirmation: "Confirmación en portal de cliente",
  other: "Otro método justificado",
};

export const REMOTE_SESSION_ATTEMPT_STATUS_LABELS: Record<
  RemoteSessionAttemptStatus,
  string
> = {
  created: "Preparado",
  connecting: "Conectando",
  connected: "Conectado",
  failed: "Fallido",
  ended: "Finalizado",
};

export const REMOTE_SESSION_STATUS_LABELS: Record<RemoteSessionStatus, string> = {
  active: "En curso",
  ended: "Finalizada",
  interrupted: "Interrupción solicitada (revocación)",
};

export const TECHNICIAN_AVAILABILITY_LABELS: Record<
  TechnicianAvailabilityStatus,
  string
> = {
  available: "Disponible",
  busy: "En servicio (Ocupado)",
  unavailable: "No disponible",
};

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  invitation_received: "Invitación al equipo",
  assignment_received: "Nueva asignación de ticket",
  assignment_accepted: "Servicio aceptado",
  assignment_declined: "Servicio rechazado",
  assignment_cancelled: "Asignación cancelada",
  assignment_reassigned: "Servicio reasignado",
  availability_changed: "Cambio de disponibilidad",
};

export const DAY_OF_WEEK_LABELS: readonly string[] = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];

/**
 * Traduce errores de PostgREST / PostgreSQL en mensajes claros en español,
 * distinguiendo explícitamente los bloqueos por privilegios o políticas RLS
 * cuando una operación de escritura requiere la migración pendiente.
 */
export function formatDatabaseError(
  error: unknown,
  fallbackMessage: string,
): string {
  if (!error || typeof error !== "object") {
    return fallbackMessage;
  }

  const errObj = error as {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
  };

  const code = errObj.code ?? "";
  const msg = (errObj.message ?? "").toLowerCase();

  if (
    code === "42501" ||
    msg.includes("permission denied") ||
    msg.includes("row-level security") ||
    msg.includes("new row violates row-level security")
  ) {
    return "Operación denegada por control de acceso (RLS / privilegios SQL). Si tu rol tiene autorización, verifica que la migración de escrituras del núcleo operativo haya sido aplicada en Supabase.";
  }

  if (code === "23505" || msg.includes("duplicate key")) {
    return "Ya existe un registro con esos datos únicos en la organización activa.";
  }

  if (code === "23503" || msg.includes("foreign key")) {
    return "La referencia asociada (cliente, dispositivo o usuario) no es válida dentro de la organización activa.";
  }

  if (code === "23514" || msg.includes("check constraint")) {
    return "Los datos enviados no cumplen las reglas de validación del esquema de base de datos.";
  }

  return errObj.message ? `${fallbackMessage} (${errObj.message})` : fallbackMessage;
}

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      organizations: {
        Row: OrganizationRow;
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      organization_members: {
        Row: OrganizationMemberRow;
        Insert: Record<string, never>;
        Update: OrganizationMemberUpdate;
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organization_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      organization_invitations: {
        Row: OrganizationInvitationRow;
        Insert: OrganizationInvitationInsert;
        Update: OrganizationInvitationUpdate;
        Relationships: [
          {
            foreignKeyName: "organization_invitations_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organization_invitations_invited_by_fkey";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      clients: {
        Row: ClientRow;
        Insert: ClientInsert;
        Update: ClientUpdate;
        Relationships: [
          {
            foreignKeyName: "clients_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      client_contacts: {
        Row: ClientContactRow;
        Insert: ClientContactInsert;
        Update: ClientContactUpdate;
        Relationships: [
          {
            foreignKeyName: "client_contacts_organization_id_client_id_fkey";
            columns: ["organization_id", "client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      devices: {
        Row: DeviceRow;
        Insert: DeviceInsert;
        Update: DeviceUpdate;
        Relationships: [
          {
            foreignKeyName: "devices_organization_id_client_id_fkey";
            columns: ["organization_id", "client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      technician_profiles: {
        Row: TechnicianProfileRow;
        Insert: TechnicianProfileInsert;
        Update: TechnicianProfileUpdate;
        Relationships: [
          {
            foreignKeyName: "technician_profiles_organization_id_user_id_fkey";
            columns: ["organization_id", "user_id"];
            isOneToOne: true;
            referencedRelation: "organization_members";
            referencedColumns: ["organization_id", "user_id"];
          },
        ];
      };
      tickets: {
        Row: TicketRow;
        Insert: TicketInsert;
        Update: TicketUpdate;
        Relationships: [
          {
            foreignKeyName: "tickets_organization_id_client_id_fkey";
            columns: ["organization_id", "client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "tickets_organization_id_device_id_client_id_fkey";
            columns: ["organization_id", "device_id", "client_id"];
            isOneToOne: false;
            referencedRelation: "devices";
            referencedColumns: ["organization_id", "id", "client_id"];
          },
        ];
      };
      ticket_assignments: {
        Row: TicketAssignmentRow;
        Insert: TicketAssignmentInsert;
        Update: TicketAssignmentUpdate;
        Relationships: [
          {
            foreignKeyName: "ticket_assignments_organization_id_ticket_id_fkey";
            columns: ["organization_id", "ticket_id"];
            isOneToOne: false;
            referencedRelation: "tickets";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "ticket_assignments_organization_id_membership_id_fkey";
            columns: ["organization_id", "membership_id"];
            isOneToOne: false;
            referencedRelation: "organization_members";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      ticket_transitions: {
        Row: TicketTransitionRow;
        Insert: TicketTransitionInsert;
        Update: Record<string, never>;
        Relationships: [
          {
            foreignKeyName: "ticket_transitions_organization_id_ticket_id_fkey";
            columns: ["organization_id", "ticket_id"];
            isOneToOne: false;
            referencedRelation: "tickets";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      ticket_comments: {
        Row: TicketCommentRow;
        Insert: TicketCommentInsert;
        Update: Record<string, never>;
        Relationships: [
          {
            foreignKeyName: "ticket_comments_organization_id_ticket_id_fkey";
            columns: ["organization_id", "ticket_id"];
            isOneToOne: false;
            referencedRelation: "tickets";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      remote_session_requests: {
        Row: RemoteSessionRequestRow;
        Insert: RemoteSessionRequestInsert;
        Update: RemoteSessionRequestUpdate;
        Relationships: [
          {
            foreignKeyName: "remote_session_requests_organization_id_ticket_id_client_id_fkey";
            columns: ["organization_id", "ticket_id", "client_id"];
            isOneToOne: false;
            referencedRelation: "tickets";
            referencedColumns: ["organization_id", "id", "client_id"];
          },
          {
            foreignKeyName: "remote_session_requests_organization_id_device_id_client_id_fkey";
            columns: ["organization_id", "device_id", "client_id"];
            isOneToOne: false;
            referencedRelation: "devices";
            referencedColumns: ["organization_id", "id", "client_id"];
          },
        ];
      };
      session_consents: {
        Row: SessionConsentRow;
        Insert: SessionConsentInsert;
        Update: Record<string, never>;
        Relationships: [
          {
            foreignKeyName: "session_consents_organization_id_request_id_device_id_fkey";
            columns: ["organization_id", "request_id", "device_id"];
            isOneToOne: false;
            referencedRelation: "remote_session_requests";
            referencedColumns: ["organization_id", "id", "device_id"];
          },
        ];
      };
      consent_revocations: {
        Row: ConsentRevocationRow;
        Insert: ConsentRevocationInsert;
        Update: Record<string, never>;
        Relationships: [
          {
            foreignKeyName: "consent_revocations_organization_id_consent_id_fkey";
            columns: ["organization_id", "consent_id"];
            isOneToOne: true;
            referencedRelation: "session_consents";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      remote_session_attempts: {
        Row: RemoteSessionAttemptRow;
        Insert: RemoteSessionAttemptInsert;
        Update: RemoteSessionAttemptUpdate;
        Relationships: [
          {
            foreignKeyName: "remote_session_attempts_organization_id_request_id_fkey";
            columns: ["organization_id", "request_id"];
            isOneToOne: false;
            referencedRelation: "remote_session_requests";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      remote_sessions: {
        Row: RemoteSessionRow;
        Insert: RemoteSessionInsert;
        Update: RemoteSessionUpdate;
        Relationships: [
          {
            foreignKeyName: "remote_sessions_organization_id_request_id_device_id_fkey";
            columns: ["organization_id", "request_id", "device_id"];
            isOneToOne: false;
            referencedRelation: "remote_session_requests";
            referencedColumns: ["organization_id", "id", "device_id"];
          },
          {
            foreignKeyName: "remote_sessions_organization_id_attempt_id_request_id_fkey";
            columns: ["organization_id", "attempt_id", "request_id"];
            isOneToOne: false;
            referencedRelation: "remote_session_attempts";
            referencedColumns: ["organization_id", "id", "request_id"];
          },
        ];
      };
      dispatch_skills: {
        Row: DispatchSkillRow;
        Insert: DispatchSkillInsert;
        Update: DispatchSkillUpdate;
        Relationships: [
          {
            foreignKeyName: "dispatch_skills_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      technician_skills: {
        Row: TechnicianSkillRow;
        Insert: TechnicianSkillInsert;
        Update: Record<string, never>;
        Relationships: [
          {
            foreignKeyName: "technician_skills_technician_profile_id_fkey";
            columns: ["technician_profile_id"];
            isOneToOne: false;
            referencedRelation: "technician_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "technician_skills_skill_id_fkey";
            columns: ["skill_id"];
            isOneToOne: false;
            referencedRelation: "dispatch_skills";
            referencedColumns: ["id"];
          },
        ];
      };
      technician_schedules: {
        Row: TechnicianScheduleRow;
        Insert: TechnicianScheduleInsert;
        Update: TechnicianScheduleUpdate;
        Relationships: [
          {
            foreignKeyName: "technician_schedules_technician_profile_id_fkey";
            columns: ["technician_profile_id"];
            isOneToOne: false;
            referencedRelation: "technician_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      technician_unavailabilities: {
        Row: TechnicianUnavailabilityRow;
        Insert: TechnicianUnavailabilityInsert;
        Update: Record<string, never>;
        Relationships: [
          {
            foreignKeyName: "technician_unavailabilities_technician_profile_id_fkey";
            columns: ["technician_profile_id"];
            isOneToOne: false;
            referencedRelation: "technician_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: NotificationRow;
        Insert: NotificationInsert;
        Update: NotificationUpdate;
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_ticket_id_fkey";
            columns: ["ticket_id"];
            isOneToOne: false;
            referencedRelation: "tickets";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      accept_ticket_assignment: {
        Args: {
          p_assignment_id: string;
        };
        Returns: {
          success: boolean;
          assignment_id: string;
          ticket_id: string;
          status: string;
        };
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
