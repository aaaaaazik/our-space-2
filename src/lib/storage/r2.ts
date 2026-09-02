import "server-only";

import {
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Хранилище файлов в Cloudflare R2.
 *
 * Почему не Supabase Storage: там на бесплатном тарифе 1 ГБ и 5 ГБ трафика
 * в месяц, а каждый просмотр видео — это скачивание файла заново.
 * У R2 10 ГБ бесплатно и трафик не тарифицируется вообще.
 *
 * R2 совместим с протоколом Amazon S3, поэтому работаем стандартным SDK.
 *
 * ВАЖНО: ключи от R2 — секретные, в отличие от публичного ключа Supabase.
 * Этот файл помечен server-only, чтобы его нельзя было случайно
 * импортировать в код, который уезжает в браузер.
 */

function env(name: string): string {
  const raw = process.env[name];
  if (!raw) {
    throw new Error(
      `Не задана переменная ${name}. ` +
        `Локально — в .env.local, на Vercel — в Settings → Environment Variables.`,
    );
  }

  // Частые ошибки при копировании значения руками: лишние пробелы,
  // кавычки или случайно скопированное вместе с именем «ИМЯ=значение».
  let value = raw.trim().replace(/^["']|["']$/g, "");

  if (value.startsWith(`${name}=`)) {
    throw new Error(
      `В переменную ${name} попало её собственное имя. ` +
        `Нужно только то, что справа от знака «=».`,
    );
  }

  value = value.trim();
  if (!value) throw new Error(`Переменная ${name} пустая.`);

  return value;
}

/** Идентификатор аккаунта Cloudflare — ровно 32 знака, цифры и латиница a–f. */
function accountId(): string {
  const value = env("R2_ACCOUNT_ID");

  if (!/^[0-9a-f]{32}$/i.test(value)) {
    throw new Error(
      `R2_ACCOUNT_ID выглядит неправильно: «${value}». ` +
        `Ожидается 32 знака из цифр и букв a–f — это часть адреса ` +
        `между https:// и .r2.cloudflarestorage.com`,
    );
  }

  return value;
}

let client: S3Client | null = null;

function r2(): S3Client {
  if (client) return client;

  client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId()}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env("R2_ACCESS_KEY_ID"),
      secretAccessKey: env("R2_SECRET_ACCESS_KEY"),
    },
    /*
      Обязательно для Cloudflare.

      Библиотека Amazon по умолчанию подставляет имя корзины отдельным
      поддоменом: корзина.аккаунт.r2.cloudflarestorage.com — два уровня.
      Сертификат Cloudflare выдан на *.r2.cloudflarestorage.com и покрывает
      только один уровень, поэтому Safari на iPhone такой адрес отвергает.

      forcePathStyle даёт правильный вид:
      аккаунт.r2.cloudflarestorage.com/корзина/файл
    */
    forcePathStyle: true,
  });

  return client;
}

const bucket = () => env("R2_BUCKET");

/** Ссылка на просмотр. Час жизни — как было у Supabase. */
const VIEW_TTL = 60 * 60;

/** Ссылка на загрузку. Пятнадцати минут хватит даже на большое видео. */
const UPLOAD_TTL = 15 * 60;

/**
 * Временная ссылка, по которой браузер сам зальёт файл в R2.
 * Файл не проходит через наш сервер — это быстрее и не упирается
 * в ограничение Vercel на размер тела запроса.
 */
export function createUploadUrl(key: string, contentType: string) {
  return getSignedUrl(
    r2(),
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: UPLOAD_TTL },
  );
}

/** Временная ссылка на просмотр одного файла. */
export function createViewUrl(key: string) {
  return getSignedUrl(
    r2(),
    new GetObjectCommand({ Bucket: bucket(), Key: key }),
    { expiresIn: VIEW_TTL },
  );
}

/** Ссылки сразу на список файлов — для сетки фотографий. */
export async function createViewUrls(
  keys: string[],
): Promise<Map<string, string>> {
  const entries = await Promise.all(
    keys.map(async (key) => {
      try {
        return [key, await createViewUrl(key)] as const;
      } catch {
        return [key, ""] as const;
      }
    }),
  );

  return new Map(entries.filter(([, url]) => url !== ""));
}

export async function deleteObjects(keys: string[]) {
  if (keys.length === 0) return;

  await r2().send(
    new DeleteObjectsCommand({
      Bucket: bucket(),
      Delete: { Objects: keys.map((Key) => ({ Key })) },
    }),
  );
}
