/**
 * Returns true when the app is running on a TV/Android Box.
 *
 * Priority order:
 *   1. `body.tv-mode` class — set authoritatively by App.tsx on mount.
 *   2. localStorage `cinemovie_is_tv` — persisted across refreshes, set by App.tsx.
 *   3. Heuristic fallback — landscape screen with no touch.
 */
export function isTVMode(): boolean {
  // Most reliable: App.tsx injects this class on mount with real detection
  if (typeof document !== 'undefined') {
    if (document.body.classList.contains('tv-mode')) return true;
    // Explicitly removed — not TV
    if (document.body.classList.contains('no-tv-mode')) return false;
  }

  // Persisted from last authoritative check
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem('cinemovie_is_tv');
    if (stored === 'true') return true;
    if (stored === 'false') return false;
  }

  if (typeof navigator !== 'undefined') {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('tv') || ua.includes('leanback') || ua.includes('googletv') || ua.includes('smart-tv') || ua.includes('aftb') || ua.includes('aftm') || ua.includes('aftt') || ua.includes('bravia')) {
      return true;
    }
  }

  return false;
}
