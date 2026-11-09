import {
  ChevronDown,
  Headset,
  X,
  Zap,
} from "lucide-react";
import { navigation } from "../../config/navigation";
import type { PageId } from "../../types/navigation";

interface SidebarProps {
  activePage: PageId;
  isOpen: boolean;
  onNavigate: (page: PageId) => void;
  onClose: () => void;
}

function Sidebar({
  activePage,
  isOpen,
  onNavigate,
  onClose,
}: SidebarProps) {
  return (
    <>
      {isOpen && (
        <button
          className="mobile-overlay"
          aria-label="Cerrar navegación"
          onClick={onClose}
        />
      )}

      <aside className={`sidebar ${isOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-symbol">
            <Headset size={23} />
          </div>

          <div className="brand-copy">
            <strong>REMOTE SUPPORT</strong>
            <span>365 · PROFESSIONAL</span>
          </div>

          <button
            className="icon-button sidebar-close"
            onClick={onClose}
            aria-label="Cerrar menú"
          >
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
                    key={item.id}
                    className={`nav-item ${
                      activePage === item.id ? "active" : ""
                    }`}
                    onClick={() => {
                      onNavigate(item.id);
                      onClose();
                    }}
                  >
                    <Icon size={18} />
                    <span>{item.label}</span>

                    {item.count && (
                      <span className="nav-count">{item.count}</span>
                    )}

                    {item.badge && (
                      <span className="ai-badge">{item.badge}</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="plan-card">
            <div className="plan-icon">
              <Zap size={17} />
            </div>

            <strong>Centro de operaciones</strong>

            <p>
              Gestiona soporte, equipos y automatizaciones desde un solo lugar.
            </p>
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
    </>
  );
}

export default Sidebar;
