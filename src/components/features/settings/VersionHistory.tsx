import React from 'react';
import { COLORS } from '../../../constants';
import { triggerHaptic } from '../../../utils/haptics';

interface VersionHistoryProps {
  onBack: () => void;
}

const versionData = [
  {
    version: 'v0.8.5',
    date: '2026-07-21',
    changes: [
      'Profile Lock System: Added PIN number security lock protection for profiles.',
      'Kids Mode System: Dedicated Kids Mode profiles with age restriction filters.',
      'Updated Streaming Servers: Multi-CDN server mirrors and upgraded scraper fallback engines.',
      'TV Mode Redesign & Enhancements: Overhauled TV UI layout, hero cards, metadata displays, and navigation controls.',
      'TV Remote Navigation & Performance: Ongoing deep optimization of D-pad remote movement, focus states, and rendering responsiveness.',
      'Mobile Player Screen Rotation: Added phone screen orientation rotate button inside the video player.',
      'Player Controls: Fixed the "Next Episode" button in the player for seamless episode transitions.',
      'Download System Fixes: Fixed offline downloads feature (currently running in initial mode; speed & stability optimizations will be stabilized in upcoming updates).',
      'General Fixes & Polish: Extensive small bug fixes, UI improvements, and internationalization enhancements.'
    ]
  },
  {
    version: 'v0.8.0',
    date: '2026-07-06',
    changes: [
      'Offline video downloader integration.',
      'Android TV Mode v1: Added TV navigation framework with D-pad remote focus overlays and layout adapters.',
      'Unified Build Architecture: Single codebase and APK handling both mobile and TV layouts natively (no split APK required).',
      'TV Performance: Initial optimizations to reduce UI render times, though layout constraints and performance optimizations remain ongoing.',
      'Work in Progress: Several settings subpages and statistics cards are in draft/incomplete status and will be finalized in next releases.'
    ]
  },
  {
    version: 'v0.7.0',
    date: '2026-06-29',
    changes: [
      'More Streaming Servers: Added two new backup servers so you always have a working stream when one fails.',
      'Watchlist Performance: The saved movies/shows list now loads and scrolls much faster — no more lag when browsing your library.',
      'Login Page Improvements: The sign-in screen now fits perfectly on smaller phones with bigger buttons and inputs for easier typing.',
      'Episode Loading Indicator: Tapping an episode now shows a visible loading spinner so you know it\'s working before the player opens.',
      'Offline Downloads Notice: Offline video downloads warning notice displays when you visit that section.',
      'Stability & Bug Fixes: Various under-the-hood improvements for smoother navigation and fewer crashes.',
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