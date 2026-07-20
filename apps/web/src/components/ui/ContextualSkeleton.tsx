"use client";

/* ============================================================================
   Contextual Skeletons
   Skeleton components shaped like the actual UI they replace —
   NOT generic gray boxes.
   ============================================================================ */

export function StatCardSkeleton({ count = 1 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="animate-shimmer rounded-2xl border border-white/5 p-4 flex flex-col gap-3"
          style={{ animationDelay: `${i * 100}ms` }}
        >
          <div className="w-16 h-3 rounded-full bg-white/5" />
          <div className="w-24 h-7 rounded-lg bg-white/8" />
        </div>
      ))}
    </div>
  );
}

export function StoryParagraphSkeleton() {
  return (
    <div className="space-y-6 py-2">
      {/* Chapter heading skeleton */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-lg bg-white/5 animate-shimmer" />
        <div className="w-48 h-5 rounded-lg bg-white/8 animate-shimmer" style={{ animationDelay: "100ms" }} />
      </div>
      {/* Paragraph lines */}
      {[100, 95, 88, 70].map((w, i) => (
        <div
          key={i}
          className="h-3.5 rounded-full bg-white/5 animate-shimmer"
          style={{ width: `${w}%`, animationDelay: `${(i + 2) * 100}ms` }}
        />
      ))}
      {/* Second chapter heading */}
      <div className="flex items-center gap-3 mt-8 mb-4">
        <div className="w-8 h-8 rounded-lg bg-white/5 animate-shimmer" style={{ animationDelay: "600ms" }} />
        <div className="w-56 h-5 rounded-lg bg-white/8 animate-shimmer" style={{ animationDelay: "700ms" }} />
      </div>
      {[92, 100, 78].map((w, i) => (
        <div
          key={`b-${i}`}
          className="h-3.5 rounded-full bg-white/5 animate-shimmer"
          style={{ width: `${w}%`, animationDelay: `${(i + 8) * 100}ms` }}
        />
      ))}
    </div>
  );
}

export function TimelineSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-6 relative">
      {/* Timeline line */}
      <div className="absolute left-[15px] sm:left-[31px] top-4 bottom-0 w-[2px] bg-gradient-to-b from-white/10 via-white/5 to-transparent" />

      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex gap-4 sm:gap-6"
          style={{ animationDelay: `${i * 150}ms` }}
        >
          {/* Timeline dot */}
          <div className="mt-7 w-8 sm:w-16 flex-shrink-0 flex justify-center">
            <div className="w-3.5 h-3.5 rounded-full bg-white/10 animate-shimmer" />
          </div>

          {/* Card skeleton */}
          <div className="flex-1 p-5 rounded-2xl border border-white/5 animate-shimmer">
            <div className="flex flex-col gap-3">
              <div className="w-3/4 h-5 rounded-lg bg-white/8" />
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-white/5" />
                <div className="w-20 h-3 rounded-full bg-white/5" />
                <div className="w-16 h-3 rounded-full bg-white/5" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ContributorGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="animate-shimmer rounded-xl border border-white/5 p-4 flex items-center gap-3"
          style={{ animationDelay: `${i * 80}ms` }}
        >
          <div className="w-10 h-10 rounded-full bg-white/8 flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="w-20 h-3 rounded-full bg-white/8" />
            <div className="w-14 h-2.5 rounded-full bg-white/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton() {
  return (
    <div className="animate-shimmer rounded-2xl border border-white/5 p-6">
      <div className="w-32 h-4 rounded-lg bg-white/8 mb-6" />
      <div className="flex items-end gap-2 h-40">
        {[40, 65, 35, 80, 55, 70, 45, 90, 60, 50, 75, 85].map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded-t bg-white/5"
            style={{ height: `${h}%`, animationDelay: `${i * 50}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

export function MilestoneTimelineSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-start gap-4 animate-shimmer"
          style={{ animationDelay: `${i * 120}ms` }}
        >
          <div className="flex flex-col items-center">
            <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10" />
            {i < count - 1 && <div className="w-0.5 h-8 bg-white/5 mt-1" />}
          </div>
          <div className="flex-1 pb-4">
            <div className="w-2/3 h-4 rounded-lg bg-white/8 mb-2" />
            <div className="w-1/3 h-3 rounded-full bg-white/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function RepoHeaderSkeleton() {
  return (
    <div className="animate-shimmer">
      <div className="flex items-start gap-5">
        {/* Avatar */}
        <div className="w-16 h-16 rounded-2xl bg-white/8 flex-shrink-0" />
        <div className="flex-1 space-y-3">
          {/* Title */}
          <div className="w-64 h-7 rounded-lg bg-white/8" />
          {/* Description */}
          <div className="w-full max-w-md h-4 rounded-full bg-white/5" />
          <div className="w-3/4 max-w-sm h-4 rounded-full bg-white/5" />
        </div>
      </div>
      {/* Stat chips */}
      <div className="flex gap-3 mt-5">
        {[80, 64, 72, 56].map((w, i) => (
          <div
            key={i}
            className="h-8 rounded-full bg-white/5"
            style={{ width: w, animationDelay: `${i * 100}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
