CREATE EXTENSION IF NOT EXISTS vector;

DROP FUNCTION IF EXISTS public.buscar_medicamentos_v2(vector(384), text, int);
DROP TABLE IF EXISTS public.documentos_medicos_v2 CASCADE;

CREATE TABLE public.documentos_medicos_v2 (
  id BIGSERIAL PRIMARY KEY,
  nombre_medicamento TEXT NOT NULL,
  categoria TEXT NULL,
  para_que_sirve TEXT NULL,
  dosis_habitual TEXT NULL,
  dosis_maxima TEXT NULL,
  precauciones TEXT NULL,
  efectos_secundarios TEXT NULL,
  dieta_especial TEXT NULL,
  contenido TEXT NOT NULL,
  nivel_acceso TEXT NOT NULL DEFAULT 'ambos',
  embedding vector(384),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX documentos_medicos_v2_embedding_idx
ON public.documentos_medicos_v2
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

ALTER TABLE public.documentos_medicos_v2 ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'documentos_medicos_v2'
      AND policyname = 'documentos_medicos_v2_select_public'
  ) THEN
    CREATE POLICY documentos_medicos_v2_select_public
    ON public.documentos_medicos_v2
    FOR SELECT
    USING (true);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.buscar_medicamentos_v2(
  query_embedding vector(384),
  modo text,
  match_count int DEFAULT 8
)
RETURNS TABLE (
  nombre_medicamento text,
  categoria text,
  para_que_sirve text,
  dosis_habitual text,
  dosis_maxima text,
  precauciones text,
  efectos_secundarios text,
  dieta_especial text,
  contenido text,
  nivel_acceso text,
  similarity float
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    nombre_medicamento,
    categoria,
    para_que_sirve,
    dosis_habitual,
    dosis_maxima,
    precauciones,
    efectos_secundarios,
    dieta_especial,
    contenido,
    nivel_acceso,
    1 - (embedding <=> query_embedding) AS similarity
  FROM public.documentos_medicos_v2
  WHERE nivel_acceso IN ('ambos', modo)
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;
