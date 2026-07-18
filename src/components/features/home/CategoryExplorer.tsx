import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import type { Movie, TVShow } from '../../../types';
import { getPosterUrl, getMovieDetails, getMovieInTheaters } from '../../../services/tmdb';
import { triggerHaptic } from '../../../utils/haptics';
import { t } from '../../../utils/i18n';

interface CategoryExplorerProps {
  title: string;
  movies: (Movie | TVShow)[];
  onClose: () => void;
  onMovieClick: (movie: Movie | TVShow) => void;
}

const CHUNK_SIZE = 20;

// ─────────────────────────────────────────────────────────────────────────────
// CategoryCard: Memoized card component with image caching/transitions
// ─────────────────────────────────────────────────────────────────────────────
const CategoryCard = React.memo(({ movie, onClick }: { movie: Movie | TVShow; onClick: () => void }) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const displayTitle = (movie as Movie).title || (movie as TVShow).name;
  const posterPath = movie.posterPath || (movie as any).poster_path;

  // CAM/inTheaters — verified live against TMDB when prop says true
  const releaseDate = (movie as Movie).releaseDate || (movie as any).release_date || '';
  const isUpcomingInitial = !!(releaseDate && new Date(releaseDate).getTime() > Date.now());
  const [inTheaters, setInTheaters] = useState<boolean>(!!((movie as Movie).inTheaters) && !isUpcomingInitial);

  useEffect(() => {
    const isMovie = !(movie as any).name;
    if (!isMovie) return;

    const isUpcoming = !!(releaseDate && new Date(releaseDate).getTime() > Date.now());

    // Only skip TMDB fetch when definitively false — the movie is confirmed not in theaters.
    // For `undefined` (list endpoints don't include release_dates) and `true` (might be stale),
    // always do a live TMDB check so the badge is always accurate.
    if ((movie as Movie).inTheaters === false) {
      setInTheaters(false);
      return;
    }

    let isMounted = true;
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (entry && entry.isIntersecting) {
        observer.disconnect();
        getMovieInTheaters(movie.id)
          .then((inT) => {
            if (isMounted) {
              setInTheaters(inT && !isUpcoming);
            }
          })
          .catch(() => {
            if (isMounted) setInTheaters(!!(movie as Movie).inTheaters && !isUpcoming);
          });
      }
    }, { rootMargin: '100px' });

    if (cardRef.current) observer.observe(cardRef.current);
    return () => { isMounted = false; observer.disconnect(); };
  }, [movie.id, (movie as Movie).inTheaters, releaseDate]);

  const handleImageLoad = () => {
    setImageLoaded(true);
  };

  const handleImageError = () => {
    setHasError(true);
    setImageLoaded(true);
  };

  const imageSrc = hasError || !posterPath
    ? `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300" viewBox="0 0 200 300"><rect width="100%" height="100%" fill="%2318181b"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="800" font-size="13" fill="%2371717a">NO POSTER</text></svg>`
    : getPosterUrl(posterPath, 'medium');

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };

  const isTV = typeof document !== 'undefined' && document.body.classList.contains('tv-mode');

  return (
    <div
      ref={cardRef}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      className="category-explorer-card tv-focusable"
      style={{
        cursor: 'pointer',
        WebkitTapHighlightColor: 'transparent',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        outline: 'none'
      }}
    >
      <div 
        className="category-explorer-image-wrapper"
        style={{
          position: 'relative',
          aspectRatio: '2/3',
          borderRadius: '12px',
          overflow: 'hidden',
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.07) 0%, rgba(255, 255, 255, 0.02) 100%)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
          transition: 'all 0.15s ease'
        }}
      >
        {/* Shimmer Placeholder */}
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
          src={imageSrc}
          alt={displayTitle}
          onLoad={handleImageLoad}
          onError={handleImageError}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: imageLoaded ? 1 : 0,
            transition: 'opacity 0.25s ease-out',
            pointerEvents: 'none',
            zIndex: 2,
          }}
        />
        {/* CAM Badge */}
        {inTheaters && (
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
        )}
      </div>
      <h3 style={{
        fontSize: '11.5px',
        fontWeight: 600,
        color: '#FFFFFF',
        margin: '2px 0 0 0',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
        lineHeight: '1.3',
        opacity: 0.85,
      }}>
        {displayTitle}
      </h3>
    </div>
  );
});

CategoryCard.displayName = 'CategoryCard';

export default function CategoryExplorer({ title, movies, onClose, onMovieClick }: CategoryExplorerProps) {
  const isTVMode = typeof document !== 'undefined' && document.body.classList.contains('tv-mode');
  const [visibleCount, setVisibleCount] = useState(CHUNK_SIZE);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && visibleCount < movies.length) {
        setVisibleCount(prev => Math.min(prev + CHUNK_SIZE, movies.length));
      }
    }, { 
      root: null, // viewport
      rootMargin: '400px', // load ahead
      threshold: 0.1 
    });

    if (sentinelRef.current) observerRef.current.observe(sentinelRef.current);

    return () => observerRef.current?.disconnect();
  }, [visibleCount, movies.length]);

  return (
    <motion.div
      className="no-scrollbar"
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', damping: 26, stiffness: 240 }}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 3000,
        background: '#09090b',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        overscrollBehavior: 'contain',
      }}
    >
      {/* Sticky Floating Header Capsule */}
      <div style={{
        position: 'sticky',
        top: 'calc(12px + env(safe-area-inset-top, 0px))',
        margin: '12px 12px 0',
        height: '52px',
        background: 'rgba(15, 15, 15, 0.95)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '14px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
        zIndex: 3001,
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
      }}>
        <button
          onClick={() => { triggerHaptic('light'); onClose(); }}
          aria-label="Back"
          className="search-overlay-back-btn tv-focusable"
          style={{
            background: 'transparent',
            border: 'none',
            color: '#FFFFFF',
            cursor: 'pointer',
            padding: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: 0.9,
            outline: 'none',
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        {/* Divider */}
        <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.15)', margin: '0 12px' }} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{
            fontSize: '14px',
            fontWeight: 700,
            color: '#FFFFFF',
            margin: 0,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            letterSpacing: '-0.2px',
            lineHeight: 1.2
          }}>
            {title}
          </h2>
          <p style={{
            fontSize: '10px',
            color: 'rgba(255, 255, 255, 0.5)',
            margin: '0',
            fontWeight: 600,
            letterSpacing: '0.2px'
          }}>
            {movies.length} {movies.length === 1 ? 'title' : 'titles'} in this collection
          </p>
        </div>
      </div>

      {/* Grid Content */}
      <div style={{ 
        padding: isTVMode ? '80px 48px 120px' : '80px 16px 120px',
        display: 'grid',
        gridTemplateColumns: isTVMode ? 'repeat(auto-fill, minmax(130px, 1fr))' : 'repeat(auto-fill, minmax(100px, 1fr))',
        gap: isTVMode ? '28px 18px' : '20px 12px',
      }}>
        {movies.slice(0, visibleCount).map((movie, index) => (
          <CategoryCard
            key={`${movie.id}-${index}`}
            movie={movie}
            onClick={() => {
              triggerHaptic('medium');
              onMovieClick(movie);
            }}
          />
        ))}
        
        {/* Intersection Sentinel */}
        {visibleCount < movies.length && (
          <div ref={sentinelRef} style={{ height: '40px', gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: '20px', height: '20px', border: '2px solid rgba(255,255,255,0.1)', borderTopColor: '#ffffff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          </div>
        )}
      </div>

      {/* Style overrides for TV D-pad focus indicators */}
      <style>{`
        .category-explorer-card.tv-focusable {
          transition: transform 0.18s cubic-bezier(0.16, 1, 0.3, 1) !important;
        }
        .category-explorer-card.tv-focusable:focus {
          transform: scale(1.06) !important;
        }
        .category-explorer-card.tv-focusable:focus .category-explorer-image-wrapper {
          box-shadow: 0 0 0 3px #ffffff !important;
          border-color: #ffffff !important;
        }
        .search-overlay-back-btn.tv-focusable:focus {
          background: rgba(255, 255, 255, 0.12) !important;
          border-radius: 8px !important;
        }
      `}</style>
    </motion.div>
  );
}
