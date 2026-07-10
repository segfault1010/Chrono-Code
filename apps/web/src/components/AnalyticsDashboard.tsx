"use client";

import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Card } from "./ui/Card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

interface AnalyticsDashboardProps {
  repoId: string;
}

export function AnalyticsDashboard({ repoId }: AnalyticsDashboardProps) {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        setIsLoading(true);
        const result = await api.repos.getAnalytics(repoId);
        setData(result);
      } catch (err: any) {
        setError(err.message || "Failed to load analytics");
      } finally {
        setIsLoading(false);
      }
    };
    fetchAnalytics();
  }, [repoId]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12 animate-fade-in">
        <div className="w-8 h-8 rounded-full border-2 border-[var(--color-accent-primary)] border-t-transparent animate-spin"></div>
      </div>
    );
  }

  if (error) {
    return <div className="text-[var(--color-error)] py-8 text-center">{error}</div>;
  }

  if (!data) return null;

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      
      {/* Activity Timeline Chart */}
      <Card className="p-6 bg-[var(--color-bg-elevated)]/60 backdrop-blur-sm border-[var(--color-border)]">
        <h3 className="text-xl font-bold mb-6 text-[var(--color-text-primary)]">Commit Activity (30 Days)</h3>
        <div className="h-[300px] w-full">
          {data.activityTimeline.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.activityTimeline} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis 
                  dataKey="activity_date" 
                  stroke="var(--color-text-tertiary)" 
                  fontSize={12}
                  tickFormatter={(val) => new Date(val).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                />
                <YAxis stroke="var(--color-text-tertiary)" fontSize={12} allowDecimals={false} />
                <Tooltip 
                  cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                  contentStyle={{ backgroundColor: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', borderRadius: '8px' }}
                  labelFormatter={(val) => new Date(val).toLocaleDateString()}
                />
                <Bar dataKey="commit_count" fill="var(--color-accent-primary)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
             <div className="h-full flex items-center justify-center text-[var(--color-text-secondary)]">No recent activity</div>
          )}
        </div>
      </Card>

      {/* Top Contributors */}
      <Card className="p-6 bg-[var(--color-bg-elevated)]/60 backdrop-blur-sm border-[var(--color-border)]">
        <h3 className="text-xl font-bold mb-6 text-[var(--color-text-primary)]">Top Contributors</h3>
        {data.topContributors.length > 0 ? (
          <div className="grid gap-4">
            {data.topContributors.map((contrib: any, index: number) => (
              <div key={contrib.author_name} className="flex items-center justify-between p-3 rounded-lg hover:bg-[var(--color-bg-primary)]/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)] font-bold text-sm">
                    {index + 1}
                  </div>
                  <span className="font-medium text-[var(--color-text-primary)]">{contrib.author_name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[var(--color-text-secondary)] font-mono text-sm">{contrib.commit_count} commits</span>
                  {/* Visual bar relative to top contributor */}
                  <div className="w-24 h-1.5 bg-[var(--color-bg-primary)] rounded-full overflow-hidden hidden sm:block">
                    <div 
                      className="h-full bg-[var(--color-accent-primary)] rounded-full" 
                      style={{ width: `${(contrib.commit_count / data.topContributors[0].commit_count) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-[var(--color-text-secondary)] py-4">No contributors found</div>
        )}
      </Card>
      
    </div>
  );
}
