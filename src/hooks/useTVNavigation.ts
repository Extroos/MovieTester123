import { useEffect, useState } from 'react';
import { isTVMode } from '../utils/tv';

// ─────────────────────────────────────────────────────────────────────────────
// Focusable element cache — rebuilt by MutationObserver, NOT on every keypress.
// This eliminates the critical O(N²) DOM scan that was firing on every D-pad event.
// ─────────────────────────────────────────────────────────────────────────────
let cachedFocusables: HTMLElement[] = [];
let rebuildTimeout: any = null;

function isElementFocusable(el: HTMLElement): boolean {
  if (el.closest('.login-preview-panel') || el.tagName.toLowerCase() === 'iframe') return false;
  if ((el as any).disabled) return false;
  // Use offsetWidth and offsetHeight which are extremely fast layout indicators and DO NOT trigger reflow/layout thrashing!
  return el.offsetWidth > 0 || el.offsetHeight > 0;
}

function rebuildCache() {
  const query = document.querySelectorAll<HTMLElement>(
    '.tv-focusable, [data-scrubber="true"]'
  );
  cachedFocusables = Array.from(query).filter(isElementFocusable);
}

function scheduleRebuild() {
  if (rebuildTimeout) clearTimeout(rebuildTimeout);
  rebuildTimeout = setTimeout(() => {
    rebuildCache();
    rebuildTimeout = null;
  }, 150); // Debounce updates to batch multiple rapid DOM changes together
}

export function useTVNavigation() {
  const [tvMode, setTvMode] = useState(() => isTVMode());

  useEffect(() => {
    // Monitor document body changes to dynamically enable/disable TV D-pad mode
    const observer = new MutationObserver(() => {
      setTvMode(isTVMode());
    });
    if (typeof document !== 'undefined') {
      observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!tvMode) return;

    // Build initial focusable cache
    rebuildCache();

    const domObserver = new MutationObserver(() => scheduleRebuild());
    domObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      // NOTE: 'style' intentionally excluded — React updates inline styles on almost every
      // render (dynamic colors, scroll positions, focus indicators), causing the cache to
      // rebuild hundreds of times per second. Structural changes (class, tabindex, disabled)
      // are sufficient to detect focusability changes.
      attributeFilter: ['tabindex', 'disabled', 'class'],
    });

    const getActiveOverlay = (): Element | null => {
      const activeDetails = document.querySelector('.movie-details-overlay, .tvshow-details-overlay');
      const activeSearch = document.querySelector('.search-overlay-container, .search-results-container');
      const activeSettings = document.querySelector('.player-settings-overlay');
      const activeVideoPlayer = document.querySelector('.video-player-overlay');
      const activeSettingsContainer = document.querySelector('.tv-settings-container');
      const activeActor = document.querySelector('.tv-actor-page-overlay');
      const activeModal = document.querySelector('.tv-modal-container') ||
                          document.querySelector('[style*="z-index: 4000"]') ||
                          document.querySelector('[style*="z-index: 6000"]') ||
                          document.querySelector('[style*="z-index: 6001"]');
      return activeModal || activeSettings || activeVideoPlayer || activeActor ||
             activeDetails || activeSearch || activeSettingsContainer ||
             document.querySelector('[style*="z-index: 200000"], [style*="z-index: 100000"]');
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
      if (!keys.includes(e.key)) return;

      // When an overlay is active, restrict scope to elements inside it — rebuild synchronously
      const activeOverlay = getActiveOverlay();
      let focusableElements: HTMLElement[];
      if (activeOverlay) {
        const q = activeOverlay.querySelectorAll<HTMLElement>('.tv-focusable, [data-scrubber="true"]');
        focusableElements = Array.from(q).filter(isElementFocusable);
      } else {
        focusableElements = cachedFocusables;
      }

      if (focusableElements.length === 0) return;

      const activeEl = document.activeElement as HTMLElement | null;
      if (!activeEl || !focusableElements.includes(activeEl)) {
        const currentActiveLink = document.querySelector('.cinemovie-header-nav-btn.active.tv-focusable') as HTMLElement | null;
        if (currentActiveLink && focusableElements.includes(currentActiveLink)) {
          currentActiveLink.focus();
        } else {
          focusableElements[0].focus();
        }
        e.preventDefault();
        return;
      }

      const activeRect = activeEl.getBoundingClientRect();
      const activeCenter = {
        x: activeRect.left + activeRect.width / 2,
        y: activeRect.top + activeRect.height / 2,
      };

      let bestElement: HTMLElement | null = null;
      let minDistance = Infinity;

      const isHeaderEl = (el: HTMLElement) =>
        !!el.closest('header') ||
        el.classList.contains('cinemovie-header-nav-btn') ||
        el.classList.contains('cinemovie-header-profile-btn') ||
        el.classList.contains('cinemovie-header-search-btn');

      const isActiveHeader = isHeaderEl(activeEl);
      const isActiveHeroCard = activeEl.classList.contains('tv-hero-card');
      const isActiveContentCard = activeEl.classList.contains('movie-card') ||
                                   activeEl.classList.contains('search-grid-card') ||
                                   activeEl.classList.contains('search-result-row');

      for (const el of focusableElements) {
        if (el === activeEl) continue;

        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;

        const center = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        };

        const dx = center.x - activeCenter.x;
        const dy = center.y - activeCenter.y;

        let isMatch = false;
        let distance = 0;

        const hasXOverlap = (rect.left <= activeRect.right && rect.right >= activeRect.left) ||
                            (activeRect.left <= rect.right && activeRect.right >= rect.left);
        const hasYOverlap = (rect.top <= activeRect.bottom && rect.bottom >= activeRect.top) ||
                            (activeRect.top <= rect.bottom && activeRect.bottom >= rect.top);

        // Prevent moving into the header from body cards via left/right
        if (isHeaderEl(el) && !isActiveHeader && e.key !== 'ArrowUp') continue;

        const isTargetContentCard = el.classList.contains('movie-card') ||
                                    el.classList.contains('search-grid-card') ||
                                    el.classList.contains('search-result-row');
        const requireYOverlap = isActiveContentCard && isTargetContentCard;

        switch (e.key) {
          case 'ArrowLeft':
            isMatch = dx < -5 && (!requireYOverlap || hasYOverlap);
            distance = Math.abs(dx) + Math.abs(dy) * (hasYOverlap ? 1 : 5);
            break;
          case 'ArrowRight':
            isMatch = dx > 5 && (!requireYOverlap || hasYOverlap);
            distance = Math.abs(dx) + Math.abs(dy) * (hasYOverlap ? 1 : 5);
            break;
          case 'ArrowUp':
            isMatch = dy < -5;
            if (isHeaderEl(el) && !isActiveHeroCard) {
              const heroCard = document.querySelector('.tv-hero-card') as HTMLElement | null;
              const hasHeroCardOnPage = heroCard && heroCard.offsetParent !== null;
              if (hasHeroCardOnPage) {
                isMatch = false;
              } else {
                distance = Math.abs(dy) + Math.abs(dx) * (hasXOverlap ? 0.3 : 6);
              }
            } else {
              distance = Math.abs(dy) + Math.abs(dx) * (hasXOverlap ? 0.3 : 6);
            }
            break;
          case 'ArrowDown':
            isMatch = dy > 5;
            distance = Math.abs(dy) + Math.abs(dx) * (hasXOverlap ? 0.3 : 6);
            break;
        }

        if (isMatch && distance < minDistance) {
          minDistance = distance;
          bestElement = el;
        }
      }

      if (bestElement) {
        bestElement.focus();

        const isHeroOrHeader =
          bestElement.classList.contains('tv-hero-card') ||
          !!bestElement.closest('header') ||
          bestElement.classList.contains('cinemovie-header-nav-btn') ||
          bestElement.classList.contains('cinemovie-header-profile-btn') ||
          bestElement.classList.contains('cinemovie-header-search-btn');

        if (isHeroOrHeader) {
          const scrollContainer = bestElement.closest('[style*="overflow-y: auto"]') || document.documentElement;
          const startScrollTop = scrollContainer.scrollTop;
          if (startScrollTop > 0) {
            const duration = 250;
            const startTime = performance.now();
            const animateScroll = (currentTime: number) => {
              const elapsed = currentTime - startTime;
              const progress = Math.min(elapsed / duration, 1);
              const easeProgress = progress * (2 - progress);
              scrollContainer.scrollTop = startScrollTop * (1 - easeProgress);
              if (progress < 1) requestAnimationFrame(animateScroll);
            };
            requestAnimationFrame(animateScroll);
          }
        } else {
          // Defer to next frame — avoids blocking the current paint
          requestAnimationFrame(() => {
            bestElement!.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
          });
        }
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      domObserver.disconnect();
      cachedFocusables = [];
    };
  }, [tvMode]);

  return { isTVMode: tvMode };
}

