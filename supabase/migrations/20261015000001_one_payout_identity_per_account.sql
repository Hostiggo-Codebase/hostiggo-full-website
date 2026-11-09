-- One person, one Hostiggo account: a PAN or a bank account can back the payout
-- setup of exactly one host. (Phone numbers are already unique -- they live only
-- on the Supabase Auth user.) The API checks this first with a friendly error;
-- these indexes are the backstop against races.
--
-- Idempotent. If existing rows already break a rule, that index is skipped with
-- a notice instead of failing: clean the duplicates, then re-run this file.

do $$
begin
  create unique index if not exists host_payout_methods_pan_uniq
    on hostiggo_testing_schema.host_payout_methods (upper(pan_number))
    where pan_number <> '';
exception when unique_violation then
  raise notice 'host_payout_methods_pan_uniq skipped: duplicate PANs exist, resolve them and re-run';
end $$;

do $$
begin
  create unique index if not exists host_payout_methods_bank_account_uniq
    on hostiggo_testing_schema.host_payout_methods (bank_account_number)
    where bank_account_number <> '';
exception when unique_violation then
  raise notice 'host_payout_methods_bank_account_uniq skipped: duplicate bank accounts exist, resolve them and re-run';
end $$;
