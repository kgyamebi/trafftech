import { Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <div className="grid gap-6" aria-busy="true" aria-label="Loading your records">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-16 w-2/3" />
      <div className="flex items-center gap-6">
        <Skeleton className="h-40 w-40 rounded-full" />
        <div className="grid flex-1 gap-3">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      </div>
      <Skeleton className="h-36 w-full" />
    </div>
  );
}
