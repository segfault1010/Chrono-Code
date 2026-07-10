"use client";

import { useState } from "react";
import { createClient } from "../../lib/supabase/client";

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const supabase = createClient();

  const handleLogin = async () => {
    setIsLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        scopes: "repo", // Request access to repositories (including private)
      },
    });

    if (error) {
      console.error("Login error:", error);
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-[#0a0a0a]/80 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl text-center">
        <div className="w-16 h-16 mx-auto bg-blue-500 rounded-full shadow-[0_0_15px_rgba(59,130,246,0.6)] mb-6" />
        <h1 className="text-3xl font-bold text-white mb-2">Sign In</h1>
        <p className="text-zinc-400 mb-8">
          Authenticate with GitHub to access your private repositories and personal dashboard.
        </p>

        <button
          onClick={handleLogin}
          disabled={isLoading}
          className="w-full bg-white text-black font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-3 hover:bg-zinc-200 transition-colors disabled:opacity-50"
        >
          {isLoading ? (
            <div className="w-5 h-5 border-2 border-black/20 border-t-black rounded-full animate-spin" />
          ) : (
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
          )}
          Sign in with GitHub
        </button>
      </div>
    </main>
  );
}
