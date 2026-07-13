import type { RepositoryJourney } from "@chronocode/shared-types";

export interface NormalizedMetrics {
  releaseFrequency: number;
  contributorDensity: number;
  refactoringIndex: number;
  healthScore: number;
  phase: "Early Development" | "Growth" | "Mature" | "Maintenance";
  strengths: string[];
  weaknesses: string[];
}

export function computeNormalizedMetrics(journey: RepositoryJourney): NormalizedMetrics {
  const { stats } = journey;
  const age = Math.max(stats.repository_age_days || 1, 1);
  const months = Math.max(age / 30, 0.001);
  const years = Math.max(age / 365, 0.001);

  const rawReleaseFreq = stats.releases_count / months;
  const rawContribDens = stats.contributors_count / years;
  const rawRefactIdx = stats.total_commits > 0 ? (stats.refactors_count / stats.total_commits) * 100 : 0;

  const releaseFrequency = isFinite(rawReleaseFreq) ? rawReleaseFreq : 0;
  const contributorDensity = isFinite(rawContribDens) ? rawContribDens : 0;
  const refactoringIndex = isFinite(rawRefactIdx) ? rawRefactIdx : 0;
  
  // Health Score (0-100)
  const safeVelocity = isFinite(stats.development_velocity) && stats.development_velocity >= 0 ? stats.development_velocity : 0;
  const velocityScore = Math.min((safeVelocity / 100) * 40, 40); 
  const releaseScore = Math.min((releaseFrequency / 2) * 30, 30);
  const refactorScore = Math.min((refactoringIndex / 5) * 30, 30);
  
  const healthScore = Math.round(velocityScore + releaseScore + refactorScore);

  // Phase
  let phase: NormalizedMetrics["phase"] = "Early Development";
  if (age < 90 || stats.total_commits < 100) {
    phase = "Early Development";
  } else if (age > 365) {
    if (safeVelocity < 10) {
      phase = "Maintenance";
    } else {
      phase = "Mature";
    }
  } else if (safeVelocity > 20) {
    phase = "Growth";
  } else {
    phase = "Growth";
  }

  // Strengths and Weaknesses
  const strengths: string[] = [];
  const weaknesses: string[] = [];

  // 1. Architecture maturity
  if (refactoringIndex > 5) strengths.push("Proactive Refactoring & Architecture Upkeep");
  else if (refactoringIndex < 0.5 && stats.total_commits > 100) weaknesses.push("Low Refactoring (Potential Tech Debt)");

  // 2. Development consistency
  if (safeVelocity > 50) strengths.push("High Development Velocity");
  else if (safeVelocity > 0 && safeVelocity < 5 && age > 30) weaknesses.push("Low Development Velocity");

  if (stats.longest_inactive_period_days > 180) weaknesses.push(`Extended Inactivity (${stats.longest_inactive_period_days} days)`);

  // 3. Release cadence
  if (releaseFrequency > 2) strengths.push("Rapid Release Cadence");
  else if (releaseFrequency > 0.5) strengths.push("Consistent Releases");
  else if (releaseFrequency < 0.1 && age > 90) weaknesses.push("Infrequent Releases");

  // 4. Community activity
  if (contributorDensity > 20) strengths.push("Strong Community Growth");
  else if (stats.contributors_count === 1 && age > 30) weaknesses.push("Single Point of Failure (1 Contributor)");
  else if (contributorDensity > 0 && contributorDensity < 2 && age > 180) weaknesses.push("Slow Contributor Onboarding");

  // 5. Average Commit Size
  if (stats.average_commit_size > 500) weaknesses.push(`Large Average Commit Size (${stats.average_commit_size} lines)`);
  else if (stats.average_commit_size > 0 && stats.average_commit_size < 150) strengths.push("Small, Focused Commits");

  if (strengths.length === 0) strengths.push("Stable Foundation");
  if (weaknesses.length === 0) weaknesses.push("No Major Warning Signs");

  return {
    releaseFrequency,
    contributorDensity,
    refactoringIndex,
    healthScore,
    phase,
    strengths,
    weaknesses
  };
}
