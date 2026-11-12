/**
 * Contrato de abstracción para motores de control remoto (Fase 4.3).
 *
 * El núcleo operativo se desacopla del motor subyacente (RustDesk) mediante
 * esta interfaz tipada. Cumple estrictamente:
 * 1. Modo exclusivamente asistido / atendido (attended mode only).
 * 2. Información honesta de conectividad (no simulación de sockets ni conexiones ficticias).
 * 3. Auditoría de intentos e identificadores de sesión.
 */

export interface RemoteEngineConfig {
  relayServer: string | null;
  apiServer: string | null;
  publicKey: string | null;
}

export interface RemoteEngineStatus {
  engine: "rustdesk";
  configured: boolean;
  serverHost: string | null;
  statusText: string;
  attendedModeStrict: true;
}

export interface RemoteAttemptLaunchPlan {
  engine: "rustdesk";
  readyToConnect: boolean;
  targetIdentifier: string | null;
  launchUri: string | null;
  configurationNotice: string | null;
}

export interface RemoteEngineAdapter {
  readonly engineName: "rustdesk";
  getStatus(): RemoteEngineStatus;
  createLaunchPlan(params: {
    deviceIdentifier: string | null;
    attemptNumber: number;
    requestId: string;
  }): RemoteAttemptLaunchPlan;
}
