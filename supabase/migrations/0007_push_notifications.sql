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
