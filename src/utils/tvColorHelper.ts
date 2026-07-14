import { getPosterUrl } from '../services/tmdb';

// Cache extracted colors to prevent re-analyzing the same posters
const colorCache = new Map<string, string>();
let nextColorTimeout: ReturnType<typeof setTimeout> | null = null;

let activeLayer = 1;

function applyBackdropGradient(gradient: string) {
  const el1 = document.getElementById('tv-dynamic-backdrop-1');
  const el2 = document.getElementById('tv-dynamic-backdrop-2');
  if (!el1 || !el2) return;

  if (activeLayer === 1) {
    // Set gradient on layer 2, fade it in, and fade layer 1 out
    el2.style.background = gradient;
    el2.style.opacity = '1';
    el1.style.opacity = '0';
    activeLayer = 2;
  } else {
    // Set gradient on layer 1, fade it in, and fade layer 2 out
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

  // Clear any pending color extraction from previous fast D-Pad moves
  if (nextColorTimeout) {
    clearTimeout(nextColorTimeout);
    nextColorTimeout = null;
  }

  if (!posterPath) {
    const fallback = 'radial-gradient(ellipse at top, rgba(0, 0, 0, 0) 0%, transparent 100%)';
    applyBackdropGradient(fallback);
    return;
  }

  // If already cached, apply immediately with the smooth cross-fade transition
  if (colorCache.has(posterPath)) {
    applyBackdropGradient(colorCache.get(posterPath)!);
    return;
  }

  // Debounce the color extraction by 250ms so that fast scrolling skips analysis entirely
  nextColorTimeout = setTimeout(() => {
    try {
      const rawPosterUrl = getPosterUrl(posterPath, 'small');
      const proxyPosterUrl = `https://images.weserv.nl/?url=${encodeURIComponent(rawPosterUrl)}&w=50`;

      const tempImg = new Image();
      tempImg.crossOrigin = 'anonymous';
      tempImg.src = proxyPosterUrl;

      tempImg.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (ctx) {
            canvas.width = 10;
            canvas.height = 10;
            ctx.drawImage(tempImg, 0, 0, 10, 10);
            const data = ctx.getImageData(0, 0, 10, 10).data;

            let r = 0, g = 0, b = 0, count = 0;
            for (let i = 0; i < data.length; i += 4) {
              const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
              if (brightness > 20 && brightness < 235) {
                r += data[i];
                g += data[i + 1];
                b += data[i + 2];
                count++;
              }
            }

            if (count > 0) {
              let avgR = Math.round(r / count);
              let avgG = Math.round(g / count);
              let avgB = Math.round(b / count);

              const maxVal = Math.max(avgR, avgG, avgB);
              if (maxVal > 220) {
                const factor = 220 / maxVal;
                avgR = Math.round(avgR * factor);
                avgG = Math.round(avgG * factor);
                avgB = Math.round(avgB * factor);
              }

              const gradient = `radial-gradient(ellipse at top, rgba(${avgR}, ${avgG}, ${avgB}, 0.85) 0%, rgba(${avgR}, ${avgG}, ${avgB}, 0.4) 60%, transparent 100%)`;
              colorCache.set(posterPath, gradient);
              applyBackdropGradient(gradient);
            }
          }
        } catch (e) {
          const fallback = 'radial-gradient(ellipse at top, rgba(0, 0, 0, 0) 0%, transparent 100%)';
          colorCache.set(posterPath, fallback);
          applyBackdropGradient(fallback);
        }
      };

      tempImg.onerror = () => {
        const fallback = 'radial-gradient(ellipse at top, rgba(0, 0, 0, 0) 0%, transparent 100%)';
        colorCache.set(posterPath, fallback);
        applyBackdropGradient(fallback);
      };
    } catch (err) {
      const fallback = 'radial-gradient(ellipse at top, rgba(0, 0, 0, 0) 0%, transparent 100%)';
      colorCache.set(posterPath, fallback);
      applyBackdropGradient(fallback);
    }
  }, 250);
}
