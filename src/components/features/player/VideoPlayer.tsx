import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { StatusBar } from '@capacitor/status-bar';
import { Capacitor, registerPlugin } from '@capacitor/core';
import type { Movie, TVShow } from '../../../types';
import { StreamService } from '../../../services/StreamService';
import LocalVideoPlayer from './LocalVideoPlayer/index';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle } from 'lucide-react';

const SystemCast = registerPlugin<any>('SystemCast');
import { NativeStreamingEngine } from '../../../services/native/NativeStreamingEngine';
import { isTVMode } from '../../../utils/tv';

const isNative = Capacitor.isNativePlatform();

interface VideoPlayerProps {
  src: string;
  title: string;
  onClose: () => void;
  onNextEpisode?: () => void;
  item?: Movie | TVShow;
  season?: number;
  episode?: number;
  tracks?: { file: string; label: string; kind: string; default?: boolean }[];
  startTime?: number;
  /** Force offline mode — disables server switching in LocalVideoPlayer */
  isOfflineMode?: boolean;
  isPartyMode?: boolean;
  partySessionId?: string | null;
  isPartyHost?: boolean;
  logoUrl?: string | null;
}

export default function VideoPlayer({ src, title, onClose, onNextEpisode, item, season, episode, tracks, startTime, isOfflineMode: isOfflineProp = false, isPartyMode = false, partySessionId = null, isPartyHost = false, logoUrl }: VideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isMountedRef = useRef(true);

  // --- Google Cast Integration States & Refs ---
  const [castConnected, setCastConnected] = useState(false);
  const [isCastAvailable, setIsCastAvailable] = useState(true);
  const [resolving, setResolving] = useState(false);
  const [castSource, setCastSource] = useState<string | null>(null);
  const [resolvedTracks, setResolvedTracks] = useState<VideoPlayerProps['tracks']>([]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (Capacitor.isNativePlatform()) {
        SystemCast.disconnectCast().catch((e: any) => console.warn('Failed to disconnect cast on unmount:', e));
      } else if (window.cast) {
        try {
          window.cast.framework.CastContext.getInstance().endCurrentSession(true);
        } catch (e) {}
      }
    };
  }, []);
  
  // Shared playback states (used for UI controls and sync with Google Cast)
  const [playing, setPlaying] = useState(true);
  const [buffering, setBuffering] = useState(true);
  const [currentTime, setCurrentTime] = useState(startTime || 0);
  const [duration, setDuration] = useState(0);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [subtitleDelay, setSubtitleDelay] = useState<number>(0);

  useEffect(() => {
    if (errorToast) {
      const timer = setTimeout(() => setErrorToast(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [errorToast]);

  const subtitleStyleRef = useRef({ size: 'normal', color: '#ffffff', opacity: 0.6 });

  useEffect(() => {
    if (castConnected && Capacitor.isNativePlatform()) {
      SystemCast.setSubtitleStyle({
        size: subtitleStyleRef.current.size,
        color: subtitleStyleRef.current.color,
        opacity: subtitleStyleRef.current.opacity
      }).catch((e: any) => console.error('Failed to sync initial subtitle style to TV:', e));
    }
  }, [castConnected]);

  const handleSubtitleStyleChange = (style: { size: string, color: string, opacity: number }) => {
    subtitleStyleRef.current = style;
    if (castConnected && Capacitor.isNativePlatform()) {
      SystemCast.setSubtitleStyle({
        size: style.size,
        color: style.color,
        opacity: style.opacity
      }).catch((e: any) => console.error('Failed to sync subtitle style to TV:', e));
    }
  };
  
  const remotePlayer = useRef<any>(null);
  const remotePlayerController = useRef<any>(null);

  const [activeSrc, setActiveSrc] = useState(src);
  const [showCastPairing, setShowCastPairing] = useState(false);
  
  useEffect(() => {
    setActiveSrc(src);
  }, [src]);

  // Determine if source is direct HLS or MP4 file proxied locally
  const isLocalProxy = activeSrc.includes('/local-proxy');
  const isHls = activeSrc.includes('.m3u8');
  // Support both direct ends and embedded query parameters for direct file formats
  const isDirectFile = activeSrc.match(/\.(mp4|webm|ogg|m3u8|ts)(\?|&|$)/i) || activeSrc.includes('.mp4');
  // Local offline storage URLs: blob: (IndexedDB), capacitor:// (Filesystem), idb:// (sentinel)
  const isLocalOfflineUrl = activeSrc.startsWith('blob:') || activeSrc.startsWith('capacitor://') || activeSrc.startsWith('idb://');
  const useNativePlayer = isLocalProxy || isHls || !!isDirectFile || isLocalOfflineUrl;
  // Offline mode = playing from device storage (no server switching allowed)
  const isOfflineMode = isOfflineProp || isLocalOfflineUrl;
  
  // Switch to native player rendering if casting is connected (to show control dashboard)
  const shouldShowNative = useNativePlayer || castConnected;
  // Mock remote player objects for Capacitor native environment
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      if (!remotePlayer.current) {
        remotePlayer.current = {
          get isPaused() { return !playing; },
          get currentTime() { return currentTime; },
          set currentTime(val) { 
             (this as any)._seekTime = val; 
          },
          get duration() { return duration; },
          get isConnected() { return castConnected; }
        };
      }
      if (!remotePlayerController.current) {
        remotePlayerController.current = {
          playPause: () => {
            if (playing) {
              SystemCast.pause();
            } else {
              SystemCast.play();
            }
          },
          seek: () => {
            const target = remotePlayer.current._seekTime !== undefined ? remotePlayer.current._seekTime : currentTime;
            SystemCast.seek({ time: target });
          }
        };
      }
    }
  }, [playing, currentTime, duration, castConnected]);

  // Listen for native cast events on mobile
  useEffect(() => {
    let active = true;
    let statusListener: any = null;
    let progressListener: any = null;

    const setupListeners = async () => {
      if (!Capacitor.isNativePlatform()) return;

      try {
        const sListener = await SystemCast.addListener('onCastStatusChanged', (data: { connected: boolean, deviceName: string }) => {
          if (!active) {
            sListener.remove();
            return;
          }
          setCastConnected(data.connected);
          if (data.connected) {
            setPlaying(true);
          }
        });
        if (!active) {
          sListener.remove();
          return;
        }
        statusListener = sListener;

        const pListener = await SystemCast.addListener('onCastProgressChanged', (data: { currentTime: number, duration: number, paused: boolean, buffering: boolean }) => {
          if (!active) {
            pListener.remove();
            return;
          }
          setCurrentTime(data.currentTime);
          if (data.duration > 0) {
            setDuration(data.duration);
          }
          setPlaying(!data.paused);
          setBuffering(data.buffering);
        });
        if (!active) {
          pListener.remove();
          return;
        }
        progressListener = pListener;
      } catch (e) {
        console.warn('Failed to setup SystemCast listeners:', e);
      }
    };

    if (Capacitor.isNativePlatform()) {
      setupListeners();
    }

    return () => {
      active = false;
      if (statusListener) statusListener.remove();
      if (progressListener) progressListener.remove();
    };
  }, []);

  // Initialize Chromecast SDK
  useEffect(() => {
    const initCast = () => {
       if ((window.chrome && window.chrome.cast && window.cast) || Capacitor.isNativePlatform()) {
          setIsCastAvailable(true);
       }
       if (window.chrome && window.chrome.cast && window.cast) {
          const context = window.cast.framework.CastContext.getInstance();
          
          context.setOptions({
            receiverApplicationId: window.chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
            autoJoinPolicy: window.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED
          });

          remotePlayer.current = new window.cast.framework.RemotePlayer();
          remotePlayerController.current = new window.cast.framework.RemotePlayerController(remotePlayer.current);
          
          const updateState = () => {
              setCastConnected(remotePlayer.current.isConnected);
          };
          
          const syncMediaState = () => {
              if (remotePlayer.current.isConnected) {
                  setPlaying(!remotePlayer.current.isPaused);
                  setCurrentTime(remotePlayer.current.currentTime);
                  setDuration(remotePlayer.current.duration);
              }
          };
          
          remotePlayerController.current.addEventListener(
             window.cast.framework.RemotePlayerEventType.IS_CONNECTED_CHANGED,
             updateState
          );

          remotePlayerController.current.addEventListener(
             window.cast.framework.RemotePlayerEventType.IS_PAUSED_CHANGED,
             syncMediaState
          );

          remotePlayerController.current.addEventListener(
             window.cast.framework.RemotePlayerEventType.CURRENT_TIME_CHANGED,
             () => {
                 const newTime = remotePlayer.current.currentTime;
                 setCurrentTime(prevTime => {
                     // Only update if difference is significant to avoid slider jitter during drag
                     if (Math.abs(prevTime - newTime) > 0.5) return newTime;
                     return prevTime;
                 });
             }
          );
          
          // Initial check
          if (remotePlayer.current.isConnected) updateState();
       }
    };
    
    // Check if API is already available or wait for it
    if (window['__onGCastApiAvailable'] || Capacitor.isNativePlatform()) {
        initCast();
    } else {
        window['__onGCastApiAvailable'] = (isAvailable: boolean) => {
            if (isAvailable) initCast();
        };
    }
  }, []);

  // Load Media into Cast Session
  useEffect(() => {
    const activeSrcToCast = castSource || activeSrc;
    const activeTracks = resolvedTracks.length > 0 ? resolvedTracks : tracks;

    if (castConnected && activeSrcToCast && window.cast) {
        const session = window.cast.framework.CastContext.getInstance().getCurrentSession();
        if (session) {
            const streamUrl = activeSrcToCast.startsWith('http') ? activeSrcToCast : new URL(activeSrcToCast, window.location.href).href;
            const mediaSession = session.getMediaSession();
            if (mediaSession && mediaSession.media) {
                const currentContentId = mediaSession.media.contentId;
                if (currentContentId === streamUrl) {
                    const finalTracks = activeTracks || [];
                    const activeTrackIndex = finalTracks.findIndex(t => t.default);
                    const activeTrackIds = activeTrackIndex !== -1 ? [activeTrackIndex + 1] : [];
                    
                    const request = new window.chrome.cast.media.EditTracksInfoRequest(activeTrackIds);
                    mediaSession.editTracksInfo(request,
                        () => console.log('[VideoPlayer] Successfully updated active track on Web Cast'),
                        (err: any) => console.error('[VideoPlayer] Failed to edit tracks on Web Cast:', err)
                    );
                    return;
                }
            }
            const contentType = streamUrl.includes('.m3u8') ? 'application/x-mpegURL' : 'video/mp4';
            
            const mediaInfo = new window.chrome.cast.media.MediaInfo(streamUrl, contentType);
            mediaInfo.metadata = new window.chrome.cast.media.GenericMediaMetadata();
            mediaInfo.metadata.title = title;
            mediaInfo.metadata.subtitle = (item as any)?.name ? `Season ${season} • Episode ${episode}` : '';
            mediaInfo.metadata.images = [];
            
            if (item && (item as any).posterPath) {
               mediaInfo.metadata.images.push(new window.chrome.cast.Image(`https://image.tmdb.org/t/p/w500${(item as any).posterPath}`));
            }

            // --- Subtitles for Cast ---
            const finalTracks = activeTracks || [];
            if (finalTracks.length > 0) {
               const castTracks = finalTracks.map((track, i) => {
                  const castTrack = new window.chrome.cast.media.Track(i + 1, window.chrome.cast.media.TrackType.TEXT);
                  
                  // Use the original remote URL if available to bypass local blob / host CORS issues on Chromecast
                  let trackUrl = (track as any).originalFile || track.file;
                  
                  // Resolve relative path to absolute
                  if (trackUrl && !trackUrl.startsWith('http') && !trackUrl.startsWith('blob:')) {
                      trackUrl = new URL(trackUrl, window.location.href).href;
                  }
                  
                  // Replace localhost/127.0.0.1 with the actual hostname of the server if we are casting
                  if (trackUrl && (trackUrl.includes('localhost') || trackUrl.includes('127.0.0.1'))) {
                      trackUrl = trackUrl.replace('localhost', window.location.hostname).replace('127.0.0.1', window.location.hostname);
                  }

                  if (trackUrl && subtitleDelay !== 0) {
                      const separator = trackUrl.includes('?') ? '&' : '?';
                      trackUrl = `${trackUrl}${separator}delay=${subtitleDelay}`;
                  }

                  castTrack.trackContentId = trackUrl;
                  castTrack.trackContentType = 'text/vtt';
                  castTrack.subtype = window.chrome.cast.media.TextTrackType.SUBTITLES;
                  castTrack.name = track.label;
                  castTrack.language = track.label ? track.label.substring(0, 2).toLowerCase() : 'en';
                  return castTrack;
               });
               mediaInfo.tracks = castTracks;
               mediaInfo.textTrackStyle = new window.chrome.cast.media.TextTrackStyle();
                
                // Fetch user style selections dynamically from localStorage
                const savedSize = localStorage.getItem('cinemovie_subtitle_size') || 'normal';
                const savedColor = localStorage.getItem('cinemovie_subtitle_color') || '#ffffff';
                const savedOpacity = localStorage.getItem('cinemovie_subtitle_bg_opacity') !== null ? parseFloat(localStorage.getItem('cinemovie_subtitle_bg_opacity')!) : 0.6;

                if (window.chrome?.cast?.media) {
                    const style = mediaInfo.textTrackStyle;
                    style.fontFamily = 'sans-serif';
                    
                    // fontScale mapping
                    let scale = 1.0;
                    if (savedSize === 'small') scale = 0.85;
                    else if (savedSize === 'large') scale = 1.3;
                    else if (savedSize === 'xlarge') scale = 1.6;
                    style.fontScale = scale;

                    // foregroundColor mapping
                    style.foregroundColor = (savedColor || '#ffffff') + 'FF';

                    // backgroundColor mapping
                    const opacityHex = Math.round((savedOpacity ?? 0.6) * 255).toString(16).padStart(2, '0');
                    style.backgroundColor = '#000000' + opacityHex;
                }
             }

            const request = new window.chrome.cast.media.LoadRequest(mediaInfo);
            request.autoplay = false;
            
            // Set activeTrackIds if a track is selected (marked as default: true)
            const activeTrackIndex = finalTracks.findIndex(t => t.default);
            if (activeTrackIndex !== -1) {
               request.activeTrackIds = [activeTrackIndex + 1];
            }

            // If we have local current time, start from there
            if (currentTime > 0) {
                request.currentTime = currentTime;
            }

            console.log('[VideoPlayer] Requesting Cast Media Load:', {
                streamUrl,
                contentType,
                currentTime
            });
            session.loadMedia(request)
                .then(() => {
                    console.log('[VideoPlayer] Cast Media Load Success');
                    setTimeout(() => {
                        const currentSession = window.cast?.framework?.CastContext?.getInstance()?.getCurrentSession();
                        if (currentSession && currentSession.getMediaSession()) {
                            currentSession.getMediaSession().play(null);
                        }
                    }, 1500);
                })
                .catch((e: any) => console.error('Cast Load Error:', e));
        }
    }
  }, [castConnected, activeSrc, castSource, title, item, resolvedTracks, subtitleDelay]);

  // Sync subtitle delay or selection changes to native Android Cast session
  useEffect(() => {
    if (castConnected && Capacitor.isNativePlatform() && (castSource || activeSrc)) {
      const posterUrl = item && (item as any).posterPath 
        ? `https://image.tmdb.org/t/p/w500${(item as any).posterPath}` 
        : '';
      const subtitleText = (item as any)?.name 
        ? `Season ${season} • Episode ${episode}` 
        : '';
      
      const finalTracks = resolvedTracks.length > 0 ? resolvedTracks : (tracks || []);
      const processedTracks = finalTracks.map((track, i) => {
        let trackUrl = (track as any).originalFile || track.file;
        if (trackUrl && !trackUrl.startsWith('http') && !trackUrl.startsWith('blob:')) {
          trackUrl = new URL(trackUrl, window.location.href).href;
        }
        if (trackUrl && (trackUrl.includes('localhost') || trackUrl.includes('127.0.0.1'))) {
          trackUrl = trackUrl.replace('localhost', window.location.hostname).replace('127.0.0.1', window.location.hostname);
        }
        if (trackUrl && subtitleDelay !== 0) {
          const separator = trackUrl.includes('?') ? '&' : '?';
          trackUrl = `${trackUrl}${separator}delay=${subtitleDelay}`;
        }
        return {
          id: i + 1,
          src: trackUrl,
          label: track.label,
          language: track.label ? track.label.substring(0, 2).toLowerCase() : 'en',
          isDefault: !!track.default
        };
      });
      const activeTrack = processedTracks.find(t => t.isDefault);
      const activeTrackId = activeTrack ? activeTrack.id : -1;

      SystemCast.launchCastSettings({
        videoUrl: castSource || activeSrc,
        title: title,
        subtitle: subtitleText,
        posterUrl: posterUrl,
        currentTime: currentTime,
        subtitleTracks: processedTracks,
        activeTrackId: activeTrackId
      }).catch((e: any) => console.error('Failed to update native cast track delay:', e));
    }
  }, [subtitleDelay, resolvedTracks, castConnected, activeSrc, castSource, title, item, season, episode]);

  const handleCastClick = async () => {
      // Auto-pause local playback if currently playing to prevent TV sound delay / overlays
      if (playing) {
          setPlaying(false);
      }

      // 1. On mobile native platform, ALWAYS show our custom TV pairing remote modal
      if (Capacitor.isNativePlatform()) {
          import('../../../utils/haptics').then(m => m.triggerHaptic('medium'));
          setShowCastPairing(true);
          return;
      }

      // 2. On PC/Web:
      // If native Cast is not available (Safari/Firefox/extension still loading), show custom pairing remote modal
      if (!window.cast) {
          import('../../../utils/haptics').then(m => m.triggerHaptic('medium'));
          setShowCastPairing(true);
          return;
      }
      
      const context = window.cast.framework.CastContext.getInstance();
      
      // If not a direct file, we MUST resolve it first
      if (!useNativePlayer && !castSource) {
          if (resolving) return;
          setResolving(true);

          const result = await StreamService.resolve(
              item?.id || '', 
              (item as any)?.name ? 'tv' : 'movie', 
              season, 
              episode
          );

          setResolving(false);

          if (result) {
              console.log('[VideoPlayer] Resolution success, source:', result.source);
              setCastSource(result.source);
              if (result.subtitles) setResolvedTracks(result.subtitles);
              
              console.log('[VideoPlayer] Requesting Cast session...');
              context.requestSession();
          } else {
              console.warn('[VideoPlayer] Resolution failed');
              setErrorToast("Sorry, this provider doesn't support casting yet. Try another one if available!");
          }
      } else {
          context.requestSession();
      }
  };

  const didInitRef = useRef(false);

  // --- Immersive UI Setup (Orientation locks, Keeping Awake, Fullscreen overlays) ---
  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    const handleReFocus = () => {
        if (!isMountedRef.current) return;
        if (isNative) {
            StatusBar.hide().catch(() => {});
            StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
        }
        if (containerRef.current && !document.fullscreenElement) {
            if (containerRef.current.requestFullscreen) {
                containerRef.current.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
            } else if ((containerRef.current as any).webkitRequestFullscreen) {
                (containerRef.current as any).webkitRequestFullscreen().catch(() => {});
            }
        }
    };

    const setupImmersion = async () => {
        if (!containerRef.current || !isMountedRef.current) return;
        
        try {
            // 1. Hide Status Bar immediately
            if (isNative && isMountedRef.current) {
                await StatusBar.hide().catch(() => {});
                if (isMountedRef.current) {
                    await StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
                }
            }
                    // 2. Lock Orientation to Landscape with Sensor Auto-Rotation
            if (!isTVMode() && (isMobile || isNative) && isMountedRef.current) {
                if (isNative) {
                    try {
                        await NativeStreamingEngine.lockToSensorLandscape().catch(() => {});
                    } catch (e) {
                        try {
                            const { ScreenOrientation } = await import('@capacitor/screen-orientation');
                            if (isMountedRef.current) {
                                await (ScreenOrientation as any).lock({ orientation: 'landscape' }).catch(() => {});
                            }
                        } catch (err) {
                             if (isMountedRef.current && (screen.orientation as any)?.lock) {
                                 await (screen.orientation as any).lock('landscape').catch(() => {});
                             }
                        }
                    }
                } else if (isMountedRef.current && (screen.orientation as any)?.lock) {
                    await (screen.orientation as any).lock('landscape').catch(() => {});
                }
            }

            // 3. Keep Awake
            if (isNative && isMountedRef.current) {
                try {
                    const { KeepAwake } = await import('@capacitor-community/keep-awake');
                    if (isMountedRef.current) {
                        await KeepAwake.keepAwake().catch(() => {});
                    }
                } catch (e) {}
            }
            
            // 4. Fullscreen LAST to prevent layout jumps during orientation change
            if (!document.fullscreenElement && isMountedRef.current) {
                if (containerRef.current.requestFullscreen) {
                    await containerRef.current.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
                } else if ((containerRef.current as any).webkitRequestFullscreen) {
                    await (containerRef.current as any).webkitRequestFullscreen().catch(() => {});
                }
            }
        } catch (e) {
            console.log('Immersion setup failed:', e);
        }
    };

    const timer = setTimeout(setupImmersion, 50);

    window.addEventListener('focus', handleReFocus);
    document.addEventListener('visibilitychange', handleReFocus);

    return () => {
        clearTimeout(timer);
        window.removeEventListener('focus', handleReFocus);
        document.removeEventListener('visibilitychange', handleReFocus);
        if (isNative) {
            StatusBar.show().catch(() => {});
            StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
        }
        if (document.fullscreenElement) {
           document.exitFullscreen().catch(() => {});
        }

        if (isMobile || isNative) {
            if (isNative) {
                const disableKeepAwake = async () => {
                    try {
                        const { KeepAwake } = await import('@capacitor-community/keep-awake');
                        await KeepAwake.allowSleep();
                    } catch (e) {}
                };
                disableKeepAwake();
            }
            
            if (isTVMode()) {
                if (isNative) {
                    const unlockOrientation = async () => {
                        try {
                            const { ScreenOrientation } = await import('@capacitor/screen-orientation');
                            await (ScreenOrientation as any).unlock().catch(() => {});
                        } catch (e) {}
                    };
                    unlockOrientation();
                }
            } else if (isNative) {
                const lockToPortrait = async () => {
                    try {
                        await NativeStreamingEngine.restoreOrientation().catch(() => {});
                    } catch (e) {
                        try {
                            const { ScreenOrientation } = await import('@capacitor/screen-orientation');
                            await (ScreenOrientation as any).lock({ orientation: 'portrait' }).catch(() => {});
                        } catch (err) {
                            try {
                                if (screen.orientation && (screen.orientation as any).lock) {
                                    await (screen.orientation as any).lock('portrait').catch(() => {});
                                }
                            } catch (webErr) {}
                        }
                    }
                };
                lockToPortrait();
            } else {
                try {
                    if (screen.orientation && (screen.orientation as any).lock) {
                        (screen.orientation as any).lock('portrait').catch(() => {});
                    }
                } catch (webErr) {}
            }
        }
    };
  }, []);

  // Handle Fullscreen Change events
  useEffect(() => {
    const handleFullscreenChange = () => {
      // Intentionally kept as parity placeholder from previous version
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, [onClose]);

  // Handle exit shortcuts (Escape/Backspace keys) and Android native Back button
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Backspace') {
          const settingsOverlay = document.getElementById('player-settings-overlay');
          if (settingsOverlay) {
            e.preventDefault();
            // Click to trigger onClick handler (setShowSettings(false))
            settingsOverlay.click();
          } else {
            onClose();
          }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    
    let backListener: any;
    const setupBackListener = async () => {
      try {
        const { App } = await import('@capacitor/app');
        backListener = await App.addListener('backButton', () => {
          const settingsOverlay = document.getElementById('player-settings-overlay');
          if (settingsOverlay) {
            settingsOverlay.click();
            return;
          }

          // Check if current server is ad-supported (from localStorage)
          let isAdFree = true;
          try {
            const currentSrvId = localStorage.getItem('selected_server') || 'vidsrc-pm';
            const allServers = [
              { id: 'vidsrc-pm', isAdFree: true },
              { id: 'vidsrc-wtf-2', isAdFree: true },
              { id: 'vidzee', isAdFree: true },
              { id: 'vidlink-pro', isAdFree: true },
              { id: '2embed', isAdFree: true },
              { id: 'vixsrc', isAdFree: true },
              { id: 'universal', isAdFree: false },
              { id: 'vidsrc-sbs', isAdFree: false },
              { id: 'vidsrc-fyi', isAdFree: false },
              { id: 'vidsrc-top', isAdFree: false }
            ];
            const found = allServers.find(s => s.id === currentSrvId);
            if (found) {
              isAdFree = found.isAdFree;
            }
          } catch (_) {}

          if (!isAdFree) {
            // First back press shows settings overlay instead of closing
            const settingsBtn = document.querySelector('.tv-focusable[title="Settings"]') as HTMLElement || document.querySelector('[class*="settings"]') as HTMLElement;
            if (settingsBtn) {
              settingsBtn.click();
            } else {
              // Fallback element select via ID or close normally
              const directBtn = document.getElementById('settings-button-trigger');
              if (directBtn) {
                directBtn.click();
              } else {
                onClose();
              }
            }
          } else {
            onClose();
          }
        });
      } catch (e) {}
    };
    setupBackListener();

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (backListener) backListener.remove();
    };
  }, [onClose]);

  const handleContextMenu = (e: React.MouseEvent) => e.preventDefault();

  if (Capacitor.getPlatform() === 'android' && resolving) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: 'sans-serif' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '1.2rem', marginBottom: '1.5rem', fontWeight: 600 }}>Resolving Native Auto-Streams...</p>
          <div style={{ width: '40px', height: '40px', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto' }} />
          <style>{`
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="video-player-overlay"
      onContextMenu={handleContextMenu}
      onClick={e => e.stopPropagation()}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: '#000',
        display: 'flex',
        flexDirection: 'column',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <LocalVideoPlayer
        src={castSource || activeSrc}
        onSourceChange={setActiveSrc}
        title={title}
        onClose={onClose}
        onNextEpisode={onNextEpisode}
        item={item}
        season={season}
        episode={episode}
        tracks={resolvedTracks.length > 0 ? resolvedTracks : tracks}
        onTracksChange={setResolvedTracks}
        isOfflineMode={isOfflineMode}
        isCastAvailable={isCastAvailable}
        castConnected={castConnected}
        resolving={resolving}
        handleCastClick={handleCastClick}
        playing={playing}
        setPlaying={setPlaying}
        currentTime={currentTime}
        setCurrentTime={setCurrentTime}
        duration={duration}
        setDuration={setDuration}
        buffering={buffering}
        setBuffering={setBuffering}
        remotePlayerRef={remotePlayer}
        remotePlayerControllerRef={remotePlayerController}
        startTime={startTime}
        isPartyMode={isPartyMode}
        partySessionId={partySessionId}
        isPartyHost={isPartyHost}
        subtitleDelay={subtitleDelay}
        onSubtitleDelayChange={setSubtitleDelay}
        logoUrl={logoUrl}
        onSubtitleStyleChange={handleSubtitleStyleChange}
      />

      {/* CineMovie Custom Smart TV Casting & Remote Pairing Modal */}
      <AnimatePresence>
        {showCastPairing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 10090,
              background: 'rgba(0,0,0,0.6)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
              overflowY: 'auto',
            }}
            onClick={() => setShowCastPairing(false)}
          >
            <style>{`
              @media (orientation: landscape) and (max-height: 500px) {
                .cinemovie-cast-sheet {
                  border-radius: 20px 0 0 20px !important;
                  border-top-right-radius: 0 !important;
                  border-bottom-right-radius: 0 !important;
                  max-height: 100% !important;
                  max-width: 360px !important;
                  width: 360px !important;
                  position: fixed !important;
                  top: 0 !important;
                  right: 0 !important;
                  bottom: 0 !important;
                  border-bottom: 1px solid rgba(255,255,255,0.08) !important;
                  border-right: none !important;
                  animation: slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1) !important;
                }
              }
            `}</style>

            <div
              className="cinemovie-cast-sheet"
              style={{
                background: 'rgba(12, 12, 14, 0.98)',
                borderTopLeftRadius: '20px',
                borderTopRightRadius: '20px',
                border: '1px solid rgba(255,255,255,0.09)',
                borderBottom: 'none',
                padding: '14px 14px calc(14px + env(safe-area-inset-bottom, 0px))',
                width: '100%',
                maxWidth: '520px',
                maxHeight: '82vh',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                scrollbarWidth: 'none',
                msOverflowStyle: 'none'
              }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ width: '36px', height: '4px', background: 'rgba(255,255,255,0.18)', borderRadius: '2px', alignSelf: 'center', marginBottom: '-4px' }} />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <h3 style={{ margin: 0, color: '#fff', fontSize: '1.1rem', fontWeight: 800, letterSpacing: '-0.02em' }}>CineMovie TV Cast</h3>
                <button 
                  onClick={() => setShowCastPairing(false)} 
                  style={{ 
                    background: 'rgba(255,255,255,0.08)', 
                    border: '1px solid rgba(255,255,255,0.1)', 
                    color: '#fff', 
                    padding: '5px 12px', 
                    borderRadius: '10px', 
                    fontSize: '0.75rem', 
                    fontWeight: 700, 
                    cursor: 'pointer' 
                  }}
                >
                  Close
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '6px 2px' }}>
                <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', margin: 0, fontWeight: 550, lineHeight: 1.4 }}>
                  Cast and stream directly to your Smart TV, Chromecast, or Mirror screen on Wi-Fi (make sure devices are on the same network).
                </p>

                {Capacitor.isNativePlatform() && (
                  <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                    <button
                      onClick={async () => {
                        import('../../../utils/haptics').then(m => m.triggerSuccessHaptic());
                        try {
                          if (castConnected) {
                            await SystemCast.disconnectCast();
                          } else {
                            // Automatically force disconnect any prior sessions first to ensure fresh TV connection state
                            try {
                              await SystemCast.disconnectCast();
                              await new Promise(resolve => setTimeout(resolve, 500));
                            } catch (ignored) {}

                            const posterUrl = item && (item as any).posterPath 
                              ? `https://image.tmdb.org/t/p/w500${(item as any).posterPath}` 
                              : '';
                            const subtitleText = (item as any)?.name 
                              ? `Season ${season} • Episode ${episode}` 
                              : '';
                            const finalTracks = resolvedTracks.length > 0 ? resolvedTracks : (tracks || []);
                            const processedTracks = finalTracks.map((track, i) => {
                              let trackUrl = (track as any).originalFile || track.file;
                              if (trackUrl && !trackUrl.startsWith('http') && !trackUrl.startsWith('blob:')) {
                                trackUrl = new URL(trackUrl, window.location.href).href;
                              }
                              if (trackUrl && (trackUrl.includes('localhost') || trackUrl.includes('127.0.0.1'))) {
                                trackUrl = trackUrl.replace('localhost', window.location.hostname).replace('127.0.0.1', window.location.hostname);
                              }
                              if (trackUrl && subtitleDelay !== 0) {
                                const separator = trackUrl.includes('?') ? '&' : '?';
                                trackUrl = `${trackUrl}${separator}delay=${subtitleDelay}`;
                              }
                              return {
                                id: i + 1,
                                src: trackUrl,
                                label: track.label,
                                language: track.label ? track.label.substring(0, 2).toLowerCase() : 'en',
                                isDefault: !!track.default
                              };
                            });
                            const activeTrack = processedTracks.find(t => t.isDefault);
                            const activeTrackId = activeTrack ? activeTrack.id : -1;

                            await SystemCast.launchCastSettings({
                              videoUrl: castSource || activeSrc,
                              title: title,
                              subtitle: subtitleText,
                              posterUrl: posterUrl,
                              currentTime: currentTime,
                              subtitleTracks: processedTracks,
                              activeTrackId: activeTrackId
                            });
                          }
                        } catch (err: any) {
                          setErrorToast("Could not manage cast connection.");
                        }
                      }}
                      style={{
                        flex: 1,
                        padding: '14px',
                        background: castConnected ? '#ef4444' : '#ffffff',
                        border: 'none',
                        borderRadius: '14px',
                        color: castConnected ? '#ffffff' : '#000000',
                        fontSize: '0.86rem',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        boxShadow: castConnected ? '0 6px 20px rgba(239, 68, 68, 0.2)' : '0 6px 20px rgba(255, 255, 255, 0.1)',
                        transition: 'all 0.2s',
                      }}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ flexShrink: 0 }}>
                        <path d="M2 17a5 5 0 0 1 5 5" />
                        <path d="M2 12a10 10 0 0 1 10 10" />
                        <rect x="2" y="2" width="20" height="20" rx="2" strokeWidth="2" />
                      </svg>
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {castConnected ? "Stop Casting" : "Connect TV"}
                      </span>
                    </button>

                    <button
                      onClick={async () => {
                        import('../../../utils/haptics').then(m => m.triggerSuccessHaptic());
                        try {
                          await SystemCast.disconnectCast();
                          setErrorToast("Force disconnected from Chromecast.");
                        } catch (err) {
                          setErrorToast("Could not disconnect from TV.");
                        }
                      }}
                      style={{
                        padding: '14px 16px',
                        background: 'rgba(239, 68, 68, 0.12)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        borderRadius: '14px',
                        color: '#ef4444',
                        fontSize: '0.82rem',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        transition: 'all 0.2s',
                        flexShrink: 0
                      }}
                      title="Force Disconnect"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ flexShrink: 0 }}>
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Immersive Cast Toast Overlay */}
      <AnimatePresence>
        {errorToast && (
          <motion.div
            initial={{ opacity: 0, y: -30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -30, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 250 }}
            style={{
              position: 'absolute',
              top: '40px',
              left: '20px',
              right: '20px',
              margin: '0 auto',
              maxWidth: '480px',
              background: 'rgba(15, 15, 20, 0.98)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '20px',
              padding: '16px 20px',
              zIndex: 9999,
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}
          >
            <AlertCircle size={20} color="#ef4444" style={{ flexShrink: 0 }} />
            <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#fff', lineHeight: 1.4, textAlign: 'left' }}>
              {errorToast}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
      `}</style>
    </div>
  );
}
