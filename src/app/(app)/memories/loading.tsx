import { HeaderSkeleton, Skeleton } from "@/components/ui/Skeleton";

/** Заглушка повторяет сетку фотографий, чтобы при загрузке ничего не прыгало. */
export default function Loading() {
  return (
    <div>
      <HeaderSkeleton />
      <div className="grid grid-cols-3 gap-1.5 px-1.5">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
