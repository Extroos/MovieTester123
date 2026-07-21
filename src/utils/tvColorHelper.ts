// ─────────────────────────────────────────────────────────────────────────────
// GPU-Accelerated Non-Blocking TV Dynamic Backdrop Engine
// ─────────────────────────────────────────────────────────────────────────────

const colorCache = new Map<string, string>();
let nextColorTimeout: ReturnType<typeof setTimeout> | null = null;
let activeLayer = 1;

function generateCinematicGradient(posterPath: string): string {
  let hash = 0;
  for (let i = 0; i < posterPath.length; i++) {
    hash = posterPath.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `radial-gradient(ellipse at top, hsla(${hue}, 45%, 14%, 0.85) 0%, hsla(${hue}, 40%, 8%, 0.4) 60%, transparent 100%)`;
}

function applyBackdropGradient(gradient: string) {
  const el1 = document.getElementById('tv-dynamic-backdrop-1');
  const el2 = document.getElementById('tv-dynamic-backdrop-2');
  if (!el1 || !el2) return;

  if (activeLayer === 1) {
    el2.style.background = gradient;
    el2.style.opacity = '1';
    el1.style.opacity = '0';
    activeLayer = 2;
  } else {
    el1.style.background = gradient;
    el1.style.opacity = '1';
    el2.style.opacity = '0';
    activeLayer = 1;
  }
}

export function updateDynamicBackdropColor(posterPath: string | null) {
  if (typeof document === 'undefined') return;
  const el1 = document.getElementById('tv-dynamic-backdrop-1');
  const el2 = document.getElementById('tv-dynamic-backdrop-2');
  if (!el1 || !el2) return;

  // Clear any pending color update from rapid D-Pad moves
  if (nextColorTimeout) {
    clearTimeout(nextColorTimeout);
    nextColorTimeout = null;
  }

  if (!posterPath) {
    const fallback = 'radial-gradient(ellipse at top, rgba(0, 0, 0, 0) 0%, transparent 100%)';
    applyBackdropGradient(fallback);
    return;
  }

  if (colorCache.has(posterPath)) {
    applyBackdropGradient(colorCache.get(posterPath)!);
    return;
  }

  // Debounce by 300ms so rapid D-Pad movement is 100% smooth 60fps
  nextColorTimeout = setTimeout(() => {
    const gradient = generateCinematicGradient(posterPath);
    colorCache.set(posterPath, gradient);
    applyBackdropGradient(gradient);
  }, 300);
}
