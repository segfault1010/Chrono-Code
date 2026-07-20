"use client";

import { ReactNode } from "react";

interface ProgressiveSectionProps {
  isLoading: boolean;
  skeleton: ReactNode;
  children: ReactNode;
  delay?: number;
  className?: string;
}

export function ProgressiveSection({
  isLoading,
  skeleton,
  children,
  delay = 0,
  className = "",
}: ProgressiveSectionProps) {
  return (
    <div className={`relative ${className}`}>
      {/* Skeleton layer — fades out when loaded */}
      <div
        className={`transition-all duration-500 ease-out ${
          isLoading
            ? "opacity-100 translate-y-0"
            : "opacity-0 translate-y-0 pointer-events-none absolute inset-0"
        }`}
      >
        {skeleton}
      </div>

      {/* Content layer — fades in when loaded */}
      <div
        className={`transition-all duration-600 ease-out ${
          isLoading
            ? "opacity-0 translate-y-4 h-0 overflow-hidden"
            : "opacity-100 translate-y-0"
        }`}
        style={{ transitionDelay: `${delay}ms` }}
      >
        {children}
      </div>
    </div>
  );
}
