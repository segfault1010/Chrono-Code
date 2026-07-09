"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "../../../lib/api";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import type { Repository, Commit } from "@chronocode/shared-types";

export default function RepoPage() {
  const params = useParams();
  const repoId = params.id as string;

  const [repo, setRepo] = useState<Repository | null>(null);
  const [commits, setCommits] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [activeCommit, setActiveCommit] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<any | null>(null);
  const [isExplaining, setIsExplaining] = useState(false);

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

  const handleExplain = async (sha: string) => {
    if (activeCommit === sha) {
      setActiveCommit(null);
      setExplanation(null);
      return;
    }

    setActiveCommit(sha);
    setIsExplaining(true);
    setExplanation({ explanation: "", model_id: "Loading..." });

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

      setIsExplaining(false); // Stop loading spinner as soon as stream starts

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
                  setExplanation({ error: data.error });
                  done = true;
                  break;
                }

                if (data.text) {
                  streamedText += data.text;
                  setExplanation((prev: any) => ({
                    ...prev,
                    explanation: streamedText
                  }));
                }

                if (data.done) {
                  setExplanation((prev: any) => ({
                    ...prev,
                    model_id: data.model_id
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
      setExplanation({ error: err.message || "Failed to generate explanation" });
      setIsExplaining(false);
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
      <header className="mb-10 sm:mb-12 border-b border-[var(--color-border)] pb-6">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight bg-gradient-to-r from-white to-[var(--color-text-secondary)] bg-clip-text text-transparent">
          {repo.owner}/{repo.name}
        </h1>
        <p className="text-[var(--color-text-secondary)] mt-2 font-medium flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20v-6M6 20V10M18 20V4"/></svg>
          {repo.total_commits.toLocaleString()} commits indexed
        </p>
      </header>

      <div className="flex flex-col gap-5 relative">
        {/* Timeline line behind cards */}
        <div className="absolute left-[27px] sm:left-[35px] top-0 bottom-0 w-0.5 bg-gradient-to-b from-[var(--color-accent-primary)]/20 via-[var(--color-border)] to-transparent -z-10" />

        {commits.map((commit) => (
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
                      {new Date(commit.authored_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                    <span className="hidden sm:inline">•</span>
                    <span className="font-mono text-xs bg-[var(--color-bg-primary)] px-2 py-1 rounded-md border border-[var(--color-border)]">
                      {commit.sha.substring(0, 7)}
                    </span>
                  </div>
                </div>
                <Button
                  variant={activeCommit === commit.sha ? "secondary" : "primary"}
                  onClick={() => handleExplain(commit.sha)}
                  isLoading={activeCommit === commit.sha && isExplaining}
                  className="w-full sm:w-auto shrink-0 shadow-sm"
                >
                  {activeCommit === commit.sha ? "Close Insights" : "AI Explain"}
                </Button>
              </div>

              {/* Explanation View */}
              {activeCommit === commit.sha && explanation && (
                <div className="mt-5 pt-5 border-t border-[var(--color-border)] animate-fade-in">
                  {explanation.error ? (
                    <div className="flex items-center gap-2 text-[var(--color-error)] p-3 bg-[var(--color-error-bg)] rounded-lg">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      <p>{explanation.error}</p>
                    </div>
                  ) : (
                    <div className="prose prose-invert max-w-none text-[var(--color-text-secondary)] leading-relaxed text-[15px]">
                      <div dangerouslySetInnerHTML={{ __html: explanation.explanation.replace(/\n/g, "<br/>") }} />
                      <div className="mt-4 flex justify-end">
                        <span className="text-xs font-mono text-[var(--color-text-tertiary)] flex items-center gap-1.5 opacity-70">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                          {explanation.model_id}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Card>
          </div>
        ))}

        {hasMore && (
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
