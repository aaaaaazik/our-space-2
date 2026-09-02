"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import {
  abandonGame,
  fireSalvo,
  placeHearts,
  startGame,
  type HeartsState,
} from "@/app/(app)/games/hearts/actions";
import {
  CELL_FORMS,
  CELLS,
  HEART_FORMS,
  HEARTS,
  SALVO,
  SIZE,
} from "@/lib/games/hearts";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";
import { plural } from "@/lib/utils/plural";
import type { HeartsGame, HeartsShot } from "@/types/database";

export function HeartsRoom({
  game,
  myCells,
  shots,
  currentUserId,
  partnerName,
}: {
  game: HeartsGame | null;
  /** Свои клетки. Чужие сюда не приходят никогда. */
  myCells: number[];
  shots: HeartsShot[];
  currentUserId: string;
  partnerName: string;
}) {
  const router = useRouter();

  /*
    Имя канала уникально для каждой копии компонента.

    Supabase ищет канал по имени и переиспользует найденный. Если имя
    постоянное, вторая копия натыкается на уже подписанный канал и падает
    с «cannot add postgres_changes callbacks after subscribe()». В обычной
    жизни копия одна, но так эта ловушка закрыта совсем.
  */
  const [channelId] = useState(() => Math.random().toString(36).slice(2));

  // Ход второго должен появляться сам. Как и в чате, на любое изменение
  // просто перечитываем страницу: считать состояние партии в браузере
  // означало бы держать здесь копию правил, а они живут в базе.
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`hearts-${channelId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "hearts_games" },
        () => router.refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "hearts_shots" },
        () => router.refresh(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router, channelId]);

  if (!game) return <Start />;

  const iAmPlaced = myCells.length === HEARTS;
  const bothPlaced = game.turn !== null || game.winner !== null;

  if (!iAmPlaced) {
    return <Placement gameId={game.id} partnerName={partnerName} />;
  }

  if (!bothPlaced) {
    return (
      <Shell title="Сердца расставлены">
        {/*
          Имя всюду стоит в именительном падеже. Склонять его нельзя:
          в профиле может быть что угодно, хоть латиницей, и «очередь
          Хилола» читается как ошибка.
        */}
        <p className="mt-3 text-[15px] leading-relaxed text-text-muted">
          Ждём, пока {partnerName} расставит свои. Как только закончит —
          начнём, и первый ход будет за ней.
        </p>
        <Board
          cells={CELLS}
          render={(i) => ({
            content: myCells.includes(i) ? "❤️" : null,
            tone: "own",
          })}
        />
        <Abandon id={game.id} />
      </Shell>
    );
  }

  return (
    <Battle
      game={game}
      myCells={myCells}
      shots={shots}
      currentUserId={currentUserId}
      partnerName={partnerName}
    />
  );
}

/** Партии нет — предлагаем начать. */
function Start() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <Shell title="Сердечный бой">
      <p className="mt-3 text-[15px] leading-relaxed text-text-muted">
        Морской бой, только вместо кораблей сердца. Поле {SIZE} на {SIZE}, у
        каждого по {HEARTS} {plural(HEARTS, HEART_FORMS)}. За ход выбираются
        сразу {SALVO} {plural(SALVO, CELL_FORMS)} и отправляются залпом.
        Выигрывает тот, кто первым разобьёт все чужие.
      </p>

      <div className="mt-6">
        <Button
          size="lg"
          block
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await startGame();
              if (result.error) setError(result.error);
              else router.refresh();
            })
          }
        >
          {pending ? "Начинаем…" : "Начать партию"}
        </Button>

        {error && (
          <p role="status" className="mt-2 text-center text-[14px] text-danger">
            {error}
          </p>
        )}
      </div>
    </Shell>
  );
}

/** Расстановка: несколько нажатий по своему полю. */
function Placement({
  gameId,
  partnerName,
}: {
  gameId: string;
  partnerName: string;
}) {
  const router = useRouter();
  const [chosen, setChosen] = useState<number[]>([]);

  const [state, action, pending] = useActionState<HeartsState, FormData>(
    async (prev, formData) => {
      const result = await placeHearts(prev, formData);
      if (result.ok) router.refresh();
      return result;
    },
    {},
  );

  const left = HEARTS - chosen.length;

  function toggle(i: number) {
    setChosen((current) =>
      current.includes(i)
        ? current.filter((c) => c !== i)
        : current.length < HEARTS
          ? [...current, i]
          : current,
    );
  }

  return (
    <Shell title="Спрячьте сердца">
      <p className="mt-3 text-[15px] leading-relaxed text-text-muted">
        Нажмите на {HEARTS} {plural(HEARTS, CELL_FORMS)}. {partnerName} их не увидит — искать будет
        вслепую.
      </p>

      <Board
        cells={CELLS}
        onPick={toggle}
        render={(i) => ({
          content: chosen.includes(i) ? "❤️" : null,
          tone: chosen.includes(i) ? "own" : "idle",
        })}
      />

      <p className="mt-3 text-center text-[13px] text-text-muted">
        {left > 0
          ? `Осталось поставить ${left} ${plural(left, HEART_FORMS)}`
          : "Все на местах"}
      </p>

      <form action={action} className="mt-4">
        <input type="hidden" name="game" value={gameId} />
        <input type="hidden" name="cells" value={chosen.join(",")} />

        <Button
          type="submit"
          size="lg"
          block
          disabled={pending || chosen.length !== HEARTS}
        >
          {pending ? "Прячем…" : "Готово"}
        </Button>

        {state.error && (
          <p role="status" className="mt-2 text-center text-[14px] text-danger">
            {state.error}
          </p>
        )}
      </form>
    </Shell>
  );
}

/** Сама перестрелка: два поля друг под другом. */
function Battle({
  game,
  myCells,
  shots,
  currentUserId,
  partnerName,
}: {
  game: HeartsGame;
  myCells: number[];
  shots: HeartsShot[];
  currentUserId: string;
  partnerName: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const [sending, setSending] = useState(false);

  /*
    Свои выстрелы держим и здесь тоже.

    База возвращает результат залпа сразу, одним коротким ответом. Ждать,
    пока сервер перерисует страницу целиком, незачем: клетки меняются
    мгновенно, а сверка идёт следом, в фоне.
  */
  const [own, setOwn] = useState<Map<number, boolean | null>>(new Map());
  const [after, setAfter] = useState<{ myTurn: boolean; over: boolean } | null>(
    null,
  );

  const mine = shots.filter((s) => s.shooter_id === currentUserId);
  const theirs = shots.filter((s) => s.shooter_id !== currentUserId);

  /*
    Как только сервер узнал обо всех наших выстрелах, местная копия больше
    не нужна и мы целиком возвращаемся к его данным. Так расхождение не
    может закрепиться: любое неверное предположение живёт секунду.
  */
  const serverCaughtUp = [...own.keys()].every((idx) =>
    mine.some((s) => s.idx === idx),
  );

  const myShots = new Map<number, boolean | null>();
  for (const shot of mine) myShots.set(shot.idx, shot.hit);
  if (!serverCaughtUp) {
    for (const [idx, hit] of own) if (!myShots.has(idx)) myShots.set(idx, hit);
  }

  const myHits = [...myShots.values()].filter((hit) => hit === true).length;
  const theirHits = theirs.filter((s) => s.hit).length;

  const live = serverCaughtUp ? null : after;
  const myTurn = live ? live.myTurn : game.turn === currentUserId;
  const over = live ? live.over : game.winner !== null;
  // Закончить партию мог только последний залп, а он был наш.
  const iWon = live ? live.over : game.winner === currentUserId;

  // В конце партии нетронутых клеток может остаться меньше четырёх —
  // тогда и залп короче. Столько же требует база.
  const free = CELLS - myShots.size;
  const salvo = Math.min(SALVO, free);

  function toggle(i: number) {
    if (!myTurn || over || sending || myShots.has(i)) return;

    setPicked((current) =>
      current.includes(i)
        ? current.filter((c) => c !== i)
        : current.length < salvo
          ? [...current, i]
          : current,
    );
  }

  async function send() {
    if (picked.length !== salvo || sending) return;

    // Клетки сразу помечаются «стреляем»: палец должен получать отклик
    // раньше, чем ответ долетит до сервера и обратно.
    setSending(true);
    setError(null);
    setOwn((current) => {
      const next = new Map(current);
      for (const i of picked) next.set(i, null);
      return next;
    });

    const result = await fireSalvo(game.id, picked);
    setSending(false);

    if (result.error) {
      // Залп не прошёл — снимаем отметки, чтобы клетки снова были живыми.
      setOwn((current) => {
        const next = new Map(current);
        for (const i of picked) next.delete(i);
        return next;
      });
      setError(result.error);
      return;
    }

    setOwn((current) => {
      const next = new Map(current);
      for (const shot of result.shots ?? []) next.set(shot.idx, shot.hit);
      return next;
    });

    // После залпа ход переходит всегда — независимо от попаданий.
    setAfter({ myTurn: false, over: result.finished === true });
    setPicked([]);

    // Сверка с сервером идёт следом и никого не задерживает.
    router.refresh();
  }

  return (
    <Shell
      title={
        over
          ? iWon
            ? "Вы победили 💘"
            : `Победила ${partnerName}`
          : myTurn
            ? "Ваш залп"
            : `Ходит ${partnerName}`
      }
    >
      {!over && (
        <p className="mt-2 text-[13px] leading-snug text-text-muted">
          {myTurn
            ? `Выберите ${salvo} ${plural(salvo, CELL_FORMS)} на её поле и стреляйте разом`
            : "Она сейчас ищет ваши сердца"}
        </p>
      )}

      <section className="mt-5">
        <h2 className="mb-2 text-[12px] tracking-wide text-text-faint uppercase">
          Её поле · разбито {myHits} из {HEARTS}
        </h2>

        <Board
          cells={CELLS}
          onPick={myTurn && !over ? toggle : undefined}
          render={(i) => {
            if (!myShots.has(i)) {
              if (picked.includes(i)) return { content: "◎", tone: "picked" };
              return { content: null, tone: myTurn && !over ? "open" : "idle" };
            }

            const hit = myShots.get(i);
            // null — залп ушёл, ответа ещё нет.
            if (hit === null) return { content: "…", tone: "pending" };

            return hit
              ? { content: "💔", tone: "hit" }
              : { content: "·", tone: "miss" };
          }}
        />

        {myTurn && !over && (
          <div className="mt-3">
            <Button
              size="lg"
              block
              disabled={picked.length !== salvo || sending}
              onClick={send}
            >
              {sending
                ? "Стреляем…"
                : picked.length === salvo
                  ? "Залп"
                  : `Выбрано ${picked.length} из ${salvo}`}
            </Button>
          </div>
        )}
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-[12px] tracking-wide text-text-faint uppercase">
          Ваше поле · разбито {theirHits} из {HEARTS}
        </h2>

        <Board
          cells={CELLS}
          render={(i) => {
            const shot = theirs.find((s) => s.idx === i);
            const heart = myCells.includes(i);

            if (shot?.hit) return { content: "💔", tone: "hit" };
            if (shot) return { content: "·", tone: "miss" };
            return heart
              ? { content: "❤️", tone: "own" }
              : { content: null, tone: "idle" };
          }}
        />
      </section>

      {error && (
        <p role="status" className="mt-3 text-center text-[14px] text-danger">
          {error}
        </p>
      )}

      <Abandon id={game.id} finished={over} />
    </Shell>
  );
}

/** Поле. Клетки нумеруются подряд — так же, как в базе. */
function Board({
  cells,
  onPick,
  render,
}: {
  cells: number;
  onPick?: (index: number) => void;
  render: (index: number) => {
    content: string | null;
    tone: "idle" | "own" | "open" | "hit" | "miss" | "pending" | "picked";
  };
}) {
  return (
    <div
      className="grid gap-1.5"
      style={{ gridTemplateColumns: `repeat(${SIZE}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: cells }, (_, i) => {
        const { content, tone } = render(i);
        const clickable =
          Boolean(onPick) &&
          tone !== "hit" &&
          tone !== "miss" &&
          tone !== "pending";

        return (
          <button
            key={i}
            type="button"
            disabled={!clickable}
            onClick={() => onPick?.(i)}
            aria-label={`Клетка ${Math.floor(i / SIZE) + 1}-${(i % SIZE) + 1}`}
            className={cn(
              "flex aspect-square items-center justify-center rounded-2xl border text-[19px]",
              "transition-colors duration-150",
              clickable && "active:scale-95",
              tone === "own" && "border-accent/45 bg-accent-soft/50",
              tone === "hit" && "border-accent-2/50 bg-accent-2/15",
              tone === "miss" && "border-border bg-surface-2/40 text-text-faint",
              tone === "picked" && "border-accent bg-accent-soft text-accent",
              tone === "pending" &&
                "animate-pulse border-accent/40 bg-accent-soft/30 text-text-faint",
              tone === "open" && "border-accent/30 bg-surface/92",
              tone === "idle" && "border-border bg-surface/70",
            )}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}

function Shell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-2 pb-4">
      <h1 className="font-display text-[26px] leading-snug text-text">
        {title}
      </h1>
      {children}
    </div>
  );
}

/** Бросить партию — или убрать законченную, чтобы начать новую. */
function Abandon({ id, finished }: { id: string; finished?: boolean }) {
  return (
    <form action={abandonGame} className="mt-8 text-center">
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="text-[13px] text-text-faint">
        {finished ? "Убрать и сыграть ещё" : "Бросить партию"}
      </button>
    </form>
  );
}
