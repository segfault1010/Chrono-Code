"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "../lib/api";
import HeroDashboardPreview from "../components/HeroDashboardPreview";
import { ScramblingStats } from "../components/ScramblingStats";

export default function Home() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const placeholders = [
    "https://github.com/facebook/react",
    "https://github.com/vercel/next.js",
    "https://github.com/nodejs/node",
    "https://github.com/microsoft/vscode",
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % placeholders.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

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
    <main className="relative min-h-[calc(100vh-4rem)] flex flex-col items-center justify-start overflow-x-hidden bg-black selection:bg-white/30 animate-[fadeIn_1s_ease-out_forwards]">
      
      {/* Radiant Glowing Orbs at the Bottom */}
      <div className="absolute -bottom-32 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-gradient-to-r from-blue-600/30 via-purple-600/30 to-orange-600/30 blur-[150px] rounded-full pointer-events-none opacity-60 animate-pulse-slow"></div>
      <div className="absolute top-1/4 right-0 w-[500px] h-[500px] bg-gradient-to-b from-purple-500/10 to-transparent blur-[120px] rounded-full pointer-events-none animate-pulse-slow" style={{ animationDelay: '1s' }}></div>
      <div className="absolute top-1/3 left-10 w-2 h-2 rounded-full bg-blue-500/20 shadow-[0_0_10px_rgba(59,130,246,0.5)] animate-[bounce_4s_infinite] pointer-events-none hidden lg:block"></div>
      <div className="absolute bottom-1/3 right-10 w-3 h-3 rounded-full bg-purple-500/20 shadow-[0_0_10px_rgba(168,85,247,0.5)] animate-[bounce_5s_infinite_1s] pointer-events-none hidden lg:block"></div>

      {/* Grid Pattern Overlay for Texture */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none animate-[fadeIn_2s_ease-out_forwards]"></div>

      <div className="relative z-10 w-full max-w-[1800px] px-6 lg:px-12 xl:px-20 flex flex-col lg:flex-row items-center justify-between gap-12 lg:gap-16 animate-[fadeInUp_1s_ease-out_forwards] pt-16 lg:pt-24 pb-12 lg:pb-0">
        
        {/* Left Column */}
        <div className="w-full lg:w-[48%] xl:w-[48%] flex-shrink-0 flex flex-col items-center lg:items-start text-center lg:text-left">
        
        {/* Main Hero Header */}
        <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight text-white mb-8">
          Understand the Story<br/>
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-[var(--color-accent-primary)] via-purple-400 to-[var(--color-accent-secondary)] animate-pulse-slow">Behind Every Repository.</span>
        </h1>
        
        <div className="text-lg sm:text-xl text-zinc-400 max-w-2xl mx-auto mb-10 font-medium space-y-4">
          <p>Paste any GitHub repository and instantly explore:</p>
          <ul className="flex flex-wrap justify-center lg:justify-start gap-x-6 gap-y-2 text-zinc-300 text-base sm:text-lg">
            <li className="flex items-center gap-2"><span className="text-purple-400">✓</span> AI-generated summaries</li>
            <li className="flex items-center gap-2"><span className="text-purple-400">✓</span> Repository evolution</li>
            <li className="flex items-center gap-2"><span className="text-purple-400">✓</span> Architecture insights</li>
          </ul>
        </div>

        {/* Floating Search Bar */}
        <form onSubmit={handleSubmit} className="w-full max-w-2xl relative group mt-8">
          <div className="absolute -inset-1 bg-gradient-to-r from-[var(--color-accent-primary)] via-purple-500 to-[var(--color-accent-secondary)] rounded-full blur-[20px] opacity-20 group-hover:opacity-40 transition duration-1000 group-hover:duration-500 pointer-events-none"></div>
          <div className="relative flex items-center bg-gradient-to-b from-white/10 to-white/5 backdrop-blur-2xl border border-white/20 border-b-white/5 rounded-full p-2.5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.2),inset_0_-1px_1px_rgba(0,0,0,0.2),0_20px_50px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.05)] transition-all duration-300 hover:from-white/15 hover:to-white/10 group-hover:-translate-y-1 group-hover:shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),inset_0_-1px_1px_rgba(0,0,0,0.2),0_30px_60px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.1)]">
            <div className="pl-6 pr-4 text-zinc-500 group-hover:text-white transition-colors duration-300">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/></svg>
            </div>
            
            <input
              type="text"
              placeholder={placeholders[placeholderIndex]}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={isLoading}
              aria-label="GitHub Repository URL"
              className="flex-1 bg-transparent border-none outline-none focus:ring-2 focus:ring-purple-500/50 rounded-lg text-white text-lg px-2 placeholder:text-zinc-500 transition-all duration-500 font-medium w-full"
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
                  Generating Report...
                </>
              ) : (
                <>
                  Analyze Repository
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
          <div className="mt-8 w-full">
            <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4 flex items-center justify-center lg:justify-start gap-4">
              <span className="w-8 h-[1px] bg-zinc-800"></span>
              Try a Demo Repository
              <span className="w-8 h-[1px] bg-zinc-800 lg:hidden"></span>
            </p>
            <div className="flex flex-wrap justify-center lg:justify-start gap-4">
              {[
                { org: "expressjs", name: "morgan", color: "from-blue-500 to-cyan-400" },
                { org: "expressjs", name: "cors", color: "from-purple-500 to-pink-500" },
                { org: "axios", name: "axios", color: "from-green-500 to-emerald-400" },
                { org: "reduxjs", name: "redux", color: "from-orange-500 to-red-400" },
                { org: "npm", name: "node-semver", color: "from-red-500 to-rose-400" },
              ].map((repo) => (
                <button
                  key={repo.name}
                  onClick={() => loadDemo(`${repo.org}/${repo.name}`)}
                  className="flex items-center gap-3 p-3 pr-5 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 hover:border-white/10 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_10px_20px_rgba(0,0,0,0.3)] backdrop-blur-md cursor-pointer group text-left"
                >
                  <div className={`w-10 h-10 rounded-full bg-gradient-to-tr ${repo.color} p-0.5`}>
                    <div className="w-full h-full bg-black/60 rounded-full flex items-center justify-center backdrop-blur-sm text-white font-bold text-sm group-hover:bg-black/40 transition-colors">
                      {repo.org[0].toUpperCase()}
                    </div>
                  </div>
                  <div>
                    <div className="text-zinc-400 text-xs">{repo.org}</div>
                    <div className="text-white font-medium text-sm">{repo.name}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

        {/* Feature Preview Chips */}
        <div className="flex flex-wrap justify-center lg:justify-start gap-3 mt-10">
          {[
            { icon: "✨", text: "AI Summary" },
            { icon: "📈", text: "Timeline" },
            { icon: "🔄", text: "Code Evolution" },
            { icon: "👥", text: "Contributors" },
            { icon: "🛡️", text: "Risk Detection" }
          ].map((feature) => (
            <span key={feature.text} className="px-4 py-2 rounded-full bg-white/5 border border-white/10 text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all duration-300 hover:shadow-[0_0_15px_rgba(255,255,255,0.1)] cursor-default flex items-center gap-2">
              <span>{feature.icon}</span> {feature.text}
            </span>
          ))}
        </div>

        {/* Trust Indicators */}
        <div className="flex flex-wrap justify-center lg:justify-start gap-x-6 gap-y-2 mt-6 text-xs font-medium text-zinc-500">
          <span className="flex items-center gap-2"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5"/></svg> Works with any public GitHub repo</span>
          <span className="flex items-center gap-2"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5"/></svg> No installation required</span>
          <span className="flex items-center gap-2"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5"/></svg> AI explanations under a minute</span>
        </div>

        </div>

        {/* Right Column - Dashboard Preview */}
        <div className="w-full lg:w-[55%] xl:w-[58%] hidden lg:flex justify-end perspective-1000 lg:-mt-24 lg:translate-x-8 xl:-mt-40 xl:translate-x-16 relative z-20">
          <div className="rotate-y-[-5deg] rotate-x-[2deg] hover:rotate-y-0 hover:rotate-x-0 transition-transform duration-700 ease-out origin-right w-full max-w-[850px]">
            <HeroDashboardPreview />
          </div>
        </div>

      </div>

      {/* Product Statistics */}
      <ScramblingStats />

      {/* How It Works Section */}
      <div className="w-full max-w-7xl mx-auto px-6 lg:px-8 py-24 relative">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">How It Works</h2>
          <p className="text-zinc-400 text-lg">From GitHub URL to complete repository understanding in three steps.</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 relative">
          {/* Connecting Line */}
          <div className="hidden md:block absolute top-[2.5rem] left-[15%] right-[15%] h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
          
          {/* Step 1 */}
          <div className="flex flex-col items-center text-center relative z-10 group">
            <div className="w-20 h-20 rounded-2xl bg-[#0a0a0a] border border-white/10 flex items-center justify-center mb-6 shadow-xl group-hover:bg-white/5 group-hover:-translate-y-2 transition-all duration-300 relative">
              <div className="absolute -inset-1 bg-gradient-to-tr from-blue-500/20 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity blur-sm"></div>
              <span className="text-3xl relative z-10">🔗</span>
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">1. Paste Repository</h3>
            <p className="text-zinc-400 text-sm">Paste any public GitHub repository URL. No installation required.</p>
          </div>
          
          {/* Step 2 */}
          <div className="flex flex-col items-center text-center relative z-10 group">
            <div className="w-20 h-20 rounded-2xl bg-[#0a0a0a] border border-white/10 flex items-center justify-center mb-6 shadow-xl group-hover:bg-white/5 group-hover:-translate-y-2 transition-all duration-300 relative">
              <div className="absolute -inset-1 bg-gradient-to-tr from-purple-500/20 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity blur-sm"></div>
              <span className="text-3xl relative z-10">✨</span>
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">2. AI Analysis</h3>
            <p className="text-zinc-400 text-sm">Our AI engine indexes and analyzes the commit history instantly.</p>
          </div>
          
          {/* Step 3 */}
          <div className="flex flex-col items-center text-center relative z-10 group">
            <div className="w-20 h-20 rounded-2xl bg-[#0a0a0a] border border-white/10 flex items-center justify-center mb-6 shadow-xl group-hover:bg-white/5 group-hover:-translate-y-2 transition-all duration-300 relative">
              <div className="absolute -inset-1 bg-gradient-to-tr from-pink-500/20 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity blur-sm"></div>
              <span className="text-3xl relative z-10">📊</span>
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">3. Explore Insights</h3>
            <p className="text-zinc-400 text-sm">Explore the interactive repository timeline and architectural evolution.</p>
          </div>
        </div>
      </div>

      {/* Feature Showcase */}
      <div className="w-full max-w-7xl mx-auto px-6 lg:px-8 py-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Deep Insights from Raw Git Data</h2>
          <p className="text-zinc-400 text-lg">Everything you need to understand a codebase, generated instantly.</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* AI Summary */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-colors group">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-500/20 to-rose-500/20 border border-white/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <span className="text-2xl">✨</span>
            </div>
            <h3 className="text-lg font-bold text-white mb-2">AI Summary</h3>
            <p className="text-zinc-400 text-sm leading-relaxed">Understand the purpose and primary functions of a codebase instantly without reading the README.</p>
          </div>
          
          {/* Interactive Timeline */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-colors group">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-indigo-500/20 border border-white/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <span className="text-2xl">📈</span>
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Interactive Timeline</h3>
            <p className="text-zinc-400 text-sm leading-relaxed">Scroll through years of evolution in minutes. See exactly when and why major changes occurred.</p>
          </div>
          
          {/* Architecture Evolution */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-colors group">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500/20 to-red-500/20 border border-white/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <span className="text-2xl">🏗️</span>
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Architecture Evolution</h3>
            <p className="text-zinc-400 text-sm leading-relaxed">Track when major structural changes, rewrites, or framework migrations were introduced.</p>
          </div>
          
          {/* Contributor Analytics */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-colors group">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500/20 to-emerald-500/20 border border-white/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <span className="text-2xl">👥</span>
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Contributor Analytics</h3>
            <p className="text-zinc-400 text-sm leading-relaxed">See who drove the most impactful changes and understand the core team's dynamics over time.</p>
          </div>
        </div>
      </div>

      {/* Comparison Section */}
      <div className="w-full max-w-7xl mx-auto px-6 lg:px-8 py-24 border-t border-white/10">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Why ChronoCode?</h2>
          <p className="text-zinc-400 text-lg">Stop wasting time manually reconstructing context.</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
          {/* Without ChronoCode */}
          <div className="bg-[#111] border border-red-900/30 rounded-3xl p-8 lg:p-12">
            <h3 className="text-xl font-bold text-zinc-300 mb-8 flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center">✕</span>
              Without ChronoCode
            </h3>
            <ul className="space-y-6">
              <li className="flex items-start gap-4">
                <span className="text-red-500/70 mt-0.5">✕</span>
                <span className="text-zinc-400">Reading hundreds of commit messages manually.</span>
              </li>
              <li className="flex items-start gap-4">
                <span className="text-red-500/70 mt-0.5">✕</span>
                <span className="text-zinc-400">Searching GitHub endlessly for PRs to understand why a file changed.</span>
              </li>
              <li className="flex items-start gap-4">
                <span className="text-red-500/70 mt-0.5">✕</span>
                <span className="text-zinc-400">Missing important historical context when onboarding to a new codebase.</span>
              </li>
              <li className="flex items-start gap-4">
                <span className="text-red-500/70 mt-0.5">✕</span>
                <span className="text-zinc-400">Guessing the architecture evolution from old documentation.</span>
              </li>
            </ul>
          </div>
          
          {/* With ChronoCode */}
          <div className="bg-gradient-to-b from-blue-900/10 to-purple-900/10 border border-blue-500/20 rounded-3xl p-8 lg:p-12 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 blur-[80px] rounded-full pointer-events-none"></div>
            <h3 className="text-xl font-bold text-white mb-8 flex items-center gap-3 relative z-10">
              <span className="w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center">✓</span>
              With ChronoCode
            </h3>
            <ul className="space-y-6 relative z-10">
              <li className="flex items-start gap-4">
                <span className="text-blue-400 mt-0.5">✓</span>
                <span className="text-zinc-200">Instant AI summaries that explain the exact purpose of the repository.</span>
              </li>
              <li className="flex items-start gap-4">
                <span className="text-blue-400 mt-0.5">✓</span>
                <span className="text-zinc-200">Interactive visual timeline mapping out every major architectural shift.</span>
              </li>
              <li className="flex items-start gap-4">
                <span className="text-blue-400 mt-0.5">✓</span>
                <span className="text-zinc-200">Immediate context and grounding for any new developer joining the project.</span>
              </li>
              <li className="flex items-start gap-4">
                <span className="text-blue-400 mt-0.5">✓</span>
                <span className="text-zinc-200">Clear insights into contributor dynamics and historical milestones.</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

    </main>
  );
}
