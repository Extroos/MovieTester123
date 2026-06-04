import React, { useState, useEffect, memo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Movie, Video, Cast, Crew } from '../../../types';
import { getBackdropUrl, getMovieDetails, getMovieVideos, getSmartMovieRecommendations, getPosterUrl, getMovieCredits } from '../../../services/tmdb';
import { isInMyList, addToMyList, removeFromMyList } from '../../../services/myList';
import { WatchProgressService } from '../../../services/progress';
import CastSection from './CastSection';
import ReviewSection from '../reviews/ReviewSection';
import ReviewModal from '../reviews/ReviewModal';
import { COLORS } from '../../../constants';
import VideoGallery from './VideoGallery';
import { triggerHaptic } from '../../../utils/haptics';
import { VidSrcService } from '../../../services/vidsrc';
import VideoPlayer from '../player/VideoPlayer';
import { OfflineStorageService } from '../../../services/OfflineStorageService';
import { FriendService } from '../../../services/friends';
import { WatchTogetherService } from '../../../services/watchTogether';
import { resolveMovieStream, isLocalServerConfigured } from '../../../services/LocalStreamService';
import { Capacitor } from '@capacitor/core';
import { fetchWithCapacitor } from '../../../utils/nativeFetch';
import { useContent } from '../../../hooks/useContent';

const saveDownloadsAndNotify = (list: any[]) => {
  localStorage.setItem('cinemovie_downloads', JSON.stringify(list));
  window.dispatchEvent(new CustomEvent('downloadsChanged'));
};

interface MovieDetailsProps {
  movie: Movie;
  onClose: () => void;
  onListUpdate?: () => void;
  onActorClick?: (personId: number) => void;
}

type TabState = 'overview' | 'trailers' | 'reviews';

function MovieDetails({ movie, onClose, onListUpdate, onActorClick }: MovieDetailsProps) {
  const content = useContent();
  const [activeTab, setActiveTab] = useState<TabState>('overview');
  const [fullMovie, setFullMovie] = useState<Movie>(movie);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
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
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [localStreamLoading, setLocalStreamLoading] = useState(false);
  const [localStreamError, setLocalStreamError] = useState<string | null>(null);
  const [resolvedTracks, setResolvedTracks] = useState<{ file: string; label: string; kind: string; default?: boolean }[]>([]);
  const [showStreamSelector, setShowStreamSelector] = useState(false);

  // Smart Playback Settings
  const [playbackMode, setPlaybackMode] = useState<'resume' | 'start'>('resume');

  // Offline Download State
  const [downloadStatus, setDownloadStatus] = useState<'not_started' | 'resolving' | 'downloading' | 'completed' | 'failed'>('not_started');
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [activeTrailerUrl, setActiveTrailerUrl] = useState<string | null>(null);
  const [isDownloadHovered, setIsDownloadHovered] = useState(false);

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

  const handleDownloadMovie = async () => {
    triggerHaptic('medium');
    alert("Offline Downloads are currently undergoing maintenance and optimization for mobile users. Please watch online using direct streams.");
    return;
    const downloadId = `movie_${fullMovie.id}`;
    
    const raw = localStorage.getItem('cinemovie_downloads');
    let list: any[] = [];
    if (raw) {
      try { list = JSON.parse(raw); } catch (e) {}
    }
    
    if (list.some(item => item.id === downloadId)) {
      const item = list.find((it: any) => it.id === downloadId);
      const isInProgress = item?.status === 'downloading' || item?.status === 'resolving';
      const confirmMsg = isInProgress 
        ? 'Cancel downloading this movie?' 
        : 'Remove this movie from your downloads?';
      if (window.confirm(confirmMsg)) {
        const updated = list.filter(item => item.id !== downloadId);
        saveDownloadsAndNotify(updated);
        await OfflineStorageService.delete(downloadId);
        setDownloadStatus('not_started');
        setDownloadProgress(0);
      }
      return;
    }
    
    const newItem = {
      id: downloadId,
      title: fullMovie.title,
      posterPath: fullMovie.posterPath,
      type: 'movie',
      status: 'resolving',
      progress: 0,
      data: fullMovie,
      addedAt: Date.now()
    };
    
    list.push(newItem);
    saveDownloadsAndNotify(list);
    setDownloadStatus('resolving');
    
    try {
      const imdbId = (fullMovie as any).imdb_id || fullMovie.imdbId;
      const result = await resolveMovieStream(fullMovie.id, fullMovie.title, imdbId);
      if (result && result.streamUrl) {
        const latestRaw = localStorage.getItem('cinemovie_downloads');
        let currentList = latestRaw ? JSON.parse(latestRaw) : [];
        let item = currentList.find((i: any) => i.id === downloadId);
        if (item) {
          item.status = 'downloading';
          item.streamUrl = result.streamUrl;
          item.subtitles = result.subtitles || [];
          saveDownloadsAndNotify(currentList);
          setDownloadStatus('downloading');
        }

        // Real Segment Downloader
        let playlistUrl = result.streamUrl;
        let targetUrl = playlistUrl;
        let referer = 'https://vidlink.pro/';
        let origin = 'https://vidlink.pro';

        if (playlistUrl.includes('local-proxy?url=')) {
          const parsedUrl = new URL(playlistUrl);
          targetUrl = parsedUrl.searchParams.get('url') || targetUrl;
          referer = parsedUrl.searchParams.get('referer') || referer;
          origin = parsedUrl.searchParams.get('origin') || origin;
        }

        const proxyBase = playlistUrl.includes('local-proxy') 
          ? playlistUrl.split('local-proxy')[0] + 'local-proxy'
          : 'http://localhost:3001/local-proxy';

        const buildProxyUrl = (urlStr: string) => {
          if (urlStr.includes('local-proxy?url=')) {
            return urlStr;
          }
          return `${proxyBase}?url=${encodeURIComponent(urlStr)}&referer=${encodeURIComponent(referer)}&origin=${encodeURIComponent(origin)}`;
        };

        let playlistText = '';
        if (Capacitor.isNativePlatform()) {
          const playlistRes = await fetchWithCapacitor(targetUrl, 'text');
          if (!playlistRes.ok) throw new Error("Failed to fetch stream index.");
          playlistText = await playlistRes.text();
        } else {
          const playlistRes = await fetch(buildProxyUrl(targetUrl));
          if (!playlistRes.ok) throw new Error("Failed to fetch stream index.");
          playlistText = await playlistRes.text();
        }

        if (playlistText.includes('#EXT-X-STREAM-INF')) {
          const lines = playlistText.split('\n');
          let subPlaylistLine = '';
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line && !line.startsWith('#')) {
              subPlaylistLine = line;
              break;
            }
          }
          if (!subPlaylistLine) throw new Error("Could not parse sub-playlist.");
          const resolvedSubUrl = subPlaylistLine.startsWith('http') 
            ? subPlaylistLine 
            : new URL(subPlaylistLine, targetUrl).href;
          
          if (Capacitor.isNativePlatform()) {
            const subRes = await fetchWithCapacitor(resolvedSubUrl, 'text');
            if (!subRes.ok) throw new Error("Failed to fetch variant playlist.");
            playlistText = await subRes.text();
          } else {
            const subRes = await fetch(buildProxyUrl(resolvedSubUrl));
            if (!subRes.ok) throw new Error("Failed to fetch variant playlist.");
            playlistText = await subRes.text();
          }
          targetUrl = resolvedSubUrl;
        }

        const lines = playlistText.split('\n');
        const segmentUrls: string[] = [];
        const segmentBaseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (line && !line.startsWith('#')) {
            const resolvedSegUrl = line.startsWith('http') ? line : segmentBaseUrl + line;
            segmentUrls.push(resolvedSegUrl);
          }
        }

        const totalSegments = segmentUrls.length;
        if (totalSegments === 0) throw new Error("No media segments found.");

        // Start progressive write session
        await OfflineStorageService.startProgressiveWrite(downloadId);

        const batchSize = 5; 

        for (let i = 0; i < totalSegments; i += batchSize) {
          // Check if item still exists in downloads (user hasn't deleted/cancelled it)
          const checkRaw = localStorage.getItem('cinemovie_downloads');
          const checkList = checkRaw ? JSON.parse(checkRaw) : [];
          if (!checkList.some((it: any) => it.id === downloadId)) {
            throw new Error("Download cancelled by user.");
          }

          const batchUrls = segmentUrls.slice(i, i + batchSize);
          const batchStartTime = Date.now();
          const promises = batchUrls.map(async (url, idx) => {
            if (Capacitor.isNativePlatform()) {
              let response;
              let errorOccurred;
              for (let attempt = 1; attempt <= 5; attempt++) {
                try {
                  response = await fetchWithCapacitor(url, 'arraybuffer');
                  if (response.ok) {
                    errorOccurred = null;
                    break;
                  }
                  errorOccurred = new Error("Failed to fetch segment");
                } catch (err: any) {
                  errorOccurred = err;
                }
                if (attempt < 5) {
                  await new Promise(r => setTimeout(r, 1000 * attempt)); // Stable backoff
                }
              }
              if (!response || !response.ok) {
                throw new Error(`Segment ${i + idx + 1} download failed: ${errorOccurred?.message || 'unknown'}`);
              }
              return response.base64 ? response.base64() : response.arrayBuffer();
            }

            const segProxyUrl = buildProxyUrl(url);
            let response;
            let errorOccurred;
            for (let attempt = 1; attempt <= 5; attempt++) {
              try {
                response = await fetch(segProxyUrl);
                if (response.ok) {
                  errorOccurred = null;
                  break;
                }
                errorOccurred = new Error(`Status ${response.status}`);
              } catch (err: any) {
                errorOccurred = err;
              }
              if (attempt < 5) {
                await new Promise(r => setTimeout(r, 1000 * attempt)); // Stable backoff
              }
            }
            if (!response || !response.ok) {
              throw new Error(`Segment ${i + idx + 1} download failed: ${errorOccurred?.message || 'unknown'}`);
            }
            return response.arrayBuffer();
          });

          const batchChunks = await Promise.all(promises);
          const batchDuration = (Date.now() - batchStartTime) / 1000;

          // Append each chunk progressively to save RAM and avoid WebView bridge transaction limits
          let batchBytes = 0;
          for (const chunk of batchChunks) {
            await OfflineStorageService.appendChunk(downloadId, chunk);
            batchBytes += typeof chunk === 'string' ? Math.floor(chunk.length * 0.75) : chunk.byteLength;
          }
          const speedMBs = batchDuration > 0 ? (batchBytes / (1024 * 1024)) / batchDuration : 0;

          const currentDownloaded = Math.min(i + batchSize, totalSegments);
          const percent = Math.floor((currentDownloaded / totalSegments) * 100);

          // Update storage & local state
          const loopRaw = localStorage.getItem('cinemovie_downloads');
          let loopList = loopRaw ? JSON.parse(loopRaw) : [];
          let loopItem = loopList.find((it: any) => it.id === downloadId);
          if (loopItem) {
            loopItem.progress = percent;
            loopItem.speed = parseFloat(speedMBs.toFixed(1));
            saveDownloadsAndNotify(loopList);
          }
          setDownloadProgress(percent);
        }

        // Finalize progressive write (writes m3u8 playlist on mobile)
        const localPlayableUrl = await OfflineStorageService.finalizeWrite(downloadId);

        const finalRaw = localStorage.getItem('cinemovie_downloads');
        let finalList = finalRaw ? JSON.parse(finalRaw) : [];
        let finalItem = finalList.find((it: any) => it.id === downloadId);
        if (finalItem) {
          finalItem.status = 'completed';
          finalItem.progress = 100;
          finalItem.localUrl = localPlayableUrl;
          saveDownloadsAndNotify(finalList);
        }
        setDownloadStatus('completed');
        setDownloadProgress(100);
        
      } else {
        throw new Error('Resolution failed');
      }
    } catch (error: any) {
      console.error('[DownloadMovie] Error:', error);
      const latestRaw = localStorage.getItem('cinemovie_downloads');
      let currentList = latestRaw ? JSON.parse(latestRaw) : [];
      let item = currentList.find((i: any) => i.id === downloadId);
      if (item) {
        item.status = 'failed';
        saveDownloadsAndNotify(currentList);
        setDownloadStatus('failed');
      }
    }
  };

  useEffect(() => {
    let resizeTimer: ReturnType<typeof setTimeout>;
    const handleResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => setIsMobile(window.innerWidth < 768), 150);
    };
    window.addEventListener('resize', handleResize, { passive: true });
    return () => {
      clearTimeout(resizeTimer);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  useEffect(() => {
    async function loadDetails() {
      // Set loading false as soon as core movie details are set, so text details/overview appear immediately
      try {
        const details = await getMovieDetails(movie.id);
        if (details) {
          setFullMovie(details);
          setLoading(false); // CORE LOADED - RENDER IMMEDIATELY
        }
      } catch (error) {
        console.error('Error loading movie base details:', error);
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
  }, [movie.id]);

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
      setLocalStreamError('No server URL configured. Go to Settings → Local Server.');
      return false;
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
        setLocalStreamError('Could not resolve stream. Server may be down or movie not found.');
      }
    } catch (e) {
      setLocalStreamError('Error connecting to local server.');
    } finally {
      setLocalStreamLoading(false);
    }
    return false;
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

  const year = fullMovie.releaseDate?.slice(0, 4) || '';
  const isReleased = fullMovie.releaseDate 
    ? new Date(fullMovie.releaseDate).getTime() <= Date.now() 
    : false;
  const runtime = fullMovie.runtime
    ? `${Math.floor(fullMovie.runtime / 60)}h ${fullMovie.runtime % 60}m`
    : '';
  const score = fullMovie.voteAverage ? Math.round(fullMovie.voteAverage * 10) : null;
  const director = crew.find(c => c.job === 'Director');

  if (loading) return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 3000, background: '#09090b', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }}>
      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .sk { background: linear-gradient(90deg, #1c1c1f 25%, #27272a 50%, #1c1c1f 75%); background-size: 200% 100%; animation: shimmer 1.4s ease-in-out infinite; border-radius: 8px; }
      `}</style>
      
      {/* Native Floating Top Bar */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        height: '70px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        paddingTop: 'env(safe-area-inset-top, 0px)',
      }}>
        <div className="sk" style={{ width: 40, height: 40, borderRadius: '50%' }} />
        <div className="sk" style={{ width: 40, height: 40, borderRadius: '50%' }} />
      </div>

      {/* Backdrop Area */}
      <div className="sk" style={{ width: '100%', height: isMobile ? '45vh' : '65vh', borderRadius: 0, flexShrink: 0 }} />

      {/* Responsive Content block wrapper */}
      <div style={{ 
        flex: 1, 
        overflow: 'hidden', 
        padding: isMobile ? '0 16px 20px' : '0 40px 24px', 
        marginTop: isMobile ? '-30px' : '-60px', 
        position: 'relative', 
        zIndex: 10,
        maxWidth: isMobile ? '100%' : '1400px',
        width: '100%',
        marginLeft: 'auto',
        marginRight: 'auto',
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        gap: isMobile ? '14px' : '40px'
      }}>
        {/* Left Column Poster (Desktop Only) */}
        {!isMobile && (
          <div style={{ width: '280px', flexShrink: 0 }}>
            <div className="sk" style={{ width: '100%', aspectRatio: '2/3', borderRadius: '12px' }} />
          </div>
        )}

        {/* Information Column */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Title */}
          <div className="sk" style={{ height: isMobile ? 32 : 44, width: isMobile ? '80%' : '60%', borderRadius: '8px' }} />
          
          {/* Metadata Badges */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <div className="sk" style={{ height: 20, width: 70 }} />
            <div className="sk" style={{ height: 20, width: 40 }} />
            <div className="sk" style={{ height: 20, width: 30 }} />
            <div className="sk" style={{ height: 20, width: 60 }} />
          </div>

          {/* Action Button Bars */}
          <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
            <div className="sk" style={{ height: 48, flex: 1, borderRadius: '8px' }} />
            <div className="sk" style={{ height: 48, flex: 1, borderRadius: '8px' }} />
          </div>

          {/* Secondary Action Icons */}
          <div style={{ display: 'flex', gap: '30px', padding: '6px 0 14px', borderBottom: '1px solid #18181b', marginBottom: '4px' }}>
            {[1, 2, 3, 4].map(i => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                <div className="sk" style={{ width: 22, height: 22, borderRadius: '50%' }} />
                <div className="sk" style={{ width: 44, height: 10 }} />
              </div>
            ))}
          </div>

          {/* Synopsis / Overview */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div className="sk" style={{ height: 14, width: '100%' }} />
            <div className="sk" style={{ height: 14, width: '95%' }} />
            <div className="sk" style={{ height: 14, width: '70%' }} />
          </div>
        </div>
      </div>
    </div>
  );


  const renderMetadataAndActions = () => (
    <>
      {/* Title block */}
      <h1 style={{
        fontSize: isMobile ? 'clamp(1.4rem, 5vw, 2.2rem)' : 'clamp(2rem, 5vw, 3rem)',
        fontWeight: 800,
        margin: '0 0 6px',
        letterSpacing: '-0.03em',
        lineHeight: 1.1,
      }}>
        {fullMovie.title}
      </h1>

      {/* Premium Metadata Badges */}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '14px', fontSize: '0.9rem', color: '#a1a1aa' }}>
        {score !== null && (
          <span style={{ color: '#22c55e', fontWeight: 800 }}>{score}% Match</span>
        )}
        {year && <span>{year}</span>}
        <span style={{ 
          border: '1px solid rgba(255,255,255,0.2)', 
          padding: '1px 5px', 
          fontSize: '0.72rem', 
          borderRadius: '4px',
          color: '#fff',
          fontWeight: 800,
        }}>
          HD
        </span>
        {runtime && <span>{runtime}</span>}
      </div>

      {/* ── Native Play Button Bar ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
        {!isReleased ? (
          <button
            disabled
            style={{
              width: '100%',
              height: '48px',
              borderRadius: '8px',
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.03)',
              color: 'rgba(255,255,255,0.4)',
              fontWeight: 800,
              fontSize: '0.95rem',
              cursor: 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            Coming Soon (Release: {fullMovie.releaseDate || 'TBA'})
          </button>
        ) : (
          <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
            <button
              onClick={() => {
                triggerHaptic('medium');
                setShowStreamSelector(true);
              }}
              disabled={localStreamLoading}
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
                  Resolving...
                </>
              ) : (
                <>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                  {hasProgress ? 'Resume' : 'Play'}
                </>
              )}
            </button>

            {trailer && (
              <button
                onClick={() => {
                  triggerHaptic('medium');
                  setActiveTrailerUrl(`https://www.youtube.com/embed/${trailer.key}?autoplay=1`);
                }}
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
                Trailer
              </button>
            )}
          </div>
        )}

        {hasProgress && savedProgressPercent !== null && savedProgressPercent > 1 && (
          <div style={{ marginTop: '2px', marginBottom: '6px', padding: '0 4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#a1a1aa', marginBottom: '6px' }}>
              <span style={{ fontWeight: 600 }}>Resume watching</span>
              <span style={{ fontWeight: 700, color: '#fff' }}>{Math.round(savedProgressPercent)}% completed</span>
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
      <div style={{ display: 'flex', gap: isMobile ? '20px' : '30px', justifyContent: 'flex-start', padding: '6px 0 14px', borderBottom: '1px solid #18181b', marginBottom: '16px' }}>
        {/* Watch Together */}
        <button
          onClick={async () => {
            triggerHaptic('medium');
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
          Watch Party
        </button>
        {/* My List */}
        <button
          onClick={handleToggleList}
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
          My List
        </button>

        {/* Critique */}
        <button
          onClick={() => { triggerHaptic('medium'); setIsReviewModalOpen(true); }}
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
          Rate
        </button>

        {/* Download Offline */}
        <button
          onClick={handleDownloadMovie}
          onMouseEnter={() => setIsDownloadHovered(true)}
          onMouseLeave={() => setIsDownloadHovered(false)}
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
          {downloadStatus === 'completed' ? 'Saved' : (downloadStatus === 'resolving' || downloadStatus === 'downloading') && isDownloadHovered ? 'Cancel' : downloadStatus === 'resolving' ? 'Resolving' : downloadStatus === 'downloading' ? 'Saving' : downloadStatus === 'failed' ? 'Failed' : 'Download'}
        </button>

        {/* Watched */}
        <button
          onClick={handleMarkAsWatched}
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
          Watched
        </button>
      </div>

      {/* ── Movie overview / synopsis ── */}
      {fullMovie.overview && (
        <p style={{
          fontSize: '0.94rem',
          lineHeight: 1.6,
          color: '#d4d4d8',
          marginBottom: '16px',
        }}>
          {fullMovie.overview}
        </p>
      )}

      {/* Director & Compact Metadata Section */}
      <div style={{ fontSize: '0.82rem', color: '#a1a1aa', display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
        {director && (
          <div>
            <span style={{ color: '#71717a' }}>Director: </span>{director.name}
          </div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', opacity: 0.85 }}>
          {fullMovie.status && (
            <div><span style={{ color: '#71717a' }}>Status: </span>{fullMovie.status}</div>
          )}
          {fullMovie.releaseDate && (
            <div><span style={{ color: '#71717a' }}>Released: </span>{year}</div>
          )}
          {fullMovie.budget ? (
            <div><span style={{ color: '#71717a' }}>Budget: </span>{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(fullMovie.budget)}</div>
          ) : null}
          {fullMovie.revenue ? (
            <div><span style={{ color: '#71717a' }}>Revenue: </span>{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(fullMovie.revenue)}</div>
          ) : null}
          <div><span style={{ color: '#71717a' }}>Language: </span><span style={{ textTransform: 'uppercase' }}>{fullMovie.originalLanguage || 'en'}</span></div>
        </div>
      </div>

      {/* Genres Pills */}
      {fullMovie.genres && fullMovie.genres.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
          {fullMovie.genres.map(g => (
            <span key={g.id} style={{
              padding: '4px 12px',
              background: '#27272a',
              borderRadius: '16px',
              fontSize: '0.78rem',
              fontWeight: 700,
              color: '#e4e4e7',
            }}>
              {g.name}
            </span>
          ))}
        </div>
      )}
    </>
  );

  return (
    <div
      onClick={handleClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 3000,
        background: '#09090b',
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
          overflowY: showPlayer ? 'hidden' : 'auto', 
          overflowX: 'hidden', 
          overscrollBehavior: 'contain', 
          WebkitOverflowScrolling: 'touch', 
          touchAction: 'pan-y', 
          position: 'relative', 
          width: '100%', 
          maxWidth: '100%', 
          color: '#fff', 
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          background: '#09090b',
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

        {/* ── Full-Bleed Immersive Backdrop ── */}
        <div style={{ position: 'relative', width: '100%', height: isMobile ? '45vh' : '65vh', overflow: 'hidden' }}>
          {!backdropLoaded && (
            <div style={{
              position: 'absolute', inset: 0,
              background: '#18181b',
            }} />
          )}
          <img
            src={getBackdropUrl(fullMovie.backdropPath, 'original')}
            alt=""
            fetchpriority="high"
            decoding="async"
            onLoad={() => setBackdropLoaded(true)}
            style={{
              width: '100%', height: '100%', objectFit: 'cover',
              opacity: backdropLoaded ? 0.85 : 0,
              transition: 'opacity 0.3s ease',
            }}
          />
          {/* Deep cinematic gradient overlay to match native mobile styles */}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(to bottom, rgba(9,9,11,0.2) 0%, rgba(9,9,11,0.6) 70%, #09090b 100%)',
          }} />
        </div>

        {/* Responsive Content block wrapper */}
        {isMobile ? (
          <div style={{ padding: '0 16px 20px', marginTop: '-30px', position: 'relative', zIndex: 10 }}>
            {renderMetadataAndActions()}
          </div>
        ) : (
          <div style={{ padding: '0 40px 24px', marginTop: '-60px', position: 'relative', zIndex: 10, display: 'flex', gap: '40px', maxWidth: '1400px', marginLeft: 'auto', marginRight: 'auto' }}>
            {/* Left Column - Poster */}
            <div style={{ width: '280px', flexShrink: 0 }}>
              <img 
                src={getPosterUrl(fullMovie.posterPath, 'medium')} 
                alt={fullMovie.title} 
                style={{ 
                  width: '100%', 
                  borderRadius: '12px', 
                  border: '1px solid rgba(255,255,255,0.08)', 
                  boxShadow: '0 25px 60px rgba(0,0,0,0.6)' 
                }} 
              />
            </div>
            {/* Right Column - Information */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {renderMetadataAndActions()}
            </div>
          </div>
        )}

        {/* Tab switch wrapper (Matches margin guidelines) */}
        <div style={{ padding: isMobile ? '0 16px' : '0 40px', maxWidth: '1400px', marginLeft: 'auto', marginRight: 'auto' }}>
          {/* Tab Switcher: More / Critiques */}
          <div style={{ 
            display: 'flex', 
            borderBottom: '1px solid #18181b', 
            marginBottom: '24px',
            gap: '24px' 
          }}>
            {(['overview', 'trailers', 'reviews'] as TabState[]).map(tab => (
              <button
                key={tab}
                onClick={() => { triggerHaptic('light'); setActiveTab(tab); }}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '12px 0',
                  color: activeTab === tab ? '#fff' : '#71717a',
                  fontSize: '0.92rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  position: 'relative',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                {tab === 'overview' ? 'More Like This' : tab === 'trailers' ? 'Trailers' : 'Critiques'}
                {activeTab === tab && (
                  <div style={{
                    position: 'absolute',
                    bottom: '-1px',
                    left: 0,
                    right: 0,
                    height: '4px',
                    background: COLORS.primary,
                    borderRadius: '2px',
                  }} />
                )}
              </button>
            ))}
          </div>

          {/* Tab contents */}
          <div style={{ minHeight: '300px', paddingBottom: '80px' }}>
            {activeTab === 'overview' && (
              <div style={{ animation: 'fadeIn 0.2s ease-out both' }}>
                <CastSection cast={cast} onActorClick={onActorClick} />

                <h3 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '1.5rem', color: '#e5e5e5', marginTop: '10px' }}>More Like This</h3>
                {similarMovies.length > 0 ? (
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(3, 1fr)' : 'repeat(6, 1fr)', gap: '12px' }}>
                    {similarMovies.slice(0, isMobile ? 9 : 12).map(similar => (
                      <div
                        key={similar.id}
                        style={{
                          aspectRatio: '2/3',
                          background: '#18181b',
                          borderRadius: '8px',
                          overflow: 'hidden',
                          cursor: 'pointer',
                          border: '1px solid rgba(255,255,255,0.03)',
                          transition: 'all 0.2s ease-in-out',
                        }}
                        onClick={() => {
                          onClose();
                          setTimeout(() => window.dispatchEvent(new CustomEvent('movieClick', { detail: similar })), 50);
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
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>User Critiques</h3>
                  <button
                    onClick={() => { triggerHaptic('medium'); setIsReviewModalOpen(true); }}
                    style={{
                      background: 'none',
                      border: '1px solid rgba(255,255,255,0.2)',
                      padding: '6px 12px',
                      borderRadius: '4px',
                      color: '#fff',
                      fontSize: '0.8rem',
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

      {showPlayer && (
        <VideoPlayer
          src={streamUrl || `https://vidlink.pro/movie/${fullMovie.id}?primaryColor=ffffff`}
          title={fullMovie.title}
          onClose={() => { setShowPlayer(false); setIsPartyMode(false); content.refreshContinueWatching(); }}
          item={fullMovie}
          tracks={resolvedTracks}
          startTime={playbackMode === 'resume' && savedProgress ? savedProgress : 0}
          isPartyMode={isPartyMode}
          partySessionId={partySessionId}
          isPartyHost={isPartyHost}
        />
      )}

      {/* Centered Choice Popover Modal - Directly inside fixed container wrapper */}
      {showStreamSelector && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 4000,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            animation: 'fadeIn 0.2s ease-out'
          }}
          onClick={(e) => { e.stopPropagation(); setShowStreamSelector(false); }}
        >
          <div 
            style={{
              background: '#18181b',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '16px',
              padding: '24px',
              width: '100%',
              maxWidth: '400px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              animation: 'fadeInScale 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <h3 style={{ margin: 0, color: '#fff', fontSize: '1.2rem', fontWeight: 800, letterSpacing: '-0.02em' }}>Choose Player Server</h3>
              <button 
                onClick={() => setShowStreamSelector(false)} 
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

            {/* Smart Resume Playback Switcher */}
            {hasProgress && savedProgressPercent !== null && (
              <div style={{ 
                background: 'rgba(255,255,255,0.03)', 
                border: '1px solid rgba(255,255,255,0.06)', 
                borderRadius: '10px', 
                padding: '4px',
                display: 'flex',
                gap: '4px',
                marginBottom: '4px'
              }}>
                <button
                  onClick={() => { triggerHaptic('light'); setPlaybackMode('resume'); }}
                  style={{
                    flex: 1,
                    padding: '8px',
                    borderRadius: '8px',
                    border: 'none',
                    background: playbackMode === 'resume' ? 'rgba(255,255,255,0.1)' : 'transparent',
                    color: playbackMode === 'resume' ? '#fff' : 'rgba(255,255,255,0.5)',
                    fontWeight: 700,
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    textAlign: 'center'
                  }}
                >
                  Resume ({Math.round(savedProgressPercent)}%)
                </button>
                <button
                  onClick={() => { triggerHaptic('light'); setPlaybackMode('start'); }}
                  style={{
                    flex: 1,
                    padding: '8px',
                    borderRadius: '8px',
                    border: 'none',
                    background: playbackMode === 'start' ? 'rgba(255,255,255,0.1)' : 'transparent',
                    color: playbackMode === 'start' ? '#fff' : 'rgba(255,255,255,0.5)',
                    fontWeight: 700,
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    textAlign: 'center'
                  }}
                >
                  Play from Start
                </button>
              </div>
            )}
            
            {/* Local Server Option */}
            <button
              onClick={async () => {
                const success = await handleLocalServerPlay(playbackMode === 'resume');
                if (success) {
                  setShowStreamSelector(false);
                }
              }}
              disabled={localStreamLoading}
              style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '12px',
                padding: '16px',
                textAlign: 'left',
                cursor: localStreamLoading ? 'default' : 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                position: 'relative',
                overflow: 'hidden',
                transition: 'all 0.2s ease',
                opacity: localStreamLoading ? 0.8 : 1,
                outline: 'none',
              }}
              onMouseEnter={(e) => {
                if (!localStreamLoading) {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
                }
              }}
              onMouseLeave={(e) => {
                if (!localStreamLoading) {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                }
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fff', fontWeight: 700, fontSize: '0.95rem' }}>
                  {localStreamLoading ? (
                    <div style={{ width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.2)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <rect x="2" y="3" width="20" height="14" rx="2" />
                      <path d="M8 21h8M12 17v4" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                  )}
                  <span>{localStreamLoading ? 'Resolving Stream...' : 'Local Server'}</span>
                </div>
                <span style={{ fontSize: '0.68rem', fontWeight: 800, color: 'rgba(255, 255, 255, 0.4)', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'rgba(255, 255, 255, 0.06)', padding: '2px 8px', borderRadius: '6px' }}>Primary</span>
              </div>
              <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.78rem', lineHeight: '1.4' }}>
                Direct high-performance stream resolver using custom local endpoint configuration.
              </div>
            </button>

            {/* Standard Server Option */}
            <button
              onClick={async () => {
                setShowStreamSelector(false);
                await handlePlayClick(playbackMode === 'resume');
              }}
              style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '12px',
                padding: '16px',
                textAlign: 'left',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                transition: 'all 0.2s ease',
                outline: 'none',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fff', fontWeight: 700, fontSize: '0.95rem' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  <span>Standard Player</span>
                </div>
                <span style={{ fontSize: '0.68rem', fontWeight: 800, color: 'rgba(255, 255, 255, 0.4)', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'rgba(255, 255, 255, 0.06)', padding: '2px 8px', borderRadius: '6px' }}>Alternative</span>
              </div>
              <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.78rem', lineHeight: '1.4' }}>
                Alternative cloud-based content stream resolver with automated format selectors.
              </div>
            </button>
          </div>
        </div>
      )}
      <ReviewModal
        isOpen={isReviewModalOpen}
        onClose={() => setIsReviewModalOpen(false)}
        itemId={String(movie.id)}
        itemTitle={movie.title}
        onSuccess={() => setRefreshKey(prev => prev + 1)}
      />

      {/* Premium Centered YouTube Trailer Modal */}
      <AnimatePresence>
        {activeTrailerUrl && (
          <>
            <motion.div
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
                zIndex: 3000,
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
          </>
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
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
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
              background: '#18181b',
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
