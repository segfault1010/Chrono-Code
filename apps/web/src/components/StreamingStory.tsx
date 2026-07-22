"use client";

import { useEffect, useState, useMemo, useCallback, memo, useRef } from "react";
import { Loader2 } from "lucide-react";
import DOMPurify from "dompurify";
import { api } from "../lib/api";
import { SSEParser } from "../lib/sse-parser";
import { StoryParagraphSkeleton } from "./ui/ContextualSkeleton";
import { AIThinkingIndicator } from "./ui/AIThinkingIndicator";
import type { Repository, RepositoryJourney, JourneyInsights } from "@chronocode/shared-types";

interface StreamingStoryProps {
  repo: Repository;
  journey: RepositoryJourney | null;
  isJourneyLoading: boolean;
}

// Chapter definitions — the AI summary is split into these sections
interface Chapter {
  id: string;
  title: string;
  icon: string;
  content: string | null;
  status: "pending" | "loading" | "ready";
}

const CHAPTER_DEFINITIONS = [
  { id: "origins", title: "Origins", icon: "🌱" },
  { id: "growth", title: "Growth & Evolution", icon: "📈" },
  { id: "architecture", title: "Major Architectural Changes", icon: "🏗️" },
  { id: "milestones", title: "Key Milestones", icon: "🏆" },
  { id: "current", title: "Current State", icon: "📍" },
  { id: "recommendations", title: "Recommendations", icon: "💡" },
] as const;

/**
 * Heuristically split an AI summary into chapter sections.
 * Tries to detect markdown headings (#, ##, ###) and map them to chapters.
 * Falls back to even splitting if no headings are found.
 */
function splitIntoChapters(text: string): Record<string, string> {
  const chapters: Record<string, string> = {};
  const lowerText = text.toLowerCase();

  // Try to detect heading-based sections
  const headingPatterns: { id: string; patterns: RegExp[] }[] = [
    {
      id: "origins",
      patterns: [
        /#{1,3}\s*(?:origins?|beginning|birth|creation|initial|start|overview|what is|introduction|about)/i,
      ],
    },
    {
      id: "growth",
      patterns: [
        /#{1,3}\s*(?:growth|evolution|development|progress|how.*(?:grew|evolved)|trajectory)/i,
      ],
    },
    {
      id: "architecture",
      patterns: [
        /#{1,3}\s*(?:architect|structural|technical.*(?:changes|shifts)|rewrit|refactor|major.*changes)/i,
      ],
    },
    {
      id: "milestones",
      patterns: [
        /#{1,3}\s*(?:milestone|key.*(?:events|moments)|notable|highlights|achievement|significant)/i,
      ],
    },
    {
      id: "current",
      patterns: [
        /#{1,3}\s*(?:current|present|today|state|status|where.*(?:now|today)|recent)/i,
      ],
    },
    {
      id: "recommendations",
      patterns: [
        /#{1,3}\s*(?:recommend|suggestion|future|improve|next.*steps|what.*(?:should|could)|outlook)/i,
      ],
    },
  ];

  // Split text by markdown headings
  const sections = text.split(/(?=^#{1,3}\s)/m).filter((s) => s.trim());

  if (sections.length >= 3) {
    // Try to match sections to chapter IDs by heading content
    const assigned = new Set<string>();

    for (const section of sections) {
      const firstLine = section.split("\n")[0] || "";
      let matched = false;

      for (const { id, patterns } of headingPatterns) {
        if (assigned.has(id)) continue;
        for (const pattern of patterns) {
          if (pattern.test(firstLine)) {
            // Remove the heading line from content, we'll render our own
            const content = section.split("\n").slice(1).join("\n").trim();
            chapters[id] = content;
            assigned.add(id);
            matched = true;
            break;
          }
        }
        if (matched) break;
      }

      // If no match, assign to the first unassigned chapter
      if (!matched) {
        for (const def of CHAPTER_DEFINITIONS) {
          if (!assigned.has(def.id)) {
            const content = section.split("\n").slice(1).join("\n").trim() || section.trim();
            chapters[def.id] = content;
            assigned.add(def.id);
            break;
          }
        }
      }
    }
  } else {
    // Fallback: split the text roughly evenly among chapters
    const paragraphs = text.split(/\n\n+/).filter((p) => p.trim());
    const perChapter = Math.max(1, Math.ceil(paragraphs.length / CHAPTER_DEFINITIONS.length));

    CHAPTER_DEFINITIONS.forEach((def, i) => {
      const start = i * perChapter;
      const slice = paragraphs.slice(start, start + perChapter);
      if (slice.length > 0) {
        chapters[def.id] = slice.join("\n\n");
      }
    });
  }

  return chapters;
}

export function StreamingStory({ repo, journey, isJourneyLoading }: StreamingStoryProps) {
  const [insights, setInsights] = useState<JourneyInsights | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);

  const [streamedText, setStreamedText] = useState("");
  const [streamMetrics, setStreamMetrics] = useState<{ttfbMs?: number, totalDurationMs?: number} | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const pollingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup effect for unmounts
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (pollingTimerRef.current) {
        clearTimeout(pollingTimerRef.current);
      }
    };
  }, []);

  const fetchInsights = useCallback(
    async (isPolling = false, forceRefresh = false) => {
      if (!forceRefresh && (insights?.status === "completed" || streamMetrics?.totalDurationMs)) return;
      if (!isPolling && insightsLoading) return;

      setInsightsLoading(true);
      setInsightsError(null);

      // Try SSE Streaming first
      if (!isPolling) {
        try {
          if (abortControllerRef.current) abortControllerRef.current.abort();
          abortControllerRef.current = new AbortController();

          const response = await api.repos.streamJourneyInsights(
            repo.id, 
            forceRefresh, 
            abortControllerRef.current.signal
          );
          if (!response.ok) throw new Error("Stream connection failed");
          
          const reader = response.body?.getReader();
          const decoder = new TextDecoder();
          
          if (!reader) throw new Error("No reader available");

          let done = false;
          let currentText = streamedText && !forceRefresh ? streamedText : "";
          if (forceRefresh) setStreamedText("");

          const parser = new SSEParser((event) => {
            if (!event.data) return;
            try {
              const data = JSON.parse(event.data);
              if (data.error) throw new Error(data.error);
              
              if (data.text) {
                currentText += data.text;
                setStreamedText(currentText);
              }
              
              if (data.done) {
                setStreamMetrics({
                  ttfbMs: data.ttfbMs,
                  totalDurationMs: data.totalDurationMs
                });
                setInsightsLoading(false);
                done = true; // Signals the while loop to stop if it hasn't already
              }
            } catch (e: any) {
              // If the backend sent an explicit error, throw it to trigger fallback
              if (e.message && !e.message.includes("JSON")) {
                throw e;
              }
              if (process.env.NODE_ENV === "development") {
                console.warn("[StreamingStory] Failed to parse SSE event data as JSON:", e, event.data);
              }
            }
          });

          while (!done) {
            const { value, done: readerDone } = await reader.read();
            
            if (value) {
              parser.append(decoder.decode(value, { stream: true }));
            }

            if (readerDone) {
              done = true;
            }
          }
          return;
        } catch (err: any) {
          if (err.name === "AbortError") {
            console.log("SSE Stream aborted.");
            return;
          }
          console.warn("SSE Stream failed, falling back to polling:", err.message);
          // Fallback to polling below
        } finally {
          abortControllerRef.current = null;
        }
      }

      // Fallback: Polling
      try {
        const data = await api.repos.getJourneyInsights(repo.id, forceRefresh);

        if (data.status === "completed") {
          setInsights(data);
          setStreamedText(data.ai_summary || "");
          setInsightsLoading(false);
        } else if (data.status === "generating") {
          setInsights(data);
          if (pollingTimerRef.current) clearTimeout(pollingTimerRef.current);
          pollingTimerRef.current = setTimeout(() => fetchInsights(true), 3000);
        } else {
          setInsightsLoading(false);
        }
      } catch (err: any) {
        if (err.name === "AbortError") return;
        setInsightsError(err.message || "Failed to load insights");
        setInsightsLoading(false);
      }
    },
    [repo.id, insights?.status, insightsLoading, streamMetrics, streamedText]
  );

  // Start fetching insights once journey data is available
  useEffect(() => {
    if (
      journey &&
      journey.milestones &&
      journey.milestones.length > 0 &&
      !insights &&
      !insightsLoading
    ) {
      fetchInsights();
    }
  }, [journey, insights, insightsLoading]);

  // Build chapters from streamed text
  const chapters: Chapter[] = useMemo(() => {
    if (!streamedText) {
      return CHAPTER_DEFINITIONS.map((def) => ({
        id: def.id,
        title: def.title,
        icon: def.icon,
        content: null,
        status: insightsLoading ? "loading" : "pending",
      }));
    }

    const split = splitIntoChapters(streamedText);
    const readyChapters: Chapter[] = [];
    let passedContent = false;

    for (const def of CHAPTER_DEFINITIONS) {
      const content = split[def.id] || null;
      if (content) passedContent = true;
      readyChapters.push({
        id: def.id,
        title: def.title,
        icon: def.icon,
        content,
        status: content ? "ready" : passedContent ? "pending" : "loading",
      });
    }

    return readyChapters;
  }, [streamedText, insightsLoading]);

  const readyChapters = chapters.filter((c) => c.status === "ready");
  const totalChapters = CHAPTER_DEFINITIONS.length;
  const isFullyLoaded = streamMetrics?.totalDurationMs !== undefined || insights?.status === "completed";

  // --- Render: Loading state (no journey yet) ---
  if (isJourneyLoading && !journey) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
            <span>✨</span> Repository Story
          </h2>
          <AIThinkingIndicator
            status={repo.status}
            metrics={{
              indexedCommits: repo.indexed_commits,
              totalCommits: repo.total_commits,
            }}
          />
        </div>
        <StoryParagraphSkeleton />
      </div>
    );
  }

  // --- Render: Story ---
  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
          <span>✨</span> Repository Story
        </h2>

        {!isFullyLoaded && (
          <div className="flex items-center gap-2 text-xs text-white/40">
            <div className="w-3 h-3 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
            <span className="font-mono">
              {readyChapters.length} of {totalChapters} chapters
            </span>
          </div>
        )}

        {isFullyLoaded && (
          <button
            onClick={() => fetchInsights(false, true)}
            className="text-xs text-white/30 hover:text-white/60 transition-colors px-2 py-1 rounded-md hover:bg-white/5"
          >
            Regenerate
          </button>
        )}
      </div>

      {/* Health indicators (from insights) */}
      {insights?.health_indicators && insights.health_indicators.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6 animate-fade-in">
          {insights.health_indicators.map((indicator, i) => (
            <div
              key={indicator.label}
              className="px-3 py-2.5 rounded-xl bg-white/5 border border-white/5"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <div className="text-[10px] uppercase tracking-wider text-white/40 font-bold mb-1">
                {indicator.label}
              </div>
              <div
                className={`text-sm font-semibold ${
                  indicator.status === "good"
                    ? "text-green-400"
                    : indicator.status === "warning"
                    ? "text-yellow-400"
                    : "text-white/70"
                }`}
              >
                {indicator.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Chapters */}
      <div className="space-y-6">
        {chapters.map((chapter, i) => (
          <MemoizedChapter
            key={chapter.id}
            chapter={chapter}
            index={i}
            totalChapters={totalChapters}
          />
        ))}
      </div>

      {/* Error state */}
      {insightsError && (
        <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mt-4">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          {insightsError}
        </div>
      )}

      {/* Thinking indicator when loading */}
      {insightsLoading && !isFullyLoaded && (
        <div className="mt-4">
          <AIThinkingIndicator
            status="journey"
            metrics={{
              milestonesDetected: journey?.milestones?.length,
              chaptersGenerated: readyChapters.length,
              totalChapters,
            }}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Memoized Subcomponents
// ---------------------------------------------------------------------------

const MemoizedChapter = memo(function MemoizedChapter({ 
  chapter, 
  index, 
  totalChapters 
}: { 
  chapter: Chapter, 
  index: number, 
  totalChapters: number 
}) {
  const renderedContent = useMemo(() => {
    if (!chapter.content) return null;
    
    // Performance log for debugging the markdown parser
    const start = performance.now();
    
    const lines = chapter.content.split("\n").map((line, li) => {
      if (!line.trim()) return null;
      // Render bold markers
      const rendered = line
        .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white/80">$1</strong>')
        .replace(/`(.*?)`/g, '<code class="text-blue-400/80 bg-white/5 px-1 py-0.5 rounded text-xs">$1</code>');
      return (
        <p
          key={li}
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(rendered) }}
        />
      );
    });

    const duration = performance.now() - start;
    if (duration > 5) {
      console.warn(`[Performance] Chapter '${chapter.id}' took ${duration.toFixed(2)}ms to parse markdown.`);
    }

    return lines;
  }, [chapter.content, chapter.id]);

  if (chapter.status === "ready" && chapter.content) {
    return (
      <div
        className="animate-chapter-reveal"
        style={{ animationDelay: `${index * 100}ms` }}
      >
        {/* Chapter heading */}
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-base">
            {chapter.icon}
          </div>
          <h3 className="text-base font-semibold text-white/90 tracking-tight">
            {chapter.title}
          </h3>
          <span className="text-[10px] font-mono text-white/20 ml-auto">
            {index + 1}/{totalChapters}
          </span>
        </div>

        {/* Chapter content */}
        <div className="ml-10 text-sm text-white/60 leading-relaxed space-y-2">
          {renderedContent}
        </div>
      </div>
    );
  }

  if (chapter.status === "loading") {
    return (
      <div className="flex items-center gap-3 py-3 opacity-60">
        <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-base animate-pulse">
          {chapter.icon}
        </div>
        <span className="text-sm text-white/40 font-medium">
          {chapter.title}
        </span>
        <div className="w-3 h-3 rounded-full border-2 border-white/20 border-t-white/50 animate-spin ml-2" />
      </div>
    );
  }

  return null;
}, (prev, next) => {
  return prev.chapter.content === next.chapter.content && 
         prev.chapter.status === next.chapter.status &&
         prev.index === next.index;
});
