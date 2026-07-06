import React from 'react';
import { COLORS } from '../../constants';
import { triggerHaptic } from '../../utils/haptics';
import { Home, Film, Tv, Flame, User } from 'lucide-react';
import { t } from '../../utils/i18n';

export type View = 'home' | 'movies' | 'tvshows' | 'newandhot' | 'mylist' | 'settings' | 'schedules' | 'downloads';

interface BottomNavProps {
  currentView: View;
  onNavClick: (view: View) => void;
  onSearchOpen?: () => void;
  activeProfile?: any;
  hasUpdate?: boolean;
}

const navItems = [
  {
    id: 'home' as View,
    label: 'Home',
    icon: (active: boolean) => <Home size={24} strokeWidth={active ? 2.8 : 2} fill="none" />
  },
  {
    id: 'movies' as View,
    label: 'Movies',
    icon: (active: boolean) => <Film size={24} strokeWidth={active ? 2.8 : 2} fill="none" />
  },
  {
    id: 'tvshows' as View,
    label: 'Series',
    icon: (active: boolean) => <Tv size={24} strokeWidth={active ? 2.8 : 2} fill="none" />
  },
  {
    id: 'newandhot' as View,
    label: 'New',
    icon: (active: boolean) => <Flame size={24} strokeWidth={active ? 2.8 : 2} fill="none" />
  },
  {
    id: 'settings' as View,
    label: 'Profile',
    icon: (active: boolean) => <User size={24} strokeWidth={active ? 2.8 : 2} fill="none" />
  }
];

const BottomNav = React.memo(function BottomNav({ currentView, onNavClick, hasUpdate }: BottomNavProps) {
  const handleNavClick = (view: View) => {
    setTimeout(() => triggerHaptic('light'), 0);
    onNavClick(view);
  };

  return (
    <>
      <style>{`
        @media (min-width: 769px) {
          .cinemovie-bottom-nav { display: none !important; }
        }
        @media (max-width: 380px) {
          .cinemovie-bottom-nav { left: 10px !important; right: 10px !important; padding: 4px 6px !important; border-radius: 16px !important; }
          .cinemovie-bottom-nav button { min-width: auto !important; padding: 6px 2px !important; }
          .cinemovie-bottom-nav svg { width: 20px !important; height: 20px !important; }
          .cinemovie-bottom-nav span { font-size: 8.5px !important; }
        }
      `}</style>
      <nav
        role="navigation"
        aria-label="Main navigation"
        className="cinemovie-bottom-nav"
        style={{
          position: 'fixed',
          bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
          left: '16px',
          right: '16px',
          zIndex: 1000,
          background: 'rgba(10, 10, 12, 0.83)',
          backdropFilter: 'saturate(180%) blur(24px)',
          WebkitBackdropFilter: 'saturate(180%) blur(24px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '20px',
          display: 'flex',
          justifyContent: 'space-around',
          alignItems: 'center',
          padding: '8px 10px',
          boxShadow: '0 12px 40px rgba(0, 0, 0, 0.6)',
        }}
      >
        {navItems.map((item) => {
          const isActive = currentView === item.id;
          const translatedLabel = t(
            item.id === 'tvshows' ? 'series' : 
            item.id === 'newandhot' ? 'new' : 
            item.id === 'settings' ? 'profile' : 
            item.id
          );
          return (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              aria-label={translatedLabel}
              aria-current={isActive ? 'page' : undefined}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                padding: '8px 4px',
                minWidth: '64px',
                width: '20%',
                userSelect: 'none',
                WebkitTapHighlightColor: 'transparent',
                outline: 'none'
              }}
            >
              <div style={{
                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                transform: isActive ? 'scale(1.15)' : 'scale(1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                position: 'relative'
              }}>
                {item.icon(isActive)}
                {item.id === 'settings' && hasUpdate && (
                  <span style={{
                    position: 'absolute',
                    top: '-2px',
                    right: '-2px',
                    width: '9px',
                    height: '9px',
                    borderRadius: '50%',
                    backgroundColor: '#007aff',
                    border: '1.5px solid rgba(12, 12, 12, 1)',
                    boxShadow: '0 0 8px rgba(0, 122, 255, 0.6)'
                  }} />
                )}
              </div>
              <span style={{
                fontSize: '10px',
                fontWeight: isActive ? 700 : 550,
                color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                letterSpacing: '0.2px',
                transition: 'all 0.2s ease',
                marginTop: '3px',
              }}>
                {translatedLabel}
              </span>
            </button>
          );
        })}
      </nav>
    </>
  );
});

export default BottomNav;
