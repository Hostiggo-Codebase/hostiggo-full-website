-- Clear all verification test data
-- Run this to remove all test verification records from the database
-- This should be run manually in production, not as part of automated migrations

-- Clear KYC requests (main verification log table)
DELETE FROM hostiggo_testing_schema.kyc_requests 
WHERE service_type IN ('pan', 'aadhaar', 'passport');

-- Clear Aadhaar verifications
DELETE FROM hostiggo_testing_schema.aadhaar_kyc;

-- Clear PAN verifications
DELETE FROM hostiggo_testing_schema.pan_verifications;

-- Clear Passport verifications
DELETE FROM hostiggo_testing_schema.passport_verifications;

-- Reset any user verification flags if they exist
UPDATE hostiggo_testing_schema.users 
SET is_verified = false 
WHERE is_verified = true;

-- Output confirmation
SELECT 
  (SELECT COUNT(*) FROM hostiggo_testing_schema.kyc_requests WHERE service_type IN ('pan', 'aadhaar', 'passport')) as remaining_kyc_requests,
  (SELECT COUNT(*) FROM hostiggo_testing_schema.aadhaar_kyc) as remaining_aadhaar,
  (SELECT COUNT(*) FROM hostiggo_testing_schema.pan_verifications) as remaining_pan,
  (SELECT COUNT(*) FROM hostiggo_testing_schema.passport_verifications) as remaining_passport,
  (SELECT COUNT(*) FROM hostiggo_testing_schema.users WHERE is_verified = true) as remaining_verified_users;
