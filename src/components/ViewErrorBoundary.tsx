import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  resetKey: string;
}

interface State {
  error: string;
}

export class ViewErrorBoundary extends Component<Props, State> {
  state: State = { error: "" };

  static getDerivedStateFromError(error: unknown): State {
    return {
      error: error instanceof Error ? error.message : "页面模块加载失败。",
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("TagForge view failed", error, info);
  }

  componentDidUpdate(previous: Props) {
    if (previous.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: "" });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <main className="view-shell">
          <section className="panel empty-state">
            <h2>页面加载失败</h2>
            <p>{this.state.error}</p>
            <button
              className="secondary-button"
              onClick={() => window.location.reload()}
            >
              重新加载页面
            </button>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}
