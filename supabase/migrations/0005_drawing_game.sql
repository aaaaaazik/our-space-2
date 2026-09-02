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
