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
      <div className="mb-8 p-6 bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-2xl">
        <h2 className="text-xl font-bold mb-2 text-white">Function-Level History</h2>
        <p className="text-[var(--color-text-secondary)] text-sm mb-6">
          Trace the exact evolution of a single function over time. Enter the file path and function name to isolate its history.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <label className="block text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider mb-2">File Path</label>
            <input
              type="text"
              required
              placeholder="e.g., src/utils.ts"
              value={filePath}
              onChange={(e) => setFilePath(e.target.value)}
              className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[var(--color-accent-primary)] transition-colors"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider mb-2">Function Name</label>
            <input
              type="text"
              required
              placeholder="e.g., calculateStats"
              value={functionName}
              onChange={(e) => setFunctionName(e.target.value)}
              className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[var(--color-accent-primary)] transition-colors"
            />
          </div>
          <div className="flex items-end">
            <Button type="submit" isLoading={isLoading} className="h-[50px] px-8 whitespace-nowrap">
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
          <div className="absolute left-[23px] sm:left-[31px] top-4 bottom-4 w-0.5 bg-gradient-to-b from-[var(--color-accent-primary)]/20 via-[var(--color-border)] to-transparent -z-10" />

          {history.map((commit, index) => (
            <div key={commit.sha} className="flex gap-4 sm:gap-6 group">
              {/* Timeline dot */}
              <div className="mt-6 flex-shrink-0 relative">
                <div className="w-3 h-3 rounded-full bg-[var(--color-bg-primary)] border-2 border-[var(--color-accent-primary)] shadow-[0_0_10px_var(--color-accent-primary)] z-10 relative group-hover:scale-150 transition-transform" />
              </div>

              <Card className="flex-1 p-5 transition-all duration-300 hover:shadow-xl hover:border-[var(--color-accent-primary)]/30 bg-[var(--color-bg-elevated)]/60 backdrop-blur-sm">
                <div className="mb-4 pb-4 border-b border-[var(--color-border)]">
                  <h3 className="text-lg font-semibold mb-2 text-[var(--color-text-primary)]">
                    {commit.message}
                  </h3>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[var(--color-text-tertiary)]">
                    <span className="flex items-center gap-1.5">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                      {commit.author_name}
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1.5">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                      {new Date(commit.authored_at).toLocaleDateString()}
                    </span>
                    <span>•</span>
                    <span className="font-mono bg-[var(--color-bg-primary)] px-1.5 py-0.5 rounded border border-[var(--color-border)]">
                      {commit.sha.substring(0, 7)}
                    </span>
                  </div>
                </div>
                
                <div className="rounded-xl overflow-hidden border border-white/5 bg-[#0d1117]">
                  <div className="px-4 py-2 bg-white/5 border-b border-white/5 text-xs font-mono text-gray-400 flex items-center justify-between">
                    <span>{filePath}</span>
                    <span className="text-[var(--color-accent-primary)]">Function: {functionName}</span>
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
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
