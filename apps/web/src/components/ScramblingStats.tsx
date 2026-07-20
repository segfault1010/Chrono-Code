"use client";

import { useEffect, useRef, useState } from "react";

const CHARS = "!@#$%^&*()_+-=[]{}|;:,.<>?/0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function ScrambleText({ text, startDelay = 0, colorClass = "" }: { text: string; startDelay?: number; colorClass?: string }) {
  const [displayText, setDisplayText] = useState(text.replace(/[^\s]/g, "0"));
  const [hasStarted, setHasStarted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isVisible = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isVisible.current) {
          isVisible.current = true;
          setHasStarted(true);
        }
      },
      { threshold: 0.5 }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!hasStarted) return;

    let timeoutId: NodeJS.Timeout;
    
    timeoutId = setTimeout(() => {
      let iteration = 0;
      const maxIterations = 20;
      
      const interval = setInterval(() => {
        setDisplayText((currentText) => {
          return text
            .split("")
            .map((char, index) => {
              if (char === " ") return " ";
              if (index < (iteration / maxIterations) * text.length) {
                return text[index];
              }
              return CHARS[Math.floor(Math.random() * CHARS.length)];
            })
            .join("");
        });
        
        iteration += 1;
        
        if (iteration > maxIterations) {
          clearInterval(interval);
          setDisplayText(text);
        }
      }, 50);

      return () => clearInterval(interval);
    }, startDelay);

    return () => clearTimeout(timeoutId);
  }, [hasStarted, text, startDelay]);

  return (
    <div ref={containerRef} className={`font-mono text-4xl lg:text-5xl font-bold tracking-tight mb-2 bg-clip-text text-transparent bg-gradient-to-r ${colorClass}`}>
      {displayText}
    </div>
  );
}

export function ScramblingStats() {
  const stats = [
    { value: "120K+", label: "Commits Analyzed", color: "from-blue-400 to-purple-400" },
    { value: "10K+", label: "Repos Indexed", color: "from-purple-400 to-pink-400" },
    { value: "2M+", label: "Lines of Code", color: "from-pink-400 to-orange-400" },
    { value: "95%", label: "Accuracy", color: "from-orange-400 to-yellow-400" },
  ];

  return (
    <div className="w-full border-y border-white/5 bg-white/[0.02] backdrop-blur-sm mt-12 py-12 lg:py-16">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {stats.map((stat, index) => (
            <div key={stat.label} className="flex flex-col gap-2 items-center justify-center">
              <ScrambleText text={stat.value} startDelay={index * 150} colorClass={stat.color} />
              <div className="text-zinc-500 text-xs font-semibold uppercase tracking-widest">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
