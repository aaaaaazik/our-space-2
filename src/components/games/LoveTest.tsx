"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Lock, RotateCcw } from "lucide-react";

import { resetLoveResult, saveLoveAnswers } from "@/app/(app)/games/actions";
import {
  LOVE_PAIRS,
  ranked,
  type Scores,
} from "@/lib/games/loveLanguages";

type Answers = Record<string, "a" | "b">;

export function LoveTest({
  initialAnswers,
  myScores,
  theirScores,
  partnerName,
  completed,
}: {
  initialAnswers: Answers;
  myScores: Scores | null;
  theirScores: Scores | null;
  partnerName: string;
  completed: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [answers, setAnswers] = useState<Answers>(initialAnswers);
  const [showResult, setShowResult] = useState(completed);

  const total = LOVE_PAIRS.length;
  const answeredCount = Object.keys(answers).length;

  // Первый вопрос без ответа — так возвращаемся туда, где остановились.
  const currentIndex = LOVE_PAIRS.findIndex(
    (_, index) => answers[String(index)] === undefined,
  );

  function choose(choice: "a" | "b") {
    const next = { ...answers, [String(currentIndex)]: choice };
    setAnswers(next);

    startTransition(async () => {
      await saveLoveAnswers(next, total);
      if (Object.keys(next).length >= total) {
        setShowResult(true);
        router.refresh();
      }
    });
  }

  function restart() {
    setAnswers({});
    setShowResult(false);
    startTransition(async () => {
      await resetLoveResult();
      router.refresh();
    });
  }

  if (showResult && myScores) {
    return (
      <Results
        myScores={myScores}
        theirScores={theirScores}
        partnerName={partnerName}
        onRestart={restart}
      />
    );
  }

  const pair = LOVE_PAIRS[currentIndex];
  if (!pair) return null;

  return (
    <div>
      <div className="flex items-center gap-3">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-300"
            style={{ width: `${(answeredCount / total) * 100}%` }}
          />
        </div>
        <span className="tabular shrink-0 text-[12px] text-text-faint">
          {answeredCount} / {total}
        </span>
      </div>

      <p className="mt-6 text-center text-[13px] text-text-muted">
        Мне приятнее, когда…
      </p>

      <AnimatePresence mode="wait">
        <motion.div
          key={currentIndex}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.16 }}
          className="mt-4 space-y-3"
        >
          <Option text={pair.a.text} onClick={() => choose("a")} />
          <p className="text-center text-[12px] text-text-faint">или</p>
          <Option text={pair.b.text} onClick={() => choose("b")} />
        </motion.div>
      </AnimatePresence>

      {answeredCount > 0 && (
        <button
          type="button"
          onClick={restart}
          className="mt-8 flex w-full items-center justify-center gap-1.5 text-[13px] text-text-faint"
        >
          <RotateCcw size={13} aria-hidden />
          Начать заново
        </button>
      )}
    </div>
  );
}

function Option({ text, onClick }: { text: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-3xl border border-border bg-surface/92 p-5 text-left text-[16px] leading-snug text-text shadow-card transition-transform duration-150 active:scale-[0.98]"
    >
      {text}
    </button>
  );
}

function Results({
  myScores,
  theirScores,
  partnerName,
  onRestart,
}: {
  myScores: Scores;
  theirScores: Scores | null;
  partnerName: string;
  onRestart: () => void;
}) {
  const mine = ranked(myScores);
  const top = mine[0];

  return (
    <div>
      <div className="rounded-[28px] border border-accent/25 bg-accent-soft/30 p-6 text-center">
        <p className="text-[40px] leading-none" aria-hidden>
          {top.emoji}
        </p>
        <p className="mt-3 text-[12px] tracking-[0.18em] text-text-muted uppercase">
          Твой язык любви
        </p>
        <p className="mt-1.5 font-display text-[26px] text-text">{top.title}</p>
        <p className="mt-3 text-[15px] leading-relaxed text-text-muted">
          {top.description}
        </p>
      </div>

      <ul className="mt-5 space-y-3">
        {mine.map((item) => (
          <li key={item.key}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[15px] text-text">
                {item.emoji} {item.title}
              </span>
              <span className="tabular text-[13px] text-text-muted">
                {item.percent}%
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-700"
                style={{ width: `${item.percent}%` }}
              />
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-8">
        <p className="text-[12px] tracking-wide text-text-faint uppercase">
          {partnerName}
        </p>

        {theirScores ? (
          <Partner scores={theirScores} partnerName={partnerName} />
        ) : (
          <div className="mt-2 flex items-start gap-3 rounded-3xl border border-border bg-surface/82 p-4">
            <Lock
              size={17}
              className="mt-0.5 shrink-0 text-text-faint"
              aria-hidden
            />
            <p className="text-[14px] leading-relaxed text-text-muted">
              {partnerName} ещё не прошёл тест. Как пройдёт — результат появится
              здесь рядом с твоим.
            </p>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onRestart}
        className="mt-8 flex w-full items-center justify-center gap-1.5 text-[13px] text-text-faint"
      >
        <RotateCcw size={13} aria-hidden />
        Пройти заново
      </button>
    </div>
  );
}

function Partner({
  scores,
  partnerName,
}: {
  scores: Scores;
  partnerName: string;
}) {
  const list = ranked(scores);
  const top = list[0];

  return (
    <div className="mt-2 rounded-3xl border border-border bg-surface/88 p-5">
      <p className="font-display text-[20px] text-text">
        {top.emoji} {top.title}
      </p>
      <p className="mt-2 text-[14px] leading-relaxed text-text-muted">
        {top.description}
      </p>

      <p className="mt-4 rounded-2xl bg-surface-2/70 p-3.5 text-[14px] leading-relaxed text-text">
        <span className="text-text-muted">Как любить {partnerName}: </span>
        {top.howTo}
      </p>

      <ul className="mt-4 space-y-2">
        {list.map((item) => (
          <li key={item.key} className="flex items-center gap-2.5">
            <span className="w-32 shrink-0 text-[13px] text-text-muted">
              {item.emoji} {item.title}
            </span>
            <span className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2">
              <span
                className="block h-full rounded-full bg-accent/70"
                style={{ width: `${item.percent}%` }}
              />
            </span>
            <span className="tabular w-9 shrink-0 text-right text-[12px] text-text-faint">
              {item.percent}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
