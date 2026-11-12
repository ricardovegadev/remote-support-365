/**
 * tools/security-runner/constants.ts
 *
 * Constantes canónicas, identificadores deterministas (RFC 4122 v4)
 * y definición de los 22 elementos de unicidad de la migración core.
 */

import type { ActorDefinition, AllowedTableName, UniqueConstraintDefinition } from './types.ts';

export const TARGET_SUPABASE_PROJECT_REF = 'nkjdkhsnpmyoznxegcxe';
export const TARGET_SUPABASE_URL = 'https://nkjdkhsnpmyoznxegcxe.supabase.co';

export const ORG_ALFA_ID = 'a1fa0000-0000-4000-8000-000000000001';
export const ORG_BETA_ID = 'be7a0000-0000-4000-8000-000000000001';

export const ORG_ALFA_SLUG = 'org-alfa-test';
export const ORG_BETA_SLUG = 'org-beta-test';

export const ACTORS: Record<string, ActorDefinition> = {
  A: {
    key: 'A',
    id: 'a1fa0000-0000-4000-8000-00000000000a',
    email: 'test-owner-alfa@internal.test',
    roleDescription: 'Owner en Org Alfa',
    tenantOrganizationId: ORG_ALFA_ID,
    expectedAccessLevel: 'Acceso total a Org Alfa',
  },
  B: {
    key: 'B',
    id: 'be7a0000-0000-4000-8000-00000000000b',
    email: 'test-tech-beta@internal.test',
    roleDescription: 'Technician Internal en Org Beta',
    tenantOrganizationId: ORG_BETA_ID,
    expectedAccessLevel: 'Acceso técnico asignado en Org Beta; cero acceso a Org Alfa',
  },
  C: {
    key: 'C',
    id: 'a1fa0000-0000-4000-8000-00000000000c',
    email: 'test-client-alfa@portal.test',
    roleDescription: 'Client Admin Portal para Cliente C1 en Org Alfa',
    tenantOrganizationId: ORG_ALFA_ID,
    expectedAccessLevel: 'Solo tickets de Cliente C1; cero comentarios internos ni dispositivos',
  },
  D: {
    key: 'D',
    id: 'a1fa0000-0000-4000-8000-00000000000d',
    email: 'test-tech-ext-alfa@external.test',
    roleDescription: 'Technician External en Org Alfa',
    tenantOrganizationId: ORG_ALFA_ID,
    expectedAccessLevel: 'Solo tickets asignados; cero comentarios internos y cero sesiones',
  },
  E: {
    key: 'E',
    id: 'a1fa0000-0000-4000-8000-00000000000e',
    email: 'test-suspended-alfa@internal.test',
    roleDescription: 'Technician Internal con status suspended en Org Alfa',
    tenantOrganizationId: ORG_ALFA_ID,
    expectedAccessLevel: 'Cero acceso por membresía suspendida',
  },
  F: {
    key: 'F',
    id: 'f0000000-0000-4000-8000-00000000000f',
    email: 'test-orphan-f@external.test',
    roleDescription: 'Usuario autenticado huérfano sin organizaciones ni portal',
    tenantOrganizationId: undefined,
    expectedAccessLevel: 'Cero acceso a tickets de cualquier organización vía RLS',
  },
};

export const SEED_ENTITIES = {
  clients: {
    c1: 'a1fa0000-0000-4000-8000-000000010001',
    c2: 'a1fa0000-0000-4000-8000-000000010002',
    cb1: 'be7a0000-0000-4000-8000-000000010001',
  },
  contacts: {
    c1: 'a1fa0000-0000-4000-8000-000000020001',
    c2: 'a1fa0000-0000-4000-8000-000000020002',
    cb1: 'be7a0000-0000-4000-8000-000000020001',
  },
  memberships: {
    a: 'a1fa0000-0000-4000-8000-00000003000a',
    b: 'be7a0000-0000-4000-8000-00000003000b',
    d: 'a1fa0000-0000-4000-8000-00000003000d',
    e: 'a1fa0000-0000-4000-8000-00000003000e',
  },
  invitations: {
    inv101: 'a1fa0000-0000-4000-8000-000000110001',
    tokenHash101: 'token-hash-alfa-inv-101',
  },
  techProfiles: {
    b: 'be7a0000-0000-4000-8000-00000004000b',
    d: 'a1fa0000-0000-4000-8000-00000004000d',
  },
  portalMemberships: {
    c: 'a1fa0000-0000-4000-8000-00000005000c',
  },
  devices: {
    d1: 'a1fa0000-0000-4000-8000-000000060001',
    d1HwId: 'hw-id-alfa-d1',
    db1: 'be7a0000-0000-4000-8000-000000060001',
    db1HwId: 'hw-id-beta-db1',
  },
  tickets: {
    t101: 'a1fa0000-0000-4000-8000-000000070101',
    t101Number: 900101,
    t102: 'a1fa0000-0000-4000-8000-000000070102',
    t102Number: 900102,
    t201: 'be7a0000-0000-4000-8000-000000070201',
    t201Number: 900201,
    t202: 'be7a0000-0000-4000-8000-000000070202',
    t202Number: 900202,
  },
  assignments: {
    a101: 'a1fa0000-0000-4000-8000-000000080101',
    a201: 'be7a0000-0000-4000-8000-000000080201',
  },
  comments: {
    c101Pub: 'a1fa0000-0000-4000-8000-000000090001',
    c101Priv: 'a1fa0000-0000-4000-8000-000000090002',
  },
  attachments: {
    att101Pub: 'a1fa0000-0000-4000-8000-0000000a0001',
    att101PubStoragePath: 'a1fa0000-0000-4000-8000-000000000001/tickets/a1fa0000-0000-4000-8000-000000070101/pub.pdf',
    att101Priv: 'a1fa0000-0000-4000-8000-0000000a0002',
    att101PrivStoragePath: 'a1fa0000-0000-4000-8000-000000000001/tickets/a1fa0000-0000-4000-8000-000000070101/priv.pdf',
  },
  transitions: {
    tr101: 'a1fa0000-0000-4000-8000-0000000b0001',
    tr201: 'be7a0000-0000-4000-8000-0000000b0001',
  },
  sessionRequests: {
    req101: 'a1fa0000-0000-4000-8000-0000000c0101',
    req201: 'be7a0000-0000-4000-8000-0000000c0201',
  },
  sessionAttempts: {
    att101_1: 'a1fa0000-0000-4000-8000-0000000d0101',
    att101_2: 'a1fa0000-0000-4000-8000-0000000d0102',
    att201_1: 'be7a0000-0000-4000-8000-0000000d0201',
  },
  sessions: {
    s101: 'a1fa0000-0000-4000-8000-0000000e0101',
    s102: 'a1fa0000-0000-4000-8000-0000000e0102',
    s201: 'be7a0000-0000-4000-8000-0000000e0201',
  },
  consents: {
    cons101: 'a1fa0000-0000-4000-8000-0000000f0101',
  },
  revocations: {
    rev101: 'a1fa0000-0000-4000-8000-000000100101',
  },
};

/**
 * Orden topológico inverso estricto (de hojas a raíces) para eliminación segura.
 */
export const TEARDOWN_TOPOLOGICAL_ORDER: AllowedTableName[] = [
  'consent_revocations',
  'session_consents',
  'remote_sessions',
  'remote_session_attempts',
  'remote_session_requests',
  'ticket_transitions',
  'ticket_attachments',
  'ticket_comments',
  'ticket_assignments',
  'tickets',
  'devices',
  'client_portal_memberships',
  'client_contacts',
  'clients',
  'technician_profiles',
  'organization_invitations',
  'organization_members',
  'organizations',
  'profiles',
];

/**
 * Los 22 elementos de unicidad (19 restricciones UNIQUE + 3 índices únicos parciales)
 * conciliados literalmente contra supabase/migrations/20261109140000_initial_core.sql.
 */
export const UNIQUE_CONSTRAINTS_REGISTRY: UniqueConstraintDefinition[] = [
  {
    table: 'organizations',
    name: 'organizations_slug_key',
    columns: ['slug'],
    isPartialIndex: false,
    checkType: 'CONSTRAINT_UNIQUE',
    consequenceOfCollision: 'Fallo al insertar organización con slug duplicado (23505)',
  },
  {
    table: 'organization_members',
    name: 'organization_members_organization_id_user_id_key',
    columns: ['organization_id', 'user_id'],
    isPartialIndex: false,
    checkType: 'CONSTRAINT_UNIQUE',
    consequenceOfCollision: 'Membresía duplicada para el usuario en la organización',
  },
  {
    table: 'organization_members',
    name: 'organization_members_organization_id_id_key',
    columns: ['organization_id', 'id'],
    isPartialIndex: false,
    checkType: 'CONSTRAINT_UNIQUE',
    consequenceOfCollision: 'Conflicto en tupla candidata compuesta (organization_id, id)',
  },
  {
    table: 'organization_members',
    name: 'organization_one_active_owner_idx',
    columns: ['organization_id'],
    whereClause: "role = 'owner' AND status = 'active'",
    isPartialIndex: true,
    checkType: 'PARTIAL_UNIQUE_INDEX',
    consequenceOfCollision: 'Violación de la regla de negocio: solo un owner activo por organización',
  },
  {
    table: 'organization_invitations',
    name: 'organization_invitations_token_hash_key',
    columns: ['token_hash'],
    isPartialIndex: false,
    checkType: 'CONSTRAINT_UNIQUE',
    consequenceOfCollision: 'Colisión en token seguro de invitación',
  },
  {
    table: 'organization_invitations',
    name: 'organization_invitations_pending_email_idx',
    columns: ['organization_id', 'lower(email)'],
    whereClause: "status = 'pending'",
    isPartialIndex: true,
    checkType: 'PARTIAL_UNIQUE_INDEX',
    consequenceOfCollision: 'Invitación pendiente duplicada para el mismo correo en el tenant',
  },
  {
    table: 'technician_profiles',
    name: 'technician_profiles_organization_id_user_id_key',
    columns: ['organization_id', 'user_id'],
    isPartialIndex: false,
    checkType: 'CONSTRAINT_UNIQUE',
    consequenceOfCollision: 'Perfil técnico duplicado para el miembro en la organización',
  },
  {
    table: 'clients',
    name: 'clients_organization_id_id_key',
    columns: ['organization_id', 'id'],
    isPartialIndex: false,
    checkType: 'CONSTRAINT_UNIQUE',
    consequenceOfCollision: 'Conflicto en clave candidata compuesta de cliente',
  },
  {
    table: 'client_portal_memberships',
    name: 'client_portal_memberships_organization_id_client_id_user_id_key',
    columns: ['organization_id', 'client_id', 'user_id'],
    isPartialIndex: false,
    checkType: 'CONSTRAINT_UNIQUE',
    consequenceOfCollision: 'Asignación portal duplicada para el cliente',
  },
  {
    table: 'client_portal_memberships',
    name: 'client_portal_memberships_organization_id_user_id_key',
    columns: ['organization_id', 'user_id'],
    isPartialIndex: false,
    checkType: 'CONSTRAINT_UNIQUE',
    consequenceOfCollision: 'Un usuario no puede tener múltiples membresías portal en el mismo tenant',
  },
  {
    table: 'devices',
    name: 'devices_organization_id_id_client_id_key',
    columns: ['organization_id', 'id', 'client_id'],
    isPartialIndex: false,
    checkType: 'CONSTRAINT_UNIQUE',
    consequenceOfCollision: 'Conflicto de clave compuesta de dispositivo',
  },
  {
    table: 'tickets',
    name: 'tickets_organization_id_id_key',
    columns: ['organization_id', 'id'],
    isPartialIndex: false,
    checkType: 'CONSTRAINT_UNIQUE',
    consequenceOfCollision: 'Conflicto de clave candidata compuesta de ticket',
  },
  {
    table: 'tickets',
    name: 'tickets_organization_id_id_client_id_key',
    columns: ['organization_id', 'id', 'client_id'],
    isPartialIndex: false,
    checkType: 'CONSTRAINT_UNIQUE',
    consequenceOfCollision: 'Conflicto en relación compuesta ticket-cliente',
  },
  {
    table: 'tickets',
    name: 'tickets_organization_id_ticket_number_key',
    columns: ['organization_id', 'ticket_number'],
    isPartialIndex: false,
    checkType: 'CONSTRAINT_UNIQUE',
    consequenceOfCollision: 'Colisión con número secuencial de ticket preexistente',
  },
  {
    table: 'ticket_assignments',
    name: 'ticket_assignments_one_active_member_idx',
    columns: ['organization_id', 'ticket_id', 'membership_id'],
    whereClause: "status IN ('active', 'accepted')",
    isPartialIndex: true,
    checkType: 'PARTIAL_UNIQUE_INDEX',
    consequenceOfCollision: 'No pueden coexistir dos asignaciones activas para el mismo técnico en el ticket',
  },
  {
    table: 'ticket_attachments',
    name: 'ticket_attachments_storage_path_key',
    columns: ['storage_path'],
    isPartialIndex: false,
    checkType: 'CONSTRAINT_UNIQUE',
    consequenceOfCollision: 'Ruta de almacenamiento lógico duplicada',
  },
  {
    table: 'remote_session_requests',
    name: 'remote_session_requests_organization_id_id_key',
    columns: ['organization_id', 'id'],
    isPartialIndex: false,
    checkType: 'CONSTRAINT_UNIQUE',
    consequenceOfCollision: 'Conflicto en clave candidata compuesta de solicitud remota',
  },
  {
    table: 'remote_session_requests',
    name: 'remote_session_requests_organization_id_id_device_id_key',
    columns: ['organization_id', 'id', 'device_id'],
    isPartialIndex: false,
    checkType: 'CONSTRAINT_UNIQUE',
    consequenceOfCollision: 'Conflicto en relación compuesta solicitud-dispositivo',
  },
  {
    table: 'remote_session_attempts',
    name: 'remote_session_attempts_organization_id_id_request_id_key',
    columns: ['organization_id', 'id', 'request_id'],
    isPartialIndex: false,
    checkType: 'CONSTRAINT_UNIQUE',
    consequenceOfCollision: 'Conflicto en clave candidata compuesta de intento',
  },
  {
    table: 'remote_session_attempts',
    name: 'remote_session_attempts_organization_id_request_id_attempt_number_key',
    columns: ['organization_id', 'request_id', 'attempt_number'],
    isPartialIndex: false,
    checkType: 'CONSTRAINT_UNIQUE',
    consequenceOfCollision: 'Secuencia de intento duplicada para la misma solicitud remota',
  },
  {
    table: 'session_consents',
    name: 'session_consents_organization_id_id_key',
    columns: ['organization_id', 'id'],
    isPartialIndex: false,
    checkType: 'CONSTRAINT_UNIQUE',
    consequenceOfCollision: 'Conflicto en clave candidata compuesta de consentimiento',
  },
  {
    table: 'consent_revocations',
    name: 'consent_revocations_consent_id_key',
    columns: ['consent_id'],
    isPartialIndex: false,
    checkType: 'CONSTRAINT_UNIQUE',
    consequenceOfCollision: 'Violación de la regla: solo puede existir una revocación por consentimiento',
  },
];
