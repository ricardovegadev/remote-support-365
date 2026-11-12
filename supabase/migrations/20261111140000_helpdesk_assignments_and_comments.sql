-- =============================================================================
-- MIGRACIÓN ADITIVA: FASE 4.2 — FLUJO OPERATIVO DE ASIGNACIONES Y COMENTARIOS
-- Archivo: supabase/migrations/20261111140000_helpdesk_assignments_and_comments.sql
-- Estado: PREPARADA LOCALMENTE (PENDIENTE DE APLICACIÓN EN SUPABASE DEV/PROD)
-- =============================================================================
-- Propósito:
--   Habilitar las operaciones de escritura estrictamente necesarias para
--   completar el ciclo de atención de tickets:
--     1. public.ticket_assignments (INSERT, UPDATE)
--     2. public.ticket_comments (INSERT — registro inmutable append-only)
--
-- Garantías de seguridad:
--   - Estricto aislamiento por organization_id y validación de relaciones.
--   - Validar que el ticket pertenezca a la organización activa.
--   - Validar que el miembro asignado pertenezca a la organización activa,
--     tenga membresía 'active' y posea rol técnico/operativo compatible.
--   - Restringir la creación de asignaciones a responsables operativos
--     (owner, admin, dispatcher) o auto-asignación por técnico interno.
--   - Permitir al técnico asignado actualizar el estado de su asignación
--     (accepted, declined, completed).
--   - Comentarios inmutables (INSERT únicamente; sin UPDATE ni DELETE).
--   - Los comentarios 'internal' solo pueden ser redactados por personal
--     operativo interno autorizado.
--   - Los clientes del portal solo pueden redactar comentarios con visibilidad
--     'client' sobre tickets de su cliente asociado.
--   - author_user_id y assigned_by deben coincidir con auth.uid().
-- =============================================================================

begin;

-- =========================================================
-- 1. PRIVILEGIOS SQL ADITIVOS PARA ROL AUTHENTICATED
-- =========================================================

grant insert, update on table public.ticket_assignments to authenticated;
grant insert on table public.ticket_comments to authenticated;

-- =========================================================
-- 2. POLÍTICAS RLS DE ESCRITURA — ASIGNACIONES DE TICKETS
-- =========================================================

-- Creación de asignaciones:
-- 1. Responsables operativos (owner, admin, dispatcher) pueden asignar a cualquier
--    miembro técnico activo de la organización.
-- 2. Técnico interno activo puede auto-asignarse a un ticket de su organización.
-- Restricciones:
-- - assigned_by = auth.uid()
-- - El ticket debe existir en la misma organización.
-- - El membership_id debe ser un miembro activo con rol operativo en la misma organización.
-- - Status inicial debe ser 'active'.
create policy ticket_assignments_insert_scoped
on public.ticket_assignments
for insert to authenticated
with check (
    assigned_by = (select auth.uid())
    and status = 'active'
    and exists (
        select 1
        from public.tickets t
        where t.organization_id = ticket_assignments.organization_id
          and t.id = ticket_assignments.ticket_id
    )
    and exists (
        select 1
        from public.organization_members m
        join public.organizations o on o.id = m.organization_id
        where m.organization_id = ticket_assignments.organization_id
          and m.id = ticket_assignments.membership_id
          and m.status = 'active'
          and o.status = 'active'
          and o.archived_at is null
          and m.role in (
              'technician_internal',
              'technician_external',
              'dispatcher',
              'admin',
              'owner'
          )
    )
    and (
        private.has_org_role(
            organization_id,
            array['owner', 'admin', 'dispatcher']::text[]
        )
        or (
            private.has_org_role(
                organization_id,
                array['technician_internal']::text[]
            )
            and exists (
                select 1
                from public.organization_members self_m
                where self_m.organization_id = ticket_assignments.organization_id
                  and self_m.id = ticket_assignments.membership_id
                  and self_m.user_id = (select auth.uid())
                  and self_m.status = 'active'
            )
        )
    )
);

-- Actualización de asignaciones:
-- Permite:
-- 1. Responsables (owner, admin, dispatcher) para cancelar, reasignar o completar.
-- 2. El propio técnico asignado para aceptar, rechazar o marcar completada su asignación.
-- Inmutabilidad de claves:
-- No se permite alterar organization_id, ticket_id, membership_id ni assigned_by.
create policy ticket_assignments_update_scoped
on public.ticket_assignments
for update to authenticated
using (
    private.has_org_role(
        organization_id,
        array['owner', 'admin', 'dispatcher']::text[]
    )
    or exists (
        select 1
        from public.organization_members m
        where m.organization_id = ticket_assignments.organization_id
          and m.id = ticket_assignments.membership_id
          and m.user_id = (select auth.uid())
          and m.status = 'active'
    )
)
with check (
    private.has_org_role(
        organization_id,
        array['owner', 'admin', 'dispatcher']::text[]
    )
    or exists (
        select 1
        from public.organization_members m
        where m.organization_id = ticket_assignments.organization_id
          and m.id = ticket_assignments.membership_id
          and m.user_id = (select auth.uid())
          and m.status = 'active'
    )
);

-- =========================================================
-- 3. POLÍTICAS RLS DE ESCRITURA — COMENTARIOS DE TICKETS
-- =========================================================

-- Creación de comentarios (inmutable append-only):
-- Restricciones:
-- - author_user_id = auth.uid()
-- - body no vacío
-- - Ticket debe pertenecer a la misma organización
-- - Comentarios 'internal': restringidos a personal interno autorizado con acceso
--   a datos internos del ticket (owner, admin, dispatcher, o técnico interno asignado).
-- - Comentarios 'client': autorizados a quien tiene acceso de lectura al ticket
--   (personal interno, técnico asignado o cliente portal del cliente asociado).
create policy ticket_comments_insert_scoped
on public.ticket_comments
for insert to authenticated
with check (
    author_user_id = (select auth.uid())
    and length(trim(body)) > 0
    and exists (
        select 1
        from public.tickets t
        where t.organization_id = ticket_comments.organization_id
          and t.id = ticket_comments.ticket_id
          and (
              (
                  ticket_comments.visibility = 'internal'
                  and (
                      private.has_org_role(
                          t.organization_id,
                          array['owner', 'admin', 'dispatcher']::text[]
                      )
                      or (
                          private.has_org_role(
                              t.organization_id,
                              array['technician_internal']::text[]
                          )
                          and private.is_ticket_assignee(t.organization_id, t.id)
                      )
                  )
              )
              or (
                  ticket_comments.visibility = 'client'
                  and (
                      private.has_org_role(
                          t.organization_id,
                          array['owner', 'admin', 'dispatcher']::text[]
                      )
                      or (
                          private.has_org_role(
                              t.organization_id,
                              array['technician_internal', 'technician_external']::text[]
                          )
                          and private.is_ticket_assignee(t.organization_id, t.id)
                      )
                      or private.is_portal_client(t.organization_id, t.client_id)
                  )
              )
          )
    )
);

commit;
