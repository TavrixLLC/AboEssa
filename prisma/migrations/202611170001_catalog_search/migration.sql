CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE OR REPLACE FUNCTION catalog_search(value text) RETURNS text
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE STRICT COST 1000 AS $$
BEGIN
  RETURN lower(translate(regexp_replace(value, '[ً-ٟـ]', '', 'g'), 'أإآىؤئ', 'ااايوي'));
END
$$;
