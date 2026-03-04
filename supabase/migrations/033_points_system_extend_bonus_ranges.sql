-- Extend bonus ranges to cover longer-priced winners (e.g. 33/1 = decimal 34).
-- Previous bonus_win max was 26.01–29; bonus_place max was 23.01–26.
-- 33/1 = 34 decimal fell outside all ranges and got 0 sp_points.

insert into public.points_system (min_decimal, max_decimal, points, type) values
-- Bonus - Win: 29.01–999 (e.g. 33/1, 50/1)
(29.01, 999, 20, 'bonus_win'),
-- Bonus - Place: 26.01–999
(26.01, 999, 10, 'bonus_place');
