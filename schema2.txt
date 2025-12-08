-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.agencies (
  id integer NOT NULL DEFAULT nextval('agencies_id_seq'::regclass),
  name character varying NOT NULL UNIQUE,
  short_name character varying NOT NULL UNIQUE,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT agencies_pkey PRIMARY KEY (id)
);
CREATE TABLE public.agency_resources (
  id integer NOT NULL DEFAULT nextval('agency_resources_id_seq'::regclass),
  station_id integer,
  name text NOT NULL,
  type character varying CHECK (type::text = ANY (ARRAY['vehicle'::character varying, 'equipment'::character varying, 'personnel'::character varying]::text[])),
  status character varying DEFAULT 'available'::character varying CHECK (status::text = ANY (ARRAY['available'::character varying, 'deployed'::character varying, 'maintenance'::character varying]::text[])),
  description text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  CONSTRAINT agency_resources_pkey PRIMARY KEY (id),
  CONSTRAINT agency_resources_station_id_fkey FOREIGN KEY (station_id) REFERENCES public.agency_stations(id)
);
CREATE TABLE public.agency_stations (
  id integer NOT NULL DEFAULT nextval('agency_stations_id_seq'::regclass),
  agency_id integer NOT NULL,
  name text NOT NULL,
  latitude numeric NOT NULL,
  longitude numeric NOT NULL,
  contact_number text,
  address text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT agency_stations_pkey PRIMARY KEY (id),
  CONSTRAINT agency_stations_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id)
);
CREATE TABLE public.final_report_drafts (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  incident_id uuid NOT NULL UNIQUE,
  agency_type text NOT NULL CHECK (agency_type = ANY (ARRAY['pnp'::text, 'bfp'::text, 'pdrrmo'::text])),
  author_id uuid,
  draft_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft'::text CHECK (status = ANY (ARRAY['draft'::text, 'ready_for_review'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT final_report_drafts_pkey PRIMARY KEY (id),
  CONSTRAINT final_report_drafts_incident_id_fkey FOREIGN KEY (incident_id) REFERENCES public.incidents(id),
  CONSTRAINT final_report_drafts_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.final_reports (
  id bigint NOT NULL DEFAULT nextval('final_reports_id_seq'::regclass),
  incident_id uuid NOT NULL UNIQUE,
  report_details jsonb NOT NULL,
  completed_by_user_id uuid NOT NULL,
  completed_at timestamp with time zone DEFAULT now(),
  CONSTRAINT final_reports_pkey PRIMARY KEY (id),
  CONSTRAINT final_reports_incident_id_fkey FOREIGN KEY (incident_id) REFERENCES public.incidents(id),
  CONSTRAINT final_reports_completed_by_user_id_fkey FOREIGN KEY (completed_by_user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.incident_status_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL,
  status text NOT NULL,
  notes text,
  changed_by text NOT NULL,
  changed_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT incident_status_history_pkey PRIMARY KEY (id),
  CONSTRAINT incident_status_history_incident_id_fkey FOREIGN KEY (incident_id) REFERENCES public.incidents(id)
);
CREATE TABLE public.incident_updates (
  id bigint NOT NULL DEFAULT nextval('incident_updates_id_seq'::regclass),
  incident_id uuid NOT NULL,
  author_id uuid,
  update_text text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT incident_updates_pkey PRIMARY KEY (id),
  CONSTRAINT incident_updates_incident_id_fkey FOREIGN KEY (incident_id) REFERENCES public.incidents(id),
  CONSTRAINT incident_updates_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.incidents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  agency_type text NOT NULL CHECK (agency_type = ANY (ARRAY['pnp'::text, 'bfp'::text, 'pdrrmo'::text])),
  reporter_id uuid,
  reporter_name text NOT NULL,
  reporter_age integer NOT NULL,
  description text NOT NULL,
  latitude numeric NOT NULL,
  longitude numeric NOT NULL,
  location_address text,
  media_urls ARRAY DEFAULT '{}'::text[],
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'assigned'::text, 'in_progress'::text, 'resolved'::text, 'closed'::text, 'rejected'::text])),
  assigned_officer_id uuid,
  assigned_station_id integer,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  resolved_at timestamp with time zone,
  updated_by text,
  first_response_at timestamp with time zone,
  assigned_officer_ids ARRAY DEFAULT '{}'::uuid[],
  reporter_phone text,
  reporter_latitude numeric,
  reporter_longitude numeric,
  assigned_resource_ids ARRAY DEFAULT '{}'::integer[],
  CONSTRAINT incidents_pkey PRIMARY KEY (id),
  CONSTRAINT incidents_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES auth.users(id),
  CONSTRAINT incidents_assigned_officer_id_fkey FOREIGN KEY (assigned_officer_id) REFERENCES auth.users(id),
  CONSTRAINT incidents_assigned_station_id_fkey FOREIGN KEY (assigned_station_id) REFERENCES public.agency_stations(id)
);
CREATE TABLE public.media (
  id bigint NOT NULL DEFAULT nextval('media_id_seq'::regclass),
  incident_id bigint NOT NULL,
  storage_path text NOT NULL,
  media_type character varying NOT NULL CHECK (media_type::text = ANY (ARRAY['photo'::character varying, 'video'::character varying]::text[])),
  uploaded_at timestamp with time zone DEFAULT now(),
  CONSTRAINT media_pkey PRIMARY KEY (id)
);
CREATE TABLE public.notifications (
  id bigint NOT NULL DEFAULT nextval('notifications_id_seq'::regclass),
  recipient_id uuid NOT NULL,
  incident_id uuid,
  title text NOT NULL,
  body text NOT NULL,
  is_read boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT notifications_pkey PRIMARY KEY (id),
  CONSTRAINT notifications_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES public.profiles(id),
  CONSTRAINT notifications_incident_id_fkey FOREIGN KEY (incident_id) REFERENCES public.incidents(id)
);
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  display_name text,
  email text UNIQUE,
  role character varying NOT NULL CHECK (role::text = ANY (ARRAY['Resident'::character varying, 'Desk Officer'::character varying, 'Field Officer'::character varying, 'Chief'::character varying]::text[])),
  agency_id integer,
  phone_number character varying,
  age integer CHECK (age >= 13 AND age <= 120),
  date_of_birth date CHECK (date_of_birth <= CURRENT_DATE AND date_of_birth >= (CURRENT_DATE - '120 years'::interval)),
  created_at timestamp with time zone DEFAULT now(),
  station_id integer,
  status text DEFAULT 'available'::text CHECK (status = ANY (ARRAY['available'::text, 'on_duty'::text, 'busy'::text, 'off_duty'::text])),
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id),
  CONSTRAINT profiles_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id),
  CONSTRAINT profiles_station_id_fkey FOREIGN KEY (station_id) REFERENCES public.agency_stations(id)
);
CREATE TABLE public.push_notification_log (
  id bigint NOT NULL DEFAULT nextval('push_notification_log_id_seq'::regclass),
  notification_id bigint,
  recipient_id uuid,
  push_token text,
  success boolean DEFAULT false,
  error_message text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT push_notification_log_pkey PRIMARY KEY (id)
);
CREATE TABLE public.push_tokens (
  id bigint NOT NULL DEFAULT nextval('push_tokens_id_seq'::regclass),
  token text NOT NULL UNIQUE,
  user_id uuid,
  device_id text,
  platform text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT push_tokens_pkey PRIMARY KEY (id),
  CONSTRAINT push_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.security_logs (
  id bigint NOT NULL DEFAULT nextval('security_logs_id_seq'::regclass),
  user_id uuid,
  action text NOT NULL,
  details jsonb,
  ip_address text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT security_logs_pkey PRIMARY KEY (id)
);
CREATE TABLE public.unit_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL,
  responder_id uuid NOT NULL,
  agency text NOT NULL CHECK (agency = ANY (ARRAY['PNP'::text, 'BFP'::text, 'MDRRMO'::text])),
  title text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  details jsonb NOT NULL,
  CONSTRAINT unit_reports_pkey PRIMARY KEY (id),
  CONSTRAINT unit_reports_incident_id_fkey FOREIGN KEY (incident_id) REFERENCES public.incidents(id),
  CONSTRAINT unit_reports_responder_id_fkey FOREIGN KEY (responder_id) REFERENCES public.profiles(id)
);