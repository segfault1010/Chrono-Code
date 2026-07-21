"use client";

import { useEffect, useState, useRef, useCallback, lazy, Suspense } from "react";
import { useParams } from "next/navigation";
import { api } from "../../../lib/api";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { ProgressiveSection } from "../../../components/ui/ProgressiveSection";
import { AIThinkingIndicator } from "../../../components/ui/AIThinkingIndicator";
import {
  StatCardSkeleton,
  TimelineSkeleton,
  ContributorGridSkeleton,
  ChartSkeleton,
} from "../../../components/ui/ContextualSkeleton";
import { RepoMetaHeader } from "../../../components/RepoMetaHeader";
import { AnalysisProgress } from "../../../components/AnalysisProgress";
import { AnalysisCompleted } from "../../../components/AnalysisCompleted";
// Lazy load massive components to improve TTI
import { TabErrorBoundary } from "@/components/ui/TabErrorBoundary";
import type { Repository, RepositoryJourney } from "@chronocode/shared-types";
import { createClient } from "../../../lib/supabase/client";

// Lazy-loaded tab components
const AnalyticsDashboard = lazy(() =>
  import("../../../components/AnalyticsDashboard").then((m) => ({ default: m.AnalyticsDashboard }))
);
const ReleaseNotes = lazy(() =>
  import("../../../components/ReleaseNotes").then((m) => ({ default: m.ReleaseNotes }))
);
const RiskAnalysis = lazy(() =>
  import("../../../components/RiskAnalysis").then((m) => ({ default: m.RiskAnalysis }))
);
const CodeEvolution = lazy(() =>
  import("../../../components/CodeEvolution").then((m) => ({ default: m.CodeEvolution }))
);
const FunctionHistory = lazy(() =>
  import("../../../components/FunctionHistory").then((m) => ({ default: m.FunctionHistory }))
);
const StreamingStory = lazy(() =>
  import("../../../components/StreamingStory").then((m) => ({ default: m.StreamingStory }))
);
const LiveTimeline = lazy(() =>
  import("../../../components/LiveTimeline").then((m) => ({ default: m.LiveTimeline }))
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(dateString: string | null): string {
  if (!dateString) return "Never";
  const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getStatusColor(status: string): string {
  switch (status) {
    case "ready": return "var(--color-success, #22c55e)";
    case "journey":
    case "ai_generation":
    case "analytics":
    case "verifying": return "var(--color-accent-primary)";
    case "indexing":
    case "fetching_commits":
    case "cloning":
    case "pending":
    case "queued": return "var(--color-warning, #f59e0b)";
    case "failed": return "var(--color-error)";
    default: return "var(--color-text-tertiary)";
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case "ready": return "Ready";
    case "journey": return "Computing Journey…";
    case "ai_generation": return "Generating AI Summaries…";
    case "analytics": return "Computing Analytics…";
    case "verifying": return "Verifying Integrity…";
    case "indexing": return "Indexing Commits…";
    case "fetching_commits": return "Fetching Commits…";
    case "cloning": return "Cloning…";
    case "pending": return "Pending";
    case "queued": return "Queued";
    case "failed": return "Failed";
    default: return status;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RepoPage() {
  const params = useParams();
  const repoId = params.id as string;

  // Core data
  const [repo, setRepo] = useState<Repository | null>(null);
  const [pipelineState, setPipelineState] = useState<any>(null);
  const [githubMeta, setGithubMeta] = useState<any>(null);
  const [commits, setCommits] = useState<any[]>([]);
  const [journey, setJourney] = useState<RepositoryJourney | null>(null);
  const [journeyLoading, setJourneyLoading] = useState(true);

  // UI state
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [explanations, setExplanations] = useState<Record<string, { explanation: string, model_id: string, error?: string, isExplaining?: boolean }>>({});

  // Auth
  const [user, setUser] = useState<any>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // Tabs
  const [activeTab, setActiveTab] = useState<"overview" | "timeline" | "analytics" | "releases" | "risk" | "evolution" | "functions">("overview");
  const [isSyncing, setIsSyncing] = useState(false);

  // Infinite scroll sentinel ref
  const scrollSentinelRef = useRef<HTMLDivElement>(null);
  const isFetchingJourney = useRef(false);

  // Reset to overview when switching repos
  useEffect(() => {
    setActiveTab("overview");
  }, [repoId]);

  // -------------------------------------------------------------------------
  // Phase 1: INSTANT — Fire all data fetches in parallel on mount
  // -------------------------------------------------------------------------

  useEffect(() => {
    let pollInterval: NodeJS.Timeout;

    let metaFetched = false;
    const fetchMeta = () => {
      if (metaFetched) return;
      api.repos.getGithubMeta(repoId).then((meta) => {
        setGithubMeta(meta);
        metaFetched = true;
      }).catch(() => {});
    };

    // Fetch GitHub meta immediately
    fetchMeta();

    let isMounted = true;

    const fetchRepo = async () => {
      try {
        const data = await api.repos.get(repoId);
        if (!isMounted) return;

        setRepo((prev) => {
          if (!prev) return data;
          if (prev.status === data.status && prev.indexed_commits === data.indexed_commits && prev.total_commits === data.total_commits) return prev;
          return data;
        });

        let currentState: any = null;
        try {
          currentState = await api.repos.getPipelineProgress(repoId);
          if (!isMounted) return;
          setPipelineState((prev: any) => {
            if (!prev) return currentState;
            if (prev.overall_progress === currentState.overall_progress && prev.running_stages?.join() === currentState.running_stages?.join()) return prev;
            return currentState;
          });
        } catch (e) {
          console.warn("Pipeline state not available yet", e);
        }

        // Retry meta fetch if it failed initially
        fetchMeta();

        // Always load latest commits if we're on the first page
        if (page === 1) {
          loadCommits(1);
        }

        // Start fetching journey data as soon as repo is usable
        const usableStatuses = ["verifying", "analytics", "ai_generation", "journey", "ready"];
        if (usableStatuses.includes(data.status)) {
          fetchJourneyData();
        }

        if (data.status === "ready") {
          clearInterval(pollInterval);
        } else if (data.status === "failed") {
          if (isMounted) setError(data.error_message || "Repository indexing failed.");
          clearInterval(pollInterval);
        }
      } catch (err: any) {
        if (isMounted) setError(err.message || "Failed to load repository.");
        clearInterval(pollInterval);
      }
    };

    fetchRepo();

    const checkAuthAndSaved = async () => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!isMounted) return;
      if (session?.user) {
        setUser(session.user);
        try {
          const saved = await api.user.getSavedRepos();
          if (isMounted) setIsSaved(saved.some(r => r.id === repoId));
        } catch (e) {}
      }
    };
    checkAuthAndSaved();

    // Poll every 2s
    pollInterval = setInterval(fetchRepo, 2000);

    return () => {
      isMounted = false;
      clearInterval(pollInterval);
    };
  }, [repoId, isSyncing]);

  // Fetch journey data
  const fetchJourneyData = useCallback(async () => {
    if (isFetchingJourney.current) return;
    isFetchingJourney.current = true;
    try {
      const data = await api.repos.getJourney(repoId);
      const safeData = {
        ...data,
        milestones: data.milestones || [],
      };
      setJourney(safeData);
    } catch (err: any) {
      console.warn("Journey data not available yet:", err.message);
    } finally {
      setJourneyLoading(false);
      isFetchingJourney.current = false;
    }
  }, [repoId]);

  // Refetch journey independently while it is not ready
  useEffect(() => {
    if (!repo) return;
    // Don't poll if repository is still indexing commits
    const indexingStatuses = ["queued", "cloning", "fetching_commits", "indexing", "indexing_history"];
    if (indexingStatuses.includes(repo.status)) return;

    let pollInterval: NodeJS.Timeout;
    
    const checkJourney = async () => {
      await fetchJourneyData();
    };

    // If journey isn't fetched yet or still computing/pending, poll every 3s
    if (!journey || (journey._meta?.status && !["ready", "completed", "failed", "error"].includes(journey._meta.status))) {
       pollInterval = setInterval(checkJourney, 3000);
    }

    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [repo?.status, journey?._meta?.status, fetchJourneyData]);

  const loadCommits = async (pageNumber: number) => {
    try {
      if (pageNumber > 1) setIsLoadingMore(true);
      const response: any = await api.repos.getCommits(repoId, pageNumber);
      if (pageNumber === 1) {
        setCommits(response.data);
      } else {
        setCommits((prev) => [...prev, ...response.data]);
      }
      setHasMore(response.meta.hasMore ?? (pageNumber < response.meta.totalPages));
      setPage(pageNumber);
    } catch (err: any) {
      console.error("Failed to load commits:", err);
    } finally {
      setIsLoadingMore(false);
    }
  };

  // -------------------------------------------------------------------------
  // Infinite scroll observer
  // -------------------------------------------------------------------------

  const loadMoreRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry && entry.isIntersecting && hasMore && !isLoadingMore && !searchResults) {
          loadCommits(page + 1);
        }
      },
      { rootMargin: "200px" }
    );

    observer.observe(node);

    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, page, searchResults]);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }

    setIsSearching(true);
    try {
      const results = await api.repos.search(repoId, searchQuery);
      setSearchResults(results);
    } catch (err) {
      console.error("Search failed:", err);
    } finally {
      setIsSearching(false);
    }
  };

  const clearSearch = () => {
    setSearchQuery("");
    setSearchResults(null);
  };

  const handleSaveToggle = async () => {
    if (!user) {
      window.location.href = "/login";
      return;
    }
    setIsSaving(true);
    try {
      if (isSaved) {
        await api.repos.unsave(repoId);
        setIsSaved(false);
      } else {
        await api.repos.save(repoId);
        setIsSaved(true);
      }
    } catch (e) {
      console.error("Failed to toggle save", e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleExplain = async (sha: string) => {
    if (!user) {
      window.location.href = "/login";
      return;
    }

    if (explanations[sha]) {
      setExplanations((prev) => {
        const next = { ...prev };
        delete next[sha];
        return next;
      });
      return;
    }

    setExplanations((prev) => ({
      ...prev,
      [sha]: { explanation: "", model_id: "Loading...", isExplaining: true }
    }));

    try {
      const response = await api.commits.explain(sha, repoId);

      if (!response.ok) {
        throw new Error(`Failed to explain: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("Failed to read stream");
      }

      let done = false;
      let streamedText = "";

      setExplanations((prev) => ({
        ...prev,
        [sha]: { ...prev[sha], isExplaining: false }
      }));

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;

        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));

                if (data.error) {
                  setExplanations((prev) => ({
                    ...prev,
                    [sha]: { ...prev[sha], error: data.error }
                  }));
                  done = true;
                  break;
                }

                if (data.text) {
                  streamedText += data.text;
                  setExplanations((prev) => ({
                    ...prev,
                    [sha]: { ...prev[sha], explanation: streamedText }
                  }));
                }

                if (data.done) {
                  setExplanations((prev) => ({
                    ...prev,
                    [sha]: { ...prev[sha], model_id: data.model_id }
                  }));
                  done = true;
                }
              } catch (e) {
                // Ignore incomplete JSON chunks from SSE
              }
            }
          }
        }
      }
    } catch (err: any) {
      setExplanations((prev) => ({
        ...prev,
        [sha]: { ...prev[sha], error: err.message || "Failed to generate explanation", isExplaining: false }
      }));
    }
  };

  const handleJumpToTimeline = async (sha: string) => {
    setActiveTab("timeline");
    setSearchQuery(sha);

    setIsSearching(true);
    try {
      const results = await api.repos.search(repoId, sha);
      setSearchResults(results);
    } catch (err) {
      console.error("Search failed:", err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSync = async () => {
    if (isInitialIndexing || isSyncing) return;
    try {
      setIsSyncing(true);
      setPage(1);

      const res = await api.repos.sync(repoId);
      if (res.repo) {
        setRepo(res.repo);
      }

      let attempts = 0;
      const pollTimer = setInterval(async () => {
        attempts++;
        try {
          const latestRepo = await api.repos.get(repoId);
          setRepo(latestRepo);
          loadCommits(1);
        } catch (e) {}

        if (attempts >= 5) {
          clearInterval(pollTimer);
          setIsSyncing(false);
        }
      }, 2000);

      return;
    } catch (err: any) {
      console.error("Sync failed:", err);
      setIsSyncing(false);
    }
  };

  // -------------------------------------------------------------------------
  // Derived state
  // -------------------------------------------------------------------------

  let analysisPhase: "active" | "completed" | "refreshing" = "active";
  if (isSyncing) {
    analysisPhase = "refreshing";
  } else if (repo?.status === "ready" || pipelineState?.overall_progress === 100) {
    analysisPhase = "completed";
  } else if (!repo) {
    analysisPhase = "active";
  }
  
  // Legacy variables
  const isInitialIndexing = analysisPhase === "active";
  const isBackgroundIndexing = repo && analysisPhase !== "completed" ? ["verifying", "analytics", "ai_generation", "journey"].includes(repo.status) : false;
  const isIndexing = analysisPhase !== "completed";
  
  let progressPercent = 0;
  if (repo?.status === "ready") {
    progressPercent = 100;
  } else if (repo?.indexing_progress) {
    progressPercent = repo.indexing_progress;
  } else if (repo && repo.total_commits > 0) {
    progressPercent = Math.round((repo.indexed_commits / repo.total_commits) * 100 * 10) / 10;
  }

  // -------------------------------------------------------------------------
  // Render: Error state
  // -------------------------------------------------------------------------

  if (error && !repo) {
    return (
      <main className="max-w-4xl mx-auto p-4 sm:p-8 animate-fade-in">
        <Card className="border-[var(--color-error)] bg-[var(--color-error-bg)] p-6">
          <div className="flex items-center gap-3 mb-2 text-[var(--color-error)]">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <h2 className="text-xl font-bold">Error</h2>
          </div>
          <p className="text-[var(--color-error)] opacity-90 ml-9">{error}</p>
        </Card>
      </main>
    );
  }

  // -------------------------------------------------------------------------
  // Render: Progressive page — NO fullscreen spinner
  // Always render structure, progressively populate sections
  // -------------------------------------------------------------------------

  return (
    <main className="max-w-5xl mx-auto p-4 sm:p-8 animate-fade-in">
      {/* ================================================================= */}
      {/* PHASE 1: Instant Repository Recognition                            */}
      {/* Renders immediately with owner/name from URL, then populates       */}
      {/* GitHub meta as soon as it arrives (typically < 1s)                  */}
      {/* ================================================================= */}
      <section className="mb-6">
        <RepoMetaHeader
          owner={repo?.owner || repoId.split("-")[0] || ""}
          name={repo?.name || ""}
          meta={githubMeta}
          totalCommits={repo?.total_commits}
          isLoading={!githubMeta}
        />
      </section>

      {/* ================================================================= */}
      {/* Header — Status, actions (sticky)                                  */}
      {/* ================================================================= */}
      <header className="mb-6 sticky top-16 z-40 bg-black/80 backdrop-blur-2xl border-b border-white/5 py-3 -mx-4 px-4 sm:-mx-8 sm:px-8 shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 max-w-5xl mx-auto">
          <div className="flex items-center gap-3">
            {/* Status Pill */}
            {repo && (
              <div className="group relative flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-semibold cursor-default hover:bg-white/10 transition-colors">
                {isBackgroundIndexing && (
                  <div className="w-3 h-3 rounded-full border-2 border-t-transparent animate-spin" style={{ borderRightColor: getStatusColor(repo.status), borderBottomColor: getStatusColor(repo.status), borderLeftColor: getStatusColor(repo.status), borderTopColor: 'transparent' }} />
                )}
                {repo.status === "ready" && (
                  <div className="w-2 h-2 rounded-full shadow-[0_0_8px_currentColor]" style={{ backgroundColor: getStatusColor(repo.status), color: getStatusColor(repo.status) }} />
                )}
                {isInitialIndexing && (
                  <div className="w-3 h-3 rounded-full border-2 border-t-transparent animate-spin" style={{ borderRightColor: getStatusColor(repo.status), borderBottomColor: getStatusColor(repo.status), borderLeftColor: getStatusColor(repo.status), borderTopColor: 'transparent' }} />
                )}
                <span style={{ color: getStatusColor(repo.status) }}>
                  {getStatusLabel(repo.status)} {isBackgroundIndexing ? `${progressPercent}%` : ""}
                </span>

                {/* Hover Tooltip */}
                <div className="absolute top-full left-0 mt-2 w-64 p-3 bg-[#111]/95 backdrop-blur-3xl border border-white/10 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 group-hover:translate-y-1 z-50">
                  <div className="flex justify-between mb-1">
                    <span className="text-xs text-white/50">Indexed</span>
                    <span className="text-xs font-mono text-white">{repo.indexed_commits.toLocaleString()} / {repo.total_commits.toLocaleString()}</span>
                  </div>
                  <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden mb-2 shadow-inner">
                    <div className="h-full bg-gradient-to-r from-[var(--color-accent-primary)] to-purple-500 transition-all duration-700" style={{ width: `${progressPercent}%` }} />
                  </div>
                  <div className="text-[10px] text-white/40 text-right">
                    Last sync: {timeAgo(repo.last_indexed_at)}
                  </div>
                </div>
              </div>
            )}

            {/* Metric chips (visible when we have data) */}
            {repo && repo.indexed_commits > 0 && (
              <span className="text-xs font-mono text-white/25 hidden sm:inline">
                {repo.indexed_commits.toLocaleString()} commits indexed
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
            <Button
              variant="secondary"
              onClick={handleSync}
              isLoading={isSyncing}
              disabled={isInitialIndexing}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-white transition-all duration-300 hover:shadow-lg h-9 px-4 text-sm font-semibold disabled:opacity-50"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={isSyncing ? "animate-spin" : ""}>
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.92-10.44l5.46-5.46"/>
              </svg>
              {isSyncing ? "Syncing" : "Sync"}
            </Button>

            <Button
              variant={isSaved ? "secondary" : "primary"}
              onClick={handleSaveToggle}
              isLoading={isSaving}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 rounded-lg h-9 px-4 text-sm font-bold"
            >
              {isSaved ? (
                <>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" stroke="none"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
                  Saved
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
                  Save
                </>
              )}
            </Button>
          </div>
        </div>
      </header>

      {/* ================================================================= */}
      {/* PHASE 2: Analysis Progress (only during initial indexing)           */}
      {/* Shows meaningful pipeline stages with real metrics                  */}
      {/* ================================================================= */}
      {repo && (
        <section className="mb-8 animate-slide-in">
          <Card className="p-5 rounded-2xl bg-[#0a0a0a] border border-white/5">
            {analysisPhase === "refreshing" && (
              <div className="flex items-center gap-3 text-blue-400 font-medium">
                <div className="w-5 h-5 flex-shrink-0 flex items-center justify-center">
                  <div className="w-4 h-4 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                </div>
                <span>Refreshing Repository Analysis...</span>
              </div>
            )}
            
            {analysisPhase === "active" && (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <AIThinkingIndicator
                    status={repo.status}
                    metrics={{
                      indexedCommits: repo.indexed_commits,
                      totalCommits: repo.total_commits,
                    }}
                  />
                </div>
                <AnalysisProgress
                  pipelineState={pipelineState}
                  indexedCommits={repo.indexed_commits}
                  totalCommits={repo.total_commits}
                  indexingProgress={repo.indexing_progress}
                />
              </>
            )}

            {analysisPhase === "completed" && (
              <AnalysisCompleted
                totalCommits={repo.total_commits}
                completedAt={repo.updated_at}
              />
            )}
          </Card>
        </section>
      )}

      {/* ================================================================= */}
      {/* Tab Navigation — KEPT for power users                              */}
      {/* Added "Overview" as default landing tab                            */}
      {/* ================================================================= */}
      <div className="mb-8 overflow-x-auto scrollbar-none pb-2 sm:pb-0 -mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="inline-flex items-center p-1.5 bg-white/5 border border-white/10 rounded-full whitespace-nowrap min-w-max shadow-inner">
          {[
            { id: "overview", label: "Overview" },
            { id: "timeline", label: "Commit Timeline" },
            { id: "analytics", label: "Contributor Analytics" },
            { id: "releases", label: "Release Notes", requiresAuth: true },
            { id: "risk", label: "Risk Analysis", requiresAuth: true },
            { id: "evolution", label: "Code Evolution" },
            { id: "functions", label: "Function History" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                if (tab.requiresAuth && !user) {
                  window.location.href = "/login";
                  return;
                }
                setActiveTab(tab.id as any);
              }}
              className={`px-5 py-2 rounded-full text-sm font-medium transition-all duration-300 ${activeTab === tab.id ? "bg-white/10 text-white shadow-sm border border-white/10" : "text-white/50 hover:text-white hover:bg-white/5 border border-transparent"}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ================================================================= */}
      {/* Tab Content                                                        */}
      {/* ================================================================= */}

      {activeTab === "overview" ? (
        <div className="space-y-10 animate-fade-in">
          {/* ============================================================= */}
          {/* PHASE 3: Repository Story (chapter-based, streaming)            */}
          {/* ============================================================= */}
          <section>
            <Card className="p-6 sm:p-8 rounded-2xl bg-[#0a0a0a] border border-white/5 relative overflow-hidden">
              {/* Subtle gradient accent */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-purple-500/10 via-blue-500/5 to-transparent rounded-full blur-[80px] -mr-32 -mt-32 pointer-events-none" />
              <div className="relative z-10">
                <Suspense fallback={<TimelineSkeleton />}>
                  <StreamingStory
                    repo={repo || ({} as Repository)}
                    journey={journey}
                    isJourneyLoading={journeyLoading}
                  />
                </Suspense>
              </div>
            </Card>
          </section>

          {/* ============================================================= */}
          {/* PHASE 4: Live Milestone Timeline                               */}
          {/* ============================================================= */}
          <section>
            <Card className="p-6 sm:p-8 rounded-2xl bg-[#0a0a0a] border border-white/5">
              <Suspense fallback={<TimelineSkeleton />}>
                <LiveTimeline
                  journey={journey}
                  isLoading={journeyLoading}
                  isIndexing={isIndexing}
                />
              </Suspense>
            </Card>
          </section>
          {/* PHASE 5: Quick Stats (progressive)                             */}
          {/* ============================================================= */}
          <ProgressiveSection
            isLoading={!repo || repo.indexed_commits === 0}
            skeleton={<StatCardSkeleton count={4} />}
          >
            {repo && journey?.stats && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  {
                    label: "Repository Age",
                    value: `${Math.round(journey.stats.repository_age_days / 365 * 10) / 10}y`,
                    sub: `${journey.stats.repository_age_days.toLocaleString()} days`,
                  },
                  {
                    label: "Contributors",
                    value: journey.stats.contributors_count.toLocaleString(),
                    sub: "unique authors",
                  },
                  {
                    label: "Health Score",
                    value: `${journey.stats.repository_health_score}/100`,
                    sub: journey.stats.repository_health_score >= 70 ? "Healthy" : journey.stats.repository_health_score >= 40 ? "Moderate" : "Needs attention",
                    color: journey.stats.repository_health_score >= 70 ? "text-green-400" : journey.stats.repository_health_score >= 40 ? "text-yellow-400" : "text-red-400",
                  },
                  {
                    label: "Velocity",
                    value: `${Math.round(journey.stats.development_velocity)}`,
                    sub: "commits/month avg",
                  },
                ].map((stat, i) => (
                  <div
                    key={stat.label}
                    className="animate-slide-in rounded-2xl border border-white/5 bg-white/[0.02] p-4"
                    style={{ animationDelay: `${i * 80}ms` }}
                  >
                    <div className="text-[10px] uppercase tracking-wider text-white/30 font-bold mb-1">
                      {stat.label}
                    </div>
                    <div className={`text-xl font-bold ${(stat as any).color || "text-white"}`}>
                      {stat.value}
                    </div>
                    <div className="text-[11px] text-white/30 mt-0.5">{stat.sub}</div>
                  </div>
                ))}
              </div>
            )}
          </ProgressiveSection>

          {/* ============================================================= */}
          {/* PHASE 6: Explore Next — Contextual recommendations             */}
          {/* ============================================================= */}
          {repo && (repo.status === "ready" || isBackgroundIndexing) && (
            <section className="animate-slide-in" style={{ animationDelay: "400ms" }}>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-[10px] uppercase tracking-widest text-white/30 font-bold">Explore Next</span>
                <div className="flex-1 h-px bg-white/5" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {[
                  { tab: "timeline" as const, icon: "📈", title: "Commit Timeline", desc: `Browse ${repo.indexed_commits.toLocaleString()} commits chronologically`, color: "from-blue-500/20 to-cyan-500/10" },
                  { tab: "evolution" as const, icon: "🔄", title: "Code Evolution", desc: "Visualize how the architecture changed over time", color: "from-purple-500/20 to-pink-500/10" },
                  { tab: "analytics" as const, icon: "👥", title: "Contributor Analytics", desc: "Discover who drives the most impact", color: "from-green-500/20 to-emerald-500/10" },
                  ...(user ? [
                    { tab: "risk" as const, icon: "🛡️", title: "Risk Analysis", desc: "Scan for breaking changes and vulnerabilities", color: "from-orange-500/20 to-red-500/10" },
                    { tab: "releases" as const, icon: "📋", title: "Release Notes", desc: "AI-generated release summaries", color: "from-yellow-500/20 to-amber-500/10" },
                  ] : []),
                ].map((item) => (
                  <button
                    key={item.tab}
                    onClick={() => setActiveTab(item.tab)}
                    className="group text-left p-4 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-white/10 hover:bg-white/5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg relative overflow-hidden"
                  >
                    <div className={`absolute inset-0 bg-gradient-to-br ${item.color} opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none`} />
                    <div className="relative z-10">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg">{item.icon}</span>
                        <span className="text-sm font-semibold text-white group-hover:text-white transition-colors">{item.title}</span>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/20 group-hover:text-white/50 transition-all group-hover:translate-x-0.5 ml-auto">
                          <path d="M5 12h14M12 5l7 7-7 7"/>
                        </svg>
                      </div>
                      <p className="text-xs text-white/30 group-hover:text-white/50 transition-colors leading-relaxed">
                        {item.desc}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>

      ) : activeTab === "evolution" ? (
        <TabErrorBoundary tabName="Code Evolution">
          <Suspense fallback={<ChartSkeleton />}>
            <CodeEvolution repo={repo!} onJumpToTimeline={handleJumpToTimeline} isIndexing={isIndexing} user={user} />
          </Suspense>
        </TabErrorBoundary>
      ) : activeTab === "analytics" ? (
        <TabErrorBoundary tabName="Contributor Analytics">
          <Suspense fallback={<ContributorGridSkeleton count={6} />}>
            <AnalyticsDashboard repoId={repoId} isIndexing={isIndexing} />
          </Suspense>
        </TabErrorBoundary>
      ) : activeTab === "functions" ? (
        <TabErrorBoundary tabName="Function History">
          <Suspense fallback={<ChartSkeleton />}>
            <FunctionHistory repoId={repoId} />
          </Suspense>
        </TabErrorBoundary>
      ) : activeTab === "releases" ? (
        <TabErrorBoundary tabName="Release Notes">
          <Suspense fallback={<ChartSkeleton />}>
            <ReleaseNotes repoId={repoId} />
          </Suspense>
        </TabErrorBoundary>
      ) : activeTab === "risk" ? (
        <TabErrorBoundary tabName="Risk Analysis">
          <Suspense fallback={<ChartSkeleton />}>
            <RiskAnalysis repoId={repoId} />
          </Suspense>
        </TabErrorBoundary>
      ) : (
        /* ================================================================= */
        /* Timeline tab — existing commit timeline (preserved)                */
        /* ================================================================= */
        <div className="animate-fade-in">
          {/* Search bar */}
          <div className="mb-10">
            <form onSubmit={handleSearch} className="relative group max-w-2xl mx-auto">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-full blur opacity-0 group-focus-within:opacity-100 transition duration-500 pointer-events-none"></div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-white/40 group-focus-within:text-white transition-colors duration-300">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                </div>
                <input
                  type="text"
                  className="w-full bg-[#0a0a0a] border border-white/10 text-white rounded-full py-3.5 pl-12 pr-12 focus:outline-none focus:border-white/20 focus:bg-white/5 transition-all duration-300 placeholder:text-white/40 shadow-inner text-sm font-medium"
                  placeholder="Search commits by meaning (e.g., 'when did we add auth?')"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button type="button" onClick={clearSearch} className="absolute inset-y-0 right-0 pr-5 flex items-center text-white/40 hover:text-white transition-colors animate-fade-in">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                )}
              </div>
            </form>
            {isSearching && (
              <div className="text-xs mt-4 text-white/60 animate-pulse flex items-center justify-center gap-2">
                <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                Searching repository history...
              </div>
            )}
            {searchResults && !isSearching && (
              <div className="flex items-center justify-center gap-4 mt-4 animate-fade-in">
                 <p className="text-sm text-blue-400 font-medium">Found {searchResults.length} matching commits</p>
                 <button onClick={clearSearch} className="text-xs font-semibold text-white/50 hover:text-white transition-colors px-3 py-1 rounded-full bg-white/5 border border-white/10 hover:bg-white/10">Clear Search</button>
              </div>
            )}
          </div>

          {/* Commit Timeline */}
          <ProgressiveSection
            isLoading={commits.length === 0 && !searchResults}
            skeleton={<TimelineSkeleton count={5} />}
          >
            <div className="flex flex-col gap-6 relative">
              {/* Timeline line behind cards */}
              <div className="absolute left-[15px] sm:left-[31px] top-4 bottom-0 w-[2px] bg-gradient-to-b from-blue-500/50 via-purple-500/20 to-transparent -z-10" />

              {(searchResults || commits).map((commit, index) => (
                <div key={commit.sha} className="flex gap-4 sm:gap-6 group animate-slide-in" style={{ animationDelay: `${Math.min(index * 50, 500)}ms` }}>
                  {/* Timeline dot */}
                  <div className="mt-7 w-8 sm:w-16 flex-shrink-0 flex justify-center relative">
                    <div className="w-3.5 h-3.5 rounded-full bg-black border-[2px] border-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.6)] z-10 relative group-hover:scale-125 group-hover:bg-blue-500 transition-all duration-300" />
                  </div>

                  <Card className="flex-1 p-5 sm:p-5 transition-all duration-300 rounded-2xl bg-[#0a0a0a] border border-white/5 hover:bg-white/5 hover:border-white/10 shadow-sm backdrop-blur-md group-hover:-translate-y-0.5 relative overflow-hidden">
                    {/* Subtle inner highlight */}
                    <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                    <div className="flex flex-col sm:flex-row justify-between items-start gap-4 sm:gap-6 relative z-10">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base sm:text-lg font-bold mb-2 text-white leading-snug break-words tracking-tight group-hover:text-blue-400 transition-colors duration-300">
                          {commit.message.split("\n")[0]}
                        </h3>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 text-xs text-white/50 font-medium">
                          <span className="flex items-center gap-1.5 text-white/70">
                            <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-blue-500/40 to-purple-500/40 border border-white/10 flex items-center justify-center text-[10px] text-white">
                              {commit.author_name[0]?.toUpperCase()}
                            </div>
                            {commit.author_name}
                          </span>
                          <span className="hidden sm:inline opacity-30">•</span>
                          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                            <span className="flex items-center gap-1.5">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                              {new Date(commit.authored_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                            <span className="font-mono bg-white/5 px-1.5 py-0.5 rounded border border-white/5 text-white/40">
                              {commit.sha.substring(0, 7)}
                            </span>
                            {commit.similarity !== undefined && commit.similarity < 1 && (
                              <span className="font-bold text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20">
                                Match: {(commit.similarity * 100).toFixed(1)}%
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      {user && (
                        <Button
                          variant="secondary"
                          onClick={() => handleExplain(commit.sha)}
                          isLoading={explanations[commit.sha]?.isExplaining}
                          className={`w-full sm:w-auto shrink-0 transition-all duration-300 h-8 px-3 text-xs font-semibold rounded-md border ${explanations[commit.sha] ? "bg-white/10 border-white/20 hover:bg-white/20 text-white" : "bg-white/5 border-white/10 text-white/70 hover:text-white hover:bg-white/10"}`}
                        >
                          {explanations[commit.sha] ? "Close Insights" : (
                            <span className="flex items-center gap-1.5">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
                              Explain
                            </span>
                          )}
                        </Button>
                      )}
                    </div>

                    {/* Explanation View */}
                    <div
                      className={`grid transition-all duration-300 ease-in-out ${explanations[commit.sha] ? "grid-rows-[1fr] mt-4 opacity-100" : "grid-rows-[0fr] opacity-0"}`}
                    >
                      <div className="overflow-hidden">
                        <div className="pt-4 border-t border-white/10">
                          {explanations[commit.sha]?.error ? (
                            <div className="flex items-center gap-2 text-[var(--color-error)] p-3 bg-[var(--color-error-bg)] rounded-lg text-sm">
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                              <p>{explanations[commit.sha].error}</p>
                            </div>
                          ) : explanations[commit.sha] ? (
                            <div className="prose prose-sm sm:prose-base prose-invert max-w-none text-[var(--color-text-secondary)] leading-relaxed">
                              <div dangerouslySetInnerHTML={{ __html: explanations[commit.sha].explanation.replace(/\n/g, "<br/>") }} />
                              <div className="mt-4 flex justify-end">
                                <span className="text-[10px] sm:text-xs font-mono text-[var(--color-text-tertiary)] flex items-center gap-1.5 opacity-70">
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                                  {explanations[commit.sha].model_id}
                                </span>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </Card>
                </div>
              ))}

              {/* Infinite scroll sentinel */}
              {hasMore && !searchResults && (
                <div
                  ref={loadMoreRef}
                  className="flex justify-center py-8"
                >
                  {isLoadingMore ? (
                    <div className="flex items-center gap-3 text-[var(--color-text-secondary)]">
                      <div className="w-5 h-5 rounded-full border-2 border-[var(--color-accent-primary)] border-t-transparent animate-spin" />
                      <span className="text-sm font-medium">Loading more commits…</span>
                    </div>
                  ) : (
                    <div className="w-6 h-6 rounded-full border-2 border-[var(--color-border)] border-t-transparent animate-spin opacity-30" />
                  )}
                </div>
              )}

              {/* End of list indicator */}
              {!hasMore && commits.length > 0 && !searchResults && (
                <div className="flex justify-center py-6">
                  <p className="text-xs text-[var(--color-text-tertiary)] font-medium">
                    {isBackgroundIndexing
                      ? `Showing ${commits.length} of ${repo?.indexed_commits.toLocaleString()} indexed commits — more loading in background…`
                      : `All ${commits.length} commits loaded`
                    }
                  </p>
                </div>
              )}
            </div>
          </ProgressiveSection>
        </div>
      )}
    </main>
  );
}
