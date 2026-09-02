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
