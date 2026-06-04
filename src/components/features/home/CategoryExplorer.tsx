import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Movie, TVShow } from '../../../types';
import { getPosterUrl } from '../../../services/tmdb';
import { COLORS } from '../../../constants';
import { triggerHaptic } from '../../../utils/haptics';

interface CategoryExplorerProps {
  title: string;
  movies: (Movie | TVShow)[];
  onClose: () => void;
  onMovieClick: (movie: Movie | TVShow) => void;
}

const CHUNK_SIZE = 20;

export default function CategoryExplorer({ title, movies, onClose, onMovieClick }: CategoryExplorerProps) {
  const [visibleCount, setVisibleCount] = useState(CHUNK_SIZE);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && visibleCount < movies.length) {
        // Use functional update to ensure we have current state
        setVisibleCount(prev => Math.min(prev + CHUNK_SIZE, movies.length));
      }
    }, { 
      root: null, // use viewport
      rootMargin: '400px', // start loading before it enters viewport
      threshold: 0.1 
    });

    if (sentinelRef.current) observerRef.current.observe(sentinelRef.current);

    return () => observerRef.current?.disconnect();
  }, [visibleCount, movies.length]);

  return (
    <motion.div
      className="no-scrollbar"
      initial={{ opacity: 0, scale: 1.1, filter: 'blur(20px)' }}
      animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0, scale: 1.05, filter: 'blur(20px)' }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 3000,
        background: 'rgba(5, 5, 5, 0.6)',
        backdropFilter: 'blur(30px) saturate(200%)',
        WebkitBackdropFilter: 'blur(30px) saturate(200%)',
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
        background: 'rgba(15, 15, 15, 0.65)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '14px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
        zIndex: 3001,
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        animation: 'fadeInDown 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards'
      }}>
        <button
          onClick={() => { triggerHaptic('light'); onClose(); }}
          aria-label="Back"
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
            transition: 'opacity 0.2s ease, transform 0.2s ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'scale(1.05)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.9'; e.currentTarget.style.transform = 'scale(1)'; }}
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
        padding: '24px 20px 120px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(124px, 1fr))', // Standardized to 124px
        gap: '24px 16px', // Increased gap for premium feel
      }}>
        {movies.slice(0, visibleCount).map((movie, index) => {
          const mTitle = (movie as Movie).title || (movie as TVShow).name;
          return (
            <div
              key={`${movie.id}-${index}`}
              onClick={() => { triggerHaptic('medium'); onMovieClick(movie); }}
              style={{
                cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
                animation: 'revealCard 0.3s ease-out both',
                animationDelay: `${Math.min(index * 15, 250)}ms`
              }}
            >
              <div style={{
                position: 'relative',
                aspectRatio: '2/3',
                borderRadius: '12px',
                overflow: 'hidden',
                background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.07) 0%, rgba(255, 255, 255, 0.02) 100%)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                boxShadow: 'inset 0 1px 1px rgba(255, 255, 255, 0.1), 0 8px 24px rgba(0,0,0,0.4)',
                marginBottom: '10px',
                transition: 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
              className="content-card-inner"
              >
                <img
                  src={getPosterUrl(movie.posterPath, 'medium')}
                  alt={mTitle}
                  loading="lazy"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                  }}
                />
              </div>
              <h3 style={{
                fontSize: '13px',
                fontWeight: 600,
                color: '#FFFFFF',
                margin: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                lineHeight: '1.3',
                opacity: 0.9
              }}>
                {mTitle}
              </h3>
            </div>
          );
        })}
        
        {/* Intersection Sentinel */}
        {visibleCount < movies.length && (
            <div ref={sentinelRef} style={{ height: '40px', gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: '24px', height: '24px', border: '2px solid rgba(255,255,255,0.1)', borderTopColor: '#E50914', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            </div>
        )}
      </div>

    </motion.div>
  );
}
