-- Seed Data for 2026 FIFA World Cup (wc2026 schema)

insert into wc2026.tournament_stages (stage_name, stage_order, is_knockout) values
('Group Stage', 1, false),
('Round of 32', 2, true),
('Round of 16', 3, true),
('Quarter Finals', 4, true),
('Semi Finals', 5, true),
('Third Place', 6, true),
('Final', 7, true)
on conflict (stage_name) do nothing;

do $$
declare
  group_stage_id uuid;
begin
  select id into group_stage_id from wc2026.tournament_stages where stage_name = 'Group Stage';

  insert into wc2026.groups (group_name, tournament_stage_id) values
  ('A', group_stage_id), ('B', group_stage_id), ('C', group_stage_id), ('D', group_stage_id),
  ('E', group_stage_id), ('F', group_stage_id), ('G', group_stage_id), ('H', group_stage_id),
  ('I', group_stage_id), ('J', group_stage_id), ('K', group_stage_id), ('L', group_stage_id)
  on conflict (group_name) do nothing;
end $$;

insert into wc2026.venues (name, city, country, capacity) values
('MetLife Stadium', 'East Rutherford', 'United States', 82500),
('Lincoln Financial Field', 'Philadelphia', 'United States', 69596),
('AT&T Stadium', 'Arlington', 'United States', 80000),
('Gillette Stadium', 'Foxborough', 'United States', 65878),
('Arrowhead Stadium', 'Kansas City', 'United States', 76416),
('Hard Rock Stadium', 'Miami Gardens', 'United States', 65326),
('Mercedes-Benz Stadium', 'Atlanta', 'United States', 71000),
('NRG Stadium', 'Houston', 'United States', 72220),
('Levi''s Stadium', 'Santa Clara', 'United States', 68500),
('Lumen Field', 'Seattle', 'United States', 68740),
('SoFi Stadium', 'Inglewood', 'United States', 70240),
('BC Place', 'Vancouver', 'Canada', 54500),
('BMO Field', 'Toronto', 'Canada', 30000),
('Estadio Azteca', 'Mexico City', 'Mexico', 87523),
('Estadio BBVA', 'Guadalajara', 'Mexico', 53460),
('Estadio Akron', 'Monterrey', 'Mexico', 53460)
on conflict do nothing;

insert into wc2026.teams (country_code, country_name, confederation) values
('US', 'United States', 'CONCACAF'), ('CA', 'Canada', 'CONCACAF'), ('MX', 'Mexico', 'CONCACAF'),
('JM', 'Jamaica', 'CONCACAF'), ('CR', 'Costa Rica', 'CONCACAF'), ('HT', 'Haiti', 'CONCACAF'),
('PA', 'Panama', 'CONCACAF'), ('CW', 'Curaçao', 'CONCACAF'),
('BR', 'Brazil', 'CONMEBOL'), ('AR', 'Argentina', 'CONMEBOL'), ('UY', 'Uruguay', 'CONMEBOL'),
('CL', 'Chile', 'CONMEBOL'), ('CO', 'Colombia', 'CONMEBOL'), ('EC', 'Ecuador', 'CONMEBOL'),
('PY', 'Paraguay', 'CONMEBOL'), ('PE', 'Peru', 'CONMEBOL'),
('FR', 'France', 'UEFA'), ('DE', 'Germany', 'UEFA'), ('ES', 'Spain', 'UEFA'),
('IT', 'Italy', 'UEFA'), ('NL', 'Netherlands', 'UEFA'), ('BE', 'Belgium', 'UEFA'),
('PT', 'Portugal', 'UEFA'), ('GB', 'England', 'UEFA'), ('SC', 'Scotland', 'UEFA'),
('PL', 'Poland', 'UEFA'), ('HR', 'Croatia', 'UEFA'), ('DK', 'Denmark', 'UEFA'),
('AT', 'Austria', 'UEFA'), ('CH', 'Switzerland', 'UEFA'), ('CZ', 'Czechia', 'UEFA'),
('SE', 'Sweden', 'UEFA'), ('NO', 'Norway', 'UEFA'), ('TR', 'Türkiye', 'UEFA'),
('UA', 'Ukraine', 'UEFA'), ('RS', 'Serbia', 'UEFA'), ('GR', 'Greece', 'UEFA'),
('HU', 'Hungary', 'UEFA'), ('RO', 'Romania', 'UEFA'), ('IE', 'Ireland', 'UEFA'),
('IS', 'Iceland', 'UEFA'), ('SK', 'Slovakia', 'UEFA'), ('FI', 'Finland', 'UEFA'),
('BG', 'Bulgaria', 'UEFA'), ('AL', 'Albania', 'UEFA'), ('MK', 'North Macedonia', 'UEFA'),
('BA', 'Bosnia and Herzegovina', 'UEFA'), ('SI', 'Slovenia', 'UEFA'),
('JP', 'Japan', 'AFC'), ('KR', 'South Korea', 'AFC'), ('SA', 'Saudi Arabia', 'AFC'),
('AU', 'Australia', 'AFC'), ('IR', 'Iran', 'AFC'), ('QA', 'Qatar', 'AFC'),
('AE', 'United Arab Emirates', 'AFC'), ('IQ', 'Iraq', 'AFC'), ('CN', 'China', 'AFC'),
('TH', 'Thailand', 'AFC'), ('JO', 'Jordan', 'AFC'), ('UZ', 'Uzbekistan', 'AFC'),
('SN', 'Senegal', 'CAF'), ('MA', 'Morocco', 'CAF'), ('EG', 'Egypt', 'CAF'),
('NG', 'Nigeria', 'CAF'), ('GH', 'Ghana', 'CAF'), ('TN', 'Tunisia', 'CAF'),
('CI', 'Ivory Coast', 'CAF'), ('DZ', 'Algeria', 'CAF'), ('CM', 'Cameroon', 'CAF'),
('ZA', 'South Africa', 'CAF'), ('CV', 'Cape Verde', 'CAF'),
('CD', 'Congo DR', 'CAF'),
('NZ', 'New Zealand', 'OFC')
on conflict (country_code) do nothing;
