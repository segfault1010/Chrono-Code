"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { Button } from "./ui/Button";

interface ReleaseNotesProps {
  repoId: string;
}

export function ReleaseNotes({ repoId }: ReleaseNotesProps) {
  const [range, setRange] = useState("last_50");
  const [markdown, setMarkdown] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setMarkdown("");
    setError(null);

    try {
      const response = await api.repos.generateReleaseNotes(repoId, range);
      if (!response.ok) {
        if (response.status === 401) {
          window.location.href = "/login";
          return;
        }
        throw new Error("Failed to generate release notes");
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
      setError(err.message || "Failed to generate release notes");
    } finally {
      setIsGenerating(false);
    }
  };

  // marked.parse returns a string synchronously when not using async extensions
  const parsedHtml = marked.parse(markdown) as string;

  return (
    <div className="animate-fade-in max-w-4xl mx-auto">
      <div className="bg-white/5 backdrop-blur-2xl p-6 lg:p-8 rounded-3xl border border-white/10 shadow-lg hover:shadow-[0_15px_40px_rgba(0,0,0,0.4)] mb-6 relative overflow-hidden group transition-all duration-500">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-[var(--color-accent-primary)]/20 via-purple-500/10 to-transparent rounded-full blur-[100px] -mr-48 -mt-48 pointer-events-none transition-opacity duration-700 opacity-50 group-hover:opacity-100" />
        <h2 className="text-xl font-bold mb-4 text-white tracking-tight flex items-center gap-2 relative z-10">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--color-accent-primary)]"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
          Automated Release Notes
        </h2>
        <p className="text-white/60 mb-6 text-sm max-w-2xl font-medium relative z-10">
          Generate structured, professional release notes from your repository's recent commit history using AI.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 items-end relative z-10">
          <div className="flex-1 w-full relative">
            <label className="block text-[10px] font-bold text-white/50 uppercase tracking-wider mb-2 ml-2">
              Time Range
            </label>
            <svg className="absolute right-4 top-[38px] text-[var(--color-text-tertiary)] pointer-events-none" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
            <select 
              value={range}
              onChange={(e) => setRange(e.target.value)}
              disabled={isGenerating}
              className="w-full bg-black/40 border border-white/10 rounded-full px-6 py-3 text-sm text-white focus:outline-none focus:border-[var(--color-accent-primary)] focus:bg-black/60 focus:ring-2 focus:ring-[var(--color-accent-primary)]/30 transition-all appearance-none cursor-pointer shadow-inner"
            >
              <option value="last_50" className="bg-[#111]">Last 50 Commits</option>
              <option value="last_7_days" className="bg-[#111]">Last 7 Days</option>
              <option value="last_30_days" className="bg-[#111]">Last 30 Days</option>
            </select>
          </div>
          <Button 
            onClick={handleGenerate} 
            isLoading={isGenerating}
            className="w-full sm:w-auto h-[50px] px-8 rounded-full font-bold shadow-[0_0_20px_rgba(var(--color-accent-primary-rgb),0.3)] hover:-translate-y-0.5 transition-transform bg-[var(--color-accent-primary)] hover:bg-[var(--color-accent-primary)]/90 text-white"
          >
            {isGenerating ? "Generating..." : "Generate Release Notes"}
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
        <div className="bg-[#0f0f0f]/80 backdrop-blur-2xl p-6 sm:p-10 rounded-3xl border border-white/10 shadow-inner">
          <div 
            className="prose prose-invert max-w-none text-[var(--color-text-secondary)] prose-headings:text-white prose-headings:tracking-tight prose-a:text-[var(--color-accent-primary)] prose-li:my-1 prose-pre:bg-white/5 prose-pre:border prose-pre:border-white/10"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(parsedHtml) }}
          />
          {isGenerating && (
             <div className="mt-6 flex items-center gap-3 text-[var(--color-accent-primary)] animate-pulse text-sm font-medium">
               <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
               Writing release notes...
             </div>
          )}
        </div>
      )}
    </div>
  );
}
