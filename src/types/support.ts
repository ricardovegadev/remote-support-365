import type { LucideIcon } from "lucide-react";

/**
 * Valores de prioridad utilizados actualmente
 * por la presentación del Dashboard.
 *
 * No constituyen todavía el modelo definitivo
 * de dominio Ticket.
 */
export type TicketPriority = "Alta" | "Media" | "Baja";

/**
 * Estados utilizados actualmente en la interfaz.
 * El ciclo de vida definitivo se definirá
 * durante el diseño del backend.
 */
export type TicketStatus = "Pendiente" | "En atención";

/**
 * Variantes visuales de los indicadores.
 */
export type MetricColor = "blue" | "green" | "purple" | "orange";

/**
 * Variantes visuales de los avatares.
 */
export type RequestAvatarColor = "blue" | "purple" | "orange";

/**
 * Contrato de presentación de un indicador.
 * No representa una entidad persistente.
 */
export interface DashboardMetricItem {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  color: MetricColor;
}

/**
 * Contrato de presentación de una solicitud.
 * No sustituye al futuro modelo de dominio Ticket.
 */
export interface DashboardRequestItem {
  id: string;
  client: string;
  issue: string;
  priority: TicketPriority;
  status: TicketStatus;
  initials: string;
  color: RequestAvatarColor;
}
