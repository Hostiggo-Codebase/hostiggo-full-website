-- Clear all verification test data and reset verification status
-- Run this to remove all test verification records from the database
-- This should be run manually in production, not as part of automated migrations

-- Clear ALL KYC requests (main verification log table) - complete reset
DELETE FROM hostiggo_testing_schema.kyc_requests;

-- Clear Aadhaar verifications
DELETE FROM hostiggo_testing_schema.aadhaar_kyc;

-- Clear PAN verifications
DELETE FROM hostiggo_testing_schema.pan_verifications;

-- Clear Passport verifications
DELETE FROM hostiggo_testing_schema.passport_verifications;

-- Clear bank verifications if they exist
DELETE FROM hostiggo_testing_schema.bank_verifications;

-- Reset user verification flags
UPDATE hostiggo_testing_schema.users 
SET is_verified = false 
WHERE is_verified = true;

-- Reset host verification badges
UPDATE hostiggo_testing_schema.host 
SET is_verified = false 
WHERE is_verified = true;

-- Output confirmation
SELECT 
  (SELECT COUNT(*) FROM hostiggo_testing_schema.kyc_requests) as remaining_kyc_requests,
  (SELECT COUNT(*) FROM hostiggo_testing_schema.aadhaar_kyc) as remaining_aadhaar,
  (SELECT COUNT(*) FROM hostiggo_testing_schema.pan_verifications) as remaining_pan,
  (SELECT COUNT(*) FROM hostiggo_testing_schema.passport_verifications) as remaining_passport,
  (SELECT COUNT(*) FROM hostiggo_testing_schema.bank_verifications) as remaining_bank,
  (SELECT COUNT(*) FROM hostiggo_testing_schema.users WHERE is_verified = true) as remaining_verified_users,
  (SELECT COUNT(*) FROM hostiggo_testing_schema.host WHERE is_verified = true) as remaining_verified_hosts;
