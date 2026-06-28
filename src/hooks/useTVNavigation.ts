import { useEffect, useState } from 'react';
import { isTVMode } from '../utils/tv';

export function useTVNavigation() {
  const [tvMode] = useState(isTVMode);

  useEffect(() => {
    if (!tvMode) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
      if (!keys.includes(e.key)) return;

      const focusableElements = Array.from(
        document.querySelectorAll('.tv-focusable, [tabindex="0"]')
      ).filter((el) => {
        // Must be visible and not disabled
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          !(el as any).disabled
        );
      }) as HTMLElement[];

      if (focusableElements.length === 0) return;

      const activeEl = document.activeElement as HTMLElement | null;
      if (!activeEl || !focusableElements.includes(activeEl)) {
        // Focus the first element if none is active
        focusableElements[0].focus();
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

      for (const el of focusableElements) {
        if (el === activeEl) continue;

        const rect = el.getBoundingClientRect();
        const center = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        };

        const dx = center.x - activeCenter.x;
        const dy = center.y - activeCenter.y;

        let isMatch = false;
        let distance = 0;

        switch (e.key) {
          case 'ArrowLeft':
            isMatch = dx < -5; // Allow minor tolerance
            distance = Math.abs(dx) + Math.abs(dy) * 4;
            break;
          case 'ArrowRight':
            isMatch = dx > 5;
            distance = Math.abs(dx) + Math.abs(dy) * 4;
            break;
          case 'ArrowUp':
            isMatch = dy < -5;
            distance = Math.abs(dy) + Math.abs(dx) * 4;
            break;
          case 'ArrowDown':
            isMatch = dy > 5;
            distance = Math.abs(dy) + Math.abs(dx) * 4;
            break;
        }

        if (isMatch && distance < minDistance) {
          minDistance = distance;
          bestElement = el;
        }
      }

      if (bestElement) {
        bestElement.focus();
        bestElement.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tvMode]);

  return { isTVMode: tvMode };
}
