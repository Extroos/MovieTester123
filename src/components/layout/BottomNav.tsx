import React from 'react';
import { COLORS } from '../../constants';
import { triggerHaptic } from '../../utils/haptics';
import { Home, Film, Tv, Flame, User } from 'lucide-react';

export type View = 'home' | 'movies' | 'tvshows' | 'newandhot' | 'mylist' | 'settings' | 'schedules' | 'downloads';

interface BottomNavProps {
  currentView: View;
  onNavClick: (view: View) => void;
}

const navItems = [
  { 
    id: 'home' as View, 
    label: 'Home',
    icon: (active: boolean) => (
      <Home 
        size={24} 
        strokeWidth={active ? 2.8 : 2} 
        fill="none"
      />
    )
  },
  { 
    id: 'movies' as View, 
    label: 'Movies',
    icon: (active: boolean) => (
      <Film 
        size={24} 
        strokeWidth={active ? 2.8 : 2} 
        fill="none"
      />
    )
  },
  { 
    id: 'tvshows' as View, 
    label: 'Series',
    icon: (active: boolean) => (
      <Tv 
        size={24} 
        strokeWidth={active ? 2.8 : 2} 
        fill="none"
      />
    )
  },
  { 
    id: 'newandhot' as View, 
    label: 'New', 
    icon: (active: boolean) => (
      <Flame 
        size={24} 
        strokeWidth={active ? 2.8 : 2} 
        fill="none"
      />
    )
  },
  { 
    id: 'settings' as View, 
    label: 'Profile',
    icon: (active: boolean) => (
      <User 
        size={24} 
        strokeWidth={active ? 2.8 : 2} 
        fill="none"
      />
    )
  }
];

const BottomNav = React.memo(function BottomNav({ currentView, onNavClick }: BottomNavProps) {
  const handleNavClick = (view: View) => {
    setTimeout(() => triggerHaptic('light'), 0);
    onNavClick(view);
  };

  return (
    <>
      <style>{`
        @media (min-width: 769px) {
          .cinemovie-bottom-nav {
            display: none !important;
          }
        }
        @media (max-width: 380px) {
          .cinemovie-bottom-nav {
            left: 10px !important;
            right: 10px !important;
            padding: 4px 6px !important;
            border-radius: 16px !important;
          }
          .cinemovie-bottom-nav button {
            min-width: auto !important;
            padding: 6px 2px !important;
          }
          .cinemovie-bottom-nav svg {
            width: 20px !important;
            height: 20px !important;
          }
          .cinemovie-bottom-nav span {
            font-size: 8.5px !important;
          }
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
          background: 'rgba(15, 15, 15, 0.7)',
          backdropFilter: 'blur(25px) saturate(180%)',
          WebkitBackdropFilter: 'blur(25px) saturate(180%)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '20px',
          display: 'flex',
          justifyContent: 'space-around',
          alignItems: 'center',
          padding: '8px 10px',
          boxShadow: '0 12px 40px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
        }}
      >
        {navItems.map((item) => {
          const isActive = currentView === item.id;
          
          return (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              aria-label={item.label}
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
                color: isActive ? '#FFFFFF' : 'rgba(255, 255, 255, 0.6)', 
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                transform: isActive ? 'scale(1.15)' : 'scale(1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                {item.icon(isActive)}
              </div>
              
              <span style={{
                fontSize: '10px',
                fontWeight: isActive ? 700 : 550,
                color: isActive ? '#FFFFFF' : 'rgba(255, 255, 255, 0.5)', 
                letterSpacing: '0.2px',
                transition: 'all 0.2s ease',
                marginTop: '3px',
              }}>
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>
    </>
  );
});

export default BottomNav;
