-- Agency directory short names are stored as uppercase display codes, while
-- incidents use lowercase routing keys. Normalize at the table boundary so
-- every writer, including SECURITY DEFINER dispatch functions, is consistent.
CREATE OR REPLACE FUNCTION public.normalize_incident_agency_type()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.agency_type IS NOT NULL THEN
        NEW.agency_type := lower(trim(NEW.agency_type));
        IF NEW.agency_type = 'pdrrmo' THEN
            NEW.agency_type := 'mdrrmo';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_incident_agency_type_before_write ON public.incidents;
CREATE TRIGGER normalize_incident_agency_type_before_write
    BEFORE INSERT OR UPDATE OF agency_type ON public.incidents
    FOR EACH ROW
    EXECUTE FUNCTION public.normalize_incident_agency_type();
