import React, { useState, useEffect } from 'react';
import { Profile } from '../../services/profiles';
import { triggerHaptic } from '../../utils/haptics';
import { COLORS } from '../../constants';
import { t } from '../../utils/i18n';

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
  onBackNewsGenre
}: HeaderProps) {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [isScrolled, setIsScrolled] = useState(false);
  const headerRef = React.useRef<HTMLElement>(null);

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
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const scrollTop = target.scrollTop ?? window.scrollY;
        setIsScrolled(scrollTop > 20);
      });
    };
    
    // Find closest ancestor scrollable container or default parent
    const scrollParent = headerRef.current?.closest('[style*="overflow-y: auto"]') || headerRef.current?.parentElement;
    
    if (scrollParent) {
      scrollParent.addEventListener('scroll', handleScroll, { passive: true });
    }
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      cancelAnimationFrame(rafId);
      if (scrollParent) {
        scrollParent.removeEventListener('scroll', handleScroll);
      }
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const handleLinkClick = (view: View) => {
    triggerHaptic('light');
    onNavClick?.(view);
  };

  const navLinks: { id: View; key: string }[] = [
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
      className="cinemovie-header"
      style={{
        position: 'fixed',
        top: 'calc(12px + env(safe-area-inset-top, 0px))',
        left: '12px',
        right: '12px',
        height: activeInviteToast ? (isMobile ? '120px' : '112px') : '60px',
        background: isScrolled || activeInviteToast
          ? 'rgba(4, 4, 5, 0.88)'
          : 'rgba(4, 4, 5, 0.35)',
        backdropFilter: 'saturate(180%) blur(16px)',
        WebkitBackdropFilter: 'saturate(180%) blur(16px)',
        border: isScrolled || activeInviteToast
          ? '1px solid rgba(255, 255, 255, 0.09)'
          : '1px solid rgba(255, 255, 255, 0.05)',
        borderRadius: '20px',
        boxShadow: isScrolled || activeInviteToast
          ? '0 12px 40px rgba(0, 0, 0, 0.6)'
          : '0 4px 24px rgba(0, 0, 0, 0.35)',
        zIndex: 500,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '0 16px',
        transition: 'height 0.4s cubic-bezier(0.16, 1, 0.3, 1), background 0.3s ease, border 0.3s ease, box-shadow 0.3s ease',
        overflow: 'hidden',
        transform: 'translate3d(0, 0, 0)',
      }}
    >
      {/* Main Top Header 60px Row */}
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
    </header>
  );
}

export default React.memo(Header);
