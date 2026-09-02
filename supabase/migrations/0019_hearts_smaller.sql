-- =============================================================================
-- Our Space — поле «Сердечного боя» поменьше
-- =============================================================================
-- Как применить: Supabase → SQL Editor → New query → вставить целиком → Run.
-- Скрипт безопасно запускать повторно.
--
-- Было 5×5 и пять сердец, стало 4×4 и четыре. Двадцать пять клеток на
-- четверых искать долго: попадание случалось в одном случае из пяти, и
-- партия растягивалась. На шестнадцати клетках попадает каждый четвёртый
-- выстрел, и партия укладывается в один вечер.
--
-- ВНИМАНИЕ: незаконченные партии удаляются. Их расстановка сделана по
-- старым правилам, и на новом поле половина сердец оказалась бы за краем.
-- =============================================================================

delete from public.hearts_games;


-- -----------------------------------------------------------------------------
-- 1. Новые границы поля
-- -----------------------------------------------------------------------------
-- Postgres называет такие проверки по образцу «таблица_столбец_check».
alter table public.hearts_cells
  drop constraint if exists hearts_cells_idx_check;
alter table public.hearts_cells
  add constraint hearts_cells_idx_check check (idx between 0 and 15);

alter table public.hearts_shots
  drop constraint if exists hearts_shots_idx_check;
alter table public.hearts_shots
  add constraint hearts_shots_idx_check check (idx between 0 and 15);


-- -----------------------------------------------------------------------------
-- 2. Расстановка: четыре сердца вместо пяти
-- -----------------------------------------------------------------------------
create or replace function public.place_hearts(game uuid, cells smallint[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game record;
begin
  if not public.is_member() then
    raise exception 'нет доступа';
  end if;

  select * into v_game from public.hearts_games g where g.id = game;

  if not found then raise exception 'партия не найдена'; end if;
  if v_game.winner is not null then raise exception 'партия окончена'; end if;

  if v_game.a_id <> auth.uid() and v_game.b_id <> auth.uid() then
    raise exception 'это не ваша партия';
  end if;

  if exists (
    select 1 from public.hearts_cells c
     where c.game_id = game and c.owner_id = auth.uid()
  ) then
    raise exception 'сердца уже расставлены';
  end if;

  if coalesce(array_length(cells, 1), 0) <> 4 then
    raise exception 'нужно ровно четыре сердца';
  end if;

  if (select count(distinct i) from unnest(cells) as i) <> 4 then
    raise exception 'клетки повторяются';
  end if;

  if exists (select 1 from unnest(cells) as i where i < 0 or i > 15) then
    raise exception 'клетка вне поля';
  end if;

  insert into public.hearts_cells (game_id, owner_id, idx)
  select game, auth.uid(), i from unnest(cells) as i;

  -- Расставились оба — первый ход у того, кто закончил вторым: он только
  -- что был у экрана, а первый уже успел подождать.
  if (
    select count(distinct c.owner_id) from public.hearts_cells c
     where c.game_id = game
  ) = 2 then
    update public.hearts_games set turn = auth.uid() where id = game;
  end if;
end;
$$;

revoke all on function public.place_hearts(uuid, smallint[]) from public;
grant execute on function public.place_hearts(uuid, smallint[]) to authenticated;


-- -----------------------------------------------------------------------------
-- 3. Выстрел по новому полю
-- -----------------------------------------------------------------------------
-- Отличие от прежней версии только в границе клетки. Функция переписана
-- целиком, потому что менять её по частям Postgres не умеет.
create or replace function public.fire(game uuid, cell smallint)
returns table (hit boolean, finished boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game   record;
  v_target uuid;
  v_hit    boolean;
  v_left   integer;
begin
  if not public.is_member() then
    raise exception 'нет доступа';
  end if;

  select * into v_game from public.hearts_games g where g.id = game;

  if not found then raise exception 'партия не найдена'; end if;
  if v_game.winner is not null then raise exception 'партия окончена'; end if;
  if v_game.turn is distinct from auth.uid() then
    raise exception 'сейчас не ваш ход';
  end if;
  if cell < 0 or cell > 15 then raise exception 'клетка вне поля'; end if;

  v_target := case
    when v_game.a_id = auth.uid() then v_game.b_id
    else v_game.a_id
  end;

  if exists (
    select 1 from public.hearts_shots s
     where s.game_id = game and s.shooter_id = auth.uid() and s.idx = cell
  ) then
    raise exception 'сюда уже стреляли';
  end if;

  v_hit := exists (
    select 1 from public.hearts_cells c
     where c.game_id = game and c.owner_id = v_target and c.idx = cell
  );

  insert into public.hearts_shots (game_id, shooter_id, idx, hit)
  values (game, auth.uid(), cell, v_hit);

  -- Сколько чужих сердец ещё целы.
  select count(*) into v_left
    from public.hearts_cells c
   where c.game_id = game
     and c.owner_id = v_target
     and not exists (
       select 1 from public.hearts_shots s
        where s.game_id = game and s.shooter_id = auth.uid() and s.idx = c.idx
     );

  if v_left = 0 then
    update public.hearts_games
       set winner = auth.uid(), finished_at = now(), turn = null
     where id = game;

    return query select v_hit, true;
    return;
  end if;

  -- Попал — стреляешь ещё раз, как в морском бою. Промахнулся — ход чужой.
  if not v_hit then
    update public.hearts_games set turn = v_target where id = game;
  end if;

  return query select v_hit, false;
end;
$$;

revoke all on function public.fire(uuid, smallint) from public;
grant execute on function public.fire(uuid, smallint) to authenticated;
