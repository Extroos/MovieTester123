import React, { useEffect, useRef, useCallback } from 'react';
import type { Movie, TVShow } from '../../../types';
import { getPosterUrl, getBackdropUrl } from '../../../services/tmdb';
import { triggerHaptic } from '../../../utils/haptics';
import { COLORS } from '../../../constants';

interface ContentRowProps {
  title: React.ReactNode;
  movies: (Movie | TVShow)[];
  onMovieClick?: (movie: Movie | TVShow) => void;
  onSeeAll?: () => void;
  onReaction?: (itemId: string, mediaType: string, targetUserId: string, emoji: string) => void;
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  tabs?: { id: string; label: string }[];
  isWide?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// ContentCard: Hardware-accelerated transitions & CSS-hover layers.
// Snap-aligned at start for native touch swiping responsiveness.
// ─────────────────────────────────────────────────────────────────────────────
const ContentCard = React.memo(({ movie, onClick, onReaction, index, isWide = false }: {
  movie: Movie | TVShow,
  onClick?: (movie: Movie | TVShow) => void,
  onReaction?: (itemId: string, mediaType: string, targetUserId: string, emoji: string) => void,
  index: number,
  isWide?: boolean
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const shimmerRef = useRef<HTMLDivElement>(null);

  const handleClick = useCallback(() => {
    triggerHaptic('medium');
    onClick?.(movie);
  }, [onClick, movie]);

  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    if (shimmerRef.current) {
      shimmerRef.current.remove();
    }
    e.currentTarget.style.opacity = '1';
  }, []);

  const handleImageError = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    e.currentTarget.onerror = null;
    // Create elegant local inline SVG representation instead of hitting slow/unreliable external HTTP placeholder service
    e.currentTarget.src = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300" viewBox="0 0 200 300"><rect width="100%" height="100%" fill="%2318181b"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="800" font-size="13" fill="%2371717a">NO POSTER</text></svg>`;
    e.currentTarget.style.opacity = '1';
    if (shimmerRef.current) shimmerRef.current.remove();
  }, []);

  const displayTitle = (movie as Movie).title || (movie as TVShow).name;
  const watchedBy = (movie as any).watchedBy;
  const progress = (movie as any).progress;
  const duration = (movie as any).duration;

  return (
    <div
      ref={cardRef}
      className="content-card movie-card"
      onClick={handleClick}
      role="button"
      tabIndex={0}
      style={{
        minWidth: isWide ? '240px' : '120px',
        width: isWide ? '240px' : '120px',
        flexShrink: 0,
        cursor: 'pointer',
        position: 'relative',
        zIndex: 1,
        WebkitTapHighlightColor: 'transparent',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        scrollSnapAlign: 'start', // Lock in place beautifully during swipes
        ['--stagger' as any]: Math.min(index, 8),
      }}
    >
      {/* CSS-hover inner wrapper — pure hardware transitions */}
      <div
        className="content-card-inner"
        style={{
          position: 'relative',
          aspectRatio: isWide ? '16/9' : '2/3',
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.01) 100%)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          borderRadius: '16px',
          overflow: 'hidden',
          transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
      >
        {/* Shimmer */}
        <div
          ref={shimmerRef}
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.03) 75%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.5s infinite linear',
            zIndex: 1,
          }}
        />

        <img
          src={isWide ? (((movie as any).backdropPath || (movie as any).backdrop_path) ? getBackdropUrl((movie as any).backdropPath || (movie as any).backdrop_path) : getPosterUrl(movie.posterPath, 'medium')) : getPosterUrl(movie.posterPath, 'medium')}
          alt={displayTitle}
          loading="lazy"
          decoding="async"
          onLoad={handleImageLoad}
          onError={handleImageError}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: 0,
            transition: 'opacity 0.5s ease-out',
            pointerEvents: 'none',
            zIndex: 2,
          }}
        />

        {/* User's last watched episode badge (Continue Watching) */}
        {(movie as any).episode && (
          <div style={{
            position: 'absolute',
            top: '8px',
            left: '8px',
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            color: '#ffffff',
            fontSize: '9px',
            fontWeight: 900,
            padding: '3px 8px',
            borderRadius: '6px',
            zIndex: 10,
            letterSpacing: '0.02em',
          }}>
            {(movie as any).season ? `S${(movie as any).season}:E${(movie as any).episode}` : `EP ${(movie as any).episode}`}
          </div>
        )}

        {/* Dynamic Watch Progress Bar */}
        {progress !== undefined && duration && duration > 0 && (
          <div style={{
            position: 'absolute',
            bottom: '8px',
            left: '8px',
            right: '8px',
            height: '3px',
            background: 'rgba(255,255,255,0.2)',
            borderRadius: '2px',
            overflow: 'hidden',
            zIndex: 15,
          }}>
            <div style={{
              width: `${(progress / duration) * 100}%`,
              height: '100%',
              background: '#ffffff',
            }} />
          </div>
        )}

        {/* Friend Watching Overlay */}
        {watchedBy && (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            zIndex: 20,
            pointerEvents: 'none',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 8px',
              background: 'linear-gradient(to top, rgba(9,9,11,0.95), transparent)',
              width: '100%',
            }}>
              {(movie as any).isLive ? (
                // Live Watching Layout: Stacked avatars on the left, WATCHING eye icon, episode on the right
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      {(movie as any).watchers?.slice(0, 3).map((w: any, i: number) => (
                        <div
                          key={w.friend.id}
                          style={{
                            width: '20px',
                            height: '20px',
                            borderRadius: '50%',
                            border: '1.5px solid #09090b',
                            overflow: 'hidden',
                            marginLeft: i === 0 ? 0 : '-8px',
                            zIndex: 10 - i,
                            background: '#0a0a0a'
                          }}
                        >
                          <img
                            src={w.friend.avatar || 'https://upload.wikimedia.org/wikipedia/commons/0/0b/Netflix-avatar.png'}
                            alt={w.friend.name}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        </div>
                      ))}
                      {(movie as any).watchers?.length > 3 && (
                        <div style={{ fontSize: '8px', color: '#fff', marginLeft: '2px', fontWeight: 900 }}>
                          +{(movie as any).watchers.length - 3}
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '3px', background: '#ffffff', padding: '2px 5px', borderRadius: '4px' }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#000000" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                      </svg>
                      <span style={{ fontSize: '0.55rem', fontWeight: 900, color: '#000000', letterSpacing: '0.02em' }}>WATCHING</span>
                    </div>
                  </div>

                  {(movie as any).friendEpisode && (
                    <div style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '0.55rem', fontWeight: 800, padding: '2px 5px', borderRadius: '4px' }}>
                      E{(movie as any).friendEpisode}
                    </div>
                  )}
                </>
              ) : (
                // Historical Layout: Episode on left, stacked avatars on the right
                <>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    {(movie as any).friendEpisode && (
                      <div style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '0.55rem', fontWeight: 800, padding: '2px 5px', borderRadius: '4px' }}>
                        E{(movie as any).friendEpisode}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    {(movie as any).watchers?.slice(0, 3).map((w: any, i: number) => (
                      <div
                        key={w.friend.id}
                        style={{
                          width: '20px',
                          height: '20px',
                          borderRadius: '50%',
                          border: '1.5px solid #09090b',
                          overflow: 'hidden',
                          marginLeft: i === 0 ? 0 : '-8px',
                          zIndex: 10 - i,
                          background: '#0a0a0a'
                        }}
                      >
                        <img
                          src={w.friend.avatar || 'https://upload.wikimedia.org/wikipedia/commons/0/0b/Netflix-avatar.png'}
                          alt={w.friend.name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      </div>
                    ))}
                    {(movie as any).watchers?.length > 3 && (
                      <div style={{ fontSize: '8px', color: '#fff', marginLeft: '2px', fontWeight: 900 }}>
                        +{(movie as any).watchers.length - 3}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Reaction overlays on hover - crisp design */}
        {watchedBy && onReaction && (
          <div style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            background: 'linear-gradient(to top, rgba(9,9,11,0.98) 0%, transparent 100%)',
            zIndex: 25,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            alignItems: 'center',
            padding: '12px 8px',
            textAlign: 'center',
            opacity: 0,
            transition: 'opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
            pointerEvents: 'none',
          }}
            className="card-reaction-panel"
          >
            <div style={{ display: 'flex', gap: '6px' }}>
              {['🔥', '❤️', '👏', '😂'].map(emoji => (
                <button
                  key={emoji}
                  onClick={(e) => {
                    e.stopPropagation();
                    import('../../../utils/haptics').then(m => m.triggerHaptic('light'));
                    onReaction(
                      String(movie.id),
                      (movie as any).name ? 'tv' : 'movie',
                      (movie as any).watchedBy.id,
                      emoji
                    );
                  }}
                  style={{
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '50%',
                    width: '28px',
                    height: '28px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    pointerEvents: 'auto',
                    transition: 'transform 0.15s ease',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.15)')}
                  onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// ContentRow: CSS Scroll Snapping for extreme native fluid responsiveness.
// ─────────────────────────────────────────────────────────────────────────────
const ContentRow = React.memo(function ContentRow({ 
  title, movies, onMovieClick, onSeeAll, onReaction,
  activeTab, onTabChange, tabs, isWide = false
}: ContentRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [isRendered, setIsRendered] = React.useState(false);

  useEffect(() => {
    const el = rowRef.current;
    if (!el || isRendered) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          el.classList.add('is-visible');
          setIsRendered(true);
          observer.disconnect();
        }
      },
      { rootMargin: '400px 0px', threshold: 0.01 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [isRendered]);

  if (!movies || movies.length === 0) return null;

  return (
    <div
      ref={rowRef}
      className="content-row-container"
      style={{ marginBottom: '1.8rem', position: 'relative', zIndex: 10 }}
    >
      {/* Row Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingLeft: '4vw',
        paddingRight: '4vw',
        marginBottom: '0.3rem',
      }}>
        <h2 style={{
          fontSize: '0.95rem',
          fontWeight: 900,
          color: '#FFFFFF',
          margin: 0,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          lineHeight: '1.2',
        }}>
          {title}
        </h2>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {tabs && onTabChange && activeTab && (
            <div style={{
              display: 'flex',
              background: 'rgba(255, 255, 255, 0.05)',
              padding: '1.5px',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              gap: '1px',
              backdropFilter: 'blur(10px)',
            }}>
              {tabs.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    className="mobile-touch-target"
                    onClick={(e) => {
                      e.stopPropagation();
                      import('../../../utils/haptics').then(m => m.triggerHaptic('light'));
                      onTabChange(tab.id);
                    }}
                    style={{
                      height: '20px',
                      padding: '2.5px 12px',
                      borderRadius: '6px',
                      fontSize: '8.5px',
                      fontWeight: 900,
                      background: isActive ? '#ffffff' : 'transparent',
                      color: isActive ? '#000000' : 'rgba(255, 255, 255, 0.6)',
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease-out',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      outline: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          )}

          {onSeeAll && (
            <button
              className="mobile-touch-target"
              onClick={(e) => {
                e.stopPropagation();
                triggerHaptic('light');
                onSeeAll();
              }}
              style={{
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                height: '24px',
                padding: '3px 14px',
                borderRadius: '8px',
                color: '#FFFFFF',
                fontSize: '9.5px',
                fontWeight: 900,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '5px',
                transition: 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), background 0.25s ease',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.03)';
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
              }}
            >
              See All
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Scroll Container with native snapping */}
      <div style={{ position: 'relative', width: '100%' }}>
        <div
          className="no-scrollbar content-row-scroll"
          style={{
            display: 'flex',
            gap: '10px',
            overflowX: 'auto',
            overflowY: 'hidden',
            paddingLeft: '4vw',
            paddingRight: '4vw',
            paddingTop: '8px',
            paddingBottom: '8px',
            WebkitOverflowScrolling: 'touch',
            touchAction: 'pan-x pan-y',
            overscrollBehaviorX: 'contain',
            scrollSnapType: 'x mandatory', // Smooth touch lock-snap on swipe
            scrollPaddingLeft: '4vw', // Force browser snap to align with left padding
            scrollPaddingRight: '4vw', // Force browser snap to align with right padding
          }}
        >
          {isRendered ? (
            movies.map((movie, index) => (
              <ContentCard
                key={`${movie.id}-${(movie as any).name ? 'tv' : 'movie'}`}
                movie={movie}
                index={index}
                onClick={onMovieClick}
                onReaction={onReaction}
                isWide={isWide}
              />
            ))
          ) : (
            <div style={{ height: '180px', display: 'flex', width: '100%', pointerEvents: 'none' }} />
          )}
          {/* Elegant spacer div to fix CSS scroll-padding-right bug in mobile browsers */}
          <div style={{ minWidth: '4vw', width: '4vw', flexShrink: 0, height: '8px', pointerEvents: 'none' }} />
        </div>
      </div>
    </div>
  );
});

export default ContentRow;
