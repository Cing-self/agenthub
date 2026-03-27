import React from "react";

interface State { hasError: boolean; error: Error | null; }

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground p-8">
          <p className="text-[13px]">页面加载出错</p>
          <pre className="text-[11px] font-mono bg-foreground/5 rounded-lg p-3 max-w-lg overflow-auto whitespace-pre-wrap">
            {this.state.error?.message || "Unknown error"}
          </pre>
          <button onClick={() => this.setState({ hasError: false, error: null })}
            className="text-[12px] text-foreground/70 hover:text-foreground mt-2">重试</button>
        </div>
      );
    }
    return this.props.children;
  }
}
