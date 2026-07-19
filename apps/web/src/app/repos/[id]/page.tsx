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

        // The repo is "usable" once it has data — either verifying, analytics, ai_generation, journey, or ready
        const usableStatuses = ["verifying", "analytics", "ai_generation", "journey", "ready"];
        const isUsable = usableStatuses.includes(data.status);
        
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

    // Poll every 2s
    pollInterval = setInterval(fetchRepo, 2000);

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
  const isInitialIndexing = ["queued", "pending", "cloning", "fetching_commits", "indexing"].includes(repo.status);
  // Background indexing = Phase 2 (repo is usable, history still loading)
  const isBackgroundIndexing = ["verifying", "analytics", "ai_generation", "journey"].includes(repo.status);
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
      <header className="mb-8 sticky top-0 z-40 bg-[#0a0a0a]/80 backdrop-blur-2xl border-b border-white/5 py-4 -mx-4 px-4 sm:-mx-8 sm:px-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              {repo.owner} / <span className="text-white/50">{repo.name}</span>
            </h1>
            
            {/* Status Pill */}
            <div className="group relative flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 backdrop-blur-md border border-white/10 text-sm font-medium">
              {isBackgroundIndexing && (
                <div className="w-3 h-3 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: getStatusColor(repo.status), borderTopColor: 'transparent' }} />
              )}
              {repo.status === "ready" && (
                <div className="w-2 h-2 rounded-full shadow-[0_0_8px_currentColor]" style={{ backgroundColor: getStatusColor(repo.status), color: getStatusColor(repo.status) }} />
              )}
              <span style={{ color: getStatusColor(repo.status) }}>
                {getStatusLabel(repo.status)} {isBackgroundIndexing ? `${progressPercent}%` : ""}
              </span>

              {/* Hover Tooltip for details */}
              <div className="absolute top-full left-0 mt-2 w-64 p-3 bg-[#111]/90 backdrop-blur-3xl border border-white/10 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 group-hover:translate-y-1 z-50">
                <div className="flex justify-between mb-1">
                  <span className="text-xs text-white/50">Indexed</span>
                  <span className="text-xs font-mono text-white">{repo.indexed_commits.toLocaleString()} / {repo.total_commits.toLocaleString()}</span>
                </div>
                <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden mb-2 shadow-inner">
                  <div className="h-full bg-gradient-to-r from-[var(--color-accent-primary)] to-purple-500" style={{ width: `${progressPercent}%` }} />
                </div>
                <div className="text-[10px] text-white/40 text-right">
                  Last sync: {timeAgo(repo.last_indexed_at)}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
            <Button 
              variant="secondary"
              onClick={handleSync}
              isLoading={isSyncing}
              disabled={isInitialIndexing}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 text-white transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg h-10 px-5 text-sm font-semibold disabled:opacity-50"
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
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 rounded-full transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_10px_20px_rgba(0,0,0,0.5)] h-10 px-5 text-sm font-bold ${isSaved ? "bg-white/5 border border-white/10 text-white hover:bg-white/10" : "bg-white border border-transparent text-black shadow-[0_0_20px_rgba(255,255,255,0.2)]"}`}
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
      {/* Tab Navigation                                                     */}
      {/* ================================================================= */}
      <div className="mb-8 overflow-x-auto scrollbar-none pb-2 sm:pb-0 -mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="inline-flex items-center p-1.5 bg-white/5 backdrop-blur-md border border-white/10 rounded-full whitespace-nowrap min-w-max shadow-inner">
          <button 
            onClick={() => setActiveTab("timeline")}
            className={`px-5 py-2 rounded-full text-sm font-semibold transition-all duration-300 ${activeTab === "timeline" ? "bg-white/10 text-white shadow-md border border-white/10" : "text-white/50 hover:text-white hover:bg-white/5 border border-transparent"}`}
          >
            Commit Timeline
          </button>
          <button 
            onClick={() => setActiveTab("analytics")}
            className={`px-5 py-2 rounded-full text-sm font-semibold transition-all duration-300 ${activeTab === "analytics" ? "bg-white/10 text-white shadow-md border border-white/10" : "text-white/50 hover:text-white hover:bg-white/5 border border-transparent"}`}
          >
            Contributor Analytics
          </button>
          <button 
            onClick={() => {
              if (!user) {
                window.location.href = "/login";
                return;
              }
              setActiveTab("releases");
            }}
            className={`px-5 py-2 rounded-full text-sm font-semibold transition-all duration-300 ${activeTab === "releases" ? "bg-white/10 text-white shadow-md border border-white/10" : "text-white/50 hover:text-white hover:bg-white/5 border border-transparent"}`}
          >
            Release Notes
          </button>
          <button 
            onClick={() => {
              if (!user) {
                window.location.href = "/login";
                return;
              }
              setActiveTab("risk");
            }}
            className={`px-5 py-2 rounded-full text-sm font-semibold transition-all duration-300 ${activeTab === "risk" ? "bg-orange-500/20 text-orange-400 shadow-[0_0_15px_rgba(249,115,22,0.3)] border border-orange-500/30" : "text-white/50 hover:text-orange-400 hover:bg-white/5 border border-transparent"}`}
          >
            Risk Analysis
          </button>
          <button 
            onClick={() => setActiveTab("evolution")}
            className={`px-5 py-2 rounded-full text-sm font-semibold transition-all duration-300 ${activeTab === "evolution" ? "bg-white/10 text-white shadow-md border border-white/10" : "text-white/50 hover:text-white hover:bg-white/5 border border-transparent"}`}
          >
            Code Evolution
          </button>
          <button 
            onClick={() => setActiveTab("functions")}
            className={`px-5 py-2 rounded-full text-sm font-semibold transition-all duration-300 ${activeTab === "functions" ? "bg-white/10 text-white shadow-md border border-white/10" : "text-white/50 hover:text-white hover:bg-white/5 border border-transparent"}`}
          >
            Function History
          </button>
        </div>
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
            <form onSubmit={handleSearch} className="relative group max-w-2xl mx-auto">
              <div className="absolute -inset-1 bg-gradient-to-r from-[var(--color-accent-primary)] via-purple-500 to-[var(--color-accent-secondary)] rounded-full blur-[10px] opacity-10 group-focus-within:opacity-30 transition duration-500 pointer-events-none"></div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none text-white/40 group-focus-within:text-white transition-colors duration-300">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                </div>
                <input
                  type="text"
                  className="w-full bg-white/5 backdrop-blur-xl border border-white/10 text-white rounded-full py-4 pl-14 pr-12 focus:outline-none focus:border-white/30 focus:bg-white/10 transition-all duration-300 placeholder:text-white/30 shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
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
                 <p className="text-sm text-[var(--color-accent-primary)] font-medium">Found {searchResults.length} matching commits</p>
                 <button onClick={clearSearch} className="text-sm text-white/50 hover:text-white transition-colors px-3 py-1 rounded-full bg-white/5 hover:bg-white/10">Clear Search</button>
              </div>
            )}
          </div>

      {/* Commit Timeline */}
      <div className="flex flex-col gap-8 relative">
        {/* Timeline line behind cards */}
        <div className="absolute left-[15px] sm:left-[31px] top-0 bottom-0 w-0.5 bg-gradient-to-b from-[var(--color-accent-primary)] via-purple-500/50 to-transparent opacity-50 -z-10 shadow-[0_0_15px_var(--color-accent-primary)]" />

        {(searchResults || commits).map((commit, index) => (
          <div key={commit.sha} className="flex gap-4 sm:gap-6 group animate-fade-in" style={{ animationDelay: `${Math.min(index * 50, 500)}ms`, animationFillMode: 'both' }}>
            {/* Timeline dot */}
            <div className="mt-8 w-8 sm:w-16 flex-shrink-0 flex justify-center relative">
              <div className="w-4 h-4 rounded-full bg-[#111] border-[3px] border-[var(--color-accent-primary)] shadow-[0_0_15px_var(--color-accent-primary)] z-10 relative group-hover:scale-150 transition-transform duration-500" />
            </div>

            <Card className="flex-1 p-5 sm:p-6 transition-all duration-500 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 shadow-[0_10px_30px_rgba(0,0,0,0.3)] hover:shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-xl group-hover:-translate-y-1 relative overflow-hidden">
              {/* Subtle inner highlight */}
              <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              
              <div className="flex flex-col sm:flex-row justify-between items-start gap-4 sm:gap-6 relative z-10">
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg sm:text-xl font-bold mb-3 text-white leading-snug break-words tracking-tight group-hover:text-[var(--color-accent-primary)] transition-colors duration-300">
                    {commit.message.split("\n")[0]}
                  </h3>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-xs sm:text-sm text-white/60 font-medium">
                    <span className="flex items-center gap-1.5 text-white/80 bg-white/5 px-2.5 py-1 rounded-full border border-white/5">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                      {commit.author_name}
                    </span>
                    <span className="hidden sm:inline opacity-30">•</span>
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                      <span className="flex items-center gap-1.5 px-2">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                        {new Date(commit.authored_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                      <span className="font-mono text-[10px] sm:text-xs bg-black/40 px-2 py-1 rounded-md border border-white/5 text-white/50 shadow-inner">
                        {commit.sha.substring(0, 7)}
                      </span>
                      {commit.similarity !== undefined && commit.similarity < 1 && (
                        <span className="text-[10px] sm:text-xs font-bold bg-[var(--color-accent-primary)]/20 text-[var(--color-accent-primary)] px-2 py-1 rounded-md border border-[var(--color-accent-primary)]/30">
                          Match: {(commit.similarity * 100).toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {user && (
                  <Button
                    variant={explanations[commit.sha] ? "secondary" : "primary"}
                    onClick={() => handleExplain(commit.sha)}
                    isLoading={explanations[commit.sha]?.isExplaining}
                    className={`w-full sm:w-auto shrink-0 transition-all duration-300 h-10 px-5 text-sm font-bold rounded-full ${explanations[commit.sha] ? "!bg-white/10 border-white/20 hover:!bg-white/20 !text-white shadow-inner" : "!bg-white !text-black hover:shadow-[0_0_20px_rgba(255,255,255,0.4)] border-transparent hover:-translate-y-0.5"}`}
                  >
                    {explanations[commit.sha] ? "Close Insights" : (
                      <span className="flex items-center gap-2">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
                        AI Explain
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
