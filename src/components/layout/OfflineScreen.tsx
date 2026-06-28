import React from 'react';
import { COLORS } from '../../constants';

interface OfflineScreenProps {
  onRetry: () => void;
}

export default function OfflineScreen({ onRetry }: OfflineScreenProps) {
  return (
    <div style={{
      height: '100vh',
      width: '100vw',
      background: 'rgba(5, 5, 5, 0.4)',
      backdropFilter: 'blur(20px) saturate(220%)',
      WebkitBackdropFilter: 'blur(20px) saturate(220%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#fff',
      padding: '2rem',
      textAlign: 'center',
      animation: 'fadeIn 0.6s ease-out',
    }}>
      <div style={{
        maxWidth: '400px',
        background: 'rgba(255, 255, 255, 0.05)',
        backdropFilter: 'blur(10px) saturate(160%)',
        WebkitBackdropFilter: 'blur(10px) saturate(160%)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        borderRadius: '24px',
        padding: '3rem 2rem',
        boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
        animation: 'slideUpGlass 0.7s cubic-bezier(0.16, 1, 0.3, 1)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}>
        <div style={{
          width: '80px',
          height: '80px',
          borderRadius: '50%',
          backgroundColor: 'rgba(255,255,255,0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '1.5rem',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 0 30px rgba(255, 255, 255, 0.05)',
        }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}>
              <line x1="1" y1="1" x2="23" y2="23"></line>
              <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path>
              <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path>
              <path d="M10.71 5.05A16 16 0 0 1 22.58 9"></path>
              <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path>
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
              <line x1="12" y1="20" x2="12.01" y2="20"></line>
          </svg>
        </div>
        
        <h2 style={{ fontSize: '1.5rem', marginBottom: '0.75rem', fontWeight: 700, letterSpacing: '-0.5px' }}>No Connection</h2>
        <p style={{ color: 'rgba(255, 255, 255, 0.6)', maxWidth: '280px', marginBottom: '2rem', lineHeight: '1.6', fontSize: '0.925rem' }}>
          Please check your network settings and try again.
        </p>
        
        <button
          onClick={onRetry}
          className="offline-screen-btn"
          style={{
            width: '100%',
            padding: '1rem 2rem',
            backgroundColor: '#ffffff',
            color: '#000000',
            border: 'none',
            borderRadius: '14px',
            fontSize: '1rem',
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)',
            boxShadow: '0 8px 24px rgba(255, 255, 255, 0.15)',
          }}
        >
          Try Again
        </button>
      </div>

    </div>
  );
}
