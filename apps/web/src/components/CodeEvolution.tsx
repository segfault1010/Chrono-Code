"use client";

import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { api } from "../lib/api";
import type { Repository, RepositoryJourney, JourneyMilestone, MilestoneCategory, JourneyInsights, JourneyPhase } from "@chronocode/shared-types";

interface CodeEvolutionProps {
  repo: Repository;
  onJumpToTimeline: (sha: string) => void;
  isIndexing?: boolean;
  user?: any;
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

function isMajor(m: JourneyMilestone) {
  return m.impact_score >= 8 || m.category === 'release';
}
function isMedium(m: JourneyMilestone) {
  return m.impact_score >= 4 && m.impact_score < 8;
}

type ClusterNode = {
  id: string;
  xPercent: number;
  milestones: JourneyMilestone[];
  hasMajor: boolean;
  categoryCounts: Record<MilestoneCategory, number>;
};

type SidePanelContent = 
  | { type: 'milestone'; milestone: JourneyMilestone }
  | { type: 'cluster'; cluster: ClusterNode }
  | { type: 'phase'; phase: JourneyPhase }
  | null;

export function CodeEvolution({ repo, onJumpToTimeline, isIndexing, user }: CodeEvolutionProps) {
  const [journey, setJourney] = useState<RepositoryJourney | null>(null);
  const [insights, setInsights] = useState<JourneyInsights | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [sidePanel, setSidePanel] = useState<SidePanelContent>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<MilestoneCategory | "all">("all");
  
  // 1 = Lifetime, 2 = Year, 3 = Month
  const [zoomLevel, setZoomLevel] = useState<1 | 2 | 3>(1);
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
        setInsights(data); 
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
        const safeData = { ...data, milestones: data.milestones || [] };
        setJourney(safeData);
        
        if (safeData.milestones.length > 0 && insights?.status !== 'completed' && !insightsLoading) {
          fetchInsights();
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    
    fetchJourney();
  }, [repo.id, isIndexing, fetchInsights, insights]);

  // Polling for background updates
  useEffect(() => {
    const isGenerating = journey?._meta?.status === 'pending' || journey?._meta?.status === 'queued' || journey?._meta?.status === 'computing';
    
    if (isIndexing || isGenerating) {
      const interval = setInterval(async () => {
        try {
          const data = await api.repos.getJourney(repo.id);
          setJourney(data);
          if (data.milestones && data.milestones.length > 0 && insights?.status !== 'completed' && !insightsLoading) {
            fetchInsights();
          }
        } catch (err: any) {
          setError(err.message);
        }
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [repo.id, isIndexing, journey?._meta?.status, insights?.status, insightsLoading, fetchInsights]);

  // Calculations for Scale and Clustering
  const { timeScale, years, canvasWidth } = useMemo(() => {
    if (!journey || !journey.milestones || journey.milestones.length === 0) {
      return { timeScale: null, years: [], canvasWidth: 1200 };
    }
    const times = journey.milestones.map(m => new Date(m.authored_at).getTime());
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times, Date.now());
    const span = Math.max(maxTime - minTime, 86400000);
    
    const startYear = new Date(minTime).getFullYear();
    const endYear = new Date(maxTime).getFullYear();
    const y = [];
    for (let i = startYear; i <= endYear; i++) y.push(i);
    
    const baseWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const width = zoomLevel === 1 ? Math.max(baseWidth, 1200) : zoomLevel === 2 ? baseWidth * 3 : baseWidth * 8;
    
    return { timeScale: { minTime, maxTime, span }, years: y, canvasWidth: width };
  }, [journey, zoomLevel]);

  const clusteredNodes = useMemo(() => {
    if (!timeScale || !journey?.milestones) return [];
    
    // Filter
    const filtered = journey.milestones.filter(m => {
      if (categoryFilter !== "all" && m.category !== categoryFilter) return false;
      if (searchQuery && !m.message.toLowerCase().includes(searchQuery.toLowerCase()) && !m.author_name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });

    const sorted = [...filtered].sort((a, b) => new Date(a.authored_at).getTime() - new Date(b.authored_at).getTime());
    
    const clusters: ClusterNode[] = [];
    const CLUSTER_THRESHOLD_PX = 20; 
    
    sorted.forEach(m => {
      const time = new Date(m.authored_at).getTime();
      const xPercent = 5 + ((time - timeScale.minTime) / timeScale.span) * 90;
      const xPx = (xPercent / 100) * canvasWidth;
      
      const lastCluster = clusters[clusters.length - 1];
      let merged = false;
      
      if (lastCluster) {
        const lastPx = (lastCluster.xPercent / 100) * canvasWidth;
        if (Math.abs(xPx - lastPx) < CLUSTER_THRESHOLD_PX) {
          lastCluster.milestones.push(m);
          lastCluster.categoryCounts[m.category] = (lastCluster.categoryCounts[m.category] || 0) + 1;
          if (isMajor(m)) lastCluster.hasMajor = true;
          
          const sum = lastCluster.milestones.reduce((acc, curr) => {
            const t = new Date(curr.authored_at).getTime();
            return acc + (5 + ((t - timeScale.minTime) / timeScale.span) * 90);
          }, 0);
          lastCluster.xPercent = sum / lastCluster.milestones.length;
          merged = true;
        }
      }
      
      if (!merged) {
        clusters.push({
          id: m.sha,
          xPercent,
          milestones: [m],
          hasMajor: isMajor(m),
          categoryCounts: { [m.category]: 1 } as any
        });
      }
    });
    return clusters;
  }, [journey?.milestones, timeScale, canvasWidth, searchQuery, categoryFilter]);

  if (loading && !journey) {
    return (
      <div className="w-full h-96 flex items-center justify-center border border-[var(--color-border)] rounded-xl bg-[var(--color-bg-elevated)]/30">
         <div className="w-8 h-8 border-2 border-[var(--color-accent-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return <div className="p-4 border border-red-500 rounded-xl bg-red-500/10 text-red-500">Failed to load journey: {error}</div>;
  }

  if (!journey) return null;
  const isGenerating = journey?._meta?.status === 'pending' || journey?._meta?.status === 'queued' || journey?._meta?.status === 'computing';
  
  // Render details panel content
  const renderSidePanelContent = () => {
    if (!sidePanel) return null;

    if (sidePanel.type === 'phase') {
      const p = sidePanel.phase;
      const tStart = new Date(p.start_date + "-01").getTime();
      const tEnd = new Date(p.end_date + "-28").getTime();
      const phaseMilestones = journey.milestones.filter(m => {
        const t = new Date(m.authored_at).getTime();
        return t >= tStart && t <= tEnd;
      });
      const contributors = new Set(phaseMilestones.map(m => m.author_name)).size;
      const majors = phaseMilestones.filter(m => isMajor(m)).length;
      const months = Math.max(1, Math.round((tEnd - tStart) / (1000 * 60 * 60 * 24 * 30)));

      return (
        <div className="p-6 h-full flex flex-col">
           <span className="text-xs font-bold uppercase tracking-wider mb-2 opacity-50">Semantic Phase</span>
           <h3 className="text-2xl font-bold text-white mb-4" style={{ color: p.color }}>{p.name}</h3>
           <p className="text-sm text-gray-300 leading-relaxed mb-6">
             This phase spanned approximately <strong>{months} months</strong>, mapping the project's evolution from {p.start_date} to {p.end_date}. 
             During this time, the repository saw intense activity shaping its current architecture.
           </p>
           <div className="grid grid-cols-2 gap-3 mb-6">
             <div className="bg-black/30 p-3 rounded-lg border border-white/5">
               <div className="text-[10px] uppercase text-gray-500 mb-1">Total Commits</div>
               <div className="text-xl font-bold">{phaseMilestones.length}</div>
             </div>
             <div className="bg-black/30 p-3 rounded-lg border border-white/5">
               <div className="text-[10px] uppercase text-gray-500 mb-1">Contributors</div>
               <div className="text-xl font-bold">{contributors}</div>
             </div>
             <div className="bg-black/30 p-3 rounded-lg border border-white/5">
               <div className="text-[10px] uppercase text-gray-500 mb-1">Major Changes</div>
               <div className="text-xl font-bold text-yellow-500">{majors}</div>
             </div>
           </div>
        </div>
      );
    }

    if (sidePanel.type === 'cluster') {
      const c = sidePanel.cluster;
      if (c.milestones.length === 1) {
        // Delegate to milestone view if it's just one
        return renderMilestoneDetail(c.milestones[0]);
      }
      return (
        <div className="p-6 h-full flex flex-col overflow-hidden">
           <h3 className="text-xl font-bold text-white mb-2">Dense Activity Cluster</h3>
           <p className="text-sm text-gray-400 mb-6">This period includes {c.milestones.length} milestones. Zoom in to separate them, or view them below.</p>
           
           <div className="flex flex-wrap gap-2 mb-6">
             {Object.entries(c.categoryCounts).map(([cat, count]) => (
               <div key={cat} className="text-xs px-2 py-1 rounded-full border border-white/10 flex items-center gap-2" style={{ backgroundColor: `${CATEGORY_COLORS[cat as MilestoneCategory]}20`, color: CATEGORY_COLORS[cat as MilestoneCategory] }}>
                 <span>{CATEGORY_LABELS[cat as MilestoneCategory]}</span>
                 <span className="font-bold">{count}</span>
               </div>
             ))}
           </div>
           
           <h4 className="text-xs uppercase tracking-wider text-gray-500 mb-3">Milestones in Cluster</h4>
           <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-3 pr-2">
             {c.milestones.map(m => (
                <div key={m.sha} onClick={() => setSidePanel({ type: 'milestone', milestone: m })} className="bg-black/30 p-3 rounded-lg border border-white/5 cursor-pointer hover:border-white/20 transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold" style={{ color: CATEGORY_COLORS[m.category] }}>{CATEGORY_LABELS[m.category]}</span>
                    <span className="text-[10px] text-gray-500">{new Date(m.authored_at).toLocaleDateString()}</span>
                  </div>
                  <p className="text-sm text-gray-200 line-clamp-2">{m.message.split('\n')[0]}</p>
                </div>
             ))}
           </div>
        </div>
      );
    }

    if (sidePanel.type === 'milestone') {
      return renderMilestoneDetail(sidePanel.milestone);
    }
  };

  const renderMilestoneDetail = (m: JourneyMilestone) => (
    <div className="flex flex-col h-full">
      <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
        <span 
          className="inline-block text-xs uppercase tracking-wider font-bold px-2 py-1 rounded mb-4"
          style={{ color: CATEGORY_COLORS[m.category], backgroundColor: `${CATEGORY_COLORS[m.category]}20` }}
        >
          {CATEGORY_LABELS[m.category]}
        </span>
        <h3 className="text-xl font-bold text-white leading-tight mb-4">{m.message.split('\n')[0]}</h3>
        
        <div className="flex flex-col gap-2 text-sm text-gray-400 mb-6">
           <div className="flex items-center gap-2">
             <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
             {m.author_name}
           </div>
           <div className="flex items-center gap-2">
             <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
             {new Date(m.authored_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
           </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-6">
           <div className="bg-black/50 border border-white/5 rounded-lg p-2 text-center">
             <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Files</div>
             <div className="text-white font-mono">{m.files_changed ?? '?'}</div>
           </div>
           <div className="bg-black/50 border border-white/5 rounded-lg p-2 text-center">
             <div className="text-[10px] text-green-500/70 uppercase tracking-wider mb-1">Adds</div>
             <div className="text-green-400 font-mono">+{m.insertions ?? '?'}</div>
           </div>
           <div className="bg-black/50 border border-white/5 rounded-lg p-2 text-center">
             <div className="text-[10px] text-red-500/70 uppercase tracking-wider mb-1">Dels</div>
             <div className="text-red-400 font-mono">-{m.deletions ?? '?'}</div>
           </div>
        </div>

        <div className="mb-6">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Commit Message</h4>
          <div className="bg-black/40 border border-white/5 rounded-xl p-4">
            <p className="text-sm text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">{m.message}</p>
          </div>
        </div>
      </div>
      
      <div className="p-4 border-t border-white/10 bg-black/20 flex flex-col gap-2">
        <button
          onClick={() => onJumpToTimeline(m.sha)}
          className="w-full flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-lg py-3 px-4 transition-all font-semibold"
        >
          View Related Commits
        </button>
        <button
          onClick={() => onJumpToTimeline(m.sha)} // Optionally wire to actual replay
          className="w-full flex items-center justify-center gap-2 bg-[var(--color-accent-primary)] hover:bg-[var(--color-accent-primary)]/80 text-white rounded-lg py-3 px-4 transition-all font-semibold shadow-lg"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          Replay Repository From Here
        </button>
      </div>
    </div>
  );

  return (
    <div className="w-full flex flex-col bg-[#0A0A0A] rounded-2xl border border-white/10 shadow-2xl overflow-hidden h-[900px] font-sans">
      
      {/* HEADER: AI Story */}
      <div className="p-6 border-b border-white/10 bg-gradient-to-r from-[#111] to-[#1a1a1a] flex-none">
        <div className="flex items-center gap-4 mb-3">
          <h3 className="text-xl font-bold text-white tracking-wide flex items-center gap-2">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 22h14a2 2 0 0 0 2-2V7.5L14.5 2H6a2 2 0 0 0-2 2v4"/><polyline points="14 2 14 8 20 8"/><path d="M2 15h10"/><path d="M9 18l3-3-3-3"/></svg>
            Repository Story
          </h3>
        </div>
        
        {insights?.status === 'generating' || insightsLoading || isGenerating ? (
          <div className="flex items-center gap-2 text-sm text-[var(--color-accent-primary)] animate-pulse">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
            ✨ Synthesizing repository narrative...
          </div>
        ) : insights?.status === 'completed' && insights.ai_summary ? (
          <p className="text-sm text-gray-300 leading-relaxed max-w-5xl">{insights.ai_summary}</p>
        ) : (
          <p className="text-sm text-gray-500">Repository story will be generated once initial indexing is complete.</p>
        )}
      </div>

      {/* OVERVIEW STATS */}
      <div className="p-4 border-b border-white/5 flex-none overflow-x-auto custom-scrollbar">
        <div className="flex gap-4 min-w-max px-2">
          <div className="flex flex-col">
            <span className="text-gray-500 text-[10px] font-semibold uppercase">Total Commits</span>
            <span className="text-white font-bold text-lg">{journey.stats.total_commits}</span>
          </div>
          <div className="w-px h-8 bg-white/10" />
          <div className="flex flex-col">
            <span className="text-gray-500 text-[10px] font-semibold uppercase">Contributors</span>
            <span className="text-white font-bold text-lg">{journey.stats.contributors_count}</span>
          </div>
          <div className="w-px h-8 bg-white/10" />
          <div className="flex flex-col">
            <span className="text-gray-500 text-[10px] font-semibold uppercase">Releases</span>
            <span className="text-yellow-400 font-bold text-lg">{journey.stats.releases_count}</span>
          </div>
          <div className="w-px h-8 bg-white/10" />
          <div className="flex flex-col">
            <span className="text-gray-500 text-[10px] font-semibold uppercase">Health Score</span>
            <span className={`font-bold text-lg ${journey.stats.repository_health_score > 75 ? 'text-green-400' : 'text-red-400'}`}>{journey.stats.repository_health_score}/100</span>
          </div>
        </div>
      </div>

      {/* TOOLBAR */}
      <div className="p-4 border-b border-white/5 flex items-center justify-between flex-none bg-black/20">
        <div className="flex items-center gap-3">
           <input 
             type="text" 
             placeholder="Search milestones..."
             value={searchQuery}
             onChange={e => setSearchQuery(e.target.value)}
             className="bg-black/50 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[var(--color-accent-primary)] w-48"
           />
           <select 
             value={categoryFilter}
             onChange={e => setCategoryFilter(e.target.value as any)}
             className="bg-black/50 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-gray-300 focus:outline-none"
           >
             <option value="all">All Categories</option>
             <option value="release">Releases</option>
             <option value="architecture">Architecture</option>
             <option value="feature">Features</option>
             <option value="bugfix">Bug Fixes</option>
           </select>
        </div>
        <div className="flex items-center gap-1 bg-black/50 border border-white/10 rounded-lg p-1">
          <button onClick={() => setZoomLevel(1)} className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${zoomLevel === 1 ? 'bg-[var(--color-accent-primary)] text-white' : 'text-gray-400 hover:text-white'}`}>Lifetime</button>
          <button onClick={() => setZoomLevel(2)} className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${zoomLevel === 2 ? 'bg-[var(--color-accent-primary)] text-white' : 'text-gray-400 hover:text-white'}`}>Year</button>
          <button onClick={() => setZoomLevel(3)} className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${zoomLevel === 3 ? 'bg-[var(--color-accent-primary)] text-white' : 'text-gray-400 hover:text-white'}`}>Month</button>
        </div>
      </div>

      {/* TIMELINE CANVAS & SIDE PANEL */}
      <div className="flex-1 flex overflow-hidden relative bg-[#050505]">
        
        {/* Horizontal Timeline Scroll Area */}
        <div 
          ref={containerRef}
          className="flex-1 overflow-x-auto overflow-y-hidden custom-scrollbar relative scroll-smooth"
        >
          <div className="absolute top-0 bottom-0 left-0" style={{ width: `${canvasWidth}px` }}>
             
             {/* Semantic Phases Background */}
             {timeScale && journey.phases?.map((phase, i) => {
                const tStart = new Date(phase.start_date + "-01").getTime();
                const tEnd = new Date(phase.end_date + "-28").getTime();
                const xStart = Math.max(0, 5 + ((tStart - timeScale.minTime) / timeScale.span) * 90);
                const xEnd = Math.min(100, 5 + ((tEnd - timeScale.minTime) / timeScale.span) * 90);
                const isSelected = sidePanel?.type === 'phase' && sidePanel.phase.name === phase.name;
                
                return (
                  <div 
                    key={i} 
                    onClick={() => setSidePanel({ type: 'phase', phase })}
                    className={`absolute top-0 bottom-0 border-r border-white/5 cursor-pointer transition-colors ${isSelected ? 'bg-white/10' : 'hover:bg-white/5'}`}
                    style={{ left: `${xStart}%`, width: `${xEnd - xStart}%`, backgroundColor: isSelected ? undefined : `${phase.color}15` }}
                  >
                    <div className="pt-4 px-4 sticky left-0 inline-block">
                      <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: phase.color }}>{phase.name}</span>
                    </div>
                  </div>
                );
             })}

             {/* Central Axis Path */}
             <div className="absolute top-1/2 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-y-1/2 z-10 pointer-events-none" />
             
             {/* Milestones / Clusters */}
             {timeScale && clusteredNodes.map((cluster) => {
               const isSelected = sidePanel?.type === 'cluster' && sidePanel.cluster.id === cluster.id 
                               || sidePanel?.type === 'milestone' && sidePanel.milestone.sha === cluster.id;
               const isSingle = cluster.milestones.length === 1;
               const primary = cluster.milestones[0];
               const isMjr = isSingle ? isMajor(primary) : cluster.hasMajor;
               const isMed = isSingle && isMedium(primary);

               // Rendering style based on hierarchy
               let nodeSize = 8;
               let borderClass = "";
               let bgClass = "bg-gray-500";
               
               if (!isSingle) {
                 nodeSize = 24;
                 bgClass = "bg-[#111]";
                 borderClass = "border-2 border-white/30";
               } else if (isMjr) {
                 nodeSize = 20;
                 bgClass = "bg-[#111]";
                 borderClass = "border-4";
               } else if (isMed) {
                 nodeSize = 12;
               }

               const color = isSingle ? CATEGORY_COLORS[primary.category] : "#fff";
               const borderColor = isSingle && isMjr ? color : undefined;

               return (
                 <div
                   key={cluster.id}
                   className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-20 group cursor-pointer"
                   style={{ left: `${cluster.xPercent}%` }}
                   onClick={() => setSidePanel(isSingle ? { type: 'milestone', milestone: primary } : { type: 'cluster', cluster })}
                 >
                    {/* Node Visual */}
                    <div 
                      className={`rounded-full flex items-center justify-center transition-all ${borderClass} ${isSelected ? 'ring-4 ring-white/20 scale-125 shadow-[0_0_20px_rgba(255,255,255,0.3)]' : 'group-hover:scale-125 group-hover:shadow-[0_0_15px_rgba(255,255,255,0.2)]'}`}
                      style={{
                        width: nodeSize,
                        height: nodeSize,
                        backgroundColor: isSingle && !isMjr ? color : undefined,
                        borderColor: borderColor
                      }}
                    >
                      {/* Cluster Text */}
                      {!isSingle && (
                        <span className="text-[9px] font-bold text-white">+{cluster.milestones.length}</span>
                      )}
                    </div>
                    
                    {/* Labels for Major / Clusters (only visible if there is room) */}
                    {(isMjr || !isSingle) && (
                       <div className="absolute top-full mt-3 left-1/2 -translate-x-1/2 whitespace-nowrap opacity-70 group-hover:opacity-100 transition-opacity pointer-events-none flex flex-col items-center">
                          <span className="text-[10px] font-bold text-white bg-black/50 px-1.5 py-0.5 rounded backdrop-blur">
                            {isSingle ? primary.message.substring(0, 20) + (primary.message.length > 20 ? '...' : '') : `${cluster.milestones.length} Events`}
                          </span>
                       </div>
                    )}
                 </div>
               );
             })}
          </div>
        </div>

        {/* DETAILS SIDE PANEL (Desktop right, Mobile bottom sheet styling handled by fixed w-96 for now) */}
        <div 
          className={`absolute right-0 top-0 bottom-0 w-96 bg-[#0D0D0D] border-l border-white/10 shadow-[-20px_0_40px_rgba(0,0,0,0.5)] transform transition-transform duration-300 ease-out z-50 flex flex-col ${sidePanel ? 'translate-x-0' : 'translate-x-full'}`}
        >
          {sidePanel && (
            <>
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-white/5 bg-white/[0.02] flex-none">
                <span className="text-xs font-bold text-white/50 uppercase tracking-widest">
                  {sidePanel.type === 'phase' ? 'Phase' : sidePanel.type === 'cluster' ? 'Cluster' : 'Milestone'}
                </span>
                <button onClick={() => setSidePanel(null)} className="p-1.5 text-white/50 hover:text-white hover:bg-white/10 rounded-full transition-colors">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </div>
              {/* Content */}
              <div className="flex-1 overflow-hidden">
                 {renderSidePanelContent()}
              </div>
            </>
          )}
        </div>

      </div>
      
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { height: 8px; width: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(255, 255, 255, 0.02); }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.2); }
      `}} />
    </div>
  );
}
