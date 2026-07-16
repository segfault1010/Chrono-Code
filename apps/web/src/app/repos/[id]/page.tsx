"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { api } from "../../../lib/api";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { AnalyticsDashboard } from "../../../components/AnalyticsDashboard";
import { ReleaseNotes } from "@/components/ReleaseNotes";
import { RiskAnalysis } from "@/components/RiskAnalysis";
import { CodeEvolution } from "@/components/CodeEvolution";
import { FunctionHistory } from "@/components/FunctionHistory";
import { TabErrorBoundary } from "@/components/ui/TabErrorBoundary";
import type { Repository, Commit } from "@chronocode/shared-types";
import { createClient } from "../../../lib/supabase/client";

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
    case "indexing_history": return "var(--color-accent-primary)";
    case "indexing": case "cloning": case "queued": return "var(--color-warning, #f59e0b)";
    case "failed": return "var(--color-error)";
    default: return "var(--color-text-tertiary)";
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case "ready": return "Ready";
    case "indexing_history": return "Indexing History…";
    case "indexing": return "Indexing…";
    case "cloning": return "Cloning…";
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

  const [repo, setRepo] = useState<Repository | null>(null);
  const [commits, setCommits] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [explanations, setExplanations] = useState<Record<string, { explanation: string, model_id: string, error?: string, isExplaining?: boolean }>>({});
  
  const [user, setUser] = useState<any>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  
  const [activeTab, setActiveTab] = useState<"timeline" | "analytics" | "releases" | "risk" | "evolution" | "functions">("timeline");
  const [isSyncing, setIsSyncing] = useState(false);

  // Infinite scroll sentinel ref
  const scrollSentinelRef = useRef<HTMLDivElement>(null);

  // Reset to timeline when switching repos
  useEffect(() => {
    setActiveTab("timeline");
  }, [repoId]);

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------

  useEffect(() => {
    let pollInterval: NodeJS.Timeout;

    const fetchRepo = async () => {
      try {
        const data = await api.repos.get(repoId);
        setRepo(data);
        
        // Always load latest commits if we're on the first page, so the timeline is live!
        if (page === 1) {
          loadCommits(1);
        }

        // The repo is "usable" once it has data — either indexing_history or ready
        const isUsable = data.status === "ready" || data.status === "indexing_history";
        
        if (isUsable) {
          setIsLoading(false);
        }

        if (data.status === "ready") {
          // Fully done — stop polling
          clearInterval(pollInterval);
        } else if (data.status === "failed") {
          setError(data.error_message || "Repository indexing failed.");
          setIsLoading(false);
          clearInterval(pollInterval);
        }
        // For indexing_history, queued, cloning, indexing — keep polling
      } catch (err: any) {
        setError(err.message || "Failed to load repository.");
        setIsLoading(false);
        clearInterval(pollInterval);
      }
    };

    fetchRepo();

    const checkAuthAndSaved = async () => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
        try {
          const saved = await api.user.getSavedRepos();
          setIsSaved(saved.some(r => r.id === repoId));
        } catch (e) {}
      }
    };
    checkAuthAndSaved();

    // Poll every 3s during initial indexing, 5s during history indexing
    pollInterval = setInterval(fetchRepo, 3000);

    return () => clearInterval(pollInterval);
  }, [repoId, isSyncing]); // Re-run effect if we trigger a sync

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

    // If it's already open, close it (by removing it from state)
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
      })); // Stop loading spinner as soon as stream starts

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
    
    // Trigger the search directly
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

  // -------------------------------------------------------------------------
  // Render: Error state
  // -------------------------------------------------------------------------

  if (error) {
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
  // Render: Loading state (only during initial Phase 1 — before first commits)
  // -------------------------------------------------------------------------

  if (isLoading || !repo) {
    return (
      <main className="min-h-[60vh] flex items-center justify-center p-8 animate-fade-in">
        <div className="flex flex-col items-center gap-6">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full border-4 border-[var(--color-border)] opacity-20"></div>
            <div className="absolute inset-0 rounded-full border-4 border-[var(--color-accent-primary)] border-t-transparent animate-spin"></div>
          </div>
          <p className="text-[var(--color-text-secondary)] font-medium tracking-wide animate-pulse">
            {repo ? `Status: ${getStatusLabel(repo.status)}` : "Loading repository data..."}
          </p>
          {repo && repo.total_commits > 0 && (
            <p className="text-sm text-[var(--color-text-tertiary)]">
              {repo.total_commits.toLocaleString()} commits found — indexing first batch…
            </p>
          )}
        </div>
      </main>
    );
  }

  const handleSync = async () => {
    if (isInitialIndexing || isSyncing) return;
    try {
      setIsSyncing(true);
      setPage(1); // Reset to page 1
      
      const res = await api.repos.sync(repoId);
      if (res.repo) {
        setRepo(res.repo);
      }
      
      // Poll a few times to catch the new commits as the background sync job runs
      let attempts = 0;
      const pollTimer = setInterval(async () => {
        attempts++;
        try {
          const latestRepo = await api.repos.get(repoId);
          setRepo(latestRepo);
          loadCommits(1); // Force reload the first page to get recent commits
        } catch (e) {}
        
        if (attempts >= 5) {
          clearInterval(pollTimer);
          setIsSyncing(false);
        }
      }, 2000);
      
      // Don't set isSyncing(false) here, let the interval handle it
      return;
    } catch (err: any) {
      console.error("Sync failed:", err);
      setIsSyncing(false);
    }
  };

  // Initial indexing = Phase 1 (before any data is available)
  const isInitialIndexing = repo.status === "queued" || repo.status === "cloning" || repo.status === "indexing";
  // Background indexing = Phase 2 (repo is usable, history still loading)
  const isBackgroundIndexing = repo.status === "indexing_history";
  const isIndexing = isInitialIndexing || isBackgroundIndexing;
  let progressPercent = 0;
  if (repo.status === "ready") {
    progressPercent = 100;
  } else if (repo.indexing_progress) {
    progressPercent = repo.indexing_progress;
  } else if (repo.total_commits > 0) {
    progressPercent = Math.round((repo.indexed_commits / repo.total_commits) * 100 * 10) / 10;
  }

  // -------------------------------------------------------------------------
  // Render: Main page
  // -------------------------------------------------------------------------

  return (
    <main className="max-w-5xl mx-auto p-4 sm:p-8 animate-fade-in">
      {/* ================================================================= */}
      {/* Header — Repository name, progress, actions                       */}
      {/* ================================================================= */}
      <header className="mb-10 sm:mb-12 border-b border-[var(--color-border)] pb-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-5">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight bg-gradient-to-r from-white to-[var(--color-text-secondary)] bg-clip-text text-transparent">
              {repo.owner}/{repo.name}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Button 
              variant="secondary"
              onClick={handleSync}
              isLoading={isSyncing}
              disabled={isInitialIndexing}
              className="shrink-0 flex items-center gap-2 shadow-sm hover:shadow-md transition-all border border-white/10"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={isSyncing ? "animate-spin" : ""}>
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.92-10.44l5.46-5.46"/>
              </svg>
              {isSyncing ? "Syncing…" : "Sync Latest Commits"}
            </Button>
            
            <Button 
              variant={isSaved ? "secondary" : "primary"} 
              onClick={handleSaveToggle}
              isLoading={isSaving}
              className="shrink-0 flex items-center gap-2 shadow-md hover:shadow-lg transition-all border border-white/10"
            >
              {isSaved ? (
                <>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" stroke="none"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
                  Saved
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
                  Save to Dashboard
                </>
              )}
            </Button>
          </div>
        </div>

        {/* =============================================================== */}
        {/* Indexing Progress Panel                                          */}
        {/* =============================================================== */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-sm">
          {/* Total Commits */}
          <div className="flex flex-col gap-1">
            <span className="text-[var(--color-text-tertiary)] text-xs font-medium uppercase tracking-wider">Total Commits</span>
            <span className="text-[var(--color-text-primary)] font-bold text-lg tabular-nums">
              {repo.total_commits.toLocaleString()}
            </span>
          </div>

          {/* Indexed */}
          <div className="flex flex-col gap-1">
            <span className="text-[var(--color-text-tertiary)] text-xs font-medium uppercase tracking-wider">Indexed</span>
            <span className="text-[var(--color-text-primary)] font-bold text-lg tabular-nums">
              {repo.indexed_commits.toLocaleString()}
              <span className="text-[var(--color-text-tertiary)] font-normal text-sm ml-1">
                / {repo.total_commits.toLocaleString()}
              </span>
            </span>
          </div>

          {/* Progress */}
          <div className="flex flex-col gap-1">
            <span className="text-[var(--color-text-tertiary)] text-xs font-medium uppercase tracking-wider">Progress</span>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 rounded-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] overflow-hidden">
                <div 
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{ 
                    width: `${progressPercent}%`,
                    background: progressPercent >= 100 
                      ? 'linear-gradient(90deg, #22c55e, #16a34a)' 
                      : 'linear-gradient(90deg, var(--color-accent-primary), var(--color-accent-secondary, #a855f7))',
                    boxShadow: progressPercent < 100 
                      ? '0 0 8px var(--color-accent-primary)' 
                      : '0 0 8px #22c55e'
                  }}
                />
              </div>
              <span className="text-[var(--color-text-secondary)] font-bold text-sm tabular-nums min-w-[3rem] text-right">
                {progressPercent}%
              </span>
            </div>
          </div>

          {/* Status */}
          <div className="flex flex-col gap-1">
            <span className="text-[var(--color-text-tertiary)] text-xs font-medium uppercase tracking-wider">Status</span>
            <span className="flex items-center gap-2 font-semibold" style={{ color: getStatusColor(repo.status) }}>
              {isBackgroundIndexing && (
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: getStatusColor(repo.status) }}></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ backgroundColor: getStatusColor(repo.status) }}></span>
                </span>
              )}
              {repo.status === "ready" && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5"/></svg>
              )}
              {getStatusLabel(repo.status)}
            </span>
          </div>

          {/* Last Sync */}
          <div className="flex flex-col gap-1">
            <span className="text-[var(--color-text-tertiary)] text-xs font-medium uppercase tracking-wider">Last Sync</span>
            <span className="text-[var(--color-text-secondary)] font-medium">
              {timeAgo(repo.last_indexed_at)}
            </span>
          </div>
        </div>
      </header>

      {/* ================================================================= */}
      {/* Tab Navigation                                                     */}
      {/* ================================================================= */}
      <div className="flex gap-6 border-b border-[var(--color-border)] mb-8">
        <button 
          onClick={() => setActiveTab("timeline")}
          className={`pb-3 font-medium text-sm transition-colors relative ${activeTab === "timeline" ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"}`}
        >
          Commit Timeline
          {activeTab === "timeline" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--color-accent-primary)] shadow-[0_0_8px_var(--color-accent-primary)]" />}
        </button>
        <button 
          onClick={() => setActiveTab("analytics")}
          className={`pb-3 font-medium text-sm transition-colors relative ${activeTab === "analytics" ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"}`}
        >
          Contributor Analytics
          {activeTab === "analytics" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--color-accent-primary)] shadow-[0_0_8px_var(--color-accent-primary)]" />}
        </button>
        <button 
          onClick={() => {
            if (!user) {
              window.location.href = "/login";
              return;
            }
            setActiveTab("releases");
          }}
          className={`pb-3 font-medium text-sm transition-colors relative ${activeTab === "releases" ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"}`}
        >
          Release Notes
          {activeTab === "releases" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--color-accent-primary)] shadow-[0_0_8px_var(--color-accent-primary)]" />}
        </button>
        <button 
          onClick={() => {
            if (!user) {
              window.location.href = "/login";
              return;
            }
            setActiveTab("risk");
          }}
          className={`pb-3 font-medium text-sm transition-colors relative ${activeTab === "risk" ? "text-orange-500" : "text-[var(--color-text-tertiary)] hover:text-orange-400"}`}
        >
          Risk Analysis
          {activeTab === "risk" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-500 shadow-[0_0_8px_theme(colors.orange.500)]" />}
        </button>
        <button 
          onClick={() => setActiveTab("evolution")}
          className={`pb-3 font-medium text-sm transition-colors relative ${activeTab === "evolution" ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"}`}
        >
          Code Evolution
          {activeTab === "evolution" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--color-accent-primary)] shadow-[0_0_8px_var(--color-accent-primary)]" />}
        </button>
        <button 
          onClick={() => setActiveTab("functions")}
          className={`pb-3 font-medium text-sm transition-colors relative ${activeTab === "functions" ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"}`}
        >
          Function History
          {activeTab === "functions" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--color-accent-primary)] shadow-[0_0_8px_var(--color-accent-primary)]" />}
        </button>
      </div>

      {/* ================================================================= */}
      {/* Tab Content                                                        */}
      {/* ================================================================= */}

      {activeTab === "evolution" ? (
        <TabErrorBoundary tabName="Code Evolution">
          <CodeEvolution repo={repo} onJumpToTimeline={handleJumpToTimeline} isIndexing={isIndexing} user={user} />
        </TabErrorBoundary>
      ) : activeTab === "analytics" ? (
        <TabErrorBoundary tabName="Contributor Analytics">
          <AnalyticsDashboard repoId={repoId} isIndexing={isIndexing} />
        </TabErrorBoundary>
      ) : activeTab === "functions" ? (
        <TabErrorBoundary tabName="Function History">
          <FunctionHistory repoId={repoId} />
        </TabErrorBoundary>
      ) : activeTab === "releases" ? (
        <TabErrorBoundary tabName="Release Notes">
          <ReleaseNotes repoId={repoId} />
        </TabErrorBoundary>
      ) : activeTab === "risk" ? (
        <TabErrorBoundary tabName="Risk Analysis">
          <RiskAnalysis repoId={repoId} />
        </TabErrorBoundary>
      ) : (
        <div className="animate-fade-in">
          {/* Search bar */}
          <div className="mb-8">
        <form onSubmit={handleSearch} className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[var(--color-text-tertiary)]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </div>
          <input
            type="text"
            className="w-full bg-[var(--color-bg-elevated)] border border-[var(--color-border)] text-[var(--color-text-primary)] rounded-full py-3 pl-10 pr-12 focus:outline-none focus:border-[var(--color-accent-primary)] focus:ring-1 focus:ring-[var(--color-accent-primary)] transition-all placeholder:text-[var(--color-text-tertiary)]"
            placeholder="Search commits by meaning (e.g., 'when did we add auth?')"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button type="button" onClick={clearSearch} className="absolute inset-y-0 right-0 pr-4 flex items-center text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          )}
        </form>
        {isSearching && (
          <p className="text-sm mt-3 text-[var(--color-text-secondary)] animate-pulse pl-4">Searching repository history...</p>
        )}
        {searchResults && !isSearching && (
          <div className="flex items-center justify-between mt-3 pl-4 animate-fade-in">
             <p className="text-sm text-[var(--color-accent-primary)] font-medium">Found {searchResults.length} matching commits</p>
             <button onClick={clearSearch} className="text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] underline underline-offset-2 transition-colors">Clear Search</button>
          </div>
        )}
      </div>

      {/* Commit Timeline */}
      <div className="flex flex-col gap-5 relative">
        {/* Timeline line behind cards */}
        <div className="absolute left-[27px] sm:left-[35px] top-0 bottom-0 w-0.5 bg-gradient-to-b from-[var(--color-accent-primary)]/20 via-[var(--color-border)] to-transparent -z-10" />

        {(searchResults || commits).map((commit) => (
          <div key={commit.sha} className="flex gap-4 sm:gap-6 group">
            {/* Timeline dot */}
            <div className="mt-6 flex-shrink-0 relative">
              <div className="w-4 h-4 rounded-full bg-[var(--color-bg-primary)] border-2 border-[var(--color-accent-primary)] shadow-[0_0_10px_var(--color-accent-primary)] z-10 relative group-hover:scale-125 transition-transform" />
            </div>

            <Card className="flex-1 p-5 sm:p-6 transition-all duration-300 hover:shadow-xl hover:border-[var(--color-accent-primary)]/30 bg-[var(--color-bg-elevated)]/60 backdrop-blur-sm">
              <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold mb-3 text-[var(--color-text-primary)] leading-snug break-words">
                    {commit.message.split("\n")[0]}
                  </h3>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[var(--color-text-tertiary)] font-medium">
                    <span className="flex items-center gap-1.5 text-[var(--color-text-secondary)]">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                      {commit.author_name}
                    </span>
                    <span className="hidden sm:inline">•</span>
                    <span className="flex items-center gap-1.5">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                      {new Date(commit.authored_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="hidden sm:inline">•</span>
                    <span className="font-mono text-xs bg-[var(--color-bg-primary)] px-2 py-1 rounded-md border border-[var(--color-border)]">
                      {commit.sha.substring(0, 7)}
                    </span>
                    {commit.similarity !== undefined && commit.similarity < 1 && (
                      <span className="text-xs font-semibold bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)] px-2 py-1 rounded-md border border-[var(--color-accent-primary)]/30">
                        Match: {(commit.similarity * 100).toFixed(1)}%
                      </span>
                    )}
                  </div>
                </div>
                {user && (
                  <Button
                    variant={explanations[commit.sha] ? "secondary" : "primary"}
                    onClick={() => handleExplain(commit.sha)}
                    isLoading={explanations[commit.sha]?.isExplaining}
                    className="w-full sm:w-auto shrink-0 shadow-sm"
                  >
                    {explanations[commit.sha] ? "Close Insights" : "AI Explain"}
                  </Button>
                )}
              </div>

              {/* Explanation View */}
              {explanations[commit.sha] && (
                <div className="mt-5 pt-5 border-t border-[var(--color-border)] animate-fade-in">
                  {explanations[commit.sha].error ? (
                    <div className="flex items-center gap-2 text-[var(--color-error)] p-3 bg-[var(--color-error-bg)] rounded-lg">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      <p>{explanations[commit.sha].error}</p>
                    </div>
                  ) : (
                    <div className="prose prose-invert max-w-none text-[var(--color-text-secondary)] leading-relaxed text-[15px]">
                      <div dangerouslySetInnerHTML={{ __html: explanations[commit.sha].explanation.replace(/\n/g, "<br/>") }} />
                      <div className="mt-4 flex justify-end">
                        <span className="text-xs font-mono text-[var(--color-text-tertiary)] flex items-center gap-1.5 opacity-70">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                          {explanations[commit.sha].model_id}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
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
                ? `Showing ${commits.length} of ${repo.indexed_commits.toLocaleString()} indexed commits — more loading in background…`
                : `All ${commits.length} commits loaded`
              }
            </p>
          </div>
        )}
      </div>
      </div>
      )}
    </main>
  );
}
