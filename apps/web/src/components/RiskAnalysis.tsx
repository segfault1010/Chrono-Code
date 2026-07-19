"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { marked } from "marked";
import { Button } from "./ui/Button";

interface RiskAnalysisProps {
  repoId: string;
}

export function RiskAnalysis({ repoId }: RiskAnalysisProps) {
  const [range, setRange] = useState("last_50");
  const [markdown, setMarkdown] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setMarkdown("");
    setError(null);

    try {
      const response = await api.repos.generateRiskAnalysis(repoId, range);
      if (!response.ok) {
        if (response.status === 401) {
          window.location.href = "/login";
          return;
        }
        throw new Error("Failed to generate risk analysis");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error("Failed to read stream");

      let done = false;
      let streamedText = "";

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
                  setError(data.error);
                  done = true;
                  break;
                }

                if (data.text) {
                  streamedText += data.text;
                  setMarkdown(streamedText);
                }

                if (data.done) {
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
      setError(err.message || "Failed to generate risk analysis");
    } finally {
      setIsGenerating(false);
    }
  };

  const parsedHtml = marked.parse(markdown) as string;

  return (
    <div className="animate-fade-in max-w-4xl mx-auto">
      <div className="bg-white/5 backdrop-blur-md p-6 lg:p-8 rounded-2xl border border-white/5 shadow-lg mb-6 relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-orange-500/20 via-red-500/10 to-transparent rounded-full blur-[100px] -mr-48 -mt-48 pointer-events-none transition-opacity duration-700 opacity-50 group-hover:opacity-100" />
        
        <div className="flex items-center gap-3 mb-4 relative z-10">
          <svg className="text-orange-500" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <h2 className="text-xl font-bold text-white tracking-tight">Risk Analysis Scanner</h2>
        </div>
        <p className="text-[var(--color-text-secondary)] mb-6 text-sm max-w-2xl relative z-10">
          Deploy an AI Security & Architecture Auditor to scan your recent commit history for potential breaking changes, sensitive dependency updates, or major architectural shifts.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 items-end relative z-10">
          <div className="flex-1 w-full relative">
            <label className="block text-[10px] font-bold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-2 ml-2">
              Scan Range
            </label>
            <svg className="absolute right-4 top-[38px] text-[var(--color-text-tertiary)] pointer-events-none" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
            <select 
              value={range}
              onChange={(e) => setRange(e.target.value)}
              disabled={isGenerating}
              className="w-full bg-white/5 border border-white/10 rounded-full px-6 py-3 text-sm text-white focus:outline-none focus:border-orange-500 focus:bg-white/10 transition-all appearance-none cursor-pointer shadow-sm"
            >
              <option value="last_50" className="bg-[#111]">Last 50 Commits</option>
              <option value="last_7_days" className="bg-[#111]">Last 7 Days</option>
              <option value="last_30_days" className="bg-[#111]">Last 30 Days</option>
            </select>
          </div>
          <Button 
            onClick={handleGenerate} 
            isLoading={isGenerating}
            className="w-full sm:w-auto h-[50px] px-8 rounded-full font-semibold bg-orange-600 hover:bg-orange-500 text-white shadow-[0_0_20px_rgba(234,88,12,0.3)] hover:shadow-[0_0_25px_rgba(234,88,12,0.5)] transition-all border-none"
          >
            {isGenerating ? "Scanning..." : "Run Risk Scan"}
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-[var(--color-error)] p-4 bg-[var(--color-error-bg)] rounded-xl border border-[var(--color-error)]/20 mb-6">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <p>{error}</p>
        </div>
      )}

      {(markdown || isGenerating) && !error && (
        <div className="bg-black/40 backdrop-blur-md p-6 sm:p-8 rounded-2xl border border-orange-500/30 shadow-inner relative overflow-hidden">
          <div 
            className="prose prose-invert max-w-none text-[var(--color-text-secondary)] prose-headings:text-white prose-headings:tracking-tight prose-a:text-orange-400 prose-li:my-1 prose-strong:text-orange-100 prose-pre:bg-white/5 prose-pre:border prose-pre:border-orange-500/20"
            dangerouslySetInnerHTML={{ __html: parsedHtml }}
          />
          {isGenerating && (
             <div className="mt-6 flex items-center gap-3 text-orange-500 animate-pulse text-sm font-medium">
               <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
               Auditing commits...
             </div>
          )}
        </div>
      )}
    </div>
  );
}
