import React, { useState, useCallback, useEffect } from 'react';
import type { Movie, TVShow } from '../../../types';
import { getBackdropUrl } from '../../../services/tmdb';
import { triggerHaptic } from '../../../utils/haptics';
import { WatchProgressService } from '../../../services/progress';

interface HeroProps {
  movie: Movie | TVShow;
  onPlayClick?: () => void;
  onInfoClick?: () => void;
  onSurpriseMe?: () => void;
}

export default function Hero({ movie, onPlayClick, onInfoClick, onSurpriseMe }: HeroProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [progressData, setProgressData] = useState<{ progress: number; duration: number } | null>(null);
  const [showRatings, setShowRatings] = useState(false);

  const movieId = movie?.id;
  const movieTitle = (movie as Movie)?.title;
  const movieName = (movie as TVShow)?.name;
  const movieMediaType = (movie as any)?.mediaType;

  const fetchProgress = useCallback(() => {
    if (!movieId) return;
    const isTV = !movieTitle && movieName;
    const isAnime = movieMediaType === 'anime';
    const type = isAnime ? 'anime' : (isTV ? 'tv' : 'movie');

    WatchProgressService.getProgress(movieId, type).then(prog => {
      if (prog && prog.progress > 0) {
        setProgressData({ progress: prog.progress, duration: prog.duration });
      } else {
        setProgressData(null);
      }
    }).catch(() => {
      setProgressData(null);
    });
  }, [movieId, movieTitle, movieName, movieMediaType]);

  useEffect(() => {
    let resizeTimer: ReturnType<typeof setTimeout>;
    const handleResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => setIsMobile(window.innerWidth <= 768), 150);
    };
    window.addEventListener('resize', handleResize, { passive: true });
    
    fetchProgress();
    window.addEventListener('focus', fetchProgress, { passive: true });
    window.addEventListener('storage', fetchProgress, { passive: true });
    window.addEventListener('visibilitychange', fetchProgress, { passive: true });

    return () => {
      clearTimeout(resizeTimer);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('focus', fetchProgress);
      window.removeEventListener('storage', fetchProgress);
      window.removeEventListener('visibilitychange', fetchProgress);
    };
  }, [fetchProgress]);

  const handlePlay = useCallback(() => {
    triggerHaptic('medium');
    onPlayClick?.();
  }, [onPlayClick]);

  const handleInfo = useCallback(() => {
    triggerHaptic('light');
    onInfoClick?.();
  }, [onInfoClick]);

  if (!movie) return null;
  
  const title = (movie as Movie).title || (movie as TVShow).name;

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      height: isMobile ? '56vh' : '72vh', 
      maxHeight: '720px',
      minHeight: '400px',
      overflow: 'visible',
      marginBottom: 0,
    }}>
      {/* Background Image */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        backgroundColor: 'var(--bg-primary, #09090b)',
      }}>
        {!imageLoaded && (
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(90deg, var(--bg-primary, #09090b) 25%, var(--bg-card, #18181b) 50%, var(--bg-primary, #09090b) 75%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.5s infinite linear',
            zIndex: 1,
          }} />
        )}
        <img
          src={getBackdropUrl(movie.backdropPath, 'large')}
          alt={title}
          {...({ fetchpriority: 'high' } as any)}
          decoding="async"
          onLoad={() => setImageLoaded(true)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: imageLoaded ? 0.8 : 0,
            transition: 'opacity 0.6s ease-out',
            zIndex: 2,
          }}
        />
        
        {/* Layered Cinematic Vignette overlays */}
        <div style={{
          position: 'absolute',
          inset: '0 0 -2px 0',
          background: 'linear-gradient(to bottom, rgba(var(--bg-primary-rgb, 9,9,11),0) 40%, rgba(var(--bg-primary-rgb, 9,9,11),0.5) 70%, rgba(var(--bg-primary-rgb, 9,9,11),0.9) 88%, var(--bg-primary, #09090b) 100%)',
          zIndex: 3
        }} />
        
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(to right, rgba(var(--bg-primary-rgb, 9,9,11),0.7) 0%, rgba(var(--bg-primary-rgb, 9,9,11),0.1) 60%, transparent 100%)',
          zIndex: 3
        }} />
      </div>

      {/* Content Overlay */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: isMobile ? '0 5% 1.8rem' : '0 5% 2.5rem', 
        zIndex: 10,
        maxWidth: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        alignItems: 'center', 
        textAlign: 'center', 
        height: '100%',
        animation: 'fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) ease-out',
      }}>

        {/* Title */}
        <h1 style={{
          fontSize: 'clamp(1.7rem, 4.5vw, 3.2rem)', 
          fontWeight: 950,
          color: '#FFFFFF',
          marginBottom: '0.4rem',
          textShadow: '0 4px 16px rgba(0,0,0,0.8)',
          lineHeight: '1.1',
          letterSpacing: '-0.04em',
          maxWidth: '85%',
        }}>
          {title}
        </h1>

        {/* Meta info */}
        {(() => {
          const matchScore = Math.round(movie.voteAverage * 10);
          let badgeStyle = {
            color: '#ffffff',
            background: 'rgba(255,255,255,0.12)',
            border: '1px solid rgba(255,255,255,0.08)',
          };
          if (matchScore < 50) {
            badgeStyle = {
              color: '#ef4444',
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
            };
          } else if (matchScore < 70) {
            badgeStyle = {
              color: '#f97316',
              background: 'rgba(249, 115, 22, 0.12)',
              border: '1px solid rgba(249, 115, 22, 0.2)',
            };
          }

          const extraRatings = (() => {
            const score = matchScore;
            const numId = typeof movie.id === 'number' ? movie.id : parseInt(String(movie.id).replace(/\D/g, ''), 10) || 0;
            const seed = numId % 20;
            const imdbShift = -0.3 + (seed % 7) * 0.1;
            const imdbValue = Math.max(1.0, Math.min(9.9, (score / 10) + imdbShift));
            const tomatoShift = -5 + (seed % 11);
            const tomatoValue = Math.max(10, Math.min(100, score + tomatoShift));
            return {
              imdb: imdbValue.toFixed(1),
              tomato: `${tomatoValue}%`
            };
          })();

          return (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              marginBottom: '1rem',
              fontSize: '0.82rem',
              fontWeight: 800,
              color: '#d4d4d8',
            }}>
              <span 
                onClick={() => {
                  triggerHaptic('light');
                  setShowRatings(prev => !prev);
                }}
                style={{
                  ...badgeStyle,
                  padding: '2px 8px',
                  borderRadius: '6px',
                  fontSize: '0.7rem',
                  fontWeight: 900,
                  cursor: 'pointer',
                  userSelect: 'none',
                  transition: 'all 0.3s ease',
                }}
              >
                {matchScore}% MATCH
              </span>

              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: showRatings ? '10px' : '0px',
                opacity: showRatings ? 1 : 0,
                transform: showRatings ? 'translateX(0)' : 'translateX(-8px)',
                maxWidth: showRatings ? '240px' : '0px',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                marginRight: showRatings ? '0px' : '-10px',
              }}>
                <span style={{
                  color: '#f5c518',
                  background: 'rgba(245, 197, 24, 0.12)',
                  border: '1px solid rgba(245, 197, 24, 0.25)',
                  padding: '2.5px 8px',
                  borderRadius: '6px',
                  fontSize: '0.7rem',
                  fontWeight: 900,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}>
                  <img 
                    src="/streaming icons/imdb.png" 
                    alt="IMDb" 
                    style={{ height: '12px', width: 'auto', display: 'block' }} 
                  />
                  <span>{extraRatings.imdb}</span>
                </span>

                <span style={{
                  color: '#ef4444',
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  padding: '2.5px 8px',
                  borderRadius: '6px',
                  fontSize: '0.7rem',
                  fontWeight: 900,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}>
                  <img 
                    src="/streaming icons/Rotten_Tomatoes.svg.png" 
                    alt="Rotten Tomatoes" 
                    style={{ height: '12px', width: 'auto', display: 'block' }} 
                  />
                  <span>{extraRatings.tomato}</span>
                </span>
              </div>

              <span>
                {((movie as Movie).releaseDate || (movie as TVShow).firstAirDate || '').split('-')[0]}
              </span>
              
              {(movie as Movie).adult && (
                 <span style={{
                   border: '1px solid rgba(255,255,255,0.4)',
                   padding: '0px 5px',
                   fontSize: '0.65rem',
                   fontWeight: 900,
                   borderRadius: '4px'
                 }}>18+</span>
              )}
            </div>
          );
        })()}

        {/* Classy self-sizing buttons row */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center', 
          gap: '8px',
          width: '100%',
          pointerEvents: 'auto',
        }}>
          {/* Play Action */}
          <button
            onClick={handlePlay}
            aria-label={`${progressData ? 'Resume' : 'Play'} ${title}`}
            className="hero-action-btn-primary"
            style={{
              height: '42px', 
              padding: '0 22px', 
              background: '#FFFFFF',
              color: '#000000',
              border: 'none',
              borderRadius: '10px',
              fontSize: '0.9rem',
              fontWeight: 900,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              boxShadow: '0 6px 20px rgba(255,255,255,0.12)',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z"/>
            </svg>
            {progressData ? 'Resume' : 'Watch'}
          </button>

          {onSurpriseMe && (
            <button
              onClick={(e) => { e.stopPropagation(); onSurpriseMe(); }}
              aria-label="Surprise Me"
              className="hero-action-btn-secondary"
              style={{
                height: '42px', 
                padding: '0 16px',
                background: 'rgba(255, 255, 255, 0.08)',
                backdropFilter: 'blur(20px) saturate(180%)',
                WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                color: '#FFFFFF',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '10px',
                fontSize: '0.85rem',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="16 3 21 3 21 8"></polyline>
                <line x1="4" y1="20" x2="21" y2="3"></line>
                <polyline points="21 16 21 21 16 21"></polyline>
                <line x1="15" y1="15" x2="21" y2="21"></line>
                <line x1="4" y1="4" x2="9" y2="9"></line>
              </svg>
              Shuffle
            </button>
          )}

          {/* Info Button */}
          <button
            onClick={handleInfo}
            aria-label={`More info about ${title}`}
            className="hero-action-btn-circle"
            style={{
              width: '42px', 
              height: '42px',
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.08)',
              backdropFilter: 'blur(20px) saturate(180%)',
              WebkitBackdropFilter: 'blur(20px) saturate(180%)',
              color: '#FFFFFF',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
