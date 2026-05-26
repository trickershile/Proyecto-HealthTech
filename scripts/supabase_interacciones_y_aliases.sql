CREATE TABLE IF NOT EXISTS public.medicamento_aliases (
  id BIGSERIAL PRIMARY KEY,
  alias TEXT NOT NULL,
  medicamento TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS medicamento_aliases_alias_uq
ON public.medicamento_aliases ((lower(alias)));

ALTER TABLE public.medicamento_aliases ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'medicamento_aliases'
      AND policyname = 'medicamento_aliases_select_public'
  ) THEN
    CREATE POLICY medicamento_aliases_select_public
    ON public.medicamento_aliases
    FOR SELECT
    USING (true);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.interacciones_medicamentos (
  id BIGSERIAL PRIMARY KEY,
  med_a TEXT NOT NULL,
  med_b TEXT NOT NULL,
  severidad TEXT NOT NULL,
  fuente TEXT NULL,
  nota TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS interacciones_medicamentos_pair_idx
ON public.interacciones_medicamentos ((lower(med_a)), (lower(med_b)));

ALTER TABLE public.interacciones_medicamentos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'interacciones_medicamentos'
      AND policyname = 'interacciones_medicamentos_select_public'
  ) THEN
    CREATE POLICY interacciones_medicamentos_select_public
    ON public.interacciones_medicamentos
    FOR SELECT
    USING (true);
  END IF;
END $$;

