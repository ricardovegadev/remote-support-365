/**
 * tools/security-runner/cli.ts
 *
 * Punto de entrada del runner administrativo de seguridad.
 * Separa configuración, inspección, ledger, preflight y validación local.
 * Niega operaciones destructivas por defecto y prohíbe escrituras remotas no autorizadas.
 */

import { ACTORS, UNIQUE_CONSTRAINTS_REGISTRY, TEARDOWN_TOPOLOGICAL_ORDER } from './constants.ts';
import { RUNNER_CONFIG } from './config.ts';

function printHeader() {
  console.log('================================================================');
  console.log('REMOTE SUPPORT 365 — RUNNER ADMINISTRATIVO DE SEGURIDAD');
  console.log('================================================================');
  console.log(`Proyecto Supabase DEV: ${RUNNER_CONFIG.projectRef}`);
  console.log(`URL de Conexión:       ${RUNNER_CONFIG.supabaseUrl}`);
  console.log(`Directorio del Ledger: ${RUNNER_CONFIG.ledgerDirectory}`);
  console.log('Modo Actual:           INSPECCIÓN / PREPARACIÓN LOCAL (READ-ONLY)');
  console.log('================================================================\n');
}

function printUsage() {
  console.log('Comandos seguros disponibles:');
  console.log('  node tools/security-runner/cli.ts inspect      Muestra el inventario de actores, UUIDs y restricciones');
  console.log('  node tools/security-runner/cli.ts plan         Imprime el grafo topológico estricto de inserción y teardown');
  console.log('  node tools/security-runner/cli.ts test-local   Ejecuta el conjunto completo de pruebas unitarias locales');
  console.log('\nOperaciones remotas (Seed / Teardown en Supabase DEV):');
  console.log('  [BLOQUEADAS] Requieren autorización explícita posterior del propietario.');
}

function handleInspect() {
  printHeader();
  console.log('1. ACTORES Y PERFILES CONFIGURADOS:');
  for (const [key, actor] of Object.entries(ACTORS)) {
    console.log(`  - [Actor ${key}] ${actor.email} | ID: ${actor.id} | Rol: ${actor.roleDescription}`);
  }

  console.log('\n2. TENANTS CONFIGURADOS:');
  console.log('  - Org Alfa: a1fa0000-0000-4000-8000-000000000001 (slug: org-alfa-test)');
  console.log('  - Org Beta: be7a0000-0000-4000-8000-000000000001 (slug: org-beta-test)');

  console.log('\n3. RESUMEN DE ELEMENTOS DE UNICIDAD (DDL CORE):');
  console.log(`  - Total elementos conciliados: ${UNIQUE_CONSTRAINTS_REGISTRY.length}`);
  console.log(`  - Restricciones UNIQUE de tabla: 19`);
  console.log(`  - Índices Únicos Parciales:      3`);

  console.log('\n4. ESTADO DE SEGURIDAD DEL RUNNER:');
  console.log('  ✓ Separado completamente del bundle del frontend (React/Vite).');
  console.log('  ✓ Cero inclusión de credenciales service_role en el frontend o código versionado.');
  console.log('  ✓ Bloqueo de concurrencia local mediante process lock file.');
  console.log('  ✓ Validación de igualdad exacta de conjuntos (Set Equality) en teardown.');
  console.log('  ✓ Protección total de audit_logs y security_events.');
}

function handlePlan() {
  printHeader();
  console.log('PLAN TOPOLÓGICO DE EJECUCIÓN (FUTURA FASE AUTORIZADA):\n');

  console.log('Fase 1: Preflight Bloqueante (Sin mutación)');
  console.log('  - Verificación directa de los 6 UUIDs en auth.users vía getUserById (404/user_not_found).');
  console.log('  - Paginación acotada con detección de drift (seenIds) para colisiones de correo.');
  console.log('  - Comprobación de las 21 tablas de la base de datos contra los 22 elementos de unicidad.');
  console.log('  - Detección de filas en audit_logs y security_events (Aborto si count > 0).\n');

  console.log('Fase 2: Inserción Raíces a Hojas (Con registro de INTENT en Ledger)');
  console.log('  1. auth.users (app_metadata firmada con run_id y nonce)');
  console.log('  2. public.profiles');
  console.log('  3. public.organizations');
  console.log('  4. public.organization_members');
  console.log('  5. public.technician_profiles');
  console.log('  6. public.clients');
  console.log('  7. public.client_contacts');
  console.log('  8. public.client_portal_memberships');
  console.log('  9. public.devices');
  console.log('  10. public.tickets');
  console.log('  11. public.ticket_assignments');
  console.log('  12. public.ticket_comments');
  console.log('  13. public.ticket_attachments');
  console.log('  14. public.ticket_transitions');
  console.log('  15. public.remote_session_requests');
  console.log('  16. public.remote_session_attempts (Intentos 101, 102, 201)');
  console.log('  17. public.remote_sessions (Sesiones 101, 102, 201)');
  console.log('  18. public.session_consents');
  console.log('  19. public.consent_revocations\n');

  console.log('Fase 3: Teardown Transaccional (Hojas a Raíces dentro de Bloque Atómico)');
  console.log('  - Se eliminan en orden inverso las tablas relacionales:');
  TEARDOWN_TOPOLOGICAL_ORDER.forEach((table, idx) => {
    console.log(`    ${idx + 1}. public.${table} (DELETE ... RETURNING id con validación de conjuntos)`);
  });
  console.log('  - Si cualquier tabla devuelve discrepancia, PostgreSQL ejecuta ROLLBACK total.');
  console.log('  - Solo tras el COMMIT SQL exitoso, la Saga Auth elimina las identidades en GoTrue.');
}

const command = process.argv[2];

switch (command) {
  case 'inspect':
    handleInspect();
    break;
  case 'plan':
    handlePlan();
    break;
  case 'test-local':
    import('./tests/run-all.ts');
    break;
  default:
    printHeader();
    printUsage();
    break;
}
