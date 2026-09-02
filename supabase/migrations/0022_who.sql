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
