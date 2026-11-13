-- Check-in and no-show statuses used by the extranet and admin booking screens.
-- COMPLETED remains the checked-out state.
ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'CHECKED_IN';
ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'NO_SHOW';
