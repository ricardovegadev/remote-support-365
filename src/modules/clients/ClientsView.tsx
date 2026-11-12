import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Edit3,
  Inbox,
  Loader2,
  Mail,
  Monitor,
  Phone,
  Play,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Star,
  Ticket,
  UserPlus,
  Users,
  X,
} from "lucide-react";

import { supabase } from "../../lib/supabase";
import { useAuth } from "../auth/AuthContext";
import {
  CLIENT_STATUS_LABELS,
  ORGANIZATION_ROLE_LABELS,
  formatDatabaseError,
  type ClientContactRow,
  type ClientRow,
  type ClientStatus,
  type DeviceRow,
} from "../../types/database";

interface ClientsViewProps {
  globalSearch: string;
  onCreateTicketForClient?: (clientId: string) => void;
  onNavigateToRemoteSessions?: (params: {
    clientId?: string;
    deviceId?: string;
    openCreate?: boolean;
  }) => void;
}

type StatusFilter = "all" | ClientStatus;

interface ClientFormState {
  name: string;
  email: string;
  phone: string;
  status: ClientStatus;
}

interface ContactFormState {
  name: string;
  position: string;
  email: string;
  phone: string;
  is_primary: boolean;
}

const INITIAL_CLIENT_FORM: ClientFormState = {
  name: "",
  email: "",
  phone: "",
  status: "active",
};

const INITIAL_CONTACT_FORM: ContactFormState = {
  name: "",
  position: "",
  email: "",
  phone: "",
  is_primary: false,
};

function isValidEmail(value: string): boolean {
  if (!value.trim()) {
    return true;
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function formatDateTime(iso: string | null): string {
  if (!iso) {
    return "—";
  }
  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function getInitials(value: string): string {
  const cleaned = value.trim();
  if (!cleaned) {
    return "CL";
  }
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return cleaned.slice(0, 2).toUpperCase();
}

function ClientsView({
  globalSearch,
  onCreateTicketForClient,
  onNavigateToRemoteSessions,
}: ClientsViewProps) {
  const { activeOrganization, activeRole } = useAuth();
  const organizationId = activeOrganization?.id ?? null;

  const canManageClients =
    activeRole === "owner" ||
    activeRole === "admin" ||
    activeRole === "dispatcher";

  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [localSearch, setLocalSearch] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  // Detalle secundario del cliente seleccionado (contactos y dispositivos)
  const [contacts, setContacts] = useState<ClientContactRow[]>([]);
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Modal / Formulario de Cliente (Crear / Editar)
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [clientForm, setClientForm] =
    useState<ClientFormState>(INITIAL_CLIENT_FORM);
  const [formSubmitting, setFormSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);

  // Formulario de Contacto
  const [showContactForm, setShowContactForm] = useState<boolean>(false);
  const [contactForm, setContactForm] =
    useState<ContactFormState>(INITIAL_CONTACT_FORM);
  const [contactSubmitting, setContactSubmitting] = useState<boolean>(false);
  const [contactError, setContactError] = useState<string | null>(null);

  const listRequestIdRef = useRef<number>(0);
  const detailRequestIdRef = useRef<number>(0);

  const loadClients = useCallback(
    async (targetOrgId: string | null, keepSelectedId?: string | null) => {
      const requestId = ++listRequestIdRef.current;
      await Promise.resolve();
      if (listRequestIdRef.current !== requestId) {
        return;
      }

      const client = supabase;
      if (!client || !targetOrgId) {
        setClients([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const { data, error: queryError } = await client
          .from("clients")
          .select(
            "id, organization_id, name, email, phone, status, created_at, updated_at, archived_at",
          )
          .eq("organization_id", targetOrgId)
          .order("name", { ascending: true });

        if (listRequestIdRef.current !== requestId) {
          return;
        }

        if (queryError) {
          throw queryError;
        }

        const rows = (data ?? []) as ClientRow[];
        setClients(rows);

        setSelectedClientId((prev) => {
          const candidate = keepSelectedId !== undefined ? keepSelectedId : prev;
          if (candidate && rows.some((r) => r.id === candidate)) {
            return candidate;
          }
          return rows[0]?.id ?? null;
        });
      } catch (err) {
        if (listRequestIdRef.current !== requestId) {
          return;
        }
        setClients([]);
        setError(
          formatDatabaseError(
            err,
            "No fue posible cargar el directorio de clientes de la organización.",
          ),
        );
      } finally {
        if (listRequestIdRef.current === requestId) {
          setLoading(false);
        }
      }
    },
    [],
  );

  const loadClientDetails = useCallback(
    async (targetOrgId: string | null, clientId: string | null) => {
      const requestId = ++detailRequestIdRef.current;
      await Promise.resolve();
      if (detailRequestIdRef.current !== requestId) {
        return;
      }

      const client = supabase;
      if (!client || !targetOrgId || !clientId) {
        setContacts([]);
        setDevices([]);
        setDetailLoading(false);
        setDetailError(null);
        return;
      }

      setDetailLoading(true);
      setDetailError(null);

      try {
        const [contactsRes, devicesRes] = await Promise.all([
          client
            .from("client_contacts")
            .select(
              "id, organization_id, client_id, name, email, phone, position, is_primary, created_at",
            )
            .eq("organization_id", targetOrgId)
            .eq("client_id", clientId)
            .order("is_primary", { ascending: false })
            .order("name", { ascending: true }),
          client
            .from("devices")
            .select(
              "id, organization_id, client_id, device_name, operating_system, device_identifier, agent_type, status, last_seen_at, created_at, updated_at",
            )
            .eq("organization_id", targetOrgId)
            .eq("client_id", clientId)
            .order("device_name", { ascending: true }),
        ]);

        if (detailRequestIdRef.current !== requestId) {
          return;
        }

        if (contactsRes.error) {
          throw contactsRes.error;
        }

        setContacts((contactsRes.data ?? []) as ClientContactRow[]);
        setDevices(
          devicesRes.error ? [] : ((devicesRes.data ?? []) as DeviceRow[]),
        );
      } catch (err) {
        if (detailRequestIdRef.current !== requestId) {
          return;
        }
        setContacts([]);
        setDevices([]);
        setDetailError(
          formatDatabaseError(
            err,
            "No se pudieron consultar los contactos del cliente seleccionado.",
          ),
        );
      } finally {
        if (detailRequestIdRef.current === requestId) {
          setDetailLoading(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    void Promise.resolve().then(() => loadClients(organizationId, null));

    return () => {
      listRequestIdRef.current += 1;
      detailRequestIdRef.current += 1;
    };
  }, [organizationId, loadClients]);

  useEffect(() => {
    void Promise.resolve().then(() =>
      loadClientDetails(organizationId, selectedClientId),
    );
  }, [organizationId, selectedClientId, loadClientDetails]);

  const handleSelectClient = (clientId: string) => {
    setSelectedClientId(clientId);
    setShowContactForm(false);
    setContactError(null);
  };

  const effectiveSearch = (localSearch.trim() || globalSearch.trim()).toLowerCase();

  const filteredClients = useMemo(() => {
    return clients.filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) {
        return false;
      }
      if (!effectiveSearch) {
        return true;
      }
      return (
        c.name.toLowerCase().includes(effectiveSearch) ||
        (c.email ?? "").toLowerCase().includes(effectiveSearch) ||
        (c.phone ?? "").toLowerCase().includes(effectiveSearch)
      );
    });
  }, [clients, statusFilter, effectiveSearch]);

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === selectedClientId) ?? null,
    [clients, selectedClientId],
  );

  const openCreateForm = () => {
    setFormError(null);
    setFeedbackBanner(null);
    setClientForm(INITIAL_CLIENT_FORM);
    setFormMode("create");
  };

  const openEditForm = (target: ClientRow) => {
    setFormError(null);
    setFeedbackBanner(null);
    setClientForm({
      name: target.name,
      email: target.email ?? "",
      phone: target.phone ?? "",
      status: target.status,
    });
    setFormMode("edit");
  };

  const handleClientFormSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !organizationId) {
      return;
    }

    const trimmedName = clientForm.name.trim();
    const trimmedEmail = clientForm.email.trim();
    const trimmedPhone = clientForm.phone.trim();

    if (!trimmedName) {
      setFormError("El nombre del cliente es obligatorio.");
      return;
    }

    if (!isValidEmail(trimmedEmail)) {
      setFormError("Introduce una dirección de correo electrónico válida.");
      return;
    }

    setFormSubmitting(true);
    setFormError(null);

    try {
      const nowIso = new Date().toISOString();
      const archivedAtValue =
        clientForm.status === "archived" ? nowIso : null;

      if (formMode === "create") {
        const { data, error: insertError } = await supabase
          .from("clients")
          .insert({
            organization_id: organizationId,
            name: trimmedName,
            email: trimmedEmail || null,
            phone: trimmedPhone || null,
            status: clientForm.status,
            archived_at: archivedAtValue,
          })
          .select(
            "id, organization_id, name, email, phone, status, created_at, updated_at, archived_at",
          )
          .single();

        if (insertError) {
          throw insertError;
        }

        const created = data as ClientRow;
        setFormMode(null);
        setFeedbackBanner(
          `Cliente "${created.name}" registrado correctamente en la organización.`,
        );
        await loadClients(organizationId, created.id);
      } else if (formMode === "edit" && selectedClient) {
        const preservedArchivedAt =
          clientForm.status === "archived"
            ? selectedClient.archived_at ?? nowIso
            : null;

        const { data, error: updateError } = await supabase
          .from("clients")
          .update({
            name: trimmedName,
            email: trimmedEmail || null,
            phone: trimmedPhone || null,
            status: clientForm.status,
            updated_at: nowIso,
            archived_at: preservedArchivedAt,
          })
          .eq("organization_id", organizationId)
          .eq("id", selectedClient.id)
          .select(
            "id, organization_id, name, email, phone, status, created_at, updated_at, archived_at",
          )
          .single();

        if (updateError) {
          throw updateError;
        }

        const updated = data as ClientRow;
        setFormMode(null);
        setFeedbackBanner(
          `Datos del cliente "${updated.name}" actualizados correctamente.`,
        );
        await loadClients(organizationId, updated.id);
      }
    } catch (err) {
      setFormError(
        formatDatabaseError(
          err,
          "No fue posible guardar los datos del cliente.",
        ),
      );
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleContactSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !organizationId || !selectedClient) {
      return;
    }

    const trimmedName = contactForm.name.trim();
    const trimmedEmail = contactForm.email.trim();
    const trimmedPhone = contactForm.phone.trim();
    const trimmedPosition = contactForm.position.trim();

    if (!trimmedName) {
      setContactError("El nombre del contacto es obligatorio.");
      return;
    }

    if (!isValidEmail(trimmedEmail)) {
      setContactError("El correo electrónico del contacto no es válido.");
      return;
    }

    setContactSubmitting(true);
    setContactError(null);

    try {
      const { error: insertError } = await supabase
        .from("client_contacts")
        .insert({
          organization_id: organizationId,
          client_id: selectedClient.id,
          name: trimmedName,
          position: trimmedPosition || null,
          email: trimmedEmail || null,
          phone: trimmedPhone || null,
          is_primary: contactForm.is_primary,
        });

      if (insertError) {
        throw insertError;
      }

      setShowContactForm(false);
      setContactForm(INITIAL_CONTACT_FORM);
      setFeedbackBanner(
        `Contacto "${trimmedName}" añadido a ${selectedClient.name}.`,
      );
      await loadClientDetails(organizationId, selectedClient.id);
    } catch (err) {
      setContactError(
        formatDatabaseError(
          err,
          "No fue posible registrar el contacto del cliente.",
        ),
      );
    } finally {
      setContactSubmitting(false);
    }
  };

  return (
    <div className="module-container">
      <section className="panel module-toolbar">
        <div className="module-toolbar-left">
          <label className="module-search-input">
            <Search size={16} />
            <input
              type="search"
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              placeholder="Buscar cliente por nombre, correo o teléfono..."
              aria-label="Buscar cliente"
            />
          </label>

          <div
            className="filter-pills"
            role="group"
            aria-label="Filtrar por estado de cliente"
          >
            {(
              [
                { id: "all", label: "Todos" },
                { id: "active", label: "Activos" },
                { id: "inactive", label: "Inactivos" },
                { id: "archived", label: "Archivados" },
              ] as const
            ).map((pill) => (
              <button
                key={pill.id}
                type="button"
                className={`filter-pill ${
                  statusFilter === pill.id ? "active" : ""
                }`}
                onClick={() => setStatusFilter(pill.id)}
              >
                {pill.label}
              </button>
            ))}
          </div>
        </div>

        <div className="module-toolbar-right">
          <button
            type="button"
            className="secondary-button toolbar-btn"
            onClick={() => {
              void loadClients(organizationId, selectedClientId);
            }}
            disabled={loading}
          >
            <RefreshCw size={15} />
            Actualizar
          </button>

          {canManageClients && (
            <button
              type="button"
              className="primary-button toolbar-btn"
              onClick={openCreateForm}
            >
              <Plus size={16} />
              Registrar cliente
            </button>
          )}
        </div>
      </section>

      {!canManageClients && (
        <div className="role-notice-banner" role="status">
          <ShieldAlert size={16} />
          <span>
            Tu rol actual (
            <strong>
              {activeRole ? ORGANIZATION_ROLE_LABELS[activeRole] : "Lectura"}
            </strong>
            ) permite consultar clientes y contactos, pero la creación o edición
            está reservada a Propietarios, Administradores y Coordinadores.
          </span>
        </div>
      )}

      {feedbackBanner && (
        <div className="feedback-banner success" role="status">
          <CheckCircle2 size={16} />
          <span>{feedbackBanner}</span>
          <button
            type="button"
            className="icon-button"
            onClick={() => setFeedbackBanner(null)}
            aria-label="Cerrar aviso"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {formMode && (
        <section
          className="panel module-form-card"
          aria-labelledby="client-form-title"
        >
          <div className="panel-heading">
            <div>
              <h3 id="client-form-title">
                {formMode === "create"
                  ? "Registrar nuevo cliente"
                  : `Editar cliente: ${selectedClient?.name ?? ""}`}
              </h3>
              <p>
                Organización activa:{" "}
                <strong>{activeOrganization?.name}</strong>
              </p>
            </div>
            <button
              type="button"
              className="icon-button"
              onClick={() => setFormMode(null)}
              aria-label="Cerrar formulario"
            >
              <X size={18} />
            </button>
          </div>

          {formError && (
            <div className="auth-alert auth-alert-error" role="alert">
              <AlertTriangle size={16} />
              <div>{formError}</div>
            </div>
          )}

          <form className="module-form-grid" onSubmit={handleClientFormSubmit}>
            <div className="form-field">
              <label htmlFor="client-name">Nombre o razón social *</label>
              <input
                id="client-name"
                type="text"
                required
                maxLength={160}
                value={clientForm.name}
                onChange={(e) =>
                  setClientForm((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="Ej. Grupo Industrial Norte S.A."
                disabled={formSubmitting}
              />
            </div>

            <div className="form-field">
              <label htmlFor="client-email">Correo electrónico principal</label>
              <input
                id="client-email"
                type="email"
                maxLength={160}
                value={clientForm.email}
                onChange={(e) =>
                  setClientForm((prev) => ({ ...prev, email: e.target.value }))
                }
                placeholder="soporte@empresa.com"
                disabled={formSubmitting}
              />
            </div>

            <div className="form-field">
              <label htmlFor="client-phone">Teléfono de contacto</label>
              <input
                id="client-phone"
                type="tel"
                maxLength={50}
                value={clientForm.phone}
                onChange={(e) =>
                  setClientForm((prev) => ({ ...prev, phone: e.target.value }))
                }
                placeholder="+34 900 123 456"
                disabled={formSubmitting}
              />
            </div>

            <div className="form-field">
              <label htmlFor="client-status">Estado operativo</label>
              <select
                id="client-status"
                value={clientForm.status}
                onChange={(e) =>
                  setClientForm((prev) => ({
                    ...prev,
                    status: e.target.value as ClientStatus,
                  }))
                }
                disabled={formSubmitting}
              >
                <option value="active">Activo</option>
                <option value="inactive">Inactivo</option>
                <option value="archived">Archivado</option>
              </select>
            </div>

            <div className="form-actions-row">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setFormMode(null)}
                disabled={formSubmitting}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="primary-button"
                disabled={formSubmitting}
              >
                {formSubmitting ? (
                  <>
                    <Loader2 size={15} className="auth-spinner" />
                    Guardando...
                  </>
                ) : formMode === "create" ? (
                  "Guardar cliente"
                ) : (
                  "Guardar cambios"
                )}
              </button>
            </div>
          </form>
        </section>
      )}

      {loading ? (
        <section
          className="panel module-state-panel"
          role="status"
          aria-live="polite"
        >
          <Loader2 size={24} className="auth-spinner module-state-spinner" />
          <strong>Cargando clientes de {activeOrganization?.name}...</strong>
          <span>Consultando registros autorizados bajo RLS.</span>
        </section>
      ) : error ? (
        <section className="panel module-state-panel" role="alert">
          <div className="placeholder-icon context-error-icon">
            <AlertTriangle size={24} />
          </div>
          <strong>No se pudo consultar el listado de clientes</strong>
          <span>{error}</span>
          <button
            type="button"
            className="primary-button context-action-button"
            onClick={() => {
              void loadClients(organizationId, selectedClientId);
            }}
          >
            <RefreshCw size={15} />
            Reintentar
          </button>
        </section>
      ) : clients.length === 0 ? (
        <section className="panel module-state-panel">
          <div className="placeholder-icon">
            <Building2 size={26} />
          </div>
          <strong>No hay clientes registrados en esta organización</strong>
          <span>
            Registra el primer cliente para asociar contactos, dispositivos y
            solicitudes de soporte técnico.
          </span>
          {canManageClients && (
            <button
              type="button"
              className="primary-button context-action-button"
              onClick={openCreateForm}
            >
              <Plus size={16} />
              Registrar primer cliente
            </button>
          )}
        </section>
      ) : (
        <div className="master-detail-layout">
          <section className="panel master-list-panel">
            <div className="panel-heading">
              <div>
                <h3>Clientes ({filteredClients.length})</h3>
                <p>Selecciona un cliente para inspeccionar su ficha</p>
              </div>
            </div>

            {filteredClients.length === 0 ? (
              <div className="empty-state-box">
                <Inbox size={22} />
                <strong>Sin coincidencias</strong>
                <p>Ningún cliente coincide con los filtros actuales.</p>
              </div>
            ) : (
              <div className="entity-list" role="list">
                {filteredClients.map((client) => {
                  const isSelected = client.id === selectedClient?.id;
                  return (
                    <button
                      type="button"
                      role="listitem"
                      key={client.id}
                      className={`entity-list-item ${
                        isSelected ? "selected" : ""
                      }`}
                      onClick={() => handleSelectClient(client.id)}
                    >
                      <div className="client-avatar blue">
                        {getInitials(client.name)}
                      </div>
                      <div className="entity-list-body">
                        <strong>{client.name}</strong>
                        <span>
                          {client.email ||
                            client.phone ||
                            "Sin datos de contacto directo"}
                        </span>
                      </div>
                      <span
                        className={`status client-status-${client.status}`}
                      >
                        {CLIENT_STATUS_LABELS[client.status]}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section className="panel detail-view-panel">
            {!selectedClient ? (
              <div className="empty-state-box">
                <Users size={24} />
                <strong>Selecciona un cliente</strong>
                <p>
                  Elige un registro del listado lateral para consultar su
                  información detallada y contactos asociados.
                </p>
              </div>
            ) : (
              <>
                <div className="detail-header">
                  <div className="detail-title-group">
                    <div className="client-avatar blue detail-avatar">
                      {getInitials(selectedClient.name)}
                    </div>
                    <div>
                      <div className="detail-badges-row">
                        <span
                          className={`status client-status-${selectedClient.status}`}
                        >
                          {CLIENT_STATUS_LABELS[selectedClient.status]}
                        </span>
                        <span className="detail-id-code">
                          ID: {selectedClient.id.slice(0, 8).toUpperCase()}
                        </span>
                      </div>
                      <h3>{selectedClient.name}</h3>
                    </div>
                  </div>

                  <div className="detail-actions">
                    {canManageClients && (
                      <button
                        type="button"
                        className="secondary-button toolbar-btn"
                        onClick={() => openEditForm(selectedClient)}
                      >
                        <Edit3 size={14} />
                        Editar
                      </button>
                    )}
                    {onCreateTicketForClient &&
                      selectedClient.status === "active" && (
                        <button
                          type="button"
                          className="primary-button toolbar-btn"
                          onClick={() =>
                            onCreateTicketForClient(selectedClient.id)
                          }
                        >
                          <Ticket size={14} />
                          Nuevo ticket
                        </button>
                      )}
                  </div>
                </div>

                <div className="detail-metadata-grid">
                  <div className="metadata-item">
                    <span>Correo electrónico</span>
                    <strong>
                      {selectedClient.email ? (
                        <span className="inline-icon-text">
                          <Mail size={13} />
                          {selectedClient.email}
                        </span>
                      ) : (
                        "No especificado"
                      )}
                    </strong>
                  </div>
                  <div className="metadata-item">
                    <span>Teléfono</span>
                    <strong>
                      {selectedClient.phone ? (
                        <span className="inline-icon-text">
                          <Phone size={13} />
                          {selectedClient.phone}
                        </span>
                      ) : (
                        "No especificado"
                      )}
                    </strong>
                  </div>
                  <div className="metadata-item">
                    <span>Fecha de alta</span>
                    <strong>{formatDateTime(selectedClient.created_at)}</strong>
                  </div>
                  <div className="metadata-item">
                    <span>Última actualización</span>
                    <strong>{formatDateTime(selectedClient.updated_at)}</strong>
                  </div>
                </div>

                <div className="detail-section">
                  <div className="detail-section-header">
                    <div>
                      <h4>Contactos autorizados ({contacts.length})</h4>
                      <p>Personas de contacto registradas para este cliente</p>
                    </div>
                    {canManageClients && (
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => {
                          setContactError(null);
                          setShowContactForm((prev) => !prev);
                        }}
                      >
                        <UserPlus size={14} />
                        {showContactForm ? "Cerrar" : "Añadir contacto"}
                      </button>
                    )}
                  </div>

                  {showContactForm && (
                    <form
                      className="nested-form-card"
                      onSubmit={handleContactSubmit}
                    >
                      {contactError && (
                        <div
                          className="auth-alert auth-alert-error"
                          role="alert"
                        >
                          <AlertTriangle size={15} />
                          <div>{contactError}</div>
                        </div>
                      )}

                      <div className="module-form-grid">
                        <div className="form-field">
                          <label htmlFor="contact-name">
                            Nombre completo *
                          </label>
                          <input
                            id="contact-name"
                            type="text"
                            required
                            value={contactForm.name}
                            onChange={(e) =>
                              setContactForm((prev) => ({
                                ...prev,
                                name: e.target.value,
                              }))
                            }
                            placeholder="Ej. Laura Gómez"
                            disabled={contactSubmitting}
                          />
                        </div>

                        <div className="form-field">
                          <label htmlFor="contact-position">Cargo / Área</label>
                          <input
                            id="contact-position"
                            type="text"
                            value={contactForm.position}
                            onChange={(e) =>
                              setContactForm((prev) => ({
                                ...prev,
                                position: e.target.value,
                              }))
                            }
                            placeholder="Responsable IT"
                            disabled={contactSubmitting}
                          />
                        </div>

                        <div className="form-field">
                          <label htmlFor="contact-email">Correo</label>
                          <input
                            id="contact-email"
                            type="email"
                            value={contactForm.email}
                            onChange={(e) =>
                              setContactForm((prev) => ({
                                ...prev,
                                email: e.target.value,
                              }))
                            }
                            placeholder="lgomez@empresa.com"
                            disabled={contactSubmitting}
                          />
                        </div>

                        <div className="form-field">
                          <label htmlFor="contact-phone">Teléfono</label>
                          <input
                            id="contact-phone"
                            type="tel"
                            value={contactForm.phone}
                            onChange={(e) =>
                              setContactForm((prev) => ({
                                ...prev,
                                phone: e.target.value,
                              }))
                            }
                            placeholder="+34 600 000 000"
                            disabled={contactSubmitting}
                          />
                        </div>
                      </div>

                      <label className="checkbox-field">
                        <input
                          type="checkbox"
                          checked={contactForm.is_primary}
                          onChange={(e) =>
                            setContactForm((prev) => ({
                              ...prev,
                              is_primary: e.target.checked,
                            }))
                          }
                          disabled={contactSubmitting}
                        />
                        <span>Marcar como contacto principal del cliente</span>
                      </label>

                      <div className="form-actions-row">
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => setShowContactForm(false)}
                          disabled={contactSubmitting}
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          className="primary-button"
                          disabled={contactSubmitting}
                        >
                          {contactSubmitting ? (
                            <>
                              <Loader2 size={14} className="auth-spinner" />
                              Guardando...
                            </>
                          ) : (
                            "Registrar contacto"
                          )}
                        </button>
                      </div>
                    </form>
                  )}

                  {detailLoading ? (
                    <div className="inline-loading">
                      <Loader2 size={16} className="auth-spinner" />
                      <span>Cargando contactos y dispositivos...</span>
                    </div>
                  ) : detailError ? (
                    <div className="auth-alert auth-alert-error" role="alert">
                      <AlertTriangle size={15} />
                      <div>{detailError}</div>
                    </div>
                  ) : contacts.length === 0 ? (
                    <div className="empty-state-box empty-state-compact">
                      <strong>Sin contactos registrados</strong>
                      <p>
                        No existen personas de contacto asociadas todavía a este
                        cliente.
                      </p>
                    </div>
                  ) : (
                    <div className="sub-entity-list">
                      {contacts.map((contact) => (
                        <div className="sub-entity-card" key={contact.id}>
                          <div>
                            <div className="sub-entity-title">
                              <strong>{contact.name}</strong>
                              {contact.is_primary && (
                                <span className="primary-contact-badge">
                                  <Star size={10} /> Principal
                                </span>
                              )}
                            </div>
                            <span>
                              {contact.position || "Contacto"}
                              {contact.email ? ` · ${contact.email}` : ""}
                              {contact.phone ? ` · ${contact.phone}` : ""}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="detail-section">
                  <div className="detail-section-header">
                    <div>
                      <h4>Dispositivos registrados ({devices.length})</h4>
                      <p>Equipos asociados al cliente para soporte remoto</p>
                    </div>
                  </div>

                  {devices.length === 0 ? (
                    <div className="empty-state-box empty-state-compact">
                      <strong>Sin dispositivos vinculados</strong>
                      <p>
                        Los equipos registrados para asistencia remota de este
                        cliente se mostrarán en esta sección.
                      </p>
                    </div>
                  ) : (
                    <div className="sub-entity-list">
                      {devices.map((device) => (
                        <div className="sub-entity-card" key={device.id}>
                          <div className="inline-icon-text">
                            <Monitor size={15} />
                            <div>
                              <strong>{device.device_name}</strong>
                              <span>
                                {device.operating_system || "SO no especificado"}{" "}
                                · Agente: {device.agent_type} · Estado:{" "}
                                {device.status}
                              </span>
                            </div>
                          </div>
                          {onNavigateToRemoteSessions && device.status !== "revoked" && (
                            <button
                              type="button"
                              className="small-button secondary-button"
                              onClick={() =>
                                onNavigateToRemoteSessions({
                                  clientId: device.client_id,
                                  deviceId: device.id,
                                  openCreate: true,
                                })
                              }
                              title="Solicitar asistencia remota para este dispositivo"
                            >
                              <Play size={12} />
                              Asistencia remota
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

export default ClientsView;
