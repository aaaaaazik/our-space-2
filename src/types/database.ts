/**
 * Типы таблиц базы данных.
 * Должны соответствовать supabase/migrations/0001_initial_schema.sql —
 * при изменении схемы обновляйте оба файла.
 */

export type Theme = "system" | "light" | "dark";
export type WishStatus = "want" | "planning" | "soon" | "done";

export type Profile = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  timezone: string;
  theme: Theme;
  created_at: string;
};

export type CoupleSettings = {
  id: boolean;
  app_name: string;
  relationship_start: string;
  timezone: string;
  updated_at: string;
};

export type ImportantDate = {
  id: string;
  label: string;
  emoji: string | null;
  date: string;
  is_recurring: boolean;
  created_by: string;
  created_at: string;
};

export type Album = {
  id: string;
  title: string;
  description: string | null;
  emoji: string | null;
  cover_photo_id: string | null;
  created_by: string;
  created_at: string;
};

export type MediaKind = "photo" | "video";

export type Photo = {
  id: string;
  album_id: string | null;
  /** Ключ файла в Cloudflare R2. */
  storage_path: string;
  kind: MediaKind;
  /** Кадр-обложка для видео; у фотографий пусто. */
  poster_path: string | null;
  duration_seconds: number | null;
  mime_type: string | null;
  size_bytes: number | null;
  title: string | null;
  description: string | null;
  taken_at: string;
  width: number | null;
  height: number | null;
  uploaded_by: string;
  created_at: string;
};

export type PhotoReaction = {
  photo_id: string;
  user_id: string;
  created_at: string;
};

export type PhotoComment = {
  id: string;
  photo_id: string;
  author_id: string;
  body: string;
  created_at: string;
};

/**
 * Сам факт записи. Виден обоим всегда — чтобы можно было увидеть,
 * что тебя ждёт закрытая запись, и сколько до неё осталось.
 */
export type DiaryEntry = {
  id: string;
  author_id: string;
  entry_date: string;
  /** Когда откроется второму. null — сразу. */
  unlock_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Содержимое записи. Приходит, только если читать его уже можно. */
export type DiaryContent = {
  entry_id: string;
  title: string;
  body: string;
  mood: string | null;
  /** Ключ голосовой записи в Cloudflare R2. */
  audio_path: string | null;
  /** Длительность в секундах — её считает диктофон, а не файл. */
  audio_seconds: number | null;
};

export type Wish = {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  price: number | null;
  currency: string;
  priority: number;
  category: string | null;
  status: WishStatus;
  completed_at: string | null;
  created_by: string;
  created_at: string;
  /** Короткая заметка от того, кто желание не добавлял. */
  note: string | null;
  note_by: string | null;
  note_at: string | null;
};

export type Plan = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  location: string | null;
  created_by: string;
  created_at: string;
};

export type PackKind = "daily" | "never";
export type AnswerChoice = "never" | "did";

export type QuestionPack = {
  id: string;
  slug: string;
  title: string;
  emoji: string | null;
  description: string | null;
  kind: PackKind;
  is_builtin: boolean;
  created_by: string | null;
  created_at: string;
};

export type Question = {
  id: string;
  pack_id: string;
  body: string;
  position: number;
  created_by: string | null;
  created_at: string;
};

export type Answer = {
  id: string;
  question_id: string;
  author_id: string;
  body: string | null;
  choice: AnswerChoice | null;
  created_at: string;
  /** Короткая заметка от второго — того, кто этот ответ не писал. */
  note: string | null;
  note_by: string | null;
  note_at: string | null;
};

export type DrawingRound = {
  id: string;
  author_id: string;
  /** Ключ файла с рисунком в Cloudflare R2. */
  storage_path: string;
  guess: string | null;
  guessed_by: string | null;
  guessed_at: string | null;
  /** Ставит автор, когда увидел догадку. */
  is_correct: boolean | null;
  created_at: string;
};

/**
 * Заказ на рисунок — второй режим рисовашек.
 *
 * Задание пишет заказчик, и оно открыто обоим: прятать его бессмысленно,
 * рисующему без него не обойтись. Рисует всегда не заказчик.
 */
export type DrawingOrder = {
  id: string;
  ordered_by: string;
  task: string;
  /** Ключ файла в Cloudflare R2. Пусто, пока не нарисовано. */
  storage_path: string | null;
  drawn_at: string | null;
  /** От 1 до 10. Ставит заказчик, и только после рисунка. */
  score: number | null;
  scored_at: string | null;
  created_at: string;
};

export type DrawingSecret = {
  round_id: string;
  prompt: string;
};

export type WordKind = "rebus" | "anagram";

export type WordRound = {
  id: string;
  author_id: string;
  kind: WordKind;
  /** Что видит угадывающий: смайлики или перемешанные буквы. */
  clue: string;
  word_length: number;
  attempts: number;
  /** null — ещё думает, true — угадал, false — попытки кончились. */
  solved: boolean | null;
  solved_at: string | null;
  created_at: string;
};

export type WordSecret = {
  round_id: string;
  word: string;
};

/** Партия «Сердечного боя». Игроков двое, поэтому оба известны сразу. */
export type HeartsGame = {
  id: string;
  a_id: string;
  b_id: string;
  /** Чей ход. Пусто, пока не расставились оба. */
  turn: string | null;
  winner: string | null;
  created_at: string;
  finished_at: string | null;
};

/** Выстрел по клетке 0..24. Строка = idx / 5, столбец = idx % 5. */
export type HeartsShot = {
  game_id: string;
  shooter_id: string;
  idx: number;
  hit: boolean;
  created_at: string;
};

/** Своя расстановка. Чужую база не отдаёт ни во время партии, ни после. */
export type HeartsCell = {
  game_id: string;
  owner_id: string;
  idx: number;
};

/** Утверждение игры «Кто из нас?». Без автора — значит встроенное. */
export type WhoStatement = {
  id: string;
  body: string;
  created_by: string | null;
  position: number;
  created_at: string;
};

/**
 * Ответ на утверждение.
 *
 * pick — ссылка на человека, а не «я/ты»: так совпадение это просто
 * равенство, без переворота одного ответа относительно другого.
 */
export type WhoAnswer = {
  statement_id: string;
  author_id: string;
  pick: string;
  created_at: string;
};

export type LoveResult = {
  user_id: string;
  /** номер вопроса → 'a' или 'b' */
  answers: Record<string, "a" | "b">;
  scores: Record<string, number>;
  completed_at: string | null;
  updated_at: string;
};

/** Сообщение в общей переписке. Комнат нет — беседа одна на двоих. */
export type Message = {
  id: string;
  author_id: string;
  body: string | null;
  /** Ключ голосовой записи в Cloudflare R2. */
  audio_path: string | null;
  audio_seconds: number | null;
  /** Когда второй это прочитал. */
  read_at: string | null;
  created_at: string;
};

/** Одно нажатие кнопки «думаю о тебе». Больше в нём ничего и нет. */
export type Thought = {
  id: string;
  author_id: string;
  created_at: string;
};

export type PushSubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  created_at: string;
};

export type NotificationSettings = {
  user_id: string;
  photos: boolean;
  diary: boolean;
  games: boolean;
  dates: boolean;
  daily_question: boolean;
  /** «Думаю о тебе». */
  thoughts: boolean;
  /** Сообщения в чате. */
  chat: boolean;
  /** Часы тишины. Пусто — присылать всегда. */
  quiet_from: number | null;
  quiet_to: number | null;
  updated_at: string;
};

type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<Profile>;
      couple_settings: Table<CoupleSettings>;
      important_dates: Table<ImportantDate>;
      albums: Table<Album>;
      photos: Table<Photo>;
      photo_reactions: Table<PhotoReaction>;
      photo_comments: Table<PhotoComment>;
      diary_entries: Table<DiaryEntry>;
      diary_contents: Table<DiaryContent>;
      wishes: Table<Wish>;
      plans: Table<Plan>;
      question_packs: Table<QuestionPack>;
      questions: Table<Question>;
      answers: Table<Answer>;
      love_results: Table<LoveResult>;
      who_statements: Table<WhoStatement>;
      who_answers: Table<WhoAnswer>;
      hearts_games: Table<HeartsGame>;
      hearts_cells: Table<HeartsCell>;
      hearts_shots: Table<HeartsShot>;
      drawing_rounds: Table<DrawingRound>;
      drawing_secrets: Table<DrawingSecret>;
      drawing_orders: Table<DrawingOrder>;
      word_rounds: Table<WordRound>;
      word_secrets: Table<WordSecret>;
      messages: Table<Message>;
      thoughts: Table<Thought>;
      push_subscriptions: Table<PushSubscriptionRow>;
      notification_settings: Table<NotificationSettings>;
    };
    Views: Record<string, never>;
    Functions: {
      is_member: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      has_answered: {
        Args: { question: string };
        Returns: boolean;
      };
      daily_question: {
        Args: Record<string, never>;
        Returns: string | null;
      };
      set_answer_note: {
        Args: { p_answer: string; p_note: string | null };
        Returns: undefined;
      };
      has_love_result: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      submit_order_drawing: {
        Args: { order_id: string; key: string };
        Returns: undefined;
      };
      score_order: {
        Args: { order_id: string; value: number };
        Returns: undefined;
      };
      can_see_prompt: {
        Args: { round: string };
        Returns: boolean;
      };
      can_read_diary: {
        Args: { entry: string };
        Returns: boolean;
      };
      partner_push_targets: {
        Args: { kind: string };
        Returns: Array<{ endpoint: string; p256dh: string; auth: string }>;
      };
      start_hearts_game: {
        Args: Record<string, never>;
        Returns: string;
      };
      place_hearts: {
        Args: { game: string; cells: number[] };
        Returns: undefined;
      };
      fire_salvo: {
        Args: { game: string; cells: number[] };
        Returns: Array<{ idx: number; hit: boolean; finished: boolean }>;
      };
      who_answered: {
        Args: { statement: string };
        Returns: boolean;
      };
      can_see_word: {
        Args: { round: string };
        Returns: boolean;
      };
      try_word: {
        Args: { round: string; attempt: string };
        Returns: Array<{
          correct: boolean;
          attempts: number;
          finished: boolean;
        }>;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
