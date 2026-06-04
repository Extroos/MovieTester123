import React from 'react';
import type { Movie } from '../../../types';
import { getPosterUrl } from '../../../services/tmdb';
import { COLORS } from '../../../constants';
import { triggerHaptic } from '../../../utils/haptics';

interface SearchResultsProps {
  query: string;
  results: Movie[];
  loading: boolean;
  onMovieClick: (movie: Movie) => void;
  onClose: () => void;
}

export default function SearchResults({ query, results, loading, onMovieClick, onClose }: SearchResultsProps) {
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 2000,
      background: 'rgba(5, 5, 5, 0.4)', 
      backdropFilter: 'blur(20px) saturate(220%)',
      WebkitBackdropFilter: 'blur(20px) saturate(220%)',
      overflowY: 'auto',
      WebkitOverflowScrolling: 'touch',
      overscrollBehavior: 'contain',
      animation: 'resultsIn 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
    }}>
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
        zIndex: 2001,
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
            transition: 'opacity 0.2s ease, transform 0.2s ease'
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
            {query ? `"${query}"` : 'Results'}
          </h2>
          <p style={{
            fontSize: '10px',
            color: 'rgba(255, 255, 255, 0.5)',
            margin: '0',
            fontWeight: 600,
            letterSpacing: '0.2px'
          }}>
            {results.length} {results.length === 1 ? 'result' : 'results'} found
          </p>
        </div>
      </div>

      {/* Content Grid */}
      <div style={{ padding: '16px 16px 100px' }}>
        {loading ? (
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            padding: '4rem 0',
          }}>
            <div style={{
              width: '32px',
              height: '32px',
              border: '3px solid rgba(255, 255, 255, 0.1)',
              borderTopColor: COLORS.primary,
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }} />
          </div>
        ) : results.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '6rem 2rem',
            color: '#8E8E93',
          }}>
            <svg 
              width="48" 
              height="48" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="1.5"
              style={{ margin: '0 auto 16px', opacity: 0.5 }}
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <p style={{ fontSize: '16px', fontWeight: 500, margin: '0 0 8px' }}>No matches found</p>
            <p style={{ fontSize: '14px', opacity: 0.7 }}>Try changing your keywords</p>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', /* Reduced from 110px */
            gap: '12px 10px', /* Reduced gap */
          }}>
            {results.map((movie, index) => (
              <div
                key={`${movie.id}-${index}`}
                onClick={() => { triggerHaptic('medium'); onMovieClick(movie); }}
                className="search-grid-card"
                style={{
                  cursor: 'pointer',
                  WebkitTapHighlightColor: 'transparent',
                  animation: `fadeInUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) ${Math.min(index * 0.04, 0.5)}s both`
                }}
              >
                {/* Poster Container */}
                <div style={{
                  position: 'relative',
                  paddingBottom: '150%',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.07) 0%, rgba(255, 255, 255, 0.02) 100%)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  boxShadow: 'inset 0 1px 1px rgba(255, 255, 255, 0.1), 0 4px 12px rgba(0,0,0,0.3)',
                  marginBottom: '8px',
                }}>
                  {/* Skeleton / Shimmer Overlay */}
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.03) 75%)',
                    backgroundSize: '200% 100%',
                    animation: 'shimmer 1.5s infinite linear',
                    zIndex: 1,
                  }} />

                  <img
                    src={getPosterUrl(movie.posterPath, 'medium')}
                    alt={movie.title || (movie as any).name}
                    loading="lazy"
                    onLoad={(e) => {
                       // Hide skeleton on load
                       (e.currentTarget.previousSibling as HTMLElement).style.display = 'none';
                       e.currentTarget.style.opacity = '1';
                    }}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      opacity: 0,
                      transition: 'opacity 0.3s ease-out, transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                      zIndex: 2,
                    }}
                  />
                </div>
                
                {/* Title */}
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
                  lineHeight: '1.4',
                  opacity: 0.9
                }}>
                  {movie.title || (movie as any).name}
                </h3>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
