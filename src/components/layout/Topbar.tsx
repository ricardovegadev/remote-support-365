import {
  Bell,
  LogOut,
  Menu,
  Search,
} from "lucide-react";
import { navigation } from "../../config/navigation";
import {
  ORGANIZATION_ROLE_LABELS,
  type OrganizationRole,
} from "../../types/database";
import type { PageId } from "../../types/navigation";

interface TopbarProps {
  activePage: PageId;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onOpenSidebar: () => void;
  userDisplayName?: string | null;
  userEmail?: string | null;
  activeOrganizationName?: string | null;
  activeRole?: OrganizationRole | null;
  contextLoading?: boolean;
  onSignOut?: () => void | Promise<unknown>;
}

function getInitials(value: string | null | undefined, fallback: string): string {
  const cleaned = value?.trim();
  if (!cleaned) {
    return fallback;
  }
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return cleaned.slice(0, 2).toUpperCase();
}

function Topbar({
  activePage,
  searchValue,
  onSearchChange,
  onOpenSidebar,
  userDisplayName,
  userEmail,
  activeOrganizationName,
  activeRole,
  contextLoading = false,
  onSignOut,
}: TopbarProps) {
  const activeItem = navigation
    .flatMap((group) => group.items)
    .find((item) => item.id === activePage);

  const activeLabel = activeItem?.label ?? "Dashboard";

  const workspaceBreadcrumb = contextLoading
    ? "Cargando..."
    : activeOrganizationName?.trim() || "Sin organización activa";

  const resolvedUserLabel =
    userDisplayName?.trim() || userEmail?.trim() || "Usuario autenticado";

  const roleBadgeLabel = activeRole ? ORGANIZATION_ROLE_LABELS[activeRole] : null;
  const userInitials = getInitials(userDisplayName || userEmail, "US");

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button
          className="icon-button menu-button"
          onClick={onOpenSidebar}
          aria-label="Abrir menú"
        >
          <Menu size={21} />
        </button>

        <div className="breadcrumb">
          {workspaceBreadcrumb} <span>/</span> <strong>{activeLabel}</strong>
        </div>
      </div>

      <div className="topbar-actions">
        <label className="search-box">
          <Search size={17} />

          <input
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Buscar..."
          />

          <kbd>⌘ K</kbd>
        </label>

        {roleBadgeLabel && (
          <span className="topbar-role-badge" title={`Rol: ${roleBadgeLabel}`}>
            {roleBadgeLabel}
          </span>
        )}

        <button
          className="icon-button notification-button"
          aria-label="Notificaciones"
        >
          <Bell size={19} />
          <i />
        </button>

        <div className="topbar-avatar" title={resolvedUserLabel}>
          {userInitials}
        </div>

        {onSignOut && (
          <button
            type="button"
            className="icon-button topbar-signout-button"
            onClick={() => {
              void onSignOut();
            }}
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
          >
            <LogOut size={18} />
          </button>
        )}
      </div>
    </header>
  );
}

export default Topbar;
