"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Repository } from "@chronocode/shared-types";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function DashboardPage() {
  const [repos, setRepos] = useState<Repository[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadDashboard() {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        window.location.href = "/login";
        return;
      }

      try {
        const data = await api.user.getSavedRepos();
        setRepos(data);
      } catch (err: any) {
        setError(err.message || "Failed to load dashboard");
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, []);

  if (loading) {
    return (
      <main className="max-w-6xl mx-auto p-6 min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </main>
    );
  }

  if (error) {
    return (
      <main className="max-w-6xl mx-auto p-6 min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center">
        <div className="text-red-400 mb-4">{error}</div>
        <Link href="/" className="text-blue-400 hover:underline">
          Return Home
        </Link>
      </main>
    );
  }

  return (
    <main className="max-w-6xl mx-auto p-6 min-h-[calc(100vh-4rem)]">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-white tracking-tight">Your Dashboard</h1>
        <Link 
          href="/" 
          className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-medium transition-colors"
        >
          Analyze New Repo
        </Link>
      </div>

      {repos.length === 0 ? (
        <div className="text-center py-20 bg-[#0a0a0a]/50 border border-white/10 rounded-2xl">
          <h2 className="text-xl text-white mb-2">No saved repositories yet</h2>
          <p className="text-zinc-400 mb-6">Analyze a repository and click the bookmark icon to save it here.</p>
          <Link 
            href="/" 
            className="text-blue-400 hover:text-blue-300 font-medium"
          >
            Go find some code &rarr;
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {repos.map((repo) => (
            <Link
              key={repo.id}
              href={`/repos/${repo.id}`}
              className="group block p-6 bg-[#0a0a0a]/50 hover:bg-[#141414] border border-white/10 hover:border-white/20 rounded-2xl transition-all"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="text-zinc-400 group-hover:text-white transition-colors">
                  <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                  </svg>
                </div>
                {repo.status === "ready" ? (
                  <span className="px-2.5 py-1 text-xs font-medium bg-green-500/10 text-green-400 rounded-full border border-green-500/20">
                    Ready
                  </span>
                ) : (
                  <span className="px-2.5 py-1 text-xs font-medium bg-blue-500/10 text-blue-400 rounded-full border border-blue-500/20">
                    {repo.status}
                  </span>
                )}
              </div>
              <h3 className="font-semibold text-lg text-white mb-1 truncate" title={`${repo.owner}/${repo.name}`}>
                {repo.owner}/{repo.name}
              </h3>
              <p className="text-sm text-zinc-400">
                {repo.total_commits.toLocaleString()} commits
              </p>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
