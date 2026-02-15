import React from "react";

interface Props {
  /** Label shown in the fallback UI (e.g. "Upload", "Image Library") */
  section: string;
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ErrorBoundary/${this.props.section}]`, error, info.componentStack);
  }

  handleRetry = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div style={styles.container}>
          <p style={styles.heading}>Something went wrong in {this.props.section}</p>
          <p style={styles.message}>{this.state.error.message}</p>
          <button style={styles.retry} onClick={this.handleRetry}>
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: "32px 24px",
    marginBottom: 32,
    background: "var(--surface)",
    border: "1px solid var(--danger)",
    borderRadius: "var(--radius)",
    textAlign: "center",
  },
  heading: {
    fontSize: 16,
    fontWeight: 600,
    color: "var(--danger)",
    marginBottom: 8,
  },
  message: {
    fontSize: 13,
    color: "var(--text-muted)",
    marginBottom: 16,
    fontFamily: "monospace",
  },
  retry: {
    padding: "8px 20px",
    fontSize: 14,
    fontWeight: 600,
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--border)",
    background: "transparent",
    color: "var(--text)",
    cursor: "pointer",
  },
};
