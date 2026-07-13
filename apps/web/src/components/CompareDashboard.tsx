"use client";

import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Repository, RepositoryJourney } from "@chronocode/shared-types";
import { computeNormalizedMetrics, NormalizedMetrics } from "../lib/compare-utils";

interface CompareDashboardProps {
  repo1Id: string;
  repo2Id: string;
}

const PhaseBadge = ({ phase }: { phase: NormalizedMetrics["phase"] }) => {
  let colorClass = "bg-gray-500/20 text-gray-400 border-gray-500/30";
  if (phase === "Early Development") colorClass = "bg-blue-500/20 text-blue-400 border-blue-500/30";
  if (phase === "Growth") colorClass = "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
  if (phase === "Mature") colorClass = "bg-purple-500/20 text-purple-400 border-purple-500/30";
  if (phase === "Maintenance") colorClass = "bg-amber-500/20 text-amber-400 border-amber-500/30";

  return (
    <span className={`px-3 py-1 rounded-full text-xs font-bold border ${colorClass}`}>
      {phase}
    </span>
  );
};

const MetricProgressBar = ({ label, desc, v1, v2, format, isHigherBetter = true }: { label: string, desc: string, v1: number, v2: number, format?: (v: number) => string, isHigherBetter?: boolean }) => {
  const safeV1 = isFinite(v1) && !isNaN(v1) ? v1 : null;
  const safeV2 = isFinite(v2) && !isNaN(v2) ? v2 : null;
  
  const displayV1 = safeV1 !== null ? (format ? format(safeV1) : safeV1.toFixed(1)) : "N/A";
  const displayV2 = safeV2 !== null ? (format ? format(safeV2) : safeV2.toFixed(1)) : "N/A";

  const total = (safeV1 || 0) + (safeV2 || 0);
  const p1 = total === 0 || safeV1 === null ? 50 : (safeV1 / total) * 100;
  const p2 = total === 0 || safeV2 === null ? 50 : (safeV2 / total) * 100;
  
  const isWinner1 = safeV1 !== null && safeV2 !== null && (isHigherBetter ? safeV1 > safeV2 : safeV1 < safeV2);
  const isWinner2 = safeV1 !== null && safeV2 !== null && (isHigherBetter ? safeV2 > safeV1 : safeV2 < safeV1);

  return (
    <div className="flex flex-col gap-2 py-4 border-b border-white/5 last:border-b-0">
      <div className="flex justify-between text-sm">
        {displayV1 === "N/A" ? (
          <span className="font-bold text-gray-500 cursor-help" title="Not enough data available to compute this metric">N/A</span>
        ) : (
          <span className={`font-bold ${isWinner1 ? 'text-[var(--color-accent-primary)]' : 'text-gray-400'}`}>{displayV1}</span>
        )}
        <div className="flex flex-col items-center">
          <span className="text-white font-semibold uppercase tracking-wider text-xs">{label}</span>
          <span className="text-gray-600 text-[10px]">{desc}</span>
        </div>
        {displayV2 === "N/A" ? (
          <span className="font-bold text-gray-500 cursor-help" title="Not enough data available to compute this metric">N/A</span>
        ) : (
          <span className={`font-bold ${isWinner2 ? 'text-[var(--color-accent-primary)]' : 'text-gray-400'}`}>{displayV2}</span>
        )}
      </div>
      <div className="flex h-2 w-full bg-white/5 rounded-full overflow-hidden">
        <div className={`h-full transition-all duration-1000 ${isWinner1 ? 'bg-[var(--color-accent-primary)]' : 'bg-gray-600'}`} style={{ width: `${p1}%` }} />
        <div className="w-1 bg-black" />
        <div className={`h-full transition-all duration-1000 ${isWinner2 ? 'bg-[var(--color-accent-primary)]' : 'bg-gray-600'}`} style={{ width: `${p2}%` }} />
      </div>
    </div>
  );
};

export function CompareDashboard({ repo1Id, repo2Id }: CompareDashboardProps) {
  const [repo1, setRepo1] = useState<Repository | null>(null);
  const [repo2, setRepo2] = useState<Repository | null>(null);
  const [journey1, setJourney1] = useState<RepositoryJourney | null>(null);
  const [journey2, setJourney2] = useState<RepositoryJourney | null>(null);
  
  const [metrics1, setMetrics1] = useState<NormalizedMetrics | null>(null);
  const [metrics2, setMetrics2] = useState<NormalizedMetrics | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [r1, r2, j1, j2] = await Promise.all([
          api.repos.get(repo1Id),
          api.repos.get(repo2Id),
          api.repos.getJourney(repo1Id),
          api.repos.getJourney(repo2Id)
        ]);
        
        setRepo1(r1);
        setRepo2(r2);
        setJourney1(j1);
        setJourney2(j2);

        if (j1) setMetrics1(computeNormalizedMetrics(j1));
        if (j2) setMetrics2(computeNormalizedMetrics(j2));
        
        // We do NOT fetch AI comparison automatically anymore!
      } catch (err: any) {
        setError(err.message || "Failed to load comparison data.");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [repo1Id, repo2Id]);

  if (loading) {
    return (
      <div className="w-full h-96 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-[var(--color-accent-primary)] border-t-transparent rounded-full animate-spin" />
          <p className="text-xl text-[var(--color-text-secondary)]">Analyzing repositories...</p>
        </div>
      </div>
    );
  }

  if (error || !repo1 || !repo2 || !journey1 || !journey2 || !metrics1 || !metrics2) {
    return <div className="text-red-500 p-8 bg-red-500/10 rounded-xl border border-red-500/20">{error || "Missing data"}</div>;
  }

  return (
    <div className="w-full flex flex-col gap-8 pb-16">
      
      {/* Header */}
      <div className="flex items-center justify-between bg-[#111] border border-white/10 rounded-2xl p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-[var(--color-accent-primary)]/10 via-transparent to-[var(--color-accent-secondary)]/10 opacity-30" />
        <div className="flex-1 flex flex-col items-center text-center z-10 gap-3">
          <PhaseBadge phase={metrics1.phase} />
          <h2 className="text-3xl font-black text-white truncate px-4">{repo1.owner}/{repo1.name}</h2>
        </div>
        <div className="text-4xl font-black text-white/20 mx-8 z-10 flex flex-col items-center">
          <span className="text-xs uppercase tracking-widest mb-1">VS</span>
          <div className="w-px h-16 bg-gradient-to-b from-transparent via-white/20 to-transparent" />
        </div>
        <div className="flex-1 flex flex-col items-center text-center z-10 gap-3">
          <PhaseBadge phase={metrics2.phase} />
          <h2 className="text-3xl font-black text-white truncate px-4">{repo2.owner}/{repo2.name}</h2>
        </div>
      </div>

      {/* Head-to-Head Overview Summary */}
      <div className="bg-[#0A0A0A] border border-white/10 rounded-2xl p-6 shadow-xl text-center">
        <h3 className="text-xl font-bold text-white mb-4">Summary Verdict</h3>
        <p className="text-gray-300 leading-relaxed text-sm max-w-4xl mx-auto">
          {metrics1.healthScore > metrics2.healthScore 
            ? <><span className="text-[var(--color-accent-primary)] font-bold">{repo1.name}</span> currently exhibits a healthier development lifecycle overall with a score of {metrics1.healthScore} vs {metrics2.healthScore}. </>
            : metrics2.healthScore > metrics1.healthScore 
              ? <><span className="text-[var(--color-accent-primary)] font-bold">{repo2.name}</span> currently exhibits a healthier development lifecycle overall with a score of {metrics2.healthScore} vs {metrics1.healthScore}. </>
              : "Both repositories show identical health scores. "
          }
          {journey1.stats.repository_age_days > journey2.stats.repository_age_days 
            ? `${repo1.name} is the more mature codebase, ` 
            : `${repo2.name} is the more mature codebase, `
          }
          but {journey1.stats.development_velocity > journey2.stats.development_velocity ? repo1.name : repo2.name} is iterating at a faster velocity.
        </p>
      </div>

      {/* Detailed Verdict */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-[#0A0A0A] border border-white/10 rounded-2xl p-6 shadow-xl">
          <h3 className="text-lg font-bold text-white mb-4 border-b border-white/10 pb-2">{repo1.name} Verdict</h3>
          <div className="space-y-4">
            <div>
              <span className="text-xs uppercase tracking-widest text-emerald-500 font-bold">Strengths</span>
              <ul className="mt-2 space-y-1">
                {metrics1.strengths.map((s, i) => <li key={i} className="text-sm text-gray-300 flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500"/>{s}</li>)}
              </ul>
            </div>
            <div>
              <span className="text-xs uppercase tracking-widest text-red-500 font-bold">Areas for Improvement</span>
              <ul className="mt-2 space-y-1">
                {metrics1.weaknesses.map((s, i) => <li key={i} className="text-sm text-gray-300 flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-red-500"/>{s}</li>)}
              </ul>
            </div>
          </div>
        </div>

        <div className="bg-[#0A0A0A] border border-white/10 rounded-2xl p-6 shadow-xl">
          <h3 className="text-lg font-bold text-white mb-4 border-b border-white/10 pb-2">{repo2.name} Verdict</h3>
          <div className="space-y-4">
            <div>
              <span className="text-xs uppercase tracking-widest text-emerald-500 font-bold">Strengths</span>
              <ul className="mt-2 space-y-1">
                {metrics2.strengths.map((s, i) => <li key={i} className="text-sm text-gray-300 flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500"/>{s}</li>)}
              </ul>
            </div>
            <div>
              <span className="text-xs uppercase tracking-widest text-red-500 font-bold">Areas for Improvement</span>
              <ul className="mt-2 space-y-1">
                {metrics2.weaknesses.map((s, i) => <li key={i} className="text-sm text-gray-300 flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-red-500"/>{s}</li>)}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Normalized Metrics */}
      <div className="bg-[#0A0A0A] border border-white/10 rounded-2xl p-8 shadow-2xl">
        <h3 className="text-xl font-bold text-white mb-6">Head-to-Head Comparison</h3>
        <div className="flex flex-col gap-2">
          <MetricProgressBar 
            label="Health Score" 
            desc="Calculated via velocity, releases, and refactors" 
            v1={metrics1.healthScore} 
            v2={metrics2.healthScore} 
            format={(v) => v.toString()} 
          />
          <MetricProgressBar 
            label="Development Velocity" 
            desc="Commits per month" 
            v1={journey1.stats.development_velocity} 
            v2={journey2.stats.development_velocity} 
          />
          <MetricProgressBar 
            label="Release Frequency" 
            desc="Releases per month" 
            v1={metrics1.releaseFrequency} 
            v2={metrics2.releaseFrequency} 
          />
          <MetricProgressBar 
            label="Contributor Growth" 
            desc="New contributors per year" 
            v1={metrics1.contributorDensity} 
            v2={metrics2.contributorDensity} 
          />
          <MetricProgressBar 
            label="Average Commit Size" 
            desc="Lines changed per commit (lower is better)" 
            v1={journey1.stats.average_commit_size} 
            v2={journey2.stats.average_commit_size} 
            isHigherBetter={false}
            format={(v) => Math.round(v).toString()}
          />
        </div>
      </div>

    </div>
  );
}
