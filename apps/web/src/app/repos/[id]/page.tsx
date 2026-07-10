"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "../../../lib/api";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import type { Repository, Commit } from "@chronocode/shared-types";
import { createClient } from "../../../lib/supabase/client";

export default function RepoPage() {
  const params = useParams();
  const repoId = params.id as string;

  const [repo, setRepo] = useState<Repository | null>(null);
  const [commits, setCommits] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [explanations, setExplanations] = useState<Record<string, { explanation: string, model_id: string, error?: string, isExplaining?: boolean }>>({});
  
  const [user, setUser] = useState<any>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    let pollInterval: NodeJS.Timeout;

    const fetchRepo = async () => {
      try {
        const data = await api.repos.get(repoId);
        setRepo(data);
        
        if (data.status === "ready") {
          setIsLoading(false);
          loadCommits(1);
          clearInterval(pollInterval);
        } else if (data.status === "failed") {
          setError(data.error_message || "Repository indexing failed.");
          setIsLoading(false);
          clearInterval(pollInterval);
        }
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

    // Poll every 3 seconds if not ready
    pollInterval = setInterval(fetchRepo, 3000);

    return () => clearInterval(pollInterval);
  }, [repoId]);

  const loadCommits = async (pageNumber: number) => {
    try {
      const response: any = await api.repos.getCommits(repoId, pageNumber);
      if (pageNumber === 1) {
        setCommits(response.data);
      } else {
        setCommits((prev) => [...prev, ...response.data]);
      }
      setHasMore(pageNumber < response.meta.totalPages);
      setPage(pageNumber);
    } catch (err: any) {
      console.error("Failed to load commits:", err);
    }
  };

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

  if (isLoading || !repo) {
    return (
      <main className="min-h-[60vh] flex items-center justify-center p-8 animate-fade-in">
        <div className="flex flex-col items-center gap-6">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full border-4 border-[var(--color-border)] opacity-20"></div>
            <div className="absolute inset-0 rounded-full border-4 border-[var(--color-accent-primary)] border-t-transparent animate-spin"></div>
          </div>
          <p className="text-[var(--color-text-secondary)] font-medium tracking-wide animate-pulse">
            {repo ? `Status: ${repo.status}...` : "Loading repository data..."}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-5xl mx-auto p-4 sm:p-8 animate-fade-in">
      <header className="mb-10 sm:mb-12 border-b border-[var(--color-border)] pb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight bg-gradient-to-r from-white to-[var(--color-text-secondary)] bg-clip-text text-transparent">
            {repo.owner}/{repo.name}
          </h1>
          <p className="text-[var(--color-text-secondary)] mt-2 font-medium flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20v-6M6 20V10M18 20V4"/></svg>
            {repo.total_commits.toLocaleString()} commits indexed
          </p>
        </div>
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
      </header>

      <div className="mb-8 animate-fade-in">
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
                    {commit.similarity !== undefined && (
                      <span className="text-xs font-semibold bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)] px-2 py-1 rounded-md border border-[var(--color-accent-primary)]/30">
                        Match: {(commit.similarity * 100).toFixed(1)}%
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  variant={explanations[commit.sha] ? "secondary" : "primary"}
                  onClick={() => handleExplain(commit.sha)}
                  isLoading={explanations[commit.sha]?.isExplaining}
                  className="w-full sm:w-auto shrink-0 shadow-sm"
                >
                  {explanations[commit.sha] ? "Close Insights" : "AI Explain"}
                </Button>
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

        {hasMore && !searchResults && (
          <div className="flex justify-center mt-8">
            <Button variant="secondary" onClick={() => loadCommits(page + 1)} className="px-8 py-2.5 rounded-full shadow-md hover:shadow-lg">
              Load More Commits
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}
