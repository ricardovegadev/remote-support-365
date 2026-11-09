import {
  Clock3,
  Monitor,
  Ticket,
  Users,
} from "lucide-react";

import type {
  DashboardMetricItem,
  DashboardRequestItem,
} from "../../types/support";

/**
 * Datos heredados del Dashboard original.
 *
 * Se conservan exactamente los valores actuales.
 * Son datos de demostración, no registros reales.
 *
 * No representan el futuro modelo de Supabase.
 */
export const dashboardMetrics: DashboardMetricItem[] = [
  {
    label: "Solicitudes abiertas",
    value: "24",
    detail: "Requieren seguimiento",
    icon: Ticket,
    color: "blue",
  },
  {
    label: "Técnicos disponibles",
    value: "08",
    detail: "Listos para atender",
    icon: Users,
    color: "green",
  },
  {
    label: "Sesiones activas",
    value: "03",
    detail: "Conexiones en curso",
    icon: Monitor,
    color: "purple",
  },
  {
    label: "Tiempo de respuesta",
    value: "4.2 min",
    detail: "Indicador demostrativo",
    icon: Clock3,
    color: "orange",
  },
];

/**
 * Solicitudes de demostración heredadas
 * del Dashboard original.
 *
 * No agregar, eliminar ni modificar registros.
 */
export const dashboardRequests: DashboardRequestItem[] = [
  {
    id: "RS-1024",
    client: "Empresa demostrativa A",
    issue: "Problema de conectividad",
    priority: "Alta",
    status: "Pendiente",
    initials: "EA",
    color: "blue",
  },
  {
    id: "RS-1023",
    client: "Empresa demostrativa B",
    issue: "Configuración de equipo",
    priority: "Media",
    status: "En atención",
    initials: "EB",
    color: "purple",
  },
  {
    id: "RS-1022",
    client: "Cliente demostrativo C",
    issue: "Error de aplicación",
    priority: "Baja",
    status: "Pendiente",
    initials: "CC",
    color: "orange",
  },
];
