"use client";

import React, { Component, ReactNode } from "react";
import { Card } from "./Card";
import { Button } from "./Button";

interface Props {
  children: ReactNode;
  tabName: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class TabErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(`Error in tab ${this.props.tabName}:`, error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <Card className="border-[var(--color-error)] bg-[var(--color-error-bg)] p-6 my-4">
          <div className="flex flex-col items-center text-center gap-4">
            <div className="text-[var(--color-error)] bg-red-500/10 p-3 rounded-full">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <div>
              <h3 className="text-xl font-bold text-[var(--color-error)] mb-2">Failed to load {this.props.tabName}</h3>
              <p className="text-[var(--color-error)] opacity-90 mb-4 max-w-md mx-auto">
                {this.state.error?.message || "An unexpected error occurred while rendering this tab."}
              </p>
            </div>
            <Button onClick={this.handleRetry} variant="primary" className="shadow-md">
              Retry Loading Tab
            </Button>
          </div>
        </Card>
      );
    }

    return this.props.children;
  }
}
