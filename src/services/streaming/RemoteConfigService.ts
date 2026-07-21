/**
 * RemoteConfigService
 * 
 * Fetches and caches the OTA config.json from GitHub.
 * Provides dynamic gateway domains for all streaming servers
 * so they can be updated via a git push without reinstalling the app.
 */

import localConfig from '../../../config.json';

const CONFIG_URL_KEY = 'cinemovie_ota_config_url';
const CONFIG_CACHE_KEY = 'cinemovie_ota_config_cache';
const CONFIG_CACHE_TTL = 2 * 60 * 1000; // 2 minutes — fast propagation when CDN rotates
const CONFIG_CACHE_TS_KEY = 'cinemovie_ota_config_cache_ts';

const DEFAULT_CONFIG_URL = 'https://raw.githubusercontent.com/Extroos/MovieTester123/main/config.json';

// Toggle to enable/disable remote OTA configuration fetching from GitHub.
// Enabled: gateways, headers and server lists can be hotfixed via a GitHub push
// without needing to redeploy the app.
export const ENABLE_REMOTE_OTA = true;

interface GatewayConfig {
  cloudnestra: string;
  vidsrc_wtf: string;
  vidsrc_sbs: string;
  vidsrc_pk: string;
  vidsrc_fyi: string;
  [key: string]: string | undefined;
}

interface RemoteConfig {
  gateways?: GatewayConfig;
  headers?: Record<string, string>;
  embed_urls?: Record<string, any>;
  [key: string]: any;
}

const DEFAULT_GATEWAYS: GatewayConfig = {
  cloudnestra: 'https://cloudnestra.com',
  vidsrc_pm: 'https://streamdata.vaplayer.ru',
  vidsrc_wtf: 'https://viduki.net',
  vidsrc_sbs: 'https://vidsrc.sbs',
  vidsrc_pk: 'https://embed.vidsrc.pk',
  vidsrc_fyi: 'https://vidsrc.fyi',
  vixsrc: 'https://vixsrc.to',
  enc_dec: 'https://enc-dec.app',
  vidsrc_top_new: 'https://vid-src.top'
};

let _cachedConfig: RemoteConfig | null = null;
let _fetchPromise: Promise<RemoteConfig> | null = null;

function getConfigUrl(): string {
  try {
    return localStorage.getItem(CONFIG_URL_KEY) || DEFAULT_CONFIG_URL;
  } catch {
    return DEFAULT_CONFIG_URL;
  }
}

function loadCachedConfig(): RemoteConfig | null {
  try {
    const ts = parseInt(localStorage.getItem(CONFIG_CACHE_TS_KEY) || '0', 10);
    if (Date.now() - ts > CONFIG_CACHE_TTL) return null;
    const raw = localStorage.getItem(CONFIG_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveCachedConfig(config: RemoteConfig): void {
  try {
    localStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify(config));
    localStorage.setItem(CONFIG_CACHE_TS_KEY, String(Date.now()));
  } catch {
    // localStorage might be full; silent fail
  }
}

async function fetchRemoteConfig(): Promise<RemoteConfig> {
  if (!ENABLE_REMOTE_OTA) {
    _cachedConfig = localConfig as unknown as RemoteConfig;
    return _cachedConfig;
  }
  const url = getConfigUrl();
  const cacheBustUrl = `${url}?t=${Date.now()}`;
  try {
    const res = await fetch(cacheBustUrl, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: RemoteConfig = await res.json();
    saveCachedConfig(data);
    _cachedConfig = data;
    return data;
  } catch (err) {
    console.warn('[RemoteConfig] Failed to fetch OTA config, using cache/defaults:', err);
    const cached = loadCachedConfig();
    if (cached) {
      _cachedConfig = cached;
      return cached;
    }
    return { gateways: DEFAULT_GATEWAYS };
  }
}

/**
 * Returns the full remote config object.
 * Uses in-memory cache first, then localStorage cache, then fetches remotely.
 */
export async function getRemoteConfig(): Promise<RemoteConfig> {
  if (!ENABLE_REMOTE_OTA) {
    return localConfig as unknown as RemoteConfig;
  }
  if (_cachedConfig) return _cachedConfig;

  const cached = loadCachedConfig();
  if (cached) {
    _cachedConfig = cached;
    // Refresh in background
    fetchRemoteConfig().catch(() => {});
    return cached;
  }

  // Deduplicate concurrent fetches
  if (!_fetchPromise) {
    _fetchPromise = fetchRemoteConfig().finally(() => { _fetchPromise = null; });
  }
  return _fetchPromise;
}

/**
 * Returns the gateway URL for a given server key.
 * Falls back to defaults if not configured.
 * 
 * @example
 * const wtfUrl = await getGateway('vidsrc_wtf'); // "https://vidsrc.wtf"
 * const sbsUrl = await getGateway('vidsrc_sbs'); // "https://vidsrc.sbs"
 */
export async function getGateway(key: keyof GatewayConfig): Promise<string> {
  const config = await getRemoteConfig();
  return config?.gateways?.[key] ?? DEFAULT_GATEWAYS[key] ?? '';
}

/**
 * Returns an array of mirror gateways for failover.
 */
export async function getGatewayList(key: string): Promise<string[]> {
  const config = await getRemoteConfig();
  const list = config?.gateways?.[key];
  if (Array.isArray(list)) return list;
  return [];
}

/**
 * Returns the domain hostname for a given server key (strips protocol/path).
 * 
 * @example
 * const host = await getGatewayHost('vidsrc_pk'); // "embed.vidsrc.pk"
 */
export async function getGatewayHost(key: keyof GatewayConfig): Promise<string> {
  const url = await getGateway(key);
  try {
    return new URL(url).hostname;
  } catch {
    return url.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  }
}

/**
 * Returns all gateways at once.
 */
export async function getAllGateways(): Promise<GatewayConfig> {
  const config = await getRemoteConfig();
  return { ...DEFAULT_GATEWAYS, ...(config?.gateways ?? {}) };
}

/**
 * Forces a fresh fetch of the remote config, bypassing cache.
 */
export async function refreshRemoteConfig(): Promise<RemoteConfig> {
  _cachedConfig = null;
  try { localStorage.removeItem(CONFIG_CACHE_KEY); } catch {}
  return fetchRemoteConfig();
}

export interface RemoteServerOption {
  id: string;
  name: string;
  description: string;
  badge: string;
  isAdFree: boolean;
}

/**
 * Returns the list of servers from OTA config.
 * If not set in config, returns null.
 */
export async function getRemoteServers(): Promise<RemoteServerOption[] | null> {
  const config = await getRemoteConfig();
  const list = config?.servers;
  if (Array.isArray(list) && list.length > 0) return list as RemoteServerOption[];
  return null;
}

/**
 * Returns the list of enabled server IDs from OTA config.
 * If not set in config, returns null (caller should show all servers).
 *
 * @example
 * const enabled = await getEnabledServers();
 * // ["vidsrc-pm", "vidsrc-wtf-2", "vidsrc-sbs"]
 */
export async function getEnabledServers(): Promise<string[] | null> {
  const config = await getRemoteConfig();
  const list = config?.enabled_servers;
  if (Array.isArray(list) && list.length > 0) return list as string[];
  // If we have dynamic servers array but not enabled_servers, return the IDs of those servers
  const servers = config?.servers;
  if (Array.isArray(servers) && servers.length > 0) {
    return servers.map((s: any) => s.id);
  }
  return null; // null = show all (safe fallback)
}

// Eagerly warm up the cache on module load
getRemoteConfig().catch(() => {});
