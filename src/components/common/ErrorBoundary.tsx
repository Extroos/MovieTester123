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

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div style={{
          minHeight: '100vh',
          background: 'rgba(5, 5, 5, 0.4)',
          backdropFilter: 'blur(50px) saturate(220%)',
          WebkitBackdropFilter: 'blur(50px) saturate(220%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          animation: 'backdropFade 0.6s ease-out',
        }}>
          <div style={{
            textAlign: 'center',
            maxWidth: '400px',
            background: 'rgba(255, 255, 255, 0.05)',
            backdropFilter: 'blur(20px) saturate(160%)',
            WebkitBackdropFilter: 'blur(20px) saturate(160%)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '24px',
            padding: '3rem 2rem',
            boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
            animation: 'slideUpGlass 0.7s cubic-bezier(0.16, 1, 0.3, 1)',
          }}>
            <div style={{
              width: '80px',
              height: '80px',
              margin: '0 auto 1.5rem',
              background: 'rgba(255, 255, 255, 0.1)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              boxShadow: '0 0 30px rgba(255, 255, 255, 0.1)',
            }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>

            <h2 style={{
              color: '#FFFFFF',
              fontSize: '1.5rem',
              fontWeight: '700',
              marginBottom: '0.75rem',
              letterSpacing: '-0.5px',
            }}>
              Cinematic Intermission...
            </h2>

            <p style={{
              color: 'rgba(255, 255, 255, 0.6)',
              fontSize: '0.925rem',
              marginBottom: '2rem',
              lineHeight: '1.6',
            }}>
              The app encountered a slight glitch. Try refreshing or clearing your temporary data to continue.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <button
                onClick={this.handleReset}
                style={{
                  width: '100%',
                  padding: '1rem 1.5rem',
                  background: COLORS.primary,
                  color: '#000000',
                  border: 'none',
                  borderRadius: '14px',
                  fontSize: '1rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  boxShadow: '0 8px 24px rgba(255, 255, 255, 0.15)',
                  transition: 'all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)',
                }}
              >
                Refresh Player
              </button>

              <button
                onClick={() => {
                  localStorage.clear();
                  window.location.reload();
                }}
                style={{
                  width: '100%',
                  padding: '0.8rem 1.5rem',
                  background: 'rgba(255, 255, 255, 0.05)',
                  color: 'rgba(255, 255, 255, 0.8)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '14px',
                  fontSize: '0.9rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                Clear Cache & Reset
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
