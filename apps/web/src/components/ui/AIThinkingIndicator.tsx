"use client";

import { useState, useEffect } from "react";

interface AIThinkingIndicatorProps {
  /** Current backend repo status — used to show contextually relevant messages */
  status?: string;
  /** Real metrics to display alongside thinking messages */
  metrics?: {
    indexedCommits?: number;
    totalCommits?: number;
    milestonesDetected?: number;
    contributorsFound?: number;
    chaptersGenerated?: number;
    totalChapters?: number;
  };
  className?: string;
}

const STATUS_MESSAGES: Record<string, { messages: string[]; icon: string }> = {
  cloning: {
    icon: "📦",
    messages: [
      "Cloning repository from GitHub...",
      "Downloading source tree...",
    ],
  },
  fetching_commits: {
    icon: "🔍",
    messages: [
      "Counting commits from GitHub API...",
      "Discovering repository history...",
    ],
  },
  indexing: {
    icon: "📊",
    messages: [
      "Indexing commit history...",
      "Processing file changes...",
      "Building commit graph...",
    ],
  },
  verifying: {
    icon: "✅",
    messages: [
      "Verifying data integrity...",
      "Cross-referencing commit SHAs...",
    ],
  },
  analytics: {
    icon: "📈",
    messages: [
      "Analyzing contributor patterns...",
      "Computing commit activity heatmap...",
      "Identifying top contributors...",
    ],
  },
  ai_generation: {
    icon: "✨",
    messages: [
      "Grouping related changes...",
      "Finding architectural shifts...",
      "Understanding contributor dynamics...",
    ],
  },
  journey: {
    icon: "🧭",
    messages: [
      "Detecting major milestones...",
      "Mapping development phases...",
      "Generating repository narrative...",
      "Building evolution timeline...",
    ],
  },
  default: {
    icon: "🧠",
    messages: [
      "Analyzing repository...",
      "Processing data...",
    ],
  },
};

export function AIThinkingIndicator({ status, metrics, className = "" }: AIThinkingIndicatorProps) {
  const [messageIndex, setMessageIndex] = useState(0);

  const { messages, icon } = STATUS_MESSAGES[status || ""] || STATUS_MESSAGES.default;

  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % messages.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [messages.length, status]);

  // Build a contextual metric string
  const metricText = buildMetricText(status, metrics);

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Pulsing icon */}
      <div className="relative">
        <span className="text-lg animate-pulse">{icon}</span>
        <div className="absolute -inset-1 bg-blue-500/20 rounded-full blur-md animate-pulse-glow opacity-40" />
      </div>

      <div className="flex flex-col gap-0.5">
        {/* Rotating message */}
        <p
          key={`${status}-${messageIndex}`}
          className="text-sm font-medium text-white/70 animate-crossfade-in"
        >
          {messages[messageIndex]}
        </p>

        {/* Real metric line */}
        {metricText && (
          <p className="text-xs font-mono text-white/40">
            {metricText}
          </p>
        )}
      </div>
    </div>
  );
}

function buildMetricText(
  status?: string,
  metrics?: AIThinkingIndicatorProps["metrics"]
): string | null {
  if (!metrics) return null;

  if (
    (status === "indexing" || status === "fetching_commits") &&
    metrics.totalCommits &&
    metrics.totalCommits > 0
  ) {
    const indexed = metrics.indexedCommits ?? 0;
    const pct = Math.round((indexed / metrics.totalCommits) * 100);
    return `${indexed.toLocaleString()} / ${metrics.totalCommits.toLocaleString()} commits processed (${pct}%)`;
  }

  if (status === "journey" && metrics.milestonesDetected) {
    return `${metrics.milestonesDetected} milestones detected`;
  }

  if (status === "analytics" && metrics.contributorsFound) {
    return `${metrics.contributorsFound} contributors identified`;
  }

  if (
    (status === "ai_generation" || status === "journey") &&
    metrics.chaptersGenerated != null &&
    metrics.totalChapters
  ) {
    return `Chapter ${metrics.chaptersGenerated} of ${metrics.totalChapters} generated`;
  }

  return null;
}
