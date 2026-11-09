import {
  Activity,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  Headset,
  Monitor,
  ShieldCheck,
  Ticket,
  Users,
  Workflow,
} from "lucide-react";

import {
  dashboardMetrics,
  dashboardRequests,
} from "./dashboard.data";

import type { PageId } from "../../types/navigation";

interface DashboardViewProps {
  search: string;
  onNavigate: (page: PageId) => void;
}

function DashboardView({
  search,
  onNavigate,
}: DashboardViewProps) {
  const filteredRequests = dashboardRequests.filter((request) =>
    `${request.id} ${request.client} ${request.issue}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  return (
    <>
      <section className="welcome-banner">
        <div className="welcome-content">
          <span className="welcome-label">REMOTE SUPPORT 365</span>
          <h2>
            Tu operación de soporte,
            <br />
            bajo control.
          </h2>
          <p>
            Un espacio unificado para atender clientes, coordinar técnicos y
            gestionar sesiones remotas.
          </p>
          <button
            className="welcome-button"
            onClick={() => onNavigate("tickets")}
          >
            Explorar solicitudes <ArrowUpRight size={16} />
          </button>
        </div>

        <div className="welcome-graphic">
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

        <div className="banner-glow" />
      </section>

      <section className="metrics-grid">
        {dashboardMetrics.map((metric) => {
          const Icon = metric.icon;

          return (
            <article className="metric-card" key={metric.label}>
              <div className={`metric-icon ${metric.color}`}>
                <Icon size={20} />
              </div>
              <span className="metric-label">{metric.label}</span>
              <strong className="metric-value">{metric.value}</strong>
              <span className="metric-detail">{metric.detail}</span>
            </article>
          );
        })}
      </section>

      <section className="dashboard-grid">
        <article className="panel requests-panel">
          <div className="panel-heading">
            <div>
              <h3>Solicitudes recientes</h3>
              <p>Seguimiento de actividad de soporte</p>
            </div>

            <button
              className="text-button"
              onClick={() => onNavigate("tickets")}
            >
              Ver todas <ArrowUpRight size={15} />
            </button>
          </div>

          <div className="request-list">
            {filteredRequests.map((request) => (
              <div className="request-row" key={request.id}>
                <div className={`client-avatar ${request.color}`}>
                  {request.initials}
                </div>

                <div className="request-info">
                  <strong>{request.client}</strong>
                  <span>
                    {request.id} · {request.issue}
                  </span>
                </div>

                <span
                  className={`priority priority-${request.priority.toLowerCase()}`}
                >
                  {request.priority}
                </span>

                <span
                  className={`status ${
                    request.status === "Pendiente"
                      ? "status-pending"
                      : "status-active"
                  }`}
                >
                  {request.status}
                </span>
              </div>
            ))}
          </div>

          <div className="demo-note">
            Datos de demostración · No corresponden a clientes reales.
          </div>
        </article>

        <article className="panel operations-panel">
          <div className="panel-heading">
            <div>
              <h3>Centro de operaciones</h3>
              <p>Capacidades de la plataforma</p>
            </div>
            <Activity size={19} className="muted-icon" />
          </div>

          <div className="operation-item">
            <div className="operation-icon blue">
              <Workflow size={19} />
            </div>
            <div>
              <strong>Workforce & Dispatch</strong>
              <span>Disponibilidad y asignación de técnicos</span>
            </div>
            <ArrowUpRight size={16} />
          </div>

          <div className="operation-item">
            <div className="operation-icon purple">
              <Bot size={19} />
            </div>
            <div>
              <strong>AI Workforce 365</strong>
              <span>Asistencia y automatización inteligente</span>
            </div>
            <span className="planned-tag">PREVISTO</span>
          </div>

          <div className="operation-item">
            <div className="operation-icon green">
              <ShieldCheck size={19} />
            </div>
            <div>
              <strong>Seguridad y auditoría</strong>
              <span>Control de acceso y trazabilidad</span>
            </div>
            <span className="planned-tag">PREVISTO</span>
          </div>
        </article>
      </section>

      <section className="bottom-grid">
        <article className="panel quick-panel">
          <div className="panel-heading">
            <div>
              <h3>Accesos rápidos</h3>
              <p>Atajos para tareas frecuentes</p>
            </div>
          </div>

          <div className="quick-actions">
            <button onClick={() => onNavigate("tickets")}>
              <Ticket size={19} />
              <span>Nueva solicitud</span>
              <ArrowUpRight size={15} />
            </button>

            <button onClick={() => onNavigate("clients")}>
              <Users size={19} />
              <span>Administrar clientes</span>
              <ArrowUpRight size={15} />
            </button>

            <button onClick={() => onNavigate("remote-sessions")}>
              <Monitor size={19} />
              <span>Sesiones remotas</span>
              <ArrowUpRight size={15} />
            </button>
          </div>
        </article>

        <article className="panel status-panel">
          <div className="panel-heading">
            <div>
              <h3>Estado de la plataforma</h3>
              <p>Entorno de interfaz inicial</p>
            </div>
            <CheckCircle2 size={19} className="success-icon" />
          </div>

          <div className="platform-status">
            <span className="status-indicator" />
            <div>
              <strong>Interfaz disponible</strong>
              <span>Frontend ejecutándose en modo desarrollo</span>
            </div>
          </div>

          <div className="status-footnote">
            Backend, autenticación e integraciones pendientes de configuración.
          </div>
        </article>
      </section>
    </>
  );
}

export default DashboardView;
