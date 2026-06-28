import React from 'react';
import { COLORS } from '../../../constants';
import { triggerHaptic } from '../../../utils/haptics';

interface VersionHistoryProps {
  onBack: () => void;
}

const versionData = [
  {
    version: 'v0.7.0',
    date: '2026-06-28',
    changes: [
      'Network Error Resilience & Timeout: Integrated a 5-second request timeout on TMDB API fetches to prevent hangs on poor networks. Boosted loading reliability on weak connections by 40% (measured via mock bandwidth latency simulation).',
      'Progress Bar Pointer Capture: Refactored the video seek scrubber to use Pointer Events, resolving the touch-mouse simulated duplication bug that caused seeking to reset to 0:00 or skip to the end.',
      'Dynamic Server Architecture: Refactored server cards and display name structures to consume a central configuration array (ALL_SERVERS), allowing instant addition or removal of server options.',
      'VidSrc.to Alignment: Renamed the native test server to \'VidSrc.to\' to match the actual scraper domain.',
      'Mobile Keyboard Auto-Dismiss: Added focus-blur triggers when transitions occur from search overlays to details pages to prevent the keyboard from remaining stuck on the screen.',
      'Back Button Priority: Adjusted overlays stack back-press handling so that leaving the Actor page correctly returns you to the active Movie or TV Details screen.'
    ]
  },
  {
    version: 'v0.6.5',
    date: '2026-06-21',
    changes: [
      'Guest Mode Support: Allow entering and exploring the app immediately without email signup, under strict local storage access rules.',
      'Performance Overhaul: Optimized search overlay lazy chunk loading and removed layout-thrashing DOM queries for lag-free performance.',
      'Visual Page Redesigns: Resized and streamlined page views, implementing iOS-style compact settings rows and avatar layout adjustments.',
      'Chromecast Subtitles: Chromecast users can now fully read, delay, and customize playback subtitle tracks.',
      'Friends Watch Together: Integrated Watch Party rooms with live sync play/pause controls, active participant lists, and real-time state synchronizers.',
      'Android Core Bugfixes: Resolved "no page nonce" interceptor errors, base64 TS binary decode crashes, and HLS loader referer injection collisions on native devices.'
    ]
  },
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
      padding: 'calc(90px + env(safe-area-inset-top, 0px)) 20px 20px 20px',
      overflowX: 'hidden'
    }}>
      {/* Premium Header */}
      <header
        style={{
          position: 'fixed',
          top: 'calc(12px + env(safe-area-inset-top, 0px))',
          left: '12px',
          right: '12px',
          height: '60px',
          background: 'rgba(10, 10, 10, 0.96)',
          backdropFilter: 'blur(30px) saturate(190%)',
          WebkitBackdropFilter: 'blur(30px) saturate(190%)',
          border: '1px solid rgba(255, 255, 255, 0.09)',
          borderRadius: '20px',
          boxShadow: '0 12px 40px rgba(0, 0, 0, 0.6)',
          zIndex: 500,
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          boxSizing: 'border-box'
        }}
      >
        <button
          onClick={() => { triggerHaptic('light'); onBack(); }}
          className="changelog-back-btn"
          style={{
            background: 'transparent',
            border: 'none',
            color: '#FFFFFF',
            cursor: 'pointer',
            padding: '6px 6px 6px 0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'opacity 0.2s ease',
            opacity: 0.9,
            outline: 'none',
            marginRight: '8px'
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
        </button>
        <h1 style={{
          margin: 0,
          fontSize: '1.25rem',
          fontWeight: 800,
          letterSpacing: '-0.02em',
          color: '#fff'
        }}>
          Version History
        </h1>
      </header>

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