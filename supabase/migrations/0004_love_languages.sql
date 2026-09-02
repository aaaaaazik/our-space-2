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
