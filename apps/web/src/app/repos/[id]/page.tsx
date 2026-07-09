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
    setExplanation(null);

    try {
      const data = await api.commits.explain(sha, repoId);
      setExplanation(data);
    } catch (err: any) {
      setExplanation({ error: err.message || "Failed to generate explanation" });
    } finally {
      setIsExplaining(false);
    }
  };

  if (error) {
    return (
      <main style={{ padding: "var(--space-8)", maxWidth: "800px", margin: "0 auto" }}>
        <Card style={{ borderColor: "var(--color-error)" }}>
          <h2 style={{ color: "var(--color-error)", marginBottom: "var(--space-2)" }}>Error</h2>
          <p>{error}</p>
        </Card>
      </main>
    );
  }

  if (isLoading || !repo) {
    return (
      <main style={{ padding: "var(--space-8)", display: "flex", justifyContent: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--space-4)" }}>
          <div
            style={{
              width: "40px",
              height: "40px",
              border: "3px solid var(--color-border)",
              borderTopColor: "var(--color-accent-primary)",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
            }}
          />
          <p style={{ color: "var(--color-text-secondary)" }}>
            {repo ? `Status: ${repo.status}...` : "Loading..."}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main style={{ padding: "var(--space-6)", maxWidth: "1000px", margin: "0 auto" }}>
      <header style={{ marginBottom: "var(--space-8)" }}>
        <h1 style={{ fontSize: "var(--text-3xl)", fontWeight: "var(--font-weight-bold)" }}>
          {repo.owner}/{repo.name}
        </h1>
        <p style={{ color: "var(--color-text-secondary)", marginTop: "var(--space-2)" }}>
          {repo.total_commits} commits indexed
        </p>
      </header>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        {commits.map((commit) => (
          <Card key={commit.sha} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <h3 style={{ fontSize: "var(--text-lg)", fontWeight: "var(--font-weight-medium)", marginBottom: "var(--space-2)" }}>
                  {commit.message.split("\n")[0]}
                </h3>
                <div style={{ display: "flex", gap: "var(--space-4)", fontSize: "var(--text-sm)", color: "var(--color-text-secondary)" }}>
                  <span>{commit.author_name}</span>
                  <span>•</span>
                  <span>{new Date(commit.authored_at).toLocaleDateString()}</span>
                  <span>•</span>
                  <span style={{ fontFamily: "var(--font-mono)" }}>{commit.sha.substring(0, 7)}</span>
                </div>
              </div>
              <Button
                variant={activeCommit === commit.sha ? "secondary" : "primary"}
                onClick={() => handleExplain(commit.sha)}
                isLoading={activeCommit === commit.sha && isExplaining}
              >
                {activeCommit === commit.sha ? "Close Explanation" : "Explain"}
              </Button>
            </div>

            {/* Explanation View */}
            {activeCommit === commit.sha && explanation && (
              <div
                style={{
                  marginTop: "var(--space-4)",
                  paddingTop: "var(--space-4)",
                  borderTop: "1px solid var(--color-border)",
                }}
              >
                {explanation.error ? (
                  <p style={{ color: "var(--color-error)" }}>{explanation.error}</p>
                ) : (
                  <div style={{ color: "var(--color-text-primary)", lineHeight: 1.6 }}>
                    <div dangerouslySetInnerHTML={{ __html: explanation.explanation.replace(/\n/g, "<br/>") }} />
                  </div>
                )}
              </div>
            )}
          </Card>
        ))}

        {hasMore && (
          <div style={{ display: "flex", justifyContent: "center", marginTop: "var(--space-6)" }}>
            <Button variant="secondary" onClick={() => loadCommits(page + 1)}>
              Load More Commits
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}
