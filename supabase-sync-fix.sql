-- SAFE SYNC FIX: run this in Supabase SQL Editor.
-- It does not delete any student or result data.

alter table public.multiplication_students enable row level security;
alter table public.multiplication_attempts enable row level security;

drop policy if exists "classroom read students" on public.multiplication_students;
create policy "classroom read students" on public.multiplication_students for select using (true);
drop policy if exists "classroom insert students" on public.multiplication_students;
create policy "classroom insert students" on public.multiplication_students for insert with check (true);
drop policy if exists "classroom update students" on public.multiplication_students;
create policy "classroom update students" on public.multiplication_students for update using (true) with check (true);
drop policy if exists "classroom delete students" on public.multiplication_students;
create policy "classroom delete students" on public.multiplication_students for delete using (true);

drop policy if exists "classroom read attempts" on public.multiplication_attempts;
create policy "classroom read attempts" on public.multiplication_attempts for select using (true);
drop policy if exists "classroom insert attempts" on public.multiplication_attempts;
create policy "classroom insert attempts" on public.multiplication_attempts for insert with check (true);

grant select, insert on public.multiplication_attempts to anon, authenticated;
grant select, insert, update, delete on public.multiplication_students to anon, authenticated;

-- Quick check: this should return the columns used by the app.
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'multiplication_attempts'
order by ordinal_position;
