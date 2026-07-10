import type {
  Repository,
  Commit,
  GetCommitsResponse,
} from "@chronocode/shared-types";
import { createClient } from "./supabase/client";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";

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

export const api = {
  repos: {
    create: (url: string) => fetchApi<Repository>("/repos", {
      method: "POST",
      body: JSON.stringify({ url }),
    }),
    get: (id: string) => fetchApi<Repository>(`/repos/${id}`),
    getCommits: (id: string, page = 1, limit = 50) => 
      fetchApi<GetCommitsResponse>(`/repos/${id}/commits?page=${page}&limit=${limit}`),
    search: (id: string, query: string, limit = 10) =>
      fetchApi<any[]>(`/repos/${id}/search?q=${encodeURIComponent(query)}&limit=${limit}`),
    save: (id: string) => fetchApi<{ success: true }>(`/repos/${id}/save`, { method: "POST" }),
    unsave: (id: string) => fetchApi<{ success: true }>(`/repos/${id}/save`, { method: "DELETE" }),
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
