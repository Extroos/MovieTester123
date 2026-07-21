/**
 * OfflineStorageService
 *
 * Stores downloaded video segments persistently and returns playable URLs.
 *
 * Native (Capacitor/Android):
 *   - MP4: Saves single direct video file to `cinemovie_offline/<id>.mp4`
 *   - HLS: Saves segments inside `cinemovie_offline/<id>/seg_XXXX.ts` and companion playlist `cinemovie_offline/<id>.m3u8`
 */

import { Capacitor } from '@capacitor/core';

const isNative = Capacitor.isNativePlatform();
const IDB_DB_NAME = 'cinemovie_offline_videos';
const IDB_STORE   = 'videos';
const IDB_VERSION  = 1;

// ─── IndexedDB helpers ────────────────────────────────────────────────────────

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function idbPut(id: string, buffer: ArrayBuffer): Promise<void> {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(buffer, id);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

async function idbGet(id: string): Promise<ArrayBuffer | null> {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(id);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror   = () => reject(req.error);
  });
}

async function idbDelete(id: string): Promise<void> {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

// ─── Build in-memory HLS playlist (single-segment, for web blob URLs) ─────────

function buildSingleSegM3u8(segmentUrl: string, durationSeconds = 7200): string {
  return [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    `#EXT-X-TARGETDURATION:${durationSeconds}`,
    '#EXT-X-MEDIA-SEQUENCE:0',
    `#EXTINF:${durationSeconds}.0,`,
    segmentUrl,
    '#EXT-X-ENDLIST',
    '',
  ].join('\n');
}

function makeBlobM3u8(segmentUrl: string, durationSeconds = 7200): string {
  const playlist = buildSingleSegM3u8(segmentUrl, durationSeconds);
  const blob = new Blob([playlist], { type: 'application/x-mpegURL' });
  return URL.createObjectURL(blob);
}

// ─── Filesystem helpers (Capacitor native) ────────────────────────────────────

function safeId(id: string): string {
  return id.replace(/[^a-z0-9_\-]/gi, '_');
}

function segDir(id: string): string {
  return `cinemovie_offline/${safeId(id)}`;
}

function segFilename(index: number): string {
  return `seg_${String(index).padStart(4, '0')}.ts`;
}

function m3u8Filename(id: string): string {
  return `${safeId(id)}.m3u8`;
}

function mp4Filename(id: string): string {
  return `${safeId(id)}.mp4`;
}

function isDownloadMp4(id: string): boolean {
  const session = nativeSessions[id];
  if (session) return session.isMp4;

  try {
    const raw = localStorage.getItem('cinemovie_downloads');
    if (raw) {
      const list = JSON.parse(raw);
      const item = list.find((i: any) => i.id === id);
      if (item) {
        if (item.localUrl && item.localUrl.includes('type=mp4')) return true;
        if (item.streamUrl) {
          const s = item.streamUrl.toLowerCase();
          if (s.includes('.mp4') || s.includes('.mkv') || s.includes('resource/h265')) return true;
        }
      }
    }
  } catch (e) {}
  return false;
}

function uint8ToBase64(bytes: Uint8Array): Promise<string> {
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
}

// ─── In-memory session state ──────────────────────────────────────────────────

interface NativeSession {
  segmentCount: number;
  isMp4: boolean;
  segmentDurations?: number[];
}

const nativeSessions: Record<string, NativeSession> = {};
const webSessions: Record<string, Uint8Array[]> = {};

// ─── Public API ───────────────────────────────────────────────────────────────

export const OfflineStorageService = {
  /**
   * Start a progressive write session.
   * On native: creates the segment sub-directory and clears any prior run.
   */
  async startProgressiveWrite(id: string, isMp4 = false, segmentDurations?: number[]): Promise<void> {
    if (isNative) {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const dir = segDir(id);

      nativeSessions[id] = { segmentCount: 0, isMp4, segmentDurations };

      // Ensure base directory exists
      try {
        await Filesystem.mkdir({ path: 'cinemovie_offline', directory: Directory.Data, recursive: true });
      } catch (_) {}

      if (isMp4) {
        // Clear previous MP4 file
        try {
          await Filesystem.deleteFile({
            path: `cinemovie_offline/${mp4Filename(id)}`,
            directory: Directory.Data,
          });
        } catch (_) {}
      } else {
        // Clear segment directory
        try {
          await Filesystem.mkdir({ path: dir, directory: Directory.Data, recursive: true });
        } catch (_) {}

        try {
          const existing = await Filesystem.readdir({ path: dir, directory: Directory.Data });
          for (const entry of existing.files) {
            const name = typeof entry === 'string' ? entry : (entry as any).name;
            try {
              await Filesystem.deleteFile({ path: `${dir}/${name}`, directory: Directory.Data });
            } catch (_) {}
          }
        } catch (_) {}

        // Clear old m3u8
        try {
          await Filesystem.deleteFile({
            path: `cinemovie_offline/${m3u8Filename(id)}`,
            directory: Directory.Data,
          });
        } catch (_) {}
      }
    } else {
      webSessions[id] = [];
    }
  },

  /**
   * Append a segment to the active write session.
   */
  async appendChunk(id: string, chunk: ArrayBuffer | Uint8Array | string): Promise<void> {
    if (isNative) {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const session = nativeSessions[id];
      if (!session) throw new Error(`[OfflineStorage] No active session for ${id}. Call startProgressiveWrite first.`);

      let base64Data: string;
      if (typeof chunk === 'string') {
        base64Data = chunk;
      } else {
        const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
        if (bytes.byteLength === 0) return; // Skip empty/failed segments
        base64Data = await uint8ToBase64(bytes);
      }

      const filename = segFilename(session.segmentCount);
      await Filesystem.writeFile({
        path: `${segDir(id)}/${filename}`,
        data: base64Data,
        directory: Directory.Data,
        recursive: true,
      });

      session.segmentCount++;
    } else {
      let bytes: Uint8Array;
      if (typeof chunk === 'string') {
        const binary = atob(chunk);
        bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      } else {
        bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
      }
      if (!webSessions[id]) webSessions[id] = [];
      webSessions[id].push(bytes);
    }
  },

  /**
   * Finalize the session: write the .m3u8 playlist and return the playable URL.
   */
  async finalizeWrite(id: string, isMp4 = false): Promise<string> {
    // Resolve runtime for duration hint
    let durationSeconds = 7200;
    try {
      const raw = localStorage.getItem('cinemovie_downloads');
      if (raw) {
        const list = JSON.parse(raw);
        const item = list.find((i: any) => i.id === id);
        if (item) {
          if (item.durationSeconds) {
            durationSeconds = item.durationSeconds;
          } else if (item.data) {
            const runtime = item.data.runtime || (item.data.episode_run_time && item.data.episode_run_time[0]) || 120;
            durationSeconds = runtime * 60;
          }
        }
      }
    } catch (_) {}

    if (isNative) {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const session = nativeSessions[id];
      const actualIsMp4 = session?.isMp4 ?? isMp4;
      const dir = segDir(id);

      if (actualIsMp4) {
        const result = await Filesystem.getUri({
          path: `cinemovie_offline/${mp4Filename(id)}`,
          directory: Directory.Data,
        });
        delete nativeSessions[id];
        return Capacitor.convertFileSrc(result.uri) + '#type=mp4';
      }

      let totalSegs = session?.segmentCount ?? 0;
      if (totalSegs === 0) {
        try {
          const entries = await Filesystem.readdir({ path: dir, directory: Directory.Data });
          const tsFiles = entries.files.filter((f: any) => {
            const name = typeof f === 'string' ? f : (f.name || '');
            return name.endsWith('.ts');
          });
          totalSegs = tsFiles.length;
        } catch (_) {}
      }

      if (totalSegs === 0) {
        delete nativeSessions[id];
        throw new Error(`[OfflineStorage] Zero segments were saved for ${id}. Segment downloads all failed — check CDN connectivity and proxy headers.`);
      }

       // Build a proper multi-segment HLS playlist using capacitor file:// URIs
       const hasDurations = session?.segmentDurations && Array.isArray(session.segmentDurations) && session.segmentDurations.length === totalSegs;
       const maxSegDur = hasDurations
         ? Math.ceil(Math.max(...session.segmentDurations!))
         : (totalSegs > 0 ? Math.ceil(durationSeconds / totalSegs) : durationSeconds);

       const playlistLines: string[] = [
         '#EXTM3U',
         '#EXT-X-VERSION:3',
         `#EXT-X-TARGETDURATION:${maxSegDur}`,
         '#EXT-X-MEDIA-SEQUENCE:0',
       ];

       for (let i = 0; i < totalSegs; i++) {
         const filename = segFilename(i);
         const segResult = await Filesystem.getUri({
           path: `${dir}/${filename}`,
           directory: Directory.Data,
         });
         const segUrl = Capacitor.convertFileSrc(segResult.uri);
         const individualDur = hasDurations ? session.segmentDurations![i] : (totalSegs > 0 ? durationSeconds / totalSegs : durationSeconds);
         playlistLines.push(`#EXTINF:${individualDur.toFixed(3)},`);
         playlistLines.push(segUrl);
       }
       playlistLines.push('#EXT-X-ENDLIST');
       playlistLines.push('');

      const playlistContent = playlistLines.join('\n');
      const playlistBase64 = btoa(unescape(encodeURIComponent(playlistContent)));

      // Write m3u8 next to the segment directory
      await Filesystem.writeFile({
        path: `cinemovie_offline/${m3u8Filename(id)}`,
        data: playlistBase64,
        directory: Directory.Data,
        recursive: true,
      });

      const m3u8Result = await Filesystem.getUri({
        path: `cinemovie_offline/${m3u8Filename(id)}`,
        directory: Directory.Data,
      });

      delete nativeSessions[id];
      return Capacitor.convertFileSrc(m3u8Result.uri) + '#type=m3u8';
    } else {
      // Web: merge all chunks and store in IDB
      const chunks = webSessions[id] || [];
      delete webSessions[id];

      let totalBytes = 0;
      for (const c of chunks) totalBytes += c.byteLength;
      const merged = new Uint8Array(totalBytes);
      let offset = 0;
      for (const c of chunks) { merged.set(c, offset); offset += c.byteLength; }

      await idbPut(id, merged.buffer as ArrayBuffer);
      const isMp4Real = isDownloadMp4(id);
      return `idb://${id}#type=${isMp4Real ? 'mp4' : 'm3u8'}`;
    }
  },

  /**
   * Get a playable HLS URL for a stored download.
   */
  async getPlayableUrl(id: string): Promise<string | null> {
    let durationSeconds = 7200;
    try {
      const raw = localStorage.getItem('cinemovie_downloads');
      if (raw) {
        const list = JSON.parse(raw);
        const item = list.find((i: any) => i.id === id);
        if (item) {
          if (item.durationSeconds) {
            durationSeconds = item.durationSeconds;
          } else if (item.data) {
            const runtime = item.data.runtime || (item.data.episode_run_time && item.data.episode_run_time[0]) || 120;
            durationSeconds = runtime * 60;
          }
        }
      }
    } catch (_) {}

    if (isNative) {
      try {
        const { Filesystem, Directory } = await import('@capacitor/filesystem');
        const isMp4 = isDownloadMp4(id);

        if (isMp4) {
          const result = await Filesystem.getUri({
            path: `cinemovie_offline/${mp4Filename(id)}`,
            directory: Directory.Data,
          });
          return Capacitor.convertFileSrc(result.uri) + '#type=mp4';
        } else {
          const result = await Filesystem.getUri({
            path: `cinemovie_offline/${m3u8Filename(id)}`,
            directory: Directory.Data,
          });
          return Capacitor.convertFileSrc(result.uri) + '#type=m3u8';
        }
      } catch {
        return null;
      }
    } else {
      const buffer = await idbGet(id);
      if (!buffer) return null;

      const isMp4 = isDownloadMp4(id);
      if (isMp4) {
        const blob = new Blob([buffer], { type: 'video/mp4' });
        return URL.createObjectURL(blob) + '#type=mp4';
      } else {
        const segBlob = new Blob([buffer], { type: 'video/mp2t' });
        const segUrl  = URL.createObjectURL(segBlob);
        return makeBlobM3u8(segUrl, durationSeconds) + '#type=m3u8';
      }
    }
  },

  /**
   * Delete a stored download.
   */
  async delete(id: string): Promise<void> {
    if (isNative) {
      try {
        const { Filesystem, Directory } = await import('@capacitor/filesystem');
        const dir = segDir(id);
        const cleanId = safeId(id);

        console.log(`[OfflineStorage] Starting cleanup for: ${id}`);

        // 1. Delete direct MP4 files (both new and legacy paths)
        const mp4Paths = [
          `cinemovie_offline/${mp4Filename(id)}`,
          `cinemovie_offline/${cleanId}.mp4`,
          `cinemovie_offline/${cleanId}.ts`
        ];

        for (const path of mp4Paths) {
          try {
            await Filesystem.deleteFile({
              path,
              directory: Directory.Data,
            });
            console.log(`[OfflineStorage] Deleted file: ${path}`);
          } catch (_) {}
        }

        // 2. Delete all HLS segments in sub-directory
        try {
          const entries = await Filesystem.readdir({ path: dir, directory: Directory.Data });
          for (const entry of entries.files) {
            const name = typeof entry === 'string' ? entry : (entry as any).name;
            try {
              await Filesystem.deleteFile({ path: `${dir}/${name}`, directory: Directory.Data });
            } catch (_) {}
          }
          console.log(`[OfflineStorage] Cleaned segment files inside: ${dir}`);
        } catch (_) {}

        // 3. Delete segment directory
        try {
          await Filesystem.rmdir({
            path: dir,
            directory: Directory.Data,
            recursive: true
          });
          console.log(`[OfflineStorage] Deleted directory: ${dir}`);
        } catch (_) {}

        // 4. Delete the m3u8 playlist
        try {
          await Filesystem.deleteFile({
            path: `cinemovie_offline/${m3u8Filename(id)}`,
            directory: Directory.Data,
          });
          console.log(`[OfflineStorage] Deleted playlist: cinemovie_offline/${m3u8Filename(id)}`);
        } catch (_) {}

        // 5. Verification check
        try {
          const list = await Filesystem.readdir({ path: 'cinemovie_offline', directory: Directory.Data });
          console.log('[OfflineStorage] Remaining items in cinemovie_offline:', list.files.map((f: any) => f.name || f));
        } catch (_) {}
      } catch (err: any) {
        console.error('[OfflineStorage] Error during delete:', err);
      }
    } else {
      await idbDelete(id);
    }
  },

  /**
   * Check whether a download exists in local storage.
   */
  async exists(id: string): Promise<boolean> {
    if (isNative) {
      try {
        const { Filesystem, Directory } = await import('@capacitor/filesystem');

        if (isDownloadMp4(id)) {
          const info = await Filesystem.stat({
            path: `cinemovie_offline/${mp4Filename(id)}`,
            directory: Directory.Data,
          });
          return info.size > 0;
        } else {
          // Check m3u8 exists and at least one segment exists
          const m3u8Info = await Filesystem.stat({
            path: `cinemovie_offline/${m3u8Filename(id)}`,
            directory: Directory.Data,
          });
          const seg0Info = await Filesystem.stat({
            path: `${segDir(id)}/${segFilename(0)}`,
            directory: Directory.Data,
          });
          return m3u8Info.size > 0 && seg0Info.size > 0;
        }
      } catch {
        return false;
      }
    } else {
      const buffer = await idbGet(id);
      return buffer !== null;
    }
  },

  /**
   * Legacy/single-shot save.
   */
  async save(id: string, data: Uint8Array): Promise<string> {
    if (isNative) {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const base64Data = await uint8ToBase64(data);
      const isMp4 = isDownloadMp4(id);

      if (isMp4) {
        await Filesystem.writeFile({
          path: `cinemovie_offline/${mp4Filename(id)}`,
          data: base64Data,
          directory: Directory.Data,
          recursive: true,
        });
        const result = await Filesystem.getUri({ path: `cinemovie_offline/${mp4Filename(id)}`, directory: Directory.Data });
        return Capacitor.convertFileSrc(result.uri) + '#type=mp4';
      } else {
        const dir = segDir(id);
        try { await Filesystem.mkdir({ path: dir, directory: Directory.Data, recursive: true }); } catch (_) {}
        await Filesystem.writeFile({
          path: `${dir}/seg_0000.ts`,
          data: base64Data,
          directory: Directory.Data,
          recursive: true,
        });
        const segResult = await Filesystem.getUri({ path: `${dir}/seg_0000.ts`, directory: Directory.Data });
        const segUrl = Capacitor.convertFileSrc(segResult.uri);
        const playlist = buildSingleSegM3u8(segUrl);
        const playlistBase64 = btoa(unescape(encodeURIComponent(playlist)));
        await Filesystem.writeFile({
          path: `cinemovie_offline/${m3u8Filename(id)}`,
          data: playlistBase64,
          directory: Directory.Data,
          recursive: true,
        });
        const m3u8Result = await Filesystem.getUri({
          path: `cinemovie_offline/${m3u8Filename(id)}`,
          directory: Directory.Data,
        });
        return Capacitor.convertFileSrc(m3u8Result.uri) + '#type=m3u8';
      }
    } else {
      await idbPut(id, data.buffer as ArrayBuffer);
      const isMp4 = isDownloadMp4(id);
      return `idb://${id}#type=${isMp4 ? 'mp4' : 'm3u8'}`;
    }
  },
};
