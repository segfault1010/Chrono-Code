"use client";

import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Repository } from "@chronocode/shared-types";

interface EvolutionCommit {
  sha: string;
  message: string;
  author_name: string;
  authored_at: string;
}

interface CodeEvolutionProps {
  repo: Repository;
  onJumpToTimeline: (sha: string) => void;
  isIndexing?: boolean;
}

const ROW_SIZE = 6;

export function CodeEvolution({ repo, onJumpToTimeline, isIndexing }: CodeEvolutionProps) {
  const [commits, setCommits] = useState<EvolutionCommit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCommit, setSelectedCommit] = useState<EvolutionCommit | null>(null);

  useEffect(() => {
    const fetchEvolution = async () => {
      try {
        const data = await api.repos.getEvolution(repo.id);
        setCommits(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    
    fetchEvolution();
    
    let interval: any;
    if (isIndexing) {
      interval = setInterval(fetchEvolution, 3000);
    }
    return () => clearInterval(interval);
  }, [repo.id, isIndexing]);

  if (loading) {
    return (
      <div className="w-full h-48 flex items-center justify-center animate-pulse border border-[var(--color-border)] rounded-xl bg-[var(--color-bg-elevated)]/30">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[var(--color-accent-primary)] border-t-transparent rounded-full animate-spin" />
          <p className="text-[var(--color-text-tertiary)] text-sm">Mapping evolutionary timeline...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full p-4 border border-[var(--color-error)] rounded-xl bg-[var(--color-error-bg)] text-[var(--color-error)]">
        Failed to load timeline: {error}
      </div>
    );
  }

  if (commits.length === 0) {
    return <div className="text-[var(--color-text-tertiary)] text-center py-8">No commits found for timeline.</div>;
  }

  // Chunk commits into rows for the Snake Timeline
  const rows: EvolutionCommit[][] = [];
  for (let i = 0; i < commits.length; i += ROW_SIZE) {
    rows.push(commits.slice(i, i + ROW_SIZE));
  }

  return (
    <div className="relative w-full max-w-5xl mx-auto py-12 px-12 sm:px-20 flex flex-col items-center overflow-x-hidden">
      
      {/* Title */}
      <div className="mb-16 text-center">
         <h3 className="text-xl font-bold text-white tracking-wide">Macro Code Evolution</h3>
         <p className="text-[var(--color-text-tertiary)] text-sm mt-2">Showing {commits.length} commits. Click a node to view details.</p>
      </div>

      {rows.map((row, rowIndex) => {
        const isEven = rowIndex % 2 === 0;
        const isLastRow = rowIndex === rows.length - 1;
        
        return (
          <div key={rowIndex} className={`relative flex w-full justify-between items-center h-32 ${isEven ? 'flex-row' : 'flex-row-reverse'}`}>
             
             {/* Horizontal connecting line */}
             <div className="absolute top-1/2 left-0 right-0 h-[2px] bg-[var(--color-accent-primary)] -translate-y-1/2 -z-10 shadow-[0_0_10px_var(--color-accent-primary)]" />
             
             {/* U-Turn connecting to next row with PERFECT smooth edges (semi-circle) */}
             {!isLastRow && (
               <div 
                 className={`absolute top-1/2 w-10 sm:w-16 h-32 border-[var(--color-accent-primary)] shadow-[0_0_10px_var(--color-accent-primary)] -z-10 ${
                   isEven 
                     ? '-right-10 sm:-right-16 border-t-[2px] border-r-[2px] border-b-[2px] border-l-0 rounded-r-full' 
                     : '-left-10 sm:-left-16 border-t-[2px] border-l-[2px] border-b-[2px] border-r-0 rounded-l-full'
                 }`}
               />
             )}
             
             {/* Commits */}
             {row.map((commit) => {
                return (
                  <div key={commit.sha} className="group relative flex flex-col items-center">
                    {/* Date (highly visible) */}
                    <div className="absolute -top-8 text-[11px] text-gray-300 font-mono whitespace-nowrap bg-[#0D0D0D] px-2 py-0.5 rounded border border-white/10 shadow-sm z-10">
                      {new Date(commit.authored_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' })}
                    </div>
                    
                    {/* Glowing Node Button */}
                    <button
                      onClick={() => setSelectedCommit(commit)}
                      className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-[var(--color-bg-primary)] border-2 border-[var(--color-accent-primary)] hover:scale-150 hover:bg-[var(--color-accent-primary)] hover:border-white transition-all shadow-[0_0_12px_var(--color-accent-primary)] z-20"
                    />
                    
                    {/* Hover Title Popup (Small rectangular box as requested) */}
                    <div className="absolute bottom-full mb-10 px-3 py-2 bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-md shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                       <p className="text-xs text-white font-medium">{commit.message.split('\n')[0]}</p>
                    </div>
                  </div>
                );
             })}
          </div>
        );
      })}

      {/* Commit Details Modal */}
      {selectedCommit && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in" 
          onClick={() => setSelectedCommit(null)}
        >
          <div 
            className="w-full max-w-lg bg-[#0D0D0D] border border-white/10 rounded-2xl shadow-2xl overflow-hidden transform transition-all"
            onClick={e => e.stopPropagation()}
          >
             <div className="p-6">
                <div className="flex items-start justify-between mb-2">
                   <h3 className="text-lg font-bold text-white pr-4">{selectedCommit.message.split('\n')[0]}</h3>
                   <button onClick={() => setSelectedCommit(null)} className="text-white/50 hover:text-white transition-colors">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                   </button>
                </div>
                
                {/* Clickable full message -> redirects to commit timeline */}
                <div 
                  className="bg-[#151515] rounded-xl p-5 my-5 border border-white/10 cursor-pointer hover:border-blue-500/50 hover:bg-[#1A1A1A] transition-all group shadow-inner"
                  onClick={() => {
                    setSelectedCommit(null);
                    onJumpToTimeline(selectedCommit.sha);
                  }}
                  title="Click to view full context in Commit Timeline"
                >
                  <p className="text-sm text-gray-300 whitespace-pre-wrap font-mono leading-relaxed group-hover:text-white transition-colors">
                    {selectedCommit.message}
                  </p>
                  
                  {/* Highly visible View in Timeline prompt */}
                  <div className="mt-4 pt-3 border-t border-white/5 flex items-center gap-2 text-blue-400 text-sm font-medium group-hover:text-blue-300 transition-colors">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                    Jump to Commit Timeline
                  </div>
                </div>
                
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-400 mb-6 pt-2">
                   <span className="flex items-center gap-1.5">
                     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                     {selectedCommit.author_name}
                   </span>
                   <span>•</span>
                   <span className="flex items-center gap-1.5">
                     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                     {new Date(selectedCommit.authored_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
                   </span>
                   <span>•</span>
                   <span className="font-mono bg-[#1A1A1A] px-2 py-0.5 rounded text-blue-400 border border-blue-400/20">
                     {selectedCommit.sha.substring(0, 7)}
                   </span>
                </div>
                
                <a 
                  href={`https://github.com/${repo.owner}/${repo.name}/commit/${selectedCommit.sha}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full text-center py-3.5 px-4 rounded-xl border border-white/10 hover:border-white/30 hover:bg-white/5 text-sm font-medium transition-colors text-white flex items-center justify-center gap-2"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/></svg>
                  View on GitHub
                </a>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
