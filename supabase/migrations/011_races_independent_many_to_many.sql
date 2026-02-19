-- Races independent of competitions: many-to-many via courses.
-- competition_courses: which courses a competition uses (admin sets 1+ when creating)
-- competition_race_days: bridge linking competitions to race_days
-- race_days: no competition_id, unique(course, race_date)

-- 1. competition_courses: competition ↔ courses (many-to-many)
create table if not exists public.competition_courses (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  course text not null,
  unique(competition_id, course)
);
create index if not exists idx_competition_courses_competition on public.competition_courses(competition_id);
create index if not exists idx_competition_courses_course on public.competition_courses(course);
alter table public.competition_courses enable row level security;
create policy "Competition courses read" on public.competition_courses for select using (true);

-- 2. competition_race_days: bridge (competition ↔ race_days)
create table if not exists public.competition_race_days (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  race_day_id uuid not null references public.race_days(id) on delete cascade,
  unique(competition_id, race_day_id)
);
create index if not exists idx_competition_race_days_competition on public.competition_race_days(competition_id);
create index if not exists idx_competition_race_days_race_day on public.competition_race_days(race_day_id);
alter table public.competition_race_days enable row level security;
create policy "Competition race days read" on public.competition_race_days for select using (true);

-- 3. Migrate existing data: populate competition_race_days before altering race_days
insert into public.competition_race_days (competition_id, race_day_id)
select competition_id, id from public.race_days
on conflict (competition_id, race_day_id) do nothing;

-- 4. Backfill competition_courses for existing competitions (default Newcastle)
insert into public.competition_courses (competition_id, course)
select id, 'Newcastle' from public.competitions
where not exists (select 1 from public.competition_courses cc where cc.competition_id = competitions.id);

-- 5. Add course to race_days (from competition_courses)
alter table public.race_days add column if not exists course text;
update public.race_days rd set course = (
  select cc.course from public.competition_courses cc
  where cc.competition_id = rd.competition_id
  limit 1
) where rd.course is null and rd.competition_id is not null;
update public.race_days set course = 'Newcastle' where course is null;

-- 6. Merge duplicate (course, race_date): keep one, reassign FKs, delete others
do $$
declare
  r record;
  kept_id uuid;
begin
  for r in (
    select course, race_date, array_agg(id order by id) as ids
    from public.race_days
    group by course, race_date
    having count(*) > 1
  ) loop
    kept_id := r.ids[1];
    -- Reassign competition_race_days from duplicates to kept
    update public.competition_race_days set race_day_id = kept_id
    where race_day_id = any(r.ids[2:array_length(r.ids,1)]);
    -- Reassign races
    update public.races set race_day_id = kept_id where race_day_id = any(r.ids[2:array_length(r.ids,1)]);
    -- Delete duplicate race_days
    delete from public.race_days where id = any(r.ids[2:array_length(r.ids,1)]);
  end loop;
end $$;

-- 7. Drop competition_id and old unique; add new unique
alter table public.race_days drop constraint if exists race_days_competition_id_race_date_key;
alter table public.race_days drop column if exists competition_id;
alter table public.race_days alter column course set not null;
alter table public.race_days add constraint race_days_course_race_date_key unique(course, race_date);

-- 8. Drop old index, add new
drop index if exists public.idx_race_days_competition_date;
create index if not exists idx_race_days_course_date on public.race_days(course, race_date);
