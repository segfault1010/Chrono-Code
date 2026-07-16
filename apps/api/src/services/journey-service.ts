import { supabase } from "../lib/db";
import type { JourneyMilestone, JourneyActivityNode, RepositoryJourney, MilestoneCategory, JourneyPhase, JourneyStats } from "@chronocode/shared-types";
import { exec } from "child_process";
import { promisify } from "util";
import * as path from "path";

const execAsync = promisify(exec);
const CLONE_BASE_PATH = "/tmp/chronocode";

const MAX_MILESTONES = 200; // Cap to avoid overwhelming UI

export async function generateRepositoryJourney(repoId: string): Promise<RepositoryJourney> {
  const pageSize = 5000;
  let hasMore = true;
  let skip = 0;

  const activityMap = new Map<string, number>();
  const activityYearMap = new Map<string, number>();
  const milestones: JourneyMilestone[] = [];
  const authors = new Set<string>();
  
  let longestInactiveGapMs = 0;
  let previousCommitDate: Date | null = null;
  let totalCommitsProcessed = 0;
  let lastCommitProcessed: any = null;

  // Get repository metadata to resolve local path
  const { data: repoMeta } = await supabase
    .from("repositories")
    .select("owner, name, total_commits, created_at")
    .eq("id", repoId)
    .single();

  let targetDir = "";
  if (repoMeta) {
    targetDir = path.resolve(CLONE_BASE_PATH, repoMeta.owner, repoMeta.name);
  }

  while (hasMore) {
    const { data: commits, error } = await supabase
      .from("commits")
      .select("sha, message, author_name, authored_at, parent_shas")
      .eq("repo_id", repoId)
      .order("authored_at", { ascending: true })
      .range(skip, skip + pageSize - 1);

    if (error) {
      console.error(`[chronocode-api] Failed to fetch commits for journey:`, error);
      throw new Error("Failed to generate repository journey");
    }

    if (!commits || commits.length === 0) {
      hasMore = false;
      break;
    }

    for (const commit of commits) {
      lastCommitProcessed = commit;
      // 1. Activity Mapping & General Stats
      authors.add(commit.author_name);
      totalCommitsProcessed++;

      const dateObj = new Date(commit.authored_at);
      if (previousCommitDate) {
        const gapMs = dateObj.getTime() - previousCommitDate.getTime();
        if (gapMs > longestInactiveGapMs) longestInactiveGapMs = gapMs;
      }
      previousCommitDate = dateObj;

      const yearMonth = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
      activityMap.set(yearMonth, (activityMap.get(yearMonth) || 0) + 1);
      
      const year = `${dateObj.getFullYear()}`;
      activityYearMap.set(year, (activityYearMap.get(year) || 0) + 1);

      // 2. Milestone Extraction
      const isMerge = commit.parent_shas && commit.parent_shas.length > 1;
      const { category, impactScore, isMilestone } = evaluateCommit(commit.message, isMerge);

      const isFirstCommit = skip === 0 && milestones.length === 0;

      if (isMilestone || isFirstCommit) {
        milestones.push({
          sha: commit.sha,
          message: commit.message,
          author_name: commit.author_name,
          authored_at: commit.authored_at,
          category: isFirstCommit ? "feature" : category,
          impact_score: isFirstCommit ? 10 : impactScore,
          is_merge: isMerge,
        });
      }
    }

    if (commits.length < pageSize) {
      hasMore = false;
    } else {
      skip += pageSize;
    }
  }

  if (lastCommitProcessed) {
    const existing = milestones.find(m => m.sha === lastCommitProcessed.sha);
    if (!existing) {
      milestones.push({
        sha: lastCommitProcessed.sha,
        message: lastCommitProcessed.message,
        author_name: lastCommitProcessed.author_name,
        authored_at: lastCommitProcessed.authored_at,
        category: "feature",
        impact_score: 10,
        is_merge: false,
      });
    } else {
      existing.impact_score = Math.max(existing.impact_score, 10);
    }
  }

  // Convert activity map to array
  const activity: JourneyActivityNode[] = Array.from(activityMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date)); // Sort chronologically

  // Process Milestones
  let finalMilestones = milestones;
  if (milestones.length > MAX_MILESTONES) {
    const chronoSorted = [...milestones].sort((a, b) => new Date(a.authored_at).getTime() - new Date(b.authored_at).getTime());
    const firstM = chronoSorted[0]!;
    const lastM = chronoSorted[chronoSorted.length - 1]!;
    
    const middle = chronoSorted.slice(1, -1)
      .sort((a, b) => b.impact_score - a.impact_score)
      .slice(0, MAX_MILESTONES - 2);
      
    finalMilestones = [firstM, ...middle, lastM]
      .sort((a, b) => new Date(a.authored_at).getTime() - new Date(b.authored_at).getTime());
  } else {
    finalMilestones = milestones.sort((a, b) => new Date(a.authored_at).getTime() - new Date(b.authored_at).getTime());
  }

  // Enhance milestones with exact git diff stats (since we don't store them in DB for all 100k commits)
  if (targetDir) {
    await Promise.all(
      finalMilestones.map(async (m) => {
        try {
          const { stdout } = await execAsync(`git show --shortstat ${m.sha}`, { cwd: targetDir });
          const filesMatch = stdout.match(/(\d+)\s+file/);
          const insertionsMatch = stdout.match(/(\d+)\s+insertion/);
          const deletionsMatch = stdout.match(/(\d+)\s+deletion/);
          m.files_changed = filesMatch ? parseInt(filesMatch[1] || "0", 10) : 0;
          m.insertions = insertionsMatch ? parseInt(insertionsMatch[1] || "0", 10) : 0;
          m.deletions = deletionsMatch ? parseInt(deletionsMatch[1] || "0", 10) : 0;
        } catch (e) {
          // Ignore failures, just leave empty
        }
      })
    );
  }

  // Calculate Stats
  let mostActiveMonth = "";
  let mostActiveCount = 0;
  for (const node of activity) {
    if (node.count > mostActiveCount) {
      mostActiveCount = node.count;
      mostActiveMonth = node.date;
    }
  }
  
  let mostActiveYear = "";
  let mostActiveYearCount = 0;
  for (const [year, count] of activityYearMap.entries()) {
    if (count > mostActiveYearCount) {
      mostActiveYearCount = count;
      mostActiveYear = year;
    }
  }

  let largestSha = null;
  let maxChanges = 0;
  let largestRefactorSha = null;
  let maxRefactorChanges = 0;
  let totalInsertions = 0;
  let totalDeletions = 0;
  let commitsWithStats = 0;
  
  let releasesCount = 0;
  let featuresCount = 0;
  let refactorsCount = 0;

  for (const m of finalMilestones) {
    if (m.category === "release") releasesCount++;
    if (m.category === "feature") featuresCount++;
    if (m.category === "refactor") refactorsCount++;

    const changes = (m.insertions || 0) + (m.deletions || 0);
    if (changes > 0) {
       totalInsertions += (m.insertions || 0);
       totalDeletions += (m.deletions || 0);
       commitsWithStats++;
    }

    if (changes > maxChanges) {
      maxChanges = changes;
      largestSha = m.sha;
    }
    
    if (m.category === "refactor" && changes > maxRefactorChanges) {
      maxRefactorChanges = changes;
      largestRefactorSha = m.sha;
    }
  }

  const ageDays = finalMilestones.length > 0
    ? Math.floor((Date.now() - new Date(finalMilestones[0]!.authored_at).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  const totalCommits = repoMeta?.total_commits || totalCommitsProcessed;
  const ageMonths = Math.max(1, ageDays / 30);
  const development_velocity = Math.round(totalCommits / ageMonths);
  const longest_inactive_period_days = Math.floor(longestInactiveGapMs / (1000 * 60 * 60 * 24));
  const average_commit_size = commitsWithStats > 0 ? Math.round((totalInsertions + totalDeletions) / commitsWithStats) : 0;
  const contributorsCount = authors.size;

  let healthScore = 60; // Base score
  if (development_velocity > 100) healthScore += 15;
  else if (development_velocity > 20) healthScore += 10;
  else if (development_velocity > 5) healthScore += 5;
  
  if (contributorsCount > 20) healthScore += 15;
  else if (contributorsCount > 5) healthScore += 10;
  else if (contributorsCount > 1) healthScore += 5;
  
  if (longest_inactive_period_days > 365) healthScore -= 20;
  else if (longest_inactive_period_days > 180) healthScore -= 10;
  else if (longest_inactive_period_days > 90) healthScore -= 5;
  
  const refactorRatio = finalMilestones.length > 0 ? refactorsCount / finalMilestones.length : 0;
  if (refactorRatio > 0.1) healthScore += 10;
  
  healthScore = Math.max(0, Math.min(100, healthScore));

  const stats: JourneyStats = {
    total_milestones: finalMilestones.length,
    repository_age_days: ageDays,
    most_active_month: mostActiveMonth,
    most_active_month_count: mostActiveCount,
    largest_commit_sha: largestSha,
    releases_count: releasesCount,
    major_features_count: featuresCount,
    refactors_count: refactorsCount,
    total_commits: totalCommits,
    contributors_count: contributorsCount,
    most_active_year: mostActiveYear,
    largest_refactor_sha: largestRefactorSha,
    longest_inactive_period_days: longest_inactive_period_days,
    average_commit_size: average_commit_size,
    repository_health_score: healthScore,
    development_velocity: development_velocity,
  };

  // Phase Clustering Engine (Simple Heuristic based on time chunks)
  const phases = calculatePhases(activity);

  return {
    activity,
    milestones: finalMilestones,
    phases,
    stats,
  };
}

function calculatePhases(activity: JourneyActivityNode[]): JourneyPhase[] {
  if (activity.length === 0) return [];
  
  const phases: JourneyPhase[] = [];
  const totalMonths = activity.length;
  
  // Very naive clustering just to demonstrate the UI structure:
  // - First 15%: Initial Development
  // - If middle sections have high density: Rapid Growth
  // - Last 20% if low density: Maintenance
  
  const p1End = Math.floor(totalMonths * 0.15);
  const pLastStart = Math.floor(totalMonths * 0.8);
  
  if (p1End > 0) {
    phases.push({
      name: "Initial Development",
      start_date: activity[0]!.date,
      end_date: activity[p1End]!.date,
      color: "rgba(59, 130, 246, 0.1)", // Blue
    });
  }
  
  if (pLastStart > p1End) {
    phases.push({
      name: "Rapid Growth & Expansion",
      start_date: activity[p1End + 1]!.date,
      end_date: activity[pLastStart]!.date,
      color: "rgba(139, 92, 246, 0.1)", // Purple
    });
    
    // Check if the last period is active or maintaining
    const avgRecent = activity.slice(pLastStart).reduce((s, a) => s + a.count, 0) / (totalMonths - pLastStart);
    const avgHistorical = activity.slice(0, pLastStart).reduce((s, a) => s + a.count, 0) / pLastStart;
    
    phases.push({
      name: avgRecent < avgHistorical * 0.5 ? "Stabilization & Maintenance" : "Active Development",
      start_date: activity[Math.min(pLastStart + 1, totalMonths - 1)]!.date,
      end_date: activity[totalMonths - 1]!.date,
      color: avgRecent < avgHistorical * 0.5 ? "rgba(107, 114, 128, 0.1)" : "rgba(16, 185, 129, 0.1)",
    });
  } else {
    phases.push({
      name: "Active Development",
      start_date: activity[0]!.date,
      end_date: activity[activity.length - 1]!.date,
      color: "rgba(16, 185, 129, 0.1)",
    });
  }
  
  return phases;
}

function evaluateCommit(message: string, isMerge: boolean): { category: MilestoneCategory; impactScore: number; isMilestone: boolean } {
  const msgLower = message.toLowerCase();
  
  let category: MilestoneCategory = "unknown";
  let baseScore = 1;

  if (msgLower.includes("release") || msgLower.includes("v1.") || msgLower.includes("v2.") || msgLower.match(/v\d+\.\d+/)) {
    category = "release";
    baseScore = 8;
  } else if (msgLower.includes("breaking") || msgLower.includes("architecture") || msgLower.includes("rewrite")) {
    category = "architecture";
    baseScore = 7;
  } else if (msgLower.includes("feat") || msgLower.includes("add") || msgLower.includes("implement")) {
    category = "feature";
    baseScore = 5;
  } else if (msgLower.includes("refactor") || msgLower.includes("cleanup")) {
    category = "refactor";
    baseScore = 4;
  } else if (msgLower.includes("fix") || msgLower.includes("bug")) {
    category = "bugfix";
    baseScore = 3;
  } else if (msgLower.includes("docs") || msgLower.includes("readme")) {
    category = "docs";
    baseScore = 2;
  } else if (msgLower.includes("chore") || msgLower.includes("bump") || msgLower.includes("update deps")) {
    category = "chore";
    baseScore = 1;
  }

  let impactScore = baseScore;

  const msgLength = message.length;
  if (msgLength > 500) impactScore += 3;
  else if (msgLength > 200) impactScore += 2;
  else if (msgLength > 100) impactScore += 1;

  if (isMerge) {
    impactScore += 2;
    if (category === "unknown") category = "feature";
  }

  impactScore = Math.min(impactScore, 10);
  const isMilestone = category === "release" || category === "architecture" || impactScore >= 6;

  return { category, impactScore, isMilestone };
}
