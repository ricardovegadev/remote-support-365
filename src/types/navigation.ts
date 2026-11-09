import type { LucideIcon } from "lucide-react";

/**
 * Identificadores internos estables de las secciones.
 * No dependen de las etiquetas visibles ni del idioma.
 */
export type PageId =
  | "dashboard"
  | "tickets"
  | "clients"
  | "remote-sessions"
  | "workforce"
  | "ai-workforce"
  | "analytics"
  | "security"
  | "settings";

/**
 * Elemento individual del menú de navegación.
 */
export interface NavigationItem {
  id: PageId;
  label: string;
  icon: LucideIcon;
  count?: string;
  badge?: string;
}

/**
 * Grupo visual del menú lateral.
 */
export interface NavigationGroup {
  title: string;
  items: NavigationItem[];
}
