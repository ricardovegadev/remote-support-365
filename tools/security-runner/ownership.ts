/**
 * tools/security-runner/ownership.ts
 *
 * Verificador de propiedad relacional y contextual de registros SQL.
 * Garantiza que ninguna fila sea atribuida o eliminada basándose únicamente
 * en su UUID determinista o en created_at.
 */

import type { AllowedTableName, OwnershipStatus } from './types.ts';

export interface EntityRelationshipContext {
  id: string;
  table: AllowedTableName;
  organizationId: string;
  parentId?: {
    table: AllowedTableName;
    id: string;
  };
  relatedIds?: {
    table: AllowedTableName;
    id: string;
  }[];
}

export class AmbiguousOwnershipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AmbiguousOwnershipError';
  }
}

export class OwnershipVerifier {
  private confirmedIdsByTable: Map<AllowedTableName, Set<string>>;
  private allowedOrganizationIds: Set<string>;

  constructor(
    confirmedIdsByTable: Map<AllowedTableName, Set<string>>,
    allowedOrganizationIds: Set<string>
  ) {
    this.confirmedIdsByTable = confirmedIdsByTable;
    this.allowedOrganizationIds = allowedOrganizationIds;
  }

  /**
   * Evalúa la propiedad relacional y contextual estricta de una entidad candidata.
   */
  public evaluateOwnership(candidate: EntityRelationshipContext): OwnershipStatus {
    // 1. Debe existir en el conjunto confirmado del ledger para esta tabla exacta
    const confirmedSet = this.confirmedIdsByTable.get(candidate.table);
    if (!confirmedSet || !confirmedSet.has(candidate.id)) {
      return 'FOREIGN';
    }

    // 2. Debe pertenecer estrictamente a uno de los tenants autorizados de esta corrida
    if (!this.allowedOrganizationIds.has(candidate.organizationId)) {
      return 'FOREIGN';
    }

    // 3. Si tiene entidad padre, el padre debe estar confirmado dentro de la misma corrida
    if (candidate.parentId) {
      const parentConfirmedSet = this.confirmedIdsByTable.get(candidate.parentId.table);
      if (!parentConfirmedSet || !parentConfirmedSet.has(candidate.parentId.id)) {
        // Alerta de referencia cruzada huérfana o foránea
        return 'AMBIGUOUS';
      }
    }

    // 4. Si tiene relaciones asociadas (p. ej. cliente, dispositivo, técnico), todas deben ser de esta corrida
    if (candidate.relatedIds && candidate.relatedIds.length > 0) {
      for (const rel of candidate.relatedIds) {
        const relSet = this.confirmedIdsByTable.get(rel.table);
        if (!relSet || !relSet.has(rel.id)) {
          return 'AMBIGUOUS';
        }
      }
    }

    return 'OWNED';
  }

  /**
   * Valida un conjunto de entidades candidatas para teardown.
   * Si alguna resulta ser AMBIGUOUS o FOREIGN, lanza una excepción de bloqueo.
   */
  public assertBatchOwnership(candidates: EntityRelationshipContext[]): void {
    for (const item of candidates) {
      const status = this.evaluateOwnership(item);
      if (status !== 'OWNED') {
        throw new AmbiguousOwnershipError(
          `BLOQUEO DE TEARDOWN: El registro ${item.table} (ID ${item.id}) tiene estado de propiedad ${status}. Se prohíbe su eliminación automática.`
        );
      }
    }
  }
}
