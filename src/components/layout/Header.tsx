import React, { useState, useEffect } from 'react';
import { Profile } from '../../services/profiles';
import { triggerHaptic } from '../../utils/haptics';
import { COLORS } from '../../constants';
import { t } from '../../utils/i18n';
import { GlobalDownloader, DownloadState } from '../../services/offline/GlobalDownloader';

type View = 'home' | 'movies' | 'tvshows' | 'newandhot' | 'mylist' | 'settings' | 'downloads';

interface HeaderProps {
  onSearchOpen: () => void;
  onDownloadsOpen: () => void;
  activeProfile: Profile | null;
  onSwitchProfile: () => void;
  hasActiveDownloads?: boolean;
  currentView?: View;
  onNavClick?: (view: View) => void;
  activeInviteToast?: any | null;
  onAcceptInvite?: (invite: any) => void;
  onDeclineInvite?: (invite: any) => void;
  activeSettingsSubPage?: 'streaming' | 'subtitles' | 'appearance' | 'account' | 'social' | 'statistics' | 'mylist' | null;
  onBackSettingsSubPage?: () => void;
  activeNewsGenre?: number | null;
  onBackNewsGenre?: () => void;
}

function Header({
  onSearchOpen,
  onDownloadsOpen,
  activeProfile,
  onSwitchProfile,
  hasActiveDownloads = false,
  currentView = 'home',
  onNavClick,
  activeInviteToast = null,
  onAcceptInvite,
  onDeclineInvite,
  activeSettingsSubPage = null,
  onBackSettingsSubPage,
  activeNewsGenre = null,
  onBackNewsGenre,
}: HeaderProps) {
  const [isTVMode, setIsTVMode] = useState(() => {
    if (typeof document !== 'undefined') {
      return document.body.classList.contains('tv-mode');
    }
    return false;
  });
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [isScrolled, setIsScrolled] = useState(false);
  const headerRef = React.useRef<HTMLElement>(null);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      if (typeof document !== 'undefined') {
        setIsTVMode(document.body.classList.contains('tv-mode'));
      }
    });
    if (typeof document !== 'undefined') {
      observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }
    return () => observer.disconnect();
  }, []);

  const [downloadState, setDownloadState] = useState<DownloadState>(() => GlobalDownloader.getState());

  useEffect(() => {
    return GlobalDownloader.subscribe((state) => {
      setDownloadState(state);
    });
  }, []);

  useEffect(() => {
    let resizeTimer: ReturnType<typeof setTimeout>;
    const handleResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => setIsMobile(window.innerWidth <= 768), 150);
    };
    window.addEventListener('resize', handleResize, { passive: true });
    return () => {
      clearTimeout(resizeTimer);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  useEffect(() => {
    let rafId: number;
    const handleScroll = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target && target.scrollWidth > target.clientWidth && target.scrollHeight <= target.clientHeight) {
        return;
      }
      // Ignore scroll events from disconnected or hidden (display: none) tab containers
      if (target && (target.isConnected === false || (target.style && window.getComputedStyle(target).display === 'none'))) {
        return;
      }
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const scrollTop = target.scrollTop ?? window.scrollY;
        setIsScrolled(scrollTop > 20);
      });
    };
    
    // Listen to scroll events globally using capturing mode so sibling/child overflow scroll containers trigger it
    window.addEventListener('scroll', handleScroll, { passive: true, capture: true });

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', handleScroll, { capture: true });
    };
  }, []);

  // Reset scroll detection when page view changes to ensure header starts visible
  useEffect(() => {
    setIsScrolled(false);
  }, [currentView]);

  // TV focus-restoration: keeps focus on the active tab button when switching views
  useEffect(() => {
    if (isTVMode && currentView) {
      // Setup a fast interval to repeatedly try claiming focus over 400ms.
      // This handles varying render lag times when subpages mount their layouts in the background.
      let count = 0;
      const interval = setInterval(() => {
        const activeBtn = document.getElementById(`tv-nav-link-${currentView}`);
        if (activeBtn) {
          activeBtn.focus();
          clearInterval(interval);
        }
        count++;
        if (count > 8) {
          clearInterval(interval);
        }
      }, 50);
      
      return () => clearInterval(interval);
    }
  }, [currentView, isTVMode]);

  const handleLinkClick = (view: View) => {
    triggerHaptic('light');
    onNavClick?.(view);
  };

  const navLinks: { id: View; key: string; customLabel?: string }[] = isTVMode ? [
    { id: 'home', key: 'home' },
    { id: 'movies', key: 'movies' },
    { id: 'tvshows', key: 'series' },
    { id: 'newandhot', key: 'new' },
    { id: 'downloads', key: 'downloads', customLabel: 'Offline' },
    { id: 'settings', key: 'profile' }
  ] : [
    { id: 'home', key: 'home' },
    { id: 'movies', key: 'movies' },
    { id: 'tvshows', key: 'series' },
    { id: 'newandhot', key: 'new' },
    { id: 'mylist', key: 'watchlist' },
    { id: 'settings', key: 'profile' }
  ];

  return (
    <header
      ref={headerRef}
      className={`cinemovie-header ${isTVMode ? 'tv-horizontal-header' : ''}`}
      style={isTVMode ? {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: '68px',
        background: 'linear-gradient(to bottom, rgba(4,4,5,0.9) 0%, rgba(4,4,5,0.3) 70%, transparent 100%)',
        zIndex: 500,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 40px',
        boxSizing: 'border-box',
        border: 'none',
        borderRadius: 0,
        boxShadow: 'none',
        transform: (isScrolled && ['home', 'movies', 'tvshows'].includes(currentView)) ? 'translateY(-100%)' : 'translateY(0)',
        transition: 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), background 0.3s ease',
      } : {
        position: 'fixed',
        top: 'calc(12px + env(safe-area-inset-top, 0px))',
        left: '12px',
        right: '12px',
        height: (() => {
          const hasActiveDownloadMobile = isMobile && downloadState.isDownloading;
          if (activeInviteToast) {
            return isMobile ? '120px' : '112px';
          }
          if (hasActiveDownloadMobile) {
            return '92px';
          }
          return '60px';
        })(),
        background: isScrolled || activeInviteToast || (isMobile && downloadState.isDownloading)
          ? 'rgba(10, 10, 12, 0.83)'
          : 'rgba(4, 4, 5, 0.35)',
        backdropFilter: 'saturate(180%) blur(24px)',
        WebkitBackdropFilter: 'saturate(180%) blur(24px)',
        border: isScrolled || activeInviteToast || (isMobile && downloadState.isDownloading)
          ? '1px solid rgba(255, 255, 255, 0.09)'
          : '1px solid rgba(255, 255, 255, 0.05)',
        borderRadius: '20px',
        boxShadow: isScrolled || activeInviteToast || (isMobile && downloadState.isDownloading)
          ? '0 12px 40px rgba(0, 0, 0, 0.6)'
          : '0 4px 24px rgba(0, 0, 0, 0.35)',
        zIndex: 500,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '0 16px',
        transition: 'height 0.4s cubic-bezier(0.16, 1, 0.3, 1), background 0.3s ease, border 0.3s ease, box-shadow 0.3s ease, backdrop-filter 0.3s ease, -webkit-backdrop-filter 0.3s ease',
        overflow: 'hidden',
        transform: 'translate3d(0, 0, 0)',
      }}
    >
      {isTVMode ? (
        /* Netflix Horizontal TV Mode Layout */
        <div style={{ display: 'flex', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'space-between' }}>
          
          {/* Left: Profile Indicator Avatar + Watchlist + Search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            {activeProfile && (
              <button
                onClick={() => { triggerHaptic('light'); onSwitchProfile(); }}
                className="cinemovie-header-profile-btn tv-horizontal-focusable tv-focusable"
                tabIndex={0}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '12px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0
                }}
              >
                <img
                  src={activeProfile.avatar}
                  alt={activeProfile.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '12px' }}
                />
              </button>
            )}

            {/* Watchlist icon button */}
            <button
              onClick={() => { triggerHaptic('light'); onNavClick?.('mylist'); }}
              aria-label="My List"
              className="cinemovie-header-search-btn tv-horizontal-focusable tv-focusable"
              tabIndex={0}
              style={{
                background: 'transparent',
                border: 'none',
                padding: '6px',
                color: currentView === 'mylist' ? '#ffffff' : 'rgba(255,255,255,0.75)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill={currentView === 'mylist' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              </svg>
            </button>
            
            {/* Search (Icon only matching photo search magnifier position) */}
            <button
              onClick={() => { triggerHaptic('light'); onSearchOpen(); }}
              aria-label="Search"
              className="cinemovie-header-search-btn tv-horizontal-focusable tv-focusable"
              tabIndex={0}
              style={{
                background: 'transparent',
                border: 'none',
                padding: '6px',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>
          </div>


          {/* Center: Netflix Pill Navigation List */}
          <nav style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
            {navLinks.map((link) => {
              const isActive = currentView === link.id;
              return (
                <button
                  key={link.id}
                  id={`tv-nav-link-${link.id}`}
                  onClick={() => handleLinkClick(link.id)}
                  className={`cinemovie-header-nav-btn tv-horizontal-focusable tv-focusable ${isActive ? 'active' : ''}`}
                  tabIndex={0}
                  style={{
                    background: isActive ? '#ffffff' : 'transparent',
                    border: 'none',
                    borderRadius: '20px',
                    padding: isActive ? '6px 16px' : '6px 12px',
                    fontSize: '0.9rem',
                    fontWeight: isActive ? '700' : '500',
                    color: isActive ? '#000000' : 'rgba(255,255,255,0.7)',
                    cursor: 'pointer',
                    transition: 'none',
                    outline: 'none', // Remove default focus outline cube
                  }}
                  onFocus={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.color = '#ffffff';
                    }
                  }}
                  onBlur={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.color = 'rgba(255,255,255,0.7)';
                    }
                  }}
                >
                  {link.customLabel || t(link.key)}
                </button>
              );
            })}
          </nav>

          {/* Right: CineMovie Logo (Matching photo netflix right logo layout) */}
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <button
              onClick={() => handleLinkClick('home')}
              className="cinemovie-header-logo"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', outline: 'none', padding: 0 }}
            >
              <img src="/cinemovie-logo.png" alt="Cinemovie" style={{ height: '24px', width: 'auto', objectFit: 'contain' }} />
            </button>
          </div>

        </div>
      ) : (
        /* Horizontal Mobile/Desktop Mode Layout */
        <div style={{ display: 'flex', width: '100%', height: '60px', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          {/* Left: Logo & Pill Navigation */}
          <div
            className="cinemovie-header-left"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '20px',
              opacity: 1,
              maxWidth: '800px',
              overflow: 'visible',
              whiteSpace: 'nowrap',
              pointerEvents: 'auto',
              transition: 'opacity 0.2s ease'
            }}
          >
            {(currentView === 'settings' && activeSettingsSubPage) || (currentView === 'newandhot' && activeNewsGenre) ? (
              <button
                onClick={() => {
                  triggerHaptic('light');
                  if (currentView === 'settings') {
                    onBackSettingsSubPage?.();
                  } else {
                    onBackNewsGenre?.();
                  }
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  padding: '6px 6px 6px 0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'opacity 0.2s ease',
                  outline: 'none',
                  marginRight: '8px'
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="19" y1="12" x2="5" y2="12"></line>
                  <polyline points="12 19 5 12 12 5"></polyline>
                </svg>
              </button>
            ) : (
              <button
                onClick={() => handleLinkClick('home')}
                className="cinemovie-header-logo"
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  outline: 'none',
                  overflow: 'visible',
                  height: '100%',
                }}
              >
                <img
                  src="/cinemovie-logo.png"
                  alt="Cinemovie"
                  style={{
                    height: '35px',
                    width: 'auto',
                    objectFit: 'contain',
                    display: 'block',
                    marginLeft: '8px',
                    filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.4))',
                    position: 'relative',
                    zIndex: 1001,
                  }}
                />
              </button>
            )}

            {/* Desktop Navigation Links */}
            {!isMobile && onNavClick && (
              <>
                <div style={{ width: '1px', height: '18px', background: 'rgba(255,255,255,0.15)' }} />
                <nav style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  {navLinks.map((link) => {
                    const isActive = currentView === link.id;
                    return (
                      <button
                        key={link.id}
                        onClick={() => handleLinkClick(link.id)}
                        className={`cinemovie-header-nav-btn ${isActive ? 'active' : ''}`}
                      >
                        {t(link.key)}
                      </button>
                    );
                  })}
                </nav>
              </>
            )}
          </div>

          {/* Right: Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button
              onClick={() => { triggerHaptic('light'); onSearchOpen(); }}
              aria-label="Search"
              className="cinemovie-header-search-btn"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>

            {activeProfile && currentView !== 'settings' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {localStorage.getItem('cinemovie_is_guest') === 'true' && (
                  <span style={{
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: 'rgba(255, 255, 255, 0.8)',
                    fontSize: '0.65rem',
                    fontWeight: 800,
                    padding: '3px 8px',
                    borderRadius: '8px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>{t('guest')}</span>
                )}
                <button
                  onClick={() => { triggerHaptic('light'); onSwitchProfile(); }}
                  className="cinemovie-header-profile-btn"
                >
                  <img
                    src={activeProfile.avatar}
                    alt={activeProfile.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Expanded invitation details row */}
      {activeInviteToast && (
        <>
          <style>{`
            @keyframes headerInviteSlideIn {
              0% { opacity: 0; transform: translateY(-10px) scale(0.97); filter: blur(4px); }
              100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
            }
          `}</style>
          <div style={{
            display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            width: '100%', height: '48px', padding: '4px 0 8px 0', gap: '10px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            animation: 'headerInviteSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
            flexShrink: 0, overflow: 'hidden'
          }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', textAlign: 'left', flex: 1, minWidth: 0 }}>
              <div style={{
                width: '26px', height: '38px', borderRadius: '6px', overflow: 'hidden',
                background: 'rgba(255,255,255,0.03)', border: '1.5px solid rgba(255,255,255,0.12)',
                boxShadow: '0 4px 10px rgba(0,0,0,0.4)', flexShrink: 0
              }}>
                <img
                  src={activeInviteToast.data?.poster_path ? `https://image.tmdb.org/t/p/w200${activeInviteToast.data.poster_path}` : '/fallback-poster.jpg'}
                  alt="Poster"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '1px' }}>
                  <span style={{ display: 'inline-block', width: '5px', height: '5px', borderRadius: '50%', background: '#10b981' }} />
                  <span style={{ fontSize: '0.6rem', fontWeight: 800, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Watch Party invite</span>
                </div>
                <p style={{ margin: 0, fontSize: '0.74rem', fontWeight: 600, color: 'rgba(255,255,255,0.9)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {activeInviteToast.content}
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
              <button onClick={() => onAcceptInvite?.(activeInviteToast)} className="cinemovie-header-invite-join">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                Join
              </button>
              <button onClick={() => onDeclineInvite?.(activeInviteToast)} className="cinemovie-header-invite-decline">
                Decline
              </button>
            </div>
          </div>
        </>
      )}

      {/* Global Mobile Download Progress Bar */}
      {isMobile && downloadState.isDownloading && (() => {
        const isTV = downloadState.downloadId?.startsWith('tv_');
        const totalInQueue = downloadState.queueSize || 0;
        const itemTitle = downloadState.item 
          ? (downloadState.item.title || downloadState.item.name || 'Video') 
          : 'Video';

        let subtitleText = '';
        if (isTV && downloadState.downloadId) {
          const parts = downloadState.downloadId.split('_');
          if (parts.length >= 4) {
            subtitleText = `S${parts[2]}:E${parts[3]}`;
          }
        }

        return (
          <div style={{
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            padding: '2px 8px 8px 8px',
            boxSizing: 'border-box',
            animation: 'fadeIn 0.3s ease',
            flexShrink: 0
          }}>
            {/* Status Details */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flex: 1 }}>
                {downloadState.downloadProgress === 100 ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                ) : (
                  <div style={{ width: '10px', height: '10px', border: '1.8px solid rgba(255,255,255,0.2)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
                )}
                <span style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  color: 'rgba(255, 255, 255, 0.9)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: '65%'
                }}>
                  {downloadState.downloadProgress === 100 
                    ? 'Completed!' 
                    : `${itemTitle}${subtitleText ? ` (${subtitleText})` : ''}`}
                </span>
                {totalInQueue > 0 && downloadState.downloadProgress < 100 && (
                  <span style={{
                    fontSize: '0.62rem',
                    fontWeight: 900,
                    background: 'rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    padding: '1px 5px',
                    borderRadius: '4px',
                    letterSpacing: '0.02em',
                    whiteSpace: 'nowrap',
                    flexShrink: 0
                  }}>
                    +{totalInQueue} more
                  </span>
                )}
              </div>
              <span style={{
                fontSize: '0.68rem',
                fontWeight: 800,
                fontFamily: 'monospace',
                color: downloadState.downloadProgress === 100 ? '#22c55e' : '#ffffff',
                letterSpacing: '0.05em',
                flexShrink: 0
              }}>
                {downloadState.downloadProgress}%
              </span>
            </div>

            {/* Progress Slider */}
            <div style={{
              width: '100%',
              height: '4px',
              background: 'rgba(255, 255, 255, 0.08)',
              borderRadius: '2px',
              overflow: 'hidden'
            }}>
              <div style={{
                width: `${downloadState.downloadProgress}%`,
                height: '100%',
                background: downloadState.downloadProgress === 100 ? '#22c55e' : '#ffffff',
                transition: 'width 0.3s ease',
                borderRadius: '2px'
              }} />
            </div>
          </div>
        );
      })()}

      {/* Global TV Mode Download Progress Floating Panel */}
      {isTVMode && downloadState.isDownloading && (() => {
        const isTV = downloadState.downloadId?.startsWith('tv_');
        const totalInQueue = downloadState.queueSize || 0;
        const itemTitle = downloadState.item 
          ? (downloadState.item.title || downloadState.item.name || 'Video') 
          : 'Video';

        let subtitleText = '';
        if (isTV && downloadState.downloadId) {
          const parts = downloadState.downloadId.split('_');
          if (parts.length >= 4) {
            subtitleText = `S${parts[2]}:E${parts[3]}`;
          }
        }

        return (
          <>
            <style>{`
              @keyframes fadeInDown {
                from {
                  opacity: 0;
                  transform: translateY(-20px);
                }
                to {
                  opacity: 1;
                  transform: translateY(0);
                }
              }
            `}</style>
            <div style={{
              position: 'fixed',
              top: '80px',
              right: '40px',
              width: '320px',
              background: 'rgba(20, 20, 24, 0.96)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '16px',
              padding: '14px',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              zIndex: 2000,
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              animation: 'fadeInDown 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
            }}>
              {/* Title / Close status */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                {downloadState.downloadProgress === 100 ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                ) : (
                  <div style={{ width: '12px', height: '12px', border: '2px solid rgba(255,255,255,0.2)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
                )}
                <span style={{
                  fontSize: '0.8rem',
                  fontWeight: 800,
                  color: '#fff',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1
                }}>
                  {downloadState.downloadProgress === 100 
                    ? 'Completed!' 
                    : `${itemTitle}${subtitleText ? ` (${subtitleText})` : ''}`}
                </span>
                <span style={{ fontSize: '0.76rem', fontWeight: 900, color: downloadState.downloadProgress === 100 ? '#22c55e' : '#fff', fontFamily: 'monospace' }}>
                  {downloadState.downloadProgress}%
                </span>
              </div>

              {/* Queue info */}
              {totalInQueue > 0 && downloadState.downloadProgress < 100 && (
                <div style={{ fontSize: '0.68rem', color: '#ffb703', fontWeight: 700 }}>
                  Queue: +{totalInQueue} more episode{totalInQueue !== 1 ? 's' : ''} remaining
                </div>
              )}

              {/* Progress Slider */}
              <div style={{
                width: '100%',
                height: '5px',
                background: 'rgba(255, 255, 255, 0.08)',
                borderRadius: '2.5px',
                overflow: 'hidden'
              }}>
                <div style={{
                  width: `${downloadState.downloadProgress}%`,
                  height: '100%',
                  background: downloadState.downloadProgress === 100 ? '#22c55e' : '#ffffff',
                  transition: 'width 0.3s ease',
                  borderRadius: '2.5px'
                }} />
              </div>

              {/* Footer hint */}
              <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600, textAlign: 'right' }}>
                Downloading natively…
              </div>
            </div>
          </>
        );
      })()}
    </header>
  );
}

export default React.memo(Header);
