-- Allows an authenticated reseller to update only their own contact phone.
-- Company identifiers, fiscal address, review fields and status remain immutable here.
CREATE OR REPLACE FUNCTION public.update_my_reseller_profile(p_phone text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\\D', '', 'g');
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF v_phone !~ '^[0-9]{10,11}$' THEN
    RAISE EXCEPTION 'Phone must contain 10 or 11 digits including area code' USING ERRCODE = '22023';
  END IF;

  UPDATE public.reseller_applications
     SET phone = v_phone, updated_at = now()
   WHERE user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No reseller application exists for the authenticated user' USING ERRCODE = 'P0002';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.update_my_reseller_profile(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_my_reseller_profile(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_my_reseller_profile(text) TO authenticated;
