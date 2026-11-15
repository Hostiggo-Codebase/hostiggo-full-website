-- Booking request flow needs the PENDING status row.
--
-- A guest on a host-approval listing pays up front and the booking is held with
-- status_id 1 (PENDING) until the host answers. bookings.status_id has a foreign
-- key to booking_status, so on a database without this row every request booking
-- fails on insert. The live project already has it; a new database, a Supabase
-- preview branch or a restore would not. Idempotent and safe to run anywhere.

insert into hostiggo_testing_schema.booking_status (status_id, status_name, description)
values
  (1, 'PENDING',   'Booking request awaiting host response'),
  (2, 'CONFIRMED', 'Booking confirmed'),
  (3, 'CANCELLED', 'Booking cancelled')
on conflict (status_id) do nothing;
