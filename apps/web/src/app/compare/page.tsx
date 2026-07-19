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
          <div className="bg-white/5 backdrop-blur-md border border-white/5 p-8 rounded-2xl shadow-2xl flex flex-col md:flex-row items-end gap-6 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-[var(--color-accent-primary)]/20 via-blue-500/10 to-transparent rounded-full blur-[100px] -mr-48 -mt-48 pointer-events-none transition-opacity duration-700 opacity-50 group-hover:opacity-100" />
            <div className="flex-1 w-full relative z-10">
              <label className="block text-[10px] uppercase tracking-widest text-[var(--color-text-tertiary)] font-bold mb-2 ml-2">Repository A</label>
              <div className="relative">
                <svg className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)] pointer-events-none" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                <select 
                  value={selectedRepo1}
                  onChange={(e) => setSelectedRepo1(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-full px-6 py-3.5 text-white focus:outline-none focus:border-[var(--color-accent-primary)] focus:bg-white/10 transition-all appearance-none cursor-pointer shadow-sm text-sm"
                >
                  <option value="" disabled className="bg-[#111]">Select a repository...</option>
                  {savedRepos.map((r: any) => (
                    <option key={`r1-${r.id}`} value={r.id} className="bg-[#111]">
                      {r.owner}/{r.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex-none flex items-center justify-center pb-4 px-2 relative z-10">
              <span className="text-[var(--color-text-tertiary)] font-black text-xs uppercase tracking-widest bg-white/5 px-3 py-1.5 rounded-full border border-white/5">VS</span>
            </div>
            <div className="flex-1 w-full relative z-10">
              <label className="block text-[10px] uppercase tracking-widest text-[var(--color-text-tertiary)] font-bold mb-2 ml-2">Repository B</label>
              <div className="relative">
                <svg className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)] pointer-events-none" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                <select 
                  value={selectedRepo2}
                  onChange={(e) => setSelectedRepo2(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-full px-6 py-3.5 text-white focus:outline-none focus:border-[var(--color-accent-primary)] focus:bg-white/10 transition-all appearance-none cursor-pointer shadow-sm text-sm"
                >
                  <option value="" disabled className="bg-[#111]">Select a repository to compare against...</option>
                  {savedRepos.map((r: any) => (
                    <option key={`r2-${r.id}`} value={r.id} disabled={r.id === selectedRepo1} className="bg-[#111]">
                      {r.owner}/{r.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button 
              onClick={handleCompare}
              disabled={!selectedRepo1 || !selectedRepo2 || selectedRepo1 === selectedRepo2}
              className="relative z-10 bg-[var(--color-accent-primary)] text-white font-bold py-3.5 px-8 rounded-full disabled:opacity-50 hover:bg-[var(--color-accent-primary)]/90 transition-all shadow-[0_0_20px_rgba(var(--color-accent-primary-rgb),0.3)] hover:shadow-[0_0_30px_rgba(var(--color-accent-primary-rgb),0.5)] whitespace-nowrap border-none"
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
