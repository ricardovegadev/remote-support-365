
import { useState } from "react";
import {
  Activity,
  ArrowUpRight,
  Bell,
  Bot,
  ChartNoAxesCombined,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Clock3,
  Headset,
  LayoutDashboard,
  Menu,
  Monitor,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Ticket,
  Users,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import "./App.css";

const navigation = [
  { title: "GENERAL", items: [
    { label: "Dashboard", icon: LayoutDashboard },
    { label: "Solicitudes y tickets", icon: Ticket, count: "8" },
    { label: "Clientes y dispositivos", icon: Users },
    { label: "Sesiones remotas", icon: Monitor },
  ]},
  { title: "OPERACIONES", items: [
    { label: "Workforce & Dispatch", icon: Workflow },
    { label: "AI Workforce", icon: Bot, badge: "AI" },
    { label: "Informes y analítica", icon: ChartNoAxesCombined },
  ]},
  { title: "ADMINISTRACIÓN", items: [
    { label: "Seguridad y auditoría", icon: ShieldCheck },
    { label: "Configuración", icon: Settings },
  ]},
];

const metrics = [
  { label: "Solicitudes abiertas", value: "24", detail: "Requieren seguimiento", icon: Ticket, color: "blue" },
  { label: "Técnicos disponibles", value: "08", detail: "Listos para atender", icon: Users, color: "green" },
  { label: "Sesiones activas", value: "03", detail: "Conexiones en curso", icon: Monitor, color: "purple" },
  { label: "Tiempo de respuesta", value: "4.2 min", detail: "Indicador demostrativo", icon: Clock3, color: "orange" },
];

const requests = [
  { id: "RS-1024", client: "Empresa demostrativa A", issue: "Problema de conectividad", priority: "Alta", status: "Pendiente", initials: "EA", color: "blue" },
  { id: "RS-1023", client: "Empresa demostrativa B", issue: "Configuración de equipo", priority: "Media", status: "En atención", initials: "EB", color: "purple" },
  { id: "RS-1022", client: "Cliente demostrativo C", issue: "Error de aplicación", priority: "Baja", status: "Pendiente", initials: "CC", color: "orange" },
];

function App() {
  const [activePage, setActivePage] = useState("Dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [search, setSearch] = useState("");

  const isDashboard = activePage === "Dashboard";

  return (
    <div className="app-shell">
      {sidebarOpen && (
        <button
          className="mobile-overlay"
          aria-label="Cerrar navegación"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-symbol"><Headset size={23} /></div>
          <div className="brand-copy">
            <strong>REMOTE SUPPORT</strong>
            <span>365 · PROFESSIONAL</span>
          </div>
          <button className="icon-button sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Cerrar menú">
            <X size={19} />
          </button>
        </div>

        <div className="workspace-switcher">
          <div className="workspace-avatar">RS</div>
          <div className="workspace-copy">
            <strong>Mi organización</strong>
            <span>Espacio de trabajo</span>
          </div>
          <ChevronDown size={16} />
        </div>

        <nav className="navigation">
          {navigation.map((group) => (
            <div className="nav-group" key={group.title}>
              <span className="nav-heading">{group.title}</span>
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.label}
                    className={`nav-item ${activePage === item.label ? "active" : ""}`}
                    onClick={() => {
                      setActivePage(item.label);
                      setSidebarOpen(false);
                    }}
                  >
                    <Icon size={18} />
                    <span>{item.label}</span>
                    {item.count && <span className="nav-count">{item.count}</span>}
                    {item.badge && <span className="ai-badge">{item.badge}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="plan-card">
            <div className="plan-icon"><Zap size={17} /></div>
            <strong>Centro de operaciones</strong>
            <p>Gestiona soporte, equipos y automatizaciones desde un solo lugar.</p>
          </div>
          <button className="profile">
            <div className="profile-avatar">AD</div>
            <div className="profile-copy">
              <strong>Administrador</strong>
              <span>Cuenta de demostración</span>
            </div>
            <ChevronDown size={16} />
          </button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button menu-button" onClick={() => setSidebarOpen(true)} aria-label="Abrir menú">
              <Menu size={21} />
            </button>
            <div className="breadcrumb">Workspace <span>/</span> <strong>{activePage}</strong></div>
          </div>
          <div className="topbar-actions">
            <label className="search-box">
              <Search size={17} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar..." />
              <kbd>⌘ K</kbd>
            </label>
            <button className="icon-button notification-button" aria-label="Notificaciones">
              <Bell size={19} />
              <i />
            </button>
            <div className="topbar-avatar">AD</div>
          </div>
        </header>

        <div className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow"><span className="live-dot" /> PLATAFORMA DE SOPORTE PROFESIONAL</div>
              <h1>{isDashboard ? "Centro de operaciones" : activePage}</h1>
              <p>
                {isDashboard
                  ? "Supervisa las operaciones y administra tu servicio de soporte remoto."
                  : `Área de gestión de ${activePage.toLowerCase()}.`}
              </p>
            </div>
            <button className="primary-button" onClick={() => setActivePage("Solicitudes y tickets")}>
              <Plus size={18} /> Nueva solicitud
            </button>
          </div>

          {isDashboard ? (
            <>
              <section className="welcome-banner">
                <div className="welcome-content">
                  <span className="welcome-label">REMOTE SUPPORT 365</span>
                  <h2>Tu operación de soporte,<br />bajo control.</h2>
                  <p>Un espacio unificado para atender clientes, coordinar técnicos y gestionar sesiones remotas.</p>
                  <button className="welcome-button" onClick={() => setActivePage("Solicitudes y tickets")}>
                    Explorar solicitudes <ArrowUpRight size={16} />
                  </button>
                </div>
                <div className="welcome-graphic">
                  <div className="orbit orbit-one" />
                  <div className="orbit orbit-two" />
                  <div className="graphic-core"><Headset size={42} /></div>
                  <div className="floating-icon floating-one"><Monitor size={21} /></div>
                  <div className="floating-icon floating-two"><ShieldCheck size={21} /></div>
                  <div className="floating-icon floating-three"><Activity size={21} /></div>
                </div>
                <div className="banner-glow" />
              </section>

              <section className="metrics-grid">
                {metrics.map((metric) => {
                  const Icon = metric.icon;
                  return (
                    <article className="metric-card" key={metric.label}>
                      <div className={`metric-icon ${metric.color}`}><Icon size={20} /></div>
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
                    <button className="text-button" onClick={() => setActivePage("Solicitudes y tickets")}>
                      Ver todas <ArrowUpRight size={15} />
                    </button>
                  </div>
                  <div className="request-list">
                    {requests
                      .filter((request) => `${request.id} ${request.client} ${request.issue}`.toLowerCase().includes(search.toLowerCase()))
                      .map((request) => (
                        <div className="request-row" key={request.id}>
                          <div className={`client-avatar ${request.color}`}>{request.initials}</div>
                          <div className="request-info">
                            <strong>{request.client}</strong>
                            <span>{request.id} · {request.issue}</span>
                          </div>
                          <span className={`priority priority-${request.priority.toLowerCase()}`}>{request.priority}</span>
                          <span className={`status ${request.status === "Pendiente" ? "status-pending" : "status-active"}`}>
                            {request.status}
                          </span>
                        </div>
                      ))}
                  </div>
                  <div className="demo-note">Datos de demostración · No corresponden a clientes reales.</div>
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
                    <div className="operation-icon blue"><Workflow size={19} /></div>
                    <div><strong>Workforce & Dispatch</strong><span>Disponibilidad y asignación de técnicos</span></div>
                    <ArrowUpRight size={16} />
                  </div>
                  <div className="operation-item">
                    <div className="operation-icon purple"><Bot size={19} /></div>
                    <div><strong>AI Workforce 365</strong><span>Asistencia y automatización inteligente</span></div>
                    <span className="planned-tag">PREVISTO</span>
                  </div>
                  <div className="operation-item">
                    <div className="operation-icon green"><ShieldCheck size={19} /></div>
                    <div><strong>Seguridad y auditoría</strong><span>Control de acceso y trazabilidad</span></div>
                    <span className="planned-tag">PREVISTO</span>
                  </div>
                </article>
              </section>

              <section className="bottom-grid">
                <article className="panel quick-panel">
                  <div className="panel-heading">
                    <div><h3>Accesos rápidos</h3><p>Atajos para tareas frecuentes</p></div>
                  </div>
                  <div className="quick-actions">
                    <button onClick={() => setActivePage("Solicitudes y tickets")}><Ticket size={19} /><span>Nueva solicitud</span><ArrowUpRight size={15} /></button>
                    <button onClick={() => setActivePage("Clientes y dispositivos")}><Users size={19} /><span>Administrar clientes</span><ArrowUpRight size={15} /></button>
                    <button onClick={() => setActivePage("Sesiones remotas")}><Monitor size={19} /><span>Sesiones remotas</span><ArrowUpRight size={15} /></button>
                  </div>
                </article>
                <article className="panel status-panel">
                  <div className="panel-heading">
                    <div><h3>Estado de la plataforma</h3><p>Entorno de interfaz inicial</p></div>
                    <CheckCircle2 size={19} className="success-icon" />
                  </div>
                  <div className="platform-status">
                    <span className="status-indicator" />
                    <div><strong>Interfaz disponible</strong><span>Frontend ejecutándose en modo desarrollo</span></div>
                  </div>
                  <div className="status-footnote">Backend, autenticación e integraciones pendientes de configuración.</div>
                </article>
              </section>
            </>
          ) : (
            <section className="panel placeholder-panel">
              <div className="placeholder-icon"><CircleHelp size={30} /></div>
              <h2>{activePage}</h2>
              <p>Esta sección forma parte de la arquitectura de Remote Support 365. Su funcionalidad se implementará en las siguientes etapas.</p>
              <button className="secondary-button" onClick={() => setActivePage("Dashboard")}>Volver al Dashboard</button>
            </section>
          )}

          <footer className="footer">
            <span>© 2026 Remote Support 365</span>
            <span>Plataforma en construcción · Versión 1 inicial</span>
          </footer>
        </div>
      </main>
    </div>
  );
}

export default App;
