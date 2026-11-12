/**
 * tools/security-runner/tests/run-all.ts
 *
 * Suite de pruebas unitarias y de integración local para el runner de seguridad.
 * Valida todas las garantías del ledger, concurrencia, preflight, propiedad,
 * set equality y saga de Auth sin tocar Supabase DEV ni la base de datos remota.
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { ProcessLockManager, ConcurrentExecutionBlockedError } from '../lock.ts';
import { LedgerManager, LedgerIntegrityPanicError } from '../ledger.ts';
import {
  AuthPreflightManager,
  AuthPreflightCollisionError,
  AuthPreflightExecutionError,
  type AuthClientInterface,
} from '../preflight-auth.ts';
import { OwnershipVerifier, AmbiguousOwnershipError } from '../ownership.ts';
import { TeardownSqlManager, TeardownSetMismatchError } from '../teardown-sql.ts';
import { SagaAuthManager, type AuthAdminClient } from '../saga-auth.ts';
import { DbPreflightManager, type DbInspectionClient } from '../preflight-db.ts';
import { ACTORS, SEED_ENTITIES } from '../constants.ts';
import type { AllowedTableName } from '../types.ts';
import {
  validateTechnicianAvailability,
  calculateTechnicianWorkload,
  atomicAcceptAssignment,
} from '../../../src/lib/workforce/dispatch-service.ts';
import type {
  TechnicianProfileRow,
  TechnicianScheduleRow,
  TechnicianUnavailabilityRow,
  TicketAssignmentRow,
} from '../../../src/types/database.ts';

const testDir = path.join(os.tmpdir(), `rs365-tests-${Date.now()}`);
fs.mkdirSync(testDir, { recursive: true });

let passedCount = 0;
let failedCount = 0;

async function runTest(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passedCount++;
  } catch (err: unknown) {
    const error = err as Error;
    console.error(`  ✗ ${name}`);
    console.error(`    ${error.stack || error.message}`);
    failedCount++;
  }
}

console.log('\n======================================================');
console.log('EJECUCIÓN DEL SUITE LOCAL DE SEGURIDAD (FASE 3.9)');
console.log('======================================================\n');

// 1. Tests de Concurrencia (ProcessLockManager)
console.log('[1/7] Pruebas de Bloqueo de Concurrencia Local:');
await runTest('Adquiere lock correctamente y genera archivo', () => {
  const lockFile = path.join(testDir, 'test-lock-1.lock');
  const lock = new ProcessLockManager(lockFile);
  lock.acquire('run-test-1');
  assert.strictEqual(fs.existsSync(lockFile), true);
  lock.release();
  assert.strictEqual(fs.existsSync(lockFile), false);
});

await runTest('Bloquea segunda adquisición concurrente', () => {
  const lockFile = path.join(testDir, 'test-lock-2.lock');
  const lock1 = new ProcessLockManager(lockFile);
  lock1.acquire('run-test-2a');

  const lock2 = new ProcessLockManager(lockFile);
  assert.throws(
    () => lock2.acquire('run-test-2b'),
    (err: unknown) => err instanceof ConcurrentExecutionBlockedError
  );

  lock1.release();
});

// 2. Tests de Ledger Persistente (LedgerManager)
console.log('\n[2/7] Pruebas de Ledger Persistente y Durabilidad:');
await runTest('Crea ledger, persiste atómicamente y verifica SHA-256', () => {
  const ledgerPath = path.join(testDir, 'test-ledger-1.json');
  const lm = new LedgerManager(ledgerPath, 'run-101', 'nonce-abc');
  lm.persist();

  assert.strictEqual(fs.existsSync(ledgerPath), true);
  const loaded = LedgerManager.loadAndVerify(ledgerPath, 'run-101');
  assert.strictEqual(loaded.getRunId(), 'run-101');
  assert.strictEqual(loaded.getRunNonce(), 'nonce-abc');
});

await runTest('Detecta corrupción en el archivo del ledger', () => {
  const ledgerPath = path.join(testDir, 'test-ledger-corrupt.json');
  const lm = new LedgerManager(ledgerPath, 'run-corrupt', 'nonce-xyz');
  lm.persist();

  // Alterar deliberadamente el contenido sin actualizar checksum
  const raw = fs.readFileSync(ledgerPath, 'utf-8');
  const altered = raw.replace('"SQL_PENDING"', '"CORRUPTED_STATUS"');
  fs.writeFileSync(ledgerPath, altered, 'utf-8');

  assert.throws(
    () => LedgerManager.loadAndVerify(ledgerPath, 'run-corrupt'),
    (err: unknown) => err instanceof LedgerIntegrityPanicError
  );
});

await runTest('Registra INTENT_SENT y confirmación síncrona', () => {
  const ledgerPath = path.join(testDir, 'test-ledger-intent.json');
  const lm = new LedgerManager(ledgerPath, 'run-intent', 'nonce-123');

  lm.recordIntent('op-1', 'tickets', [SEED_ENTITIES.tickets.t101]);
  assert.strictEqual(lm.hasUnresolvedOperations(), true);

  lm.recordConfirmation('op-1', [SEED_ENTITIES.tickets.t101], 'hash-456');
  assert.strictEqual(lm.hasUnresolvedOperations(), false);

  const confirmed = lm.getConfirmedIds('tickets');
  assert.deepStrictEqual(confirmed, [SEED_ENTITIES.tickets.t101]);
});

// 3. Tests de Preflight Auth (AuthPreflightManager)
console.log('\n[3/7] Pruebas de Preflight para Supabase Auth:');
await runTest('Confirma inexistencia únicamente ante 404 y user_not_found', async () => {
  const mockAuth: AuthClientInterface = {
    admin: {
      async getUserById() {
        return {
          data: { user: null },
          error: { status: 404, code: 'user_not_found', message: 'User not found' },
        };
      },
      async listUsers() {
        return { data: { users: [] }, error: null };
      },
    },
  };

  const preflight = new AuthPreflightManager(mockAuth);
  await preflight.verifyUserDoesNotExist('a1fa0000-0000-4000-8000-00000000000a');
});

await runTest('Detecta colisión fatal si el usuario existe previamente', async () => {
  const mockAuth: AuthClientInterface = {
    admin: {
      async getUserById(id: string) {
        return {
          data: { user: { id, email: 'collision@internal.test' } },
          error: null,
        };
      },
      async listUsers() {
        return { data: { users: [] }, error: null };
      },
    },
  };

  const preflight = new AuthPreflightManager(mockAuth);
  await assert.rejects(
    () => preflight.verifyUserDoesNotExist('a1fa0000-0000-4000-8000-00000000000a'),
    (err: unknown) => err instanceof AuthPreflightCollisionError
  );
});

await runTest('Aborta preflight si ocurre error de red o servidor en getUserById', async () => {
  const mockAuth: AuthClientInterface = {
    admin: {
      async getUserById() {
        return {
          data: null,
          error: { status: 500, code: 'internal_server_error', message: 'Database connection failed' },
        };
      },
      async listUsers() {
        return { data: { users: [] }, error: null };
      },
    },
  };

  const preflight = new AuthPreflightManager(mockAuth);
  await assert.rejects(
    () => preflight.verifyUserDoesNotExist('a1fa0000-0000-4000-8000-00000000000a'),
    (err: unknown) => err instanceof AuthPreflightExecutionError
  );
});

await runTest('Verifica propiedad server-side en app_metadata vs user_metadata', () => {
  const mockAuth: AuthClientInterface = {
    admin: {
      getUserById: async () => ({ data: { user: null }, error: null }),
      listUsers: async () => ({ data: { users: [] }, error: null }),
    },
  };
  const preflight = new AuthPreflightManager(mockAuth);

  const ownedUser = {
    id: 'user-1',
    app_metadata: { rs365_seed_run_id: 'run-target', rs365_seed_nonce: 'nonce-target' },
    user_metadata: { fake_key: 'ignored' },
  };
  assert.strictEqual(preflight.verifyOwnership(ownedUser, 'run-target', 'nonce-target'), 'OWNED');

  const foreignUser = {
    id: 'user-2',
    app_metadata: { rs365_seed_run_id: 'run-other', rs365_seed_nonce: 'nonce-other' },
  };
  assert.strictEqual(preflight.verifyOwnership(foreignUser, 'run-target', 'nonce-target'), 'FOREIGN');
});

// 4. Tests de Verificación de Propiedad (OwnershipVerifier)
console.log('\n[4/7] Pruebas de Verificación Relacional de Propiedad:');
await runTest('Aprueba entidades legítimamente vinculadas a la corrida', () => {
  const confirmed = new Map<AllowedTableName, Set<string>>([
    ['organizations', new Set([ACTORS.A.tenantOrganizationId!])],
    ['tickets', new Set([SEED_ENTITIES.tickets.t101])],
  ]);
  const verifier = new OwnershipVerifier(confirmed, new Set([ACTORS.A.tenantOrganizationId!]));

  const status = verifier.evaluateOwnership({
    id: SEED_ENTITIES.tickets.t101,
    table: 'tickets',
    organizationId: ACTORS.A.tenantOrganizationId!,
    parentId: {
      table: 'organizations',
      id: ACTORS.A.tenantOrganizationId!,
    },
  });
  assert.strictEqual(status, 'OWNED');
});

await runTest('Bloquea como AMBIGUOUS si una relación apunta a un registro ajeno', () => {
  const confirmed = new Map<AllowedTableName, Set<string>>([
    ['organizations', new Set([ACTORS.A.tenantOrganizationId!])],
    ['tickets', new Set([SEED_ENTITIES.tickets.t101])],
  ]);
  const verifier = new OwnershipVerifier(confirmed, new Set([ACTORS.A.tenantOrganizationId!]));

  const status = verifier.evaluateOwnership({
    id: SEED_ENTITIES.tickets.t101,
    table: 'tickets',
    organizationId: ACTORS.A.tenantOrganizationId!,
    parentId: {
      table: 'organizations',
      id: 'foreign-org-id', // ID foráneo no confirmado
    },
  });
  assert.strictEqual(status, 'AMBIGUOUS');

  assert.throws(
    () =>
      verifier.assertBatchOwnership([
        {
          id: SEED_ENTITIES.tickets.t101,
          table: 'tickets',
          organizationId: ACTORS.A.tenantOrganizationId!,
          parentId: { table: 'organizations', id: 'foreign-org-id' },
        },
      ]),
    (err: unknown) => err instanceof AmbiguousOwnershipError
  );
});

// 5. Tests de Set Equality en Teardown (TeardownSqlManager)
console.log('\n[5/7] Pruebas de Igualdad Exacta de Conjuntos (Set Equality):');
await runTest('Valida igualdad exacta biyectiva exitosamente', () => {
  TeardownSqlManager.assertExactSetEquality(
    'tickets',
    ['id-1', 'id-2'],
    ['id-2', 'id-1'] // Mismo conjunto en orden distinto
  );
});

await runTest('Lanza excepción si la base de datos eliminó menos filas de las esperadas', () => {
  assert.throws(
    () => TeardownSqlManager.assertExactSetEquality('tickets', ['id-1', 'id-2'], ['id-1']),
    (err: unknown) => err instanceof TeardownSetMismatchError
  );
});

await runTest('Lanza alarma crítica si se eliminó un ID ajeno no autorizado', () => {
  assert.throws(
    () => TeardownSqlManager.assertExactSetEquality('tickets', ['id-1'], ['id-1', 'foreign-id-unexpected']),
    (err: unknown) => err instanceof TeardownSetMismatchError
  );
});

// 6. Tests de Máquina de Estados Saga de Auth (SagaAuthManager)
console.log('\n[6/7] Pruebas de la Máquina de Estados Saga de Auth:');
await runTest('Flujo normal: SQL_PENDING -> SQL_COMMITTED -> AUTH_COMPLETED', async () => {
  const ledgerPath = path.join(testDir, 'saga-test-1.json');
  const lm = new LedgerManager(ledgerPath, 'run-saga', 'nonce-saga');
  lm.persist();

  const mockAdmin: AuthAdminClient = {
    deleteUser: async () => ({ error: null }),
  };

  const saga = new SagaAuthManager(lm, mockAdmin);
  assert.strictEqual(saga.getState(), 'SQL_PENDING');

  saga.onSqlTransactionCommitted();
  assert.strictEqual(saga.getState(), 'AUTH_CLEANUP_PENDING');

  const res = await saga.executeAuthCleanup(['user-1', 'user-2']);
  assert.strictEqual(res.success, true);
  assert.strictEqual(saga.getState(), 'AUTH_COMPLETED');
});

await runTest('Manejo de fallo de red en Auth y reanudación idempotente', async () => {
  const ledgerPath = path.join(testDir, 'saga-test-2.json');
  const lm = new LedgerManager(ledgerPath, 'run-saga-partial', 'nonce-saga');
  lm.recordAuthUserIntent('user-1', 'user1@test.com');
  lm.recordAuthUserConfirmed('user-1');
  lm.recordAuthUserIntent('user-2', 'user2@test.com');
  lm.recordAuthUserConfirmed('user-2');
  lm.persist();

  let callCount = 0;
  const mockAdmin: AuthAdminClient = {
    deleteUser: async (userId: string) => {
      callCount++;
      if (userId === 'user-2') {
        return { error: { status: 500, message: 'Temporary network glitch' } };
      }
      return { error: null };
    },
  };

  const saga = new SagaAuthManager(lm, mockAdmin);
  saga.onSqlTransactionCommitted();

  const res1 = await saga.executeAuthCleanup(['user-1', 'user-2']);
  assert.strictEqual(res1.success, false);
  assert.strictEqual(callCount, 2);
  assert.strictEqual(saga.getState(), 'RECOVERY_REQUIRED');

  // Reanudar con el mock restablecido
  const mockRecoveredAdmin: AuthAdminClient = {
    deleteUser: async () => ({ error: null }),
  };
  const recoveredSaga = new SagaAuthManager(lm, mockRecoveredAdmin);
  const res2 = await recoveredSaga.resumePendingAuthCleanup();
  assert.strictEqual(res2.success, true);
  assert.strictEqual(recoveredSaga.getState(), 'AUTH_COMPLETED');
});

// 7. Auditoría del Inventario UNIQUE (DbPreflightManager)
console.log('\n[7/7] Conciliación y Auditoría del Inventario UNIQUE:');
await runTest('Verifica que el registro de unicidad contiene exactamente 22 elementos', () => {
  const mockClient: DbInspectionClient = {
    query: async () => ({ rows: [] }),
  };
  const dbManager = new DbPreflightManager(mockClient);
  const registry = dbManager.getRegistry();

  assert.strictEqual(registry.length, 22);

  const partialIndexes = registry.filter((r) => r.isPartialIndex);
  assert.strictEqual(partialIndexes.length, 3);

  const constraints = registry.filter((r) => !r.isPartialIndex);
  assert.strictEqual(constraints.length, 19);

  // Verificar la existencia de las restricciones críticas conciliadas
  assert.strictEqual(
    registry.some((r) => r.name === 'organization_one_active_owner_idx'),
    true
  );
  assert.strictEqual(
    registry.some((r) => r.name === 'ticket_assignments_one_active_member_idx'),
    true
  );
  assert.strictEqual(
    registry.some((r) => r.name === 'organization_invitations_pending_email_idx'),
    true
  );
});

// 8. Tests de Despacho Atómico y Disponibilidad de Fuerza Técnica (Fase 4.4)
console.log('\n[8/8] Pruebas de Despacho Atómico y Disponibilidad de Fuerza Técnica (Fase 4.4):');

await runTest('Valida disponibilidad operativa y bloquea técnicos no disponibles o en atención', () => {
  const baseProfile: TechnicianProfileRow = {
    id: 'tp-1',
    organization_id: 'org-1',
    user_id: 'user-1',
    availability_status: 'unavailable',
    specialties: ['MikroTik'],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const resUnavailable = validateTechnicianAvailability(baseProfile, [], []);
  assert.strictEqual(resUnavailable.isAvailable, false);
  assert.strictEqual(resUnavailable.isOffDuty, false);

  const busyProfile: TechnicianProfileRow = {
    ...baseProfile,
    availability_status: 'busy',
  };
  const resBusy = validateTechnicianAvailability(busyProfile, [], []);
  assert.strictEqual(resBusy.isAvailable, false);
  assert.strictEqual(resBusy.isOffDuty, false);
});

await runTest('Detecta ausencias programadas e impide asignación incompatible', () => {
  const activeProfile: TechnicianProfileRow = {
    id: 'tp-1',
    organization_id: 'org-1',
    user_id: 'user-1',
    availability_status: 'available',
    specialties: ['Windows'],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const unavail: TechnicianUnavailabilityRow = {
    id: 'unavail-1',
    organization_id: 'org-1',
    technician_profile_id: 'tp-1',
    start_date: new Date('2026-11-10T00:00:00Z').toISOString(),
    end_date: new Date('2026-11-15T23:59:59Z').toISOString(),
    reason: 'Vacaciones legales anuales',
    created_at: new Date().toISOString(),
  };

  // Fecha dentro del rango
  const checkDuring = new Date('2026-11-12T10:00:00Z');
  const resDuring = validateTechnicianAvailability(activeProfile, [unavail], [], checkDuring);
  assert.strictEqual(resDuring.isAvailable, false);
  assert.strictEqual(resDuring.reason?.includes('Vacaciones legales'), true);

  // Fecha fuera del rango
  const checkAfter = new Date('2026-11-18T10:00:00Z');
  const resAfter = validateTechnicianAvailability(activeProfile, [unavail], [], checkAfter);
  assert.strictEqual(resAfter.isAvailable, true);
});

await runTest('Valida horarios laborales semanales e identifica estado fuera de turno (off-duty)', () => {
  const activeProfile: TechnicianProfileRow = {
    id: 'tp-1',
    organization_id: 'org-1',
    user_id: 'user-1',
    availability_status: 'available',
    specialties: ['Redes'],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Horario Lunes (1) de 09:00 a 18:00
  const mondaySchedule: TechnicianScheduleRow = {
    id: 'sch-1',
    organization_id: 'org-1',
    technician_profile_id: 'tp-1',
    day_of_week: 1, // Lunes
    start_time: '09:00:00',
    end_time: '18:00:00',
    is_active: true,
    created_at: new Date().toISOString(),
  };

  // Lunes a las 11:30 (dentro de jornada)
  const mondayMorning = new Date('2026-11-16T11:30:00'); // 2026-11-16 es Lunes
  mondayMorning.setHours(11, 30, 0, 0);
  const resInSchedule = validateTechnicianAvailability(activeProfile, [], [mondaySchedule], mondayMorning);
  assert.strictEqual(resInSchedule.isAvailable, true);
  assert.strictEqual(resInSchedule.isOffDuty, false);

  // Lunes a las 21:00 (fuera de jornada)
  const mondayNight = new Date('2026-11-16T21:00:00');
  mondayNight.setHours(21, 0, 0, 0);
  const resOutSchedule = validateTechnicianAvailability(activeProfile, [], [mondaySchedule], mondayNight);
  assert.strictEqual(resOutSchedule.isAvailable, false);
  assert.strictEqual(resOutSchedule.isOffDuty, true);

  // Domingo (sin horario programado)
  const sunday = new Date('2026-11-15T12:00:00'); // 2026-11-15 es Domingo
  sunday.setHours(12, 0, 0, 0);
  const resSunday = validateTechnicianAvailability(activeProfile, [], [mondaySchedule], sunday);
  assert.strictEqual(resSunday.isAvailable, false);
  assert.strictEqual(resSunday.isOffDuty, true);
});

await runTest('Calcula métricas de carga de trabajo de técnicos de forma exacta', () => {
  const dummyAssignments: TicketAssignmentRow[] = [
    {
      id: 'a-1',
      organization_id: 'org-1',
      ticket_id: 't-1',
      membership_id: 'm-1',
      assigned_by: 'u-admin',
      status: 'active',
      assigned_at: new Date().toISOString(),
      responded_at: null,
    },
    {
      id: 'a-2',
      organization_id: 'org-1',
      ticket_id: 't-2',
      membership_id: 'm-1',
      assigned_by: 'u-admin',
      status: 'accepted',
      assigned_at: new Date().toISOString(),
      responded_at: new Date().toISOString(),
    },
    {
      id: 'a-3',
      organization_id: 'org-1',
      ticket_id: 't-3',
      membership_id: 'm-1',
      assigned_by: 'u-admin',
      status: 'declined',
      assigned_at: new Date().toISOString(),
      responded_at: new Date().toISOString(),
    },
  ];

  const workload = calculateTechnicianWorkload(dummyAssignments);
  assert.strictEqual(workload.activeCount, 1);
  assert.strictEqual(workload.acceptedCount, 1);
  assert.strictEqual(workload.totalPendingCount, 2);
});

await runTest('atomicAcceptAssignment ejecuta RPC accept_ticket_assignment y confirma aceptación transaccional', async () => {
  let invokedRpcName: string | null = null;
  let invokedRpcParams: Record<string, unknown> | null = null;

  const mockClient = {
    rpc: async (name: string, params: Record<string, unknown>) => {
      invokedRpcName = name;
      invokedRpcParams = params;
      return {
        data: {
          success: true,
          assignment_id: 'assign-1',
          ticket_id: 'ticket-100',
          status: 'accepted',
        },
        error: null,
      };
    },
  };

  const result = await atomicAcceptAssignment(
    mockClient as unknown as import('@supabase/supabase-js').SupabaseClient,
    'assign-1',
  );

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.ticketId, 'ticket-100');
  assert.strictEqual(invokedRpcName, 'accept_ticket_assignment');
  assert.deepStrictEqual(invokedRpcParams, { p_assignment_id: 'assign-1' });
});

await runTest('atomicAcceptAssignment rechaza ante conflicto concurrente (23505 / ticket ya aceptado)', async () => {
  const mockClient = {
    rpc: async () => ({
      data: null,
      error: {
        code: '23505',
        message: 'duplicate key value violates unique constraint ticket_assignments_one_accepted_per_ticket_idx (El servicio ya fue aceptado por otro técnico)',
      },
    }),
  };

  const result = await atomicAcceptAssignment(
    mockClient as unknown as import('@supabase/supabase-js').SupabaseClient,
    'assign-loser',
  );

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.message.includes('ya fue aceptado'), true);
});

await runTest('atomicAcceptAssignment rechaza si la RPC no está instalada, prohibiendo fallbacks inseguros en cliente', async () => {
  const mockClient = {
    rpc: async () => ({
      data: null,
      error: {
        code: 'PGRST202',
        message: 'Could not find the function public.accept_ticket_assignment in the schema cache',
      },
    }),
  };

  const result = await atomicAcceptAssignment(
    mockClient as unknown as import('@supabase/supabase-js').SupabaseClient,
    'assign-1',
  );

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.message.includes('no está instalada en Supabase DEV'), true);
});

await runTest('atomicAcceptAssignment rechaza ante violación de permisos (42501 / no autorizado)', async () => {
  const mockClient = {
    rpc: async () => ({
      data: null,
      error: {
        code: '42501',
        message: 'No estás autorizado para aceptar una asignación ajena',
      },
    }),
  };

  const result = await atomicAcceptAssignment(
    mockClient as unknown as import('@supabase/supabase-js').SupabaseClient,
    'assign-foreign',
  );

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.message.includes('No tienes autorización'), true);
});

// Limpieza de directorio temporal
try {
  fs.rmSync(testDir, { recursive: true, force: true });
} catch {
  // Ignorar si el SO mantiene bloqueos breves
}

console.log('\n======================================================');
console.log(`RESUMEN DE PRUEBAS LOCALES: ${passedCount} APROBADAS, ${failedCount} FALLIDAS`);
console.log('======================================================\n');

if (failedCount > 0) {
  process.exit(1);
}
