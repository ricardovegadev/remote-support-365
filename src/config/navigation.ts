import {
  Bot,
  ChartNoAxesCombined,
  LayoutDashboard,
  Monitor,
  Settings,
  ShieldCheck,
  Ticket,
  Users,
  Workflow,
} from "lucide-react";

import type { NavigationGroup } from "../types/navigation";

/**
 * Configuración centralizada de navegación.
 *
 * Los identificadores son estables.
 * Las etiquetas son textos de presentación.
 */
export const navigation: NavigationGroup[] = [
  {
    title: "GENERAL",
    items: [
      {
        id: "dashboard",
        label: "Dashboard",
        icon: LayoutDashboard,
      },
      {
        id: "tickets",
        label: "Solicitudes y tickets",
        icon: Ticket,
      },
      {
        id: "clients",
        label: "Clientes y dispositivos",
        icon: Users,
      },
      {
        id: "remote-sessions",
        label: "Sesiones remotas",
        icon: Monitor,
      },
    ],
  },
  {
    title: "OPERACIONES",
    items: [
      {
        id: "workforce",
        label: "Workforce & Dispatch",
        icon: Workflow,
      },
      {
        id: "ai-workforce",
        label: "AI Workforce",
        icon: Bot,
        badge: "AI",
      },
      {
        id: "analytics",
        label: "Informes y analítica",
        icon: ChartNoAxesCombined,
      },
    ],
  },
  {
    title: "ADMINISTRACIÓN",
    items: [
      {
        id: "security",
        label: "Seguridad y auditoría",
        icon: ShieldCheck,
      },
      {
        id: "settings",
        label: "Configuración",
        icon: Settings,
      },
    ],
  },
];
