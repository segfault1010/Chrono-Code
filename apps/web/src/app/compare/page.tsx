"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { CompareDashboard } from "../../components/CompareDashboard";
import { useEffect, useState, Suspense } from "react";
import { api } from "../../lib/api";

export default function ComparePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen text-white">Loading comparison...</div>}>
      <ComparePageContent />
    </Suspense>
  );
}

function ComparePageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const repo1Id = searchParams.get("repo1");
  const repo2Id = searchParams.get("repo2");

  const [savedRepos, setSavedRepos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedRepo1, setSelectedRepo1] = useState<string>(repo1Id || "");
  const [selectedRepo2, setSelectedRepo2] = useState<string>(repo2Id || "");

  useEffect(() => {
    // In a real app, we might fetch a list of all indexed or saved repos
    async function fetchRepos() {
      try {
        const data = await api.user.getSavedRepos();
        setSavedRepos(data as any || []);
      } catch (err) {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    fetchRepos();
  }, []);

  const handleCompare = () => {
    if (selectedRepo1 && selectedRepo2) {
      router.push(`/compare?repo1=${selectedRepo1}&repo2=${selectedRepo2}`);
    }
  };

  return (
    <main className="min-h-screen bg-black flex flex-col pt-24 px-8 pb-16 custom-scrollbar">
      <div className="max-w-6xl mx-auto w-full flex flex-col gap-8">
        
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-black text-white tracking-tight mb-2">Compare Repositories</h1>
            <p className="text-gray-400">Select two repositories to compare their architecture, health, and evolution side-by-side.</p>
          </div>
        </div>

        {(!repo1Id || !repo2Id) && (
          <div className="bg-[#0D0D0D] border border-white/5 p-8 rounded-2xl shadow-2xl flex flex-col md:flex-row items-end gap-6">
            <div className="flex-1 w-full">
              <label className="block text-xs uppercase tracking-widest text-gray-500 font-bold mb-2">Repository A</label>
              <select 
                value={selectedRepo1}
                onChange={(e) => setSelectedRepo1(e.target.value)}
                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[var(--color-accent-primary)] transition-colors appearance-none"
              >
                <option value="" disabled>Select a repository...</option>
                {savedRepos.map((r: any) => (
                  <option key={`r1-${r.id}`} value={r.id}>
                    {r.owner}/{r.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-none flex items-center justify-center pb-3 px-4">
              <span className="text-gray-600 font-black italic">VS</span>
            </div>
            <div className="flex-1 w-full">
              <label className="block text-xs uppercase tracking-widest text-gray-500 font-bold mb-2">Repository B</label>
              <select 
                value={selectedRepo2}
                onChange={(e) => setSelectedRepo2(e.target.value)}
                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[var(--color-accent-primary)] transition-colors appearance-none"
              >
                <option value="" disabled>Select a repository to compare against...</option>
                {savedRepos.map((r: any) => (
                  <option key={`r2-${r.id}`} value={r.id} disabled={r.id === selectedRepo1}>
                    {r.owner}/{r.name}
                  </option>
                ))}
              </select>
            </div>
            <button 
              onClick={handleCompare}
              disabled={!selectedRepo1 || !selectedRepo2 || selectedRepo1 === selectedRepo2}
              className="bg-[var(--color-accent-primary)] text-white font-bold py-3 px-8 rounded-xl disabled:opacity-50 hover:bg-[var(--color-accent-primary)]/90 transition-all shadow-lg whitespace-nowrap"
            >
              Compare
            </button>
          </div>
        )}

        {repo1Id && repo2Id && (
          <CompareDashboard repo1Id={repo1Id} repo2Id={repo2Id} />
        )}
        
      </div>
    </main>
  );
}
