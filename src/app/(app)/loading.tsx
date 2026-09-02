import { CardSkeleton, HeaderSkeleton } from "@/components/ui/Skeleton";

/**
 * Next.js показывает это мгновенно при переходе, пока страница
 * готовится на сервере. Без такого экрана нажатие на вкладку выглядит
 * так, будто приложение зависло.
 */
export default function Loading() {
  return (
    <div>
      <HeaderSkeleton />
      <div className="space-y-2.5 px-5">
        <CardSkeleton />
        <CardSkeleton lines={1} />
        <CardSkeleton lines={3} />
      </div>
    </div>
  );
}
