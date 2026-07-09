import type {
  Repository,
  Commit,
  GetCommitsResponse,
} from "@chronocode/shared-types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
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
  },
  commits: {
    explain: (sha: string, repoId: string) => 
      fetchApi<any>(`/commits/${sha}/explain?repoId=${repoId}`),
  }
};
