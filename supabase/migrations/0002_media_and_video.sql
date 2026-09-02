-- =============================================================================
-- Our Space — видео и переезд файлов на Cloudflare R2
-- =============================================================================
-- Как применить: Supabase → SQL Editor → New query → вставить целиком → Run.
-- Запускать повторно безопасно.
--
-- Что меняется:
--   • в таблице photos появляется тип записи (фото или видео);
--   • для видео хранится кадр-обложка и длительность;
--   • сами файлы теперь лежат в Cloudflare R2, а не в Supabase Storage,
--     поэтому storage_path — это ключ объекта в R2.
-- =============================================================================

alter table public.photos
  add column if not exists kind text not null default 'photo'
    check (kind in ('photo', 'video'));

-- Кадр-обложка для видео: без неё в сетке было бы пустое место.
-- Делается на телефоне при загрузке и кладётся в R2 отдельным файлом.
alter table public.photos
  add column if not exists poster_path text;

alter table public.photos
  add column if not exists duration_seconds numeric(8, 2);

alter table public.photos
  add column if not exists mime_type text;

alter table public.photos
  add column if not exists size_bytes bigint;

create index if not exists photos_kind_idx on public.photos (kind);

-- Старый bucket в Supabase больше не используется. Не удаляем его здесь:
-- если в нём остались файлы, они пропали бы безвозвратно.
-- Удалите его вручную в Storage, когда убедитесь, что всё работает.
