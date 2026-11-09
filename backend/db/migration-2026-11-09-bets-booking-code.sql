-- StakeKing, 2026-11-09: the bets table in the stakeking Neon project
-- was missing booking_code (the engine stamps one booking code per
-- slip at placement since 2026-11-06; live Oddaroa has the column,
-- the StakeKing schema copy did not). place_bet failed with
-- 'column "booking_code" of relation "bets" does not exist' until
-- this landed. ensureBetColumns in api/_lib.js now also self-heals it.
alter table bets add column if not exists booking_code text;
