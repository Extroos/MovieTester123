import { Capacitor } from '@capacitor/core';

// Hybrid Hosting: Custom -> Local -> Cloud
const FALLBACK_CLOUD = 'https://cinemovie-proxy.abderrahmanchakkouri.workers.dev'; // Unified Cloudflare Worker
export const isNative = Capacitor.isNativePlatform();
const CURRENT_VERSION = '1.1.4';

let cachedBaseUrl: string | null = null;

export const ServerManager = {
    async checkVersion(url: string): Promise<boolean> {
        try {
            const cleanUrl = url.replace(/\/$/, '');
            const res = await fetch(`${cleanUrl}/check-version`, {
                method: 'GET',
                signal: AbortSignal.timeout(2000)
            });
            if (res.ok) {
                const data = await res.json();
                console.log(`[ServerManager] Version Check for ${url}: ${data.version}`);
                return data.version === CURRENT_VERSION;
            }
        } catch (e) {
            console.warn(`[ServerManager] Version check failed for ${url}`);
        }
        return false;
    },

    reset: async (): Promise<void> => { cachedBaseUrl = null; },
    
    getUrl: async (): Promise<string> => {
        // v1.1.0 STALE CACE FIX: If we are on mobile, and the cache is 'localhost', it's WRONG.
        if (cachedBaseUrl && isNative && cachedBaseUrl.includes('localhost')) {
            console.warn('[ServerManager] Clearing stale localhost cache on Native device');
            cachedBaseUrl = null;
        }

        if (cachedBaseUrl) return cachedBaseUrl;

        // 1. Custom URL (Tunnel or Network IP)
        const custom = localStorage.getItem('custom_anime_server');
        const isLocalHost = !isNative && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

        if (custom) {
             const clean = custom.replace(/\/$/, '');
             if (clean.includes('localhost') && !isLocalHost) {
                 console.warn('Ignoring localhost custom server while on cloud');
                 localStorage.removeItem('custom_anime_server');
             } else {
                 try {
                      const res = await fetch(`${clean}/home`, { 
                          method: 'HEAD',
                          headers: { 'Bypass-Tunnel-Reminder': 'true' },
                          signal: AbortSignal.timeout(3000)
                      });
                      if (res.ok) {
                          cachedBaseUrl = clean;
                          return cachedBaseUrl;
                      }
                 } catch(e) { 
                     console.warn('Custom server failed:', e);
                     if (clean.includes('localhost')) localStorage.removeItem('custom_anime_server');
                 }
             }
        }

        // 2. Default Local/Proxy (SKIP ON NATIVE & CLOUDFLARE WORKERS)
        const isCloudflare = !isNative && window.location.hostname.includes('workers.dev');
        if (!isNative && !isCloudflare) {
            try {
                const res = await fetch('/hianime/home', { 
                    method: 'HEAD',
                    signal: AbortSignal.timeout(2000)
                });
                const isJson = res.headers.get('content-type')?.includes('application/json');
                
                if (res.ok && isJson) {
                    cachedBaseUrl = '/hianime';
                    return cachedBaseUrl;
                }
            } catch(e) {}
        }

        // 3. Cloud Fallback
        try {
            const cloudRes = await fetch(`${FALLBACK_CLOUD}/home`, { 
                method: 'HEAD', 
                headers: { 'Bypass-Tunnel-Reminder': 'true' },
                signal: AbortSignal.timeout(4000)
            });
            if (cloudRes.ok) {
                cachedBaseUrl = FALLBACK_CLOUD;
                return cachedBaseUrl;
            }
        } catch (e) {
            console.warn('[ServerManager] Cloud fallback check failed:', e);
        }
        
        const isCloudHost = !isNative && (window.location.hostname.includes('vercel.app') || window.location.hostname.includes('workers.dev'));
        if (isCloudHost) {
            // Prioritize Unified Cloudflare Worker
            if (window.location.hostname.includes('workers.dev')) {
                return FALLBACK_CLOUD;
            }

            // Fallback for Vercel
            try {
                const res = await fetch('/hianime/home', { signal: AbortSignal.timeout(1500) });
                if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
                    return '/hianime';
                }
            } catch (e) {}
            
            return FALLBACK_CLOUD;
        }
        
        return FALLBACK_CLOUD;
    }
};

