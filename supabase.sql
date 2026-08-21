-- Run this entire file in Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.multiplication_students (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.multiplication_attempts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.multiplication_students(id) on delete restrict,
  score integer not null default 0,
  correct integer not null default 0,
  total integer not null default 0,
  accuracy integer not null default 0,
  best_streak integer not null default 0,
  duration_seconds integer not null default 60,
  tables integer[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.multiplication_students enable row level security;
alter table public.multiplication_attempts enable row level security;

drop policy if exists "classroom read students" on public.multiplication_students;
create policy "classroom read students" on public.multiplication_students for select using (true);
drop policy if exists "classroom insert students" on public.multiplication_students;
create policy "classroom insert students" on public.multiplication_students for insert with check (true);
drop policy if exists "classroom update students" on public.multiplication_students;
create policy "classroom update students" on public.multiplication_students for update using (true);
drop policy if exists "classroom delete students" on public.multiplication_students;
create policy "classroom delete students" on public.multiplication_students for delete using (true);

drop policy if exists "classroom read attempts" on public.multiplication_attempts;
create policy "classroom read attempts" on public.multiplication_attempts for select using (true);
drop policy if exists "classroom insert attempts" on public.multiplication_attempts;
create policy "classroom insert attempts" on public.multiplication_attempts for insert with check (true);


-- Preload the Year 5 class roster. Existing matching names are left unchanged.
insert into public.multiplication_students (name)
select student_name
from unnest(array[
  'Isabelle','Malia','Addison','Simone','Prashish','Samuel','Samrat','Vincent','Josias','Logan',
  'Denise','Skylah','Elizabeth','Charlie','Vase','Brayden','Jordan','Miraya','Shayna','Felicia',
  'Juana','Lyn','Ithiel','Daniel','Dantae','Ollie','Oliver','Prisha','JayJay'
]) as student_name
where not exists (
  select 1 from public.multiplication_students where lower(name) = lower(student_name)
);


-- Explicit API permissions for student devices and the teacher dashboard.
grant select, insert on public.multiplication_attempts to anon, authenticated;
grant select, insert, update, delete on public.multiplication_students to anon, authenticated;
