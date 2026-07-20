"use client";

import { useEffect, useRef, useState } from "react";

interface AnimatedCounterProps {
  value: number;
  duration?: number;
  format?: "number" | "abbreviated" | "percentage";
  className?: string;
  prefix?: string;
  suffix?: string;
}

function formatNumber(num: number, format: "number" | "abbreviated" | "percentage"): string {
  if (format === "abbreviated") {
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(1)}k`;
    return num.toLocaleString();
  }
  if (format === "percentage") {
    return `${num.toFixed(1)}%`;
  }
  return num.toLocaleString();
}

function easeOutExpo(t: number): number {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

export function AnimatedCounter({
  value,
  duration = 1500,
  format = "number",
  className = "",
  prefix = "",
  suffix = "",
}: AnimatedCounterProps) {
  const [displayValue, setDisplayValue] = useState(0);
  const prevValueRef = useRef(0);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const startValue = prevValueRef.current;
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeOutExpo(progress);

      const current = startValue + (value - startValue) * easedProgress;
      setDisplayValue(Math.round(current));

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      } else {
        prevValueRef.current = value;
      }
    };

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [value, duration]);

  return (
    <span className={`inline-block ${className}`} style={{ animation: "countUp 0.3s ease-out" }}>
      {prefix}{formatNumber(displayValue, format)}{suffix}
    </span>
  );
}
