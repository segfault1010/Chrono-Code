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
      <main className="max-w-6xl mx-auto p-6 min-h-[calc(100vh-4rem)]">
        <div className="flex items-center justify-between mb-8 animate-pulse">
          <div className="h-10 w-48 bg-white/5 rounded-lg" />
          <div className="h-10 w-40 bg-white/5 rounded-full" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="p-6 bg-white/5 backdrop-blur-md border border-white/5 rounded-2xl animate-pulse">
              <div className="flex items-start justify-between mb-4">
                <div className="w-6 h-6 bg-white/10 rounded-full" />
                <div className="w-16 h-6 bg-white/10 rounded-full" />
              </div>
              <div className="h-6 w-3/4 bg-white/10 rounded mb-3" />
              <div className="h-4 w-1/2 bg-white/5 rounded" />
            </div>
          ))}
        </div>
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
    <main className="animate-fade-in max-w-6xl mx-auto p-6 min-h-[calc(100vh-4rem)]">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-white tracking-tight">Your Dashboard</h1>
        <Link 
          href="/" 
          className="bg-white/10 hover:bg-white/20 border border-white/10 hover:border-white/20 text-white px-6 py-2.5 rounded-full font-medium transition-all shadow-sm"
        >
          Analyze New Repo
        </Link>
      </div>

      {repos.length === 0 ? (
        <div className="text-center py-24 bg-white/5 backdrop-blur-md border border-white/5 shadow-sm rounded-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-[100px] -mr-32 -mt-32 pointer-events-none transition-opacity duration-700 opacity-50 group-hover:opacity-100" />
          <svg className="w-12 h-12 text-[var(--color-text-tertiary)] mx-auto mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>
          <h2 className="text-xl font-bold text-white tracking-tight mb-2 relative z-10">No saved repositories yet</h2>
          <p className="text-[var(--color-text-secondary)] mb-8 max-w-md mx-auto text-sm relative z-10">Analyze a repository and click the bookmark icon to save it to your dashboard for quick access.</p>
          <Link 
            href="/" 
            className="inline-flex items-center gap-2 text-[var(--color-accent-primary)] hover:text-white font-medium transition-colors relative z-10"
          >
            Go find some code <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {repos.map((repo) => (
            <Link
              key={repo.id}
              href={`/repos/${repo.id}`}
              className="group block p-6 bg-white/5 backdrop-blur-md border border-white/5 hover:border-white/10 hover:bg-white/10 rounded-2xl transition-all duration-300 hover:-translate-y-1 hover:shadow-xl relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
              <div className="flex items-start justify-between mb-4 relative z-10">
                <div className="text-[var(--color-text-tertiary)] group-hover:text-white transition-colors duration-300">
                  <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                  </svg>
                </div>
                {repo.status === "ready" ? (
                  <span className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider bg-green-500/10 text-green-400 rounded-full border border-green-500/20 backdrop-blur-sm shadow-[0_0_10px_rgba(34,197,94,0.1)]">
                    Ready
                  </span>
                ) : (
                  <span className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider bg-blue-500/10 text-blue-400 rounded-full border border-blue-500/20 backdrop-blur-sm">
                    {repo.status}
                  </span>
                )}
              </div>
              <h3 className="font-bold text-lg text-white mb-1 tracking-tight truncate relative z-10 group-hover:text-[var(--color-accent-primary)] transition-colors" title={`${repo.owner}/${repo.name}`}>
                {repo.owner}/{repo.name}
              </h3>
              <p className="text-xs text-[var(--color-text-tertiary)] font-medium relative z-10">
                {repo.total_commits.toLocaleString()} commits
              </p>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
