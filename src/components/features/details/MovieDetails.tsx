import React, { useState, useEffect, memo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import type { Movie, Video, Cast, Crew } from '../../../types';
import { getBackdropUrl, getMovieDetails, getMovieVideos, getSmartMovieRecommendations, getPosterUrl, getMovieCredits, getProfileUrl } from '../../../services/tmdb';
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
import { WatchTogetherService } from '../../../services/watchTogether';
import { resolveMovieStream, isLocalServerConfigured, getLocalServerUrl } from '../../../services/LocalStreamService';
import { Capacitor } from '@capacitor/core';
import { fetchWithCapacitor } from '../../../utils/nativeFetch';


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

type TabState = 'overview' | 'trailers' | 'reviews';

function MovieDetails({ movie, onClose, onListUpdate, onActorClick }: MovieDetailsProps) {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  const playBtnRef = React.useRef<HTMLButtonElement>(null);
  const [activeTab, setActiveTab] = useState<TabState>('overview');
  const [fullMovie, setFullMovie] = useState<Movie>(movie);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [isWatchPartyLockOpen, setIsWatchPartyLockOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [inList, setInList] = useState(false);
  const [similarMovies, setSimilarMovies] = useState<Movie[]>([]);
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

  const handleHoldStart = (e: React.MouseEvent | React.TouchEvent) => {
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
  const [downloadStatus, setDownloadStatus] = useState<'not_started' | 'resolving' | 'downloading' | 'completed' | 'failed'>('not_started');
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [activeTrailerUrl, setActiveTrailerUrl] = useState<string | null>(null);
  const [isDownloadHovered, setIsDownloadHovered] = useState(false);
  const [showRatings, setShowRatings] = useState(false);

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
              item.status = 'completed';
              item.progress = 100;
              localStorage.setItem('cinemovie_downloads', JSON.stringify(list));
            }
            setDownloadStatus(doesExist ? 'completed' : item.status);
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
    window.dispatchEvent(new CustomEvent('navigateToDownloads'));
    onClose();
  };



  useEffect(() => {
    setFullMovie(movie);
    setLoading(true);
    setVideos([]);
    setSimilarMovies([]);
    setCast([]);
    setCrew([]);
    setInList(false);
    setHasProgress(false);
    setSavedProgress(null);
    setSavedProgressPercent(null);
    setPlaybackMode('resume');

    async function loadDetails() {
      // Set loading false as soon as core movie details are set, so text details/overview appear immediately
      try {
        const details = await getMovieDetails(movie.id);
        if (details) {
          setFullMovie(details);
        }
      } catch (error) {
        console.error('Error loading movie base details:', error);
      } finally {
        setLoading(false);
      }

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
        const item = list.find((i: any) => i.id === `movie_${fullMovie.id}` && i.status === 'completed');
        if (item) {
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

  const trailer = videos.find(v => v.type === 'Trailer' && v.site === 'YouTube') || videos[0];

  const year = fullMovie.releaseDate || '';
  const isUpcomingRaw = !!(fullMovie.releaseDate && new Date(fullMovie.releaseDate).getTime() > Date.now());
  const isUpcoming = isUpcomingRaw && !forcePlayUpcoming;
  const inTheaters = !!fullMovie.inTheaters && !isUpcomingRaw;
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

  if (loading) return (
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

  const renderMetadataAndActions = () => (
    <>
      {/* Title block */}
      <h1 className="details-title" style={{
        fontSize: 'clamp(2rem, 5vw, 3rem)',
        fontWeight: 800,
        margin: '0 0 6px',
        letterSpacing: '-0.03em',
        lineHeight: 1.1,
      }}>
        {fullMovie.title}
      </h1>

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

          {trailer && (
            <button
              onClick={() => {
                triggerHaptic('medium');
                setActiveTrailerUrl(`https://www.youtube.com/embed/${trailer.key}?autoplay=1`);
              }}
              className="tv-focusable"
              tabIndex={0}
              style={{
                flex: 1,
                height: '48px',
                borderRadius: '8px',
                border: 'none',
                background: '#27272a',
                color: '#fff',
                fontWeight: 800,
                fontSize: '0.95rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
              </svg>
              {t('trailer')}
            </button>
          )}
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
            color: inList ? '#ffffff' : 'rgba(255,255,255,0.4)',
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
        <button
          onClick={handleDownloadMovie}
          onMouseEnter={() => setIsDownloadHovered(true)}
          onMouseLeave={() => setIsDownloadHovered(false)}
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
          {downloadStatus === 'completed' ? t('saved') : (downloadStatus === 'resolving' || downloadStatus === 'downloading') && isDownloadHovered ? t('cancel') : downloadStatus === 'resolving' ? t('resolving') : downloadStatus === 'downloading' ? t('saving') : downloadStatus === 'failed' ? t('failed') : t('download')}
        </button>

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
    </>
  );

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
        {/* ── Native Floating Top Bar ── */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          height: '70px',
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.8) 0%, transparent 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          paddingTop: 'env(safe-area-inset-top, 0px)',
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
              background: 'rgba(0, 0, 0, 0.5)',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
          </button>

          <button
            onClick={() => {
              triggerHaptic('medium');
              handleClose();
              setTimeout(() => {
                window.dispatchEvent(new CustomEvent('navigateToDownloads'));
              }, 100);
            }}
            aria-label="Downloads"
            className="tv-focusable"
            tabIndex={0}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: downloadStatus === 'downloading' || downloadStatus === 'resolving' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(0, 0, 0, 0.5)',
              border: downloadStatus === 'downloading' ? '1.5px solid #22c55e' : 'none',
              color: downloadStatus === 'completed' ? '#22c55e' : downloadStatus === 'failed' ? '#ef4444' : '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
            }}
          >
            {downloadStatus === 'downloading' ? (
              <div style={{ position: 'relative', width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{
                  position: 'absolute',
                  inset: -4,
                  border: '2px solid rgba(34, 197, 94, 0.2)',
                  borderTopColor: '#22c55e',
                  borderRadius: '50%',
                  animation: 'spin 1.2s linear infinite'
                }} />
                <span style={{ fontSize: '0.62rem', fontWeight: 900, color: '#22c55e' }}>{downloadProgress}%</span>
              </div>
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
        </div>

        {/* ── Immersive Widescreen Layout Wrapper ── */}
        <div className="details-main-wrapper" style={{ position: 'relative', width: '100%', minHeight: '100vh', display: 'flex', boxSizing: 'border-box', overflow: 'hidden' }}>
          <style>{`
            @media (max-width: 768px) {
              .details-main-wrapper {
                flex-direction: column !important;
                min-height: auto !important;
                overflow: visible !important;
              }
              .details-backdrop-container {
                height: 45vh !important;
                position: absolute !important;
                top: 0 !important;
                left: 0 !important;
                right: 0 !important;
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
              fetchPriority="high"
              decoding="async"
              onLoad={() => setBackdropLoaded(true)}
              style={{
                width: '100%', height: '100%', objectFit: 'cover',
                opacity: backdropLoaded ? 0.35 : 0,
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
          <div className="details-left-column" style={{ position: 'relative', zIndex: 10, width: '45%', minWidth: '460px', padding: '120px 48px 40px 60px', display: 'flex', flexDirection: 'column', gap: '20px', boxSizing: 'border-box' }}>
            {renderMetadataAndActions()}
          </div>

          {/* Right Side: Interactive Panel (No extra page scrolling) */}
          <div className="details-right-column" style={{
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
              {(['overview', 'trailers', 'reviews'] as TabState[]).map(tab => (
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
                  {tab === 'overview' ? t('more_like_this') : tab === 'trailers' ? t('trailers') : t('reviews')}
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
                  <div>
                    <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '1.2rem', color: '#fff' }}>{t('more_like_this')}</h3>
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

              {activeTab === 'trailers' && (
                <div style={{ animation: 'fadeIn 0.2s ease-out both' }}>
                  <VideoGallery
                    videos={videos}
                    onVideoClick={(v) => {
                      triggerHaptic('heavy');
                      setActiveTrailerUrl(`https://www.youtube.com/embed/${v.key}?autoplay=1`);
                    }}
                  />
                </div>
              )}

              {activeTab === 'reviews' && (
                <div style={{ animation: 'fadeIn 0.2s ease-out both' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>User Critiques</h3>
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
          src={streamUrl || `https://vidlink.pro/movie/${fullMovie.id}?primaryColor=ffffff`}
          title={fullMovie.title}
          onClose={() => { setShowPlayer(false); setIsPartyMode(false); }}
          item={fullMovie}
          tracks={resolvedTracks}
          startTime={playbackMode === 'resume' && savedProgress ? savedProgress : 0}
          isPartyMode={isPartyMode}
          partySessionId={partySessionId}
          isPartyHost={isPartyHost}
        />
      )}


      <ReviewModal
        isOpen={isReviewModalOpen}
        onClose={() => setIsReviewModalOpen(false)}
        itemId={String(movie.id)}
        itemTitle={movie.title}
        onSuccess={() => setRefreshKey(prev => prev + 1)}
      />
      <GuestLockModal
        isOpen={isWatchPartyLockOpen}
        onClose={() => setIsWatchPartyLockOpen(false)}
        title="Watch Party Locked"
        description="Watch Parties and synchronized streaming are reserved for registered users. Log in or create an account to stream with friends!"
      />

      {/* Premium Centered YouTube Trailer Modal */}
      {createPortal(
        <AnimatePresence>
          {activeTrailerUrl && (
            <motion.div
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
        </AnimatePresence>,
        document.body
      )}

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
