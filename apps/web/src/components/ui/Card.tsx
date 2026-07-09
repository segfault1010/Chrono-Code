import React from "react";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ children, style, ...props }, ref) => {
    return (
      <div
        ref={ref}
        style={{
          backgroundColor: "rgba(20, 20, 20, 0.7)",
          backdropFilter: "blur(12px)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-lg)",
          padding: "var(--space-6)",
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.5)",
          transition: "border-color var(--transition-normal)",
          ...style,
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.borderColor = "rgba(138, 43, 226, 0.3)";
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.borderColor = "var(--color-border)";
        }}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = "Card";
