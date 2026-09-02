-- =============================================================================
-- Our Space — начальная схема базы данных
-- =============================================================================
-- Как применить: Supabase → SQL Editor → New query → вставить целиком → Run.
-- Скрипт безопасно запускать повторно (все объекты создаются с проверкой).
--
-- ВАЖНО: сначала создайте двух пользователей в Authentication → Users,
-- затем запустите этот скрипт. Он сам заведёт для них профили.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Профили пользователей
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text not null default 'Я',
  avatar_url    text,
  timezone      text not null default 'Europe/Moscow',
  theme         text not null default 'system' check (theme in ('system', 'light', 'dark')),
  created_at    timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 2. Ключевая функция безопасности
-- -----------------------------------------------------------------------------
-- Проверяет, что текущий пользователь — один из двух владельцев пространства.
-- security definer: функция читает profiles в обход RLS, иначе политики,
-- которые сами обращаются к profiles, зациклились бы.
create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid());
$$;

revoke all on function public.is_member() from public;
grant execute on function public.is_member() to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Автоматическое создание профиля для нового пользователя
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Профили для пользователей, созданных до появления триггера.
insert into public.profiles (id, display_name)
select
  u.id,
  coalesce(nullif(u.raw_user_meta_data ->> 'display_name', ''), split_part(u.email, '@', 1))
from auth.users u
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- 4. Общие настройки пары (ровно одна строка)
-- -----------------------------------------------------------------------------
create table if not exists public.couple_settings (
  id                  boolean primary key default true check (id),
  app_name            text not null default 'Our Space',
  relationship_start  timestamptz not null default '2024-08-20T00:00:00Z',
  timezone            text not null default 'Europe/Moscow',
  updated_at          timestamptz not null default now()
);

insert into public.couple_settings (id) values (true) on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- 5. Важные даты
-- -----------------------------------------------------------------------------
create table if not exists public.important_dates (
  id            uuid primary key default gen_random_uuid(),
  label         text not null,
  emoji         text,
  date          date not null,
  is_recurring  boolean not null default true,
  created_by    uuid not null references public.profiles (id) on delete cascade,
  created_at    timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 6. Альбомы и фотографии
-- -----------------------------------------------------------------------------
create table if not exists public.albums (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  description     text,
  emoji           text,
  cover_photo_id  uuid,
  created_by      uuid not null references public.profiles (id) on delete cascade,
  created_at      timestamptz not null default now()
);

create table if not exists public.photos (
  id            uuid primary key default gen_random_uuid(),
  album_id      uuid references public.albums (id) on delete set null,
  storage_path  text not null unique,
  title         text,
  description   text,
  taken_at      timestamptz not null default now(),
  width         integer,
  height        integer,
  uploaded_by   uuid not null references public.profiles (id) on delete cascade,
  created_at    timestamptz not null default now()
);

-- Обложка альбома ссылается на фото; связь добавляется отдельно,
-- потому что на момент создания albums таблицы photos ещё нет.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'albums_cover_photo_id_fkey'
  ) then
    alter table public.albums
      add constraint albums_cover_photo_id_fkey
      foreign key (cover_photo_id) references public.photos (id) on delete set null;
  end if;
end $$;

create index if not exists photos_taken_at_idx on public.photos (taken_at desc);
create index if not exists photos_album_id_idx on public.photos (album_id);

-- ❤️ на фотографии
create table if not exists public.photo_reactions (
  photo_id    uuid not null references public.photos (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (photo_id, user_id)
);

create table if not exists public.photo_comments (
  id          uuid primary key default gen_random_uuid(),
  photo_id    uuid not null references public.photos (id) on delete cascade,
  author_id   uuid not null references public.profiles (id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 2000),
  created_at  timestamptz not null default now()
);

create index if not exists photo_comments_photo_id_idx on public.photo_comments (photo_id, created_at);

-- -----------------------------------------------------------------------------
-- 7. Дневник
-- -----------------------------------------------------------------------------
create table if not exists public.diary_entries (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid not null references public.profiles (id) on delete cascade,
  title       text not null,
  body        text not null default '',
  mood        text,
  entry_date  date not null default current_date,
  -- Отложенное открытие: до этого момента второй человек запись не увидит.
  -- Проверка живёт в RLS-политике, а не в интерфейсе.
  unlock_at   timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists diary_entries_entry_date_idx on public.diary_entries (entry_date desc);

-- -----------------------------------------------------------------------------
-- 8. Желания
-- -----------------------------------------------------------------------------
create table if not exists public.wishes (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  description   text,
  image_url     text,
  price         numeric(12, 2),
  currency      text not null default 'RUB',
  priority      smallint not null default 2 check (priority between 1 and 3),
  category      text,
  status        text not null default 'want' check (status in ('want', 'planning', 'soon', 'done')),
  completed_at  timestamptz,
  created_by    uuid not null references public.profiles (id) on delete cascade,
  created_at    timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 9. Планы
-- -----------------------------------------------------------------------------
create table if not exists public.plans (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  description  text,
  starts_at    timestamptz not null,
  ends_at      timestamptz,
  all_day      boolean not null default false,
  location     text,
  created_by   uuid not null references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now()
);

create index if not exists plans_starts_at_idx on public.plans (starts_at);

-- -----------------------------------------------------------------------------
-- 10. Автообновление updated_at
-- -----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists diary_entries_touch on public.diary_entries;
create trigger diary_entries_touch before update on public.diary_entries
  for each row execute function public.touch_updated_at();

drop trigger if exists couple_settings_touch on public.couple_settings;
create trigger couple_settings_touch before update on public.couple_settings
  for each row execute function public.touch_updated_at();

-- =============================================================================
-- 11. ROW LEVEL SECURITY
-- =============================================================================
-- Модель доступа:
--   • посторонние (в т.ч. anon-ключ из браузера) не видят НИЧЕГО;
--   • оба партнёра видят общие данные пары;
--   • изменять и удалять запись может только её автор;
--   • закрытая запись дневника не отдаётся второму человеку даже по сети.
-- =============================================================================

alter table public.profiles         enable row level security;
alter table public.couple_settings  enable row level security;
alter table public.important_dates  enable row level security;
alter table public.albums           enable row level security;
alter table public.photos           enable row level security;
alter table public.photo_reactions  enable row level security;
alter table public.photo_comments   enable row level security;
alter table public.diary_entries    enable row level security;
alter table public.wishes           enable row level security;
alter table public.plans            enable row level security;

-- --- profiles ---------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (public.is_member());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- --- couple_settings --------------------------------------------------------
drop policy if exists couple_settings_select on public.couple_settings;
create policy couple_settings_select on public.couple_settings
  for select to authenticated using (public.is_member());

drop policy if exists couple_settings_update on public.couple_settings;
create policy couple_settings_update on public.couple_settings
  for update to authenticated using (public.is_member()) with check (public.is_member());

-- --- important_dates --------------------------------------------------------
drop policy if exists important_dates_select on public.important_dates;
create policy important_dates_select on public.important_dates
  for select to authenticated using (public.is_member());

drop policy if exists important_dates_insert on public.important_dates;
create policy important_dates_insert on public.important_dates
  for insert to authenticated with check (public.is_member() and created_by = auth.uid());

drop policy if exists important_dates_update on public.important_dates;
create policy important_dates_update on public.important_dates
  for update to authenticated using (created_by = auth.uid()) with check (created_by = auth.uid());

drop policy if exists important_dates_delete on public.important_dates;
create policy important_dates_delete on public.important_dates
  for delete to authenticated using (created_by = auth.uid());

-- --- albums -----------------------------------------------------------------
drop policy if exists albums_select on public.albums;
create policy albums_select on public.albums
  for select to authenticated using (public.is_member());

drop policy if exists albums_insert on public.albums;
create policy albums_insert on public.albums
  for insert to authenticated with check (public.is_member() and created_by = auth.uid());

-- Обложку альбома может поменять любой из двоих, поэтому update — на паре.
drop policy if exists albums_update on public.albums;
create policy albums_update on public.albums
  for update to authenticated using (public.is_member()) with check (public.is_member());

drop policy if exists albums_delete on public.albums;
create policy albums_delete on public.albums
  for delete to authenticated using (created_by = auth.uid());

-- --- photos -----------------------------------------------------------------
drop policy if exists photos_select on public.photos;
create policy photos_select on public.photos
  for select to authenticated using (public.is_member());

drop policy if exists photos_insert on public.photos;
create policy photos_insert on public.photos
  for insert to authenticated with check (public.is_member() and uploaded_by = auth.uid());

drop policy if exists photos_update on public.photos;
create policy photos_update on public.photos
  for update to authenticated using (public.is_member()) with check (public.is_member());

drop policy if exists photos_delete on public.photos;
create policy photos_delete on public.photos
  for delete to authenticated using (uploaded_by = auth.uid());

-- --- photo_reactions --------------------------------------------------------
drop policy if exists photo_reactions_select on public.photo_reactions;
create policy photo_reactions_select on public.photo_reactions
  for select to authenticated using (public.is_member());

drop policy if exists photo_reactions_insert on public.photo_reactions;
create policy photo_reactions_insert on public.photo_reactions
  for insert to authenticated with check (public.is_member() and user_id = auth.uid());

drop policy if exists photo_reactions_delete on public.photo_reactions;
create policy photo_reactions_delete on public.photo_reactions
  for delete to authenticated using (user_id = auth.uid());

-- --- photo_comments ---------------------------------------------------------
drop policy if exists photo_comments_select on public.photo_comments;
create policy photo_comments_select on public.photo_comments
  for select to authenticated using (public.is_member());

drop policy if exists photo_comments_insert on public.photo_comments;
create policy photo_comments_insert on public.photo_comments
  for insert to authenticated with check (public.is_member() and author_id = auth.uid());

drop policy if exists photo_comments_delete on public.photo_comments;
create policy photo_comments_delete on public.photo_comments
  for delete to authenticated using (author_id = auth.uid());

-- --- diary_entries ----------------------------------------------------------
-- Своя запись видна всегда. Чужая — только если она не закрыта
-- или срок открытия уже наступил.
drop policy if exists diary_entries_select on public.diary_entries;
create policy diary_entries_select on public.diary_entries
  for select to authenticated using (
    public.is_member()
    and (
      author_id = auth.uid()
      or unlock_at is null
      or unlock_at <= now()
    )
  );

drop policy if exists diary_entries_insert on public.diary_entries;
create policy diary_entries_insert on public.diary_entries
  for insert to authenticated with check (public.is_member() and author_id = auth.uid());

drop policy if exists diary_entries_update on public.diary_entries;
create policy diary_entries_update on public.diary_entries
  for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());

drop policy if exists diary_entries_delete on public.diary_entries;
create policy diary_entries_delete on public.diary_entries
  for delete to authenticated using (author_id = auth.uid());

-- --- wishes -----------------------------------------------------------------
drop policy if exists wishes_select on public.wishes;
create policy wishes_select on public.wishes
  for select to authenticated using (public.is_member());

drop policy if exists wishes_insert on public.wishes;
create policy wishes_insert on public.wishes
  for insert to authenticated with check (public.is_member() and created_by = auth.uid());

-- Отметить желание выполненным может любой из двоих.
drop policy if exists wishes_update on public.wishes;
create policy wishes_update on public.wishes
  for update to authenticated using (public.is_member()) with check (public.is_member());

drop policy if exists wishes_delete on public.wishes;
create policy wishes_delete on public.wishes
  for delete to authenticated using (created_by = auth.uid());

-- --- plans ------------------------------------------------------------------
drop policy if exists plans_select on public.plans;
create policy plans_select on public.plans
  for select to authenticated using (public.is_member());

drop policy if exists plans_insert on public.plans;
create policy plans_insert on public.plans
  for insert to authenticated with check (public.is_member() and created_by = auth.uid());

drop policy if exists plans_update on public.plans;
create policy plans_update on public.plans
  for update to authenticated using (public.is_member()) with check (public.is_member());

drop policy if exists plans_delete on public.plans;
create policy plans_delete on public.plans
  for delete to authenticated using (created_by = auth.uid());

-- =============================================================================
-- 12. Хранилище фотографий
-- =============================================================================
-- Приватный bucket: прямые ссылки не работают, файлы отдаются только
-- по временным подписанным URL. Лимит 15 МБ, только изображения.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'photos',
  'photos',
  false,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "photos_bucket_select" on storage.objects;
create policy "photos_bucket_select" on storage.objects
  for select to authenticated using (bucket_id = 'photos' and public.is_member());

drop policy if exists "photos_bucket_insert" on storage.objects;
create policy "photos_bucket_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'photos' and public.is_member());

drop policy if exists "photos_bucket_delete" on storage.objects;
create policy "photos_bucket_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'photos' and public.is_member());
