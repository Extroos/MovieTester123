import React, { useEffect, useRef, useCallback } from 'react';
import type { Movie, TVShow } from '../../../types';
import { getPosterUrl, getBackdropUrl, API_KEY, getMovieDetails, getMovieInTheaters } from '../../../services/tmdb';
import { triggerHaptic } from '../../../utils/haptics';
import { COLORS } from '../../../constants';
import { t } from '../../../utils/i18n';
import { updateDynamicBackdropColor } from '../../../utils/tvColorHelper';

// Cache the TV mode check at module level — no need to re-read localStorage per card focus
const _isTVMode = () => typeof document !== 'undefined' && document.body.classList.contains('tv-mode');

// Module-level deduplication for image recovery fetches.
// If multiple cards show the same broken movie ID, only one TMDB fetch fires.
// Keys are cleared when the fetch resolves (success or failure).
const recoveringIds = new Set<string>();

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
  isContinueRow?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// ContentCard: Hardware-accelerated transitions & CSS-hover layers.
// Snap-aligned at start for native touch swiping responsiveness.
// ─────────────────────────────────────────────────────────────────────────────
// Cache for in-theater API checks to prevent redundant observer checks
const inTheatersCache = new Map<string, boolean>();

const ContentCard = React.memo(({ movie, onClick, onReaction, index, isWide = false }: {
  movie: Movie | TVShow,
  onClick?: (movie: Movie | TVShow) => void,
  onReaction?: (itemId: string, mediaType: string, targetUserId: string, emoji: string) => void,
  index: number,
  isWide?: boolean
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [imageLoaded, setImageLoaded] = React.useState(false);
  const [hasError, setHasError] = React.useState(false);
  const [recoveredSrc, setRecoveredSrc] = React.useState<string | null>(null);
  const isUpcomingInitial = !!((movie as Movie).releaseDate && new Date((movie as Movie).releaseDate || '').getTime() > Date.now());
  const [inTheaters, setInTheaters] = React.useState<boolean>(() => {
    if ((movie as Movie).inTheaters !== undefined) return !!(movie as Movie).inTheaters;
    return inTheatersCache.get(movie.id.toString()) || false;
  });

  useEffect(() => {
    const isMovie = !(movie as any).name;
    if (!isMovie) return;

    // Check memory cache first
    const cached = inTheatersCache.get(movie.id.toString());
    if (cached !== undefined) {
      setInTheaters(cached);
      return;
    }

    const isUpcoming = !!((movie as Movie).releaseDate && new Date((movie as Movie).releaseDate || '').getTime() > Date.now());

    // If definitively false, trust it and skip network — the movie is not in theaters.
    // For `undefined` (most list endpoints don't include release_dates) and `true`
    // (might be stale cached data), we always do a live TMDB check.
    if ((movie as Movie).inTheaters === false) {
      setInTheaters(false);
      inTheatersCache.set(movie.id.toString(), false);
      return;
    }

    let isMounted = true;
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (entry && entry.isIntersecting) {
        observer.disconnect();

        getMovieInTheaters(movie.id)
          .then((inT) => {
            const isUpcomingCheck = !!((movie as Movie).releaseDate && new Date((movie as Movie).releaseDate || '').getTime() > Date.now());
            const finalVal = inT && !isUpcomingCheck;
            inTheatersCache.set(movie.id.toString(), finalVal);
            if (isMounted) {
              setInTheaters(finalVal);
            }
          })
          .catch(() => {
            const finalVal = !!(movie as Movie).inTheaters && !isUpcoming;
            inTheatersCache.set(movie.id.toString(), finalVal);
            if (isMounted) setInTheaters(finalVal);
          });
      }
    }, {
      rootMargin: '100px',
    });

    if (cardRef.current) {
      observer.observe(cardRef.current);
    }

    return () => {
      isMounted = false;
      observer.disconnect();
    };
  }, [movie.id, (movie as Movie).inTheaters, (movie as Movie).releaseDate]);

  const handleClick = useCallback(() => {
    triggerHaptic('medium');
    onClick?.(movie);
  }, [onClick, movie]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  }, [handleClick]);

  const handleImageLoad = useCallback(() => {
    setImageLoaded(true);
  }, []);

  const handleImageError = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const failedSrc = e.currentTarget.src;

    // Don't recurse if recovery URL itself failed
    if (recoveredSrc && failedSrc === recoveredSrc) {
      setHasError(true);
      setImageLoaded(true);
      return;
    }

    // Accept both number and string IDs (Supabase returns item_id as string)
    const rawId = movie.id;
    const numericId = rawId ? parseInt(String(rawId), 10) : NaN;

    if (!isNaN(numericId) && numericId > 0) {
      const recoveryKey = `${numericId}_${isWide ? 'wide' : 'poster'}`;

      // Skip if another card is already fetching recovery for this same ID
      if (recoveringIds.has(recoveryKey)) {
        // Will show placeholder while the in-flight request resolves
        return;
      }

      // Auto-recover: hit TMDB API to get the real current image path
      const size = isWide ? 'w780' : 'w342';
      const preferField = isWide ? 'backdrop_path' : 'poster_path';
      const fallbackField = isWide ? 'poster_path' : 'backdrop_path';

      recoveringIds.add(recoveryKey);
      fetch(`https://api.themoviedb.org/3/movie/${numericId}?api_key=${API_KEY}&language=en-US`)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          const path = data?.[preferField] || data?.[fallbackField];
          if (path) {
            setRecoveredSrc(`https://image.tmdb.org/t/p/${size}${path}`);
            setImageLoaded(false);
          } else {
            setHasError(true);
            setImageLoaded(true);
          }
        })
        .catch(() => {
          setHasError(true);
          setImageLoaded(true);
        })
        .finally(() => {
          recoveringIds.delete(recoveryKey);
        });
    } else {
      // No numeric ID — can't recover, show placeholder
      setHasError(true);
      setImageLoaded(true);
    }
  }, [movie, isWide, recoveredSrc]);


  const displayTitle = (movie as Movie).title || (movie as TVShow).name;
  const watchedBy = (movie as any).watchedBy;
  const progress = (movie as any).progress;
  const duration = (movie as any).duration;

  // Compute the primary image src from stored data
  const computeImageSrc = (): string => {
    // Support both camelCase and snake_case field names
    const pPath = (movie as any).posterPath || (movie as any).poster_path;
    const bPath = (movie as any).backdropPath || (movie as any).backdrop_path;

    const rawPath = isWide ? (bPath || pPath) : (pPath || bPath);

    if (!rawPath) return '/movie-placeholder.png';

    // Already a full URL — return as-is
    if (rawPath.startsWith('http://') || rawPath.startsWith('https://')) return rawPath;

    const size = isWide ? 'w780' : 'w342';
    return `https://image.tmdb.org/t/p/${size}${rawPath}`;
  };

  const imageSrc = recoveredSrc || computeImageSrc();

  // Reset all state when the movie changes (different item)
  const prevIdRef = useRef<number | string>(movie.id);
  if (prevIdRef.current !== movie.id) {
    prevIdRef.current = movie.id;
    if (hasError) setHasError(false);
    if (imageLoaded) setImageLoaded(false);
    if (recoveredSrc) setRecoveredSrc(null);
    const isUpcoming = !!((movie as Movie).releaseDate && new Date((movie as Movie).releaseDate || '').getTime() > Date.now());
    setInTheaters(!!(movie as Movie).inTheaters && !isUpcoming);
  }

  const getCardImageSrc = (): string => {
    if (hasError) {
      return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300" viewBox="0 0 200 300"><rect width="100%" height="100%" fill="%2318181b"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="800" font-size="13" fill="%2371717a">NO POSTER</text></svg>`;
    }
    return imageSrc;
  };

  const handleFocus = useCallback(() => {
    // Static import — no dynamic module loading overhead on every D-pad focus event
    if (_isTVMode()) {
      updateDynamicBackdropColor(
        movie.posterPath || (movie as any).poster_path ||
        movie.backdropPath || (movie as any).backdrop_path || null
      );
    }
  }, [movie]);

  return (
    <div
      ref={cardRef}
      className="content-card movie-card tv-focusable"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onFocus={handleFocus}
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
        scrollSnapAlign: 'start',
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
          // Only transition the properties that actually change — avoids scanning all CSS props on every render
          transition: 'border-color 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
      >
        {/* Shimmer */}
        {!imageLoaded && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.03) 75%)',
              backgroundSize: '200% 100%',
              animation: 'shimmer 1.5s infinite linear',
              zIndex: 1,
            }}
          />
        )}

        <img
          key={imageSrc}
          src={getCardImageSrc()}
          alt={displayTitle}
          decoding="async"
          loading="lazy"
          onLoad={handleImageLoad}
          onError={handleImageError}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: imageLoaded ? 1 : 0,
            transition: 'opacity 0.3s ease-out',
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
            background: 'rgba(15, 15, 15, 0.9)',
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

        {/* CAM Badge for Theater Releases */}
        {inTheaters ? (
          <div style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            background: '#ffffff',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            color: '#000000',
            fontSize: '8px',
            fontWeight: 950,
            padding: '2px 6px',
            borderRadius: '4px',
            zIndex: 10,
            letterSpacing: '0.04em',
            boxShadow: '0 2px 6px rgba(0, 0, 0, 0.4)',
          }}>
            CAM
          </div>
        ) : null}



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
                  className="content-row-reaction-btn"
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
                  }}
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
  activeTab, onTabChange, tabs, isWide = false, isContinueRow = false
 }: ContentRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);

  const isTVMode = typeof document !== 'undefined' && document.body.classList.contains('tv-mode');

  if ((!movies || movies.length === 0) && (!tabs || tabs.length === 0)) return null;

  return (
    <div
      ref={rowRef}
      className="content-row-container"
      style={{ 
        marginBottom: '1.8rem', 
        position: 'relative', 
        contentVisibility: isTVMode ? 'visible' : 'auto',
        containIntrinsicSize: isWide ? 'auto 180px' : 'auto 240px'
      }}
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
                    className="mobile-touch-target tv-focusable"
                    tabIndex={0}
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

          {onSeeAll && !isTVMode && (
            <button
              className="mobile-touch-target see-all-btn tv-focusable"
              tabIndex={0}
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
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              {t('see_all')}
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
            scrollSnapType: 'x mandatory',
            scrollPaddingLeft: '4vw',
            scrollPaddingRight: '4vw',
          }}
        >
          {movies.length > 0 ? (
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
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              minHeight: isWide ? '135px' : '180px',
              color: 'rgba(255, 255, 255, 0.4)',
              fontSize: '0.8rem',
              fontWeight: 700,
              gap: '8px'
            }}>
              <span>No activity found under this tab.</span>
            </div>
          )}

          {/* Append custom See All card inside category list if on TV Mode */}
          {isTVMode && onSeeAll && !(isContinueRow && movies.length <= 4) && (
            <div
              className="tv-focusable movie-card"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                triggerHaptic('light');
                onSeeAll();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  triggerHaptic('light');
                  onSeeAll();
                }
              }}
              style={{
                flexShrink: 0,
                width: isWide ? '240px' : '120px',
                cursor: 'pointer',
                position: 'relative',
                scrollSnapAlign: 'start',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            >
              <div
                className="content-card-inner"
                style={{
                  position: 'relative',
                  aspectRatio: isWide ? '16/9' : '2/3',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  transition: 'border-color 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                  boxSizing: 'border-box'
                }}
              >
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: 'rgba(255, 255, 255, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#ffffff' }}>
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </div>
                <span style={{ fontSize: '10px', fontWeight: 900, color: '#ffffff', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  {t('see_all')}
                </span>
              </div>
            </div>
          )}

          {/* Elegant spacer div to fix CSS scroll-padding-right bug in mobile browsers */}
          <div style={{ minWidth: '4vw', width: '4vw', flexShrink: 0, height: '8px', pointerEvents: 'none' }} />
        </div>
      </div>
    </div>
  );
});

export default ContentRow;
