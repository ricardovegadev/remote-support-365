begin;

create schema if not exists private;

revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- =========================================================
-- 1. IDENTIDAD Y ORGANIZACIONES
-- =========================================================

create table public.profiles (
    id uuid primary key references auth.users(id) on delete restrict,
    display_name text,
    avatar_path text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table public.organizations (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    slug text not null unique,
    status text not null default 'active'
        check (status in ('active', 'suspended', 'archived')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    archived_at timestamptz,
    check ((status = 'archived') = (archived_at is not null))
);

create table public.organization_members (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete restrict,
    user_id uuid not null references public.profiles(id) on delete restrict,
    role text not null check (
        role in (
            'owner',
            'admin',
            'dispatcher',
            'technician_internal',
            'technician_external',
            'viewer'
        )
    ),
    membership_type text not null default 'internal'
        check (membership_type in ('internal', 'external')),
    status text not null default 'active'
        check (status in ('invited', 'active', 'suspended', 'removed')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (organization_id, user_id),
    unique (organization_id, id),
    check (
        (role = 'technician_external' and membership_type = 'external')
        or
        (role <> 'technician_external' and membership_type = 'internal')
    )
);

create unique index organization_one_active_owner_idx
    on public.organization_members (organization_id)
    where role = 'owner' and status = 'active';

create table public.organization_invitations (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete restrict,
    email text not null,
    role text not null check (
        role in (
            'admin',
            'dispatcher',
            'technician_internal',
            'technician_external',
            'viewer'
        )
    ),
    token_hash text not null unique,
    invited_by uuid not null references public.profiles(id) on delete restrict,
    status text not null default 'pending'
        check (status in ('pending', 'accepted', 'expired', 'revoked')),
    expires_at timestamptz not null,
    accepted_at timestamptz,
    created_at timestamptz not null default now()
);

create index organization_invitations_org_status_idx
    on public.organization_invitations (organization_id, status);

create unique index organization_invitations_pending_email_idx
    on public.organization_invitations (organization_id, lower(email))
    where status = 'pending';

create table public.technician_profiles (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    user_id uuid not null,
    specialties text[] not null default '{}',
    availability_status text not null default 'available'
        check (availability_status in ('available', 'busy', 'unavailable')),
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (organization_id, user_id),
    foreign key (organization_id, user_id)
        references public.organization_members (organization_id, user_id)
        on delete restrict
);

-- =========================================================
-- 2. CLIENTES Y DISPOSITIVOS
-- =========================================================

create table public.clients (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete restrict,
    name text not null,
    email text,
    phone text,
    status text not null default 'active'
        check (status in ('active', 'inactive', 'archived')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    archived_at timestamptz,
    unique (organization_id, id),
    check ((status = 'archived') = (archived_at is not null))
);

create index clients_org_status_idx
    on public.clients (organization_id, status);

create table public.client_contacts (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    client_id uuid not null,
    name text not null,
    email text,
    phone text,
    position text,
    is_primary boolean not null default false,
    created_at timestamptz not null default now(),
    foreign key (organization_id, client_id)
        references public.clients (organization_id, id)
        on delete restrict
);

create table public.client_portal_memberships (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    client_id uuid not null,
    user_id uuid not null references public.profiles(id) on delete restrict,
    role text not null default 'client_user'
        check (role in ('client_admin', 'client_user')),
    status text not null default 'active'
        check (status in ('active', 'suspended', 'removed')),
    created_at timestamptz not null default now(),
    unique (organization_id, client_id, user_id),
    unique (organization_id, user_id),
    foreign key (organization_id, client_id)
        references public.clients (organization_id, id)
        on delete restrict
);

create table public.devices (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    client_id uuid not null,
    device_name text not null,
    operating_system text,
    device_identifier text,
    agent_type text not null default 'temporary'
        check (agent_type in ('temporary', 'installed')),
    status text not null default 'registered'
        check (status in ('registered', 'active', 'inactive', 'revoked')),
    last_seen_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (organization_id, id, client_id),
    foreign key (organization_id, client_id)
        references public.clients (organization_id, id)
        on delete restrict
);

create index devices_client_idx
    on public.devices (organization_id, client_id);

-- =========================================================
-- 3. TICKETS Y ASIGNACIONES
-- =========================================================

create table public.tickets (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    client_id uuid not null,
    device_id uuid,
    ticket_number bigint,
    subject text not null,
    description text,
    priority text not null default 'normal'
        check (priority in ('low', 'normal', 'high', 'urgent')),
    status text not null default 'new'
        check (
            status in (
                'new',
                'open',
                'in_progress',
                'waiting_client',
                'waiting_third_party',
                'resolved',
                'closed',
                'cancelled'
            )
        ),
    source text not null default 'portal'
        check (source in ('portal', 'technician_invitation', 'internal')),
    created_by uuid references public.profiles(id) on delete restrict,
    resolved_at timestamptz,
    closed_at timestamptz,
    archived_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (organization_id, id),
    unique (organization_id, id, client_id),
    unique (organization_id, ticket_number),
    foreign key (organization_id, client_id)
        references public.clients (organization_id, id)
        on delete restrict,
    foreign key (organization_id, device_id, client_id)
        references public.devices (organization_id, id, client_id)
        on delete restrict
);

create index tickets_org_status_idx
    on public.tickets (organization_id, status, created_at desc);

create index tickets_client_idx
    on public.tickets (organization_id, client_id, created_at desc);

create table public.ticket_assignments (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    ticket_id uuid not null,
    membership_id uuid not null,
    assigned_by uuid references public.profiles(id) on delete restrict,
    status text not null default 'active'
        check (status in ('active', 'accepted', 'declined', 'completed', 'cancelled')),
    assigned_at timestamptz not null default now(),
    responded_at timestamptz,
    completed_at timestamptz,
    foreign key (organization_id, ticket_id)
        references public.tickets (organization_id, id)
        on delete restrict,
    foreign key (organization_id, membership_id)
        references public.organization_members (organization_id, id)
        on delete restrict
);

create unique index ticket_assignments_one_active_member_idx
    on public.ticket_assignments (organization_id, ticket_id, membership_id)
    where status in ('active', 'accepted');

create index ticket_assignments_membership_idx
    on public.ticket_assignments (organization_id, membership_id, status);

create table public.ticket_comments (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    ticket_id uuid not null,
    author_user_id uuid references public.profiles(id) on delete restrict,
    body text not null,
    visibility text not null default 'internal'
        check (visibility in ('internal', 'client')),
    created_at timestamptz not null default now(),
    foreign key (organization_id, ticket_id)
        references public.tickets (organization_id, id)
        on delete restrict
);

create index ticket_comments_ticket_idx
    on public.ticket_comments (organization_id, ticket_id, created_at);

create table public.ticket_attachments (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    ticket_id uuid not null,
    uploaded_by uuid references public.profiles(id) on delete restrict,
    storage_path text not null,
    file_name text not null,
    content_type text,
    file_size_bytes bigint check (file_size_bytes is null or file_size_bytes >= 0),
    visibility text not null default 'internal'
        check (visibility in ('internal', 'client')),
    created_at timestamptz not null default now(),
    foreign key (organization_id, ticket_id)
        references public.tickets (organization_id, id)
        on delete restrict,
    unique (storage_path),
    check (storage_path like (organization_id::text || '/%'))
);

create table public.ticket_transitions (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    ticket_id uuid not null,
    previous_status text
        check (
            previous_status is null
            or previous_status in (
                'new',
                'open',
                'in_progress',
                'waiting_client',
                'waiting_third_party',
                'resolved',
                'closed',
                'cancelled'
            )
        ),
    new_status text not null
        check (
            new_status in (
                'new',
                'open',
                'in_progress',
                'waiting_client',
                'waiting_third_party',
                'resolved',
                'closed',
                'cancelled'
            )
        ),
    changed_by uuid references public.profiles(id) on delete restrict,
    reason text,
    created_at timestamptz not null default now(),
    foreign key (organization_id, ticket_id)
        references public.tickets (organization_id, id)
        on delete restrict
);

create index ticket_transitions_ticket_idx
    on public.ticket_transitions (organization_id, ticket_id, created_at);

-- =========================================================
-- 4. SOLICITUDES Y SESIONES REMOTAS
-- =========================================================

create table public.remote_session_requests (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    ticket_id uuid not null,
    client_id uuid not null,
    device_id uuid not null,
    requested_by uuid references public.profiles(id) on delete restrict,
    access_mode text not null default 'attended'
        check (access_mode = 'attended'),
    status text not null default 'pending'
        check (
            status in (
                'pending',
                'approved',
                'rejected',
                'expired',
                'cancelled',
                'completed'
            )
        ),
    requested_at timestamptz not null default now(),
    expires_at timestamptz,
    responded_at timestamptz,
    unique (organization_id, id),
    unique (organization_id, id, device_id),
    foreign key (organization_id, ticket_id, client_id)
        references public.tickets (organization_id, id, client_id)
        on delete restrict,
    foreign key (organization_id, device_id, client_id)
        references public.devices (organization_id, id, client_id)
        on delete restrict
);

create index remote_session_requests_ticket_idx
    on public.remote_session_requests (organization_id, ticket_id, requested_at desc);

create table public.remote_session_attempts (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    request_id uuid not null,
    attempt_number integer not null check (attempt_number > 0),
    engine text not null default 'rustdesk',
    engine_session_ref text,
    status text not null default 'created'
        check (
            status in (
                'created',
                'connecting',
                'connected',
                'failed',
                'ended'
            )
        ),
    failure_code text,
    failure_detail text,
    started_at timestamptz,
    ended_at timestamptz,
    created_at timestamptz not null default now(),
    unique (organization_id, id, request_id),
    unique (organization_id, request_id, attempt_number),
    check (ended_at is null or (started_at is not null and ended_at >= started_at)),
    foreign key (organization_id, request_id)
        references public.remote_session_requests (organization_id, id)
        on delete restrict
);

create table public.remote_sessions (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    request_id uuid not null,
    attempt_id uuid not null,
    device_id uuid not null,
    technician_user_id uuid references public.profiles(id) on delete restrict,
    status text not null default 'active'
        check (status in ('active', 'ended', 'interrupted')),
    started_at timestamptz not null default now(),
    ended_at timestamptz,
    duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
    created_at timestamptz not null default now(),
    check (ended_at is null or ended_at >= started_at),
    foreign key (organization_id, request_id, device_id)
        references public.remote_session_requests (organization_id, id, device_id)
        on delete restrict,
    foreign key (organization_id, attempt_id, request_id)
        references public.remote_session_attempts (organization_id, id, request_id)
        on delete restrict
);

create table public.session_consents (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    request_id uuid not null,
    device_id uuid not null,
    granted_by_user_id uuid references public.profiles(id) on delete restrict,
    granted_by_name text,
    consent_method text not null
        check (consent_method in ('local_confirmation', 'portal_confirmation', 'other')),
    evidence_reference text,
    granted_at timestamptz not null default now(),
    unique (organization_id, id),
    check (granted_by_user_id is not null or granted_by_name is not null),
    foreign key (organization_id, request_id, device_id)
        references public.remote_session_requests (organization_id, id, device_id)
        on delete restrict
);

create table public.consent_revocations (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    consent_id uuid not null,
    revoked_by uuid references public.profiles(id) on delete restrict,
    reason text,
    revoked_at timestamptz not null default now(),
    unique (consent_id),
    foreign key (organization_id, consent_id)
        references public.session_consents (organization_id, id)
        on delete restrict
);

-- =========================================================
-- 5. AUDITORÍA Y SEGURIDAD
-- =========================================================

create table public.audit_logs (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid references public.organizations(id) on delete restrict,
    actor_user_id uuid references public.profiles(id) on delete restrict,
    action text not null,
    entity_type text not null,
    entity_id uuid,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create index audit_logs_org_created_idx
    on public.audit_logs (organization_id, created_at desc);

create table public.security_events (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid references public.organizations(id) on delete restrict,
    actor_user_id uuid references public.profiles(id) on delete restrict,
    event_type text not null,
    severity text not null default 'info'
        check (severity in ('info', 'warning', 'critical')),
    details jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create index security_events_org_created_idx
    on public.security_events (organization_id, created_at desc);

-- =========================================================
-- 6. FUNCIONES PRIVADAS DE AUTORIZACIÓN
-- =========================================================

create or replace function private.is_org_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.organization_members m
        join public.organizations o
          on o.id = m.organization_id
        where m.organization_id = p_organization_id
          and m.user_id = (select auth.uid())
          and m.status = 'active'
          and o.status = 'active'
          and o.archived_at is null
    );
$$;

create or replace function private.has_org_role(
    p_organization_id uuid,
    p_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.organization_members m
        join public.organizations o
          on o.id = m.organization_id
        where m.organization_id = p_organization_id
          and m.user_id = (select auth.uid())
          and m.status = 'active'
          and o.status = 'active'
          and o.archived_at is null
          and m.role = any(p_roles)
    );
$$;

create or replace function private.is_ticket_assignee(
    p_organization_id uuid,
    p_ticket_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.ticket_assignments a
        join public.organization_members m
          on m.organization_id = a.organization_id
         and m.id = a.membership_id
        join public.organizations o
          on o.id = a.organization_id
        where a.organization_id = p_organization_id
          and a.ticket_id = p_ticket_id
          and m.user_id = (select auth.uid())
          and m.status = 'active'
          and a.status in ('active', 'accepted')
          and o.status = 'active'
          and o.archived_at is null
    );
$$;

create or replace function private.is_portal_client(
    p_organization_id uuid,
    p_client_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.client_portal_memberships pm
        join public.organizations o
          on o.id = pm.organization_id
        where pm.organization_id = p_organization_id
          and pm.client_id = p_client_id
          and pm.user_id = (select auth.uid())
          and pm.status = 'active'
          and o.status = 'active'
          and o.archived_at is null
    );
$$;

create or replace function private.can_read_ticket(
    p_organization_id uuid,
    p_ticket_id uuid,
    p_client_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select
        private.has_org_role(
            p_organization_id,
            array['owner', 'admin', 'dispatcher', 'viewer']::text[]
        )
        or (
            private.has_org_role(
                p_organization_id,
                array['technician_internal', 'technician_external']::text[]
            )
            and private.is_ticket_assignee(p_organization_id, p_ticket_id)
        )
        or private.is_portal_client(p_organization_id, p_client_id);
$$;

create or replace function private.can_read_internal_ticket_data(
    p_organization_id uuid,
    p_ticket_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select
        private.has_org_role(
            p_organization_id,
            array['owner', 'admin', 'dispatcher', 'viewer']::text[]
        )
        or (
            private.has_org_role(
                p_organization_id,
                array['technician_internal']::text[]
            )
            and private.is_ticket_assignee(p_organization_id, p_ticket_id)
        );
$$;

create or replace function private.can_read_profile(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select
        p_user_id = (select auth.uid())
        or exists (
            select 1
            from public.organization_members mine
            join public.organization_members theirs
              on theirs.organization_id = mine.organization_id
            join public.organizations o
              on o.id = mine.organization_id
            where mine.user_id = (select auth.uid())
              and theirs.user_id = p_user_id
              and mine.status = 'active'
              and mine.role in (
                  'owner',
                  'admin',
                  'dispatcher',
                  'technician_internal',
                  'viewer'
              )
              and theirs.status = 'active'
              and o.status = 'active'
              and o.archived_at is null
        );
$$;

revoke all on function private.is_org_member(uuid) from public, anon;
revoke all on function private.has_org_role(uuid, text[]) from public, anon;
revoke all on function private.is_ticket_assignee(uuid, uuid) from public, anon;
revoke all on function private.is_portal_client(uuid, uuid) from public, anon;
revoke all on function private.can_read_ticket(uuid, uuid, uuid) from public, anon;
revoke all on function private.can_read_internal_ticket_data(uuid, uuid) from public, anon;
revoke all on function private.can_read_profile(uuid) from public, anon;

grant execute on function private.is_org_member(uuid) to authenticated;
grant execute on function private.has_org_role(uuid, text[]) to authenticated;
grant execute on function private.is_ticket_assignee(uuid, uuid) to authenticated;
grant execute on function private.is_portal_client(uuid, uuid) to authenticated;
grant execute on function private.can_read_ticket(uuid, uuid, uuid) to authenticated;
grant execute on function private.can_read_internal_ticket_data(uuid, uuid) to authenticated;
grant execute on function private.can_read_profile(uuid) to authenticated;

-- =========================================================
-- 7. ROW LEVEL SECURITY
-- =========================================================

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_invitations enable row level security;
alter table public.technician_profiles enable row level security;
alter table public.clients enable row level security;
alter table public.client_contacts enable row level security;
alter table public.client_portal_memberships enable row level security;
alter table public.devices enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_assignments enable row level security;
alter table public.ticket_comments enable row level security;
alter table public.ticket_attachments enable row level security;
alter table public.ticket_transitions enable row level security;
alter table public.remote_session_requests enable row level security;
alter table public.remote_session_attempts enable row level security;
alter table public.remote_sessions enable row level security;
alter table public.session_consents enable row level security;
alter table public.consent_revocations enable row level security;
alter table public.audit_logs enable row level security;
alter table public.security_events enable row level security;

-- Perfiles: el usuario y sus compañeros de organización.
create policy profiles_select_scoped
on public.profiles
for select to authenticated
using (private.can_read_profile(id));

-- Organizaciones: solo miembros activos de organizaciones activas.
create policy organizations_select_member
on public.organizations
for select to authenticated
using (private.is_org_member(id));

-- Miembros: cada miembro consulta su propia membresía;
-- solo los roles internos activos pueden consultar el directorio de su organización.
create policy organization_members_select_scoped
on public.organization_members
for select to authenticated
using (
    (
        user_id = (select auth.uid())
        and private.is_org_member(organization_id)
    )
    or private.has_org_role(
        organization_id,
        array['owner', 'admin', 'dispatcher', 'technician_internal', 'viewer']::text[]
    )
);

-- Invitaciones: solo responsables de la organización.
create policy organization_invitations_select_managers
on public.organization_invitations
for select to authenticated
using (
    private.has_org_role(
        organization_id,
        array['owner', 'admin']::text[]
    )
);

-- Perfiles técnicos: el propio técnico y responsables.
create policy technician_profiles_select_scoped
on public.technician_profiles
for select to authenticated
using (
    (
        user_id = (select auth.uid())
        and private.is_org_member(organization_id)
    )
    or private.has_org_role(
        organization_id,
        array['owner', 'admin', 'dispatcher']::text[]
    )
);

-- Clientes: personal autorizado de la organización.
create policy clients_select_staff
on public.clients
for select to authenticated
using (
    private.has_org_role(
        organization_id,
        array['owner', 'admin', 'dispatcher', 'technician_internal', 'viewer']::text[]
    )
);

-- Contactos: únicamente responsables y personal interno autorizado.
create policy client_contacts_select_staff
on public.client_contacts
for select to authenticated
using (
    private.has_org_role(
        organization_id,
        array['owner', 'admin', 'dispatcher', 'technician_internal', 'viewer']::text[]
    )
);

-- Membresías del portal: el usuario ve su propia vinculación activa;
-- los responsables pueden consultar las de su organización.
create policy client_portal_memberships_select_scoped
on public.client_portal_memberships
for select to authenticated
using (
    (
        user_id = (select auth.uid())
        and private.is_portal_client(organization_id, client_id)
    )
    or private.has_org_role(
        organization_id,
        array['owner', 'admin', 'dispatcher']::text[]
    )
);

-- Dispositivos: responsables y técnicos internos autorizados.
-- No se exponen identificadores técnicos al portal del cliente.
create policy devices_select_staff
on public.devices
for select to authenticated
using (
    private.has_org_role(
        organization_id,
        array['owner', 'admin', 'dispatcher', 'technician_internal']::text[]
    )
);

-- Tickets: responsables y viewer tienen lectura organizacional;
-- técnicos solo acceden a tickets asignados;
-- portal limitado a tickets de su cliente.
create policy tickets_select_scoped
on public.tickets
for select to authenticated
using (
    private.can_read_ticket(organization_id, id, client_id)
);

-- Asignaciones: responsables consultan todas; cada técnico consulta las propias.
create policy ticket_assignments_select_scoped
on public.ticket_assignments
for select to authenticated
using (
    private.has_org_role(
        organization_id,
        array['owner', 'admin', 'dispatcher']::text[]
    )
    or (
        private.is_org_member(organization_id)
        and exists (
            select 1
            from public.organization_members m
            where m.organization_id = ticket_assignments.organization_id
              and m.id = ticket_assignments.membership_id
              and m.user_id = (select auth.uid())
              and m.status = 'active'
        )
    )
);

-- Comentarios: client visible a quien puede leer el ticket;
-- internal visible exclusivamente a personal autorizado del ticket.
create policy ticket_comments_select_scoped
on public.ticket_comments
for select to authenticated
using (
    exists (
        select 1
        from public.tickets t
        where t.organization_id = ticket_comments.organization_id
          and t.id = ticket_comments.ticket_id
          and (
              (
                  ticket_comments.visibility = 'client'
                  and private.can_read_ticket(t.organization_id, t.id, t.client_id)
              )
              or (
                  ticket_comments.visibility = 'internal'
                  and private.can_read_internal_ticket_data(t.organization_id, t.id)
              )
          )
    )
);

-- Adjuntos: mismo alcance explícito que los comentarios.
create policy ticket_attachments_select_scoped
on public.ticket_attachments
for select to authenticated
using (
    exists (
        select 1
        from public.tickets t
        where t.organization_id = ticket_attachments.organization_id
          and t.id = ticket_attachments.ticket_id
          and (
              (
                  ticket_attachments.visibility = 'client'
                  and private.can_read_ticket(t.organization_id, t.id, t.client_id)
              )
              or (
                  ticket_attachments.visibility = 'internal'
                  and private.can_read_internal_ticket_data(t.organization_id, t.id)
              )
          )
    )
);

-- Historial de transiciones: personal autorizado del ticket.
create policy ticket_transitions_select_scoped
on public.ticket_transitions
for select to authenticated
using (
    exists (
        select 1
        from public.tickets t
        where t.organization_id = ticket_transitions.organization_id
          and t.id = ticket_transitions.ticket_id
          and private.can_read_ticket(t.organization_id, t.id, t.client_id)
    )
);

-- Solicitudes remotas: responsables y técnico interno asignado.
create policy remote_session_requests_select_staff
on public.remote_session_requests
for select to authenticated
using (
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
);

-- Intentos: únicamente responsables y técnico interno asignado.
create policy remote_session_attempts_select_staff
on public.remote_session_attempts
for select to authenticated
using (
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
            from public.remote_session_requests r
            where r.organization_id = remote_session_attempts.organization_id
              and r.id = remote_session_attempts.request_id
              and private.is_ticket_assignee(r.organization_id, r.ticket_id)
        )
    )
);

-- Sesiones: responsables y técnico interno asignado.
create policy remote_sessions_select_staff
on public.remote_sessions
for select to authenticated
using (
    private.has_org_role(
        organization_id,
        array['owner', 'admin', 'dispatcher']::text[]
    )
    or (
        technician_user_id = (select auth.uid())
        and private.has_org_role(
            organization_id,
            array['technician_internal']::text[]
        )
    )
);

-- Consentimientos: acceso restringido a responsables.
create policy session_consents_select_managers
on public.session_consents
for select to authenticated
using (
    private.has_org_role(
        organization_id,
        array['owner', 'admin']::text[]
    )
);

create policy consent_revocations_select_managers
on public.consent_revocations
for select to authenticated
using (
    private.has_org_role(
        organization_id,
        array['owner', 'admin']::text[]
    )
);

-- Auditoría: solo owner y admin.
create policy audit_logs_select_managers
on public.audit_logs
for select to authenticated
using (
    organization_id is not null
    and private.has_org_role(
        organization_id,
        array['owner', 'admin']::text[]
    )
);

create policy security_events_select_managers
on public.security_events
for select to authenticated
using (
    organization_id is not null
    and private.has_org_role(
        organization_id,
        array['owner', 'admin']::text[]
    )
);

-- =========================================================
-- 8. PRIVILEGIOS EXPLÍCITOS
-- =========================================================

revoke all on table
    public.profiles,
    public.organizations,
    public.organization_members,
    public.organization_invitations,
    public.technician_profiles,
    public.clients,
    public.client_contacts,
    public.client_portal_memberships,
    public.devices,
    public.tickets,
    public.ticket_assignments,
    public.ticket_comments,
    public.ticket_attachments,
    public.ticket_transitions,
    public.remote_session_requests,
    public.remote_session_attempts,
    public.remote_sessions,
    public.session_consents,
    public.consent_revocations,
    public.audit_logs,
    public.security_events
from anon, authenticated;

-- En esta migración solo se habilita SELECT.
-- No se habilitan INSERT, UPDATE ni DELETE desde el cliente.
grant select on table
    public.profiles,
    public.organizations,
    public.organization_members,
    public.organization_invitations,
    public.technician_profiles,
    public.clients,
    public.client_contacts,
    public.client_portal_memberships,
    public.devices,
    public.tickets,
    public.ticket_assignments,
    public.ticket_comments,
    public.ticket_attachments,
    public.ticket_transitions,
    public.remote_session_requests,
    public.remote_session_attempts,
    public.remote_sessions,
    public.session_consents,
    public.consent_revocations,
    public.audit_logs,
    public.security_events
to authenticated;

commit;
