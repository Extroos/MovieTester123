import React, { useState, useEffect, useRef } from 'react';
import { Profile } from '../../services/profiles';
import { triggerHaptic } from '../../utils/haptics';
import { COLORS } from '../../constants';

type View = 'home' | 'movies' | 'tvshows' | 'newandhot' | 'mylist' | 'settings' | 'downloads';

interface HeaderProps {
  onSearchOpen: () => void;
  onDownloadsOpen: () => void;
  activeProfile: Profile | null;
  onSwitchProfile: () => void;
  hasActiveDownloads?: boolean;
  
  // Navigation props
  currentView?: View;
  onNavClick?: (view: View) => void;

  // Real-time Watch Together invitation
  activeInviteToast?: any | null;
  onAcceptInvite?: (invite: any) => void;
  onDeclineInvite?: (invite: any) => void;
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
  onDeclineInvite
}: HeaderProps) {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [isScrolled, setIsScrolled] = useState(false);

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
    const handleScroll = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        setIsScrolled(window.scrollY > 20);
      });
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const handleLinkClick = (view: View) => {
    triggerHaptic('light');
    onNavClick?.(view);
  };

  const navLinks: { id: View; label: string }[] = [
    { id: 'home', label: 'Home' },
    { id: 'movies', label: 'Movies' },
    { id: 'tvshows', label: 'Series' },
    { id: 'newandhot', label: 'New' },
    { id: 'mylist', label: 'List' },
    { id: 'settings', label: 'Profile' }
  ];

  return (
    <header
      className="cinemovie-header"
      style={{
        position: 'fixed',
        top: 'calc(12px + env(safe-area-inset-top, 0px))',
        left: '12px',
        right: '12px',
        height: activeInviteToast ? (isMobile ? '120px' : '112px') : '60px',
        background: isScrolled || activeInviteToast ? 'rgba(10, 10, 10, 0.96)' : 'rgba(15, 15, 15, 0.5)',
        backdropFilter: 'blur(30px) saturate(190%)',
        WebkitBackdropFilter: 'blur(30px) saturate(190%)',
        border: '1px solid rgba(255, 255, 255, 0.09)',
        borderRadius: '20px',
        boxShadow: isScrolled || activeInviteToast ? '0 12px 40px rgba(0, 0, 0, 0.6)' : '0 4px 16px rgba(0, 0, 0, 0.2)',
        zIndex: 500,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '0 16px',
        transition: 'height 0.4s cubic-bezier(0.16, 1, 0.3, 1), background 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease',
        overflow: 'hidden'
      }}
    >
      {/* Main Top Header 60px Row */}
      <div style={{ display: 'flex', width: '100%', height: '60px', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        {/* Left: Logo & State-of-the-art Pill Navigation */}
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
              height: '125px',
              width: 'auto',
              objectFit: 'contain',
              display: 'block',
              marginTop: '-38px',
              marginBottom: '-38px',
              marginLeft: '-24px', /* Overcomes empty transparent margin on left of asset */
              transform: 'translateY(2px)', /* Compenses for transparent asset padding to center visually */
              filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.5))',
              position: 'relative',
              zIndex: 1001,
            }}
          />
        </button>

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
                    style={{
                      background: isActive ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                      border: isActive ? '1px solid rgba(255, 255, 255, 0.05)' : '1px solid transparent',
                      borderRadius: '8px',
                      color: isActive ? '#FFFFFF' : 'rgba(255, 255, 255, 0.6)',
                      fontSize: '0.8rem',
                      fontWeight: isActive ? 800 : 550,
                      cursor: 'pointer',
                      padding: '5px 12px',
                      transition: 'all 0.2s ease',
                      outline: 'none',
                      letterSpacing: '0.1px'
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.color = '#FFFFFF';
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.color = 'rgba(255, 255, 255, 0.6)';
                        e.currentTarget.style.background = 'transparent';
                      }
                    }}
                  >
                    {link.label}
                  </button>
                );
              })}
            </nav>
          </>
        )}
      </div>

      {/* Right: Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        {/* Search Button */}
        <button
          onClick={() => { triggerHaptic('light'); onSearchOpen(); }}
          aria-label="Search"
          style={{
            background: 'transparent',
            border: 'none',
            color: '#FFFFFF',
            cursor: 'pointer',
            padding: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'transform 0.2s ease, opacity 0.2s ease',
            opacity: 0.9,
            outline: 'none'
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'scale(1.05)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.9'; e.currentTarget.style.transform = 'scale(1)'; }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>

        {/* Profile Avatar */}
        {activeProfile && currentView !== 'settings' && (
          <button
            onClick={() => { triggerHaptic('light'); onSwitchProfile(); }}
            style={{
              background: 'transparent',
              border: '2px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '6px',
              width: '36px',
              height: '36px',
              cursor: 'pointer',
              padding: 0,
              overflow: 'hidden',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              outline: 'none',
              marginLeft: '8px'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#FFFFFF'; e.currentTarget.style.transform = 'scale(1.05)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)'; e.currentTarget.style.transform = 'scale(1)'; }}
          >
            <img 
              src={activeProfile.avatar} 
              alt={activeProfile.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </button>
        )}
      </div>
    </div>

      {/* Expanded invitation details row */}
      {activeInviteToast && (
        <>
          <style>{`
            @keyframes headerInviteSlideIn {
              0% {
                opacity: 0;
                transform: translateY(-10px) scale(0.97);
                filter: blur(4px);
              }
              100% {
                opacity: 1;
                transform: translateY(0) scale(1);
                filter: blur(0);
              }
            }
          `}</style>
          <div style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            height: '48px',
            padding: '4px 0 8px 0',
            gap: '10px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            animation: 'headerInviteSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
            flexShrink: 0,
            overflow: 'hidden'
          }}>
            {/* Left: Poster and Text */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', textAlign: 'left', flex: 1, minWidth: 0 }}>
              <div style={{
                width: '26px',
                height: '38px',
                borderRadius: '6px',
                overflow: 'hidden',
                background: 'rgba(255,255,255,0.03)',
                border: '1.5px solid rgba(255,255,255,0.12)',
                boxShadow: '0 4px 10px rgba(0,0,0,0.4)',
                flexShrink: 0
              }}>
                <img
                  src={activeInviteToast.data?.poster_path ? `https://image.tmdb.org/t/p/w200${activeInviteToast.data.poster_path}` : '/fallback-poster.jpg'}
                  alt="Poster"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '1px' }}>
                  <span style={{ display: 'inline-block', width: '5px', height: '5px', borderRadius: '50%', background: '#10b981', animation: 'ping 1.5s infinite alternate' }} />
                  <span style={{ fontSize: '0.6rem', fontWeight: 800, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Watch Party invite</span>
                </div>
                <p style={{ margin: 0, fontSize: '0.74rem', fontWeight: 600, color: 'rgba(255,255,255,0.9)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {activeInviteToast.content}
                </p>
              </div>
            </div>

            {/* Right: Actions */}
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
              <button
                onClick={() => onAcceptInvite?.(activeInviteToast)}
                style={{
                  background: '#ffffff',
                  color: '#000000',
                  border: 'none',
                  borderRadius: '16px',
                  padding: '5px 12px',
                  fontSize: '0.7rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(255,255,255,0.18)',
                  whiteSpace: 'nowrap',
                  transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '3px'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.05)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
                Join
              </button>
              <button
                onClick={() => onDeclineInvite?.(activeInviteToast)}
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  color: 'rgba(255,255,255,0.85)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '16px',
                  padding: '4px 10px',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; e.currentTarget.style.color = '#ffffff'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.85)'; }}
              >
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
