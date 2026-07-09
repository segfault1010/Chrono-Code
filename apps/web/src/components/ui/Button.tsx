import React from "react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ children, variant = "primary", size = "md", isLoading, style, disabled, ...props }, ref) => {
    const baseStyle: React.CSSProperties = {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      fontWeight: "var(--font-weight-medium)",
      transition: "all var(--transition-fast)",
      cursor: disabled || isLoading ? "not-allowed" : "pointer",
      opacity: disabled || isLoading ? 0.6 : 1,
      fontFamily: "var(--font-sans)",
      border: "none",
      borderRadius: "var(--radius-md)",
      ...style,
    };

    const variantStyles: Record<string, React.CSSProperties> = {
      primary: {
        backgroundColor: "var(--color-accent-primary)",
        color: "#ffffff",
        boxShadow: "0 0 10px rgba(138, 43, 226, 0.4)",
      },
      secondary: {
        backgroundColor: "var(--color-surface)",
        color: "var(--color-text-primary)",
        border: "1px solid var(--color-border)",
      },
      outline: {
        backgroundColor: "transparent",
        color: "var(--color-accent-primary)",
        border: "1px solid var(--color-accent-primary)",
      },
    };

    const sizeStyles: Record<string, React.CSSProperties> = {
      sm: { padding: "var(--space-1) var(--space-3)", fontSize: "var(--text-sm)" },
      md: { padding: "var(--space-2) var(--space-4)", fontSize: "var(--text-base)" },
      lg: { padding: "var(--space-3) var(--space-6)", fontSize: "var(--text-lg)" },
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        style={{ ...baseStyle, ...variantStyles[variant], ...sizeStyles[size], ...style }}
        onMouseOver={(e) => {
          if (disabled || isLoading) return;
          if (variant === "primary") {
            e.currentTarget.style.backgroundColor = "var(--color-accent-secondary)";
            e.currentTarget.style.boxShadow = "0 0 15px rgba(138, 43, 226, 0.6)";
          } else if (variant === "secondary") {
            e.currentTarget.style.backgroundColor = "var(--color-surface-hover)";
          } else if (variant === "outline") {
            e.currentTarget.style.backgroundColor = "rgba(138, 43, 226, 0.1)";
          }
        }}
        onMouseOut={(e) => {
          if (disabled || isLoading) return;
          if (variant === "primary") {
            e.currentTarget.style.backgroundColor = variantStyles.primary.backgroundColor as string;
            e.currentTarget.style.boxShadow = variantStyles.primary.boxShadow as string;
          } else if (variant === "secondary") {
            e.currentTarget.style.backgroundColor = variantStyles.secondary.backgroundColor as string;
          } else if (variant === "outline") {
            e.currentTarget.style.backgroundColor = variantStyles.outline.backgroundColor as string;
          }
        }}
        {...props}
      >
        {isLoading ? (
          <span style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <span
              style={{
                width: "1em",
                height: "1em",
                border: "2px solid currentColor",
                borderBottomColor: "transparent",
                borderRadius: "50%",
                display: "inline-block",
                boxSizing: "border-box",
                animation: "spin 1s linear infinite",
              }}
            />
            {children}
          </span>
        ) : (
          children
        )}
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </button>
    );
  }
);

Button.displayName = "Button";
