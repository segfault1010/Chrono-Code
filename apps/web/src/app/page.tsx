"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "../lib/api";

export default function Home() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e?: React.FormEvent, directUrl?: string) => {
    if (e) e.preventDefault();
    
    // Auto-complete default repo if empty
    const submittedUrl = directUrl || url.trim() || "https://github.com/expressjs/morgan";
    
    // Auto-format owner/repo to full URL
    const finalUrl = submittedUrl.includes("github.com") 
      ? submittedUrl 
      : `https://github.com/${submittedUrl}`;

    setIsLoading(true);
    setError(null);

    try {
      const repo = await api.repos.create(finalUrl);
      router.push(`/repos/${repo.id}`);
    } catch (err: any) {
      setError(err.message || "Failed to analyze repository");
      setIsLoading(false);
    }
  };

  const loadDemo = (demoUrl: string) => {
    setUrl(demoUrl);
    handleSubmit(undefined, demoUrl);
  };

  return (
    <main className="relative min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center overflow-x-hidden bg-black selection:bg-white/30 animate-[fadeIn_1s_ease-out_forwards]">
      
      {/* Radiant Glowing Orbs at the Bottom */}
      <div className="absolute -bottom-32 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-gradient-to-r from-blue-600/30 via-purple-600/30 to-orange-600/30 blur-[150px] rounded-full pointer-events-none opacity-60"></div>

      {/* Grid Pattern Overlay for Texture */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none animate-[fadeIn_2s_ease-out_forwards]"></div>

      <div className="relative z-10 w-full max-w-4xl px-4 flex flex-col items-center animate-[fadeInUp_1s_ease-out_forwards] text-center">
        
        {/* Main Hero Header */}
        <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight text-white mb-6">
          Write Better.<br/>
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-[var(--color-accent-primary)] via-purple-400 to-[var(--color-accent-secondary)] animate-pulse-slow">Understand Anything with AI.</span>
        </h1>
        
        <p className="text-lg sm:text-xl text-zinc-400 max-w-2xl mx-auto mb-12 font-medium">
          Turn raw git history into clear, AI-generated explanations.<br className="hidden sm:block" /> 
          Paste a GitHub URL to reconstruct context instantly.
        </p>

        {/* Floating Search Bar */}
        <form onSubmit={handleSubmit} className="w-full max-w-2xl relative group mt-8">
          <div className="absolute -inset-1 bg-gradient-to-r from-[var(--color-accent-primary)] via-purple-500 to-[var(--color-accent-secondary)] rounded-full blur-[20px] opacity-20 group-hover:opacity-40 transition duration-1000 group-hover:duration-500 pointer-events-none"></div>
          <div className="relative flex items-center bg-gradient-to-b from-white/10 to-white/5 backdrop-blur-2xl border border-white/20 border-b-white/5 rounded-full p-2.5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.2),inset_0_-1px_1px_rgba(0,0,0,0.2),0_20px_50px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.05)] transition-all duration-300 hover:from-white/15 hover:to-white/10 group-hover:-translate-y-1 group-hover:shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),inset_0_-1px_1px_rgba(0,0,0,0.2),0_30px_60px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.1)]">
            <div className="pl-6 pr-4 text-zinc-500 group-hover:text-white transition-colors duration-300">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/></svg>
            </div>
            
            <input
              type="text"
              placeholder="https://github.com/owner/repo"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={isLoading}
              className="flex-1 bg-transparent border-none outline-none text-white text-lg px-2 placeholder:text-zinc-500 font-medium w-full"
            />
            
            <button
              type="submit"
              disabled={isLoading}
              className="ml-2 bg-white border border-black/20 text-black px-8 py-4 rounded-full font-bold hover:shadow-[0_0_20px_rgba(255,255,255,0.5)] transition-all duration-300 disabled:opacity-50 flex items-center gap-3 relative overflow-hidden group/btn hover:-translate-y-0.5"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-black/10 to-transparent -translate-x-full group-hover/btn:translate-x-full transition-transform duration-1000" />
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-black/20 border-t-black rounded-full animate-spin"></div>
                  Analyzing...
                </>
              ) : (
                <>
                  Analyze
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                </>
              )}
            </button>
          </div>
          
          {error && (
            <p className="absolute -bottom-8 left-0 text-red-400 text-sm font-medium w-full text-center">
              {error}
            </p>
          )}
        </form>

        {/* Demo Repositories */}
        <div className="mt-16 text-center">
          <p className="text-sm font-bold text-zinc-500 uppercase tracking-widest mb-6 flex items-center justify-center gap-4">
            <span className="w-8 h-[1px] bg-zinc-800"></span>
            Try a Demo Repository
            <span className="w-8 h-[1px] bg-zinc-800"></span>
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            {[
              "expressjs/morgan",
              "expressjs/cors",
              "axios/axios",
              "reduxjs/redux",
              "npm/node-semver",
            ].map((repoName) => (
              <button
                key={repoName}
                onClick={() => loadDemo(repoName)}
                className="px-5 py-2.5 rounded-full border border-white/5 bg-white/5 hover:bg-white/10 hover:border-white/10 text-white/70 hover:text-white text-sm font-medium transition-all duration-300 hover:scale-105 hover:-translate-y-1 hover:shadow-[0_10px_20px_rgba(0,0,0,0.5)] flex items-center gap-2 backdrop-blur-md cursor-pointer"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
                  <path d="M9 18c-4.51 2-5-2-7-2" />
                </svg>
                {repoName}
              </button>
            ))}
          </div>
        </div>

      </div>
    </main>
  );
}
