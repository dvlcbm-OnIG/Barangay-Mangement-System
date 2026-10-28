ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS resident_id INTEGER,
  ADD COLUMN IF NOT EXISTS official_id INTEGER;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_resident_id_fkey'
      AND conrelid = 'public.users'::regclass
      AND contype = 'f'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_resident_id_fkey
      FOREIGN KEY (resident_id)
      REFERENCES public.residents(id)
      ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_official_id_fkey'
      AND conrelid = 'public.users'::regclass
      AND contype = 'f'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_official_id_fkey
      FOREIGN KEY (official_id)
      REFERENCES public.officials(id)
      ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_resident_id_key'
      AND conrelid = 'public.users'::regclass
      AND contype = 'u'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_resident_id_key UNIQUE (resident_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_official_id_key'
      AND conrelid = 'public.users'::regclass
      AND contype = 'u'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_official_id_key UNIQUE (official_id);
  END IF;
END
$migration$;
