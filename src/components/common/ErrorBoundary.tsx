import React, { type ReactNode, type ErrorInfo } from 'react';
import { COLORS } from '../../constants';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  constructor(props: ErrorBoundaryProps) {
    super(props);
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
    });
    window.location.reload();
  };

  handleCopyError = () => {
    if (this.state.error) {
      const errorText = `${this.state.error.name}: ${this.state.error.message}\n\nStack Trace:\n${this.state.error.stack || 'No stack trace available'}`;
      navigator.clipboard.writeText(errorText)
        .then(() => alert('Error details copied to clipboard!'))
        .catch(() => alert('Failed to copy error details.'));
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div style={{
          minHeight: '100vh',
          background: '#040405',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.25rem',
          boxSizing: 'border-box',
          overflow: 'hidden',
          position: 'relative'
        }}>
          <style>{`
            @keyframes errorSlideUp {
              from { opacity: 0; transform: translateY(16px); }
              to { opacity: 1; transform: translateY(0); }
            }
          `}</style>

          <div style={{
            position: 'relative',
            zIndex: 2,
            textAlign: 'center',
            width: '100%',
            maxWidth: '330px',
            background: 'rgba(15, 15, 18, 0.75)',
            backdropFilter: 'blur(24px) saturate(140%)',
            WebkitBackdropFilter: 'blur(24px) saturate(140%)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '20px',
            padding: '2rem 1.25rem',
            boxShadow: '0 24px 60px rgba(0,0,0,0.8)',
            animation: 'errorSlideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) both',
            boxSizing: 'border-box'
          }}>
            {/* Warning Circle Indicator */}
            <div style={{
              width: '60px',
              height: '60px',
              margin: '0 auto 1.25rem',
              background: 'rgba(239, 68, 68, 0.08)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1.5px solid rgba(239, 68, 68, 0.3)',
              boxShadow: '0 0 20px rgba(239, 68, 68, 0.1)',
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>

            <h2 style={{
              color: '#FFFFFF',
              fontSize: '1.3rem',
              fontWeight: '800',
              marginBottom: '0.5rem',
              letterSpacing: '-0.4px',
            }}>
              Cinematic Intermission
            </h2>

            <p style={{
              color: 'rgba(255, 255, 255, 0.55)',
              fontSize: '0.85rem',
              marginBottom: '1.75rem',
              lineHeight: '1.5',
            }}>
              The app encountered a slight glitch. Try refreshing or clearing cache data to continue.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <button
                onClick={this.handleReset}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  background: '#ffffff',
                  color: '#000000',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '0.92rem',
                  fontWeight: '800',
                  cursor: 'pointer',
                  boxShadow: '0 4px 16px rgba(255, 255, 255, 0.12)',
                  transition: 'all 0.2s ease',
                }}
              >
                Refresh App
              </button>

              <button
                onClick={() => {
                  localStorage.clear();
                  window.location.reload();
                }}
                style={{
                  width: '100%',
                  padding: '11px 16px',
                  background: 'rgba(255, 255, 255, 0.04)',
                  color: 'rgba(255, 255, 255, 0.8)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '10px',
                  fontSize: '0.85rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                Clear Cache & Reset
              </button>

              <button
                onClick={this.handleCopyError}
                style={{
                  width: '100%',
                  padding: '11px 16px',
                  background: 'rgba(255, 255, 255, 0.04)',
                  color: 'rgba(255, 255, 255, 0.8)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '10px',
                  fontSize: '0.85rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
                Copy Error
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
