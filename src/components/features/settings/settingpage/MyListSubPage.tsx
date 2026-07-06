import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { removeFromMyList, updateListItemStatus, getMyList } from '../../../../services/user/myList';
import { getPosterUrl } from '../../../../services/tmdb';
import { triggerHaptic } from '../../../../utils/haptics';
import { Trash2, Film, Tv, Library, PlayCircle, Clock, CheckCircle2, MoreVertical, AlertCircle } from 'lucide-react';
import type { Movie, TVShow } from '../../../../types';
import { t } from '../../../../utils/i18n';

interface MyListSubPageProps {
  isMobile: boolean;
  sectionHeaderStyle: () => React.CSSProperties;
  onMovieClick?: (movie: Movie | TVShow) => void;
}

const NAV_HEIGHT = 90; // approximate BottomNav height

export default function MyListSubPage({ isMobile, sectionHeaderStyle, onMovieClick }: MyListSubPageProps) {
  const [myList, setMyList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'plan_to_watch' | 'watching' | 'completed'>('all');
  const [activeItemForSheet, setActiveItemForSheet] = useState<any | null>(null);
  const [isMobileSize, setIsMobileSize] = useState(window.innerWidth <= 380);

  const refreshMyList = useCallback(async () => {
    try {
      const list = await getMyList();
      setMyList(list);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    refreshMyList();
  }, [refreshMyList]);

  useEffect(() => {
    let resizeTimer: ReturnType<typeof setTimeout>;
    const handleResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        setIsMobileSize(window.innerWidth <= 380);
      }, 150);
    };
    window.addEventListener('resize', handleResize, { passive: true });
    return () => {
      clearTimeout(resizeTimer);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const safeMovies = (Array.isArray(myList) ? myList : []).filter(Boolean);
  const filteredMovies = filter === 'all' ? safeMovies : safeMovies.filter(m => m.status === filter);

  const countAll = safeMovies.length;
  const countPlan = safeMovies.filter(m => m.status === 'plan_to_watch').length;
  const countWatching = safeMovies.filter(m => m.status === 'watching').length;
  const countCompleted = safeMovies.filter(m => m.status === 'completed').length;

  const handleStatusChange = async (itemId: number, type: 'movie' | 'tv', newStatus: string) => {
    triggerHaptic('medium');
    
    // Update local active state immediately so the checkmark moves instantly
    setActiveItemForSheet(prev => prev ? { ...prev, status: newStatus } : null);
    
    const success = await updateListItemStatus(itemId, type, newStatus);
    if (success) {
      await refreshMyList();
    }
  };

  const handleRemove = async (itemId: number, type: 'movie' | 'tv') => {
    triggerHaptic('medium');
    setLoading(true);
    await removeFromMyList(itemId, type);
    await refreshMyList();
    setLoading(false);
    setActiveItemForSheet(null);
  };

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'completed':
        return { label: t('status_completed'), shortLabel: t('status_completed_short'), color: '#22c55e', glow: 'rgba(34,197,94,0.15)', icon: CheckCircle2 };
      case 'watching':
        return { label: t('status_watching'), shortLabel: t('status_watching_short'), color: '#60a5fa', glow: 'rgba(96,165,250,0.15)', icon: PlayCircle };
      case 'plan_to_watch':
      default:
        return { label: t('status_plan_to_watch'), shortLabel: t('status_plan_short'), color: '#fbbf24', glow: 'rgba(251,191,36,0.15)', icon: Clock };
    }
  };

  const tabs = [
    { id: 'all' as const, label: t('tab_all'), count: countAll },
    { id: 'plan_to_watch' as const, label: t('tab_planned'), count: countPlan },
    { id: 'watching' as const, label: t('tab_watching'), count: countWatching },
    { id: 'completed' as const, label: t('tab_done'), count: countCompleted },
  ];

  const isTV = typeof localStorage !== 'undefined' && localStorage.getItem('cinemovie_is_tv') === 'true';

  if (isTV) {
    return (
      <div style={{
        width: '100%',
        color: '#fff',
        boxSizing: 'border-box'
      }}>
        <div style={{
          width: '100%',
          padding: '12px 8px 100px 8px',
          boxSizing: 'border-box'
        }}>
          {/* Header */}
          <h2 style={{ fontSize: '1.25rem', fontWeight: 955, textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 20px 0' }}>
            {t('my_list')}
          </h2>

          {/* Filter Tab Bar */}
          <div style={{
            display: 'flex', gap: '6px',
            background: 'rgba(255,255,255,0.03)',
            padding: '4px', borderRadius: '12px',
            border: '1px solid rgba(255,255,255,0.05)',
            marginBottom: '28px',
            maxWidth: '600px'
          }}>
            {tabs.map((tab) => {
              const isActive = filter === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => { triggerHaptic('light'); setFilter(tab.id); }}
                  className={`tv-focusable${isActive ? ' active' : ''}`}
                  style={{
                    flex: 1,
                    height: '34px',
                    background: isActive ? 'rgba(255,255,255,0.08)' : 'transparent',
                    color: isActive ? '#fff' : 'rgba(255,255,255,0.5)',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '0.72rem',
                    fontWeight: isActive ? 800 : 600,
                    cursor: 'pointer',
                    textTransform: 'uppercase',
                    letterSpacing: '0.02em',
                    padding: '0 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    outline: 'none'
                  }}
                >
                  <span>{tab.label}</span>
                  <span style={{
                    fontSize: '0.62rem', opacity: 0.6,
                    background: isActive ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)',
                    padding: '1px 5px', borderRadius: '5px', fontWeight: 900,
                  }}>{tab.count}</span>
                </button>
              );
            })}
          </div>

          {/* Movie Grid */}
          <div>
            {filteredMovies.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '14px', padding: '120px 20px', textAlign: 'center', color: 'rgba(255,255,255,0.35)', width: '100%' }}>
                <Library size={36} strokeWidth={1.5} />
                <div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 900 }}>{t('nothing_here_yet')}</div>
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '20px 14px' }}>
                {filteredMovies.map((item) => {
                  if (!item) return null;
                  const isMovieItem = (item as any).title !== undefined;
                  const displayTitle = isMovieItem ? (item as any).title : (item as any).name;
                  const type = isMovieItem ? 'movie' : 'tv';
                  const statusInfo = getStatusInfo(item.status);
                  const StatusIcon = statusInfo.icon;

                  const handleItemClick = () => {
                    triggerHaptic('light');
                    setActiveItemForSheet(item);
                  };

                  return (
                    <div
                      key={`${item.id}-${type}`}
                      onClick={handleItemClick}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleItemClick();
                        }
                      }}
                      tabIndex={0}
                      className="my-list-tv-card tv-focusable"
                      style={{
                        position: 'relative',
                        cursor: 'pointer',
                        borderRadius: '12px',
                        overflow: 'hidden',
                        background: '#121214',
                        border: '2px solid transparent',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                        transition: 'all 0.15s ease',
                        outline: 'none'
                      }}
                    >
                      <div style={{ position: 'relative', paddingBottom: '150%' }}>
                        <img
                          src={getPosterUrl(item.posterPath || (item as any).poster_path, 'medium')}
                          alt={displayTitle}
                          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                          loading="lazy"
                        />
                        {/* Status marker */}
                        <div style={{
                          position: 'absolute', top: '6px', left: '6px',
                          background: 'rgba(0,0,0,0.85)', color: statusInfo.color,
                          padding: '2px 6px', borderRadius: '5px',
                          fontSize: '0.55rem', fontWeight: 900, textTransform: 'uppercase',
                          display: 'flex', alignItems: 'center', gap: '3px',
                          border: '1px solid rgba(255,255,255,0.06)'
                        }}>
                          <StatusIcon size={8} strokeWidth={2.5} />
                          <span>{statusInfo.shortLabel}</span>
                        </div>
                      </div>
                      <div style={{ padding: '6px 8px', textAlign: 'left' }}>
                        <h3 style={{ fontSize: '0.75rem', fontWeight: 700, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#fff' }}>
                          {displayTitle}
                        </h3>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Dedicated TV Action Select Modal Overlay */}
        {activeItemForSheet && (() => {
          const isMovieItem = (activeItemForSheet as any).title !== undefined;
          const displayTitle = isMovieItem ? (activeItemForSheet as any).title : (activeItemForSheet as any).name;
          const type = isMovieItem ? 'movie' : 'tv';
          return (
            <div 
              className="tv-settings-container"
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(5, 5, 8, 0.85)',
                backdropFilter: 'blur(15px)',
                WebkitBackdropFilter: 'blur(15px)',
                zIndex: 3000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '12px'
              }}
            >
              <div 
                style={{
                  background: 'rgba(15, 15, 20, 0.95)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '16px',
                  width: '95vw',
                  maxWidth: '360px',
                  maxHeight: '90vh',
                  overflowY: 'auto',
                  padding: '16px 20px',
                  boxSizing: 'border-box',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                  boxShadow: '0 20px 50px rgba(0,0,0,0.8)'
                }}
              >
                {/* Poster Preview */}
                <div style={{ width: '70px', aspectRatio: '2/3', borderRadius: '8px', overflow: 'hidden', margin: '0 auto', border: '1px solid rgba(255,255,255,0.15)', boxShadow: '0 6px 16px rgba(0,0,0,0.5)' }}>
                  <img src={getPosterUrl(activeItemForSheet.posterPath || (activeItemForSheet as any).poster_path, 'small')} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>

                {/* Metadata */}
                <div>
                  <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 900, color: '#fff', lineHeight: 1.25 }}>{displayTitle}</h3>
                  <span style={{ fontSize: '0.62rem', fontWeight: 800, textTransform: 'uppercase', color: type === 'movie' ? '#fca5a5' : '#a5b4fc', letterSpacing: '0.05em', marginTop: '4px', display: 'block' }}>
                    {type === 'movie' ? t('movie') : t('tv_series')}
                  </span>
                </div>

                {/* Status and navigation actions */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                  
                  {/* Open Movie Details sheet */}
                  <button
                    onClick={() => {
                      triggerHaptic('medium');
                      setActiveItemForSheet(null);
                      if (onMovieClick) {
                        onMovieClick(activeItemForSheet);
                      } else {
                        window.dispatchEvent(new CustomEvent(type === 'movie' ? 'movieClick' : 'tvShowClick', { detail: activeItemForSheet }));
                      }
                    }}
                    className="tv-focusable"
                    tabIndex={0}
                    style={{
                      width: '100%', height: '38px', background: '#ffffff', color: '#000000', border: 'none',
                      borderRadius: '8px', fontSize: '0.78rem', fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', outline: 'none'
                    }}
                  >
                    {t('watch_info')}
                  </button>

                  <div style={{ height: '1px', background: 'rgba(255,255,255,0.08)', margin: '4px 0' }} />

                  <button
                    onClick={() => handleStatusChange(activeItemForSheet.id, type, 'watching')}
                    className="tv-focusable"
                    tabIndex={0}
                    style={{
                      width: '100%', height: '36px', background: activeItemForSheet.status === 'watching' ? 'rgba(96,165,250,0.15)' : 'rgba(255,255,255,0.03)',
                      color: activeItemForSheet.status === 'watching' ? '#60a5fa' : '#fff', border: activeItemForSheet.status === 'watching' ? '1px solid #60a5fa' : '1px solid rgba(255,255,255,0.08)',
                      borderRadius: '8px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', outline: 'none'
                    }}
                  >
                    <PlayCircle size={14} /> {t('status_watching')}
                  </button>
                  <button
                    onClick={() => handleStatusChange(activeItemForSheet.id, type, 'plan_to_watch')}
                    className="tv-focusable"
                    tabIndex={0}
                    style={{
                      width: '100%', height: '36px', background: activeItemForSheet.status === 'plan_to_watch' ? 'rgba(251,191,36,0.15)' : 'rgba(255,255,255,0.03)',
                      color: activeItemForSheet.status === 'plan_to_watch' ? '#fbbf24' : '#fff', border: activeItemForSheet.status === 'plan_to_watch' ? '1px solid #fbbf24' : '1px solid rgba(255,255,255,0.08)',
                      borderRadius: '8px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', outline: 'none'
                    }}
                  >
                    <Clock size={14} /> {t('status_plan_to_watch')}
                  </button>
                  <button
                    onClick={() => handleStatusChange(activeItemForSheet.id, type, 'completed')}
                    className="tv-focusable"
                    tabIndex={0}
                    style={{
                      width: '100%', height: '36px', background: activeItemForSheet.status === 'completed' ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.03)',
                      color: activeItemForSheet.status === 'completed' ? '#22c55e' : '#fff', border: activeItemForSheet.status === 'completed' ? '1px solid #22c55e' : '1px solid rgba(255,255,255,0.08)',
                      borderRadius: '8px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', outline: 'none'
                    }}
                  >
                    <CheckCircle2 size={14} /> {t('status_completed')}
                  </button>
                  <button
                    onClick={() => handleRemove(activeItemForSheet.id, type)}
                    className="tv-focusable"
                    tabIndex={0}
                    style={{
                      width: '100%', height: '36px', background: 'rgba(239,68,68,0.08)', color: '#f87171', border: '1px solid rgba(239,68,68,0.15)',
                      borderRadius: '8px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', outline: 'none'
                    }}
                  >
                    <Trash2 size={14} /> {t('remove_list')}
                  </button>

                  <div style={{ height: '1px', background: 'rgba(255,255,255,0.08)', margin: '4px 0' }} />

                  {/* Close modal */}
                  <button
                    onClick={() => { triggerHaptic('light'); setActiveItemForSheet(null); }}
                    className="tv-focusable"
                    tabIndex={0}
                    style={{
                      width: '100%', height: '34px', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.5)', border: 'none',
                      borderRadius: '8px', fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer', outline: 'none'
                    }}
                  >
                    {t('cancel')}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Focus styling for TV mode */}
        <style>{`
          .my-list-tv-card:focus {
            transform: scale(1.04) !important;
            border-color: #ffffff !important;
            box-shadow: 0 10px 25px rgba(0,0,0,0.6) !important;
          }
          button.tv-focusable:focus {
            background: #ffffff !important;
            color: #000000 !important;
            border-color: #ffffff !important;
            box-shadow: 0 0 0 3px #ffffff !important;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div style={{
      color: '#fff',
      opacity: loading ? 0.7 : 1,
      transition: 'opacity 0.2s'
    }}>
      {/* Tab switchers in premium capsule design */}
      <div style={{
        marginBottom: '20px'
      }}>
        <div style={{
          display: 'flex',
          gap: '4px',
          background: 'rgba(255,255,255,0.03)',
          padding: '4px',
          borderRadius: '12px',
          border: '1px solid rgba(255,255,255,0.05)',
          overflowX: 'auto',
          scrollbarWidth: 'none',
        }}>
          {tabs.map((tab) => {
            const isActive = filter === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => { triggerHaptic('light'); setFilter(tab.id); }}
                style={{
                  flex: 1,
                  height: isMobileSize ? '34px' : '38px',
                  background: isActive ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                  color: isActive ? '#fff' : 'rgba(255,255,255,0.5)',
                  border: isActive ? '1px solid rgba(255, 255, 255, 0.05)' : '1px solid transparent',
                  borderRadius: '8px',
                  fontSize: isMobileSize ? '0.7rem' : '0.8rem',
                  fontWeight: isActive ? 800 : 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.02em',
                  whiteSpace: 'nowrap',
                  padding: '0 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <span>{tab.label}</span>
                <span style={{
                  fontSize: '0.65rem',
                  opacity: 0.6,
                  background: isActive ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)',
                  padding: '1px 6px',
                  borderRadius: '6px',
                  fontWeight: 900
                }}>{tab.count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Grid Content */}
      <div style={{ width: '100%' }}>
        {filteredMovies.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '14px',
            padding: '80px 20px',
            textAlign: 'center',
            color: 'rgba(255,255,255,0.35)'
          }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '18px',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.05)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Library size={28} strokeWidth={1.5} />
            </div>
            <div>
              <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'rgba(255,255,255,0.6)' }}>
                {t('nothing_here_yet')}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.3)', maxWidth: '240px', marginTop: '4px', lineHeight: 1.5 }}>
                {t('nothing_here_sub')}
              </div>
            </div>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobileSize ? 'repeat(auto-fill, minmax(105px, 1fr))' : 'repeat(auto-fill, minmax(130px, 1fr))',
            gap: isMobileSize ? '14px 10px' : '20px 16px'
          }}>
            {filteredMovies.map((item) => {
              if (!item) return null;
              const isMovieItem = (item as any).title !== undefined;
              const displayTitle = isMovieItem ? (item as any).title : (item as any).name;
              const type = isMovieItem ? 'movie' : 'tv';
              const statusInfo = getStatusInfo(item.status);
              const StatusIcon = statusInfo.icon;

              return (
                <div
                  key={`${item.id}-${type}`}
                  onClick={() => {
                    triggerHaptic('light');
                    if (onMovieClick) {
                      onMovieClick(item);
                    } else {
                      window.dispatchEvent(new CustomEvent('movieClick', { detail: item }));
                    }
                  }}
                  style={{
                    position: 'relative',
                    cursor: 'pointer',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    background: 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.01) 100%)',
                    border: '1px solid rgba(255,255,255,0.05)',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                    transition: 'transform 0.15s ease, opacity 0.15s ease',
                  }}
                >
                  <div style={{ position: 'relative', paddingBottom: '150%' }}>
                    <img
                      src={getPosterUrl(item.posterPath || (item as any).poster_path, 'medium')}
                      alt={displayTitle}
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                      loading="lazy"
                    />

                    {/* Top accent border line using status color */}
                    <div style={{
                      position: 'absolute', top: 0, left: 0, right: 0, height: '3px',
                      background: statusInfo.color, zIndex: 3
                    }} />

                    {/* Status indicator pill top-left */}
                    <div style={{
                      position: 'absolute', top: '8px', left: '8px',
                      background: 'rgba(0, 0, 0, 0.75)', color: statusInfo.color,
                      padding: '3px 8px', borderRadius: '6px',
                      fontSize: '0.62rem', fontWeight: 900,
                      textTransform: 'uppercase', letterSpacing: '0.04em',
                      display: 'flex', alignItems: 'center', gap: '4px',
                      backdropFilter: 'blur(8px)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      zIndex: 3
                    }}>
                      <StatusIcon size={9} strokeWidth={2.5} />
                      <span>{statusInfo.shortLabel}</span>
                    </div>

                    {/* Media type indicator badge top-right */}
                    <div style={{
                      position: 'absolute', top: '8px', right: '8px',
                      background: 'rgba(0, 0, 0, 0.75)',
                      border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px',
                      width: '24px', height: '24px',
                      color: isMovieItem ? '#fca5a5' : '#a5b4fc',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      backdropFilter: 'blur(8px)',
                      zIndex: 3
                    }}>
                      {isMovieItem ? <Film size={11} strokeWidth={2.5} /> : <Tv size={11} strokeWidth={2.5} />}
                    </div>
                  </div>

                  {/* Footer Row */}
                  <div style={{ padding: '8px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <h3 style={{
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      margin: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      flex: 1,
                      color: '#fff'
                    }}>
                      {displayTitle}
                    </h3>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        triggerHaptic('light');
                        setActiveItemForSheet(item);
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'rgba(255,255,255,0.5)',
                        padding: '4px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        marginRight: '-4px'
                      }}
                    >
                      <MoreVertical size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Settings Bottom Sheet Portal */}
      {createPortal(
        <AnimatePresence>
          {activeItemForSheet && (
            <>
              {/* Backdrop */}
              <motion.div
                key="wl-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                onClick={() => setActiveItemForSheet(null)}
                style={{
                  position: 'fixed',
                  inset: 0,
                  background: 'rgba(0,0,0,0.8)',
                  zIndex: 10080,
                }}
              />

              {/* Sheet */}
              <motion.div
                key="wl-sheet"
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                style={{
                  position: 'fixed',
                  left: '12px',
                  right: '12px',
                  maxWidth: '380px',
                  margin: '0 auto',
                  bottom: `calc(${NAV_HEIGHT}px + env(safe-area-inset-bottom, 0px))`,
                  background: '#101014',
                  borderRadius: '24px',
                  border: '1px solid rgba(255,255,255,0.08)',
                  zIndex: 10090,
                  boxShadow: '0 -20px 60px rgba(0,0,0,0.7)',
                  overflow: 'hidden',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'center', padding: '14px 0 4px' }}>
                  <div style={{ width: '38px', height: '4px', background: 'rgba(255,255,255,0.12)', borderRadius: '2px' }} />
                </div>

                <div style={{ padding: '12px 20px 20px' }}>
                  {/* Header info */}
                  <div style={{ display: 'flex', gap: '14px', alignItems: 'center', marginBottom: '18px' }}>
                    <div style={{
                      width: '44px', height: '62px', borderRadius: '10px', overflow: 'hidden', flexShrink: 0,
                      border: '1px solid rgba(255,255,255,0.1)', background: '#111'
                    }}>
                      <img
                        src={getPosterUrl(activeItemForSheet.posterPath || (activeItemForSheet as any).poster_path, 'small')}
                        alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>
                        {(activeItemForSheet as any).title ? t('type_movie') : t('type_tv_show')}
                      </div>
                      <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {(activeItemForSheet as any).title || (activeItemForSheet as any).name}
                      </div>
                    </div>
                  </div>

                  <div style={{ fontSize: '0.68rem', fontWeight: 800, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
                    {t('update_status')}
                  </div>

                  {/* Status buttons */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
                    {(['plan_to_watch', 'watching', 'completed'] as const).map((opt) => {
                      const isSelected = activeItemForSheet.status === opt;
                      const isMovieItem = activeItemForSheet.mediaType === 'movie' || (activeItemForSheet as any).title !== undefined;
                      const sd = getStatusInfo(opt);
                      const OptIcon = sd.icon;
                      return (
                        <button
                          key={opt}
                          onClick={() => handleStatusChange(activeItemForSheet.id, isMovieItem ? 'movie' : 'tv', opt)}
                          style={{
                            width: '100%',
                            height: '52px',
                            borderRadius: '14px',
                            fontSize: '0.86rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            padding: '0 16px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            transition: 'all 0.2s ease',
                            background: isSelected ? `${sd.glow}` : 'rgba(255,255,255,0.03)',
                            border: isSelected ? `1px solid ${sd.color}35` : '1px solid rgba(255,255,255,0.05)',
                            color: isSelected ? '#fff' : 'rgba(255,255,255,0.55)',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{
                              width: '32px', height: '32px', borderRadius: '10px',
                              background: isSelected ? `${sd.color}15` : 'rgba(255,255,255,0.05)',
                              border: `1px solid ${isSelected ? sd.color + '30' : 'rgba(255,255,255,0.07)'}`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                            }}>
                              <OptIcon size={15} color={isSelected ? sd.color : 'rgba(255,255,255,0.3)'} strokeWidth={2.2} />
                            </div>
                            <span style={{ fontWeight: isSelected ? 800 : 600 }}>{sd.label}</span>
                          </div>
                          {isSelected && (
                            <div style={{
                              width: '20px', height: '20px', borderRadius: '50%',
                              background: sd.color, display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  <div style={{ height: '1px', background: 'rgba(255,255,255,0.07)', margin: '0 0 12px' }} />

                  <button
                    onClick={() => {
                      const isMovieItem = activeItemForSheet.mediaType === 'movie' || (activeItemForSheet as any).title !== undefined;
                      handleRemove(activeItemForSheet.id, isMovieItem ? 'movie' : 'tv');
                    }}
                    style={{
                      width: '100%',
                      height: '50px',
                      borderRadius: '14px',
                      fontSize: '0.86rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      transition: 'all 0.2s ease',
                      background: 'rgba(239,68,68,0.1)',
                      border: '1px solid rgba(239,68,68,0.2)',
                      color: '#ef4444',
                    }}
                  >
                    <Trash2 size={16} strokeWidth={2} />
                    {t('remove_from_watchlist')}
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
