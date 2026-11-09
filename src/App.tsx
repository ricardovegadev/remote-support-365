import { useState } from "react";
import { Plus } from "lucide-react";

import "./App.css";

import Sidebar from "./components/layout/Sidebar";
import Topbar from "./components/layout/Topbar";
import Footer from "./components/layout/Footer";
import PlaceholderPanel from "./components/ui/PlaceholderPanel";

import DashboardView from "./modules/dashboard/DashboardView";

import { navigation } from "./config/navigation";

import type { PageId } from "./types/navigation";

function App() {
  const [activePage, setActivePage] = useState<PageId>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [search, setSearch] = useState("");

  const activeItem = navigation
    .flatMap((group) => group.items)
    .find((item) => item.id === activePage);

  const activeLabel = activeItem?.label ?? "Dashboard";
  const isDashboard = activePage === "dashboard";

  return (
    <div className="app-shell">
      <Sidebar
        activePage={activePage}
        isOpen={sidebarOpen}
        onNavigate={setActivePage}
        onClose={() => setSidebarOpen(false)}
      />

      <main className="main-area">
        <Topbar
          activePage={activePage}
          searchValue={search}
          onSearchChange={setSearch}
          onOpenSidebar={() => setSidebarOpen(true)}
        />

        <div className="content">
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
                  : `Área de gestión de ${activeLabel.toLowerCase()}.`}
              </p>
            </div>

            <button
              className="primary-button"
              onClick={() => setActivePage("tickets")}
            >
              <Plus size={18} />
              Nueva solicitud
            </button>
          </div>

          {isDashboard ? (
            <DashboardView
              search={search}
              onNavigate={setActivePage}
            />
          ) : (
            <PlaceholderPanel
              title={activeLabel}
              onBack={() => setActivePage("dashboard")}
            />
          )}

          <Footer />
        </div>
      </main>
    </div>
  );
}

export default App;
