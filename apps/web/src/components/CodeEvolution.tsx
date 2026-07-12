"use client";

import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { api } from "../lib/api";
import type { Repository, RepositoryJourney, JourneyMilestone, MilestoneCategory, JourneyInsights } from "@chronocode/shared-types";

interface CodeEvolutionProps {
  repo: Repository;
  onJumpToTimeline: (sha: string) => void;
  isIndexing?: boolean;
}

const CATEGORY_COLORS: Record<MilestoneCategory, string> = {
  feature: "#3b82f6", // blue
  bugfix: "#ef4444", // red
  refactor: "#8b5cf6", // purple
  release: "#eab308", // gold
  architecture: "#06b6d4", // cyan
  docs: "#10b981", // emerald
  chore: "#6b7280", // gray
  unknown: "#4b5563", // dark gray
};

const CATEGORY_LABELS: Record<MilestoneCategory, string> = {
  feature: "Feature",
  bugfix: "Bug Fix",
  refactor: "Refactor",
  release: "Release",
  architecture: "Architecture",
  docs: "Documentation",
  chore: "Chore",
  unknown: "Commit",
};

export function CodeEvolution({ repo, onJumpToTimeline, isIndexing }: CodeEvolutionProps) {
  const [journey, setJourney] = useState<RepositoryJourney | null>(null);
  const [insights, setInsights] = useState<JourneyInsights | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [selectedMilestone, setSelectedMilestone] = useState<JourneyMilestone | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<MilestoneCategory | "all">("all");
  
  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [playProgress, setPlayProgress] = useState(100); // 0 to 100
  const playTimerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchInsights = useCallback(async (isPolling = false, forceRefresh = false) => {
    if (!forceRefresh && insights?.status === 'completed') return;
    if (!isPolling && insightsLoading) return;
    
    setInsightsLoading(true);
    try {
      const data = await api.repos.getJourneyInsights(repo.id, forceRefresh);
      
      if (data.status === 'completed') {
        setInsights(data);
        setInsightsLoading(false);
      } else if (data.status === 'generating') {
        setInsights(data); // to update status
        setTimeout(() => fetchInsights(true), 3000);
      } else {
        setInsightsLoading(false);
      }
    } catch (err) {
      console.warn("Insights generation not available or failed.", err);
      setInsightsLoading(false);
    }
  }, [repo.id, insights?.status, insightsLoading]);

  useEffect(() => {
    const fetchJourney = async () => {
      try {
        const data = await api.repos.getJourney(repo.id);
        setJourney(data);
        if (data.milestones.length > 0 && insights?.status !== 'completed' && !insightsLoading) {
          fetchInsights();
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    
    fetchJourney();
    
    let interval: any;
    if (isIndexing) {
      interval = setInterval(fetchJourney, 5000);
    }
    return () => clearInterval(interval);
  }, [repo.id, isIndexing, fetchInsights, insights]);

  // Handle Playback
  useEffect(() => {
    if (isPlaying) {
      playTimerRef.current = setInterval(() => {
        setPlayProgress(p => {
          if (p >= 100) {
            setIsPlaying(false);
            return 100;
          }
          return p + 0.5; // speed
        });
      }, 50);
    } else {
      clearInterval(playTimerRef.current);
    }
    return () => clearInterval(playTimerRef.current);
  }, [isPlaying]);

  // Keep timeline scrolled to playback head
  useEffect(() => {
    if (isPlaying && containerRef.current) {
      const scrollMax = containerRef.current.scrollWidth - containerRef.current.clientWidth;
      containerRef.current.scrollLeft = (playProgress / 100) * scrollMax;
    }
  }, [playProgress, isPlaying]);


  const timeScale = useMemo(() => {
    if (!journey || journey.milestones.length === 0) return null;
    const times = journey.milestones.map(m => new Date(m.authored_at).getTime());
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const span = Math.max(maxTime - minTime, 86400000);
    return { minTime, maxTime, span };
  }, [journey]);

  if (loading && !journey) {
    return (
      <div className="w-full h-96 flex items-center justify-center border border-[var(--color-border)] rounded-xl bg-[var(--color-bg-elevated)]/30">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[var(--color-accent-primary)] border-t-transparent rounded-full animate-spin" />
          <p className="text-[var(--color-text-tertiary)] text-sm font-medium tracking-wide">Mapping Repository Journey...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full p-4 border border-[var(--color-error)] rounded-xl bg-[var(--color-error-bg)] text-[var(--color-error)]">
        Failed to load journey: {error}
      </div>
    );
  }

  if (!journey || journey.milestones.length === 0) {
    return <div className="text-[var(--color-text-tertiary)] text-center py-8">No milestones found yet.</div>;
  }

  const maxActivity = Math.max(...journey.activity.map(a => a.count), 1);
  const minWidth = Math.max(1200, journey.milestones.length * 50);

  // Filter milestones
  const filteredMilestones = journey.milestones.filter(m => {
    if (categoryFilter !== "all" && m.category !== categoryFilter) return false;
    if (searchQuery && !m.message.toLowerCase().includes(searchQuery.toLowerCase()) && !m.author_name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const togglePlayback = () => {
    if (isPlaying) {
      setIsPlaying(false);
    } else {
      if (playProgress >= 100) setPlayProgress(0);
      setIsPlaying(true);
      setSelectedMilestone(null);
    }
  };

  return (
    <div className="relative w-full rounded-2xl border border-[var(--color-border)] bg-[#0A0A0A] overflow-y-auto custom-scrollbar flex flex-col shadow-2xl h-[calc(100vh-120px)]">
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          height: 8px;
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #0A0A0A;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
        .custom-scrollbar {
          scrollbar-width: thin;
          scrollbar-color: rgba(255, 255, 255, 0.1) #0A0A0A;
        }
      `}</style>
      
      {/* 1. Repository Story (AI) */}
      <div className="flex-none p-6 border-b border-white/10 bg-gradient-to-r from-[#111] to-[#1a1a1a]">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xl font-bold text-white tracking-wide flex items-center gap-2">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 22h14a2 2 0 0 0 2-2V7.5L14.5 2H6a2 2 0 0 0-2 2v4"/><polyline points="14 2 14 8 20 8"/><path d="M2 15h10"/><path d="M9 18l3-3-3-3"/></svg>
            Repository Story
          </h3>
          {insights?.status === 'completed' && (
            <button
              onClick={() => fetchInsights(false, true)}
              disabled={insightsLoading}
              className="text-xs flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 1 0 2.13-5.88L2 9"/></svg>
              Refresh Analysis
            </button>
          )}
        </div>
        
        {insights?.status === 'generating' || (insightsLoading && !insights) ? (
           <div className="animate-pulse space-y-2">
             <div className="h-4 bg-white/10 rounded w-full"></div>
             <div className="h-4 bg-white/10 rounded w-5/6"></div>
             <div className="h-4 bg-white/10 rounded w-4/6"></div>
             <p className="text-xs text-[var(--color-accent-primary)] mt-3">Analyzing repository evolution...</p>
           </div>
        ) : insights?.status === 'completed' && insights.ai_summary ? (
           <p className="text-sm text-gray-300 leading-relaxed max-w-5xl">{insights.ai_summary}</p>
        ) : (
           <div className="flex flex-col items-start gap-3">
             <p className="text-sm text-gray-400">An AI-generated narrative of this repository's evolution is available.</p>
             <button
               onClick={() => fetchInsights(false, true)}
               className="bg-[var(--color-accent-primary)] hover:bg-[var(--color-accent-primary)]/80 text-white text-sm font-semibold py-2 px-4 rounded-lg transition-colors flex items-center gap-2 shadow-[0_0_15px_rgba(var(--color-accent-primary-rgb),0.3)]"
             >
               <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
               Generate Repository Story
             </button>
           </div>
        )}
      </div>
            
      {/* 2. Repository Overview */}
      <div className="flex-none p-6 border-b border-white/5">
        <h3 className="text-lg font-bold text-white mb-4">Repository Overview</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="bg-black/40 border border-white/5 rounded-lg p-4 flex flex-col justify-center shadow-inner">
            <span className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider mb-1">Repo Age</span>
            <span className="text-white font-bold text-xl">{journey.stats.repository_age_days} <span className="text-sm font-normal text-gray-400">days</span></span>
          </div>
          <div className="bg-black/40 border border-white/5 rounded-lg p-4 flex flex-col justify-center shadow-inner">
            <span className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider mb-1">Total Commits</span>
            <span className="text-white font-bold text-xl">{journey.stats.total_commits}</span>
          </div>
          <div className="bg-black/40 border border-white/5 rounded-lg p-4 flex flex-col justify-center shadow-inner">
            <span className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider mb-1">Releases</span>
            <span className="text-yellow-400 font-bold text-xl">{journey.stats.releases_count}</span>
          </div>
          <div className="bg-black/40 border border-white/5 rounded-lg p-4 flex flex-col justify-center shadow-inner">
            <span className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider mb-1">Contributors</span>
            <span className="text-white font-bold text-xl">{journey.stats.contributors_count}</span>
          </div>
          <div className="bg-black/40 border border-white/5 rounded-lg p-4 flex flex-col justify-center shadow-inner">
            <span className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider mb-1">Major Refactors</span>
            <span className="text-purple-400 font-bold text-xl">{journey.stats.refactors_count}</span>
          </div>
          <div className="bg-black/40 border border-white/5 rounded-lg p-4 flex flex-col justify-center shadow-inner">
            <span className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider mb-1">Largest Commit</span>
            <span className="text-blue-400 font-mono font-bold text-lg">{journey.stats.largest_commit_sha ? journey.stats.largest_commit_sha.substring(0, 7) : 'N/A'}</span>
          </div>
        </div>
      </div>

      {/* 3. Interactive Repository Journey Timeline */}
      <div className="flex-none p-6 border-b border-white/5 bg-[#0f0f0f]">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4">
          <h3 className="text-lg font-bold text-white">Interactive Journey Timeline</h3>
          
          {/* Filter / Search Bar */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <svg className="absolute left-2.5 top-2 text-gray-500" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input 
                type="text" 
                placeholder="Search timeline..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="bg-black/50 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-sm text-white focus:outline-none focus:border-[var(--color-accent-primary)] w-48 transition-colors"
              />
            </div>
            <select 
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value as any)}
              className="bg-black/50 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-gray-300 focus:outline-none focus:border-[var(--color-accent-primary)]"
            >
              <option value="all">All Categories</option>
              <option value="release">Releases</option>
              <option value="architecture">Architecture</option>
              <option value="feature">Features</option>
              <option value="refactor">Refactors</option>
            </select>
            
            <button 
              onClick={togglePlayback}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${isPlaying ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' : 'bg-[var(--color-accent-primary)]/20 text-[var(--color-accent-primary)] hover:bg-[var(--color-accent-primary)]/30'}`}
            >
              {isPlaying ? (
                <><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> Pause</>
              ) : (
                <><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg> Replay</>
              )}
            </button>
          </div>
        </div>

        {/* MAIN LAYOUT: Canvas (Left/Full) & Side Panel (Right) */}
        <div className="flex-1 flex overflow-hidden relative h-[400px] border border-white/5 rounded-xl bg-black">
        
        {/* Interactive Timeline Canvas */}
        <div 
          ref={containerRef}
          className={`flex-1 overflow-x-auto overflow-y-hidden custom-scrollbar relative transition-all duration-300 ${selectedMilestone ? 'mr-96' : ''}`}
        >
          <div 
            className="absolute top-0 bottom-0 left-8 right-8 pointer-events-none"
            style={{ minWidth: `${minWidth}px` }}
          >
            {/* Playback Mask */}
            {playProgress < 100 && (
               <div 
                 className="absolute inset-0 bg-[#0A0A0A]/80 backdrop-blur-[1px] z-30 transition-all duration-[50ms]"
                 style={{ left: `${playProgress}%` }}
               />
            )}
            
            {/* Playback Line */}
            {playProgress < 100 && (
               <div 
                 className="absolute top-0 bottom-0 w-px bg-[var(--color-accent-primary)] shadow-[0_0_15px_var(--color-accent-primary)] z-40 transition-all duration-[50ms]"
                 style={{ left: `${playProgress}%` }}
               />
            )}

            {/* Evolution Phases Overlay */}
            {timeScale && journey.phases?.map((phase, i) => {
              const tStart = new Date(phase.start_date + "-01").getTime();
              const tEnd = new Date(phase.end_date + "-28").getTime();
              // First phase starts exactly at 0%, last phase ends exactly at 100%
              const xStart = i === 0 ? 0 : Math.max(0, 5 + ((tStart - timeScale.minTime) / timeScale.span) * 90);
              const xEnd = i === journey.phases.length - 1 ? 100 : Math.min(100, 5 + ((tEnd - timeScale.minTime) / timeScale.span) * 90);
              
              return (
                <div 
                  key={i} 
                  className="absolute top-0 bottom-0 border-l border-white/5 flex items-start pt-4 px-3"
                  style={{ left: `${xStart}%`, width: `${xEnd - xStart}%`, backgroundColor: phase.color }}
                >
                  <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">{phase.name}</span>
                </div>
              );
            })}

            {/* Background Density Graph (Activity) */}
            <div className="absolute inset-0 flex items-end opacity-20 px-4 z-0 pointer-events-none pb-8">
              {journey.activity.map((node, i) => (
                <div 
                  key={node.date} 
                  className="flex-1 bg-white/30 mx-0.5 rounded-t-sm transition-all"
                  style={{ height: `${(node.count / maxActivity) * 100}%` }}
                  title={`${node.date}: ${node.count} commits`}
                />
              ))}
            </div>

            {/* Central Axis Line */}
            <div className="absolute top-1/2 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[var(--color-border)] to-transparent -translate-y-1/2 z-10" />

            {/* Milestone Nodes */}
            {timeScale && filteredMilestones.map((milestone, index) => {
              const time = new Date(milestone.authored_at).getTime();
              const xPercent = 5 + ((time - timeScale.minTime) / timeScale.span) * 90;
              
              const isAbove = index % 2 === 0;
              const verticalOffset = 30 + (milestone.impact_score * 3) + ((index % 3) * 15);
              const topPos = isAbove ? `calc(50% - ${verticalOffset}px)` : `calc(50% + ${verticalOffset}px)`;
              
              const nodeSize = 10 + (milestone.impact_score * 1.5);
              const color = CATEGORY_COLORS[milestone.category];
              
              const isSelected = selectedMilestone?.sha === milestone.sha;

              return (
                <div 
                  key={milestone.sha}
                  className="absolute flex flex-col items-center group pointer-events-auto z-20"
                  style={{ 
                    left: `${xPercent}%`, 
                    top: topPos,
                    transform: 'translate(-50%, -50%)',
                  }}
                >
                  {/* Stem connecting to axis */}
                  <div 
                    className={`absolute w-px transition-colors -z-10 ${isSelected ? 'bg-white' : 'bg-white/10 group-hover:bg-white/50'}`}
                    style={{
                      height: `${verticalOffset}px`,
                      top: isAbove ? '50%' : `-${verticalOffset}px`,
                    }}
                  />

                  {/* Node */}
                  <button
                    onClick={() => setSelectedMilestone(milestone)}
                    className={`rounded-full border-2 bg-[#0A0A0A] hover:bg-white/10 transition-all cursor-pointer relative flex items-center justify-center group-hover:scale-125 ${isSelected ? 'scale-125 z-50 ring-4 ring-white/20' : 'shadow-lg'}`}
                    style={{ 
                      width: `${nodeSize}px`, 
                      height: `${nodeSize}px`,
                      borderColor: color,
                      boxShadow: isSelected ? `0 0 20px ${color}` : `0 0 ${nodeSize / 2}px ${color}40`,
                    }}
                  >
                    {milestone.impact_score > 6 && (
                      <div className="rounded-full" style={{ width: '40%', height: '40%', backgroundColor: color }} />
                    )}
                  </button>

                  {/* Year/Month Axis Marker */}
                  <div className="absolute top-[calc(50%+40px)] w-0 h-0 pointer-events-none">
                     <span className="absolute -left-4 top-[var(--timeline-y)] text-[10px] text-white/30 font-mono rotate-45 transform origin-top-left">
                       {new Date(milestone.authored_at).toLocaleDateString(undefined, { month: 'short', year: '2-digit' })}
                     </span>
                  </div>

                  {/* Elegant Hover Tooltip */}
                  {!isSelected && (
                    <div 
                      className={`absolute ${isAbove ? 'bottom-full mb-3' : 'top-full mt-3'} left-1/2 -translate-x-1/2 w-64 p-3 bg-[#111] border border-white/10 rounded-lg shadow-2xl opacity-0 scale-95 group-hover:opacity-100 group-hover:scale-100 transition-all pointer-events-none z-50`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span 
                          className="text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded"
                          style={{ color, backgroundColor: `${color}20` }}
                        >
                          {CATEGORY_LABELS[milestone.category]}
                        </span>
                        <span className="text-[10px] text-gray-500 ml-auto font-mono">
                          {new Date(milestone.authored_at).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-white line-clamp-3 leading-snug">
                        {milestone.message.split('\n')[0]}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Persistent Side Panel for Selected Milestone */}
        <div 
          className={`absolute top-0 right-0 bottom-0 w-96 bg-[#0D0D0D] border-l border-white/10 shadow-[-10px_0_30px_rgba(0,0,0,0.8)] transform transition-transform duration-300 ease-out flex flex-col ${selectedMilestone ? 'translate-x-0' : 'translate-x-full'}`}
        >
          {selectedMilestone && (
            <>
              {/* Panel Header */}
              <div className="flex items-center justify-between p-4 border-b border-white/10 bg-white/[0.02]">
                 <span 
                    className="inline-block text-xs uppercase tracking-wider font-bold px-2 py-1 rounded"
                    style={{ 
                      color: CATEGORY_COLORS[selectedMilestone.category], 
                      backgroundColor: `${CATEGORY_COLORS[selectedMilestone.category]}20` 
                    }}
                  >
                    {CATEGORY_LABELS[selectedMilestone.category]}
                  </span>
                 <button 
                   onClick={() => setSelectedMilestone(null)} 
                   className="p-1 text-white/50 hover:text-white hover:bg-white/10 rounded-full transition-colors"
                 >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                 </button>
              </div>
              
              {/* Panel Content (Scrollable) */}
              <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                <h3 className="text-xl font-bold text-white leading-tight mb-4">
                   {selectedMilestone.message.split('\n')[0]}
                </h3>
                
                <div className="flex flex-col gap-2 text-sm text-gray-400 mb-6">
                   <div className="flex items-center gap-2">
                     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                     {selectedMilestone.author_name}
                   </div>
                   <div className="flex items-center gap-2">
                     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                     {new Date(selectedMilestone.authored_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                   </div>
                </div>

                {/* Git Stats Grid */}
                <div className="grid grid-cols-3 gap-2 mb-6">
                   <div className="bg-black/50 border border-white/5 rounded-lg p-2 text-center">
                     <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Files</div>
                     <div className="text-white font-mono">{selectedMilestone.files_changed ?? '?'}</div>
                   </div>
                   <div className="bg-black/50 border border-white/5 rounded-lg p-2 text-center">
                     <div className="text-[10px] text-green-500/70 uppercase tracking-wider mb-1">Adds</div>
                     <div className="text-green-400 font-mono">+{selectedMilestone.insertions ?? '?'}</div>
                   </div>
                   <div className="bg-black/50 border border-white/5 rounded-lg p-2 text-center">
                     <div className="text-[10px] text-red-500/70 uppercase tracking-wider mb-1">Dels</div>
                     <div className="text-red-400 font-mono">-{selectedMilestone.deletions ?? '?'}</div>
                   </div>
                </div>

                {/* Full Message */}
                <div className="mb-6">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Commit Message</h4>
                  <div className="bg-black/40 border border-white/5 rounded-xl p-4">
                    <p className="text-sm text-gray-300 whitespace-pre-wrap font-mono leading-relaxed max-h-64 overflow-y-auto custom-scrollbar">
                      {selectedMilestone.message}
                    </p>
                  </div>
                </div>
              </div>

              {/* Panel Footer */}
              <div className="p-4 border-t border-white/10 bg-black/20">
                <button
                  onClick={() => {
                    onJumpToTimeline(selectedMilestone.sha);
                  }}
                  className="w-full flex items-center justify-center gap-2 bg-[var(--color-accent-primary)]/10 hover:bg-[var(--color-accent-primary)]/20 text-[var(--color-accent-primary)] border border-[var(--color-accent-primary)]/30 rounded-lg py-3 px-4 transition-all font-semibold shadow-[0_0_15px_rgba(var(--color-accent-primary-rgb),0.2)]"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                  Explore Micro-Commits
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      </div>

      {/* 4. Major Milestones List */}
      <div className="flex-none p-6 border-b border-white/5">
        <h3 className="text-lg font-bold text-white mb-4">Major Milestones</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {journey.milestones.slice(0, 9).map(m => (
            <div key={m.sha} onClick={() => setSelectedMilestone(m)} className="bg-black/40 border border-white/5 rounded-lg p-4 cursor-pointer hover:bg-white/5 transition-colors group flex flex-col gap-2">
               <div className="flex items-center justify-between">
                 <span 
                    className="text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded"
                    style={{ color: CATEGORY_COLORS[m.category], backgroundColor: `${CATEGORY_COLORS[m.category]}20` }}
                  >
                    {CATEGORY_LABELS[m.category]}
                 </span>
                 <span className="text-[10px] text-gray-500 font-mono">{new Date(m.authored_at).toLocaleDateString()}</span>
               </div>
               <p className="text-sm text-gray-300 font-medium line-clamp-2 group-hover:text-white transition-colors">{m.message.split('\n')[0]}</p>
               <div className="flex items-center gap-3 mt-auto pt-2 border-t border-white/5 text-[10px] text-gray-500">
                 <span>+{m.insertions || 0}</span>
                 <span>-{m.deletions || 0}</span>
                 <span>{m.files_changed || 0} files</span>
                 <span className="ml-auto flex items-center gap-1">
                   <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                   {m.author_name}
                 </span>
               </div>
            </div>
          ))}
        </div>
      </div>

      {/* 5. Repository Insights */}
      <div className="flex-none p-6 pb-12">
        <h3 className="text-lg font-bold text-white mb-4">Advanced Insights</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          
          <div className="bg-[#111] border border-white/5 rounded-xl p-5 relative overflow-hidden group hover:border-[var(--color-accent-primary)]/50 transition-colors">
            <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/10 rounded-bl-full -mr-4 -mt-4" />
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Health Score</h4>
            <div className="flex items-end gap-2">
              <span className={`text-4xl font-bold tracking-tighter ${journey.stats.repository_health_score > 75 ? 'text-green-400' : journey.stats.repository_health_score > 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                {journey.stats.repository_health_score}
              </span>
              <span className="text-sm text-gray-500 font-medium mb-1">/ 100</span>
            </div>
            <p className="text-xs text-gray-500 mt-2">Based on dev velocity, refactors, and consistency.</p>
          </div>

          <div className="bg-[#111] border border-white/5 rounded-xl p-5 relative overflow-hidden group hover:border-[var(--color-accent-primary)]/50 transition-colors">
            <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/10 rounded-bl-full -mr-4 -mt-4" />
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Dev Velocity</h4>
            <div className="flex items-end gap-2">
              <span className="text-4xl font-bold tracking-tighter text-white">
                {journey.stats.development_velocity}
              </span>
              <span className="text-sm text-gray-500 font-medium mb-1">commits/mo</span>
            </div>
            <p className="text-xs text-gray-500 mt-2">Average pace of development over active months.</p>
          </div>

          <div className="bg-[#111] border border-white/5 rounded-xl p-5 relative overflow-hidden group hover:border-[var(--color-accent-primary)]/50 transition-colors">
            <div className="absolute top-0 right-0 w-24 h-24 bg-orange-500/10 rounded-bl-full -mr-4 -mt-4" />
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Peak Activity</h4>
            <div className="flex flex-col gap-1">
              <span className="text-xl font-bold tracking-tighter text-white">{journey.stats.most_active_month}</span>
              <span className="text-sm text-gray-400">{journey.stats.most_active_year} was the most active year</span>
            </div>
            <p className="text-xs text-gray-500 mt-3">{journey.stats.most_active_month_count} commits during peak month.</p>
          </div>

          <div className="bg-[#111] border border-white/5 rounded-xl p-5 relative overflow-hidden group hover:border-[var(--color-accent-primary)]/50 transition-colors">
            <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/10 rounded-bl-full -mr-4 -mt-4" />
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Commit Size</h4>
            <div className="flex items-end gap-2">
              <span className="text-4xl font-bold tracking-tighter text-white">
                ~{journey.stats.average_commit_size}
              </span>
              <span className="text-sm text-gray-500 font-medium mb-1">lines</span>
            </div>
            <p className="text-xs text-gray-500 mt-2">Longest inactive gap: {journey.stats.longest_inactive_period_days} days.</p>
          </div>

        </div>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar {
          height: 6px;
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.02);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}} />
    </div>
  );
}
