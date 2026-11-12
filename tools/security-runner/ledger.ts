/**
 * tools/security-runner/ledger.ts
 *
 * Implementación del Ledger Persistente y Durable para trazabilidad
 * de operaciones, protocolo Write-Ahead Intent (WAL) y detección de corrupción.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type {
  AllowedTableName,
  ExecutionLedger,
  LedgerEntry,
  LedgerHeader,
  LedgerStatus,
  SagaState,
} from './types.ts';
import { TARGET_SUPABASE_PROJECT_REF } from './constants.ts';

export class LedgerIntegrityPanicError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LedgerIntegrityPanicError';
  }
}

export class LedgerManager {
  private filePath: string;
  private ledger: ExecutionLedger;

  constructor(filePath: string, runId: string, runNonce: string) {
    this.filePath = filePath;
    this.ledger = {
      header: {
        version: '1.0',
        run_id: runId,
        run_nonce: runNonce,
        target_project: TARGET_SUPABASE_PROJECT_REF,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        global_status: 'SQL_PENDING',
        checksum: '',
      },
      entries: [],
      auth_users: [],
    };
  }

  public static computeChecksum(content: {
    header: Omit<LedgerHeader, 'checksum'>;
    entries: LedgerEntry[];
    auth_users: ExecutionLedger['auth_users'];
  }): string {
    const serialized = JSON.stringify(content);
    return crypto.createHash('sha256').update(serialized, 'utf-8').digest('hex');
  }

  public static loadAndVerify(filePath: string, expectedRunId?: string): LedgerManager {
    if (!fs.existsSync(filePath)) {
      throw new LedgerIntegrityPanicError(`Archivo de ledger no encontrado: ${filePath}`);
    }

    let parsed: ExecutionLedger;
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      parsed = JSON.parse(raw) as ExecutionLedger;
    } catch (e: unknown) {
      const err = e as Error;
      throw new LedgerIntegrityPanicError(`Ledger corrupto o JSON inválido: ${err.message}`);
    }

    if (!parsed.header || !parsed.entries || !parsed.auth_users) {
      throw new LedgerIntegrityPanicError('Estructura de ledger incompleta o faltan secciones requeridas.');
    }

    if (expectedRunId && parsed.header.run_id !== expectedRunId) {
      throw new LedgerIntegrityPanicError(
        `Discrepancia de Run ID: Se esperaba ${expectedRunId} pero el archivo contiene ${parsed.header.run_id}.`
      );
    }

    const recordedChecksum = parsed.header.checksum;
    const headerCopy = { ...parsed.header };
    delete (headerCopy as { checksum?: string }).checksum;

    const computedChecksum = LedgerManager.computeChecksum({
      header: headerCopy,
      entries: parsed.entries,
      auth_users: parsed.auth_users,
    });

    if (recordedChecksum !== computedChecksum) {
      throw new LedgerIntegrityPanicError(
        `CORRUPCIÓN DETECTADA: El hash SHA-256 grabado (${recordedChecksum}) no coincide con el calculado (${computedChecksum}).`
      );
    }

    const instance = new LedgerManager(filePath, parsed.header.run_id, parsed.header.run_nonce);
    instance.ledger = parsed;
    return instance;
  }

  public getLedger(): Readonly<ExecutionLedger> {
    return this.ledger;
  }

  public getRunId(): string {
    return this.ledger.header.run_id;
  }

  public getRunNonce(): string {
    return this.ledger.header.run_nonce;
  }

  public getGlobalStatus(): SagaState {
    return this.ledger.header.global_status;
  }

  public setGlobalStatus(status: SagaState): void {
    this.ledger.header.global_status = status;
    this.persist();
  }

  public recordIntent(opId: string, table: AllowedTableName, requestedIds: string[]): LedgerEntry {
    const existing = this.ledger.entries.find((e) => e.op_id === opId);
    if (existing) {
      throw new LedgerIntegrityPanicError(`op_id duplicado detectado en el ledger: ${opId}`);
    }

    const entry: LedgerEntry = {
      op_id: opId,
      run_id: this.ledger.header.run_id,
      table,
      requested_ids: [...requestedIds],
      returned_ids: [],
      status: 'INTENT_SENT',
      intent_at: new Date().toISOString(),
      persisted_disk_sync: false,
    };

    this.ledger.entries.push(entry);
    this.persist();
    entry.persisted_disk_sync = true;
    return entry;
  }

  public recordConfirmation(
    opId: string,
    returnedIds: string[],
    responsePayloadHash?: string
  ): void {
    const entry = this.ledger.entries.find((e) => e.op_id === opId);
    if (!entry) {
      throw new LedgerIntegrityPanicError(`No se encontró entry para op_id ${opId}`);
    }

    entry.returned_ids = [...returnedIds];
    entry.response_hash_sha256 = responsePayloadHash;
    entry.status = 'CONFIRMED';
    entry.confirmed_at = new Date().toISOString();
    this.persist();
  }

  public recordStatus(opId: string, status: LedgerStatus, error?: string): void {
    const entry = this.ledger.entries.find((e) => e.op_id === opId);
    if (!entry) {
      throw new LedgerIntegrityPanicError(`No se encontró entry para op_id ${opId}`);
    }

    entry.status = status;
    if (error) {
      entry.error = error;
    }
    this.persist();
  }

  public recordAuthUserIntent(userId: string, email: string): void {
    const existing = this.ledger.auth_users.find((u) => u.user_id === userId);
    if (!existing) {
      this.ledger.auth_users.push({
        user_id: userId,
        email,
        status: 'PENDING',
      });
      this.persist();
    }
  }

  public recordAuthUserConfirmed(userId: string): void {
    const user = this.ledger.auth_users.find((u) => u.user_id === userId);
    if (user) {
      user.status = 'CONFIRMED';
      user.confirmed_at = new Date().toISOString();
      this.persist();
    }
  }

  public recordAuthUserDeleted(userId: string): void {
    const user = this.ledger.auth_users.find((u) => u.user_id === userId);
    if (user) {
      user.status = 'DELETED';
      user.deleted_at = new Date().toISOString();
      this.persist();
    }
  }

  public getConfirmedIds(table: AllowedTableName): string[] {
    const ids: string[] = [];
    for (const entry of this.ledger.entries) {
      if (entry.table === table && entry.status === 'CONFIRMED') {
        ids.push(...entry.returned_ids);
      }
    }
    return Array.from(new Set(ids));
  }

  public hasUnresolvedOperations(): boolean {
    return this.ledger.entries.some(
      (e) =>
        e.status === 'INTENT_SENT' ||
        e.status === 'IN_DOUBT' ||
        e.status === 'AMBIGUOUS' ||
        e.status === 'RECONCILIATION_REQUIRED'
    );
  }

  public persist(): void {
    const parentDir = path.dirname(this.filePath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    this.ledger.header.updated_at = new Date().toISOString();

    const headerCopy = { ...this.ledger.header };
    delete (headerCopy as { checksum?: string }).checksum;

    const computed = LedgerManager.computeChecksum({
      header: headerCopy,
      entries: this.ledger.entries,
      auth_users: this.ledger.auth_users,
    });
    this.ledger.header.checksum = computed;

    const tmpPath = `${this.filePath}.tmp.${process.pid}.${Date.now()}`;
    const payload = JSON.stringify(this.ledger, null, 2);

    const fd = fs.openSync(tmpPath, 'w', 0o600);
    try {
      fs.writeFileSync(fd, payload, 'utf-8');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }

    fs.renameSync(tmpPath, this.filePath);

    try {
      const dirFd = fs.openSync(parentDir, 'r');
      try {
        fs.fsyncSync(dirFd);
      } finally {
        fs.closeSync(dirFd);
      }
    } catch {
      // Ignorar si el SO no soporta fsync de directorio
    }
  }
}
