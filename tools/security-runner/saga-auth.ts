/**
 * tools/security-runner/saga-auth.ts
 *
 * Máquina de estados tipo Saga para la limpieza desacoplada de Supabase Auth.
 * Asegura que la eliminación de identidades solo comience tras la confirmación de la
 * transacción SQL y permite reanudar limpiezas parciales de forma idempotente.
 */

import type { LedgerManager } from './ledger.ts';
import type { SagaState } from './types.ts';

export interface AuthAdminClient {
  deleteUser(userId: string): Promise<{ error: { status?: number; message?: string } | null }>;
}

export class SagaAuthManager {
  private ledgerManager: LedgerManager;
  private authAdminClient: AuthAdminClient;

  constructor(ledgerManager: LedgerManager, authAdminClient: AuthAdminClient) {
    this.ledgerManager = ledgerManager;
    this.authAdminClient = authAdminClient;
  }

  public getState(): SagaState {
    return this.ledgerManager.getGlobalStatus();
  }

  /**
   * Registra el éxito de la transacción SQL y transiciona el sistema a AUTH_CLEANUP_PENDING.
   */
  public onSqlTransactionCommitted(): void {
    const current = this.ledgerManager.getGlobalStatus();
    if (current !== 'SQL_PENDING') {
      throw new Error(`Transición inválida: no se puede pasar a SQL_COMMITTED desde ${current}`);
    }
    this.ledgerManager.setGlobalStatus('SQL_COMMITTED');
    this.ledgerManager.setGlobalStatus('AUTH_CLEANUP_PENDING');
  }

  /**
   * Ejecuta el ciclo de eliminación de identidades en auth.users de forma idempotente.
   */
  public async executeAuthCleanup(
    confirmedUserIds: string[]
  ): Promise<{ success: boolean; completedIds: string[]; failedIds: string[] }> {
    const state = this.ledgerManager.getGlobalStatus();
    if (state !== 'AUTH_CLEANUP_PENDING' && state !== 'AUTH_PARTIAL') {
      throw new Error(
        `Transición denegada: La limpieza de Auth requiere estado AUTH_CLEANUP_PENDING o AUTH_PARTIAL (estado actual: ${state}).`
      );
    }

    const completedIds: string[] = [];
    const failedIds: string[] = [];

    for (const userId of confirmedUserIds) {
      const { error } = await this.authAdminClient.deleteUser(userId);

      if (!error) {
        this.ledgerManager.recordAuthUserDeleted(userId);
        completedIds.push(userId);
      } else {
        // En GoTrue, un status 404 significa que ya no existe (idempotencia cumplida)
        if (
          error.status === 404 ||
          (typeof error.message === 'string' && error.message.toLowerCase().includes('user not found'))
        ) {
          this.ledgerManager.recordAuthUserDeleted(userId);
          completedIds.push(userId);
        } else {
          failedIds.push(userId);
          // Al primer fallo real de red o servicio, pausar y marcar estado parcial
          this.ledgerManager.setGlobalStatus('AUTH_PARTIAL');
          this.ledgerManager.setGlobalStatus('RECOVERY_REQUIRED');
          return {
            success: false,
            completedIds,
            failedIds,
          };
        }
      }
    }

    if (failedIds.length === 0) {
      this.ledgerManager.setGlobalStatus('AUTH_COMPLETED');
      return {
        success: true,
        completedIds,
        failedIds: [],
      };
    } else {
      this.ledgerManager.setGlobalStatus('AUTH_PARTIAL');
      return {
        success: false,
        completedIds,
        failedIds,
      };
    }
  }

  /**
   * Reanuda una limpieza que quedó en estado AUTH_PARTIAL o RECOVERY_REQUIRED.
   */
  public async resumePendingAuthCleanup(): Promise<{ success: boolean }> {
    const state = this.ledgerManager.getGlobalStatus();
    if (state !== 'AUTH_PARTIAL' && state !== 'RECOVERY_REQUIRED') {
      throw new Error(`No hay una limpieza de Auth pendiente de recuperación (estado: ${state}).`);
    }

    const ledger = this.ledgerManager.getLedger();
    const pendingUserIds = ledger.auth_users
      .filter((u) => u.status === 'CONFIRMED' || u.status === 'PENDING')
      .map((u) => u.user_id);

    this.ledgerManager.setGlobalStatus('AUTH_CLEANUP_PENDING');
    const result = await this.executeAuthCleanup(pendingUserIds);
    return { success: result.success };
  }
}
