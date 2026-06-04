import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Hls from 'hls.js';
import { buildNativeHlsLoader } from '../../../../services/NativeHlsLoader';

import { WatchProgressService } from '../../../../services/progress';
import type { Movie, TVShow } from '../../../../types';
import { getLocalServerUrl } from '../../../../services/LocalStreamService';
import { useOfflineDownloader } from './useOfflineDownloader';
import { usePlayerGestures } from './usePlayerGestures';
import { PlayerSettings } from './PlayerSettings';
import { PlayerControls } from './PlayerControls';
import { Capacitor } from '@capacitor/core';
import { scrapeVidlinkStream, scrapeVidsrcFallback, scrapeVidifyStream } from '../../../../services/ClientScraperService';
import { WatchTogetherService, type PartyParticipant, type PartySyncEvent } from '../../../../services/watchTogether';
import { supabase } from '../../../../services/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { ProfileService } from '../../../../services/profiles';
import { SettingsService } from '../../../../services/settings';

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
  isPartyMode = false,
  partySessionId = null,
  isPartyHost = false
}: LocalVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showControls, setShowControls] = useState(true);
  const controlsTimeout = useRef<NodeJS.Timeout | null>(null);
  const lastMouseTapTimeRef = useRef<number>(0);
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const progressRef = useRef<{time: number, duration: number}>({time: 0, duration: 0});
  const hlsRef = useRef<Hls | null>(null);
  
  // Dynamic stream / server selector states
  const [currentSrc, setCurrentSrc] = useState(src);
  const [selectedServer, setSelectedServer] = useState<'vidlink-pro' | 'vidlink-me' | 'universal'>('vidlink-pro');
  const [isSwitchingServer, setIsSwitchingServer] = useState(false);
  const [connectingServerName, setConnectingServerName] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const pendingSeekTimeRef = useRef<number | null>(null);
  const serverSwitchAbortControllerRef = useRef<AbortController | null>(null);
  const [useNativeLoader, setUseNativeLoader] = useState(false);

  // Premium In-Player Toast state
  const [playerToast, setPlayerToast] = useState<{ message: string; isError?: boolean } | null>(null);
  const [iframeFallback, setIframeFallback] = useState(false);
  const [embedServer, setEmbedServer] = useState<string | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  // --- Real-Time Co-Watching State ---
  const [partyParticipants, setPartyParticipants] = useState<PartyParticipant[]>([]);
  const partyChannelRef = useRef<RealtimeChannel | null>(null);
  const isRemoteSyncRef = useRef(false); // Prevents echo loops when receiving remote sync events
  const ignoreNextSeekedRef = useRef(false); // Prevents echo loops on received seeks/playback commands

  // Join the real-time sync channel when in party mode
  useEffect(() => {
    if (!isPartyMode || !partySessionId) return;

    let cancelled = false;
    let handleVisibilityChange: (() => void) | null = null;

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
            avatar: displayAvatar
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

  useEffect(() => {
    setCurrentSrc(src);
  }, [src]);

  useEffect(() => {
    setUseNativeLoader(false);
  }, [currentSrc]);

  const SERVER_DISPLAY_NAMES: Record<string, string> = {
    'vidlink-pro': 'Vidlink Pro',
    'vidlink-me': 'Vidlink Me (.m3u8)',
    'universal': 'Universal Player (.m3u8)'
  };

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

  const handleServerChange = async (serverId: 'vidlink-pro' | 'vidlink-me' | 'universal') => {
    if (isOfflineMode) {
      setPlayerToast({ message: 'You are watching in offline mode. Server switching is not available.', isError: true });
      return;
    }

    if (serverSwitchAbortControllerRef.current) {
      serverSwitchAbortControllerRef.current.abort();
    }

    const controller = new AbortController();
    serverSwitchAbortControllerRef.current = controller;

    import('../../../../utils/haptics').then(m => m.triggerHaptic('medium'));
    setSelectedServer(serverId);
    setIframeFallback(false);
    setEmbedServer(null);


    setIsSwitchingServer(true);
    setIsInitialLoading(true);
    setConnectingServerName(SERVER_DISPLAY_NAMES[serverId] || serverId);
    setServerError(null);
    setShowSettings(false);
    setCurrentSrc("");

    const savedTime = videoRef.current ? videoRef.current.currentTime : currentTime;
    pendingSeekTimeRef.current = savedTime > 5 ? savedTime : null;

    if (videoRef.current) {
      videoRef.current.pause();
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

      // On native mobile, all three scrapers run directly from the phone.
      // Segment Referer headers are injected natively by NativeHlsLoader — cloudnestra CDN is bypassed.
      if (Capacitor.isNativePlatform()) {
        console.log(`[LocalVideoPlayer] Client-side server switch on native mobile: Resolving ${serverId} for ${tmdbId}...`);
        try {
          if (serverId === 'vidlink-pro') {
            data = await scrapeVidlinkStream(String(tmdbId), type, season, episode, 'https://vidlink.pro');
            setVidlinkDiagnostics("Success: resolved stream sources successfully.");
          } else if (serverId === 'vidlink-me') {
            data = await scrapeVidlinkStream(String(tmdbId), type, season, episode, 'https://vidlink.me');
          } else if (serverId === 'universal') {
            try {
              console.log("[LocalVideoPlayer] Universal server: trying Client VidSrc scraper...");
              data = await scrapeVidsrcFallback(String(tmdbId), type === 'tv', season, episode);
            } catch (vidsrcErr) {
              console.warn("[LocalVideoPlayer] Client VidSrc failed, trying Client Vidify scraper...", vidsrcErr);
              data = await scrapeVidifyStream(String(tmdbId), type === 'tv', season, episode);
            }
          }
        } catch (scrapingErr: any) {
          console.warn(`[LocalVideoPlayer] Native client resolution error for ${serverId}:`, scrapingErr.message);
          if (serverId === 'vidlink-pro') {
            setVidlinkDiagnostics(scrapingErr.message);
          }
          throw scrapingErr;
        }
        
        if (data && data.sources && Array.isArray(data.sources) && data.sources.length > 0) {
          bestSource = data.sources[0].url;
          setAvailableSources(data.sources);
          if (!data.sources[0].isM3U8) {
            const directQualities = data.sources.map((s: any, idx: number) => ({
              height: parseInt(s.quality) || 1080,
              index: idx
            }));
            setQualities(directQualities);
            setCurrentQuality(0);
          } else {
            setQualities([]);
            setCurrentQuality(-1);
          }
        }
      } else {
        // On web/desktop, route through the Express server proxy.
        let watchUrl = `${localServer}/meta/tmdb/watch/${tmdbId}?type=${type}&server=${serverId === 'universal' ? 'auto' : serverId}&title=${encodeURIComponent(titleToUse)}`;
        if (isTV) {
          watchUrl += `&s=${season}&e=${episode}`;
        }
        
        console.log('[LocalVideoPlayer] Requesting server switch via Express:', watchUrl);
        let res;
        try {
          res = await fetch(watchUrl, { signal: controller.signal });
        } catch (fetchErr: any) {
          if (serverId === 'vidlink-pro') {
            setVidlinkDiagnostics(`Failed to connect to local server: ${fetchErr.message}`);
          }
          throw fetchErr;
        }
  
        if (res.ok) {
          data = await res.json();
          bestSource = data.sources?.[0]?.url;
          
          if (serverId === 'vidlink-pro') {
            setVidlinkDiagnostics("Success: Resolved stream sources via localized server.");
          }

          if (data.sources && Array.isArray(data.sources) && data.sources.length > 0) {
            setAvailableSources(data.sources);
            if (!data.sources[0].isM3U8) {
              const directQualities = data.sources.map((s: any, idx: number) => ({
                height: parseInt(s.quality) || 1080,
                index: idx
              }));
              setQualities(directQualities);
              setCurrentQuality(0);
            } else {
              setQualities([]);
              setCurrentQuality(-1);
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
          if (serverId === 'vidlink-pro') {
            setVidlinkDiagnostics(finalErrMsg);
          }
          throw new Error(finalErrMsg);
        }
      }
      
      if (!bestSource) {
        throw new Error('No streaming sources found. The server may be temporarily unavailable.');
      }

      console.log('[LocalVideoPlayer] Successfully resolved server stream:', bestSource);
      setCurrentSrc(bestSource);
      if (onSourceChange) {
        onSourceChange(bestSource);
      }
      
      if (data.subtitles && Array.isArray(data.subtitles) && data.subtitles.length > 0) {
        const newTracks = data.subtitles.map((sub: any) => ({
          file: sub.url,
          label: sub.lang || 'Unknown',
          kind: 'subtitles',
          default: (sub.lang || '').toLowerCase().includes('english')
        }));
        setServerSubtitleTracks(prev => ({
          ...prev,
          [serverId]: newTracks
        }));
        setServerActiveTrackIndices(prev => ({
          ...prev,
          [serverId]: -1
        }));
      } else {
        const imdbId = (item as any)?.imdbId;
        if (type === 'movie' && imdbId) {
          try {
            console.log('[LocalVideoPlayer] Server returned empty subtitles. Fetching YTS subtitles automatically...');
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
                setServerSubtitleTracks(prev => ({
                  ...prev,
                  [serverId]: newTracks
                }));
                setServerActiveTrackIndices(prev => ({
                  ...prev,
                  [serverId]: -1
                }));
                console.log(`[LocalVideoPlayer] Auto-loaded ${newTracks.length} fallback YTS subtitles`);
              }
            }
          } catch (e) {
            console.warn('[LocalVideoPlayer] Failed to auto-fetch YTS subtitles:', e);
          }
        }
      }
      
      setShowSettings(false);
      resetControlsTimeout();
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('[LocalVideoPlayer] Server switch fetch aborted.');
        return;
      }
      console.error('[LocalVideoPlayer] Failed to switch server:', err);
      setServerError(err.message || 'Resolution failed. Please try another server.');
      setShowSettings(true);
      setIsInitialLoading(false);
      setIsSwitchingServer(false);
    } finally {
      if (!controller.signal.aborted) {
        setIsSwitchingServer(false);
        setConnectingServerName(null);
      }
    }
  };

  const triggerAutoFailover = () => {
    if (isOfflineMode) return;
    const servers: ('vidlink-pro' | 'vidlink-me' | 'universal')[] = ['vidlink-pro', 'vidlink-me', 'universal'];
    const currentIndex = servers.indexOf(selectedServer);
    const nextIndex = currentIndex + 1;
    if (nextIndex < servers.length) {
      const nextServer = servers[nextIndex];
      setPlayerToast({
        message: `Connection to ${SERVER_DISPLAY_NAMES[selectedServer]} failed. Switching to ${SERVER_DISPLAY_NAMES[nextServer]}...`,
        isError: true
      });
      console.log(`[LocalVideoPlayer] Playback auto-failover: ${selectedServer} -> ${nextServer}`);
      handleServerChange(nextServer);
    } else if (!iframeFallback && !embedServer) {
      setPlayerToast({
        message: 'All localized stream servers failed to respond. Launching web fallback...',
        isError: true
      });
      console.log('[LocalVideoPlayer] Playback auto-failover: All servers exhausted. Triggering iframeFallback.');
      setIframeFallback(true);
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

  // Server subtitle settings memory
  const [serverSubtitleTracks, setServerSubtitleTracks] = useState<Record<string, { file: string; label: string; kind: string; default?: boolean }[]>>({
    'vidlink-pro': [],
    'vidlink-me': [],
    'universal': []
  });
  const [serverActiveTrackIndices, setServerActiveTrackIndices] = useState<Record<string, number>>({
    'vidlink-pro': -1,
    'vidlink-me': -1,
    'universal': -1
  });

  // Subtitle styling customizations
  const [subtitleSize, setSubtitleSize] = useState<'small' | 'normal' | 'large' | 'xlarge'>('normal');
  const [subtitleColor, setSubtitleColor] = useState<string>('#ffffff');
  const [subtitleBgOpacity, setSubtitleBgOpacity] = useState<number>(0.6);
  const [subtitleDelay, setSubtitleDelay] = useState<number>(0);
  const [subtitlePosition, setSubtitlePosition] = useState<number>(-40);

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
      if (tracks && tracks.length > 0) {
        setServerSubtitleTracks(prev => ({
          ...prev,
          'vidlink-pro': tracks
        }));
        setServerActiveTrackIndices(prev => ({
          ...prev,
          'vidlink-pro': -1
        }));
      } else {
        setServerSubtitleTracks(prev => ({
          ...prev,
          'vidlink-pro': []
        }));
        setServerActiveTrackIndices(prev => ({
          ...prev,
          'vidlink-pro': -1
        }));
      }
    };
    
    initTracks();
  }, [tracks]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !video.textTracks) return;

    const syncTracks = () => {
      const textTracks = video.textTracks;
      const trackElement = video.querySelector('track');
      const sideLoadedTrack = trackElement ? trackElement.track : null;

      for (let i = 0; i < textTracks.length; i++) {
        const textTrack = textTracks[i];
        if (sideLoadedTrack && textTrack === sideLoadedTrack) {
          textTrack.mode = 'showing';
        } else {
          textTrack.mode = 'hidden';
        }
      }
    };

    syncTracks();
    const timer = setTimeout(syncTracks, 100);
    return () => clearTimeout(timer);
  }, [localTracks, activeTrackIndex]);

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
        const imdbId = (item as any)?.imdbId;
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
      } else if (provider === 'subdl') {
        if (!subdlKey.trim()) throw new Error('SubDL API Key is required.');
        const localServer = getLocalServerUrl();
        const imdbId = (item as any)?.imdbId;
        
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
      }
    } catch (e: any) {
      console.error('[LocalVideoPlayer] Online subtitle search error:', e);
      setOnlineSearchError(e.message || 'An error occurred while searching.');
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

  const handleOnlineSubtitleDownload = async (sub: any) => {
    setSearchingSubs(true);
    setOnlineSearchError(null);
    try {
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
      
      const langObj = LANGUAGES.find(l => l.code === searchLang);
      const langLabel = langObj ? langObj.name : 'Online';
      const providerLabel = onlineProvider === 'yify' ? 'YIFY' : onlineProvider === 'subdl' ? 'SubDL' : 'OpenSubs';
      const label = `${langLabel} (Online - ${providerLabel})`;
      
      const newTrack = {
        file: objectUrl,
        label,
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
  const isHls = currentSrc.includes('.m3u8') || currentSrc.startsWith('blob:') || isOfflineMode;
  const isDraggingRef = useRef(false);
  const isSeekingRef = useRef(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  const checkControlAllowed = (): boolean => {
    if (isPartyMode && SettingsService.get('hostControlsOnly') && !isPartyHost) {
      setPlayerToast({ message: 'Playback controls are locked by the host', isError: true });
      return false;
    }
    return true;
  };

  const togglePlay = async (e?: any) => {
    e?.stopPropagation();
    if (!checkControlAllowed()) return;
    
    let nextPlayingState = false;
    if (castConnected && remotePlayerControllerRef.current) {
        remotePlayerControllerRef.current.playPause();
        nextPlayingState = !remotePlayerRef.current.isPaused;
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
      containerRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
    resetControlsTimeout();
  };

  const resetControlsTimeout = () => {
    if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
    setShowControls(true);
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
    handleLockedScreenTap
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
    if (isHls && Hls.isSupported()) return;

    if (startTime && startTime > 10 && videoRef.current && !seekedOnStartRef.current) {
      const handleReadyToSeek = () => {
        if (videoRef.current && !seekedOnStartRef.current) {
          videoRef.current.currentTime = startTime;
          setCurrentTime(startTime);
          seekedOnStartRef.current = true;
          console.log('[LocalVideoPlayer] Native player seeked to initial startTime:', startTime);
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
            if (!data.sources[0].isM3U8) {
              const directQualities = data.sources.map((s, idx) => ({
                height: parseInt(s.quality) || 1080,
                index: idx
              }));
              setQualities(directQualities);
              const currentIdx = data.sources.findIndex(s => s.url === currentSrc || s.url === src);
              setCurrentQuality(currentIdx !== -1 ? currentIdx : 0);
            }
          }
        })
        .catch(e => console.warn('[LocalVideoPlayer] Failed to pre-fetch qualities:', e));
    }
  }, [src, item?.id]);

  // Handle HLS Playback Setup
  useEffect(() => {
      if (!currentSrc) return;
      if (videoRef.current && isHls) {
          if (Hls.isSupported()) {
              const startPos = pendingSeekTimeRef.current !== null 
                  ? pendingSeekTimeRef.current 
                  : (startTime && startTime > 10 ? startTime : -1);
              
              if (pendingSeekTimeRef.current !== null) {
                  pendingSeekTimeRef.current = null;
              }

              let playStarted = false;
              const loadTimeout = setTimeout(() => {
                  if (!playStarted && !useNativeLoader && Capacitor.isNativePlatform()) {
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

              console.log(`[LocalVideoPlayer] Instantiating Hls.js. useNativeLoader = ${useNativeLoader}`);
              const hls = new Hls({ 
                startPosition: startPos,
                loader: useNativeLoader 
                  ? buildNativeHlsLoader((Hls as any).DefaultConfig.loader)
                  : (Hls as any).DefaultConfig.loader,
              });

              hlsRef.current = hls;
              hls.loadSource(currentSrc);
              hls.attachMedia(videoRef.current);
              
              hls.on(Hls.Events.ERROR, (event, data) => {
                  console.error('[LocalVideoPlayer] Hls.js error:', data);
                  if (!data.fatal) return;

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

                      const hlsErrorMsg = `HLS Stream Error [${data.details}]: The resolved direct file is failing to load. ` +
                        (data.response ? `Response Code: ${data.response.code}. ` : "") +
                        "This generally happens when the video hosting server blocks the request (e.g. invalid referer, security tokens expired, or Cloudflare WAF block).";
                      console.error('[LocalVideoPlayer]', hlsErrorMsg);
                      if (selectedServer === 'vidlink-pro') {
                        setVidlinkDiagnostics(hlsErrorMsg);
                      }
                      setServerError(hlsErrorMsg);
                      setIsInitialLoading(false);
                      setIsSwitchingServer(false);
                      setBuffering(false);
                      setShowSettings(true);
                      return;
                  }

                  switch (data.type) {
                      case Hls.ErrorTypes.NETWORK_ERROR:
                          // Transient network hiccup (segment failed, etc.) — try recovering
                          console.warn('[LocalVideoPlayer] Fatal HLS network error, attempting to recover loading...');
                          hls.startLoad();
                          break;
                      case Hls.ErrorTypes.MEDIA_ERROR:
                          console.warn('[LocalVideoPlayer] Fatal HLS media error, attempting to recover media element...');
                          hls.recoverMediaError();
                          break;
                      default:
                          const unrecoverableMsg = `Fatal Playback Error [${data.type} / ${data.details}].`;
                          if (selectedServer === 'vidlink-pro') {
                            setVidlinkDiagnostics(unrecoverableMsg);
                          }
                          setServerError(unrecoverableMsg);
                          setIsInitialLoading(false);
                          setIsSwitchingServer(false);
                          setBuffering(false);
                          setShowSettings(true);
                          break;
                  }
              });

              hls.on(Hls.Events.MANIFEST_PARSED, () => {
                  markStarted();
                  setBuffering(false);
                  setIsInitialLoading(false);
                  const levels = hls.levels.map((l, i) => ({ height: l.height, index: i }));
                  setQualities(levels);
                  if (startPos > 10) {
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
                  if (!isOfflineMode) triggerAutoFailover();
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
              if (!isOfflineMode) triggerAutoFailover();
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

  const currentTimeRef = useRef(currentTime);
  const durationRef = useRef(duration);
  useEffect(() => {
    currentTimeRef.current = currentTime;
    durationRef.current = duration;
  }, [currentTime, duration]);

  useEffect(() => {
    if (!item) return;

    let lastUpdateTime = 0;

    const handleTimeUpdate = () => {
        if (videoRef.current && !isDraggingRef.current && !isSeekingRef.current && !videoRef.current.seeking) {
             const cTime = videoRef.current.currentTime;
             const dur = videoRef.current.duration || 0;
             progressRef.current = { time: cTime, duration: dur };

             const now = Date.now();
             // Throttle state re-renders to once every 1000ms during passive playback to ensure smooth 60 FPS
             if (now - lastUpdateTime >= 1000) {
                 setCurrentTime(cTime);
                 if (dur > 0 && isFinite(dur) && dur < 86399) setDuration(dur);
                 lastUpdateTime = now;
             }
        }
    };

    const handlePause = () => {
        setPlaying(false);
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
            const finalTime = castConnected ? currentTimeRef.current : progressRef.current.time;
            const finalDuration = castConnected ? durationRef.current : progressRef.current.duration;
            if (finalTime > 0 && finalDuration > 0) {
                WatchProgressService.saveProgress(item, finalTime, finalDuration, season, episode);
            }
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
        const finalTime = castConnected ? currentTimeRef.current : progressRef.current.time;
        const finalDuration = castConnected ? durationRef.current : progressRef.current.duration;
        if (finalTime > 0 && finalDuration > 0) {
               WatchProgressService.saveProgress(item, finalTime, finalDuration, season, episode);
        }
    };
  }, [item, season, episode, castConnected]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isLocked) return;
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
              setShowControls(true);
              resetControlsTimeout();
              break;
          case 'ArrowDown':
              e.preventDefault();
              setVolume(prev => {
                const nextVolume = Math.max(0.0, prev - 0.1);
                if (videoRef.current) videoRef.current.volume = nextVolume;
                return nextVolume;
              });
              setShowControls(true);
              resetControlsTimeout();
              break;
          case 'f':
          case 'F':
              e.preventDefault();
              toggleFullScreen();
              break;
          case 'Escape':
              if (showSettings) {
                setShowSettings(false);
                resetControlsTimeout();
              }
              break;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [playing, castConnected, currentTime, duration, isLocked, showSettings]);

  const handleTrackSelect = async (index: number) => {
    if (index === -1) {
      setServerActiveTrackIndices(prev => ({ ...prev, [selectedServer]: -1 }));
      setShowSettings(false);
      resetControlsTimeout();
      return;
    }

    const currentServerTracks = serverSubtitleTracks[selectedServer] || [];
    const track = currentServerTracks[index];
    if (!track) return;
    
    setLastAttemptedTrack(track);

    if (track.file.startsWith('blob:')) {
      setServerActiveTrackIndices(prev => ({ ...prev, [selectedServer]: index }));
      setShowSettings(false);
      resetControlsTimeout();
      return;
    }

    setSubtitleError(null);
    setLoadingSubtitleIndex(index);
    try {
      const proxyUrl = getSubtitleProxyUrl(track.file);
      console.log('[LocalVideoPlayer] Resolving subtitle CORS via proxy:', proxyUrl);
      const res = await fetch(proxyUrl);
      if (res.ok) {
        const text = await res.text();
        let vttContent = text;
        
        if (track.file.toLowerCase().includes('.srt') || !text.trim().startsWith('WEBVTT')) {
          vttContent = convertSrtToVtt(text);
        }
        
        const blob = new Blob([vttContent], { type: 'text/vtt' });
        const objectUrl = URL.createObjectURL(blob);
        
        setServerSubtitleTracks(prev => {
          const nextTracks = [...(prev[selectedServer] || [])];
          if (nextTracks[index]) {
            nextTracks[index] = {
              ...nextTracks[index],
              file: objectUrl
            };
          }
          return {
            ...prev,
            [selectedServer]: nextTracks
          };
        });
        setServerActiveTrackIndices(prev => ({ ...prev, [selectedServer]: index }));
        setShowSettings(false);
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (e) {
      console.error('[LocalVideoPlayer] Subtitle proxy resolution failed:', e);
      setSubtitleError(`Failed to load "${track.label || 'subtitle'}" track due to network or CORS issues.`);
    } finally {
      setLoadingSubtitleIndex(null);
      resetControlsTimeout();
    }
  };

  const handleQualitySelect = (index: number) => {
      if (hlsRef.current) {
          hlsRef.current.currentLevel = index;
          setCurrentQuality(index);
          setShowSettings(false);
          resetControlsTimeout();
      } else if (availableSources[index]) {
          const selectedSource = availableSources[index].url;
          const savedTime = videoRef.current ? videoRef.current.currentTime : currentTime;
          
          import('../../../../utils/haptics').then(m => m.triggerHaptic('medium'));
          pendingSeekTimeRef.current = savedTime > 5 ? savedTime : null;
          
          setCurrentSrc(selectedSource);
          setCurrentQuality(index);
          setShowSettings(false);
          resetControlsTimeout();
      }
  };

  const handleMouseClick = (e: React.MouseEvent) => {
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
    if (isLocked) return;
    e.stopPropagation();

    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;

    const isLeft = x < width * 0.4;
    const isRight = x > width * 0.6;

    if (isLeft) {
      handleRewind();
    } else if (isRight) {
      handleForward();
    } else {
      toggleFullScreen();
    }
  };

  return (
    <div 
      ref={containerRef}
      style={{ 
        width: '100%', 
        height: '100%', 
        position: 'relative', 
        overflow: 'hidden', 
        backgroundColor: '#000000',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        cursor: showControls ? 'default' : 'none',
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
              if (currentSrv === 'universal') {
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
            zIndex: 1
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
              transform: aspectRatio === 'zoom' ? `scale(${zoomScale})` : 'scale(1)',
              transition: 'transform 0.3s ease, object-fit 0.3s ease',
              transformOrigin: 'center center'
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
              height: '240px', 
              width: 'auto', 
              objectFit: 'contain',
              marginTop: '-40px',
              marginBottom: '-50px',
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

      {/* Connecting Full Screen Server switcher Overlay */}
      {isSwitchingServer && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 10050, background: 'rgba(0, 0, 0, 0.88)',
          backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '20px',
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <div style={{ position: 'relative', width: '64px', height: '64px' }}>
            <div style={{ position: 'absolute', inset: 0, border: '3px solid rgba(255,255,255,0.1)', borderRadius: '50%' }} />
            <div style={{ position: 'absolute', inset: 0, border: '3px solid transparent', borderTopColor: '#ffffff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2">
                <rect x="2" y="2" width="20" height="8" rx="2" ry="2"/>
                <rect x="2" y="14" width="20" height="8" rx="2" ry="2"/>
                <line x1="6" y1="6" x2="6.01" y2="6"/>
                <line x1="6" y1="18" x2="6.01" y2="18"/>
              </svg>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: '#ffffff', fontSize: '1rem', fontWeight: 700 }}>Connecting to {connectingServerName}...</span>
            <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.78rem', fontWeight: 500 }}>Resolving stream, please wait</span>
          </div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'rgba(255,255,255,0.4)', animation: `fadeIn 0.6s ease-in-out ${i * 0.2}s infinite alternate` }} />
            ))}
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); handleCancelServerSwitch(); }}
            style={{ marginTop: '12px', padding: '8px 18px', background: 'rgba(255, 255, 255, 0.08)', border: '1px solid rgba(255, 255, 255, 0.12)', borderRadius: '10px', color: '#ffffff', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}
          >
            Cancel Switch
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
      {!isInitialLoading && (
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
        />
      )}

      {/* Floating Control Bar for direct Iframe fallback mode */}
      {iframeFallback && (
        <div style={{
          position: 'absolute', top: '24px', left: '24px', right: '24px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 10040, pointerEvents: 'none'
        }}>
          <button 
            onClick={onClose}
            style={{
              pointerEvents: 'auto', background: 'rgba(0, 0, 0, 0.7)',
              border: '1px solid rgba(255, 255, 255, 0.15)', borderRadius: '50%', width: '46px', height: '46px',
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#ffffff',
              transition: 'transform 0.1s'
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
            </svg>
          </button>

          <div style={{
            background: 'rgba(0, 0, 0, 0.7)',
            border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '20px', padding: '8px 20px',
            color: '#fff', fontSize: '0.85rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px'
          }}>
            <span style={{ display: 'inline-block', width: '8px', height: '8px', background: '#eab308', borderRadius: '50%', animation: 'fadeIn 0.8s ease-in-out infinite alternate' }} />
            <span>{selectedServer === 'vidlink-me' ? 'Vidlink Me Player (Embed Fallback)' : selectedServer === 'universal' ? 'Universal Player (Embed Fallback)' : 'Vidlink Pro Player (Embed Fallback)'}</span>
          </div>

          <button 
            onClick={() => { setSettingsTab('servers'); setShowSettings(true); }}
            style={{
              pointerEvents: 'auto', background: 'rgba(0, 0, 0, 0.7)',
              border: '1px solid rgba(255, 255, 255, 0.15)', borderRadius: '50%', width: '46px', height: '46px',
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#ffffff',
              transition: 'transform 0.1s'
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
        </div>
      )}

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
        downloadTrack={downloadTrack}
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
        saveOnlineSubtitleToDevice={saveOnlineSubtitleToDevice}
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

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
      `}</style>
    </div>
  );
}
