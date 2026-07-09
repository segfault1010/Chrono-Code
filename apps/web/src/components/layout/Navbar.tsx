"use client";

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0a0a0a]/80 backdrop-blur-xl">
      <div className="max-w-6xl mx-auto px-6 h-16 flex justify-between items-center">

        <div className="flex items-center gap-3">
          {/* Subtle glowing orb as logo */}
          <div className="w-6 h-6 rounded-full bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.6),inset_0_0_10px_rgba(255,255,255,0.5)]" />
          <span className="font-bold text-xl tracking-tight text-white">
            Chronocode
          </span>
        </div>

        <nav className="flex gap-6">
          <a
            href="https://github.com/segfault1010/Chrono-Code"
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-400 hover:text-white text-sm font-medium transition-colors"
          >
            GitHub
          </a>
        </nav>
      </div>
    </header>
  );
}
