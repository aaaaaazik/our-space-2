import { plural, units } from "@/lib/utils/plural";

/**
 * «20 минут назад», «3 часа назад», «вчера».
 *
 * Считается на сервере и уходит на страницу готовой строкой. Пересчитывать
 * её в браузере каждую минуту незачем: человек смотрит на неё секунду,
 * а таймер ради этого крутился бы всё время, пока открыто приложение.
 */
export function timeAgo(iso: string, now: Date): string {
  const minutes = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000);

  if (minutes < 1) return "только что";
  if (minutes < 60) return `${minutes} ${plural(minutes, units.minute)} назад`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${plural(hours, units.hour)} назад`;

  const days = Math.floor(hours / 24);
  if (days === 1) return "вчера";
  if (days < 7) return `${days} ${plural(days, units.day)} назад`;

  return "давно";
}
