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
