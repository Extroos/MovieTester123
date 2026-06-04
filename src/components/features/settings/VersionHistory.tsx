import React from 'react';
import { COLORS } from '../../../constants';
import { triggerHaptic } from '../../../utils/haptics';

interface VersionHistoryProps {
  onBack: () => void;
}

const versionData = [
  {
    version: 'v0.5.0',
    date: '2026-06-03',
    changes: [
      'Battery Optimization: Improved mobile battery life by reducing active database synchronization load during video playback.',
      'Performance Overhaul: Switched to instant event-driven updates to eliminate background CPU usage.',
      'My List Redesign: Updated watchlist page with clean modern cards, hover scaling, and a quick options menu sheet.',
      'Watchlist Sync Fix: Resolved an issue where TV shows did not update in real-time on your list.',
      'UI & Stream Cleanup: Simplified the download button style and removed unnecessary player badges for a cleaner UI.',
      'Interactive Changelogs: Click the version number anytime to view the app update history.'
    ]
  },
  {
    version: 'v0.1.15',
    date: '2026-02-08',
    changes: [
      'Exploration Update: Added \'See All\' grids for easier content browsing.'
    ]
  },
  {
    version: 'v0.1.13',
    date: '2026-02-08',
    changes: [
      'UI Stability Pass: Fixed scroll behavior and established smooth, fluid page scrolling.'
    ]
  },
  {
    version: 'v0.1.12',
    date: '2026-02-08',
    changes: [
      'Controls Update: Restored swipe gestures and card action response on touch screens.'
    ]
  },
  {
    version: 'v0.1.5',
    date: '2026-02-08',
    changes: [
      'Social Update: Introduced Watch Party rooms and friend activity features.'
    ]
  },
  {
    version: 'v0.1.0',
    date: '2026-02-06',
    changes: [
      'Initial Release: Core video streaming engine and account profile manager established.'
    ]
  }
];

export default function VersionHistory({ onBack }: VersionHistoryProps) {
  return (
    <div style={{
      minHeight: '100vh',
      background: COLORS.bgPrimary,
      color: '#fff',
      padding: '20px',
      overflowX: 'hidden'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        marginBottom: '30px',
        paddingTop: 'env(safe-area-inset-top, 0px)'
      }}>
        <button
          onClick={() => { triggerHaptic('light'); onBack(); }}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#FFFFFF',
            cursor: 'pointer',
            padding: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'opacity 0.2s ease',
            opacity: 0.9,
            outline: 'none',
            marginRight: '16px'
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.9'; }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h1 style={{
          margin: 0,
          fontSize: '1.5rem',
          fontWeight: 800,
          letterSpacing: '-0.02em'
        }}>
          Version History
        </h1>
      </div>

      {/* Version List */}
      <div style={{ marginBottom: '30px' }}>
        {versionData.map((version, index) => (
          <div 
            key={index}
            style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '12px',
              padding: '20px',
              marginBottom: '16px'
            }}
          >
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '12px'
            }}>
              <h2 style={{
                margin: 0,
                fontSize: '1.2rem',
                fontWeight: 700,
                color: '#fff'
              }}>
                {version.version}
              </h2>
              <span style={{
                fontSize: '0.8rem',
                color: 'rgba(255, 255, 255, 0.5)',
                fontWeight: 500
              }}>
                {version.date}
              </span>
            </div>
            
            <ul style={{
              margin: 0,
              padding: '0 0 0 20px',
              listStyle: 'none'
            }}>
              {version.changes.map((change, idx) => (
                <li 
                  key={idx}
                  style={{
                    marginBottom: '8px',
                    color: 'rgba(255, 255, 255, 0.8)',
                    fontSize: '0.9rem',
                    fontWeight: 400,
                    position: 'relative'
                  }}
                >
                  <span style={{
                    position: 'absolute',
                    left: '-20px',
                    top: '0.5em',
                    width: '4px',
                    height: '4px',
                    borderRadius: '50%',
                    backgroundColor: COLORS.primary,
                    content: ''
                  }}></span>
                  {change}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}