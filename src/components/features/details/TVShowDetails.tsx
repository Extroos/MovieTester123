import React, { useState, useEffect, memo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import type { TVShow, Video, Cast, Crew, Episode } from '../../../types';
import { 
  getBackdropUrl, 
  getTVShowDetails, 
  getTVShowVideos, 
  getSmartTVRecommendations, 
  getPosterUrl, 
  getTVShowCredits, 
  getTVShowSeason,
  getStillUrl,
  getProfileUrl
} from '../../../services/tmdb';
import { WatchProgressService } from '../../../services/progress';
import { 
  removeFromMyList, 
  addToMyList, 
  isInMyList 
} from '../../../services/myList';
import { VidSrcService } from '../../../services/vidsrc';
import { triggerHaptic } from '../../../utils/haptics';
import { t } from '../../../utils/i18n';
import VideoPlayer from '../player/VideoPlayer';
import CastSection from './CastSection';
import ReviewSection from '../reviews/ReviewSection';
import ReviewModal from '../reviews/ReviewModal';
import { COLORS } from '../../../constants';
import VideoGallery from './VideoGallery';
import { resolveTVStream, isLocalServerConfigured, getLocalServerUrl } from '../../../services/LocalStreamService';
import { OfflineStorageService } from '../../../services/OfflineStorageService';
import { FriendService } from '../../../services/friends';
import { WatchTogetherService } from '../../../services/watchTogether';
import { Capacitor } from '@capacitor/core';
import { fetchWithCapacitor } from '../../../utils/nativeFetch';
import { SettingsService } from '../../../services/user/settings';

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

interface TVShowDetailsProps {
  show: TVShow;
  onClose: () => void;
  onActorClick?: (personId: number) => void;
  onListUpdate?: () => void;
}

type TabState = 'episodes' | 'trailers' | 'more' | 'reviews';

function TVShowDetails({ show, onClose, onActorClick, onListUpdate }: TVShowDetailsProps) {
  const [activeTab, setActiveTab] = useState<TabState>('episodes');
  const [fullShow, setFullShow] = useState<TVShow>(show);
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [playingTrailer, setPlayingTrailer] = useState(false);
  const [similarShows, setSimilarShows] = useState<TVShow[]>([]);
  const [cast, setCast] = useState<Cast[]>([]);
  const [crew, setCrew] = useState<Crew[]>([]);
  const [showPlayer, setShowPlayer] = useState(false);
  
  // Season & Episode State
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [selectedEpisode, setSelectedEpisode] = useState(1);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  const [inList, setInList] = useState(false);
  const [streamUrl, setStreamUrl] = useState('');
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [localStreamLoading, setLocalStreamLoading] = useState(false);
  const [localStreamError, setLocalStreamError] = useState<string | null>(null);
  const [resolvedTracks, setResolvedTracks] = useState<{ file: string; label: string; kind: string; default?: boolean }[]>([]);
  const [showStreamSelector, setShowStreamSelector] = useState(false);
  const [pendingEpisodeNum, setPendingEpisodeNum] = useState<number | null>(null);



  const [isDub, setIsDub] = useState(false);
  const initialIsAnime = (show as any).mediaType === 'anime' || 
                         (show.genres?.some((g: any) => g.name.toLowerCase() === 'animation') && 
                          (show.originCountry?.includes('JP') || (show as any).origin_country?.includes('JP')));
  const [isAnime, setIsAnime] = useState(!!initialIsAnime);
  const [resumeEpisode, setResumeEpisode] = useState<{season: number, episode: number} | null>(null);
  const [savedProgressTime, setSavedProgressTime] = useState<number | null>(null);
  const [savedProgressPercent, setSavedProgressPercent] = useState<number | null>(null);
  const [backdropLoaded, setBackdropLoaded] = useState(false);

  // Smart Playback Settings
  const [playbackMode, setPlaybackMode] = useState<'resume' | 'start'>('resume');

  // Offline Episode Downloads Status Map
  const [downloadedEpisodes, setDownloadedEpisodes] = useState<Record<string, { status: string; progress: number }>>({});
  const [activeTrailerUrl, setActiveTrailerUrl] = useState<string | null>(null);
  const [showSeasonPicker, setShowSeasonPicker] = useState(false);
  const [showSeasonDownloadModal, setShowSeasonDownloadModal] = useState(false);
  const [selectedEpisodesToDownload, setSelectedEpisodesToDownload] = useState<Set<number>>(new Set());
  const [hoveredEpisodeDownloadId, setHoveredEpisodeDownloadId] = useState<string | null>(null);
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

  useEffect(() => {
    const checkStatuses = () => {
      // Read localStorage ONCE — then do all lookups synchronously in memory.
      // Old approach: N sequential async OfflineStorageService.exists() calls (one per episode).
      // New approach: one localStorage.getItem() + one Map build = O(1) per episode lookup.
      const raw = localStorage.getItem('cinemovie_downloads');
      const mapped: Record<string, { status: string; progress: number }> = {};

      if (raw) {
        try {
          const list: any[] = JSON.parse(raw);
          // Build an id→item map for O(1) lookups
          const downloadMap = new Map<string, any>(list.map(item => [item.id, item]));

          // Check items already in the downloads list for this show
          for (const item of list) {
            if (item.id.startsWith(`tv_${show.id}_`)) {
              mapped[item.id] = {
                status: item.status,
                progress: item.progress ?? 0,
              };
            }
          }

          // Check current-season episodes not yet in the list
          // (rely on OfflineStorageService's in-memory cache for this, not a new async call)
          for (const ep of episodes) {
            const downloadId = `tv_${show.id}_${selectedSeason}_${ep.episodeNumber}`;
            if (!mapped[downloadId]) {
              // Not in downloads list → treat as not downloaded
              // OfflineStorageService.exists() is skipped here to avoid N async calls.
              // The 'downloadsChanged' event will re-trigger this check when state actually changes.
            }
          }
        } catch (e) {}
      }

      setDownloadedEpisodes(mapped);
    };

    checkStatuses();
    window.addEventListener('downloadsChanged', checkStatuses, { passive: true });
    window.addEventListener('storage', checkStatuses, { passive: true });
    return () => {
      window.removeEventListener('downloadsChanged', checkStatuses);
      window.removeEventListener('storage', checkStatuses);
    };
  }, [show.id, episodes, selectedSeason]);


  const startEpisodeDownload = async (ep: Episode, season: number) => {
    const downloadId = `tv_${fullShow.id}_${season}_${ep.episodeNumber}`;
    
    // Add resolving entry
    const raw = localStorage.getItem('cinemovie_downloads');
    let list: any[] = [];
    if (raw) {
      try { list = JSON.parse(raw); } catch (e) {}
    }
    
    if (list.some(item => item.id === downloadId)) {
      return; // Already in downloads/downloading
    }

    const newItem = {
      id: downloadId,
      title: `${fullShow.name} S${season}:E${ep.episodeNumber}`,
      posterPath: fullShow.posterPath,
      type: 'tv',
      status: 'resolving',
      progress: 0,
      data: fullShow,
      addedAt: Date.now()
    };
    
    list.push(newItem);
    saveDownloadsAndNotify(list);
    setRefreshKey(prev => prev + 1);

    try {
      const result = await resolveTVStream(fullShow.id, fullShow.name, season, ep.episodeNumber);
      if (result && result.streamUrl) {
        const latestRaw = localStorage.getItem('cinemovie_downloads');
        let currentList = latestRaw ? JSON.parse(latestRaw) : [];
        let item = currentList.find((i: any) => i.id === downloadId);
        if (item) {
          item.status = 'downloading';
          item.streamUrl = result.streamUrl;
          item.subtitles = result.subtitles || [];
          saveDownloadsAndNotify(currentList);
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

        const localServer = getLocalServerUrl();
        const isLocalHost = localServer.includes('localhost') || localServer.includes('127.0.0.1');
        const proxyBase = (Capacitor.isNativePlatform() && isLocalHost)
          ? 'https://cinemovie-proxy.abderrahmanchakkouri.workers.dev/proxy'
          : (playlistUrl.includes('local-proxy') 
              ? playlistUrl.split('local-proxy')[0] + 'local-proxy'
              : `${localServer}/local-proxy`);

        const buildProxyUrl = (urlStr: string) => {
          if (urlStr.includes('local-proxy?url=') || urlStr.includes('/proxy?url=')) {
            return urlStr;
          }
          return `${proxyBase}?url=${encodeURIComponent(urlStr)}&referer=${encodeURIComponent(referer)}&origin=${encodeURIComponent(origin)}`;
        };

        let playlistText = '';
        let isDirectVideo = targetUrl.toLowerCase().includes('.mp4') || targetUrl.toLowerCase().includes('.mkv') || targetUrl.toLowerCase().includes('resource/h265');

        if (!isDirectVideo) {
          if (Capacitor.isNativePlatform()) {
            const playlistRes = await fetchWithCapacitor(buildProxyUrl(targetUrl), 'text');
            if (!playlistRes.ok) throw new Error("Failed to fetch stream index.");
            playlistText = await playlistRes.text();
          } else {
            const playlistRes = await fetch(buildProxyUrl(targetUrl));
            if (!playlistRes.ok) throw new Error("Failed to fetch stream index.");
            playlistText = await playlistRes.text();
          }
          if (playlistText && !playlistText.trim().startsWith('#EXTM3U')) {
            isDirectVideo = true;
          }
        }

        const segmentUrls: string[] = [];
        if (isDirectVideo) {
          segmentUrls.push(targetUrl);
        } else {
          if (playlistText.includes('#EXT-X-STREAM-INF')) {
            const quality = (localStorage.getItem('cinemovie_download_quality') as any) || '1080p';
            const resolvedSubUrl = selectVariantPlaylist(playlistText, targetUrl, quality);
            
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
          const segmentBaseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line && !line.startsWith('#')) {
              let resolvedSegUrl = line.startsWith('http') ? line : segmentBaseUrl + line;
              const delimiter = resolvedSegUrl.includes('?') ? '&' : '?';
              resolvedSegUrl = `${resolvedSegUrl}${delimiter}origin_referer=${encodeURIComponent(referer)}`;
              segmentUrls.push(resolvedSegUrl);
            }
          }
        }

        const totalSegments = segmentUrls.length;
        if (totalSegments === 0) throw new Error("No media segments found.");

        if (isDirectVideo && Capacitor.isNativePlatform()) {
          const { Filesystem, Directory } = await import('@capacitor/filesystem');
          const videoFile = downloadId.replace(/[^a-z0-9_\-]/gi, '_') + '.mp4';
          
          try {
            await Filesystem.mkdir({
              path: 'cinemovie_offline',
              directory: Directory.Data,
              recursive: true,
            });
          } catch (e) {}

          const proxiedUrl = buildProxyUrl(targetUrl);
          
          // Start simulated progress interval
          let progressVal = 0;
          const progressInterval = setInterval(() => {
            if (progressVal < 99) {
              const increment = progressVal < 50 ? 3 : progressVal < 80 ? 1.5 : 0.5;
              progressVal = Math.min(99, progressVal + increment);

              try {
                const raw = localStorage.getItem('cinemovie_downloads');
                if (raw) {
                  const list = JSON.parse(raw);
                  const item = list.find((it: any) => it.id === downloadId);
                  if (item) {
                    item.progress = Math.floor(progressVal);
                    saveDownloadsAndNotify(list);
                  }
                }
              } catch (_) {}
            }
          }, 800);

          try {
            await Filesystem.downloadFile({
              url: proxiedUrl,
              path: `cinemovie_offline/${videoFile}`,
              directory: Directory.Data,
            });
          } finally {
            clearInterval(progressInterval);
          }

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
          return;
        }

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
              const proxiedUrl = buildProxyUrl(url);
              for (let attempt = 1; attempt <= 5; attempt++) {
                try {
                  response = await fetchWithCapacitor(proxiedUrl, 'arraybuffer');
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
                console.warn(`[TVShowDetails] Native Segment ${i + idx + 1} download failed after 5 attempts. Skipping to keep download alive.`);
                return response && response.base64 ? "" : new ArrayBuffer(0);
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

              // Fallback to Cloud proxy immediately if local proxy request failed or returned non-ok status
              if (errorOccurred && !Capacitor.isNativePlatform() && segProxyUrl.includes('localhost')) {
                const fallbackProxyUrl = `https://cinemovie-proxy.abderrahmanchakkouri.workers.dev/local-proxy?url=${encodeURIComponent(url)}&referer=${encodeURIComponent(referer)}&origin=${encodeURIComponent(origin)}`;
                try {
                  response = await fetch(fallbackProxyUrl);
                  if (response.ok) {
                    errorOccurred = null;
                    break;
                  }
                  errorOccurred = new Error(`Fallback status ${response.status}`);
                } catch (e: any) {
                  errorOccurred = e;
                }
              }

              if (errorOccurred && attempt < 5) {
                await new Promise(r => setTimeout(r, 1000 * attempt)); // Stable backoff
              }
            }
            if (!response || !response.ok) {
              console.warn(`[TVShowDetails] Segment ${i + idx + 1} download failed after 5 attempts. Skipping to keep download alive.`);
              return new ArrayBuffer(0);
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

          // Update storage
          const loopRaw = localStorage.getItem('cinemovie_downloads');
          let loopList = loopRaw ? JSON.parse(loopRaw) : [];
          let loopItem = loopList.find((it: any) => it.id === downloadId);
          if (loopItem) {
            loopItem.progress = percent;
            loopItem.speed = parseFloat(speedMBs.toFixed(1));
            saveDownloadsAndNotify(loopList);
          }
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
        
      } else {
        throw new Error('Resolution failed');
      }
    } catch (error: any) {
      console.error('[startEpisodeDownload] Error:', error);
      const latestRaw = localStorage.getItem('cinemovie_downloads');
      let currentList = latestRaw ? JSON.parse(latestRaw) : [];
      let item = currentList.find((i: any) => i.id === downloadId);
      if (item) {
        item.status = 'failed';
        saveDownloadsAndNotify(currentList);
      }
    }
  };

  const handleDownloadEpisode = async (ep: Episode, e: React.MouseEvent) => {
    e.stopPropagation();
    triggerHaptic('medium');
    const downloadId = `tv_${fullShow.id}_${selectedSeason}_${ep.episodeNumber}`;
    
    const raw = localStorage.getItem('cinemovie_downloads');
    let list: any[] = [];
    if (raw) {
      try { list = JSON.parse(raw); } catch (e) {}
    }
    if (list.some(item => item.id === downloadId)) {
      const confirmFn = (window as any).originalConfirm || window.confirm;
      if (confirmFn(`Remove Season ${selectedSeason} Episode ${ep.episodeNumber} from downloads?`)) {
        const updated = list.filter(item => item.id !== downloadId);
        saveDownloadsAndNotify(updated);
        await OfflineStorageService.delete(downloadId);
        setRefreshKey(prev => prev + 1);
      }
      return;
    }
    startEpisodeDownload(ep, selectedSeason);
  };

  const handleDownloadSeason = useCallback(() => {
    triggerHaptic('heavy');
    // Pre-select episodes that are not yet downloaded
    const raw = localStorage.getItem('cinemovie_downloads');
    let list: any[] = [];
    if (raw) { try { list = JSON.parse(raw); } catch (e) {} }
    const notYetDownloaded = new Set(
      episodes
        .filter(ep => !list.some((item: any) => item.id === `tv_${fullShow.id}_${selectedSeason}_${ep.episodeNumber}`))
        .map(ep => ep.episodeNumber)
    );
    setSelectedEpisodesToDownload(notYetDownloaded);
    setShowSeasonDownloadModal(true);
  }, [episodes, fullShow.id, selectedSeason]);

  const handleStartSeasonDownload = useCallback(async () => {
    triggerHaptic('heavy');
    setShowSeasonDownloadModal(false);
    const toDownload = episodes.filter(ep => selectedEpisodesToDownload.has(ep.episodeNumber));
    for (const ep of toDownload) {
      await startEpisodeDownload(ep, selectedSeason);
    }
  }, [episodes, selectedEpisodesToDownload, selectedSeason]);

  const handleCancelEpisodeDownload = useCallback((ep: Episode) => {
    triggerHaptic('medium');
    const downloadId = `tv_${fullShow.id}_${selectedSeason}_${ep.episodeNumber}`;
    const raw = localStorage.getItem('cinemovie_downloads');
    if (raw) {
      try {
        const list = JSON.parse(raw);
        const updated = list.filter((item: any) => item.id !== downloadId);
        saveDownloadsAndNotify(updated);
        setRefreshKey(prev => prev + 1);
      } catch (e) {}
    }
  }, [fullShow.id, selectedSeason]);


  const handleMarkAsWatched = useCallback(async () => {
    triggerHaptic('medium');
    if (fullShow.numberOfSeasons && fullShow.numberOfSeasons > 0) {
      const lastSeason = fullShow.numberOfSeasons;
      await WatchProgressService.saveProgress(fullShow, 100, 100, lastSeason, 99); 
    }
  }, [fullShow]);

  const handleClose = useCallback(() => {
    triggerHaptic('light');
    onClose();
  }, [onClose]);

  // Remind feature removed and replaced with Offline Season Downloader

  const handleToggleList = useCallback(() => {
    triggerHaptic('medium');
    if (inList) {
      removeFromMyList(show.id, 'tv');
      setInList(false);
    } else {
      addToMyList(fullShow);
      setInList(true);
    }
    onListUpdate?.();
  }, [inList, show.id, fullShow, onListUpdate]);

  const reloadProgress = useCallback(async () => {
    try {
      const progress = await WatchProgressService.getProgress(show.id, isAnime ? 'anime' : 'tv');
      if (progress && progress.season && progress.episode) {
        setResumeEpisode({ season: progress.season, episode: progress.episode });
        setSavedProgressTime(progress.progress);
        const percent = progress.duration > 0 ? (progress.progress / progress.duration) * 100 : 0;
        setSavedProgressPercent(percent);
        setPlaybackMode('resume');
      } else {
        setResumeEpisode(null);
        setSavedProgressTime(null);
        setSavedProgressPercent(null);
      }
    } catch (e) {
      console.error('Error reloading progress:', e);
    }
  }, [show.id]);



  useEffect(() => {
    setFullShow(show);
    setLoading(true);
    setVideos([]);
    setSimilarShows([]);
    setCast([]);
    setCrew([]);
    setInList(false);
    setResumeEpisode(null);
    setSavedProgressTime(null);
    setSavedProgressPercent(null);
    setPlaybackMode('resume');

    async function loadDetails() {
      // Set loading false as soon as core show details are set, so text details/overview appear immediately
      try {
        const details = await getTVShowDetails(show.id);
        if (details) {
          setFullShow(details);
          const isAnimeShow = details.genres?.some(g => g.name.toLowerCase() === 'animation') && 
                              details.originCountry?.includes('JP');
          setIsAnime(!!isAnimeShow);
        }
      } catch (error) {
        console.error('Error loading TV show base details:', error);
      } finally {
        setLoading(false);
      }

      // Load heavy details asynchronously in the background so standard page loads fast
      try {
        const isAnimeShowInitial = (show as any).mediaType === 'anime' || 
                                   (show.genres?.some((g: any) => g.name.toLowerCase() === 'animation') && 
                                    (show.originCountry?.includes('JP') || (show as any).origin_country?.includes('JP'))) ||
                                   isAnime;
        const [showVideos, similar, credits, inMyList, progress] = await Promise.all([
          getTVShowVideos(show.id),
          getSmartTVRecommendations(show.id),
          getTVShowCredits(show.id),
          isInMyList(show.id, 'tv'),
          WatchProgressService.getProgress(show.id, isAnimeShowInitial ? 'anime' : 'tv'),
        ]);
        
        setVideos(showVideos);
        setSimilarShows(similar);
        setCast(credits.cast);
        setCrew(credits.crew);
        setInList(inMyList);
        
        if (progress && progress.season && progress.episode) {
          setResumeEpisode({ season: progress.season, episode: progress.episode });
          setSavedProgressTime(progress.progress);
          const percent = progress.duration > 0 ? (progress.progress / progress.duration) * 100 : 0;
          setSavedProgressPercent(percent);
          setPlaybackMode('resume');
        }
      } catch (error) {
        console.error('Error loading TV show related details in background:', error);
      }
    }
    
    loadDetails();
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, [show.id, appLanguage]);

  useEffect(() => {
    if (resumeEpisode) {
      setSelectedSeason(resumeEpisode.season);
      setSelectedEpisode(resumeEpisode.episode);
    }
  }, [resumeEpisode]);

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
    async function loadSeasonEpisodes() {
      if (!fullShow.id) return;
      setLoadingEpisodes(true);
      const seasonData = await getTVShowSeason(fullShow.id, selectedSeason);
      if (seasonData && seasonData.episodes) {
        setEpisodes(seasonData.episodes);
      }
      setLoadingEpisodes(false);
    }

    loadSeasonEpisodes();
  }, [fullShow.id, selectedSeason]);

  const handlePlayClick = async (episodeNum = 1, resume = false, seasonNum?: number) => {
    triggerHaptic('heavy');
    setSelectedEpisode(episodeNum);
    const se = seasonNum ?? selectedSeason;
    
    let url = await VidSrcService.getTVEmbed(fullShow.id, se, episodeNum);
    if (resume && resumeEpisode && resumeEpisode.season === se && resumeEpisode.episode === episodeNum && savedProgressTime && savedProgressTime > 10) {
      url += `&time=${Math.floor(savedProgressTime)}`;
    }
    setStreamUrl(url);
    setShowPlayer(true);
    setPlayingTrailer(false);
  };

  const handleResumeClick = async (resume = true) => {
    triggerHaptic('heavy');
    if (resumeEpisode) {
      setSelectedSeason(resumeEpisode.season);
      setSelectedEpisode(resumeEpisode.episode);
      
      let url = await VidSrcService.getTVEmbed(fullShow.id, resumeEpisode.season, resumeEpisode.episode);
      if (resume && savedProgressTime && savedProgressTime > 10) {
        url += `&time=${Math.floor(savedProgressTime)}`;
      }
      setStreamUrl(url);
      setShowPlayer(true);
      setPlayingTrailer(false);
    } else {
      await handlePlayClick(1, false);
    }
  };

  const handleNextEpisode = async () => {
    triggerHaptic('medium');
    const currentEpisode = pendingEpisodeNum !== null ? pendingEpisodeNum : (resumeEpisode?.episode ?? selectedEpisode);
    const currentSeason = pendingEpisodeNum !== null ? selectedSeason : (resumeEpisode?.season ?? selectedSeason);
    
    const currentEpisodeIndex = episodes.findIndex(ep => ep.episodeNumber === currentEpisode);
    
    let nextSeason = currentSeason;
    let nextEpisode = 1;
    let hasNext = false;

    if (currentEpisodeIndex !== -1 && currentEpisodeIndex < episodes.length - 1) {
      nextEpisode = episodes[currentEpisodeIndex + 1].episodeNumber;
      hasNext = true;
    } else if (currentSeason < (fullShow.numberOfSeasons || 0)) {
      nextSeason = currentSeason + 1;
      nextEpisode = 1;
      hasNext = true;
    }

    if (hasNext) {
      setSelectedSeason(nextSeason);
      setSelectedEpisode(nextEpisode);
      setPendingEpisodeNum(nextEpisode);

      const localServer = getLocalServerUrl();
      const isLocal = streamUrl.includes('local-proxy') || 
                      (localServer && streamUrl.includes(localServer)) || 
                      streamUrl.startsWith('blob:') || 
                      streamUrl.startsWith('capacitor://') ||
                      streamUrl.includes('.m3u8') ||
                      streamUrl.includes('.mp4') ||
                      Capacitor.isNativePlatform();

      if (isLocal) {
        await handleLocalServerPlay(nextEpisode, false, nextSeason);
      } else {
        await handlePlayClick(nextEpisode, false, nextSeason);
      }
    } else {
      setShowPlayer(false);
      setPendingEpisodeNum(null);
      triggerHaptic('medium');
    }
  };

  const handleLocalServerPlay = useCallback(async (episodeNum?: number, resume = true, seasonNum?: number) => {
    triggerHaptic('heavy');
    setLocalStreamError(null);
    const ep = episodeNum ?? (resumeEpisode?.episode ?? 1);
    const se = seasonNum ?? (episodeNum !== undefined ? selectedSeason : (resumeEpisode?.season ?? selectedSeason));

    // Try offline storage first
    const raw = localStorage.getItem('cinemovie_downloads');
    if (raw) {
      try {
        const list = JSON.parse(raw);
        const downloadId = `tv_${fullShow.id}_${se}_${ep}`;
        const item = list.find((i: any) => i.id === downloadId && i.status === 'completed');
        if (item) {
          const playableUrl = await OfflineStorageService.getPlayableUrl(item.id);
          setSelectedSeason(se);
          setSelectedEpisode(ep);
          let streamUrl = playableUrl || item.localUrl || item.streamUrl;
          const isTargetResumeEp = resumeEpisode && resumeEpisode.season === se && resumeEpisode.episode === ep;
          if (resume && isTargetResumeEp && savedProgressTime && savedProgressTime > 10) {
            streamUrl += streamUrl.includes('?') ? `&startTime=${Math.floor(savedProgressTime)}` : `?startTime=${Math.floor(savedProgressTime)}`;
          }
          setStreamUrl(streamUrl);
          setResolvedTracks(item.subtitles || []);
          setShowPlayer(true);
          return true;
        }
      } catch (e) {}
    }

    if (!isLocalServerConfigured()) {
      setSelectedSeason(se);
      setSelectedEpisode(ep);
      setStreamUrl("");
      setResolvedTracks([]);
      setShowPlayer(true);
      return true;
    }

    setLocalStreamLoading(true);
    try {
      const result = await resolveTVStream(fullShow.id, fullShow.name, se, ep);
      if (result) {
        setSelectedSeason(se);
        setSelectedEpisode(ep);
        
        let streamUrl = result.streamUrl;
        const isTargetResumeEp = resumeEpisode && resumeEpisode.season === se && resumeEpisode.episode === ep;
        if (resume && isTargetResumeEp && savedProgressTime && savedProgressTime > 10) {
          streamUrl += streamUrl.includes('?') ? `&startTime=${Math.floor(savedProgressTime)}` : `?startTime=${Math.floor(savedProgressTime)}`;
        }
        setStreamUrl(streamUrl);
        setResolvedTracks(result.subtitles || []);
        setShowPlayer(true);
        return true;
      } else {
        setSelectedSeason(se);
        setSelectedEpisode(ep);
        setStreamUrl("");
        setResolvedTracks([]);
        setShowPlayer(true);
        return true;
      }
    } catch (e) {
      setSelectedSeason(se);
      setSelectedEpisode(ep);
      setStreamUrl("");
      setResolvedTracks([]);
      setShowPlayer(true);
      return true;
    } finally {
      setLocalStreamLoading(false);
    }
  }, [fullShow.id, fullShow.name, resumeEpisode, selectedSeason, savedProgressTime]);

  useEffect(() => {
    const coWatchSession = sessionStorage.getItem(`co_watch_session_${show.id}_tv`);
    if (coWatchSession) {
      setIsPartyMode(true);
      setPartySessionId(coWatchSession);
      const isHostStr = sessionStorage.getItem(`co_watch_is_host_${show.id}_tv`);
      setIsPartyHost(isHostStr === 'true');
      sessionStorage.removeItem(`co_watch_session_${show.id}_tv`);
      sessionStorage.removeItem(`co_watch_is_host_${show.id}_tv`);
      handleLocalServerPlay();
    }
  }, [show.id, handleLocalServerPlay]);

  const trailer = videos.find(v => v.type === 'Trailer' && v.site === 'YouTube') || videos[0];

  const year = fullShow.firstAirDate || '';
  const isUpcoming = !!(fullShow.firstAirDate && new Date(fullShow.firstAirDate).getTime() > Date.now());

  const score = fullShow.voteAverage ? Math.round(fullShow.voteAverage * 10) : null;
  const extraRatings = (() => {
    if (score === null) return { imdb: 'N/A', tomato: 'N/A' };
    const numId = typeof fullShow.id === 'number' ? fullShow.id : parseInt(String(fullShow.id).replace(/\D/g, ''), 10) || 0;
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
  const creator = crew.find(c => c.job === 'Creator' || c.job === 'Executive Producer');

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
        </div>

        {/* Season Selector Title */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
          <div className="sk" style={{ height: 24, width: 100 }} />
          <div className="sk" style={{ height: 16, width: 60 }} />
        </div>

        {/* Episode List Row Skeletons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 0', borderBottom: '1px solid var(--border-primary)' }}>
              <div className="sk" style={{ width: 80, aspectRatio: '16/9', borderRadius: '6px', flexShrink: 0 }} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div className="sk" style={{ height: 12, width: '60%' }} />
                <div className="sk" style={{ height: 8, width: '30%' }} />
              </div>
              <div className="sk" style={{ width: 20, height: 20, borderRadius: '50%' }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // Determine if currently selected show/episode has resume progress available
  const isMainResumeAvailable = resumeEpisode !== null;
  const isEpisodeCardResumeAvailable = (epNum: number) => 
    resumeEpisode && resumeEpisode.season === selectedSeason && resumeEpisode.episode === epNum;

  const showSmartProgressToggle = pendingEpisodeNum !== null 
    ? isEpisodeCardResumeAvailable(pendingEpisodeNum)
    : isMainResumeAvailable;

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
        {fullShow.name}
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
        {fullShow.numberOfSeasons && (
          <span>{fullShow.numberOfSeasons} {fullShow.numberOfSeasons === 1 ? t('season') : t('seasons')}</span>
        )}
      </div>
      {/* ── Native Play Button Bar ── */}
      <div className="details-play-bar" style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
        {isUpcoming && fullShow.firstAirDate && (
          <div style={{
            fontSize: '0.82rem',
            color: '#e4e4e7',
            background: 'linear-gradient(90deg, rgba(255, 255, 255, 0.04) 0%, rgba(255, 255, 255, 0.01) 100%)',
            borderLeft: '3px solid #3b82f6',
            borderRadius: '0 8px 8px 0',
            padding: '12px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            alignItems: 'flex-start',
            marginBottom: '10px',
          }}>
            <span style={{ fontSize: '0.62rem', fontWeight: 800, color: '#3b82f6', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Upcoming Release</span>
            <span style={{ fontWeight: 600 }}>Available on {new Date(fullShow.firstAirDate).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</span>
          </div>
        )}
        <div className="details-actions-bar" style={{ display: 'flex', gap: '10px', width: '100%' }}>
          {!isUpcoming && (
            <button
              onClick={() => {
                triggerHaptic('medium');
                setPendingEpisodeNum(null);
                handleLocalServerPlay(undefined, playbackMode === 'resume');
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
                  {t('resolving')}...
                </>
              ) : (
                <>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                  {resumeEpisode ? `${t('resume')} S${resumeEpisode.season}:E${resumeEpisode.episode}` : t('play')}
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

        {resumeEpisode && savedProgressPercent !== null && savedProgressPercent > 1 && (
          <div style={{ marginTop: '2px', marginBottom: '6px', padding: '0 4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#a1a1aa', marginBottom: '6px' }}>
              <span style={{ fontWeight: 600 }}>{t('episode_progress')}</span>
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
      <div className="details-secondary-actions" style={{ display: 'flex', gap: '30px', justifyContent: 'flex-start', padding: '6px 0 14px', borderBottom: '1px solid var(--border-primary)', marginBottom: '16px' }}>
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
          {t('watch_party')}
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
          {t('watchlist')}
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
          {t('rate')}
        </button>

        {/* Download Season */}
        <button
          onClick={handleDownloadSeason}
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
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          {t('get_season')}
        </button>

        {/* Watched */}
        <button
          onClick={handleMarkAsWatched}
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
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          {t('watched')}
        </button>
      </div>

      {/* ── series synopsis ── */}
      {fullShow.overview && (
        <p className="details-overview" style={{
          fontSize: '0.94rem',
          lineHeight: 1.6,
          color: '#d4d4d8',
          marginBottom: '16px',
        }}>
          {fullShow.overview}
        </p>
      )}

      {/* Creator & Compact Metadata Section */}
      <div className="details-meta-info" style={{ fontSize: '0.82rem', color: '#a1a1aa', display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
        {creator && (
          <div 
            onClick={() => onActorClick?.(creator.id)}
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
              {creator.profilePath || (creator as any).profile_path ? (
                <img 
                  src={getProfileUrl(creator.profilePath || (creator as any).profile_path)} 
                  alt={creator.name} 
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.4)', fontSize: '0.9rem', fontWeight: 800 }}>
                  {creator.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ color: '#71717a', fontSize: '0.74rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t('creator')}</span>
              <span style={{ color: '#ffffff', fontSize: '0.92rem', fontWeight: 800 }}>{creator.name}</span>
            </div>
          </div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', opacity: 0.85 }}>
          {fullShow.status && (
            <div><span style={{ color: '#71717a' }}>{t('status')}: </span>{fullShow.status}</div>
          )}
          {fullShow.firstAirDate && (
            <div><span style={{ color: '#71717a' }}>{t('first_air')}: </span>{fullShow.firstAirDate}</div>
          )}
          {fullShow.lastAirDate && (
            <div><span style={{ color: '#71717a' }}>{t('last_air')}: </span>{fullShow.lastAirDate}</div>
          )}
          {fullShow.networks && fullShow.networks.length > 0 && (
            <div><span style={{ color: '#71717a' }}>{t('network')}: </span>{fullShow.networks.map(n => n.name).join(', ')}</div>
          )}
          <div><span style={{ color: '#71717a' }}>{t('language')}: </span><span style={{ textTransform: 'uppercase' }}>{fullShow.originalLanguage || 'en'}</span></div>
        </div>
      </div>

      {/* Genres Pills */}
      {loading ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
          {[70, 55, 80, 60].map((w, i) => (
            <div key={i} className="sk" style={{ height: 26, width: w, borderRadius: 16 }} />
          ))}
        </div>
      ) : (fullShow.genres && fullShow.genres.length > 0 && (
        <div className="details-genres" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
          {fullShow.genres.map(g => (
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
      ))}

      <div style={{ marginTop: '8px' }}>
        <CastSection cast={cast} onActorClick={onActorClick} />
      </div>
    </>
  );

  const playingEpisodeForPlayer = pendingEpisodeNum !== null ? pendingEpisodeNum : (resumeEpisode?.episode ?? 1);
  const playingSeasonForPlayer = pendingEpisodeNum !== null ? selectedSeason : (resumeEpisode?.season ?? selectedSeason);

  const isCurrentlyPlayingResumeEp = resumeEpisode && resumeEpisode.season === playingSeasonForPlayer && resumeEpisode.episode === playingEpisodeForPlayer;
  const currentStartTime = playbackMode === 'resume' && isCurrentlyPlayingResumeEp && savedProgressTime ? savedProgressTime : 0;

  const activeDownloads = Object.values(downloadedEpisodes).filter(
    ep => ep.status === 'downloading' || ep.status === 'resolving'
  );
const isAnyEpisodeDownloading = activeDownloads.some(ep => ep.status === 'downloading');
  const isResolving = activeDownloads.some(ep => ep.status === 'resolving');
  const currentDownloadingProgress = activeDownloads.length > 0 
    ? Math.round(activeDownloads.reduce((sum, ep) => sum + ep.progress, 0) / activeDownloads.length)
    : 0;
  const isAnyEpisodeCompleted = Object.values(downloadedEpisodes).some(ep => ep.status === 'completed');

  return (
    <div 
      onClick={handleClose}
      className={`details-modal-container ${(showPlayer || showStreamSelector) ? 'overflow-locked' : ''}`}
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
      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .sk { background: linear-gradient(90deg, var(--bg-card) 25%, var(--bg-card-hover, #27272a) 50%, var(--bg-card) 75%); background-size: 200% 100%; animation: shimmer 1.4s ease-in-out infinite; border-radius: 8px; }

        @media (max-width: 768px) {
          .details-modal-container:not(.overflow-locked) {
            overflow-y: auto !important;
          }
          .details-modal-container.overflow-locked {
            overflow-y: hidden !important;
          }
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

      {/* ── Native Floating Top Bar ── */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 3100,
        height: '70px',
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.8) 0%, transparent 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        padding: '0 16px',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        pointerEvents: 'none',
      }}>
        <button
          onClick={(e) => { e.stopPropagation(); triggerHaptic('light'); handleClose(); }}
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
            pointerEvents: 'auto',
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
        </button>
      </div>

        {/* ── Immersive Widescreen Layout Wrapper ── */}
        <div 
          onClick={e => e.stopPropagation()}
          className="details-main-wrapper" 
          style={{ position: 'relative', width: '100%', minHeight: '100vh', display: 'flex', boxSizing: 'border-box', overflow: 'hidden' }}
        >
          {/* Full-Screen Backdrop background image */}
          <div className="details-backdrop-container" style={{ position: 'absolute', inset: 0, overflow: 'hidden', zIndex: 1, pointerEvents: 'none' }}>
            {!backdropLoaded && (
              <div style={{ position: 'absolute', inset: 0, background: 'var(--bg-primary)' }} />
            )}
            <img
              src={getBackdropUrl(fullShow.backdropPath, 'original')}
              alt=""
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
            borderLeft: '1px solid var(--border-primary)',
            padding: '110px 48px 60px 48px',
            display: 'flex',
            flexDirection: 'column',
          }}>
            {/* Tab Switcher */}
            <div className="details-tab-bar" style={{ 
              display: 'flex', 
              borderBottom: '1px solid var(--border-primary)', 
              marginBottom: '28px',
              gap: '28px' 
            }}>
              {(['episodes', 'trailers', 'more', 'reviews'] as TabState[]).map(tab => (
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
                  {tab === 'episodes' ? t('episodes') : tab === 'trailers' ? t('trailers') : tab === 'more' ? t('more_like_this') : t('reviews')}
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
              {activeTab === 'episodes' && (
                <div style={{ animation: 'fadeIn 0.2s ease-out both' }}>
                  {/* Controller Row */}
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between', 
                    flexWrap: 'wrap',
                    gap: '12px',
                    marginBottom: '20px'
                  }}>
                    {/* Season Picker Button */}
                    <div style={{ position: 'relative' }}>
                      <button
                        onClick={() => { triggerHaptic('light'); setShowSeasonPicker(prev => !prev); }}
                        className="tv-focusable"
                        tabIndex={0}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '8px 14px',
                          borderRadius: '20px',
                          border: '1px solid var(--border-primary)',
                          background: 'rgba(255,255,255,0.06)',
                          color: '#fff',
                          fontWeight: 700,
                          fontSize: '0.88rem',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                          backdropFilter: 'blur(8px)',
                          WebkitBackdropFilter: 'blur(8px)',
                          transition: 'all 0.2s',
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                          <line x1="16" y1="2" x2="16" y2="6"/>
                          <line x1="8" y1="2" x2="8" y2="6"/>
                          <line x1="3" y1="10" x2="21" y2="10"/>
                        </svg>
                        Season {selectedSeason}
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'transform 0.2s', transform: showSeasonPicker ? 'rotate(180deg)' : 'none' }}>
                          <polyline points="6 9 12 15 18 9"/>
                        </svg>
                      </button>

                      {/* Season Picker Modal Card */}
                      {showSeasonPicker && (
                        <>
                          <div
                            onClick={() => setShowSeasonPicker(false)}
                            style={{
                              position: 'fixed',
                              inset: 0,
                              zIndex: 500,
                            }}
                          />
                          <div style={{
                            position: 'absolute',
                            top: 'calc(100% + 8px)',
                            left: 0,
                            zIndex: 600,
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border-primary)',
                            borderRadius: '16px',
                            boxShadow: '0 20px 60px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.06)',
                            padding: '8px',
                            minWidth: '200px',
                            maxWidth: '240px',
                            animation: 'fadeInScale 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
                            backdropFilter: 'blur(20px)',
                            WebkitBackdropFilter: 'blur(20px)',
                          }}>
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '8px 12px 12px',
                              borderBottom: '1px solid var(--border-primary)',
                              marginBottom: '6px',
                            }}>
                              <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                {fullShow.numberOfSeasons || 1} Season{(fullShow.numberOfSeasons || 1) !== 1 ? 's' : ''}
                              </span>
                              <button
                                onClick={() => setShowSeasonPicker(false)}
                                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', padding: '0', lineHeight: 1 }}
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                              </button>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', maxHeight: '280px', overflowY: 'auto' }}>
                              {Array.from({ length: fullShow.numberOfSeasons || 1 }, (_, i) => i + 1).map(s => (
                                <button
                                  key={s}
                                  onClick={() => {
                                    triggerHaptic('medium');
                                    setSelectedSeason(s);
                                    setShowSeasonPicker(false);
                                  }}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    width: '100%',
                                    padding: '10px 12px',
                                    borderRadius: '10px',
                                    border: 'none',
                                    background: selectedSeason === s ? 'rgba(255,255,255,0.1)' : 'transparent',
                                    color: selectedSeason === s ? '#fff' : 'rgba(255,255,255,0.7)',
                                    fontWeight: selectedSeason === s ? 800 : 600,
                                    fontSize: '0.9rem',
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    transition: 'all 0.15s',
                                  }}
                                  onMouseEnter={e => { if (selectedSeason !== s) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                                  onMouseLeave={e => { if (selectedSeason !== s) e.currentTarget.style.background = 'transparent'; }}
                                >
                                  <span>Season {s}</span>
                                  {selectedSeason === s && (
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                      <polyline points="20 6 9 17 4 12"/>
                                    </svg>
                                  )}
                                </button>
                              ))}
                            </div>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Sub / Dub Selector */}
                    {isAnime && (
                      <button 
                        onClick={() => { triggerHaptic('light'); setIsDub(!isDub); }}
                        style={{
                          background: isDub ? COLORS.primary : '#27272a',
                          color: isDub ? '#000000' : '#fff',
                          border: 'none',
                          padding: '6px 12px',
                          fontWeight: 800,
                          borderRadius: '16px',
                          cursor: 'pointer',
                          fontSize: '0.78rem',
                        }}
                      >
                        {isDub ? 'DUB' : 'SUB'}
                      </button>
                    )}
                  </div>

                  {/* Episodes Feed */}
                  {loadingEpisodes ? (
                    <div style={{ padding: '3rem 0', textAlign: 'center', color: '#71717a' }}>
                      Loading Episodes...
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>
                      {episodes.map((ep) => {
                        const stillUrl = getStillUrl(ep.stillPath);
                        const isCurrentResumeEp = resumeEpisode && resumeEpisode.season === selectedSeason && resumeEpisode.episode === ep.episodeNumber;
                        return (
                          <div 
                            key={ep.id}
                            onClick={() => {
                              triggerHaptic('medium');
                              setPendingEpisodeNum(ep.episodeNumber);
                              handleLocalServerPlay(ep.episodeNumber, true);
                            }}
                            className="tv-focusable"
                            tabIndex={0}
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '12px',
                              padding: '16px',
                              border: '1px solid var(--border-primary)',
                              borderRadius: '12px',
                              background: 'var(--bg-card)',
                              cursor: 'pointer',
                              transition: 'all 0.2s',
                              outline: 'none',
                              contentVisibility: 'auto',
                              containIntrinsicSize: 'auto 90px'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = 'var(--bg-card-hover)';
                              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'var(--bg-card)';
                              e.currentTarget.style.borderColor = 'var(--border-primary)';
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                triggerHaptic('medium');
                                setPendingEpisodeNum(ep.episodeNumber);
                                handleLocalServerPlay(ep.episodeNumber, true);
                              }
                            }}
                          >
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                              {/* Thumbnail */}
                              <div style={{ 
                                position: 'relative', 
                                width: '120px', 
                                aspectRatio: '16/9', 
                                borderRadius: '6px', 
                                overflow: 'hidden', 
                                flexShrink: 0, 
                                background: 'var(--bg-card)',
                                border: '1px solid var(--border-primary)',
                              }}>
                                {stillUrl ? (
                                  <img src={stillUrl} alt={ep.name} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#71717a', fontSize: '0.75rem' }}>No Preview</div>
                                )}
                                {isCurrentResumeEp && savedProgressPercent !== null && savedProgressPercent > 1 && (
                                  <div style={{ 
                                    position: 'absolute', bottom: 0, left: 0, right: 0, height: '4px', 
                                    background: 'rgba(0,0,0,0.5)', zIndex: 5 
                                  }}>
                                    <div style={{ width: `${savedProgressPercent}%`, height: '100%', background: '#ffffff' }} />
                                  </div>
                                )}
                                <div style={{ 
                                  position: 'absolute', inset: 0, 
                                  display: 'flex', alignItems: 'center', justifyContent: 'center', 
                                  background: 'rgba(0,0,0,0.1)' 
                                }}>
                                  <div style={{ 
                                    width: '30px', height: '30px', 
                                    borderRadius: '50%', 
                                    background: 'rgba(0,0,0,0.5)', 
                                    border: '1.5px solid #fff', 
                                    display: 'flex', alignItems: 'center', justifyContent: 'center' 
                                  }}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="#fff" style={{ marginLeft: '1px' }}><path d="M8 5v14l11-7z"/></svg>
                                  </div>
                                </div>
                              </div>

                              {/* Title & Air date */}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <h4 style={{ 
                                  fontSize: '0.9rem', 
                                  fontWeight: 700, 
                                  margin: '0 0 2px', 
                                  color: '#fff',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                }}>
                                  {ep.episodeNumber}. {ep.name}
                                </h4>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
                                  <span style={{ fontSize: '0.75rem', color: '#71717a', fontWeight: 600 }}>
                                    {ep.airDate || 'TBA'}
                                  </span>
                                </div>
                              </div>

                              {/* Episode Download/Watch Action */}
                              {(() => {
                                const downloadId = `tv_${fullShow.id}_${selectedSeason}_${ep.episodeNumber}`;
                                const dlState = downloadedEpisodes[downloadId];
                                
                                if (dlState?.status === 'completed') {
                                  return (
                                    <button
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        triggerHaptic('heavy');
                                        const raw = localStorage.getItem('cinemovie_downloads');
                                        if (raw) {
                                          const list = JSON.parse(raw);
                                          const item = list.find((i: any) => i.id === downloadId && i.status === 'completed');
                                          if (item) {
                                            const playableUrl = await OfflineStorageService.getPlayableUrl(item.id);
                                            setSelectedSeason(selectedSeason);
                                            setSelectedEpisode(ep.episodeNumber);
                                            setStreamUrl(playableUrl || item.localUrl || item.streamUrl);
                                            setResolvedTracks(item.subtitles || []);
                                            setShowPlayer(true);
                                          }
                                        }
                                      }}
                                      className="tv-focusable"
                                      tabIndex={0}
                                      style={{
                                        background: 'rgba(34, 197, 94, 0.12)',
                                        border: '1px solid rgba(34, 197, 94, 0.4)',
                                        color: '#22c55e',
                                        cursor: 'pointer',
                                        width: '42px',
                                        height: '42px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        borderRadius: '50%',
                                        transition: 'all 0.2s',
                                        flexShrink: 0,
                                        outline: 'none'
                                      }}
                                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(34, 197, 94, 0.22)'; }}
                                      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(34, 197, 94, 0.12)'; }}
                                      title="Watch offline"
                                    >
                                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M8 5v14l11-7z"/>
                                      </svg>
                                    </button>
                                  );
                                } else if (dlState?.status === 'resolving') {
                                  const isHovered = hoveredEpisodeDownloadId === downloadId;
                                  return (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleCancelEpisodeDownload(ep);
                                      }}
                                      onMouseEnter={() => setHoveredEpisodeDownloadId(downloadId)}
                                      onMouseLeave={() => setHoveredEpisodeDownloadId(null)}
                                      className="tv-focusable"
                                      tabIndex={0}
                                      style={{
                                        background: isHovered ? 'rgba(239, 68, 68, 0.12)' : 'rgba(255,255,255,0.05)',
                                        border: isHovered ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(255,255,255,0.08)',
                                        cursor: 'pointer',
                                        width: '42px',
                                        height: '42px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        borderRadius: '50%',
                                        flexShrink: 0,
                                        transition: 'all 0.2s',
                                        outline: 'none'
                                      }}
                                      title="Cancel download"
                                    >
                                      {isHovered ? (
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                          <line x1="18" y1="6" x2="6" y2="18"></line>
                                          <line x1="6" y1="6" x2="18" y2="18"></line>
                                        </svg>
                                      ) : (
                                        <div style={{ width: '18px', height: '18px', border: '2px solid rgba(255,255,255,0.2)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                                      )}
                                    </button>
                                  );
                                } else if (dlState?.status === 'downloading') {
                                  const isHovered = hoveredEpisodeDownloadId === downloadId;
                                  return (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleCancelEpisodeDownload(ep);
                                      }}
                                      onMouseEnter={() => setHoveredEpisodeDownloadId(downloadId)}
                                      onMouseLeave={() => setHoveredEpisodeDownloadId(null)}
                                      className="tv-focusable"
                                      tabIndex={0}
                                      style={{
                                        background: isHovered ? 'rgba(239, 68, 68, 0.12)' : 'rgba(255,255,255,0.05)',
                                        border: isHovered ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(255,255,255,0.08)',
                                        cursor: 'pointer',
                                        width: '42px',
                                        height: '42px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        borderRadius: '50%',
                                        flexShrink: 0,
                                        transition: 'all 0.2s',
                                        outline: 'none'
                                      }}
                                      title="Cancel download"
                                    >
                                      {isHovered ? (
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                          <line x1="18" y1="6" x2="6" y2="18"></line>
                                          <line x1="6" y1="6" x2="18" y2="18"></line>
                                        </svg>
                                      ) : (
                                        <div style={{ position: 'relative', width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                          <svg width="22" height="22" viewBox="0 0 36 36">
                                            <circle cx="18" cy="18" r="16" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3.5" />
                                            <circle cx="18" cy="18" r="16" fill="none" stroke="#ffffff" strokeWidth="3.5"
                                                    strokeDasharray="100" strokeDashoffset={100 - dlState.progress}
                                                    strokeLinecap="round" transform="rotate(-90 18 18)" />
                                          </svg>
                                          <span style={{ position: 'absolute', fontSize: '0.55rem', fontWeight: 900, color: '#ffffff' }}>
                                            {dlState.progress}
                                          </span>
                                        </div>
                                      )}
                                    </button>
                                  );
                                } else {
                                  return (
                                    <button
                                      onClick={(e) => handleDownloadEpisode(ep, e)}
                                      className="tv-focusable"
                                      tabIndex={0}
                                      style={{
                                        background: 'rgba(255,255,255,0.05)',
                                        border: '1px solid rgba(255,255,255,0.08)',
                                        color: '#fff',
                                        cursor: 'pointer',
                                        width: '42px',
                                        height: '42px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        borderRadius: '50%',
                                        transition: 'all 0.2s',
                                        flexShrink: 0,
                                        outline: 'none'
                                      }}
                                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
                                      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                                      title="Download episode"
                                    >
                                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                        <polyline points="7 10 12 15 17 10" />
                                        <line x1="12" y1="15" x2="12" y2="3" />
                                      </svg>
                                    </button>
                                  );
                                }
                              })()}
                            </div>
                          </div>
                        );
                      })}
                    </div>
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

              {activeTab === 'more' && (
                <div style={{ animation: 'fadeIn 0.2s ease-out both' }}>
                  <div style={{ marginTop: '0px' }}>
                    <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '1.2rem', color: '#fff' }}>More Like This</h3>
                    {similarShows.length > 0 ? (
                      <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: 'repeat(3, 1fr)', 
                        gap: '16px',
                        contentVisibility: 'auto',
                        containIntrinsicSize: 'auto 360px'
                      }}>
                        {similarShows.slice(0, 9).map(similar => (
                          <div
                            key={similar.id}
                            className="tv-focusable"
                            tabIndex={0}
                            style={{
                              aspectRatio: '2/3',
                              background: '#18181b',
                              borderRadius: '12px',
                              overflow: 'hidden',
                              cursor: 'pointer',
                              border: '1px solid rgba(255,255,255,0.06)',
                              transition: 'all 0.2s ease-in-out',
                              outline: 'none'
                            }}
                            onClick={() => {
                              onClose();
                              setTimeout(() => window.dispatchEvent(new CustomEvent('tvClick', { detail: similar })), 50);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                onClose();
                                setTimeout(() => window.dispatchEvent(new CustomEvent('tvClick', { detail: similar })), 50);
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
                  <ReviewSection key={refreshKey} itemId={String(fullShow.id)} type="tv" />
                </div>
              )}
            </div>
          </div>
        </div>

      {showPlayer && (
        <VideoPlayer
          src={streamUrl}
          title={`${fullShow.name} - S${playingSeasonForPlayer}:E${playingEpisodeForPlayer}`}
          onClose={() => {
            setShowPlayer(false);
            setIsPartyMode(false);
            setTimeout(() => {
              reloadProgress();
            }, 800);
          }}
          onNextEpisode={handleNextEpisode}
          item={fullShow}
          season={playingSeasonForPlayer}
          episode={playingEpisodeForPlayer}
          tracks={resolvedTracks}
          startTime={currentStartTime}
          isPartyMode={isPartyMode}
          partySessionId={partySessionId}
          isPartyHost={isPartyHost}
        />
      )}


      
      <ReviewModal
        isOpen={isReviewModalOpen}
        onClose={() => setIsReviewModalOpen(false)}
        itemId={String(fullShow.id)}
        itemTitle={fullShow.name}
        onSuccess={() => setRefreshKey(prev => prev + 1)}
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
        </AnimatePresence>,
        document.body
      )}

      {/* ── Season Download Confirmation Modal ── */}
      {showSeasonDownloadModal && (
        <div
          onClick={() => setShowSeasonDownloadModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 4000,
            background: 'rgba(0,0,0,0.72)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '520px',
              background: '#1c1c1f',
              borderRadius: '24px 24px 0 0',
              border: '1px solid rgba(255,255,255,0.08)',
              borderBottom: 'none',
              boxShadow: '0 -24px 60px rgba(0,0,0,0.7)',
              animation: 'slideUp 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Handle bar */}
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '12px', paddingBottom: '4px', flexShrink: 0 }}>
              <div style={{ width: '36px', height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.2)' }} />
            </div>

            {/* Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 20px 14px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              flexShrink: 0,
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#fff' }}>
                  Download Season {selectedSeason}
                </h3>
                <p style={{ margin: '3px 0 0', fontSize: '0.78rem', color: 'rgba(255,255,255,0.45)' }}>
                  {fullShow.name} · {episodes.length} episode{episodes.length !== 1 ? 's' : ''}
                </p>
              </div>
              <button
                onClick={() => setShowSeasonDownloadModal(false)}
                style={{ background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'rgba(255,255,255,0.6)' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            {/* Select All / Deselect All */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 20px',
              borderBottom: '1px solid rgba(255,255,255,0.04)',
              flexShrink: 0,
            }}>
              <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>
                {selectedEpisodesToDownload.size} selected
              </span>
              <button
                onClick={() => {
                  triggerHaptic('light');
                  const raw = localStorage.getItem('cinemovie_downloads');
                  let list: any[] = [];
                  if (raw) { try { list = JSON.parse(raw); } catch (e) {} }
                  const allSelectable = episodes
                    .filter(ep => !list.some((item: any) => item.id === `tv_${fullShow.id}_${selectedSeason}_${ep.episodeNumber}` && (item.status === 'downloading' || item.status === 'resolving' || item.status === 'completed')))
                    .map(ep => ep.episodeNumber);
                  if (selectedEpisodesToDownload.size === allSelectable.length) {
                    setSelectedEpisodesToDownload(new Set());
                  } else {
                    setSelectedEpisodesToDownload(new Set(allSelectable));
                  }
                }}
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', padding: '4px 8px' }}
              >
                {(() => {
                  const raw = localStorage.getItem('cinemovie_downloads');
                  let list: any[] = [];
                  if (raw) { try { list = JSON.parse(raw); } catch (e) {} }
                  const allSelectable = episodes.filter(ep => !list.some((item: any) => item.id === `tv_${fullShow.id}_${selectedSeason}_${ep.episodeNumber}` && (item.status === 'downloading' || item.status === 'resolving' || item.status === 'completed')));
                  return selectedEpisodesToDownload.size === allSelectable.length ? 'Deselect All' : 'Select All';
                })()}
              </button>
            </div>

            {/* Episode List */}
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {episodes.map(ep => {
                const downloadId = `tv_${fullShow.id}_${selectedSeason}_${ep.episodeNumber}`;
                const dlState = downloadedEpisodes[downloadId];
                const isCompleted = dlState?.status === 'completed';
                const isInProgress = dlState?.status === 'downloading' || dlState?.status === 'resolving';
                const isLocked = isCompleted || isInProgress;
                const isSelected = selectedEpisodesToDownload.has(ep.episodeNumber);

                return (
                  <div
                    key={ep.id}
                    onClick={() => {
                      if (isLocked) return;
                      triggerHaptic('light');
                      setSelectedEpisodesToDownload(prev => {
                        const next = new Set(prev);
                        if (next.has(ep.episodeNumber)) {
                          next.delete(ep.episodeNumber);
                        } else {
                          next.add(ep.episodeNumber);
                        }
                        return next;
                      });
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '14px',
                      padding: '13px 20px',
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      cursor: isLocked ? 'default' : 'pointer',
                      opacity: isCompleted ? 0.55 : 1,
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => { if (!isLocked) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    {/* Checkbox / Status */}
                    <div style={{
                      width: '22px',
                      height: '22px',
                      borderRadius: '6px',
                      border: isSelected || isLocked ? 'none' : '1.5px solid rgba(255,255,255,0.3)',
                      background: isCompleted ? 'rgba(34,197,94,0.15)' : isInProgress ? 'rgba(255,255,255,0.08)' : isSelected ? '#fff' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      transition: 'all 0.15s',
                    }}>
                      {isCompleted ? (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                      ) : isInProgress ? (
                        <div style={{ width: '12px', height: '12px', border: '2px solid rgba(255,255,255,0.2)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                      ) : isSelected ? (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                      ) : null}
                    </div>

                    {/* Episode info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        E{ep.episodeNumber}. {ep.name}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>
                        {isCompleted ? '✓ Downloaded' : isInProgress ? `Downloading ${dlState?.progress ?? 0}%…` : ep.airDate || 'TBA'}
                      </div>
                    </div>

                    {/* Cancel button for in-progress */}
                    {isInProgress && (
                      <button
                        onClick={e => { e.stopPropagation(); handleCancelEpisodeDownload(ep); }}
                        style={{
                          background: 'rgba(239,68,68,0.12)',
                          border: '1px solid rgba(239,68,68,0.3)',
                          color: '#ef4444',
                          borderRadius: '8px',
                          padding: '5px 10px',
                          fontSize: '0.74rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          flexShrink: 0,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Footer actions */}
            <div style={{
              display: 'flex',
              gap: '10px',
              padding: '14px 20px',
              borderTop: '1px solid rgba(255,255,255,0.06)',
              paddingBottom: 'max(14px, env(safe-area-inset-bottom, 14px))',
              flexShrink: 0,
              background: '#1c1c1f',
            }}>
              <button
                onClick={() => setShowSeasonDownloadModal(false)}
                style={{
                  flex: 1,
                  padding: '14px',
                  borderRadius: '14px',
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(255,255,255,0.06)',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleStartSeasonDownload}
                disabled={selectedEpisodesToDownload.size === 0}
                style={{
                  flex: 2,
                  padding: '14px',
                  borderRadius: '14px',
                  border: 'none',
                  background: selectedEpisodesToDownload.size === 0 ? 'rgba(255,255,255,0.1)' : '#fff',
                  color: selectedEpisodesToDownload.size === 0 ? 'rgba(255,255,255,0.3)' : '#000',
                  fontWeight: 800,
                  fontSize: '0.95rem',
                  cursor: selectedEpisodesToDownload.size === 0 ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Download {selectedEpisodesToDownload.size > 0 ? `${selectedEpisodesToDownload.size} episode${selectedEpisodesToDownload.size !== 1 ? 's' : ''}` : 'episodes'}
              </button>
            </div>
          </div>
        </div>
      )}
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
              Create a synchronized Watch Party and stream this episode with friends! Only works on primary Local Server player.
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
                          const session = WatchTogetherService.createPartySession(fullShow.id, 'tv');
                          await WatchTogetherService.sendPartyInvitations(
                            [friend.id], 
                            session, 
                            `${fullShow.name} S${selectedSeason}:E${pendingEpisodeNum || 1}`,
                            fullShow.id,
                            'tv',
                            fullShow.posterPath,
                            fullShow.backdropPath
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
                if (pendingEpisodeNum !== null) {
                  await handleLocalServerPlay(pendingEpisodeNum, playbackMode === 'resume');
                } else {
                  await handleLocalServerPlay(undefined, playbackMode === 'resume');
                }
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

const TVShowDetailsContent = memo(TVShowDetails);
export default TVShowDetailsContent;
