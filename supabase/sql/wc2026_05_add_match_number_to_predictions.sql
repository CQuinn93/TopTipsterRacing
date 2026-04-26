-- Match number support for wc2026.predictions
-- Safe to run even if already applied.

alter table wc2026.predictions
  add column if not exists match_number integer;

create index if not exists idx_wc2026_predictions_match_number
  on wc2026.predictions(match_number);

update wc2026.predictions p
set match_number = m.match_number
from wc2026.matches m
where p.match_id = m.id
  and p.match_number is null;

alter table wc2026.predictions
  drop constraint if exists predictions_user_id_match_id_prediction_type_key;

alter table wc2026.predictions
  drop constraint if exists predictions_user_id_match_number_prediction_type_key;

alter table wc2026.predictions
  add constraint predictions_user_id_match_number_prediction_type_key
  unique (user_id, match_number, prediction_type);

create index if not exists idx_wc2026_predictions_user_match_number
  on wc2026.predictions(user_id, match_number, prediction_type);

comment on column wc2026.predictions.match_number is
  'Official FIFA match number (1-72 for group stage, 73+ knockout).';
