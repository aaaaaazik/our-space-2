-- ============================================================
-- ВСЁ-В-ОДНОМ: полная схема базы для НОВОГО проекта Supabase.
-- Это просто все файлы из migrations/, склеенные по порядку.
-- Вставьте целиком в Supabase -> SQL Editor -> New query -> Run.
-- Запускать один раз, на пустом проекте.
-- ============================================================



-- ------------------------------------------------------------
-- migrations/0001_initial_schema.sql
-- ------------------------------------------------------------

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


-- ------------------------------------------------------------
-- migrations/0002_media_and_video.sql
-- ------------------------------------------------------------

-- =============================================================================
-- Our Space — видео и переезд файлов на Cloudflare R2
-- =============================================================================
-- Как применить: Supabase → SQL Editor → New query → вставить целиком → Run.
-- Запускать повторно безопасно.
--
-- Что меняется:
--   • в таблице photos появляется тип записи (фото или видео);
--   • для видео хранится кадр-обложка и длительность;
--   • сами файлы теперь лежат в Cloudflare R2, а не в Supabase Storage,
--     поэтому storage_path — это ключ объекта в R2.
-- =============================================================================

alter table public.photos
  add column if not exists kind text not null default 'photo'
    check (kind in ('photo', 'video'));

-- Кадр-обложка для видео: без неё в сетке было бы пустое место.
-- Делается на телефоне при загрузке и кладётся в R2 отдельным файлом.
alter table public.photos
  add column if not exists poster_path text;

alter table public.photos
  add column if not exists duration_seconds numeric(8, 2);

alter table public.photos
  add column if not exists mime_type text;

alter table public.photos
  add column if not exists size_bytes bigint;

create index if not exists photos_kind_idx on public.photos (kind);

-- Старый bucket в Supabase больше не используется. Не удаляем его здесь:
-- если в нём остались файлы, они пропали бы безвозвратно.
-- Удалите его вручную в Storage, когда убедитесь, что всё работает.


-- ------------------------------------------------------------
-- migrations/0003_questions_and_games.sql
-- ------------------------------------------------------------

-- =============================================================================
-- Our Space — вопросы и игры
-- =============================================================================
-- Как применить: Supabase → SQL Editor → New query → вставить целиком → Run.
-- Скрипт безопасно запускать повторно.
--
-- Что появляется:
--   • наборы вопросов (вопрос дня, «я никогда не», свои);
--   • сами вопросы, в том числе добавленные вручную;
--   • ответы обоих партнёров.
--
-- Главное правило, ради которого всё и затевалось:
-- ответ второго человека не виден, пока не ответишь сам.
-- Это проверка в политике доступа, а не в интерфейсе, поэтому подсмотреть
-- нельзя даже при большом желании.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Наборы вопросов
-- -----------------------------------------------------------------------------
create table if not exists public.question_packs (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  title        text not null,
  emoji        text,
  description  text,
  -- daily  — по одному вопросу в день, ответ развёрнутый
  -- never  — «я никогда не», ответ да/нет
  kind         text not null check (kind in ('daily', 'never')),
  is_builtin   boolean not null default false,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 2. Вопросы
-- -----------------------------------------------------------------------------
create table if not exists public.questions (
  id          uuid primary key default gen_random_uuid(),
  pack_id     uuid not null references public.question_packs (id) on delete cascade,
  body        text not null check (char_length(body) between 3 and 500),
  position    integer not null default 0,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists questions_pack_idx on public.questions (pack_id, position);

-- -----------------------------------------------------------------------------
-- 3. Ответы
-- -----------------------------------------------------------------------------
create table if not exists public.answers (
  id           uuid primary key default gen_random_uuid(),
  question_id  uuid not null references public.questions (id) on delete cascade,
  author_id    uuid not null references public.profiles (id) on delete cascade,
  -- Для вопроса дня — текст, для «я никогда не» — выбор.
  body         text check (body is null or char_length(body) <= 2000),
  choice       text check (choice is null or choice in ('never', 'did')),
  created_at   timestamptz not null default now(),
  -- Один ответ на вопрос от каждого. Передумал — меняем существующий.
  unique (question_id, author_id)
);

create index if not exists answers_question_idx on public.answers (question_id);

-- -----------------------------------------------------------------------------
-- 4. Ключевая функция: отвечал ли я на этот вопрос
-- -----------------------------------------------------------------------------
-- security definer нужен, потому что политика таблицы answers обращается
-- к самой таблице answers. Без обхода RLS получилась бы бесконечная рекурсия.
create or replace function public.has_answered(question uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.answers
    where question_id = question and author_id = auth.uid()
  );
$$;

revoke all on function public.has_answered(uuid) from public;
grant execute on function public.has_answered(uuid) to authenticated;

-- =============================================================================
-- 5. Права доступа
-- =============================================================================
alter table public.question_packs enable row level security;
alter table public.questions      enable row level security;
alter table public.answers        enable row level security;

-- --- наборы ------------------------------------------------------------------
drop policy if exists question_packs_select on public.question_packs;
create policy question_packs_select on public.question_packs
  for select to authenticated using (public.is_member());

drop policy if exists question_packs_insert on public.question_packs;
create policy question_packs_insert on public.question_packs
  for insert to authenticated
  with check (public.is_member() and created_by = auth.uid() and not is_builtin);

drop policy if exists question_packs_delete on public.question_packs;
create policy question_packs_delete on public.question_packs
  for delete to authenticated using (created_by = auth.uid() and not is_builtin);

-- --- вопросы -----------------------------------------------------------------
drop policy if exists questions_select on public.questions;
create policy questions_select on public.questions
  for select to authenticated using (public.is_member());

drop policy if exists questions_insert on public.questions;
create policy questions_insert on public.questions
  for insert to authenticated
  with check (public.is_member() and created_by = auth.uid());

-- Удалить можно только свой вопрос. Встроенные добавлены без автора,
-- поэтому их не тронуть.
drop policy if exists questions_delete on public.questions;
create policy questions_delete on public.questions
  for delete to authenticated using (created_by = auth.uid());

-- --- ответы ------------------------------------------------------------------
-- Свой ответ виден всегда. Чужой — только если сам уже ответил.
drop policy if exists answers_select on public.answers;
create policy answers_select on public.answers
  for select to authenticated using (
    public.is_member()
    and (author_id = auth.uid() or public.has_answered(question_id))
  );

drop policy if exists answers_insert on public.answers;
create policy answers_insert on public.answers
  for insert to authenticated
  with check (public.is_member() and author_id = auth.uid());

drop policy if exists answers_update on public.answers;
create policy answers_update on public.answers
  for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());

drop policy if exists answers_delete on public.answers;
create policy answers_delete on public.answers
  for delete to authenticated using (author_id = auth.uid());

-- =============================================================================
-- 6. Встроенные наборы
-- =============================================================================
insert into public.question_packs (slug, title, emoji, description, kind, is_builtin)
values
  ('daily', 'Вопрос дня', '💬',
   'Каждый день новый вопрос. Ответ другого откроется, когда ответишь сам.',
   'daily', true),
  ('never', 'Я никогда не', '🙈',
   'Карточка за карточкой. Потом посмотрите, где сошлись.',
   'never', true)
on conflict (slug) do update set
  title = excluded.title,
  emoji = excluded.emoji,
  description = excluded.description;

-- --- вопросы дня -------------------------------------------------------------
insert into public.questions (pack_id, body, position)
select p.id, q.body, q.position
from public.question_packs p,
  (values
    ('Что во мне тебя до сих пор удивляет?', 1),
    ('Какой наш день ты бы прожил заново?', 2),
    ('Что я делаю такого, от чего тебе спокойно?', 3),
    ('О чём ты мечтал в детстве?', 4),
    ('Какая мелочь во мне тебе нравится больше всего?', 5),
    ('Что бы ты изменил в нашем первом свидании?', 6),
    ('Куда бы ты уехал со мной прямо сейчас?', 7),
    ('Что тебя рассмешило за последнюю неделю?', 8),
    ('Чего ты боишься, но не говоришь вслух?', 9),
    ('Какой запах напоминает тебе обо мне?', 10),
    ('Что для тебя значит «дом»?', 11),
    ('О чём ты думаешь перед сном?', 12),
    ('Какую нашу привычку ты хочешь сохранить навсегда?', 13),
    ('Что я мог бы делать для тебя чаще?', 14),
    ('Какой момент со мной ты бы поставил на паузу?', 15),
    ('Чему ты у меня научился?', 16),
    ('Какая песня напоминает о нас?', 17),
    ('Что тебя больше всего радует по утрам?', 18),
    ('Каким ты видишь нас через десять лет?', 19),
    ('Что ты никогда не говорил мне, но хотел?', 20),
    ('Какое наше фото твоё любимое и почему?', 21),
    ('Что тебе тяжелее всего мне сказать?', 22),
    ('Когда ты последний раз мной гордился?', 23),
    ('Какой подарок от меня запомнился больше всего?', 24),
    ('Что тебе во мне сначала не понравилось?', 25),
    ('Какое место ты хочешь показать мне первым?', 26),
    ('Что ты делаешь, когда скучаешь по мне?', 27),
    ('Какая наша традиция тебе дороже всего?', 28),
    ('О чём бы ты хотел поговорить, но всё откладываешь?', 29),
    ('Что бы ты сказал себе в день нашего знакомства?', 30),
    ('Какой у нас был самый спокойный вечер?', 31),
    ('Что тебя во мне успокаивает в ссоре?', 32),
    ('Какую нашу шутку понимаем только мы?', 33),
    ('Что ты хочешь попробовать вместе впервые?', 34),
    ('Когда ты почувствовал, что это серьёзно?', 35)
  ) as q(body, position)
where p.slug = 'daily'
  and not exists (
    select 1 from public.questions existing
    where existing.pack_id = p.id and existing.body = q.body
  );

-- --- я никогда не ------------------------------------------------------------
insert into public.questions (pack_id, body, position)
select p.id, q.body, q.position
from public.question_packs p,
  (values
    ('…не засыпал во время фильма, который сам предложил', 1),
    ('…не читал переписку через плечо', 2),
    ('…не делал вид, что слушаю', 3),
    ('…не откладывал ответ на сообщение, потому что лень', 4),
    ('…не выдумывал повод не идти на встречу', 5),
    ('…не ел то, что готовилось не для меня', 6),
    ('…не пересматривал наши фото в одиночку', 7),
    ('…не репетировал разговор в голове', 8),
    ('…не гуглил ответ прямо во время спора', 9),
    ('…не притворялся, что понял шутку', 10),
    ('…не прятал покупку от второй половинки', 11),
    ('…не ставил будильник и не выключал его сразу', 12),
    ('…не обижался молча вместо того, чтобы сказать', 13),
    ('…не завидовал чужим отношениям в соцсетях', 14),
    ('…не плакал из-за фильма', 15),
    ('…не отправлял сообщение не тому человеку', 16),
    ('…не говорил «я уже выхожу», не выходя', 17),
    ('…не пел в машине во весь голос', 18),
    ('…не проверял, прочитано ли моё сообщение', 19),
    ('…не покупал что-то только из-за настроения', 20),
    ('…не терял ключи в собственном кармане', 21),
    ('…не засматривался на еду в чужой тарелке', 22),
    ('…не откладывал важный разговор на завтра', 23),
    ('…не влюблялся с первого взгляда', 24),
    ('…не говорил неправду, чтобы не обидеть', 25),
    ('…не танцевал один, когда никто не видит', 26),
    ('…не скучал по человеку, который рядом', 27),
    ('…не мечтал сбежать на море посреди недели', 28),
    ('…не перечитывал старую переписку', 29),
    ('…не жалел, что промолчал', 30)
  ) as q(body, position)
where p.slug = 'never'
  and not exists (
    select 1 from public.questions existing
    where existing.pack_id = p.id and existing.body = q.body
  );


-- ------------------------------------------------------------
-- migrations/0004_love_languages.sql
-- ------------------------------------------------------------

-- =============================================================================
-- Our Space — тест «языки любви»
-- =============================================================================
-- Как применить: Supabase → SQL Editor → New query → вставить целиком → Run.
-- Скрипт безопасно запускать повторно.
--
-- Сами вопросы лежат в коде, а не здесь: к каждому варианту привязан язык,
-- и произвольные вопросы сломали бы подсчёт. В базе хранится только то,
-- что человек ответил.
-- =============================================================================

create table if not exists public.love_results (
  user_id       uuid primary key references public.profiles (id) on delete cascade,
  -- номер вопроса → 'a' или 'b'; храним ответы целиком, чтобы можно было
  -- продолжить с того места, где остановился, и пересчитать при желании
  answers       jsonb not null default '{}'::jsonb,
  scores        jsonb not null default '{}'::jsonb,
  completed_at  timestamptz,
  updated_at    timestamptz not null default now()
);

drop trigger if exists love_results_touch on public.love_results;
create trigger love_results_touch before update on public.love_results
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Прошёл ли я тест до конца
-- -----------------------------------------------------------------------------
-- security definer нужен по той же причине, что и в has_answered: политика
-- таблицы обращается к самой таблице, иначе получилась бы рекурсия.
create or replace function public.has_love_result()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.love_results
    where user_id = auth.uid() and completed_at is not null
  );
$$;

revoke all on function public.has_love_result() from public;
grant execute on function public.has_love_result() to authenticated;

-- -----------------------------------------------------------------------------
-- Права доступа
-- -----------------------------------------------------------------------------
alter table public.love_results enable row level security;

-- Свой результат виден всегда. Чужой — только после того, как пройдёшь сам:
-- иначе можно подсмотреть ответы и подстроиться под них.
drop policy if exists love_results_select on public.love_results;
create policy love_results_select on public.love_results
  for select to authenticated using (
    public.is_member()
    and (user_id = auth.uid() or public.has_love_result())
  );

drop policy if exists love_results_insert on public.love_results;
create policy love_results_insert on public.love_results
  for insert to authenticated
  with check (public.is_member() and user_id = auth.uid());

drop policy if exists love_results_update on public.love_results;
create policy love_results_update on public.love_results
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists love_results_delete on public.love_results;
create policy love_results_delete on public.love_results
  for delete to authenticated using (user_id = auth.uid());


-- ------------------------------------------------------------
-- migrations/0005_drawing_game.sql
-- ------------------------------------------------------------

-- =============================================================================
-- Our Space — рисовалка на двоих
-- =============================================================================
-- Как применить: Supabase → SQL Editor → New query → вставить целиком → Run.
-- Скрипт безопасно запускать повторно.
--
-- Правила игры: один получает задание и рисует, второй видит только рисунок
-- и пытается угадать. Потом автор говорит, засчитано или нет.
--
-- Самое важное здесь — что текст задания НЕ приходит на устройство
-- угадывающего, пока он не ответил. Иначе игра теряет смысл: достаточно
-- заглянуть в код страницы. Поэтому задание вынесено в отдельную таблицу
-- со своим правилом доступа: скрыть отдельный столбец правила RLS не умеют,
-- они работают со строками целиком.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Раунды
-- -----------------------------------------------------------------------------
create table if not exists public.drawing_rounds (
  id            uuid primary key default gen_random_uuid(),
  author_id     uuid not null references public.profiles (id) on delete cascade,
  -- ключ файла с рисунком в Cloudflare R2
  storage_path  text not null,
  guess         text check (guess is null or char_length(guess) between 1 and 200),
  guessed_by    uuid references public.profiles (id) on delete set null,
  guessed_at    timestamptz,
  -- ставит автор после того, как увидел догадку
  is_correct    boolean,
  created_at    timestamptz not null default now()
);

create index if not exists drawing_rounds_created_idx
  on public.drawing_rounds (created_at desc);

-- -----------------------------------------------------------------------------
-- 2. Задание — отдельно от раунда
-- -----------------------------------------------------------------------------
create table if not exists public.drawing_secrets (
  round_id  uuid primary key references public.drawing_rounds (id) on delete cascade,
  prompt    text not null check (char_length(prompt) between 2 and 200)
);

-- -----------------------------------------------------------------------------
-- 3. Можно ли показать задание
-- -----------------------------------------------------------------------------
-- Своё задание автор видит всегда. Второй — только после того, как ответил.
-- security definer нужен, чтобы функция могла заглянуть в drawing_rounds
-- в обход RLS: иначе политика одной таблицы, читающая другую, упёрлась бы
-- в её же ограничения.
create or replace function public.can_see_prompt(round uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.drawing_rounds r
    where r.id = round
      and (r.author_id = auth.uid() or r.guess is not null)
  );
$$;

revoke all on function public.can_see_prompt(uuid) from public;
grant execute on function public.can_see_prompt(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Права доступа
-- -----------------------------------------------------------------------------
alter table public.drawing_rounds  enable row level security;
alter table public.drawing_secrets enable row level security;

-- --- раунды ------------------------------------------------------------------
drop policy if exists drawing_rounds_select on public.drawing_rounds;
create policy drawing_rounds_select on public.drawing_rounds
  for select to authenticated using (public.is_member());

drop policy if exists drawing_rounds_insert on public.drawing_rounds;
create policy drawing_rounds_insert on public.drawing_rounds
  for insert to authenticated
  with check (public.is_member() and author_id = auth.uid());

-- Отвечает второй, засчитывает автор — поэтому изменять может любой из двоих.
-- Кто именно что меняет, ограничивают серверные действия приложения.
drop policy if exists drawing_rounds_update on public.drawing_rounds;
create policy drawing_rounds_update on public.drawing_rounds
  for update to authenticated
  using (public.is_member()) with check (public.is_member());

drop policy if exists drawing_rounds_delete on public.drawing_rounds;
create policy drawing_rounds_delete on public.drawing_rounds
  for delete to authenticated using (author_id = auth.uid());

-- --- задания -----------------------------------------------------------------
drop policy if exists drawing_secrets_select on public.drawing_secrets;
create policy drawing_secrets_select on public.drawing_secrets
  for select to authenticated using (
    public.is_member() and public.can_see_prompt(round_id)
  );

drop policy if exists drawing_secrets_insert on public.drawing_secrets;
create policy drawing_secrets_insert on public.drawing_secrets
  for insert to authenticated with check (public.is_member());

drop policy if exists drawing_secrets_delete on public.drawing_secrets;
create policy drawing_secrets_delete on public.drawing_secrets
  for delete to authenticated using (public.is_member());


-- ------------------------------------------------------------
-- migrations/0006_diary_timer_and_scores.sql
-- ------------------------------------------------------------

-- =============================================================================
-- Our Space — отложенные записи дневника
-- =============================================================================
-- Как применить: Supabase → SQL Editor → New query → вставить целиком → Run.
-- Скрипт безопасно запускать повторно.
--
-- Что меняется и зачем.
--
-- Раньше закрытая запись была не видна второму совсем: правило доступа
-- прятало строку целиком. Из-за этого пропадало главное — предвкушение.
-- Хочется видеть запертую шкатулку с отсчётом, а не пустоту.
--
-- Скрыть отдельный столбец правила доступа не умеют, они работают со
-- строками. Поэтому содержимое переезжает в отдельную таблицу:
--   diary_entries   — что запись существует, чья она и когда откроется;
--   diary_contents  — заголовок, текст и настроение.
--
-- Данные переносятся, ничего не теряется.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Новая таблица с содержимым
-- -----------------------------------------------------------------------------
create table if not exists public.diary_contents (
  entry_id  uuid primary key references public.diary_entries (id) on delete cascade,
  title     text not null,
  body      text not null default '',
  mood      text
);

-- -----------------------------------------------------------------------------
-- 2. Переносим то, что уже написано
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'diary_entries'
      and column_name = 'title'
  ) then
    insert into public.diary_contents (entry_id, title, body, mood)
    select id, title, body, mood from public.diary_entries
    on conflict (entry_id) do nothing;

    alter table public.diary_entries drop column title;
    alter table public.diary_entries drop column body;
    alter table public.diary_entries drop column mood;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 3. Можно ли читать содержимое
-- -----------------------------------------------------------------------------
-- Своё — всегда. Чужое — если срок не задан или уже наступил.
create or replace function public.can_read_diary(entry uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.diary_entries e
    where e.id = entry
      and (
        e.author_id = auth.uid()
        or e.unlock_at is null
        or e.unlock_at <= now()
      )
  );
$$;

revoke all on function public.can_read_diary(uuid) from public;
grant execute on function public.can_read_diary(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Права доступа
-- -----------------------------------------------------------------------------
alter table public.diary_contents enable row level security;

-- Сам факт записи виден обоим: второй знает, что его ждёт письмо,
-- и видит отсчёт. Содержимое при этом закрыто.
drop policy if exists diary_entries_select on public.diary_entries;
create policy diary_entries_select on public.diary_entries
  for select to authenticated using (public.is_member());

drop policy if exists diary_contents_select on public.diary_contents;
create policy diary_contents_select on public.diary_contents
  for select to authenticated using (
    public.is_member() and public.can_read_diary(entry_id)
  );

drop policy if exists diary_contents_insert on public.diary_contents;
create policy diary_contents_insert on public.diary_contents
  for insert to authenticated with check (public.is_member());

-- Менять текст может только автор записи.
drop policy if exists diary_contents_update on public.diary_contents;
create policy diary_contents_update on public.diary_contents
  for update to authenticated
  using (
    exists (
      select 1 from public.diary_entries e
      where e.id = entry_id and e.author_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.diary_entries e
      where e.id = entry_id and e.author_id = auth.uid()
    )
  );

drop policy if exists diary_contents_delete on public.diary_contents;
create policy diary_contents_delete on public.diary_contents
  for delete to authenticated
  using (
    exists (
      select 1 from public.diary_entries e
      where e.id = entry_id and e.author_id = auth.uid()
    )
  );

create index if not exists diary_entries_unlock_idx
  on public.diary_entries (unlock_at);


-- ------------------------------------------------------------
-- migrations/0007_push_notifications.sql
-- ------------------------------------------------------------

-- =============================================================================
-- Our Space — push-уведомления
-- =============================================================================
-- Как применить: Supabase → SQL Editor → New query → вставить целиком → Run.
-- Скрипт безопасно запускать повторно.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Подписки устройств
-- -----------------------------------------------------------------------------
-- Одно устройство — одна строка. У человека их может быть несколько:
-- телефон, планшет, компьютер.
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  -- Адрес, по которому браузер принимает уведомления. Уникален для устройства.
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

-- -----------------------------------------------------------------------------
-- 2. Что присылать
-- -----------------------------------------------------------------------------
create table if not exists public.notification_settings (
  user_id         uuid primary key references public.profiles (id) on delete cascade,
  photos          boolean not null default true,
  diary           boolean not null default true,
  games           boolean not null default true,
  dates           boolean not null default true,
  daily_question  boolean not null default true,
  -- Не беспокоить: часы начала и конца тишины. Пусто — присылать всегда.
  quiet_from      smallint check (quiet_from is null or quiet_from between 0 and 23),
  quiet_to        smallint check (quiet_to is null or quiet_to between 0 and 23),
  updated_at      timestamptz not null default now()
);

drop trigger if exists notification_settings_touch on public.notification_settings;
create trigger notification_settings_touch before update on public.notification_settings
  for each row execute function public.touch_updated_at();

-- Настройки для тех, кто уже зарегистрирован.
insert into public.notification_settings (user_id)
select id from public.profiles
on conflict (user_id) do nothing;

-- -----------------------------------------------------------------------------
-- 3. Кому слать — без ключа администратора
-- -----------------------------------------------------------------------------
-- Отправитель не имеет права читать чужие подписки: иначе можно было бы
-- выгрузить устройства второго человека. Но послать ему уведомление нужно.
--
-- Эта функция — единственная щель в стене: она возвращает только адреса
-- для отправки и только по тому типу, который второй разрешил. Ни списка
-- устройств, ни настроек целиком через неё не достать.
create or replace function public.partner_push_targets(kind text)
returns table (endpoint text, p256dh text, auth text)
language sql
stable
security definer
set search_path = public
as $$
  select s.endpoint, s.p256dh, s.auth
  from public.push_subscriptions s
  join public.notification_settings n on n.user_id = s.user_id
  where public.is_member()
    and s.user_id <> auth.uid()
    and case kind
      when 'photos' then n.photos
      when 'diary'  then n.diary
      when 'games'  then n.games
      when 'dates'  then n.dates
      when 'daily'  then n.daily_question
      else false
    end
    -- Тихие часы. Если начало больше конца, промежуток проходит через полночь.
    and (
      n.quiet_from is null or n.quiet_to is null
      or case
        when n.quiet_from < n.quiet_to
          then extract(hour from now()) not between n.quiet_from and n.quiet_to - 1
        else extract(hour from now()) < n.quiet_from
             and extract(hour from now()) >= n.quiet_to
      end
    );
$$;

revoke all on function public.partner_push_targets(text) from public;
grant execute on function public.partner_push_targets(text) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Права доступа
-- -----------------------------------------------------------------------------
alter table public.push_subscriptions   enable row level security;
alter table public.notification_settings enable row level security;

-- Свои подписки и настройки — только свои. Чужие не видны никак,
-- даже второму человеку: они содержат адреса его устройств.
drop policy if exists push_subscriptions_all on public.push_subscriptions;
create policy push_subscriptions_all on public.push_subscriptions
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists notification_settings_select on public.notification_settings;
create policy notification_settings_select on public.notification_settings
  for select to authenticated using (user_id = auth.uid());

drop policy if exists notification_settings_insert on public.notification_settings;
create policy notification_settings_insert on public.notification_settings
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists notification_settings_update on public.notification_settings;
create policy notification_settings_update on public.notification_settings
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());


-- ------------------------------------------------------------
-- migrations/0008_quieter_game_notifications.sql
-- ------------------------------------------------------------

-- =============================================================================
-- Our Space — приглушить уведомления из игр
-- =============================================================================
-- Как применить: Supabase → SQL Editor → New query → вставить целиком → Run.
--
-- Игровых событий много: нарисовал, угадал, засчитал — три уведомления
-- за один раунд. Для фотографий и писем это уместно, для игры оказалось
-- слишком назойливо.
--
-- Выключаем их и по умолчанию, и у тех, у кого они уже включены.
-- Вернуть можно в любой момент: Настройки → Уведомления → Игры и рекорды.
-- =============================================================================

alter table public.notification_settings
  alter column games set default false;

update public.notification_settings
set games = false
where games = true;


-- ------------------------------------------------------------
-- migrations/0009_word_games.sql
-- ------------------------------------------------------------

-- =============================================================================
-- Our Space — игры на угадывание слов
-- =============================================================================
-- Как применить: Supabase → SQL Editor → New query → вставить целиком → Run.
-- Скрипт безопасно запускать повторно.
--
-- Два вида:
--   rebus   — автор выкладывает слово смайликами, второй угадывает;
--   anagram — автор пишет слово, приложение перемешивает буквы.
--
-- Само слово, как и в рисовалке, лежит в отдельной таблице: правила доступа
-- работают со строками целиком и скрыть один столбец не умеют.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Раунды
-- -----------------------------------------------------------------------------
create table if not exists public.word_rounds (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid not null references public.profiles (id) on delete cascade,
  kind        text not null check (kind in ('rebus', 'anagram')),
  -- Что видит угадывающий: строка смайликов или перемешанные буквы.
  clue        text not null check (char_length(clue) between 1 and 200),
  -- Длина слова — подсказка, которая не выдаёт само слово.
  word_length integer not null,
  attempts    integer not null default 0,
  -- null — ещё думает, true — угадал, false — попытки кончились
  solved      boolean,
  solved_at   timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists word_rounds_created_idx
  on public.word_rounds (created_at desc);

-- -----------------------------------------------------------------------------
-- 2. Само слово — отдельно
-- -----------------------------------------------------------------------------
create table if not exists public.word_secrets (
  round_id  uuid primary key references public.word_rounds (id) on delete cascade,
  word      text not null check (char_length(word) between 2 and 40)
);

-- -----------------------------------------------------------------------------
-- 3. Когда слово можно показать
-- -----------------------------------------------------------------------------
-- Автору — всегда. Второму — когда угадал или попытки закончились.
create or replace function public.can_see_word(round uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.word_rounds r
    where r.id = round
      and (r.author_id = auth.uid() or r.solved is not null)
  );
$$;

revoke all on function public.can_see_word(uuid) from public;
grant execute on function public.can_see_word(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Проверка ответа
-- -----------------------------------------------------------------------------
-- Сравнение делает база, а не приложение: иначе для проверки пришлось бы
-- сначала прочитать слово, а его-то как раз читать и нельзя.
--
-- Сравниваем без учёта регистра, лишних пробелов и разницы между е и ё —
-- «Ёлка» и «елка» должны считаться одним словом.
create or replace function public.try_word(round uuid, attempt text)
returns table (correct boolean, attempts integer, finished boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  secret   text;
  author   uuid;
  state    boolean;
  tries    integer;
  is_right boolean;
begin
  select w.word, r.author_id, r.solved, r.attempts
  into secret, author, state, tries
  from public.word_rounds r
  join public.word_secrets w on w.round_id = r.id
  where r.id = round;

  if secret is null then
    raise exception 'раунд не найден';
  end if;

  -- Свой же раунд отгадывать нечего, и заново решать решённый — тоже.
  if author = auth.uid() or state is not null or not public.is_member() then
    return query select false, tries, true;
    return;
  end if;

  is_right := lower(translate(btrim(attempt), 'ёЁ', 'еЕ'))
            = lower(translate(btrim(secret), 'ёЁ', 'еЕ'));

  tries := tries + 1;

  update public.word_rounds
  set attempts = tries,
      -- Три попытки: меньше обидно, больше — теряется азарт.
      solved = case when is_right then true
                    when tries >= 3 then false
                    else null end,
      solved_at = case when is_right or tries >= 3 then now() else null end
  where id = round;

  return query select is_right, tries, (is_right or tries >= 3);
end;
$$;

revoke all on function public.try_word(uuid, text) from public;
grant execute on function public.try_word(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Права доступа
-- -----------------------------------------------------------------------------
alter table public.word_rounds  enable row level security;
alter table public.word_secrets enable row level security;

drop policy if exists word_rounds_select on public.word_rounds;
create policy word_rounds_select on public.word_rounds
  for select to authenticated using (public.is_member());

drop policy if exists word_rounds_insert on public.word_rounds;
create policy word_rounds_insert on public.word_rounds
  for insert to authenticated
  with check (public.is_member() and author_id = auth.uid());

-- Напрямую менять раунд нельзя: счёт попыток и результат ставит
-- только функция try_word, иначе можно было бы объявить себя угадавшим.
drop policy if exists word_rounds_delete on public.word_rounds;
create policy word_rounds_delete on public.word_rounds
  for delete to authenticated using (author_id = auth.uid());

drop policy if exists word_secrets_select on public.word_secrets;
create policy word_secrets_select on public.word_secrets
  for select to authenticated using (
    public.is_member() and public.can_see_word(round_id)
  );

drop policy if exists word_secrets_insert on public.word_secrets;
create policy word_secrets_insert on public.word_secrets
  for insert to authenticated with check (public.is_member());

drop policy if exists word_secrets_delete on public.word_secrets;
create policy word_secrets_delete on public.word_secrets
  for delete to authenticated using (public.is_member());


-- ------------------------------------------------------------
-- migrations/0010_wish_note.sql
-- ------------------------------------------------------------

-- =============================================================================
-- Our Space — короткая заметка ко второму желанию
-- =============================================================================
-- Как применить: Supabase → SQL Editor → New query → вставить целиком → Run.
-- Скрипт безопасно запускать повторно.
--
-- Одна строчка на желание — от того, кто его НЕ добавлял. Смысл в том,
-- чтобы можно было тихо отозваться: «уже присмотрела», «а давай в июне».
-- Поэтому поле одно, а не переписка: длинные обсуждения превратили бы
-- список желаний в чат.
-- =============================================================================

alter table public.wishes
  add column if not exists note text
    check (note is null or char_length(note) between 1 and 200);

-- Кто оставил заметку. Нужно, чтобы подписать её именем и чтобы автор
-- желания не мог переписать чужие слова.
alter table public.wishes
  add column if not exists note_by uuid references public.profiles (id) on delete set null;

alter table public.wishes
  add column if not exists note_at timestamptz;


-- ------------------------------------------------------------
-- migrations/0011_gender.sql
-- ------------------------------------------------------------

-- =============================================================================
-- Our Space — род собеседника
-- =============================================================================
-- Как применить: Supabase → SQL Editor → New query → вставить целиком → Run.
-- Скрипт безопасно запускать повторно.
--
-- Зачем. Вопросы вроде «Что бы ты сказал себе...» написаны в мужском роде,
-- и для половины пары звучат неверно. Переписать их нейтрально нельзя:
-- в русском прошедшее время всегда с родом.
--
-- Решение: в тексте помечается развилка — сказал{|а}, научил{ся|ась}.
-- Слева мужская форма, справа женская. Подстановку делает приложение,
-- зная род читающего.
-- =============================================================================

alter table public.profiles
  add column if not exists gender text
    check (gender is null or gender in ('male', 'female'));

-- -----------------------------------------------------------------------------
-- Вопросы дня
-- -----------------------------------------------------------------------------
update public.questions q
set body = v.new_body
from (values
  ('Какой наш день ты бы прожил заново?',
   'Какой наш день ты бы прожил{|а} заново?'),
  ('О чём ты мечтал в детстве?',
   'О чём ты мечтал{|а} в детстве?'),
  ('Что бы ты изменил в нашем первом свидании?',
   'Что бы ты изменил{|а} в нашем первом свидании?'),
  ('Куда бы ты уехал со мной прямо сейчас?',
   'Куда бы ты уехал{|а} со мной прямо сейчас?'),
  ('Чему ты у меня научился?',
   'Чему ты у меня научил{ся|ась}?'),
  ('Что ты никогда не говорил мне, но хотел?',
   'Что ты никогда не говорил{|а} мне, но хотел{|а}?'),
  ('Когда ты последний раз мной гордился?',
   'Когда ты последний раз мной гордил{ся|ась}?'),
  ('Что бы ты сказал себе в день нашего знакомства?',
   'Что бы ты сказал{|а} себе в день нашего знакомства?'),
  ('Когда ты почувствовал, что это серьёзно?',
   'Когда ты почувствовал{|а}, что это серьёзно?')
) as v(old_body, new_body)
where q.body = v.old_body and q.created_by is null;

-- -----------------------------------------------------------------------------
-- Я никогда не
-- -----------------------------------------------------------------------------
-- Здесь человек говорит о себе, поэтому род нужен почти в каждой карточке.
update public.questions q
set body = v.new_body
from (values
  ('…не засыпал во время фильма, который сам предложил',
   '…не засыпал{|а} во время фильма, который сам{|а} предложил{|а}'),
  ('…не читал переписку через плечо',
   '…не читал{|а} переписку через плечо'),
  ('…не делал вид, что слушаю',
   '…не делал{|а} вид, что слушаю'),
  ('…не откладывал ответ на сообщение, потому что лень',
   '…не откладывал{|а} ответ на сообщение, потому что лень'),
  ('…не выдумывал повод не идти на встречу',
   '…не выдумывал{|а} повод не идти на встречу'),
  ('…не ел то, что готовилось не для меня',
   '…не ел{|а} то, что готовилось не для меня'),
  ('…не пересматривал наши фото в одиночку',
   '…не пересматривал{|а} наши фото в одиночку'),
  ('…не репетировал разговор в голове',
   '…не репетировал{|а} разговор в голове'),
  ('…не гуглил ответ прямо во время спора',
   '…не гуглил{|а} ответ прямо во время спора'),
  ('…не притворялся, что понял шутку',
   '…не притворял{ся|ась}, что понял{|а} шутку'),
  ('…не прятал покупку от второй половинки',
   '…не прятал{|а} покупку от второй половинки'),
  ('…не ставил будильник и не выключал его сразу',
   '…не ставил{|а} будильник и не выключал{|а} его сразу'),
  ('…не обижался молча вместо того, чтобы сказать',
   '…не обижал{ся|ась} молча вместо того, чтобы сказать'),
  ('…не завидовал чужим отношениям в соцсетях',
   '…не завидовал{|а} чужим отношениям в соцсетях'),
  ('…не плакал из-за фильма',
   '…не плакал{|а} из-за фильма'),
  ('…не отправлял сообщение не тому человеку',
   '…не отправлял{|а} сообщение не тому человеку'),
  ('…не говорил «я уже выхожу», не выходя',
   '…не говорил{|а} «я уже выхожу», не выходя'),
  ('…не пел в машине во весь голос',
   '…не пел{|а} в машине во весь голос'),
  ('…не проверял, прочитано ли моё сообщение',
   '…не проверял{|а}, прочитано ли моё сообщение'),
  ('…не покупал что-то только из-за настроения',
   '…не покупал{|а} что-то только из-за настроения'),
  ('…не терял ключи в собственном кармане',
   '…не терял{|а} ключи в собственном кармане'),
  ('…не засматривался на еду в чужой тарелке',
   '…не засматривал{ся|ась} на еду в чужой тарелке'),
  ('…не откладывал важный разговор на завтра',
   '…не откладывал{|а} важный разговор на завтра'),
  ('…не влюблялся с первого взгляда',
   '…не влюблял{ся|ась} с первого взгляда'),
  ('…не говорил неправду, чтобы не обидеть',
   '…не говорил{|а} неправду, чтобы не обидеть'),
  ('…не танцевал один, когда никто не видит',
   '…не танцевал{|а} один{|а}, когда никто не видит'),
  ('…не скучал по человеку, который рядом',
   '…не скучал{|а} по человеку, который рядом'),
  ('…не мечтал сбежать на море посреди недели',
   '…не мечтал{|а} сбежать на море посреди недели'),
  ('…не перечитывал старую переписку',
   '…не перечитывал{|а} старую переписку'),
  ('…не жалел, что промолчал',
   '…не жалел{|а}, что промолчал{|а}')
) as v(old_body, new_body)
where q.body = v.old_body and q.created_by is null;


-- ------------------------------------------------------------
-- migrations/0012_feminine_wording.sql
-- ------------------------------------------------------------

-- =============================================================================
-- Our Space — женский род в вопросах
-- =============================================================================
-- Как применить: Supabase → SQL Editor → New query → вставить целиком → Run.
-- Скрипт безопасно запускать повторно.
--
-- Развилки вида сказал{|а} оказались лишними: приложением пользуются двое,
-- и договорились писать всё в женском роде. Разбор скобок при каждом показе
-- ради этого не нужен — проще хранить готовый текст.
--
-- Скрипт заменяет и исходный мужской вариант, и промежуточный со скобками,
-- поэтому неважно, применялась ли предыдущая миграция.
-- =============================================================================

-- Столбец рода больше не используется.
alter table public.profiles drop column if exists gender;

-- -----------------------------------------------------------------------------
-- Вопросы дня
-- -----------------------------------------------------------------------------
update public.questions q
set body = v.new_body
from (values
  ('Какой наш день ты бы прожила заново?',
   array['Какой наш день ты бы прожил заново?',
         'Какой наш день ты бы прожил{|а} заново?']),
  ('О чём ты мечтала в детстве?',
   array['О чём ты мечтал в детстве?',
         'О чём ты мечтал{|а} в детстве?']),
  ('Что бы ты изменила в нашем первом свидании?',
   array['Что бы ты изменил в нашем первом свидании?',
         'Что бы ты изменил{|а} в нашем первом свидании?']),
  ('Куда бы ты уехала со мной прямо сейчас?',
   array['Куда бы ты уехал со мной прямо сейчас?',
         'Куда бы ты уехал{|а} со мной прямо сейчас?']),
  ('Чему ты у меня научилась?',
   array['Чему ты у меня научился?',
         'Чему ты у меня научил{ся|ась}?']),
  ('Что ты никогда не говорила мне, но хотела?',
   array['Что ты никогда не говорил мне, но хотел?',
         'Что ты никогда не говорил{|а} мне, но хотел{|а}?']),
  ('Когда ты последний раз мной гордилась?',
   array['Когда ты последний раз мной гордился?',
         'Когда ты последний раз мной гордил{ся|ась}?']),
  ('Что бы ты сказала себе в день нашего знакомства?',
   array['Что бы ты сказал себе в день нашего знакомства?',
         'Что бы ты сказал{|а} себе в день нашего знакомства?']),
  ('Когда ты почувствовала, что это серьёзно?',
   array['Когда ты почувствовал, что это серьёзно?',
         'Когда ты почувствовал{|а}, что это серьёзно?'])
) as v(new_body, old_bodies)
where q.body = any(v.old_bodies) and q.created_by is null;

-- -----------------------------------------------------------------------------
-- Я никогда не
-- -----------------------------------------------------------------------------
update public.questions q
set body = v.new_body
from (values
  ('…не засыпала во время фильма, который сама предложила',
   array['…не засыпал во время фильма, который сам предложил',
         '…не засыпал{|а} во время фильма, который сам{|а} предложил{|а}']),
  ('…не читала переписку через плечо',
   array['…не читал переписку через плечо', '…не читал{|а} переписку через плечо']),
  ('…не делала вид, что слушаю',
   array['…не делал вид, что слушаю', '…не делал{|а} вид, что слушаю']),
  ('…не откладывала ответ на сообщение, потому что лень',
   array['…не откладывал ответ на сообщение, потому что лень',
         '…не откладывал{|а} ответ на сообщение, потому что лень']),
  ('…не выдумывала повод не идти на встречу',
   array['…не выдумывал повод не идти на встречу',
         '…не выдумывал{|а} повод не идти на встречу']),
  ('…не ела то, что готовилось не для меня',
   array['…не ел то, что готовилось не для меня',
         '…не ел{|а} то, что готовилось не для меня']),
  ('…не пересматривала наши фото в одиночку',
   array['…не пересматривал наши фото в одиночку',
         '…не пересматривал{|а} наши фото в одиночку']),
  ('…не репетировала разговор в голове',
   array['…не репетировал разговор в голове', '…не репетировал{|а} разговор в голове']),
  ('…не гуглила ответ прямо во время спора',
   array['…не гуглил ответ прямо во время спора',
         '…не гуглил{|а} ответ прямо во время спора']),
  ('…не притворялась, что поняла шутку',
   array['…не притворялся, что понял шутку',
         '…не притворял{ся|ась}, что понял{|а} шутку']),
  ('…не прятала покупку от второй половинки',
   array['…не прятал покупку от второй половинки',
         '…не прятал{|а} покупку от второй половинки']),
  ('…не ставила будильник и не выключала его сразу',
   array['…не ставил будильник и не выключал его сразу',
         '…не ставил{|а} будильник и не выключал{|а} его сразу']),
  ('…не обижалась молча вместо того, чтобы сказать',
   array['…не обижался молча вместо того, чтобы сказать',
         '…не обижал{ся|ась} молча вместо того, чтобы сказать']),
  ('…не завидовала чужим отношениям в соцсетях',
   array['…не завидовал чужим отношениям в соцсетях',
         '…не завидовал{|а} чужим отношениям в соцсетях']),
  ('…не плакала из-за фильма',
   array['…не плакал из-за фильма', '…не плакал{|а} из-за фильма']),
  ('…не отправляла сообщение не тому человеку',
   array['…не отправлял сообщение не тому человеку',
         '…не отправлял{|а} сообщение не тому человеку']),
  ('…не говорила «я уже выхожу», не выходя',
   array['…не говорил «я уже выхожу», не выходя',
         '…не говорил{|а} «я уже выхожу», не выходя']),
  ('…не пела в машине во весь голос',
   array['…не пел в машине во весь голос', '…не пел{|а} в машине во весь голос']),
  ('…не проверяла, прочитано ли моё сообщение',
   array['…не проверял, прочитано ли моё сообщение',
         '…не проверял{|а}, прочитано ли моё сообщение']),
  ('…не покупала что-то только из-за настроения',
   array['…не покупал что-то только из-за настроения',
         '…не покупал{|а} что-то только из-за настроения']),
  ('…не теряла ключи в собственном кармане',
   array['…не терял ключи в собственном кармане',
         '…не терял{|а} ключи в собственном кармане']),
  ('…не засматривалась на еду в чужой тарелке',
   array['…не засматривался на еду в чужой тарелке',
         '…не засматривал{ся|ась} на еду в чужой тарелке']),
  ('…не откладывала важный разговор на завтра',
   array['…не откладывал важный разговор на завтра',
         '…не откладывал{|а} важный разговор на завтра']),
  ('…не влюблялась с первого взгляда',
   array['…не влюблялся с первого взгляда', '…не влюблял{ся|ась} с первого взгляда']),
  ('…не говорила неправду, чтобы не обидеть',
   array['…не говорил неправду, чтобы не обидеть',
         '…не говорил{|а} неправду, чтобы не обидеть']),
  ('…не танцевала одна, когда никто не видит',
   array['…не танцевал один, когда никто не видит',
         '…не танцевал{|а} один{|а}, когда никто не видит']),
  ('…не скучала по человеку, который рядом',
   array['…не скучал по человеку, который рядом',
         '…не скучал{|а} по человеку, который рядом']),
  ('…не мечтала сбежать на море посреди недели',
   array['…не мечтал сбежать на море посреди недели',
         '…не мечтал{|а} сбежать на море посреди недели']),
  ('…не перечитывала старую переписку',
   array['…не перечитывал старую переписку', '…не перечитывал{|а} старую переписку']),
  ('…не жалела, что промолчала',
   array['…не жалел, что промолчал', '…не жалел{|а}, что промолчал{|а}'])
) as v(new_body, old_bodies)
where q.body = any(v.old_bodies) and q.created_by is null;


-- ------------------------------------------------------------
-- migrations/0013_calendar_and_daily.sql
-- ------------------------------------------------------------

-- =============================================================================
-- Our Space — свои вопросы вперёд и заметки к ответам
-- =============================================================================
-- Как применить: Supabase → SQL Editor → New query → вставить целиком → Run.
-- Скрипт безопасно запускать повторно.
--
-- Календарю отдельная таблица не нужна: разовые события уже лежат в plans,
-- а повторяющиеся каждый год — в important_dates. Обе таблицы созданы
-- миграцией 0001, здесь они только начинают наконец использоваться.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Тихая строчка к ответу второго
-- -----------------------------------------------------------------------------
-- Ровно как заметка к желанию: одно поле, а не переписка. Оставляет её тот,
-- кто ответ НЕ писал, — и только после того, как ответил сам.

alter table public.answers
  add column if not exists note text
    check (note is null or char_length(note) between 1 and 200);

alter table public.answers
  add column if not exists note_by uuid
    references public.profiles (id) on delete set null;

alter table public.answers
  add column if not exists note_at timestamptz;


-- -----------------------------------------------------------------------------
-- 2. Запись заметки
-- -----------------------------------------------------------------------------
-- Политика answers_update разрешает менять только свои ответы — иначе можно
-- было бы переписать чужие слова. А заметку оставляет как раз второй.
-- Правила RLS работают на строку целиком и не умеют «эти столбцы можно,
-- остальные нельзя», поэтому запись идёт через функцию: она проверяет всё
-- сама и меняет ровно три поля.

create or replace function public.set_answer_note(p_answer uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author   uuid;
  v_question uuid;
  v_clean    text;
begin
  if not public.is_member() then
    raise exception 'нет доступа';
  end if;

  select a.author_id, a.question_id
    into v_author, v_question
    from public.answers a
   where a.id = p_answer;

  if v_author is null then
    raise exception 'ответ не найден';
  end if;

  if v_author = auth.uid() then
    raise exception 'к своему ответу заметку не оставить';
  end if;

  -- Чужой ответ до собственного вообще не виден. Проверка нужна на случай,
  -- если id ответа попробуют подставить руками в обход интерфейса.
  if not exists (
    select 1 from public.answers a
     where a.question_id = v_question and a.author_id = auth.uid()
  ) then
    raise exception 'сначала ответьте сами';
  end if;

  v_clean := nullif(btrim(coalesce(p_note, '')), '');

  if v_clean is not null and char_length(v_clean) > 200 then
    raise exception 'слишком длинная заметка';
  end if;

  update public.answers
     set note    = v_clean,
         note_by = case when v_clean is null then null else auth.uid() end,
         note_at = case when v_clean is null then null else now() end
   where id = p_answer;
end;
$$;

revoke all on function public.set_answer_note(uuid, text) from public;
grant execute on function public.set_answer_note(uuid, text) to authenticated;


-- -----------------------------------------------------------------------------
-- 3. Какой вопрос показывать сегодня
-- -----------------------------------------------------------------------------
-- Свои вопросы идут первыми, в порядке добавления. Написанный сегодня
-- появляется завтра — иначе автор увидел бы собственный вопрос в тот же час,
-- когда его придумал.
--
-- Вопрос держится, пока на него не ответят ОБА, и остаётся до конца тех
-- суток, в которые ответил второй, — «вопрос дня» не должен меняться на
-- глазах сразу после ответа. Когда свои кончаются, идут подготовленные,
-- по календарю: одна и та же дата всегда даёт один и тот же вопрос, поэтому
-- у обоих он совпадает без всякого расписания.
--
-- Считать это на стороне приложения нельзя: чужой ответ до собственного
-- база не отдаёт, и «ответили оба» там просто не посчитать. Отсюда
-- security definer — функция видит обе строки, но наружу отдаёт только id.

create or replace function public.daily_question()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tz      text;
  v_today   date;
  v_rec     record;
  v_answers int;
  v_today_n int;
  v_total   int;
  v_result  uuid;
begin
  if not public.is_member() then
    return null;
  end if;

  select coalesce(nullif(cs.timezone, ''), 'UTC')
    into v_tz
    from public.couple_settings cs
   limit 1;

  v_tz := coalesce(v_tz, 'UTC');
  v_today := (now() at time zone v_tz)::date;

  for v_rec in
    select q.id
      from public.questions q
      join public.question_packs p on p.id = q.pack_id
     where p.slug = 'daily'
       and q.created_by is not null
       and (q.created_at at time zone v_tz)::date < v_today
     order by q.created_at, q.id
  loop
    select count(*),
           count(*) filter (
             where (a.created_at at time zone v_tz)::date = v_today
           )
      into v_answers, v_today_n
      from public.answers a
     where a.question_id = v_rec.id;

    if v_answers < 2 or v_today_n > 0 then
      return v_rec.id;
    end if;
  end loop;

  select count(*)
    into v_total
    from public.questions q
    join public.question_packs p on p.id = q.pack_id
   where p.slug = 'daily' and q.created_by is null;

  if v_total = 0 then
    return null;
  end if;

  select ranked.id
    into v_result
    from (
      select q.id,
             row_number() over (order by q.position, q.created_at, q.id) - 1 as rn
        from public.questions q
        join public.question_packs p on p.id = q.pack_id
       where p.slug = 'daily' and q.created_by is null
    ) ranked
   where ranked.rn = ((v_today - date '1970-01-01') % v_total);

  return v_result;
end;
$$;

revoke all on function public.daily_question() from public;
grant execute on function public.daily_question() to authenticated;


-- -----------------------------------------------------------------------------
-- 4. Указатели для календаря
-- -----------------------------------------------------------------------------
-- Календарь читает обе таблицы целиком: за годы там наберётся пара сотен
-- строк, и это дешевле, чем ходить в базу при каждом перелистывании месяца.
-- Индексы нужны для сортировки и для ночной рассылки напоминаний.

create index if not exists plans_starts_at_idx
  on public.plans (starts_at);

create index if not exists important_dates_date_idx
  on public.important_dates (date);


-- ------------------------------------------------------------
-- migrations/0014_thoughts.sql
-- ------------------------------------------------------------

-- =============================================================================
-- Our Space — «думаю о тебе»
-- =============================================================================
-- Как применить: Supabase → SQL Editor → New query → вставить целиком → Run.
-- Скрипт безопасно запускать повторно.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Сами нажатия
-- -----------------------------------------------------------------------------
-- Хранить их нужно не ради истории, а ради самой кнопки. Уведомление может
-- не дойти: телефон выключен, разрешение не выдано, идут тихие часы. Если
-- нигде не оставить следа, нажатие в такой момент пропадёт совсем — а так
-- второй увидит его, когда откроет приложение.
--
-- Ничего, кроме времени и автора, здесь нет: в этом весь смысл кнопки.

create table if not exists public.thoughts (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists thoughts_created_at_idx
  on public.thoughts (created_at desc);

alter table public.thoughts enable row level security;

-- Видно обоим: в этом и смысл. Добавлять можно только от своего имени,
-- иначе можно было бы отправить «думаю о тебе» как будто от второго.
drop policy if exists thoughts_select on public.thoughts;
create policy thoughts_select on public.thoughts
  for select to authenticated using (public.is_member());

drop policy if exists thoughts_insert on public.thoughts;
create policy thoughts_insert on public.thoughts
  for insert to authenticated
  with check (public.is_member() and author_id = auth.uid());

-- Удалять и править нечего: нажатие либо было, либо нет.


-- -----------------------------------------------------------------------------
-- 2. Отдельный переключатель в настройках
-- -----------------------------------------------------------------------------
-- Включён по умолчанию — ради этого кнопку и делали. Но остаться без
-- возможности его выключить нельзя: уведомление приходит в любой момент,
-- когда второму захотелось нажать.

alter table public.notification_settings
  add column if not exists thoughts boolean not null default true;


-- -----------------------------------------------------------------------------
-- 3. Кому слать
-- -----------------------------------------------------------------------------
-- Та же функция, что и раньше, плюс новый вид. Переписана целиком, потому
-- что менять существующую функцию частями Postgres не умеет.
--
-- Список устройств второго человека приложение прочитать не может — это
-- чужие данные. Функция отдаёт только адреса для отправки, и только если
-- он разрешил этот вид уведомлений и сейчас не его тихие часы.

create or replace function public.partner_push_targets(kind text)
returns table (endpoint text, p256dh text, auth text)
language sql
stable
security definer
set search_path = public
as $$
  select s.endpoint, s.p256dh, s.auth
  from public.push_subscriptions s
  join public.notification_settings n on n.user_id = s.user_id
  where public.is_member()
    and s.user_id <> auth.uid()
    and case kind
      when 'photos'   then n.photos
      when 'diary'    then n.diary
      when 'games'    then n.games
      when 'dates'    then n.dates
      when 'daily'    then n.daily_question
      when 'thoughts' then n.thoughts
      else false
    end
    -- Тихие часы. Если начало больше конца, промежуток проходит через полночь.
    and (
      n.quiet_from is null or n.quiet_to is null
      or case
        when n.quiet_from < n.quiet_to
          then extract(hour from now()) not between n.quiet_from and n.quiet_to - 1
        else extract(hour from now()) < n.quiet_from
             and extract(hour from now()) >= n.quiet_to
      end
    );
$$;

revoke all on function public.partner_push_targets(text) from public;
grant execute on function public.partner_push_targets(text) to authenticated;


-- ------------------------------------------------------------
-- migrations/0015_voice.sql
-- ------------------------------------------------------------

-- =============================================================================
-- Our Space — голос в письме
-- =============================================================================
-- Как применить: Supabase → SQL Editor → New query → вставить целиком → Run.
-- Скрипт безопасно запускать повторно.
--
-- Поля добавляются именно в diary_contents, а не в diary_entries. Это важно:
-- содержимое запертого письма база не отдаёт до срока, а значит и ключ файла
-- с голосом второму не придёт. Без ключа подписать ссылку на файл нельзя, то
-- есть запись голосом заперта ровно так же надёжно, как текст.
-- =============================================================================

alter table public.diary_contents
  add column if not exists audio_path text;

-- Длительность храним своим числом, а не вычисляем из файла.
-- У записи, сделанной браузером на ходу, длительность внутри файла часто
-- не проставлена: пока запись идёт, её итоговая продолжительность ещё
-- неизвестна. Браузер в таких случаях сообщает «бесконечность», и подпись
-- под кнопкой показать нечем. Секунды считает сам диктофон, по своему
-- таймеру, и они приходят сюда готовым числом.
alter table public.diary_contents
  add column if not exists audio_seconds integer
    check (audio_seconds is null or audio_seconds between 1 and 300);


-- ------------------------------------------------------------
-- migrations/0016_chat.sql
-- ------------------------------------------------------------

-- =============================================================================
-- Our Space — чат
-- =============================================================================
-- Как применить: Supabase → SQL Editor → New query → вставить целиком → Run.
-- Скрипт безопасно запускать повторно.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Сообщения
-- -----------------------------------------------------------------------------
-- Комнат нет и не будет: пользователей ровно двое, и все сообщения — одна
-- общая переписка. Заводить таблицу бесед ради одной беседы значило бы
-- усложнить всё на пустом месте.

create table if not exists public.messages (
  id            uuid primary key default gen_random_uuid(),
  author_id     uuid not null references public.profiles (id) on delete cascade,

  -- Текст либо голос, либо и то и другое. Пустое сообщение не имеет смысла,
  -- поэтому что-то одно обязано быть — это проверяется ниже.
  body          text check (body is null or char_length(body) between 1 and 4000),
  audio_path    text,
  audio_seconds integer check (audio_seconds is null or audio_seconds between 1 and 300),

  -- Когда второй это прочитал. Отсюда и «прочитано», и счётчик непрочитанных.
  read_at       timestamptz,
  created_at    timestamptz not null default now(),

  constraint messages_not_empty check (body is not null or audio_path is not null)
);

-- Переписка всегда читается с конца, поэтому указатель по времени.
create index if not exists messages_created_at_idx
  on public.messages (created_at desc);

-- Для счётчика непрочитанных: частичный указатель, только по нужным строкам.
-- Прочитанных со временем станут тысячи, и держать их в указателе незачем.
create index if not exists messages_unread_idx
  on public.messages (author_id) where read_at is null;

alter table public.messages enable row level security;

-- Переписка общая: видно обоим. Писать можно только от своего имени —
-- иначе можно было бы отправить сообщение как будто от второго.
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select to authenticated using (public.is_member());

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert to authenticated
  with check (public.is_member() and author_id = auth.uid());

-- Отметку о прочтении ставит получатель, а не автор: свои сообщения
-- «прочитанными» не делают. Текст при этом не трогается — политика
-- разрешает менять только чужие строки, а сам текст меняться не может,
-- потому что править сообщения приложение не умеет вовсе.
drop policy if exists messages_update on public.messages;
create policy messages_update on public.messages
  for update to authenticated
  using (public.is_member() and author_id <> auth.uid())
  with check (public.is_member() and author_id <> auth.uid());

-- Удалять можно только своё.
drop policy if exists messages_delete on public.messages;
create policy messages_delete on public.messages
  for delete to authenticated
  using (public.is_member() and author_id = auth.uid());


-- -----------------------------------------------------------------------------
-- 2. Живая доставка
-- -----------------------------------------------------------------------------
-- Без этой строки чат работал бы только по обновлению страницы. Публикация
-- supabase_realtime — это список таблиц, об изменениях в которых Supabase
-- рассказывает подключённым браузерам.
--
-- Правила доступа при этом продолжают действовать: подписчику приходят
-- только те строки, которые он и так имел бы право прочитать.

do $$
begin
  alter publication supabase_realtime add table public.messages;
exception
  when duplicate_object then null;  -- уже добавлена, повторный запуск
  when undefined_object then null;  -- публикации нет — realtime выключен
end
$$;


-- -----------------------------------------------------------------------------
-- 3. Уведомления о сообщениях
-- -----------------------------------------------------------------------------
-- Своим переключателем: чат — единственное место, где уведомление и есть
-- весь смысл. Выключив, скажем, уведомления о фото, человек не должен
-- заодно перестать узнавать о сообщениях.

alter table public.notification_settings
  add column if not exists chat boolean not null default true;

create or replace function public.partner_push_targets(kind text)
returns table (endpoint text, p256dh text, auth text)
language sql
stable
security definer
set search_path = public
as $$
  select s.endpoint, s.p256dh, s.auth
  from public.push_subscriptions s
  join public.notification_settings n on n.user_id = s.user_id
  where public.is_member()
    and s.user_id <> auth.uid()
    and case kind
      when 'photos'   then n.photos
      when 'diary'    then n.diary
      when 'games'    then n.games
      when 'dates'    then n.dates
      when 'daily'    then n.daily_question
      when 'thoughts' then n.thoughts
      when 'chat'     then n.chat
      else false
    end
    -- Тихие часы. Если начало больше конца, промежуток проходит через полночь.
    and (
      n.quiet_from is null or n.quiet_to is null
      or case
        when n.quiet_from < n.quiet_to
          then extract(hour from now()) not between n.quiet_from and n.quiet_to - 1
        else extract(hour from now()) < n.quiet_from
             and extract(hour from now()) >= n.quiet_to
      end
    );
$$;

revoke all on function public.partner_push_targets(text) from public;
grant execute on function public.partner_push_targets(text) to authenticated;


-- ------------------------------------------------------------
-- migrations/0017_hearts.sql
-- ------------------------------------------------------------

-- =============================================================================
-- Our Space — «Сердечный бой»
-- =============================================================================
-- Как применить: Supabase → SQL Editor → New query → вставить целиком → Run.
-- Скрипт безопасно запускать повторно.
--
-- Морской бой, только вместо кораблей сердца. Поле 5×5, у каждого пять
-- сердец. Попал — ходишь ещё раз, промахнулся — ход переходит. Побеждает
-- тот, кто первым разобьёт все пять чужих.
--
-- Главная сложность здесь не в правилах, а в тайне: где стоят сердца,
-- второй знать не должен. Правила доступа работают со строками целиком,
-- поэтому расстановка живёт отдельной таблицей, которую видит только
-- её хозяин, а проверку попадания делает сама база.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Партии
-- -----------------------------------------------------------------------------
create table if not exists public.hearts_games (
  id          uuid primary key default gen_random_uuid(),
  -- Кто позвал играть и кто второй. Игроков всего двое, поэтому оба
  -- известны сразу, в момент создания партии.
  a_id        uuid not null references public.profiles (id) on delete cascade,
  b_id        uuid not null references public.profiles (id) on delete cascade,
  -- Чей сейчас ход. Пусто, пока не расставились оба.
  turn        uuid references public.profiles (id) on delete set null,
  winner      uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  finished_at timestamptz,

  constraint hearts_games_two_players check (a_id <> b_id)
);

create index if not exists hearts_games_open_idx
  on public.hearts_games (created_at desc) where winner is null;


-- -----------------------------------------------------------------------------
-- 2. Расстановка — тайна каждого
-- -----------------------------------------------------------------------------
-- Клетки нумеруются подряд, 0..24: строка = idx / 5, столбец = idx % 5.
-- Хранить строку и столбец отдельно смысла нет, а проверок так меньше.
create table if not exists public.hearts_cells (
  game_id   uuid not null references public.hearts_games (id) on delete cascade,
  owner_id  uuid not null references public.profiles (id) on delete cascade,
  idx       smallint not null check (idx between 0 and 24),
  primary key (game_id, owner_id, idx)
);


-- -----------------------------------------------------------------------------
-- 3. Выстрелы — видны обоим
-- -----------------------------------------------------------------------------
-- Тут тайны нет: свои попадания видит стрелявший, чужие — тот, по чьему
-- полю стреляли. Само поле при этом по выстрелам не восстановить: видно
-- только то, куда уже сходили.
create table if not exists public.hearts_shots (
  game_id    uuid not null references public.hearts_games (id) on delete cascade,
  shooter_id uuid not null references public.profiles (id) on delete cascade,
  idx        smallint not null check (idx between 0 and 24),
  hit        boolean not null,
  created_at timestamptz not null default now(),
  primary key (game_id, shooter_id, idx)
);


-- -----------------------------------------------------------------------------
-- 4. Права доступа
-- -----------------------------------------------------------------------------
alter table public.hearts_games enable row level security;
alter table public.hearts_cells enable row level security;
alter table public.hearts_shots enable row level security;

-- Партии видны обоим, бросить может любой участник.
drop policy if exists hearts_games_select on public.hearts_games;
create policy hearts_games_select on public.hearts_games
  for select to authenticated using (public.is_member());

drop policy if exists hearts_games_delete on public.hearts_games;
create policy hearts_games_delete on public.hearts_games
  for delete to authenticated
  using (public.is_member() and (a_id = auth.uid() or b_id = auth.uid()));

-- Своя расстановка — только своя. Второму она не видна никогда:
-- ни во время партии, ни после неё.
drop policy if exists hearts_cells_select on public.hearts_cells;
create policy hearts_cells_select on public.hearts_cells
  for select to authenticated using (owner_id = auth.uid());

drop policy if exists hearts_shots_select on public.hearts_shots;
create policy hearts_shots_select on public.hearts_shots
  for select to authenticated using (public.is_member());

-- Политик на запись здесь намеренно нет ни у одной из трёх таблиц.
-- Всё меняется только функциями ниже: они и проверяют правила игры.
-- Без этого можно было бы, например, дописать себе сердце в клетку,
-- по которой уже выстрелили.


-- -----------------------------------------------------------------------------
-- 5. Начать партию
-- -----------------------------------------------------------------------------
create or replace function public.start_hearts_game()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_other uuid;
  v_id    uuid;
begin
  if not public.is_member() then
    raise exception 'нет доступа';
  end if;

  select p.id into v_other
    from public.profiles p
   where p.id <> auth.uid()
   limit 1;

  if v_other is null then
    raise exception 'второй игрок ещё не завёл профиль';
  end if;

  -- Две партии разом только запутают: поле одно, и ход один.
  if exists (select 1 from public.hearts_games g where g.winner is null) then
    raise exception 'одна партия уже идёт';
  end if;

  insert into public.hearts_games (a_id, b_id)
  values (auth.uid(), v_other)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.start_hearts_game() from public;
grant execute on function public.start_hearts_game() to authenticated;


-- -----------------------------------------------------------------------------
-- 6. Расставить сердца
-- -----------------------------------------------------------------------------
create or replace function public.place_hearts(game uuid, cells smallint[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game record;
begin
  if not public.is_member() then
    raise exception 'нет доступа';
  end if;

  select * into v_game from public.hearts_games g where g.id = game;

  if not found then raise exception 'партия не найдена'; end if;
  if v_game.winner is not null then raise exception 'партия окончена'; end if;

  if v_game.a_id <> auth.uid() and v_game.b_id <> auth.uid() then
    raise exception 'это не ваша партия';
  end if;

  if exists (
    select 1 from public.hearts_cells c
     where c.game_id = game and c.owner_id = auth.uid()
  ) then
    raise exception 'сердца уже расставлены';
  end if;

  if coalesce(array_length(cells, 1), 0) <> 5 then
    raise exception 'нужно ровно пять сердец';
  end if;

  if (select count(distinct i) from unnest(cells) as i) <> 5 then
    raise exception 'клетки повторяются';
  end if;

  if exists (select 1 from unnest(cells) as i where i < 0 or i > 24) then
    raise exception 'клетка вне поля';
  end if;

  insert into public.hearts_cells (game_id, owner_id, idx)
  select game, auth.uid(), i from unnest(cells) as i;

  -- Расставились оба — первый ход у того, кто закончил вторым: он только
  -- что был у экрана, а первый уже успел подождать.
  if (
    select count(distinct c.owner_id) from public.hearts_cells c
     where c.game_id = game
  ) = 2 then
    update public.hearts_games set turn = auth.uid() where id = game;
  end if;
end;
$$;

revoke all on function public.place_hearts(uuid, smallint[]) from public;
grant execute on function public.place_hearts(uuid, smallint[]) to authenticated;


-- -----------------------------------------------------------------------------
-- 7. Выстрел
-- -----------------------------------------------------------------------------
-- Проверку попадания делает база, а не приложение: чтобы проверить самому,
-- пришлось бы сначала прочитать чужую расстановку — а её-то и нельзя.
-- Наружу уходит только «попал или нет» по одной названной клетке.
create or replace function public.fire(game uuid, cell smallint)
returns table (hit boolean, finished boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game   record;
  v_target uuid;
  v_hit    boolean;
  v_left   integer;
begin
  if not public.is_member() then
    raise exception 'нет доступа';
  end if;

  select * into v_game from public.hearts_games g where g.id = game;

  if not found then raise exception 'партия не найдена'; end if;
  if v_game.winner is not null then raise exception 'партия окончена'; end if;
  if v_game.turn is distinct from auth.uid() then
    raise exception 'сейчас не ваш ход';
  end if;
  if cell < 0 or cell > 24 then raise exception 'клетка вне поля'; end if;

  v_target := case
    when v_game.a_id = auth.uid() then v_game.b_id
    else v_game.a_id
  end;

  if exists (
    select 1 from public.hearts_shots s
     where s.game_id = game and s.shooter_id = auth.uid() and s.idx = cell
  ) then
    raise exception 'сюда уже стреляли';
  end if;

  v_hit := exists (
    select 1 from public.hearts_cells c
     where c.game_id = game and c.owner_id = v_target and c.idx = cell
  );

  insert into public.hearts_shots (game_id, shooter_id, idx, hit)
  values (game, auth.uid(), cell, v_hit);

  -- Сколько чужих сердец ещё целы.
  select count(*) into v_left
    from public.hearts_cells c
   where c.game_id = game
     and c.owner_id = v_target
     and not exists (
       select 1 from public.hearts_shots s
        where s.game_id = game and s.shooter_id = auth.uid() and s.idx = c.idx
     );

  if v_left = 0 then
    update public.hearts_games
       set winner = auth.uid(), finished_at = now(), turn = null
     where id = game;

    return query select v_hit, true;
    return;
  end if;

  -- Попал — стреляешь ещё раз, как в морском бою. Промахнулся — ход чужой.
  if not v_hit then
    update public.hearts_games set turn = v_target where id = game;
  end if;

  return query select v_hit, false;
end;
$$;

revoke all on function public.fire(uuid, smallint) from public;
grant execute on function public.fire(uuid, smallint) to authenticated;


-- -----------------------------------------------------------------------------
-- 8. Живая доставка
-- -----------------------------------------------------------------------------
-- Чтобы ход второго появлялся сам, без обновления страницы. Расстановку
-- сюда не добавляем вовсе: чем меньше тайна ходит по проводам, тем лучше.
do $$
begin
  alter publication supabase_realtime add table public.hearts_games;
exception when duplicate_object then null; when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.hearts_shots;
exception when duplicate_object then null; when undefined_object then null;
end $$;


-- ------------------------------------------------------------
-- migrations/0018_remove_never.sql
-- ------------------------------------------------------------

-- =============================================================================
-- Our Space — убрать игру «Я никогда не»
-- =============================================================================
-- Как применить: Supabase → SQL Editor → New query → вставить целиком → Run.
-- Скрипт безопасно запускать повторно.
--
-- ВНИМАНИЕ: это удаление данных, и вернуть их будет нечем.
-- Вместе с набором уходят все его вопросы — и встроенные, и написанные
-- вами, — а вместе с вопросами и ответы на них. Так устроены связи между
-- таблицами: вопрос без набора и ответ без вопроса не имеют смысла.
--
-- Ответы на вопрос дня это НЕ затрагивает: у них другой набор.
-- =============================================================================

delete from public.question_packs where slug = 'never';

-- Столбец answers.choice («никогда» / «было») остаётся на месте.
-- Он больше ничем не заполняется, но удалять столбец ради этого не стоит:
-- операция необратимая, а пустой столбец не мешает ничему.


-- ------------------------------------------------------------
-- migrations/0019_hearts_smaller.sql
-- ------------------------------------------------------------

-- =============================================================================
-- Our Space — поле «Сердечного боя» поменьше
-- =============================================================================
-- Как применить: Supabase → SQL Editor → New query → вставить целиком → Run.
-- Скрипт безопасно запускать повторно.
--
-- Было 5×5 и пять сердец, стало 4×4 и четыре. Двадцать пять клеток на
-- четверых искать долго: попадание случалось в одном случае из пяти, и
-- партия растягивалась. На шестнадцати клетках попадает каждый четвёртый
-- выстрел, и партия укладывается в один вечер.
--
-- ВНИМАНИЕ: незаконченные партии удаляются. Их расстановка сделана по
-- старым правилам, и на новом поле половина сердец оказалась бы за краем.
-- =============================================================================

delete from public.hearts_games;


-- -----------------------------------------------------------------------------
-- 1. Новые границы поля
-- -----------------------------------------------------------------------------
-- Postgres называет такие проверки по образцу «таблица_столбец_check».
alter table public.hearts_cells
  drop constraint if exists hearts_cells_idx_check;
alter table public.hearts_cells
  add constraint hearts_cells_idx_check check (idx between 0 and 15);

alter table public.hearts_shots
  drop constraint if exists hearts_shots_idx_check;
alter table public.hearts_shots
  add constraint hearts_shots_idx_check check (idx between 0 and 15);


-- -----------------------------------------------------------------------------
-- 2. Расстановка: четыре сердца вместо пяти
-- -----------------------------------------------------------------------------
create or replace function public.place_hearts(game uuid, cells smallint[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game record;
begin
  if not public.is_member() then
    raise exception 'нет доступа';
  end if;

  select * into v_game from public.hearts_games g where g.id = game;

  if not found then raise exception 'партия не найдена'; end if;
  if v_game.winner is not null then raise exception 'партия окончена'; end if;

  if v_game.a_id <> auth.uid() and v_game.b_id <> auth.uid() then
    raise exception 'это не ваша партия';
  end if;

  if exists (
    select 1 from public.hearts_cells c
     where c.game_id = game and c.owner_id = auth.uid()
  ) then
    raise exception 'сердца уже расставлены';
  end if;

  if coalesce(array_length(cells, 1), 0) <> 4 then
    raise exception 'нужно ровно четыре сердца';
  end if;

  if (select count(distinct i) from unnest(cells) as i) <> 4 then
    raise exception 'клетки повторяются';
  end if;

  if exists (select 1 from unnest(cells) as i where i < 0 or i > 15) then
    raise exception 'клетка вне поля';
  end if;

  insert into public.hearts_cells (game_id, owner_id, idx)
  select game, auth.uid(), i from unnest(cells) as i;

  -- Расставились оба — первый ход у того, кто закончил вторым: он только
  -- что был у экрана, а первый уже успел подождать.
  if (
    select count(distinct c.owner_id) from public.hearts_cells c
     where c.game_id = game
  ) = 2 then
    update public.hearts_games set turn = auth.uid() where id = game;
  end if;
end;
$$;

revoke all on function public.place_hearts(uuid, smallint[]) from public;
grant execute on function public.place_hearts(uuid, smallint[]) to authenticated;


-- -----------------------------------------------------------------------------
-- 3. Выстрел по новому полю
-- -----------------------------------------------------------------------------
-- Отличие от прежней версии только в границе клетки. Функция переписана
-- целиком, потому что менять её по частям Postgres не умеет.
create or replace function public.fire(game uuid, cell smallint)
returns table (hit boolean, finished boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game   record;
  v_target uuid;
  v_hit    boolean;
  v_left   integer;
begin
  if not public.is_member() then
    raise exception 'нет доступа';
  end if;

  select * into v_game from public.hearts_games g where g.id = game;

  if not found then raise exception 'партия не найдена'; end if;
  if v_game.winner is not null then raise exception 'партия окончена'; end if;
  if v_game.turn is distinct from auth.uid() then
    raise exception 'сейчас не ваш ход';
  end if;
  if cell < 0 or cell > 15 then raise exception 'клетка вне поля'; end if;

  v_target := case
    when v_game.a_id = auth.uid() then v_game.b_id
    else v_game.a_id
  end;

  if exists (
    select 1 from public.hearts_shots s
     where s.game_id = game and s.shooter_id = auth.uid() and s.idx = cell
  ) then
    raise exception 'сюда уже стреляли';
  end if;

  v_hit := exists (
    select 1 from public.hearts_cells c
     where c.game_id = game and c.owner_id = v_target and c.idx = cell
  );

  insert into public.hearts_shots (game_id, shooter_id, idx, hit)
  values (game, auth.uid(), cell, v_hit);

  -- Сколько чужих сердец ещё целы.
  select count(*) into v_left
    from public.hearts_cells c
   where c.game_id = game
     and c.owner_id = v_target
     and not exists (
       select 1 from public.hearts_shots s
        where s.game_id = game and s.shooter_id = auth.uid() and s.idx = c.idx
     );

  if v_left = 0 then
    update public.hearts_games
       set winner = auth.uid(), finished_at = now(), turn = null
     where id = game;

    return query select v_hit, true;
    return;
  end if;

  -- Попал — стреляешь ещё раз, как в морском бою. Промахнулся — ход чужой.
  if not v_hit then
    update public.hearts_games set turn = v_target where id = game;
  end if;

  return query select v_hit, false;
end;
$$;

revoke all on function public.fire(uuid, smallint) from public;
grant execute on function public.fire(uuid, smallint) to authenticated;


-- ------------------------------------------------------------
-- migrations/0021_hearts_salvo.sql
-- ------------------------------------------------------------

-- =============================================================================
-- Our Space — «Сердечный бой» залпами
-- =============================================================================
-- Как применить: Supabase → SQL Editor → New query → вставить целиком → Run.
-- Скрипт безопасно запускать повторно.
--
-- Было: один выстрел за ход, и после каждого нужно ждать второго. На поле
-- 4×4 это до пятнадцати ожиданий за партию — играть приходилось неделю.
--
-- Стало: за ход выбираются сразу четыре клетки и отправляются залпом.
-- Ответ приходит целиком: по каким попал, по каким мимо. Партия
-- укладывается примерно в четыре обмена вместо полутора десятков.
--
-- Правило «попал — стреляешь ещё раз» убрано: оно теряет смысл, когда
-- за ход и так стреляешь четырежды.
--
-- Этот скрипт самодостаточен: он приводит поле к 4×4 сам, поэтому
-- миграцию 0019 применять отдельно уже не нужно.
--
-- ВНИМАНИЕ: незаконченные партии удаляются — они играются по старым
-- правилам, и продолжать их на новых нечем.
-- =============================================================================

delete from public.hearts_games;


-- -----------------------------------------------------------------------------
-- 1. Поле 4×4
-- -----------------------------------------------------------------------------
-- Повторяет 0019 на случай, если она не применялась. Если применялась —
-- проверки просто пересоздаются теми же.
alter table public.hearts_cells
  drop constraint if exists hearts_cells_idx_check;
alter table public.hearts_cells
  add constraint hearts_cells_idx_check check (idx between 0 and 15);

alter table public.hearts_shots
  drop constraint if exists hearts_shots_idx_check;
alter table public.hearts_shots
  add constraint hearts_shots_idx_check check (idx between 0 and 15);


-- -----------------------------------------------------------------------------
-- 2. Расстановка: четыре сердца
-- -----------------------------------------------------------------------------
create or replace function public.place_hearts(game uuid, cells smallint[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game record;
begin
  if not public.is_member() then
    raise exception 'нет доступа';
  end if;

  select * into v_game from public.hearts_games g where g.id = game;

  if not found then raise exception 'партия не найдена'; end if;
  if v_game.winner is not null then raise exception 'партия окончена'; end if;

  if v_game.a_id <> auth.uid() and v_game.b_id <> auth.uid() then
    raise exception 'это не ваша партия';
  end if;

  if exists (
    select 1 from public.hearts_cells c
     where c.game_id = game and c.owner_id = auth.uid()
  ) then
    raise exception 'сердца уже расставлены';
  end if;

  if coalesce(array_length(cells, 1), 0) <> 4 then
    raise exception 'нужно ровно четыре сердца';
  end if;

  if (select count(distinct i) from unnest(cells) as i) <> 4 then
    raise exception 'клетки повторяются';
  end if;

  if exists (select 1 from unnest(cells) as i where i < 0 or i > 15) then
    raise exception 'клетка вне поля';
  end if;

  insert into public.hearts_cells (game_id, owner_id, idx)
  select game, auth.uid(), i from unnest(cells) as i;

  -- Расставились оба — первый залп за тем, кто закончил вторым:
  -- он только что был у экрана, а первый уже успел подождать.
  if (
    select count(distinct c.owner_id) from public.hearts_cells c
     where c.game_id = game
  ) = 2 then
    update public.hearts_games set turn = auth.uid() where id = game;
  end if;
end;
$$;

revoke all on function public.place_hearts(uuid, smallint[]) from public;
grant execute on function public.place_hearts(uuid, smallint[]) to authenticated;


-- -----------------------------------------------------------------------------
-- 3. Залп
-- -----------------------------------------------------------------------------
-- Возвращает по строке на каждую клетку залпа: куда попал, куда мимо.
-- Проверку по-прежнему делает база: чтобы посчитать попадания самому,
-- пришлось бы прочитать чужую расстановку, а её читать нельзя.
--
-- Ход после залпа переходит всегда — независимо от попаданий.
create or replace function public.fire_salvo(game uuid, cells smallint[])
returns table (idx smallint, hit boolean, finished boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game   record;
  v_target uuid;
  v_free   integer;
  v_want   integer;
  v_left   integer;
  v_over   boolean := false;
begin
  if not public.is_member() then
    raise exception 'нет доступа';
  end if;

  select * into v_game from public.hearts_games g where g.id = game;

  if not found then raise exception 'партия не найдена'; end if;
  if v_game.winner is not null then raise exception 'партия окончена'; end if;
  if v_game.turn is distinct from auth.uid() then
    raise exception 'сейчас не ваш ход';
  end if;

  v_target := case
    when v_game.a_id = auth.uid() then v_game.b_id
    else v_game.a_id
  end;

  v_want := coalesce(array_length(cells, 1), 0);

  if v_want = 0 then raise exception 'не выбрано ни одной клетки'; end if;

  if (select count(distinct i) from unnest(cells) as i) <> v_want then
    raise exception 'клетки повторяются';
  end if;

  if exists (select 1 from unnest(cells) as i where i < 0 or i > 15) then
    raise exception 'клетка вне поля';
  end if;

  if exists (
    select 1 from unnest(cells) as i
     where exists (
       select 1 from public.hearts_shots s
        where s.game_id = game and s.shooter_id = auth.uid() and s.idx = i
     )
  ) then
    raise exception 'по такой клетке уже стреляли';
  end if;

  -- Сколько клеток вообще осталось нетронутыми. В конце партии их может
  -- быть меньше четырёх — тогда залп короче, и это нормально.
  select 16 - count(*) into v_free
    from public.hearts_shots s
   where s.game_id = game and s.shooter_id = auth.uid();

  if v_want <> least(4, v_free) then
    raise exception 'в залпе должно быть % клеток', least(4, v_free);
  end if;

  insert into public.hearts_shots (game_id, shooter_id, idx, hit)
  select
    game,
    auth.uid(),
    i,
    exists (
      select 1 from public.hearts_cells c
       where c.game_id = game and c.owner_id = v_target and c.idx = i
    )
  from unnest(cells) as i;

  -- Сколько чужих сердец ещё целы.
  select count(*) into v_left
    from public.hearts_cells c
   where c.game_id = game
     and c.owner_id = v_target
     and not exists (
       select 1 from public.hearts_shots s
        where s.game_id = game and s.shooter_id = auth.uid() and s.idx = c.idx
     );

  if v_left = 0 then
    v_over := true;
    update public.hearts_games
       set winner = auth.uid(), finished_at = now(), turn = null
     where id = game;
  else
    update public.hearts_games set turn = v_target where id = game;
  end if;

  return query
    select s.idx, s.hit, v_over
      from public.hearts_shots s
     where s.game_id = game
       and s.shooter_id = auth.uid()
       and s.idx = any(cells);
end;
$$;

revoke all on function public.fire_salvo(uuid, smallint[]) from public;
grant execute on function public.fire_salvo(uuid, smallint[]) to authenticated;


-- -----------------------------------------------------------------------------
-- 4. Одиночный выстрел больше не нужен
-- -----------------------------------------------------------------------------
drop function if exists public.fire(uuid, smallint);


-- ------------------------------------------------------------
-- migrations/0022_who.sql
-- ------------------------------------------------------------

-- =============================================================================
-- Our Space — игра «Кто из нас?»
-- =============================================================================
-- Как применить: Supabase → SQL Editor → New query → вставить целиком → Run.
-- Скрипт безопасно запускать повторно.
--
-- Утверждение вроде «кто из нас чаще опаздывает». Оба втайне показывают
-- на одного из двоих. Ответы открываются, только когда ответили оба.
--
-- Ключевое решение: ответ хранится не как «я» или «ты», а как ссылка на
-- конкретного человека. Иначе «я» одного и «ты» второго — это один и тот
-- же выбор, и сравнивать их пришлось бы через переворот. С прямой ссылкой
-- совпадение — это просто равенство.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Утверждения
-- -----------------------------------------------------------------------------
-- created_by пустой у встроенных: по нему же политика не даёт их удалить.
create table if not exists public.who_statements (
  id         uuid primary key default gen_random_uuid(),
  body       text not null check (char_length(body) between 3 and 200),
  created_by uuid references public.profiles (id) on delete set null,
  position   integer not null default 100,
  created_at timestamptz not null default now()
);

create index if not exists who_statements_order_idx
  on public.who_statements (position, created_at);


-- -----------------------------------------------------------------------------
-- 2. Ответы
-- -----------------------------------------------------------------------------
create table if not exists public.who_answers (
  statement_id uuid not null references public.who_statements (id) on delete cascade,
  author_id    uuid not null references public.profiles (id) on delete cascade,
  -- На кого показали. Не «я/ты», а именно человек — см. пояснение выше.
  pick         uuid not null references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (statement_id, author_id)
);


-- -----------------------------------------------------------------------------
-- 3. Когда чужой ответ можно показать
-- -----------------------------------------------------------------------------
-- security definer нужен, потому что политика таблицы who_answers
-- обращается к самой who_answers. Без обхода RLS вышла бы бесконечная
-- рекурсия — та же причина, что у has_answered в вопросе дня.
create or replace function public.who_answered(statement uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.who_answers a
     where a.statement_id = statement and a.author_id = auth.uid()
  );
$$;

revoke all on function public.who_answered(uuid) from public;
grant execute on function public.who_answered(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- 4. Права доступа
-- -----------------------------------------------------------------------------
alter table public.who_statements enable row level security;
alter table public.who_answers    enable row level security;

drop policy if exists who_statements_select on public.who_statements;
create policy who_statements_select on public.who_statements
  for select to authenticated using (public.is_member());

drop policy if exists who_statements_insert on public.who_statements;
create policy who_statements_insert on public.who_statements
  for insert to authenticated
  with check (public.is_member() and created_by = auth.uid());

-- Удалить можно только своё. У встроенных автора нет, поэтому под это
-- условие они не подходят никогда.
drop policy if exists who_statements_delete on public.who_statements;
create policy who_statements_delete on public.who_statements
  for delete to authenticated using (created_by = auth.uid());

-- Свой ответ виден всегда, чужой — только после своего.
drop policy if exists who_answers_select on public.who_answers;
create policy who_answers_select on public.who_answers
  for select to authenticated using (
    public.is_member()
    and (author_id = auth.uid() or public.who_answered(statement_id))
  );

drop policy if exists who_answers_insert on public.who_answers;
create policy who_answers_insert on public.who_answers
  for insert to authenticated
  with check (public.is_member() and author_id = auth.uid());

-- Передумать можно, пока не ответил второй — но это уже вопрос совести,
-- а не базы: своё менять разрешено.
drop policy if exists who_answers_update on public.who_answers;
create policy who_answers_update on public.who_answers
  for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());


-- -----------------------------------------------------------------------------
-- 5. Готовые утверждения
-- -----------------------------------------------------------------------------
-- Все безличные: «кто чаще опаздывает» одинаково верно про обоих, и род
-- нигде не всплывает. Свои утверждения добавляются прямо в игре.
insert into public.who_statements (body, position)
select v.body, v.position
from (values
  ('Кто из нас чаще опаздывает?', 10),
  ('Кто первым говорит «прости»?', 20),
  ('Кто дольше выбирает, что заказать?', 30),
  ('Кто засыпает первым?', 40),
  ('Кто чаще теряет вещи?', 50),
  ('Кто дольше собирается?', 60),
  ('Кто чаще пишет первым?', 70),
  ('Кто упрямее?', 80),
  ('Кто быстрее прощает?', 90),
  ('Кто больше боится щекотки?', 100),
  ('Кто чаще смеётся над своими же шутками?', 110),
  ('Кто лучше помнит наши даты?', 120)
) as v(body, position)
where not exists (
  select 1 from public.who_statements s where s.body = v.body
);


-- ------------------------------------------------------------
-- migrations/0023_drawing_orders.sql
-- ------------------------------------------------------------

-- =============================================================================
-- Our Space — «Заказ» в рисовашках
-- =============================================================================
-- Как применить: Supabase → SQL Editor → New query → вставить целиком → Run.
-- Скрипт безопасно запускать повторно.
--
-- Второй режим игры. В прежнем задание даёт приложение, рисующий его прячет,
-- а второй угадывает. Здесь наоборот: задание придумываете вы сами и вслух,
-- второй рисует по нему, а вы ставите оценку от 1 до 10.
--
-- Тайны тут нет вовсе — задание обязано быть видно тому, кто рисует. Поэтому
-- и отдельной таблицы для секрета не нужно, всё лежит в одной строке.
--
-- Отдельная таблица, а не drawing_rounds: там и автор, и файл обязательны
-- с самого начала, а заказ рождается, когда рисунка ещё нет.
-- =============================================================================

create table if not exists public.drawing_orders (
  id           uuid primary key default gen_random_uuid(),
  -- Кто заказал. Рисует всегда второй — их всего двое, выбирать не из кого.
  ordered_by   uuid not null references public.profiles (id) on delete cascade,
  task         text not null check (char_length(task) between 2 and 200),

  -- Появляется, когда нарисовали.
  storage_path text,
  drawn_at     timestamptz,

  -- Оценку ставит заказчик, и только после того, как нарисовано.
  score        smallint check (score between 1 and 10),
  scored_at    timestamptz,

  created_at   timestamptz not null default now()
);

create index if not exists drawing_orders_created_idx
  on public.drawing_orders (created_at desc);

alter table public.drawing_orders enable row level security;

-- Видно обоим: задание — это и есть суть заказа, прятать нечего.
drop policy if exists drawing_orders_select on public.drawing_orders;
create policy drawing_orders_select on public.drawing_orders
  for select to authenticated using (public.is_member());

drop policy if exists drawing_orders_insert on public.drawing_orders;
create policy drawing_orders_insert on public.drawing_orders
  for insert to authenticated
  with check (public.is_member() and ordered_by = auth.uid());

-- Убрать заказ может тот, кто его дал.
drop policy if exists drawing_orders_delete on public.drawing_orders;
create policy drawing_orders_delete on public.drawing_orders
  for delete to authenticated
  using (public.is_member() and ordered_by = auth.uid());

-- Политики на изменение нет намеренно: правила «рисует не заказчик» и
-- «оценивает только заказчик» касаются отдельных столбцов, а правила
-- доступа работают со строкой целиком. Всё меняют функции ниже.


-- -----------------------------------------------------------------------------
-- Рисунок к заказу
-- -----------------------------------------------------------------------------
create or replace function public.submit_order_drawing(
  order_id uuid,
  key text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
begin
  if not public.is_member() then
    raise exception 'нет доступа';
  end if;

  select * into v_order from public.drawing_orders o where o.id = order_id;

  if not found then raise exception 'заказ не найден'; end if;

  if v_order.ordered_by = auth.uid() then
    raise exception 'свой заказ рисует второй';
  end if;

  if v_order.storage_path is not null then
    raise exception 'по этому заказу уже нарисовано';
  end if;

  if coalesce(btrim(key), '') = '' then
    raise exception 'рисунок не загружен';
  end if;

  update public.drawing_orders
     set storage_path = key, drawn_at = now()
   where id = order_id;
end;
$$;

revoke all on function public.submit_order_drawing(uuid, text) from public;
grant execute on function public.submit_order_drawing(uuid, text) to authenticated;


-- -----------------------------------------------------------------------------
-- Оценка
-- -----------------------------------------------------------------------------
create or replace function public.score_order(order_id uuid, value smallint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
begin
  if not public.is_member() then
    raise exception 'нет доступа';
  end if;

  select * into v_order from public.drawing_orders o where o.id = order_id;

  if not found then raise exception 'заказ не найден'; end if;

  if v_order.ordered_by <> auth.uid() then
    raise exception 'оценивает тот, кто заказывал';
  end if;

  if v_order.storage_path is null then
    raise exception 'ещё нечего оценивать';
  end if;

  if v_order.score is not null then
    raise exception 'оценка уже поставлена';
  end if;

  if value < 1 or value > 10 then
    raise exception 'оценка от 1 до 10';
  end if;

  update public.drawing_orders
     set score = value, scored_at = now()
   where id = order_id;
end;
$$;

revoke all on function public.score_order(uuid, smallint) from public;
grant execute on function public.score_order(uuid, smallint) to authenticated;
