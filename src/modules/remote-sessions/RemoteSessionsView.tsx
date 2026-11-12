import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Edit3,
  ExternalLink,
  History,
  Info,
  Loader2,
  Lock,
  Monitor,
  Play,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  StopCircle,
  X,
  XCircle,
} from "lucide-react";

import { supabase } from "../../lib/supabase";
import { useAuth } from "../auth/AuthContext";
import {
  CLIENT_STATUS_LABELS,
  CONSENT_METHOD_LABELS,
  DEVICE_AGENT_TYPE_LABELS,
  DEVICE_STATUS_LABELS,
  REMOTE_SESSION_ATTEMPT_STATUS_LABELS,
  REMOTE_SESSION_REQUEST_STATUS_LABELS,
  TICKET_STATUS_LABELS,
  formatDatabaseError,
  type ClientRow,
  type ConsentMethod,
  type ConsentRevocationRow,
  type DeviceAgentType,
  type DeviceInsert,
  type DeviceRow,
  type DeviceStatus,
  type DeviceUpdate,
  type ProfileRow,
  type RemoteSessionAttemptRow,
  type RemoteSessionRequestRow,
  type RemoteSessionRequestStatus,
  type RemoteSessionRow,
  type SessionConsentRow,
  type TicketRow,
} from "../../types/database";
import { getRemoteEngineAdapter } from "../../lib/remote-engine";

interface RemoteSessionsViewProps {
  globalSearch: string;
  initialTab?: "devices" | "requests";
  targetTicketId?: string | null;
  targetDeviceId?: string | null;
  targetClientId?: string | null;
  openCreateRequestOnMount?: boolean;
  onNavigateToTicket?: (ticketId: string) => void;
  onNavigateToClient?: (clientId: string) => void;
}

type TabType = "devices" | "requests";

interface DeviceFormState {
  client_id: string;
  device_name: string;
  operating_system: string;
  device_identifier: string;
  agent_type: DeviceAgentType;
  status: DeviceStatus;
}

const INITIAL_DEVICE_FORM: DeviceFormState = {
  client_id: "",
  device_name: "",
  operating_system: "",
  device_identifier: "",
  agent_type: "temporary",
  status: "registered",
};

interface NewRequestFormState {
  client_id: string;
  device_id: string;
  ticket_id: string;
  expires_hours: number;
}

const INITIAL_REQUEST_FORM: NewRequestFormState = {
  client_id: "",
  device_id: "",
  ticket_id: "",
  expires_hours: 2,
};

interface ConsentFormState {
  consent_method: ConsentMethod;
  granted_by_name: string;
  evidence_reference: string;
}

const INITIAL_CONSENT_FORM: ConsentFormState = {
  consent_method: "local_confirmation",
  granted_by_name: "",
  evidence_reference: "",
};

export default function RemoteSessionsView({
  globalSearch,
  initialTab = "requests",
  targetTicketId = null,
  targetDeviceId = null,
  targetClientId = null,
  openCreateRequestOnMount = false,
  onNavigateToTicket,
  onNavigateToClient,
}: RemoteSessionsViewProps) {
  const { activeOrganization, user, activeRole } = useAuth();
  const organizationId = activeOrganization?.id ?? null;

  const [activeTab, setActiveTab] = useState<TabType>(initialTab);

  // Datos principales
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [requests, setRequests] = useState<RemoteSessionRequestRow[]>([]);
  const [profiles, setProfiles] = useState<Map<string, ProfileRow>>(new Map());

  // Estados de carga y error principal
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Filtros de búsqueda locales
  const [deviceSearch, setDeviceSearch] = useState<string>("");
  const [deviceStatusFilter, setDeviceStatusFilter] = useState<string>("all");
  const [deviceAgentFilter, setDeviceAgentFilter] = useState<string>("all");

  const [requestSearch, setRequestSearch] = useState<string>("");
  const [requestStatusFilter, setRequestStatusFilter] = useState<string>("all");

  // Selección activa
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(
    targetDeviceId,
  );
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);

  // Detalle contextual de la solicitud seleccionada
  const [selectedRequestConsents, setSelectedRequestConsents] = useState<
    SessionConsentRow[]
  >([]);
  const [selectedRequestRevocations, setSelectedRequestRevocations] = useState<
    ConsentRevocationRow[]
  >([]);
  const [selectedRequestAttempts, setSelectedRequestAttempts] = useState<
    RemoteSessionAttemptRow[]
  >([]);
  const [selectedRequestSessions, setSelectedRequestSessions] = useState<
    RemoteSessionRow[]
  >([]);
  const [requestDetailLoading, setRequestDetailLoading] = useState<boolean>(false);

  // Modales
  const [deviceModalMode, setDeviceModalMode] = useState<"create" | "edit" | null>(
    null,
  );
  const [deviceForm, setDeviceForm] =
    useState<DeviceFormState>(INITIAL_DEVICE_FORM);
  const [editingDevice, setEditingDevice] = useState<DeviceRow | null>(null);
  const [deviceSubmitting, setDeviceSubmitting] = useState<boolean>(false);
  const [deviceFormError, setDeviceFormError] = useState<string | null>(null);

  const [requestModalOpen, setRequestModalOpen] = useState<boolean>(
    openCreateRequestOnMount,
  );
  const [requestForm, setRequestForm] = useState<NewRequestFormState>({
    ...INITIAL_REQUEST_FORM,
    client_id: targetClientId ?? "",
    device_id: targetDeviceId ?? "",
    ticket_id: targetTicketId ?? "",
  });
  const [requestSubmitting, setRequestSubmitting] = useState<boolean>(false);
  const [requestFormError, setRequestFormError] = useState<string | null>(null);

  const [consentModalOpen, setConsentModalOpen] = useState<boolean>(false);
  const [consentForm, setConsentForm] =
    useState<ConsentFormState>(INITIAL_CONSENT_FORM);
  const [consentSubmitting, setConsentSubmitting] = useState<boolean>(false);
  const [consentFormError, setConsentFormError] = useState<string | null>(null);

  const [revokeModalOpen, setRevokeModalOpen] = useState<boolean>(false);
  const [revokeReason, setRevokeReason] = useState<string>("");
  const [revokeSubmitting, setRevokeSubmitting] = useState<boolean>(false);
  const [revokeFormError, setRevokeFormError] = useState<string | null>(null);

  const [endSessionModalOpen, setEndSessionModalOpen] = useState<boolean>(false);
  const [sessionEndType, setSessionEndType] = useState<"normal" | "interrupt">(
    "normal",
  );
  const [sessionEndSubmitting, setSessionEndSubmitting] = useState<boolean>(false);

  const listRequestIdRef = useRef<number>(0);
  const detailRequestIdRef = useRef<number>(0);

  const rustdeskAdapter = useMemo(() => getRemoteEngineAdapter(), []);
  const engineStatus = useMemo(
    () => rustdeskAdapter.getStatus(),
    [rustdeskAdapter],
  );

  const canManageDevices = useMemo(() => {
    return (
      activeRole === "owner" ||
      activeRole === "admin" ||
      activeRole === "dispatcher" ||
      activeRole === "technician_internal"
    );
  }, [activeRole]);

  // Carga general de datos
  const loadModuleData = useCallback(
    async (
      targetOrgId: string,
      keepSelectedDeviceId?: string | null,
      keepSelectedRequestId?: string | null,
    ) => {
      const requestId = ++listRequestIdRef.current;
      setLoading(true);
      setError(null);

      const client = supabase;
      if (!client) {
        setError("Cliente de Supabase no disponible en las variables de entorno.");
        setLoading(false);
        return;
      }

      try {
        const [devicesRes, clientsRes, ticketsRes, requestsRes, profilesRes] =
          await Promise.all([
            client
              .from("devices")
              .select(
                "id, organization_id, client_id, device_name, operating_system, device_identifier, agent_type, status, last_seen_at, created_at, updated_at",
              )
              .eq("organization_id", targetOrgId)
              .order("device_name", { ascending: true }),
            client
              .from("clients")
              .select(
                "id, organization_id, name, email, phone, status, created_at, updated_at, archived_at",
              )
              .eq("organization_id", targetOrgId)
              .order("name", { ascending: true }),
            client
              .from("tickets")
              .select(
                "id, organization_id, client_id, device_id, ticket_number, subject, description, priority, status, source, created_by, resolved_at, closed_at, archived_at, created_at, updated_at",
              )
              .eq("organization_id", targetOrgId)
              .order("created_at", { ascending: false }),
            client
              .from("remote_session_requests")
              .select(
                "id, organization_id, ticket_id, client_id, device_id, requested_by, access_mode, status, requested_at, expires_at, responded_at",
              )
              .eq("organization_id", targetOrgId)
              .order("requested_at", { ascending: false }),
            client
              .from("profiles")
              .select("id, display_name, avatar_path, created_at, updated_at"),
          ]);

        if (listRequestIdRef.current !== requestId) {
          return;
        }

        if (devicesRes.error) {
          throw devicesRes.error;
        }
        if (clientsRes.error) {
          throw clientsRes.error;
        }
        if (ticketsRes.error) {
          throw ticketsRes.error;
        }
        if (requestsRes.error) {
          throw requestsRes.error;
        }

        const deviceRows = (devicesRes.data ?? []) as DeviceRow[];
        const clientRows = (clientsRes.data ?? []) as ClientRow[];
        const ticketRows = (ticketsRes.data ?? []) as TicketRow[];
        const requestRows = (requestsRes.data ?? []) as RemoteSessionRequestRow[];
        const profileMap = new Map<string, ProfileRow>(
          ((profilesRes.data ?? []) as ProfileRow[]).map((p) => [p.id, p]),
        );

        setDevices(deviceRows);
        setClients(clientRows);
        setTickets(ticketRows);
        setRequests(requestRows);
        setProfiles(profileMap);

        // Resolver selección de dispositivo
        if (keepSelectedDeviceId !== undefined) {
          setSelectedDeviceId(keepSelectedDeviceId);
        } else if (targetDeviceId && deviceRows.some((d) => d.id === targetDeviceId)) {
          setSelectedDeviceId(targetDeviceId);
        } else if (!selectedDeviceId && deviceRows.length > 0) {
          setSelectedDeviceId(deviceRows[0].id);
        }

        // Resolver selección de solicitud
        if (keepSelectedRequestId !== undefined) {
          setSelectedRequestId(keepSelectedRequestId);
        } else if (!selectedRequestId && requestRows.length > 0) {
          setSelectedRequestId(requestRows[0].id);
        }
      } catch (err) {
        if (listRequestIdRef.current !== requestId) {
          return;
        }
        setError(
          formatDatabaseError(
            err,
            "No se pudieron cargar los datos de dispositivos y asistencia remota.",
          ),
        );
      } finally {
        if (listRequestIdRef.current === requestId) {
          setLoading(false);
        }
      }
    },
    [selectedDeviceId, selectedRequestId, targetDeviceId],
  );

  useEffect(() => {
    if (!organizationId) {
      return;
    }
    void Promise.resolve().then(() => {
      void loadModuleData(organizationId);
    });
  }, [organizationId, loadModuleData]);

  // Carga de detalles de la solicitud seleccionada (consentimientos, intentos, sesiones)
  const loadRequestDetails = useCallback(
    async (targetOrgId: string, reqId: string) => {
      const client = supabase;
      if (!client) {
        setRequestDetailLoading(false);
        return;
      }

      const detailReqId = ++detailRequestIdRef.current;
      setRequestDetailLoading(true);

      try {
        const [consentsRes, revocationsRes, attemptsRes, sessionsRes] =
          await Promise.all([
            client
              .from("session_consents")
              .select(
                "id, organization_id, request_id, device_id, granted_by_user_id, granted_by_name, consent_method, evidence_reference, granted_at",
              )
              .eq("organization_id", targetOrgId)
              .eq("request_id", reqId)
              .order("granted_at", { ascending: false }),
            client
              .from("consent_revocations")
              .select("id, organization_id, consent_id, revoked_by, reason, revoked_at")
              .eq("organization_id", targetOrgId)
              .order("revoked_at", { ascending: false }),
            client
              .from("remote_session_attempts")
              .select(
                "id, organization_id, request_id, attempt_number, engine, engine_session_ref, status, failure_code, failure_detail, started_at, ended_at, created_at",
              )
              .eq("organization_id", targetOrgId)
              .eq("request_id", reqId)
              .order("attempt_number", { ascending: false }),
            client
              .from("remote_sessions")
              .select(
                "id, organization_id, request_id, attempt_id, device_id, technician_user_id, status, started_at, ended_at, duration_seconds, created_at",
              )
              .eq("organization_id", targetOrgId)
              .eq("request_id", reqId)
              .order("created_at", { ascending: false }),
          ]);

        if (detailRequestIdRef.current !== detailReqId) {
          return;
        }

        const consents = consentsRes.error
          ? []
          : ((consentsRes.data ?? []) as SessionConsentRow[]);
        const revocations = revocationsRes.error
          ? []
          : ((revocationsRes.data ?? []) as ConsentRevocationRow[]);
        const attempts = attemptsRes.error
          ? []
          : ((attemptsRes.data ?? []) as RemoteSessionAttemptRow[]);
        const sessions = sessionsRes.error
          ? []
          : ((sessionsRes.data ?? []) as RemoteSessionRow[]);

        setSelectedRequestConsents(consents);
        setSelectedRequestRevocations(revocations);
        setSelectedRequestAttempts(attempts);
        setSelectedRequestSessions(sessions);
      } catch {
        if (detailRequestIdRef.current !== detailReqId) {
          return;
        }
        setSelectedRequestConsents([]);
        setSelectedRequestRevocations([]);
        setSelectedRequestAttempts([]);
        setSelectedRequestSessions([]);
      } finally {
        if (detailRequestIdRef.current === detailReqId) {
          setRequestDetailLoading(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    if (!organizationId || !selectedRequestId) {
      void Promise.resolve().then(() => {
        setSelectedRequestConsents([]);
        setSelectedRequestRevocations([]);
        setSelectedRequestAttempts([]);
        setSelectedRequestSessions([]);
      });
      return;
    }
    void Promise.resolve().then(() => {
      void loadRequestDetails(organizationId, selectedRequestId);
    });
  }, [organizationId, selectedRequestId, loadRequestDetails]);

  // Diccionarios de referencia
  const clientMap = useMemo(
    () => new Map<string, ClientRow>(clients.map((c) => [c.id, c])),
    [clients],
  );

  const deviceMap = useMemo(
    () => new Map<string, DeviceRow>(devices.map((d) => [d.id, d])),
    [devices],
  );

  const ticketMap = useMemo(
    () => new Map<string, TicketRow>(tickets.map((t) => [t.id, t])),
    [tickets],
  );

  const selectedDevice = useMemo(
    () => (selectedDeviceId ? (deviceMap.get(selectedDeviceId) ?? null) : null),
    [deviceMap, selectedDeviceId],
  );

  const selectedRequest = useMemo(
    () =>
      selectedRequestId
        ? (requests.find((r) => r.id === selectedRequestId) ?? null)
        : null,
    [requests, selectedRequestId],
  );

  // Filtros de dispositivos
  const effectiveDeviceSearch = (
    deviceSearch.trim() || globalSearch.trim()
  ).toLowerCase();

  const filteredDevices = useMemo(() => {
    return devices.filter((dev) => {
      if (
        deviceStatusFilter !== "all" &&
        dev.status !== deviceStatusFilter
      ) {
        return false;
      }
      if (
        deviceAgentFilter !== "all" &&
        dev.agent_type !== deviceAgentFilter
      ) {
        return false;
      }
      if (effectiveDeviceSearch) {
        const client = clientMap.get(dev.client_id);
        const nameMatch = dev.device_name.toLowerCase().includes(effectiveDeviceSearch);
        const osMatch = (dev.operating_system ?? "")
          .toLowerCase()
          .includes(effectiveDeviceSearch);
        const idMatch = (dev.device_identifier ?? "")
          .toLowerCase()
          .includes(effectiveDeviceSearch);
        const clientMatch = client?.name
          .toLowerCase()
          .includes(effectiveDeviceSearch);
        if (!nameMatch && !osMatch && !idMatch && !clientMatch) {
          return false;
        }
      }
      return true;
    });
  }, [
    devices,
    deviceStatusFilter,
    deviceAgentFilter,
    effectiveDeviceSearch,
    clientMap,
  ]);

  // Filtros de solicitudes
  const effectiveRequestSearch = (
    requestSearch.trim() || globalSearch.trim()
  ).toLowerCase();

  const filteredRequests = useMemo(() => {
    return requests.filter((req) => {
      if (
        requestStatusFilter !== "all" &&
        req.status !== requestStatusFilter
      ) {
        return false;
      }
      if (effectiveRequestSearch) {
        const client = clientMap.get(req.client_id);
        const device = deviceMap.get(req.device_id);
        const ticket = ticketMap.get(req.ticket_id);
        const clientMatch = client?.name
          .toLowerCase()
          .includes(effectiveRequestSearch);
        const deviceMatch = device?.device_name
          .toLowerCase()
          .includes(effectiveRequestSearch);
        const ticketMatch = ticket
          ? `ticket #${ticket.ticket_number ?? ""} ${ticket.subject}`
              .toLowerCase()
              .includes(effectiveRequestSearch)
          : false;
        const idMatch = req.id.toLowerCase().includes(effectiveRequestSearch);
        if (!clientMatch && !deviceMatch && !ticketMatch && !idMatch) {
          return false;
        }
      }
      return true;
    });
  }, [
    requests,
    requestStatusFilter,
    effectiveRequestSearch,
    clientMap,
    deviceMap,
    ticketMap,
  ]);

  // Estado del consentimiento de la solicitud seleccionada
  const activeConsent = useMemo(() => {
    if (!selectedRequestConsents.length) {
      return null;
    }
    const revokedConsentIds = new Set(
      selectedRequestRevocations.map((r) => r.consent_id),
    );
    return (
      selectedRequestConsents.find((c) => !revokedConsentIds.has(c.id)) ?? null
    );
  }, [selectedRequestConsents, selectedRequestRevocations]);

  const activeSession = useMemo(() => {
    return selectedRequestSessions.find((s) => s.status === "active") ?? null;
  }, [selectedRequestSessions]);

  // Historial de sesiones asociadas al dispositivo seleccionado
  const selectedDeviceSessions = useMemo(() => {
    if (!selectedDeviceId) {
      return [];
    }
    return requests.filter((r) => r.device_id === selectedDeviceId);
  }, [requests, selectedDeviceId]);

  // Dispositivos y tickets válidos para el cliente seleccionado en el formulario de solicitud
  const availableDevicesForClient = useMemo(() => {
    if (!requestForm.client_id) {
      return [];
    }
    return devices.filter(
      (d) => d.client_id === requestForm.client_id && d.status !== "revoked",
    );
  }, [devices, requestForm.client_id]);

  const availableTicketsForClient = useMemo(() => {
    if (!requestForm.client_id) {
      return [];
    }
    return tickets.filter(
      (t) =>
        t.client_id === requestForm.client_id &&
        t.status !== "closed" &&
        t.status !== "cancelled",
    );
  }, [tickets, requestForm.client_id]);

  // ---------------------------------------------------------------------------
  // OPERACIONES: REGISTRAR / EDITAR DISPOSITIVO
  // ---------------------------------------------------------------------------
  const handleOpenCreateDevice = () => {
    setDeviceModalMode("create");
    setEditingDevice(null);
    setDeviceForm({
      ...INITIAL_DEVICE_FORM,
      client_id: targetClientId ?? (clients[0]?.id ?? ""),
    });
    setDeviceFormError(null);
  };

  const handleOpenEditDevice = (device: DeviceRow) => {
    setDeviceModalMode("edit");
    setEditingDevice(device);
    setDeviceForm({
      client_id: device.client_id,
      device_name: device.device_name,
      operating_system: device.operating_system ?? "",
      device_identifier: device.device_identifier ?? "",
      agent_type: device.agent_type,
      status: device.status,
    });
    setDeviceFormError(null);
  };

  const handleSubmitDevice = async (e: FormEvent) => {
    e.preventDefault();
    if (!organizationId) {
      return;
    }

    const trimmedName = deviceForm.device_name.trim();
    if (!trimmedName) {
      setDeviceFormError("El nombre del equipo es obligatorio.");
      return;
    }
    if (!deviceForm.client_id) {
      setDeviceFormError("Debes asociar el dispositivo a un cliente activo.");
      return;
    }

    setDeviceSubmitting(true);
    setDeviceFormError(null);

    const client = supabase;
    if (!client) {
      setDeviceFormError("Cliente de Supabase no disponible.");
      setDeviceSubmitting(false);
      return;
    }

    try {
      if (deviceModalMode === "create") {
        const payload: DeviceInsert = {
          organization_id: organizationId,
          client_id: deviceForm.client_id,
          device_name: trimmedName,
          operating_system: deviceForm.operating_system.trim() || null,
          device_identifier: deviceForm.device_identifier.trim() || null,
          agent_type: deviceForm.agent_type,
          status: deviceForm.status,
        };

        const { data, error: insertError } = await client
          .from("devices")
          .insert(payload)
          .select(
            "id, organization_id, client_id, device_name, operating_system, device_identifier, agent_type, status, last_seen_at, created_at, updated_at",
          )
          .single();

        if (insertError) {
          throw insertError;
        }

        const newDevice = data as DeviceRow;
        setDevices((prev) => [newDevice, ...prev]);
        setSelectedDeviceId(newDevice.id);
        setActionSuccess(`Dispositivo "${newDevice.device_name}" registrado correctamente.`);
      } else if (deviceModalMode === "edit" && editingDevice) {
        const payload: DeviceUpdate = {
          device_name: trimmedName,
          operating_system: deviceForm.operating_system.trim() || null,
          device_identifier: deviceForm.device_identifier.trim() || null,
          agent_type: deviceForm.agent_type,
          status: deviceForm.status,
        };

        const { data, error: updateError } = await client
          .from("devices")
          .update(payload)
          .eq("organization_id", organizationId)
          .eq("id", editingDevice.id)
          .select(
            "id, organization_id, client_id, device_name, operating_system, device_identifier, agent_type, status, last_seen_at, created_at, updated_at",
          )
          .single();

        if (updateError) {
          throw updateError;
        }

        const updated = data as DeviceRow;
        setDevices((prev) =>
          prev.map((d) => (d.id === updated.id ? updated : d)),
        );
        setActionSuccess(`Dispositivo "${updated.device_name}" actualizado.`);
      }

      setDeviceModalMode(null);
      setEditingDevice(null);
    } catch (err) {
      setDeviceFormError(
        formatDatabaseError(
          err,
          "No se pudo guardar la información del dispositivo. Si la escritura falla por políticas de seguridad, asegúrate de aplicar la migración pendiente 20261111160000_remote_assistance_and_devices.sql.",
        ),
      );
    } finally {
      setDeviceSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // OPERACIONES: CREAR SOLICITUD DE ASISTENCIA REMOTA
  // ---------------------------------------------------------------------------
  const handleOpenCreateRequest = (prefill?: {
    clientId?: string;
    deviceId?: string;
    ticketId?: string;
  }) => {
    const cid = prefill?.clientId ?? targetClientId ?? (clients[0]?.id ?? "");
    const matchingDevices = devices.filter(
      (d) => d.client_id === cid && d.status !== "revoked",
    );
    const did = prefill?.deviceId ?? (matchingDevices[0]?.id ?? "");
    const matchingTickets = tickets.filter(
      (t) =>
        t.client_id === cid &&
        t.status !== "closed" &&
        t.status !== "cancelled",
    );
    const tid = prefill?.ticketId ?? (matchingTickets[0]?.id ?? "");

    setRequestForm({
      client_id: cid,
      device_id: did,
      ticket_id: tid,
      expires_hours: 2,
    });
    setRequestFormError(null);
    setRequestModalOpen(true);
  };

  const handleSubmitRequest = async (e: FormEvent) => {
    e.preventDefault();
    if (!organizationId || !user) {
      return;
    }

    if (!requestForm.client_id) {
      setRequestFormError("Debes seleccionar el cliente.");
      return;
    }
    if (!requestForm.device_id) {
      setRequestFormError("Debes seleccionar el dispositivo del cliente.");
      return;
    }
    if (!requestForm.ticket_id) {
      setRequestFormError("Debes asociar la solicitud a un ticket de soporte.");
      return;
    }

    // Validación de integridad cruzada local (coherencia con las FKs compuestas de la BD)
    const device = deviceMap.get(requestForm.device_id);
    const ticket = ticketMap.get(requestForm.ticket_id);

    if (!device || device.client_id !== requestForm.client_id) {
      setRequestFormError(
        "El dispositivo seleccionado no pertenece al cliente indicado.",
      );
      return;
    }
    if (!ticket || ticket.client_id !== requestForm.client_id) {
      setRequestFormError(
        "El ticket de soporte seleccionado no pertenece al cliente indicado.",
      );
      return;
    }

    setRequestSubmitting(true);
    setRequestFormError(null);

    const client = supabase;
    if (!client) {
      setRequestFormError("Cliente de Supabase no disponible.");
      setRequestSubmitting(false);
      return;
    }

    try {
      const expiresAt = new Date(
        Date.now() + requestForm.expires_hours * 60 * 60 * 1000,
      ).toISOString();

      const { data, error: insertError } = await client
        .from("remote_session_requests")
        .insert({
          organization_id: organizationId,
          client_id: requestForm.client_id,
          device_id: requestForm.device_id,
          ticket_id: requestForm.ticket_id,
          requested_by: user.id,
          access_mode: "attended",
          status: "pending",
          expires_at: expiresAt,
        })
        .select(
          "id, organization_id, ticket_id, client_id, device_id, requested_by, access_mode, status, requested_at, expires_at, responded_at",
        )
        .single();

      if (insertError) {
        throw insertError;
      }

      const newReq = data as RemoteSessionRequestRow;
      setRequests((prev) => [newReq, ...prev]);
      setSelectedRequestId(newReq.id);
      setActiveTab("requests");
      setRequestModalOpen(false);
      setActionSuccess(
        "Solicitud de asistencia remota generada en modo asistido. Requiere consentimiento explícito antes de conectar.",
      );
    } catch (err) {
      setRequestFormError(
        formatDatabaseError(
          err,
          "No se pudo crear la solicitud de asistencia remota.",
        ),
      );
    } finally {
      setRequestSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // OPERACIONES: REGISTRAR CONSENTIMIENTO EXPLÍCITO
  // ---------------------------------------------------------------------------
  const handleOpenConsentModal = () => {
    if (!selectedRequest) {
      return;
    }
    setConsentForm({
      consent_method: "local_confirmation",
      granted_by_name: "",
      evidence_reference: "",
    });
    setConsentFormError(null);
    setConsentModalOpen(true);
  };

  const handleSubmitConsent = async (e: FormEvent) => {
    e.preventDefault();
    if (!organizationId || !selectedRequest || !user) {
      return;
    }

    const trimmedName = consentForm.granted_by_name.trim();
    if (!trimmedName) {
      setConsentFormError(
        "Debes indicar el nombre de la persona que autorizó el acceso.",
      );
      return;
    }

    setConsentSubmitting(true);
    setConsentFormError(null);

    const client = supabase;
    if (!client) {
      setConsentFormError("Cliente de Supabase no disponible.");
      setConsentSubmitting(false);
      return;
    }

    try {
      // 1. Insertar el consentimiento explícito
      const { data: consentData, error: consentError } = await client
        .from("session_consents")
        .insert({
          organization_id: organizationId,
          request_id: selectedRequest.id,
          device_id: selectedRequest.device_id,
          granted_by_user_id: user.id,
          granted_by_name: trimmedName,
          consent_method: consentForm.consent_method,
          evidence_reference: consentForm.evidence_reference.trim() || null,
        })
        .select(
          "id, organization_id, request_id, device_id, granted_by_user_id, granted_by_name, consent_method, evidence_reference, granted_at",
        )
        .single();

      if (consentError) {
        throw consentError;
      }

      // 2. Actualizar el estado de la solicitud a 'approved'
      const { error: reqUpdateError } = await client
        .from("remote_session_requests")
        .update({
          status: "approved",
          responded_at: new Date().toISOString(),
        })
        .eq("organization_id", organizationId)
        .eq("id", selectedRequest.id);

      if (reqUpdateError) {
        throw reqUpdateError;
      }

      // Actualizar estado local
      const newConsent = consentData as SessionConsentRow;
      setSelectedRequestConsents((prev) => [newConsent, ...prev]);
      setRequests((prev) =>
        prev.map((r) =>
          r.id === selectedRequest.id
            ? {
                ...r,
                status: "approved",
                responded_at: new Date().toISOString(),
              }
            : r,
        ),
      );

      setConsentModalOpen(false);
      setActionSuccess(
        "Consentimiento registrado exitosamente. La solicitud está autorizada para iniciar intentos de conexión asistida.",
      );
    } catch (err) {
      setConsentFormError(
        formatDatabaseError(
          err,
          "No se pudo registrar el consentimiento de la sesión.",
        ),
      );
    } finally {
      setConsentSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // OPERACIONES: REVOCACIÓN INMEDIATA DEL CONSENTIMIENTO
  // ---------------------------------------------------------------------------
  const handleOpenRevokeModal = () => {
    setRevokeReason("");
    setRevokeFormError(null);
    setRevokeModalOpen(true);
  };

  const handleSubmitRevocation = async (e: FormEvent) => {
    e.preventDefault();
    if (!organizationId || !selectedRequest || !activeConsent || !user) {
      return;
    }

    const trimmedReason = revokeReason.trim();
    if (!trimmedReason) {
      setRevokeFormError(
        "Es obligatorio documentar el motivo de la revocación del consentimiento.",
      );
      return;
    }

    setRevokeSubmitting(true);
    setRevokeFormError(null);

    const client = supabase;
    if (!client) {
      setRevokeFormError("Cliente de Supabase no disponible.");
      setRevokeSubmitting(false);
      return;
    }

    try {
      // 1. Insertar revocación (append-only)
      const { data: revData, error: revError } = await client
        .from("consent_revocations")
        .insert({
          organization_id: organizationId,
          consent_id: activeConsent.id,
          revoked_by: user.id,
          reason: trimmedReason,
        })
        .select(
          "id, organization_id, consent_id, revoked_by, reason, revoked_at",
        )
        .single();

      if (revError) {
        throw revError;
      }

      // 2. Si hay una sesión activa en curso, interrumpirla de inmediato
      if (activeSession) {
        await client
          .from("remote_sessions")
          .update({
            status: "interrupted",
            ended_at: new Date().toISOString(),
          })
          .eq("organization_id", organizationId)
          .eq("id", activeSession.id);
      }

      // 3. Cancelar la solicitud
      await client
        .from("remote_session_requests")
        .update({
          status: "cancelled",
        })
        .eq("organization_id", organizationId)
        .eq("id", selectedRequest.id);

      // Actualizar estados locales
      const newRev = revData as ConsentRevocationRow;
      setSelectedRequestRevocations((prev) => [newRev, ...prev]);
      if (activeSession) {
        setSelectedRequestSessions((prev) =>
          prev.map((s) =>
            s.id === activeSession.id
              ? {
                  ...s,
                  status: "interrupted",
                  ended_at: new Date().toISOString(),
                }
              : s,
          ),
        );
      }
      setRequests((prev) =>
        prev.map((r) =>
          r.id === selectedRequest.id ? { ...r, status: "cancelled" } : r,
        ),
      );

      setRevokeModalOpen(false);
      setActionSuccess(
        "Consentimiento revocado a nivel lógico y solicitud de terminación registrada en plataforma. La desconexión física en el endpoint remoto queda sujeta a la confirmación del daemon/cliente RustDesk.",
      );
    } catch (err) {
      setRevokeFormError(
        formatDatabaseError(
          err,
          "No se pudo completar la revocación del consentimiento.",
        ),
      );
    } finally {
      setRevokeSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // OPERACIONES: INTENTO DE CONEXIÓN RUSTDESK Y CICLO DE SESIÓN
  // ---------------------------------------------------------------------------
  const handleStartAttempt = async () => {
    if (!organizationId || !selectedRequest || !activeConsent || !user) {
      return;
    }

    const client = supabase;
    if (!client) {
      setError("Cliente de Supabase no disponible.");
      return;
    }

    const nextAttemptNumber =
      selectedRequestAttempts.length > 0
        ? Math.max(...selectedRequestAttempts.map((a) => a.attempt_number)) + 1
        : 1;

    try {
      const now = new Date().toISOString();
      const device = deviceMap.get(selectedRequest.device_id);

      // Evaluar plan honesto de lanzamiento mediante adaptador
      const launchPlan = rustdeskAdapter.createLaunchPlan({
        deviceIdentifier: device?.device_identifier ?? null,
        attemptNumber: nextAttemptNumber,
        requestId: selectedRequest.id,
      });

      // Se registra el intento en PostgreSQL / Supabase
      const { data: attemptData, error: attemptError } = await client
        .from("remote_session_attempts")
        .insert({
          organization_id: organizationId,
          request_id: selectedRequest.id,
          attempt_number: nextAttemptNumber,
          engine: "rustdesk",
          engine_session_ref: launchPlan.launchUri || null,
          status: launchPlan.readyToConnect ? "connected" : "connecting",
          started_at: now,
          failure_detail: launchPlan.configurationNotice || null,
        })
        .select(
          "id, organization_id, request_id, attempt_number, engine, engine_session_ref, status, failure_code, failure_detail, started_at, ended_at, created_at",
        )
        .single();

      if (attemptError) {
        throw attemptError;
      }

      const newAttempt = attemptData as RemoteSessionAttemptRow;
      setSelectedRequestAttempts((prev) => [newAttempt, ...prev]);

      if (launchPlan.launchUri) {
        window.open(launchPlan.launchUri, "_blank");
      }

      setActionSuccess(
        launchPlan.readyToConnect
          ? `Intento #${nextAttemptNumber} registrado con identificador ${launchPlan.targetIdentifier}.`
          : `Intento #${nextAttemptNumber} registrado en auditoría. Servidor de relay pendiente de configuración.`,
      );
    } catch (err) {
      setError(
        formatDatabaseError(
          err,
          "Error al registrar el intento de conexión remota.",
        ),
      );
    }
  };

  const handleStartSession = async (attempt: RemoteSessionAttemptRow) => {
    if (!organizationId || !selectedRequest || !user) {
      return;
    }

    const client = supabase;
    if (!client) {
      setError("Cliente de Supabase no disponible.");
      return;
    }

    try {
      const now = new Date().toISOString();
      const { data: sessionData, error: sessionError } = await client
        .from("remote_sessions")
        .insert({
          organization_id: organizationId,
          request_id: selectedRequest.id,
          attempt_id: attempt.id,
          device_id: selectedRequest.device_id,
          technician_user_id: user.id,
          status: "active",
          started_at: now,
        })
        .select(
          "id, organization_id, request_id, attempt_id, device_id, technician_user_id, status, started_at, ended_at, duration_seconds, created_at",
        )
        .single();

      if (sessionError) {
        throw sessionError;
      }

      const newSession = sessionData as RemoteSessionRow;
      setSelectedRequestSessions((prev) => [newSession, ...prev]);
      setActionSuccess("Sesión remota en curso registrada en el núcleo operativo.");
    } catch (err) {
      setError(
        formatDatabaseError(
          err,
          "No se pudo registrar el inicio de la sesión remota.",
        ),
      );
    }
  };

  const handleEndSession = async () => {
    if (!organizationId || !activeSession || !selectedRequest) {
      return;
    }

    const client = supabase;
    if (!client) {
      setError("Cliente de Supabase no disponible.");
      return;
    }

    setSessionEndSubmitting(true);
    try {
      const now = new Date();
      const started = new Date(activeSession.started_at);
      const durationSeconds = Math.max(
        0,
        Math.round((now.getTime() - started.getTime()) / 1000),
      );
      const isInterrupted = sessionEndType === "interrupt";

      // 1. Cerrar la sesión
      const { error: sessionError } = await client
        .from("remote_sessions")
        .update({
          status: isInterrupted ? "interrupted" : "ended",
          ended_at: now.toISOString(),
          duration_seconds: durationSeconds,
        })
        .eq("organization_id", organizationId)
        .eq("id", activeSession.id);

      if (sessionError) {
        throw sessionError;
      }

      // 2. Marcar la solicitud como completada (o cancelada si se interrumpió)
      const nextRequestStatus: RemoteSessionRequestStatus = isInterrupted
        ? "cancelled"
        : "completed";

      await client
        .from("remote_session_requests")
        .update({
          status: nextRequestStatus,
        })
        .eq("organization_id", organizationId)
        .eq("id", selectedRequest.id);

      // Actualizar estado local
      setSelectedRequestSessions((prev) =>
        prev.map((s) =>
          s.id === activeSession.id
            ? {
                ...s,
                status: isInterrupted ? "interrupted" : "ended",
                ended_at: now.toISOString(),
                duration_seconds: durationSeconds,
              }
            : s,
        ),
      );
      setRequests((prev) =>
        prev.map((r) =>
          r.id === selectedRequest.id
            ? { ...r, status: nextRequestStatus }
            : r,
        ),
      );

      setEndSessionModalOpen(false);
      setActionSuccess(
        isInterrupted
          ? "Sesión remota marcada como interrumpida."
          : `Sesión finalizada exitosamente (duración: ${Math.round(durationSeconds / 60)} min).`,
      );
    } catch (err) {
      setError(
        formatDatabaseError(err, "No se pudo finalizar la sesión remota."),
      );
    } finally {
      setSessionEndSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // RENDERIZADO
  // ---------------------------------------------------------------------------
  return (
    <div className="module-container">
      {/* Notificaciones y Avisos */}
      {error && (
        <div className="banner error-banner" role="alert">
          <AlertCircle size={18} />
          <span>{error}</span>
          <button
            type="button"
            className="icon-button"
            onClick={() => setError(null)}
            aria-label="Cerrar aviso de error"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {actionSuccess && (
        <div className="banner success-banner" role="status">
          <CheckCircle2 size={18} />
          <span>{actionSuccess}</span>
          <button
            type="button"
            className="icon-button"
            onClick={() => setActionSuccess(null)}
            aria-label="Cerrar notificación"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Banner de Estado Técnico del Motor RustDesk */}
      <section className="engine-status-card panel">
        <div className="engine-status-content">
          <div className="engine-status-header">
            <span className="live-dot" />
            <strong>MOTOR DE CONTROL REMOTO: RUSTDESK</strong>
            <span className="badge badge-neutral">
              <Lock size={12} />
              Acceso asistido estricto
            </span>
          </div>
          <p className="engine-status-text">
            {engineStatus.statusText}
          </p>
          {!engineStatus.configured && (
            <div className="engine-notice-tip">
              <Info size={14} />
              <span>
                Para establecer sesiones en tiempo real con túnel P2P/relay, configure
                la variable <code>VITE_RUSTDESK_SERVER</code>. La plataforma gestiona
                completamente el inventario, solicitudes, consentimientos y auditoría.
              </span>
            </div>
          )}
        </div>
      </section>

      {/* Pestañas de Navegación del Módulo */}
      <div className="module-tabs-header">
        <div className="module-tabs">
          <button
            type="button"
            className={`module-tab-button ${activeTab === "requests" ? "active" : ""}`}
            onClick={() => setActiveTab("requests")}
          >
            <History size={16} />
            Solicitudes y sesiones ({requests.length})
          </button>
          <button
            type="button"
            className={`module-tab-button ${activeTab === "devices" ? "active" : ""}`}
            onClick={() => setActiveTab("devices")}
          >
            <Monitor size={16} />
            Inventario de dispositivos ({devices.length})
          </button>
        </div>

        <div className="module-tabs-actions">
          {activeTab === "requests" ? (
            <button
              type="button"
              className="primary-button"
              onClick={() => handleOpenCreateRequest()}
              disabled={loading || clients.length === 0}
            >
              <Plus size={16} />
              Nueva solicitud asistida
            </button>
          ) : (
            <button
              type="button"
              className="primary-button"
              onClick={handleOpenCreateDevice}
              disabled={loading || !canManageDevices || clients.length === 0}
            >
              <Plus size={16} />
              Registrar dispositivo
            </button>
          )}

          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              if (organizationId) {
                void loadModuleData(organizationId, selectedDeviceId, selectedRequestId);
              }
            }}
            disabled={loading}
            aria-label="Actualizar datos"
          >
            <RefreshCw size={16} className={loading ? "auth-spinner" : ""} />
            Actualizar
          </button>
        </div>
      </div>

      {/* --------------------------------------------------------------------- */}
      {/* TAB 1: SOLICITUDES Y SESIONES REMOTAS */}
      {/* --------------------------------------------------------------------- */}
      {activeTab === "requests" && (
        <div className="two-column-layout">
          {/* Columna Izquierda: Listado de Solicitudes */}
          <div className="list-column panel">
            <div className="filter-bar">
              <div className="search-input-wrapper">
                <Search size={16} />
                <input
                  type="text"
                  placeholder="Buscar solicitud por cliente o equipo..."
                  value={requestSearch}
                  onChange={(e) => setRequestSearch(e.target.value)}
                />
              </div>

              <select
                value={requestStatusFilter}
                onChange={(e) => setRequestStatusFilter(e.target.value)}
                className="filter-select"
              >
                <option value="all">Todos los estados</option>
                <option value="pending">Pendientes de consentimiento</option>
                <option value="approved">Aprobadas</option>
                <option value="completed">Completadas</option>
                <option value="cancelled">Canceladas</option>
              </select>
            </div>

            {loading ? (
              <div className="loading-state-box">
                <Loader2 size={24} className="auth-spinner" />
                <span>Cargando solicitudes de asistencia remota...</span>
              </div>
            ) : filteredRequests.length === 0 ? (
              <div className="empty-state-box">
                <Monitor size={32} />
                <strong>No se encontraron solicitudes</strong>
                <p>
                  No hay registros de asistencia remota que coincidan con los filtros
                  seleccionados.
                </p>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => handleOpenCreateRequest()}
                  disabled={clients.length === 0}
                >
                  <Plus size={16} />
                  Generar primera solicitud
                </button>
              </div>
            ) : (
              <div className="entity-list">
                {filteredRequests.map((req) => {
                  const client = clientMap.get(req.client_id);
                  const device = deviceMap.get(req.device_id);
                  const ticket = ticketMap.get(req.ticket_id);
                  const isSelected = req.id === selectedRequestId;

                  return (
                    <button
                      type="button"
                      key={req.id}
                      className={`entity-list-item ${isSelected ? "selected" : ""}`}
                      onClick={() => setSelectedRequestId(req.id)}
                    >
                      <div className="entity-item-header">
                        <span className="entity-item-title">
                          {device?.device_name ?? "Dispositivo no encontrado"}
                        </span>
                        <span
                          className={`badge ${
                            req.status === "approved"
                              ? "badge-success"
                              : req.status === "pending"
                                ? "badge-warning"
                                : req.status === "completed"
                                  ? "badge-neutral"
                                  : "badge-danger"
                          }`}
                        >
                          {REMOTE_SESSION_REQUEST_STATUS_LABELS[req.status]}
                        </span>
                      </div>

                      <div className="entity-item-meta">
                        <span>
                          <strong>Cliente:</strong> {client?.name ?? "—"}
                        </span>
                        {ticket && (
                          <span>
                            <strong>Ticket:</strong> #{ticket.ticket_number ?? "—"}{" "}
                            {ticket.subject}
                          </span>
                        )}
                      </div>

                      <div className="entity-item-footer">
                        <span className="text-muted">
                          {new Date(req.requested_at).toLocaleString("es-ES", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </span>
                        <span className="badge badge-outline">
                          {req.access_mode === "attended"
                            ? "Asistido"
                            : req.access_mode}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Columna Derecha: Detalle de Solicitud y Ciclo Operativo */}
          <div className="detail-column panel">
            {!selectedRequest ? (
              <div className="empty-state-box">
                <Info size={32} />
                <strong>Selecciona una solicitud</strong>
                <p>
                  Elige una solicitud de la lista para gestionar el consentimiento,
                  revisar intentos y supervisar la conexión.
                </p>
              </div>
            ) : (
              <div className="request-lifecycle-view">
                <div className="detail-header">
                  <div>
                    <div className="eyebrow">
                      SOLICITUD DE ASISTENCIA REMOTA (ID: {selectedRequest.id.slice(0, 8)})
                    </div>
                    <h2>
                      {deviceMap.get(selectedRequest.device_id)?.device_name ??
                        "Dispositivo"}
                    </h2>
                  </div>

                  <span
                    className={`badge badge-large ${
                      selectedRequest.status === "approved"
                        ? "badge-success"
                        : selectedRequest.status === "pending"
                          ? "badge-warning"
                          : selectedRequest.status === "completed"
                            ? "badge-neutral"
                            : "badge-danger"
                    }`}
                  >
                    {REMOTE_SESSION_REQUEST_STATUS_LABELS[selectedRequest.status]}
                  </span>
                </div>

                {/* Resumen de Integración y Enlaces */}
                <div className="detail-grid">
                  <div className="detail-metric-card">
                    <span className="metric-label">Cliente</span>
                    <strong className="metric-value">
                      {clientMap.get(selectedRequest.client_id)?.name ?? "—"}
                    </strong>
                    {onNavigateToClient && (
                      <button
                        type="button"
                        className="link-button"
                        onClick={() =>
                          onNavigateToClient(selectedRequest.client_id)
                        }
                      >
                        Ver ficha de cliente <ExternalLink size={12} />
                      </button>
                    )}
                  </div>

                  <div className="detail-metric-card">
                    <span className="metric-label">Ticket de soporte</span>
                    <strong className="metric-value">
                      #{ticketMap.get(selectedRequest.ticket_id)?.ticket_number ?? "—"}{" "}
                      {ticketMap.get(selectedRequest.ticket_id)?.subject ?? ""}
                    </strong>
                    {onNavigateToTicket && (
                      <button
                        type="button"
                        className="link-button"
                        onClick={() =>
                          onNavigateToTicket(selectedRequest.ticket_id)
                        }
                      >
                        Ver detalle del ticket <ExternalLink size={12} />
                      </button>
                    )}
                  </div>

                  <div className="detail-metric-card">
                    <span className="metric-label">Modo de acceso</span>
                    <strong className="metric-value">
                      <Lock size={14} /> Asistido (attended)
                    </strong>
                    <span className="text-muted text-xs">
                      Consentimiento obligatorio
                    </span>
                  </div>

                  <div className="detail-metric-card">
                    <span className="metric-label">Solicitado por</span>
                    <strong className="metric-value">
                      {selectedRequest.requested_by
                        ? profiles.get(selectedRequest.requested_by)?.display_name ??
                          "Técnico de la organización"
                        : "Sistema"}
                    </strong>
                    <span className="text-muted text-xs">
                      {new Date(selectedRequest.requested_at).toLocaleString("es-ES")}
                    </span>
                  </div>
                </div>

                {/* SECCIÓN 1: ESTADO DEL CONSENTIMIENTO */}
                <div className="section-block">
                  <div className="section-block-header">
                    <div>
                      <h3>
                        <ShieldCheck size={18} />
                        Consentimiento explícito de sesión
                      </h3>
                      <p>
                        Garantía de consentimiento obligatorio antes de iniciar
                        cualquier conexión remota.
                      </p>
                    </div>

                    {!activeConsent && selectedRequest.status === "pending" && (
                      <button
                        type="button"
                        className="primary-button"
                        onClick={handleOpenConsentModal}
                      >
                        <ShieldCheck size={16} />
                        Registrar consentimiento
                      </button>
                    )}

                    {activeConsent &&
                      selectedRequest.status !== "completed" &&
                      selectedRequest.status !== "cancelled" && (
                        <button
                          type="button"
                          className="danger-button"
                          onClick={handleOpenRevokeModal}
                        >
                          <ShieldAlert size={16} />
                          Revocar consentimiento
                        </button>
                      )}
                  </div>

                  {requestDetailLoading ? (
                    <div className="loading-state-box loading-compact">
                      <Loader2 size={16} className="auth-spinner" />
                      <span>Verificando estado de consentimiento...</span>
                    </div>
                  ) : activeConsent ? (
                    <div className="consent-status-box active-consent">
                      <div className="consent-icon">
                        <CheckCircle2 size={22} />
                      </div>
                      <div className="consent-details">
                        <strong>Consentimiento confirmado y vigente</strong>
                        <p>
                          Autorizado por: <strong>{activeConsent.granted_by_name}</strong>{" "}
                          mediante {CONSENT_METHOD_LABELS[activeConsent.consent_method]}.
                        </p>
                        {activeConsent.evidence_reference && (
                          <div className="evidence-chip">
                            Evidencia: {activeConsent.evidence_reference}
                          </div>
                        )}
                        <span className="text-muted text-xs">
                          Registrado el{" "}
                          {new Date(activeConsent.granted_at).toLocaleString("es-ES")}
                        </span>
                      </div>
                    </div>
                  ) : selectedRequestRevocations.length > 0 ? (
                    <div className="consent-status-box revoked-consent">
                      <div className="consent-icon text-danger">
                        <XCircle size={22} />
                      </div>
                      <div className="consent-details">
                        <strong>Consentimiento revocado (Nivel lógico)</strong>
                        <p>
                          Motivo: {selectedRequestRevocations[0]?.reason ?? "No especificado"}
                        </p>
                        <span className="text-muted text-xs">
                          Revocado el{" "}
                          {new Date(
                            selectedRequestRevocations[0]?.revoked_at,
                          ).toLocaleString("es-ES")}
                        </span>
                        <p className="text-muted text-xs" style={{ marginTop: "6px", fontStyle: "italic" }}>
                          Estado técnico: Solicitud de terminación registrada en plataforma. La desconexión física efectiva depende del cliente/daemon RustDesk en el endpoint.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="consent-status-box pending-consent">
                      <div className="consent-icon text-warning">
                        <AlertTriangle size={22} />
                      </div>
                      <div className="consent-details">
                        <strong>Pendiente de consentimiento explícito</strong>
                        <p>
                          Por políticas de seguridad, no es posible iniciar intentos de
                          conexión hasta que el cliente o técnico registre la confirmación.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* SECCIÓN 2: CONTROL DE SESIÓN ACTIVA */}
                {activeConsent && (
                  <div className="section-block">
                    <div className="section-block-header">
                      <div>
                        <h3>
                          <Play size={18} />
                          Control operativo de la sesión
                        </h3>
                        <p>
                          Gestión de intentos con RustDesk e inicio de sesión activa.
                        </p>
                      </div>

                      {activeSession ? (
                        <button
                          type="button"
                          className="danger-button"
                          onClick={() => {
                            setSessionEndType("normal");
                            setEndSessionModalOpen(true);
                          }}
                        >
                          <StopCircle size={16} />
                          Finalizar sesión activa
                        </button>
                      ) : selectedRequest.status === "approved" ? (
                        <button
                          type="button"
                          className="primary-button"
                          onClick={handleStartAttempt}
                        >
                          <Play size={16} />
                          Registrar intento de conexión
                        </button>
                      ) : null}
                    </div>

                    {activeSession ? (
                      <div className="active-session-banner">
                        <div className="active-session-indicator">
                          <span className="live-dot pulse" />
                          <strong>Sesión remota en curso</strong>
                        </div>
                        <p>
                          Iniciada el{" "}
                          {new Date(activeSession.started_at).toLocaleTimeString("es-ES")}
                        </p>
                      </div>
                    ) : (
                      selectedRequestAttempts.length > 0 && (
                        <div className="attempts-table-wrapper">
                          <table className="data-table">
                            <thead>
                              <tr>
                                <th>#</th>
                                <th>Motor</th>
                                <th>Estado del intento</th>
                                <th>Hora</th>
                                <th>Acción</th>
                              </tr>
                            </thead>
                            <tbody>
                              {selectedRequestAttempts.map((att) => (
                                <tr key={att.id}>
                                  <td><strong>#{att.attempt_number}</strong></td>
                                  <td>RustDesk</td>
                                  <td>
                                    <span
                                      className={`badge ${
                                        att.status === "connected"
                                          ? "badge-success"
                                          : att.status === "connecting"
                                            ? "badge-warning"
                                            : "badge-neutral"
                                      }`}
                                    >
                                      {REMOTE_SESSION_ATTEMPT_STATUS_LABELS[att.status]}
                                    </span>
                                  </td>
                                  <td>
                                    {new Date(att.created_at).toLocaleTimeString("es-ES")}
                                  </td>
                                  <td>
                                    {att.status === "connected" &&
                                      !activeSession &&
                                      selectedRequest.status === "approved" && (
                                        <button
                                          type="button"
                                          className="small-button primary-button"
                                          onClick={() => handleStartSession(att)}
                                        >
                                          Iniciar sesión
                                        </button>
                                      )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* TAB 2: INVENTARIO DE DISPOSITIVOS */}
      {/* --------------------------------------------------------------------- */}
      {activeTab === "devices" && (
        <div className="two-column-layout">
          {/* Listado de Dispositivos */}
          <div className="list-column panel">
            <div className="filter-bar">
              <div className="search-input-wrapper">
                <Search size={16} />
                <input
                  type="text"
                  placeholder="Buscar dispositivo o sistema operativo..."
                  value={deviceSearch}
                  onChange={(e) => setDeviceSearch(e.target.value)}
                />
              </div>

              <select
                value={deviceStatusFilter}
                onChange={(e) => setDeviceStatusFilter(e.target.value)}
                className="filter-select"
              >
                <option value="all">Todos los estados</option>
                <option value="registered">Registrado</option>
                <option value="active">Activo</option>
                <option value="inactive">Inactivo</option>
                <option value="revoked">Revocado</option>
              </select>

              <select
                value={deviceAgentFilter}
                onChange={(e) => setDeviceAgentFilter(e.target.value)}
                className="filter-select"
              >
                <option value="all">Todos los agentes</option>
                <option value="temporary">Temporal (QS)</option>
                <option value="installed">Instalado</option>
              </select>
            </div>

            {loading ? (
              <div className="loading-state-box">
                <Loader2 size={24} className="auth-spinner" />
                <span>Cargando inventario de dispositivos...</span>
              </div>
            ) : filteredDevices.length === 0 ? (
              <div className="empty-state-box">
                <Monitor size={32} />
                <strong>No se encontraron dispositivos</strong>
                <p>
                  No hay dispositivos registrados que coincidan con los criterios de
                  búsqueda.
                </p>
                {canManageDevices && (
                  <button
                    type="button"
                    className="primary-button"
                    onClick={handleOpenCreateDevice}
                    disabled={clients.length === 0}
                  >
                    <Plus size={16} />
                    Registrar primer dispositivo
                  </button>
                )}
              </div>
            ) : (
              <div className="entity-list">
                {filteredDevices.map((dev) => {
                  const client = clientMap.get(dev.client_id);
                  const isSelected = dev.id === selectedDeviceId;

                  return (
                    <button
                      type="button"
                      key={dev.id}
                      className={`entity-list-item ${isSelected ? "selected" : ""}`}
                      onClick={() => setSelectedDeviceId(dev.id)}
                    >
                      <div className="entity-item-header">
                        <span className="entity-item-title">{dev.device_name}</span>
                        <span
                          className={`badge ${
                            dev.status === "active"
                              ? "badge-success"
                              : dev.status === "registered"
                                ? "badge-neutral"
                                : dev.status === "inactive"
                                  ? "badge-warning"
                                  : "badge-danger"
                          }`}
                        >
                          {DEVICE_STATUS_LABELS[dev.status]}
                        </span>
                      </div>

                      <div className="entity-item-meta">
                        <span>
                          <strong>Cliente:</strong> {client?.name ?? "—"}
                        </span>
                        <span>
                          <strong>SO:</strong> {dev.operating_system ?? "No especificado"}
                        </span>
                      </div>

                      <div className="entity-item-footer">
                        <span className="badge badge-outline">
                          {DEVICE_AGENT_TYPE_LABELS[dev.agent_type]}
                        </span>
                        {dev.device_identifier && (
                          <span className="text-muted text-xs font-mono">
                            ID: {dev.device_identifier}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Detalle del Dispositivo Seleccionado */}
          <div className="detail-column panel">
            {!selectedDevice ? (
              <div className="empty-state-box">
                <Info size={32} />
                <strong>Selecciona un dispositivo</strong>
                <p>
                  Elige un equipo del inventario para ver sus datos técnicos, historial
                  de sesiones y lanzar solicitudes de asistencia.
                </p>
              </div>
            ) : (
              <div className="device-detail-view">
                <div className="detail-header">
                  <div>
                    <div className="eyebrow">
                      EQUIPO ({DEVICE_AGENT_TYPE_LABELS[selectedDevice.agent_type]})
                    </div>
                    <h2>{selectedDevice.device_name}</h2>
                  </div>

                  <div className="detail-actions">
                    {canManageDevices && (
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => handleOpenEditDevice(selectedDevice)}
                      >
                        <Edit3 size={15} />
                        Editar
                      </button>
                    )}

                    <button
                      type="button"
                      className="primary-button"
                      onClick={() =>
                        handleOpenCreateRequest({
                          clientId: selectedDevice.client_id,
                          deviceId: selectedDevice.id,
                        })
                      }
                      disabled={selectedDevice.status === "revoked"}
                    >
                      <Play size={15} />
                      Solicitar asistencia remota
                    </button>
                  </div>
                </div>

                {/* Métricas y Datos Técnicos */}
                <div className="detail-grid">
                  <div className="detail-metric-card">
                    <span className="metric-label">Cliente titular</span>
                    <strong className="metric-value">
                      {clientMap.get(selectedDevice.client_id)?.name ?? "—"}
                    </strong>
                    {onNavigateToClient && (
                      <button
                        type="button"
                        className="link-button"
                        onClick={() =>
                          onNavigateToClient(selectedDevice.client_id)
                        }
                      >
                        Ver ficha de cliente <ExternalLink size={12} />
                      </button>
                    )}
                  </div>

                  <div className="detail-metric-card">
                    <span className="metric-label">Sistema Operativo</span>
                    <strong className="metric-value">
                      {selectedDevice.operating_system ?? "No especificado"}
                    </strong>
                  </div>

                  <div className="detail-metric-card">
                    <span className="metric-label">Identificador RustDesk</span>
                    <strong className="metric-value font-mono">
                      {selectedDevice.device_identifier || "Sin ID asignado"}
                    </strong>
                  </div>

                  <div className="detail-metric-card">
                    <span className="metric-label">Estado actual</span>
                    <strong className="metric-value">
                      {DEVICE_STATUS_LABELS[selectedDevice.status]}
                    </strong>
                    <span className="text-muted text-xs">
                      Registrado el{" "}
                      {new Date(selectedDevice.created_at).toLocaleDateString("es-ES")}
                    </span>
                  </div>
                </div>

                {/* Historial de Sesiones del Dispositivo */}
                <div className="section-block">
                  <div className="section-block-header">
                    <div>
                      <h3>
                        <History size={18} />
                        Historial de sesiones del equipo
                      </h3>
                      <p>
                        Registro de solicitudes de asistencia previas vinculadas a este
                        dispositivo.
                      </p>
                    </div>
                  </div>

                  {selectedDeviceSessions.length === 0 ? (
                    <div className="empty-state-box empty-state-compact">
                      <p>No hay sesiones registradas para este dispositivo.</p>
                    </div>
                  ) : (
                    <div className="sub-entity-list">
                      {selectedDeviceSessions.map((sessionReq) => (
                        <div className="sub-entity-card" key={sessionReq.id}>
                          <div>
                            <strong>
                              Solicitud del{" "}
                              {new Date(sessionReq.requested_at).toLocaleString("es-ES")}
                            </strong>
                            <div className="text-muted text-xs">
                              Modo asistido • Ticket asociado: #
                              {ticketMap.get(sessionReq.ticket_id)?.ticket_number ??
                                "—"}
                            </div>
                          </div>
                          <span
                            className={`badge ${
                              sessionReq.status === "completed"
                                ? "badge-neutral"
                                : sessionReq.status === "approved"
                                  ? "badge-success"
                                  : "badge-warning"
                            }`}
                          >
                            {REMOTE_SESSION_REQUEST_STATUS_LABELS[sessionReq.status]}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* MODAL: REGISTRAR / EDITAR DISPOSITIVO */}
      {/* --------------------------------------------------------------------- */}
      {deviceModalMode && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3>
                {deviceModalMode === "create"
                  ? "Registrar nuevo dispositivo"
                  : "Editar información del dispositivo"}
              </h3>
              <button
                type="button"
                className="icon-button"
                onClick={() => setDeviceModalMode(null)}
                disabled={deviceSubmitting}
                aria-label="Cerrar modal"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmitDevice}>
              <div className="modal-body">
                {deviceFormError && (
                  <div className="form-error-banner" role="alert">
                    <AlertTriangle size={16} />
                    <span>{deviceFormError}</span>
                  </div>
                )}

                <div className="form-field">
                  <label htmlFor="device-client">Cliente titular *</label>
                  <select
                    id="device-client"
                    value={deviceForm.client_id}
                    onChange={(e) =>
                      setDeviceForm((prev) => ({
                        ...prev,
                        client_id: e.target.value,
                      }))
                    }
                    disabled={deviceSubmitting || deviceModalMode === "edit"}
                    required
                  >
                    <option value="">Selecciona un cliente...</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.status !== "active" ? `(${CLIENT_STATUS_LABELS[c.status]})` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-field">
                  <label htmlFor="device-name">Nombre del equipo *</label>
                  <input
                    id="device-name"
                    type="text"
                    placeholder="Ej. PC-CONTABILIDAD-01 o MacBook Pro de Juan"
                    value={deviceForm.device_name}
                    onChange={(e) =>
                      setDeviceForm((prev) => ({
                        ...prev,
                        device_name: e.target.value,
                      }))
                    }
                    disabled={deviceSubmitting}
                    required
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="device-os">Sistema Operativo</label>
                  <input
                    id="device-os"
                    type="text"
                    placeholder="Ej. Windows 11 Pro 23H2, Ubuntu 22.04 LTS, macOS Sonoma"
                    value={deviceForm.operating_system}
                    onChange={(e) =>
                      setDeviceForm((prev) => ({
                        ...prev,
                        operating_system: e.target.value,
                      }))
                    }
                    disabled={deviceSubmitting}
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="device-id-code">
                    Identificador de cliente RustDesk (ID numérico)
                  </label>
                  <input
                    id="device-id-code"
                    type="text"
                    placeholder="Ej. 123456789 (proporcionado en la app cliente de RustDesk)"
                    value={deviceForm.device_identifier}
                    onChange={(e) =>
                      setDeviceForm((prev) => ({
                        ...prev,
                        device_identifier: e.target.value,
                      }))
                    }
                    disabled={deviceSubmitting}
                  />
                  <span className="field-hint">
                    No inventar identificadores. Si el usuario aún no instaló el cliente
                    asistido, déjalo vacío hasta que te lo comparta.
                  </span>
                </div>

                <div className="form-row">
                  <div className="form-field">
                    <label htmlFor="device-agent-type">Tipo de agente</label>
                    <select
                      id="device-agent-type"
                      value={deviceForm.agent_type}
                      onChange={(e) =>
                        setDeviceForm((prev) => ({
                          ...prev,
                          agent_type: e.target.value as DeviceAgentType,
                        }))
                      }
                      disabled={deviceSubmitting}
                    >
                      <option value="temporary">Agente temporal (QS sin instalación)</option>
                      <option value="installed">Agente permanente instalado</option>
                    </select>
                  </div>

                  <div className="form-field">
                    <label htmlFor="device-status">Estado</label>
                    <select
                      id="device-status"
                      value={deviceForm.status}
                      onChange={(e) =>
                        setDeviceForm((prev) => ({
                          ...prev,
                          status: e.target.value as DeviceStatus,
                        }))
                      }
                      disabled={deviceSubmitting}
                    >
                      <option value="registered">Registrado</option>
                      <option value="active">Activo</option>
                      <option value="inactive">Inactivo</option>
                      <option value="revoked">Revocado</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setDeviceModalMode(null)}
                  disabled={deviceSubmitting}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={deviceSubmitting}
                >
                  {deviceSubmitting ? (
                    <>
                      <Loader2 size={16} className="auth-spinner" />
                      Guardando...
                    </>
                  ) : deviceModalMode === "create" ? (
                    "Registrar dispositivo"
                  ) : (
                    "Guardar cambios"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* MODAL: NUEVA SOLICITUD DE ASISTENCIA REMOTA */}
      {/* --------------------------------------------------------------------- */}
      {requestModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3>Nueva solicitud de asistencia remota</h3>
              <button
                type="button"
                className="icon-button"
                onClick={() => setRequestModalOpen(false)}
                disabled={requestSubmitting}
                aria-label="Cerrar modal"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmitRequest}>
              <div className="modal-body">
                {requestFormError && (
                  <div className="form-error-banner" role="alert">
                    <AlertTriangle size={16} />
                    <span>{requestFormError}</span>
                  </div>
                )}

                <div className="notice-banner">
                  <Lock size={16} />
                  <span>
                    El acceso es <strong>estrictamente asistido</strong>. Tras crear la
                    solicitud, se requiere confirmación explícita antes de conectar.
                  </span>
                </div>

                <div className="form-field">
                  <label htmlFor="req-client">Cliente *</label>
                  <select
                    id="req-client"
                    value={requestForm.client_id}
                    onChange={(e) =>
                      setRequestForm((prev) => ({
                        ...prev,
                        client_id: e.target.value,
                        device_id: "",
                        ticket_id: "",
                      }))
                    }
                    disabled={requestSubmitting}
                    required
                  >
                    <option value="">Selecciona cliente...</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-field">
                  <label htmlFor="req-device">Dispositivo a conectar *</label>
                  <select
                    id="req-device"
                    value={requestForm.device_id}
                    onChange={(e) =>
                      setRequestForm((prev) => ({
                        ...prev,
                        device_id: e.target.value,
                      }))
                    }
                    disabled={requestSubmitting || !requestForm.client_id}
                    required
                  >
                    <option value="">
                      {!requestForm.client_id
                        ? "Primero selecciona un cliente..."
                        : availableDevicesForClient.length === 0
                          ? "Sin dispositivos registrados para este cliente"
                          : "Selecciona el dispositivo..."}
                    </option>
                    {availableDevicesForClient.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.device_name} ({d.operating_system ?? "SO no especificado"})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-field">
                  <label htmlFor="req-ticket">Ticket de soporte asociado *</label>
                  <select
                    id="req-ticket"
                    value={requestForm.ticket_id}
                    onChange={(e) =>
                      setRequestForm((prev) => ({
                        ...prev,
                        ticket_id: e.target.value,
                      }))
                    }
                    disabled={requestSubmitting || !requestForm.client_id}
                    required
                  >
                    <option value="">
                      {!requestForm.client_id
                        ? "Primero selecciona un cliente..."
                        : availableTicketsForClient.length === 0
                          ? "Sin tickets activos para este cliente"
                          : "Selecciona ticket asociado..."}
                    </option>
                    {availableTicketsForClient.map((t) => (
                      <option key={t.id} value={t.id}>
                        #{t.ticket_number ?? "—"} {t.subject} (
                        {TICKET_STATUS_LABELS[t.status]})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-field">
                  <label htmlFor="req-expires">Caducidad de la solicitud</label>
                  <select
                    id="req-expires"
                    value={requestForm.expires_hours}
                    onChange={(e) =>
                      setRequestForm((prev) => ({
                        ...prev,
                        expires_hours: Number(e.target.value),
                      }))
                    }
                    disabled={requestSubmitting}
                  >
                    <option value={1}>1 hora</option>
                    <option value={2}>2 horas</option>
                    <option value={8}>8 horas (jornada laboral)</option>
                    <option value={24}>24 horas</option>
                  </select>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setRequestModalOpen(false)}
                  disabled={requestSubmitting}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={
                    requestSubmitting ||
                    !requestForm.client_id ||
                    !requestForm.device_id ||
                    !requestForm.ticket_id
                  }
                >
                  {requestSubmitting ? (
                    <>
                      <Loader2 size={16} className="auth-spinner" />
                      Creando solicitud...
                    </>
                  ) : (
                    "Crear solicitud"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* MODAL: REGISTRAR CONSENTIMIENTO */}
      {/* --------------------------------------------------------------------- */}
      {consentModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3>Registrar consentimiento explícito</h3>
              <button
                type="button"
                className="icon-button"
                onClick={() => setConsentModalOpen(false)}
                disabled={consentSubmitting}
                aria-label="Cerrar modal"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmitConsent}>
              <div className="modal-body">
                {consentFormError && (
                  <div className="form-error-banner" role="alert">
                    <AlertTriangle size={16} />
                    <span>{consentFormError}</span>
                  </div>
                )}

                <p className="modal-intro">
                  Documenta la autorización expresa brindada por el cliente antes de
                  conectar al equipo. El consentimiento es por sesión y no reusable.
                </p>

                <div className="form-field">
                  <label htmlFor="consent-method">Método de autorización *</label>
                  <select
                    id="consent-method"
                    value={consentForm.consent_method}
                    onChange={(e) =>
                      setConsentForm((prev) => ({
                        ...prev,
                        consent_method: e.target.value as ConsentMethod,
                      }))
                    }
                    disabled={consentSubmitting}
                  >
                    <option value="local_confirmation">
                      Confirmación presencial o telefónica
                    </option>
                    <option value="portal_confirmation">
                      Confirmación en portal de cliente
                    </option>
                    <option value="other">Otro método justificado</option>
                  </select>
                </div>

                <div className="form-field">
                  <label htmlFor="consent-granted-by">
                    Nombre del titular / usuario que autoriza *
                  </label>
                  <input
                    id="consent-granted-by"
                    type="text"
                    placeholder="Ej. Carlos Méndez (Gerente de IT / Usuario asignado)"
                    value={consentForm.granted_by_name}
                    onChange={(e) =>
                      setConsentForm((prev) => ({
                        ...prev,
                        granted_by_name: e.target.value,
                      }))
                    }
                    disabled={consentSubmitting}
                    required
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="consent-evidence">
                    Referencia de evidencia (opcional)
                  </label>
                  <input
                    id="consent-evidence"
                    type="text"
                    placeholder="Ej. Grabación de llamada #9843 / Mensaje ticket / Correo firmado"
                    value={consentForm.evidence_reference}
                    onChange={(e) =>
                      setConsentForm((prev) => ({
                        ...prev,
                        evidence_reference: e.target.value,
                      }))
                    }
                    disabled={consentSubmitting}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setConsentModalOpen(false)}
                  disabled={consentSubmitting}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={consentSubmitting}
                >
                  {consentSubmitting ? (
                    <>
                      <Loader2 size={16} className="auth-spinner" />
                      Registrando...
                    </>
                  ) : (
                    "Confirmar consentimiento"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* MODAL: REVOCACIÓN DE CONSENTIMIENTO */}
      {/* --------------------------------------------------------------------- */}
      {revokeModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3>Revocar consentimiento de sesión</h3>
              <button
                type="button"
                className="icon-button"
                onClick={() => setRevokeModalOpen(false)}
                disabled={revokeSubmitting}
                aria-label="Cerrar modal"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmitRevocation}>
              <div className="modal-body">
                {revokeFormError && (
                  <div className="form-error-banner" role="alert">
                    <AlertTriangle size={16} />
                    <span>{revokeFormError}</span>
                  </div>
                )}

                <div className="banner danger-banner">
                  <AlertTriangle size={18} />
                  <span>
                    La revocación es <strong>inmediata e irreversible</strong>. Si hay
                    una sesión remota en curso, será interrumpida en este instante.
                  </span>
                </div>

                <div className="form-field">
                  <label htmlFor="revoke-reason">Motivo de la revocación *</label>
                  <textarea
                    id="revoke-reason"
                    rows={3}
                    placeholder="Describe por qué el cliente o el técnico solicitan revocar el acceso..."
                    value={revokeReason}
                    onChange={(e) => setRevokeReason(e.target.value)}
                    disabled={revokeSubmitting}
                    required
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setRevokeModalOpen(false)}
                  disabled={revokeSubmitting}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="danger-button"
                  disabled={revokeSubmitting || !revokeReason.trim()}
                >
                  {revokeSubmitting ? (
                    <>
                      <Loader2 size={16} className="auth-spinner" />
                      Revocando...
                    </>
                  ) : (
                    "Revocar acceso ahora"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* MODAL: FINALIZAR O INTERRUMPIR SESIÓN */}
      {/* --------------------------------------------------------------------- */}
      {endSessionModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3>Finalizar sesión remota</h3>
              <button
                type="button"
                className="icon-button"
                onClick={() => setEndSessionModalOpen(false)}
                disabled={sessionEndSubmitting}
                aria-label="Cerrar modal"
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <p>
                Selecciona la condición de cierre de la sesión para documentar la
                duración y actualizar el estado de la solicitud.
              </p>

              <div className="form-field">
                <label>Resultado de la sesión:</label>
                <div className="radio-group">
                  <label className="radio-option">
                    <input
                      type="radio"
                      name="sessionEndType"
                      value="normal"
                      checked={sessionEndType === "normal"}
                      onChange={() => setSessionEndType("normal")}
                    />
                    <div>
                      <strong>Finalización normal (completada)</strong>
                      <span>La asistencia técnica se realizó satisfactoriamente.</span>
                    </div>
                  </label>

                  <label className="radio-option">
                    <input
                      type="radio"
                      name="sessionEndType"
                      value="interrupt"
                      checked={sessionEndType === "interrupt"}
                      onChange={() => setSessionEndType("interrupt")}
                    />
                    <div>
                      <strong>Sesión interrumpida</strong>
                      <span>
                        Cierre forzoso, corte de red o cancelación por parte del usuario.
                      </span>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setEndSessionModalOpen(false)}
                disabled={sessionEndSubmitting}
              >
                Volver a la sesión
              </button>
              <button
                type="button"
                className={sessionEndType === "interrupt" ? "danger-button" : "primary-button"}
                onClick={handleEndSession}
                disabled={sessionEndSubmitting}
              >
                {sessionEndSubmitting ? (
                  <>
                    <Loader2 size={16} className="auth-spinner" />
                    Registrando cierre...
                  </>
                ) : (
                  "Confirmar finalización"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
