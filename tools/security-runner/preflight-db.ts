/**
 * tools/security-runner/preflight-db.ts
 *
 * Módulo de preflight para las 21 tablas de la base de datos y los 22 elementos
 * de unicidad (19 restricciones UNIQUE + 3 índices únicos parciales).
 */

import { UNIQUE_CONSTRAINTS_REGISTRY } from './constants.ts';
import type { AllowedTableName, UniqueConstraintDefinition } from './types.ts';

export interface DbInspectionClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

export class DbPreflightCollisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DbPreflightCollisionError';
  }
}

export class DbPreflightAuditConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DbPreflightAuditConflictError';
  }
}

export class DbPreflightManager {
  private client: DbInspectionClient;

  constructor(client: DbInspectionClient) {
    this.client = client;
  }

  /**
   * Genera el plan de consultas SQL del preflight para las 21 tablas.
   */
  public getPreflightInspectionPlan(
    reservedOrgIds: string[],
    reservedSlugs: string[],
    reservedUserIds: string[],
    reservedTicketNumbers: number[],
    reservedStoragePaths: string[],
    allReservedIds: string[]
  ): { label: string; sql: string }[] {
    return [
      {
        label: 'Comprobación de Slugs de Organización (UNIQUE)',
        sql: `SELECT id, slug FROM public.organizations WHERE slug IN (${reservedSlugs.map((s) => `'${s}'`).join(',')});`,
      },
      {
        label: 'Comprobación de Owner Activo Único en Organización (Índice Parcial)',
        sql: `SELECT id, organization_id, user_id FROM public.organization_members WHERE organization_id IN (${reservedOrgIds.map((id) => `'${id}'`).join(',')}) AND role = 'owner' AND status = 'active';`,
      },
      {
        label: 'Comprobación de Números de Ticket (UNIQUE)',
        sql: `SELECT id, organization_id, ticket_number FROM public.tickets WHERE ticket_number IN (${reservedTicketNumbers.join(',')});`,
      },
      {
        label: 'Comprobación de Rutas de Almacenamiento (UNIQUE)',
        sql: `SELECT id, storage_path FROM public.ticket_attachments WHERE storage_path IN (${reservedStoragePaths.map((p) => `'${p}'`).join(',')});`,
      },
      {
        label: 'Comprobación de Protección Histórica en audit_logs (Bloqueo Teardown)',
        sql: `SELECT id, organization_id, actor_user_id, entity_id FROM public.audit_logs WHERE organization_id IN (${reservedOrgIds.map((id) => `'${id}'`).join(',')}) OR actor_user_id IN (${reservedUserIds.map((id) => `'${id}'`).join(',')}) OR entity_id IN (${allReservedIds.map((id) => `'${id}'`).join(',')});`,
      },
      {
        label: 'Comprobación de Protección Histórica en security_events (Bloqueo Teardown)',
        sql: `SELECT id, organization_id, actor_user_id, event_type FROM public.security_events WHERE organization_id IN (${reservedOrgIds.map((id) => `'${id}'`).join(',')}) OR actor_user_id IN (${reservedUserIds.map((id) => `'${id}'`).join(',')});`,
      },
    ];
  }

  /**
   * Ejecuta la comprobación sobre audit_logs y security_events.
   * Cualquier coincidencia debe abortar inmediatamente el proceso de seed o teardown.
   */
  public async checkAuditAndSecurityProtection(
    reservedOrgIds: string[],
    reservedUserIds: string[],
    allReservedIds: string[]
  ): Promise<void> {
    const orgsList = reservedOrgIds.map((id) => `'${id}'`).join(',');
    const usersList = reservedUserIds.map((id) => `'${id}'`).join(',');
    const allIdsList = allReservedIds.map((id) => `'${id}'`).join(',');

    const auditQuery = `
      SELECT id, organization_id, actor_user_id, entity_id, action
      FROM public.audit_logs
      WHERE organization_id IN (${orgsList})
         OR actor_user_id IN (${usersList})
         OR entity_id IN (${allIdsList});
    `;

    const auditRes = await this.client.query(auditQuery);
    if (auditRes.rows.length > 0) {
      throw new DbPreflightAuditConflictError(
        `BLOQUEO DE SEGURIDAD HISTÓRICA: Se detectaron ${auditRes.rows.length} registros en public.audit_logs asociados a los IDs de prueba. El proceso aborta para no alterar registros inmutables.`
      );
    }

    const secQuery = `
      SELECT id, organization_id, actor_user_id, event_type
      FROM public.security_events
      WHERE organization_id IN (${orgsList})
         OR actor_user_id IN (${usersList});
    `;

    const secRes = await this.client.query(secQuery);
    if (secRes.rows.length > 0) {
      throw new DbPreflightAuditConflictError(
        `BLOQUEO DE SEGURIDAD HISTÓRICA: Se detectaron ${secRes.rows.length} registros en public.security_events asociados a los IDs de prueba. El proceso aborta para no alterar eventos de seguridad.`
      );
    }
  }

  /**
   * Verifica la ausencia de colisiones para una restricción UNIQUE específica del inventario.
   */
  public async verifyUniqueConstraint(
    constraintDef: UniqueConstraintDefinition,
    sampleValuesSqlPredicate: string
  ): Promise<void> {
    let query = `SELECT id FROM public.${constraintDef.table} WHERE ${sampleValuesSqlPredicate}`;
    if (constraintDef.whereClause) {
      query += ` AND (${constraintDef.whereClause})`;
    }

    const res = await this.client.query(query);
    if (res.rows.length > 0) {
      throw new DbPreflightCollisionError(
        `COLISIÓN EN ${constraintDef.table} (${constraintDef.name}): Se encontraron ${res.rows.length} filas coincidentes. ${constraintDef.consequenceOfCollision}`
      );
    }
  }

  public getRegistry(): UniqueConstraintDefinition[] {
    return UNIQUE_CONSTRAINTS_REGISTRY;
  }

  public getRegistryForTable(tableName: AllowedTableName): UniqueConstraintDefinition[] {
    return UNIQUE_CONSTRAINTS_REGISTRY.filter((c) => c.table === tableName);
  }
}
