-- =============================================================================
-- Our Space — «Сердечный бой»
-- =============================================================================
-- Как применить: Supabase → SQL Editor → New query → вставить целиком → Run.
-- Скрипт безопасно запускать повторно.
--
-- Морской бой, только вместо кораблей сердца. Поле 5×5, у каждого пять
-- сердец. Попал — ходишь ещё раз, промахнулся — ход переходит. Побеждает
-- тот, кто первым разобьёт все пять чужих.
--
-- Главная сложность здесь не в правилах, а в тайне: где стоят сердца,
-- второй знать не должен. Правила доступа работают со строками целиком,
-- поэтому расстановка живёт отдельной таблицей, которую видит только
-- её хозяин, а проверку попадания делает сама база.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Партии
-- -----------------------------------------------------------------------------
create table if not exists public.hearts_games (
  id          uuid primary key default gen_random_uuid(),
  -- Кто позвал играть и кто второй. Игроков всего двое, поэтому оба
  -- известны сразу, в момент создания партии.
  a_id        uuid not null references public.profiles (id) on delete cascade,
  b_id        uuid not null references public.profiles (id) on delete cascade,
  -- Чей сейчас ход. Пусто, пока не расставились оба.
  turn        uuid references public.profiles (id) on delete set null,
  winner      uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  finished_at timestamptz,

  constraint hearts_games_two_players check (a_id <> b_id)
);

create index if not exists hearts_games_open_idx
  on public.hearts_games (created_at desc) where winner is null;


-- -----------------------------------------------------------------------------
-- 2. Расстановка — тайна каждого
-- -----------------------------------------------------------------------------
-- Клетки нумеруются подряд, 0..24: строка = idx / 5, столбец = idx % 5.
-- Хранить строку и столбец отдельно смысла нет, а проверок так меньше.
create table if not exists public.hearts_cells (
  game_id   uuid not null references public.hearts_games (id) on delete cascade,
  owner_id  uuid not null references public.profiles (id) on delete cascade,
  idx       smallint not null check (idx between 0 and 24),
  primary key (game_id, owner_id, idx)
);


-- -----------------------------------------------------------------------------
-- 3. Выстрелы — видны обоим
-- -----------------------------------------------------------------------------
-- Тут тайны нет: свои попадания видит стрелявший, чужие — тот, по чьему
-- полю стреляли. Само поле при этом по выстрелам не восстановить: видно
-- только то, куда уже сходили.
create table if not exists public.hearts_shots (
  game_id    uuid not null references public.hearts_games (id) on delete cascade,
  shooter_id uuid not null references public.profiles (id) on delete cascade,
  idx        smallint not null check (idx between 0 and 24),
  hit        boolean not null,
  created_at timestamptz not null default now(),
  primary key (game_id, shooter_id, idx)
);


-- -----------------------------------------------------------------------------
-- 4. Права доступа
-- -----------------------------------------------------------------------------
alter table public.hearts_games enable row level security;
alter table public.hearts_cells enable row level security;
alter table public.hearts_shots enable row level security;

-- Партии видны обоим, бросить может любой участник.
drop policy if exists hearts_games_select on public.hearts_games;
create policy hearts_games_select on public.hearts_games
  for select to authenticated using (public.is_member());

drop policy if exists hearts_games_delete on public.hearts_games;
create policy hearts_games_delete on public.hearts_games
  for delete to authenticated
  using (public.is_member() and (a_id = auth.uid() or b_id = auth.uid()));

-- Своя расстановка — только своя. Второму она не видна никогда:
-- ни во время партии, ни после неё.
drop policy if exists hearts_cells_select on public.hearts_cells;
create policy hearts_cells_select on public.hearts_cells
  for select to authenticated using (owner_id = auth.uid());

drop policy if exists hearts_shots_select on public.hearts_shots;
create policy hearts_shots_select on public.hearts_shots
  for select to authenticated using (public.is_member());

-- Политик на запись здесь намеренно нет ни у одной из трёх таблиц.
-- Всё меняется только функциями ниже: они и проверяют правила игры.
-- Без этого можно было бы, например, дописать себе сердце в клетку,
-- по которой уже выстрелили.


-- -----------------------------------------------------------------------------
-- 5. Начать партию
-- -----------------------------------------------------------------------------
create or replace function public.start_hearts_game()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_other uuid;
  v_id    uuid;
begin
  if not public.is_member() then
    raise exception 'нет доступа';
  end if;

  select p.id into v_other
    from public.profiles p
   where p.id <> auth.uid()
   limit 1;

  if v_other is null then
    raise exception 'второй игрок ещё не завёл профиль';
  end if;

  -- Две партии разом только запутают: поле одно, и ход один.
  if exists (select 1 from public.hearts_games g where g.winner is null) then
    raise exception 'одна партия уже идёт';
  end if;

  insert into public.hearts_games (a_id, b_id)
  values (auth.uid(), v_other)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.start_hearts_game() from public;
grant execute on function public.start_hearts_game() to authenticated;


-- -----------------------------------------------------------------------------
-- 6. Расставить сердца
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

  if coalesce(array_length(cells, 1), 0) <> 5 then
    raise exception 'нужно ровно пять сердец';
  end if;

  if (select count(distinct i) from unnest(cells) as i) <> 5 then
    raise exception 'клетки повторяются';
  end if;

  if exists (select 1 from unnest(cells) as i where i < 0 or i > 24) then
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
-- 7. Выстрел
-- -----------------------------------------------------------------------------
-- Проверку попадания делает база, а не приложение: чтобы проверить самому,
-- пришлось бы сначала прочитать чужую расстановку — а её-то и нельзя.
-- Наружу уходит только «попал или нет» по одной названной клетке.
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
  if cell < 0 or cell > 24 then raise exception 'клетка вне поля'; end if;

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


-- -----------------------------------------------------------------------------
-- 8. Живая доставка
-- -----------------------------------------------------------------------------
-- Чтобы ход второго появлялся сам, без обновления страницы. Расстановку
-- сюда не добавляем вовсе: чем меньше тайна ходит по проводам, тем лучше.
do $$
begin
  alter publication supabase_realtime add table public.hearts_games;
exception when duplicate_object then null; when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.hearts_shots;
exception when duplicate_object then null; when undefined_object then null;
end $$;
