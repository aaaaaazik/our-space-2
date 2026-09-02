-- =============================================================================
-- Our Space — «Заказ» в рисовашках
-- =============================================================================
-- Как применить: Supabase → SQL Editor → New query → вставить целиком → Run.
-- Скрипт безопасно запускать повторно.
--
-- Второй режим игры. В прежнем задание даёт приложение, рисующий его прячет,
-- а второй угадывает. Здесь наоборот: задание придумываете вы сами и вслух,
-- второй рисует по нему, а вы ставите оценку от 1 до 10.
--
-- Тайны тут нет вовсе — задание обязано быть видно тому, кто рисует. Поэтому
-- и отдельной таблицы для секрета не нужно, всё лежит в одной строке.
--
-- Отдельная таблица, а не drawing_rounds: там и автор, и файл обязательны
-- с самого начала, а заказ рождается, когда рисунка ещё нет.
-- =============================================================================

create table if not exists public.drawing_orders (
  id           uuid primary key default gen_random_uuid(),
  -- Кто заказал. Рисует всегда второй — их всего двое, выбирать не из кого.
  ordered_by   uuid not null references public.profiles (id) on delete cascade,
  task         text not null check (char_length(task) between 2 and 200),

  -- Появляется, когда нарисовали.
  storage_path text,
  drawn_at     timestamptz,

  -- Оценку ставит заказчик, и только после того, как нарисовано.
  score        smallint check (score between 1 and 10),
  scored_at    timestamptz,

  created_at   timestamptz not null default now()
);

create index if not exists drawing_orders_created_idx
  on public.drawing_orders (created_at desc);

alter table public.drawing_orders enable row level security;

-- Видно обоим: задание — это и есть суть заказа, прятать нечего.
drop policy if exists drawing_orders_select on public.drawing_orders;
create policy drawing_orders_select on public.drawing_orders
  for select to authenticated using (public.is_member());

drop policy if exists drawing_orders_insert on public.drawing_orders;
create policy drawing_orders_insert on public.drawing_orders
  for insert to authenticated
  with check (public.is_member() and ordered_by = auth.uid());

-- Убрать заказ может тот, кто его дал.
drop policy if exists drawing_orders_delete on public.drawing_orders;
create policy drawing_orders_delete on public.drawing_orders
  for delete to authenticated
  using (public.is_member() and ordered_by = auth.uid());

-- Политики на изменение нет намеренно: правила «рисует не заказчик» и
-- «оценивает только заказчик» касаются отдельных столбцов, а правила
-- доступа работают со строкой целиком. Всё меняют функции ниже.


-- -----------------------------------------------------------------------------
-- Рисунок к заказу
-- -----------------------------------------------------------------------------
create or replace function public.submit_order_drawing(
  order_id uuid,
  key text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
begin
  if not public.is_member() then
    raise exception 'нет доступа';
  end if;

  select * into v_order from public.drawing_orders o where o.id = order_id;

  if not found then raise exception 'заказ не найден'; end if;

  if v_order.ordered_by = auth.uid() then
    raise exception 'свой заказ рисует второй';
  end if;

  if v_order.storage_path is not null then
    raise exception 'по этому заказу уже нарисовано';
  end if;

  if coalesce(btrim(key), '') = '' then
    raise exception 'рисунок не загружен';
  end if;

  update public.drawing_orders
     set storage_path = key, drawn_at = now()
   where id = order_id;
end;
$$;

revoke all on function public.submit_order_drawing(uuid, text) from public;
grant execute on function public.submit_order_drawing(uuid, text) to authenticated;


-- -----------------------------------------------------------------------------
-- Оценка
-- -----------------------------------------------------------------------------
create or replace function public.score_order(order_id uuid, value smallint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
begin
  if not public.is_member() then
    raise exception 'нет доступа';
  end if;

  select * into v_order from public.drawing_orders o where o.id = order_id;

  if not found then raise exception 'заказ не найден'; end if;

  if v_order.ordered_by <> auth.uid() then
    raise exception 'оценивает тот, кто заказывал';
  end if;

  if v_order.storage_path is null then
    raise exception 'ещё нечего оценивать';
  end if;

  if v_order.score is not null then
    raise exception 'оценка уже поставлена';
  end if;

  if value < 1 or value > 10 then
    raise exception 'оценка от 1 до 10';
  end if;

  update public.drawing_orders
     set score = value, scored_at = now()
   where id = order_id;
end;
$$;

revoke all on function public.score_order(uuid, smallint) from public;
grant execute on function public.score_order(uuid, smallint) to authenticated;
