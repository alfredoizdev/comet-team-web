import { Skeleton } from "@/components/ui/skeleton";

function HeaderSkeleton() {
  return (
    <div className="bg-neutral-200">
      <div className="mx-auto flex max-w-[1264px] items-center justify-between px-5 py-4 sm:px-8 sm:py-5">
        <div className="flex items-center gap-4">
          <Skeleton className="size-14 rounded-full bg-white/70" />
          <Skeleton className="h-8 w-44 bg-white/70" />
        </div>
        <Skeleton className="h-5 w-28 bg-white/70" />
      </div>
    </div>
  );
}

function TileSkeleton() {
  return (
    <div className="flex flex-col gap-3.5">
      <Skeleton className="aspect-video w-full rounded-xl" />
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="h-4 w-1/3" />
    </div>
  );
}

/** Public team page while the published matches load. */
export function TeamPageSkeleton() {
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <HeaderSkeleton />
      <main className="mx-auto flex w-full max-w-[1264px] flex-1 flex-col gap-8 px-5 pb-24 pt-10 sm:px-8 sm:pt-14">
        <Skeleton className="h-14 w-48 sm:h-[72px]" />
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,340px),1fr))] gap-x-8 gap-y-10">
          {Array.from({ length: 6 }, (_, i) => (
            <TileSkeleton key={i} />
          ))}
        </div>
      </main>
    </div>
  );
}

/** Public match page while the reel and clips load. */
export function MatchPageSkeleton() {
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <HeaderSkeleton />
      <main className="mx-auto flex w-full max-w-[1264px] flex-1 flex-col gap-4 px-5 pb-24 pt-10 sm:px-8 sm:pt-14">
        <Skeleton className="h-12 w-2/3 sm:h-14" />
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-2 aspect-video w-full rounded-xl" />
        <Skeleton className="mt-4 h-4 w-24" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="aspect-video w-full rounded-xl" />
          ))}
        </div>
      </main>
    </div>
  );
}

/** Admin panel content while data loads (the shell header is already visible). */
export function AdminContentSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="overflow-hidden rounded-xl border bg-white">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex items-center gap-6 border-b px-4 py-4 last:border-b-0">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-6 w-20 rounded-full" />
            <div className="flex-1" />
            <Skeleton className="h-8 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function AdminMatchSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-12 w-1/2" />
      <Skeleton className="h-16 w-full rounded-xl" />
      <div className="overflow-hidden rounded-xl border bg-white">
        <Skeleton className="h-12 w-full rounded-none" />
        <div className="flex flex-col md:flex-row">
          <Skeleton className="aspect-video flex-1 rounded-none" />
          <div className="flex flex-col gap-3 p-4 md:w-80">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
