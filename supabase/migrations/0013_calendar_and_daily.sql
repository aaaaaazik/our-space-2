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
