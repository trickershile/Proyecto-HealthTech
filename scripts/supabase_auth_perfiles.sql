CREATE TABLE IF NOT EXISTS public.perfiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email text,
  nombre text,
  rol text NOT NULL DEFAULT 'paciente' CHECK (rol IN ('admin','alumno','paciente')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.perfiles FROM anon;
REVOKE ALL ON public.perfiles FROM authenticated;
GRANT SELECT ON public.perfiles TO authenticated;
GRANT UPDATE (nombre) ON public.perfiles TO authenticated;

CREATE POLICY perfiles_select_own
ON public.perfiles
FOR SELECT
TO authenticated
USING (id = auth.uid());

CREATE POLICY perfiles_update_own
ON public.perfiles
FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

CREATE OR REPLACE FUNCTION public.handle_new_user_perfil()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  role_text text;
  name_text text;
BEGIN
  role_text := lower(coalesce(NEW.raw_user_meta_data->>'rol', 'paciente'));
  IF role_text NOT IN ('paciente','alumno') THEN
    role_text := 'paciente';
  END IF;

  name_text := nullif(trim(coalesce(NEW.raw_user_meta_data->>'nombre', '')), '');

  INSERT INTO public.perfiles (id, email, nombre, rol)
  VALUES (NEW.id, NEW.email, name_text, role_text)
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_perfil ON auth.users;
CREATE TRIGGER on_auth_user_created_perfil
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_perfil();

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS perfiles_touch_updated_at ON public.perfiles;
CREATE TRIGGER perfiles_touch_updated_at
BEFORE UPDATE ON public.perfiles
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

