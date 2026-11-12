-- =============================================================================
-- MIGRACIÓN ADITIVA: FASE 4.4 — IMPLEMENTACIÓN INTEGRAL DE WORKFORCE & DISPATCH 365
-- Archivo: supabase/migrations/20261111180000_workforce_and_dispatch.sql
-- Estado: PREPARADA LOCALMENTE (PENDIENTE DE APLICACIÓN EN SUPABASE DEV/PROD)
-- =============================================================================
-- Propósito:
--   1. Habilitar la gestión integral de técnicos internos, colaboradores externos
--      y profesionales independientes.
--   2. Implementar especialidades técnicas administrables (catálogo dinámico).
--   3. Configurar horarios de atención semanales y periodos de indisponibilidad.
--   4. Garantizar la aceptación atómica y libre de colisiones concurrentes en tickets.
--   5. Proveer infraestructura de notificaciones multi-tenant para eventos de despacho.
--
-- Garantías de seguridad y aislamiento:
--   - Estricto aislamiento por organization_id.
--   - Control de acceso por roles operativos (owner, admin, dispatcher, technician).
--   - Prevención estricta de asignaciones a técnicos ajenos o inactivos.
-- =============================================================================

begin;

-- =========================================================
-- 1. CATÁLOGO ADMINISTRABLE DE ESPECIALIDADES
-- =========================================================

create table if not exists public.dispatch_skills (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete restrict,
    name text not null,
    category text not null default 'General',
    description text,
    is_active boolean not null default true,
    created_at timestamptz not null default now()
);

create unique index if not exists dispatch_skills_org_lower_name_idx
    on public.dispatch_skills (organization_id, lower(name));

create index if not exists dispatch_skills_org_category_idx
    on public.dispatch_skills (organization_id, category, is_active);

-- Tabla de asignación de especialidades a perfiles técnicos
create table if not exists public.technician_skills (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete restrict,
    technician_profile_id uuid not null references public.technician_profiles(id) on delete cascade,
    skill_id uuid not null references public.dispatch_skills(id) on delete cascade,
    years_experience integer not null default 0 check (years_experience >= 0),
    created_at timestamptz not null default now(),
    unique (technician_profile_id, skill_id)
);

create index if not exists technician_skills_profile_idx
    on public.technician_skills (organization_id, technician_profile_id);

-- =========================================================
-- 2. DISPONIBILIDAD, HORARIOS E INDISPONIBILIDADES
-- =========================================================

-- Horarios semanales de trabajo del técnico
create table if not exists public.technician_schedules (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete restrict,
    technician_profile_id uuid not null references public.technician_profiles(id) on delete cascade,
    day_of_week integer not null check (day_of_week between 0 and 6), -- 0=Domingo, 1=Lunes, ..., 6=Sábado
    start_time time not null,
    end_time time not null,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    check (end_time > start_time),
    unique (technician_profile_id, day_of_week)
);

create index if not exists technician_schedules_profile_idx
    on public.technician_schedules (organization_id, technician_profile_id, is_active);

-- Registro de ausencias e indisponibilidades programadas
create table if not exists public.technician_unavailabilities (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete restrict,
    technician_profile_id uuid not null references public.technician_profiles(id) on delete cascade,
    start_date timestamptz not null,
    end_date timestamptz not null,
    reason text not null,
    created_at timestamptz not null default now(),
    check (end_date >= start_date)
);

create index if not exists technician_unavailabilities_range_idx
    on public.technician_unavailabilities (organization_id, technician_profile_id, start_date, end_date);

-- =========================================================
-- 3. SISTEMA DE NOTIFICACIONES MULTI-TENANT
-- =========================================================

create table if not exists public.notifications (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete restrict,
    user_id uuid not null references public.profiles(id) on delete cascade,
    ticket_id uuid references public.tickets(id) on delete set null,
    type text not null check (
        type in (
            'invitation_received',
            'assignment_received',
            'assignment_accepted',
            'assignment_declined',
            'assignment_cancelled',
            'assignment_reassigned',
            'availability_changed'
        )
    ),
    title text not null,
    message text not null,
    read boolean not null default false,
    read_at timestamptz,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create index if not exists notifications_org_user_unread_idx
    on public.notifications (organization_id, user_id, read, created_at desc);

-- =========================================================
-- 4. CONTROL DE CONCURRENCIA ATÓMICA EN ASIGNACIONES
-- =========================================================

-- Garantía física de integridad: un único técnico puede tener una asignación 'accepted'
-- por ticket simultáneamente.
create unique index if not exists ticket_assignments_one_accepted_per_ticket_idx
    on public.ticket_assignments (organization_id, ticket_id)
    where status = 'accepted';

-- Función transaccional atómica para aceptación de servicios
create or replace function public.accept_ticket_assignment(p_assignment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_assignment record;
    v_user_id uuid := auth.uid();
    v_accepted_count int;
begin
    -- 1. Buscar y bloquear la asignación objetivo
    select a.*, m.user_id as member_user_id
    into v_assignment
    from public.ticket_assignments a
    join public.organization_members m on m.id = a.membership_id
    where a.id = p_assignment_id
    for update;

    if not found then
        raise exception 'Asignación no encontrada' using errcode = 'P0002';
    end if;

    -- 2. Validar pertenencia del usuario solicitante
    if v_assignment.member_user_id <> v_user_id then
        raise exception 'No estás autorizado para aceptar una asignación ajena' using errcode = '42501';
    end if;

    -- 3. Validar estado actual
    if v_assignment.status <> 'active' then
        raise exception 'La asignación ya no está en estado activo (estado actual: %)', v_assignment.status using errcode = '22023';
    end if;

    -- 4. Validar concurrencia: comprobar si ya fue aceptada por otro técnico
    select count(*)
    into v_accepted_count
    from public.ticket_assignments
    where organization_id = v_assignment.organization_id
      and ticket_id = v_assignment.ticket_id
      and status = 'accepted'
      and id <> p_assignment_id;

    if v_accepted_count > 0 then
        -- Cancelar la asignación actual con motivo
        update public.ticket_assignments
        set status = 'cancelled'
        where id = p_assignment_id;

        raise exception 'El servicio ya fue aceptado por otro técnico' using errcode = '23505';
    end if;

    -- 5. Aceptar la asignación
    update public.ticket_assignments
    set status = 'accepted',
        responded_at = now()
    where id = p_assignment_id;

    -- 6. Cancelar asignaciones concurrentes pendientes para este ticket
    update public.ticket_assignments
    set status = 'cancelled'
    where organization_id = v_assignment.organization_id
      and ticket_id = v_assignment.ticket_id
      and id <> p_assignment_id
      and status = 'active';

    -- 7. Actualizar el estado del ticket a 'in_progress' si estaba en 'open' o 'new'
    update public.tickets
    set status = 'in_progress',
        updated_at = now()
    where id = v_assignment.ticket_id
      and status in ('new', 'open');

    return jsonb_build_object(
        'success', true,
        'assignment_id', p_assignment_id,
        'ticket_id', v_assignment.ticket_id,
        'status', 'accepted'
    );
end;
$$;

-- =========================================================
-- 5. PRIVILEGIOS SQL ADITIVOS
-- =========================================================

grant select, insert, update on table
    public.technician_profiles,
    public.dispatch_skills,
    public.technician_skills,
    public.technician_schedules,
    public.technician_unavailabilities,
    public.notifications
to authenticated;

grant delete on table
    public.technician_skills,
    public.technician_schedules,
    public.technician_unavailabilities
to authenticated;

grant update on table
    public.organization_members
to authenticated;

grant insert on table
    public.organization_invitations
to authenticated;

grant execute on function public.accept_ticket_assignment(uuid) to authenticated;

-- =========================================================
-- 6. POLÍTICAS DE CONTROL DE ACCESO (RLS)
-- =========================================================

-- 6.1 PERFILES TÉCNICOS (Escritura)
create policy technician_profiles_insert_staff
on public.technician_profiles
for insert to authenticated
with check (
    private.has_org_role(
        organization_id,
        array['owner', 'admin', 'dispatcher']::text[]
    )
    or (
        user_id = (select auth.uid())
        and private.is_org_member(organization_id)
    )
);

create policy technician_profiles_update_staff
on public.technician_profiles
for update to authenticated
using (
    private.has_org_role(
        organization_id,
        array['owner', 'admin', 'dispatcher']::text[]
    )
    or (
        user_id = (select auth.uid())
        and private.is_org_member(organization_id)
    )
)
with check (
    private.has_org_role(
        organization_id,
        array['owner', 'admin', 'dispatcher']::text[]
    )
    or (
        user_id = (select auth.uid())
        and private.is_org_member(organization_id)
    )
);

-- 6.2 MIEMBROS DE ORGANIZACIÓN (Actualización de rol y estado por admin/owner)
create policy organization_members_update_admin
on public.organization_members
for update to authenticated
using (
    private.has_org_role(
        organization_id,
        array['owner', 'admin']::text[]
    )
)
with check (
    private.has_org_role(
        organization_id,
        array['owner', 'admin']::text[]
    )
);

-- 6.3 ESPECIALIDADES (dispatch_skills)
alter table public.dispatch_skills enable row level security;

create policy dispatch_skills_select_org
on public.dispatch_skills
for select to authenticated
using (
    private.is_org_member(organization_id)
);

create policy dispatch_skills_insert_admin
on public.dispatch_skills
for insert to authenticated
with check (
    private.has_org_role(
        organization_id,
        array['owner', 'admin', 'dispatcher']::text[]
    )
);

create policy dispatch_skills_update_admin
on public.dispatch_skills
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

-- 6.4 ASIGNACIONES DE ESPECIALIDADES A TÉCNICOS (technician_skills)
alter table public.technician_skills enable row level security;

create policy technician_skills_select_org
on public.technician_skills
for select to authenticated
using (
    private.is_org_member(organization_id)
);

create policy technician_skills_insert_scoped
on public.technician_skills
for insert to authenticated
with check (
    private.has_org_role(
        organization_id,
        array['owner', 'admin', 'dispatcher']::text[]
    )
    or exists (
        select 1
        from public.technician_profiles tp
        where tp.id = technician_skills.technician_profile_id
          and tp.user_id = (select auth.uid())
          and tp.organization_id = technician_skills.organization_id
    )
);

create policy technician_skills_delete_scoped
on public.technician_skills
for delete to authenticated
using (
    private.has_org_role(
        organization_id,
        array['owner', 'admin', 'dispatcher']::text[]
    )
    or exists (
        select 1
        from public.technician_profiles tp
        where tp.id = technician_skills.technician_profile_id
          and tp.user_id = (select auth.uid())
          and tp.organization_id = technician_skills.organization_id
    )
);

-- 6.5 HORARIOS Y DISPONIBILIDAD (technician_schedules)
alter table public.technician_schedules enable row level security;

create policy technician_schedules_select_org
on public.technician_schedules
for select to authenticated
using (
    private.is_org_member(organization_id)
);

create policy technician_schedules_manage_scoped
on public.technician_schedules
for all to authenticated
using (
    private.has_org_role(
        organization_id,
        array['owner', 'admin', 'dispatcher']::text[]
    )
    or exists (
        select 1
        from public.technician_profiles tp
        where tp.id = technician_schedules.technician_profile_id
          and tp.user_id = (select auth.uid())
          and tp.organization_id = technician_schedules.organization_id
    )
)
with check (
    private.has_org_role(
        organization_id,
        array['owner', 'admin', 'dispatcher']::text[]
    )
    or exists (
        select 1
        from public.technician_profiles tp
        where tp.id = technician_schedules.technician_profile_id
          and tp.user_id = (select auth.uid())
          and tp.organization_id = technician_schedules.organization_id
    )
);

-- 6.6 INDISPONIBILIDADES (technician_unavailabilities)
alter table public.technician_unavailabilities enable row level security;

create policy technician_unavailabilities_select_org
on public.technician_unavailabilities
for select to authenticated
using (
    private.is_org_member(organization_id)
);

create policy technician_unavailabilities_manage_scoped
on public.technician_unavailabilities
for all to authenticated
using (
    private.has_org_role(
        organization_id,
        array['owner', 'admin', 'dispatcher']::text[]
    )
    or exists (
        select 1
        from public.technician_profiles tp
        where tp.id = technician_unavailabilities.technician_profile_id
          and tp.user_id = (select auth.uid())
          and tp.organization_id = technician_unavailabilities.organization_id
    )
)
with check (
    private.has_org_role(
        organization_id,
        array['owner', 'admin', 'dispatcher']::text[]
    )
    or exists (
        select 1
        from public.technician_profiles tp
        where tp.id = technician_unavailabilities.technician_profile_id
          and tp.user_id = (select auth.uid())
          and tp.organization_id = technician_unavailabilities.organization_id
    )
);

-- 6.7 NOTIFICACIONES (notifications)
alter table public.notifications enable row level security;

create policy notifications_select_owner
on public.notifications
for select to authenticated
using (
    user_id = (select auth.uid())
    and private.is_org_member(organization_id)
);

create policy notifications_update_owner
on public.notifications
for update to authenticated
using (
    user_id = (select auth.uid())
    and private.is_org_member(organization_id)
)
with check (
    user_id = (select auth.uid())
    and private.is_org_member(organization_id)
);

create policy notifications_insert_staff
on public.notifications
for insert to authenticated
with check (
    private.has_org_role(
        organization_id,
        array['owner', 'admin', 'dispatcher', 'technician_internal']::text[]
    )
);

commit;
