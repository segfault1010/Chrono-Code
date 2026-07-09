import React from "react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ children, variant = "primary", size = "md", isLoading, className = "", disabled, ...props }, ref) => {
    
    // Base styles
    let classes = "inline-flex items-center justify-center font-medium transition-all duration-200 border-none rounded-lg cursor-pointer ";
    
    if (disabled || isLoading) {
      classes += "opacity-60 cursor-not-allowed ";
    }

    // Variant styles
    if (variant === "primary") {
      classes += "bg-blue-600 text-white shadow-[0_0_10px_rgba(37,99,235,0.4)] hover:bg-blue-500 hover:shadow-[0_0_15px_rgba(59,130,246,0.6)] ";
    } else if (variant === "secondary") {
      classes += "bg-white/5 text-zinc-300 border border-white/10 hover:bg-white/10 ";
    } else if (variant === "outline") {
      classes += "bg-transparent text-blue-500 border border-blue-500 hover:bg-blue-500/10 ";
    }

    // Size styles
    if (size === "sm") {
      classes += "px-3 py-1.5 text-sm ";
    } else if (size === "md") {
      classes += "px-4 py-2 text-base ";
    } else if (size === "lg") {
      classes += "px-6 py-3 text-lg ";
    }

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={`${classes} ${className}`}
        {...props}
      >
        {isLoading ? (
          <span className="flex items-center gap-2">
            <span className="w-4 h-4 border-2 border-current border-b-transparent rounded-full animate-spin" />
            {children}
          </span>
        ) : (
          children
        )}
      </button>
    );
  }
);

Button.displayName = "Button";
