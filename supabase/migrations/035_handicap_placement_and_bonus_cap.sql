-- Handicap placement rules and bonus cap:
-- 1) Handicap placement is now in update-race-results.ts: <5 runners = win only; 5–7 = 1st & 2nd; 8–15 = 1st,2nd,3rd; 16+ = 1st–4th.
-- 2) Cap place bonus at 8 pts: extend top bonus_place range to 23.01–999 (8 pts), remove 26.01–999 (10 pts).
-- 3) Extend top bonus_win range to 26.01–999 (15 pts), remove 29.01–999 (20 pts).

-- Extend previous top brackets to 999 (keeps max place bonus at 8, max win bonus at 15 for 26.01+)
update public.points_system
set max_decimal = 999
where type = 'bonus_win' and min_decimal = 26.01 and max_decimal = 29;

update public.points_system
set max_decimal = 999
where type = 'bonus_place' and min_decimal = 23.01 and max_decimal = 26;

-- Remove the higher ranges that gave 20 (win) and 10 (place)
delete from public.points_system
where type = 'bonus_win' and min_decimal = 29.01 and max_decimal = 999;

delete from public.points_system
where type = 'bonus_place' and min_decimal = 26.01 and max_decimal = 999;
