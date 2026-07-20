import React from 'react';

export default function HeroDashboardPreview() {
  return (
    <div className="w-full h-full min-h-[500px] rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl p-6 flex flex-col gap-4 shadow-2xl relative overflow-hidden group">
      {/* Decorative gradient behind the mockup */}
      <div className="absolute -top-32 -right-32 w-64 h-64 bg-purple-500/20 blur-[80px] rounded-full pointer-events-none transition-transform duration-700 group-hover:scale-150"></div>
      
      {/* Top Bar */}
      <div className="flex items-center gap-3 border-b border-white/10 pb-4">
        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 p-0.5">
          <div className="w-full h-full bg-black/50 rounded-full flex items-center justify-center backdrop-blur-sm text-white font-bold text-sm">
            F
          </div>
        </div>
        <div>
          <div className="text-white font-semibold text-lg flex items-center gap-2">
            facebook / react
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-medium border border-emerald-500/20">Analyzed</span>
          </div>
          <div className="text-zinc-500 text-xs">Last updated 2 mins ago</div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1">
        {/* Left Column - 2 spans */}
        <div className="md:col-span-2 flex flex-col gap-4">
          {/* AI Summary Card */}
          <div className="bg-white/5 rounded-xl border border-white/5 p-4 relative overflow-hidden group/card hover:bg-white/10 transition-colors">
            <div className="flex items-center gap-2 text-purple-400 font-medium text-sm mb-3">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              AI Summary
            </div>
            <div className="space-y-3">
              <p className="text-zinc-300 text-sm leading-relaxed">
                React is a JavaScript library for building user interfaces. It evolved from a simple view layer to a comprehensive UI framework powering millions of applications.
              </p>
              <div className="h-2.5 bg-white/10 rounded w-full mt-4"></div>
              <div className="h-2.5 bg-white/10 rounded w-11/12"></div>
              <div className="h-2.5 bg-white/10 rounded w-4/5"></div>
            </div>
          </div>

          {/* Timeline Mock */}
          <div className="flex-1 bg-white/5 rounded-xl border border-white/5 p-4 relative">
            <div className="text-white/70 font-medium text-sm mb-4">Evolution Timeline</div>
            <div className="relative border-l border-white/10 ml-2 space-y-5">
              <div className="relative">
                <div className="absolute -left-[21px] top-1 w-3 h-3 bg-blue-500 rounded-full border-2 border-black shadow-[0_0_10px_rgba(59,130,246,0.5)]"></div>
                <div className="pl-4">
                  <div className="text-white text-sm font-medium">Fiber Architecture</div>
                  <div className="text-zinc-500 text-xs mt-1">Major rewrite of the reconciler</div>
                </div>
              </div>
              <div className="relative">
                <div className="absolute -left-[21px] top-1 w-3 h-3 bg-purple-500 rounded-full border-2 border-black shadow-[0_0_10px_rgba(168,85,247,0.5)]"></div>
                <div className="pl-4">
                  <div className="text-white text-sm font-medium">Hooks Introduced</div>
                  <div className="text-zinc-500 text-xs mt-1">State in functional components</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column - 1 span */}
        <div className="flex flex-col gap-4">
          {/* Health Stats */}
          <div className="bg-white/5 rounded-xl border border-white/5 p-4 flex flex-col gap-4">
            <div>
              <div className="text-zinc-500 text-xs mb-1">Total Commits</div>
              <div className="text-white font-bold text-xl">16,245</div>
            </div>
            <div>
              <div className="text-zinc-500 text-xs mb-1">Contributors</div>
              <div className="text-white font-bold text-xl">1,532</div>
            </div>
          </div>
          
          {/* Architecture/Risk */}
          <div className="flex-1 bg-white/5 rounded-xl border border-white/5 p-4 flex flex-col">
            <div className="text-white/70 font-medium text-sm mb-4">Risk Level</div>
            <div className="flex-1 flex items-center justify-center">
              <div className="w-24 h-24 rounded-full border-[6px] border-emerald-500/20 relative flex items-center justify-center">
                <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" strokeWidth="6" className="text-emerald-500" strokeDasharray="289" strokeDashoffset="72" />
                </svg>
                <div className="text-emerald-400 font-bold text-lg">Low</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Row - 3 Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Top Languages */}
        <div className="bg-white/5 rounded-xl border border-white/5 p-4 flex flex-col justify-between">
          <div className="text-white/70 font-medium text-sm mb-4">Top Languages</div>
          <div>
            <div className="w-full h-2 rounded-full bg-white/10 flex overflow-hidden mb-4">
              <div className="bg-yellow-400 h-full w-[65%]"></div>
              <div className="bg-blue-500 h-full w-[20%]"></div>
              <div className="bg-zinc-500 h-full w-[15%]"></div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs">
                <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-yellow-400"></div><span className="text-zinc-300">JavaScript</span></div>
                <span className="text-zinc-500 font-mono">65%</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-blue-500"></div><span className="text-zinc-300">TypeScript</span></div>
                <span className="text-zinc-500 font-mono">20%</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-zinc-500"></div><span className="text-zinc-300">Other</span></div>
                <span className="text-zinc-500 font-mono">15%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Latest Milestone */}
        <div className="bg-white/5 rounded-xl border border-white/5 p-4 flex flex-col justify-start">
          <div className="text-white/70 font-medium text-sm mb-4">Latest Milestone</div>
          <div className="inline-flex px-2.5 py-1 rounded-full bg-purple-500/20 text-purple-400 text-xs font-semibold mb-3 self-start border border-purple-500/20">v18.3.0</div>
          <div className="text-white text-sm font-medium leading-snug mb-1.5">Concurrent Rendering Improvements</div>
          <div className="text-zinc-500 text-xs">2 months ago</div>
        </div>

        {/* Active Contributors */}
        <div className="bg-white/5 rounded-xl border border-white/5 p-4 flex flex-col justify-start">
          <div className="text-white/70 font-medium text-sm mb-4">Active Contributors</div>
          <div className="flex items-center mt-2">
            <div className="flex -space-x-2">
              <img className="w-8 h-8 rounded-full border-2 border-[#111111]" src="https://i.pravatar.cc/100?img=47" alt="avatar" />
              <img className="w-8 h-8 rounded-full border-2 border-[#111111]" src="https://i.pravatar.cc/100?img=12" alt="avatar" />
              <img className="w-8 h-8 rounded-full border-2 border-[#111111]" src="https://i.pravatar.cc/100?img=33" alt="avatar" />
              <img className="w-8 h-8 rounded-full border-2 border-[#111111]" src="https://i.pravatar.cc/100?img=68" alt="avatar" />
              <img className="w-8 h-8 rounded-full border-2 border-[#111111]" src="https://i.pravatar.cc/100?img=11" alt="avatar" />
            </div>
            <div className="ml-3 text-purple-400 text-xs font-semibold">+1.5k</div>
          </div>
        </div>
      </div>
    </div>
  );
}
