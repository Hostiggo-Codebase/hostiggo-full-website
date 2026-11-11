-- Payout accounts can be for a company, not only a person. business_type is the Razorpay Route
-- business type; signatory_* is the person (with their own PAN) who acts for a non-individual business.
-- Already applied to the live project; idempotent.
alter table hostiggo_testing_schema.host_payout_methods
  add column if not exists business_type text not null default 'individual',
  add column if not exists signatory_name text,
  add column if not exists signatory_pan text;

alter table hostiggo_testing_schema.host_payout_methods
  drop constraint if exists host_payout_methods_business_type_check;
alter table hostiggo_testing_schema.host_payout_methods
  add constraint host_payout_methods_business_type_check
  check (business_type in ('individual','proprietorship','partnership','private_limited','public_limited','llp','trust','society','ngo','not_yet_registered','educational_institutes'));
