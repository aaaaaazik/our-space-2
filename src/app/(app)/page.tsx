import Link from "next/link";

import { ChatButton } from "@/components/home/ChatButton";
import { Counter } from "@/components/home/Counter";
import { MemoryOfDay } from "@/components/home/MemoryOfDay";
import { ThinkingOfYou } from "@/components/home/ThinkingOfYou";
import {
  asProfiles,
  asSettings,
  profilesQuery,
  requireSession,
  settingsQuery,
} from "@/lib/data/couple";
import {
  datesQuery,
  safeZone,
  todayIn,
  toCalendarItems,
} from "@/lib/data/calendar";
import { memoryQuery, pickMemory } from "@/lib/data/memoryOfDay";
import {
  dailyQuestionQuery,
  pickDaily,
  questionsQuery,
} from "@/lib/data/questions";
import { timeAgo } from "@/lib/utils/ago";
import { nextEvent, shortDate } from "@/lib/utils/calendar";
import { withUnit, units } from "@/lib/utils/plural";
import type { Profile, Question } from "@/types/database";

/** Заголовок записи вместе с датой из связанной таблицы. */
type DiaryPreview = { title: string; diary_entries: { entry_date: string } };

export default async function HomePage() {
  const { supabase, user } = await requireSession();

  // Серверный компонент выполняется заново на каждый запрос, поэтому
  // «сейчас» читается один раз и дальше везде используется одно и то же:
  // иначе плитка календаря и вопрос дня могли бы разойтись на полночи.
  const now = new Date();

  // Всё одной волной: head:true возвращает только количество,
  // не перекачивая сами строки.
  const [
    profilesResult,
    settingsResult,
    dailyQuestionsResult,
    dailyPickResult,
    myAnswersResult,
    photos,
    diary,
    wishes,
    wishesDone,
    upcomingPlans,
    importantDates,
    memoryResult,
    thoughtsResult,
    unreadResult,
  ] = await Promise.all([
    profilesQuery(supabase),
    settingsQuery(supabase),
    // Вопрос дня — в той же волне. Раньше он запрашивался после неё
    // двумя запросами подряд и один заметно тормозил главную.
    questionsQuery(supabase, "daily"),
    dailyQuestionQuery(supabase),
    supabase.from("answers").select("question_id").eq("author_id", user.id),
    supabase.from("photos").select("id", { count: "exact", head: true }),
    // Заголовок последней записи. Берём из содержимого, а не из самой
    // записи: закрытые записи содержимого не отдают, и на главной
    // случайно не мелькнёт то, что ещё не должно быть видно.
    supabase
      .from("diary_contents")
      .select("title, diary_entries!inner(entry_date)"),
    supabase.from("wishes").select("id", { count: "exact", head: true }),
    supabase
      .from("wishes")
      .select("id", { count: "exact", head: true })
      .eq("status", "done"),
    // Для плитки календаря: ближайшие планы и все повторяющиеся даты.
    // Дни рождения повторяются каждый год, поэтому отфильтровать их
    // по дате в запросе нельзя — год в базе стоит тот, в котором человек
    // родился.
    supabase
      .from("plans")
      .select("*")
      .gte("starts_at", new Date(now.getTime() - 86_400_000).toISOString())
      .order("starts_at")
      .limit(30),
    datesQuery(supabase),
    // Снимки прошлых лет, сделанные примерно в этот же день. Какой из них
    // покажем — решаем ниже, когда станет известен часовой пояс пары.
    memoryQuery(supabase, now),
    // «Думаю о тебе»: только последнее нажатие второго. Свои сюда брать
    // незачем — нажать можно сколько угодно раз, и десяток своих строк
    // вытеснил бы единственную нужную.
    supabase
      .from("thoughts")
      .select("created_at")
      .neq("author_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Непрочитанные для значка на кружке чата. head: true возвращает
    // только количество, не перекачивая сами сообщения.
    supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .neq("author_id", user.id)
      .is("read_at", null),
  ]);

  const profiles = asProfiles(profilesResult);
  const settings = asSettings(settingsResult);

  // Вопрос дня показываем прямо здесь — ради него и заходят каждый день.
  const dailyQuestion = pickDaily(
    dailyPickResult,
    (dailyQuestionsResult.data as Question[] | null) ?? [],
    now,
  );

  const answeredToday = Boolean(
    dailyQuestion &&
      (myAnswersResult.data ?? []).some(
        (a) => a.question_id === dailyQuestion.id,
      ),
  );

  const latestDiary = ((diary.data as DiaryPreview[] | null) ?? [])
    .slice()
    .sort((a, b) =>
      b.diary_entries.entry_date.localeCompare(a.diary_entries.entry_date),
    )
    .at(0);

  const photoCount = photos.count ?? 0;
  const wishCount = wishes.count ?? 0;
  const doneCount = wishesDone.count ?? 0;

  const zone = safeZone(settings.timezone);
  const todayKey = todayIn(zone);

  const soon = nextEvent(
    toCalendarItems(upcomingPlans.data, importantDates.data, zone),
    todayKey,
  );

  // Ссылка на файл в хранилище подписывается здесь же: сеть для этого
  // не нужна, подпись считается на месте.
  const memory = await pickMemory(memoryResult.data, todayKey, zone);

  // Чужое нажатие показываем только свежее: «три дня назад» — это уже
  // не про сейчас, а грустная строчка на главной ни к чему.
  const theirThought = (
    thoughtsResult.data as { created_at: string } | null
  )?.created_at;

  const fromPartner =
    theirThought && now.getTime() - new Date(theirThought).getTime() < 86_400_000
      ? timeAgo(theirThought, now)
      : null;

  const partnerName =
    profiles.find((p) => p.id !== user.id)?.display_name ?? "Она";

  const calendarLabel = soon
    ? `${shortDate(soon.day)} · ${soon.title}`
    : "Ничего не отмечено";

  const since = new Date(settings.relationship_start).toLocaleDateString(
    "ru-RU",
    { day: "numeric", month: "long", year: "numeric" },
  );


  return (
    // Запас снизу — под кружок «думаю о тебе», который висит в углу:
    // без него последние плитки уезжали бы под него.
    <div className="px-5 pt-[max(2rem,env(safe-area-inset-top))] pb-16">
      <div className="flex flex-col items-center">
        {/* Звезда со стороны A, луна со стороны H */}
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/stickers/star.svg"
            alt=""
            aria-hidden
            width={22}
            height={22}
            className="sticker"
            style={{ ["--tilt" as string]: "-12deg" }}
          />

          <Avatars profiles={profiles} currentUserId={user.id} />

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/stickers/moon.svg"
            alt=""
            aria-hidden
            width={22}
            height={22}
            className="sticker"
            style={{ ["--tilt" as string]: "12deg", animationDelay: "1.4s" }}
          />
        </div>

        <p className="mt-3 text-[15px] text-text">
          {profiles.map((p) => p.display_name).join("  &  ") || "Мы"}
        </p>

        <p className="mt-1 text-[13px] text-text-muted">
          С возвращением, любимая
        </p>
      </div>

      <div className="mt-7">
        <Counter startISO={settings.relationship_start} />
        <p className="mt-3 text-center text-[12px] text-text-faint">
          с {since}
        </p>

        {/*
          Мельче и глуше строки с датой над ней: это приятная мелочь,
          а не сообщение, ради которого открыли приложение. Ярким цветом
          она перетягивала на себя весь низ счётчика.
        */}
        {fromPartner && (
          <p className="mt-1 text-center text-[11px] text-text-faint/75">
            {partnerName} думала о тебе · {fromPartner}
          </p>
        )}
      </div>

      {memory && <MemoryOfDay memory={memory} />}

      {dailyQuestion && (
        <Link
          href="/games/daily"
          prefetch
          className="mt-8 block rounded-3xl border border-accent/25 bg-accent-soft/30 p-4 transition-transform duration-150 active:scale-[0.99]"
        >
          <p className="text-[12px] tracking-[0.18em] text-text-muted uppercase">
            Вопрос дня
          </p>
          <p className="mt-2 font-display text-[18px] leading-snug text-text">
            {dailyQuestion.body}
          </p>
          <p className="mt-2.5 text-[13px] text-accent">
            {answeredToday ? "Посмотреть ответы →" : "Ответить →"}
          </p>
        </Link>
      )}

      <div className="mt-6 grid grid-cols-2 gap-3">
        <Tile
          index={0}
          href="/memories"
          emoji="📸"
          title="Воспоминания"
          value={
            photoCount > 0 ? withUnit(photoCount, units.photo) : "Пока пусто"
          }
        />
        <Tile
          index={1}
          href="/diary"
          emoji="📝"
          title="Дневник"
          value={latestDiary?.title ?? "Первая запись ждёт"}
        />
        <Tile
          index={2}
          href="/wishlist"
          emoji="🎁"
          title="Желания"
          value={
            wishCount > 0
              ? `${doneCount} из ${wishCount} исполнено`
              : "Список пуст"
          }
        />
        <Tile
          index={3}
          href="/calendar"
          emoji="🗓"
          title="Календарь"
          value={calendarLabel}
        />
      </div>

      {/* Два кружка по углам: слева «думаю о тебе», справа чат. */}
      <ThinkingOfYou partnerName={partnerName} />
      <ChatButton unread={unreadResult.count ?? 0} />
    </div>
  );
}

/** Два кружка внахлёст — пара одним взглядом. */
function Avatars({
  profiles,
  currentUserId,
}: {
  profiles: Profile[];
  currentUserId: string;
}) {
  // Свой профиль показываем первым, чтобы порядок не менялся у каждого свой.
  const ordered = [...profiles].sort((a, b) =>
    a.id === currentUserId ? -1 : b.id === currentUserId ? 1 : 0,
  );

  const shown = ordered.length > 0 ? ordered : [null, null];

  return (
    <div className="flex">
      {shown.slice(0, 2).map((profile, i) => (
        <div
          key={profile?.id ?? i}
          className={
            "flex size-14 items-center justify-center overflow-hidden rounded-full " +
            "border-2 border-bg bg-surface-2 " +
            (i > 0 ? "-ml-4" : "")
          }
        >
          {profile?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.avatar_url}
              alt=""
              className="size-full object-cover"
            />
          ) : (
            <span className="font-display text-xl text-text-muted">
              {profile?.display_name?.trim().charAt(0).toUpperCase() ?? "?"}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function Tile({
  href,
  emoji,
  title,
  value,
  index = 0,
}: {
  href: string;
  emoji: string;
  title: string;
  value: string;
  /** Порядковый номер — чтобы плитки качались вразнобой, а не хором. */
  index?: number;
}) {
  return (
    // Покачивание живёт на обёртке, а нажатие — на самой ссылке.
    // Оба меняют transform, и на одном элементе анимация просто
    // перебила бы вдавливание при нажатии.
    <div
      className="gentle-float"
      style={{
        animationDelay: `${index * 1.3}s`,
        ["--spin" as string]: index % 2 === 0 ? "1.8deg" : "-1.8deg",
      }}
    >
      <Link
        href={href}
        prefetch
        className="flex min-h-[104px] flex-col justify-between rounded-3xl border border-border bg-surface/92 p-4 shadow-card transition-transform duration-150 active:scale-[0.98]"
      >
        <span className="text-xl" aria-hidden>
          {emoji}
        </span>
        <span>
          <span className="block text-[15px] font-medium text-text">
            {title}
          </span>
          <span className="mt-0.5 block line-clamp-2 text-[12px] leading-snug text-text-muted">
            {value}
          </span>
        </span>
      </Link>
    </div>
  );
}
