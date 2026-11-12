/**
 * tools/security-runner/teardown-sql.ts
 *
 * Módulo de Teardown Transaccional y Verificación de Igualdad Exacta de Conjuntos.
 * Garantiza que dentro de una única transacción PostgreSQL se valide la igualdad
 * exacta de los IDs eliminados, ejecutando ROLLBACK completo ante cualquier discrepancia.
 */

import { TEARDOWN_TOPOLOGICAL_ORDER } from './constants.ts';
import type { AllowedTableName } from './types.ts';

export class TeardownSetMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TeardownSetMismatchError';
  }
}

export class TeardownInputValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TeardownInputValidationError';
  }
}

export class TeardownSqlManager {
  /**
   * Valida estrictamente la igualdad biyectiva de conjuntos entre IDs esperados e IDs devueltos.
   */
  public static assertExactSetEquality(
    tableName: AllowedTableName,
    expectedIds: string[],
    returnedIds: string[]
  ): void {
    // 1. Validar que no haya duplicados en la entrada esperada
    const expectedSet = new Set(expectedIds);
    if (expectedSet.size !== expectedIds.length) {
      throw new TeardownInputValidationError(
        `Error en teardown para [${tableName}]: la lista expectedIds contiene duplicados.`
      );
    }

    const returnedSet = new Set(returnedIds);
    if (returnedSet.size !== returnedIds.length) {
      throw new TeardownSetMismatchError(
        `Error en teardown para [${tableName}]: la base de datos devolvió IDs duplicados.`
      );
    }

    // 2. Comprobar cardinalidad exacta
    if (returnedSet.size !== expectedSet.size) {
      throw new TeardownSetMismatchError(
        `DISCREPANCIA EN ${tableName}: Se esperaban ${expectedSet.size} eliminaciones, pero se devolvieron ${returnedSet.size}.`
      );
    }

    // 3. Comprobar que no falte ningún ID esperado
    for (const id of expectedSet) {
      if (!returnedSet.has(id)) {
        throw new TeardownSetMismatchError(
          `DISCREPANCIA EN ${tableName}: El ID esperado ${id} no fue eliminado por la consulta.`
        );
      }
    }

    // 4. Comprobar que no se haya eliminado ningún ID inesperado o foráneo
    for (const id of returnedSet) {
      if (!expectedSet.has(id)) {
        throw new TeardownSetMismatchError(
          `ALARMA CRÍTICA EN ${tableName}: Se eliminó el ID ajeno ${id}, que NO formaba parte del conjunto autorizado.`
        );
      }
    }
  }

  /**
   * Genera el bloque SQL anónimo (DO $$ ... $$) para ejecutar la transacción completa
   * en PostgreSQL con ROLLBACK automático ante cualquier excepción.
   */
  public generateTransactionalTeardownBlock(
    confirmedIdsByTable: Map<AllowedTableName, string[]>,
    reservedOrgIds: string[],
    reservedUserIds: string[]
  ): string {
    const orgsList = reservedOrgIds.map((id) => `'${id}'::uuid`).join(',');
    const usersList = reservedUserIds.map((id) => `'${id}'::uuid`).join(',');

    let block = `DO $$\nDECLARE\n    v_audit_count integer;\n    v_deleted_ids uuid[];\n    v_expected_ids uuid[];\nBEGIN\n`;

    // 1. Pre-check bloqueante de auditoría dentro de la misma transacción
    block += `    -- 1. Pre-check de seguridad y auditoría histórica\n`;
    block += `    SELECT count(*) INTO v_audit_count\n`;
    block += `    FROM public.audit_logs\n`;
    block += `    WHERE organization_id IN (${orgsList}) OR actor_user_id IN (${usersList});\n`;
    block += `    IF v_audit_count > 0 THEN\n`;
    block += `        RAISE EXCEPTION 'TEARDOWN_ABORT: audit_logs contiene % registros vinculados. Abortando.', v_audit_count;\n`;
    block += `    END IF;\n\n`;

    // 2. Recorrido en orden topológico inverso estricto
    for (const table of TEARDOWN_TOPOLOGICAL_ORDER) {
      const ids = confirmedIdsByTable.get(table) || [];
      if (ids.length === 0) continue;

      const formattedIds = ids.map((id) => `'${id}'::uuid`).join(',');

      block += `    -- 2.${table}: Eliminación con retorno y verificación biyectiva de conjuntos\n`;
      block += `    v_expected_ids := ARRAY[${formattedIds}];\n`;
      block += `    WITH deleted AS (\n`;
      block += `        DELETE FROM public.${table}\n`;
      block += `        WHERE id = ANY(v_expected_ids)\n`;
      block += `        RETURNING id\n`;
      block += `    )\n`;
      block += `    SELECT array_agg(id) INTO v_deleted_ids FROM deleted;\n`;
      block += `    IF coalesce(cardinality(v_deleted_ids), 0) != cardinality(v_expected_ids) THEN\n`;
      block += `        RAISE EXCEPTION 'TEARDOWN_ABORT_COUNT_MISMATCH en ${table}: Esperados %, Eliminados %', cardinality(v_expected_ids), coalesce(cardinality(v_deleted_ids), 0);\n`;
      block += `    END IF;\n`;
      block += `    IF NOT (v_deleted_ids @> v_expected_ids AND v_deleted_ids <@ v_expected_ids) THEN\n`;
      block += `        RAISE EXCEPTION 'TEARDOWN_ABORT_SET_MISMATCH en ${table}: Desajuste de IDs eliminados.';\n`;
      block += `    END IF;\n\n`;
    }

    block += `    RAISE NOTICE 'TEARDOWN_TRANSACTION_SUCCESS: Todas las tablas relacionales validadas con éxito.';\n`;
    block += `END $$;\n`;

    return block;
  }
}
