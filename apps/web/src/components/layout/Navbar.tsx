"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "../../lib/supabase/client";

import { usePathname } from "next/navigation";

export function Navbar() {
  const [user, setUser] = useState<any>(null);
  const supabase = createClient();
  const pathname = usePathname();

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
  };

  const isRepoPage = pathname?.startsWith("/repos/");
  const currentRepoId = isRepoPage ? pathname.split("/")[2] : null;

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0a0a0a]/80 backdrop-blur-xl">
      <div className="max-w-6xl mx-auto px-6 h-16 flex justify-between items-center">

        <Link href="/" className="flex items-center gap-3">
          {/* Subtle glowing orb as logo */}
          <div className="w-6 h-6 rounded-full bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.6),inset_0_0_10px_rgba(255,255,255,0.5)]" />
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
              <button 
                onClick={handleSignOut}
                className="text-zinc-400 hover:text-red-400 text-sm font-medium transition-colors"
              >
                Sign Out
              </button>
            </>
          ) : (
            <Link href="/login" className="bg-white/10 hover:bg-white/20 text-white text-sm font-medium px-4 py-2 rounded-full transition-colors border border-white/10">
              Sign In
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
