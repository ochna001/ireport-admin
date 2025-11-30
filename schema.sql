-- iReport Database Schema for Supabase (PostgreSQL)
--
-- To use this schema:
-- 1. Navigate to your Supabase project.
-- 2. Go to the "SQL Editor" section.
-- 3. Click "+ New query".
-- 4. Copy and paste the entire content of this file into the editor.
-- 5. Click "RUN".

-- Table for emergency response agencies (PNP, BFP, PDRRMO)
CREATE TABLE IF NOT EXISTS public.agencies (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    short_name VARCHAR(10) NOT NULL UNIQUE
);

-- Insert the default agencies
INSERT INTO public.agencies (name, short_name)
VALUES
    ('Philippine National Police', 'PNP'),
    ('Bureau of Fire Protection', 'BFP'),
    ('Provincial Disaster Risk Reduction and Management Office', 'PDRRMO')
ON CONFLICT (short_name) DO NOTHING;

-- Table for individual agency stations/offices with their locations
CREATE TABLE IF NOT EXISTS public.agency_stations (
    id SERIAL PRIMARY KEY,
    agency_id INTEGER NOT NULL REFERENCES public.agencies(id),
    name TEXT NOT NULL, -- e.g., "Daet Municipal Police Station"
    latitude DECIMAL(9, 6) NOT NULL,
    longitude DECIMAL(9, 6) NOT NULL,
    contact_number TEXT,
    address TEXT
);

-- Table for public user profiles
-- This table is linked to Supabase's built-in `auth.users` table.
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT,
    email TEXT UNIQUE,
    role VARCHAR(50) NOT NULL CHECK (role IN ('Resident', 'Field Officer', 'Chief')),
    agency_id INTEGER REFERENCES public.agencies(id),
    phone_number VARCHAR(20),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Table for all incident reports
CREATE TABLE IF NOT EXISTS public.incidents (
    id BIGSERIAL PRIMARY KEY,
    incident_type VARCHAR(50) NOT NULL CHECK (incident_type IN ('Crime', 'Fire', 'Disaster')),
    agency_id INTEGER NOT NULL REFERENCES public.agencies(id),
    status VARCHAR(50) NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Assigned', 'On-Scene', 'Resolved', 'Closed')),
    latitude DECIMAL(9, 6),
    longitude DECIMAL(9, 6),
    address_details JSONB, -- To store structured address: {"street": "...", "barangay": "..."}
    submitted_by_user_id UUID REFERENCES public.profiles(id), -- Null if submitted by a guest
    submitted_by_guest_info TEXT, -- For guest name/contact if provided
    assigned_to_user_id UUID REFERENCES public.profiles(id), -- Null if unassigned
    assigned_to_station_id INTEGER REFERENCES public.agency_stations(id), -- Which station is handling the incident
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Table for media files (photos, videos) associated with an incident
CREATE TABLE IF NOT EXISTS public.media (
    id BIGSERIAL PRIMARY KEY,
    incident_id BIGINT NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL, -- Path to the file in Supabase Storage
    media_type VARCHAR(20) NOT NULL CHECK (media_type IN ('photo', 'video')),
    uploaded_at TIMESTAMPTZ DEFAULT now()
);

-- Table for logging updates and notes on an incident
CREATE TABLE IF NOT EXISTS public.incident_updates (
    id BIGSERIAL PRIMARY KEY,
    incident_id BIGINT NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
    author_id UUID REFERENCES public.profiles(id), -- Can be null for system-generated updates
    update_text TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Table for detailed final reports upon case closure
CREATE TABLE IF NOT EXISTS public.final_reports (
    id BIGSERIAL PRIMARY KEY,
    incident_id BIGINT NOT NULL UNIQUE REFERENCES public.incidents(id) ON DELETE CASCADE,
    report_details JSONB NOT NULL, -- Flexible JSONB to store different fields for PNP, BFP, PDRRMO
    completed_by_user_id UUID NOT NULL REFERENCES public.profiles(id),
    completed_at TIMESTAMPTZ DEFAULT now()
);

-- Table for user notifications
CREATE TABLE IF NOT EXISTS public.notifications (
    id BIGSERIAL PRIMARY KEY,
    recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    incident_id BIGINT REFERENCES public.incidents(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Table for agency resources (vehicles, equipment, personnel units)
CREATE TABLE IF NOT EXISTS public.agency_resources (
    id SERIAL PRIMARY KEY,
    station_id INTEGER NOT NULL REFERENCES public.agency_stations(id) ON DELETE CASCADE,
    name TEXT NOT NULL, -- e.g., "Patrol Car 01", "Fire Truck Alpha"
    type VARCHAR(20) NOT NULL CHECK (type IN ('vehicle', 'equipment', 'personnel')),
    status VARCHAR(20) NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'deployed', 'maintenance')),
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security (RLS) for all tables as a best practice
-- Note: Policies need to be created separately to define access rules.
ALTER TABLE public.agencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.final_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_resources ENABLE ROW LEVEL SECURITY;
