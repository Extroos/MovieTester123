import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Movie, TVShow } from '../../../types';
import { 
  getBackdropUrl, 
  getPosterUrl, 
  getMoviesByGenre, 
  getTVShowsByGenre 
} from '../../../services/tmdb';
import { triggerHaptic } from '../../../utils/haptics';
import { t } from '../../../utils/i18n';
import { Play, Info, ChevronLeft, Layers, Film, Tv, TrendingUp, Calendar } from 'lucide-react';

const GENRES = [
  { id: 28, name: 'Action', color: '#ff4d4d' },
  { id: 12, name: 'Adventure', color: '#fbbf24' },
  { id: 16, name: 'Animation', color: '#22d3ee' },
  { id: 35, name: 'Comedy', color: '#facc15' },
  { id: 80, name: 'Crime', color: '#a78bfa' },
  { id: 99, name: 'Documentary', color: '#34d399' },
  { id: 18, name: 'Drama', color: '#818cf8' },
  { id: 10751, name: 'Family', color: '#f472b6' },
  { id: 14, name: 'Fantasy', color: '#c084fc' },
  { id: 27, name: 'Horror', color: '#fca5a5' },
  { id: 10402, name: 'Music', color: '#fb7185' },
  { id: 9648, name: 'Mystery', color: '#6366f1' },
  { id: 10749, name: 'Romance', color: '#fda4af' },
  { id: 878, name: 'Sci-Fi', color: '#38bdf8' },
  { id: 53, name: 'Thriller', color: '#f87171' },
];

// Helper to check and retrieve visible genres list for Kids Mode
function getVisibleGenres() {
  try {
    const stored = localStorage.getItem('watchmovie_active_profile_cache');
    const isKids = stored ? JSON.parse(stored)?.isKids === true : false;
    if (isKids) {
      // Keep strictly safe categories
      return GENRES.filter(g => [16, 35, 12, 10751, 14].includes(g.id));
    }
  } catch (e) {}
  return GENRES;
}

type ContentItem = (Movie | TVShow) & { mediaType: 'movie' | 'tv' };

interface BrowseNewsProps {
  trending: (Movie | TVShow)[];
  upcoming: Movie[];
  onItemClick: (item: any) => void;
  selectedGenre: number | null;
  onSelectedGenreChange: (genreId: number | null) => void;
}

export default function BrowseNewsPage({ trending, upcoming, onItemClick, selectedGenre, onSelectedGenreChange }: BrowseNewsProps) {
  const [activeTab, setActiveTab] = useState<'everyone' | 'coming' | 'categories'>('everyone');
  const [genreContent, setGenreContent] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [isSmallScreen, setIsSmallScreen] = useState(window.innerWidth < 380);

  useEffect(() => {
    const handleResize = () => setIsSmallScreen(window.innerWidth < 380);
    window.addEventListener('resize', handleResize, { passive: true });
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const tabLabels = useMemo(() => [
    { id: 'everyone' as const, label: t('trending'), icon: <TrendingUp size={12} /> },
    { id: 'coming' as const, label: isSmallScreen ? t('soon') : t('coming_soon'), icon: <Calendar size={12} /> },
    { id: 'categories' as const, label: isSmallScreen ? t('genres') : t('categories'), icon: <Layers size={12} /> }
  ], [isSmallScreen]);

  // Performance cap lists to top 15 items for trending feed
  const trendingList = useMemo(() => trending.slice(0, 15), [trending]);
  // Show all upcoming (up to 50) for the coming soon tab — sorted by date (nearest first)
  const upcomingList = useMemo(() => upcoming.slice(0, 50), [upcoming]);

  // Group upcoming by release month for organized display
  const upcomingByMonth = useMemo(() => {
    const groups: { label: string; key: string; items: Movie[] }[] = [];
    const groupMap = new Map<string, Movie[]>();

    upcomingList.forEach((item: any) => {
      const releaseDate = item.releaseDate || item.release_date;
      if (!releaseDate) return;
      const d = new Date(releaseDate);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      if (!groupMap.has(key)) {
        groupMap.set(key, []);
        groups.push({ label, key, items: groupMap.get(key)! });
      }
      groupMap.get(key)!.push(item);
    });

    return groups;
  }, [upcomingList]);


  useEffect(() => {
    if (selectedGenre) {
      const loadContent = async () => {
        setLoading(true);
        try {
          const [m, s] = await Promise.all([
            getMoviesByGenre(selectedGenre),
            getTVShowsByGenre(selectedGenre)
          ]);
          setGenreContent([
            ...m.map(x => ({ ...x, mediaType: 'movie' as const })),
            ...s.map(x => ({ ...x, mediaType: 'tv' as const }))
          ].sort(() => Math.random() - 0.5));
        } catch (e) { console.error(e); }
        setLoading(false);
      };
      loadContent();
    }
  }, [selectedGenre]);

  // Pre-generate dynamic images for genre categories
  const genresWithImages = useMemo(() => {
    const allContent = [...trendingList, ...upcomingList].filter(item => !!(item.backdropPath || item.posterPath));
    const usedMovieIds = new Set<number>();
    
    return getVisibleGenres().map(genre => {
      // 1. Try to find an unused movie matching this genre
      let matchedMovie = allContent.find(item => {
        const ids = item.genres?.map((g: any) => g.id) || [];
        return ids.includes(genre.id) && !usedMovieIds.has(item.id);
      });
      
      // 2. If none, find ANY unused movie to ensure visual uniqueness
      if (!matchedMovie) {
        matchedMovie = allContent.find(item => !usedMovieIds.has(item.id));
      }
      
      // 3. Fallback to any movie only if we run out of unique movies (highly unlikely since 30 > 15)
      if (!matchedMovie && allContent.length > 0) {
        matchedMovie = allContent[Math.floor(Math.random() * allContent.length)];
      }

      let imagePath = '';
      if (matchedMovie) {
        usedMovieIds.add(matchedMovie.id);
        imagePath = getBackdropUrl(matchedMovie.backdropPath || matchedMovie.posterPath || '', 'medium') || '';
      }

      return {
        ...genre,
        imagePath
      };
    });
  }, [trendingList, upcomingList]);

  if (selectedGenre) {
    const genre = getVisibleGenres().find(g => g.id === selectedGenre);
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-primary, #070708)', paddingTop: 'calc(84px + env(safe-area-inset-top, 0px))', paddingBottom: '32px' }}>
        <CustomStyles />
        
        <div style={{ padding: '0 20px 16px', maxWidth: '800px', margin: '0 auto', textAlign: 'left' }}>
          <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 950, color: '#fff', letterSpacing: '-0.03em', textTransform: 'uppercase' }}>
            {genre?.name}
          </h2>
        </div>
        
        <div style={{ 
          padding: '0 16px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
          gap: '12px',
          maxWidth: '800px',
          margin: '0 auto'
        }}>
          {loading ? Array(12).fill(0).map((_, i) => (
            <div key={i} className="shimmer-placeholder" style={{ aspectRatio: '2/3', borderRadius: '12px' }} />
          )) :
            genreContent.map((item) => (
              <div 
                key={item.id} 
                className="editorial-poster-card tv-focusable"
                onClick={() => onItemClick(item)} 
                style={{ 
                  aspectRatio: '2/3', 
                  borderRadius: '12px', 
                  overflow: 'hidden', 
                  position: 'relative',
                  cursor: 'pointer',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                }}
              >
                <img 
                  src={getPosterUrl(item.posterPath, 'medium')} 
                  alt="" 
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                  loading="lazy"
                />
              </div>
            ))
          }
        </div>
      </div>
    );
  }

  const isTVMode = typeof localStorage !== 'undefined' && localStorage.getItem('cinemovie_is_tv') === 'true';

  // State to track currently focused item on TV mode so the right details pane updates live
  const [focusedItem, setFocusedItem] = useState<any>(null);

  // Sync focused item when tab changes
  useEffect(() => {
    if (activeTab === 'coming') {
      setFocusedItem(upcomingList[0] || null);
    } else if (activeTab === 'categories') {
      setFocusedItem(null); // No preview needed for categories tab
    } else {
      setFocusedItem(trendingList[0] || null);
    }
  }, [activeTab, trendingList, upcomingList]);

  const heroItem = useMemo(() => {
    if (isTVMode) return focusedItem || trendingList[0] || null;
    if (activeTab === 'coming') return upcomingList[0] || null;
    if (activeTab === 'categories') return trendingList[1] || trendingList[0] || null;
    return trendingList[0] || null;
  }, [activeTab, trendingList, upcomingList, isTVMode, focusedItem]);

  const heroBadgeConfig = useMemo(() => {
    if (activeTab === 'coming') {
      return {
        bg: 'rgba(255, 255, 255, 0.08)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        color: '#ffffff',
        icon: <Calendar size={10} />,
        label: t('coming_soon')
      };
    }
    if (activeTab === 'categories') {
      return {
        bg: 'rgba(139, 92, 246, 0.2)',
        border: '1px solid rgba(139, 92, 246, 0.4)',
        color: '#c084fc',
        icon: <Layers size={10} />,
        label: t('categories')
      };
    }
    return {
      bg: 'rgba(229, 9, 20, 0.2)',
      border: '1px solid rgba(229, 9, 20, 0.4)',
      color: '#ff4d4d',
      icon: <TrendingUp size={10} />,
      label: t('trending')
    };
  }, [activeTab]);

  const remainingTrendingList = useMemo(() => {
    if (isTVMode) return trendingList; // Show all items in list on TV mode
    return trendingList.slice(1);
  }, [trendingList, isTVMode]);

  const formatReleaseDate = (item: any): string => {
    const raw = item.releaseDate || item.release_date;
    if (!raw) return '';
    const d = new Date(raw);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER TV MODE: Horizontal Split-Screen Layout (Left: list scroll, Right: preview pane)
  // ─────────────────────────────────────────────────────────────────────────────
  if (isTVMode) {
    return (
      <div style={{
        height: '100vh',
        background: '#070708',
        color: '#ffffff',
        display: 'flex',
        overflow: 'hidden',
        position: 'relative'
      }}>
        <CustomStyles />

        {/* LEFT COLUMN: Scrollable news feed, category selector & tab headers */}
        <div style={{
          flex: '1.2',
          height: '100%',
          overflowY: 'auto',
          padding: '120px 32px 100px 48px',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          borderRight: '1px solid rgba(255,255,255,0.06)'
        }} className="no-scrollbar">
          {/* Header */}
          <h2 style={{
            fontSize: '1.2rem',
            fontWeight: 900,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            margin: '0 0 16px 0',
            color: '#ffffff'
          }}>
            {t('new_and_hot')}
          </h2>

          {/* Navigation Tab Bar */}
          <div style={{ display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.03)', padding: '4px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', marginBottom: '24px', flexShrink: 0 }}>
            {tabLabels.map((tab) => (
              <button
                key={tab.id}
                onClick={() => { triggerHaptic('light'); setActiveTab(tab.id as any); }}
                className={`browse-news-tab-btn${activeTab === tab.id ? ' active' : ''} tv-focusable`}
                style={{
                  flex: 1,
                  height: '32px',
                  background: activeTab === tab.id ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                  border: 'none',
                  color: activeTab === tab.id ? '#fff' : 'rgba(255,255,255,0.45)',
                  fontSize: '0.68rem',
                  fontWeight: 800,
                  borderRadius: '8px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  outline: 'none'
                }}
              >
                {tab.icon}{tab.label}
              </button>
            ))}
          </div>

          {/* List items depending on selected tab */}
          <div style={{ flex: 1 }}>
            {activeTab === 'categories' ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                {genresWithImages.map((genre) => (
                  <button
                    key={genre.id}
                    onClick={() => { triggerHaptic('medium'); onSelectedGenreChange(genre.id); }}
                    className="genre-editorial-card tv-focusable"
                    style={{ position: 'relative', aspectRatio: '16/9', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.08)', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '10px 12px', cursor: 'pointer', color: '#ffffff', outline: 'none', textAlign: 'left', width: '100%', boxSizing: 'border-box', background: '#121214' }}
                  >
                    {genre.imagePath && (
                      <img src={genre.imagePath} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 1, opacity: 0.5 }} loading="lazy" />
                    )}
                    <div style={{ position: 'absolute', inset: 0, zIndex: 2, background: `linear-gradient(to top, rgba(7,7,8, 0.95) 0%, rgba(7,7,8, 0.3) 100%)` }} />
                    <span style={{ position: 'relative', zIndex: 3, fontWeight: 900, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      {genre.name}
                    </span>
                  </button>
                ))}
              </div>
            ) : activeTab === 'coming' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {upcomingList.map((item: any) => {
                  const releaseDate = formatReleaseDate(item);
                  const isFocused = focusedItem?.id === item.id;
                  return (
                    <div
                      key={item.id}
                      className="seamless-news-row tv-focusable"
                      tabIndex={0}
                      onFocus={() => setFocusedItem(item)}
                      onClick={() => onItemClick(item)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onItemClick(item);
                        } else if (e.key === 'ArrowRight') {
                          e.preventDefault();
                          const infoBtn = document.querySelector('.featured-play-btn') as HTMLElement | null;
                          if (infoBtn) infoBtn.focus();
                        }
                      }}
                      style={{
                        display: 'flex',
                        gap: '12px',
                        alignItems: 'center',
                        padding: '10px',
                        borderRadius: '12px',
                        background: isFocused ? 'rgba(255,255,255,0.06)' : 'transparent',
                        border: '1px solid transparent',
                        cursor: 'pointer',
                        outline: 'none',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ flexShrink: 0, width: '48px', aspectRatio: '2/3', borderRadius: '6px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <img src={getPosterUrl(item.posterPath, 'small')} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                      </div>
                      <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                        <span style={{ fontSize: '0.55rem', fontWeight: 800, color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{releaseDate}</span>
                        <h4 style={{ margin: '2px 0 0 0', fontSize: '0.8rem', fontWeight: 800, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {item.title}
                        </h4>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {remainingTrendingList.map((item: any) => {
                  const isFocused = focusedItem?.id === item.id;
                  return (
                    <div
                      key={item.id}
                      className="seamless-news-row tv-focusable"
                      tabIndex={0}
                      onFocus={() => setFocusedItem(item)}
                      onClick={() => onItemClick(item)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onItemClick(item);
                        } else if (e.key === 'ArrowRight') {
                          e.preventDefault();
                          const infoBtn = document.querySelector('.featured-play-btn') as HTMLElement | null;
                          if (infoBtn) infoBtn.focus();
                        }
                      }}
                      style={{
                        display: 'flex',
                        gap: '12px',
                        alignItems: 'center',
                        padding: '10px',
                        borderRadius: '12px',
                        background: isFocused ? 'rgba(255,255,255,0.06)' : 'transparent',
                        border: '1px solid transparent',
                        cursor: 'pointer',
                        outline: 'none',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ flexShrink: 0, width: '70px', aspectRatio: '16/9', borderRadius: '6px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <img src={getBackdropUrl(item.backdropPath, 'small') || getPosterUrl(item.posterPath, 'small')} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                      </div>
                      <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                        <h4 style={{ margin: 0, fontSize: '0.8rem', fontWeight: 800, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {item.title || item.name}
                        </h4>
                        <p style={{ margin: '2px 0 0 0', fontSize: '0.68rem', color: 'rgba(255,255,255,0.4)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {item.overview}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Stable sticky preview panel displaying the focused item */}
        <div style={{
          flex: '1.5',
          height: '100%',
          position: 'relative',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'flex-start',
          background: 'transparent'
        }}>
          {heroItem ? (
            <>
              {/* Stable Backdrop image */}
              <div style={{ position: 'absolute', inset: 0, zIndex: 1, filter: 'brightness(0.55) contrast(1.05)' }}>
                <img
                  src={getBackdropUrl(heroItem.backdropPath, 'large') || getPosterUrl(heroItem.posterPath, 'large')}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, #070708 0%, transparent 50%), linear-gradient(to top, #070708 0%, transparent 40%)' }} />
              </div>

              {/* Text content details */}
              <div style={{ padding: '48px', width: '100%', boxSizing: 'border-box', textAlign: 'left', zIndex: 2, position: 'relative' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: heroBadgeConfig.bg, border: heroBadgeConfig.border, color: heroBadgeConfig.color, padding: '4px 10px', borderRadius: '20px', fontSize: '0.6rem', fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '12px' }}>
                  {heroBadgeConfig.icon}{heroBadgeConfig.label}
                </div>
                <h1 style={{ fontSize: '2rem', fontWeight: 950, letterSpacing: '-0.04em', margin: '0 0 10px 0', lineHeight: 1.1, color: '#ffffff', textShadow: '0 4px 12px rgba(0,0,0,0.8)' }}>
                  {heroItem.title || heroItem.name}
                </h1>
                <p style={{ fontSize: '0.78rem', color: 'rgba(255, 255, 255, 0.75)', lineHeight: '1.55', maxWidth: '480px', margin: '0 0 20px 0', textShadow: '0 2px 6px rgba(0,0,0,0.5)' }}>
                  {heroItem.overview || 'No overview description available.'}
                </p>
                <button
                  onClick={() => onItemClick(heroItem)}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowLeft') {
                      e.preventDefault();
                      const activeRow = document.querySelector('.seamless-news-row[style*="rgba(255,255,255,0.06)"], .seamless-news-row:focus') as HTMLElement | null;
                      if (activeRow) {
                        activeRow.focus();
                      } else {
                        const firstRow = document.querySelector('.seamless-news-row') as HTMLElement | null;
                        if (firstRow) firstRow.focus();
                      }
                    }
                  }}
                  className="featured-play-btn tv-focusable"
                  style={{
                    background: '#ffffff',
                    color: '#000000',
                    border: 'none',
                    borderRadius: '10px',
                    padding: '8px 18px',
                    fontWeight: 900,
                    fontSize: '0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                    outline: 'none',
                    boxShadow: '0 4px 14px rgba(255,255,255,0.2)'
                  }}
                >
                  <Play size={12} fill="#000" /> {t('watch_info')}
                </button>
              </div>
            </>
          ) : (
            <div style={{ margin: 'auto', color: 'rgba(255,255,255,0.2)', fontSize: '0.8rem', fontWeight: 700 }}>
              Hover or focus items on the left to see details
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-primary, #070708)',
      color: 'var(--text-primary)',
      paddingBottom: '32px',
      overflowX: 'hidden'
    }}>
      <CustomStyles />

      {/* Hero Banner — distinct per tab */}
      {heroItem && (
        <div
          className="hero-banner-container"
          style={{
            position: 'relative',
            width: '100%',
            height: '56vh',
            minHeight: '400px',
            maxHeight: '600px',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'flex-end',
            backgroundImage: `linear-gradient(to top, var(--bg-primary, #070708) 0%, rgba(var(--bg-primary-rgb, 7,7,8), 0.6) 40%, transparent 100%)`,
            boxShadow: '0 20px 30px rgba(0, 0, 0, 0.8)',
            zIndex: 1
          }}
        >
          <div style={{ position: 'absolute', inset: 0, zIndex: -1, transform: 'scale(1.02)', filter: 'brightness(0.7) contrast(1.1)' }}>
            <img
              src={getBackdropUrl(heroItem.backdropPath, 'original') || getPosterUrl(heroItem.posterPath, 'large')}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, var(--bg-primary, #070708) 0%, transparent 60%), linear-gradient(to top, var(--bg-primary, #070708) 0%, transparent 50%)' }} />
          </div>
          <div style={{ padding: '24px 20px', width: '100%', maxWidth: '800px', margin: '0 auto', textAlign: 'left' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: heroBadgeConfig.bg, border: heroBadgeConfig.border, color: heroBadgeConfig.color, padding: '4px 10px', borderRadius: '20px', fontSize: '0.62rem', fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '12px' }}>
              {heroBadgeConfig.icon}{heroBadgeConfig.label}
            </div>
            <h1 style={{ fontSize: 'clamp(1.8rem, 5vw, 2.8rem)', fontWeight: 950, letterSpacing: '-0.04em', margin: '0 0 8px 0', lineHeight: 1.1, textShadow: '0 4px 12px rgba(0,0,0,0.6)' }}>
              {(heroItem as Movie).title || (heroItem as TVShow).name}
            </h1>
            <p style={{ fontSize: '0.85rem', color: 'rgba(255, 255, 255, 0.7)', lineHeight: '1.5', maxWidth: '520px', margin: '0 0 16px 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {heroItem.overview}
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => onItemClick(heroItem)} className="featured-play-btn tv-focusable" style={{ background: '#ffffff', color: '#000000', border: 'none', borderRadius: '12px', padding: '10px 20px', fontWeight: 900, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', boxShadow: '0 4px 14px rgba(255,255,255,0.25)' }}>
                <Play size={14} fill="#000" /> {t('watch_info')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab bar */}
      <div style={{ padding: '24px 20px 12px', maxWidth: '800px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.03)', padding: '4px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.05)' }}>
          {tabLabels.map((tab) => (
            <button
              key={tab.id}
              onClick={() => { triggerHaptic('light'); setActiveTab(tab.id as any); }}
              className={`browse-news-tab-btn${activeTab === tab.id ? ' active' : ''} tv-focusable`}
              style={{ flex: 1, height: '36px', background: activeTab === tab.id ? 'rgba(255, 255, 255, 0.08)' : 'transparent', border: activeTab === tab.id ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid transparent', color: activeTab === tab.id ? '#fff' : 'rgba(255,255,255,0.45)', fontSize: '0.72rem', fontWeight: activeTab === tab.id ? 850 : 600, borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', textTransform: 'uppercase', letterSpacing: '0.04em', transition: 'all 0.2s' }}
            >
              {tab.icon}{tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Feed */}
      <div style={{ padding: '0 20px', maxWidth: '800px', margin: '0 auto' }}>
        <AnimatePresence mode="wait">

          {/* ── CATEGORIES TAB ── */}
          {activeTab === 'categories' ? (
            <motion.div
              key="categories"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}
            >
              {genresWithImages.map((genre) => (
                <button
                  key={genre.id}
                  onClick={() => { triggerHaptic('medium'); onSelectedGenreChange(genre.id); }}
                  className="genre-editorial-card tv-focusable"
                  style={{ position: 'relative', aspectRatio: '16/9', borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.08)', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '12px 16px', cursor: 'pointer', color: '#ffffff', outline: 'none', textAlign: 'left', width: '100%', boxSizing: 'border-box', background: 'var(--bg-card, #121214)' }}
                >
                  {genre.imagePath && (
                    <img src={genre.imagePath} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 1, opacity: 0.5, transition: 'transform 0.4s ease' }} className="genre-card-bg" loading="lazy" />
                  )}
                  <div style={{ position: 'absolute', inset: 0, zIndex: 2, background: `linear-gradient(to top, rgba(var(--bg-primary-rgb, 7,7,8), 0.95) 0%, rgba(var(--bg-primary-rgb, 7,7,8), 0.3) 100%)` }} />
                  <span style={{ position: 'relative', zIndex: 3, fontWeight: 900, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'inline-flex', alignItems: 'center' }}>
                    {genre.name}
                  </span>
                </button>
              ))}
            </motion.div>

          /* ── COMING SOON TAB — Month-grouped calendar view ── */
          ) : activeTab === 'coming' ? (
            <motion.div
              key="coming"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              style={{ display: 'flex', flexDirection: 'column', gap: '0' }}
            >
              {upcomingByMonth.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 0', color: 'rgba(255,255,255,0.35)', fontSize: '0.9rem' }}>
                  No upcoming releases found
                </div>
              ) : (
                upcomingByMonth.map((group) => (
                  <div key={group.key}>
                    {/* Month header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '24px 0 14px', position: 'sticky', top: 'calc(60px + env(safe-area-inset-top, 0px))', background: 'var(--bg-primary, #070708)', zIndex: 5 }}>
                      <span style={{ fontSize: '1rem', fontWeight: 950, color: '#fff', letterSpacing: '-0.02em', textTransform: 'uppercase' }}>{group.label}</span>
                      <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.08)' }} />
                      <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.06)', padding: '3px 10px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.08)' }}>
                        {group.items.length} film{group.items.length !== 1 ? 's' : ''}
                      </span>
                    </div>

                    {/* Movies in this month */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                      {group.items.map((item: any, idx: number) => {
                        const isLast = idx === group.items.length - 1;
                        const releaseDate = formatReleaseDate(item);
                        return (
                          <div
                            key={item.id}
                            className="seamless-news-row tv-focusable"
                            tabIndex={0}
                            style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', paddingBottom: '20px', paddingTop: '4px', borderBottom: isLast ? 'none' : '1px solid rgba(255, 255, 255, 0.05)', cursor: 'pointer', outline: 'none' }}
                            onClick={() => onItemClick(item)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                onItemClick(item);
                              }
                            }}
                          >
                            {/* Poster thumbnail */}
                            <div style={{ flexShrink: 0, width: '80px', aspectRatio: '2/3', borderRadius: '10px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', background: '#111', position: 'relative' }}>
                              <img
                                src={getPosterUrl(item.posterPath, 'medium')}
                                alt={item.title}
                                loading="lazy"
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              />
                            </div>

                            {/* Info */}
                            <div style={{ flex: 1, paddingTop: '4px' }}>
                              {/* Release date badge */}
                              {releaseDate && (
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: 'rgba(255, 255, 255, 0.08)', border: '1px solid rgba(255, 255, 255, 0.15)', color: '#ffffff', padding: '2px 8px', borderRadius: '6px', fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: '6px' }}>
                                  <Calendar size={9} />{releaseDate}
                                </div>
                              )}
                              <h3 style={{ margin: '0 0 6px', fontSize: '0.95rem', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.25, color: '#fff' }}>
                                {item.title}
                              </h3>
                              <p style={{ margin: 0, fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', lineHeight: '1.4', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                {item.overview || 'No description available.'}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </motion.div>

          /* ── TRENDING TAB — Editorial feed ── */
          ) : (
            <motion.div
              key="everyone"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}
            >
              {remainingTrendingList.map((item, idx) => {
                const isTV = (item as any).mediaType === 'tv' || !(item as any).title;
                const isLast = idx === remainingTrendingList.length - 1;
                return (
                  <div
                    key={item.id}
                    className="seamless-news-row tv-focusable"
                    tabIndex={0}
                    style={{ display: 'flex', flexDirection: 'column', width: '100%', paddingBottom: '24px', borderBottom: isLast ? 'none' : '1px solid rgba(255, 255, 255, 0.06)', willChange: 'transform', transform: 'translate3d(0, 0, 0)', cursor: 'pointer', outline: 'none' }}
                    onClick={() => onItemClick(item)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onItemClick(item);
                      }
                    }}
                  >
                    <div className="news-media-box" style={{ position: 'relative', aspectRatio: '16/9', width: '100%', borderRadius: '14px', overflow: 'hidden', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                      <img src={getBackdropUrl(item.backdropPath, 'medium') || getPosterUrl(item.posterPath, 'large')} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                      <div style={{ position: 'absolute', top: '12px', left: '12px', background: 'rgba(7, 7, 8, 0.85)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', padding: '5px 10px', borderRadius: '8px', fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '5px', textTransform: 'uppercase' }}>
                        {isTV ? <Tv size={10} /> : <Film size={10} />}
                        {isTV ? t('tv_series') : t('movie')}
                      </div>
                    </div>
                    <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', textAlign: 'left' }}>
                      <div style={{ flex: 1, marginRight: '16px' }}>
                        <h3 className="editorial-title-text" style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.25, color: '#fff' }}>
                          {(item as Movie).title || (item as TVShow).name}
                        </h3>
                        <p style={{ margin: '8px 0 0', fontSize: '0.82rem', color: 'rgba(255, 255, 255, 0.6)', lineHeight: '1.5', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontWeight: 400 }}>
                          {item.overview}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// Minimal, hardware-accelerated CSS animations and variables for high FPS
const CustomStyles = React.memo(() => (
  <style>{`
    .seamless-news-row {
      transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }
    
    .news-media-box img {
      transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .seamless-news-row:hover .news-media-box img {
      transform: scale(1.02);
    }

    .editorial-title-text {
      transition: color 0.2s;
    }
    .seamless-news-row:hover .editorial-title-text {
      opacity: 0.9;
    }

    .genre-editorial-card {
      transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.3s;
    }
    .genre-editorial-card:hover {
      transform: scale(1.02);
      border-color: rgba(255,255,255,0.18);
    }
    .genre-editorial-card:hover .genre-card-bg {
      transform: scale(1.05);
    }

    .editorial-poster-card {
      transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.3s;
    }
    .editorial-poster-card:hover {
      transform: scale(1.05) translateY(-2px);
      border-color: rgba(255,255,255,0.25);
    }

    /* TV focus states */
    .tv-focusable:focus-visible,
    .tv-focusable:focus {
      outline: none !important;
      box-shadow: none !important;
      border-color: transparent !important;
    }

    .editorial-poster-card.tv-focusable:focus {
      transform: scale(1.06) !important;
      box-shadow: 0 0 0 3.5px #ffffff !important;
      border-color: #ffffff !important;
    }

    .genre-editorial-card.tv-focusable:focus {
      transform: scale(1.05) !important;
      box-shadow: 0 0 0 3.5px #ffffff !important;
      border-color: #ffffff !important;
    }

    .news-media-box.tv-focusable:focus {
      transform: scale(1.03) !important;
      box-shadow: 0 0 0 3.5px #ffffff !important;
      border-color: #ffffff !important;
    }

    button.tv-focusable:focus {
      background: #ffffff !important;
      color: #000000 !important;
      box-shadow: 0 0 0 3px #ffffff !important;
    }

    .search-overlay-back-btn.tv-focusable:focus {
      background: rgba(255, 255, 255, 0.12) !important;
      border-radius: 8px !important;
      box-shadow: none !important;
    }
  `}</style>
));
CustomStyles.displayName = 'CustomStyles';
