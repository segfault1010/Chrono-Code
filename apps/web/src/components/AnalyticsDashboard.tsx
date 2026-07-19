"use client";

import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Card } from "./ui/Card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, AreaChart, Area } from "recharts";

interface AnalyticsDashboardProps {
  repoId: string;
  isIndexing?: boolean;
}

export function AnalyticsDashboard({ repoId, isIndexing }: AnalyticsDashboardProps) {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const result = await api.repos.getAnalytics(repoId);
        setData(result);
      } catch (err: any) {
        if (!data) setError(err.message || "Failed to load analytics");
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchAnalytics();
  }, [repoId, isIndexing]);

  // Handle Polling for background analytics
  useEffect(() => {
    const isGenerating = data?._meta?.status === 'pending' || data?._meta?.status === 'queued' || data?._meta?.status === 'computing';
    
    // Poll regularly if still indexing or generating analytics
    let interval: any;
    if (isIndexing || isGenerating) {
      interval = setInterval(async () => {
        try {
          const result = await api.repos.getAnalytics(repoId);
          setData(result);
        } catch (err: any) {
          if (!data) setError(err.message || "Failed to load analytics");
        }
      }, 3000);
    } else {
      // Even if not indexing, maybe someone else pushed? Poll every 30s.
      interval = setInterval(async () => {
        try {
          const result = await api.repos.getAnalytics(repoId);
          setData(result);
        } catch (err: any) {
          if (!data) setError(err.message || "Failed to load analytics");
        }
      }, 30000);
    }

    return () => clearInterval(interval);
  }, [repoId, isIndexing, data?._meta?.status]);

  const isGenerating = data?._meta?.status === 'pending' || data?._meta?.status === 'queued' || data?._meta?.status === 'computing';

  if ((isLoading && !data) || (isGenerating && (!data?.topContributors || data.topContributors.length === 0))) {
    return (
      <div className="flex flex-col gap-6 animate-fade-in w-full">
        <div className="flex items-center justify-end gap-2 mb-2">
           <div className="w-3 h-3 rounded-full border-2 border-[var(--color-accent-primary)] border-t-transparent animate-spin" />
           <p className="text-[var(--color-text-tertiary)] text-xs font-medium tracking-wide">
             {isGenerating ? "Analyzing contributor activity in the background..." : "Loading analytics..."}
           </p>
        </div>
        {/* Shimmer top cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-5 bg-white/5 border border-white/5 backdrop-blur-md h-[104px] rounded-xl flex flex-col justify-between" style={{ animation: `pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite`, animationDelay: `${i * 150}ms` }}>
               <div className="w-1/2 h-3 bg-white/10 rounded-full" />
               <div className="w-3/4 h-6 bg-white/10 rounded-lg mt-4" />
            </Card>
          ))}
        </div>
        {/* Shimmer charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
           <Card className="p-6 bg-white/5 border border-white/5 backdrop-blur-md h-[350px] rounded-xl flex flex-col animate-pulse" style={{ animationDelay: '450ms' }}>
              <div className="w-1/3 h-5 bg-white/10 rounded-lg mb-6" />
              <div className="flex-1 w-full bg-white/5 rounded-lg" />
           </Card>
           <Card className="p-6 bg-white/5 border border-white/5 backdrop-blur-md h-[350px] rounded-xl flex flex-col animate-pulse" style={{ animationDelay: '600ms' }}>
              <div className="w-1/3 h-5 bg-white/10 rounded-lg mb-6" />
              <div className="flex flex-col gap-3">
                 {[1, 2, 3, 4, 5].map((j) => (
                   <div key={j} className="w-full h-12 bg-white/5 rounded-xl" />
                 ))}
              </div>
           </Card>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return <div className="text-[var(--color-error)] py-8 text-center">{error}</div>;
  }

  if (data?._meta?.status === 'failed') {
    return (
      <div className="text-[var(--color-error)] py-8 text-center border border-[var(--color-error)] rounded-xl bg-[var(--color-error-bg)]">
        <h3 className="font-bold mb-2">Analytics Computation Failed</h3>
        <p className="text-sm">{data._meta.error_message || "An unexpected error occurred during background processing."}</p>
      </div>
    );
  }

  if (!data) return null;

  // Derive human-readable insights
  const recentCommits = data.activityTimeline.reduce((sum: number, day: any) => sum + parseInt(day.commit_count), 0);
  
  let momentumText = "Quiet";
  let momentumColor = "text-gray-400";
  if (recentCommits > 50) {
    momentumText = "High Activity";
    momentumColor = "text-green-400";
  } else if (recentCommits > 10) {
    momentumText = "Steady";
    momentumColor = "text-blue-400";
  } else if (recentCommits > 0) {
    momentumText = "Low Activity";
    momentumColor = "text-yellow-400";
  }

  const topContrib = data.topContributors[0];
  const totalCommits = parseInt(data.totalCommits || 0);
  const topContribPercentage = topContrib && totalCommits > 0 
    ? Math.round((parseInt(topContrib.commit_count) / totalCommits) * 100) 
    : 0;

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      
      {isIndexing && (
        <div className="bg-blue-500/10 border border-blue-500/30 text-blue-400 px-4 py-3 rounded-xl flex items-center gap-3 animate-pulse">
           <div className="w-4 h-4 rounded-full border-2 border-blue-400 border-t-transparent animate-spin"></div>
           <p className="text-sm font-medium">Analytics are updating live as repository history is processed...</p>
        </div>
      )}

      {data._meta?.generated_at && (
        <div className="text-xs text-gray-500 flex justify-end">
          Analytics generated at {new Date(data._meta.generated_at).toLocaleString()}
          {data._meta.status === 'outdated' && " (Update in progress...)"}
          {data._meta.status === 'computing' && " (Computing...)"}
        </div>
      )}

      {/* Non-Technical Executive Insights */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
         <Card className="p-6 bg-white/5 backdrop-blur-2xl border border-white/10 flex flex-col justify-between hover:bg-white/10 hover:border-white/20 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_15px_40px_rgba(0,0,0,0.4)] rounded-2xl shadow-lg group relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <p className="text-xs uppercase tracking-wider text-white/50 font-bold mb-2 group-hover:text-white/80 transition-colors relative z-10">Project Momentum (30d)</p>
            <div className="relative z-10">
               <h3 className={`text-4xl font-bold tracking-tight ${momentumColor}`}>{momentumText}</h3>
               <p className="text-sm text-white/50 mt-2 font-medium">{recentCommits} commits in the last 30 days</p>
            </div>
         </Card>
         
         <Card className="p-6 bg-white/5 backdrop-blur-2xl border border-white/10 flex flex-col justify-between hover:bg-white/10 hover:border-white/20 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_15px_40px_rgba(0,0,0,0.4)] rounded-2xl shadow-lg group relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <p className="text-xs uppercase tracking-wider text-white/50 font-bold mb-2 group-hover:text-white/80 transition-colors relative z-10">Primary Maintainer</p>
            <div className="relative z-10">
               <h3 className="text-3xl sm:text-4xl font-bold tracking-tight text-white truncate" title={topContrib?.author_name || "Unknown"}>
                 {topContrib?.author_name || "Unknown"}
               </h3>
               <p className="text-sm text-white/50 mt-2 font-medium">
                 {topContribPercentage > 0 ? `Drove ${topContribPercentage}% of all historical changes` : "No commits yet"}
               </p>
            </div>
         </Card>

         <Card className="p-6 bg-white/5 backdrop-blur-2xl border border-white/10 flex flex-col justify-between hover:bg-white/10 hover:border-white/20 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_15px_40px_rgba(0,0,0,0.4)] rounded-2xl shadow-lg group relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <p className="text-xs uppercase tracking-wider text-white/50 font-bold mb-2 group-hover:text-white/80 transition-colors relative z-10">Historical Scale</p>
            <div className="relative z-10">
               <h3 className="text-4xl font-bold tracking-tight text-white">{totalCommits.toLocaleString()}</h3>
               <p className="text-sm text-white/50 mt-2 font-medium">Total lifetime commits</p>
            </div>
         </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Activity Timeline Chart - Soft Area Chart */}
        <Card className="p-6 bg-white/5 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-lg hover:shadow-[0_15px_40px_rgba(0,0,0,0.3)] transition-all duration-500 flex flex-col h-[350px]">
          <h3 className="text-lg font-bold mb-6 text-white tracking-tight">Commit Velocity</h3>
          <div className="flex-1 w-full min-h-0">
            {data.activityTimeline.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.activityTimeline} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorCommits" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-accent-primary)" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="var(--color-accent-primary)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
                  <XAxis 
                    dataKey="activity_date" 
                    stroke="var(--color-text-tertiary)" 
                    fontSize={12}
                    tickFormatter={(val) => new Date(val).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    axisLine={false}
                    tickLine={false}
                    dy={10}
                  />
                  <YAxis 
                    stroke="var(--color-text-tertiary)" 
                    fontSize={12} 
                    allowDecimals={false} 
                    axisLine={false}
                    tickLine={false}
                    dx={-10}
                  />
                  <Tooltip 
                    cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1, strokeDasharray: '3 3' }}
                    contentStyle={{ backgroundColor: 'rgba(10, 10, 10, 0.8)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}
                    itemStyle={{ color: 'var(--color-text-primary)', fontWeight: 600 }}
                    labelStyle={{ color: 'var(--color-text-secondary)', marginBottom: '4px' }}
                    labelFormatter={(val) => new Date(val).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  />
                  <Area type="monotone" dataKey="commit_count" stroke="var(--color-accent-primary)" strokeWidth={3} fillOpacity={1} fill="url(#colorCommits)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
               <div className="h-full flex items-center justify-center text-[var(--color-text-secondary)] bg-white/5 rounded-xl border border-white/5">
                 <div className="text-center">
                    <svg className="w-8 h-8 mx-auto text-[var(--color-text-tertiary)] mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    <p className="text-sm">No commits in the last 30 days</p>
                 </div>
               </div>
            )}
          </div>
        </Card>

        {/* Top Contributors - Clean UI */}
        <Card className="p-6 bg-white/5 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-lg hover:shadow-[0_15px_40px_rgba(0,0,0,0.3)] transition-all duration-500 flex flex-col h-[350px]">
          <h3 className="text-lg font-bold mb-6 text-white tracking-tight">Key Contributors</h3>
          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-3">
            {data.topContributors.length > 0 ? (
              data.topContributors.map((contrib: any, index: number) => {
                const percentage = totalCommits > 0 ? Math.round((parseInt(contrib.commit_count) / totalCommits) * 100) : 0;
                return (
                  <div key={contrib.author_name} className="relative group overflow-hidden rounded-xl border border-white/5 bg-white/5 p-4 hover:bg-white/10 hover:border-white/20 transition-all duration-300 hover:scale-[1.02] shadow-sm hover:shadow-lg cursor-default">
                    {/* Horizontal progress bar */}
                    <div 
                      className="absolute inset-y-0 left-0 bg-[var(--color-accent-primary)]/10 z-0 transition-all duration-1000 ease-out group-hover:bg-[var(--color-accent-primary)]/20"
                      style={{ width: `${percentage}%` }}
                    />
                    
                    <div className="relative z-10 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-[var(--color-accent-primary)] to-purple-500 text-white font-bold text-sm shadow-md border border-white/10 group-hover:shadow-[0_0_15px_var(--color-accent-primary)] transition-all duration-300">
                          {contrib.author_name.substring(0, 1).toUpperCase()}
                        </div>
                        <div>
                          <span className="font-bold text-white/90 block group-hover:text-white transition-colors">{contrib.author_name}</span>
                          <span className="text-xs text-white/50 group-hover:text-white/80 transition-colors font-medium">{parseInt(contrib.commit_count).toLocaleString()} commits</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                         <span className="text-sm font-bold text-[var(--color-accent-primary)] group-hover:text-white transition-colors">
                           {percentage}%
                         </span>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="h-full flex items-center justify-center text-[var(--color-text-secondary)] text-sm">No contributors found</div>
            )}
          </div>
        </Card>
      </div>
      
    </div>
  );
}
