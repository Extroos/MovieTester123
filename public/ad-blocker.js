// Fast, non-mutating ad-blocker and popup preventer
(function() {
  'use strict';
  
  // 1. Block window.open popups silently at the global payload level
  window.open = function() {
    console.debug('[AdBlocker] Blocked window.open attempt');
    return null;
  };

  // 2. Suppress blocking dialogs from embedded players
  window.alert = () => { console.debug('[AdBlocker] Blocked alert'); };
  window.confirm = () => { console.debug('[AdBlocker] Blocked confirm'); return true; };
  window.prompt = () => { console.debug('[AdBlocker] Blocked prompt'); return null; };

  // 3. Prevent suspicious click-jacks mapping to new tabs
  document.addEventListener('click', function(e) {
    const target = e.target;
    if (target && target.tagName === 'A' && target.getAttribute('target') === '_blank') {
       if (!target.closest('[data-allow-external]')) {
          e.preventDefault();
          console.debug('[AdBlocker] Prevented suspicious new tab navigation');
       }
    }
  }, { capture: true, passive: false });

  // Note: We deliberately removed the setInterval DOM mutation script
  // (querySelectorAll('.ad').remove()) because deleting nodes outside of
  // React's Virtual DOM causes fatal UI crashes during re-renders.
  // Instead, visual ads should be hidden via CSS displays if absolutely necessary.
  const style = document.createElement('style');
  style.textContent = `
    [id*="ad-banner"], [class*="ad-container"] { display: none !important; opacity: 0 !important; pointer-events: none !important; }
  `;
  document.head.appendChild(style);

  console.log('Safe Ad & Popup Blocker Active');
})();
