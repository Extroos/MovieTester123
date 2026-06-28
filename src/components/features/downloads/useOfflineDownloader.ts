import { useState, useRef, useEffect } from 'react';
import type { Movie, TVShow } from '../../../types';
import { getLocalServerUrl } from '../../../services/LocalStreamService';
import { Capacitor } from '@capacitor/core';
import { fetchWithCapacitor } from '../../../utils/nativeFetch';
import { OfflineStorageService } from '../../../services/OfflineStorageService';

interface UseOfflineDownloaderProps {
  currentSrc: string;
  season?: number;
  episode?: number;
  item?: Movie | TVShow;
  iframeFallback: boolean;
}

const SERVER_DISPLAY_NAMES: Record<string, string> = {
  'vidlink-pro': 'Vidlink Pro',
  'vidsrc-pm': 'VidSrc PM (.m3u8)',
  'universal': 'Universal Player (.m3u8)'
};

export function useOfflineDownloader({
  currentSrc,
  season,
  episode,
  item,
  iframeFallback
}: UseOfflineDownloaderProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadStatus, setDownloadStatus] = useState('');
  const cancelDownloadRef = useRef(false);

  const handleDownloadOffline = async () => {
    import('../../../utils/haptics').then(m => m.triggerHaptic('medium'));
    setIsDownloading(true);
    setDownloadProgress(0);
    setDownloadStatus('Initializing download...');
    cancelDownloadRef.current = false;

    try {
      let playlistUrl = currentSrc;
      
      if (iframeFallback || !playlistUrl || !playlistUrl.startsWith('http')) {
        setDownloadStatus('Resolving stream from alternate servers...');
        const isTV = !!season || !!episode;
        const type = isTV ? 'tv' : 'movie';
        const tmdbId = item?.id;
        if (!tmdbId) throw new Error('Missing TMDb ID');
        
        const localServer = getLocalServerUrl();
        const titleToUse = (item as any)?.title || (item as any)?.name || '';
        
        let resolvedUrl = '';
        const preferredServer = (localStorage.getItem('cinemovie_download_server') || 'vidlink-pro') as 'vidlink-pro' | 'vidsrc-pm' | 'universal';
        const serversToTry: ('vidlink-pro' | 'vidsrc-pm' | 'universal')[] = [preferredServer];
        (['vidlink-pro', 'vidsrc-pm', 'universal'] as const).forEach(srv => {
          if (srv !== preferredServer) {
            serversToTry.push(srv);
          }
        });
        
        for (const serverId of serversToTry) {
          try {
            setDownloadStatus(`Trying server: ${SERVER_DISPLAY_NAMES[serverId] || serverId}...`);
            const backendServerId = serverId === 'universal' ? 'auto' : serverId;
            let watchUrl = `${localServer}/meta/tmdb/watch/${tmdbId}?type=${type}&server=${backendServerId}&title=${encodeURIComponent(titleToUse)}`;
            if (isTV) {
              watchUrl += `&s=${season}&e=${episode}`;
            }
            
            const res = await fetch(watchUrl);
            if (res.ok) {
              const data = await res.json();
              const bestSource = data.sources?.[0]?.url;
              if (bestSource) {
                resolvedUrl = bestSource;
                break;
              }
            }
          } catch (e) {
            console.warn(`[Download Resolver] Failed to resolve from ${serverId}:`, e);
          }
        }
        
        if (!resolvedUrl) {
          throw new Error('All servers returned Turnstile blocks. Offline download is temporarily unavailable.');
        }
        playlistUrl = resolvedUrl;
      }

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

      const isMp4 = targetUrl.toLowerCase().includes('.mp4') || 
                    (!targetUrl.toLowerCase().includes('.m3u8') && !targetUrl.toLowerCase().includes('hls'));

      const cleanTitle = ((item as any)?.title || (item as any)?.name || 'movie').replace(/[^a-z0-9]/gi, '_').toLowerCase();

      if (isMp4) {
        if (Capacitor.isNativePlatform()) {
          setDownloadStatus('Downloading direct video file natively...');
          const { Filesystem, Directory } = await import('@capacitor/filesystem');
          const isTV = !!season || !!episode;
          const downloadId = isTV ? `tv_${item?.id}_${season}_${episode}` : `movie_${item?.id}`;
          const videoFile = downloadId.replace(/[^a-z0-9_\-]/gi, '_') + '.mp4';
          
          try {
            await Filesystem.mkdir({
              path: 'cinemovie_offline',
              directory: Directory.Data,
              recursive: true,
            });
          } catch (e) {}

          const proxiedUrl = buildProxyUrl(targetUrl);
          await Filesystem.downloadFile({
            url: proxiedUrl,
            path: `cinemovie_offline/${videoFile}`,
            directory: Directory.Data,
          });

          const localPlayableUrl = await OfflineStorageService.finalizeWrite(downloadId);
          
          const rawList = localStorage.getItem('cinemovie_downloads');
          let downloadsList = rawList ? JSON.parse(rawList) : [];
          let existingItem = downloadsList.find((it: any) => it.id === downloadId);
          if (!existingItem) {
            existingItem = {
              id: downloadId,
              title: (item as any)?.title || (item as any)?.name || 'Video',
              posterPath: item?.posterPath,
              type: isTV ? 'tv' : 'movie',
              status: 'completed',
              progress: 100,
              localUrl: localPlayableUrl,
              addedAt: Date.now(),
              metaData: item, // Full TMDB details cached for offline presentation
              data: item
            };
            downloadsList.push(existingItem);
          } else {
            existingItem.status = 'completed';
            existingItem.progress = 100;
            existingItem.localUrl = localPlayableUrl;
            existingItem.metaData = item;
            existingItem.data = item;
          }
          localStorage.setItem('cinemovie_downloads', JSON.stringify(downloadsList));
          window.dispatchEvent(new CustomEvent('downloadsChanged'));
          
          setDownloadProgress(100);
          setDownloadStatus('Download completed!');
          setTimeout(() => {
            setIsDownloading(false);
          }, 3000);
          return;
        }

        setDownloadStatus('Downloading MP4 natively via browser proxy...');
        const downloadUrl = buildProxyUrl(targetUrl);
        const filename = `${cleanTitle}.mp4`;
        
        setDownloadStatus(`Saving file: ${filename}`);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        setDownloadProgress(100);
        setDownloadStatus('Download started in browser!');
        setTimeout(() => {
          setIsDownloading(false);
        }, 3000);
        return;
      }

      setDownloadStatus('Fetching stream index...');
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
          setDownloadStatus('Parsing master playlist...');
          const quality = (localStorage.getItem('cinemovie_download_quality') as any) || '1080p';
          const resolvedSubUrl = selectVariantPlaylist(playlistText, targetUrl, quality);
          
          if (Capacitor.isNativePlatform()) {
            const subRes = await fetchWithCapacitor(buildProxyUrl(resolvedSubUrl), 'text');
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

      const isTV = !!season || !!episode;
      const downloadId = isTV ? `tv_${item?.id}_${season}_${episode}` : `movie_${item?.id}`;

      // Start progressive write session
      await OfflineStorageService.startProgressiveWrite(downloadId);

      setDownloadStatus(`Ready. Total segments to download: ${totalSegments}`);
      
      const batchSize = 10; 

      for (let i = 0; i < totalSegments; i += batchSize) {
        if (cancelDownloadRef.current) {
          throw new Error("Download cancelled by user.");
        }

        const batchUrls = segmentUrls.slice(i, i + batchSize);
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
              console.warn(`[useOfflineDownloader] Native Segment ${i + idx + 1} download failed after 5 attempts. Skipping to keep download alive.`);
              return new ArrayBuffer(0);
            }
            return response.arrayBuffer();
          } else {
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
                await new Promise(r => setTimeout(r, 1000 * attempt));
              }
            }
            if (!response || !response.ok) {
              console.warn(`[useOfflineDownloader] Segment ${i + idx + 1} download failed after 5 attempts. Skipping to keep download alive.`);
              return new ArrayBuffer(0);
            }
            return response.arrayBuffer();
          }
        });

        const batchChunks = await Promise.all(promises);

        // Append each chunk progressively to save RAM and avoid WebView bridge transaction limits
        for (const chunk of batchChunks) {
          await OfflineStorageService.appendChunk(downloadId, chunk);
        }

        const currentDownloaded = Math.min(i + batchSize, totalSegments);
        const percent = Math.floor((currentDownloaded / totalSegments) * 100);
        setDownloadProgress(percent);
        setDownloadStatus(`Downloading: ${currentDownloaded} / ${totalSegments} segments (${percent}%)`);
      }

      // Finalize progressive write
      const localPlayableUrl = await OfflineStorageService.finalizeWrite(downloadId);

      if (Capacitor.isNativePlatform()) {
        const rawList = localStorage.getItem('cinemovie_downloads');
        let downloadsList = rawList ? JSON.parse(rawList) : [];
        let existingItem = downloadsList.find((it: any) => it.id === downloadId);
        if (!existingItem) {
          existingItem = {
            id: downloadId,
            title: (item as any)?.title || (item as any)?.name || 'Video',
            posterPath: item?.posterPath,
            type: isTV ? 'tv' : 'movie',
            status: 'completed',
            progress: 100,
            localUrl: localPlayableUrl,
            addedAt: Date.now(),
            metaData: item, // Full TMDB details cached for offline presentation
            data: item
          };
          downloadsList.push(existingItem);
        } else {
          existingItem.status = 'completed';
          existingItem.progress = 100;
          existingItem.localUrl = localPlayableUrl;
          existingItem.metaData = item;
          existingItem.data = item;
        }
        localStorage.setItem('cinemovie_downloads', JSON.stringify(downloadsList));
        window.dispatchEvent(new CustomEvent('downloadsChanged'));
      } else {
        // For web browser downloading trigger
        setDownloadStatus('Creating video file Blob...');
        // Web downloads fallback: get file from IDB or blob
        const playableUrl = await OfflineStorageService.getPlayableUrl(downloadId);
        if (playableUrl) {
          const filename = `${cleanTitle}.ts`;
          setDownloadStatus(`Saving file: ${filename}`);
          const a = document.createElement('a');
          a.href = playableUrl;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(playableUrl), 10000);
        }
      }
      
      setDownloadStatus('Download completed!');
      setTimeout(() => {
        setIsDownloading(false);
      }, 3000);
    } catch (err: any) {
      console.error('[DownloadOffline] Error:', err);
      setDownloadStatus(err.message || 'Download failed.');
      setTimeout(() => {
        if (!cancelDownloadRef.current) {
          setIsDownloading(false);
        }
      }, 5000);
    }
  };

  const handleCancelDownload = () => {
    cancelDownloadRef.current = true;
    setIsDownloading(false);
    setDownloadStatus('Download cancelled.');
  };

  return {
    isDownloading,
    downloadProgress,
    downloadStatus,
    handleDownloadOffline,
    handleCancelDownload
  };
}
