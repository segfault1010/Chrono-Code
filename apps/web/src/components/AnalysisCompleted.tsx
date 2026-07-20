"use client";

interface AnalysisCompletedProps {
  totalCommits?: number;
  completedAt?: string | null;
  className?: string;
}

export function AnalysisCompleted({
  totalCommits = 0,
  completedAt,
  className = "",
}: AnalysisCompletedProps) {
  
  const timeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.round(diffMs / 60000);
    if (diffMins < 1) return 'just now';
    if (diffMins === 1) return '1 minute ago';
    if (diffMins < 60) return `${diffMins} minutes ago`;
    const diffHours = Math.round(diffMins / 60);
    if (diffHours === 1) return '1 hour ago';
    if (diffHours < 24) return `${diffHours} hours ago`;
    const diffDays = Math.round(diffHours / 24);
    if (diffDays === 1) return '1 day ago';
    return `${diffDays} days ago`;
  };

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex items-center gap-3 text-green-400 font-medium pb-2 border-b border-white/5">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
        <span>Repository Analysis Complete</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-white/70">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-white/5 flex items-center justify-center">
            <span className="font-mono text-xs">{totalCommits > 999 ? (totalCommits/1000).toFixed(1) + 'k' : totalCommits}</span>
          </div>
          <span>Commits analyzed</span>
        </div>

        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-white/5 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
          </div>
          <span>Repository Story generated</span>
        </div>

        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-white/5 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
          </div>
          <span>Architecture analyzed</span>
        </div>

        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-white/5 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
          </div>
          <span>Contributor patterns processed</span>
        </div>
      </div>

      {completedAt && (
        <div className="flex items-center gap-2 pt-3 mt-3 border-t border-white/5 text-xs text-white/40">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
          <span>Last analysis: {timeAgo(completedAt)}</span>
        </div>
      )}
    </div>
  );
}
