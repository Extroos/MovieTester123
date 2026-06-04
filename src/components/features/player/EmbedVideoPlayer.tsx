import React, { useEffect, useRef, useState } from 'react';
import { WatchProgressService } from '../../../services/progress';
import type { Movie, TVShow } from '../../../types';

interface EmbedVideoPlayerProps {
  src: string;
  title: string;
  onClose: () => void;
  item?: Movie | TVShow;
  season?: number;
  episode?: number;
  onSourceChange?: (newSrc: string) => void;
  
  // Cast states and handlers
  isCastAvailable: boolean;
  castConnected: boolean;
  resolving: boolean;
  handleCastClick: () => Promise<void>;
  startTime?: number;
}

type ServerType = 'vidlink' | 'vidsrc_wtf_1' | 'vidsrc_wtf_3';

export default function EmbedVideoPlayer({
  src,
  title,
  onClose,
  item,
  season,
  episode,
  onSourceChange,
  isCastAvailable,
  castConnected,
  resolving,
  handleCastClick,
  startTime
}: EmbedVideoPlayerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showControls, setShowControls] = useState(true);
  const controlsTimeout = useRef<NodeJS.Timeout | null>(null);

  const mountTimeRef = useRef<number>(Date.now());
  const hasReceivedMessagesRef = useRef<boolean>(false);
  const lastSavedProgressRef = useRef<{ currentTime: number; duration: number }>({ 
    currentTime: startTime || 0, 
    duration: 0 
  });
  
  const [currentPlaybackTime, setCurrentPlaybackTime] = useState<number>(startTime || 0);

  // Initialize selected server based on the incoming src URL or default to vidlink
  const [selectedServer, setSelectedServer] = useState<ServerType>('vidlink');
  const [showServerMenu, setShowServerMenu] = useState(false);

  const getElapsedEstimate = () => {
    const elapsedSeconds = Math.floor((Date.now() - mountTimeRef.current) / 1000);
    return (startTime || 0) + elapsedSeconds;
  };

  // Get active embed URL based on selected server
  const getActiveEmbedUrl = () => {
    const getBaseUrl = () => {
      if (!item) return src;

      const id = item.id;
      const isTV = 'name' in item || !!season || !!episode;

      if (selectedServer === 'vidlink') {
        if (isTV && season && episode) {
          return `https://vidlink.pro/tv/${id}/${season}/${episode}?primaryColor=ffffff&nextbutton=true`;
        }
        return `https://vidlink.pro/movie/${id}?primaryColor=ffffff`;
      }

      if (selectedServer === 'vidsrc_wtf_1') {
        if (isTV && season && episode) {
          return `https://vidsrc.wtf/1/tv/${id}/${season}/${episode}?color=ffffff`;
        }
        return `https://vidsrc.wtf/1/movie/${id}?color=ffffff`;
      }

      if (selectedServer === 'vidsrc_wtf_3') {
        if (isTV && season && episode) {
          return `https://vidsrc.wtf/3/tv/${id}/${season}/${episode}?color=ffffff`;
        }
        return `https://vidsrc.wtf/3/movie/${id}?color=ffffff`;
      }

      return src;
    };

    let baseUrl = getBaseUrl();
    const timeToSeek = currentPlaybackTime > 10 ? currentPlaybackTime : (startTime || 0);
    if (timeToSeek > 10) {
      if (selectedServer === 'vidlink') {
        baseUrl += baseUrl.includes('?') ? `&time=${Math.floor(timeToSeek)}` : `?time=${Math.floor(timeToSeek)}`;
      } else {
        baseUrl += baseUrl.includes('?') ? `&startTime=${Math.floor(timeToSeek)}` : `?startTime=${Math.floor(timeToSeek)}`;
      }
    }
    return baseUrl;
  };

  const resetControlsTimeout = () => {
    if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
    setShowControls(true);
    controlsTimeout.current = setTimeout(() => {
      setShowControls(false);
    }, 4000); // 4 seconds for iframe player to allow easier access
  };

  useEffect(() => {
    resetControlsTimeout();
    return () => {
      if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
    };
  }, []);

  // Listen to mouse movement near top or tap container edge to show controls
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // If mouse is within top 80px, show controls
      if (e.clientY < 80) {
        resetControlsTimeout();
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Listen to postMessage API from standard providers (Vidlink, VidSrc, etc.)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // 1. Vidlink format (PLAYER_EVENT)
      if (event.data?.type === 'PLAYER_EVENT' && event.data?.data) {
        const { event: eventType, currentTime, duration } = event.data.data;
        if (typeof currentTime === 'number' && currentTime > 0) {
          hasReceivedMessagesRef.current = true;
          const dur = typeof duration === 'number' ? duration : 0;
          lastSavedProgressRef.current = { currentTime, duration: dur };
        }
      }
      
      // 2. VidSrc/vidsrc.to format (MEDIA_DATA)
      if (event.data?.type === 'MEDIA_DATA' && event.data?.data) {
        const mediaData = event.data.data;
        
        // Extract current time and duration
        const time = mediaData.currentTime ?? mediaData.time ?? mediaData.progress?.currentTime ?? mediaData.progress?.time ?? mediaData.progress?.watched;
        const dur = mediaData.duration ?? mediaData.progress?.duration ?? mediaData.progress?.total;
        
        if (typeof time === 'number' && time > 0) {
          hasReceivedMessagesRef.current = true;
          const totalDur = typeof dur === 'number' ? dur : 0;
          lastSavedProgressRef.current = { currentTime: time, duration: totalDur };
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  // Track and save progress...
  useEffect(() => {
    if (!item) return;

    const doSave = async (msg: string) => {
        let finalTime = 0;
        let finalDuration = 0;

        if (hasReceivedMessagesRef.current) {
            finalTime = lastSavedProgressRef.current.currentTime;
            finalDuration = lastSavedProgressRef.current.duration;
        } else {
            finalTime = getElapsedEstimate();
            finalDuration = 0;
        }

        if (finalTime > 10) {
            console.log(`[EmbedVideoPlayer] ${msg} - Progress: ${finalTime}/${finalDuration}`);
            await WatchProgressService.saveProgress(item, finalTime, finalDuration, season, episode);
        }
    };

    // Save initial load
    doSave('Saving initial progress');

    const handleVisibilityChange = () => {
        if (document.visibilityState === 'hidden') {
            doSave('Saving progress on visibility hide');
        }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const interval = setInterval(() => {
         doSave('Saving heartbeat');
    }, 30000); // 30 seconds heartbeat
    
    return () => {
        clearInterval(interval);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        doSave('Saving final progress on unmount');
    };
  }, [item, season, episode, startTime]);

  const getServerLabel = (srv: ServerType) => {
    switch (srv) {
      case 'vidlink': return 'Vidlink';
      case 'vidsrc_wtf_1': return 'VidSrc.wtf (Server 1)';
      case 'vidsrc_wtf_3': return 'VidSrc.wtf (Server 3)';
    }
  };

  return (
    <div 
      ref={containerRef} 
      style={{ 
        width: '100%', 
        height: '100%', 
        position: 'relative',
        flex: 1,
        display: 'flex',
        flexDirection: 'column'
      }}
      onTouchStart={resetControlsTimeout}
    >
      <iframe
          ref={iframeRef}
          src={getActiveEmbedUrl()}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="origin"
          style={{ width: '100%', height: '100%', flex: 1, border: 'none' }}
      />

      {/* Server Switching Popup Menu */}
      {showServerMenu && (
          <div 
            style={{ 
              position: 'absolute', 
              inset: 0, 
              zIndex: 10020, 
              background: 'rgba(0,0,0,0.92)', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center' 
            }} 
            onClick={() => setShowServerMenu(false)}
          >
              <div 
                style={{ 
                  background: '#18181b', 
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '16px', 
                  padding: '24px', 
                  width: '340px', 
                  maxWidth: '90%', 
                  maxHeight: '85vh',
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }} 
                onClick={e => e.stopPropagation()}
              >
                  <h3 style={{ margin: '0 0 4px', color: '#fff', fontSize: '1.2rem', fontWeight: 800, letterSpacing: '-0.02em' }}>Switch Server</h3>
                  <p style={{ margin: '0 0 8px', color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}>If the current video doesn't play, choose a different server below.</p>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {[
                        { id: 'vidlink', name: 'Server 1 (Vidlink)', desc: 'Fast player (ad-friendly)' },
                        { id: 'vidsrc_wtf_1', name: 'Server 2 (VidSrc.wtf 1)', desc: 'Direct stable stream gateway 1' },
                        { id: 'vidsrc_wtf_3', name: 'Server 3 (VidSrc.wtf 3)', desc: 'Alternative stream gateway 3' }
                      ].map((srv) => (
                          <button 
                            key={srv.id}
                            onClick={() => {
                              const currentProgress = hasReceivedMessagesRef.current 
                                ? lastSavedProgressRef.current.currentTime 
                                : getElapsedEstimate();
                              
                              setCurrentPlaybackTime(currentProgress);
                              setSelectedServer(srv.id as ServerType);
                              setShowServerMenu(false);
                              resetControlsTimeout();
                            }}
                            style={{ 
                                padding: '12px 16px', 
                                borderRadius: '10px', 
                                background: selectedServer === srv.id ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255,255,255,0.03)', 
                                border: selectedServer === srv.id ? '1px solid #ffffff' : '1px solid rgba(255,255,255,0.08)', 
                                color: selectedServer === srv.id ? '#ffffff' : '#fff', 
                                textAlign: 'left', 
                                cursor: 'pointer',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '3px',
                                transition: 'all 0.15s'
                            }}
                          >
                            <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{srv.name}</span>
                            <span style={{ fontSize: '0.72rem', color: selectedServer === srv.id ? '#ffffff' : 'rgba(255,255,255,0.5)' }}>{srv.desc}</span>
                          </button>
                      ))}
                  </div>
                  
                  <button 
                    onClick={() => setShowServerMenu(false)} 
                    style={{ 
                      marginTop: '8px', 
                      width: '100%', 
                      padding: '12px', 
                      background: 'rgba(255,255,255,0.08)', 
                      border: 'none', 
                      color: '#fff', 
                      borderRadius: '10px', 
                      cursor: 'pointer',
                      fontSize: '0.9rem',
                      fontWeight: 700
                    }}
                  >
                    Close
                  </button>
              </div>
          </div>
      )}

      {/* Top Bar controls overlay */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '100px',
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.75), transparent)',
        padding: 'calc(10px + env(safe-area-inset-top, 0px)) 20px', 
        display: 'flex', alignItems: 'center', gap: '16px',
        opacity: showControls ? 1 : 0, transition: 'opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1)', 
        pointerEvents: showControls ? 'auto' : 'none',
        zIndex: 100
      }}>
         <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 44, height: 44, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
             <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
         </button>
         
         <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</h2>
            <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)', marginTop: '2px', fontWeight: 500 }}>Third-Party Provider • Embed Player</div>
         </div>
         
         {item && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowServerMenu(prev => !prev); }}
              style={{
                background: 'rgba(255, 255, 255, 0.15)',
                border: 'none',
                color: '#fff',
                padding: '0 16px',
                height: '44px',
                borderRadius: '22px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: '8px',
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: 700
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect><rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect><line x1="6" y1="6" x2="6.01" y2="6"></line><line x1="6" y1="18" x2="6.01" y2="18"></line></svg>
              <span>Server: {getServerLabel(selectedServer)}</span>
            </button>
         )}

         {isCastAvailable && (
            <button
              onClick={(e) => { e.stopPropagation(); handleCastClick(); }}
              style={{
                background: castConnected ? '#ffffff' : 'rgba(255, 255, 255, 0.2)',
                border: 'none',
                color: castConnected ? '#000000' : '#fff',
                width: '44px',
                height: '44px',
                borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer'
              }}
            >
               {resolving ? (
                   <div style={{ width: '20px', height: '20px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
               ) : (
                   <svg style={{ width: '22px', height: '22px' }} viewBox="0 0 24 24"><path fill="currentColor" d="M21,3H3C1.9,3,1,3.9,1,5v3h2V5h18v14h-7v2h7c1.1,0,2-0.9,2-2V5C23,3.9,22.1,3,21,3z M1,18v3h3C4,19.34,2.66,18,1,18z M1,14v2c2.76,0,5,2.24,5,5h2C8,17.13,4.87,14,1,14z M1,10v2c4.97,0,9,4.03,9,9h2C12,14.92,7.07,10,1,10z"/></svg>
               )}
            </button>
         )}
      </div>
    </div>
  );
}
