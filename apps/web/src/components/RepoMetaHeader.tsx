"use client";

import { AnimatedCounter } from "./ui/AnimatedCounter";
import { RepoHeaderSkeleton } from "./ui/ContextualSkeleton";

interface GitHubMeta {
  description: string | null;
  stars: number;
  forks: number;
  language: string | null;
  avatar_url: string;
  topics: string[];
  size: number;
  visibility: string;
  created_at: string;
  pushed_at: string | null;
  license: string | null;
  open_issues_count: number;
  watchers_count: number;
}

interface RepoMetaHeaderProps {
  owner: string;
  name: string;
  meta: GitHubMeta | null;
  totalCommits?: number;
  isLoading?: boolean;
}

const LANGUAGE_COLORS: Record<string, string> = {
  JavaScript: "#f1e05a",
  TypeScript: "#3178c6",
  Python: "#3572A5",
  Java: "#b07219",
  Go: "#00ADD8",
  Rust: "#dea584",
  "C++": "#f34b7d",
  C: "#555555",
  Ruby: "#701516",
  PHP: "#4F5D95",
  Swift: "#ffac45",
  Kotlin: "#A97BFF",
  Dart: "#00B4AB",
  Shell: "#89e051",
};

function timeAgoShort(dateString: string | null): string {
  if (!dateString) return "";
  const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(months / 12);
  return `${years}y ago`;
}

export function RepoMetaHeader({ owner, name, meta, totalCommits, isLoading }: RepoMetaHeaderProps) {
  if (isLoading || !meta) {
    return <RepoHeaderSkeleton />;
  }

  const langColor = meta.language ? LANGUAGE_COLORS[meta.language] || "#8b8b8b" : null;

  return (
    <div className="animate-fade-in">
      <div className="flex items-start gap-5">
        {/* Repository Avatar */}
        <img
          src={meta.avatar_url}
          alt={`${owner} avatar`}
          className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl border border-white/10 shadow-lg bg-white/5 animate-fade-in"
          loading="eager"
        />

        <div className="flex-1 min-w-0">
          {/* Owner / Name */}
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2 flex-wrap">
            <span className="text-white/40 font-medium">{owner}</span>
            <span className="text-white/20">/</span>
            <span>{name}</span>
            {meta.visibility === "private" && (
              <span className="text-[10px] uppercase tracking-wider font-bold bg-yellow-500/10 text-yellow-400 px-2 py-0.5 rounded-full border border-yellow-500/20">
                Private
              </span>
            )}
          </h1>

          {/* Description */}
          {meta.description && (
            <p className="text-white/50 text-sm mt-1.5 leading-relaxed max-w-2xl line-clamp-2">
              {meta.description}
            </p>
          )}
        </div>
      </div>

      {/* Stat Chips */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-4">
        {/* Stars */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-sm">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-yellow-400">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
          </svg>
          <AnimatedCounter value={meta.stars} format="abbreviated" className="text-white font-semibold" />
        </div>

        {/* Forks */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-sm">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/50">
            <circle cx="12" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/>
            <path d="M18 9v1a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9"/><line x1="12" y1="12" x2="12" y2="15"/>
          </svg>
          <AnimatedCounter value={meta.forks} format="abbreviated" className="text-white font-semibold" />
        </div>

        {/* Language */}
        {meta.language && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-sm">
            {langColor && (
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: langColor }} />
            )}
            <span className="text-white/70 font-medium">{meta.language}</span>
          </div>
        )}

        {/* Commits */}
        {totalCommits != null && totalCommits > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-sm">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/50">
              <circle cx="12" cy="12" r="4"/><line x1="1.05" y1="12" x2="7" y2="12"/><line x1="17.01" y1="12" x2="22.96" y2="12"/>
            </svg>
            <AnimatedCounter value={totalCommits} format="abbreviated" className="text-white font-semibold" />
            <span className="text-white/40">commits</span>
          </div>
        )}

        {/* Latest push */}
        {meta.pushed_at && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-sm text-white/40">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/30">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            <span>pushed {timeAgoShort(meta.pushed_at)}</span>
          </div>
        )}

        {/* License */}
        {meta.license && (
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-sm text-white/40">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/30">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            <span>{meta.license}</span>
          </div>
        )}
      </div>

      {/* Topics */}
      {meta.topics && meta.topics.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {meta.topics.slice(0, 8).map((topic) => (
            <span
              key={topic}
              className="text-xs font-medium text-blue-400/80 bg-blue-500/10 px-2.5 py-1 rounded-full border border-blue-500/15"
            >
              {topic}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
