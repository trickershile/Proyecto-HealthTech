-- Habilitar la extensión pgvector para manejar embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Crear tabla documentos_medicos para RAG
CREATE TABLE IF NOT EXISTS public.documentos_medicos (
  id BIGSERIAL PRIMARY KEY,
  nombre_medicamento TEXT,
  contenido TEXT,
  nivel_acceso TEXT,
  embedding vector(384), -- 384 es la dimensión por defecto de all-MiniLM-L6-v2
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Crear índice para búsqueda semántica (búsqueda por similitud de coseno)
-- Nota: ivfflat es una opción común, hnsw es más rápida pero ocupa más espacio.
CREATE INDEX IF NOT EXISTS documentos_medicos_embedding_idx 
ON public.documentos_medicos 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
