"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "../../lib/supabase/client";

import { usePathname, useRouter } from "next/navigation";

export function Navbar() {
  const [user, setUser] = useState<any>(null);
  const supabase = createClient();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user || null);
    };

    fetchUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  const isRepoPage = pathname?.startsWith("/repos/");
  const currentRepoId = isRepoPage ? pathname.split("/")[2] : null;

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0a0a0a]/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 h-16 flex justify-between items-center">

        <Link href="/" className="flex items-center gap-3 group">
          {/* Timeline icon as logo */}
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-500 to-purple-600 flex items-center justify-center shadow-[0_0_15px_rgba(59,130,246,0.4)] group-hover:shadow-[0_0_20px_rgba(168,85,247,0.6)] transition-all">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
          </div>
          <span className="font-bold text-xl tracking-tight text-white">
            Chronocode
          </span>
        </Link>

        <nav className="flex items-center gap-6">
          <a
            href="https://github.com/segfault1010/Chrono-Code"
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-400 hover:text-white text-sm font-medium transition-colors"
          >
            GitHub
          </a>
          
          {user ? (
            <>
              <Link href={currentRepoId ? `/compare?repo1=${currentRepoId}` : "/compare"} className="text-zinc-400 hover:text-white text-sm font-medium transition-colors">
                Compare
              </Link>
              <Link href="/dashboard" className="text-zinc-400 hover:text-white text-sm font-medium transition-colors">
                Dashboard
              </Link>
              <div className="flex items-center gap-3 pl-4 border-l border-white/10 ml-2">
                {user.user_metadata?.avatar_url ? (
                  <img src={user.user_metadata.avatar_url} alt="Avatar" className="w-8 h-8 rounded-full border border-white/10" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center text-xs font-bold text-white shadow-inner">
                    {user.email ? user.email[0].toUpperCase() : "U"}
                  </div>
                )}
                <button 
                  onClick={handleSignOut}
                  className="relative group overflow-hidden bg-white/5 text-white text-sm font-medium px-5 py-2 rounded-full transition-all border border-white/10 hover:border-white/20 hover:shadow-[0_0_15px_rgba(255,255,255,0.1)] ml-2"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                  Sign Out
                </button>
              </div>
            </>
          ) : (
            <Link href="/login" className="relative group overflow-hidden bg-white/5 text-white text-sm font-medium px-5 py-2 rounded-full transition-all border border-white/10 hover:border-white/20 hover:shadow-[0_0_15px_rgba(255,255,255,0.1)]">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
              Sign In
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
