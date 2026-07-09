import React from "react";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, style, ...props }, ref) => {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        {label && (
          <label
            style={{
              fontSize: "var(--text-sm)",
              fontWeight: "var(--font-weight-medium)",
              color: "var(--color-text-secondary)",
            }}
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          style={{
            padding: "var(--space-3) var(--space-4)",
            fontSize: "var(--text-base)",
            fontFamily: "var(--font-sans)",
            color: "var(--color-text-primary)",
            backgroundColor: "rgba(30, 30, 30, 0.6)",
            border: `1px solid ${error ? "var(--color-error)" : "var(--color-border)"}`,
            borderRadius: "var(--radius-md)",
            outline: "none",
            transition: "all var(--transition-fast)",
            backdropFilter: "blur(4px)",
            ...style,
          }}
          onFocus={(e) => {
            if (!error) {
              e.currentTarget.style.borderColor = "var(--color-accent-primary)";
              e.currentTarget.style.boxShadow = "0 0 0 1px var(--color-accent-primary)";
            }
          }}
          onBlur={(e) => {
            if (!error) {
              e.currentTarget.style.borderColor = "var(--color-border)";
              e.currentTarget.style.boxShadow = "none";
            }
          }}
          {...props}
        />
        {error && (
          <span style={{ fontSize: "var(--text-sm)", color: "var(--color-error)" }}>
            {error}
          </span>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
