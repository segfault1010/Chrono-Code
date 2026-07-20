"use client";

import { PIPELINE_GRAPH, PipelineState, PipelineStageId } from "@chronocode/shared-types";

interface AnalysisProgressProps {
  pipelineState: PipelineState | null;
  indexedCommits?: number;
  totalCommits?: number;
  indexingProgress?: number;
  className?: string;
}

const STAGE_ORDER: PipelineStageId[] = [
  "clone",
  "fetch",
  "indexing",
  "journey",
  "analytics",
  "story",
  "risk",
  "ready"
];

export function AnalysisProgress({
  pipelineState,
  indexedCommits = 0,
  totalCommits = 0,
  indexingProgress = 0,
  className = "",
}: AnalysisProgressProps) {
  
  if (!pipelineState) return null;

  return (
    <div className={`${className}`}>
      <div className="space-y-1">
        {STAGE_ORDER.map((stageId, i) => {
          const config = PIPELINE_GRAPH[stageId];
          const isCompleted = pipelineState.completed_stages.includes(stageId);
          const isActive = pipelineState.running_stages.includes(stageId);
          const isPending = pipelineState.pending_stages.includes(stageId) || (!isCompleted && !isActive);

          // Build inline metric for certain stages
          let metricDetail = "";
          if (stageId === "indexing" && (isActive || isCompleted) && totalCommits > 0) {
            if (isCompleted) {
              metricDetail = `${totalCommits.toLocaleString()} commits`;
            } else {
              metricDetail = `${indexedCommits.toLocaleString()} / ${totalCommits.toLocaleString()}`;
            }
          }

          return (
            <div
              key={stageId}
              className={`flex items-center gap-3 py-1.5 px-3 rounded-lg transition-all duration-500 ${
                isActive
                  ? "bg-blue-500/10 border border-blue-500/20"
                  : "border border-transparent"
              }`}
              style={{
                opacity: isPending ? 0.35 : 1,
                animationDelay: `${i * 80}ms`,
              }}
            >
              {/* Status indicator */}
              <div className="w-5 h-5 flex-shrink-0 flex items-center justify-center">
                {isCompleted ? (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#22c55e"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="animate-checkmark"
                    style={{ strokeDasharray: 24 }}
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : isActive ? (
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                ) : (
                  <div className="w-2.5 h-2.5 rounded-full bg-white/15" />
                )}
              </div>

              {/* Label */}
              <span
                className={`text-sm font-medium flex-1 ${
                  isCompleted
                    ? "text-white/60"
                    : isActive
                    ? "text-white"
                    : "text-white/30"
                }`}
              >
                {config.label}
              </span>

              {/* Metric badge */}
              {metricDetail && (
                <span className="text-xs font-mono text-white/40 bg-white/5 px-2 py-0.5 rounded-md">
                  {metricDetail}
                </span>
              )}

              {/* Active progress bar for indexing stage */}
              {isActive && stageId === "indexing" && totalCommits > 0 && (
                <div className="w-20 h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all duration-700"
                    style={{ width: `${Math.min(indexingProgress, 100)}%` }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
