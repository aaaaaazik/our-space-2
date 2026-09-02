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
