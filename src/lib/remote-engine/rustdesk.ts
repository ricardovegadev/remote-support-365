import type {
  RemoteAttemptLaunchPlan,
  RemoteEngineAdapter,
  RemoteEngineConfig,
  RemoteEngineStatus,
} from "./types";

/**
 * Adaptador para el motor de control remoto RustDesk.
 *
 * Principios operativos:
 * - Modo atendido (attended) estricto.
 * - Si no hay servidor de retransmisión (relay) configurado en el entorno
 *   (VITE_RUSTDESK_SERVER), se reporta honestamente el estado "pendiente de configuración",
 *   evitando falsos positivos o conexiones ficticias.
 * - Cuando el técnico dispone del identificador de dispositivo y servidor configurado,
 *   genera un esquema de invocación estándar `rustdesk://<id>`.
 */
export class RustDeskAdapter implements RemoteEngineAdapter {
  public readonly engineName = "rustdesk" as const;
  private readonly config: RemoteEngineConfig;

  constructor() {
    const rawServer = (import.meta.env.VITE_RUSTDESK_SERVER as string | undefined)?.trim();
    const rawApi = (import.meta.env.VITE_RUSTDESK_API_SERVER as string | undefined)?.trim();
    const rawKey = (import.meta.env.VITE_RUSTDESK_KEY as string | undefined)?.trim();

    this.config = {
      relayServer: rawServer && rawServer.length > 0 ? rawServer : null,
      apiServer: rawApi && rawApi.length > 0 ? rawApi : null,
      publicKey: rawKey && rawKey.length > 0 ? rawKey : null,
    };
  }

  public getStatus(): RemoteEngineStatus {
    const isConfigured = Boolean(this.config.relayServer);
    return {
      engine: "rustdesk",
      configured: isConfigured,
      serverHost: this.config.relayServer,
      statusText: isConfigured
        ? `Servidor de señalización activo (${this.config.relayServer})`
        : "Servidor de retransmisión RustDesk no configurado en entorno (VITE_RUSTDESK_SERVER pendiente de provisión)",
      attendedModeStrict: true,
    };
  }

  public createLaunchPlan(params: {
    deviceIdentifier: string | null;
    attemptNumber: number;
    requestId: string;
  }): RemoteAttemptLaunchPlan {
    const status = this.getStatus();
    const identifier = params.deviceIdentifier?.trim() ?? null;

    if (!status.configured) {
      return {
        engine: "rustdesk",
        readyToConnect: false,
        targetIdentifier: identifier,
        launchUri: null,
        configurationNotice:
          "El servidor de rendezvous/relay de RustDesk aún no ha sido provisto en las variables de entorno. Para establecer el túnel P2P/relay, configure VITE_RUSTDESK_SERVER en el despliegue del entorno.",
      };
    }

    if (!identifier) {
      return {
        engine: "rustdesk",
        readyToConnect: false,
        targetIdentifier: null,
        launchUri: null,
        configurationNotice:
          "El dispositivo no cuenta con un ID de cliente RustDesk registrado. Ingrese el ID proporcionado por el usuario en su cliente asistido.",
      };
    }

    // URI estándar para lanzamiento de cliente atendido RustDesk
    const launchUri = `rustdesk://${encodeURIComponent(identifier)}`;

    return {
      engine: "rustdesk",
      readyToConnect: true,
      targetIdentifier: identifier,
      launchUri,
      configurationNotice: null,
    };
  }
}

let singletonAdapter: RustDeskAdapter | null = null;

export function getRemoteEngineAdapter(): RustDeskAdapter {
  if (!singletonAdapter) {
    singletonAdapter = new RustDeskAdapter();
  }
  return singletonAdapter;
}
