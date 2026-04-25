-- 1. Agregar columna "tags" a la tabla "medicamentos"
ALTER TABLE public.medicamentos
ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}'::text[];

-- Crear índice GIN para búsquedas rápidas por tags (optimización)
CREATE INDEX IF NOT EXISTS medicamentos_tags_gin
ON public.medicamentos USING gin (tags);


-- 2. Crear tabla "symptom_rules" para mapear palabras clave (síntomas) a tags
CREATE TABLE IF NOT EXISTS public.symptom_rules (
  id BIGSERIAL PRIMARY KEY,
  keyword TEXT NOT NULL,
  tags text[] NOT NULL DEFAULT '{}'::text[]
);

-- Asegurar que no haya palabras clave duplicadas
CREATE UNIQUE INDEX IF NOT EXISTS symptom_rules_keyword_uq
ON public.symptom_rules (lower(keyword));

-- Insertar reglas base de síntomas comunes para tu farmacia
INSERT INTO public.symptom_rules (keyword, tags) VALUES
('fiebre', '{antipiretico,analgesico}'),
('febril', '{antipiretico,analgesico}'),
('temperatura', '{antipiretico}'),
('dolor', '{analgesico}'),
('cefalea', '{analgesico}'),
('migraña', '{analgesico}'),
('inflamacion', '{antiinflamatorio,aines}'),
('inflamado', '{antiinflamatorio,aines}'),
('alergia', '{antihistaminico}'),
('comezon', '{antihistaminico}'),
('prurito', '{antihistaminico}'),
('urticaria', '{antihistaminico}'),
('rinitis', '{antihistaminico}'),
('tos', '{broncodilatador,antitusivo}'),
('asma', '{broncodilatador}'),
('ahogo', '{broncodilatador}'),
('nausea', '{antiemetico}'),
('vomito', '{antiemetico}'),
('diarrea', '{antidiarreico}')
ON CONFLICT DO NOTHING;


-- 3. Crear tabla "medicamento_aliases" para sinónimos, marcas o errores ortográficos
CREATE TABLE IF NOT EXISTS public.medicamento_aliases (
  id BIGSERIAL PRIMARY KEY,
  medicamento_id BIGINT NOT NULL REFERENCES public.medicamentos(id) ON DELETE CASCADE,
  alias TEXT NOT NULL
);

-- Índices para búsqueda rápida de aliases
CREATE INDEX IF NOT EXISTS medicamento_aliases_alias_idx
ON public.medicamento_aliases (lower(alias));

CREATE INDEX IF NOT EXISTS medicamento_aliases_med_id_idx
ON public.medicamento_aliases (medicamento_id);


-- 4. Actualizar algunos medicamentos existentes con sus tags correspondientes
-- (Esto asume que tienes Paracetamol, Ibuprofeno, Loratadina y Salbutamol en tu BD)
UPDATE public.medicamentos
SET tags = '{antipiretico,analgesico}'
WHERE lower(nombre) = 'paracetamol';

UPDATE public.medicamentos
SET tags = '{analgesico,antiinflamatorio,aines,antipiretico}'
WHERE lower(nombre) = 'ibuprofeno';

UPDATE public.medicamentos
SET tags = '{antihistaminico}'
WHERE lower(nombre) = 'loratadina';

UPDATE public.medicamentos
SET tags = '{broncodilatador}'
WHERE lower(nombre) = 'salbutamol';


-- 5. Insertar algunos aliases comunes apuntando a los medicamentos existentes
-- Paracetamol / Acetaminofen
INSERT INTO public.medicamento_aliases (medicamento_id, alias)
SELECT id, 'acetaminofen' FROM public.medicamentos WHERE lower(nombre) = 'paracetamol'
ON CONFLICT DO NOTHING;

INSERT INTO public.medicamento_aliases (medicamento_id, alias)
SELECT id, 'tylenol' FROM public.medicamentos WHERE lower(nombre) = 'paracetamol'
ON CONFLICT DO NOTHING;

-- Ibuprofeno
INSERT INTO public.medicamento_aliases (medicamento_id, alias)
SELECT id, 'advil' FROM public.medicamentos WHERE lower(nombre) = 'ibuprofeno'
ON CONFLICT DO NOTHING;

INSERT INTO public.medicamento_aliases (medicamento_id, alias)
SELECT id, 'motrin' FROM public.medicamentos WHERE lower(nombre) = 'ibuprofeno'
ON CONFLICT DO NOTHING;

-- Loratadina
INSERT INTO public.medicamento_aliases (medicamento_id, alias)
SELECT id, 'claritin' FROM public.medicamentos WHERE lower(nombre) = 'loratadina'
ON CONFLICT DO NOTHING;

-- Salbutamol / Albuterol
INSERT INTO public.medicamento_aliases (medicamento_id, alias)
SELECT id, 'albuterol' FROM public.medicamentos WHERE lower(nombre) = 'salbutamol'
ON CONFLICT DO NOTHING;

INSERT INTO public.medicamento_aliases (medicamento_id, alias)
SELECT id, 'ventolin' FROM public.medicamentos WHERE lower(nombre) = 'salbutamol'
ON CONFLICT DO NOTHING;
