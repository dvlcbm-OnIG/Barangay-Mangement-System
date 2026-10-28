DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'document_requests_resident_id_fkey'
      AND conrelid = 'public.document_requests'::regclass
      AND contype = 'f'
  ) THEN
    ALTER TABLE public.document_requests
      ADD CONSTRAINT document_requests_resident_id_fkey
      FOREIGN KEY (resident_id)
      REFERENCES public.residents(id)
      ON DELETE SET NULL;
  END IF;
END
$migration$;
