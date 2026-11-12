import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  ChevronDown,
  Headset,
  LogOut,
  X,
  Zap,
} from "lucide-react";
import { navigation } from "../../config/navigation";
import {
  ORGANIZATION_ROLE_LABELS,
  type OrganizationRole,
  type UserOrganizationMembership,
} from "../../types/database";
import type { PageId } from "../../types/navigation";

interface SidebarProps {
  activePage: PageId;
  isOpen: boolean;
  onNavigate: (page: PageId) => void;
  onClose: () => void;
  userDisplayName?: string | null;
  userEmail?: string | null;
  activeOrganizationId?: string | null;
  activeOrganizationName?: string | null;
  activeRole?: OrganizationRole | null;
  memberships?: UserOrganizationMembership[];
  contextLoading?: boolean;
  onSelectOrganization?: (organizationId: string) => void;
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

function Sidebar({
  activePage,
  isOpen,
  onNavigate,
  onClose,
  userDisplayName,
  userEmail,
  activeOrganizationId,
  activeOrganizationName,
  activeRole,
  memberships = [],
  contextLoading = false,
  onSelectOrganization,
  onSignOut,
}: SidebarProps) {
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerButtonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const hasMultipleOrganizations = memberships.length > 1;
  const hasNoOrganizations = !contextLoading && memberships.length === 0;

  const workspaceTitle = contextLoading
    ? "Cargando organización..."
    : activeOrganizationName
      ? activeOrganizationName
      : hasMultipleOrganizations
        ? "Seleccionar organización"
        : hasNoOrganizations
          ? "Sin organización activa"
          : "Organización no asignada";

  const workspaceSubtitle = contextLoading
    ? "Verificando membresías"
    : activeRole
      ? ORGANIZATION_ROLE_LABELS[activeRole]
      : hasMultipleOrganizations
        ? `${memberships.length} organizaciones disponibles`
        : "Sin membresía activa";

  const workspaceInitials = getInitials(activeOrganizationName, "RS");

  const resolvedUserName = contextLoading
    ? "Cargando perfil..."
    : userDisplayName?.trim() || userEmail?.trim() || "Usuario autenticado";

  const resolvedUserSubtitle = contextLoading
    ? "Verificando acceso"
    : activeRole
      ? ORGANIZATION_ROLE_LABELS[activeRole]
      : userDisplayName?.trim() && userEmail?.trim()
        ? userEmail.trim()
        : "Sin rol asignado";

  const userInitials = getInitials(
    userDisplayName || userEmail,
    "US",
  );

  const closeSwitcher = useCallback((restoreFocus = true) => {
    setSwitcherOpen(false);
    if (restoreFocus) {
      triggerButtonRef.current?.focus();
    }
  }, []);

  const handleSelect = useCallback(
    (organizationId: string) => {
      onSelectOrganization?.(organizationId);
      closeSwitcher(true);
    },
    [onSelectOrganization, closeSwitcher],
  );

  useEffect(() => {
    if (!switcherOpen) {
      return;
    }

    const selectedIdx = memberships.findIndex(
      (item) => item.organization_id === activeOrganizationId,
    );
    const initialIndex = selectedIdx >= 0 ? selectedIdx : 0;
    const initialElement = itemRefs.current[initialIndex];
    if (initialElement) {
      initialElement.focus();
    }

    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        closeSwitcher(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [switcherOpen, memberships, activeOrganizationId, closeSwitcher]);

  const handleTriggerKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
  ) => {
    if (!hasMultipleOrganizations) {
      return;
    }
    if (
      event.key === "ArrowDown" ||
      event.key === "ArrowUp" ||
      event.key === "Enter" ||
      event.key === " "
    ) {
      if (!switcherOpen) {
        event.preventDefault();
        setSwitcherOpen(true);
      }
    }
  };

  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const total = memberships.length;
    if (total === 0) {
      return;
    }

    const activeIndex = itemRefs.current.findIndex(
      (el) => el === document.activeElement,
    );

    if (event.key === "Escape") {
      event.preventDefault();
      closeSwitcher(true);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      const nextIndex = activeIndex >= 0 ? (activeIndex + 1) % total : 0;
      itemRefs.current[nextIndex]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      const prevIndex =
        activeIndex >= 0 ? (activeIndex - 1 + total) % total : total - 1;
      itemRefs.current[prevIndex]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      itemRefs.current[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      itemRefs.current[total - 1]?.focus();
    } else if (event.key === "Tab") {
      closeSwitcher(false);
    }
  };

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

        <div
          ref={containerRef}
          className="workspace-switcher-container"
          onKeyDown={switcherOpen ? handleMenuKeyDown : undefined}
        >
          <button
            ref={triggerButtonRef}
            id="workspace-switcher-button"
            type="button"
            className="workspace-switcher"
            onClick={() => {
              if (hasMultipleOrganizations) {
                setSwitcherOpen((prev) => !prev);
              }
            }}
            onKeyDown={handleTriggerKeyDown}
            disabled={!hasMultipleOrganizations}
            aria-haspopup={hasMultipleOrganizations ? "menu" : undefined}
            aria-expanded={hasMultipleOrganizations ? switcherOpen : undefined}
            aria-controls={
              hasMultipleOrganizations && switcherOpen
                ? "workspace-switcher-menu"
                : undefined
            }
          >
            <div className="workspace-avatar">{workspaceInitials}</div>

            <div className="workspace-copy">
              <strong>{workspaceTitle}</strong>
              <span>{workspaceSubtitle}</span>
            </div>

            {hasMultipleOrganizations && <ChevronDown size={16} />}
          </button>

          {hasMultipleOrganizations && switcherOpen && (
            <div
              id="workspace-switcher-menu"
              className="workspace-dropdown"
              role="menu"
              aria-labelledby="workspace-switcher-button"
              aria-label="Seleccionar organización activa"
            >
              {memberships.map((item, index) => {
                const isSelected =
                  item.organization_id === activeOrganizationId;
                return (
                  <button
                    ref={(element) => {
                      itemRefs.current[index] = element;
                    }}
                    type="button"
                    role="menuitem"
                    key={item.id}
                    className={`workspace-option ${isSelected ? "active" : ""}`}
                    onClick={() => handleSelect(item.organization_id)}
                  >
                    <strong>{item.organization.name}</strong>
                    <span>{ORGANIZATION_ROLE_LABELS[item.role]}</span>
                  </button>
                );
              })}
            </div>
          )}
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

          <div className="profile">
            <div className="profile-avatar">{userInitials}</div>

            <div className="profile-copy">
              <strong>{resolvedUserName}</strong>
              <span>{resolvedUserSubtitle}</span>
            </div>

            {onSignOut && (
              <button
                type="button"
                className="icon-button sidebar-signout-button"
                onClick={() => {
                  void onSignOut();
                }}
                aria-label="Cerrar sesión"
                title="Cerrar sesión"
              >
                <LogOut size={16} />
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

export default Sidebar;
