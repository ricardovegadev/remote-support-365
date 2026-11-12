-- =============================================================================
-- MIGRACIÓN ADITIVA: FASE 4.3 — DISPOSITIVOS Y GESTIÓN DE ASISTENCIA REMOTA
-- Archivo: supabase/migrations/20261111160000_remote_assistance_and_devices.sql
-- Estado: PREPARADA LOCALMENTE (PENDIENTE DE APLICACIÓN EN SUPABASE DEV/PROD)
-- =============================================================================
-- Propósito:
--   Habilitar las operaciones de lectura ampliada y escritura controlada para:
--     1. public.devices (INSERT, UPDATE)
--     2. public.remote_session_requests (INSERT, UPDATE)
--     3. public.session_consents (SELECT ampliado a técnicos, INSERT)
--     4. public.consent_revocations (SELECT ampliado a técnicos, INSERT)
--     5. public.remote_session_attempts (INSERT, UPDATE)
--     6. public.remote_sessions (INSERT, UPDATE)
--
-- Garantías de seguridad y modelo de consentimiento:
--   - Estricto aislamiento por organization_id.
--   - Validación de pertenencia: FK compuesta (organization_id, ticket_id, client_id)
--     y (organization_id, device_id, client_id).
--   - Acceso exclusivamente atendido (access_mode = 'attended').
--   - Consentimiento explícito obligatorio por sesión (no reutilizable).
--   - Revocación inmediata del consentimiento.
-- =============================================================================

begin;

-- =========================================================
-- 1. PRIVILEGIOS SQL ADITIVOS PARA ROL AUTHENTICATED
-- =========================================================

grant insert, update on table
    public.devices,
    public.remote_session_requests,
    public.session_consents,
    public.remote_session_attempts,
    public.remote_sessions
to authenticated;

grant insert on table
    public.consent_revocations
to authenticated;

-- =========================================================
-- 2. POLÍTICAS RLS ADITIVAS — DISPOSITIVOS
-- =========================================================

-- Creación de dispositivos: personal operativo de la organización activa.
create policy devices_insert_staff
on public.devices
for insert to authenticated
with check (
    private.has_org_role(
        organization_id,
        array['owner', 'admin', 'dispatcher', 'technician_internal']::text[]
    )
    and exists (
        select 1
        from public.clients c
        where c.organization_id = devices.organization_id
          and c.id = devices.client_id
          and c.status <> 'archived'
    )
);

-- Actualización de dispositivos: responsables operativos y técnicos internos.
create policy devices_update_staff
on public.devices
for update to authenticated
using (
    private.has_org_role(
        organization_id,
        array['owner', 'admin', 'dispatcher', 'technician_internal']::text[]
    )
)
with check (
    private.has_org_role(
        organization_id,
        array['owner', 'admin', 'dispatcher', 'technician_internal']::text[]
    )
);

-- =========================================================
-- 3. POLÍTICAS RLS ADITIVAS — SOLICITUDES DE ASISTENCIA REMOTA
-- =========================================================

-- Creación de solicitudes: responsables operativos o técnico interno asignado al ticket.
create policy remote_session_requests_insert_staff
on public.remote_session_requests
for insert to authenticated
with check (
    requested_by = (select auth.uid())
    and access_mode = 'attended'
    and status = 'pending'
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
            and private.is_ticket_assignee(organization_id, ticket_id)
        )
    )
    and exists (
        select 1
        from public.tickets t
        where t.organization_id = remote_session_requests.organization_id
          and t.id = remote_session_requests.ticket_id
          and t.client_id = remote_session_requests.client_id
    )
    and exists (
        select 1
        from public.devices d
        where d.organization_id = remote_session_requests.organization_id
          and d.id = remote_session_requests.device_id
          and d.client_id = remote_session_requests.client_id
          and d.status <> 'revoked'
    )
);

-- Actualización de solicitudes (aprobar, rechazar, cancelar, completar):
-- Personal interno autorizado o cliente del portal para su propio ticket.
create policy remote_session_requests_update_scoped
on public.remote_session_requests
for update to authenticated
using (
    private.has_org_role(
        organization_id,
        array['owner', 'admin', 'dispatcher']::text[]
    )
    or (
        requested_by = (select auth.uid())
    )
    or (
        private.has_org_role(
            organization_id,
            array['technician_internal']::text[]
        )
        and private.is_ticket_assignee(organization_id, ticket_id)
    )
    or private.is_portal_client(organization_id, client_id)
)
with check (
    private.has_org_role(
        organization_id,
        array['owner', 'admin', 'dispatcher']::text[]
    )
    or (
        requested_by = (select auth.uid())
    )
    or (
        private.has_org_role(
            organization_id,
            array['technician_internal']::text[]
        )
        and private.is_ticket_assignee(organization_id, ticket_id)
    )
    or private.is_portal_client(organization_id, client_id)
);

-- =========================================================
-- 4. POLÍTICAS RLS ADITIVAS — CONSENTIMIENTOS Y REVOCACIONES
-- =========================================================

-- Corrección aditiva: Permitir SELECT de consentimientos a dispatchers y técnicos asignados
-- (la migración inicial restringía SELECT a solo 'owner' y 'admin').
create policy session_consents_select_staff
on public.session_consents
for select to authenticated
using (
    private.has_org_role(
        organization_id,
        array['dispatcher']::text[]
    )
    or exists (
        select 1
        from public.remote_session_requests r
        where r.organization_id = session_consents.organization_id
          and r.id = session_consents.request_id
          and (
              r.requested_by = (select auth.uid())
              or private.is_ticket_assignee(r.organization_id, r.ticket_id)
          )
    )
);

create policy consent_revocations_select_staff
on public.consent_revocations
for select to authenticated
using (
    private.has_org_role(
        organization_id,
        array['dispatcher']::text[]
    )
    or exists (
        select 1
        from public.session_consents sc
        join public.remote_session_requests r
          on r.organization_id = sc.organization_id
         and r.id = sc.request_id
        where sc.organization_id = consent_revocations.organization_id
          and sc.id = consent_revocations.consent_id
          and (
              r.requested_by = (select auth.uid())
              or private.is_ticket_assignee(r.organization_id, r.ticket_id)
          )
    )
);

-- Inserción de consentimientos:
-- Otorgado por cliente del portal (portal_confirmation) o registrado con evidencia
-- por personal autorizado del ticket (local_confirmation u other).
create policy session_consents_insert_scoped
on public.session_consents
for insert to authenticated
with check (
    exists (
        select 1
        from public.remote_session_requests r
        where r.organization_id = session_consents.organization_id
          and r.id = session_consents.request_id
          and r.device_id = session_consents.device_id
          and r.status = 'pending'
          and (
              (
                  session_consents.consent_method = 'portal_confirmation'
                  and private.is_portal_client(r.organization_id, r.client_id)
                  and granted_by_user_id = (select auth.uid())
              )
              or (
                  session_consents.consent_method in ('local_confirmation', 'other')
                  and (
                      private.has_org_role(
                          r.organization_id,
                          array['owner', 'admin', 'dispatcher']::text[]
                      )
                      or (
                          private.has_org_role(
                              r.organization_id,
                              array['technician_internal']::text[]
                          )
                          and private.is_ticket_assignee(r.organization_id, r.ticket_id)
                      )
                  )
              )
          )
    )
);

-- Inserción de revocaciones (inmutable append-only):
create policy consent_revocations_insert_scoped
on public.consent_revocations
for insert to authenticated
with check (
    revoked_by = (select auth.uid())
    and exists (
        select 1
        from public.session_consents sc
        join public.remote_session_requests r
          on r.organization_id = sc.organization_id
         and r.id = sc.request_id
        where sc.organization_id = consent_revocations.organization_id
          and sc.id = consent_revocations.consent_id
          and (
              private.has_org_role(
                  r.organization_id,
                  array['owner', 'admin', 'dispatcher']::text[]
              )
              or private.is_portal_client(r.organization_id, r.client_id)
              or (
                  private.has_org_role(
                      r.organization_id,
                      array['technician_internal']::text[]
                  )
                  and private.is_ticket_assignee(r.organization_id, r.ticket_id)
              )
          )
    )
);

-- =========================================================
-- 5. POLÍTICAS RLS ADITIVAS — INTENTOS Y SESIONES REMOTAS
-- =========================================================

-- Inserción de intentos de conexión:
-- Requiere solicitud aprobada y consentimiento activo (no revocado).
create policy remote_session_attempts_insert_staff
on public.remote_session_attempts
for insert to authenticated
with check (
    engine = 'rustdesk'
    and exists (
        select 1
        from public.remote_session_requests r
        join public.session_consents sc
          on sc.organization_id = r.organization_id
         and sc.request_id = r.id
        left join public.consent_revocations cr
          on cr.organization_id = sc.organization_id
         and cr.consent_id = sc.id
        where r.organization_id = remote_session_attempts.organization_id
          and r.id = remote_session_attempts.request_id
          and r.status = 'approved'
          and cr.id is null
          and (
              private.has_org_role(
                  r.organization_id,
                  array['owner', 'admin', 'dispatcher']::text[]
              )
              or (
                  private.has_org_role(
                      r.organization_id,
                      array['technician_internal']::text[]
                  )
                  and private.is_ticket_assignee(r.organization_id, r.ticket_id)
              )
          )
    )
);

create policy remote_session_attempts_update_staff
on public.remote_session_attempts
for update to authenticated
using (
    private.has_org_role(
        organization_id,
        array['owner', 'admin', 'dispatcher']::text[]
    )
    or exists (
        select 1
        from public.remote_session_requests r
        where r.organization_id = remote_session_attempts.organization_id
          and r.id = remote_session_attempts.request_id
          and (
              r.requested_by = (select auth.uid())
              or private.is_ticket_assignee(r.organization_id, r.ticket_id)
          )
    )
)
with check (
    private.has_org_role(
        organization_id,
        array['owner', 'admin', 'dispatcher']::text[]
    )
    or exists (
        select 1
        from public.remote_session_requests r
        where r.organization_id = remote_session_attempts.organization_id
          and r.id = remote_session_attempts.request_id
          and (
              r.requested_by = (select auth.uid())
              or private.is_ticket_assignee(r.organization_id, r.ticket_id)
          )
    )
);

-- Inserción de sesiones activas:
-- Exclusivamente el técnico asignado tras intento conectado exitosamente por el motor.
create policy remote_sessions_insert_staff
on public.remote_sessions
for insert to authenticated
with check (
    technician_user_id = (select auth.uid())
    and status = 'active'
    and exists (
        select 1
        from public.remote_session_requests r
        join public.remote_session_attempts a
          on a.organization_id = r.organization_id
         and a.id = remote_sessions.attempt_id
         and a.request_id = r.id
        join public.session_consents sc
          on sc.organization_id = r.organization_id
         and sc.request_id = r.id
        left join public.consent_revocations cr
          on cr.organization_id = sc.organization_id
         and cr.consent_id = sc.id
        where r.organization_id = remote_sessions.organization_id
          and r.id = remote_sessions.request_id
          and r.device_id = remote_sessions.device_id
          and r.status = 'approved'
          and a.status = 'connected'
          and cr.id is null
    )
);

create policy remote_sessions_update_staff
on public.remote_sessions
for update to authenticated
using (
    technician_user_id = (select auth.uid())
    or private.has_org_role(
        organization_id,
        array['owner', 'admin', 'dispatcher']::text[]
    )
)
with check (
    technician_user_id = (select auth.uid())
    or private.has_org_role(
        organization_id,
        array['owner', 'admin', 'dispatcher']::text[]
    )
);

commit;
