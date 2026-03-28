-- Migration: Add lat/lng columns to attendance table for Geofencing
-- Run this in Supabase SQL Editor

ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS lat NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS lng NUMERIC(10, 7);

-- Also ensure branches.settings JSONB column exists (for geofence config)
ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.attendance.lat IS 'Latitude of the employee at check-in/out time';
COMMENT ON COLUMN public.attendance.lng IS 'Longitude of the employee at check-in/out time';
