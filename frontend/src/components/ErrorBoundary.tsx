import React from "react";
import { Button } from "./ui/Button";
import st from "./ErrorBoundary.module.css";

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
        <div data-testid="error-boundary" className={st.container}>
          <p data-testid="error-boundary-heading" className={st.heading}>Something went wrong in {this.props.section}</p>
          <p data-testid="error-boundary-message" className={st.message}>{this.state.error.message}</p>
          <Button data-testid="error-boundary-retry" onClick={this.handleRetry}>
            Try Again
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
