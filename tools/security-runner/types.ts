/**
 * tools/security-runner/types.ts
 *
 * Definiciones de tipos para el runner administrativo de pruebas de seguridad,
 * ledger persistente, preflight, verificación de propiedad y saga transaccional.
 */

export type AllowedTableName =
  | 'profiles'
  | 'organizations'
  | 'organization_members'
  | 'organization_invitations'
  | 'technician_profiles'
  | 'clients'
  | 'client_contacts'
  | 'client_portal_memberships'
  | 'devices'
  | 'tickets'
  | 'ticket_assignments'
  | 'ticket_comments'
  | 'ticket_attachments'
  | 'ticket_transitions'
  | 'remote_session_requests'
  | 'remote_session_attempts'
  | 'remote_sessions'
  | 'session_consents'
  | 'consent_revocations'
  | 'audit_logs'
  | 'security_events';

export type LedgerStatus =
  | 'PREPARED'
  | 'INTENT_SENT'
  | 'CONFIRMED'
  | 'IN_DOUBT'
  | 'AMBIGUOUS'
  | 'FAILED'
  | 'RECONCILIATION_REQUIRED';

export type SagaState =
  | 'SQL_PENDING'
  | 'SQL_COMMITTED'
  | 'AUTH_CLEANUP_PENDING'
  | 'AUTH_PARTIAL'
  | 'AUTH_COMPLETED'
  | 'RECOVERY_REQUIRED';

export type OwnershipStatus = 'OWNED' | 'FOREIGN' | 'AMBIGUOUS';

export interface LedgerEntry {
  op_id: string;
  run_id: string;
  table: AllowedTableName;
  requested_ids: string[];
  returned_ids: string[];
  response_hash_sha256?: string;
  status: LedgerStatus;
  intent_at: string;
  confirmed_at?: string;
  persisted_disk_sync: boolean;
  error?: string;
}

export interface LedgerHeader {
  version: string;
  run_id: string;
  run_nonce: string;
  target_project: string;
  created_at: string;
  updated_at: string;
  global_status: SagaState;
  checksum: string;
}

export interface ExecutionLedger {
  header: LedgerHeader;
  entries: LedgerEntry[];
  auth_users: {
    user_id: string;
    email: string;
    status: 'PENDING' | 'CONFIRMED' | 'DELETED' | 'AMBIGUOUS';
    confirmed_at?: string;
    deleted_at?: string;
  }[];
}

export interface UniqueConstraintDefinition {
  table: AllowedTableName;
  name: string;
  columns: string[];
  whereClause?: string;
  isPartialIndex: boolean;
  checkType: 'CONSTRAINT_UNIQUE' | 'PARTIAL_UNIQUE_INDEX';
  consequenceOfCollision: string;
}

export interface ActorDefinition {
  key: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
  id: string;
  email: string;
  roleDescription: string;
  tenantOrganizationId?: string;
  expectedAccessLevel: string;
}
