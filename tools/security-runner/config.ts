/**
 * tools/security-runner/config.ts
 *
 * Configuración de rutas, directorios durables y parámetros de ejecución.
 */

import path from 'node:path';
import os from 'node:os';

export interface RunnerConfig {
  ledgerDirectory: string;
  lockFilePath: string;
  projectRef: string;
  supabaseUrl: string;
  requireExclusiveLock: boolean;
  maxAuthPaginationUsers: number;
  perPageAuth: number;
}

const defaultLedgerDir = path.join(os.homedir(), '.gemini', 'jetski');

export const RUNNER_CONFIG: RunnerConfig = {
  ledgerDirectory: defaultLedgerDir,
  lockFilePath: path.join(defaultLedgerDir, 'rs365-security-runner.lock'),
  projectRef: 'nkjdkhsnpmyoznxegcxe',
  supabaseUrl: 'https://nkjdkhsnpmyoznxegcxe.supabase.co',
  requireExclusiveLock: true,
  maxAuthPaginationUsers: 5000,
  perPageAuth: 100,
};

export function getLedgerFilePath(runId: string, customDir?: string): string {
  const dir = customDir || RUNNER_CONFIG.ledgerDirectory;
  return path.join(dir, `rs365-seed-ledger-${runId}.json`);
}
