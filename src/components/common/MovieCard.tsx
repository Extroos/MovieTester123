import React, { useState } from 'react';
import type { Movie } from '../../types';
import { getPosterUrl } from '../../services/tmdb';
import { COLORS } from '../../constants';

interface MovieCardProps {
  movie: Movie;
  onClick?: (movie: Movie) => void;
}

const MovieCard = React.memo(function MovieCard({ movie, onClick }: MovieCardProps) {
  const [imageLoaded, setImageLoaded] = useState(false);

  return (
    <div
      onClick={() => onClick?.(movie)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.(movie);
        }
      }}
      className="responsive-movie-card movie-card tv-focusable"
      tabIndex={0}
      style={{
        cursor: 'pointer',
        WebkitTapHighlightColor: 'transparent',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        outline: 'none',
        // Reveal animation on mount - Optimized to avoid blur during transition
        animation: 'revealCard 0.5s cubic-bezier(0.16, 1, 0.3, 1) both',
      }}
    >
      {/* Poster */}
      <div style={{
        position: 'relative',
        paddingBottom: '150%',
        borderRadius: '12px',
        overflow: 'hidden',
        backgroundColor: COLORS.bgCard,
        border: '1px solid rgba(255, 255, 255, 0.08)',
        transition: 'all 0.3s ease',
      }}>
        {!imageLoaded && (
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#1a1a1a',
          }}>
            <div style={{
              width: '24px',
              height: '24px',
              border: `3px solid #333`,
              borderTop: `3px solid ${COLORS.primary}`,
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }} />
          </div>
        )}
        <img
          src={getPosterUrl(movie.posterPath, 'medium')}
          alt={movie.title}
          onLoad={() => setImageLoaded(true)}
          onError={(e) => {
             // Fallback to placeholder on error
             e.currentTarget.onerror = null; // Prevent loop
             e.currentTarget.src = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450"><rect width="100%" height="100%" fill="%2318181b"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="800" font-size="16" fill="%2371717a">NO POSTER</text></svg>`;
          }}
          loading="lazy"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: imageLoaded ? 1 : 0,
            transition: 'opacity 0.3s ease',
            pointerEvents: 'none',
          }}
        />

        {/* Rating badge */}
        {(() => {
          const rawRating = movie.voteAverage || (movie as any).vote_average;
          if (!rawRating || rawRating <= 0) return null;
          const ratingNum = typeof rawRating === 'number' ? (rawRating > 10 ? rawRating / 10 : rawRating) : parseFloat(rawRating);
          if (isNaN(ratingNum) || ratingNum <= 0) return null;

          return (
            <div style={{
              position: 'absolute',
              top: '8px',
              right: '8px',
              background: 'rgba(15, 15, 15, 0.9)',
              padding: '5px 9px',
              borderRadius: '10px',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              zIndex: 10
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill={COLORS.rating}>
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
              <span style={{
                color: COLORS.textPrimary,
                fontSize: '0.75rem',
                fontWeight: '700',
              }}>
                {ratingNum.toFixed(1)}
              </span>
            </div>
          );
        })()}
      </div>

      {/* Title */}
      <h3 style={{
        marginTop: '0.6rem',
        fontSize: '0.8rem',
        fontWeight: '600',
        color: '#E5E5E5',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
        lineHeight: '1.3',
        transition: 'color 0.3s ease',
      }}>
        {movie.title}
      </h3>
    </div>
  );
});

export default MovieCard;
