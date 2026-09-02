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
