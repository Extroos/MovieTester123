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
      inset: 0,
      zIndex: 2000,
      background: 'rgba(10, 10, 10, 0.5)', 
      backdropFilter: 'blur(25px) saturate(200%) brightness(1.1)',
      WebkitBackdropFilter: 'blur(25px) saturate(200%) brightness(1.1)',
      overflowY: 'auto',
      WebkitOverflowScrolling: 'touch',
      overscrollBehavior: 'contain',
      animation: 'resultsIn 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
    }}>
      {/* Floating Search Results Capsule - Styled exactly like Header.tsx */}
      <div style={{
        position: 'fixed',
        top: 'calc(12px + env(safe-area-inset-top, 0px))',
        left: '12px',
        right: '12px',
        height: '60px',
        background: 'rgba(10, 10, 10, 0.96)',
        backdropFilter: 'blur(30px) saturate(190%)',
        WebkitBackdropFilter: 'blur(30px) saturate(190%)',
        border: '1px solid rgba(255, 255, 255, 0.09)',
        borderRadius: '20px',
        boxShadow: '0 12px 40px rgba(0, 0, 0, 0.6)',
        zIndex: 2001,
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
      }}>
        <button
          onClick={() => { triggerHaptic('light'); onClose(); }}
          aria-label="Back"
          className="search-overlay-back-btn"
          style={{
            background: 'transparent',
            border: 'none',
            color: '#FFFFFF',
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: 0.9,
            outline: 'none',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        
        {/* Divider */}
        <div style={{ width: '1px', height: '18px', background: 'rgba(255,255,255,0.15)', margin: '0 10px' }} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{
            fontSize: '13px',
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
            fontSize: '9px',
            color: 'rgba(255, 255, 255, 0.5)',
            margin: '0',
            fontWeight: 600,
            letterSpacing: '0.2px'
          }}>
            {results.length} {results.length === 1 ? 'result' : 'results'} found
          </p>
        </div>
      </div>

      {/* Content Grid with offset for fixed header */}
      <div style={{ padding: 'calc(84px + env(safe-area-inset-top, 0px)) 12px 100px' }}>
        {loading ? (
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            padding: '4rem 0',
          }}>
            <div style={{
              width: '26px',
              height: '26px',
              border: '3px solid rgba(255, 255, 255, 0.1)',
              borderTopColor: COLORS.primary,
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }} />
          </div>
        ) : results.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '5rem 1.5rem',
            color: '#8E8E93',
          }}>
            <svg 
              width="40" 
              height="40" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="1.5"
              style={{ margin: '0 auto 12px', opacity: 0.5 }}
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <p style={{ fontSize: '15px', fontWeight: 600, margin: '0 0 6px', color: '#fff' }}>No matches found</p>
            <p style={{ fontSize: '13px', opacity: 0.6, margin: 0 }}>Try changing your keywords</p>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))', /* Perfect 3-column scaling on 360px */
            gap: '10px 8px',
          }}>
            {results.map((movie, index) => (
              <div
                key={`${movie.id}-${index}`}
                onClick={() => { 
                  if (document.activeElement instanceof HTMLElement) {
                    document.activeElement.blur();
                  }
                  triggerHaptic('medium'); 
                  onMovieClick(movie); 
                }}
                className="search-grid-card"
                style={{
                  cursor: 'pointer',
                  WebkitTapHighlightColor: 'transparent',
                  animation: `fadeInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) ${Math.min(index * 0.03, 0.4)}s both`,
                  contentVisibility: 'auto',
                  containIntrinsicSize: 'auto 160px'
                }}
              >
                {/* Poster Container */}
                <div style={{
                  position: 'relative',
                  paddingBottom: '150%',
                  borderRadius: '10px',
                  overflow: 'hidden',
                  background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.07) 0%, rgba(255, 255, 255, 0.02) 100%)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  boxShadow: 'inset 0 1px 1px rgba(255, 255, 255, 0.1), 0 4px 10px rgba(0,0,0,0.3)',
                  marginBottom: '6px',
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
                       if (e.currentTarget.previousSibling instanceof HTMLElement) {
                         e.currentTarget.previousSibling.style.display = 'none';
                       }
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
                      transition: 'opacity 0.25s ease-out, transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                      zIndex: 2,
                    }}
                  />
                </div>
                
                {/* Title */}
                <h3 style={{
                  fontSize: '12px',
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
