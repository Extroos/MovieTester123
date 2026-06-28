import React from 'react';
import { COLORS } from '../../constants';

// Pure CSS loading screen — no Framer Motion dependency.
// Framer Motion is a 122KB chunk (40KB gzip); animating a spinner and fade-in
// does not require it. Using CSS @keyframes reduces first-paint time significantly.

export default function LoadingScreen() {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: '#000000',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        animation: 'ls-fadein 0.6s ease-out both',
      }}
    >
      <style>{`
        @keyframes ls-fadein {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes ls-popin {
          from { opacity: 0; transform: scale(0.95); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes ls-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '32px',
          animation: 'ls-popin 1s cubic-bezier(0.22, 1, 0.36, 1) both',
        }}
      >
        {/* Logo */}
        <img
          src="/cinemovie-logo.png"
          alt="Cinemovie"
          style={{
            height: '80px',
            width: 'auto',
            maxWidth: '280px',
            objectFit: 'contain',
            filter: 'drop-shadow(0 4px 20px rgba(0,0,0,0.8))',
          }}
        />

        {/* Spinner */}
        <div
          style={{
            width: '24px',
            height: '24px',
            border: '2px solid rgba(255,255,255,0.1)',
            borderTop: `2px solid ${COLORS.primary}`,
            borderRadius: '50%',
            animation: 'ls-spin 1s linear infinite',
          }}
        />
      </div>
    </div>
  );
}
