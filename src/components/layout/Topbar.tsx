import {
  Bell,
  Menu,
  Search,
} from "lucide-react";
import { navigation } from "../../config/navigation";
import type { PageId } from "../../types/navigation";

interface TopbarProps {
  activePage: PageId;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onOpenSidebar: () => void;
}

function Topbar({
  activePage,
  searchValue,
  onSearchChange,
  onOpenSidebar,
}: TopbarProps) {
  const activeItem = navigation
    .flatMap((group) => group.items)
    .find((item) => item.id === activePage);

  const activeLabel = activeItem?.label ?? "Dashboard";

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
          Workspace <span>/</span> <strong>{activeLabel}</strong>
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

        <button
          className="icon-button notification-button"
          aria-label="Notificaciones"
        >
          <Bell size={19} />
          <i />
        </button>

        <div className="topbar-avatar">AD</div>
      </div>
    </header>
  );
}

export default Topbar;
