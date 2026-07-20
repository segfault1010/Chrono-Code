"use client";

import { useState, useMemo } from "react";
import type { RepositoryJourney, JourneyMilestone, MilestoneCategory } from "@chronocode/shared-types";
import { MilestoneTimelineSkeleton } from "./ui/ContextualSkeleton";

interface LiveTimelineProps {
  journey: RepositoryJourney | null;
  isLoading: boolean;
  isIndexing: boolean;
  /** Maximum milestones to show before "Show more" */
  limit?: number;
}

const CATEGORY_COLORS: Record<MilestoneCategory, { bg: string; border: string; text: string; dot: string }> = {
  feature: { bg: "bg-blue-500/10", border: "border-blue-500/20", text: "text-blue-400", dot: "#3b82f6" },
  bugfix: { bg: "bg-red-500/10", border: "border-red-500/20", text: "text-red-400", dot: "#ef4444" },
  refactor: { bg: "bg-purple-500/10", border: "border-purple-500/20", text: "text-purple-400", dot: "#8b5cf6" },
  release: { bg: "bg-yellow-500/10", border: "border-yellow-500/20", text: "text-yellow-400", dot: "#eab308" },
  architecture: { bg: "bg-cyan-500/10", border: "border-cyan-500/20", text: "text-cyan-400", dot: "#06b6d4" },
  docs: { bg: "bg-emerald-500/10", border: "border-emerald-500/20", text: "text-emerald-400", dot: "#10b981" },
  chore: { bg: "bg-zinc-500/10", border: "border-zinc-500/20", text: "text-zinc-400", dot: "#71717a" },
  unknown: { bg: "bg-zinc-500/10", border: "border-zinc-500/20", text: "text-zinc-400", dot: "#52525b" },
};

const CATEGORY_LABELS: Record<MilestoneCategory, string> = {
  feature: "Feature",
  bugfix: "Bug Fix",
  refactor: "Refactor",
  release: "Release",
  architecture: "Architecture",
  docs: "Documentation",
  chore: "Chore",
  unknown: "Commit",
};

export function LiveTimeline({ journey, isLoading, isIndexing, limit = 8 }: LiveTimelineProps) {
  const [showAll, setShowAll] = useState(false);

  const milestones = useMemo(() => {
    if (!journey?.milestones) return [];
    // Sort by date ascending (oldest first for chronological timeline)
    return [...journey.milestones].sort(
      (a, b) => new Date(a.authored_at).getTime() - new Date(b.authored_at).getTime()
    );
  }, [journey?.milestones]);

  const displayedMilestones = showAll ? milestones : milestones.slice(-limit);
  const totalMilestones = milestones.length;

  // Loading state
  if (isLoading && !journey) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
            <span>🧭</span> Major Milestones
          </h2>
        </div>
        <MilestoneTimelineSkeleton count={4} />
      </div>
    );
  }

  if (!journey || milestones.length === 0) {
    if (isIndexing) {
      return (
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
            <span>🧭</span> Major Milestones
          </h2>
          <div className="flex items-center gap-3 py-6 justify-center text-white/40 text-sm">
            <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white/50 animate-spin" />
            Detecting milestones...
          </div>
        </div>
      );
    }
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
          <span>🧭</span> Major Milestones
        </h2>
        <span className="text-xs font-mono text-white/30">
          {totalMilestones} detected
        </span>
      </div>

      {/* Timeline */}
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-[15px] top-0 bottom-0 w-[2px] bg-gradient-to-b from-blue-500/40 via-purple-500/20 to-transparent animate-grow-down" />

        <div className="space-y-3">
          {displayedMilestones.map((milestone, i) => {
            const colors = CATEGORY_COLORS[milestone.category] || CATEGORY_COLORS.unknown;
            const categoryLabel = CATEGORY_LABELS[milestone.category] || "Commit";

            return (
              <div
                key={milestone.sha}
                className="flex items-start gap-4 animate-slide-in"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                {/* Timeline dot */}
                <div className="relative flex-shrink-0 mt-1.5 z-10">
                  <div
                    className="w-[10px] h-[10px] rounded-full border-2 bg-black"
                    style={{
                      borderColor: colors.dot,
                      boxShadow: `0 0 8px ${colors.dot}40`,
                    }}
                  />
                </div>

                {/* Milestone card */}
                <div
                  className={`flex-1 rounded-xl px-4 py-3 ${colors.bg} border ${colors.border} transition-all duration-300 hover:bg-white/5 group cursor-default`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white/80 leading-snug line-clamp-2 group-hover:text-white transition-colors">
                        {milestone.message.split("\n")[0]}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5 text-xs text-white/30">
                        <span>{milestone.author_name}</span>
                        <span>·</span>
                        <span>
                          {new Date(milestone.authored_at).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                      </div>
                    </div>

                    {/* Category badge */}
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${colors.bg} ${colors.text} border ${colors.border} flex-shrink-0`}
                    >
                      {categoryLabel}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* In-progress indicator */}
        {isIndexing && (
          <div className="flex items-center gap-4 mt-3 animate-fade-in">
            <div className="relative flex-shrink-0 z-10">
              <div className="w-[10px] h-[10px] rounded-full border-2 border-white/20 bg-black animate-pulse" />
            </div>
            <div className="text-sm text-white/30 italic flex items-center gap-2">
              <div className="w-3 h-3 rounded-full border-2 border-white/20 border-t-white/40 animate-spin" />
              Analyzing recent development...
            </div>
          </div>
        )}
      </div>

      {/* Show more / less toggle */}
      {totalMilestones > limit && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="text-xs font-medium text-white/30 hover:text-white/60 transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5 ml-8"
        >
          {showAll ? "Show recent only" : `Show all ${totalMilestones} milestones`}
        </button>
      )}
    </div>
  );
}
