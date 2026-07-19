"use client";

import { useState } from "react";
import { api } from "../lib/api";
import { Card } from "./ui/Card";
import { Button } from "./ui/Button";

interface FunctionHistoryProps {
  repoId: string;
}

export function FunctionHistory({ repoId }: FunctionHistoryProps) {
  const [filePath, setFilePath] = useState("");
  const [functionName, setFunctionName] = useState("");
  const [history, setHistory] = useState<any[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!filePath.trim() || !functionName.trim()) return;

    setIsLoading(true);
    setError(null);
    setHistory(null);

    try {
      const response = await api.repos.getFunctionHistory(repoId, filePath, functionName);
      setHistory(response.history);
    } catch (err: any) {
      setError(err.message || "Failed to fetch function history.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="mb-8 p-6 lg:p-8 bg-white/5 backdrop-blur-md border border-white/5 shadow-lg rounded-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[var(--color-accent-primary)]/10 rounded-full blur-[100px] -mr-32 -mt-32 pointer-events-none" />
        <h2 className="text-xl font-bold mb-2 text-white tracking-tight">Function-Level History</h2>
        <p className="text-[var(--color-text-secondary)] text-sm mb-6 max-w-2xl">
          Trace the exact evolution of a single function over time. Enter the file path and function name to isolate its history.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col md:flex-row gap-4 relative z-10">
          <div className="flex-1">
            <label className="block text-[10px] font-bold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-2 ml-2">File Path</label>
            <input
              type="text"
              required
              placeholder="e.g., src/utils.ts"
              value={filePath}
              onChange={(e) => setFilePath(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-full px-6 py-3 text-white focus:outline-none focus:border-[var(--color-accent-primary)] focus:bg-white/10 shadow-sm transition-all"
            />
          </div>
          <div className="flex-1">
            <label className="block text-[10px] font-bold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-2 ml-2">Function Name</label>
            <input
              type="text"
              required
              placeholder="e.g., calculateStats"
              value={functionName}
              onChange={(e) => setFunctionName(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-full px-6 py-3 text-white focus:outline-none focus:border-[var(--color-accent-primary)] focus:bg-white/10 shadow-sm transition-all"
            />
          </div>
          <div className="flex items-end">
            <Button type="submit" isLoading={isLoading} className="h-[50px] px-8 whitespace-nowrap rounded-full font-semibold shadow-lg">
              Trace Function
            </Button>
          </div>
        </form>
      </div>

      {error && (
        <Card className="border-[var(--color-error)] bg-[var(--color-error-bg)] p-6 mb-8">
          <div className="flex items-center gap-3 mb-2 text-[var(--color-error)]">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <h3 className="font-bold">Error</h3>
          </div>
          <p className="text-[var(--color-error)] opacity-90 ml-9">{error}</p>
        </Card>
      )}

      {history && history.length === 0 && (
        <div className="text-center py-12 text-[var(--color-text-tertiary)]">
          <p>No history found. Ensure the file path and function name are correct, and that Git can detect the function definition.</p>
        </div>
      )}

      {history && history.length > 0 && (
        <div className="flex flex-col gap-6 relative">
          {/* Timeline line behind cards */}
          <div className="absolute left-[29px] sm:left-[35px] top-4 bottom-4 w-[2px] bg-gradient-to-b from-[var(--color-accent-primary)]/40 via-white/10 to-transparent -z-10" />

          {history.map((commit, index) => (
            <div key={commit.sha} className="flex gap-4 sm:gap-6 group">
              {/* Timeline dot */}
              <div className="mt-8 flex-shrink-0 relative">
                <div className="w-3 h-3 rounded-full bg-[var(--color-bg-primary)] border-2 border-[var(--color-accent-primary)] shadow-[0_0_15px_rgba(var(--color-accent-primary-rgb),0.5)] z-10 relative group-hover:scale-150 transition-transform duration-300" />
              </div>

              <div className="flex-1 p-6 transition-all duration-300 hover:shadow-xl hover:border-white/20 bg-white/5 backdrop-blur-md border border-white/5 rounded-2xl shadow-sm">
                <div className="mb-4 pb-4 border-b border-white/10">
                  <h3 className="text-lg font-bold mb-2 text-white tracking-tight">
                    {commit.message}
                  </h3>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[var(--color-text-tertiary)] font-medium">
                    <span className="flex items-center gap-1.5 hover:text-white transition-colors cursor-pointer">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                      {commit.author_name}
                    </span>
                    <span className="text-white/20">•</span>
                    <span className="flex items-center gap-1.5">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                      {new Date(commit.authored_at).toLocaleDateString()}
                    </span>
                    <span className="text-white/20">•</span>
                    <span className="font-mono bg-white/10 px-2 py-0.5 rounded border border-white/10 hover:border-white/20 transition-colors">
                      {commit.sha.substring(0, 7)}
                    </span>
                  </div>
                </div>
                
                <div className="rounded-xl overflow-hidden border border-white/10 bg-black/40 shadow-inner">
                  <div className="px-4 py-2 bg-white/5 border-b border-white/10 text-[10px] font-mono text-[var(--color-text-secondary)] flex items-center justify-between uppercase tracking-wider font-bold">
                    <span>{filePath}</span>
                    <span className="text-[var(--color-accent-primary)]">fn: {functionName}</span>
                  </div>
                  <div className="overflow-x-auto p-4 text-xs font-mono leading-relaxed">
                    {commit.patch.split('\n').map((line: string, i: number) => {
                      let color = 'text-gray-300';
                      let bg = '';
                      if (line.startsWith('+') && !line.startsWith('+++')) {
                        color = 'text-[#3fb950]';
                        bg = 'bg-[#2ea0431a]';
                      } else if (line.startsWith('-') && !line.startsWith('---')) {
                        color = 'text-[#f85149]';
                        bg = 'bg-[#f851491a]';
                      } else if (line.startsWith('@@')) {
                        color = 'text-[#a371f7]';
                      }
                      return (
                        <div key={i} className={`whitespace-pre ${color} ${bg} px-2 -mx-4`}>
                          {line || ' '}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
