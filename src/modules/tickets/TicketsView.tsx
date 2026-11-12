import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock3,
  CornerDownRight,
  History,
  Inbox,
  Lock,
  Loader2,
  Mail,
  MessageSquare,
  Monitor,
  Play,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  Ticket,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";

import { supabase } from "../../lib/supabase";
import { useAuth } from "../auth/AuthContext";
import {
  CLIENT_STATUS_LABELS,
  ORGANIZATION_ROLE_LABELS,
  TICKET_ASSIGNMENT_STATUS_LABELS,
  TICKET_PRIORITY_LABELS,
  TICKET_SOURCE_LABELS,
  TICKET_STATUS_LABELS,
  formatDatabaseError,
  type ClientRow,
  type DeviceRow,
  type OrganizationMemberRow,
  type OrganizationRole,
  type ProfileRow,
  type TechnicianAvailabilityStatus,
  type TechnicianProfileRow,
  type TicketAssignmentRow,
  type TicketAssignmentStatus,
  type TicketCommentRow,
  type TicketPriority,
  type TicketRow,
  type TicketSource,
  type TicketStatus,
  type TicketTransitionRow,
  type TicketVisibility,
} from "../../types/database";

interface TicketsViewProps {
  globalSearch: string;
  initialSelectedTicketId?: string | null;
  initialCreateClientId?: string | null;
  openCreateOnMount?: boolean;
  onNavigateToClients?: () => void;
  onNavigateToRemoteSessions?: (params: {
    ticketId: string;
    clientId: string;
    deviceId?: string;
    openCreate?: boolean;
  }) => void;
}

type StatusFilter = "all" | TicketStatus;
type PriorityFilter = "all" | TicketPriority;
type DetailTab = "comments" | "timeline" | "assignments";

interface NewTicketFormState {
  client_id: string;
  device_id: string;
  subject: string;
  description: string;
  priority: TicketPriority;
  status: "new" | "open";
  source: TicketSource;
}

export interface EnrichedAssignment extends TicketAssignmentRow {
  memberRole: string | null;
  memberDisplayName: string | null;
  memberUserId: string | null;
  assignedByName: string | null;
}

export interface EnrichedComment extends TicketCommentRow {
  authorDisplayName: string | null;
  authorRole: string | null;
  isCurrentUser: boolean;
}

export interface AssignableMember {
  membershipId: string;
  userId: string;
  role: OrganizationRole;
  displayName: string;
  specialties: string[];
  availability: TechnicianAvailabilityStatus;
}

export type TimelineEventType =
  | "ticket_created"
  | "transition"
  | "assignment"
  | "comment";

export interface UnifiedTimelineEvent {
  id: string;
  type: TimelineEventType;
  timestamp: string;
  actorName: string | null;
  title: string;
  description: string | null;
  badgeText?: string;
  badgeVariant?: string;
}

const INITIAL_TICKET_FORM: NewTicketFormState = {
  client_id: "",
  device_id: "",
  subject: "",
  description: "",
  priority: "normal",
  status: "new",
  source: "internal",
};

function formatTicketCode(ticket: TicketRow): string {
  if (ticket.ticket_number !== null && ticket.ticket_number !== undefined) {
    return `#${ticket.ticket_number}`;
  }
  return `#${ticket.id.slice(0, 8).toUpperCase()}`;
}

function formatDateTime(iso: string | null): string {
  if (!iso) {
    return "—";
  }
  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function getInitials(value: string | null | undefined): string {
  const cleaned = value?.trim();
  if (!cleaned) {
    return "US";
  }
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return cleaned.slice(0, 2).toUpperCase();
}

function TicketsView({
  globalSearch,
  initialSelectedTicketId,
  initialCreateClientId,
  openCreateOnMount,
  onNavigateToClients,
  onNavigateToRemoteSessions,
}: TicketsViewProps) {
  const { activeOrganization, activeRole, user } = useAuth();
  const organizationId = activeOrganization?.id ?? null;

  const canCreateTickets =
    activeRole === "owner" ||
    activeRole === "admin" ||
    activeRole === "dispatcher" ||
    activeRole === "technician_internal";

  const canUpdateTickets =
    activeRole === "owner" ||
    activeRole === "admin" ||
    activeRole === "dispatcher" ||
    activeRole === "technician_internal" ||
    activeRole === "technician_external";

  const canManageAssignments =
    activeRole === "owner" ||
    activeRole === "admin" ||
    activeRole === "dispatcher";

  const canComment =
    activeRole === "owner" ||
    activeRole === "admin" ||
    activeRole === "dispatcher" ||
    activeRole === "technician_internal" ||
    activeRole === "technician_external";

  const isExternalTechnician = activeRole === "technician_external";

  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros de listado
  const [localSearch, setLocalSearch] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
  const [clientFilter, setClientFilter] = useState<string>("all");

  // Selección y vista de detalle
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(
    initialSelectedTicketId ?? null,
  );
  const [assignments, setAssignments] = useState<EnrichedAssignment[]>([]);
  const [transitions, setTransitions] = useState<TicketTransitionRow[]>([]);
  const [comments, setComments] = useState<EnrichedComment[]>([]);
  const [assignableMembers, setAssignableMembers] = useState<AssignableMember[]>([]);
  const [ticketAuthorName, setTicketAuthorName] = useState<string | null>(null);

  const [detailLoading, setDetailLoading] = useState<boolean>(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>("comments");

  // Creación de nueva solicitud
  const [showCreateForm, setShowCreateForm] = useState<boolean>(
    Boolean(openCreateOnMount || initialCreateClientId),
  );
  const [newTicketForm, setNewTicketForm] = useState<NewTicketFormState>({
    ...INITIAL_TICKET_FORM,
    client_id: initialCreateClientId ?? "",
  });
  const [createSubmitting, setCreateSubmitting] = useState<boolean>(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);

  // Actualización de estado / prioridad en el detalle
  const [nextStatus, setNextStatus] = useState<TicketStatus>("open");
  const [nextPriority, setNextPriority] = useState<TicketPriority>("normal");
  const [transitionReason, setTransitionReason] = useState<string>("");
  const [statusUpdating, setStatusUpdating] = useState<boolean>(false);
  const [statusUpdateError, setStatusUpdateError] = useState<string | null>(null);

  // Asignación de técnico
  const [showAssignForm, setShowAssignForm] = useState<boolean>(false);
  const [selectedMembershipForAssign, setSelectedMembershipForAssign] = useState<string>("");
  const [assignmentSubmitting, setAssignmentSubmitting] = useState<boolean>(false);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);

  // Redacción de comentarios
  const [commentBody, setCommentBody] = useState<string>("");
  const [commentVisibility, setCommentVisibility] = useState<TicketVisibility>(
    isExternalTechnician ? "client" : "internal",
  );
  const [commentSubmitting, setCommentSubmitting] = useState<boolean>(false);
  const [commentError, setCommentError] = useState<string | null>(null);

  const listRequestIdRef = useRef<number>(0);
  const detailRequestIdRef = useRef<number>(0);

  const loadWorkspaceTickets = useCallback(
    async (targetOrgId: string | null, keepSelectedId?: string | null) => {
      const requestId = ++listRequestIdRef.current;
      await Promise.resolve();
      if (listRequestIdRef.current !== requestId) {
        return;
      }

      const client = supabase;
      if (!client || !targetOrgId) {
        setTickets([]);
        setClients([]);
        setDevices([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const [ticketsRes, clientsRes, devicesRes] = await Promise.all([
          client
            .from("tickets")
            .select(
              "id, organization_id, client_id, device_id, ticket_number, subject, description, priority, status, source, created_by, resolved_at, closed_at, archived_at, created_at, updated_at",
            )
            .eq("organization_id", targetOrgId)
            .order("created_at", { ascending: false }),
          client
            .from("clients")
            .select(
              "id, organization_id, name, email, phone, status, created_at, updated_at, archived_at",
            )
            .eq("organization_id", targetOrgId)
            .order("name", { ascending: true }),
          client
            .from("devices")
            .select(
              "id, organization_id, client_id, device_name, operating_system, device_identifier, agent_type, status, last_seen_at, created_at, updated_at",
            )
            .eq("organization_id", targetOrgId)
            .order("device_name", { ascending: true }),
        ]);

        if (listRequestIdRef.current !== requestId) {
          return;
        }

        if (ticketsRes.error) {
          throw ticketsRes.error;
        }
        if (clientsRes.error) {
          throw clientsRes.error;
        }

        const ticketRows = (ticketsRes.data ?? []) as TicketRow[];
        const clientRows = (clientsRes.data ?? []) as ClientRow[];
        const deviceRows = devicesRes.error
          ? []
          : ((devicesRes.data ?? []) as DeviceRow[]);

        setTickets(ticketRows);
        setClients(clientRows);
        setDevices(deviceRows);

        const resolvedSelected =
          keepSelectedId !== undefined && keepSelectedId !== null
            ? (ticketRows.find((t) => t.id === keepSelectedId) ??
              ticketRows[0] ??
              null)
            : (ticketRows[0] ?? null);

        setSelectedTicketId(resolvedSelected?.id ?? null);
        if (resolvedSelected) {
          setNextStatus(resolvedSelected.status);
          setNextPriority(resolvedSelected.priority);
        }

        setNewTicketForm((prev) => {
          if (prev.client_id) {
            return prev;
          }
          const firstActiveClient = clientRows.find(
            (c) => c.status === "active",
          );
          return {
            ...prev,
            client_id: firstActiveClient?.id ?? "",
          };
        });
      } catch (err) {
        if (listRequestIdRef.current !== requestId) {
          return;
        }
        setTickets([]);
        setClients([]);
        setDevices([]);
        setError(
          formatDatabaseError(
            err,
            "No fue posible consultar las solicitudes de soporte de la organización activa.",
          ),
        );
      } finally {
        if (listRequestIdRef.current === requestId) {
          setLoading(false);
        }
      }
    },
    [],
  );

  const loadTicketSubDetails = useCallback(
    async (
      targetOrgId: string | null,
      ticket: TicketRow | null,
    ) => {
      const requestId = ++detailRequestIdRef.current;
      await Promise.resolve();
      if (detailRequestIdRef.current !== requestId) {
        return;
      }

      const client = supabase;
      if (!client || !targetOrgId || !ticket) {
        setAssignments([]);
        setTransitions([]);
        setComments([]);
        setAssignableMembers([]);
        setTicketAuthorName(null);
        setDetailLoading(false);
        setDetailError(null);
        return;
      }

      setDetailLoading(true);
      setDetailError(null);

      try {
        const [assignRes, transRes, commentsRes, membersRes, techProfilesRes] =
          await Promise.all([
            client
              .from("ticket_assignments")
              .select(
                "id, organization_id, ticket_id, membership_id, assigned_by, status, assigned_at, responded_at, completed_at",
              )
              .eq("organization_id", targetOrgId)
              .eq("ticket_id", ticket.id)
              .order("assigned_at", { ascending: false }),
            client
              .from("ticket_transitions")
              .select(
                "id, organization_id, ticket_id, previous_status, new_status, changed_by, reason, created_at",
              )
              .eq("organization_id", targetOrgId)
              .eq("ticket_id", ticket.id)
              .order("created_at", { ascending: false }),
            client
              .from("ticket_comments")
              .select(
                "id, organization_id, ticket_id, author_user_id, body, visibility, created_at",
              )
              .eq("organization_id", targetOrgId)
              .eq("ticket_id", ticket.id)
              .order("created_at", { ascending: true }),
            client
              .from("organization_members")
              .select("id, organization_id, user_id, role, status")
              .eq("organization_id", targetOrgId)
              .eq("status", "active"),
            client
              .from("technician_profiles")
              .select(
                "id, organization_id, user_id, specialties, availability_status, notes, created_at, updated_at",
              )
              .eq("organization_id", targetOrgId),
          ]);

        if (detailRequestIdRef.current !== requestId) {
          return;
        }

        if (assignRes.error) {
          throw assignRes.error;
        }
        if (transRes.error) {
          throw transRes.error;
        }

        const rawAssignments = (assignRes.data ?? []) as TicketAssignmentRow[];
        const rawTransitions = (transRes.data ?? []) as TicketTransitionRow[];
        const rawComments = commentsRes.error
          ? []
          : ((commentsRes.data ?? []) as TicketCommentRow[]);
        const memberRows = membersRes.error
          ? []
          : ((membersRes.data ?? []) as Array<
              Pick<
                OrganizationMemberRow,
                "id" | "organization_id" | "user_id" | "role" | "status"
              >
            >);
        const techProfileRows = techProfilesRes.error
          ? []
          : ((techProfilesRes.data ?? []) as TechnicianProfileRow[]);

        // Recopilar todos los user_id involucrados para enriquecer nombres
        const userIds = new Set<string>();
        if (ticket.created_by) userIds.add(ticket.created_by);
        memberRows.forEach((m) => userIds.add(m.user_id));
        rawAssignments.forEach((a) => {
          if (a.assigned_by) userIds.add(a.assigned_by);
        });
        rawTransitions.forEach((t) => {
          if (t.changed_by) userIds.add(t.changed_by);
        });
        rawComments.forEach((c) => {
          if (c.author_user_id) userIds.add(c.author_user_id);
        });

        let profileMap = new Map<string, string | null>();
        if (userIds.size > 0) {
          const profilesRes = await client
            .from("profiles")
            .select("id, display_name")
            .in("id", Array.from(userIds));

          if (detailRequestIdRef.current !== requestId) {
            return;
          }

          if (!profilesRes.error && profilesRes.data) {
            const pRows = profilesRes.data as Array<
              Pick<ProfileRow, "id" | "display_name">
            >;
            profileMap = new Map(pRows.map((p) => [p.id, p.display_name]));
          }
        }

        const memberById = new Map(memberRows.map((m) => [m.id, m]));
        const memberByUserId = new Map(memberRows.map((m) => [m.user_id, m]));
        const techProfileByUser = new Map(
          techProfileRows.map((tp) => [tp.user_id, tp]),
        );

        // Miembros habilitados para asignación técnica
        const eligibleAssignees: AssignableMember[] = memberRows
          .filter(
            (m) =>
              m.role === "technician_internal" ||
              m.role === "technician_external" ||
              m.role === "dispatcher" ||
              m.role === "admin" ||
              m.role === "owner",
          )
          .map((m) => {
            const displayName =
              profileMap.get(m.user_id) ?? `Usuario ${m.user_id.slice(0, 6)}`;
            const techProfile = techProfileByUser.get(m.user_id);
            return {
              membershipId: m.id,
              userId: m.user_id,
              role: m.role,
              displayName,
              specialties: techProfile?.specialties ?? [],
              availability: techProfile?.availability_status ?? "available",
            };
          });

        // Enriquecer asignaciones
        const enrichedAssignments: EnrichedAssignment[] = rawAssignments.map(
          (a) => {
            const member = memberById.get(a.membership_id);
            const displayName = member
              ? (profileMap.get(member.user_id) ??
                `Usuario ${member.user_id.slice(0, 6)}`)
              : null;
            const assignedByName = a.assigned_by
              ? (profileMap.get(a.assigned_by) ?? "Administrador")
              : "Sistema";

            return {
              ...a,
              memberRole: member
                ? ORGANIZATION_ROLE_LABELS[member.role]
                : "Técnico",
              memberDisplayName: displayName,
              memberUserId: member?.user_id ?? null,
              assignedByName,
            };
          },
        );

        // Enriquecer comentarios
        const enrichedComments: EnrichedComment[] = rawComments.map((c) => {
          const authorMember = c.author_user_id
            ? memberByUserId.get(c.author_user_id)
            : null;
          const authorDisplayName = c.author_user_id
            ? (profileMap.get(c.author_user_id) ?? "Usuario")
            : "Sistema";
          const authorRole = authorMember
            ? ORGANIZATION_ROLE_LABELS[authorMember.role]
            : "Colaborador";

          return {
            ...c,
            authorDisplayName,
            authorRole,
            isCurrentUser: c.author_user_id === user?.id,
          };
        });

        const createdByName = ticket.created_by
          ? (profileMap.get(ticket.created_by) ?? "Usuario de la organización")
          : "Portal de cliente";

        setAssignments(enrichedAssignments);
        setTransitions(rawTransitions);
        setComments(enrichedComments);
        setAssignableMembers(eligibleAssignees);
        setTicketAuthorName(createdByName);

        if (eligibleAssignees.length > 0) {
          setSelectedMembershipForAssign((prev) =>
            prev && eligibleAssignees.some((e) => e.membershipId === prev)
              ? prev
              : eligibleAssignees[0].membershipId,
          );
        }
      } catch (err) {
        if (detailRequestIdRef.current !== requestId) {
          return;
        }
        setAssignments([]);
        setTransitions([]);
        setComments([]);
        setAssignableMembers([]);
        setDetailError(
          formatDatabaseError(
            err,
            "No fue posible recuperar el historial o asignaciones del ticket.",
          ),
        );
      } finally {
        if (detailRequestIdRef.current === requestId) {
          setDetailLoading(false);
        }
      }
    },
    [user?.id],
  );

  useEffect(() => {
    void Promise.resolve().then(() =>
      loadWorkspaceTickets(organizationId, initialSelectedTicketId ?? null),
    );

    return () => {
      listRequestIdRef.current += 1;
      detailRequestIdRef.current += 1;
    };
  }, [organizationId, initialSelectedTicketId, loadWorkspaceTickets]);

  const selectedTicket = useMemo(
    () => tickets.find((t) => t.id === selectedTicketId) ?? null,
    [tickets, selectedTicketId],
  );

  useEffect(() => {
    void Promise.resolve().then(() =>
      loadTicketSubDetails(organizationId, selectedTicket),
    );
  }, [organizationId, selectedTicket, loadTicketSubDetails]);

  const handleSelectTicket = (ticket: TicketRow) => {
    setSelectedTicketId(ticket.id);
    setNextStatus(ticket.status);
    setNextPriority(ticket.priority);
    setTransitionReason("");
    setStatusUpdateError(null);
    setAssignmentError(null);
    setCommentError(null);
    setShowAssignForm(false);
  };

  const clientMap = useMemo(
    () => new Map<string, ClientRow>(clients.map((c) => [c.id, c])),
    [clients],
  );

  const deviceMap = useMemo(
    () => new Map<string, DeviceRow>(devices.map((d) => [d.id, d])),
    [devices],
  );

  const activeClients = useMemo(
    () => clients.filter((c) => c.status === "active"),
    [clients],
  );

  const availableDevicesForFormClient = useMemo(
    () =>
      devices.filter(
        (d) =>
          d.client_id === newTicketForm.client_id && d.status !== "revoked",
      ),
    [devices, newTicketForm.client_id],
  );

  const effectiveSearch = (localSearch.trim() || globalSearch.trim()).toLowerCase();

  const filteredTickets = useMemo(() => {
    return tickets.filter((ticket) => {
      if (statusFilter !== "all" && ticket.status !== statusFilter) {
        return false;
      }
      if (priorityFilter !== "all" && ticket.priority !== priorityFilter) {
        return false;
      }
      if (clientFilter !== "all" && ticket.client_id !== clientFilter) {
        return false;
      }
      if (!effectiveSearch) {
        return true;
      }
      const clientName = clientMap.get(ticket.client_id)?.name ?? "";
      const code = formatTicketCode(ticket).toLowerCase();
      return (
        code.includes(effectiveSearch) ||
        ticket.subject.toLowerCase().includes(effectiveSearch) ||
        (ticket.description ?? "").toLowerCase().includes(effectiveSearch) ||
        clientName.toLowerCase().includes(effectiveSearch)
      );
    });
  }, [
    tickets,
    statusFilter,
    priorityFilter,
    clientFilter,
    effectiveSearch,
    clientMap,
  ]);

  // Asignación actualmente activa/aceptada
  const activeAssignment = useMemo(
    () =>
      assignments.find(
        (a) => a.status === "active" || a.status === "accepted",
      ) ?? null,
    [assignments],
  );

  // Comprobar si el usuario actual es el técnico asignado
  const isAssignedToCurrentUser = useMemo(
    () => Boolean(activeAssignment && activeAssignment.memberUserId === user?.id),
    [activeAssignment, user?.id],
  );

  // Auto-asignación para técnico interno si no hay asignación
  const canSelfAssign =
    activeRole === "technician_internal" && !activeAssignment;

  // Manejo de Creación de Ticket
  const handleCreateTicketSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    if (!supabase || !organizationId || !user) {
      return;
    }

    const trimmedSubject = newTicketForm.subject.trim();
    const trimmedDescription = newTicketForm.description.trim();

    if (!newTicketForm.client_id) {
      setCreateError("Selecciona un cliente activo para asociar la solicitud.");
      return;
    }

    if (!trimmedSubject) {
      setCreateError("El asunto de la solicitud es obligatorio.");
      return;
    }

    setCreateSubmitting(true);
    setCreateError(null);

    try {
      const { data, error: insertError } = await supabase
        .from("tickets")
        .insert({
          organization_id: organizationId,
          client_id: newTicketForm.client_id,
          device_id: newTicketForm.device_id || null,
          subject: trimmedSubject,
          description: trimmedDescription || null,
          priority: newTicketForm.priority,
          status: newTicketForm.status,
          source: newTicketForm.source,
          created_by: user.id,
        })
        .select(
          "id, organization_id, client_id, device_id, ticket_number, subject, description, priority, status, source, created_by, resolved_at, closed_at, archived_at, created_at, updated_at",
        )
        .single();

      if (insertError) {
        throw insertError;
      }

      const createdTicket = data as TicketRow;

      await supabase.from("ticket_transitions").insert({
        organization_id: organizationId,
        ticket_id: createdTicket.id,
        previous_status: null,
        new_status: createdTicket.status,
        changed_by: user.id,
        reason: "Apertura inicial de solicitud de soporte",
      });

      setShowCreateForm(false);
      setNewTicketForm((prev) => ({
        ...INITIAL_TICKET_FORM,
        client_id: prev.client_id,
      }));
      setFeedbackBanner(
        `Solicitud "${createdTicket.subject}" creada correctamente.`,
      );
      await loadWorkspaceTickets(organizationId, createdTicket.id);
    } catch (err) {
      setCreateError(
        formatDatabaseError(
          err,
          "No fue posible registrar la solicitud de soporte.",
        ),
      );
    } finally {
      setCreateSubmitting(false);
    }
  };

  // Actualización de Estado y Prioridad
  const handleStatusPriorityUpdate = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    if (!supabase || !organizationId || !selectedTicket || !user) {
      return;
    }

    const statusChanged = nextStatus !== selectedTicket.status;
    const priorityChanged = nextPriority !== selectedTicket.priority;

    if (!statusChanged && !priorityChanged) {
      return;
    }

    setStatusUpdating(true);
    setStatusUpdateError(null);

    try {
      const nowIso = new Date().toISOString();
      const resolvedAtValue =
        nextStatus === "resolved"
          ? (selectedTicket.resolved_at ?? nowIso)
          : selectedTicket.resolved_at;
      const closedAtValue =
        nextStatus === "closed"
          ? (selectedTicket.closed_at ?? nowIso)
          : selectedTicket.closed_at;

      const { error: updateError } = await supabase
        .from("tickets")
        .update({
          status: nextStatus,
          priority: nextPriority,
          resolved_at: resolvedAtValue,
          closed_at: closedAtValue,
          updated_at: nowIso,
        })
        .eq("organization_id", organizationId)
        .eq("id", selectedTicket.id);

      if (updateError) {
        throw updateError;
      }

      if (statusChanged) {
        await supabase.from("ticket_transitions").insert({
          organization_id: organizationId,
          ticket_id: selectedTicket.id,
          previous_status: selectedTicket.status,
          new_status: nextStatus,
          changed_by: user.id,
          reason: transitionReason.trim() || null,
        });
      }

      setTransitionReason("");
      setFeedbackBanner(
        `Solicitud ${formatTicketCode(selectedTicket)} actualizada correctamente.`,
      );
      await loadWorkspaceTickets(organizationId, selectedTicket.id);
      await loadTicketSubDetails(organizationId, selectedTicket);
    } catch (err) {
      setStatusUpdateError(
        formatDatabaseError(
          err,
          "No fue posible actualizar el estado o prioridad del ticket.",
        ),
      );
    } finally {
      setStatusUpdating(false);
    }
  };

  // Asignar o cambiar técnico
  const handleAssignTechnician = async (targetMembershipId: string) => {
    if (!supabase || !organizationId || !selectedTicket || !user) {
      return;
    }

    if (!targetMembershipId) {
      setAssignmentError("Selecciona un técnico habilitado.");
      return;
    }

    setAssignmentSubmitting(true);
    setAssignmentError(null);

    try {
      const nowIso = new Date().toISOString();

      // Si existe una asignación activa previa, se cancela/completa para respetar el índice de unicidad
      if (activeAssignment) {
        const { error: cancelError } = await supabase
          .from("ticket_assignments")
          .update({
            status: "cancelled",
            completed_at: nowIso,
          })
          .eq("organization_id", organizationId)
          .eq("id", activeAssignment.id);

        if (cancelError) {
          throw cancelError;
        }
      }

      // Crear nueva asignación activa
      const { error: insertError } = await supabase
        .from("ticket_assignments")
        .insert({
          organization_id: organizationId,
          ticket_id: selectedTicket.id,
          membership_id: targetMembershipId,
          assigned_by: user.id,
          status: "active",
          assigned_at: nowIso,
        });

      if (insertError) {
        throw insertError;
      }

      setShowAssignForm(false);
      setFeedbackBanner("Técnico asignado correctamente al ticket.");
      await loadTicketSubDetails(organizationId, selectedTicket);
    } catch (err) {
      setAssignmentError(
        formatDatabaseError(
          err,
          "No fue posible registrar la asignación del técnico.",
        ),
      );
    } finally {
      setAssignmentSubmitting(false);
    }
  };

  // Retirar asignación activa
  const handleUnassignTechnician = async () => {
    if (!supabase || !organizationId || !selectedTicket || !activeAssignment) {
      return;
    }

    setAssignmentSubmitting(true);
    setAssignmentError(null);

    try {
      const { error: unassignError } = await supabase
        .from("ticket_assignments")
        .update({
          status: "cancelled",
          completed_at: new Date().toISOString(),
        })
        .eq("organization_id", organizationId)
        .eq("id", activeAssignment.id);

      if (unassignError) {
        throw unassignError;
      }

      setFeedbackBanner("Asignación técnica retirada del ticket.");
      await loadTicketSubDetails(organizationId, selectedTicket);
    } catch (err) {
      setAssignmentError(
        formatDatabaseError(
          err,
          "No fue posible retirar la asignación actual.",
        ),
      );
    } finally {
      setAssignmentSubmitting(false);
    }
  };

  // Respuesta del técnico asignado (Aceptar / Rechazar / Completar)
  const handleTechnicianResponse = async (
    targetStatus: TicketAssignmentStatus,
  ) => {
    if (!supabase || !organizationId || !selectedTicket || !activeAssignment) {
      return;
    }

    setAssignmentSubmitting(true);
    setAssignmentError(null);

    try {
      const nowIso = new Date().toISOString();
      const isFinishing =
        targetStatus === "completed" || targetStatus === "declined";

      const { error: respError } = await supabase
        .from("ticket_assignments")
        .update({
          status: targetStatus,
          responded_at:
            targetStatus === "accepted" || targetStatus === "declined"
              ? nowIso
              : activeAssignment.responded_at,
          completed_at: isFinishing ? nowIso : activeAssignment.completed_at,
        })
        .eq("organization_id", organizationId)
        .eq("id", activeAssignment.id);

      if (respError) {
        throw respError;
      }

      setFeedbackBanner(
        `Asignación marcada como "${TICKET_ASSIGNMENT_STATUS_LABELS[targetStatus]}".`,
      );
      await loadTicketSubDetails(organizationId, selectedTicket);
    } catch (err) {
      setAssignmentError(
        formatDatabaseError(
          err,
          "No fue posible actualizar el estado de la asignación.",
        ),
      );
    } finally {
      setAssignmentSubmitting(false);
    }
  };

  // Creación de nuevo comentario
  const handleAddCommentSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !organizationId || !selectedTicket || !user) {
      return;
    }

    const trimmed = commentBody.trim();
    if (!trimmed) {
      setCommentError("Introduce el contenido del comentario.");
      return;
    }

    setCommentSubmitting(true);
    setCommentError(null);

    try {
      const { error: insertError } = await supabase
        .from("ticket_comments")
        .insert({
          organization_id: organizationId,
          ticket_id: selectedTicket.id,
          author_user_id: user.id,
          body: trimmed,
          visibility: isExternalTechnician ? "client" : commentVisibility,
        });

      if (insertError) {
        throw insertError;
      }

      setCommentBody("");
      setFeedbackBanner("Nota registrada exitosamente en el ticket.");
      await loadTicketSubDetails(organizationId, selectedTicket);
    } catch (err) {
      setCommentError(
        formatDatabaseError(
          err,
          "No fue posible registrar el comentario en el ticket.",
        ),
      );
    } finally {
      setCommentSubmitting(false);
    }
  };

  // Construcción de la línea de tiempo unificada (Timeline)
  const unifiedTimeline = useMemo<UnifiedTimelineEvent[]>(() => {
    if (!selectedTicket) {
      return [];
    }

    const events: UnifiedTimelineEvent[] = [];

    // 1. Creación del ticket
    events.push({
      id: `create-${selectedTicket.id}`,
      type: "ticket_created",
      timestamp: selectedTicket.created_at,
      actorName: ticketAuthorName,
      title: "Solicitud registrada",
      description:
        selectedTicket.description?.trim() ||
        "Apertura inicial del caso en la mesa de ayuda.",
      badgeText: TICKET_STATUS_LABELS[selectedTicket.status],
      badgeVariant: "create",
    });

    // 2. Transiciones de estado
    transitions.forEach((tr) => {
      const fromLabel = tr.previous_status
        ? TICKET_STATUS_LABELS[tr.previous_status]
        : "Inicio";
      const toLabel = TICKET_STATUS_LABELS[tr.new_status];
      events.push({
        id: `transition-${tr.id}`,
        type: "transition",
        timestamp: tr.created_at,
        actorName: "Responsable técnico",
        title: `Transición: ${fromLabel} → ${toLabel}`,
        description: tr.reason?.trim() || null,
        badgeText: toLabel,
        badgeVariant: "transition",
      });
    });

    // 3. Asignaciones
    assignments.forEach((assign) => {
      const techName = assign.memberDisplayName ?? "Técnico";
      const statusLabel = TICKET_ASSIGNMENT_STATUS_LABELS[assign.status];
      events.push({
        id: `assign-${assign.id}`,
        type: "assignment",
        timestamp: assign.assigned_at,
        actorName: assign.assignedByName,
        title: `Asignación a ${techName} (${assign.memberRole ?? "Técnico"})`,
        description:
          assign.status === "cancelled"
            ? "Asignación cancelada o retirada posteriormente."
            : assign.status === "completed"
              ? "Asignación marcada como completada."
              : `Estado de la asignación: ${statusLabel}`,
        badgeText: statusLabel,
        badgeVariant: "assignment",
      });
    });

    // 4. Comentarios
    comments.forEach((c) => {
      const isInternal = c.visibility === "internal";
      events.push({
        id: `comment-${c.id}`,
        type: "comment",
        timestamp: c.created_at,
        actorName: c.authorDisplayName ?? "Usuario",
        title: isInternal ? "Nota interna privada" : "Mensaje para el cliente",
        description: c.body,
        badgeText: isInternal ? "Interno" : "Cliente",
        badgeVariant: isInternal ? "comment-internal" : "comment-client",
      });
    });

    // Orden cronológico descendente (más recientes primero)
    events.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    return events;
  }, [selectedTicket, ticketAuthorName, transitions, assignments, comments]);

  const associatedClient = selectedTicket
    ? (clientMap.get(selectedTicket.client_id) ?? null)
    : null;

  const associatedDevice =
    selectedTicket && selectedTicket.device_id
      ? (deviceMap.get(selectedTicket.device_id) ?? null)
      : null;

  return (
    <div className="module-container">
      {/* Barra de herramientas y filtros */}
      <section className="panel module-toolbar">
        <div className="module-toolbar-left">
          <label className="module-search-input">
            <Search size={16} />
            <input
              type="search"
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              placeholder="Buscar por código, asunto, descripción o cliente..."
              aria-label="Buscar ticket"
            />
          </label>

          <select
            className="toolbar-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            aria-label="Filtrar por estado"
          >
            <option value="all">Todos los estados</option>
            <option value="new">Nuevos</option>
            <option value="open">Abiertos</option>
            <option value="in_progress">En atención</option>
            <option value="waiting_client">Esperando cliente</option>
            <option value="waiting_third_party">Esperando tercero</option>
            <option value="resolved">Resueltos</option>
            <option value="closed">Cerrados</option>
            <option value="cancelled">Cancelados</option>
          </select>

          <select
            className="toolbar-select"
            value={priorityFilter}
            onChange={(e) =>
              setPriorityFilter(e.target.value as PriorityFilter)
            }
            aria-label="Filtrar por prioridad"
          >
            <option value="all">Todas las prioridades</option>
            <option value="urgent">Urgente</option>
            <option value="high">Alta</option>
            <option value="normal">Normal</option>
            <option value="low">Baja</option>
          </select>

          <select
            className="toolbar-select"
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            aria-label="Filtrar por cliente"
          >
            <option value="all">Todos los clientes</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="module-toolbar-right">
          <button
            type="button"
            className="secondary-button toolbar-btn"
            onClick={() => {
              void loadWorkspaceTickets(organizationId, selectedTicketId);
            }}
            disabled={loading}
          >
            <RefreshCw size={15} />
            Actualizar
          </button>

          {canCreateTickets && (
            <button
              type="button"
              className="primary-button toolbar-btn"
              onClick={() => {
                setCreateError(null);
                setShowCreateForm((prev) => !prev);
              }}
            >
              <Plus size={16} />
              Nueva solicitud
            </button>
          )}
        </div>
      </section>

      {!canCreateTickets && (
        <div className="role-notice-banner" role="status">
          <ShieldAlert size={16} />
          <span>
            Tu rol actual (
            <strong>
              {activeRole ? ORGANIZATION_ROLE_LABELS[activeRole] : "Lectura"}
            </strong>
            ) permite consultar tickets según el alcance RLS asignado, pero la
            apertura interna de nuevas solicitudes está reservada a personal
            operativo interno.
          </span>
        </div>
      )}

      {feedbackBanner && (
        <div className="feedback-banner success" role="status">
          <CheckCircle2 size={16} />
          <span>{feedbackBanner}</span>
          <button
            type="button"
            className="icon-button"
            onClick={() => setFeedbackBanner(null)}
            aria-label="Cerrar aviso"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Formulario de creación de solicitud */}
      {showCreateForm && (
        <section
          className="panel module-form-card"
          aria-labelledby="create-ticket-title"
        >
          <div className="panel-heading">
            <div>
              <h3 id="create-ticket-title">Nueva solicitud de soporte</h3>
              <p>
                Registra un ticket vinculado a un cliente activo de{" "}
                <strong>{activeOrganization?.name}</strong>
              </p>
            </div>
            <button
              type="button"
              className="icon-button"
              onClick={() => setShowCreateForm(false)}
              aria-label="Cerrar formulario"
            >
              <X size={18} />
            </button>
          </div>

          {activeClients.length === 0 ? (
            <div className="empty-state-box empty-state-compact">
              <Building2 size={22} />
              <strong>No hay clientes activos disponibles</strong>
              <p>
                Cada ticket requiere un cliente activo dentro de la
                organización. Registra o activa primero un cliente en el
                directorio.
              </p>
              {onNavigateToClients && (
                <button
                  type="button"
                  className="primary-button"
                  onClick={onNavigateToClients}
                >
                  <Users size={15} />
                  Ir a Clientes
                </button>
              )}
            </div>
          ) : (
            <form onSubmit={handleCreateTicketSubmit}>
              {createError && (
                <div className="auth-alert auth-alert-error" role="alert">
                  <AlertTriangle size={16} />
                  <div>{createError}</div>
                </div>
              )}

              <div className="module-form-grid">
                <div className="form-field">
                  <label htmlFor="ticket-client">Cliente asociado *</label>
                  <select
                    id="ticket-client"
                    required
                    value={newTicketForm.client_id}
                    onChange={(e) =>
                      setNewTicketForm((prev) => ({
                        ...prev,
                        client_id: e.target.value,
                        device_id: "",
                      }))
                    }
                    disabled={createSubmitting}
                  >
                    <option value="">Seleccionar cliente...</option>
                    {activeClients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-field">
                  <label htmlFor="ticket-device">
                    Dispositivo afectado (opcional)
                  </label>
                  <select
                    id="ticket-device"
                    value={newTicketForm.device_id}
                    onChange={(e) =>
                      setNewTicketForm((prev) => ({
                        ...prev,
                        device_id: e.target.value,
                      }))
                    }
                    disabled={
                      createSubmitting ||
                      availableDevicesForFormClient.length === 0
                    }
                  >
                    <option value="">
                      {availableDevicesForFormClient.length === 0
                        ? "Sin dispositivos registrados para este cliente"
                        : "Sin dispositivo específico"}
                    </option>
                    {availableDevicesForFormClient.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.device_name}
                        {d.operating_system ? ` (${d.operating_system})` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-field">
                  <label htmlFor="ticket-priority">Prioridad *</label>
                  <select
                    id="ticket-priority"
                    value={newTicketForm.priority}
                    onChange={(e) =>
                      setNewTicketForm((prev) => ({
                        ...prev,
                        priority: e.target.value as TicketPriority,
                      }))
                    }
                    disabled={createSubmitting}
                  >
                    <option value="low">Baja</option>
                    <option value="normal">Normal</option>
                    <option value="high">Alta</option>
                    <option value="urgent">Urgente</option>
                  </select>
                </div>

                <div className="form-field">
                  <label htmlFor="ticket-source">Canal de origen *</label>
                  <select
                    id="ticket-source"
                    value={newTicketForm.source}
                    onChange={(e) =>
                      setNewTicketForm((prev) => ({
                        ...prev,
                        source: e.target.value as TicketSource,
                      }))
                    }
                    disabled={createSubmitting}
                  >
                    <option value="internal">Registro interno</option>
                    <option value="portal">Portal de cliente</option>
                    <option value="technician_invitation">
                      Invitación técnica
                    </option>
                  </select>
                </div>

                <div className="form-field form-field-full">
                  <label htmlFor="ticket-subject">
                    Asunto de la solicitud *
                  </label>
                  <input
                    id="ticket-subject"
                    type="text"
                    required
                    maxLength={200}
                    value={newTicketForm.subject}
                    onChange={(e) =>
                      setNewTicketForm((prev) => ({
                        ...prev,
                        subject: e.target.value,
                      }))
                    }
                    placeholder="Ej. Fallo de conexión VPN en puesto de administración"
                    disabled={createSubmitting}
                  />
                </div>

                <div className="form-field form-field-full">
                  <label htmlFor="ticket-description">
                    Descripción técnica / Síntomas
                  </label>
                  <textarea
                    id="ticket-description"
                    rows={3}
                    value={newTicketForm.description}
                    onChange={(e) =>
                      setNewTicketForm((prev) => ({
                        ...prev,
                        description: e.target.value,
                      }))
                    }
                    placeholder="Detalla el comportamiento observado, mensajes de error y alcance del incidente..."
                    disabled={createSubmitting}
                  />
                </div>
              </div>

              <div className="form-actions-row">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setShowCreateForm(false)}
                  disabled={createSubmitting}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={createSubmitting}
                >
                  {createSubmitting ? (
                    <>
                      <Loader2 size={15} className="auth-spinner" />
                      Registrando solicitud...
                    </>
                  ) : (
                    "Crear solicitud"
                  )}
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      {/* Listado y vista de detalle */}
      {loading ? (
        <section
          className="panel module-state-panel"
          role="status"
          aria-live="polite"
        >
          <Loader2 size={24} className="auth-spinner module-state-spinner" />
          <strong>
            Cargando mesa de ayuda de {activeOrganization?.name}...
          </strong>
          <span>Consultando tickets autorizados según tu rol y membresía.</span>
        </section>
      ) : error ? (
        <section className="panel module-state-panel" role="alert">
          <div className="placeholder-icon context-error-icon">
            <AlertTriangle size={24} />
          </div>
          <strong>Error al consultar solicitudes de soporte</strong>
          <span>{error}</span>
          <button
            type="button"
            className="primary-button context-action-button"
            onClick={() => {
              void loadWorkspaceTickets(organizationId, selectedTicketId);
            }}
          >
            <RefreshCw size={15} />
            Reintentar
          </button>
        </section>
      ) : tickets.length === 0 ? (
        <section className="panel module-state-panel">
          <div className="placeholder-icon">
            <Ticket size={26} />
          </div>
          <strong>No existen tickets registrados o asignados</strong>
          <span>
            La organización activa aún no dispone de solicitudes visibles para
            tu rol actual.
          </span>
          {canCreateTickets && (
            <button
              type="button"
              className="primary-button context-action-button"
              onClick={() => setShowCreateForm(true)}
            >
              <Plus size={16} />
              Crear primera solicitud
            </button>
          )}
        </section>
      ) : (
        <div className="master-detail-layout">
          {/* Columna izquierda: Cola de tickets */}
          <section className="panel master-list-panel">
            <div className="panel-heading">
              <div>
                <h3>Solicitudes ({filteredTickets.length})</h3>
                <p>Cola operativa de soporte técnico</p>
              </div>
            </div>

            {filteredTickets.length === 0 ? (
              <div className="empty-state-box">
                <Inbox size={22} />
                <strong>Sin tickets que coincidan</strong>
                <p>Ajusta los filtros de búsqueda, estado o prioridad.</p>
              </div>
            ) : (
              <div className="entity-list" role="list">
                {filteredTickets.map((ticket) => {
                  const isSelected = ticket.id === selectedTicket?.id;
                  const clientName =
                    clientMap.get(ticket.client_id)?.name ??
                    "Cliente de la organización";

                  return (
                    <button
                      type="button"
                      role="listitem"
                      key={ticket.id}
                      className={`entity-list-item ticket-list-item ${
                        isSelected ? "selected" : ""
                      }`}
                      onClick={() => handleSelectTicket(ticket)}
                    >
                      <div className="ticket-list-item-top">
                        <span className="ticket-code-pill">
                          {formatTicketCode(ticket)}
                        </span>
                        <span
                          className={`priority priority-badge-${ticket.priority}`}
                        >
                          {TICKET_PRIORITY_LABELS[ticket.priority]}
                        </span>
                        <span
                          className={`status status-badge-${ticket.status}`}
                        >
                          {TICKET_STATUS_LABELS[ticket.status]}
                        </span>
                      </div>
                      <strong className="ticket-list-subject">
                        {ticket.subject}
                      </strong>
                      <span className="ticket-list-meta">
                        {clientName} · {formatDateTime(ticket.created_at)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* Columna derecha: Ficha completa de detalle */}
          <section className="panel detail-view-panel">
            {!selectedTicket ? (
              <div className="empty-state-box">
                <Ticket size={24} />
                <strong>Selecciona una solicitud</strong>
                <p>
                  Elige un ticket del listado para consultar su cliente,
                  asignaciones, transiciones de estado y comentarios.
                </p>
              </div>
            ) : (
              <>
                <div className="detail-header">
                  <div>
                    <div className="detail-badges-row">
                      <span className="ticket-code-pill">
                        {formatTicketCode(selectedTicket)}
                      </span>
                      <span
                        className={`priority priority-badge-${selectedTicket.priority}`}
                      >
                        Prioridad:{" "}
                        {TICKET_PRIORITY_LABELS[selectedTicket.priority]}
                      </span>
                      <span
                        className={`status status-badge-${selectedTicket.status}`}
                      >
                        {TICKET_STATUS_LABELS[selectedTicket.status]}
                      </span>
                      <span className="detail-id-code">
                        Origen: {TICKET_SOURCE_LABELS[selectedTicket.source]}
                      </span>
                    </div>
                    <h3>{selectedTicket.subject}</h3>
                  </div>
                </div>

                {/* Metadatos principales */}
                <div className="detail-metadata-grid">
                  <div className="metadata-item">
                    <span>Cliente asociado</span>
                    <strong>
                      {associatedClient ? (
                        <span className="inline-icon-text">
                          <Building2 size={13} />
                          {associatedClient.name} (
                          {CLIENT_STATUS_LABELS[associatedClient.status]})
                        </span>
                      ) : (
                        `ID Cliente: ${selectedTicket.client_id.slice(0, 8)}`
                      )}
                    </strong>
                  </div>

                  <div className="metadata-item">
                    <span>Contacto de cliente</span>
                    <strong>
                      {associatedClient?.email ||
                        associatedClient?.phone ||
                        "Consultar ficha del cliente"}
                    </strong>
                  </div>

                  <div className="metadata-item">
                    <span>Dispositivo vinculado</span>
                    <strong>
                      {associatedDevice ? (
                        <span className="inline-icon-text">
                          <Monitor size={13} />
                          {associatedDevice.device_name}
                        </span>
                      ) : (
                        "Sin dispositivo específico"
                      )}
                    </strong>
                    {onNavigateToRemoteSessions &&
                      selectedTicket.status !== "closed" &&
                      selectedTicket.status !== "cancelled" && (
                        <button
                          type="button"
                          className="link-button"
                          onClick={() =>
                            onNavigateToRemoteSessions({
                              ticketId: selectedTicket.id,
                              clientId: selectedTicket.client_id,
                              deviceId: selectedTicket.device_id || undefined,
                              openCreate: true,
                            })
                          }
                          style={{
                            marginTop: "4px",
                            fontSize: "0.8rem",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          <Play size={11} />
                          Solicitar asistencia remota
                        </button>
                      )}
                  </div>

                  <div className="metadata-item">
                    <span>Fecha de registro</span>
                    <strong>
                      <span className="inline-icon-text">
                        <Clock3 size={13} />
                        {formatDateTime(selectedTicket.created_at)}
                      </span>
                    </strong>
                  </div>
                </div>

                {/* Panel de control de asignación técnica */}
                <div className="assignment-control-card">
                  <div className="assignment-header">
                    <div className="assignment-technician-info">
                      <div className="assignment-avatar">
                        {getInitials(activeAssignment?.memberDisplayName)}
                      </div>
                      <div className="assignment-details">
                        <strong>
                          {activeAssignment
                            ? activeAssignment.memberDisplayName
                            : "Sin técnico asignado"}
                        </strong>
                        <span>
                          {activeAssignment ? (
                            <>
                              Rol: {activeAssignment.memberRole} · Asignado por:{" "}
                              {activeAssignment.assignedByName} (
                              {formatDateTime(activeAssignment.assigned_at)})
                            </>
                          ) : (
                            "La solicitud está en espera de despacho técnico."
                          )}
                        </span>
                      </div>
                    </div>

                    {activeAssignment && (
                      <span
                        className={`status status-badge-${
                          activeAssignment.status === "accepted"
                            ? "resolved"
                            : "in_progress"
                        }`}
                      >
                        {TICKET_ASSIGNMENT_STATUS_LABELS[activeAssignment.status]}
                      </span>
                    )}
                  </div>

                  {assignmentError && (
                    <div className="auth-alert auth-alert-error" role="alert">
                      <AlertTriangle size={15} />
                      <div>{assignmentError}</div>
                    </div>
                  )}

                  {/* Acciones de asignación según rol */}
                  <div className="assignment-actions-bar">
                    {/* Responsables de asignación: asignar, cambiar o retirar */}
                    {canManageAssignments && (
                      <>
                        {!showAssignForm ? (
                          <>
                            <button
                              type="button"
                              className="secondary-button toolbar-btn"
                              onClick={() => setShowAssignForm(true)}
                              disabled={assignmentSubmitting}
                            >
                              <UserPlus size={14} />
                              {activeAssignment ? "Cambiar técnico" : "Asignar técnico"}
                            </button>

                            {activeAssignment && (
                              <button
                                type="button"
                                className="secondary-button toolbar-btn assignment-btn-danger"
                                onClick={handleUnassignTechnician}
                                disabled={assignmentSubmitting}
                              >
                                <UserMinus size={14} />
                                Retirar asignación
                              </button>
                            )}
                          </>
                        ) : (
                          <div className="inline-icon-text" style={{ flex: 1, flexWrap: "wrap" }}>
                            <select
                              className="technician-select"
                              value={selectedMembershipForAssign}
                              onChange={(e) => setSelectedMembershipForAssign(e.target.value)}
                              disabled={assignmentSubmitting}
                              aria-label="Seleccionar técnico para asignar"
                            >
                              {assignableMembers.map((m) => (
                                <option key={m.membershipId} value={m.membershipId}>
                                  {m.displayName} ({ORGANIZATION_ROLE_LABELS[m.role]})
                                  {m.availability !== "available" ? " [Ocupado]" : " [Disponible]"}
                                </option>
                              ))}
                            </select>

                            <button
                              type="button"
                              className="primary-button toolbar-btn"
                              onClick={() => handleAssignTechnician(selectedMembershipForAssign)}
                              disabled={assignmentSubmitting || !selectedMembershipForAssign}
                            >
                              {assignmentSubmitting ? (
                                <Loader2 size={13} className="auth-spinner" />
                              ) : (
                                <UserCheck size={14} />
                              )}
                              Confirmar
                            </button>

                            <button
                              type="button"
                              className="secondary-button toolbar-btn"
                              onClick={() => setShowAssignForm(false)}
                              disabled={assignmentSubmitting}
                            >
                              Cancelar
                            </button>
                          </div>
                        )}
                      </>
                    )}

                    {/* Auto-asignación para técnico interno */}
                    {canSelfAssign && !showAssignForm && (
                      <button
                        type="button"
                        className="primary-button toolbar-btn"
                        onClick={() => {
                          const selfMember = assignableMembers.find((m) => m.userId === user?.id);
                          if (selfMember) {
                            void handleAssignTechnician(selfMember.membershipId);
                          }
                        }}
                        disabled={assignmentSubmitting}
                      >
                        <UserPlus size={14} />
                        Tomar este ticket
                      </button>
                    )}

                    {/* Acciones del técnico asignado: Aceptar / Rechazar / Completar */}
                    {isAssignedToCurrentUser && activeAssignment && (
                      <>
                        {activeAssignment.status === "active" && (
                          <>
                            <button
                              type="button"
                              className="primary-button toolbar-btn assignment-btn-success"
                              onClick={() => handleTechnicianResponse("accepted")}
                              disabled={assignmentSubmitting}
                            >
                              <UserCheck size={14} />
                              Aceptar asignación
                            </button>
                            <button
                              type="button"
                              className="secondary-button toolbar-btn assignment-btn-danger"
                              onClick={() => handleTechnicianResponse("declined")}
                              disabled={assignmentSubmitting}
                            >
                              <X size={14} />
                              Rechazar
                            </button>
                          </>
                        )}
                        {activeAssignment.status === "accepted" && (
                          <button
                            type="button"
                            className="primary-button toolbar-btn assignment-btn-success"
                            onClick={() => handleTechnicianResponse("completed")}
                            disabled={assignmentSubmitting}
                          >
                            <CheckCircle2 size={14} />
                            Marcar asignación completada
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Gestión de estado y prioridad */}
                {canUpdateTickets && (
                  <div className="detail-section">
                    <div className="detail-section-header">
                      <div>
                        <h4>Gestión de estado y prioridad</h4>
                        <p>
                          Actualiza el ciclo de vida del ticket en la base de datos
                        </p>
                      </div>
                    </div>

                    <form
                      className="nested-form-card"
                      onSubmit={handleStatusPriorityUpdate}
                    >
                      {statusUpdateError && (
                        <div
                          className="auth-alert auth-alert-error"
                          role="alert"
                        >
                          <AlertTriangle size={15} />
                          <div>{statusUpdateError}</div>
                        </div>
                      )}

                      <div className="module-form-grid">
                        <div className="form-field">
                          <label htmlFor="update-ticket-status">Estado</label>
                          <select
                            id="update-ticket-status"
                            value={nextStatus}
                            onChange={(e) =>
                              setNextStatus(e.target.value as TicketStatus)
                            }
                            disabled={statusUpdating}
                          >
                            <option value="new">Nuevo</option>
                            <option value="open">Abierto</option>
                            <option value="in_progress">En atención</option>
                            <option value="waiting_client">
                              Esperando cliente
                            </option>
                            <option value="waiting_third_party">
                              Esperando tercero
                            </option>
                            <option value="resolved">Resuelto</option>
                            <option value="closed">Cerrado</option>
                            <option value="cancelled">Cancelado</option>
                          </select>
                        </div>

                        <div className="form-field">
                          <label htmlFor="update-ticket-priority">
                            Prioridad
                          </label>
                          <select
                            id="update-ticket-priority"
                            value={nextPriority}
                            onChange={(e) =>
                              setNextPriority(e.target.value as TicketPriority)
                            }
                            disabled={statusUpdating}
                          >
                            <option value="low">Baja</option>
                            <option value="normal">Normal</option>
                            <option value="high">Alta</option>
                            <option value="urgent">Urgente</option>
                          </select>
                        </div>

                        <div className="form-field form-field-full">
                          <label htmlFor="transition-reason">
                            Motivo del cambio de estado (opcional)
                          </label>
                          <input
                            id="transition-reason"
                            type="text"
                            maxLength={200}
                            value={transitionReason}
                            onChange={(e) =>
                              setTransitionReason(e.target.value)
                            }
                            placeholder="Ej. Diagnóstico confirmado; esperando confirmación del cliente..."
                            disabled={statusUpdating}
                          />
                        </div>
                      </div>

                      <div className="form-actions-row">
                        <button
                          type="submit"
                          className="primary-button"
                          disabled={
                            statusUpdating ||
                            (nextStatus === selectedTicket.status &&
                              nextPriority === selectedTicket.priority)
                          }
                        >
                          {statusUpdating ? (
                            <>
                              <Loader2 size={14} className="auth-spinner" />
                              Guardando...
                            </>
                          ) : (
                            "Actualizar estado"
                          )}
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {/* Pestañas de detalle: Comunicación, Línea Temporal, Asignaciones */}
                <div className="detail-tabs-bar" role="tablist">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === "comments"}
                    className={`detail-tab-btn ${activeTab === "comments" ? "active" : ""}`}
                    onClick={() => setActiveTab("comments")}
                  >
                    <MessageSquare size={14} />
                    Comunicación y notas
                    <span className="detail-tab-count">{comments.length}</span>
                  </button>

                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === "timeline"}
                    className={`detail-tab-btn ${activeTab === "timeline" ? "active" : ""}`}
                    onClick={() => setActiveTab("timeline")}
                  >
                    <History size={14} />
                    Línea temporal integrada
                    <span className="detail-tab-count">{unifiedTimeline.length}</span>
                  </button>

                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === "assignments"}
                    className={`detail-tab-btn ${activeTab === "assignments" ? "active" : ""}`}
                    onClick={() => setActiveTab("assignments")}
                  >
                    <UserCheck size={14} />
                    Historial de asignaciones
                    <span className="detail-tab-count">{assignments.length}</span>
                  </button>
                </div>

                {detailLoading ? (
                  <div className="inline-loading">
                    <Loader2 size={16} className="auth-spinner" />
                    <span>Cargando datos de la solicitud...</span>
                  </div>
                ) : detailError ? (
                  <div className="auth-alert auth-alert-error" role="alert">
                    <AlertTriangle size={15} />
                    <div>{detailError}</div>
                  </div>
                ) : (
                  <>
                    {/* PESTAÑA 1: COMUNICACIÓN Y NOTAS */}
                    {activeTab === "comments" && (
                      <div className="detail-section" style={{ borderTop: 0, paddingTop: 10 }}>
                        {/* Editor de nuevo comentario */}
                        {canComment && (
                          <form
                            className="comment-editor-card"
                            onSubmit={handleAddCommentSubmit}
                          >
                            <div className="comment-visibility-selector">
                              {!isExternalTechnician ? (
                                <>
                                  <button
                                    type="button"
                                    className={`visibility-pill ${
                                      commentVisibility === "internal" ? "selected-internal" : ""
                                    }`}
                                    onClick={() => setCommentVisibility("internal")}
                                  >
                                    <Lock size={12} />
                                    Nota interna privada
                                  </button>
                                  <button
                                    type="button"
                                    className={`visibility-pill ${
                                      commentVisibility === "client" ? "selected-client" : ""
                                    }`}
                                    onClick={() => setCommentVisibility("client")}
                                  >
                                    <Mail size={12} />
                                    Mensaje visible a cliente
                                  </button>
                                </>
                              ) : (
                                <span className="comment-hint">
                                  <Mail size={12} />
                                  Los técnicos externos emiten mensajes visibles al cliente.
                                </span>
                              )}
                            </div>

                            <textarea
                              className="comment-textarea"
                              rows={3}
                              required
                              value={commentBody}
                              onChange={(e) => setCommentBody(e.target.value)}
                              placeholder={
                                commentVisibility === "internal"
                                  ? "Escribe una nota interna para el equipo técnico (no visible al cliente)..."
                                  : "Escribe una actualización o respuesta que será visible al cliente..."
                              }
                              disabled={commentSubmitting}
                            />

                            {commentError && (
                              <div className="auth-alert auth-alert-error" role="alert">
                                <AlertTriangle size={14} />
                                <div>{commentError}</div>
                              </div>
                            )}

                            <div className="comment-editor-footer">
                              <span className="comment-hint">
                                {commentVisibility === "internal" ? (
                                  <>
                                    <Lock size={12} /> Solo accesible por el personal autorizado de la organización.
                                  </>
                                ) : (
                                  <>
                                    <Mail size={12} /> Visible para el cliente asociado en su portal.
                                  </>
                                )}
                              </span>

                              <button
                                type="submit"
                                className="primary-button"
                                disabled={commentSubmitting || !commentBody.trim()}
                              >
                                {commentSubmitting ? (
                                  <>
                                    <Loader2 size={13} className="auth-spinner" />
                                    Enviando...
                                  </>
                                ) : (
                                  <>
                                    <Send size={13} />
                                    {commentVisibility === "internal" ? "Guardar nota" : "Enviar mensaje"}
                                  </>
                                )}
                              </button>
                            </div>
                          </form>
                        )}

                        {/* Listado de comentarios */}
                        {comments.length === 0 ? (
                          <div className="empty-state-box empty-state-compact">
                            <MessageSquare size={20} />
                            <strong>Sin comentarios registrados</strong>
                            <p>
                              Añade la primera nota interna o actualización para el cliente.
                            </p>
                          </div>
                        ) : (
                          <div className="comments-feed">
                            {comments.map((comm) => (
                              <div
                                key={comm.id}
                                className={`comment-card ${
                                  comm.visibility === "internal"
                                    ? "internal-comment"
                                    : "client-comment"
                                }`}
                              >
                                <div className="comment-card-top">
                                  <div className="comment-author-group">
                                    <div className="comment-author-avatar">
                                      {getInitials(comm.authorDisplayName)}
                                    </div>
                                    <div>
                                      <span className="comment-author-name">
                                        {comm.authorDisplayName}
                                        {comm.isCurrentUser ? " (Tú)" : ""}
                                      </span>{" "}
                                      <span className="comment-author-role">
                                        · {comm.authorRole}
                                      </span>
                                    </div>
                                  </div>

                                  <div className="inline-icon-text">
                                    <span
                                      className={`comment-badge ${comm.visibility}`}
                                    >
                                      {comm.visibility === "internal" ? (
                                        <>
                                          <Lock size={10} /> Nota interna
                                        </>
                                      ) : (
                                        <>
                                          <Mail size={10} /> Visible a cliente
                                        </>
                                      )}
                                    </span>
                                    <span className="comment-date">
                                      {formatDateTime(comm.created_at)}
                                    </span>
                                  </div>
                                </div>

                                <p className="comment-body-text">{comm.body}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* PESTAÑA 2: LÍNEA TEMPORAL INTEGRADA */}
                    {activeTab === "timeline" && (
                      <div className="detail-section" style={{ borderTop: 0, paddingTop: 10 }}>
                        <div className="timeline-container">
                          {unifiedTimeline.map((item) => (
                            <div className="timeline-event-item" key={item.id}>
                              <div
                                className={`timeline-event-marker marker-${item.badgeVariant ?? item.type}`}
                              >
                                {item.type === "ticket_created" && <Ticket size={11} />}
                                {item.type === "transition" && <CornerDownRight size={11} />}
                                {item.type === "assignment" && <UserCheck size={11} />}
                                {item.type === "comment" && <MessageSquare size={11} />}
                              </div>

                              <div className="timeline-event-content">
                                <div className="timeline-event-header">
                                  <div className="timeline-event-title-group">
                                    <span className="timeline-event-title">{item.title}</span>
                                    {item.badgeText && (
                                      <span className="ticket-code-pill">
                                        {item.badgeText}
                                      </span>
                                    )}
                                  </div>
                                  <span className="timeline-event-date">
                                    {formatDateTime(item.timestamp)}
                                  </span>
                                </div>

                                {item.actorName && (
                                  <span className="timeline-event-author">
                                    Por: {item.actorName}
                                  </span>
                                )}

                                {item.description && (
                                  <p className="timeline-event-desc">{item.description}</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* PESTAÑA 3: HISTORIAL DE ASIGNACIONES */}
                    {activeTab === "assignments" && (
                      <div className="detail-section" style={{ borderTop: 0, paddingTop: 10 }}>
                        {assignments.length === 0 ? (
                          <div className="empty-state-box empty-state-compact">
                            <UserCheck size={20} />
                            <strong>Sin historial de asignaciones</strong>
                            <p>El ticket no ha tenido técnicos asignados aún.</p>
                          </div>
                        ) : (
                          <div className="sub-entity-list">
                            {assignments.map((assign) => (
                              <div className="sub-entity-card" key={assign.id}>
                                <div>
                                  <div className="sub-entity-title">
                                    <strong>
                                      {assign.memberDisplayName ?? "Técnico"}
                                    </strong>
                                    <span
                                      className={`status status-badge-${
                                        assign.status === "completed" || assign.status === "accepted"
                                          ? "resolved"
                                          : assign.status === "cancelled" || assign.status === "declined"
                                            ? "cancelled"
                                            : "in_progress"
                                      }`}
                                    >
                                      {TICKET_ASSIGNMENT_STATUS_LABELS[assign.status]}
                                    </span>
                                  </div>
                                  <span>
                                    {assign.memberRole ?? "Técnico"} · Asignado por:{" "}
                                    {assign.assignedByName} · {formatDateTime(assign.assigned_at)}
                                    {assign.responded_at && (
                                      <> · Respuesta: {formatDateTime(assign.responded_at)}</>
                                    )}
                                    {assign.completed_at && (
                                      <> · Cierre: {formatDateTime(assign.completed_at)}</>
                                    )}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

export default TicketsView;
