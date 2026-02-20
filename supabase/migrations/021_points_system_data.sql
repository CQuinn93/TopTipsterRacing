-- Insert points system data: Standard (flat) + Bonus (odds range).
-- Standard: Winner 5 pts, Place 1 pt (all odds). Bonus: additional points by SP range.

insert into public.points_system (min_decimal, max_decimal, points, type) values
-- Standard (apply to all win/place; use 0–999 to mean no odds limit)
(0, 999, 5, 'standard_win'),
(0, 999, 1, 'standard_place'),
-- Bonus - Win (by odds range)
(2.625, 4, 1, 'bonus_win'),
(4.33, 6, 2, 'bonus_win'),
(6.5, 8, 3, 'bonus_win'),
(8.5, 11, 4, 'bonus_win'),
(12, 15, 5, 'bonus_win'),
(17, 19, 7, 'bonus_win'),
(21, 26, 10, 'bonus_win'),
(26.01, 29, 15, 'bonus_win'),
-- Bonus - Place (by odds range)
(4, 6, 1, 'bonus_place'),
(6.5, 8, 2, 'bonus_place'),
(8.5, 11, 3, 'bonus_place'),
(12, 17, 4, 'bonus_place'),
(19, 23, 6, 'bonus_place'),
(23.01, 26, 8, 'bonus_place');
