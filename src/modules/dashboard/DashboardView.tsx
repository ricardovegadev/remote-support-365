import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  FolderCheck,
  Headset,
  Inbox,
  Loader2,
  Monitor,
  Plus,
  RefreshCw,
  ShieldCheck,
  Ticket,
  Users,
  Workflow,
} from "lucide-react";

import { supabase } from "../../lib/supabase";
import { useAuth } from "../auth/AuthContext";
import {
  ORGANIZATION_ROLE_LABELS,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  formatDatabaseError,
  type ClientRow,
  type TicketRow,
  type TicketTransitionRow,
} from "../../types/database";
import type { PageId } from "../../types/navigation";

interface DashboardViewProps {
  search: string;
  onNavigate: (page: PageId) => void;
  onOpenNewTicket?: () => void;
  onSelectTicket?: (ticketId: string) => void;
}

interface DashboardSnapshot {
  totalClients: number;
  activeClients: number;
  openTickets: number;
  pendingTickets: number;
  inProgressTickets: number;
  closedTickets: number;
  recentTickets: Array<TicketRow & { clientName: string }>;
  recentTransitions: Array<
    TicketTransitionRow & { ticketSubject: string; ticketDisplayId: string }
  >;
}

function getInitials(value: string): string {
  const cleaned = value.trim();
  if (!cleaned) {
    return "CL";
  }
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return cleaned.slice(0, 2).toUpperCase();
}

function formatTicketCode(ticket: TicketRow): string {
  if (ticket.ticket_number !== null && ticket.ticket_number !== undefined) {
    return `#${ticket.ticket_number}`;
  }
  return `#${ticket.id.slice(0, 8).toUpperCase()}`;
}

function formatShortDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function DashboardView({
  search,
  onNavigate,
  onOpenNewTicket,
  onSelectTicket,
}: DashboardViewProps) {
  const { activeOrganization, activeRole } = useAuth();
  const organizationId = activeOrganization?.id ?? null;

  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const requestIdRef = useRef<number>(0);

  const loadDashboardData = useCallback(async (targetOrgId: string | null) => {
    const requestId = ++requestIdRef.current;
    await Promise.resolve();
    if (requestIdRef.current !== requestId) {
      return;
    }

    const client = supabase;
    if (!client || !targetOrgId) {
      setSnapshot(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [clientsRes, ticketsRes, transitionsRes] = await Promise.all([
        client
          .from("clients")
          .select("id, organization_id, name, status")
          .eq("organization_id", targetOrgId),
        client
          .from("tickets")
          .select(
            "id, organization_id, client_id, device_id, ticket_number, subject, description, priority, status, source, created_by, resolved_at, closed_at, archived_at, created_at, updated_at",
          )
          .eq("organization_id", targetOrgId)
          .order("created_at", { ascending: false }),
        client
          .from("ticket_transitions")
          .select(
            "id, organization_id, ticket_id, previous_status, new_status, changed_by, reason, created_at",
          )
          .eq("organization_id", targetOrgId)
          .order("created_at", { ascending: false })
          .limit(6),
      ]);

      // Protección frente a respuestas asíncronas obsoletas al cambiar de organización
      if (requestIdRef.current !== requestId) {
        return;
      }

      if (clientsRes.error) {
        throw clientsRes.error;
      }
      if (ticketsRes.error) {
        throw ticketsRes.error;
      }
      if (transitionsRes.error) {
        throw transitionsRes.error;
      }

      const clients = (clientsRes.data ?? []) as Array<
        Pick<ClientRow, "id" | "organization_id" | "name" | "status">
      >;
      const tickets = (ticketsRes.data ?? []) as TicketRow[];
      const transitions = (transitionsRes.data ?? []) as TicketTransitionRow[];

      const clientMap = new Map<string, string>(
        clients.map((c) => [c.id, c.name]),
      );
      const ticketMap = new Map<string, TicketRow>(
        tickets.map((t) => [t.id, t]),
      );

      const totalClients = clients.filter((c) => c.status !== "archived").length;
      const activeClients = clients.filter((c) => c.status === "active").length;

      let openTickets = 0;
      let pendingTickets = 0;
      let inProgressTickets = 0;
      let closedTickets = 0;

      for (const t of tickets) {
        if (t.status === "new" || t.status === "open") {
          openTickets += 1;
        } else if (
          t.status === "waiting_client" ||
          t.status === "waiting_third_party"
        ) {
          pendingTickets += 1;
        } else if (t.status === "in_progress") {
          inProgressTickets += 1;
        } else if (t.status === "resolved" || t.status === "closed") {
          closedTickets += 1;
        }
      }

      const recentTickets = tickets.slice(0, 8).map((t) => ({
        ...t,
        clientName: clientMap.get(t.client_id) ?? "Cliente registrado",
      }));

      const recentTransitions = transitions.map((tr) => {
        const relatedTicket = ticketMap.get(tr.ticket_id);
        return {
          ...tr,
          ticketSubject: relatedTicket?.subject ?? "Solicitud de soporte",
          ticketDisplayId: relatedTicket
            ? formatTicketCode(relatedTicket)
            : `#${tr.ticket_id.slice(0, 8).toUpperCase()}`,
        };
      });

      setSnapshot({
        totalClients,
        activeClients,
        openTickets,
        pendingTickets,
        inProgressTickets,
        closedTickets,
        recentTickets,
        recentTransitions,
      });
    } catch (err) {
      if (requestIdRef.current !== requestId) {
        return;
      }
      setSnapshot(null);
      setError(
        formatDatabaseError(
          err,
          "No fue posible consultar los indicadores operativos de la organización activa.",
        ),
      );
    } finally {
      if (requestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => loadDashboardData(organizationId));
    return () => {
      requestIdRef.current += 1;
    };
  }, [organizationId, loadDashboardData]);

  const filteredRecentTickets = useMemo(() => {
    if (!snapshot) {
      return [];
    }
    const query = search.trim().toLowerCase();
    if (!query) {
      return snapshot.recentTickets;
    }
    return snapshot.recentTickets.filter((ticket) => {
      const code = formatTicketCode(ticket).toLowerCase();
      return (
        code.includes(query) ||
        ticket.subject.toLowerCase().includes(query) ||
        ticket.clientName.toLowerCase().includes(query) ||
        TICKET_STATUS_LABELS[ticket.status].toLowerCase().includes(query) ||
        TICKET_PRIORITY_LABELS[ticket.priority].toLowerCase().includes(query)
      );
    });
  }, [snapshot, search]);

  const metrics = useMemo(
    () => [
      {
        id: "clients",
        label: "Total de clientes",
        value: snapshot ? String(snapshot.totalClients) : "0",
        detail: snapshot
          ? `${snapshot.activeClients} activos en la organización`
          : "Sin registros",
        icon: Users,
        color: "blue",
        targetPage: "clients" as PageId,
      },
      {
        id: "open",
        label: "Tickets abiertos",
        value: snapshot ? String(snapshot.openTickets) : "0",
        detail: "Nuevos y abiertos sin iniciar",
        icon: Ticket,
        color: "blue",
        targetPage: "tickets" as PageId,
      },
      {
        id: "pending",
        label: "Tickets pendientes",
        value: snapshot ? String(snapshot.pendingTickets) : "0",
        detail: "En espera de cliente o tercero",
        icon: Clock3,
        color: "orange",
        targetPage: "tickets" as PageId,
      },
      {
        id: "in_progress",
        label: "Tickets en atención",
        value: snapshot ? String(snapshot.inProgressTickets) : "0",
        detail: "Intervención técnica activa",
        icon: Activity,
        color: "purple",
        targetPage: "tickets" as PageId,
      },
      {
        id: "closed",
        label: "Tickets cerrados",
        value: snapshot ? String(snapshot.closedTickets) : "0",
        detail: "Resueltos y finalizados",
        icon: FolderCheck,
        color: "green",
        targetPage: "tickets" as PageId,
      },
    ],
    [snapshot],
  );

  return (
    <>
      <section className="welcome-banner">
        <div className="welcome-content">
          <span className="welcome-label">
            {activeOrganization?.name.toUpperCase() ?? "REMOTE SUPPORT 365"}
          </span>
          <h2>
            Tu operación de soporte,
            <br />
            bajo control.
          </h2>
          <p>
            Indicadores conectados en tiempo real a los datos de tu organización
            activa bajo aislamiento Row Level Security (RLS).
          </p>
          <div className="welcome-actions">
            <button
              type="button"
              className="welcome-button"
              onClick={() => onNavigate("tickets")}
            >
              Explorar solicitudes <ArrowUpRight size={16} />
            </button>
            <button
              type="button"
              className="welcome-button"
              onClick={() => onNavigate("clients")}
            >
              Directorio de clientes <Users size={15} />
            </button>
          </div>
        </div>

        <div className="welcome-graphic" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="graphic-core">
            <Headset size={42} />
          </div>
          <div className="floating-icon floating-one">
            <Monitor size={21} />
          </div>
          <div className="floating-icon floating-two">
            <ShieldCheck size={21} />
          </div>
          <div className="floating-icon floating-three">
            <Activity size={21} />
          </div>
        </div>

        <div className="banner-glow" aria-hidden="true" />
      </section>

      {loading ? (
        <section
          className="panel module-state-panel"
          role="status"
          aria-live="polite"
        >
          <Loader2 size={24} className="auth-spinner module-state-spinner" />
          <strong>Consultando indicadores de {activeOrganization?.name}...</strong>
          <span>
            Verificando clientes, tickets y actividad reciente de la
            organización activa.
          </span>
        </section>
      ) : error ? (
        <section className="panel module-state-panel" role="alert">
          <div className="placeholder-icon context-error-icon">
            <AlertTriangle size={24} />
          </div>
          <strong>Error al cargar el panel operativo</strong>
          <span>{error}</span>
          <button
            type="button"
            className="primary-button context-action-button"
            onClick={() => {
              void loadDashboardData(organizationId);
            }}
          >
            <RefreshCw size={15} />
            Reintentar consulta
          </button>
        </section>
      ) : (
        <>
          <section
            className="metrics-grid metrics-grid-five"
            aria-label="Indicadores operativos"
          >
            {metrics.map((metric) => {
              const Icon = metric.icon;

              return (
                <button
                  type="button"
                  className="metric-card metric-card-interactive"
                  key={metric.id}
                  onClick={() => onNavigate(metric.targetPage)}
                >
                  <div className="metric-card-top">
                    <div className={`metric-icon ${metric.color}`}>
                      <Icon size={20} />
                    </div>
                    <ArrowUpRight size={15} className="metric-card-arrow" />
                  </div>
                  <span className="metric-label">{metric.label}</span>
                  <strong className="metric-value">{metric.value}</strong>
                  <span className="metric-detail">{metric.detail}</span>
                </button>
              );
            })}
          </section>

          <section className="dashboard-grid">
            <article className="panel requests-panel">
              <div className="panel-heading">
                <div>
                  <h3>Solicitudes recientes</h3>
                  <p>
                    Últimos tickets registrados en{" "}
                    {activeOrganization?.name ?? "la organización"}
                  </p>
                </div>

                <div className="panel-heading-actions">
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      void loadDashboardData(organizationId);
                    }}
                    title="Actualizar indicadores"
                  >
                    <RefreshCw size={13} />
                    Actualizar
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => onNavigate("tickets")}
                  >
                    Ver todas <ArrowUpRight size={15} />
                  </button>
                </div>
              </div>

              {snapshot && snapshot.recentTickets.length === 0 ? (
                <div className="empty-state-box">
                  <div className="empty-state-icon">
                    <Inbox size={22} />
                  </div>
                  <strong>Sin solicitudes registradas</strong>
                  <p>
                    Esta organización aún no tiene tickets de soporte. Registra
                    primero un cliente o crea la primera solicitud operativa.
                  </p>
                  <div className="empty-state-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => onNavigate("clients")}
                    >
                      <Users size={15} />
                      Gestionar clientes
                    </button>
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => {
                        if (onOpenNewTicket) {
                          onOpenNewTicket();
                        } else {
                          onNavigate("tickets");
                        }
                      }}
                    >
                      <Plus size={15} />
                      Nueva solicitud
                    </button>
                  </div>
                </div>
              ) : filteredRecentTickets.length === 0 ? (
                <div className="empty-state-box">
                  <strong>Sin coincidencias para "{search}"</strong>
                  <p>
                    No se encontraron solicitudes recientes que coincidan con el
                    criterio de búsqueda.
                  </p>
                </div>
              ) : (
                <div className="request-list">
                  {filteredRecentTickets.map((ticket) => (
                    <button
                      type="button"
                      className="request-row request-row-button"
                      key={ticket.id}
                      onClick={() => {
                        if (onSelectTicket) {
                          onSelectTicket(ticket.id);
                        } else {
                          onNavigate("tickets");
                        }
                      }}
                    >
                      <div className="client-avatar blue">
                        {getInitials(ticket.clientName)}
                      </div>

                      <div className="request-info">
                        <strong>{ticket.subject}</strong>
                        <span>
                          {formatTicketCode(ticket)} · {ticket.clientName} ·{" "}
                          {formatShortDate(ticket.created_at)}
                        </span>
                      </div>

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
                    </button>
                  ))}
                </div>
              )}
            </article>

            <article className="panel operations-panel">
              <div className="panel-heading">
                <div>
                  <h3>Actividad reciente</h3>
                  <p>Transiciones de estado y seguimiento</p>
                </div>
                <Activity size={19} className="muted-icon" />
              </div>

              {snapshot && snapshot.recentTransitions.length > 0 ? (
                <div className="activity-feed">
                  {snapshot.recentTransitions.map((tr) => (
                    <div className="operation-item" key={tr.id}>
                      <div className="operation-icon blue">
                        <Workflow size={17} />
                      </div>
                      <div>
                        <strong>
                          {tr.ticketDisplayId} · {tr.ticketSubject}
                        </strong>
                        <span>
                          {tr.previous_status
                            ? `${TICKET_STATUS_LABELS[tr.previous_status]} → `
                            : ""}
                          <strong>{TICKET_STATUS_LABELS[tr.new_status]}</strong>
                          {" · "}
                          {formatShortDate(tr.created_at)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state-box empty-state-compact">
                  <strong>Sin transiciones recientes</strong>
                  <p>
                    Los cambios de estado de los tickets aparecerán aquí a
                    medida que avance la atención técnica.
                  </p>
                </div>
              )}
            </article>
          </section>
        </>
      )}

      <section className="bottom-grid">
        <article className="panel quick-panel">
          <div className="panel-heading">
            <div>
              <h3>Accesos rápidos</h3>
              <p>Operaciones frecuentes del núcleo de soporte</p>
            </div>
          </div>

          <div className="quick-actions">
            <button
              type="button"
              onClick={() => {
                if (onOpenNewTicket) {
                  onOpenNewTicket();
                } else {
                  onNavigate("tickets");
                }
              }}
            >
              <Ticket size={19} />
              <span>Nueva solicitud</span>
              <ArrowUpRight size={15} />
            </button>

            <button type="button" onClick={() => onNavigate("clients")}>
              <Users size={19} />
              <span>Administrar clientes</span>
              <ArrowUpRight size={15} />
            </button>

            <button type="button" onClick={() => onNavigate("remote-sessions")}>
              <Monitor size={19} />
              <span>Sesiones remotas</span>
              <ArrowUpRight size={15} />
            </button>
          </div>
        </article>

        <article className="panel status-panel">
          <div className="panel-heading">
            <div>
              <h3>Contexto de seguridad activo</h3>
              <p>Aislamiento multiempresa verificado</p>
            </div>
            <CheckCircle2 size={19} className="success-icon" />
          </div>

          <div className="platform-status">
            <span className="status-indicator" />
            <div>
              <strong>{activeOrganization?.name ?? "Organización"}</strong>
              <span>
                Rol activo:{" "}
                {activeRole
                  ? ORGANIZATION_ROLE_LABELS[activeRole]
                  : "Miembro autenticado"}
              </span>
            </div>
          </div>

          <div className="status-footnote">
            Consultas ejecutadas con sesión autenticada y alcance restringido a{" "}
            <code>organization_id</code>.
          </div>
        </article>
      </section>
    </>
  );
}

export default DashboardView;
