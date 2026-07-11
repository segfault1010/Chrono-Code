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

    // Poll regularly if still indexing
    let interval: any;
    if (isIndexing) {
      interval = setInterval(fetchAnalytics, 3000);
    } else {
      // Even if not indexing, maybe someone else pushed? Poll every 30s.
      interval = setInterval(fetchAnalytics, 30000);
    }

    return () => clearInterval(interval);
  }, [repoId, isIndexing]);

  if (isLoading && !data) {
    return (
      <div className="flex justify-center py-12 animate-fade-in">
        <div className="w-8 h-8 rounded-full border-2 border-[var(--color-accent-primary)] border-t-transparent animate-spin"></div>
      </div>
    );
  }

  if (error && !data) {
    return <div className="text-[var(--color-error)] py-8 text-center">{error}</div>;
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

      {/* Non-Technical Executive Insights */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
         <Card className="p-5 bg-[var(--color-bg-elevated)]/60 backdrop-blur-sm border-[var(--color-border)] flex flex-col justify-between hover:border-[var(--color-accent-primary)]/50 transition-colors">
            <p className="text-sm text-[var(--color-text-secondary)] font-medium mb-2">Project Momentum (30d)</p>
            <div>
               <h3 className={`text-2xl font-black ${momentumColor}`}>{momentumText}</h3>
               <p className="text-xs text-[var(--color-text-tertiary)] mt-1">{recentCommits} commits in the last 30 days</p>
            </div>
         </Card>
         
         <Card className="p-5 bg-[var(--color-bg-elevated)]/60 backdrop-blur-sm border-[var(--color-border)] flex flex-col justify-between hover:border-[var(--color-accent-primary)]/50 transition-colors">
            <p className="text-sm text-[var(--color-text-secondary)] font-medium mb-2">Primary Maintainer</p>
            <div>
               <h3 className="text-xl font-bold text-white truncate" title={topContrib?.author_name || "Unknown"}>
                 {topContrib?.author_name || "Unknown"}
               </h3>
               <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
                 {topContribPercentage > 0 ? `Drove ${topContribPercentage}% of all historical changes` : "No commits yet"}
               </p>
            </div>
         </Card>

         <Card className="p-5 bg-[var(--color-bg-elevated)]/60 backdrop-blur-sm border-[var(--color-border)] flex flex-col justify-between hover:border-[var(--color-accent-primary)]/50 transition-colors">
            <p className="text-sm text-[var(--color-text-secondary)] font-medium mb-2">Historical Scale</p>
            <div>
               <h3 className="text-2xl font-black text-white">{totalCommits.toLocaleString()}</h3>
               <p className="text-xs text-[var(--color-text-tertiary)] mt-1">Total lifetime commits</p>
            </div>
         </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Activity Timeline Chart - Soft Area Chart */}
        <Card className="p-6 bg-[var(--color-bg-elevated)]/60 backdrop-blur-sm border-[var(--color-border)] flex flex-col h-[350px]">
          <h3 className="text-lg font-bold mb-6 text-[var(--color-text-primary)]">Commit Velocity</h3>
          <div className="flex-1 w-full min-h-0">
            {data.activityTimeline.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.activityTimeline} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorCommits" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-accent-primary)" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="var(--color-accent-primary)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis 
                    dataKey="activity_date" 
                    stroke="var(--color-text-tertiary)" 
                    fontSize={12}
                    tickFormatter={(val) => new Date(val).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  />
                  <YAxis stroke="var(--color-text-tertiary)" fontSize={12} allowDecimals={false} />
                  <Tooltip 
                    cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1, strokeDasharray: '3 3' }}
                    contentStyle={{ backgroundColor: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', borderRadius: '8px' }}
                    labelFormatter={(val) => new Date(val).toLocaleDateString()}
                  />
                  <Area type="monotone" dataKey="commit_count" stroke="var(--color-accent-primary)" strokeWidth={2} fillOpacity={1} fill="url(#colorCommits)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
               <div className="h-full flex items-center justify-center text-[var(--color-text-secondary)] bg-[#0A0A0A] rounded-xl border border-white/5">
                 <div className="text-center">
                    <svg className="w-8 h-8 mx-auto text-gray-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    <p>No commits in the last 30 days</p>
                 </div>
               </div>
            )}
          </div>
        </Card>

        {/* Top Contributors - Clean UI */}
        <Card className="p-6 bg-[var(--color-bg-elevated)]/60 backdrop-blur-sm border-[var(--color-border)] flex flex-col h-[350px]">
          <h3 className="text-lg font-bold mb-6 text-[var(--color-text-primary)]">Key Contributors</h3>
          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-2">
            {data.topContributors.length > 0 ? (
              data.topContributors.map((contrib: any, index: number) => (
                <div key={contrib.author_name} className="flex items-center justify-between p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors border border-white/5">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-[var(--color-accent-primary)] to-blue-600 text-white font-bold text-sm shadow-lg">
                      {contrib.author_name.substring(0, 1).toUpperCase()}
                    </div>
                    <div>
                      <span className="font-semibold text-white block">{contrib.author_name}</span>
                      <span className="text-xs text-gray-400">{parseInt(contrib.commit_count).toLocaleString()} commits</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                       <span className="text-sm font-bold text-[var(--color-accent-primary)]">
                         {totalCommits > 0 ? Math.round((parseInt(contrib.commit_count) / totalCommits) * 100) : 0}%
                       </span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="h-full flex items-center justify-center text-[var(--color-text-secondary)]">No contributors found</div>
            )}
          </div>
        </Card>
      </div>
      
    </div>
  );
}
