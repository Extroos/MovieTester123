import React, { useState } from 'react';
import type { PartyParticipant } from '../../../../services/watchTogether';

const IS_MOBILE_DEVICE = typeof window !== 'undefined' && /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

const formatTime = (seconds: number) => {
  if (!seconds || isNaN(seconds)) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

interface PlayerControlsProps {
  showControls: boolean;
  iframeFallback: boolean;
  onClose: () => void;
  title: string;
  isOfflineMode: boolean;
  playbackSpeed: number;
  isLocked: boolean;
  setIsLocked: (locked: boolean) => void;
  setShowControls: (show: boolean) => void;
  setSettingsTab: (tab: 'quality' | 'subtitles' | 'speed' | 'servers' | 'download') => void;
  setShowSettings: (show: boolean) => void;
  isCastAvailable: boolean;
  castConnected: boolean;
  handleCastClick: () => Promise<void>;
  resolving: boolean;
  playing: boolean;
  togglePlay: (e?: any) => Promise<void>;
  buffering: boolean;
  handleRewind: (e?: any) => void;
  handleForward: (e?: any) => void;
  currentTime: number;
  duration: number;
  isFullscreen: boolean;
  toggleFullScreen: (e?: any) => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  remotePlayerRef: React.RefObject<any>;
  remotePlayerControllerRef: React.RefObject<any>;
  isDraggingRef: React.MutableRefObject<boolean>;
  controlsTimeout: React.MutableRefObject<NodeJS.Timeout | null>;
  resetControlsTimeout: () => void;
  setCurrentTime: React.Dispatch<React.SetStateAction<number | ((prev: number) => number)>>;
  onNextEpisode?: () => void;
  isPartyMode?: boolean;
  partyParticipants?: PartyParticipant[];
  onBroadcastSeek?: (time: number) => void;
  hostControlsLocked?: boolean;
  aspectRatio: 'fit' | 'fill' | 'zoom';
  setAspectRatio: (ratio: 'fit' | 'fill' | 'zoom') => void;
  zoomScale: number;
  setZoomScale: (scale: number) => void;
  item?: any;
  logoUrl?: string | null;
}

export const PlayerControls = React.memo(function PlayerControls({
  showControls,
  iframeFallback,
  onClose,
  title,
  isOfflineMode,
  playbackSpeed,
  isLocked,
  setIsLocked,
  setShowControls,
  setSettingsTab,
  setShowSettings,
  isCastAvailable,
  castConnected,
  handleCastClick,
  resolving,
  playing,
  togglePlay,
  buffering,
  handleRewind,
  handleForward,
  currentTime,
  duration,
  isFullscreen,
  toggleFullScreen,
  videoRef,
  remotePlayerRef,
  remotePlayerControllerRef,
  isDraggingRef,
  controlsTimeout,
  resetControlsTimeout,
  setCurrentTime,
  onNextEpisode,
  isPartyMode = false,
  partyParticipants = [],
  onBroadcastSeek,
  hostControlsLocked = false,
  aspectRatio,
  setAspectRatio,
  zoomScale,
  setZoomScale,
  item,
  logoUrl
}: PlayerControlsProps) {
  const isTV = typeof document !== 'undefined' && document.body.classList.contains('tv-mode');
  const [isScrubberHovered, setIsScrubberHovered] = useState(false);
  const [hoverPosition, setHoverPosition] = useState<{ x: number; time: number } | null>(null);
  const latestSeekTimeRef = React.useRef<number>(currentTime);

  React.useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isDraggingRef.current) {
        handleScrubberEnd();
      }
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    window.addEventListener('touchend', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('touchend', handleGlobalMouseUp);
    };
  }, []);

  React.useEffect(() => {
    if (!isDraggingRef.current) {
      latestSeekTimeRef.current = currentTime;
    }
  }, [currentTime]);

  if (iframeFallback) {
    return (
      <div 
        style={{
          position: 'absolute', 
          inset: 0, 
          pointerEvents: showControls ? 'auto' : 'none', 
          zIndex: 10010,
          opacity: showControls ? 1 : 0, 
          visibility: showControls ? 'visible' : 'hidden',
          transition: 'opacity 0.25s ease-out, visibility 0.25s ease-out',
          background: 'transparent',
          display: 'flex', 
          flexDirection: 'column', 
          justifyContent: 'flex-start'
        }}
      >
        {/* Top Bar (Metadata & Settings) */}
        <div 
          onClick={(e) => e.stopPropagation()}
          data-player-controls="true"
          style={{ 
            padding: 'calc(12px + env(safe-area-inset-top, 0px)) 24px 20px', 
            background: 'transparent',
            display: 'flex', 
            alignItems: 'center', 
            gap: '20px', 
            pointerEvents: showControls ? 'auto' : 'none',
            transform: showControls ? 'translateY(0)' : 'translateY(-20px)',
            transition: 'transform 0.25s ease-out',
            willChange: 'transform, opacity'
          }}
        >
          <button 
            onClick={(e) => { e.stopPropagation(); onClose(); }} 
            tabIndex={0}
            className="tv-focusable"
            style={{ 
              background: 'rgba(255,255,255,0.08)', 
              border: '1px solid rgba(255,255,255,0.1)', 
              color: '#fff', 
              width: 44, 
              height: 44, 
              borderRadius: '50%', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseDown={e => e.currentTarget.style.transform = 'scale(0.92)'}
            onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
            aria-label="Back"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>

          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '-0.02em' }}>
              {title}
            </h2>
            <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)', marginTop: '2px', fontWeight: 600 }}>
              Third-Party Provider • Embed Player (Contains Ads)
            </div>
          </div>



          <button 
            id="settings-button-trigger"
            onClick={(e) => {
              e.stopPropagation();
              import('../../../../utils/haptics').then(m => m.triggerHaptic('light'));
              setSettingsTab('servers');
              setShowSettings(true);
            }}
            tabIndex={0}
            className="tv-focusable"
            style={{ 
              background: 'rgba(255,255,255,0.08)', 
              border: '1px solid rgba(255,255,255,0.1)', 
              color: '#fff', 
              width: 44, 
              height: 44, 
              borderRadius: '50%', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseDown={e => e.currentTarget.style.transform = 'scale(0.92)'}
            onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
            title="Player Settings"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
        </div>
      </div>
    );
  }

  // Robust Coordinate-based Scrubber Seek & Touch Handlers
  const handleScrubberAction = (clientX: number, target: HTMLDivElement, isEnd = false) => {
    if (!duration || duration <= 0) return;
    const rect = target.getBoundingClientRect();
    const clickX = clientX - rect.left;
    const percent = Math.max(0, Math.min(1, clickX / rect.width));
    const seekTime = percent * duration;

    latestSeekTimeRef.current = seekTime;
    setCurrentTime(seekTime);
    
    // Only perform the actual heavy video seek if clicking or when dragging is finished (isEnd = true)
    if (isEnd || !isDraggingRef.current) {
      if (castConnected && remotePlayerControllerRef.current) {
        remotePlayerRef.current.currentTime = seekTime;
        remotePlayerControllerRef.current.seek();
      } else if (videoRef.current) {
        videoRef.current.currentTime = seekTime;
      }
      onBroadcastSeek?.(seekTime);
    }
  };

  const handleScrubberPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (hostControlsLocked) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (err) {}
    isDraggingRef.current = true;
    if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, clickX / rect.width));
    const hoverTime = percent * (duration || 0);
    setHoverPosition({ x: clickX, time: hoverTime });
    handleScrubberAction(e.clientX, e.currentTarget);
  };

  const handleScrubberPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, clickX / rect.width));
    const hoverTime = percent * (duration || 0);
    setHoverPosition({ x: clickX, time: hoverTime });

    if (isDraggingRef.current) {
      handleScrubberAction(e.clientX, e.currentTarget);
    }
  };

  const handleScrubberEnd = (e?: React.PointerEvent<HTMLDivElement>) => {
    if (e && e.currentTarget && isDraggingRef.current) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch (err) {}
    }
    isDraggingRef.current = false;
    setHoverPosition(null);
    resetControlsTimeout();
    
    // Perform exactly one high-performance seek to the final coordinate when user finishes dragging
    const finalSeekTime = latestSeekTimeRef.current;
    if (castConnected && remotePlayerControllerRef.current) {
      remotePlayerRef.current.currentTime = finalSeekTime;
      remotePlayerControllerRef.current.seek();
    } else if (videoRef.current) {
      videoRef.current.currentTime = finalSeekTime;
    }
    onBroadcastSeek?.(finalSeekTime);
  };

  const bufferedPercent = (() => {
    const dur = duration;
    if (!videoRef.current || !dur || dur <= 0 || isNaN(dur)) return 0;
    try {
      const buffered = videoRef.current.buffered;
      if (buffered && buffered.length > 0) {
        for (let i = buffered.length - 1; i >= 0; i--) {
          const start = buffered.start(i);
          const end = buffered.end(i);
          if (!isNaN(start) && !isNaN(end) && start <= currentTime) {
            return Math.max(0, Math.min(100, (end / dur) * 100));
          }
        }
      }
    } catch (e) {}
    return 0;
  })();

  const isScrubbingActive = isDraggingRef.current || isScrubberHovered;
  const playedPercent = (duration > 0 && !isNaN(currentTime) && !isNaN(duration)) 
    ? Math.max(0, Math.min(100, (currentTime / duration) * 100)) 
    : 0;

  return (
    <div 
      style={{
        position: 'absolute', 
        inset: 0, 
        pointerEvents: showControls ? 'auto' : 'none', 
        zIndex: 99999,
        opacity: showControls ? 1 : 0, 
        visibility: showControls ? 'visible' : 'hidden',
        transition: 'opacity 0.25s ease-out, visibility 0.25s ease-out',
        background: 'transparent',
        display: 'flex', 
        flexDirection: 'column', 
        justifyContent: 'space-between'
      }}
    >
      {/* Top Bar (Metadata & Settings) */}
      <div 
        onClick={(e) => e.stopPropagation()}
        data-player-controls="true"
        style={{ 
          padding: 'calc(12px + env(safe-area-inset-top, 0px)) 24px 20px', 
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.75), transparent)',
          display: 'flex', 
          alignItems: 'center', 
          gap: '20px', 
          pointerEvents: 'auto',
          transform: showControls ? 'translateY(0)' : 'translateY(-20px)',
          transition: 'transform 0.25s ease-out',
          willChange: 'transform, opacity'
        }}
      >
        <button 
          onClick={(e) => { e.stopPropagation(); onClose(); }} 
          tabIndex={0}
          className="tv-focusable"
          style={{ 
            background: 'rgba(255,255,255,0.08)', 
            border: '1px solid rgba(255,255,255,0.1)', 
            color: '#fff', 
            width: 44, 
            height: 44, 
            borderRadius: '50%', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onMouseDown={e => e.currentTarget.style.transform = 'scale(0.92)'}
          onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
          aria-label="Back"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>

        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '-0.02em' }}>
              {title}
            </h2>
            <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)', marginTop: '2px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
              {isOfflineMode ? (
                <>
                  <span style={{ background: 'rgba(34,197,94,0.2)', color: '#22c55e', fontWeight: 800, padding: '1px 7px', borderRadius: 5, fontSize: '0.68rem', letterSpacing: '0.05em' }}>✓ OFFLINE</span>
                  <span>Playing from device storage</span>
                </>
              ) : 'High Quality • Native Player'}
            </div>
          </div>

          {isPartyMode && partyParticipants.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', marginLeft: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', position: 'relative', height: '32px' }}>
                {partyParticipants.map((user, idx) => {
                  const colors = ['#6366f1', '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899'];
                  const userColor = colors[idx % colors.length];
                  const avatarUrl = user.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.name)}`;
                  return (
                    <div 
                      key={user.user_id || user.name} 
                      style={{ 
                        width: '32px', 
                        height: '32px', 
                        borderRadius: '50%', 
                        border: `2px solid ${userColor}`,
                        backgroundImage: `url(${avatarUrl})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        marginLeft: idx > 0 ? '-10px' : 0,
                        zIndex: 10 - idx,
                        position: 'relative'
                      }}
                      title={`${user.name} (Watching Together)`}
                    />
                  );
                })}
              </div>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#10b981', marginLeft: '8px', background: 'rgba(16,185,129,0.15)', padding: '2px 8px', borderRadius: '12px' }}>
                Co-Watching
              </span>
            </div>
          )}
        </div>
        
        {playbackSpeed !== 1.0 && (
          <div style={{ background: '#ffffff', color: '#000000', padding: '4px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 800 }}>
            {playbackSpeed}x Speed
          </div>
        )}

        {/* Screen Lock button (hidden on TV) */}
        {!isTV && (
          <button 
            onClick={(e) => { 
              e.stopPropagation(); 
              import('../../../../utils/haptics').then(m => m.triggerHaptic('medium'));
              setIsLocked(true); 
              setShowControls(false); 
            }} 
            tabIndex={0}
            className="tv-focusable"
            style={{ 
              background: 'rgba(255,255,255,0.08)', 
              border: '1px solid rgba(255,255,255,0.1)', 
              color: '#fff', 
              width: 44, 
              height: 44, 
              borderRadius: '50%', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseDown={e => e.currentTarget.style.transform = 'scale(0.92)'}
            onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
            title="Lock Screen Controls"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </button>
        )}

        <button 
          onClick={(e) => {
            e.stopPropagation();
            import('../../../../utils/haptics').then(m => m.triggerHaptic('light'));
            if (aspectRatio === 'fit') {
              setAspectRatio('fill');
            } else if (aspectRatio === 'fill') {
              setAspectRatio('zoom');
              setZoomScale(1.5);
            } else {
              setAspectRatio('fit');
              setZoomScale(1.0);
            }
          }}
          tabIndex={0}
          className="tv-focusable"
          style={{ 
            background: 'rgba(255,255,255,0.08)', 
            border: '1px solid rgba(255,255,255,0.1)', 
            color: '#fff', 
            width: 44, 
            height: 44, 
            borderRadius: '50%', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onMouseDown={e => e.currentTarget.style.transform = 'scale(0.92)'}
          onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
          title={`Aspect Ratio: ${aspectRatio}`}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            {aspectRatio === 'fit' && (
              <>
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M7 12h10" />
              </>
            )}
            {aspectRatio === 'fill' && (
              <>
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="M3 7l4-4M21 7l-4-4M3 17l4 4M21 17l-4 4" />
              </>
            )}
            {aspectRatio === 'zoom' && (
              <>
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                <line x1="11" y1="8" x2="11" y2="14" />
                <line x1="8" y1="11" x2="14" y2="11" />
              </>
            )}
          </svg>
        </button>

        {!isTV && isCastAvailable && (
          <button 
            onClick={(e) => { e.stopPropagation(); handleCastClick(); }}
            tabIndex={0}
            className="tv-focusable"
            style={{
              background: castConnected ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.08)',
              border: castConnected ? 'none' : '1px solid rgba(255,255,255,0.1)',
              color: castConnected ? '#000000' : '#ffffff',
              width: 44,
              height: 44,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseDown={e => e.currentTarget.style.transform = 'scale(0.92)'}
            onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
            title={castConnected ? "Stop Casting" : "Cast to TV"}
          >
            {resolving ? (
              <div style={{ width: '18px', height: '18px', border: '2px solid rgba(255,255,255,0.2)', borderTopColor: '#ffffff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M2 16.1A5 5 0 0 1 5.9 20M2 12A9 9 0 0 1 11 21m-9-9h.01M21 3H3a2 2 0 0 0-2 2v3h2V5h18v14h-7v2h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/>
              </svg>
            )}
          </button>
        )}

        <button 
          onClick={(e) => {
            e.stopPropagation();
            import('../../../../utils/haptics').then(m => m.triggerHaptic('light'));
            setSettingsTab(isOfflineMode ? 'subtitles' : 'servers');
            setShowSettings(true);
          }}
          tabIndex={0}
          className="tv-focusable"
          style={{ 
            background: 'rgba(255,255,255,0.08)', 
            border: '1px solid rgba(255,255,255,0.1)', 
            color: '#fff', 
            width: 44, 
            height: 44, 
            borderRadius: '50%', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onMouseDown={e => e.currentTarget.style.transform = 'scale(0.92)'}
          onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
          title="Player Settings"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>
      </div>

      <div 
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}
      >
        <button 
          onClick={(e) => { e.stopPropagation(); togglePlay(e); }} 
          disabled={resolving}
          tabIndex={0}
          className="tv-focusable"
          aria-label={playing ? 'Pause' : 'Play'}
          style={{ 
            pointerEvents: 'auto',
            background: 'transparent', 
            border: 'none', 
            color: '#ffffff', 
            width: '84px', 
            height: '84px', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            cursor: (buffering || resolving) ? 'default' : 'pointer', 
            transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
          }}
          onMouseDown={e => { if (!(buffering || resolving)) e.currentTarget.style.transform = 'scale(0.85)'; }}
          onMouseUp={e => { if (!(buffering || resolving)) e.currentTarget.style.transform = 'scale(1)'; }}
        >
          {buffering || resolving ? (
            <div style={{ 
              width: '36px', height: '36px', 
              border: '3.5px solid rgba(255,255,255,0.15)', borderTopColor: '#ffffff', 
              borderRadius: '50%', animation: 'spin 0.8s linear infinite' 
            }} />
          ) : playing ? (
            <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
            </svg>
          ) : (
            <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 6 }}>
              <path d="M8 5v14l11-7z"/>
            </svg>
          )}
        </button>
      </div>

      {/* Paused Detail Overlay */}
      {!playing && item && (
        <div style={{
          position: 'absolute',
          left: IS_MOBILE_DEVICE ? '40px' : '72px',
          bottom: IS_MOBILE_DEVICE ? '76px' : '116px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: IS_MOBILE_DEVICE ? '6px' : '8px',
          maxWidth: IS_MOBILE_DEVICE ? '400px' : '550px',
          zIndex: 10009,
          pointerEvents: 'none',
          animation: 'fadeIn 0.25s ease-out'
        }}>
          {logoUrl ? (
            <img 
              src={logoUrl} 
              alt={title} 
              style={{ 
                maxHeight: IS_MOBILE_DEVICE ? '48px' : '70px', 
                maxWidth: IS_MOBILE_DEVICE ? '180px' : '280px', 
                objectFit: 'contain', 
                marginBottom: IS_MOBILE_DEVICE ? '2px' : '4px' 
              }} 
            />
          ) : (
            <h1 style={{ 
              margin: 0, 
              fontSize: IS_MOBILE_DEVICE ? '1.3rem' : '1.8rem', 
              fontWeight: 900, 
              color: '#fff', 
              textShadow: '0 2px 8px rgba(0,0,0,0.9)' 
            }}>
              {title}
            </h1>
          )}
          
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: IS_MOBILE_DEVICE ? '6px' : '8px', 
            fontSize: IS_MOBILE_DEVICE ? '0.72rem' : '0.78rem', 
            fontWeight: 700, 
            color: 'rgba(255,255,255,0.7)', 
            textShadow: '0 1px 4px rgba(0,0,0,0.9)' 
          }}>
            {(() => {
              const year = (item as any).release_date ? new Date((item as any).release_date).getFullYear() : ((item as any).first_air_date ? new Date((item as any).first_air_date).getFullYear() : null);
              const formattedDuration = (() => {
                if (duration && duration > 0) {
                  const hours = Math.floor(duration / 3600);
                  const minutes = Math.floor((duration % 3600) / 60);
                  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
                }
                if ((item as any).runtime) {
                  const rt = (item as any).runtime;
                  const hours = Math.floor(rt / 60);
                  const minutes = rt % 60;
                  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
                }
                return '';
              })();
              
              const parts = [];
              if (year) parts.push(<span>{year}</span>);
              if (formattedDuration) parts.push(<span>{formattedDuration}</span>);
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: IS_MOBILE_DEVICE ? '6px' : '8px' }}>
                  {parts.map((p, idx) => (
                    <React.Fragment key={idx}>
                      {p}
                      {idx < parts.length - 1 && <span>·</span>}
                    </React.Fragment>
                  ))}
                  {((item as any).vote_average || (item as any).voteAverage) && (
                    <>
                      {parts.length > 0 && <span>·</span>}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <img 
                          src="/streaming icons/imdb.png" 
                          alt="IMDb" 
                          style={{ 
                            height: IS_MOBILE_DEVICE ? '12px' : '14px', 
                            width: 'auto', 
                            objectFit: 'contain' 
                          }} 
                        />
                        <span style={{ fontWeight: 800 }}>
                          {Number((item as any).vote_average || (item as any).voteAverage).toFixed(1)}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              );
            })()}
          </div>
          
          {item.overview && (
            <p style={{
              margin: 0,
              fontSize: IS_MOBILE_DEVICE ? '0.76rem' : '0.84rem',
              lineHeight: 1.4,
              color: 'rgba(255,255,255,0.75)',
              fontWeight: 500,
              textShadow: '0 1px 4px rgba(0,0,0,0.9)',
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: IS_MOBILE_DEVICE ? 2 : 3,
              WebkitBoxOrient: 'vertical',
            }}>
              {item.overview}
            </p>
          )}
        </div>
      )}

      <div 
        onClick={(e) => e.stopPropagation()}
        data-player-controls="true"
        style={{ 
          padding: '24px 24px calc(12px + env(safe-area-inset-bottom, 0px))', 
          background: 'linear-gradient(to top, rgba(0, 0, 0, 0.85), transparent)',
          pointerEvents: 'auto',
          transform: showControls ? 'translateY(0)' : 'translateY(20px)',
          transition: 'transform 0.25s ease-out',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          willChange: 'transform, opacity'
        }}
      >
        {/* Progress Scrubber Container with custom drag & coordinate-based tapping listeners */}
        <div 
          data-scrubber="true"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={handleScrubberPointerDown}
          onPointerMove={handleScrubberPointerMove}
          onPointerUp={handleScrubberEnd}
          onPointerCancel={handleScrubberEnd}
          onMouseLeave={() => { handleScrubberEnd(); setIsScrubberHovered(false); }}
          onMouseEnter={() => setIsScrubberHovered(true)}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') {
              e.preventDefault();
              e.stopPropagation();
              handleRewind();
            } else if (e.key === 'ArrowRight') {
              e.preventDefault();
              e.stopPropagation();
              handleForward();
            }
          }}
          style={{ 
            width: '100%', 
            height: '24px', 
            display: 'flex', 
            alignItems: 'center',
            cursor: 'pointer',
            position: 'relative',
            touchAction: 'none',
            outline: 'none',
            borderRadius: '4px'
          }}
        >
          {/* Seek Time Preview Bubble */}
          {hoverPosition && (
            <div
              style={{
                position: 'absolute',
                bottom: '28px',
                left: `${hoverPosition.x}px`,
                transform: 'translateX(-50%)',
                background: 'rgba(15, 15, 15, 0.95)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '8px',
                padding: '4px 10px',
                color: '#ffffff',
                fontSize: '0.78rem',
                fontWeight: 800,
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
                zIndex: 10020,
              }}
            >
              {formatTime(hoverPosition.time)}
            </div>
          )}
          {/* Visual Track */}
          <div 
            className="scrubber-visual-track"
            style={{ 
              width: '100%', 
              height: isScrubbingActive ? '8px' : '6px', 
              borderRadius: '4px',
              background: 'rgba(255, 255, 255, 0.25)',
              position: 'relative',
              transition: 'height 0.15s ease'
            }}
          >
            {/* Buffered progress track bar */}
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: `${bufferedPercent}%`,
                maxWidth: '100%',
                background: 'rgba(255, 255, 255, 0.3)',
                borderRadius: '4px',
                transition: 'width 0.3s ease'
              }}
            />
            {/* Played Bar */}
            <div 
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: `${playedPercent}%`,
                maxWidth: '100%',
                background: '#e50914',
                borderRadius: '4px'
              }}
            />
            {/* Scrubber Thumb handle (Netflix style red with a small white dot inside) */}
            <div 
              className="scrubber-thumb-handle"
              style={{
                position: 'absolute',
                top: '50%',
                left: `${playedPercent}%`,
                width: '14px',
                height: '14px',
                borderRadius: '50%',
                background: '#e50914',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transform: isScrubbingActive ? 'translate(-50%, -50%) scale(1.4)' : 'translate(-50%, -50%) scale(0.9)',
                transition: isDraggingRef.current ? 'transform 0.1s ease' : 'left 0.1s linear, transform 0.15s ease'
              }}
            >
              <div style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: '#ffffff'
              }} />
            </div>
          </div>
        </div>
        
        {/* Row 2: Time & Actions */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'rgba(255,255,255,0.9)' }}>
                {formatTime(currentTime)} / {formatTime(duration)}
              </div>
          </div>

          {onNextEpisode && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                import('../../../../utils/haptics').then(m => m.triggerHaptic('medium'));
                onNextEpisode();
              }}
              tabIndex={0}
              className="tv-focusable"
              style={{
                background: 'rgba(255,255,255,0.12)',
                border: '1px solid rgba(255,255,255,0.2)',
                color: '#ffffff',
                padding: '6px 14px',
                borderRadius: '20px',
                fontSize: '0.78rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}
              onMouseDown={e => e.currentTarget.style.transform = 'scale(0.95)'}
              onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
              title="Next Episode"
            >
              <span>Next Ep</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
              </svg>
            </button>
          )}

          {!onNextEpisode && !IS_MOBILE_DEVICE && (
            <button
              onClick={toggleFullScreen}
              tabIndex={0}
              className="tv-focusable"
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#ffffff',
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseDown={e => e.currentTarget.style.transform = 'scale(0.9)'}
              onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 14h6v6m10-6h-6v6M4 10h6V4m10 6h-6V4"/>
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
                </svg>
              )}
            </button>
          )}
        </div>
      </div>

      <style>{`
        div[data-scrubber="true"]:focus {
          outline: none !important;
          box-shadow: none !important;
          background: transparent !important;
        }
        div[data-scrubber="true"]:focus .scrubber-visual-track {
          height: 10px !important;
          background: rgba(255, 255, 255, 0.4) !important;
        }
        div[data-scrubber="true"]:focus .scrubber-thumb-handle {
          transform: translate(-50%, -50%) scale(1.6) !important;
          box-shadow: 0 0 12px rgba(229, 9, 20, 0.8) !important;
        }
      `}</style>
    </div>
  );
});
