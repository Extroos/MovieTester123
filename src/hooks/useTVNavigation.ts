import { useEffect, useState } from 'react';
import { isTVMode } from '../utils/tv';

// TV Mode Focus Memory Store
let lastFocusedHeaderElement: HTMLElement | null = null;
const lastFocusedCardIndexPerRow = new Map<string, number>();

function isHeaderEl(el: HTMLElement): boolean {
  return (
    !!el.closest('header') ||
    el.classList.contains('cinemovie-header-nav-btn') ||
    el.classList.contains('cinemovie-header-profile-btn') ||
    el.classList.contains('cinemovie-header-search-btn')
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Focusable element cache — rebuilt by MutationObserver, NOT on every keypress.
// ─────────────────────────────────────────────────────────────────────────────
let cachedFocusables: HTMLElement[] = [];
let rebuildTimeout: any = null;
let activeScrollAnimationId: number | null = null;

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
  }, 40); // 40ms debounce to track style visibility swaps dynamically without lagging the D-pad
}

function findScrollContainer(el: HTMLElement): HTMLElement {
  let parent = el.parentElement;
  while (parent) {
    if (
      parent.classList.contains('home-container') ||
      parent.classList.contains('tv-scroll-container') ||
      parent.classList.contains('settings-container') ||
      parent.classList.contains('profile-selector-container') ||
      parent.classList.contains('downloads-container') ||
      parent.style.overflowY === 'auto' ||
      parent.style.overflowY === 'scroll'
    ) {
      return parent;
    }
    parent = parent.parentElement;
  }
  return document.documentElement;
}

function smoothScrollTo(container: HTMLElement, targetScrollTop: number, duration: number = 220) {
  if (activeScrollAnimationId !== null) {
    cancelAnimationFrame(activeScrollAnimationId);
  }
  
  const start = container.scrollTop;
  const change = targetScrollTop - start;
  const startTime = performance.now();
  
  function animate(currentTime: number) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const ease = progress * (2 - progress); // EaseOutQuad
    container.scrollTop = start + change * ease;
    
    if (progress < 1) {
      activeScrollAnimationId = requestAnimationFrame(animate);
    } else {
      activeScrollAnimationId = null;
    }
  }
  activeScrollAnimationId = requestAnimationFrame(animate);
}

export function useTVNavigation() {
  const [tvMode, setTvMode] = useState(() => isTVMode());

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setTvMode(isTVMode());
    });
    if (typeof document !== 'undefined') {
      observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    // Enable D-pad navigation if tvMode is active OR if the first-run Display Experience Selector is active
    const isFirstRunSelectorActive = typeof document !== 'undefined' && !!document.querySelector('button.tv-focusable');
    if (!tvMode && !isFirstRunSelectorActive) return;

    const triggerInitialFocus = () => {
      if (typeof document === 'undefined') return;
      const activeEl = document.activeElement;
      if (!activeEl || activeEl === document.body) {
        const activeTab = document.querySelector('.cinemovie-header-nav-btn.active.tv-focusable') as HTMLElement | null;
        if (activeTab && isElementFocusable(activeTab)) {
          activeTab.focus();
        } else if (cachedFocusables.length > 0) {
          cachedFocusables[0].focus();
        }
      }
    };

    rebuildCache();
    triggerInitialFocus();

    const domObserver = new MutationObserver(() => {
      scheduleRebuild();
      // Auto-restore focus if lost during page transition mutations
      setTimeout(triggerInitialFocus, 50);
    });
    domObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['tabindex', 'disabled', 'class', 'style'],
    });

    const getActiveOverlay = (): Element | null => {
      const activeDetails = document.querySelector('.movie-details-overlay, .tvshow-details-overlay');
      const activeSearch = document.querySelector('.search-overlay-container, .search-results-container');
      const activeCategoryExplorer = document.querySelector('.category-explorer-overlay');
      const activeSettings = document.querySelector('.player-settings-overlay');
      const activeVideoPlayer = document.querySelector('.video-player-overlay');
      const activeSettingsContainer = document.querySelector('.tv-settings-container');
      const activeActor = document.querySelector('.tv-actor-page-overlay');
      const activeModal = document.querySelector('.tv-modal-container') ||
                          document.querySelector('[style*="z-index: 4000"]') ||
                          document.querySelector('[style*="z-index: 6000"]') ||
                          document.querySelector('[style*="z-index: 6001"]');
      return activeModal || activeSettings || activeVideoPlayer || activeActor ||
             activeDetails || activeSearch || activeSettingsContainer || activeCategoryExplorer ||
             document.querySelector('[style*="z-index: 200000"], [style*="z-index: 100000"]');
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
      if (!keys.includes(e.key)) return;

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
      if (activeEl && isHeaderEl(activeEl) && e.key === 'ArrowDown') {
        const optionsBtn = document.querySelector('.downloads-options-btn') as HTMLElement | null;
        if (optionsBtn) {
          optionsBtn.focus();
          e.preventDefault();
          return;
        }
      }

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


      // Optimize D-pad search space to prevent browser layout reflow/thrashing on slow TV processors
      let targetFocusables = focusableElements;
      const activeRow = activeEl.closest('.content-row-scroll');
      if (activeRow) {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          // Horizontal moves: search ONLY siblings inside the active row scroll container
          targetFocusables = focusableElements.filter(el => el.closest('.content-row-scroll') === activeRow);
        } else {
          // Vertical moves (ArrowUp or ArrowDown):
          const rowContainers = Array.from(document.querySelectorAll('.content-row-container'));
          const activeRowContainer = activeEl.closest('.content-row-container') as HTMLElement | null;
          const activeRowIndex = activeRowContainer ? rowContainers.indexOf(activeRowContainer) : -1;
          
          let targetRowIndex = -1;
          if (activeRowIndex !== -1) {
            targetRowIndex = e.key === 'ArrowUp' ? activeRowIndex - 1 : activeRowIndex + 1;
          }

          targetFocusables = focusableElements.filter(el => {
            const elRowContainer = el.closest('.content-row-container') as HTMLElement | null;
            
            // If the element belongs to a row container:
            if (elRowContainer) {
              const elRowIndex = rowContainers.indexOf(elRowContainer);
              // If there is an adjacent target row, strictly only allow elements inside it
              if (targetRowIndex >= 0 && targetRowIndex < rowContainers.length) {
                return elRowIndex === targetRowIndex;
              }
              // If there is no target row index (e.g. going up from row 0), allow index 0 elements
              return elRowIndex === activeRowIndex;
            }

            // If going up from topmost row index 0, allow hero card and header
            if (e.key === 'ArrowUp' && activeRowIndex === 0) {
              return el.classList.contains('tv-hero-card') || isHeaderEl(el);
            }

            // Otherwise, block hero card/header to prevent skipping rows
            return false;
          });
        }
      }

      const isActiveHeader = isHeaderEl(activeEl);
      const isActiveHeroCard = activeEl.classList.contains('tv-hero-card');
      const isActiveContentCard = activeEl.classList.contains('movie-card') ||
                                   activeEl.classList.contains('search-grid-card') ||
                                   activeEl.classList.contains('search-result-row');

      for (const el of targetFocusables) {
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
              const heroCards = Array.from(document.querySelectorAll('.tv-hero-card'));
              const visibleHeroCard = heroCards.find(hc => (hc as HTMLElement).offsetParent !== null) as HTMLElement | null;
              const hasHeroCardOnPage = !!visibleHeroCard;
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
        // 1. Content Row Focus Memory override (only when moving vertically between rows)
        const isVerticalMove = e.key === 'ArrowUp' || e.key === 'ArrowDown';
        if (isVerticalMove) {
          const bestRowContainer = bestElement.closest('.content-row-container') as HTMLElement | null;
          if (bestRowContainer) {
            const rowTitleEl = bestRowContainer.querySelector('h2');
            const rowTitle = rowTitleEl ? rowTitleEl.textContent || '' : '';
            if (rowTitle) {
              const savedCardIndex = lastFocusedCardIndexPerRow.get(rowTitle);
              const cardsInTargetRow = Array.from(bestRowContainer.querySelectorAll('.movie-card.tv-focusable')) as HTMLElement[];
              if (savedCardIndex !== undefined) {
                if (cardsInTargetRow[savedCardIndex]) {
                  bestElement = cardsInTargetRow[savedCardIndex];
                } else if (cardsInTargetRow.length > 0) {
                  bestElement = cardsInTargetRow[0];
                }
              } else {
                // Stabilizer: Default to the very first movie card (index 0) if the row hasn't been visited yet
                if (cardsInTargetRow.length > 0) {
                  bestElement = cardsInTargetRow[0];
                }
              }
            }
          }
        }

        // 2. Header Focus Memory override (only when entering the header from outside)
        const isActiveHeader = activeEl ? isHeaderEl(activeEl) : false;
        if (!isActiveHeader && isHeaderEl(bestElement) && lastFocusedHeaderElement && focusableElements.includes(lastFocusedHeaderElement)) {
          bestElement = lastFocusedHeaderElement;
        }

        bestElement.focus();

        const isHeroOrHeader =
          bestElement.classList.contains('tv-hero-card') ||
          !!bestElement.closest('header') ||
          bestElement.classList.contains('cinemovie-header-nav-btn') ||
          bestElement.classList.contains('cinemovie-header-profile-btn') ||
          bestElement.classList.contains('cinemovie-header-search-btn');

        if (isHeroOrHeader) {
          const scrollContainer = findScrollContainer(bestElement);
          smoothScrollTo(scrollContainer, 0, 200);
        } else {
          const container = findScrollContainer(bestElement);
          const containerRect = container.getBoundingClientRect();
          const elRect = bestElement.getBoundingClientRect();
          
          const containerTop = container === document.documentElement ? 0 : containerRect.top;
          const elOffsetTop = elRect.top - containerTop + container.scrollTop;
          
          // If it is a download page card, align precisely in the vertical center of the viewport (50%), otherwise use 42%
          const isDownloadCard = bestElement.classList.contains('download-tv-card');
          const targetPercent = isDownloadCard ? 0.50 : 0.42;
          
          const targetScrollTop = elOffsetTop - (container.clientHeight * targetPercent) + (elRect.height / 2);
          const maxScroll = container.scrollHeight - container.clientHeight;
          const boundedTarget = Math.max(0, Math.min(maxScroll, targetScrollTop));
          
          smoothScrollTo(container, boundedTarget, 220);
        }
        e.preventDefault();
      }
    };

    // Remote Click Safety Net: simulates .click() on focused element on Enter/Space
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        const activeEl = document.activeElement as HTMLElement | null;
        if (activeEl && activeEl.classList.contains('tv-focusable')) {
          const isButtonOrInput = activeEl.tagName === 'BUTTON' || activeEl.tagName === 'INPUT' || activeEl.tagName === 'A';
          if (!isButtonOrInput) {
            e.preventDefault();
            e.stopPropagation();
            activeEl.click();
          }
        }
      }
    };

    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      if (isHeaderEl(target)) {
        lastFocusedHeaderElement = target;
      }

      // Hide/Show TV Header dynamically in Downloads Page
      if (target.classList.contains('download-tv-card')) {
        document.body.classList.add('header-hidden');
      } else if (target.classList.contains('downloads-options-btn') || isHeaderEl(target)) {
        document.body.classList.remove('header-hidden');
      }

      if (target.classList.contains('movie-card') && target.classList.contains('tv-focusable')) {
        const activeRowContainer = target.closest('.content-row-container') as HTMLElement | null;
        if (activeRowContainer) {
          const rowTitleEl = activeRowContainer.querySelector('h2');
          const rowTitle = rowTitleEl ? rowTitleEl.textContent || '' : '';
          if (rowTitle) {
            const cardsInRow = Array.from(activeRowContainer.querySelectorAll('.movie-card.tv-focusable'));
            const cardIndex = cardsInRow.indexOf(target);
            if (cardIndex !== -1) {
              lastFocusedCardIndexPerRow.set(rowTitle, cardIndex);
            }
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keypress', handleKeyPress);
    window.addEventListener('focusin', handleFocusIn);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keypress', handleKeyPress);
      window.removeEventListener('focusin', handleFocusIn);
      domObserver.disconnect();
      cachedFocusables = [];
      if (activeScrollAnimationId !== null) {
        cancelAnimationFrame(activeScrollAnimationId);
        activeScrollAnimationId = null;
      }
    };
  }, [tvMode]);

  return { isTVMode: tvMode };
}
