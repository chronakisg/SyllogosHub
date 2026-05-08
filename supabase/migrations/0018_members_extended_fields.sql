-- Members extended fields: align με real-world μητρώο συλλόγου
-- Όλα nullable για backwards compatibility

ALTER TABLE public.members
  ADD COLUMN father_name text,
  ADD COLUMN mother_name text,
  ADD COLUMN maiden_name text,
  ADD COLUMN address text,
  ADD COLUMN birthplace text,
  ADD COLUMN residence text,
  ADD COLUMN occupation text,
  ADD COLUMN registry_number text,
  ADD COLUMN application_number text,
  ADD COLUMN application_date date;
