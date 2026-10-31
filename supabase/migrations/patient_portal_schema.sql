-- =====================================================================
-- GOODIE-MEDHUB — Patient Portal Schema (Phases 3-5)
-- =====================================================================
-- Creates all new tables needed for the patient portal:
--   patient_users, patient_relatives, appointment_requests,
--   refill_requests, document_requests, patient_notifications,
--   payment_attempts
--
-- Assumes these core tables already exist:
--   hospitals, patients, invoices, lab_orders, lab_tests,
--   appointments, prescriptions
--
-- Safe to re-run (IF NOT EXISTS + DROP IF EXISTS for functions).
-- Run in the Supabase SQL Editor in one pass.
-- =====================================================================

-- =====================================================================
-- 0. Helper functions
-- =====================================================================

-- Helper: is the current user a staff member?
create or replace function public.is_staff()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid())
$$;

-- Helper: get the current patient's ID from auth.uid() via patient_users
create or replace function public.current_patient_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select patient_id from public.patient_users where user_id = auth.uid() and is_active = true
$$;

-- Helper: get the hospital_id for the current patient
create or replace function public.current_patient_hospital_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select hospital_id from public.patient_users where user_id = auth.uid() and is_active = true
$$;

-- Helper: is the current user a patient?
create or replace function public.is_patient()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from public.patient_users where user_id = auth.uid() and is_active = true)
$$;

-- =====================================================================
-- 1. patient_users — links auth.users to patients table
-- =====================================================================
create table if not exists public.patient_users (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null,                    -- auth.users.id
  patient_id      uuid not null,                    -- patients.id
  hospital_id     uuid not null,                    -- denormalized for fast queries
  is_relative     boolean not null default false,
  relative_of     uuid,                             -- primary patient_id if is_relative
  relationship    text,                             -- 'spouse','parent','child','sibling','guardian'
  can_view_labs   boolean not null default true,
  can_view_bills  boolean not null default true,
  can_view_appointments boolean not null default true,
  can_view_documents   boolean not null default true,
  can_pay         boolean not null default true,
  can_book        boolean not null default true,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, patient_id)
);

create index if not exists patient_users_user_idx on public.patient_users (user_id);
create index if not exists patient_users_patient_idx on public.patient_users (patient_id);
create index if not exists patient_users_hospital_idx on public.patient_users (hospital_id);

-- =====================================================================
-- 2. patient_relatives — links a relative to the primary patient
-- =====================================================================
create table if not exists public.patient_relatives (
  id                  uuid primary key default gen_random_uuid(),
  hospital_id         uuid not null,
  primary_patient_id  uuid not null,
  relative_patient_id uuid not null,
  relationship        text not null,
  granted_by          uuid,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists patient_relatives_primary_idx on public.patient_relatives (primary_patient_id, is_active);
create index if not exists patient_relatives_relative_idx on public.patient_relatives (relative_patient_id, is_active);
create index if not exists patient_relatives_hospital_idx on public.patient_relatives (hospital_id);

-- =====================================================================
-- 3. appointment_requests — patient-initiated appointment booking
-- =====================================================================
create table if not exists public.appointment_requests (
  id              uuid primary key default gen_random_uuid(),
  hospital_id     uuid not null,
  patient_id      uuid not null,
  patient_name    text,
  preferred_date  date not null,
  preferred_time  text,
  department      text,
  doctor_id       uuid,
  doctor_name     text,
  reason          text,
  status          text not null default 'pending'
                  check (status in ('pending','approved','rejected','cancelled','completed')),
  staff_notes     text,
  approved_by     uuid,
  approved_at     timestamptz,
  appointment_id  uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists appt_requests_patient_idx on public.appointment_requests (patient_id, created_at desc);
create index if not exists appt_requests_hospital_status_idx on public.appointment_requests (hospital_id, status, created_at desc);

-- =====================================================================
-- 4. refill_requests — prescription refill requests
-- =====================================================================
create table if not exists public.refill_requests (
  id              uuid primary key default gen_random_uuid(),
  hospital_id     uuid not null,
  patient_id      uuid not null,
  patient_name    text,
  prescription_id uuid,
  medication_name text not null,
  dosage          text,
  quantity        text,
  reason          text,
  status          text not null default 'pending'
                  check (status in ('pending','approved','rejected','dispensed','cancelled')),
  staff_notes     text,
  handled_by      uuid,
  handled_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists refill_requests_patient_idx on public.refill_requests (patient_id, created_at desc);
create index if not exists refill_requests_hospital_status_idx on public.refill_requests (hospital_id, status, created_at desc);

-- =====================================================================
-- 5. document_requests — official document requests
-- =====================================================================
create table if not exists public.document_requests (
  id              uuid primary key default gen_random_uuid(),
  hospital_id     uuid not null,
  patient_id      uuid not null,
  patient_name    text,
  document_type   text not null
                  check (document_type in ('medical_report','sick_leave','referral_letter','discharge_summary','lab_report_copy','other')),
  reason          text,
  status          text not null default 'pending'
                  check (status in ('pending','processing','ready','rejected','cancelled')),
  document_url    text,
  staff_notes     text,
  handled_by      uuid,
  handled_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists doc_requests_patient_idx on public.document_requests (patient_id, created_at desc);
create index if not exists doc_requests_hospital_status_idx on public.document_requests (hospital_id, status, created_at desc);

-- =====================================================================
-- 6. patient_notifications — in-app notification center
-- =====================================================================
create table if not exists public.patient_notifications (
  id              uuid primary key default gen_random_uuid(),
  hospital_id     uuid not null,
  patient_id      uuid not null,
  type            text not null
                  check (type in ('lab_result','invoice','appointment','payment','refill','document_request','appointment_request','general')),
  title           text not null,
  body            text,
  link_to         text,
  ref_id          uuid,
  is_read         boolean not null default false,
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists notifs_patient_unread_idx on public.patient_notifications (patient_id, is_read, created_at desc);
create index if not exists notifs_hospital_idx on public.patient_notifications (hospital_id, created_at desc);

-- =====================================================================
-- 7. payment_attempts — tracks Paystack/Flutterwave payments
-- =====================================================================
create table if not exists public.payment_attempts (
  id                  uuid primary key default gen_random_uuid(),
  hospital_id         uuid not null,
  patient_id          uuid not null,
  patient_name        text,
  invoice_id          uuid not null,
  invoice_number      text,
  amount              numeric(14, 2) not null check (amount > 0),
  gateway             text not null default 'paystack'
                      check (gateway in ('paystack','flutterwave','manual')),
  gateway_reference   text,
  gateway_access_code text,
  status              text not null default 'initiated'
                      check (status in ('initiated','success','failed','cancelled','refunded')),
  payment_id          uuid,
  failure_reason      text,
  created_at          timestamptz not null default now(),
  completed_at        timestamptz
);

create index if not exists pay_attempts_patient_idx on public.payment_attempts (patient_id, created_at desc);
create index if not exists pay_attempts_invoice_idx on public.payment_attempts (invoice_id, status);
create index if not exists pay_attempts_reference_idx on public.payment_attempts (gateway_reference);
create index if not exists pay_attempts_hospital_idx on public.payment_attempts (hospital_id, created_at desc);

-- =====================================================================
-- 8. updated_at triggers
-- =====================================================================
do $$
declare t text;
begin
  for t in select unnest(array[
    'patient_users','patient_relatives','appointment_requests',
    'refill_requests','document_requests','patient_notifications'
  ]) loop
    execute format('drop trigger if exists trg_%s_updated_at on public.%I', t, t);
    execute format('create trigger trg_%s_updated_at before update on public.%I for each row execute function public.set_updated_at()', t, t);
    execute format('alter table public.%I replica identity full', t);
  end loop;
end $$;

-- =====================================================================
-- 9. RLS Policies
-- =====================================================================

-- 9a. patient_users
alter table public.patient_users enable row level security;
drop policy if exists "patient_users_select" on public.patient_users;
create policy "patient_users_select" on public.patient_users for select using (user_id = auth.uid() or public.is_staff());
drop policy if exists "patient_users_insert" on public.patient_users;
create policy "patient_users_insert" on public.patient_users for insert with check (user_id = auth.uid() or public.is_staff());
drop policy if exists "patient_users_update" on public.patient_users;
create policy "patient_users_update" on public.patient_users for update using (user_id = auth.uid() or public.is_staff()) with check (user_id = auth.uid() or public.is_staff());

-- 9b. patient_relatives
alter table public.patient_relatives enable row level security;
drop policy if exists "patient_relatives_select" on public.patient_relatives;
create policy "patient_relatives_select" on public.patient_relatives for select using (
  public.current_patient_id() = primary_patient_id or public.current_patient_id() = relative_patient_id or public.is_staff()
);
drop policy if exists "patient_relatives_insert" on public.patient_relatives;
create policy "patient_relatives_insert" on public.patient_relatives for insert with check (public.current_patient_id() = primary_patient_id or public.is_staff());
drop policy if exists "patient_relatives_update" on public.patient_relatives;
create policy "patient_relatives_update" on public.patient_relatives for update using (public.current_patient_id() = primary_patient_id or public.is_staff()) with check (public.current_patient_id() = primary_patient_id or public.is_staff());
drop policy if exists "patient_relatives_delete" on public.patient_relatives;
create policy "patient_relatives_delete" on public.patient_relatives for delete using (public.current_patient_id() = primary_patient_id or public.is_staff());

-- 9c. appointment_requests
alter table public.appointment_requests enable row level security;
drop policy if exists "appt_requests_select" on public.appointment_requests;
create policy "appt_requests_select" on public.appointment_requests for select using (patient_id = public.current_patient_id() or public.is_staff());
drop policy if exists "appt_requests_insert" on public.appointment_requests;
create policy "appt_requests_insert" on public.appointment_requests for insert with check (patient_id = public.current_patient_id() and hospital_id = public.current_patient_hospital_id());
drop policy if exists "appt_requests_update" on public.appointment_requests;
create policy "appt_requests_update" on public.appointment_requests for update using (patient_id = public.current_patient_id() or public.is_staff()) with check (true);

-- 9d. refill_requests
alter table public.refill_requests enable row level security;
drop policy if exists "refill_requests_select" on public.refill_requests;
create policy "refill_requests_select" on public.refill_requests for select using (patient_id = public.current_patient_id() or public.is_staff());
drop policy if exists "refill_requests_insert" on public.refill_requests;
create policy "refill_requests_insert" on public.refill_requests for insert with check (patient_id = public.current_patient_id() and hospital_id = public.current_patient_hospital_id());
drop policy if exists "refill_requests_update" on public.refill_requests;
create policy "refill_requests_update" on public.refill_requests for update using (patient_id = public.current_patient_id() or public.is_staff()) with check (true);

-- 9e. document_requests
alter table public.document_requests enable row level security;
drop policy if exists "doc_requests_select" on public.document_requests;
create policy "doc_requests_select" on public.document_requests for select using (patient_id = public.current_patient_id() or public.is_staff());
drop policy if exists "doc_requests_insert" on public.document_requests;
create policy "doc_requests_insert" on public.document_requests for insert with check (patient_id = public.current_patient_id() and hospital_id = public.current_patient_hospital_id());
drop policy if exists "doc_requests_update" on public.document_requests;
create policy "doc_requests_update" on public.document_requests for update using (patient_id = public.current_patient_id() or public.is_staff()) with check (true);

-- 9f. patient_notifications
alter table public.patient_notifications enable row level security;
drop policy if exists "notifs_select" on public.patient_notifications;
create policy "notifs_select" on public.patient_notifications for select using (patient_id = public.current_patient_id() or public.is_staff());
drop policy if exists "notifs_insert" on public.patient_notifications;
create policy "notifs_insert" on public.patient_notifications for insert with check (patient_id = public.current_patient_id() or public.is_staff());
drop policy if exists "notifs_update" on public.patient_notifications;
create policy "notifs_update" on public.patient_notifications for update using (patient_id = public.current_patient_id() or public.is_staff()) with check (patient_id = public.current_patient_id() or public.is_staff());

-- 9g. payment_attempts
alter table public.payment_attempts enable row level security;
drop policy if exists "pay_attempts_select" on public.payment_attempts;
create policy "pay_attempts_select" on public.payment_attempts for select using (patient_id = public.current_patient_id() or public.is_staff());
drop policy if exists "pay_attempts_insert" on public.payment_attempts;
create policy "pay_attempts_insert" on public.payment_attempts for insert with check (patient_id = public.current_patient_id() and hospital_id = public.current_patient_hospital_id());
drop policy if exists "pay_attempts_update" on public.payment_attempts;
create policy "pay_attempts_update" on public.payment_attempts for update using (patient_id = public.current_patient_id() or public.is_staff()) with check (true);

-- =====================================================================
-- 10. Add to realtime publication
-- =====================================================================
do $$
declare t text;
begin
  for t in select unnest(array[
    'patient_users','patient_relatives','appointment_requests',
    'refill_requests','document_requests','patient_notifications','payment_attempts'
  ]) loop
    begin
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    exception when others then null;
    end;
  end loop;
end $$;
