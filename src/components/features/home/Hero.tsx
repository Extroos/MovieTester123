import React, { useState, useCallback } from 'react';
import type { Movie, TVShow } from '../../../types';
import { getBackdropUrl } from '../../../services/tmdb';
import { triggerHaptic } from '../../../utils/haptics';

interface HeroProps {
  movie: Movie | TVShow;
  onPlayClick?: () => void;
  onInfoClick?: () => void;
  onSurpriseMe?: () => void;
}

export default function Hero({ movie, onPlayClick, onInfoClick, onSurpriseMe }: HeroProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  React.useEffect(() => {
    let resizeTimer: ReturnType<typeof setTimeout>;
    const handleResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => setIsMobile(window.innerWidth <= 768), 150);
    };
    window.addEventListener('resize', handleResize, { passive: true });
    return () => {
      clearTimeout(resizeTimer);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  if (!movie) return null;
  
  const title = (movie as Movie).title || (movie as TVShow).name;

  const handlePlay = useCallback(() => {
    triggerHaptic('medium');
    onPlayClick?.();
  }, [onPlayClick]);

  const handleInfo = useCallback(() => {
    triggerHaptic('light');
    onInfoClick?.();
  }, [onInfoClick]);

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      height: isMobile ? '56vh' : '72vh', 
      maxHeight: '720px',
      minHeight: '400px',
      overflow: 'hidden',
      marginBottom: '0.75rem', 
    }}>
      {/* Background Image */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        backgroundColor: '#09090b',
      }}>
        {!imageLoaded && (
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(90deg, #09090b 25%, #18181b 50%, #09090b 75%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.5s infinite linear',
            zIndex: 1,
          }} />
        )}
        <img
          src={getBackdropUrl(movie.backdropPath, 'original')}
          alt={title}
          fetchpriority="high"
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
          inset: 0,
          background: 'linear-gradient(to bottom, rgba(9,9,11,0) 50%, rgba(9,9,11,0.65) 85%, #09090b 100%)',
          zIndex: 3
        }} />
        
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(to right, rgba(9,9,11,0.7) 0%, rgba(9,9,11,0.1) 60%, transparent 100%)',
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
          <span style={{ color: '#ffffff', background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.08)', padding: '2px 8px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 900 }}>
            {Math.round(movie.voteAverage * 10)}% MATCH
          </span>
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
            aria-label={`Play ${title}`}
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
              transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
              boxShadow: '0 6px 20px rgba(255,255,255,0.12)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.03)';
              e.currentTarget.style.boxShadow = '0 8px 24px rgba(255,255,255,0.2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = '0 6px 20px rgba(255,255,255,0.12)';
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z"/>
            </svg>
            Watch
          </button>

          {onSurpriseMe && (
            <button
              onClick={(e) => { e.stopPropagation(); onSurpriseMe(); }}
              aria-label="Surprise Me"
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
                transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
                e.currentTarget.style.transform = 'scale(1.02)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                e.currentTarget.style.transform = 'scale(1)';
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
              transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
              e.currentTarget.style.transform = 'scale(1.08)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
              e.currentTarget.style.transform = 'scale(1)';
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
