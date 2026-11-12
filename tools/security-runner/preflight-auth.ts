/**
 * tools/security-runner/preflight-auth.ts
 *
 * Módulo de preflight para Supabase Auth.
 * Implementa inspección estricta de códigos de error (404 / user_not_found),
 * verificación de app_metadata y detección de concurrencia en paginación.
 */

export interface AuthUserInspection {
  id: string;
  email?: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
}

export interface AuthClientInterface {
  admin: {
    getUserById(id: string): Promise<{
      data: { user: AuthUserInspection | null } | null;
      error: { status?: number; code?: string; message?: string } | null;
    }>;
    listUsers(params: { page: number; perPage: number }): Promise<{
      data: { users: AuthUserInspection[] } | null;
      error: { status?: number; code?: string; message?: string } | null;
    }>;
  };
}

export class AuthPreflightCollisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthPreflightCollisionError';
  }
}

export class AuthPreflightExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthPreflightExecutionError';
  }
}

export class AuthPreflightManager {
  private authClient: AuthClientInterface;

  constructor(authClient: AuthClientInterface) {
    this.authClient = authClient;
  }

  /**
   * Comprueba que un usuario con el UUID dado NO exista previamente en auth.users.
   * Únicamente considera inexistencia si la API responde status 404 con código 'user_not_found'.
   */
  public async verifyUserDoesNotExist(userId: string): Promise<void> {
    const { data, error } = await this.authClient.admin.getUserById(userId);

    // 1. Si se devuelve un usuario, hay colisión fatal
    if (data && data.user) {
      throw new AuthPreflightCollisionError(
        `COLISIÓN AUTH: El usuario con ID ${userId} ya existe en auth.users.`
      );
    }

    // 2. Si se devuelve un error, inspeccionar status y código canónico
    if (error) {
      const isCanonicalNotFound =
        error.status === 404 &&
        (error.code === 'user_not_found' ||
          (typeof error.message === 'string' &&
            error.message.toLowerCase().includes('user not found')));

      if (isCanonicalNotFound) {
        // Confirmado de manera inequívoca que no existe
        return;
      }

      // Cualquier otro error (401, 429, 500, fallo de red) obliga a abortar
      throw new AuthPreflightExecutionError(
        `ERROR EN PREFLIGHT AUTH: Respuesta no concluyente para usuario ${userId}. Status: ${error.status}, Code: ${error.code}, Detalle: ${error.message}`
      );
    }

    // 3. Respuesta ambigua: sin usuario y sin error explícito
    throw new AuthPreflightExecutionError(
      `RESPUESTA AMBIGUA: getUserById(${userId}) devolvió payload vacío sin error de no-encontrado.`
    );
  }

  /**
   * Evalúa si un usuario existente pertenece legítimamente a la corrida actual.
   * Utiliza EXCLUSIVAMENTE app_metadata protegida por el servidor.
   */
  public verifyOwnership(
    user: AuthUserInspection,
    expectedRunId: string,
    expectedRunNonce: string
  ): 'OWNED' | 'FOREIGN' | 'UNVERIFIABLE' {
    const appMeta = user.app_metadata;
    if (!appMeta || typeof appMeta !== 'object') {
      return 'UNVERIFIABLE';
    }

    const runId = appMeta.rs365_seed_run_id;
    const nonce = appMeta.rs365_seed_nonce;

    if (runId === expectedRunId && nonce === expectedRunNonce) {
      return 'OWNED';
    }

    return 'FOREIGN';
  }

  /**
   * Recorre exhaustivamente auth.users buscando colisiones con correos reservados.
   * Detecta drift / duplicados por mutación concurrente entre páginas.
   */
  public async scanForEmailCollisions(
    reservedEmails: Set<string>,
    perPage = 100,
    maxUsersLimit = 5000
  ): Promise<void> {
    const seenUserIds = new Set<string>();
    const lowerReserved = new Set(Array.from(reservedEmails).map((e) => e.toLowerCase()));

    let page = 1;
    let totalScanned = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await this.authClient.admin.listUsers({ page, perPage });

      if (error) {
        throw new AuthPreflightExecutionError(
          `Error al paginar usuarios en página ${page}: ${error.message}`
        );
      }
      if (!data || !Array.isArray(data.users)) {
        throw new AuthPreflightExecutionError(
          `Respuesta de paginación inválida en página ${page}: data.users no es un array.`
        );
      }

      const users = data.users;
      totalScanned += users.length;

      if (totalScanned > maxUsersLimit) {
        throw new AuthPreflightExecutionError(
          `Límite de seguridad alcanzado: el proyecto tiene más de ${maxUsersLimit} usuarios. Exige verificación directa.`
        );
      }

      for (const user of users) {
        // Detección de drift ascendente (duplicación por borrado concurrente en página previa)
        if (seenUserIds.has(user.id)) {
          throw new AuthPreflightExecutionError(
            `CONCURRENCIA DETECTADA: El usuario ${user.id} apareció en dos páginas distintas durante la paginación. Abortando preflight.`
          );
        }
        seenUserIds.add(user.id);

        if (user.email && lowerReserved.has(user.email.toLowerCase())) {
          throw new AuthPreflightCollisionError(
            `COLISIÓN DE CORREO: El email reservado ${user.email} ya existe en auth.users (ID ${user.id}).`
          );
        }
      }

      if (users.length < perPage) {
        hasMore = false;
      } else {
        page++;
      }
    }
  }
}
