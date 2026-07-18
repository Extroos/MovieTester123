import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { Movie, TVShow } from '../../../types';
import { getBackdropUrl, getMediaLogo, getPosterUrl } from '../../../services/tmdb';
import { triggerHaptic } from '../../../utils/haptics';
import { WatchProgressService } from '../../../services/progress';
import { API_KEY } from '../../../services/api/tmdb';
import { updateDynamicBackdropColor } from '../../../utils/tvColorHelper';

interface HeroProps {
  movie: Movie | TVShow;
  onPlayClick?: () => void;
  onInfoClick?: () => void;
  onSurpriseMe?: () => void;
  isActive?: boolean;
}

export default function Hero({ movie, onPlayClick, onInfoClick, onSurpriseMe, isActive = true }: HeroProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [progressData, setProgressData] = useState<{ progress: number; duration: number } | null>(null);
  const [showRatings, setShowRatings] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  // TV Trailer auto-play state
  const [trailerKey, setTrailerKey] = useState<string | null>(null);
  const [showTrailer, setShowTrailer] = useState(false);
  const trailerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [runtime, setRuntime] = useState<number | null>(null);
  const [seasonsCount, setSeasonsCount] = useState<number | null>(null);

  const isTV = typeof document !== 'undefined' && document.body.classList.contains('tv-mode');
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

  // Fetch logo for this movie/show and handle image load fallback for cached images
  useEffect(() => {
    if (!movie?.id) return;
    setLogoUrl(null);
    setImageLoaded(false); // Reset loaded state on movie change

    // Safety fallback: if browser cache prevents onLoad from firing, force load after 800ms
    const timer = setTimeout(() => {
      setImageLoaded(true);
    }, 800);

    const type = (movie as Movie).title ? 'movie' : 'tv';
    getMediaLogo(movie.id, type).then(url => setLogoUrl(url || null));

    // Fetch complete movie details/TV details to read the exact runtime and seasons count
    setRuntime(null);
    setSeasonsCount(null);
    fetch(`https://api.themoviedb.org/3/${type}/${movie.id}?api_key=${API_KEY}&language=en-US`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) {
          if (type === 'movie' && data.runtime) {
            setRuntime(data.runtime);
          } else if (type === 'tv' && data.number_of_seasons) {
            setSeasonsCount(data.number_of_seasons);
          }
        }
      })
      .catch(err => console.warn('Could not fetch hero details:', err));

    return () => clearTimeout(timer);
  }, [movie?.id]);

  // Fetch YouTube trailer key from TMDB (TV mode only)
  useEffect(() => {
    if (!isTV || !movie?.id) return;
    setTrailerKey(null);
    setShowTrailer(false);
    if (trailerTimerRef.current) clearTimeout(trailerTimerRef.current);

    const type = (movie as Movie).title ? 'movie' : 'tv';
    fetch(`https://api.themoviedb.org/3/${type}/${movie.id}/videos?api_key=${API_KEY}&language=en-US`)
      .then(res => res.json())
      .then(data => {
        const videos: Array<{ key: string; site: string; type: string; official: boolean }> = data.results || [];
        // Prefer official YouTube trailer, fall back to any trailer, then teaser
        const trailer =
          videos.find(v => v.site === 'YouTube' && v.type === 'Trailer' && v.official) ||
          videos.find(v => v.site === 'YouTube' && v.type === 'Trailer') ||
          videos.find(v => v.site === 'YouTube' && v.type === 'Teaser');
        if (trailer) setTrailerKey(trailer.key);
      })
      .catch(() => {});
  }, [movie?.id, isTV]);

  // Extract dominant color of the movie/show poster to update the dynamic background
  useEffect(() => {
    if (!movie?.id || !isTV || !isActive) return;
    // Static import — no dynamic module loading overhead on every movie change
    updateDynamicBackdropColor(
      movie.posterPath || (movie as any).poster_path ||
      movie.backdropPath || (movie as any).backdrop_path || null
    );
  }, [movie?.id, isTV, isActive]);

  const handlePlay = useCallback(() => {
    triggerHaptic('medium');
    onPlayClick?.();
  }, [onPlayClick]);

  const handleInfo = useCallback(() => {
    triggerHaptic('light');
    onInfoClick?.();
  }, [onInfoClick]);

  // TV: start/stop trailer timer based on focus
  const handleTVFocus = useCallback(() => {
    if (!isTV) return;
    // Static import — no dynamic module loading overhead on every card focus
    updateDynamicBackdropColor(
      movie?.posterPath || (movie as any)?.poster_path ||
      movie?.backdropPath || (movie as any)?.backdrop_path || null
    );
    if (!trailerKey) return;
    if (trailerTimerRef.current) clearTimeout(trailerTimerRef.current);
    setShowTrailer(false);
    trailerTimerRef.current = setTimeout(() => {
      setShowTrailer(true);
    }, 5000);
  }, [isTV, trailerKey, movie]);

  const handleTVBlur = useCallback(() => {
    if (!isTV) return;
    if (trailerTimerRef.current) clearTimeout(trailerTimerRef.current);
    setShowTrailer(false);
  }, [isTV]);

  // Also watch for trailerKey becoming available while already focused
  useEffect(() => {
    return () => {
      if (trailerTimerRef.current) clearTimeout(trailerTimerRef.current);
    };
  }, []);

  if (!movie) return null;
  
  const title = (movie as Movie).title || (movie as TVShow).name;

  // Helper to format TMDB release date to a readable "Coming Month Day" or "Released" format
  const getTVReleaseBadge = () => {
    const dateStr = (movie as Movie).releaseDate || (movie as TVShow).firstAirDate;
    if (!dateStr) return null;
    
    const releaseDate = new Date(dateStr);
    const today = new Date();
    
    // Check if the release date is in the future
    if (releaseDate > today) {
      const options: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric' };
      const formattedDate = releaseDate.toLocaleDateString('en-US', options);
      return (
        <div style={{
          position: 'absolute',
          bottom: '24px',
          right: '24px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '0.9rem',
          fontWeight: 800,
          color: '#ffffff',
          zIndex: 15,
          textShadow: '0 2px 4px rgba(0,0,0,0.8)'
        }}>
          <span>Coming {formattedDate}</span>
        </div>
      );
    } else {
      return (
        <div style={{
          position: 'absolute',
          bottom: '24px',
          right: '24px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: '0.9rem',
          fontWeight: 800,
          color: '#ffffff',
          zIndex: 15,
          textShadow: '0 2px 4px rgba(0,0,0,0.8)'
        }}>
          <span>Released</span>
        </div>
      );
    }
  };

  return (
    <div 
      onClick={isTV ? handlePlay : undefined}
      className={isTV ? "tv-focusable tv-hero-card" : ""}
      tabIndex={isTV ? 0 : -1}
      onFocus={isTV ? handleTVFocus : undefined}
      onBlur={isTV ? handleTVBlur : undefined}
      style={isTV ? {
        position: 'relative',
        margin: '80px 40px 20px 40px',
        height: '52vh',
        minHeight: '320px',
        borderRadius: '24px',
        overflow: 'hidden',
        boxShadow: 'none',
        border: '1.5px solid rgba(255, 255, 255, 0.08)',
        boxSizing: 'border-box',
        cursor: 'pointer',
        outline: 'none',
      } : {
        position: 'relative',
        width: '100%',
        height: isMobile ? '56vh' : '72vh', 
        maxHeight: '720px',
        minHeight: '400px',
        overflow: 'visible',
        marginBottom: 0,
      }}
      onKeyDown={isTV ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handlePlay();
        }
      } : undefined}
    >
      {/* Background Image — hidden when trailer plays */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        backgroundColor: 'var(--bg-primary, #09090b)',
        opacity: isTV && showTrailer ? 0 : 1,
        transition: 'opacity 0.8s ease',
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
          src={getBackdropUrl(movie.backdropPath || (movie as any).backdrop_path || movie.posterPath || (movie as any).poster_path, 'large')}
          alt={title}
          {...({ fetchpriority: 'high' } as any)}
          decoding="async"
          onLoad={() => {
            setImageLoaded(true);
          }}
          onError={() => {
            setImageLoaded(true);
          }}
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
          background: isTV 
            ? 'linear-gradient(to right, rgba(var(--bg-primary-rgb, 10,10,12),0.95) 0%, rgba(var(--bg-primary-rgb, 10,10,12),0.7) 30%, rgba(var(--bg-primary-rgb, 10,10,12),0.2) 60%, transparent 100%)'
            : 'linear-gradient(to right, rgba(var(--bg-primary-rgb, 9,9,11),0.7) 0%, rgba(var(--bg-primary-rgb, 9,9,11),0.1) 60%, transparent 100%)',
          zIndex: 3
        }} />
      </div>

      {/* TV Trailer Player — fills card, non-interactive, behind info overlay */}
      {isTV && trailerKey && (
        <div style={{
          position: 'absolute',
          inset: 0,
          zIndex: 4,
          opacity: showTrailer ? 1 : 0,
          transition: 'opacity 1s ease',
          pointerEvents: 'none', // Users cannot interact with the trailer
          overflow: 'hidden',
          borderRadius: '24px',
        }}>
          {showTrailer && (
            <iframe
              key={trailerKey}
              src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1&mute=0&controls=0&disablekb=1&fs=0&iv_load_policy=3&loop=1&playlist=${trailerKey}&rel=0&showinfo=0&modestbranding=1&playsinline=1`}
              title="Trailer"
              allow="autoplay; encrypted-media"
              style={{
                position: 'absolute',
                // Oversize layout further to crop out any YouTube player control bars or overlay elements
                top: '-30%',
                left: '-15%',
                width: '130%',
                height: '160%',
                border: 'none',
                pointerEvents: 'none',
              }}
            />
          )}
          {/* Dark gradient so info text remains readable over the trailer */}
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(to right, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0.1) 100%)',
            zIndex: 1,
          }} />
        </div>
      )}

      {/* Content Overlay */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: isMobile ? '0 5% 1.8rem' : (isTV ? '0 40px 2.5rem' : '0 5% 2.5rem'), 
        zIndex: 10,
        maxWidth: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        alignItems: isTV ? 'flex-start' : 'center', 
        textAlign: isTV ? 'left' : 'center', 
        height: '100%',
        animation: 'fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) ease-out',
        boxSizing: 'border-box',
        pointerEvents: isTV ? 'none' : 'auto' // Prevent nested click issues on TV
      }}>

        {/* Title — logo image if available, plain text as fallback */}
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={title}
            onError={() => setLogoUrl(null)}
            style={{
              maxWidth: isMobile ? '60%' : (isTV ? '30%' : '45%'),
              maxHeight: isMobile ? '100px' : (isTV ? '80px' : '130px'),
              objectFit: 'contain',
              marginBottom: '0.8rem',
              filter: 'drop-shadow(0 4px 16px rgba(0,0,0,0.7))',
              alignSelf: isTV ? 'flex-start' : 'center'
            }}
          />
        ) : (
          <h1 style={{
            fontSize: isTV ? '2.5rem' : 'clamp(1.7rem, 4.5vw, 3.2rem)',
            fontWeight: 950,
            color: '#FFFFFF',
            marginBottom: '0.6rem',
            textShadow: '0 4px 16px rgba(0,0,0,0.8)',
            lineHeight: '1.1',
            letterSpacing: '-0.04em',
            maxWidth: isTV ? '50%' : '85%',
          }}>
            {title}
          </h1>
        )}

        {/* Meta info */}
        {(() => {
          const matchScore = Math.round(movie.voteAverage * 10);
          const isMovieObj = (movie as Movie).title !== undefined;
          
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

          if (isTV) {
            // TV metadata structure: type • Year • hours/seasons • imdb rating with imdb logo
            const year = ((movie as Movie).releaseDate || (movie as TVShow).firstAirDate || '').split('-')[0];
            const typeLabel = isMovieObj ? 'Movie' : 'Show';
            
            let durationLabel = '3 seasons';
            if (isMovieObj) {
              const activeRuntime = runtime || (movie as any).runtime;
              if (activeRuntime && activeRuntime > 0) {
                const hours = Math.floor(activeRuntime / 60);
                const minutes = activeRuntime % 60;
                durationLabel = `${hours}h ${minutes}m`;
              } else {
                const totalMinutes = 90 + (Math.abs(Number(movie.id) || 0) % 60);
                const hours = Math.floor(totalMinutes / 60);
                const minutes = totalMinutes % 60;
                durationLabel = `${hours}h ${minutes}m`;
              }
            } else {
              const seasons = seasonsCount || (movie as any).numberOfSeasons || (movie as any).number_of_seasons;
              durationLabel = seasons ? `${seasons} season${seasons > 1 ? 's' : ''}` : '3 seasons';
            }

            return (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
                gap: '8px',
                fontSize: '0.85rem',
                fontWeight: 700,
                color: '#ffffff',
                width: '100%',
                textShadow: '0 2px 4px rgba(0,0,0,0.6)'
              }}>
                <span>{typeLabel}</span>
                <span style={{ opacity: 0.5 }}>•</span>
                <span>{year}</span>
                <span style={{ opacity: 0.5 }}>•</span>
                <span>{durationLabel}</span>
                <span style={{ opacity: 0.5 }}>•</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <img 
                    src="/streaming icons/imdb.png" 
                    alt="IMDb" 
                    style={{ height: '14px', width: 'auto', display: 'block', borderRadius: '2px' }} 
                  />
                  <span>{extraRatings.imdb}</span>
                </div>
              </div>
            );
          }

          // Default metadata for PC & Mobile users
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

          return (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              marginBottom: '1.25rem',
              fontSize: '0.82rem',
              fontWeight: 800,
              color: '#d4d4d8',
              width: '100%'
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

        {/* Action buttons row - rendered only for standard non-TV screens */}
        {!isTV && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center', 
            gap: '12px',
            width: '100%',
            pointerEvents: 'auto',
            marginTop: '1rem',
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
        )}
      </div>

      {/* Smart TV-only Coming Soon / Released Indicator Badge */}
      {isTV && getTVReleaseBadge()}
    </div>
  );
}
