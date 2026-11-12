import { useCallback, useState } from "react";
import {
  AlertTriangle,
  Building2,
  Headset,
  Loader2,
  Plus,
  RefreshCw,
} from "lucide-react";

import "./App.css";

import Sidebar from "./components/layout/Sidebar";
import Topbar from "./components/layout/Topbar";
import Footer from "./components/layout/Footer";
import PlaceholderPanel from "./components/ui/PlaceholderPanel";

import DashboardView from "./modules/dashboard/DashboardView";
import ClientsView from "./modules/clients/ClientsView";
import TicketsView from "./modules/tickets/TicketsView";
import RemoteSessionsView from "./modules/remote-sessions/RemoteSessionsView";
import WorkforceView from "./modules/workforce/WorkforceView";
import { useAuth } from "./modules/auth/AuthContext";
import LoginView from "./modules/auth/LoginView";

import { navigation } from "./config/navigation";

import { ORGANIZATION_ROLE_LABELS } from "./types/database";
import type { PageId } from "./types/navigation";

function App() {
  const {
    session,
    user,
    profile,
    memberships,
    activeOrganization,
    activeRole,
    loading,
    contextLoading,
    contextError,
    selectOrganization,
    refreshUserContext,
    signOut,
  } = useAuth();
  const [activePage, setActivePage] = useState<PageId>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [search, setSearch] = useState("");

  // Estado de navegación cruzada hacia el módulo de tickets
  const [ticketIntentVersion, setTicketIntentVersion] = useState<number>(0);
  const [ticketInitialSelectedId, setTicketInitialSelectedId] = useState<
    string | null
  >(null);
  const [ticketInitialClientId, setTicketInitialClientId] = useState<
    string | null
  >(null);
  const [ticketOpenCreateOnMount, setTicketOpenCreateOnMount] =
    useState<boolean>(false);

  // Estado de navegación cruzada hacia el módulo de sesiones remotas y dispositivos
  const [remoteIntentVersion, setRemoteIntentVersion] = useState<number>(0);
  const [remoteInitialDeviceId, setRemoteInitialDeviceId] = useState<
    string | null
  >(null);
  const [remoteInitialTicketId, setRemoteInitialTicketId] = useState<
    string | null
  >(null);
  const [remoteInitialClientId, setRemoteInitialClientId] = useState<
    string | null
  >(null);
  const [remoteOpenCreateOnMount, setRemoteOpenCreateOnMount] =
    useState<boolean>(false);

  const handleNavigate = useCallback((page: PageId) => {
    setTicketInitialSelectedId(null);
    setTicketInitialClientId(null);
    setTicketOpenCreateOnMount(false);
    setRemoteInitialDeviceId(null);
    setRemoteInitialTicketId(null);
    setRemoteInitialClientId(null);
    setRemoteOpenCreateOnMount(false);
    setActivePage(page);
  }, []);

  const handleOpenNewTicket = useCallback(() => {
    setTicketInitialSelectedId(null);
    setTicketInitialClientId(null);
    setTicketOpenCreateOnMount(true);
    setTicketIntentVersion((v) => v + 1);
    setActivePage("tickets");
  }, []);

  const handleSelectTicketFromDashboard = useCallback((ticketId: string) => {
    setTicketOpenCreateOnMount(false);
    setTicketInitialClientId(null);
    setTicketInitialSelectedId(ticketId);
    setTicketIntentVersion((v) => v + 1);
    setActivePage("tickets");
  }, []);

  const handleCreateTicketForClient = useCallback((clientId: string) => {
    setTicketInitialSelectedId(null);
    setTicketInitialClientId(clientId);
    setTicketOpenCreateOnMount(true);
    setTicketIntentVersion((v) => v + 1);
    setActivePage("tickets");
  }, []);

  const handleNavigateToRemoteSessions = useCallback(
    (params?: {
      clientId?: string;
      deviceId?: string;
      ticketId?: string;
      openCreate?: boolean;
    }) => {
      setRemoteInitialClientId(params?.clientId ?? null);
      setRemoteInitialDeviceId(params?.deviceId ?? null);
      setRemoteInitialTicketId(params?.ticketId ?? null);
      setRemoteOpenCreateOnMount(params?.openCreate ?? false);
      setRemoteIntentVersion((v) => v + 1);
      setActivePage("remote-sessions");
    },
    [],
  );

  const handleNavigateToTicketFromRemote = useCallback((ticketId: string) => {
    setTicketOpenCreateOnMount(false);
    setTicketInitialClientId(null);
    setTicketInitialSelectedId(ticketId);
    setTicketIntentVersion((v) => v + 1);
    setActivePage("tickets");
  }, []);

  const handleNavigateToClientFromRemote = useCallback(() => {
    setActivePage("clients");
  }, []);

  if (loading) {
    return (
      <div className="auth-loading-screen" role="status" aria-live="polite">
        <div className="auth-loading-card panel">
          <div className="brand-symbol">
            <Headset size={23} />
          </div>
          <Loader2 size={22} className="auth-spinner auth-loading-spinner" />
          <strong>Verificando sesión...</strong>
          <span>Preparando el entorno seguro de Remote Support 365</span>
        </div>
      </div>
    );
  }

  if (!session) {
    return <LoginView />;
  }

  const activeItem = navigation
    .flatMap((group) => group.items)
    .find((item) => item.id === activePage);

  const activeLabel = activeItem?.label ?? "Dashboard";
  const isDashboard = activePage === "dashboard";
  const hasValidActiveOrganization =
    !contextLoading && !contextError && activeOrganization !== null;

  return (
    <div className="app-shell">
      <Sidebar
        activePage={activePage}
        isOpen={sidebarOpen}
        onNavigate={handleNavigate}
        onClose={() => setSidebarOpen(false)}
        userDisplayName={profile?.display_name}
        userEmail={user?.email}
        activeOrganizationId={activeOrganization?.id}
        activeOrganizationName={activeOrganization?.name}
        activeRole={activeRole}
        memberships={memberships}
        contextLoading={contextLoading}
        onSelectOrganization={selectOrganization}
        onSignOut={signOut}
      />

      <main className="main-area">
        <Topbar
          activePage={activePage}
          searchValue={search}
          onSearchChange={setSearch}
          onOpenSidebar={() => setSidebarOpen(true)}
          userDisplayName={profile?.display_name}
          userEmail={user?.email}
          activeOrganizationName={activeOrganization?.name}
          activeRole={activeRole}
          contextLoading={contextLoading}
          onSignOut={signOut}
        />

        <div className="content">
          {contextLoading ? (
            <section
              className="panel placeholder-panel context-state-panel"
              role="status"
              aria-live="polite"
            >
              <div className="placeholder-icon">
                <Loader2 size={26} className="auth-spinner" />
              </div>
              <h2>Cargando espacio de trabajo...</h2>
              <p>
                Recuperando tu perfil y las membresías organizacionales activas
                desde el servidor.
              </p>
            </section>
          ) : contextError ? (
            <section
              className="panel placeholder-panel context-state-panel"
              role="alert"
            >
              <div className="placeholder-icon context-error-icon">
                <AlertTriangle size={26} />
              </div>
              <h2>Error al cargar el contexto organizacional</h2>
              <p>{contextError}</p>
              <button
                type="button"
                className="primary-button context-action-button"
                onClick={() => {
                  void refreshUserContext();
                }}
              >
                <RefreshCw size={16} />
                Reintentar carga
              </button>
            </section>
          ) : memberships.length === 0 ? (
            <section className="panel placeholder-panel context-state-panel">
              <div className="placeholder-icon">
                <Building2 size={26} />
              </div>
              <h2>Cuenta sin organización activa</h2>
              <p>
                Tu cuenta autenticada no dispone actualmente de una membresía
                activa en ninguna organización habilitada. Solicita acceso al
                administrador de tu organización.
              </p>
            </section>
          ) : !hasValidActiveOrganization ? (
            <section className="panel placeholder-panel context-state-panel">
              <div className="placeholder-icon">
                <Building2 size={26} />
              </div>
              <h2>Selecciona una organización</h2>
              <p>
                Tu cuenta tiene acceso a múltiples organizaciones activas.
                Selecciona el espacio de trabajo con el que deseas operar:
              </p>
              <div className="org-selection-list">
                {memberships.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className="org-selection-card"
                    onClick={() => selectOrganization(item.organization_id)}
                  >
                    <div>
                      <strong>{item.organization.name}</strong>
                      <span>{ORGANIZATION_ROLE_LABELS[item.role]}</span>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    <span className="live-dot" />
                    PLATAFORMA DE SOPORTE PROFESIONAL
                  </div>

                  <h1>
                    {isDashboard ? "Centro de operaciones" : activeLabel}
                  </h1>

                  <p>
                    {isDashboard
                      ? "Supervisa las operaciones y administra tu servicio de soporte remoto."
                      : activePage === "clients"
                        ? "Gestiona los clientes, contactos y dispositivos asociados a tu organización."
                        : activePage === "tickets"
                          ? "Mesa de ayuda operativa, seguimiento de estados, prioridades y asignaciones."
                          : activePage === "remote-sessions"
                            ? "Inventario de dispositivos, solicitudes de asistencia y control de sesiones atendidas con RustDesk."
                            : activePage === "workforce"
                              ? "Gestión de técnicos internos, colaboradores externos, especialidades, disponibilidad y despacho de tickets."
                              : `Área de gestión de ${activeLabel.toLowerCase()}.`}
                  </p>
                </div>

                <button
                  type="button"
                  className="primary-button"
                  onClick={handleOpenNewTicket}
                >
                  <Plus size={18} />
                  Nueva solicitud
                </button>
              </div>

              {isDashboard ? (
                <DashboardView
                  key={activeOrganization.id}
                  search={search}
                  onNavigate={handleNavigate}
                  onOpenNewTicket={handleOpenNewTicket}
                  onSelectTicket={handleSelectTicketFromDashboard}
                />
              ) : activePage === "clients" ? (
                <ClientsView
                  key={activeOrganization.id}
                  globalSearch={search}
                  onCreateTicketForClient={handleCreateTicketForClient}
                  onNavigateToRemoteSessions={handleNavigateToRemoteSessions}
                />
              ) : activePage === "tickets" ? (
                <TicketsView
                  key={`${activeOrganization.id}-${ticketIntentVersion}`}
                  globalSearch={search}
                  initialSelectedTicketId={ticketInitialSelectedId}
                  initialCreateClientId={ticketInitialClientId}
                  openCreateOnMount={ticketOpenCreateOnMount}
                  onNavigateToClients={() => handleNavigate("clients")}
                  onNavigateToRemoteSessions={handleNavigateToRemoteSessions}
                />
              ) : activePage === "remote-sessions" ? (
                <RemoteSessionsView
                  key={`${activeOrganization.id}-${remoteIntentVersion}`}
                  globalSearch={search}
                  targetTicketId={remoteInitialTicketId}
                  targetDeviceId={remoteInitialDeviceId}
                  targetClientId={remoteInitialClientId}
                  openCreateRequestOnMount={remoteOpenCreateOnMount}
                  onNavigateToTicket={handleNavigateToTicketFromRemote}
                  onNavigateToClient={handleNavigateToClientFromRemote}
                />
              ) : activePage === "workforce" ? (
                <WorkforceView
                  key={activeOrganization.id}
                  globalSearch={search}
                  onNavigateToTicket={handleNavigateToTicketFromRemote}
                  onNavigateToClient={handleNavigateToClientFromRemote}
                />
              ) : (
                <PlaceholderPanel
                  title={activeLabel}
                  onBack={() => handleNavigate("dashboard")}
                />
              )}
            </>
          )}

          <Footer />
        </div>
      </main>
    </div>
  );
}

export default App;
