alter table if exists public.templates
  add column if not exists section_key text default 'popular';

alter table if exists public.templates
  add column if not exists preferred_aspect text default '9:16';

alter table if exists public.templates
  add column if not exists preferred_model text default 'nano-banana';

alter table if exists public.templates
  add column if not exists hide_photo_settings boolean default false;

update public.templates
set
  section_key = coalesce(nullif(section_key, ''), 'popular'),
  preferred_aspect = coalesce(nullif(preferred_aspect, ''), '9:16'),
  preferred_model = coalesce(nullif(preferred_model, ''), 'nano-banana')
where true;
