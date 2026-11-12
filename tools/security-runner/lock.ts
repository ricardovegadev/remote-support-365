/**
 * tools/security-runner/lock.ts
 *
 * Mecanismo de exclusión mutua local (Mutex File Lock)
 * para evitar ejecuciones concurrentes del runner.
 */

import fs from 'node:fs';
import path from 'node:path';

export interface LockInfo {
  pid: number;
  runId: string;
  acquiredAt: string;
}

export class ConcurrentExecutionBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConcurrentExecutionBlockedError';
  }
}

export class ProcessLockManager {
  private lockFilePath: string;
  private isLocked = false;

  constructor(lockFilePath: string) {
    this.lockFilePath = lockFilePath;
  }

  public acquire(runId: string): void {
    const parentDir = path.dirname(this.lockFilePath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    const lockData: LockInfo = {
      pid: process.pid,
      runId,
      acquiredAt: new Date().toISOString(),
    };

    try {
      // O_CREAT | O_EXCL garantiza atomicidad de creación en el sistema de archivos
      const fd = fs.openSync(this.lockFilePath, 'wx', 0o600);
      fs.writeFileSync(fd, JSON.stringify(lockData, null, 2), 'utf-8');
      fs.fsyncSync(fd);
      fs.closeSync(fd);
      this.isLocked = true;
    } catch (err: unknown) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === 'EEXIST') {
        // El archivo de lock ya existe. Comprobar si el proceso dueño sigue con vida
        this.handleExistingLock(runId);
      } else {
        throw error;
      }
    }
  }

  private handleExistingLock(runId: string): void {
    let existingLock: LockInfo | null = null;
    try {
      const raw = fs.readFileSync(this.lockFilePath, 'utf-8');
      existingLock = JSON.parse(raw) as LockInfo;
    } catch {
      // Archivo corrupto o ilegible; tratar como lock activo por precaución
    }

    if (existingLock && existingLock.pid) {
      let isProcessAlive: boolean;
      try {
        // Enviar señal 0 para verificar existencia del proceso
        process.kill(existingLock.pid, 0);
        isProcessAlive = true;
      } catch (e: unknown) {
        const killErr = e as NodeJS.ErrnoException;
        isProcessAlive = killErr.code !== 'ESRCH';
      }

      if (isProcessAlive) {
        throw new ConcurrentExecutionBlockedError(
          `BLOQUEO ACTIVO: Otra ejecución del runner (PID ${existingLock.pid}, RunId ${existingLock.runId}) se encuentra en curso desde ${existingLock.acquiredAt}.`
        );
      } else {
        // El proceso anterior murió sin liberar el lock (Stale Lock)
        try {
          fs.unlinkSync(this.lockFilePath);
          // Reintentar adquisición
          this.acquire(runId);
          return;
        } catch {
          throw new ConcurrentExecutionBlockedError(
            `BLOQUEO ACTIVO: No se pudo limpiar el lock huérfano en ${this.lockFilePath}.`
          );
        }
      }
    }

    throw new ConcurrentExecutionBlockedError(
      `BLOQUEO ACTIVO: Existe un archivo de lock en ${this.lockFilePath} que impide ejecuciones concurrentes.`
    );
  }

  public release(): void {
    if (this.isLocked) {
      try {
        if (fs.existsSync(this.lockFilePath)) {
          fs.unlinkSync(this.lockFilePath);
        }
      } catch {
        // Error silencioso en liberación final
      } finally {
        this.isLocked = false;
      }
    }
  }
}
