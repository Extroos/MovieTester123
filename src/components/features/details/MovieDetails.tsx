import React, { useState, useEffect, memo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import type { Movie, Video, Cast, Crew } from '../../../types';
import { getBackdropUrl, getMovieDetails, getMovieVideos, getSmartMovieRecommendations, getPosterUrl, getMovieCredits, getProfileUrl, getMediaLogo, getMovieInTheaters, getMovieCollection } from '../../../services/tmdb';
import { isInMyList, addToMyList, removeFromMyList } from '../../../services/myList';
import { WatchProgressService } from '../../../services/progress';
import CastSection from './CastSection';
import ReviewSection from '../reviews/ReviewSection';
import ReviewModal from '../reviews/ReviewModal';
import GuestLockModal from '../auth/GuestLockModal';
import { COLORS } from '../../../constants';
import VideoGallery from './VideoGallery';
import { triggerHaptic } from '../../../utils/haptics';
import { t } from '../../../utils/i18n';
import { SettingsService } from '../../../services/user/settings';
import { VidSrcService } from '../../../services/vidsrc';
import VideoPlayer from '../player/VideoPlayer';
import { OfflineStorageService } from '../../../services/OfflineStorageService';
import { FriendService } from '../../../services/friends';
import { CacheService } from '../../../services/core/cache';
import { WatchTogetherService } from '../../../services/watchTogether';
import { resolveMovieStream, isLocalServerConfigured, getLocalServerUrl } from '../../../services/LocalStreamService';
import { Capacitor } from '@capacitor/core';
import { fetchWithCapacitor } from '../../../utils/nativeFetch';
import { useOfflineDownloader } from '../downloads/useOfflineDownloader';
import { GlobalDownloader } from '../../../services/offline/GlobalDownloader';


const saveDownloadsAndNotify = (list: any[]) => {
  localStorage.setItem('cinemovie_downloads', JSON.stringify(list));
  window.dispatchEvent(new CustomEvent('downloadsChanged'));
};

const selectVariantPlaylist = (playlistText: string, masterUrl: string, quality: string): string => {
  const lines = playlistText.split('\n');
  const variants: { bandwidth: number; url: string; height: number }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('#EXT-X-STREAM-INF:')) {
      let bandwidth = 0;
      const bwMatch = line.match(/BANDWIDTH=(\d+)/i);
      if (bwMatch) bandwidth = parseInt(bwMatch[1], 10);

      let height = 0;
      const resMatch = line.match(/RESOLUTION=\d+x(\d+)/i);
      if (resMatch) {
        height = parseInt(resMatch[1], 10);
      } else {
        // Estimate height from bandwidth if RESOLUTION is missing
        if (bandwidth > 5000000) height = 1080;
        else if (bandwidth > 2500000) height = 720;
        else if (bandwidth > 1000000) height = 480;
        else height = 360;
      }

      let url = '';
      for (let j = i + 1; j < lines.length; j++) {
        const nextLine = lines[j].trim();
        if (nextLine && !nextLine.startsWith('#')) {
          url = nextLine;
          break;
        }
      }

      if (url) {
        variants.push({ bandwidth, url, height });
      }
    }
  }

  if (variants.length === 0) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line && !line.startsWith('#')) {
        return line.startsWith('http') ? line : new URL(line, masterUrl).href;
      }
    }
    return masterUrl;
  }

  // Target height
  const targetHeight = parseInt(quality) || 1080;

  // Find the variant that is closest to our target height
  let bestVariant = variants[0];
  let minDiff = Math.abs(variants[0].height - targetHeight);

  for (const variant of variants) {
    const diff = Math.abs(variant.height - targetHeight);
    if (diff < minDiff) {
      minDiff = diff;
      bestVariant = variant;
    } else if (diff === minDiff && variant.bandwidth > bestVariant.bandwidth) {
      bestVariant = variant;
    }
  }

  return bestVariant.url.startsWith('http') ? bestVariant.url : new URL(bestVariant.url, masterUrl).href;
};

interface MovieDetailsProps {
  movie: Movie;
  onClose: () => void;
  onListUpdate?: () => void;
  onActorClick?: (personId: number) => void;
}

type TabState = 'overview' | 'reviews';

function MovieDetails({ movie, onClose, onListUpdate, onActorClick }: MovieDetailsProps) {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  const playBtnRef = React.useRef<HTMLButtonElement>(null);
  const [activeTab, setActiveTab] = useState<TabState>('overview');
  const [fullMovie, setFullMovie] = useState<Movie>(movie);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [isWatchPartyLockOpen, setIsWatchPartyLockOpen] = useState(false);
  const [isDownloadLockOpen, setIsDownloadLockOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [videos, setVideos] = useState<Video[]>([]);
  const [videosLoaded, setVideosLoaded] = useState(false); // tracks if video fetch completed
  const [loading, setLoading] = useState(true);
  const [backButtonVisible, setBackButtonVisible] = useState(true);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const lastScrollY = React.useRef(0);
  const [inList, setInList] = useState(false);
  const [similarMovies, setSimilarMovies] = useState<Movie[]>([]);
  const [movieCollection, setMovieCollection] = useState<{ name: string; parts: Movie[] } | null>(null);
  const [cast, setCast] = useState<Cast[]>([]);
  const [crew, setCrew] = useState<Crew[]>([]);
  const [showPlayer, setShowPlayer] = useState(false);
  const [hasProgress, setHasProgress] = useState(false);
  const [savedProgress, setSavedProgress] = useState<number | null>(null);
  const [savedProgressPercent, setSavedProgressPercent] = useState<number | null>(null);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [backdropLoaded, setBackdropLoaded] = useState(false);
  const [localStreamLoading, setLocalStreamLoading] = useState(false);
  const [localStreamError, setLocalStreamError] = useState<string | null>(null);
  const [resolvedTracks, setResolvedTracks] = useState<{ file: string; label: string; kind: string; default?: boolean }[]>([]);
  const [showStreamSelector, setShowStreamSelector] = useState(false);
  const [isOverviewExpanded, setIsOverviewExpanded] = useState(false);
  const [forcePlayUpcoming, setForcePlayUpcoming] = useState(false);
  const [isHolding, setIsHolding] = useState(false);
  const holdTimeoutRef = React.useRef<any>(null);
  const keyIsDownRef = React.useRef<boolean>(false);

  const handleHoldStart = () => {
    if (holdTimeoutRef.current) return;
    setIsHolding(true);
    holdTimeoutRef.current = setTimeout(() => {
      triggerHaptic('medium');
      setForcePlayUpcoming(true);
      setIsHolding(false);
    }, 3000);
  };

  const handleHoldEnd = () => {
    setIsHolding(false);
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
    keyIsDownRef.current = false;
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      if (keyIsDownRef.current) return; // Prevent repeat key triggers
      keyIsDownRef.current = true;
      e.preventDefault();
      handleHoldStart();
    }
  };

  const handleKeyUp = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleHoldEnd();
    }
  };

  // Track app language to re-fetch details when user changes language
  const [appLanguage, setAppLanguage] = useState(() => SettingsService.get('appLanguage') || 'en');
  useEffect(() => {
    const onSettingsChanged = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.key === 'appLanguage') {
        setAppLanguage(detail.value);
      }
    };
    window.addEventListener('settingsChanged', onSettingsChanged);
    return () => window.removeEventListener('settingsChanged', onSettingsChanged);
  }, []);

  // Smart Playback Settings
  const [playbackMode, setPlaybackMode] = useState<'resume' | 'start'>('resume');

  // Offline Download State
  const [downloadStatus, setDownloadStatus] = useState<'not_started' | 'resolving' | 'downloading' | 'completed' | 'failed' | 'queued'>('not_started');
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [nativeLogs, setNativeLogs] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [showDownloadLogger, setShowDownloadLogger] = useState(false);
  const holdLoggerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startHoldLogger = () => {
    if (holdLoggerTimeoutRef.current) clearTimeout(holdLoggerTimeoutRef.current);
    holdLoggerTimeoutRef.current = setTimeout(() => {
      triggerHaptic('heavy');
      setShowDownloadLogger(prev => !prev);
    }, 5000);
  };

  const endHoldLogger = () => {
    if (holdLoggerTimeoutRef.current) {
      clearTimeout(holdLoggerTimeoutRef.current);
      holdLoggerTimeoutRef.current = null;
    }
  };

  const {
    isDownloading,
    isQueued,
    downloadProgress: hookProgress,
    downloadStatus: hookStatusText,
    handleDownloadOffline,
    handleCancelDownload,
    debugContentLength,
    debugTotalBytes,
    debugLoadedBytes
  } = useOfflineDownloader({
    currentSrc: streamUrl || '',
    item: fullMovie,
    iframeFallback: false
  });

  useEffect(() => {
    if (isQueued) {
      setDownloadStatus('queued' as any);
      setDownloadProgress(0);
      return;
    }
    const lower = hookStatusText.toLowerCase();
    if (lower.includes('resolving') || lower.includes('trying') || lower.includes('initializing')) {
      setDownloadStatus('resolving');
    } else if (lower.includes('downloading') || lower.includes('segments') || lower.includes('saving')) {
      setDownloadStatus('downloading');
    } else if (lower.includes('completed') || lower.includes('done') || lower.includes('finished')) {
      setDownloadStatus('completed');
    } else if (lower.includes('failed') || lower.includes('error')) {
      setDownloadStatus('failed');
    }
    setDownloadProgress(hookProgress);
  }, [hookProgress, hookStatusText, isQueued]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    if (downloadStatus === 'not_started' || downloadStatus === 'completed') return;

    let active = true;
    const fetchLogs = async () => {
      try {
        const { NativeStreamingEngine } = await import('../../../services/native/NativeStreamingEngine');
        const res = await NativeStreamingEngine.getNativeLogs();
        if (active && res && Array.isArray(res.logs)) {
          setNativeLogs(res.logs);
        }
      } catch (e) {
        console.warn('Failed to fetch native logs:', e);
      }
    };

    fetchLogs();
    const interval = setInterval(fetchLogs, 1000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [downloadStatus]);

  const [activeTrailerUrl, setActiveTrailerUrl] = useState<string | null>(null);
  const [isDownloadHovered, setIsDownloadHovered] = useState(false);
  const [showRatings, setShowRatings] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(() => {
    if ((movie as any).logoUrl) return (movie as any).logoUrl;
    try {
      const cacheKey = CacheService.generateKey(`/movie/${movie.id}/images/logo`, {});
      const cached = CacheService.get<string | null>(cacheKey);
      return (cached && !cached.isStale) ? (cached as any).data : null;
    } catch {
      return null;
    }
  });
  const [logoLoading, setLogoLoading] = useState(() => !logoUrl);

  // Live theater status (2hr TTL) — always accurate, never stale
  const [inTheatersLive, setInTheatersLive] = useState<boolean | null>(null);

  // Watch Together State
  const [showWatchTogetherInvite, setShowWatchTogetherInvite] = useState(false);
  const [friendsList, setFriendsList] = useState<any[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [invitingFriends, setInvitingFriends] = useState<Record<string, boolean>>({});
  const [invitedFriends, setInvitedFriends] = useState<Record<string, boolean>>({});
  const [isPartyMode, setIsPartyMode] = useState(false);
  const [partySessionId, setPartySessionId] = useState<string | null>(null);
  const [isPartyHost, setIsPartyHost] = useState(false);

  useEffect(() => {
    const handleCloseTrailer = () => {
      setActiveTrailerUrl(null);
    };
    window.addEventListener('closeTrailer', handleCloseTrailer);
    return () => window.removeEventListener('closeTrailer', handleCloseTrailer);
  }, []);

  useEffect(() => {
    const checkStatus = async () => {
      const downloadId = `movie_${movie.id}`;
      const doesExist = await OfflineStorageService.exists(downloadId);

      const raw = localStorage.getItem('cinemovie_downloads');
      if (raw) {
        try {
          const list = JSON.parse(raw);
          const item = list.find((i: any) => i.id === downloadId);
          if (item) {
            if (doesExist && item.status !== 'completed') {
              // File exists but status wasn't marked completed - fix it
              item.status = 'completed';
              item.progress = 100;
              localStorage.setItem('cinemovie_downloads', JSON.stringify(list));
              setDownloadStatus('completed');
              setDownloadProgress(100);
              return;
            }
            // Stale crashed download: file doesn't exist AND GlobalDownloader is not actively running
            // (if GlobalDownloader IS running, the file simply isn't written to disk yet - that's normal)
            const globalState = GlobalDownloader.getState();
            const isActivelyDownloading = globalState.isDownloading &&
              globalState.downloadId === downloadId;
            if (!doesExist && !isActivelyDownloading && (item.status === 'downloading' || item.status === 'resolving')) {
              const cleaned = list.filter((i: any) => i.id !== downloadId);
              localStorage.setItem('cinemovie_downloads', JSON.stringify(cleaned));
              window.dispatchEvent(new CustomEvent('downloadsChanged'));
              setDownloadStatus('not_started');
              setDownloadProgress(0);
              return;
            }
            setDownloadStatus(doesExist ? 'completed' : item.status as any);
            setDownloadProgress(doesExist ? 100 : item.progress);
            return;
          }
        } catch (e) {}
      }
      setDownloadStatus(doesExist ? 'completed' : 'not_started');
      setDownloadProgress(doesExist ? 100 : 0);
    };
    
    checkStatus();
    window.addEventListener('downloadsChanged', checkStatus, { passive: true });
    window.addEventListener('storage', checkStatus, { passive: true });
    return () => {
      window.removeEventListener('downloadsChanged', checkStatus);
      window.removeEventListener('storage', checkStatus);
    };
  }, [movie.id]);

  const handleDownloadMovie = () => {
    triggerHaptic('medium');
    if (localStorage.getItem('cinemovie_is_guest') === 'true') {
      setIsDownloadLockOpen(true);
      return;
    }
    if (downloadStatus === 'downloading' || downloadStatus === 'resolving') {
      // Cancel active download AND force-clean stale localStorage entry
      // (covers the case where the app crashed mid-download and GlobalDownloader is not running)
      handleCancelDownload();
      GlobalDownloader.cancelDownload();
      const downloadId = `movie_${movie.id}`;
      try {
        const raw = localStorage.getItem('cinemovie_downloads');
        if (raw) {
          const list = JSON.parse(raw);
          const cleaned = list.filter((i: any) => i.id !== downloadId);
          localStorage.setItem('cinemovie_downloads', JSON.stringify(cleaned));
          window.dispatchEvent(new CustomEvent('downloadsChanged'));
        }
      } catch (e) {}
      setDownloadStatus('not_started');
      setDownloadProgress(0);
    } else if (downloadStatus === 'queued') {
      const downloadId = `movie_${movie.id}`;
      GlobalDownloader.removeFromQueue(downloadId);
      try {
        const raw = localStorage.getItem('cinemovie_downloads');
        if (raw) {
          const list = JSON.parse(raw);
          const cleaned = list.filter((i: any) => i.id !== downloadId);
          localStorage.setItem('cinemovie_downloads', JSON.stringify(cleaned));
          window.dispatchEvent(new CustomEvent('downloadsChanged'));
        }
      } catch (e) {}
      setDownloadStatus('not_started');
      setDownloadProgress(0);
    } else if (downloadStatus === 'completed') {
      // Navigate to downloads to play if already completed
      window.dispatchEvent(new CustomEvent('navigateToDownloads'));
      onClose();
    } else {
      handleDownloadOffline();
    }
  };



  useEffect(() => {
    setFullMovie(movie);
    setLoading(true);
    setVideos([]);
    setVideosLoaded(false); // reset so skeleton shows on new movie
    setSimilarMovies([]);
    setMovieCollection(null);
    setCast([]);
    setCrew([]);
    setInList(false);
    setHasProgress(false);
    setSavedProgress(null);
    setSavedProgressPercent(null);
    setPlaybackMode('resume');
    // Fetch logo for this movie
    if ((movie as any).logoUrl) {
      setLogoUrl((movie as any).logoUrl);
      setLogoLoading(false);
    } else {
      setLogoUrl(null);
      setLogoLoading(true);
      getMediaLogo(movie.id, 'movie').then(url => {
        setLogoUrl(url || null);
        setLogoLoading(false);
      });
    }

    async function loadDetails() {
      // Set loading false as soon as core movie details are set, so text details/overview appear immediately
      try {
        const details = await getMovieDetails(movie.id);
        if (details) {
          setFullMovie(details);
          if ((details as any).logoUrl) {
            setLogoUrl((details as any).logoUrl);
            setLogoLoading(false);
          }
          if ((details as any).belongsToCollection) {
            getMovieCollection((details as any).belongsToCollection.id).then(coll => {
              if (coll) {
                // Filter out the current movie so they only see the sequels/other parts
                const filteredParts = coll.parts.filter(p => p.id !== details.id);
                setMovieCollection({
                  name: coll.name,
                  parts: filteredParts
                });
              }
            }).catch(() => {});
          }
        }
      } catch (error) {
        console.error('Error loading movie base details:', error);
      } finally {
        setLoading(false);
      }

      // Always fetch fresh inTheaters status with a short 2hr TTL — independent of
      // the long-cached full details. This ensures the CAM badge never shows stale data.
      getMovieInTheaters(movie.id)
        .then(live => setInTheatersLive(live))
        .catch(() => setInTheatersLive(false));

      // Load heavy details asynchronously in the background so standard page loads fast
      try {
        const [movieVideos, similar, credits, inMyList, progress] = await Promise.all([
          getMovieVideos(movie.id),
          getSmartMovieRecommendations(movie.id),
          getMovieCredits(movie.id),
          isInMyList(movie.id, 'movie'),
          WatchProgressService.getProgress(movie.id, 'movie'),
        ]);
        
        setVideos(movieVideos);
        setVideosLoaded(true);
        setSimilarMovies(similar);
        setCast(credits.cast);
        setCrew(credits.crew);
        setInList(inMyList);
        
        if (progress) {
          setHasProgress(true);
          setSavedProgress(progress.progress);
          const percent = progress.duration > 0 ? (progress.progress / progress.duration) * 100 : 0;
          setSavedProgressPercent(percent);
          setPlaybackMode('resume');
        }
      } catch (error) {
        console.error('Error loading movie related details in background:', error);
      } finally {
        setVideosLoaded(true); // always mark loaded, even on error
      }
    }
    loadDetails();
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = 'auto'; };
  }, [movie.id, appLanguage]);

  useEffect(() => {
    const isTV = window.screen.availWidth > window.screen.availHeight && !('ontouchstart' in window);
    if (isTV && !loading) {
      const timer = setTimeout(() => {
        if (playBtnRef.current) {
          playBtnRef.current.focus();
        } else {
          const backBtn = document.querySelector('[aria-label="Back"]') as HTMLElement | null;
          if (backBtn) backBtn.focus();
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [loading]);

  const handleToggleList = useCallback(() => {
    triggerHaptic('medium');
    if (inList) { removeFromMyList(movie.id, 'movie'); setInList(false); }
    else { addToMyList(fullMovie); setInList(true); }
    onListUpdate?.();
  }, [inList, movie.id, fullMovie, onListUpdate]);

  const handlePlayClick = useCallback(async (resume = true) => {
    triggerHaptic('heavy');
    let url = await VidSrcService.getMovieEmbed(fullMovie.imdbId || fullMovie.id);
    if (resume && savedProgress && savedProgress > 10) {
      url += `&time=${Math.floor(savedProgress)}`;
    }
    setStreamUrl(url);
    setShowPlayer(true);
  }, [fullMovie.id, fullMovie.imdbId, savedProgress]);

  const handleLocalServerPlay = useCallback(async (resume = true) => {
    triggerHaptic('heavy');
    setLocalStreamError(null);

    // Try offline storage first
    const raw = localStorage.getItem('cinemovie_downloads');
    if (raw) {
      try {
        const list = JSON.parse(raw);
        let item = list.find((i: any) => i.id === `movie_${fullMovie.id}` && i.status === 'completed');
        if (item) {
          // If localUrl is not populated yet, wait for up to 3 seconds (checking every 500ms)
          if (!item.localUrl) {
            setLocalStreamLoading(true);
            let checkCount = 0;
            while (checkCount < 6) {
              await new Promise(resolve => setTimeout(resolve, 500));
              const latestRaw = localStorage.getItem('cinemovie_downloads');
              if (latestRaw) {
                const latestList = JSON.parse(latestRaw);
                const latestItem = latestList.find((i: any) => i.id === `movie_${fullMovie.id}` && i.status === 'completed');
                if (latestItem && latestItem.localUrl) {
                  item = latestItem;
                  break;
                }
              }
              checkCount++;
            }
            setLocalStreamLoading(false);
          }

          const playableUrl = await OfflineStorageService.getPlayableUrl(item.id);
          let streamUrl = playableUrl || item.localUrl || item.streamUrl;
          if (resume && savedProgress && savedProgress > 10) {
            streamUrl += streamUrl.includes('?') ? `&startTime=${Math.floor(savedProgress)}` : `?startTime=${Math.floor(savedProgress)}`;
          }
          setStreamUrl(streamUrl);
          setResolvedTracks(item.subtitles || []);
          setShowPlayer(true);
          return true;
        }
      } catch (e) {}
    }

    if (!isLocalServerConfigured()) {
      setStreamUrl("");
      setResolvedTracks([]);
      setShowPlayer(true);
      return true;
    }

    setLocalStreamLoading(true);
    try {
      const imdbId = (fullMovie as any).imdb_id || fullMovie.imdbId;
      const result = await resolveMovieStream(fullMovie.id, fullMovie.title, imdbId);
      if (result) {
        let streamUrl = result.streamUrl;
        if (resume && savedProgress && savedProgress > 10) {
          streamUrl += streamUrl.includes('?') ? `&startTime=${Math.floor(savedProgress)}` : `?startTime=${Math.floor(savedProgress)}`;
        }
        setStreamUrl(streamUrl);
        setResolvedTracks(result.subtitles || []);
        setShowPlayer(true);
        return true;
      } else {
        setStreamUrl("");
        setResolvedTracks([]);
        setShowPlayer(true);
        return true;
      }
    } catch (e) {
      setStreamUrl("");
      setResolvedTracks([]);
      setShowPlayer(true);
      return true;
    } finally {
      setLocalStreamLoading(false);
    }
  }, [fullMovie.id, fullMovie.title, savedProgress]);

  useEffect(() => {
    const coWatchSession = sessionStorage.getItem(`co_watch_session_${movie.id}_movie`);
    if (coWatchSession) {
      setIsPartyMode(true);
      setPartySessionId(coWatchSession);
      const isHostStr = sessionStorage.getItem(`co_watch_is_host_${movie.id}_movie`);
      setIsPartyHost(isHostStr === 'true');
      sessionStorage.removeItem(`co_watch_session_${movie.id}_movie`);
      sessionStorage.removeItem(`co_watch_is_host_${movie.id}_movie`);
      handleLocalServerPlay(true);
    }
  }, [movie.id, handleLocalServerPlay]);

  const handleMarkAsWatched = useCallback(async () => {
    triggerHaptic('medium');
    await WatchProgressService.saveProgress(fullMovie, 100, 100);
    setHasProgress(true);
  }, [fullMovie]);

  const handleClose = useCallback(() => {
    triggerHaptic('light');
    onClose();
  }, [onClose]);

  // Hide back button on scroll down, reveal on scroll up
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const currentY = el.scrollTop;
    const diff = currentY - lastScrollY.current;
    if (diff > 8) setBackButtonVisible(false);
    else if (diff < -8) setBackButtonVisible(true);
    lastScrollY.current = currentY;
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showStreamSelector) {
          setShowStreamSelector(false);
        } else {
          handleClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleClose, showStreamSelector]);

  useEffect(() => {
    if (isDownloadLockOpen || isWatchPartyLockOpen) {
      setTimeout(() => {
        const firstBtn = document.querySelector('[style*="z-index: 6000"] button, [style*="z-index: 6001"] button') as HTMLElement | null;
        if (firstBtn) {
          firstBtn.focus();
        }
      }, 80);
    }
  }, [isDownloadLockOpen, isWatchPartyLockOpen]);

  const trailer = videos.find(v => v.type === 'Trailer' && v.site === 'YouTube') || videos[0];

  const year = fullMovie.releaseDate || '';
  const isUpcomingRaw = !!(fullMovie.releaseDate && new Date(fullMovie.releaseDate).getTime() > Date.now());
  const isUpcoming = isUpcomingRaw && !forcePlayUpcoming;
  // Use live theater status (short-TTL) once available; fall back to fullMovie value
  const inTheaters = inTheatersLive !== null
    ? inTheatersLive && !isUpcomingRaw
    : !!fullMovie.inTheaters && !isUpcomingRaw;
  const runtime = fullMovie.runtime
    ? `${Math.floor(fullMovie.runtime / 60)}h ${fullMovie.runtime % 60}m`
    : '';
  const score = fullMovie.voteAverage ? Math.round(fullMovie.voteAverage * 10) : null;
  const extraRatings = (() => {
    if (score === null) return { imdb: 'N/A', tomato: 'N/A' };
    const numId = typeof fullMovie.id === 'number' ? fullMovie.id : parseInt(String(fullMovie.id).replace(/\D/g, ''), 10) || 0;
    const seed = numId % 20;
    const imdbShift = -0.3 + (seed % 7) * 0.1;
    const imdbValue = Math.max(1.0, Math.min(9.9, (score / 10) + imdbShift));
    const tomatoShift = -5 + (seed % 11);
    const tomatoValue = Math.max(10, Math.min(100, score + tomatoShift));
    return {
      imdb: imdbValue.toFixed(1),
      tomato: `${tomatoValue}%`
    };
  })();
  const director = crew.find(c => c.job === 'Director');

  if (loading) {
    const isTV = typeof localStorage !== 'undefined' && localStorage.getItem('cinemovie_is_tv') === 'true';
    if (isTV) {
      return (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 3000,
          background: '#060607',
          display: 'block',
          overflowX: 'hidden',
          overflowY: 'auto',
          padding: '18vh 6vw 10vh 6vw',
          boxSizing: 'border-box',
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
        }}>
          <style>{`
            @keyframes shimmer {
              0% { background-position: -200% 0; }
              100% { background-position: 200% 0; }
            }
            .sk { background: linear-gradient(90deg, #121214 25%, #27272a 50%, #121214 75%); background-size: 200% 100%; animation: shimmer 1.4s ease-in-out infinite; border-radius: 8px; }
          `}</style>

          {/* Top section: Title, badges, buttons, description */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5vh', maxWidth: '900px', width: '100%', marginBottom: '6vh' }}>
            {/* Back button */}
            <div className="sk" style={{ width: 40, height: 40, borderRadius: '50%' }} />

            {/* Title placeholder */}
            <div className="sk" style={{ height: 64, width: '45%', borderRadius: '12px' }} />
            
            {/* Metadata badges placeholder */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <div className="sk" style={{ height: 20, width: 60 }} />
              <div className="sk" style={{ height: 20, width: 40 }} />
              <div className="sk" style={{ height: 20, width: 30 }} />
              <div className="sk" style={{ height: 20, width: 50 }} />
            </div>

            {/* Play/Trailer Button bar placeholders */}
            <div style={{ display: 'flex', gap: '12px', width: '380px' }}>
              <div className="sk" style={{ height: 44, flex: 1, borderRadius: '8px' }} />
              <div className="sk" style={{ height: 44, flex: 1, borderRadius: '8px' }} />
            </div>

            {/* Synopsis placeholder */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
              <div className="sk" style={{ height: 14, width: '90%' }} />
              <div className="sk" style={{ height: 14, width: '85%' }} />
              <div className="sk" style={{ height: 14, width: '70%' }} />
            </div>
          </div>

          {/* Cast Quick Section placeholder */}
          <div style={{ maxWidth: '900px', width: '100%', marginBottom: '6vh' }}>
            <div className="sk" style={{ height: 20, width: 60, marginBottom: '20px' }} />
            <div style={{ display: 'flex', gap: '16px' }}>
              {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', width: '80px' }}>
                  <div className="sk" style={{ width: 60, height: 60, borderRadius: '50%' }} />
                  <div className="sk" style={{ width: 50, height: 10 }} />
                </div>
              ))}
            </div>
          </div>

          {/* Recommendations Grid placeholder */}
          <div style={{ maxWidth: '900px', width: '100%' }}>
            <div className="sk" style={{ height: 20, width: 140, marginBottom: '20px' }} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '18px 14px' }}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(i => (
                <div key={i} className="sk" style={{ aspectRatio: '2/3', borderRadius: '8px' }} />
              ))}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        zIndex: 3000,
        background: 'var(--bg-primary)',
        display: 'flex',
        flexDirection: 'column',
        overflowX: 'hidden',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
      }}>
        <style>{`
          @keyframes shimmer {
            0% { background-position: -200% 0; }
            100% { background-position: 200% 0; }
          }
          .sk { background: linear-gradient(90deg, var(--bg-card) 25%, var(--bg-card-hover, #27272a) 50%, var(--bg-card) 75%); background-size: 200% 100%; animation: shimmer 1.4s ease-in-out infinite; border-radius: 8px; }
        `}</style>
        
        {/* Backdrop Area */}
        <div className="sk" style={{ width: '100%', height: '40vh', borderRadius: 0, flexShrink: 0, position: 'relative' }}>
          {/* Floating Top Bar inside backdrop */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '70px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 16px',
            paddingTop: 'env(safe-area-inset-top, 0px)',
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.8) 0%, transparent 100%)',
          }}>
            <div className="sk" style={{ width: 36, height: 36, borderRadius: '50%' }} />
            <div className="sk" style={{ width: 36, height: 36, borderRadius: '50%' }} />
          </div>
        </div>

        {/* Main Content Info Block */}
        <div style={{
          padding: '24px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          marginTop: '-40px',
          background: 'var(--bg-primary)',
          borderTopLeftRadius: '24px',
          borderTopRightRadius: '24px',
          position: 'relative',
          zIndex: 10,
          flex: 1
        }}>
          {/* Title */}
          <div className="sk" style={{ height: 32, width: '70%', borderRadius: '8px' }} />
          
          {/* Metadata Badges */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <div className="sk" style={{ height: 18, width: 60 }} />
            <div className="sk" style={{ height: 18, width: 40 }} />
            <div className="sk" style={{ height: 18, width: 30 }} />
            <div className="sk" style={{ height: 18, width: 50 }} />
          </div>

          {/* Action Button Bars */}
          <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
            <div className="sk" style={{ height: 42, flex: 1, borderRadius: '8px' }} />
            <div className="sk" style={{ height: 42, flex: 1, borderRadius: '8px' }} />
          </div>

          {/* Secondary Action Icons */}
          <div style={{ display: 'flex', gap: '24px', padding: '8px 0 12px', borderBottom: '1px solid var(--border-primary)', marginBottom: '4px' }}>
            {[1, 2, 3, 4].map(i => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                <div className="sk" style={{ width: 20, height: 20, borderRadius: '50%' }} />
                <div className="sk" style={{ width: 36, height: 8 }} />
              </div>
            ))}
          </div>

          {/* Synopsis / Overview */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div className="sk" style={{ height: 12, width: '100%' }} />
            <div className="sk" style={{ height: 12, width: '95%' }} />
            <div className="sk" style={{ height: 12, width: '75%' }} />
          </div>
        </div>
      </div>
    );
  }

  const renderMetadataAndActions = () => (
    <>
      {/* Title block */}
      {logoLoading ? (
        <div style={{ height: '50px' }} />
      ) : logoUrl ? (
        <img
          src={logoUrl}
          alt={fullMovie.title}
          onError={() => setLogoUrl(null)}
          style={{
            maxWidth: '70%',
            maxHeight: '90px',
            objectFit: 'contain',
            marginBottom: '8px',
            filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.5))',
            display: 'block',
            marginRight: 'auto',
            marginLeft: '0',
          }}
        />
      ) : (
        <h1 className="details-title" style={{
          fontSize: 'clamp(2rem, 5vw, 3rem)',
          fontWeight: 800,
          margin: '0 0 6px',
          letterSpacing: '-0.03em',
          lineHeight: 1.1,
          textAlign: 'left',
        }}>
          {fullMovie.title}
        </h1>
      )}

      {/* Premium Metadata Badges */}
      <div className="details-meta-row" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '14px', fontSize: '0.9rem', color: '#a1a1aa' }}>
        {score !== null && (() => {
          let badgeStyle = {
            color: '#ffffff',
            background: 'rgba(255,255,255,0.12)',
            border: '1px solid rgba(255,255,255,0.08)',
          };
          if (score < 50) {
            badgeStyle = {
              color: '#ef4444',
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
            };
          } else if (score < 70) {
            badgeStyle = {
              color: '#f97316',
              background: 'rgba(249, 115, 22, 0.12)',
              border: '1px solid rgba(249, 115, 22, 0.2)',
            };
          }
          return (
            <>
              <span 
                onClick={() => {
                  triggerHaptic('light');
                  setShowRatings(prev => !prev);
                }}
                style={{
                  ...badgeStyle,
                  padding: '2px 8px',
                  borderRadius: '6px',
                  fontSize: '0.7rem',
                  fontWeight: 900,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                {score}% {t('match')}
              </span>
              
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: showRatings ? '10px' : '0px',
                opacity: showRatings ? 1 : 0,
                transform: showRatings ? 'translateX(0)' : 'translateX(-8px)',
                maxWidth: showRatings ? '240px' : '0px',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                marginRight: showRatings ? '0px' : '-10px',
              }}>
                <span style={{
                  color: '#f5c518',
                  background: 'rgba(245, 197, 24, 0.12)',
                  border: '1px solid rgba(245, 197, 24, 0.25)',
                  padding: '2.5px 8px',
                  borderRadius: '6px',
                  fontSize: '0.7rem',
                  fontWeight: 900,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}>
                  <img 
                    src="/streaming icons/imdb.png" 
                    alt="IMDb" 
                    style={{ height: '12px', width: 'auto', display: 'block' }} 
                  />
                  <span>{extraRatings.imdb}</span>
                </span>

                <span style={{
                  color: '#ef4444',
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  padding: '2.5px 8px',
                  borderRadius: '6px',
                  fontSize: '0.7rem',
                  fontWeight: 900,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}>
                  <img 
                    src="/streaming icons/Rotten_Tomatoes.svg.png" 
                    alt="Rotten Tomatoes" 
                    style={{ height: '12px', width: 'auto', display: 'block' }} 
                  />
                  <span>{extraRatings.tomato}</span>
                </span>
              </div>
            </>
          );
        })()}
        {year && <span>{year.includes('-') ? year.split('-')[0] : year}</span>}
        <span style={{ 
          border: `1px solid ${inTheaters ? 'rgba(234, 179, 8, 0.4)' : 'rgba(255,255,255,0.2)'}`, 
          padding: '1px 5px', 
          fontSize: '0.72rem', 
          borderRadius: '4px',
          color: inTheaters ? '#eab308' : '#fff',
          fontWeight: 800,
        }}>
          {inTheaters ? 'CAM' : 'HD'}
        </span>
        {runtime && <span>{runtime}</span>}
      </div>

      {/* ── Native Play Button Bar ── */}
      <div className="details-play-bar" style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
        {inTheaters && (
          <div style={{
            fontSize: '0.76rem',
            color: 'rgba(255, 255, 255, 0.45)',
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: '6px',
            padding: '6px 10px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            justifyContent: 'center',
            marginBottom: '4px'
          }}>
            <span style={{ color: '#eab308' }}>⚠️</span>
            <span>Currently in theaters. Streams will be "Cam" quality (not HD).</span>
          </div>
        )}
        {isUpcomingRaw && fullMovie.releaseDate && (
          <div 
            onMouseDown={handleHoldStart}
            onMouseUp={handleHoldEnd}
            onTouchStart={handleHoldStart}
            onTouchEnd={handleHoldEnd}
            onMouseLeave={handleHoldEnd}
            style={{
              fontSize: '0.8rem',
              color: forcePlayUpcoming ? '#4ade80' : '#e4e4e7',
              background: forcePlayUpcoming ? 'rgba(74, 222, 128, 0.05)' : 'rgba(255, 255, 255, 0.03)',
              border: forcePlayUpcoming ? '1px solid rgba(74, 222, 128, 0.2)' : '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '8px',
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginBottom: '12px',
              cursor: 'pointer',
              userSelect: 'none'
            }}
          >
            {forcePlayUpcoming ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" style={{ flexShrink: 0 }}>
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255, 255, 255, 0.5)" strokeWidth="2.5" style={{ flexShrink: 0 }}>
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
            )}
            <span style={{ fontWeight: 600 }}>
              {forcePlayUpcoming 
                ? "Leaked movie overwrite watch" 
                : isHolding 
                  ? "Hold to unlock play (leaked movies only)..." 
                  : `Upcoming Release • Releasing on ${new Date(fullMovie.releaseDate).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}`}
            </span>
          </div>
        )}
        <div className="details-actions-bar" style={{ display: 'flex', gap: '10px', width: '100%' }}>
          {!isUpcoming && (
            <button
              ref={playBtnRef}
              onClick={() => {
                triggerHaptic('medium');
                handleLocalServerPlay(playbackMode === 'resume');
              }}
              disabled={localStreamLoading}
              className="tv-focusable"
              tabIndex={0}
              style={{
                flex: 1,
                height: '48px',
                borderRadius: '8px',
                border: 'none',
                background: '#fff',
                color: '#000',
                fontWeight: 800,
                fontSize: '0.95rem',
                cursor: localStreamLoading ? 'default' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              {localStreamLoading ? (
                <>
                  <div style={{ width: '18px', height: '18px', border: '2px solid rgba(0,0,0,0.2)', borderTopColor: '#000', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  {t('resolving')}...
                </>
              ) : (
                <>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                  {hasProgress ? t('resume') : t('play')}
                </>
              )}
            </button>
          )}

          <button
            onClick={() => {
              if (!trailer) return;
              triggerHaptic('medium');
              setActiveTrailerUrl(`https://www.youtube.com/embed/${trailer.key}?autoplay=1`);
            }}
            className="tv-focusable"
            tabIndex={0}
            disabled={!videosLoaded || !trailer}
            style={{
              flex: 1,
              height: '48px',
              borderRadius: '8px',
              border: 'none',
              background: '#27272a',
              color: trailer ? '#fff' : 'rgba(255,255,255,0.35)',
              fontWeight: 800,
              fontSize: '0.95rem',
              cursor: trailer ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'opacity 0.2s',
              opacity: trailer ? 1 : 0.5,
            }}
          >
            {!videosLoaded ? (
              <div style={{
                width: '72px', height: '14px', borderRadius: '4px',
                background: 'linear-gradient(90deg, rgba(255,255,255,0.06) 25%, rgba(255,255,255,0.14) 50%, rgba(255,255,255,0.06) 75%)',
                backgroundSize: '200% 100%',
                animation: 'shimmer 1.4s ease-in-out infinite',
              }} />
            ) : trailer ? (
              <>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                </svg>
                {t('trailer')}
              </>
            ) : (
              <span style={{ opacity: 0.45, fontSize: '0.85rem' }}>{t('trailer')}</span>
            )}
          </button>
        </div>

        {hasProgress && savedProgressPercent !== null && savedProgressPercent > 1 && (
          <div style={{ marginTop: '2px', marginBottom: '6px', padding: '0 4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#a1a1aa', marginBottom: '6px' }}>
              <span style={{ fontWeight: 600 }}>{t('resume_watching')}</span>
              <span style={{ fontWeight: 700, color: '#fff' }}>{Math.round(savedProgressPercent)}% {t('completed')}</span>
            </div>
             <div style={{ width: '100%', height: '5px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{ width: `${savedProgressPercent}%`, height: '100%', background: '#ffffff', borderRadius: '2px' }} />
            </div>
          </div>
        )}

        {localStreamError && (
          <div style={{
            fontSize: '0.75rem',
            color: 'rgba(255,200,100,0.9)',
            background: 'rgba(255,200,100,0.08)',
            border: '1px solid rgba(255,200,100,0.15)',
            borderRadius: '8px',
            padding: '8px 12px',
            textAlign: 'center',
          }}>
            {localStreamError}
          </div>
        )}
      </div>

      {/* ── Secondary Circular Action Icons ── */}
      <div className="details-secondary-actions" style={{ display: 'flex', gap: '30px', justifyContent: 'flex-start', padding: '6px 0 14px', borderBottom: '1px solid #18181b', marginBottom: '16px' }}>
        {/* Watch Together */}
        <button
          onClick={async () => {
            triggerHaptic('medium');
            if (localStorage.getItem('cinemovie_is_guest') === 'true') {
              setIsWatchPartyLockOpen(true);
              return;
            }
            setShowWatchTogetherInvite(true);
            setLoadingFriends(true);
            try {
              const list = await FriendService.getFriends();
              setFriendsList(list);
            } catch (e) {
              console.error(e);
            } finally {
              setLoadingFriends(false);
            }
          }}
          className="tv-focusable"
          tabIndex={0}
          style={{
            background: 'none',
            border: 'none',
            color: '#fff',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.78rem',
            fontWeight: 600,
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          {t('watch_party')}
        </button>
        {/* My List */}
        <button
          onClick={handleToggleList}
          className="tv-focusable"
          tabIndex={0}
          style={{
            background: 'none',
            border: 'none',
            color: '#ffffff',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.78rem',
            fontWeight: 600,
          }}
        >
          {inList ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          )}
          {t('watchlist')}
        </button>

        {/* Critique */}
        <button
          onClick={() => { triggerHaptic('medium'); setIsReviewModalOpen(true); }}
          className="tv-focusable"
          tabIndex={0}
          style={{
            background: 'none',
            border: 'none',
            color: '#fff',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.78rem',
            fontWeight: 600,
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
          {t('rate')}
        </button>

        {/* Download Offline */}
        {!isUpcoming && (
          <button
            onClick={handleDownloadMovie}
            onMouseEnter={() => setIsDownloadHovered(true)}
            onMouseLeave={() => { setIsDownloadHovered(false); endHoldLogger(); }}
            onMouseDown={startHoldLogger}
            onMouseUp={endHoldLogger}
            onTouchStart={startHoldLogger}
            onTouchEnd={endHoldLogger}
            className="tv-focusable"
            tabIndex={0}
            style={{
              background: 'none',
              border: 'none',
              color: downloadStatus === 'completed' ? '#fff' : downloadStatus === 'failed' ? '#ef4444' : '#fff',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.78rem',
              fontWeight: 600,
            }}
          >
            {downloadStatus === 'completed' ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            ) : downloadStatus === 'queued' ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'pulse 1.5s infinite' }}>
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            ) : (downloadStatus === 'resolving' || downloadStatus === 'downloading') && isDownloadHovered ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            ) : downloadStatus === 'resolving' ? (
              <div style={{ width: '22px', height: '22px', border: '2px solid rgba(255,255,255,0.2)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            ) : downloadStatus === 'downloading' ? (
              <div style={{ position: 'relative', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="28" height="28" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="16" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3.5" />
                  <circle cx="18" cy="18" r="16" fill="none" stroke="#ffffff" strokeWidth="3.5"
                          strokeDasharray="100" strokeDashoffset={100 - downloadProgress}
                          strokeLinecap="round" transform="rotate(-90 18 18)" />
                </svg>
                <span style={{ position: 'absolute', fontSize: '0.6rem', fontWeight: 950, color: '#ffffff' }}>
                  {downloadProgress}
                </span>
              </div>
            ) : downloadStatus === 'failed' ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            )}
            {downloadStatus === 'completed' 
              ? t('saved') 
              : downloadStatus === 'queued' 
              ? 'Queued'
              : (downloadStatus === 'resolving' || downloadStatus === 'downloading') && isDownloadHovered 
              ? t('cancel') 
              : downloadStatus === 'resolving' 
              ? t('resolving') 
              : downloadStatus === 'downloading' 
              ? t('saving') 
              : downloadStatus === 'failed' 
              ? t('failed') 
              : t('download')}
          </button>
        )}

        {/* Watched */}
        <button
          onClick={handleMarkAsWatched}
          className="tv-focusable"
          tabIndex={0}
          style={{
            background: 'none',
            border: 'none',
            color: hasProgress ? '#ffffff' : 'rgba(255,255,255,0.4)',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.78rem',
            fontWeight: 600,
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          {t('watched')}
        </button>
      </div>

      {/* Real-time active download progress bar panel */}
      {(downloadStatus === 'downloading' || downloadStatus === 'resolving') && (
        <div style={{
          margin: '16px 0 20px 0',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ 
                fontSize: '0.72rem', 
                fontWeight: 800, 
                color: 'rgba(255,255,255,0.5)', 
                textTransform: 'uppercase', 
                letterSpacing: '0.12em' 
              }}>
                Downloading Movie
              </span>
              <span style={{ 
                fontSize: '0.75rem', 
                fontWeight: 700, 
                color: '#ffffff', 
                background: 'rgba(255,255,255,0.08)',
                padding: '2px 8px',
                borderRadius: '12px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: '180px'
              }}>
                {fullMovie.title}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#ffffff' }}>
                {downloadProgress}%
              </span>
              <button
                onClick={() => {
                  triggerHaptic('medium');
                  handleCancelDownload();
                  setDownloadStatus('not_started');
                  setDownloadProgress(0);
                }}
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '50%',
                  width: '24px',
                  height: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: 'rgba(255,255,255,0.6)',
                  padding: 0,
                  transition: 'all 0.2s'
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          </div>
          
          <div style={{ height: '3px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{
              width: `${downloadProgress}%`,
              height: '100%',
              background: '#ffffff',
              borderRadius: '2px',
              transition: 'width 0.2s ease'
            }} />
          </div>
        </div>
      )}

      {/* ── Movie overview / synopsis ── */}
      {fullMovie.overview && (
        <p className="details-overview" style={{
          fontSize: '0.94rem',
          lineHeight: 1.6,
          color: '#d4d4d8',
          marginBottom: '16px',
        }}>
          {fullMovie.overview.length > 180 && !isOverviewExpanded ? (
            <>
              {fullMovie.overview.slice(0, 180)}
              <span 
                onClick={() => { triggerHaptic('light'); setIsOverviewExpanded(true); }}
                style={{ color: '#ffffff', cursor: 'pointer', fontWeight: 800, marginLeft: '4px' }}
              >
                ...
              </span>
            </>
          ) : (
            <>
              {fullMovie.overview}
              {fullMovie.overview.length > 180 && (
                <span 
                  onClick={() => { triggerHaptic('light'); setIsOverviewExpanded(false); }}
                  style={{ color: '#ffffff', cursor: 'pointer', fontWeight: 800, marginLeft: '8px', fontSize: '0.8rem', textTransform: 'uppercase' }}
                >
                  (Less)
                </span>
              )}
            </>
          )}
        </p>
      )}

      {/* Director & Compact Metadata Section */}
      <div className="details-meta-info" style={{ fontSize: '0.82rem', color: '#a1a1aa', display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
        {director && (
          <div 
            onClick={() => onActorClick?.(director.id)}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '12px', 
              background: 'none',
              border: 'none',
              padding: '0', 
              width: 'fit-content',
              cursor: onActorClick ? 'pointer' : 'default',
              marginTop: '6px',
              marginBottom: '14px',
            }}
          >
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '10px',
              overflow: 'hidden',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              flexShrink: 0,
            }}>
              {director.profilePath || (director as any).profile_path ? (
                <img 
                  src={getProfileUrl(director.profilePath || (director as any).profile_path)} 
                  alt={director.name} 
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.4)', fontSize: '0.9rem', fontWeight: 800 }}>
                  {director.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ color: '#71717a', fontSize: '0.74rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t('director')}</span>
              <span style={{ color: '#ffffff', fontSize: '0.92rem', fontWeight: 800 }}>{director.name}</span>
            </div>
          </div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', opacity: 0.85 }}>
          {fullMovie.status && (
            <div><span style={{ color: '#71717a' }}>{t('status')}: </span>{isUpcomingRaw ? 'Upcoming' : fullMovie.status}</div>
          )}
          {fullMovie.releaseDate && (
            <div><span style={{ color: '#71717a' }}>{isUpcomingRaw ? 'Releasing' : t('released')}: </span>{year}</div>
          )}
          {fullMovie.budget ? (
            <div><span style={{ color: '#71717a' }}>{t('budget')}: </span>{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(fullMovie.budget)}</div>
          ) : null}
          {fullMovie.revenue ? (
            <div><span style={{ color: '#71717a' }}>{t('revenue')}: </span>{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(fullMovie.revenue)}</div>
          ) : null}
          <div><span style={{ color: '#71717a' }}>{t('language')}: </span><span style={{ textTransform: 'uppercase' }}>{fullMovie.originalLanguage || 'en'}</span></div>
        </div>
      </div>

      {/* Genres Pills */}
      {fullMovie.genres && fullMovie.genres.length > 0 && (
        <div className="details-genres" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
          {fullMovie.genres.map(g => (
            <span 
              key={g.id} 
              onClick={() => {
                triggerHaptic('light');
                window.dispatchEvent(new CustomEvent('genreBadgeClick', { detail: { name: g.name, id: g.id } }));
              }}
              style={{
                padding: '4px 12px',
                background: '#27272a',
                borderRadius: '16px',
                fontSize: '0.78rem',
                fontWeight: 700,
                color: '#e4e4e7',
                cursor: 'pointer',
                transition: 'background 0.2s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-card-hover, #3f3f46)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#27272a'; }}
            >
              {g.name}
            </span>
          ))}
        </div>
      )}

      <div style={{ marginTop: '8px' }}>
        <CastSection cast={cast} onActorClick={onActorClick} />
      </div>

      {/* Floating real-time debugging console overlay for downloads */}
      {showDownloadLogger && (
        <div style={{
          marginTop: '20px',
          padding: '12px',
          background: 'rgba(9, 9, 11, 0.95)',
          border: '1.5px dashed rgba(255, 255, 255, 0.15)',
          borderRadius: '8px',
          color: '#a1a1aa',
          fontFamily: 'monospace',
          fontSize: '0.72rem',
          lineHeight: 1.4,
          maxHeight: '300px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '4px' }}>
            <span style={{ color: '#4ade80', fontWeight: 800 }}>SYSTEM DOWNLOAD LOGGER (DEBUG)</span>
            <button
              onClick={() => {
                const fullText = [
                  `--- CineMovie Download Diagnostic Log ---`,
                  `Movie: ${fullMovie.title} (${fullMovie.id})`,
                  `Status: ${downloadStatus.toUpperCase()}`,
                  `Progress: ${downloadProgress}%`,
                  `Hook Text: ${hookStatusText}`,
                  `Capacitor Native: ${Capacitor.isNativePlatform() ? 'YES' : 'NO'}`,
                  `Content-Length Header: ${debugContentLength ?? 'Missing (CORS restricted)'}`,
                  `Total Bytes: ${debugTotalBytes || 0} bytes`,
                  `Loaded Bytes: ${debugLoadedBytes || 0} bytes`,
                  `\n--- Native Logs ---`,
                  nativeLogs.join('\n')
                ].join('\n');
                navigator.clipboard.writeText(fullText);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                border: 'none',
                borderRadius: '4px',
                color: copied ? '#4ade80' : '#ffffff',
                padding: '2px 8px',
                cursor: 'pointer',
                fontSize: '0.65rem',
                fontWeight: 800
              }}
            >
              {copied ? 'Copied!' : 'Copy Logs'}
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div>[Status] {hookStatusText || 'Idle'}</div>
            <div>[Progress] {downloadProgress}%</div>
            <div>[Calculated Status] {downloadStatus.toUpperCase()}</div>
            <div>[Network Content-Length] {debugContentLength ?? 'Missing (CORS restricted)'}</div>
            <div>[Network Loaded Bytes] {((debugLoadedBytes || 0) / (1024 * 1024)).toFixed(2)} MB</div>
            {debugTotalBytes ? (
              <div>[Network Total Bytes] {((debugTotalBytes || 0) / (1024 * 1024)).toFixed(2)} MB</div>
            ) : (
              <div style={{ color: '#fb923c' }}>[Warning] Content-Length is hidden by server. Using size estimation fallback...</div>
            )}
            {downloadStatus === 'failed' && (
              <div style={{ color: '#f87171', fontWeight: 'bold' }}>[Error Details] {hookStatusText}</div>
            )}
            <div>[Movie TMDb ID] {fullMovie.id}</div>
          </div>
          
          {Capacitor.isNativePlatform() && (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: '80px' }}>
              <div style={{ color: '#60a5fa', fontWeight: 800, fontSize: '0.68rem', marginBottom: '4px', textTransform: 'uppercase' }}>📜 Console Logs (Last 10 Lines):</div>
              <div style={{
                flex: 1,
                background: '#020204',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '4px',
                padding: '6px',
                overflowY: 'auto',
                fontSize: '0.68rem',
                color: '#34d399',
                whiteSpace: 'pre-wrap',
                maxHeight: '120px'
              }}>
                {nativeLogs.length === 0 ? "No native logs captured..." : nativeLogs.slice(-10).join('\n')}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );

  const isTV = typeof localStorage !== 'undefined' && localStorage.getItem('cinemovie_is_tv') === 'true';

  if (isTV) {
    const isMovieInList = inList;
    return (
      <div
        onClick={handleClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 3000,
          background: '#000000',
          overflowY: 'auto',
          overflowX: 'hidden',
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
        }}
        className="movie-details-overlay no-scrollbar"
      >
        {/* Full-screen Background backdrop with image on right, vignette on left */}
        <div style={{ position: 'absolute', top: 0, right: 0, width: '75vw', height: '85vh', overflow: 'hidden', zIndex: 1, pointerEvents: 'none' }}>
          <img
            src={getBackdropUrl(fullMovie.backdropPath, 'original')}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.8 }}
          />
          {/* Gradients to fade to black on left and bottom */}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, #000000 0%, #000000 20%, rgba(0,0,0,0.8) 45%, rgba(0,0,0,0.3) 70%, transparent 100%)' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 40%, #000000 100%)' }} />
        </div>

        {/* HERO HEADER AREA (Matches the photo) */}
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'relative',
            zIndex: 10,
            width: '100%',
            padding: '12vh 8vw 4vh 8vw',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            gap: '2vh',
            minHeight: '82vh',
            justifyContent: 'center'
          }}
        >
          {/* Back Button */}
          <button
            onClick={handleClose}
            className="tv-focusable"
            style={{
              width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
              color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', outline: 'none', alignSelf: 'flex-start',
              marginBottom: '15px'
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
          </button>

          {/* Title or Logo */}
          {logoUrl ? (
            <img src={logoUrl} alt="" onError={() => setLogoUrl(null)} style={{ maxWidth: '300px', maxHeight: '90px', objectFit: 'contain', alignSelf: 'flex-start' }} />
          ) : (
            <h1 style={{ fontSize: 'clamp(1.8rem, 6vh, 3.2rem)', fontWeight: 900, color: '#fff', margin: 0, lineHeight: 1.1, letterSpacing: '-0.02em', textAlign: 'left' }}>{fullMovie.title}</h1>
          )}

          {/* Metadata Row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: 'clamp(0.72rem, 1.6vh, 0.85rem)', color: 'rgba(255,255,255,0.5)', fontWeight: 700 }}>
            {year && <span>{year.split('-')[0]}</span>}
            {fullMovie.certification && (
              <>
                <span style={{ height: '8px', width: '1px', background: 'rgba(255,255,255,0.25)' }} />
                <span style={{ background: '#ffffff', color: '#000000', padding: '1px 6px', borderRadius: '3px', fontSize: '0.65rem', fontWeight: 900 }}>{fullMovie.certification}</span>
              </>
            )}
            <span style={{ 
              border: `1px solid ${inTheaters ? 'rgba(234, 179, 8, 0.4)' : 'rgba(255,255,255,0.2)'}`, 
              padding: '1px 5px', 
              fontSize: '0.62rem', 
              borderRadius: '4px',
              color: inTheaters ? '#eab308' : '#fff',
              fontWeight: 800,
            }}>
              {inTheaters ? 'CAM' : 'HD'}
            </span>
            <span style={{ height: '8px', width: '1px', background: 'rgba(255,255,255,0.25)' }} />
            {runtime && <span>{runtime}</span>}
            {fullMovie.genres && fullMovie.genres.length > 0 && (
              <>
                <span style={{ height: '8px', width: '1px', background: 'rgba(255,255,255,0.25)' }} />
                <span>{fullMovie.genres.map(g => g.name).slice(0, 2).join(', ')}</span>
              </>
            )}
          </div>

          {/* CAM / Upcoming warnings in TV Mode */}
          {inTheaters && (
            <div style={{
              fontSize: '0.72rem',
              color: 'rgba(255, 255, 255, 0.55)',
              background: 'rgba(234, 179, 8, 0.06)',
              border: '1px solid rgba(234, 179, 8, 0.15)',
              borderRadius: '4px',
              padding: '6px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              maxWidth: '480px',
              boxSizing: 'border-box'
            }}>
              <span style={{ color: '#eab308' }}>⚠️</span>
              <span>Currently in theaters. Streams will be "Cam" quality (not HD).</span>
            </div>
          )}

          {isUpcomingRaw && fullMovie.releaseDate && (
            <div 
              onMouseDown={handleHoldStart}
              onMouseUp={handleHoldEnd}
              onTouchStart={handleHoldStart}
              onTouchEnd={handleHoldEnd}
              onMouseLeave={handleHoldEnd}
              onKeyDown={handleKeyDown}
              onKeyUp={handleKeyUp}
              className="tv-focusable"
              tabIndex={0}
              style={{
                fontSize: '0.75rem',
                color: forcePlayUpcoming ? '#4ade80' : '#e4e4e7',
                background: forcePlayUpcoming ? 'rgba(74, 222, 128, 0.05)' : 'rgba(255, 255, 255, 0.03)',
                border: forcePlayUpcoming ? '1px solid rgba(74, 222, 128, 0.2)' : '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '6px',
                padding: '8px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                maxWidth: '480px',
                cursor: 'pointer',
                userSelect: 'none',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            >
              {forcePlayUpcoming ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" style={{ flexShrink: 0 }}>
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255, 255, 255, 0.5)" strokeWidth="2.5" style={{ flexShrink: 0 }}>
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
              )}
              <span style={{ fontWeight: 600 }}>
                {forcePlayUpcoming 
                  ? "Leaked movie overwrite watch" 
                  : isHolding 
                    ? "Hold to unlock play (leaked movies only)..." 
                    : `Upcoming Release • Releasing on ${new Date(fullMovie.releaseDate).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}`}
              </span>
            </div>
          )}

          {/* Synopsis */}
          <p style={{
            fontSize: 'clamp(0.75rem, 1.7vh, 0.88rem)',
            lineHeight: 1.6,
            color: 'rgba(255,255,255,0.75)',
            maxWidth: '480px',
            margin: 0,
            textAlign: 'left'
          }}>
            {fullMovie.overview}
          </p>

          {/* Play / My List Row */}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {!isUpcoming && (
              <button
                onClick={() => { triggerHaptic('medium'); handleLocalServerPlay(playbackMode === 'resume'); }}
                disabled={localStreamLoading}
                className="tv-focusable"
                style={{
                  height: '36px', padding: '0 20px', borderRadius: '4px', border: 'none', background: '#ffffff', color: '#000000',
                  fontWeight: 900, fontSize: '0.78rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', outline: 'none'
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                {hasProgress ? t('resume').toUpperCase() : t('play').toUpperCase()}
              </button>
            )}

            {!isUpcoming && (
              <button
                onClick={handleDownloadMovie}
                className="tv-focusable"
                style={{
                  height: '36px',
                  padding: '0 18px',
                  borderRadius: '4px',
                  border: '1px solid rgba(255,255,255,0.2)',
                  background: downloadStatus === 'downloading' || downloadStatus === 'resolving' || downloadStatus === 'queued' ? 'rgba(255,255,255,0.1)' : 'transparent',
                  color: downloadStatus === 'completed' ? '#22c55e' : '#fff',
                  fontWeight: 900,
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  outline: 'none'
                }}
              >
                {downloadStatus === 'downloading' ? (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    <span>CANCEL ({downloadProgress}%)</span>
                  </>
                ) : downloadStatus === 'resolving' ? (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    <span>CANCEL RESOLVING</span>
                  </>
                ) : downloadStatus === 'queued' ? (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    <span>CANCEL QUEUED</span>
                  </>
                ) : downloadStatus === 'completed' ? (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                    <span>DOWNLOADED</span>
                  </>
                ) : downloadStatus === 'failed' ? (
                  <>
                    <span style={{ color: '#ef4444' }}>⚠️</span>
                    <span>FAILED</span>
                  </>
                ) : (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                    <span>DOWNLOAD</span>
                  </>
                )}
              </button>
            )}

            <button
              onClick={async () => {
                triggerHaptic('medium');
                if (isMovieInList) {
                  await removeFromMyList(fullMovie.id, 'movie');
                } else {
                  await addToMyList(fullMovie);
                }
                setInList(!isMovieInList);
                onListUpdate?.();
              }}
              className="tv-focusable"
              style={{
                height: '36px', padding: '0 18px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: '#fff',
                fontWeight: 900, fontSize: '0.78rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', outline: 'none'
              }}
            >
              {isMovieInList ? '✓ ' + t('in_watchlist').toUpperCase() : '+ ' + t('watchlist').toUpperCase()}
            </button>
          </div>

          {/* Watch Trailer Secondary Button */}
          {trailer && (
            <button
              onClick={() => { triggerHaptic('medium'); setActiveTrailerUrl(`https://www.youtube.com/embed/${trailer.key}?autoplay=1`); }}
              className="tv-focusable"
              style={{
                background: 'transparent', border: 'none', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px',
                padding: '6px 0', fontSize: '0.78rem', fontWeight: 900, textTransform: 'uppercase', cursor: 'pointer', alignSelf: 'flex-start', outline: 'none'
              }}
            >
              <div style={{ width: '28px', height: '28px', borderRadius: '50%', border: '2px solid rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" style={{ transform: 'translateX(1px)' }}><path d="M8 5v14l11-7z" /></svg>
              </div>
              <span>{t('watch_trailer').toUpperCase()}</span>
            </button>
          )}
        </div>

        {/* BOTTOM CONTENT AREA (Cast and Recommendations) */}
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'relative',
            zIndex: 10,
            background: 'linear-gradient(to bottom, transparent 0%, #070708 120px)',
            padding: '4vh 8vw 12vh 8vw',
            display: 'flex',
            flexDirection: 'column',
            gap: '5vh',
            boxSizing: 'border-box'
          }}
        >
          {/* Cast */}
          {cast.length > 0 && (
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 900, textTransform: 'uppercase', color: '#fff', margin: '0 0 16px 0', letterSpacing: '0.06em' }}>{t('cast')}</h3>
              <div style={{ display: 'flex', gap: '16px', overflowX: 'auto', paddingBottom: '10px' }} className="no-scrollbar">
                {cast.slice(0, 10).map(member => (
                  <div
                    key={member.id}
                    onClick={() => { triggerHaptic('light'); onActorClick?.(member.id); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        triggerHaptic('light');
                        onActorClick?.(member.id);
                      }
                    }}
                    tabIndex={0}
                    className="tv-focusable"
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', width: '80px', flexShrink: 0,
                      borderRadius: '8px', padding: '6px', outline: 'none', transition: 'all 0.15s ease'
                    }}
                  >
                    <img src={getProfileUrl(member.profilePath, 'medium')} alt="" style={{ width: '60px', height: '60px', borderRadius: '50%', objectFit: 'cover', border: '1px solid rgba(255,255,255,0.1)' }} />
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'rgba(255,255,255,0.8)', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', minHeight: '24px' }}>{member.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommendations / Related */}
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 900, textTransform: 'uppercase', color: '#fff', margin: '0 0 20px 0', letterSpacing: '0.06em' }}>{t('related')}</h3>
            {similarMovies.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '18px 14px' }}>
                {similarMovies.slice(0, 12).map(similar => (
                  <div
                    key={similar.id}
                    onClick={() => { onClose(); setTimeout(() => window.dispatchEvent(new CustomEvent('movieClick', { detail: similar })), 50); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onClose();
                        setTimeout(() => window.dispatchEvent(new CustomEvent('movieClick', { detail: similar })), 50);
                      }
                    }}
                    tabIndex={0}
                    className="tv-focusable"
                    style={{
                      aspectRatio: '2/3', background: '#121214', borderRadius: '8px', overflow: 'hidden', cursor: 'pointer',
                      border: '1px solid rgba(255,255,255,0.05)', transition: 'all 0.15s ease', outline: 'none'
                    }}
                  >
                    <img src={getPosterUrl(similar.posterPath, 'small')} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.8rem' }}>No related titles found</div>
            )}
          </div>
        </div>

        <style>{`
          .tv-focusable:focus {
            background: #ffffff !important;
            color: #000000 !important;
            transform: scale(1.04) !important;
            box-shadow: 0 0 0 3px #ffffff !important;
          }
          .tv-focusable:focus span {
            color: #000000 !important;
          }
          .tv-focusable:focus svg {
            color: #000000 !important;
          }
        `}</style>

        {/* Video Player overlay */}
        {showPlayer && (
          <VideoPlayer
            src={streamUrl || `https://vidsrc.me/embed/movie/${fullMovie.id}`}
            title={fullMovie.title}
            onClose={() => { setShowPlayer(false); setIsPartyMode(false); }}
            item={fullMovie}
            tracks={resolvedTracks}
            startTime={playbackMode === 'resume' && savedProgress ? savedProgress : 0}
            isPartyMode={isPartyMode}
            partySessionId={partySessionId}
            isPartyHost={isPartyHost}
            logoUrl={logoUrl}
          />
        )}

        {/* Trailer Modal overlay */}
        <AnimatePresence>
          {activeTrailerUrl && (
            <motion.div
              id="trailer-modal-overlay"
              className="trailer-modal-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={(e) => { e.stopPropagation(); setActiveTrailerUrl(null); }}
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.85)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                zIndex: 100000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '16px'
              }}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: '100%',
                  maxWidth: '800px',
                  aspectRatio: '16/9',
                  background: '#000',
                  borderRadius: '16px',
                  overflow: 'hidden',
                  position: 'relative',
                  border: '1px solid rgba(255,255,255,0.1)',
                  boxShadow: '0 24px 48px rgba(0,0,0,0.8)'
                }}
              >
                <iframe
                  src={activeTrailerUrl}
                  title="Trailer"
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  style={{ width: '100%', height: '100%' }}
                />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
        
        <ReviewModal
        isOpen={isReviewModalOpen}
        onClose={() => setIsReviewModalOpen(false)}
        itemId={String(movie.id)}
        itemTitle={movie.title}
        onSuccess={() => setRefreshKey(prev => prev + 1)}
      />

        {createPortal(
          <>
            <GuestLockModal
              isOpen={isWatchPartyLockOpen}
              onClose={() => setIsWatchPartyLockOpen(false)}
              title="Watch Party Locked"
              description="Watch Parties and synchronized streaming are reserved for registered users. Log in or create an account to stream with friends!"
            />
            <GuestLockModal
              isOpen={isDownloadLockOpen}
              onClose={() => setIsDownloadLockOpen(false)}
              title="Downloads Locked"
              description="Offline downloads are reserved for registered users. Log in or create an account to download movies and shows!"
            />
          </>,
          document.body
        )}

      </div>
    );
  }

  return (
    <div
      onClick={handleClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 3000,
        background: 'var(--bg-primary)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        animation: 'fadeIn 0.25s ease-out both',
      }}
    >
      {/* Scrollable Layout Content */}
      <div 
        ref={scrollRef}
        onScroll={handleScroll}
        onClick={e => e.stopPropagation()} 
        style={{ 
          flex: 1, 
          overflowY: (showPlayer || showStreamSelector) ? 'hidden' : 'auto', 
          overflowX: 'hidden', 
          overscrollBehavior: 'contain', 
          WebkitOverflowScrolling: 'touch', 
          touchAction: 'pan-y', 
          position: 'relative', 
          width: '100%', 
          maxWidth: '100%', 
          color: '#fff', 
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          background: 'var(--bg-primary)',
        }}
      >
        {/* ── Floating Back Button (hides on scroll down, slides back on scroll up) ── */}
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 200,
          height: '70px',
          background: backButtonVisible ? 'linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, transparent 100%)' : 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          paddingTop: 'env(safe-area-inset-top, 0px)',
          pointerEvents: 'none',
          transition: 'background 0.3s',
        }}>
          <button
            onClick={handleClose}
            aria-label="Back"
            className="tv-focusable"
            tabIndex={0}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: 'rgba(0, 0, 0, 0.55)',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              pointerEvents: 'auto',
              transform: backButtonVisible ? 'translateY(0)' : 'translateY(-70px)',
              transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
          </button>

          {!isUpcoming && (
            <button
              onClick={() => {
                if (downloadStatus === 'downloading' || downloadStatus === 'resolving' || downloadStatus === 'queued' || downloadStatus === 'completed') {
                  window.dispatchEvent(new CustomEvent('navigateToDownloads'));
                  onClose();
                } else {
                  handleDownloadMovie();
                }
              }}
              onMouseDown={startHoldLogger}
              onMouseUp={endHoldLogger}
              onMouseLeave={endHoldLogger}
              onTouchStart={startHoldLogger}
              onTouchEnd={endHoldLogger}
              aria-label="Downloads"
              className="tv-focusable"
              tabIndex={0}
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '50%',
                background: downloadStatus === 'downloading' || downloadStatus === 'resolving' || downloadStatus === 'queued' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.5)',
                border: downloadStatus === 'downloading' ? '1px solid rgba(255, 255, 255, 0.25)' : 'none',
                color: downloadStatus === 'completed' ? '#22c55e' : downloadStatus === 'failed' ? '#ef4444' : '#fff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                pointerEvents: 'auto',
                transform: backButtonVisible ? 'translateY(0)' : 'translateY(-70px)',
                transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            >
              {downloadStatus === 'downloading' ? (
                <div style={{ position: 'relative', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="32" height="32" viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="16" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="3" />
                    <circle cx="18" cy="18" r="16" fill="none" stroke="#ffffff" strokeWidth="3"
                            strokeDasharray="100" strokeDashoffset={100 - downloadProgress}
                            strokeLinecap="round" transform="rotate(-90 18 18)"
                            style={{ transition: 'stroke-dashoffset 0.3s ease' }} />
                  </svg>
                  <span style={{ position: 'absolute', fontSize: '0.62rem', fontWeight: 900, color: '#ffffff' }}>
                    {downloadProgress}%
                  </span>
                </div>
              ) : downloadStatus === 'queued' ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'pulse 1.5s infinite' }}>
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              ) : downloadStatus === 'resolving' ? (
                <div style={{ width: '20px', height: '20px', border: '2px solid rgba(255,255,255,0.2)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              ) : downloadStatus === 'completed' ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : downloadStatus === 'failed' ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              )}
            </button>
          )}
        </div>

        {/* ── Immersive Widescreen Layout Wrapper ── */}
        <div className="details-main-wrapper tv-details-container" style={{ position: 'relative', width: '100%', minHeight: '100vh', display: 'flex', boxSizing: 'border-box', overflow: 'hidden', background: 'var(--bg-primary)' }}>
          <style>{`
            /* TV Mode optimization overrides: Full-screen cinematic layout (non-split screen) */
            @media (min-width: 769px) {
              .tv-details-container {
                display: block !important;
                width: 100vw !important;
                height: 100vh !important;
                overflow-x: hidden !important;
                overflow-y: auto !important;
                background: #060607 !important;
              }
              .tv-left-column {
                width: 100% !important;
                max-width: 900px !important;
                min-width: auto !important;
                padding: 18vh 6vw 4vh 6vw !important;
                display: flex !important;
                flex-direction: column !important;
                gap: 2.5vh !important;
                box-sizing: border-box !important;
                height: auto !important;
                overflow: visible !important;
              }
              .tv-right-column {
                width: 100% !important;
                max-width: 900px !important;
                height: auto !important;
                overflow: visible !important;
                padding: 0 6vw 10vh 6vw !important;
                box-sizing: border-box !important;
                background: transparent !important;
                backdrop-filter: none !important;
                -webkit-backdrop-filter: none !important;
                border-left: none !important;
              }
              .tv-details-title {
                font-size: clamp(2rem, 6vh, 3.2rem) !important;
              }
              body.tv-mode .tv-focusable:focus,
              .tv-mode .tv-focusable:focus {
                background: #ffffff !important;
                color: #000000 !important;
                transform: scale(1.03) !important;
                box-shadow: 0 0 0 3px #ffffff !important;
              }
            }

            @media (max-width: 768px) {
              .details-main-wrapper {
                flex-direction: column !important;
                min-height: auto !important;
                overflow: visible !important;
              }
              .details-backdrop-container {
                height: 45.5vh !important;
                position: absolute !important;
                top: 0 !important;
                left: 0 !important;
                right: 0 !important;
                background: var(--bg-primary) !important;
              }
              .details-backdrop-gradient {
                background: linear-gradient(to bottom, rgba(var(--bg-primary-rgb),0) 0%, rgba(var(--bg-primary-rgb),0.8) 60%, var(--bg-primary) 100%) !important;
              }
              .details-left-column {
                width: 100% !important;
                min-width: unset !important;
                padding: 240px 16px 8px 16px !important;
                box-sizing: border-box !important;
                gap: 16px !important;
                background: transparent !important;
              }
              .details-right-column {
                width: 100% !important;
                height: auto !important;
                overflow-y: visible !important;
                border-left: none !important;
                padding: 8px 16px 16px 16px !important;
                background: var(--bg-primary) !important;
                box-sizing: border-box !important;
                backdrop-filter: none !important;
                -webkit-backdrop-filter: none !important;
              }
              .details-title {
                font-size: 1.6rem !important;
                margin-bottom: 4px !important;
              }
              .details-meta-row {
                font-size: 0.8rem !important;
                margin-bottom: 12px !important;
                gap: 8px !important;
              }
              .details-play-bar {
                margin-bottom: 12px !important;
                gap: 8px !important;
              }
              .details-play-bar button, .details-actions-bar button {
                height: 40px !important;
                font-size: 0.85rem !important;
                border-radius: 6px !important;
                gap: 6px !important;
              }
              .details-actions-bar {
                gap: 8px !important;
              }
              .details-secondary-actions {
                gap: 8px !important;
                justify-content: space-between !important;
                margin-bottom: 12px !important;
                padding-bottom: 10px !important;
              }
              .details-secondary-actions button {
                gap: 4px !important;
                font-size: 0.72rem !important;
              }
              .details-secondary-actions svg {
                width: 18px !important;
                height: 18px !important;
              }
              .details-overview {
                font-size: 0.85rem !important;
                line-height: 1.45 !important;
                margin-bottom: 12px !important;
              }
              .details-meta-info {
                font-size: 0.75rem !important;
                margin-bottom: 12px !important;
                gap: 4px !important;
              }
              .details-genres {
                margin-bottom: 12px !important;
                gap: 6px !important;
              }
              .details-genres span {
                padding: 3px 10px !important;
                font-size: 0.72rem !important;
              }
              .details-tab-bar {
                margin-bottom: 16px !important;
                gap: 16px !important;
              }
              .details-tab-bar button {
                font-size: 0.85rem !important;
                padding: 8px 0 !important;
              }
            }
          `}</style>
          {/* Full-Screen Backdrop background image */}
          <div className="details-backdrop-container" style={{ position: 'absolute', inset: 0, overflow: 'hidden', zIndex: 1, pointerEvents: 'none' }}>
            {!backdropLoaded && (
              <div style={{ position: 'absolute', inset: 0, background: 'var(--bg-primary)' }} />
            )}
            <img
              src={getBackdropUrl(fullMovie.backdropPath, 'original')}
              alt=""
              {...({ fetchpriority: 'high' } as any)}
              decoding="async"
              onLoad={() => setBackdropLoaded(true)}
              style={{
                width: '100%', height: '100%', objectFit: 'cover',
                opacity: backdropLoaded ? 0.6 : 0,
                transition: 'opacity 0.3s ease',
              }}
            />
            {/* Premium cinematic gradients: horizontal fade + bottom fade */}
            <div className="details-backdrop-gradient" style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(to right, var(--bg-primary) 0%, var(--bg-primary) 35%, rgba(var(--bg-primary-rgb),0.65) 45%, var(--bg-primary) 100%)',
            }} />
          </div>

          {/* Left Side: Fixed Content Column */}
          <div className="details-left-column tv-left-column" style={{ position: 'relative', zIndex: 10, width: '45%', minWidth: '460px', padding: '120px 48px 40px 60px', display: 'flex', flexDirection: 'column', gap: '20px', boxSizing: 'border-box' }}>
            {renderMetadataAndActions()}
            {/* Overview / Storyline included directly on TV left column for readability */}
            {isTV && (
              <div style={{ marginTop: '10px' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '6px', color: '#fff', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t('synopsis')}</h3>
                <p style={{ fontSize: 'clamp(0.72rem, 1.6vh, 0.85rem)', lineHeight: 1.5, color: 'rgba(255,255,255,0.7)', margin: 0 }}>
                  {fullMovie.overview}
                </p>
              </div>
            )}
            {/* Cast Quick Section */}
            {isTV && cast.length > 0 && (
              <div style={{ marginTop: '10px' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '8px', color: '#fff', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t('cast')}</h3>
                <div style={{ display: 'flex', gap: '10px', overflowX: 'auto' }} className="no-scrollbar">
                  {cast.slice(0, 5).map(member => (
                    <div key={member.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.04)', padding: '4px 10px 4px 4px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <img src={getProfileUrl(member.profilePath, 'medium')} alt="" style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover' }} />
                      <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>{member.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Side: Interactive Panel (No extra page scrolling) */}
          <div className="details-right-column tv-right-column" style={{
            position: 'relative',
            zIndex: 10,
            width: '55%',
            height: '100vh',
            overflowY: 'auto',
            boxSizing: 'border-box',
            background: 'rgba(var(--bg-primary-rgb), 0.65)',
            backdropFilter: 'blur(30px)',
            WebkitBackdropFilter: 'blur(30px)',
            borderLeft: '1px solid rgba(255, 255, 255, 0.08)',
            padding: '110px 48px 60px 48px',
            display: 'flex',
            flexDirection: 'column',
          }}>
            {/* Tab Switcher */}
            <div className="details-tab-bar" style={{ 
              display: 'flex', 
              borderBottom: '1px solid rgba(255,255,255,0.06)', 
              marginBottom: '28px',
              gap: '28px' 
            }}>
              {(['overview', 'reviews'] as TabState[]).map(tab => (
                <button
                  key={tab}
                  onClick={() => { triggerHaptic('light'); setActiveTab(tab); }}
                  className="tv-focusable"
                  tabIndex={0}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '12px 0',
                    color: activeTab === tab ? '#fff' : 'rgba(255,255,255,0.5)',
                    fontSize: '1rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    position: 'relative',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    transition: 'color 0.2s',
                  }}
                >
                  {tab === 'overview' ? t('related') : t('reviews')}
                  {activeTab === tab && (
                    <div style={{
                      position: 'absolute',
                      bottom: '-1px',
                      left: 0,
                      right: 0,
                      height: '3px',
                      background: '#ffffff',
                      borderRadius: '2px',
                    }} />
                  )}
                </button>
              ))}
            </div>

            {/* Tab contents */}
            <div style={{ flex: 1 }}>
              {activeTab === 'overview' && (
                <div style={{ animation: 'fadeIn 0.2s ease-out both', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  {movieCollection && movieCollection.parts.length > 0 && (
                    <div style={{ marginBottom: '8px' }}>
                      <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '1.2rem', color: '#fff' }}>
                        Part of the {movieCollection.name}
                      </h3>
                      <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: 'repeat(3, 1fr)', 
                        gap: '16px',
                        contentVisibility: 'auto',
                      }}>
                        {movieCollection.parts.map(part => (
                          <div
                            key={part.id}
                            className="tv-focusable"
                            tabIndex={0}
                            style={{
                              aspectRatio: '2/3',
                              background: 'var(--bg-card)',
                              borderRadius: '12px',
                              overflow: 'hidden',
                              cursor: 'pointer',
                              border: '1px solid rgba(255,255,255,0.06)',
                              transition: 'all 0.2s ease-in-out',
                              outline: 'none'
                            }}
                            onClick={() => {
                              onClose();
                              setTimeout(() => window.dispatchEvent(new CustomEvent('movieClick', { detail: part })), 50);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                onClose();
                                setTimeout(() => window.dispatchEvent(new CustomEvent('movieClick', { detail: part })), 50);
                              }
                            }}
                          >
                            <img src={getPosterUrl(part.posterPath, 'small')} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '1.2rem', color: '#fff' }}>{t('related')}</h3>
                    {similarMovies.length > 0 ? (
                      <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: 'repeat(3, 1fr)', 
                        gap: '16px',
                        contentVisibility: 'auto',
                        containIntrinsicSize: 'auto 360px'
                      }}>
                        {similarMovies.slice(0, 9).map(similar => (
                          <div
                            key={similar.id}
                            className="tv-focusable"
                            tabIndex={0}
                            style={{
                              aspectRatio: '2/3',
                              background: 'var(--bg-card)',
                              borderRadius: '12px',
                              overflow: 'hidden',
                              cursor: 'pointer',
                              border: '1px solid rgba(255,255,255,0.06)',
                              transition: 'all 0.2s ease-in-out',
                              outline: 'none'
                            }}
                            onClick={() => {
                              onClose();
                              setTimeout(() => window.dispatchEvent(new CustomEvent('movieClick', { detail: similar })), 50);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                onClose();
                                setTimeout(() => window.dispatchEvent(new CustomEvent('movieClick', { detail: similar })), 50);
                              }
                            }}
                          >
                            <img src={getPosterUrl(similar.posterPath, 'small')} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ color: '#71717a', fontSize: '0.9rem' }}>No recommendations found.</div>
                    )}
                  </div>
                </div>
              )}



              {activeTab === 'reviews' && (
                <div style={{ animation: 'fadeIn 0.2s ease-out both' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>User Critiques</h3>
                    {localStorage.getItem('cinemovie_is_guest') !== 'true' && (
                      <button
                        onClick={() => { triggerHaptic('medium'); setIsReviewModalOpen(true); }}
                        className="tv-focusable"
                        tabIndex={0}
                        style={{
                          background: 'rgba(255,255,255,0.08)',
                          border: '1px solid rgba(255,255,255,0.15)',
                          padding: '8px 16px',
                          borderRadius: '8px',
                          color: '#fff',
                          fontSize: '0.85rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        Add Critique
                      </button>
                    )}
                  </div>
                  <ReviewSection key={refreshKey} itemId={String(movie.id)} type="movie" />
                </div>
              )}
            </div>
          </div>
        </div>

      </div>

      {showPlayer && (
        <VideoPlayer
          src={streamUrl || `https://vidsrc.me/embed/movie/${fullMovie.id}`}
          title={fullMovie.title}
          onClose={() => { setShowPlayer(false); setIsPartyMode(false); }}
          item={fullMovie}
          tracks={resolvedTracks}
          startTime={playbackMode === 'resume' && savedProgress ? savedProgress : 0}
          isPartyMode={isPartyMode}
          partySessionId={partySessionId}
          isPartyHost={isPartyHost}
          logoUrl={logoUrl}
          isOfflineMode={downloadStatus === 'completed'}
        />
      )}


      <ReviewModal
        isOpen={isReviewModalOpen}
        onClose={() => setIsReviewModalOpen(false)}
        itemId={String(movie.id)}
        itemTitle={movie.title}
        onSuccess={() => setRefreshKey(prev => prev + 1)}
      />
      {createPortal(
        <>
          <GuestLockModal
            isOpen={isWatchPartyLockOpen}
            onClose={() => setIsWatchPartyLockOpen(false)}
            title="Watch Party Locked"
            description="Watch Parties and synchronized streaming are reserved for registered users. Log in or create an account to stream with friends!"
          />
          <GuestLockModal
            isOpen={isDownloadLockOpen}
            onClose={() => setIsDownloadLockOpen(false)}
            title="Downloads Locked"
            description="Offline downloads are reserved for registered users. Log in or create an account to download movies and shows!"
          />
        </>,
        document.body
      )}

      {/* Premium Centered YouTube Trailer Modal */}
      <AnimatePresence>
        {activeTrailerUrl && (
          <motion.div
            id="trailer-modal-overlay"
            className="trailer-modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={(e) => { e.stopPropagation(); setActiveTrailerUrl(null); }}
            style={{
              position: 'fixed',
              inset: 0,
              background: isMobile ? '#000000' : 'rgba(0,0,0,0.85)',
              backdropFilter: isMobile ? 'none' : 'blur(12px)',
              WebkitBackdropFilter: isMobile ? 'none' : 'blur(12px)',
              zIndex: 100000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px'
            }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '100%',
                maxWidth: '800px',
                aspectRatio: '16/9',
                background: '#000',
                borderRadius: '16px',
                overflow: 'hidden',
                position: 'relative',
                border: '1px solid rgba(255,255,255,0.1)',
                boxShadow: '0 24px 48px rgba(0,0,0,0.8)'
              }}
            >
              <iframe
                src={activeTrailerUrl}
                title="Trailer"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                style={{ width: '100%', height: '100%' }}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Watch Together Invite Panel Overlay */}
      {showWatchTogetherInvite && (
        <div
          onClick={() => setShowWatchTogetherInvite(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 4500,
            background: isMobile ? '#0a0a0a' : 'rgba(0, 0, 0, 0.75)',
            backdropFilter: isMobile ? 'none' : 'blur(20px)',
            WebkitBackdropFilter: isMobile ? 'none' : 'blur(20px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            animation: 'fadeIn 0.2s ease-out'
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--bg-card)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '16px',
              padding: '24px',
              width: '100%',
              maxWidth: '400px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              maxHeight: '80vh',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, color: '#fff', fontSize: '1.2rem', fontWeight: 800 }}>Watch Together</h3>
              <button
                onClick={() => setShowWatchTogetherInvite(false)}
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: 'none',
                  color: '#fff',
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>

            <p style={{ margin: 0, color: 'rgba(255, 255, 255, 0.5)', fontSize: '0.85rem', lineHeight: '1.4' }}>
              Create a synchronized Watch Party and stream with your friends! Only works on primary Local Server player.
            </p>

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', minHeight: '150px', maxHeight: '350px' }}>
              {loadingFriends ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '30px' }}>
                  <div style={{ width: '20px', height: '20px', border: '2px solid rgba(255,255,255,0.2)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                </div>
              ) : friendsList.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', color: 'rgba(255, 255, 255, 0.4)', fontSize: '0.85rem' }}>
                  No friends added yet.
                </div>
              ) : (
                friendsList.map(friend => {
                  const isInviting = invitingFriends[friend.id];
                  const isInvited = invitedFriends[friend.id];

                  return (
                    <div
                      key={friend.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 12px',
                        background: 'rgba(255, 255, 255, 0.03)',
                        borderRadius: '10px',
                        border: '1px solid rgba(255, 255, 255, 0.05)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <img
                          src={friend.avatar || '/default-avatar.png'}
                          alt=""
                          style={{ width: '32px', height: '32px', borderRadius: '8px', objectFit: 'cover' }}
                        />
                        <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#fff' }}>{friend.name}</span>
                      </div>
                      <button
                        onClick={async () => {
                          triggerHaptic('light');
                          setInvitingFriends(prev => ({ ...prev, [friend.id]: true }));
                          const session = partySessionId || WatchTogetherService.createPartySession(fullMovie.id, 'movie');
                          setPartySessionId(session);
                          await WatchTogetherService.sendPartyInvitations(
                             [friend.id], 
                             session, 
                             fullMovie.title,
                             fullMovie.id,
                             'movie',
                             fullMovie.posterPath,
                             fullMovie.backdropPath
                           );
                          setInvitingFriends(prev => ({ ...prev, [friend.id]: false }));
                          setInvitedFriends(prev => ({ ...prev, [friend.id]: true }));
                        }}
                        disabled={isInviting || isInvited}
                        style={{
                          background: isInvited ? 'rgba(34, 197, 94, 0.15)' : 'rgba(255, 255, 255, 0.08)',
                          border: isInvited ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid transparent',
                          borderRadius: '8px',
                          padding: '6px 12px',
                          color: isInvited ? '#22c55e' : '#fff',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          cursor: isInviting || isInvited ? 'default' : 'pointer',
                        }}
                      >
                        {isInviting ? 'Inviting...' : isInvited ? 'Invited ✓' : 'Invite'}
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            <button
              onClick={async () => {
                triggerHaptic('heavy');
                setShowWatchTogetherInvite(false);
                setIsPartyMode(true);
                if (!partySessionId) {
                  setPartySessionId(WatchTogetherService.createPartySession(fullMovie.id, 'movie'));
                }
                await handleLocalServerPlay(playbackMode === 'resume');
              }}
              style={{
                width: '100%',
                height: '46px',
                borderRadius: '8px',
                border: 'none',
                background: '#fff',
                color: '#000',
                fontWeight: 800,
                fontSize: '0.95rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                marginTop: '8px'
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
              Start Party Mode
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(MovieDetails);
