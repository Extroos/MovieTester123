import { useState, useEffect } from 'react';
import { GlobalDownloader, DownloadState } from '../../../services/offline/GlobalDownloader';
import type { Movie, TVShow } from '../../../types';

interface UseOfflineDownloaderProps {
  currentSrc: string;
  season?: number;
  episode?: number;
  item?: Movie | TVShow;
  iframeFallback: boolean;
}

export function useOfflineDownloader({
  currentSrc,
  season,
  episode,
  item,
  iframeFallback
}: UseOfflineDownloaderProps) {
  const isTV = !!season || !!episode;
  const targetDownloadId = item ? (isTV ? `tv_${item.id}_${season}_${episode}` : `movie_${item.id}`) : null;

  const [globalState, setGlobalState] = useState<DownloadState>(() => GlobalDownloader.getState());

  useEffect(() => {
    return GlobalDownloader.subscribe((state) => {
      setGlobalState(state);
    });
  }, []);

  const handleDownloadOffline = async () => {
    if (!item) return;
    GlobalDownloader.startDownload(item, currentSrc, season, episode, iframeFallback);
  };

  const handleCancelDownload = () => {
    GlobalDownloader.cancelDownload();
  };

  const isCurrentItemDownloading = globalState.isDownloading && globalState.downloadId === targetDownloadId;

  const isCurrentItemQueued = (() => {
    try {
      const raw = localStorage.getItem('cinemovie_downloads');
      if (raw && targetDownloadId) {
        const list = JSON.parse(raw);
        return list.some((it: any) => it.id === targetDownloadId && it.status === 'queued');
      }
    } catch (_) {}
    return false;
  })();

  return {
    isDownloading: isCurrentItemDownloading,
    isQueued: isCurrentItemQueued,
    downloadProgress: isCurrentItemDownloading ? globalState.downloadProgress : 0,
    downloadStatus: isCurrentItemDownloading ? globalState.downloadStatus : '',
    handleDownloadOffline,
    handleCancelDownload,
    debugContentLength: isCurrentItemDownloading ? globalState.debugContentLength : null,
    debugTotalBytes: isCurrentItemDownloading ? globalState.debugTotalBytes : 0,
    debugLoadedBytes: isCurrentItemDownloading ? globalState.debugLoadedBytes : 0
  };
}
