import React from 'react';
import { Button, Result, Typography } from 'antd';

type ErrorBoundaryProps = {
  children: React.ReactNode;
  /** Fallback UI rendered when a child throws. If omitted a default error card is shown. */
  fallback?: React.ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
};

/**
 * Global React Error Boundary.
 *
 * Catches any unhandled error in the component tree below it and renders a
 * recovery UI instead of blanking the entire application.
 */
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] Uncaught error:', error, info.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f5f5f5' }}>
          <Result
            status="error"
            title="Something went wrong"
            subTitle="An unexpected error occurred. You can try reloading the application."
            extra={[
              <Button key="reload" type="primary" onClick={this.handleReload}>
                Reload Application
              </Button>,
              <Button key="retry" onClick={this.handleReset}>
                Try Again
              </Button>,
            ]}
          >
            {this.state.error ? (
              <Typography.Paragraph
                type="secondary"
                copyable
                style={{ maxWidth: 600, margin: '0 auto', fontSize: 12, fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
              >
                {this.state.error.message}
              </Typography.Paragraph>
            ) : null}
          </Result>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
