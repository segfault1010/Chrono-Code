import type {
  Repository,
  Commit,
  GetCommitsResponse,
  RepositoryJourney,
  JourneyInsights,
} from "@chronocode/shared-types";
import { createClient } from "./supabase/client";

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api").replace(/\/$/, "");

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
  };

  if (session?.access_token) {
    headers["Authorization"] = `Bearer ${session.access_token}`;
  }
  if (session?.provider_token) {
    headers["X-GitHub-Token"] = session.provider_token;
  }

  const url = `${API_BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let message = "An error occurred";
    try {
      const errData = await response.json();
      message = errData.error || message;
    } catch {
      message = response.statusText;
    }
    throw new ApiError(response.status, message);
  }

  return response.json();
}

// --- Simple InMemory Cache ---
const apiCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 1000 * 60 * 5; // 5 minutes

async function fetchWithCache<T>(cacheKey: string, fetchFn: () => Promise<T>, forceRefresh = false): Promise<T> {
  if (!forceRefresh) {
    const cached = apiCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }
  }
  const data = await fetchFn();
  
  // Do not cache incomplete background jobs
  const isGenerating = (data as any)?._meta?.status === 'pending' || 
                       (data as any)?._meta?.status === 'queued' || 
                       (data as any)?._meta?.status === 'computing';
                       
  if (!isGenerating) {
    apiCache.set(cacheKey, { data, timestamp: Date.now() });
  }
  
  return data;
}
// -----------------------------

export const api = {
  repos: {
    create: (url: string) => fetchApi<Repository>("/repos", {
      method: "POST",
      body: JSON.stringify({ url }),
    }),
    get: (id: string) => fetchApi<Repository>(`/repos/${id}`),
    getCommits: (id: string, page = 1, limit = 50) => 
      fetchApi<GetCommitsResponse>(`/repos/${id}/commits?page=${page}&limit=${limit}`),
    getEvolution: (id: string) => 
      fetchWithCache(`evo_${id}`, () => fetchApi<any>(`/repos/${id}/commits/evolution`)),
    getFunctionHistory: (id: string, filePath: string, functionName: string) => fetchApi<any>(`/repos/${id}/functions/history?filePath=${encodeURIComponent(filePath)}&functionName=${encodeURIComponent(functionName)}`),
    getJourney: (id: string) => 
      fetchWithCache(`journey_${id}`, () => fetchApi<RepositoryJourney>(`/repos/${id}/journey`)),
    getJourneyInsights: (id: string, forceRefresh = false) => 
      fetchWithCache(`insights_${id}`, () => fetchApi<JourneyInsights>(`/repos/${id}/journey/insights${forceRefresh ? '?refresh=true' : ''}`), forceRefresh),
    getComparisonInsights: (id1: string, id2: string, forceRefresh = false) => 
      fetchWithCache(`compare_${id1}_${id2}`, () => fetchApi<any>(`/repos/compare/${id1}/${id2}/insights${forceRefresh ? '?refresh=true' : ''}`), forceRefresh),
    getAnalytics: (id: string) => 
      fetchWithCache(`analytics_${id}`, () => fetchApi<any>(`/repos/${id}/analytics`)),
    search: (id: string, query: string, limit = 10) =>
      fetchApi<any[]>(`/repos/${id}/search?q=${encodeURIComponent(query)}&limit=${limit}`),
    sync: (id: string) => fetchApi<any>(`/repos/${id}/sync`, { method: "POST" }),
    save: (id: string) => fetchApi<{ success: true }>(`/repos/${id}/save`, { method: "POST" }),
    unsave: (id: string) => fetchApi<{ success: true }>(`/repos/${id}/save`, { method: "DELETE" }),
    generateReleaseNotes: async (id: string, range: string) => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }
      return fetch(`${API_BASE_URL}/repos/${id}/releases/generate?range=${range}`, { headers });
    },
    generateRiskAnalysis: async (id: string, range: string) => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }
      return fetch(`${API_BASE_URL}/repos/${id}/risk-analysis?range=${range}`, { headers });
    },
  },
  user: {
    getSavedRepos: () => fetchApi<Repository[]>("/user/repos"),
  },
  commits: {
    explain: async (sha: string, repoId: string) => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }
      return fetch(`${API_BASE_URL}/commits/${sha}/explain?repoId=${repoId}`, { headers });
    },
  }
};
