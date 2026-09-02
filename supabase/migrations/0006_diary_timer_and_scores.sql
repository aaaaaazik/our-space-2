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
