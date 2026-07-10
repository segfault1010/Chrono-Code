"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { marked } from "marked";
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
      <div className="bg-[var(--color-bg-elevated)] p-6 rounded-2xl border border-[var(--color-border)] shadow-sm mb-6">
        <h2 className="text-xl font-semibold mb-4 text-[var(--color-text-primary)]">Automated Release Notes</h2>
        <p className="text-[var(--color-text-secondary)] mb-6 text-sm">
          Generate structured, professional release notes from your repository's recent commit history using AI.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 items-end">
          <div className="flex-1 w-full">
            <label className="block text-sm font-medium text-[var(--color-text-tertiary)] mb-2">
              Time Range
            </label>
            <select 
              value={range}
              onChange={(e) => setRange(e.target.value)}
              disabled={isGenerating}
              className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[var(--color-accent-primary)] transition-colors appearance-none"
            >
              <option value="last_50">Last 50 Commits</option>
              <option value="last_7_days">Last 7 Days</option>
              <option value="last_30_days">Last 30 Days</option>
            </select>
          </div>
          <Button 
            onClick={handleGenerate} 
            isLoading={isGenerating}
            className="w-full sm:w-auto px-8"
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
        <div className="bg-[var(--color-bg-elevated)] p-6 sm:p-8 rounded-2xl border border-[var(--color-border)] shadow-sm">
          <div 
            className="prose prose-invert max-w-none text-[var(--color-text-secondary)] prose-headings:text-[var(--color-text-primary)] prose-a:text-[var(--color-accent-primary)] prose-li:my-1"
            dangerouslySetInnerHTML={{ __html: parsedHtml }}
          />
          {isGenerating && (
             <div className="mt-4 flex items-center gap-2 text-[var(--color-text-tertiary)] animate-pulse text-sm">
               <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
               Writing release notes...
             </div>
          )}
        </div>
      )}
    </div>
  );
}
