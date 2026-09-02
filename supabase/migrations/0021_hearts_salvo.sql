-- =============================================================================
-- Our Space — «Сердечный бой» залпами
-- =============================================================================
-- Как применить: Supabase → SQL Editor → New query → вставить целиком → Run.
-- Скрипт безопасно запускать повторно.
--
-- Было: один выстрел за ход, и после каждого нужно ждать второго. На поле
-- 4×4 это до пятнадцати ожиданий за партию — играть приходилось неделю.
--
-- Стало: за ход выбираются сразу четыре клетки и отправляются залпом.
-- Ответ приходит целиком: по каким попал, по каким мимо. Партия
-- укладывается примерно в четыре обмена вместо полутора десятков.
--
-- Правило «попал — стреляешь ещё раз» убрано: оно теряет смысл, когда
-- за ход и так стреляешь четырежды.
--
-- Этот скрипт самодостаточен: он приводит поле к 4×4 сам, поэтому
-- миграцию 0019 применять отдельно уже не нужно.
--
-- ВНИМАНИЕ: незаконченные партии удаляются — они играются по старым
-- правилам, и продолжать их на новых нечем.
-- =============================================================================

delete from public.hearts_games;


-- -----------------------------------------------------------------------------
-- 1. Поле 4×4
-- -----------------------------------------------------------------------------
-- Повторяет 0019 на случай, если она не применялась. Если применялась —
-- проверки просто пересоздаются теми же.
alter table public.hearts_cells
  drop constraint if exists hearts_cells_idx_check;
alter table public.hearts_cells
  add constraint hearts_cells_idx_check check (idx between 0 and 15);

alter table public.hearts_shots
  drop constraint if exists hearts_shots_idx_check;
alter table public.hearts_shots
  add constraint hearts_shots_idx_check check (idx between 0 and 15);


-- -----------------------------------------------------------------------------
-- 2. Расстановка: четыре сердца
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

  -- Расставились оба — первый залп за тем, кто закончил вторым:
  -- он только что был у экрана, а первый уже успел подождать.
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
-- 3. Залп
-- -----------------------------------------------------------------------------
-- Возвращает по строке на каждую клетку залпа: куда попал, куда мимо.
-- Проверку по-прежнему делает база: чтобы посчитать попадания самому,
-- пришлось бы прочитать чужую расстановку, а её читать нельзя.
--
-- Ход после залпа переходит всегда — независимо от попаданий.
create or replace function public.fire_salvo(game uuid, cells smallint[])
returns table (idx smallint, hit boolean, finished boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game   record;
  v_target uuid;
  v_free   integer;
  v_want   integer;
  v_left   integer;
  v_over   boolean := false;
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

  v_target := case
    when v_game.a_id = auth.uid() then v_game.b_id
    else v_game.a_id
  end;

  v_want := coalesce(array_length(cells, 1), 0);

  if v_want = 0 then raise exception 'не выбрано ни одной клетки'; end if;

  if (select count(distinct i) from unnest(cells) as i) <> v_want then
    raise exception 'клетки повторяются';
  end if;

  if exists (select 1 from unnest(cells) as i where i < 0 or i > 15) then
    raise exception 'клетка вне поля';
  end if;

  if exists (
    select 1 from unnest(cells) as i
     where exists (
       select 1 from public.hearts_shots s
        where s.game_id = game and s.shooter_id = auth.uid() and s.idx = i
     )
  ) then
    raise exception 'по такой клетке уже стреляли';
  end if;

  -- Сколько клеток вообще осталось нетронутыми. В конце партии их может
  -- быть меньше четырёх — тогда залп короче, и это нормально.
  select 16 - count(*) into v_free
    from public.hearts_shots s
   where s.game_id = game and s.shooter_id = auth.uid();

  if v_want <> least(4, v_free) then
    raise exception 'в залпе должно быть % клеток', least(4, v_free);
  end if;

  insert into public.hearts_shots (game_id, shooter_id, idx, hit)
  select
    game,
    auth.uid(),
    i,
    exists (
      select 1 from public.hearts_cells c
       where c.game_id = game and c.owner_id = v_target and c.idx = i
    )
  from unnest(cells) as i;

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
    v_over := true;
    update public.hearts_games
       set winner = auth.uid(), finished_at = now(), turn = null
     where id = game;
  else
    update public.hearts_games set turn = v_target where id = game;
  end if;

  return query
    select s.idx, s.hit, v_over
      from public.hearts_shots s
     where s.game_id = game
       and s.shooter_id = auth.uid()
       and s.idx = any(cells);
end;
$$;

revoke all on function public.fire_salvo(uuid, smallint[]) from public;
grant execute on function public.fire_salvo(uuid, smallint[]) to authenticated;


-- -----------------------------------------------------------------------------
-- 4. Одиночный выстрел больше не нужен
-- -----------------------------------------------------------------------------
drop function if exists public.fire(uuid, smallint);
