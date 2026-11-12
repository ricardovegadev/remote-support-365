-- =============================================================================
-- MIGRACIÓN ADITIVA: NÚCLEO OPERATIVO V1 — HABILITACIÓN CONTROLADA DE ESCRITURAS
-- Archivo: supabase/migrations/20261111120000_operational_core_v1_writes.sql
-- Estado: PREPARADA LOCALMENTE (PENDIENTE DE APLICACIÓN EN SUPABASE DEV/PROD)
-- =============================================================================
-- Propósito:
--   Habilitar las operaciones de escritura (INSERT / UPDATE) estrictamente
--   necesarias para los módulos del Núcleo Operativo V1:
--     1. public.clients (INSERT, UPDATE)
--     2. public.client_contacts (INSERT, UPDATE)
--     3. public.tickets (INSERT, UPDATE)
--     4. public.ticket_transitions (INSERT — registro append-only)
--
-- Garantías de seguridad:
--   - Reutiliza exclusivamente las funciones SECURITY DEFINER existentes en el
--     esquema `private` (`private.has_org_role`, `private.is_ticket_assignee`,
--     `private.is_portal_client`).
--   - Restringe toda operación al `organization_id` activo del usuario.
--   - Impide que el rol `viewer` o usuarios de otras organizaciones inserten
--     o modifiquen datos.
--   - No habilita DELETE en ninguna tabla (se conserva la política de retención
--     y archivado lógico mediante `status = 'archived'`).
-- =============================================================================

begin;

-- =========================================================
-- 1. PRIVILEGIOS SQL ADITIVOS PARA ROL AUTHENTICATED
-- =========================================================

grant insert, update on table
    public.clients,
    public.client_contacts,
    public.tickets
to authenticated;

grant insert on table
    public.ticket_transitions
to authenticated;

-- =========================================================
-- 2. POLÍTICAS RLS DE ESCRITURA — CLIENTES Y CONTACTOS
-- =========================================================

-- Solo owner, admin y dispatcher de la organización activa pueden registrar clientes.
create policy clients_insert_managers
on public.clients
for insert to authenticated
with check (
    private.has_org_role(
        organization_id,
        array['owner', 'admin', 'dispatcher']::text[]
    )
);

-- Solo owner, admin y dispatcher de la organización activa pueden actualizar clientes.
create policy clients_update_managers
on public.clients
for update to authenticated
using (
    private.has_org_role(
        organization_id,
        array['owner', 'admin', 'dispatcher']::text[]
    )
)
with check (
    private.has_org_role(
        organization_id,
        array['owner', 'admin', 'dispatcher']::text[]
    )
);

-- Solo owner, admin y dispatcher pueden registrar contactos de clientes de su organización.
create policy client_contacts_insert_managers
on public.client_contacts
for insert to authenticated
with check (
    private.has_org_role(
        organization_id,
        array['owner', 'admin', 'dispatcher']::text[]
    )
);

-- Solo owner, admin y dispatcher pueden editar contactos de clientes de su organización.
create policy client_contacts_update_managers
on public.client_contacts
for update to authenticated
using (
    private.has_org_role(
        organization_id,
        array['owner', 'admin', 'dispatcher']::text[]
    )
)
with check (
    private.has_org_role(
        organization_id,
        array['owner', 'admin', 'dispatcher']::text[]
    )
);

-- =========================================================
-- 3. POLÍTICAS RLS DE ESCRITURA — TICKETS Y TRANSICIONES
-- =========================================================

-- Creación de tickets:
--   a) Personal interno operativo (owner, admin, dispatcher, technician_internal)
--      de la organización activa, o
--   b) Usuario del portal de cliente activo para su propio client_id con source = 'portal'.
--   En ambos casos created_by debe coincidir con auth.uid().
create policy tickets_insert_scoped
on public.tickets
for insert to authenticated
with check (
    created_by = (select auth.uid())
    and (
        private.has_org_role(
            organization_id,
            array['owner', 'admin', 'dispatcher', 'technician_internal']::text[]
        )
        or (
            private.is_portal_client(organization_id, client_id)
            and source = 'portal'
        )
    )
);

-- Actualización de tickets:
--   a) Responsables operativos (owner, admin, dispatcher) de la organización activa, o
--   b) Técnicos (internos o externos) con asignación activa/aceptada sobre el ticket.
create policy tickets_update_scoped
on public.tickets
for update to authenticated
using (
    private.has_org_role(
        organization_id,
        array['owner', 'admin', 'dispatcher']::text[]
    )
    or (
        private.has_org_role(
            organization_id,
            array['technician_internal', 'technician_external']::text[]
        )
        and private.is_ticket_assignee(organization_id, id)
    )
)
with check (
    private.has_org_role(
        organization_id,
        array['owner', 'admin', 'dispatcher']::text[]
    )
    or (
        private.has_org_role(
            organization_id,
            array['technician_internal', 'technician_external']::text[]
        )
        and private.is_ticket_assignee(organization_id, id)
    )
);

-- Registro de transiciones de estado (append-only):
--   Solo quien tiene autorización de actualización sobre el ticket dentro de la
--   organización activa y registrando su propio auth.uid() en changed_by.
create policy ticket_transitions_insert_scoped
on public.ticket_transitions
for insert to authenticated
with check (
    changed_by = (select auth.uid())
    and exists (
        select 1
        from public.tickets t
        where t.organization_id = ticket_transitions.organization_id
          and t.id = ticket_transitions.ticket_id
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
          )
    )
);

commit;
