CREATE TABLE IF NOT EXISTS public.admin_users (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid());
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;

ALTER TABLE public.medicamentos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'medicamentos' AND policyname = 'medicamentos_select_public'
  ) THEN
    CREATE POLICY medicamentos_select_public ON public.medicamentos
      FOR SELECT USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'medicamentos' AND policyname = 'medicamentos_insert_admin'
  ) THEN
    CREATE POLICY medicamentos_insert_admin ON public.medicamentos
      FOR INSERT WITH CHECK (public.is_admin());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'medicamentos' AND policyname = 'medicamentos_update_admin'
  ) THEN
    CREATE POLICY medicamentos_update_admin ON public.medicamentos
      FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'medicamentos' AND policyname = 'medicamentos_delete_admin'
  ) THEN
    CREATE POLICY medicamentos_delete_admin ON public.medicamentos
      FOR DELETE USING (public.is_admin());
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS medicamentos_nombre_lower_uq
ON public.medicamentos ((lower(nombre)));

ALTER TABLE public.symptom_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medicamento_aliases ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'symptom_rules' AND policyname = 'symptom_rules_select_public'
  ) THEN
    CREATE POLICY symptom_rules_select_public ON public.symptom_rules
      FOR SELECT USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'symptom_rules' AND policyname = 'symptom_rules_admin_mutate'
  ) THEN
    CREATE POLICY symptom_rules_admin_mutate ON public.symptom_rules
      FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'medicamento_aliases' AND policyname = 'medicamento_aliases_select_public'
  ) THEN
    CREATE POLICY medicamento_aliases_select_public ON public.medicamento_aliases
      FOR SELECT USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'medicamento_aliases' AND policyname = 'medicamento_aliases_admin_mutate'
  ) THEN
    CREATE POLICY medicamento_aliases_admin_mutate ON public.medicamento_aliases
      FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.student_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NULL,
  full_name text NULL,
  status text NOT NULL DEFAULT 'pending',
  certificate_path text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.student_profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'student_profiles' AND policyname = 'student_profiles_select'
  ) THEN
    CREATE POLICY student_profiles_select ON public.student_profiles
      FOR SELECT USING (user_id = auth.uid() OR public.is_admin());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'student_profiles' AND policyname = 'student_profiles_insert_self'
  ) THEN
    CREATE POLICY student_profiles_insert_self ON public.student_profiles
      FOR INSERT WITH CHECK (user_id = auth.uid() AND status = 'pending');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'student_profiles' AND policyname = 'student_profiles_update_self'
  ) THEN
    CREATE POLICY student_profiles_update_self ON public.student_profiles
      FOR UPDATE USING (user_id = auth.uid() AND status = 'pending')
      WITH CHECK (user_id = auth.uid() AND status = 'pending');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'student_profiles' AND policyname = 'student_profiles_update_admin'
  ) THEN
    CREATE POLICY student_profiles_update_admin ON public.student_profiles
      FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());
  END IF;
END $$;

INSERT INTO storage.buckets (id, name, public)
VALUES ('student-certificates', 'student-certificates', false)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'student_cert_insert_own'
  ) THEN
    CREATE POLICY student_cert_insert_own ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'student-certificates'
        AND owner = auth.uid()
        AND name LIKE (auth.uid()::text || '/%')
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'student_cert_select_own'
  ) THEN
    CREATE POLICY student_cert_select_own ON storage.objects
      FOR SELECT TO authenticated
      USING (
        bucket_id = 'student-certificates'
        AND owner = auth.uid()
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'student_cert_update_own'
  ) THEN
    CREATE POLICY student_cert_update_own ON storage.objects
      FOR UPDATE TO authenticated
      USING (bucket_id = 'student-certificates' AND owner = auth.uid())
      WITH CHECK (bucket_id = 'student-certificates' AND owner = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'student_cert_delete_own'
  ) THEN
    CREATE POLICY student_cert_delete_own ON storage.objects
      FOR DELETE TO authenticated
      USING (bucket_id = 'student-certificates' AND owner = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'student_cert_admin_select'
  ) THEN
    CREATE POLICY student_cert_admin_select ON storage.objects
      FOR SELECT TO authenticated
      USING (bucket_id = 'student-certificates' AND public.is_admin());
  END IF;
END $$;

