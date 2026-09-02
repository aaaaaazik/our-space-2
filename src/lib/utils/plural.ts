/**
 * Русские окончания: 1 день, 2 дня, 5 дней.
 * forms — [для 1, для 2–4, для 5–20].
 */
export function plural(n: number, forms: [string, string, string]) {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;

  if (abs > 10 && abs < 20) return forms[2];
  if (last > 1 && last < 5) return forms[1];
  if (last === 1) return forms[0];
  return forms[2];
}

export const units = {
  year: ["год", "года", "лет"] as [string, string, string],
  month: ["месяц", "месяца", "месяцев"] as [string, string, string],
  day: ["день", "дня", "дней"] as [string, string, string],
  hour: ["час", "часа", "часов"] as [string, string, string],
  minute: ["минута", "минуты", "минут"] as [string, string, string],
  second: ["секунда", "секунды", "секунд"] as [string, string, string],
  photo: ["фотография", "фотографии", "фотографий"] as [string, string, string],
  video: ["видео", "видео", "видео"] as [string, string, string],
  entry: ["запись", "записи", "записей"] as [string, string, string],
  wish: ["желание", "желания", "желаний"] as [string, string, string],
  plan: ["план", "плана", "планов"] as [string, string, string],
};

/** «12 дней» — число вместе с правильной формой слова. */
export function withUnit(n: number, forms: [string, string, string]) {
  return `${n} ${plural(n, forms)}`;
}
