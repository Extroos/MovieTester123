import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { isTVMode } from '../../../../utils/tv';
import Hls from 'hls.js';
import { buildNativeHlsLoader } from '../../../../services/NativeHlsLoader';

import { WatchProgressService } from '../../../../services/progress';
import type { Movie, TVShow } from '../../../../types';
import { getLocalServerUrl } from '../../../../services/LocalStreamService';
import { useOfflineDownloader } from '../../downloads/useOfflineDownloader';
import { usePlayerGestures } from './usePlayerGestures';
import { PlayerSettings, ALL_SERVERS } from './PlayerSettings';
import { PlayerControls } from './PlayerControls';
import { Capacitor, registerPlugin } from '@capacitor/core';
const NativeStreamingEngine = registerPlugin<any>('NativeStreamingEngine');
import { scrapeVidsrcFallback, scrapeVidifyStream, scrapeVidsrcPmStream, scrapeWtfStream } from '../../../../services/ClientScraperService';
import { getGateway, getRemoteServers } from '../../../../services/streaming/RemoteConfigService';
import { WatchTogetherService, type PartyParticipant, type PartySyncEvent } from '../../../../services/watchTogether';
import { supabase } from '../../../../services/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { ProfileService } from '../../../../services/profiles';
import { SettingsService } from '../../../../services/settings';

const IS_MOBILE_DEVICE = typeof window !== 'undefined' && /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

const formatTime = (seconds: number) => {
  if (!seconds || isNaN(seconds)) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const getSubtitleProxyUrl = (trackUrl: string): string => {
  if (!trackUrl || !trackUrl.startsWith('http')) return trackUrl;
  const localServer = getLocalServerUrl();
  if (localServer && localServer.trim() && localServer !== 'null' && localServer !== 'undefined') {
    return `${localServer}/local-proxy?url=${encodeURIComponent(trackUrl)}&referer=${encodeURIComponent('https://vidlink.pro/')}&origin=${encodeURIComponent('https://vidlink.pro')}`;
  }
  return `/proxy?url=${encodeURIComponent(trackUrl)}&referer=${encodeURIComponent('https://vidlink.pro/')}`;
};

const getStandardResolutionHeight = (height: number): number => {
  if (height <= 360) return 360;
  if (height <= 480) return 480;
  if (height <= 720) return 720;
  if (height <= 1080) return 1080;
  if (height <= 1440) return 1440;
  return 2160;
};

interface LocalVideoPlayerProps {
  src: string;
  title: string;
  onClose: () => void;
  onNextEpisode?: () => void;
  item?: Movie | TVShow;
  season?: number;
  episode?: number;
  tracks?: { file: string; label: string; kind: string; default?: boolean }[];
  onSourceChange?: (newSrc: string) => void;
  isOfflineMode?: boolean;
  isPartyMode?: boolean;
  partySessionId?: string | null;
  isPartyHost?: boolean;
  
  // Cast states and handlers
  isCastAvailable: boolean;
  castConnected: boolean;
  resolving: boolean;
  handleCastClick: () => Promise<void>;
  
  // Playback states shared with Cast
  playing: boolean;
  setPlaying: (playing: boolean) => void;
  currentTime: number;
  setCurrentTime: React.Dispatch<React.SetStateAction<number | ((prev: number) => number)>>;
  duration: number;
  setDuration: (duration: number) => void;
  buffering: boolean;
  setBuffering: (buffering: boolean) => void;

  // Remote Cast controls
  remotePlayerRef: React.RefObject<any>;
  remotePlayerControllerRef: React.RefObject<any>;
  startTime?: number;
  onTracksChange?: (tracks: any[]) => void;
  onSubtitleStyleChange?: (style: { size: string, color: string, opacity: number }) => void;
  onSubtitleDelayChange?: (delay: number) => void;
  subtitleDelay?: number;
  logoUrl?: string | null;
}

export default function LocalVideoPlayer({
  src,
  title,
  onClose,
  onNextEpisode,
  item,
  season,
  episode,
  tracks,
  onSourceChange,
  isOfflineMode = false,
  isPartyMode = false,
  partySessionId = null,
  isPartyHost = false,
  isCastAvailable,
  castConnected,
  resolving,
  handleCastClick,
  playing,
  setPlaying,
  currentTime,
  setCurrentTime,
  duration,
  setDuration,
  buffering,
  setBuffering,
  remotePlayerRef,
  remotePlayerControllerRef,
  startTime,
  onSubtitleStyleChange,
  onSubtitleDelayChange,
  subtitleDelay: propSubtitleDelay,
  logoUrl,
  onTracksChange,
}: LocalVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showControls, setShowControls] = useState(true);
  const showControlsRef = useRef(showControls);
  useEffect(() => {
    showControlsRef.current = showControls;
  }, [showControls]);
  const controlsTimeout = useRef<NodeJS.Timeout | null>(null);
  const lastMouseTapTimeRef = useRef<number>(0);
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const progressRef = useRef<{time: number, duration: number}>({time: 0, duration: 0});
  const hlsRef = useRef<Hls | null>(null);
  const iframeStartTimeRef = useRef<number>(startTime || 0);
  const iframeLastTickRef = useRef<number>(Date.now());
  // Throttle timeupdate → setCurrentTime calls to avoid excessive re-renders on mobile
  const lastTimeUpdateStateRef = useRef<number>(0);
  const hlsNetworkRetryCountRef = useRef<number>(0);
  const initialLoadRef = useRef<string | null>(null);
  // Ref that holds handleServerChange so the mount effect can call it before the function is declared
  const handleServerChangeRef = useRef<((serverId: string) => Promise<void>) | null>(null);

  // Audio Booster Web Audio API Refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const audioSourceRef = useRef<MediaElementAudioSourceNode | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const initAudioBooster = (videoElement: HTMLVideoElement) => {
      if (audioSourceRef.current) return;
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContextClass) return;
        
        const audioCtx = new AudioContextClass();
        const source = audioCtx.createMediaElementSource(videoElement);
        const gainNode = audioCtx.createGain();
        
        // Amplifies sound to 200% level
        gainNode.gain.value = 2.0;
        
        source.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        audioCtxRef.current = audioCtx;
        gainNodeRef.current = gainNode;
        audioSourceRef.current = source;
        
        console.log('[LocalVideoPlayer] Web Audio booster active: Gain 2.0x');
      } catch (err) {
        console.warn('[LocalVideoPlayer] AudioContext booster initiation error:', err);
      }
    };

    const handlePlayForBooster = () => {
      initAudioBooster(video);
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {});
      }
    };

    video.addEventListener('play', handlePlayForBooster);
    video.addEventListener('playing', handlePlayForBooster);
    
    return () => {
      video.removeEventListener('play', handlePlayForBooster);
      video.removeEventListener('playing', handlePlayForBooster);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, []);
  
  // Dynamic stream / server selector states
  const [currentSrc, setCurrentSrc] = useState(src);
  const [selectedServer, setSelectedServer] = useState<string>(() => {
    return 'vidsrc-pm';
  });
  const selectedServerRef = useRef(selectedServer);
  useEffect(() => {
    selectedServerRef.current = selectedServer;
  }, [selectedServer]);

  // Autofocus player container for D-Pad keyboard inputs
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.focus();
    }
  }, []);

  const [isSwitchingServer, setIsSwitchingServer] = useState(false);
  const [connectingServerName, setConnectingServerName] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const pendingSeekTimeRef = useRef<number | null>(null);
  const serverSwitchAbortControllerRef = useRef<AbortController | null>(null);
  const [useNativeLoader, setUseNativeLoader] = useState(Capacitor.isNativePlatform());

  // Premium In-Player Toast state
  const [playerToast, setPlayerToast] = useState<{ message: string; isError?: boolean } | null>(null);
  const [iframeFallback, setIframeFallback] = useState(false);
  const [embedServer, setEmbedServer] = useState<string | null>(null);
  const [remoteServers, setRemoteServers] = useState<any[]>([]);
  useEffect(() => {
    getRemoteServers().then(res => {
      if (res && res.length > 0) setRemoteServers(res);
    }).catch(() => {});
  }, []);

  const [isInitialLoading, setIsInitialLoading] = useState(true);

  // --- Real-Time Co-Watching State ---
  const [partyParticipants, setPartyParticipants] = useState<PartyParticipant[]>([]);
  
  const isGuestModeActive = localStorage.getItem('cinemovie_is_guest') === 'true';


  const partyChannelRef = useRef<RealtimeChannel | null>(null);
  const isRemoteSyncRef = useRef(false); // Prevents echo loops when receiving remote sync events
  const ignoreNextSeekedRef = useRef(false); // Prevents echo loops on received seeks/playback commands

  // Reset selected server to vidsrc-pm on mount to ensure it's always the default
  useEffect(() => {
    setSelectedServer('vidsrc-pm');
    try {
      localStorage.setItem('selected_server', 'vidsrc-pm');
    } catch (e) {}
  }, []);

  // Enforce touch boost for OPPO / ColorOS refresh rate pacing only during active video playback
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      if (playing && !isOfflineMode) {
        NativeStreamingEngine.setTouchBoostActive({ enabled: true }).catch(() => {});
      } else {
        NativeStreamingEngine.setTouchBoostActive({ enabled: false }).catch(() => {});
      }
    }
    return () => {
      if (Capacitor.isNativePlatform()) {
        NativeStreamingEngine.setTouchBoostActive({ enabled: false }).catch(() => {});
      }
    };
  }, [playing, isOfflineMode]);

  // Join the real-time sync channel when in party mode
  useEffect(() => {
    if (!isPartyMode || !partySessionId || isGuestModeActive) return;

    let cancelled = false;
    let handleVisibilityChange: (() => void) | null = null;
    let syncInterval: NodeJS.Timeout | null = null;

    const joinChannel = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || cancelled) return;

        const activeProfile = ProfileService.getActiveProfile();
        const displayName = activeProfile?.name || 'You';
        const displayAvatar = activeProfile?.avatar || undefined;

        if (cancelled) return;

        const channel = WatchTogetherService.joinSyncChannel(
          partySessionId,
          {
            id: user.id,
            name: displayName,
            avatar: displayAvatar,
            isHost: isPartyHost
          },
          // onSyncEvent — apply remote playback commands
          (event: PartySyncEvent) => {
            if (event.type === 'play') {
              isRemoteSyncRef.current = true;
              if (videoRef.current) {
                const drift = Math.abs(videoRef.current.currentTime - event.time);
                if (drift > 0.4) {
                  ignoreNextSeekedRef.current = true;
                  videoRef.current.currentTime = event.time;
                }
                videoRef.current.play().catch(() => {});
                setPlaying(true);
              }
              setPlayerToast({ message: `${event.sender === user.id ? 'You' : 'A co-watcher'} resumed playback` });
              setTimeout(() => { isRemoteSyncRef.current = false; }, 300);
            } else if (event.type === 'pause') {
              isRemoteSyncRef.current = true;
              if (videoRef.current) {
                videoRef.current.pause();
                const drift = Math.abs(videoRef.current.currentTime - event.time);
                if (drift > 0.4) {
                  ignoreNextSeekedRef.current = true;
                  videoRef.current.currentTime = event.time;
                }
                setPlaying(false);
              }
              setPlayerToast({ message: `${event.sender === user.id ? 'You' : 'A co-watcher'} paused playback` });
              setTimeout(() => { isRemoteSyncRef.current = false; }, 300);
            } else if (event.type === 'seek') {
              isRemoteSyncRef.current = true;
              if (videoRef.current) {
                const drift = Math.abs(videoRef.current.currentTime - event.time);
                if (drift > 0.4) {
                  ignoreNextSeekedRef.current = true;
                  videoRef.current.currentTime = event.time;
                  setCurrentTime(event.time);
                }
              }
              setTimeout(() => { isRemoteSyncRef.current = false; }, 300);
            } else if (event.type === 'joined') {
              setPlayerToast({ message: `${event.name} joined the watch party` });
            } else if (event.type === 'request_sync') {
              // Respond with our current playback state so the reconnected peer syncs
              if (videoRef.current && !videoRef.current.paused) {
                WatchTogetherService.broadcastSync(channel, {
                  type: 'sync_response',
                  time: videoRef.current.currentTime,
                  playing: !videoRef.current.paused,
                  sender: user.id
                });
              }
            } else if (event.type === 'sync_response') {
              isRemoteSyncRef.current = true;
              if (videoRef.current) {
                const drift = Math.abs(videoRef.current.currentTime - event.time);
                if (drift > 0.4) {
                  ignoreNextSeekedRef.current = true;
                  videoRef.current.currentTime = event.time;
                  setCurrentTime(event.time);
                }
                if (event.playing && videoRef.current.paused) {
                  videoRef.current.play().catch(() => {});
                  setPlaying(true);
                } else if (!event.playing && !videoRef.current.paused) {
                  videoRef.current.pause();
                  setPlaying(false);
                }
              }
              setTimeout(() => { isRemoteSyncRef.current = false; }, 300);
            }
          },
          // onPresenceChange — update participant list
          (participants: PartyParticipant[]) => {
            if (!cancelled) {
              setPartyParticipants(participants);
            }
          }
        );

        partyChannelRef.current = channel;

        const requestWatchPartySync = () => {
          if (partyChannelRef.current) {
            WatchTogetherService.broadcastSync(partyChannelRef.current, {
              type: 'request_sync',
              sender: user.id
            });
          }
        };

        // Wire to visibility/background changes
        handleVisibilityChange = () => {
          if (document.visibilityState === 'visible') {
            console.log('[LocalVideoPlayer] Co-watching visible - requesting sync...');
            requestWatchPartySync();
          }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        // Announce and request sync state 800ms after joining/connecting
        setTimeout(requestWatchPartySync, 800);

        // Guest periodic drift sync check interval (polls host time every 8 seconds)
        syncInterval = setInterval(() => {
          if (!isPartyHost && videoRef.current && !videoRef.current.paused) {
            requestWatchPartySync();
          }
        }, 8000);
      } catch (err) {
        console.error('[LocalVideoPlayer] Failed to join watch party channel:', err);
      }
    };

    joinChannel();

    return () => {
      cancelled = true;
      if (handleVisibilityChange) {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      if (syncInterval) {
        clearInterval(syncInterval);
      }
      WatchTogetherService.leaveChannel(partyChannelRef.current);
      partyChannelRef.current = null;
    };
  }, [isPartyMode, partySessionId]);


  useEffect(() => {
    if (playerToast) {
      const timer = setTimeout(() => setPlayerToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [playerToast]);

  // Refocus parent window/container when controls hide in iframe fallback mode,
  // so that the next user click/tap inside the iframe will trigger a blur event and show controls.
  useEffect(() => {
    if ((iframeFallback || !!embedServer) && !showControls) {
      window.focus();
      if (containerRef.current) {
        containerRef.current.focus();
      }
    }
  }, [showControls, iframeFallback, embedServer]);

  // Listen for focus moving to the iframe player (window blur event)
  useEffect(() => {
    if (!(iframeFallback || !!embedServer)) return;

    const handleWindowBlur = () => {
      setTimeout(() => {
        if (document.activeElement && document.activeElement.tagName === 'IFRAME') {
          setShowControls(true);
        }
      }, 100);
    };

    window.addEventListener('blur', handleWindowBlur);
    return () => {
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [iframeFallback, embedServer]);

  const {
    isDownloading,
    downloadProgress,
    downloadStatus,
    handleDownloadOffline,
    handleCancelDownload
  } = useOfflineDownloader({
    currentSrc,
    season,
    episode,
    item,
    iframeFallback
  });

  // On mount: immediately resolve a fresh stream (never reuse a cached/expired src URL).
  // Offline mode (downloaded files) is exempt — local files never expire.
  const freshResolveMountedRef = useRef(false);
  useEffect(() => {
    if (isOfflineMode) {
      // Offline: use the provided local src directly, it never expires
      setCurrentSrc(src);
      freshResolveMountedRef.current = true;
      return;
    }
    // Online: always fetch a fresh link. Don't play the stale src prop.
    // handleServerChange will be ready by the time this runs (it's a ref call)
    const doFreshResolve = async () => {
      if (handleServerChangeRef.current) {
        console.log('[LocalVideoPlayer] Mount: resolving fresh stream (ignoring potentially-expired src prop)...');
        await handleServerChangeRef.current(selectedServerRef.current || 'vidsrc-pm');
      } else {
        // Fallback: if ref not yet set, use src
        setCurrentSrc(src);
      }
      freshResolveMountedRef.current = true;
    };
    doFreshResolve();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setUseNativeLoader(false);
  }, [currentSrc]);

  useEffect(() => {
    const handleProgressMessage = (event: MessageEvent) => {
      if (!event.origin.includes('vidsrc.wtf')) return;
      if (event.data?.type === "MEDIA_DATA") {
        const mediaData = event.data.data;
        if (mediaData && mediaData.progress && item) {
          const watched = parseFloat(mediaData.progress.watched);
          const duration = parseFloat(mediaData.progress.duration);
          if (!isNaN(watched) && !isNaN(duration) && duration > 0) {
            console.log(`[Player WTF Progress] Synced progress: ${watched}/${duration}`);
            WatchProgressService.saveProgress(item, watched, duration, season, episode);
          }
        }
      }
    };

    window.addEventListener("message", handleProgressMessage);
    return () => window.removeEventListener("message", handleProgressMessage);
  }, [item, season, episode]);

  const SERVER_DISPLAY_NAMES: Record<string, string> = ALL_SERVERS.reduce((acc, s) => {
    acc[s.id] = s.name;
    return acc;
  }, {
    'vidsrc-pm': 'VidSrc PM (.m3u8)',
    'universal': 'Universal Player (.m3u8)'
  } as Record<string, string>);


  const handleCancelServerSwitch = () => {
    if (serverSwitchAbortControllerRef.current) {
      serverSwitchAbortControllerRef.current.abort();
      serverSwitchAbortControllerRef.current = null;
    }
    setIsSwitchingServer(false);
    setConnectingServerName(null);
    setServerError(null);
    setShowSettings(true);
  };

  const handleServerChange = async (serverId: string) => {

    if (isOfflineMode || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      setPlayerToast({ message: 'You are offline. Server switching is not available.', isError: true });
      return;
    }

    if (serverSwitchAbortControllerRef.current) {
      serverSwitchAbortControllerRef.current.abort();
    }

    const controller = new AbortController();
    serverSwitchAbortControllerRef.current = controller;

    const timeoutId = setTimeout(() => {
      console.warn(`[LocalVideoPlayer] Server switch to ${serverId} timed out. Aborting.`);
      controller.abort();
    }, 20000);

    import('../../../../utils/haptics').then(m => m.triggerHaptic('medium'));
    setSelectedServer(serverId);
    try {
      localStorage.setItem('selected_server', serverId);
    } catch(e) {}
    setIframeFallback(false);
    setEmbedServer(null);


    setIsSwitchingServer(true);
    setConnectingServerName(SERVER_DISPLAY_NAMES[serverId] || serverId);
    setServerError(null);
    setVidlinkDiagnostics(null);
    setVidsrcPmDiagnostics(null);
    setTestServerDiagnostics(null);
    setShowSettings(false);
    setCurrentSrc("");

    // Clear current quality and available sources on server change to prevent leaks/flashes
    setQualities([]);
    setCurrentQuality(-1);
    setAvailableSources([]);
    setServerQualities(prev => ({ ...prev, [serverId]: [] }));
    setServerCurrentQuality(prev => ({ ...prev, [serverId]: -1 }));
    setServerAvailableSources(prev => ({ ...prev, [serverId]: [] }));


    const savedTime = videoRef.current ? videoRef.current.currentTime : currentTime;
    pendingSeekTimeRef.current = savedTime > 5 ? savedTime : null;

    if (videoRef.current) {
      videoRef.current.pause();
      // Force disable any native parsed text track modes
      if (videoRef.current.textTracks) {
        for (let i = 0; i < videoRef.current.textTracks.length; i++) {
          videoRef.current.textTracks[i].mode = 'disabled';
        }
      }
      videoRef.current.removeAttribute('src');
      videoRef.current.load();
    }
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    setPlaying(false);
    setBuffering(false);
    
    try {
      const isTV = !!season || !!episode;
      const type = isTV ? 'tv' : 'movie';
      const tmdbId = item?.id;
      if (!tmdbId) throw new Error('Missing TMDb ID');
      
      const localServer = getLocalServerUrl();
      const titleToUse = (item as any)?.title || (item as any)?.name || '';
      
      let data = null;
      let bestSource = null;

      // On native mobile, dispatch to the correct native resolver
      if (Capacitor.isNativePlatform()) {
        const srv = (remoteServers.length > 0 ? remoteServers : ALL_SERVERS).find(s => s.id === serverId);
        const isIframeSrv = srv ? !srv.isAdFree : (serverId !== 'vidlink-pro' && serverId !== 'vidsrc-pm' && serverId !== 'vidsrc-sbs' && serverId !== 'vidzee');
        if (isIframeSrv) {
          setIframeFallback(true);
          setEmbedServer(serverId);
          setIsInitialLoading(false);
          setIsSwitchingServer(false);
          setShowSettings(false);
          resetControlsTimeout();
          return;
        } else if (serverId === 'vidsrc-pm') {
          console.log(`[LocalVideoPlayer] Resolving VidSrc PM natively on Android...`);
          const nativeRes = await NativeStreamingEngine.resolveVidsrcPm({
            tmdbId: String(tmdbId),
            imdbId: (item as any)?.imdbId || (item as any)?.imdb_id || '',
            type: type,
            season: season,
            episode: episode
          });
          data = {
            sources: (nativeRes.sources || []).map((s: any) => ({
              url: s.url,
              quality: s.quality || 'auto',
              isM3U8: s.isM3U8
            })),
            subtitles: (nativeRes.subtitles || []).map((s: any) => ({
              url: s.url,
              lang: s.lang || 'Unknown',
              isBackup: !!s.isBackup
            }))
          };
          setVidsrcPmDiagnostics('Success: resolved stream sources successfully.');
        } else if (serverId === 'vidsrc-wtf-2') {
          console.log(`[LocalVideoPlayer] Resolving WTF-2 stream client-side in WebView...`);
          const decrypted = await scrapeWtfStream(
            String(tmdbId),
            'wtf-2',
            null,
            isTV,
            season,
            episode
          );
          if (decrypted && decrypted.ok && decrypted.data?.streams && decrypted.data.streams.length > 0) {
            const sources = decrypted.data.streams.map((stream: any, idx: number) => {
              const ref = stream.headers?.Referer || 'https://vidsrc.wtf/';
              const origin = new URL(stream.url).origin;
              const proxiedUrl = `http://localhost:8000/local-proxy?url=${encodeURIComponent(stream.url)}&referer=${encodeURIComponent(ref)}&origin=${encodeURIComponent(origin)}`;
              return {
                url: proxiedUrl,
                quality: stream.language || `Stream ${idx + 1}`,
                isM3U8: stream.type === 'hls' || stream.url.includes('.m3u8')
              };
            });
            data = {
              sources: sources,
              subtitles: []
            };
          } else {
            throw new Error("No streams found in Multi Language response");
          }
        } else {
          // vidlink-pro native resolution
          console.log(`[LocalVideoPlayer] Resolving Vidlink S${season}E${episode} natively on Android...`);
          const nativeRes = await NativeStreamingEngine.resolveVidlink({
            tmdbId: String(tmdbId),
            imdbId: (item as any)?.imdbId || (item as any)?.imdb_id || '',
            type: type,
            season: season,
            episode: episode
          });
          data = {
            sources: (nativeRes.sources || []).map((s: any) => ({
              url: s.url,
              quality: s.quality || 'auto',
              isM3U8: s.isM3U8
            })),
            subtitles: (nativeRes.subtitles || []).map((s: any) => ({
              url: s.url,
              lang: s.lang || 'Unknown',
              isBackup: !!s.isBackup
            }))
          };
          setVidlinkDiagnostics('Success: resolved stream sources successfully.');
        }
      } else {
        const srv = (remoteServers.length > 0 ? remoteServers : ALL_SERVERS).find(s => s.id === serverId);
        const isIframeSrv = srv ? !srv.isAdFree : (serverId !== 'vidlink-pro' && serverId !== 'vidsrc-pm' && serverId !== 'vidsrc-sbs' && serverId !== 'vidzee');
        if (isIframeSrv) {
          setIframeFallback(true);
          setEmbedServer(serverId);
          setIsInitialLoading(false);
          setIsSwitchingServer(false);
          setShowSettings(false);
          resetControlsTimeout();
          return;
        }
        // On web/desktop, route through the Express server proxy.
        let watchUrl = `${localServer}/meta/tmdb/watch/${tmdbId}?type=${type}&server=${serverId}&title=${encodeURIComponent(titleToUse)}`;
        if (isTV) {
          watchUrl += `&s=${season}&e=${episode}`;
        }
        
        console.log('[LocalVideoPlayer] Requesting server switch via Express:', watchUrl);
        let res;
        try {
          res = await fetch(watchUrl, { signal: controller.signal });
        } catch (fetchErr: any) {
          setVidlinkDiagnostics(`Failed to connect to local server: ${fetchErr.message}`);
          throw fetchErr;
        }
  
        if (res.ok) {
          data = await res.json();
          bestSource = data.sources?.[0]?.url;
          if (serverId === 'vidsrc-pm') {
            setVidsrcPmDiagnostics('Success: Resolved stream sources via localized server.');
          } else {
            setVidlinkDiagnostics('Success: Resolved stream sources via localized server.');
          }

          if (data.sources && Array.isArray(data.sources) && data.sources.length > 0) {
            setAvailableSources(data.sources);
            setServerAvailableSources(prev => ({ ...prev, [serverId]: data.sources }));
            if (data.sources.length > 1 || !data.sources[0].isM3U8) {
              const directQualities = data.sources.map((s: any, idx: number) => {
                const parsed = parseInt(s.quality);
                const isHeight = !isNaN(parsed);
                const normHeight = isHeight ? getStandardResolutionHeight(parsed) : undefined;
                return {
                  height: normHeight,
                  label: isHeight ? `${normHeight}p` : (s.quality || `Source ${idx + 1}`),
                  index: idx
                };
              });
              // Only sort by height for numeric quality levels; language labels keep server order
              const hasNumericQualities = directQualities.some(q => q.height !== undefined);
              if (hasNumericQualities) {
                directQualities.sort((a, b) => (a.height ?? 0) - (b.height ?? 0));
              }
              setQualities(directQualities);
              setServerQualities(prev => ({ ...prev, [serverId]: directQualities }));

              // Auto-select the user's preferred audio language if present
              const { SettingsService } = await import('../../../../services/settings');
              const preferred = SettingsService.get('preferredAudioLanguage');
              if (preferred) {
                const preferredIdx = data.sources.findIndex((s: any) =>
                  (s.quality || '').toLowerCase().includes(preferred.toLowerCase())
                );
                if (preferredIdx !== -1) {
                  setCurrentQuality(preferredIdx);
                  setServerCurrentQuality(prev => ({ ...prev, [serverId]: preferredIdx }));
                  bestSource = data.sources[preferredIdx].url;
                } else {
                  setCurrentQuality(-1);
                  setServerCurrentQuality(prev => ({ ...prev, [serverId]: -1 }));
                }
              } else {
                setCurrentQuality(-1);
                setServerCurrentQuality(prev => ({ ...prev, [serverId]: -1 }));
              }
            } else {
              setQualities([]);
              setServerQualities(prev => ({ ...prev, [serverId]: [] }));
              setCurrentQuality(-1);
              setServerCurrentQuality(prev => ({ ...prev, [serverId]: -1 }));
            }
          }
        } else {
          let errText = '';
          try { errText = await res.text(); } catch (_) {}
          let parsedMsg = '';
          try {
            const parsed = JSON.parse(errText);
            parsedMsg = parsed.message || parsed.error || errText;
          } catch (_) {
            parsedMsg = errText;
          }
          const finalErrMsg = parsedMsg ? `Server HTTP ${res.status}: ${parsedMsg}` : `Server HTTP ${res.status}`;
          if (serverId === 'vidsrc-pm') {
            setVidsrcPmDiagnostics(finalErrMsg);
          } else {
            setVidlinkDiagnostics(finalErrMsg);
          }
          throw new Error(finalErrMsg);
        }
      }

      // On native path, bestSource is not set inside the if/else branches — set it here from data
      if (!bestSource && data?.sources?.[0]?.url) {
        bestSource = data.sources[0].url;
        // Mirror the web path: build qualities and auto-select preferred language
        if (data.sources && Array.isArray(data.sources) && data.sources.length > 0) {
          setAvailableSources(data.sources);
          setServerAvailableSources(prev => ({ ...prev, [serverId]: data.sources }));

          if (data.sources.length > 1 || !data.sources[0].isM3U8) {
            const directQualities = data.sources.map((s: any, idx: number) => {
              const parsed = parseInt(s.quality);
              const isHeight = !isNaN(parsed);
              const normHeight = isHeight ? getStandardResolutionHeight(parsed) : undefined;
              return {
                height: normHeight,
                label: isHeight ? `${normHeight}p` : (s.quality || `Source ${idx + 1}`),
                index: idx
              };
            });
            // Only sort by height for numeric quality levels; language labels keep server order
            const hasNumericQualities = directQualities.some(q => q.height !== undefined);
            if (hasNumericQualities) {
              directQualities.sort((a, b) => (a.height ?? 0) - (b.height ?? 0));
            }
            setQualities(directQualities);
            setServerQualities(prev => ({ ...prev, [serverId]: directQualities }));

            // Auto-select the user's preferred audio language if present
            try {
              const { SettingsService } = await import('../../../../services/settings');
              const preferred = SettingsService.get('preferredAudioLanguage');
              if (preferred) {
                const preferredIdx = data.sources.findIndex((s: any) =>
                  (s.quality || '').toLowerCase().includes(preferred.toLowerCase())
                );
                if (preferredIdx !== -1) {
                  bestSource = data.sources[preferredIdx].url;
                  setCurrentQuality(preferredIdx);
                  setServerCurrentQuality(prev => ({ ...prev, [serverId]: preferredIdx }));
                } else {
                  setCurrentQuality(-1);
                  setServerCurrentQuality(prev => ({ ...prev, [serverId]: -1 }));
                }
              } else {
                setCurrentQuality(-1);
                setServerCurrentQuality(prev => ({ ...prev, [serverId]: -1 }));
              }
            } catch (_) {
              setCurrentQuality(-1);
              setServerCurrentQuality(prev => ({ ...prev, [serverId]: -1 }));
            }
          }
        }
      }

      if (!bestSource) {
        throw new Error('No streaming sources found. The server may be temporarily unavailable.');
      }

      let finalSrc = bestSource;
      const isExternal = bestSource.startsWith('http') && !bestSource.includes('localhost') && !bestSource.includes('127.0.0.1') && !bestSource.includes('local-proxy');
      
      if (isExternal) {
        let refToUse = 'https://vidlink.pro/';
        let origToUse = 'https://vidlink.pro';
        try {
          const parsed = new URL(bestSource);
          const origRef = parsed.searchParams.get('origin_referer') || parsed.searchParams.get('referer');
          if (origRef) {
            refToUse = origRef;
            const parsedRef = new URL(origRef);
            origToUse = parsedRef.origin;
          }
        } catch (e) {}

        if (Capacitor.isNativePlatform()) {
          // Standalone mobile APK routes through Cloud Proxy to inject headers and bypass CORS/referer blocks
          const cloudProxy = 'https://cinemovie-proxy.abderrahmanchakkouri.workers.dev';
          finalSrc = `${cloudProxy}/local-proxy?url=${encodeURIComponent(bestSource)}&referer=${encodeURIComponent(refToUse)}&origin=${encodeURIComponent(origToUse)}`;
        } else {
          // PC Web routes through local Node server proxy
          const localServer = getLocalServerUrl();
          finalSrc = `${localServer}/local-proxy?url=${encodeURIComponent(bestSource)}&referer=${encodeURIComponent(refToUse)}&origin=${encodeURIComponent(origToUse)}`;
        }
      }

      console.log('[LocalVideoPlayer] Successfully resolved server stream:', finalSrc);
      setCurrentSrc(finalSrc);
      if (onSourceChange) {
        onSourceChange(finalSrc);
      }
      
      if (data.subtitles && Array.isArray(data.subtitles) && data.subtitles.length > 0) {
        const newTracks = data.subtitles.map((sub: any) => ({
          file: sub.url,
          label: sub.label || sub.lang || 'Unknown',
          kind: 'subtitles',
          default: (sub.lang || '').toLowerCase().includes('english') && !sub.isBackup,
          isBackup: !!sub.isBackup
        }));
        const defaultIndex = newTracks.findIndex((t: any) => t.default);
        setServerSubtitleTracks(prev => ({
          ...prev,
          [serverId]: newTracks
        }));
        setServerActiveTrackIndices(prev => ({
          ...prev,
          [serverId]: defaultIndex !== -1 ? defaultIndex : -1
        }));
      } else {
        const imdbId = (item as any)?.imdbId || (item as any)?.imdb_id;
        if (type === 'movie' && imdbId) {
          // Fetch YTS subtitles asynchronously in the background so it doesn't block player initialization
          (async () => {
            try {
              console.log('[LocalVideoPlayer] Server returned empty subtitles. Fetching YTS subtitles automatically in background...');
              const ytsUrl = `${localServer}/movies/yts-subtitles/${imdbId}`;
              const ytsRes = await fetch(ytsUrl);
              if (ytsRes.ok) {
                const ytsSubs = await ytsRes.json();
                if (Array.isArray(ytsSubs) && ytsSubs.length > 0) {
                  const newTracks = ytsSubs.map((sub: any) => ({
                    file: `${localServer}/movies/yts-subtitles/download?link=${encodeURIComponent(sub.link)}`,
                    label: `${sub.language} (Auto YTS)`,
                    kind: 'subtitles',
                    default: sub.language.toLowerCase().includes('english')
                  }));
                  const defaultIndex = newTracks.findIndex((t: any) => t.default);
                  setServerSubtitleTracks(prev => ({
                    ...prev,
                    [serverId]: newTracks
                  }));
                  setServerActiveTrackIndices(prev => ({
                    ...prev,
                    [serverId]: defaultIndex !== -1 ? defaultIndex : -1
                  }));
                  console.log(`[LocalVideoPlayer] Auto-loaded ${newTracks.length} fallback YTS subtitles in background`);
                }
              }
            } catch (e) {
              console.warn('[LocalVideoPlayer] Failed to auto-fetch YTS subtitles in background:', e);
            }
          })();
        }
      }
      
      setShowSettings(false);
      resetControlsTimeout();
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.warn('[LocalVideoPlayer] Server switch fetch timed out or was aborted.');
        const msg = 'Connection timed out. The streaming server is taking too long to respond.';
        setServerError(msg);
        if (serverId === 'vidsrc-pm') setVidsrcPmDiagnostics(msg); else setVidlinkDiagnostics(msg);
      } else {
        console.error('[LocalVideoPlayer] Failed to switch server:', err);
        setServerError(err.message || 'Resolution failed. Please try again.');
        if (serverId === 'vidsrc-pm') setVidsrcPmDiagnostics(err.message || 'Resolution failed.'); else setVidlinkDiagnostics(err.message || 'Resolution failed.');
      }
      setSettingsTab('servers');
      setShowSettings(true);
      setIsInitialLoading(false);
      setIsSwitchingServer(false);
    } finally {
      clearTimeout(timeoutId);
      setIsSwitchingServer(false);
      setConnectingServerName(null);
    }
  };

  // Wire ref so the mount effect (defined before this function) can call it
  handleServerChangeRef.current = handleServerChange;

  const triggerAutoFailover = () => {
    if (isOfflineMode || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      setPlayerToast({ message: 'Playback failed. You are currently offline.', isError: true });
      return;
    }
    
    if (selectedServer === 'vidlink-pro') {
      setPlayerToast({
        message: 'Vidlink stream failed. Switching to VidSrc PM automatically...',
        isError: false
      });
      console.log('[LocalVideoPlayer] Direct stream load failed. Performing auto-failover to VidSrc PM...');
      handleServerChange('vidsrc-pm');
    } else {
      setPlayerToast({
        message: 'Stream failed to load. Please try another server.',
        isError: true
      });
      setServerError('Stream failed to load. Please try again.');
      setShowSettings(true);
      setSettingsTab('servers');
    }
  };

  const [qualities, setQualities] = useState<{height: number, index: number}[]>([]);
  const [currentQuality, setCurrentQuality] = useState(-1);
  const [availableSources, setAvailableSources] = useState<{url: string; quality: string; isM3U8: boolean}[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'quality' | 'subtitles' | 'speed' | 'servers' | 'download' | 'diagnostics'>(isOfflineMode ? 'subtitles' : 'servers');
  const [localTracks, setLocalTracks] = useState<{ file: string; label: string; kind: string; default?: boolean }[]>([]);
  const [activeTrackIndex, setActiveTrackIndex] = useState<number>(-1);
  const [loadingSubtitleIndex, setLoadingSubtitleIndex] = useState<number | null>(null);
  const [subtitleError, setSubtitleError] = useState<string | null>(null);
  const [lastAttemptedTrack, setLastAttemptedTrack] = useState<{ file: string; label: string; kind: string; default?: boolean } | null>(null);
  const [vidlinkDiagnostics, setVidlinkDiagnostics] = useState<string | null>(null);
  const [vidsrcPmDiagnostics, setVidsrcPmDiagnostics] = useState<string | null>(null);
  const [testServerDiagnostics, setTestServerDiagnostics] = useState<string | null>(null);

  // Server subtitle settings memory
  const [serverSubtitleTracks, setServerSubtitleTracks] = useState<Record<string, { file: string; label: string; kind: string; default?: boolean }[]>>({
    'vidlink-pro': [],
    'vidsrc-pm': []
  });
  const [serverActiveTrackIndices, setServerActiveTrackIndices] = useState<Record<string, number>>({
    'vidlink-pro': -1,
    'vidsrc-pm': -1
  });

  // Server qualities and sources memory
  const [serverQualities, setServerQualities] = useState<Record<string, {height: number, index: number}[]>>({
    'vidlink-pro': [],
    'vidsrc-pm': []
  });
  const [serverCurrentQuality, setServerCurrentQuality] = useState<Record<string, number>>({
    'vidlink-pro': -1,
    'vidsrc-pm': -1
  });
  const [serverAvailableSources, setServerAvailableSources] = useState<Record<string, {url: string; quality: string; isM3U8: boolean}[]>>({
    'vidlink-pro': [],
    'vidsrc-pm': []
  });

  // Synchronize server-isolated settings to local active states on server switch
  useEffect(() => {
    const currentServerQualities = serverQualities[selectedServer] || [];
    const currentServerQuality = serverCurrentQuality[selectedServer] ?? -1;
    const currentServerSources = serverAvailableSources[selectedServer] || [];
    setQualities(currentServerQualities);
    setCurrentQuality(currentServerQuality);
    setAvailableSources(currentServerSources);
  }, [selectedServer, serverQualities, serverCurrentQuality, serverAvailableSources]);


  // Subtitle styling customizations
  const [subtitleSize, setSubtitleSize] = useState<'small' | 'normal' | 'large' | 'xlarge'>(() => {
    const s = SettingsService.get('subtitleSize');
    if (s === 'medium') return 'normal';
    return (s as any) || 'normal';
  });
  const [subtitleColor, setSubtitleColor] = useState<string>(
    () => SettingsService.get('subtitleColor') || '#ffffff'
  );
  const [subtitleBgOpacity, setSubtitleBgOpacity] = useState<number>(
    () => {
      const v = SettingsService.get('subtitleBgOpacity');
      return v !== undefined ? v : 0.6;
    }
  );
  const [subtitleDelay, setSubtitleDelay] = useState<number>(
    () => {
      const saved = localStorage.getItem('cinemovie_subtitle_delay');
      return saved !== null ? parseFloat(saved) : 0;
    }
  );
  const [subtitlePosition, setSubtitlePosition] = useState<number>(
    () => {
      const saved = localStorage.getItem('cinemovie_subtitle_position');
      return saved !== null ? parseFloat(saved) : -40;
    }
  );

  useEffect(() => {
    const handleSettingsChange = (e: any) => {
      const { key, value } = e.detail || {};
      if (key === 'subtitleSize') {
        setSubtitleSize(value === 'medium' ? 'normal' : value);
      } else if (key === 'subtitleColor') {
        setSubtitleColor(value);
      } else if (key === 'subtitleBgOpacity') {
        setSubtitleBgOpacity(value);
      }
    };
    window.addEventListener('settingsChanged', handleSettingsChange);
    return () => window.removeEventListener('settingsChanged', handleSettingsChange);
  }, []);

  useEffect(() => {
    localStorage.setItem('cinemovie_subtitle_size', subtitleSize);
    const settingsVal = subtitleSize === 'normal' ? 'medium' : subtitleSize;
    if (SettingsService.get('subtitleSize') !== settingsVal) {
      SettingsService.set('subtitleSize', settingsVal as any);
    }
  }, [subtitleSize]);

  useEffect(() => {
    localStorage.setItem('cinemovie_subtitle_color', subtitleColor);
    if (SettingsService.get('subtitleColor') !== subtitleColor) {
      SettingsService.set('subtitleColor', subtitleColor);
    }
  }, [subtitleColor]);

  useEffect(() => {
    localStorage.setItem('cinemovie_subtitle_bg_opacity', String(subtitleBgOpacity));
    if (SettingsService.get('subtitleBgOpacity') !== subtitleBgOpacity) {
      SettingsService.set('subtitleBgOpacity', subtitleBgOpacity);
    }
  }, [subtitleBgOpacity]);

  useEffect(() => {
    localStorage.setItem('cinemovie_subtitle_delay', String(subtitleDelay));
  }, [subtitleDelay]);

  useEffect(() => {
    localStorage.setItem('cinemovie_subtitle_position', String(subtitlePosition));
  }, [subtitlePosition]);

  const forceSubtitleRedraw = () => {
    const video = videoRef.current;
    if (!video) return;
    const trackElement = video.querySelector('track');
    const track = trackElement ? trackElement.track : null;
    if (track) {
      const currentMode = track.mode;
      track.mode = 'hidden';
      requestAnimationFrame(() => {
        if (videoRef.current) {
          track.mode = currentMode;
        }
      });
    }
    if (video.textTracks && video.textTracks.length > 0) {
      for (let i = 0; i < video.textTracks.length; i++) {
        const textTrack = video.textTracks[i];
        if (textTrack.mode === 'showing') {
          textTrack.mode = 'hidden';
          (function(t) {
            requestAnimationFrame(() => {
              t.mode = 'showing';
            });
          })(textTrack);
        }
      }
    }
  };

  // Synchronize CSS custom properties to documentElement so video::cue can resolve them globally
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--subtitle-bg-opacity', String(subtitleBgOpacity));
    root.style.setProperty('--subtitle-color', subtitleColor);
    root.style.setProperty('--subtitle-font-size', 
      subtitleSize === 'small' ? '0.9rem' : 
      subtitleSize === 'normal' ? '1.1rem' : 
      subtitleSize === 'large' ? '1.3rem' : '1.6rem'
    );
    root.style.setProperty('--subtitle-position', `${subtitlePosition - (showControls ? 85 : 0)}px`);
    // Only force subtitle redraw when actual subtitle style settings change,
    // not when showControls toggles — the redraw is expensive on Android WebView.
  }, [subtitleBgOpacity, subtitleColor, subtitleSize, subtitlePosition, showControls]);

  // Separate effect for subtitle redraw only when subtitle *style* props change
  useEffect(() => {
    forceSubtitleRedraw();
  }, [subtitleBgOpacity, subtitleColor, subtitleSize, subtitlePosition]);

  useEffect(() => {
    if (onSubtitleStyleChange) {
      onSubtitleStyleChange({
        size: subtitleSize,
        color: subtitleColor,
        opacity: subtitleBgOpacity
      });
    }
  }, [subtitleSize, subtitleColor, subtitleBgOpacity, onSubtitleStyleChange]);

  useEffect(() => {
    if (onSubtitleDelayChange) {
      onSubtitleDelayChange(subtitleDelay);
    }
  }, [subtitleDelay, onSubtitleDelayChange]);

  const applySubtitleDelay = (delay: number) => {
    const video = videoRef.current;
    if (!video) return;
    const trackElement = video.querySelector('track');
    const track = trackElement ? trackElement.track : null;
    if (!track || !track.cues) return;
    
    for (let i = 0; i < track.cues.length; i++) {
      const cue = track.cues[i] as any;
      if (cue._origStart === undefined) {
        cue._origStart = cue.startTime;
        cue._origEnd = cue.endTime;
      }
      cue.startTime = cue._origStart + delay;
      cue.endTime = cue._origEnd + delay;
    }
  };

  useEffect(() => {
    applySubtitleDelay(subtitleDelay);
  }, [subtitleDelay, activeTrackIndex]);

  useEffect(() => {
    const currentServerTracks = serverSubtitleTracks[selectedServer] || [];
    const currentServerActiveIndex = serverActiveTrackIndices[selectedServer] ?? -1;
    setLocalTracks(currentServerTracks);
    setActiveTrackIndex(currentServerActiveIndex);
  }, [selectedServer, serverSubtitleTracks, serverActiveTrackIndices]);

  useEffect(() => {
    const initTracks = async () => {
      const servers: ('vidlink-pro' | 'test-server' | 'vidsrc-sbs' | 'vidsrc-wtf-1' | 'vidsrc-wtf-2' | 'vidsrc-wtf-3' | 'vidsrc-wtf-4' | 'vidsrc-pk' | 'vidsrc-fyi' | 'vidzee' | 'vidsrc-top')[] = [
        'vidlink-pro', 'test-server', 'vidsrc-sbs', 'vidsrc-wtf-1', 'vidsrc-wtf-2', 'vidsrc-wtf-3', 'vidsrc-wtf-4', 'vidsrc-pk', 'vidsrc-fyi', 'vidzee', 'vidsrc-top'
      ];
      if (tracks && tracks.length > 0) {
        const defaultIndex = tracks.findIndex(t => t.default);
        const tracksObj: Record<string, typeof tracks> = {};
        const indicesObj: Record<string, number> = {};
        servers.forEach(s => {
          tracksObj[s] = tracks;
          indicesObj[s] = defaultIndex !== -1 ? defaultIndex : -1;
        });
        setServerSubtitleTracks(prev => ({
          ...prev,
          ...tracksObj
        }));
        setServerActiveTrackIndices(prev => ({
          ...prev,
          ...indicesObj
        }));
      } else {
        const tracksObj: Record<string, any[]> = {};
        const indicesObj: Record<string, number> = {};
        servers.forEach(s => {
          tracksObj[s] = [];
          indicesObj[s] = -1;
        });
        setServerSubtitleTracks(prev => ({
          ...prev,
          ...tracksObj
        }));
        setServerActiveTrackIndices(prev => ({
          ...prev,
          ...indicesObj
        }));
      }
    };
    
    initTracks();
  }, [tracks]);

  const getLangCodeForSearch = (preferredSub: string): string => {
    const normalized = preferredSub.toLowerCase().trim();
    const directMatch = LANGUAGES.find(l => l.code === normalized || l.name.toLowerCase() === normalized);
    if (directMatch) return directMatch.code;
    const subMatch = LANGUAGES.find(l => normalized.includes(l.name.toLowerCase()) || l.name.toLowerCase().includes(normalized));
    if (subMatch) return subMatch.code;
    if (normalized.startsWith('en')) return 'en';
    if (normalized.startsWith('es') || normalized.includes('span')) return 'es';
    if (normalized.startsWith('fr') || normalized.includes('fren')) return 'fr';
    if (normalized.startsWith('ar')) return 'ar';
    if (normalized.startsWith('pt') || normalized.includes('port')) return 'pt';
    if (normalized.startsWith('de') || normalized.includes('germ')) return 'de';
    if (normalized.startsWith('it') || normalized.includes('ital')) return 'it';
    if (normalized.startsWith('ru') || normalized.includes('russ')) return 'ru';
    if (normalized.startsWith('zh') || normalized.includes('chin')) return 'zh';
    if (normalized.startsWith('tr') || normalized.includes('turk')) return 'tr';
    return 'en';
  };

  const autoSearchAttemptedRef = useRef<Record<string, boolean>>({});

  // Auto-apply saved preferred subtitle or search it online
  useEffect(() => {
    const preferredSub = localStorage.getItem('cinemovie_preferred_subtitle_lang');
    if (!preferredSub || preferredSub === 'none') return;

    if (localTracks.length > 0) {
      const preferredIndex = localTracks.findIndex(t => 
        t.label && (
          t.label.toLowerCase() === preferredSub.toLowerCase() ||
          t.label.toLowerCase().includes(preferredSub.toLowerCase()) ||
          preferredSub.toLowerCase().includes(t.label.toLowerCase()) ||
          (preferredSub.toLowerCase() === 'en' && t.label.toLowerCase().startsWith('en')) ||
          (preferredSub.toLowerCase().startsWith('en') && t.label.toLowerCase() === 'english')
        )
      );

      if (preferredIndex !== -1) {
        const track = localTracks[preferredIndex];
        const isBlob = track.file.startsWith('blob:');
        if (preferredIndex !== activeTrackIndex || !isBlob) {
          console.log(`[LocalVideoPlayer] Automatically selecting preferred subtitle track: ${track.label}`);
          handleTrackSelect(preferredIndex);
        }
        return; // Found and selected a local track, no need to query online
      }
    }

    if (!isOfflineMode) {
      const autoSearchKey = `${item?.id}_${preferredSub}`;
      if (autoSearchAttemptedRef.current[autoSearchKey]) return;
      autoSearchAttemptedRef.current[autoSearchKey] = true;

      console.log(`[LocalVideoPlayer] Preferred subtitle "${preferredSub}" not found in local tracks or local tracks is empty. Triggering online search...`);
      const searchLangCode = getLangCodeForSearch(preferredSub);
      
      const isTV = !!season || !!episode;
      let provider: 'yify' | 'opensubtitles' | 'subdl' = 'yify';
      if (isTV) {
        provider = subdlKey.trim() ? 'subdl' : 'opensubtitles';
      } else {
        provider = subdlKey.trim() ? 'subdl' : 'yify';
      }

      setSearchLang(searchLangCode);
      setOnlineProvider(provider);

      handleOnlineSubtitleSearch(provider, searchLangCode).then((results) => {
        if (results && Array.isArray(results) && results.length > 0) {
          // Auto-download the first/best subtitle result
          console.log(`[LocalVideoPlayer] Auto-downloading best matching online subtitle from ${provider}:`, results[0]);
          handleOnlineSubtitleDownload(results[0], provider, searchLangCode);
        } else {
          console.log(`[LocalVideoPlayer] No online subtitles found automatically for: ${preferredSub}`);
        }
      });
    }
  }, [localTracks]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !video.textTracks) return;

    const syncTracks = () => {
      const textTracks = video.textTracks;
      const trackElement = video.querySelector('track');
      const sideLoadedTrack = trackElement ? trackElement.track : null;

      // Disable/hide any text track that doesn't correspond to the currently active sideloaded track file
      const currentActiveTrack = localTracks[activeTrackIndex];
      for (let i = 0; i < textTracks.length; i++) {
        const textTrack = textTracks[i];
        if (sideLoadedTrack && textTrack === sideLoadedTrack && currentActiveTrack) {
          textTrack.mode = 'showing';
        } else {
          textTrack.mode = 'hidden';
        }
      }
    };

    syncTracks();
    const timer = setTimeout(syncTracks, 100);
    return () => clearTimeout(timer);
  }, [localTracks, activeTrackIndex, selectedServer]);

  const convertSrtToVtt = (srtText: string): string => {
    let vtt = srtText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    if (!vtt.trim().startsWith('WEBVTT')) {
      vtt = 'WEBVTT\n\n' + vtt;
    }
    vtt = vtt.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
    return vtt;
  };

  const handleCustomSubtitleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    import('../../../../utils/haptics').then(m => m.triggerHaptic('medium'));
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      let vttContent = text;
      
      if (file.name.toLowerCase().endsWith('.srt')) {
        vttContent = convertSrtToVtt(text);
      }
      
      const blob = new Blob([vttContent], { type: 'text/vtt' });
      const objectUrl = URL.createObjectURL(blob);
      
      const newTrack = {
        file: objectUrl,
        label: `Custom (${file.name.replace(/\.(srt|vtt)$/i, '')})`,
        kind: 'subtitles',
        default: true
      };
      
      setServerSubtitleTracks(prev => ({
        ...prev,
        [selectedServer]: [...(prev[selectedServer] || []), newTrack]
      }));
      setServerActiveTrackIndices(prev => ({
        ...prev,
        [selectedServer]: (serverSubtitleTracks[selectedServer] || []).length
      }));
      
      setShowSettings(false);
      resetControlsTimeout();
    };
    reader.readAsText(file);
  };

  const [isSearchingOnline, setIsSearchingOnline] = useState(false);
  const [onlineProvider, setOnlineProvider] = useState<'yify' | 'opensubtitles' | 'subdl'>('yify');
  const [searchLang, setSearchLang] = useState('en');
  const [onlineSubs, setOnlineSubs] = useState<any[]>([]);
  const [searchingSubs, setSearchingSubs] = useState(false);
  const [onlineSearchError, setOnlineSearchError] = useState<string | null>(null);

  const [apiKey, setApiKey] = useState(localStorage.getItem('cinemovie_opensubtitles_apikey') || '');
  const [username, setUsername] = useState(localStorage.getItem('cinemovie_opensubtitles_username') || '');
  const [password, setPassword] = useState(localStorage.getItem('cinemovie_opensubtitles_password') || '');
  const [subdlKey, setSubdlKey] = useState(localStorage.getItem('cinemovie_subdl_apikey') || '');
  const [isCredentialsSaved, setIsCredentialsSaved] = useState(false);

  const LANGUAGES = [
    { code: 'en', name: 'English' },
    { code: 'ar', name: 'Arabic' },
    { code: 'es', name: 'Spanish' },
    { code: 'fr', name: 'French' },
    { code: 'de', name: 'German' },
    { code: 'it', name: 'Italian' },
    { code: 'pt', name: 'Portuguese' },
    { code: 'ru', name: 'Russian' },
    { code: 'zh', name: 'Chinese' },
    { code: 'tr', name: 'Turkish' },
  ];

  const downloadTrack = async (track: any) => {
    try {
      import('../../../../utils/haptics').then(m => m.triggerHaptic('medium'));
      let targetFile = track.file;
      if (targetFile && targetFile.startsWith('http') && !targetFile.includes('blob:')) {
        targetFile = getSubtitleProxyUrl(targetFile);
      }
      const res = await fetch(targetFile);
      if (!res.ok) throw new Error(`Subtitle file returned ${res.status}`);
      const text = await res.text();
      
      const blob = new Blob([text], { type: 'text/vtt' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      const cleanLabel = (track.label || 'subtitle').replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const movieTitle = ((item as any)?.title || (item as any)?.name || 'movie').replace(/[^a-z0-9]/gi, '_').toLowerCase();
      
      a.download = `${movieTitle}_${cleanLabel}.vtt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('[LocalVideoPlayer] Failed to download subtitle track:', err);
      setPlayerToast({ message: `Failed to download subtitle file: ${err.message}`, isError: true });
    }
  };

  const saveOnlineSubtitleToDevice = async (sub: any) => {
    try {
      import('../../../../utils/haptics').then(m => m.triggerHaptic('medium'));
      const localServer = getLocalServerUrl();
      let downloadUrl = '';
      let headers: Record<string, string> = {};
      
      if (onlineProvider === 'yify') {
        downloadUrl = `${localServer}/movies/yts-subtitles/download?link=${encodeURIComponent(sub.link)}`;
      } else if (onlineProvider === 'subdl') {
        if (!subdlKey.trim()) throw new Error('SubDL API Key is required.');
        downloadUrl = `${localServer}/subtitles/subdl/download?link=${encodeURIComponent(sub.link)}`;
        headers = { 'x-api-key': subdlKey.trim() };
      } else {
        if (!apiKey.trim()) throw new Error('OpenSubtitles API Key is required.');
        let token = '';
        if (username.trim() && password.trim()) {
          const loginRes = await fetch(`${localServer}/subtitles/opensubtitles/login`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey.trim()
            },
            body: JSON.stringify({ username: username.trim(), password: password.trim() })
          });
          if (loginRes.ok) {
            const loginData = await loginRes.json();
            token = loginData.token || '';
          }
        }
        if (!token) throw new Error('OpenSubtitles Username and Password are required.');
        downloadUrl = `${localServer}/subtitles/opensubtitles/download?fileId=${sub.id}`;
        headers = { 'x-api-key': apiKey.trim(), 'x-auth-token': token };
      }
      
      const res = await fetch(downloadUrl, { headers });
      if (!res.ok) throw new Error(`Failed to download subtitle: ${res.statusText}`);
      
      const text = await res.text();
      const blob = new Blob([text], { type: 'text/vtt' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      const movieTitle = ((item as any)?.title || (item as any)?.name || 'movie').replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const subName = (sub.fileName || sub.name || 'subtitle').replace(/[^a-z0-9]/gi, '_').toLowerCase();
      a.download = `${movieTitle}_${subName}.vtt`;
      
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('[LocalVideoPlayer] Failed to save search subtitle to device:', err);
      setPlayerToast({ message: `Failed to save subtitle file: ${err.message}`, isError: true });
    }
  };

  const handleOnlineSubtitleSearch = async (overrideProvider?: 'yify' | 'opensubtitles' | 'subdl', overrideLang?: string) => {
    setSearchingSubs(true);
    setOnlineSearchError(null);
    setOnlineSubs([]);
    
    try {
      const isTV = !!season || !!episode;
      const tmdbId = item?.id || '';
      const provider = overrideProvider || onlineProvider;
      const lang = overrideLang || searchLang;
      
      if (provider === 'yify') {
        if (isTV) throw new Error('YIFY Subtitles only supports movies. Please use OpenSubtitles for TV shows.');
        const imdbId = (item as any)?.imdbId || (item as any)?.imdb_id;
        if (!imdbId) throw new Error('IMDb ID not found for this movie.');
        
        const localServer = getLocalServerUrl();
        const searchUrl = `${localServer}/movies/yts-subtitles/${imdbId}`;
        console.log('[LocalVideoPlayer] Fetching YTS subtitles:', searchUrl);
        
        const res = await fetch(searchUrl);
        if (!res.ok) throw new Error(`Failed to search YTS Subtitles: ${res.statusText}`);
        
        const data = await res.json();
        const langObj = LANGUAGES.find(l => l.code === lang);
        const langName = langObj ? langObj.name : 'English';
        
        const filtered = data.filter((s: any) => 
          s.language.toLowerCase() === langName.toLowerCase()
        );
        
        setOnlineSubs(filtered);
        if (filtered.length === 0) {
          setOnlineSearchError(`No subtitles found on YIFY for language: ${langName}`);
        }
        return filtered;
      } else if (provider === 'subdl') {
        if (!subdlKey.trim()) throw new Error('SubDL API Key is required.');
        const localServer = getLocalServerUrl();
        const imdbId = (item as any)?.imdbId || (item as any)?.imdb_id;
        
        const queryParams = new URLSearchParams({
          title: (item as any)?.title || (item as any)?.name || '',
          type: isTV ? 'tv' : 'movie',
          languages: lang
        });
        if (imdbId) queryParams.append('imdbId', imdbId);
        if (isTV && season && episode) {
          queryParams.append('season', String(season));
          queryParams.append('episode', String(episode));
        }
        
        const searchUrl = `${localServer}/subtitles/subdl/search?${queryParams.toString()}`;
        const res = await fetch(searchUrl, {
          headers: { 'x-api-key': subdlKey.trim() }
        });
        if (!res.ok) throw new Error(`SubDL Search failed: ${await res.text()}`);
        
        const data = await res.json();
        setOnlineSubs(data);
        if (data.length === 0) {
          setOnlineSearchError(`No subtitles found on SubDL for this language.`);
        }
        return data;
      } else {
        if (!apiKey.trim()) throw new Error('OpenSubtitles API Key is required.');
        const localServer = getLocalServerUrl();
        let token = '';
        if (username.trim() && password.trim()) {
          const loginRes = await fetch(`${localServer}/subtitles/opensubtitles/login`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey.trim()
            },
            body: JSON.stringify({ username: username.trim(), password: password.trim() })
          });
          if (loginRes.ok) {
            const loginData = await loginRes.json();
            token = loginData.token || '';
          }
        }
        
        const queryParams = new URLSearchParams({
          tmdbId: String(tmdbId),
          type: isTV ? 'tv' : 'movie',
          languages: lang
        });
        if (isTV && season && episode) {
          queryParams.append('season', String(season));
          queryParams.append('episode', String(episode));
        }
        
        const headers: Record<string, string> = { 'x-api-key': apiKey.trim() };
        if (token) headers['x-auth-token'] = token;
        
        const searchUrl = `${localServer}/subtitles/opensubtitles/search?${queryParams.toString()}`;
        const res = await fetch(searchUrl, { headers });
        if (!res.ok) throw new Error(`OpenSubtitles Search failed: ${await res.text()}`);
        
        const data = await res.json();
        setOnlineSubs(data);
        if (data.length === 0) {
          setOnlineSearchError(`No subtitles found on OpenSubtitles.`);
        }
        return data;
      }
    } catch (e: any) {
      console.error('[LocalVideoPlayer] Online subtitle search error:', e);
      setOnlineSearchError(e.message || 'An error occurred while searching.');
      return [];
    } finally {
      setSearchingSubs(false);
    }
  };

  const handleAlternativeSearch = (trackLabel: string) => {
    import('../../../../utils/haptics').then(m => m.triggerHaptic('light'));
    const matchedLang = LANGUAGES.find(l => 
      trackLabel.toLowerCase().includes(l.name.toLowerCase()) ||
      trackLabel.toLowerCase().includes(l.code.toLowerCase())
    );
    const langCode = matchedLang ? matchedLang.code : 'en';
    
    setSearchLang(langCode);
    setIsSearchingOnline(true);
    setOnlineSearchError(null);
    setOnlineSubs([]);
    
    const isTV = !!season || !!episode;
    let provider: 'yify' | 'opensubtitles' | 'subdl' = 'yify';
    if (isTV) {
      provider = subdlKey.trim() ? 'subdl' : 'opensubtitles';
    } else {
      provider = subdlKey.trim() ? 'subdl' : 'yify';
    }
    setOnlineProvider(provider);
    handleOnlineSubtitleSearch(provider, langCode);
  };

  const handleOnlineSubtitleDownload = async (sub: any, providerOverride?: 'yify' | 'opensubtitles' | 'subdl', langOverride?: string) => {
    setSearchingSubs(true);
    setOnlineSearchError(null);
    try {
      const localServer = getLocalServerUrl();
      let downloadUrl = '';
      let headers: Record<string, string> = {};
      const provider = providerOverride || onlineProvider;
      const targetLang = langOverride || searchLang;
      
      if (provider === 'yify') {
        downloadUrl = `${localServer}/movies/yts-subtitles/download?link=${encodeURIComponent(sub.link)}`;
      } else if (provider === 'subdl') {
        if (!subdlKey.trim()) throw new Error('SubDL API Key is required.');
        downloadUrl = `${localServer}/subtitles/subdl/download?link=${encodeURIComponent(sub.link)}`;
        headers = { 'x-api-key': subdlKey.trim() };
      } else {
        if (!apiKey.trim()) throw new Error('OpenSubtitles API Key is required.');
        let token = '';
        if (username.trim() && password.trim()) {
          const loginRes = await fetch(`${localServer}/subtitles/opensubtitles/login`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey.trim()
            },
            body: JSON.stringify({ username: username.trim(), password: password.trim() })
          });
          if (loginRes.ok) {
            const loginData = await loginRes.json();
            token = loginData.token || '';
          }
        }
        if (!token) throw new Error('Credentials required to download.');
        downloadUrl = `${localServer}/subtitles/opensubtitles/download?fileId=${sub.id}`;
        headers = { 'x-api-key': apiKey.trim(), 'x-auth-token': token };
      }
      
      console.log('[LocalVideoPlayer] Downloading subtitle:', downloadUrl);
      const res = await fetch(downloadUrl, { headers });
      if (!res.ok) throw new Error(`Download failed: ${await res.text()}`);
      
      const vttContent = await res.text();
      const blob = new Blob([vttContent], { type: 'text/vtt' });
      const objectUrl = URL.createObjectURL(blob);
      
      const langObj = LANGUAGES.find(l => l.code === targetLang);
      const langLabel = langObj ? langObj.name : 'Online';
      const providerLabel = provider === 'yify' ? 'YIFY' : provider === 'subdl' ? 'SubDL' : 'OpenSubs';
      const label = `${langLabel} (Online - ${providerLabel})`;
      
      const newTrack = {
        file: objectUrl,
        label,
        kind: 'subtitles',
        default: true
      };
      
      let newTracksList: any[] = [];
      setServerSubtitleTracks(prev => {
        const list = [...(prev[selectedServer] || []), newTrack];
        newTracksList = list;
        return {
          ...prev,
          [selectedServer]: list
        };
      });
      const nextIndex = newTracksList.length - 1;
      setServerActiveTrackIndices(prev => ({
        ...prev,
        [selectedServer]: nextIndex
      }));
      
      if (onTracksChange) {
        const tracksForCast = newTracksList.map((t, idx) => ({
          ...t,
          default: idx === nextIndex
        }));
        onTracksChange(tracksForCast);
      }
      
      setIsSearchingOnline(false);
      setShowSettings(false);
      resetControlsTimeout();
    } catch (e: any) {
      console.error('[LocalVideoPlayer] Subtitle download error:', e);
      setOnlineSearchError(e.message || 'Failed to download selected subtitle.');
    } finally {
      setSearchingSubs(false);
    }
  };

  const seekedOnStartRef = useRef(false);
  const currentTimeRef = useRef(currentTime);
  const durationRef = useRef(duration);
  const isHls = currentSrc.includes('.m3u8') || 
                currentSrc.includes('type=m3u8') || 
                ((selectedServer === 'vidlink-pro' || selectedServer === 'vidsrc-pm' || selectedServer === 'test-server' || selectedServer === 'vidsrc-sbs' || selectedServer === 'vidsrc-wtf-2' || selectedServer === 'vidsrc-pk' || selectedServer === 'vidsrc-fyi' || selectedServer === 'vidzee' || selectedServer === 'vidsrc-top') && 
                  !currentSrc.includes('type=mp4') && 
                  !currentSrc.includes('.mp4')) || 
                ((currentSrc.includes('vodvidl.site') || currentSrc.includes('vidlink') || currentSrc.includes('vidsrc') || currentSrc.includes('cloudnestra') || currentSrc.includes('brightpath') || currentSrc.includes('yonderunyielding') || currentSrc.includes('unctuousundertow') || currentSrc.includes('conversionfocusedstudio') || currentSrc.includes('onlinevisibilitysystem') || currentSrc.includes('quietmidnightgardeningideas') || currentSrc.includes('visionaryfounderslab')) && 
                  !currentSrc.includes('type=mp4') && 
                  !currentSrc.includes('.mp4')) || 
                (isOfflineMode && !currentSrc.includes('type=mp4') && !currentSrc.startsWith('blob:') && !currentSrc.includes('.mp4'));

  console.log('[LocalVideoPlayer] HLS Format Check:', {
    isHls,
    currentSrc,
    selectedServer,
    isOfflineMode
  });
  const isDraggingRef = useRef(false);
  const isSeekingRef = useRef(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  const checkControlAllowed = (): boolean => {
    if (isPartyMode && SettingsService.get('hostControlsOnly') && !isPartyHost) {
      const isHostPresent = partyParticipants.some(p => p.is_host);
      if (isHostPresent) {
        setPlayerToast({ message: 'Playback controls are locked by the host', isError: true });
        return false;
      }
    }
    return true;
  };

  const togglePlay = async (e?: any) => {
    e?.stopPropagation();
    if (!checkControlAllowed()) return;
    
    let nextPlayingState = false;
    if (castConnected && remotePlayerControllerRef.current) {
        remotePlayerControllerRef.current.playPause();
        nextPlayingState = !playing;
        setPlaying(nextPlayingState);
    } else if (videoRef.current) {
        if (videoRef.current.paused) {
            videoRef.current.play().catch(() => {});
            nextPlayingState = true;
            setPlaying(true);
        } else {
            videoRef.current.pause();
            nextPlayingState = false;
            setPlaying(false);
            setBuffering(false);
        }
    } else {
        return;
    }

    // Broadcast play/pause to co-watchers via real-time channel
    if (isPartyMode && partyChannelRef.current && !isRemoteSyncRef.current) {
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (!user) return;
        WatchTogetherService.broadcastSync(partyChannelRef.current, {
          type: nextPlayingState ? 'play' : 'pause',
          time: videoRef.current?.currentTime || currentTime,
          sender: user.id
        });
      });
    }
    
    resetControlsTimeout();
  };

  const broadcastSeek = useCallback((time: number) => {
    if (isPartyMode && partyChannelRef.current && !isRemoteSyncRef.current) {
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (!user) return;
        WatchTogetherService.broadcastSync(partyChannelRef.current, {
          type: 'seek',
          time,
          sender: user.id
        });
      });
    }
  }, [isPartyMode]);

  const handleRewind = (e?: any) => {
    e?.stopPropagation();
    if (!checkControlAllowed()) return;
    let targetTime = 0;
    if (castConnected && remotePlayerControllerRef.current) {
      targetTime = Math.max(0, currentTime - 10);
      remotePlayerRef.current.currentTime = targetTime;
      remotePlayerControllerRef.current.seek();
      setCurrentTime(targetTime);
    } else if (videoRef.current) {
      targetTime = Math.max(0, videoRef.current.currentTime - 10);
      videoRef.current.currentTime = targetTime;
      setCurrentTime(targetTime);
    }
    broadcastSeek(targetTime);
    setRippleLeft(true);
    setTimeout(() => setRippleLeft(false), 500);
    if (showControls) {
      resetControlsTimeout();
    }
  };

  const handleForward = (e?: any) => {
    e?.stopPropagation();
    if (!checkControlAllowed()) return;
    let targetTime = 0;
    if (castConnected && remotePlayerControllerRef.current) {
      targetTime = Math.min(duration, currentTime + 10);
      remotePlayerRef.current.currentTime = targetTime;
      remotePlayerControllerRef.current.seek();
      setCurrentTime(targetTime);
    } else if (videoRef.current) {
      targetTime = Math.min(duration, videoRef.current.currentTime + 10);
      videoRef.current.currentTime = targetTime;
      setCurrentTime(targetTime);
    }
    broadcastSeek(targetTime);
    setRippleRight(true);
    setTimeout(() => setRippleRight(false), 500);
    if (showControls) {
      resetControlsTimeout();
    }
  };

  const toggleFullScreen = (e?: any) => {
    e?.stopPropagation();
    if (!containerRef.current) return;
    import('../../../../utils/haptics').then(m => m.triggerHaptic('light'));

    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
    resetControlsTimeout();
  };

  const resetControlsTimeout = () => {
    if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
    setShowControls(true);
    // FIX: Do NOT call setCurrentTime here. It caused a full React re-render
    // on every mouse move (30-60x/sec) during playback. The progress bar
    // is updated by the timeupdate event handler which throttles correctly.
    if (showSettings || !playing) return;
    controlsTimeout.current = setTimeout(() => {
      setShowControls(false);
    }, 6000);
  };

  useEffect(() => {
    resetControlsTimeout();
  }, [playing]);

  const toggleControlsVisibility = () => {
    if (showControls) {
      setShowControls(false);
      if (controlsTimeout.current) {
        clearTimeout(controlsTimeout.current);
        controlsTimeout.current = null;
      }
    } else {
      resetControlsTimeout();
    }
  };

  // Hook-based custom gestures
  const {
    isLocked,
    setIsLocked,
    showUnlockIndicator,
    setShowUnlockIndicator,
    brightness,
    volume,
    setVolume,
    activeSlider,
    aspectRatio,
    setAspectRatio,
    zoomScale,
    setZoomScale,
    showZoomBadge,
    horizontalSeekTime,
    isFullscreen,
    rippleLeft,
    setRippleLeft,
    rippleRight,
    setRippleRight,
    lastTouchTimeRef,
    handleLockedScreenTap,
    isHoldingSpeed
  } = usePlayerGestures({
    videoRef,
    containerRef,
    currentTime,
    duration,
    setCurrentTime,
    playing,
    setPlaying,
    castConnected,
    remotePlayerRef,
    remotePlayerControllerRef,
    showSettings,
    setShowSettings,
    showControls,
    setShowControls,
    controlsTimeout,
    resetControlsTimeout,
    toggleControlsVisibility,
    handleRewind,
    handleForward,
    toggleFullScreen,
    hostControlsLocked: isPartyMode && SettingsService.get('hostControlsOnly') && !isPartyHost
  });

  useEffect(() => {
    return () => {
      if (serverSwitchAbortControllerRef.current) {
        serverSwitchAbortControllerRef.current.abort();
      }
    };
  }, []);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  useEffect(() => {
    if (castConnected && videoRef.current) {
      videoRef.current.pause();
    }
  }, [castConnected]);

  // Pause local video element if parent command updates playing to false
  useEffect(() => {
    if (castConnected) return;
    if (videoRef.current && !playing && !videoRef.current.paused) {
      videoRef.current.pause();
    }
  }, [playing, castConnected]);

  // Keep screen and CPU/GPU awake using capacitor-community/keep-awake plugin when playing locally
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    
    let active = false;
    const enableKeepAwake = async () => {
      try {
        const { KeepAwake } = await import('@capacitor-community/keep-awake');
        if (playing) {
          await KeepAwake.keepAwake().catch(() => {});
          active = true;
          console.log('[LocalVideoPlayer] KeepAwake activated');
        } else {
          await KeepAwake.allowSleep().catch(() => {});
          active = false;
          console.log('[LocalVideoPlayer] KeepAwake deactivated (paused)');
        }
      } catch (e) {
        console.warn('[LocalVideoPlayer] KeepAwake call failed:', e);
      }
    };

    enableKeepAwake();

    return () => {
      if (active) {
        import('@capacitor-community/keep-awake')
          .then(({ KeepAwake }) => KeepAwake.allowSleep().catch(() => {}))
          .catch(e => console.warn('[LocalVideoPlayer] KeepAwake cleanup failed:', e));
      }
    };
  }, [playing]);
  // Keep-alive loop that forces Chromium WebView's main thread to stay active during playback.
  // FIX: Changed from 60fps rAF (burning CPU every frame) to ~8fps via setTimeout.
  // This still prevents WebView from throttling video compositing but uses ~87% less CPU.
  useEffect(() => {
    if (!IS_MOBILE_DEVICE || castConnected || !playing) return;

    const dummy = document.createElement('div');
    dummy.style.position = 'absolute';
    dummy.style.width = '1px';
    dummy.style.height = '1px';
    dummy.style.pointerEvents = 'none';
    dummy.style.zIndex = '-1';
    dummy.style.opacity = '0.01';
    containerRef.current?.appendChild(dummy);

    let timerId: ReturnType<typeof setTimeout> | null = null;
    let toggle = false;
    let active = true;

    const tick = () => {
      if (!active) return;
      toggle = !toggle;
      dummy.style.opacity = toggle ? '0.01' : '0.012';
      // ~8fps instead of 60fps — sufficient to keep compositor alive without burning CPU
      timerId = setTimeout(tick, 120);
    };

    timerId = setTimeout(tick, 120);

    return () => {
      active = false;
      if (timerId !== null) clearTimeout(timerId);
      dummy.remove();
    };
  }, [playing, castConnected]);

  useEffect(() => {
    const handlePlay = () => {
      if (videoRef.current) {
        videoRef.current.playbackRate = playbackSpeed;
      }
    };
    const video = videoRef.current;
    if (video) {
      video.addEventListener('play', handlePlay);
      return () => video.removeEventListener('play', handlePlay);
    }
  }, [playbackSpeed, currentSrc]);
  
  useEffect(() => {
    seekedOnStartRef.current = false;
  }, [currentSrc]);

  useEffect(() => {
    if (videoRef.current) {
      setVolume(videoRef.current.volume);
    }
  }, [currentSrc]);

  useEffect(() => {
    if (!currentSrc) return;
    const canPlayNatively = videoRef.current ? videoRef.current.canPlayType('application/vnd.apple.mpegurl') : 'unknown';
    const hlsSupported = Hls.isSupported();
    const diagMsg = `[HLS Diagnostics]\n` +
      `- Source: ${currentSrc}\n` +
      `- isHls: ${isHls}\n` +
      `- Hls.isSupported(): ${hlsSupported}\n` +
      `- Native HLS: ${canPlayNatively}\n` +
      `- Server: ${selectedServer}\n` +
      `- User Agent: ${navigator.userAgent}`;
    setVidlinkDiagnostics(diagMsg);
    console.log('[LocalVideoPlayer] Diagnostics updated:', diagMsg);
  }, [currentSrc, isHls, selectedServer]);

  useEffect(() => {
    if (isHls && Hls.isSupported()) return;

    const targetTime = currentTimeRef.current > 10 ? currentTimeRef.current : (startTime || 0);
    if (targetTime > 10 && videoRef.current && !seekedOnStartRef.current) {
      const handleReadyToSeek = () => {
        if (videoRef.current && !seekedOnStartRef.current) {
          videoRef.current.currentTime = targetTime;
          setCurrentTime(targetTime);
          seekedOnStartRef.current = true;
          console.log('[LocalVideoPlayer] Native player seeked to initial time:', targetTime);
        }
      };
      
      const video = videoRef.current;
      if (video.readyState >= 1) {
        handleReadyToSeek();
      } else {
        video.addEventListener('loadedmetadata', handleReadyToSeek);
        video.addEventListener('canplay', handleReadyToSeek);
        return () => {
          video.removeEventListener('loadedmetadata', handleReadyToSeek);
          video.removeEventListener('canplay', handleReadyToSeek);
        };
      }
    }
  }, [startTime, src, isHls]);

  useEffect(() => {
    resetControlsTimeout();
    return () => {
      if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
    };
  }, [showSettings]);

  useEffect(() => {
    if (!isOfflineMode && item?.id) {
      const isTV = !!season || !!episode;
      const type = isTV ? 'tv' : 'movie';
      const tmdbId = item.id;
      
      if (Capacitor.isNativePlatform() && selectedServer === 'vidlink-pro') {
        console.log(`[LocalVideoPlayer] Pre-fetching native qualities for Vidlink...`);
        NativeStreamingEngine.resolveVidlink({
          tmdbId: String(tmdbId),
          imdbId: (item as any)?.imdbId || (item as any)?.imdb_id || '',
          type: type,
          season: season || 1,
          episode: episode || 1
        }).then(nativeRes => {
          if (nativeRes && nativeRes.sources && nativeRes.sources.length > 0) {
            const sources = (nativeRes.sources || []).map((s: any) => ({
              url: s.url,
              quality: s.quality || 'auto',
              isM3U8: s.isM3U8
            }));
            setAvailableSources(sources);
            setServerAvailableSources(prev => ({ ...prev, [selectedServer]: sources }));
            if (!sources[0].isM3U8) {
              const directQualities = sources.map((s: any, idx: number) => {
                const parsed = parseInt(s.quality);
                const isHeight = !isNaN(parsed);
                const normHeight = isHeight ? getStandardResolutionHeight(parsed) : undefined;
                return {
                  height: normHeight || 1080,
                  label: isHeight ? `${normHeight}p` : (s.quality || `Source ${idx + 1}`),
                  index: idx
                };
              });
              // Sort low → high (360p first, 1080p last). Auto button is always first in UI.
              directQualities.sort((a, b) => (a.height ?? 0) - (b.height ?? 0));
              setQualities(directQualities);
              setServerQualities(prev => ({ ...prev, [selectedServer]: directQualities }));
              // Default to Auto — plays highest quality URL (Kotlin sorts sources desc so [0]=1080p)
              setCurrentQuality(-1);
              setServerCurrentQuality(prev => ({ ...prev, [selectedServer]: -1 }));
            }

            // Populate subtitles
            if (nativeRes.subtitles && Array.isArray(nativeRes.subtitles) && nativeRes.subtitles.length > 0) {
              const newTracks = nativeRes.subtitles.map((sub: any) => ({
                file: sub.url,
                label: sub.label || sub.lang || 'Unknown',
                kind: 'subtitles',
                default: (sub.lang || '').toLowerCase().includes('english') && !sub.isBackup,
                isBackup: !!sub.isBackup
              }));
              const defaultIndex = newTracks.findIndex((t: any) => t.default);
              setServerSubtitleTracks(prev => ({
                ...prev,
                [selectedServer]: newTracks
              }));
              setServerActiveTrackIndices(prev => ({
                ...prev,
                [selectedServer]: defaultIndex !== -1 ? defaultIndex : -1
              }));
            } else {
              // Fallback to YTS subtitles
              const imdbId = (item as any)?.imdbId || (item as any)?.imdb_id;
              if (type === 'movie' && imdbId) {
                const localServer = getLocalServerUrl();
                const ytsUrl = `${localServer}/movies/yts-subtitles/${imdbId}`;
                fetch(ytsUrl)
                  .then(res => res.ok ? res.json() : null)
                  .then(ytsSubs => {
                    if (Array.isArray(ytsSubs) && ytsSubs.length > 0) {
                      const newTracks = ytsSubs.map((sub: any) => ({
                        file: `${localServer}/movies/yts-subtitles/download?link=${encodeURIComponent(sub.link)}`,
                        label: `${sub.language} (Auto YTS)`,
                        kind: 'subtitles',
                        default: sub.language.toLowerCase().includes('english')
                      }));
                      const defaultIndex = newTracks.findIndex((t: any) => t.default);
                      setServerSubtitleTracks(prev => ({
                        ...prev,
                        [selectedServer]: newTracks
                      }));
                      setServerActiveTrackIndices(prev => ({
                        ...prev,
                        [selectedServer]: defaultIndex !== -1 ? defaultIndex : -1
                      }));
                    }
                  })
                  .catch(e => console.warn('[LocalVideoPlayer] Failed to pre-fetch YTS subtitles:', e));
              }
            }
          }
        }).catch(e => console.warn('[LocalVideoPlayer] Failed to pre-fetch native qualities:', e));
      } else {
        const localServer = getLocalServerUrl();
        const titleToUse = (item as any)?.title || (item as any)?.name || '';
        let watchUrl = `${localServer}/meta/tmdb/watch/${tmdbId}?type=${type}&server=${selectedServer}&title=${encodeURIComponent(titleToUse)}`;
        if (isTV) {
          watchUrl += `&s=${season}&e=${episode}`;
        }
        
        fetch(watchUrl)
          .then(res => res.ok ? res.json() : null)
          .then(data => {
            if (data && data.sources && Array.isArray(data.sources) && data.sources.length > 0) {
              setAvailableSources(data.sources);
              setServerAvailableSources(prev => ({ ...prev, [selectedServer]: data.sources }));
              if (!data.sources[0].isM3U8) {
                const directQualities = data.sources.map((s, idx) => ({
                  height: parseInt(s.quality) || 1080,
                  index: idx
                }));
                setQualities(directQualities);
                setServerQualities(prev => ({ ...prev, [selectedServer]: directQualities }));
                const currentIdx = data.sources.findIndex(s => s.url === currentSrc || s.url === src);
                const qIdx = currentIdx !== -1 ? currentIdx : -1;
                setCurrentQuality(qIdx);
                setServerCurrentQuality(prev => ({ ...prev, [selectedServer]: qIdx }));
              }
            }
          })
          .catch(e => console.warn('[LocalVideoPlayer] Failed to pre-fetch qualities:', e));
      }
    }
  }, [src, item?.id, selectedServer]);


  // Handle HLS Playback Setup
  useEffect(() => {
      if (!currentSrc) return;
      if (videoRef.current && isHls) {
          if (Hls.isSupported()) {
              const startPos = pendingSeekTimeRef.current !== null 
                      ? pendingSeekTimeRef.current 
                      : (currentTimeRef.current > 10 ? currentTimeRef.current : (startTime && startTime > 10 ? startTime : -1));
              
              if (pendingSeekTimeRef.current !== null) {
                  pendingSeekTimeRef.current = null;
              }

              const isProxied = currentSrc.includes('localhost:') || currentSrc.includes('127.0.0.1:');
              const finalUseNative = isProxied ? false : useNativeLoader;

              let playStarted = false;
              const loadTimeout = setTimeout(() => {
                  if (!playStarted && !finalUseNative && Capacitor.isNativePlatform() && !isProxied && !isOfflineMode) {
                      console.warn('[LocalVideoPlayer] Stream load timed out (5s). Switching to NativeHlsLoader fallback.');
                      if (videoRef.current) {
                          const curr = videoRef.current.currentTime;
                          if (curr > 0) {
                              pendingSeekTimeRef.current = curr;
                          }
                      }
                      setUseNativeLoader(true);
                  }
              }, 5000);

              const markStarted = () => {
                  playStarted = true;
                  clearTimeout(loadTimeout);
              };

              const hls = new Hls({ 
                startPosition: startPos,
                loader: finalUseNative 
                  ? buildNativeHlsLoader((Hls as any).DefaultConfig.loader)
                  : (Hls as any).DefaultConfig.loader,
                // Device-specific buffer memory optimizations to prevent Garbage Collection stutters
                maxBufferLength: IS_MOBILE_DEVICE ? 30 : 60,
                maxMaxBufferLength: IS_MOBILE_DEVICE ? 45 : 120,
                maxBufferSize: IS_MOBILE_DEVICE ? 30 * 1024 * 1024 : 60 * 1024 * 1024,
                backBufferLength: IS_MOBILE_DEVICE ? 30 : 30,
                fragLoadingTimeOut: 30000,
                manifestLoadingTimeOut: 30000,
                levelLoadingTimeOut: 30000,
                fragLoadingMaxRetry: 10,
                manifestLoadingMaxRetry: 10,
                fragLoadingRetryDelay: 1000,
                manifestLoadingRetryDelay: 1000,
                // Native Gap / Stall Recovery parameters (disable watchdog to prevent micro-skips)
                highBufferWatchdogPeriod: 0,
                maxBufferHole: 0.5,
                nudgeMax: 5,
                nudgeOffset: 0.1,
                // MSE performance: cap quality to player size and use web worker for transmuxing
                capLevelToPlayerSize: IS_MOBILE_DEVICE,
                enableWorker: true,
                // ABR tuning: higher default estimate prevents the player from being too
                // conservative on the first quality upgrade (e.g. switching to 1080p on WiFi)
                abrBandWidthFactor: 0.70,         // 30% safety margin prevents constant bouncing
                abrEwmaFastVoD: 4,
                abrEwmaSlowVoD: 20,               // Slow average smooths momentary WiFi drops
                abrEwmaDefaultEstimate: 5_000_000, // 5 Mbps — realistic modern WiFi starting point
              } as any);

              hlsRef.current = hls;
              hls.loadSource(currentSrc);
              hls.attachMedia(videoRef.current);
              
              hls.on(Hls.Events.ERROR, (event, data) => {
                  if (!data.fatal) {
                      if (data.details === 'fragLoadTimeOut' || data.details === 'fragLoadError') {
                          console.warn('[LocalVideoPlayer] Non-fatal HLS fragment load error/timeout:', data.details);
                          if (!useNativeLoader && Capacitor.isNativePlatform()) {
                              console.warn('[LocalVideoPlayer] Switching to NativeHlsLoader fallback due to fragment load error...');
                              markStarted();
                              setUseNativeLoader(true);
                              return;
                          }
                          hls.startLoad();
                      }
                      return;
                  }
                  
                  console.error('[LocalVideoPlayer] Fatal Hls.js error:', data);

                  // Manifest errors mean the stream URL itself is dead/blocked (e.g. 404/Cloudflare WAF).
                  const isManifestError = data.details === 'manifestLoadError'
                      || data.details === 'manifestLoadTimeOut'
                      || data.details === 'manifestParsingError'
                      || data.details === 'keyLoadError'
                      || data.details === 'keyLoadTimeOut'
                      || (data.response && (data.response.code === 403 || data.response.code === 404));

                  if (isManifestError) {
                      if (!useNativeLoader && Capacitor.isNativePlatform()) {
                          console.warn('[LocalVideoPlayer] Manifest load error occurred on default loader. Switching to NativeHlsLoader fallback...');
                          markStarted();
                          setUseNativeLoader(true);
                          return;
                      }

                      const isAdFree = ALL_SERVERS.some(s => s.id === selectedServer && s.isAdFree);
                      if (Capacitor.isNativePlatform() && !isOfflineMode && !isAdFree) {
                          console.warn('[LocalVideoPlayer] HLS manifest error on native mobile, falling back to official iframe player embed...');
                          setIframeFallback(true);
                          setIsInitialLoading(false);
                          setIsSwitchingServer(false);
                          setBuffering(false);
                          return;
                      }

                      const hlsErrorMsg = `HLS Stream Error [${data.details}]: The resolved direct file is failing to load. ` +
                        (data.response ? `Response Code: ${data.response.code}. ` : "") +
                        "This generally happens when the video hosting server blocks the request.";
                      console.error('[LocalVideoPlayer]', hlsErrorMsg);
                      if (selectedServer === 'vidlink-pro') {
                        setVidlinkDiagnostics(hlsErrorMsg);
                      }
                      setServerError(hlsErrorMsg);
                      setIsInitialLoading(false);
                      setIsSwitchingServer(false);
                      setBuffering(false);
                      if (!isOfflineMode) {
                          triggerAutoFailover();
                      }
                      return;
                  }

                  switch (data.type) {
                      case Hls.ErrorTypes.NETWORK_ERROR:
                          if (!useNativeLoader && Capacitor.isNativePlatform()) {
                              console.warn('[LocalVideoPlayer] Fatal Network error occurred on default loader. Switching to NativeHlsLoader fallback...');
                              markStarted();
                              setUseNativeLoader(true);
                              return;
                          }
                          // Transient network hiccup (segment failed, etc.) — try recovering
                          if (hlsNetworkRetryCountRef.current < 3) {
                              hlsNetworkRetryCountRef.current++;
                              console.warn(`[LocalVideoPlayer] Fatal HLS network error, attempting to recover loading (attempt ${hlsNetworkRetryCountRef.current}/3)...`);
                              hls.startLoad();
                          } else {
                              console.error('[LocalVideoPlayer] Max HLS network recovery attempts reached. Reporting fatal error.');
                              hlsNetworkRetryCountRef.current = 0;
                              const netErrorMsg = `HLS Network Error: The streaming server failed to respond.`;
                              setServerError(netErrorMsg);
                              setIsInitialLoading(false);
                              setIsSwitchingServer(false);
                              setBuffering(false);
                              if (!isOfflineMode) {
                                  triggerAutoFailover();
                              }
                          }
                          break;
                      case Hls.ErrorTypes.MEDIA_ERROR:
                          console.warn('[LocalVideoPlayer] Fatal HLS media error, attempting to recover media element...');
                          hls.recoverMediaError();
                          break;
                       default:
                           const srv = (remoteServers.length > 0 ? remoteServers : ALL_SERVERS).find(s => s.id === selectedServer);
                           const isAdFree = srv ? srv.isAdFree : (selectedServer === 'vidlink-pro' || selectedServer === 'vidsrc-pm' || selectedServer === 'vidsrc-wtf-2');
                           if (Capacitor.isNativePlatform() && !isOfflineMode && !isAdFree) {
                              console.warn('[LocalVideoPlayer] Unrecoverable HLS error on native mobile, falling back to official iframe player embed...');
                              setIframeFallback(true);
                              setIsInitialLoading(false);
                              setIsSwitchingServer(false);
                              setBuffering(false);
                              return;
                          }
                          const unrecoverableMsg = `Fatal Playback Error [${data.type} / ${data.details}].`;
                          if (selectedServer === 'vidlink-pro') {
                            setVidlinkDiagnostics(unrecoverableMsg);
                          }
                          setServerError(unrecoverableMsg);
                          setIsInitialLoading(false);
                          setIsSwitchingServer(false);
                          setBuffering(false);
                          if (!isOfflineMode) {
                              triggerAutoFailover();
                          }
                          break;
                  }
              });

              hls.on(Hls.Events.MANIFEST_PARSED, () => {
                  hlsNetworkRetryCountRef.current = 0;
                  markStarted();
                  setBuffering(false);
                  setIsInitialLoading(false);
                  if (selectedServerRef.current !== 'vidsrc-wtf-2') {
                      const levels = hls.levels.map((l, i) => {
                          const normHeight = getStandardResolutionHeight(l.height);
                          return {
                              height: normHeight,
                              label: `${normHeight}p`,
                              index: i
                          };
                      });
                      setQualities(levels);
                      setServerQualities(prev => ({ ...prev, [selectedServerRef.current]: levels }));
                      
                      // Lock to previously selected manual quality level if any
                      const prevQuality = serverCurrentQuality[selectedServerRef.current] ?? -1;
                      if (prevQuality !== -1 && prevQuality < hls.levels.length) {
                          hls.currentLevel = prevQuality;
                          hls.loadLevel = prevQuality;
                          hls.nextLevel = prevQuality;
                      } else {
                          let highestIdx = hls.levels.length - 1;
                          if (IS_MOBILE_DEVICE) {
                               // Cap AUTO quality to 1080p on mobile to prevent MSE SourceBuffer
                               // stuttering on 4K streams while keeping 1080p crisp.
                               const max1080idx = hls.levels.reduce((best, l, i) => {
                                 if (l.height <= 1080 && (best === -1 || l.height > hls.levels[best].height)) return i;
                                 return best;
                               }, -1);
                               if (max1080idx !== -1 && hls.levels.length > 1) {
                                 hls.autoLevelCapping = max1080idx;
                                 (hls as any).__mobileLevelCap = max1080idx;
                                 highestIdx = max1080idx;
                               }
                           }
                          if (highestIdx >= 0) {
                              hls.startLevel = highestIdx;
                          }
                      }
                  }
                  if (startPos > 10) {
                      if (videoRef.current) {
                          videoRef.current.currentTime = startPos;
                      }
                      setCurrentTime(startPos);
                      seekedOnStartRef.current = true;
                  }
                  if (playing) videoRef.current?.play().catch(() => {});
              });

              const video = videoRef.current;
              const handleRealDuration = () => {
                  if (!video) return;
                  markStarted();
                  const d = video.duration;
                  if (d && isFinite(d) && d > 0 && d < 86399) {
                      setDuration(d);
                  }
                  setIsInitialLoading(false);
              };
              video.addEventListener('durationchange', handleRealDuration);
              video.addEventListener('loadedmetadata', handleRealDuration);
              video.addEventListener('playing', markStarted);
              video.addEventListener('canplay', markStarted);

              return () => {
                  clearTimeout(loadTimeout);
                  hls.destroy();
                  hlsRef.current = null;
                  video.removeEventListener('durationchange', handleRealDuration);
                  video.removeEventListener('loadedmetadata', handleRealDuration);
                  video.removeEventListener('playing', markStarted);
                  video.removeEventListener('canplay', markStarted);
              };
          } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
              videoRef.current.src = currentSrc;
              const handleLoadedMetadata = () => {
                  if (pendingSeekTimeRef.current !== null) {
                      if (videoRef.current) videoRef.current.currentTime = pendingSeekTimeRef.current;
                      pendingSeekTimeRef.current = null;
                  }
                  const d = videoRef.current?.duration;
                  if (d && isFinite(d) && d > 0 && d < 86399) setDuration(d);
                  if (playing) videoRef.current?.play().catch(() => {});
                  setIsInitialLoading(false);
              };
              const handleDurationChange = () => {
                  const d = videoRef.current?.duration;
                  if (d && isFinite(d) && d > 0 && d < 86399) setDuration(d);
              };
              const handleNativeError = () => {
                  const err = videoRef.current?.error;
                  console.error('[LocalVideoPlayer] Native HLS video error:', err?.code, err?.message);
                  const isAdFree = ALL_SERVERS.some(s => s.id === selectedServer && s.isAdFree);
                  if (Capacitor.isNativePlatform() && !isOfflineMode && !isAdFree) {
                      console.warn('[LocalVideoPlayer] Native HLS error on native mobile, falling back to official iframe player embed...');
                      setIframeFallback(true);
                      setIsInitialLoading(false);
                      return;
                  }
                  const msg = `Native HLS playback error: ${err?.message || 'Video segment download failed.'} (Code ${err?.code || 'unknown'})`;
                  setServerError(msg);
                  if (selectedServer === 'vidlink-pro') setVidlinkDiagnostics(msg);
                  setIsInitialLoading(false);
                  if (!isOfflineMode) {
                      triggerAutoFailover();
                  }
              };
              videoRef.current.addEventListener('loadedmetadata', handleLoadedMetadata);
              videoRef.current.addEventListener('durationchange', handleDurationChange);
              videoRef.current.addEventListener('error', handleNativeError);
              return () => {
                  videoRef.current?.removeEventListener('loadedmetadata', handleLoadedMetadata);
                  videoRef.current?.removeEventListener('durationchange', handleDurationChange);
                  videoRef.current?.removeEventListener('error', handleNativeError);
              };
          }
      } else if (videoRef.current) {
          if (!currentSrc) return;
          videoRef.current.src = currentSrc;
          const handleLoadedMetadata = () => {
              if (pendingSeekTimeRef.current !== null) {
                  if (videoRef.current) videoRef.current.currentTime = pendingSeekTimeRef.current;
                  pendingSeekTimeRef.current = null;
              }
              const d = videoRef.current?.duration;
              if (d && isFinite(d) && d > 0) setDuration(d);
              setIsInitialLoading(false);
          };
          const handleDurationChange = () => {
              const d = videoRef.current?.duration;
              if (d && isFinite(d) && d > 0) setDuration(d);
          };
          const handleNativeError = () => {
              const err = videoRef.current?.error;
              console.error('[LocalVideoPlayer] Native MP4 video error:', err?.code, err?.message);
              const isAdFree = ALL_SERVERS.some(s => s.id === selectedServer && s.isAdFree);
              if (Capacitor.isNativePlatform() && !isOfflineMode && !isAdFree) {
                  console.warn('[LocalVideoPlayer] Native MP4 error on native mobile, falling back to official iframe player embed...');
                  setIframeFallback(true);
                  setIsInitialLoading(false);
                  return;
              }
              const msg = `Native MP4 playback error: ${err?.message || 'Video stream could not be decoded.'} (Code ${err?.code || 'unknown'})`;
              setServerError(msg);
              if (selectedServer === 'vidlink-pro') setVidlinkDiagnostics(msg);
              setShowSettings(true);
              setSettingsTab('servers');
              setIsInitialLoading(false);
          };
          videoRef.current.addEventListener('loadedmetadata', handleLoadedMetadata);
          videoRef.current.addEventListener('durationchange', handleDurationChange);
          videoRef.current.addEventListener('error', handleNativeError);
          if (playing) videoRef.current.play().catch(e => console.error("Auto-play blocked", e));
          return () => {
              videoRef.current?.removeEventListener('loadedmetadata', handleLoadedMetadata);
              videoRef.current?.removeEventListener('durationchange', handleDurationChange);
              videoRef.current?.removeEventListener('error', handleNativeError);
          };
      }
  }, [currentSrc, isHls, useNativeLoader]);

  useEffect(() => {
      if (!isOfflineMode) return;
      let settled = false;
      const poll = setInterval(() => {
          if (settled || !videoRef.current) return;
          const d = videoRef.current.duration;
          if (d && isFinite(d) && d > 0 && d < 86399) {
              setDuration(d);
              settled = true;
              clearInterval(poll);
          }
      }, 500);
      return () => clearInterval(poll);
  }, [currentSrc, isOfflineMode]);

   useEffect(() => {
     currentTimeRef.current = currentTime;
     durationRef.current = duration;
   }, [currentTime, duration]);

  useEffect(() => {
    if (!item) return;

    // Reset iframe progress tracking baseline when item/season/episode shifts
    iframeStartTimeRef.current = startTime || 0;
    iframeLastTickRef.current = Date.now();

    const handleTimeUpdate = () => {
        if (castConnected) return;
        if (videoRef.current && !isDraggingRef.current && !isSeekingRef.current && !videoRef.current.seeking) {
             const cTime = videoRef.current.currentTime;
             const dur = videoRef.current.duration || 0;
             progressRef.current = { time: cTime, duration: dur };

             // FIX: Throttle state updates to max once per second.
             // Previously this fired every 250ms unconditionally, causing
             // 4 re-renders/sec even with the showControls guard.
             // Now only updates if time changed by ≥1s OR controls are visible
             // and time changed by ≥0.25s (for smooth scrubber movement).
             const prevTime = lastTimeUpdateStateRef.current;
             const timeDelta = Math.abs(cTime - prevTime);
             const threshold = showControlsRef.current ? 0.25 : 1.0;
             if (timeDelta >= threshold) {
               lastTimeUpdateStateRef.current = cTime;
               setCurrentTime(cTime);
             }
             // Only update duration if it actually changed (avoid redundant sets)
             if (dur > 0 && isFinite(dur) && dur < 86399 && Math.abs(dur - durationRef.current) > 1) {
               setDuration(dur);
             }
        }
    };

    const handlePause = () => {
        if (isSeekingRef.current || (videoRef.current && videoRef.current.seeking)) {
            if (videoRef.current && videoRef.current.paused) {
                setPlaying(false);
                setBuffering(false);
            }
            return;
        }
        setPlaying(false);
        setBuffering(false);
        const finalTime = castConnected ? currentTimeRef.current : progressRef.current.time;
        const finalDuration = castConnected ? durationRef.current : progressRef.current.duration;
        if (finalTime > 0 && finalDuration > 0) {
           WatchProgressService.saveProgress(item, finalTime, finalDuration, season, episode);
        }
    };

    const handleSeeking = () => {
        isSeekingRef.current = true;
    };

    const handleSeeked = () => {
        isSeekingRef.current = false;
        setBuffering(false);
        if (ignoreNextSeekedRef.current) {
          ignoreNextSeekedRef.current = false;
          return;
        }
        if (isPartyMode && partyChannelRef.current && !isRemoteSyncRef.current) {
          const finalTime = videoRef.current ? videoRef.current.currentTime : currentTime;
          broadcastSeek(finalTime);
        }
    };
    
    const setupListeners = () => {
        if (videoRef.current) {
            videoRef.current.addEventListener('timeupdate', handleTimeUpdate);
            videoRef.current.addEventListener('seeking', handleSeeking);
            videoRef.current.addEventListener('seeked', handleSeeked);
            videoRef.current.addEventListener('pause', handlePause);
            videoRef.current.addEventListener('play', () => { setPlaying(true); setBuffering(false); resetControlsTimeout(); });
            videoRef.current.addEventListener('waiting', () => setBuffering(true));
            videoRef.current.addEventListener('playing', () => setBuffering(false));
            videoRef.current.addEventListener('ended', handlePause);
            const initDur = videoRef.current.duration;
            if (initDur && isFinite(initDur) && initDur > 0 && initDur < 86399) setDuration(initDur);
        }
    };

    setupListeners();
    
    const handleVisibilityChange = () => {
        if (document.visibilityState === 'hidden') {
            if (iframeFallback || !!embedServer) {
               const now = Date.now();
               const deltaSeconds = (now - iframeLastTickRef.current) / 1000;
               const cappedDelta = Math.min(deltaSeconds, 45);
               
               const defaultDuration = (() => {
                 if (item) {
                   if ((item as any).runtime) {
                     return (item as any).runtime * 60;
                   }
                   if (Array.isArray((item as any).episodeRunTime) && (item as any).episodeRunTime.length > 0) {
                     return (item as any).episodeRunTime[0] * 60;
                   }
                 }
                 return (season || episode) ? 2700 : 7200;
               })();
               
               iframeStartTimeRef.current = Math.min(defaultDuration, iframeStartTimeRef.current + cappedDelta);
               iframeLastTickRef.current = now;
               
               if (iframeStartTimeRef.current > 0 && defaultDuration > 0) {
                   WatchProgressService.saveProgress(item, iframeStartTimeRef.current, defaultDuration, season, episode);
               }
            } else {
               const finalTime = castConnected ? currentTimeRef.current : progressRef.current.time;
               const finalDuration = castConnected ? durationRef.current : progressRef.current.duration;
               if (finalTime > 0 && finalDuration > 0) {
                   WatchProgressService.saveProgress(item, finalTime, finalDuration, season, episode);
               }
            }
        } else {
            iframeLastTickRef.current = Date.now();
        }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    const interval = setInterval(() => {
      if (castConnected) {
           if (currentTimeRef.current > 0 && durationRef.current > 0) {
               WatchProgressService.saveProgress(item, currentTimeRef.current, durationRef.current, season, episode);
           }
      } else if (videoRef.current) {
           const currentT = videoRef.current.currentTime;
           const dur = videoRef.current.duration;
           progressRef.current = { time: currentT, duration: dur };
           if (currentT > 0 && dur > 0) {
               WatchProgressService.saveProgress(item, currentT, dur, season, episode);
           }
      } else if (iframeFallback || !!embedServer) {
           const now = Date.now();
           const deltaSeconds = (now - iframeLastTickRef.current) / 1000;
           iframeLastTickRef.current = now;
           
           const defaultDuration = (() => {
             if (item) {
               if ((item as any).runtime) {
                 return (item as any).runtime * 60;
               }
               if (Array.isArray((item as any).episodeRunTime) && (item as any).episodeRunTime.length > 0) {
                 return (item as any).episodeRunTime[0] * 60;
               }
             }
             return (season || episode) ? 2700 : 7200;
           })();
           
           iframeStartTimeRef.current = Math.min(defaultDuration, iframeStartTimeRef.current + deltaSeconds);
           
           if (iframeStartTimeRef.current > 0 && defaultDuration > 0) {
               WatchProgressService.saveProgress(item, iframeStartTimeRef.current, defaultDuration, season, episode);
           }
      }
    }, 30000); 
 
    return () => {
        clearInterval(interval);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        if (videoRef.current) {
           videoRef.current.removeEventListener('timeupdate', handleTimeUpdate);
           videoRef.current.removeEventListener('seeking', handleSeeking);
           videoRef.current.removeEventListener('seeked', handleSeeked);
           videoRef.current.removeEventListener('pause', handlePause);
           videoRef.current.removeEventListener('ended', handlePause);
        }
        
        if (iframeFallback || !!embedServer) {
           const now = Date.now();
           const deltaSeconds = (now - iframeLastTickRef.current) / 1000;
           const cappedDelta = Math.min(deltaSeconds, 45);
           
           const defaultDuration = (() => {
             if (item) {
               if ((item as any).runtime) {
                 return (item as any).runtime * 60;
               }
               if (Array.isArray((item as any).episodeRunTime) && (item as any).episodeRunTime.length > 0) {
                 return (item as any).episodeRunTime[0] * 60;
               }
             }
             return (season || episode) ? 2700 : 7200;
           })();
           
           iframeStartTimeRef.current = Math.min(defaultDuration, iframeStartTimeRef.current + cappedDelta);
           
           if (iframeStartTimeRef.current > 0 && defaultDuration > 0) {
               WatchProgressService.saveProgress(item, iframeStartTimeRef.current, defaultDuration, season, episode);
           }
        } else {
           const finalTime = castConnected ? currentTimeRef.current : progressRef.current.time;
           const finalDuration = castConnected ? durationRef.current : progressRef.current.duration;
           if (finalTime > 0 && finalDuration > 0) {
                WatchProgressService.saveProgress(item, finalTime, finalDuration, season, episode);
           }
        }
    };
  }, [item, season, episode, castConnected, iframeFallback, embedServer]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isLocked) return;

      const activeEl = document.activeElement;
      const isInteractive = activeEl && (
        activeEl.tagName === 'BUTTON' || 
        activeEl.tagName === 'INPUT' || 
        activeEl.tagName === 'SELECT' || 
        activeEl.getAttribute('tabindex') !== null ||
        activeEl.classList.contains('tv-focusable')
      );

      // In TV Mode, if the user is focusing an interactive control element,
      // let standard D-Pad focus navigation and button clicks execute naturally.
      if (isTVMode() && isInteractive) {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Enter') {
          // Keep controls visible when interacting
          setShowControls(true);
          resetControlsTimeout();
          return;
        }
      }
      
      // Auto-show controls on any keydown event
      setShowControls(true);
      resetControlsTimeout();

      switch(e.key) {
          case ' ':
          case 'Enter': 
              e.preventDefault();
              togglePlay();
              break;
          case 'ArrowLeft': 
              e.preventDefault();
              handleRewind();
              break;
          case 'ArrowRight': 
              e.preventDefault();
              handleForward();
              break;
          case 'ArrowUp': 
              e.preventDefault();
              setVolume(prev => {
                const nextVolume = Math.min(1.0, prev + 0.1);
                if (videoRef.current) videoRef.current.volume = nextVolume;
                return nextVolume;
              });
              break;
          case 'ArrowDown':
              e.preventDefault();
              setVolume(prev => {
                const nextVolume = Math.max(0.0, prev - 0.1);
                if (videoRef.current) videoRef.current.volume = nextVolume;
                return nextVolume;
              });
              break;
          case 'f':
          case 'F':
              e.preventDefault();
              toggleFullScreen();
              break;
          case 'Escape':
              if (showSettings) {
                setShowSettings(false);
              } else {
                onClose();
              }
              break;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [playing, castConnected, currentTime, duration, isLocked, showSettings, onClose]);

  // Resume local playback at correct currentTime when disconnecting from Chromecast
  const prevCastConnectedRef = useRef(castConnected);
  useEffect(() => {
    if (prevCastConnectedRef.current && !castConnected && videoRef.current) {
      console.log("[LocalVideoPlayer] Disconnected from Chromecast. Resuming locally at:", currentTime);
      videoRef.current.currentTime = currentTime;
      if (playing) {
        videoRef.current.play().catch((e: any) => console.warn("Failed to resume local playback after casting:", e));
      }
    }
    prevCastConnectedRef.current = castConnected;
  }, [castConnected, playing, currentTime]);

  const handleTrackSelect = async (index: number) => {
    if (index === -1) {
      localStorage.setItem('cinemovie_preferred_subtitle_lang', 'none');
      setServerActiveTrackIndices(prev => ({ ...prev, [selectedServer]: -1 }));
      if (onTracksChange) {
        const currentServerTracks = serverSubtitleTracks[selectedServer] || [];
        const disabledTracks = currentServerTracks.map(t => ({ ...t, default: false }));
        onTracksChange(disabledTracks);
      }
      setShowSettings(false);
      resetControlsTimeout();
      return;
    }

    const currentServerTracks = serverSubtitleTracks[selectedServer] || [];
    const track = currentServerTracks[index];
    if (!track) return;
    
    localStorage.setItem('cinemovie_preferred_subtitle_lang', track.label || 'en');
    setLastAttemptedTrack(track);

    if (track.file.startsWith('blob:')) {
      setServerActiveTrackIndices(prev => ({ ...prev, [selectedServer]: index }));
      if (onTracksChange) {
        const updated = currentServerTracks.map((t, idx) => ({
          ...t,
          default: idx === index
        }));
        onTracksChange(updated);
      }
      setShowSettings(false);
      resetControlsTimeout();
      return;
    }

    setSubtitleError(null);
    setLoadingSubtitleIndex(index);
    try {
      let text = '';
      if (Capacitor.isNativePlatform()) {
        const isLocal = track.file.startsWith('capacitor://') || 
                        track.file.startsWith('http://localhost/') || 
                        track.file.startsWith('https://localhost/') || 
                        track.file.includes('_app_file_') ||
                        track.file.includes('_capacitor_file_');
        if (isLocal) {
          console.log('[LocalVideoPlayer] Mobile native platform: reading local subtitle natively:', track.file);
          try {
            const { Filesystem, Encoding } = await import('@capacitor/filesystem');
            let fileAtPath = track.file;
            if (fileAtPath.includes('_capacitor_file_')) {
              fileAtPath = fileAtPath.substring(fileAtPath.indexOf('_capacitor_file_') + 16);
            } else if (fileAtPath.includes('_app_file_')) {
              fileAtPath = fileAtPath.substring(fileAtPath.indexOf('_app_file_') + 10);
            }
            fileAtPath = decodeURIComponent(fileAtPath);
            console.log('[LocalVideoPlayer] Native file path decoded:', fileAtPath);

            const fileData = await Filesystem.readFile({
              path: fileAtPath,
              encoding: Encoding.UTF8
            });
            text = fileData.data;
          } catch (readErr: any) {
            console.warn('[LocalVideoPlayer] Filesystem.readFile failed, falling back to fetch:', readErr);
            const res = await fetch(track.file);
            if (res.ok) {
              text = await res.text();
            } else {
              throw new Error(`Local fetch status ${res.status}`);
            }
          }
        } else {
          console.log('[LocalVideoPlayer] Mobile native platform: fetching subtitle with CapacitorHttp to bypass CORS:', track.file);
          const nativeFetch = await import('../../../../utils/nativeFetch');
          const res = await nativeFetch.fetchWithCapacitor(track.file, 'text');
          if (res.ok) {
            text = await res.text();
          } else {
            throw new Error('Native request returned status');
          }
        }
      } else {
        const proxyUrl = getSubtitleProxyUrl(track.file);
        console.log('[LocalVideoPlayer] Resolving subtitle CORS via proxy:', proxyUrl);
        const res = await fetch(proxyUrl);
        if (res.ok) {
          text = await res.text();
        } else {
          throw new Error(`HTTP ${res.status}`);
        }
      }
      
      let vttContent = text;
      
      if (track.file.toLowerCase().includes('.srt') || !text.trim().startsWith('WEBVTT')) {
        vttContent = convertSrtToVtt(text);
      }
      
      const blob = new Blob([vttContent], { type: 'text/vtt' });
      const objectUrl = URL.createObjectURL(blob);
      
      let updatedTracks: any[] = [];
      setServerSubtitleTracks(prev => {
        const nextTracks = [...(prev[selectedServer] || [])];
        if (nextTracks[index]) {
          nextTracks[index] = {
            ...nextTracks[index],
            file: objectUrl,
            originalFile: (nextTracks[index] as any).originalFile || nextTracks[index].file
          } as any;
        }
        updatedTracks = nextTracks;
        return {
          ...prev,
          [selectedServer]: nextTracks
        };
      });
      setServerActiveTrackIndices(prev => ({ ...prev, [selectedServer]: index }));
      
      if (onTracksChange && updatedTracks.length > 0) {
        const tracksForCast = updatedTracks.map((t, idx) => ({
          ...t,
          default: idx === index
        }));
        onTracksChange(tracksForCast);
      }
      setShowSettings(false);
    } catch (e) {
      console.error('[LocalVideoPlayer] Subtitle proxy resolution failed:', e);
      setSubtitleError(`Failed to load "${track.label || 'subtitle'}" track due to network or CORS issues.`);
    } finally {
      setLoadingSubtitleIndex(null);
      resetControlsTimeout();
    }
  };

  const handleQualitySelect = (index: number) => {
      if (hlsRef.current && selectedServer !== 'vidsrc-wtf-2') {
          const hls = hlsRef.current;
          const levels = hls.levels || [];
          const selectedHeight = levels[index]?.height ?? 0;
          const mobileCap = (hls as any).__mobileLevelCap ?? -1;

          // If user is manually picking a level above the mobile cap (e.g. 1080p)
          // clear the cap so ABR doesn't fight back and revert to 720p after a stall.
          if (IS_MOBILE_DEVICE && mobileCap !== -1 && index > mobileCap) {
              hls.autoLevelCapping = -1; // Remove cap — user explicitly wants high quality
          } else if (IS_MOBILE_DEVICE && index === -1 && mobileCap !== -1) {
              // User switching back to AUTO — restore the safe mobile cap
              hls.autoLevelCapping = mobileCap;
          }

          if (index === -1) {
              // AUTO mode — let ABR decide
              hls.nextLevel = -1;
              hls.loadLevel = -1;
          } else {
              // Manual level — use nextLevel for a smooth buffer-boundary switch
              // (avoids an immediate full buffer flush that causes the 1-2s freeze).
              // Also set loadLevel so the download target is correct immediately.
              hls.nextLevel = index;
              hls.loadLevel = index;
              // currentLevel will be updated automatically by HLS.js once the
              // next segment at the new quality is appended to the SourceBuffer.
          }

          setCurrentQuality(index);
          setServerCurrentQuality(prev => ({ ...prev, [selectedServer]: index }));
          setShowSettings(false);
          resetControlsTimeout();
      } else if (index === -1 || availableSources[index]) {
          const idxToUse = index === -1 ? 0 : index;
          if (availableSources[idxToUse]) {
              const selectedSource = availableSources[idxToUse].url;
              const savedTime = videoRef.current ? videoRef.current.currentTime : currentTime;
              
              import('../../../../utils/haptics').then(m => m.triggerHaptic('medium'));
              pendingSeekTimeRef.current = savedTime > 5 ? savedTime : null;
              
              setCurrentSrc(selectedSource);
              setCurrentQuality(index);
              setServerCurrentQuality(prev => ({ ...prev, [selectedServer]: index }));
              setShowSettings(false);
              resetControlsTimeout();
          }
          setShowSettings(false);
          resetControlsTimeout();
      }
  };


  const handleMouseClick = (e: React.MouseEvent) => {
    if (iframeFallback || embedServer) return; // Allow pass-through to third-party player controls
    if (isLocked) {
      handleLockedScreenTap(e);
      return;
    }
    e.stopPropagation();
    
    // Discard simulated mouse events on touch devices
    if (Date.now() - lastTouchTimeRef.current < 1000) {
      return;
    }
    
    const now = Date.now();
    if (now - lastMouseTapTimeRef.current < 300) {
      // Clear single click timeout on double-click
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
        clickTimeoutRef.current = null;
      }
      lastMouseTapTimeRef.current = 0;
    } else {
      lastMouseTapTimeRef.current = now;
      clickTimeoutRef.current = setTimeout(() => {
        if (lastMouseTapTimeRef.current === now) {
          toggleControlsVisibility();
          lastMouseTapTimeRef.current = 0;
        }
      }, 300);
    }
  };

  const handleMouseMove = () => {
    if (isLocked) return;
    resetControlsTimeout();
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (isLocked || iframeFallback || !!embedServer) return;
    
    e.stopPropagation();
    const container = containerRef.current;
    if (!container) return;
    
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;
    
    if (x < width * 0.4) {
      handleRewind();
    } else if (x > width * 0.6) {
      handleForward();
    }
  };

  return (
    <div 
      ref={containerRef}
      tabIndex={0}
      style={{ 
        width: '100%', 
        height: '100%', 
        position: 'relative', 
        overflow: 'hidden', 
        backgroundColor: '#000000',
        outline: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        cursor: IS_MOBILE_DEVICE ? 'default' : (showControls ? 'default' : 'none'),
        ['--subtitle-bg-opacity' as any]: subtitleBgOpacity,
        ['--subtitle-color' as any]: subtitleColor,
        ['--subtitle-font-size' as any]: 
          subtitleSize === 'small' ? '0.9rem' : 
          subtitleSize === 'normal' ? '1.1rem' : 
          subtitleSize === 'large' ? '1.3rem' : '1.6rem',
        ['--subtitle-position' as any]: `${subtitlePosition - (showControls ? 85 : 0)}px`,
      }}
      onClick={handleMouseClick}
      onMouseMove={handleMouseMove}
      onDoubleClick={handleDoubleClick}
    >
      {/* Simulated Brightness Overlay */}
      <div 
        style={{
          position: 'absolute',
          inset: 0,
          background: '#000000',
          opacity: 1 - brightness,
          pointerEvents: 'none',
          zIndex: 9999,
          transition: 'opacity 0.1s ease-out'
        }}
      />

      {/* Main Casting UI or Fallback Player */}
      {castConnected ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#09090b', gap: '32px', zIndex: 1 }}>
             <div style={{ position: 'relative' }}>
                <img 
                 src={item?.backdropPath ? `https://image.tmdb.org/t/p/w500${item.backdropPath}` : '/fallback-backdrop.jpg'} 
                 alt="Casting Background" 
                 style={{ width: '160px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}
                />
                <div style={{ 
                  position: 'absolute', bottom: '-15px', right: '-15px', 
                  background: '#ffffff', borderRadius: '50%', width: '40px', height: '40px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                   <svg width="24" height="24" viewBox="0 0 24 24" fill="black"><path d="M21,3H3C1.9,3,1,3.9,1,5v3h2V5h18v14h-7v2h7c1.1,0,2-0.9,2-2V5C23,3.9,22.1,3,21,3z M1,18v3h3C4,19.34,2.66,18,1,18z M1,14v2c2.76,0,5,2.24,5,5h2C8,17.13,4.87,14,1,14z M1,10v2c4.97,0,9,4.03,9,9h2C12,14.92,7.07,10,1,10z"/></svg>
                </div>
             </div>
             <div>
                 <h3 style={{ margin: '0 0 8px', color: '#fff', fontSize: '1.4rem', fontWeight: 700 }}>Playing on TV</h3>
                 <p style={{ margin: 0, color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem' }}>{title}</p>
             </div>
          </div>
      ) : (iframeFallback || embedServer) ? (
        <iframe
          src={
            (() => {
              const currentSrv = embedServer || selectedServer;
              const imdbId = (item as any)?.imdbId || (item as any)?.imdb_id;
              const idToUse = imdbId || item?.id;

               if (currentSrv === 'vidsrc-top') {
                return season || episode
                  ? `https://vid-src.top/embed/tv/${idToUse}/${season}/${episode}`
                  : `https://vid-src.top/embed/movie/${idToUse}`;
              }
              if (currentSrv === 'vidsrc-sbs') {
                return season || episode
                  ? `https://vidsrc.sbs/embed/tv/${item?.id}/${season}/${episode}`
                  : `https://vidsrc.sbs/embed/movie/${item?.id}`;
              }
              if (currentSrv === 'vidsrc-wtf-1') {
                return season || episode
                  ? `https://vidsrc.wtf/1/tv/${idToUse}/${season}/${episode}?color=3b82f6`
                  : `https://vidsrc.wtf/1/movie/${idToUse}?color=3b82f6`;
              }
              if (currentSrv === 'vidsrc-wtf-2') {
                return season || episode
                  ? `https://vidsrc.wtf/2/tv/${idToUse}/${season}/${episode}?color=3b82f6`
                  : `https://vidsrc.wtf/2/movie/${idToUse}?color=3b82f6`;
              }
              if (currentSrv === 'vidsrc-wtf-3') {
                return season || episode
                  ? `https://vidsrc.wtf/3/tv/${idToUse}/${season}/${episode}?color=3b82f6`
                  : `https://vidsrc.wtf/3/movie/${idToUse}?color=3b82f6`;
              }
              if (currentSrv === 'vidsrc-wtf-4') {
                return season || episode
                  ? `https://vidsrc.wtf/4/tv/${idToUse}/${season}/${episode}?color=3b82f6`
                  : `https://vidsrc.wtf/4/movie/${idToUse}?color=3b82f6`;
              }
              if (currentSrv === 'vidsrc-pk') {
                return season || episode
                  ? `https://embed.vidsrc.pk/tv/${idToUse}/${season}-${episode}`
                  : `https://embed.vidsrc.pk/movie/${idToUse}`;
              }
              if (currentSrv === 'vidsrc-fyi') {
                return season || episode
                  ? `https://vidsrc.fyi/embed/tv/${idToUse}/${season}/${episode}`
                  : `https://vidsrc.fyi/embed/movie/${idToUse}`;
              }
              if (currentSrv === 'universal' || currentSrv === 'test-server') {
                return season || episode
                  ? `https://vidsrc.to/embed/tv/${item?.id}/${season}/${episode}`
                  : `https://vidsrc.to/embed/movie/${item?.id}`;
              }
              const gw = currentSrv === 'vidlink-me' 
                ? 'https://vidlink.me' 
                : 'https://vidlink.pro';
              return season || episode
                ? `${gw}/tv/${item?.id}/${season}/${episode}?primaryColor=ffffff&nextbutton=true`
                : `${gw}/movie/${item?.id}?primaryColor=ffffff`;
            })()
          }
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            backgroundColor: '#000000',
            zIndex: 10012,
            position: 'absolute',
            inset: 0,
            pointerEvents: 'auto'
          }}
          allowFullScreen
          allow="autoplay; encrypted-media; picture-in-picture"
        />
      ) : (
        <video 
            ref={videoRef}
            style={{ 
              width: '100%', 
              height: '100%', 
              objectFit: aspectRatio === 'fill' ? 'cover' : 'contain',
              transform: aspectRatio === 'zoom' ? `scale(${zoomScale})` : undefined,
              transformOrigin: aspectRatio === 'zoom' ? 'center center' : undefined
            }}
            playsInline
            crossOrigin="anonymous"
        >
            {activeTrackIndex !== -1 && localTracks[activeTrackIndex] && (
                <track 
                    key={localTracks[activeTrackIndex].file}
                    kind="subtitles"
                    label={localTracks[activeTrackIndex].label || 'Active Subtitle'}
                    srcLang={localTracks[activeTrackIndex].label ? localTracks[activeTrackIndex].label.substring(0, 2).toLowerCase() : 'en'}
                    src={localTracks[activeTrackIndex].file}
                    default
                    onLoad={() => {
                        console.log('[LocalVideoPlayer] Track loaded successfully');
                        if (videoRef.current && videoRef.current.textTracks) {
                            const textTracks = videoRef.current.textTracks;
                            const trackElement = videoRef.current.querySelector('track');
                            const sideLoadedTrack = trackElement ? trackElement.track : null;
                            for (let i = 0; i < textTracks.length; i++) {
                                const textTrack = textTracks[i];
                                if (sideLoadedTrack && textTrack === sideLoadedTrack) {
                                    textTrack.mode = 'showing';
                                } else {
                                    textTrack.mode = 'hidden';
                                }
                            }
                        }
                    }}
                    onError={(e) => {
                        console.error('[LocalVideoPlayer] Track failed to load:', e);
                    }}
                />
            )}
        </video>
      )}

      {/* Gestures UI rippling indicators, brightness/volume HUD, aspect ratio HUD */}
      {rippleLeft && (
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: '180px',
          background: 'radial-gradient(circle at left center, rgba(255, 255, 255, 0.2) 0%, transparent 70%)',
          borderTopRightRadius: '100% 50%', borderBottomRightRadius: '100% 50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center', paddingRight: '40px',
          color: '#ffffff', zIndex: 10006, pointerEvents: 'none',
          animation: 'rippleWaveLeft 0.5s cubic-bezier(0.1, 0.8, 0.3, 1) both'
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
            <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
              <path d="M11 17l-5-5 5-5M18 17l-5-5 5-5"/>
            </svg>
            <span style={{ fontSize: '0.9rem', fontWeight: 900 }}>10s</span>
          </div>
        </div>
      )}

      {rippleRight && (
        <div style={{
          position: 'absolute', right: 0, top: 0, bottom: 0, width: '180px',
          background: 'radial-gradient(circle at right center, rgba(255, 255, 255, 0.2) 0%, transparent 70%)',
          borderTopLeftRadius: '100% 50%', borderBottomLeftRadius: '100% 50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center', paddingLeft: '40px',
          color: '#ffffff', zIndex: 10006, pointerEvents: 'none',
          animation: 'rippleWaveRight 0.5s cubic-bezier(0.1, 0.8, 0.3, 1) both'
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
            <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
              <path d="M13 17l5-5-5-5M6 17l5-5-5-5"/>
            </svg>
            <span style={{ fontSize: '0.9rem', fontWeight: 900 }}>10s</span>
          </div>
        </div>
      )}

      {/* Horizontal Swipe to Seek HUD */}
      {horizontalSeekTime !== null && (
        <div style={{
          position: 'absolute', top: '30%', left: '50%', transform: 'translate(-50%, -50%)',
          background: 'rgba(15, 15, 15, 0.85)',
          border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '16px', padding: '16px 28px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
          zIndex: 10009, color: '#ffffff',
          pointerEvents: 'none', animation: 'fadeInScaleCentered 0.15s ease-out'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.5rem', fontWeight: 800 }}>{formatTime(horizontalSeekTime)}</span>
            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: horizontalSeekTime >= currentTime ? '#4ade80' : '#f87171' }}>
              {horizontalSeekTime >= currentTime ? '+' : ''}{formatTime(Math.abs(horizontalSeekTime - currentTime))}
            </span>
          </div>
          <div style={{ width: '160px', height: '4px', background: 'rgba(255, 255, 255, 0.2)', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ width: `${(horizontalSeekTime / (duration || 1)) * 100}%`, height: '100%', background: '#ffffff' }} />
          </div>
          <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>Swipe to scrub • Release to seek</span>
        </div>
      )}

      {/* Central Zoom & Aspect Ratio Badge */}
      {showZoomBadge && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          background: 'rgba(255, 255, 255, 0.95)', color: '#000000', padding: '12px 24px',
          borderRadius: '24px', fontSize: '0.9rem', fontWeight: 800,
          zIndex: 10009, pointerEvents: 'none', display: 'flex', alignItems: 'center', gap: '8px',
          animation: 'fadeInScaleCentered 0.2s cubic-bezier(0.16, 1, 0.3, 1) both'
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <rect x="3" y="5" width="18" height="14" rx="2" ry="2"/>
            <polyline points="9 17 9 13 5 13"/>
            <polyline points="15 7 15 11 19 11"/>
          </svg>
          {aspectRatio === 'fit' && 'Aspect Ratio: Fit'}
          {aspectRatio === 'fill' && 'Aspect Ratio: Fill Screen'}
          {aspectRatio === 'zoom' && `Zoom: ${Math.round(zoomScale * 100) / 100}x`}
        </div>
      )}

      {/* Initial Loading Screen */}
      {isInitialLoading && !isSwitchingServer && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 10045, background: '#000000',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '20px',
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <img 
            src="/cinemovie-logo.png" 
            alt="Cinemovie" 
            style={{ 
              height: '80px', 
              width: 'auto', 
              objectFit: 'contain',
            }} 
          />
          {/* Simple, sleek, professional spinner */}
          <div style={{
            width: '32px',
            height: '32px',
            border: '2px solid rgba(255, 255, 255, 0.1)',
            borderTopColor: '#ffffff',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
            marginTop: '10px'
          }} />
        </div>
      )}

      {/* Volume & Brightness HUD */}
      {activeSlider === 'brightness' && (
        <div style={{
          position: 'absolute', left: '40px', top: '50%', transform: 'translateY(-50%)',
          width: '40px', height: '200px', background: 'rgba(15, 15, 15, 0.75)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: '16px 0', gap: '12px', zIndex: 10008,
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
            <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
          </svg>
          <div style={{ flex: 1, width: '4px', background: 'rgba(255, 255, 255, 0.2)', borderRadius: '2px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${brightness * 100}%`, background: '#ffffff', borderRadius: '2px' }} />
          </div>
          <span style={{ color: '#fff', fontSize: '0.75rem', fontWeight: 800 }}>{Math.round(brightness * 100)}%</span>
        </div>
      )}

      {activeSlider === 'volume' && (
        <div style={{
          position: 'absolute', right: '40px', top: '50%', transform: 'translateY(-50%)',
          width: '40px', height: '200px', background: 'rgba(15, 15, 15, 0.75)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: '16px 0', gap: '12px', zIndex: 10008,
          animation: 'fadeIn 0.2s ease-out'
        }}>
          {volume === 0 ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
          ) : volume < 0.5 ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
          )}
          <div style={{ flex: 1, width: '4px', background: 'rgba(255, 255, 255, 0.2)', borderRadius: '2px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${volume * 100}%`, background: '#ffffff', borderRadius: '2px' }} />
          </div>
          <span style={{ color: '#fff', fontSize: '0.75rem', fontWeight: 800 }}>{Math.round(volume * 100)}%</span>
        </div>
      )}

      {isHoldingSpeed && (
        <div style={{
          position: 'absolute',
          top: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(0, 0, 0, 0.8)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: '20px',
          padding: '6px 16px',
          color: '#ffffff',
          fontSize: '0.82rem',
          fontWeight: 800,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          zIndex: 10008,
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          pointerEvents: 'none',
          animation: 'fadeIn 0.15s ease-out'
        }}>
          <span>▶▶</span>
          <span>2X Speed</span>
        </div>
      )}

      {/* Connecting Full Screen Server switcher Overlay */}
      {isSwitchingServer && (
        <div className="player-server-loader">
          {/* Spacer to push content to middle */}
          <div style={{ height: '10px', visibility: 'hidden' }} />

          {/* Loading content in the middle */}
          <div className="player-server-loader-content">
            <div className="player-server-loader-spinner" />
            <span className="player-server-loader-text">
              Loading...
            </span>
          </div>

          {/* Cancel button at the bottom */}
          <button
            className="player-server-loader-cancel"
            onClick={(e) => {
              e.stopPropagation();
              import('../../../../utils/haptics').then(m => m.triggerHaptic('medium'));
              handleCancelServerSwitch();
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Buffering Loading Indicator */}
      {(buffering || resolving) && !isSwitchingServer && !showControls && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 10005 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
                  <div style={{ width: '50px', height: '50px', border: '4px solid rgba(255,255,255,0.2)', borderTopColor: '#ffffff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  {resolving && <div style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 600 }}>Resolving for TV...</div>}
              </div>
          </div>
      )}



      {/* Split Control overlays component */}
      {/* FIX: Replaced Framer Motion AnimatePresence+motion.div with a plain CSS
           opacity/visibility transition. The controls already have their own
           CSS transitions internally. This removes framer-motion layout-effect
           overhead on every show/hide cycle, which was expensive on low-end GPUs. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 10010,
          opacity: (!isInitialLoading && showControls) ? 1 : 0,
          visibility: (!isInitialLoading && showControls) ? 'visible' : 'hidden',
          transition: 'opacity 0.25s ease-out, visibility 0.25s ease-out',
          pointerEvents: (!isInitialLoading && showControls) ? 'auto' : 'none',
        }}
      >
        <PlayerControls
          showControls={showControls}
          iframeFallback={iframeFallback || !!embedServer}
          onClose={onClose}
          title={title}
          isOfflineMode={isOfflineMode}
          playbackSpeed={playbackSpeed}
          isLocked={isLocked}
          setIsLocked={setIsLocked}
          setShowControls={setShowControls}
          setSettingsTab={setSettingsTab}
          setShowSettings={setShowSettings}
          isCastAvailable={isCastAvailable}
          castConnected={castConnected}
          handleCastClick={handleCastClick}
          resolving={resolving}
          playing={playing}
          togglePlay={togglePlay}
          buffering={buffering}
          handleRewind={handleRewind}
          handleForward={handleForward}
          currentTime={currentTime}
          duration={duration}
          isFullscreen={isFullscreen}
          toggleFullScreen={toggleFullScreen}
          videoRef={videoRef}
          remotePlayerRef={remotePlayerRef}
          remotePlayerControllerRef={remotePlayerControllerRef}
          isDraggingRef={isDraggingRef}
          controlsTimeout={controlsTimeout}
          resetControlsTimeout={resetControlsTimeout}
          setCurrentTime={setCurrentTime}
          onNextEpisode={onNextEpisode}
          isPartyMode={isPartyMode}
          partyParticipants={partyParticipants}
          onBroadcastSeek={broadcastSeek}
          hostControlsLocked={isPartyMode && SettingsService.get('hostControlsOnly') && !isPartyHost}
          aspectRatio={aspectRatio}
          setAspectRatio={setAspectRatio}
          zoomScale={zoomScale}
          setZoomScale={setZoomScale}
          item={item}
          logoUrl={logoUrl}
        />
      </div>


      {/* Screen Lock Overlay */}
      {isLocked && (
        <div 
          onClick={handleLockedScreenTap}
          onTouchStart={handleLockedScreenTap}
          style={{
            position: 'absolute', inset: 0, zIndex: 10015, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: showUnlockIndicator ? 'rgba(0,0,0,0.45)' : 'transparent', transition: 'background 0.3s ease', pointerEvents: 'auto'
          }}
        >
          {showUnlockIndicator && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                import('../../../../utils/haptics').then(m => m.triggerSuccessHaptic());
                setIsLocked(false);
                setShowUnlockIndicator(false);
                resetControlsTimeout();
              }}
              style={{
                background: '#ffffff', border: 'none', color: '#000000', padding: '16px 28px', borderRadius: '30px',
                fontSize: '0.95rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '10px',
                cursor: 'pointer', animation: 'fadeInScaleCentered 0.25s ease-out'
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 9.9-1"/>
              </svg>
              Unlock Controls
            </button>
          )}
        </div>
      )}



      {/* Settings Panel sheet */}
      <PlayerSettings
        showSettings={showSettings}
        setShowSettings={setShowSettings}
        settingsTab={settingsTab}
        setSettingsTab={setSettingsTab}
        selectedServer={selectedServer}
        handleServerChange={handleServerChange}
        isSwitchingServer={isSwitchingServer}
        connectingServerName={connectingServerName}
        serverError={serverError}
        handleCancelServerSwitch={handleCancelServerSwitch}
        qualities={qualities}
        currentQuality={currentQuality}
        handleQualitySelect={handleQualitySelect}
        localTracks={localTracks}
        activeTrackIndex={activeTrackIndex}
        handleTrackSelect={handleTrackSelect}
        loadingSubtitleIndex={loadingSubtitleIndex}
        subtitleError={subtitleError}
        lastAttemptedTrack={lastAttemptedTrack}
        handleAlternativeSearch={handleAlternativeSearch}
        isOfflineMode={isOfflineMode}
        item={item}
        season={season}
        episode={episode}
        subtitleDelay={subtitleDelay}
        setSubtitleDelay={setSubtitleDelay}
        subtitlePosition={subtitlePosition}
        setSubtitlePosition={setSubtitlePosition}
        subtitleSize={subtitleSize}
        setSubtitleSize={setSubtitleSize}
        subtitleColor={subtitleColor}
        setSubtitleColor={setSubtitleColor}
        subtitleBgOpacity={subtitleBgOpacity}
        setSubtitleBgOpacity={setSubtitleBgOpacity}
        handleCustomSubtitleUpload={handleCustomSubtitleUpload}
        isSearchingOnline={isSearchingOnline}
        setIsSearchingOnline={setIsSearchingOnline}
        onlineProvider={onlineProvider}
        setOnlineProvider={setOnlineProvider}
        searchLang={searchLang}
        setSearchLang={setSearchLang}
        onlineSubs={onlineSubs}
        searchingSubs={searchingSubs}
        onlineSearchError={onlineSearchError}
        apiKey={apiKey}
        setApiKey={setApiKey}
        username={username}
        setUsername={setUsername}
        password={password}
        setPassword={setPassword}
        isCredentialsSaved={isCredentialsSaved}
        setIsCredentialsSaved={setIsCredentialsSaved}

        handleOnlineSubtitleSearch={handleOnlineSubtitleSearch}
        handleOnlineSubtitleDownload={handleOnlineSubtitleDownload}
        playbackSpeed={playbackSpeed}
        setPlaybackSpeed={setPlaybackSpeed}
        isDownloading={isDownloading}
        downloadProgress={downloadProgress}
        downloadStatus={downloadStatus}
        handleDownloadOffline={handleDownloadOffline}
        handleCancelDownload={handleCancelDownload}
        setOnlineSearchError={setOnlineSearchError}
        setOnlineSubs={setOnlineSubs}
        vidlinkDiagnostics={vidlinkDiagnostics}
        vidsrcPmDiagnostics={vidsrcPmDiagnostics}
        testServerDiagnostics={testServerDiagnostics}
        currentSrc={currentSrc}
      />

      {/* Toast Alert Feedback HUD */}
      <AnimatePresence>
        {playerToast && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 280 }}
            style={{
              position: 'absolute', top: 'calc(24px + env(safe-area-inset-top, 0px))', left: '50%', zIndex: 10020,
              background: playerToast.isError ? 'rgba(239, 68, 68, 0.25)' : 'rgba(18, 18, 22, 0.7)',
              border: playerToast.isError ? '1px solid rgba(239, 68, 68, 0.45)' : '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '16px', padding: '14px 24px',
              display: 'flex', alignItems: 'center', gap: '12px', maxWidth: '90%', width: 'max-content', pointerEvents: 'none'
            }}
          >
            {playerToast.isError ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10"/><polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
            )}
            <span style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 800, letterSpacing: '-0.1px', lineHeight: 1.4 }}>
              {playerToast.message}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {playing && (
        <div
          style={{
            position: 'absolute',
            width: '1px',
            height: '1px',
            top: '-10px',
            left: '-10px',
            opacity: 0.001,
            pointerEvents: 'none',
            willChange: 'transform',
            animation: 'force-compositor 0.05s linear infinite'
          }}
        />
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        @keyframes force-compositor {
          0% { transform: translate3d(0, 0, 0) rotate(0deg); }
          100% { transform: translate3d(0, 0, 0) rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
