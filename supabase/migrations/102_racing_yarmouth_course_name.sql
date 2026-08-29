-- Display Great Yarmouth as Yarmouth in racing meetings / competition setup.

-- competition_courses: rename when the competition does not already have Yarmouth
update public.competition_courses cc
set course = 'Yarmouth'
where cc.course = 'Great Yarmouth'
  and not exists (
    select 1
    from public.competition_courses existing
    where existing.competition_id = cc.competition_id
      and existing.course = 'Yarmouth'
  );

delete from public.competition_courses
where course = 'Great Yarmouth';

-- race_days: prefer an existing Yarmouth row for the same date; otherwise rename
do $$
declare
  r record;
begin
  for r in
    select gy.id as gy_id, y.id as y_id
    from public.race_days gy
    join public.race_days y
      on y.race_date = gy.race_date
     and y.course = 'Yarmouth'
    where gy.course = 'Great Yarmouth'
  loop
    update public.competition_race_days
    set race_day_id = r.y_id
    where race_day_id = r.gy_id
      and not exists (
        select 1
        from public.competition_race_days crd
        where crd.competition_id = competition_race_days.competition_id
          and crd.race_day_id = r.y_id
      );

    delete from public.competition_race_days where race_day_id = r.gy_id;
    delete from public.race_days where id = r.gy_id;
  end loop;
end $$;

update public.race_days
set course = 'Yarmouth'
where course = 'Great Yarmouth';
