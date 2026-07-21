import { Capacitor } from '@capacitor/core';
import type { Movie, TVShow } from '../../types';
import { resolveMovieStream, resolveTVStream } from '../LocalStreamService';
import { fetchWithCapacitor } from '../../utils/nativeFetch';
import { OfflineStorageService } from '../OfflineStorageService';
import { NativeStreamingEngine } from '../native/NativeStreamingEngine';
const isNative = Capacitor.isNativePlatform() && Capacitor.getPlatform() !== 'web';

export interface DownloadState {
  isDownloading: boolean;
  downloadProgress: number;
  downloadStatus: string;
  downloadId: string | null;
  item: any | null;
  season?: number;
  episode?: number;
  debugContentLength?: string | null;
  debugTotalBytes?: number;
  debugLoadedBytes?: number;
  queueSize?: number;
}

type Listener = (state: DownloadState) => void;

class GlobalDownloaderService {
  private state: DownloadState = {
    isDownloading: false,
    downloadProgress: 0,
    downloadStatus: '',
    downloadId: null,
    item: null,
    debugContentLength: null,
    debugTotalBytes: 0,
    debugLoadedBytes: 0,
    queueSize: 0
  };

  private queue: {
    item: Movie | TVShow;
    currentSrc: string;
    season?: number;
    episode?: number;
    iframeFallback?: boolean;
  }[] = [];

  private listeners = new Set<Listener>();
  private cancelRequested = false;
  private progressListenerRemove: (() => void) | null = null;

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener({ ...this.state });
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const currentState = { ...this.state };
    this.listeners.forEach(listener => listener(currentState));

    // Broadcast custom event so non-react components can react
    window.dispatchEvent(new CustomEvent('globalDownloadStateChanged', { detail: currentState }));
  }

  public getState(): DownloadState {
    return { ...this.state };
  }

  public cancelDownload() {
    this.cancelRequested = true;
    this.queue = [];
    this.state.queueSize = 0;
    this.state.isDownloading = false;
    this.state.downloadStatus = 'Download cancelled.';
    this.state.downloadProgress = 0;

    try {
      const rawList = localStorage.getItem('cinemovie_downloads');
      if (rawList) {
        let downloadsList = JSON.parse(rawList);
        downloadsList = downloadsList.filter((it: any) => it.status !== 'queued');
        localStorage.setItem('cinemovie_downloads', JSON.stringify(downloadsList));
        window.dispatchEvent(new CustomEvent('downloadsChanged'));
      }
    } catch (e) {}

    if (this.progressListenerRemove) {
      try {
        this.progressListenerRemove();
        this.progressListenerRemove = null;
      } catch (_) {}
    }

    this.allowSleep();
    this.notify();
  }

  public getQueue() {
    return [...this.queue];
  }

  public removeFromQueue(downloadId: string) {
    const originalLength = this.queue.length;
    this.queue = this.queue.filter(q => {
      const qTV = !!q.season || !!q.episode;
      const qId = qTV ? `tv_${q.item.id}_${q.season}_${q.episode}` : `movie_${q.item.id}`;
      return qId !== downloadId;
    });

    if (this.queue.length !== originalLength) {
      this.state.queueSize = this.queue.length;
      this.notify();

      try {
        const rawList = localStorage.getItem('cinemovie_downloads');
        if (rawList) {
          let downloadsList = JSON.parse(rawList);
          downloadsList = downloadsList.filter((it: any) => it.id !== downloadId);
          localStorage.setItem('cinemovie_downloads', JSON.stringify(downloadsList));
          window.dispatchEvent(new CustomEvent('downloadsChanged'));
        }
      } catch (e) {}
    }
  }

  private async finalizeCurrentDownload(success: boolean) {
    this.updateProgress(success ? 100 : 0);
    this.updateStatus(success ? 'Download completed!' : 'Download failed.');

    this.allowSleep();

    // Fast completion delay of 1000ms instead of 3000ms
    setTimeout(async () => {
      this.state.isDownloading = false;
      this.state.downloadId = null;
      this.state.item = null;
      this.notify();

      if (this.queue.length > 0) {
        const next = this.queue.shift();
        this.state.queueSize = this.queue.length;

        console.log('[GlobalDownloader] Processing next queued download:', next);
        this.startDownload(next!.item, next!.currentSrc, next!.season, next!.episode, next!.iframeFallback);
      }
    }, 1000);
  }

  private async keepAwake() {
    if (isNative) {
      try {
        const { KeepAwake } = await import('@capacitor-community/keep-awake');
        await KeepAwake.keepAwake();
        console.log('[GlobalDownloader] KeepAwake active');
      } catch (e) {
        console.warn('[GlobalDownloader] KeepAwake failed:', e);
      }
    }
  }

  private async allowSleep() {
    if (isNative) {
      try {
        const { KeepAwake } = await import('@capacitor-community/keep-awake');
        await KeepAwake.allowSleep();
        console.log('[GlobalDownloader] KeepAwake released');
      } catch (e) {
        console.warn('[GlobalDownloader] KeepAwake release failed:', e);
      }
    }
  }

  public async startDownload(
    item: Movie | TVShow,
    currentSrc: string,
    season?: number,
    episode?: number,
    iframeFallback = false,
    downloadIdOverride?: string,
    source: 'normal' | 'vidvault' = 'normal'
  ) {
    const isTV = !!season || !!episode;
    const downloadId = downloadIdOverride || (isTV ? `tv_${item.id}_${season}_${episode}` : `movie_${item.id}`);

    // Avoid duplicates in active download or queue
    const isAlreadyActive = this.state.downloadId === downloadId;
    const isAlreadyQueued = this.queue.some(q => {
      const qTV = !!q.season || !!q.episode;
      const qId = qTV ? `tv_${q.item.id}_${q.season}_${q.episode}` : `movie_${q.item.id}`;
      return qId === downloadId;
    });

    if (isAlreadyActive || isAlreadyQueued) {
      console.warn('[GlobalDownloader] Item already downloading or queued:', downloadId);
      return;
    }

    if (this.state.isDownloading) {
      console.log('[GlobalDownloader] Queueing download request:', downloadId);
      this.queue.push({ item, currentSrc, season, episode, iframeFallback });

      try {
        const rawList = localStorage.getItem('cinemovie_downloads');
        let downloadsList = rawList ? JSON.parse(rawList) : [];
        const existingItem = downloadsList.find((it: any) => it.id === downloadId);
        if (!existingItem) {
          downloadsList.push({
            id: downloadId,
            title: (item as any).title || (item as any).name || 'Video',
            posterPath: item.posterPath,
            type: isTV ? 'tv' : 'movie',
            status: 'queued',
            progress: 0,
            addedAt: Date.now(),
            metaData: item,
            data: item,
            subtitles: [],
            source
          });
          localStorage.setItem('cinemovie_downloads', JSON.stringify(downloadsList));
          window.dispatchEvent(new CustomEvent('downloadsChanged'));
        }
      } catch (e) {
        console.error('[GlobalDownloader] Failed to save queued item:', e);
      }

      this.state.queueSize = this.queue.length;
      this.notify();
      return;
    }

    this.state = {
      isDownloading: true,
      downloadProgress: 0,
      downloadStatus: 'Initializing download...',
      downloadId,
      item,
      season,
      episode,
      debugContentLength: null,
      debugTotalBytes: 0,
      debugLoadedBytes: 0,
      queueSize: this.queue.length
    };
    this.cancelRequested = false;
    this.notify();

    await this.keepAwake();

    if (isNative) {
      NativeStreamingEngine.addJsLog({
        message: `[Download] START: Initiating download for item ID: ${item.id} (Title: ${(item as any).title || (item as any).name}), Src: ${currentSrc || 'none'}`
      }).catch(() => {});
    }

    try {
      let playlistUrl = currentSrc;
      const SERVER_DISPLAY_NAMES: Record<string, string> = {
        'vidsrc-pm': 'VidSrc PM (.m3u8)',
        'vidsrc-top-new': 'VidSrc Top (.m3u8)',
        'vixsrc': 'VixSrc (.m3u8)',
        'vidsrc-wtf-2': 'VidSrc Multi-Lang (.m3u8)',
        'universal': 'Universal Player (.m3u8)'
      };

      if (iframeFallback || !playlistUrl || !playlistUrl.startsWith('http')) {
        this.updateStatus('Resolving stream from alternate servers...');

        const tmdbId = item.id;
        const titleToUse = (item as any).title || (item as any).name || '';
        let resolvedUrl = '';
        let resolvedResult: any = null;
        const preferredServer = (localStorage.getItem('cinemovie_download_server') || 'vidsrc-pm');
        const allAvailableServers = ['vidsrc-pm', 'vidsrc-top-new', 'vixsrc', 'vidsrc-wtf-2', 'universal'];
        const serversToTry: string[] = [preferredServer];
        allAvailableServers.forEach(srv => {
          if (srv !== preferredServer) {
            serversToTry.push(srv);
          }
        });

        for (const serverId of serversToTry) {
          try {
            this.updateStatus(`Trying server: ${SERVER_DISPLAY_NAMES[serverId] || serverId}...`);
            let result = null;
            if (isTV) {
              result = await resolveTVStream(tmdbId, titleToUse, season!, episode!, serverId);
            } else {
              const imdbId = (item as any).imdb_id || (item as any).imdbId;
              result = await resolveMovieStream(tmdbId, titleToUse, imdbId, serverId);
            }
            if (result && result.streamUrl) {
              resolvedUrl = result.streamUrl;
              resolvedResult = result;
              break;
            }
          } catch (e) {
            console.warn(`[Download Resolver] Failed to resolve from ${serverId}:`, e);
          }
        }

        if (!resolvedUrl) {
          throw new Error('All servers returned Turnstile blocks. Offline download is temporarily unavailable.');
        }
        playlistUrl = resolvedUrl;
        (window as any)._lastDownloadResult = resolvedResult;
      } else if (isNative) {
        try {
          const tmdbId = item.id;
          if (tmdbId) {
            const titleToUse = (item as any).title || (item as any).name || '';
            const preferredServer = (localStorage.getItem('cinemovie_download_server') || 'vidsrc-pm') as any;
            let result;
            if (isTV) {
              result = await resolveTVStream(tmdbId, titleToUse, season!, episode!, preferredServer);
            } else {
              const imdbId = (item as any).imdb_id || (item as any).imdbId;
              result = await resolveMovieStream(tmdbId, titleToUse, imdbId, preferredServer);
            }
            (window as any)._lastDownloadResult = result;
          }
        } catch (e) {
          console.warn('[Download Resolver] Background subtitle resolve failed:', e);
        }
      }

      if (this.cancelRequested) return;

      let targetUrl = playlistUrl;
      let referer = 'https://vidsrc.me/';
      let origin = 'https://vidsrc.me';

      // VidVault CDN links are pre-signed and use vidvault.ru as origin.
      // Using the wrong referer causes 403. Also bypass the proxy entirely
      // since these are direct CDN links that don't need proxying.
      const isVidVaultSource = source === 'vidvault';
      if (isVidVaultSource) {
        referer = 'https://vidvault.ru/';
        origin = 'https://vidvault.ru';
      }

      if (playlistUrl.includes('local-proxy?url=')) {
        const parsedUrl = new URL(playlistUrl);
        targetUrl = parsedUrl.searchParams.get('url') || targetUrl;
        referer = parsedUrl.searchParams.get('referer') || referer;
        origin = parsedUrl.searchParams.get('origin') || origin;
      }

      if (isVidVaultSource && targetUrl.includes('.workers.dev/d/')) {
        try {
          const parsed = new URL(targetUrl);
          targetUrl = 'https://vlaq11.site' + parsed.pathname + parsed.search;
        } catch (_) {}
      }

      const isLocalHost = window.location.hostname.includes('localhost') || window.location.hostname.includes('127.0.0.1');
      const proxyBase = playlistUrl.includes('local-proxy')
        ? playlistUrl.split('local-proxy')[0] + 'local-proxy'
        : (isLocalHost ? 'http://localhost:8000/local-proxy' : 'https://cinemovie-proxy.abderrahmanchakkouri.workers.dev/proxy');

      let nativeProxyPort = 8000;
      if (isNative) {
        try {
          const portRes = await NativeStreamingEngine.getProxyPort();
          if (portRes && portRes.port) nativeProxyPort = portRes.port;
        } catch (_) {}
      }

      const buildProxyUrl = (urlStr: string) => {
        if (urlStr.includes('local-proxy?url=') || urlStr.includes('/proxy?url=')) {
          return urlStr;
        }
        if (isNative) {
          return `http://localhost:${nativeProxyPort}/local-proxy?url=${encodeURIComponent(urlStr)}&referer=${encodeURIComponent(referer)}&origin=${encodeURIComponent(origin)}`;
        }
        return `${proxyBase}?url=${encodeURIComponent(urlStr)}&referer=${encodeURIComponent(referer)}&origin=${encodeURIComponent(origin)}`;
      };

      const isMp4 = targetUrl.toLowerCase().includes('.mp4') ||
                    (!targetUrl.toLowerCase().includes('.m3u8') && !targetUrl.toLowerCase().includes('hls'));

      const cleanTitle = ((item as any).title || (item as any).name || 'movie').replace(/[^a-z0-9]/gi, '_').toLowerCase();

      if (isMp4) {
        if (isNative) {
          this.updateStatus('Downloading direct video file natively...');
          const { Filesystem, Directory } = await import('@capacitor/filesystem');
          const videoFile = `${downloadId}.mp4`;

          const proxiedUrl = buildProxyUrl(targetUrl);
          const progressListener = await Filesystem.addListener('progress', (progress: any) => {
            if (this.cancelRequested) return;

            // Forward downloaded byte metrics to the diagnostics overlay natively
            this.state.debugLoadedBytes = progress.bytes || 0;
            this.state.debugTotalBytes = progress.contentLength || 0;
            this.state.debugContentLength = progress.contentLength ? String(progress.contentLength) : 'Exposed (native)';
            this.notify();

            if (progress.contentLength) {
              const pct = Math.floor((progress.bytes / progress.contentLength) * 100);
              this.updateProgress(pct);
            } else {
              const estimatedTotal = 800 * 1024 * 1024;
              this.updateProgress(Math.min(99, Math.floor((progress.bytes / estimatedTotal) * 100)));
            }
          });

          this.progressListenerRemove = () => progressListener.remove();

          try {
            try {
              await Filesystem.mkdir({
                path: 'cinemovie_offline',
                directory: Directory.Data,
                recursive: true
              });
            } catch (_) {}

            if (isVidVaultSource) {
              // For hakunaymatata.com (signed MP4 CDN), route through proxy for Chrome TLS fingerprinting.
              // workers.dev (MKV) can download directly — no Cloudflare bot protection.
              const needsProxy = targetUrl.includes('hakunaymatata.com');
              if (needsProxy) {
                await Filesystem.downloadFile({
                  url: buildProxyUrl(targetUrl),
                  path: `cinemovie_offline/${videoFile}`,
                  directory: Directory.Data,
                  progress: true,
                  headers: {
                    'Referer': 'https://vidvault.ru/',
                    'Origin': 'https://vidvault.ru'
                  }
                });
              } else {
                // workers.dev MKV: route through proxy for Chrome fingerprinting
                await Filesystem.downloadFile({
                  url: buildProxyUrl(targetUrl),
                  path: `cinemovie_offline/${videoFile}`,
                  directory: Directory.Data,
                  progress: true,
                  headers: {
                    'Referer': 'https://vidvault.ru/',
                    'Origin': 'https://vidvault.ru'
                  }
                });
              }
            } else {
              await Filesystem.downloadFile({
                url: targetUrl,
                path: `cinemovie_offline/${videoFile}`,
                directory: Directory.Data,
                progress: true,
                headers: {
                  'Referer': referer,
                  'Origin': origin
                }
              });
            }
          } finally {
            progressListener.remove();
            this.progressListenerRemove = null;
          }

          if (this.cancelRequested) return;

          const localPlayableUrl = await OfflineStorageService.finalizeWrite(downloadId, true);
          const offlineSubtitles = await this.downloadOfflineSubtitles(downloadId, item, season, episode, buildProxyUrl);

          const rawList = localStorage.getItem('cinemovie_downloads');
          let downloadsList = rawList ? JSON.parse(rawList) : [];
          let existingItem = downloadsList.find((it: any) => it.id === downloadId);
          if (!existingItem) {
            existingItem = {
              id: downloadId,
              title: (item as any).title || (item as any).name || 'Video',
              posterPath: item.posterPath,
              type: isTV ? 'tv' : 'movie',
              status: 'completed',
              progress: 100,
              localUrl: localPlayableUrl,
              addedAt: Date.now(),
              metaData: item,
              data: item,
              subtitles: offlineSubtitles,
              source
            };
            downloadsList.push(existingItem);
          } else {
            existingItem.status = 'completed';
            existingItem.progress = 100;
            existingItem.localUrl = localPlayableUrl;
            existingItem.metaData = item;
            existingItem.data = item;
            existingItem.subtitles = offlineSubtitles;
          }
          localStorage.setItem('cinemovie_downloads', JSON.stringify(downloadsList));
          window.dispatchEvent(new CustomEvent('downloadsChanged'));

          await this.finalizeCurrentDownload(true);
          return;
        }

        // Web MP4 fallback
        this.updateStatus('Downloading video file...');
        const downloadUrl = buildProxyUrl(targetUrl);
        const res = await fetch(downloadUrl);
        if (!res.ok) {
          if (res.status === 403 && isVidVaultSource) {
            throw new Error('VidVault link expired (403). Please go back and click "Resolve Download Links" again to get a fresh URL.');
          }
          throw new Error(`HTTP ${res.status} resolving MP4`);
        }

        const contentLength = res.headers.get('content-length') || res.headers.get('x-content-length');
        const total = contentLength ? parseInt(contentLength, 10) : 0;
        this.state.debugContentLength = contentLength;
        this.state.debugTotalBytes = total;
        this.state.debugLoadedBytes = 0;
        this.notify();

        const reader = res.body?.getReader();
        if (!reader) throw new Error('ReadableStream unavailable');

        let loaded = 0;
        const chunks: Uint8Array[] = [];
        while (true) {
          if (this.cancelRequested) return;
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            loaded += value.length;
            this.state.debugLoadedBytes = loaded;
            this.notify();
            if (total) {
              this.updateProgress(Math.floor((loaded / total) * 100));
            } else {
              // Asymptotic progress calculation based on media runtime
              let runtime = 120; // Default: 2 hours (120 minutes)
              if (item) {
                if ((item as any).runtime) {
                  runtime = (item as any).runtime;
                } else if ((item as any).episode_run_time && Array.isArray((item as any).episode_run_time) && (item as any).episode_run_time[0]) {
                  runtime = (item as any).episode_run_time[0];
                }
              }
              // Average bitrate of ~2.2 Mbps (275 KB/s) for high-quality MP4/HLS streams
              const estimatedTotalBytes = runtime * 60 * 275 * 1024;
              // Divide by 2.3 so that progress is exactly 90% when loaded reaches estimatedTotalBytes
              const scale = Math.max(150 * 1024 * 1024, estimatedTotalBytes / 2.3);
              const guessedProgress = Math.floor((1 - Math.exp(-loaded / scale)) * 99);
              this.updateProgress(guessedProgress);
            }
          }
        }

        const blob = new Blob(chunks as any, { type: 'video/mp4' });
        const localPlayableUrl = URL.createObjectURL(blob);
        const arrayBuffer = await blob.arrayBuffer();
        await OfflineStorageService.appendChunk(downloadId, arrayBuffer);
        await OfflineStorageService.finalizeWrite(downloadId, true);

        const rawList = localStorage.getItem('cinemovie_downloads');
        let downloadsList = rawList ? JSON.parse(rawList) : [];
        let existingItem = downloadsList.find((it: any) => it.id === downloadId);
        if (!existingItem) {
          existingItem = {
            id: downloadId,
            title: (item as any).title || (item as any).name || 'Video',
            posterPath: item.posterPath,
            type: isTV ? 'tv' : 'movie',
            status: 'completed',
            progress: 100,
            localUrl: localPlayableUrl,
            addedAt: Date.now(),
            metaData: item,
            data: item
          };
          downloadsList.push(existingItem);
        } else {
          existingItem.status = 'completed';
          existingItem.progress = 100;
          existingItem.localUrl = localPlayableUrl;
        }
        localStorage.setItem('cinemovie_downloads', JSON.stringify(downloadsList));
        window.dispatchEvent(new CustomEvent('downloadsChanged'));

        const filename = `${cleanTitle}.mp4`;
        this.updateStatus(`Saving file: ${filename}`);
        const a = document.createElement('a');
        a.href = localPlayableUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        await this.finalizeCurrentDownload(true);
        return;
      }

      // HLS download loop (.m3u8)
      this.updateStatus('Resolving playlist manifest...');
      const proxiedPlaylistUrl = buildProxyUrl(targetUrl);
      const manifestRes = await fetch(proxiedPlaylistUrl, {
        headers: isNative ? { 'Referer': referer, 'Origin': origin } : undefined
      });
      if (!manifestRes.ok) throw new Error(`HTTP ${manifestRes.status} fetching playlist`);
      let manifestText = await manifestRes.text();
      let manifestBaseUrl = targetUrl;

      const resolveAbsoluteUrl = (base: string, relative: string): string => {
        try {
          return new URL(relative, base).href;
        } catch (_) {
          return relative;
        }
      };

      // Detect master playlist (contains quality variants, not raw segments)
      if (manifestText.includes('#EXT-X-STREAM-INF')) {
        this.updateStatus('Resolving best quality stream variant...');
        // Parse all variant stream URIs
        const variantLines = manifestText.split('\n');
        const allVariants: { bandwidth: number; url: string; resolution: string }[] = [];
        for (let i = 0; i < variantLines.length; i++) {
          const line = variantLines[i].trim();
          if (line.startsWith('#EXT-X-STREAM-INF')) {
            const bwMatch = line.match(/BANDWIDTH=(\d+)/);
            const resMatch = line.match(/RESOLUTION=(\S+)/);
            const bw = bwMatch ? parseInt(bwMatch[1], 10) : 0;
            const res = resMatch ? resMatch[1] : 'unknown';
            const nextLine = variantLines[i + 1]?.trim();
            if (nextLine && !nextLine.startsWith('#')) {
              allVariants.push({ bandwidth: bw, url: resolveAbsoluteUrl(targetUrl, nextLine), resolution: res });
            }
          }
        }
        if (allVariants.length === 0) throw new Error('Could not find a valid quality variant in master playlist.');

        // Pick the highest bandwidth variant for best quality.
        // All HLS variants have the same segment count (time-based splitting), so quality is free.
        allVariants.sort((a, b) => b.bandwidth - a.bandwidth);
        const selectedVariant = allVariants[0];

        console.log(`[GlobalDownloader] Variants (${allVariants.length}): ${allVariants.map(v => `${v.resolution}@${Math.round(v.bandwidth/1000)}kbps`).join(', ')} | Selected BEST: ${selectedVariant.resolution}`);
        this.updateStatus(`Loading ${selectedVariant.resolution} best quality stream...`);

        const mediaRes = await fetch(buildProxyUrl(selectedVariant.url), {
          headers: isNative ? { 'Referer': referer, 'Origin': origin } : undefined
        });
        if (!mediaRes.ok) throw new Error(`HTTP ${mediaRes.status} fetching media playlist`);
        manifestText = await mediaRes.text();
        manifestBaseUrl = selectedVariant.url;
      }

      // Parse segments from the (now guaranteed) media playlist
      const lines = manifestText.split('\n');
      const segmentUrls: string[] = [];
      const segmentDurations: number[] = [];
      let currentSegDuration = 6.0; // Default segment duration fallback

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('#EXTINF:')) {
          const match = line.match(/#EXTINF:([0-9.]+)/);
          if (match) {
            currentSegDuration = parseFloat(match[1]);
          }
        } else if (line && !line.startsWith('#')) {
          segmentUrls.push(resolveAbsoluteUrl(manifestBaseUrl, line));
          segmentDurations.push(currentSegDuration);
        }
      }

      const totalSegments = segmentUrls.length;
      if (totalSegments === 0) throw new Error('No video segments detected in manifest.');

      // Calculate exact total runtime duration from segments
      const exactDurationSeconds = segmentDurations.reduce((sum, d) => sum + d, 0);

      // Save exact duration to the download metadata so OfflineStorageService finalizes with the correct total time
      try {
        const rawList = localStorage.getItem('cinemovie_downloads');
        if (rawList) {
          const list = JSON.parse(rawList);
          const existingItem = list.find((it: any) => it.id === downloadId);
          if (existingItem) {
            existingItem.durationSeconds = exactDurationSeconds;
            localStorage.setItem('cinemovie_downloads', JSON.stringify(list));
          }
        }
      } catch (_) {}

      await OfflineStorageService.startProgressiveWrite(downloadId, false, segmentDurations);
      this.updateStatus(`Starting segment stream download (0/${totalSegments})...`);

      const uint8ToBase64 = (bytes: Uint8Array): Promise<string> => {
        return new Promise((resolve, reject) => {
          const blob = new Blob([bytes as any], { type: 'application/octet-stream' });
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result as string;
            resolve(dataUrl.split(',')[1]);
          };
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
      };

      const downloadedSegments: { [key: number]: Uint8Array } = {};
      let activeIndex = 0;
      let currentDownloaded = 0;
      let totalBytesAccumulated = 0;

      // HLS segments are served individually. We expose estimated total size and track actual loaded bytes.
      const estimatedSegmentSize = 1.3 * 1024 * 1024; // Average segment size ~1.3MB
      this.state.debugTotalBytes = totalSegments * estimatedSegmentSize;
      this.state.debugContentLength = `${(this.state.debugTotalBytes / (1024 * 1024)).toFixed(0)} MB (Exposed)`;
      this.state.debugLoadedBytes = 0;
      this.notify();


      const downloadWorker = async () => {
        while (true) {
          if (this.cancelRequested) return;
          const idx = activeIndex++;
          if (idx >= totalSegments) break;

          const segUrl = segmentUrls[idx];
          const proxiedSegUrl = buildProxyUrl(segUrl);

          let retries = 12; // retry limit
          let success = false;
          let retryDelay = 500; // Start with a short delay

          while (retries > 0 && !success) {
            if (this.cancelRequested) return;
            try {
              const res = await fetch(isNative ? segUrl : proxiedSegUrl, {
                headers: {
                  'Referer': referer,
                  'Origin': origin
                }
              });
              if (!res.ok) {
                if (res.status === 429) {
                  retryDelay = Math.max(retryDelay, 2000) + Math.floor(Math.random() * 1000);
                  throw new Error(`HTTP 429 (Rate Limited)`);
                }
                throw new Error(`HTTP ${res.status}`);
              }
              const segBuf = await res.arrayBuffer();
              downloadedSegments[idx] = new Uint8Array(segBuf);
              success = true;
            } catch (e: any) {
              retries--;
              if (retries === 0) {
                console.error(`[GlobalDownloader] Failed segment ${idx} permanently:`, e);
                throw e;
              }
              console.warn(`[GlobalDownloader] Failed segment ${idx}, retrying (${retries} left) in ${retryDelay}ms...`, e.message);
              await new Promise(r => setTimeout(r, retryDelay));
              retryDelay = Math.min(retryDelay * 1.5, 5000); // Backoff capped at 5s
            }
          }

        }
      };

      let nextWriteIdx = 0;
      const writeLoop = async () => {
        const { Filesystem, Directory } = await import('@capacitor/filesystem');
        while (nextWriteIdx < totalSegments) {
          if (this.cancelRequested) return;
          if (downloadedSegments[nextWriteIdx]) {
            const idx = nextWriteIdx;
            const bytes = downloadedSegments[idx];
            delete downloadedSegments[idx];

            try {
              await OfflineStorageService.appendChunk(downloadId, bytes);

              totalBytesAccumulated += bytes.length;
              this.state.debugLoadedBytes = totalBytesAccumulated;
              
              currentDownloaded++;
              const percent = Math.floor((currentDownloaded / totalSegments) * 100);
              
              // Throttle UI and state notifications to avoid thread-blocking context switches on every segment
              const isLastSegment = currentDownloaded === totalSegments;
              if (isLastSegment || currentDownloaded % 5 === 0) {
                this.updateProgress(percent);
                this.updateStatus(`Downloading: ${currentDownloaded} / ${totalSegments} segments (${percent}%)`);
              }
              nextWriteIdx++;
            } catch (e) {
              console.error(`Failed to write segment ${idx}:`, e);
              throw e;
            }
          } else {
            await new Promise(r => setTimeout(r, 5));
          }
        }
      };

      const downloaders = Array(isNative ? 10 : 4).fill(null).map(() => downloadWorker());
      await Promise.all([...downloaders, writeLoop()]);

      if (this.cancelRequested) return;

      // Update final diagnostics metrics to represent the exact physical byte size of the downloaded package
      this.state.debugTotalBytes = totalBytesAccumulated;
      this.state.debugContentLength = `${(totalBytesAccumulated / (1024 * 1024)).toFixed(1)} MB (Exposed)`;
      this.state.debugLoadedBytes = totalBytesAccumulated;
      this.notify();

      const localPlayableUrl = await OfflineStorageService.finalizeWrite(downloadId);
      const offlineSubtitles = await this.downloadOfflineSubtitles(downloadId, item, season, episode, buildProxyUrl);

      const rawList = localStorage.getItem('cinemovie_downloads');
      let downloadsList = rawList ? JSON.parse(rawList) : [];
      let existingItem = downloadsList.find((it: any) => it.id === downloadId);
      if (!existingItem) {
        existingItem = {
          id: downloadId,
          title: (item as any).title || (item as any).name || 'Video',
          posterPath: item.posterPath,
          type: isTV ? 'tv' : 'movie',
          status: 'completed',
          progress: 100,
          localUrl: localPlayableUrl,
          addedAt: Date.now(),
          metaData: item,
          data: item,
          subtitles: offlineSubtitles,
          source
        };
        downloadsList.push(existingItem);
      } else {
        existingItem.status = 'completed';
        existingItem.progress = 100;
        existingItem.localUrl = localPlayableUrl;
        existingItem.metaData = item;
        existingItem.data = item;
        existingItem.subtitles = offlineSubtitles;
        if (!existingItem.source) existingItem.source = source;
      }
      localStorage.setItem('cinemovie_downloads', JSON.stringify(downloadsList));
      window.dispatchEvent(new CustomEvent('downloadsChanged'));

      if (!isNative) {
        this.updateStatus('Creating video file Blob...');
        const playableUrl = await OfflineStorageService.getPlayableUrl(downloadId);
        if (playableUrl) {
          const filename = `${cleanTitle}.ts`;
          const a = document.createElement('a');
          a.href = playableUrl;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }
      }

      await this.finalizeCurrentDownload(true);
    } catch (err: any) {
      console.error('[DownloadOffline] Error:', err);
      if (isNative) {
        NativeStreamingEngine.addJsLog({ message: `[Download] FATAL ERROR: ${err.message || 'Unknown error'}` }).catch(() => {});
      }

      try {
        const rawList = localStorage.getItem('cinemovie_downloads');
        if (rawList) {
          const list = JSON.parse(rawList);
          const existingItem = list.find((it: any) => it.id === downloadId);
          if (existingItem) {
            existingItem.status = 'failed';
            localStorage.setItem('cinemovie_downloads', JSON.stringify(list));
            window.dispatchEvent(new CustomEvent('downloadsChanged'));
          }
        }
      } catch (_) {}

      this.state.downloadStatus = err.message || 'Download failed.';
      await this.finalizeCurrentDownload(false);
    }
  }

  private updateLocalStorageProgress(p: number, status: 'downloading' | 'resolving' | 'completed' | 'failed' = 'downloading') {
    if (!this.state.downloadId || !this.state.item) return;

    const isCompletedOrFailed = status === 'completed' || status === 'failed' || status === 'resolving';
    const isFivePercentStep = p === 0 || p === 100 || p % 5 === 0;

    if (!isCompletedOrFailed && !isFivePercentStep) {
      return;
    }

    try {
      const rawList = localStorage.getItem('cinemovie_downloads');
      let downloadsList = rawList ? JSON.parse(rawList) : [];

      const isTV = !!this.state.season || !!this.state.episode;
      let existingItem = downloadsList.find((it: any) => it.id === this.state.downloadId);

      const resolvedStatus = p === 100 ? 'completed' : status;
      if (!existingItem) {
        existingItem = {
          id: this.state.downloadId,
          title: (this.state.item as any).title || (this.state.item as any).name || 'Video',
          posterPath: this.state.item.posterPath,
          type: isTV ? 'tv' : 'movie',
          status: resolvedStatus,
          progress: p,
          addedAt: Date.now(),
          metaData: this.state.item,
          data: this.state.item
        };
        downloadsList.push(existingItem);
      } else {
        existingItem.status = resolvedStatus;
        existingItem.progress = p;
      }

      localStorage.setItem('cinemovie_downloads', JSON.stringify(downloadsList));
      window.dispatchEvent(new CustomEvent('downloadsChanged'));
    } catch (e) {
      console.warn('[GlobalDownloader] Failed to sync progress to localStorage:', e);
    }
  }

  private updateProgress(p: number) {
    this.state.downloadProgress = p;
    this.updateLocalStorageProgress(p, 'downloading');
    this.notify();
  }

  private updateStatus(s: string) {
    this.state.downloadStatus = s;
    if (s.toLowerCase().includes('resolving')) {
      this.updateLocalStorageProgress(0, 'resolving');
    }
    this.notify();
  }

  private async downloadOfflineSubtitles(
    dlId: string,
    item: Movie | TVShow,
    season?: number,
    episode?: number,
    buildProxyUrl?: any
  ) {
    const offlineSubtitles = [];
    let resResult = (window as any)._lastDownloadResult;

    if (Capacitor.isNativePlatform() && !resResult) {
      try {
        const tmdbId = item.id;
        const isTV = !!season || !!episode;
        const titleToUse = (item as any).title || (item as any).name || '';
        const preferredServer = localStorage.getItem('cinemovie_download_server') || 'vidsrc-pm';
        if (isTV) {
          resResult = await resolveTVStream(tmdbId, titleToUse, season, episode, preferredServer);
        } else {
          const imdbId = (item as any).imdb_id || (item as any).imdbId;
          resResult = await resolveMovieStream(tmdbId, titleToUse, imdbId, preferredServer);
        }
      } catch (e) {
        console.warn('[Download] Fallback subtitles resolve failed:', e);
      }
    }

    if (resResult && resResult.subtitles && Array.isArray(resResult.subtitles)) {
      const isNativeLocal = Capacitor.isNativePlatform();
      const cleanDlId = dlId.replace(/[^a-z0-9_\-]/gi, '_');
      const dir = 'cinemovie_offline/' + cleanDlId;

      if (isNativeLocal) {
        try {
          const { Filesystem, Directory } = await import('@capacitor/filesystem');
          await Filesystem.mkdir({ path: dir, directory: Directory.Data, recursive: true });
        } catch (_) {}
      }

      for (let sIdx = 0; sIdx < resResult.subtitles.length; sIdx++) {
        const sub = resResult.subtitles[sIdx];
        const subUrl = sub.file || sub.url;
        if (!subUrl) continue;
        
        try {
          const cleanLang = (sub.label || sub.lang || 'sub_' + sIdx).replace(/[^a-zA-Z0-9]/g, '_');
          const subFilename = 'sub_' + cleanLang + '.vtt';
          const subLocalPath = dir + '/' + subFilename;
          
          let subText = '';
          let loadedSuccessfully = false;
          
          if (isNativeLocal) {
            const subRes = await fetchWithCapacitor(subUrl, 'text');
            if (subRes.ok) {
              subText = await subRes.text();
              loadedSuccessfully = true;
            }
          } else {
            const subRes = await fetch(subUrl.includes('localhost') || subUrl.includes('127.0.0.1') ? subUrl : buildProxyUrl(subUrl));
            if (subRes.ok) {
              subText = await subRes.text();
              loadedSuccessfully = true;
            }
          }
          
          if (loadedSuccessfully) {
            let localFileSrc = subUrl;
            if (isNativeLocal) {
              const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
              await Filesystem.writeFile({
                path: subLocalPath,
                data: subText,
                directory: Directory.Data,
                encoding: Encoding.UTF8,
                recursive: true
              });
              
              const subResultUri = await Filesystem.getUri({
                path: subLocalPath,
                directory: Directory.Data
              });
              localFileSrc = Capacitor.convertFileSrc(subResultUri.uri);
            } else {
              const blob = new Blob([subText], { type: 'text/vtt' });
              localFileSrc = URL.createObjectURL(blob);
            }
            
            offlineSubtitles.push({
              file: localFileSrc,
              label: sub.label || sub.lang || 'Unknown',
              kind: 'subtitles',
              default: sub.default || false,
              isBackup: sub.isBackup || false || (sub.label || '').includes('(Auto') || (sub.label || '').includes('(YTS') || (sub.label || '').toLowerCase().includes('opensubtitles')
            });
          }
        } catch (subErr) {
          console.warn('[Download] Failed to save subtitle: ' + subUrl, subErr);
        }
      }
      delete (window as any)._lastDownloadResult; 
    }

    return offlineSubtitles;
  }
}

export const GlobalDownloader = new GlobalDownloaderService();