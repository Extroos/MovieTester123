/**
 * OfflineStorageService
 *
 * Stores downloaded video segments persistently and returns playable URLs.
 *
 * Key insight: Browsers cannot natively play raw MPEG-TS (.ts) blobs.
 * We wrap the stored blob in an in-memory HLS m3u8 playlist so HLS.js
 * can play it via MSE — this works in Chrome, Safari, and Android WebView.
 *
 * Strategy:
 *   - Native (Capacitor): Write .ts + .m3u8 to Filesystem.DATA.
 *     Return convertFileSrc(m3u8Uri) — HLS.js resolves the relative segment path.
 *   - Web / PC: Store ArrayBuffer in IndexedDB.
 *     At playback, create a segment blob URL + wrap in an m3u8 blob URL.
 *     HLS.js fetches the blob: segment URL just like a normal network URL.
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

// ─── Build an in-memory HLS playlist wrapping a segment blob URL ──────────────

function buildM3u8Playlist(segmentUrl: string): string {
  // Single-segment playlist — the whole downloaded video is one .ts file
  return [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    '#EXT-X-TARGETDURATION:86400',
    '#EXT-X-MEDIA-SEQUENCE:0',
    '#EXTINF:86400.0,',
    segmentUrl,
    '#EXT-X-ENDLIST',
    '',
  ].join('\n');
}

function makeBlobM3u8(segmentUrl: string): string {
  const playlist = buildM3u8Playlist(segmentUrl);
  const blob = new Blob([playlist], { type: 'application/x-mpegURL' });
  return URL.createObjectURL(blob);
}

// ─── Filesystem helpers (Capacitor native) ────────────────────────────────────

function safeFilename(id: string): string {
  return id.replace(/[^a-z0-9_\-]/gi, '_');
}

function tsFilename(id: string): string { return safeFilename(id) + '.ts'; }
function m3u8Filename(id: string): string { return safeFilename(id) + '.m3u8'; }

function uint8ToBase64(bytes: Uint8Array): Promise<string> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([bytes], { type: 'application/octet-stream' });
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1];
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function fsWrite(id: string, data: Uint8Array): Promise<string> {
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  const dir = 'cinemovie_offline';

  // 1. Convert bytes to base64 asynchronously using memory-safe Blob/FileReader
  const base64Data = await uint8ToBase64(data);

  // 2. Write the TS segment
  await Filesystem.writeFile({
    path: `${dir}/${tsFilename(id)}`,
    data: base64Data,
    directory: Directory.Data,
    recursive: true,
  });

  // 3. Write a companion .m3u8 playlist with a RELATIVE path to the segment
  //    HLS.js will resolve it relative to the m3u8 URL
  const playlist = buildM3u8Playlist(tsFilename(id));
  await Filesystem.writeFile({
    path: `${dir}/${m3u8Filename(id)}`,
    data: btoa(unescape(encodeURIComponent(playlist))), // UTF-8 safe base64
    directory: Directory.Data,
    recursive: true,
  });

  // 4. Return the playable capacitor:// URL for the m3u8
  const result = await Filesystem.getUri({
    path: `${dir}/${m3u8Filename(id)}`,
    directory: Directory.Data,
  });
  return Capacitor.convertFileSrc(result.uri);
}

async function fsDelete(id: string): Promise<void> {
  try {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const dir = 'cinemovie_offline';
    await Filesystem.deleteFile({ path: `${dir}/${tsFilename(id)}`,  directory: Directory.Data }).catch(() => {});
    await Filesystem.deleteFile({ path: `${dir}/${m3u8Filename(id)}`, directory: Directory.Data }).catch(() => {});
  } catch { /* ignore */ }
}

const activeSessions: Record<string, Uint8Array[]> = {};

// ─── Public API ───────────────────────────────────────────────────────────────

export const OfflineStorageService = {
  /**
   * Start a progressive write session to save memory on native platforms.
   */
  async startProgressiveWrite(id: string): Promise<void> {
    if (isNative) {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const dir = 'cinemovie_offline';
      try {
        await Filesystem.mkdir({
          path: dir,
          directory: Directory.Data,
          recursive: true,
        }).catch(() => {});
        await Filesystem.deleteFile({
          path: `${dir}/${tsFilename(id)}`,
          directory: Directory.Data,
        }).catch(() => {});
        await Filesystem.deleteFile({
          path: `${dir}/${m3u8Filename(id)}`,
          directory: Directory.Data,
        }).catch(() => {});

        // Initialize the file as empty to guarantee it exists on disk before appendFile calls
        await Filesystem.writeFile({
          path: `${dir}/${tsFilename(id)}`,
          data: '',
          directory: Directory.Data,
          recursive: true,
        });
      } catch (e) {}
    } else {
      activeSessions[id] = [];
    }
  },

  /**
   * Append a segment chunk of data to the active write session.
   */
  async appendChunk(id: string, chunk: ArrayBuffer | Uint8Array | string): Promise<void> {
    if (isNative) {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const dir = 'cinemovie_offline';
      let base64Data: string;
      if (typeof chunk === 'string') {
        base64Data = chunk;
      } else {
        const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
        base64Data = await uint8ToBase64(bytes);
      }
      await Filesystem.appendFile({
        path: `${dir}/${tsFilename(id)}`,
        data: base64Data,
        directory: Directory.Data,
      });
    } else {
      let bytes: Uint8Array;
      if (typeof chunk === 'string') {
        const binary = atob(chunk);
        bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
      } else {
        bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
      }
      if (!activeSessions[id]) {
        activeSessions[id] = [];
      }
      activeSessions[id].push(bytes);
    }
  },

  /**
   * Finalize the progressive write session, write playlist manifest, and return playable URL.
   */
  async finalizeWrite(id: string): Promise<string> {
    if (isNative) {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const dir = 'cinemovie_offline';

      const playlist = buildM3u8Playlist(tsFilename(id));
      await Filesystem.writeFile({
        path: `${dir}/${m3u8Filename(id)}`,
        data: btoa(unescape(encodeURIComponent(playlist))),
        directory: Directory.Data,
        recursive: true,
      });

      const result = await Filesystem.getUri({
        path: `${dir}/${m3u8Filename(id)}`,
        directory: Directory.Data,
      });
      return Capacitor.convertFileSrc(result.uri);
    } else {
      const chunks = activeSessions[id] || [];
      delete activeSessions[id];

      let totalBytes = 0;
      for (const chunk of chunks) {
        totalBytes += chunk.byteLength;
      }

      const mergedArray = new Uint8Array(totalBytes);
      let offset = 0;
      for (const chunk of chunks) {
        mergedArray.set(chunk, offset);
        offset += chunk.byteLength;
      }

      await idbPut(id, mergedArray.buffer as ArrayBuffer);
      return `idb://${id}`;
    }
  },

  /**
   * Persist downloaded video bytes.
   * Returns a sentinel `idb://<id>` on web, or a `capacitor://` m3u8 URL on native.
   * The caller stores this value as `localUrl` in the download record.
   */
  async save(id: string, data: Uint8Array): Promise<string> {
    if (isNative) {
      return fsWrite(id, data);
    } else {
      await idbPut(id, data.buffer as ArrayBuffer);
      return `idb://${id}`;
    }
  },

  /**
   * Get a playable HLS URL for the stored download.
   *
   * Web:    Read bytes from IndexedDB → create segment blob → wrap in m3u8 blob → return m3u8 blob URL.
   * Native: Return the capacitor:// URL for the companion .m3u8 file.
   *
   * The returned URL MUST be fed to HLS.js (not set as video.src directly),
   * because it is an MPEG-TS container which browsers cannot natively play.
   */
  async getPlayableUrl(id: string): Promise<string | null> {
    if (isNative) {
      try {
        const { Filesystem, Directory } = await import('@capacitor/filesystem');
        const result = await Filesystem.getUri({
          path: `cinemovie_offline/${m3u8Filename(id)}`,
          directory: Directory.Data,
        });
        return Capacitor.convertFileSrc(result.uri);
      } catch {
        return null;
      }
    } else {
      const buffer = await idbGet(id);
      if (!buffer) return null;

      // Build segment blob URL → wrap in m3u8 blob URL
      // HLS.js will fetch the segment blob URL via XHR (same-origin blob: access is allowed)
      const segBlob = new Blob([buffer], { type: 'video/mp2t' });
      const segUrl  = URL.createObjectURL(segBlob);
      return makeBlobM3u8(segUrl);
    }
  },

  /**
   * Delete a stored download (both the .ts data and the companion .m3u8 on native).
   */
  async delete(id: string): Promise<void> {
    if (isNative) {
      await fsDelete(id);
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
        const tsInfo = await Filesystem.stat({
          path: `cinemovie_offline/${tsFilename(id)}`,
          directory: Directory.Data,
        });
        const m3u8Info = await Filesystem.stat({
          path: `cinemovie_offline/${m3u8Filename(id)}`,
          directory: Directory.Data,
        });
        return tsInfo.size > 0 && m3u8Info.size > 0;
      } catch {
        return false;
      }
    } else {
      const buffer = await idbGet(id);
      return buffer !== null;
    }
  },
};


