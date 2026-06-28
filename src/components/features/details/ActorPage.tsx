import React, { useState, useEffect, memo, useRef } from 'react';
import type { Movie, TVShow } from '../../../types';
import { getPersonDetails, getPersonCombinedCredits, getProfileUrl, getPosterUrl, getBackdropUrl } from '../../../services/tmdb';
import { COLORS } from '../../../constants';

interface ActorPageProps {
  personId: number;
  onClose: () => void;
  onMovieClick: (movie: Movie) => void;
  onTVShowClick: (show: TVShow) => void;
}

function ActorPage({ personId, onClose, onMovieClick, onTVShowClick }: ActorPageProps) {
  const [details, setDetails] = useState<any>(null);
  const [credits, setCredits] = useState<(Movie | TVShow)[]>([]);
  const [loading, setLoading] = useState(true);
  const [bioExpanded, setBioExpanded] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [displayLimit, setDisplayLimit] = useState(24);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const observerTargetRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (loading || credits.length <= displayLimit) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setDisplayLimit((prev) => prev + 24);
        }
      },
      { threshold: 0.1 }
    );

    const currentTarget = observerTargetRef.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [credits.length, displayLimit, loading]);
  useEffect(() => {
    const abortController = new AbortController();

    async function loadActorData() {
      setLoading(true);
      try {
        const [personData, creditsData] = await Promise.all([
          getPersonDetails(personId, abortController.signal),
          getPersonCombinedCredits(personId, abortController.signal)
        ]);

        // 1. De-duplicate combined credits by ID to prevent duplication of entries
        const uniqueCredits = Array.from(
          new Map(creditsData.map((item: any) => [item.id, item])).values()
        );

        // 2. Sort combined credits by release date / first air date descending (newest first)
        const sortedCredits = uniqueCredits.sort((a: any, b: any) => {
          const dateA = a.releaseDate || a.release_date || a.firstAirDate || a.first_air_date || '';
          const dateB = b.releaseDate || b.release_date || b.firstAirDate || b.first_air_date || '';
          if (!dateA) return 1;
          if (!dateB) return -1;
          return dateB.localeCompare(dateA);
        });

        setDetails(personData);
        setCredits(sortedCredits as (Movie | TVShow)[]);
        setDisplayLimit(24); // Reset pagination on actor change
      } catch (error: any) {
        if (error.name !== 'AbortError') {
          console.error("Failed to load actor data", error);
        }
      } finally {
        if (!abortController.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadActorData();
    
    // Lock body scroll
    const originalStyle = window.getComputedStyle(document.body).overflow;
    document.body.style.overflow = 'hidden';
    
    return () => { 
      abortController.abort();
      document.body.style.overflow = originalStyle;
    };
  }, [personId]);

  if (loading) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 4000,
        background: isMobile ? '#0a0a0a' : 'rgba(10,10,10,0.9)',
        backdropFilter: isMobile ? 'none' : 'blur(15px) saturate(180%)',
        WebkitBackdropFilter: isMobile ? 'none' : 'blur(15px) saturate(180%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          width: '36px', height: '36px',
          border: '2px solid #222', borderTopColor: COLORS.primary,
          borderRadius: '50%', animation: 'spin 0.7s linear infinite',
        }} />
      </div>
    );
  }

  if (!details) return null;

  const backdropItem = credits.find(c => c.backdropPath) as Movie | TVShow | undefined;
  const backdropUrl = backdropItem ? getBackdropUrl(backdropItem.backdropPath, 'original') : null;

  const biography = details.biography || '';
  const bioLimit = isMobile ? 120 : 280;
  const showReadMore = biography.length > bioLimit;
  const displayBio = bioExpanded ? biography : biography.substring(0, bioLimit) + (showReadMore ? '...' : '');

  return (
    <div 
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 4000,
        background: isMobile ? '#0a0a0a' : 'rgba(10,10,10,0.6)', // Lighter overlay to show the blur better
        overflowY: 'auto', overflowX: 'hidden',
        WebkitOverflowScrolling: 'touch',
        animation: 'detailsIn 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        willChange: 'transform, opacity',
      }}
    >
      {/* Performance optimized background blur layer - fixed and separate from scroll */}
      <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: -1,
          backdropFilter: isMobile ? 'none' : 'blur(25px) saturate(220%) brightness(0.8)',
          WebkitBackdropFilter: isMobile ? 'none' : 'blur(20px) saturate(220%) brightness(0.8)',
          pointerEvents: 'none',
          animation: 'backdropFade 0.6s ease-out both',
      }} />
      <div 
        onClick={(e) => e.stopPropagation()}
        style={{ minHeight: '100vh', background: '#0a0a0a', position: 'relative' }}
      >
        <button
          onClick={onClose}
          style={{
            position: 'fixed',
            top: 'calc(1rem + env(safe-area-inset-top))',
            left: '1.2rem',
            zIndex: 4001,
            background: 'rgba(15, 15, 15, 0.6)',
            backdropFilter: isMobile ? 'none' : 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: isMobile ? 'none' : 'blur(20px) saturate(200%)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            color: '#fff',
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
            transition: 'all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)',
          }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>

        <div style={{
          position: 'relative',
          width: '100%',
          height: isMobile ? '40vh' : '50vh',
          maxHeight: '500px',
        }}>
          {backdropUrl ? (
            <>
              <img
                src={backdropUrl}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
              />
              <div style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(to bottom, transparent 30%, #0a0a0a 100%)',
              }} />
            </>
          ) : (
            <div style={{ width: '100%', height: '100%', background: '#111' }} />
          )}
        </div>

        <div style={{
          position: 'relative',
          marginTop: isMobile ? '-70px' : '-100px',
          padding: '0 5% 3rem',
          zIndex: 2,
        }}>
          <div style={{ display: 'flex', gap: isMobile ? '12px' : '20px', marginBottom: '20px' }}>
            <div style={{
              width: isMobile ? '80px' : '120px',
              height: isMobile ? '120px' : '180px',
              borderRadius: '16px',
              overflow: 'hidden',
              flexShrink: 0,
              border: '1px solid rgba(255, 255, 255, 0.08)',
              boxShadow: 'inset 0 1px 1px rgba(255, 255, 255, 0.1), 0 8px 30px rgba(0,0,0,0.6)',
            }}>
              {details.profile_path ? (
                <img 
                  src={getProfileUrl(details.profile_path)} 
                  alt={details.name}
                  loading="lazy"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
                />
              ) : (
                <div style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  background: 'rgba(255, 255, 255, 0.03)',
                  borderRadius: '16px',
                }}>
                  <svg width={isMobile ? "28" : "36"} height={isMobile ? "28" : "36"} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </div>
              )}
            </div>

            <div style={{ flex: 1, minWidth: 0, paddingTop: isMobile ? '30px' : '50px' }}>
              <h1 style={{
                fontSize: 'clamp(1.1rem, 4vw, 1.8rem)',
                fontWeight: 700,
                color: '#fff',
                marginBottom: '6px',
                lineHeight: 1.2,
              }}>
                {details.name}
              </h1>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', color: '#888', fontSize: 'clamp(0.7rem, 1.8vw, 0.8rem)' }}>
                {details.known_for_department && <span>{details.known_for_department}</span>}
                {details.birthday && <span>• {details.birthday.split('-')[0]}</span>}
                {credits.length > 0 && <span>• {credits.length} credits</span>}
              </div>
            </div>
          </div>

          {biography && (
            <div style={{ marginBottom: '24px' }}>
              <p style={{
                fontSize: '1rem',
                color: 'rgba(255,255,255,0.95)',
                lineHeight: 1.6,
                margin: 0,
                textAlign: 'justify',
                letterSpacing: '0.1px',
              }}>
                {displayBio}
              </p>
              {showReadMore && (
                <button
                  onClick={(e) => { e.stopPropagation(); setBioExpanded(!bioExpanded); }}
                  style={{
                    background: 'none', border: 'none',
                    color: COLORS.primary,
                    fontSize: '0.8rem', fontWeight: 600,
                    padding: '4px 0', marginTop: '4px',
                    cursor: 'pointer',
                  }}
                >
                  {bioExpanded ? 'Less' : 'More'}
                </button>
              )}
            </div>
          )}

          <div>
            <h2 style={{
              fontSize: 'clamp(0.85rem, 2.2vw, 1rem)',
              fontWeight: 600,
              color: '#fff',
              marginBottom: '12px',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}>
              Filmography
            </h2>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))',
              gap: isMobile ? '10px' : '14px',
            }}>
              {credits.slice(0, displayLimit).map((item: any, index: number) => (
                <div 
                  key={`${item.id}-${item.title || item.name}-${index}`}
                  onClick={() => item.title ? onMovieClick(item) : onTVShowClick(item)}
                  style={{
                    cursor: 'pointer',
                    WebkitTapHighlightColor: 'transparent',
                    animation: index < 12 
                      ? `suggestionFadeInUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) ${index * 0.03}s both`
                      : 'none',
                    willChange: index < 12 ? 'transform, opacity' : 'auto',
                  }}
                >
                  <div 
                    className="actor-credit-card-inner"
                    style={{
                      position: 'relative',
                      aspectRatio: '2/3',
                      borderRadius: '12px',
                      overflow: 'hidden',
                      background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.07) 0%, rgba(255, 255, 255, 0.02) 100%)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      boxShadow: 'inset 0 1px 1px rgba(255, 255, 255, 0.1), 0 4px 12px rgba(0, 0, 0, 0.3)',
                      marginBottom: '8px',
                    }}
                  >
                    {item.posterPath ? (
                      <img 
                        src={getPosterUrl(item.posterPath, 'medium')} 
                        alt={item.title || item.name}
                        loading="lazy"
                        style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
                      />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#444', fontSize: '0.8rem', fontWeight: 600 }}>
                        No Image
                      </div>
                    )}
                    {item.voteAverage > 0 && (
                      <div style={{
                        position: 'absolute', top: '6px', right: '6px',
                        background: 'rgba(255, 255, 255, 0.12)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        backdropFilter: isMobile ? 'none' : 'blur(8px)',
                        WebkitBackdropFilter: isMobile ? 'none' : 'blur(8px)',
                        padding: '2.5px 5.5px',
                        borderRadius: '6px',
                        fontSize: '0.62rem',
                        fontWeight: 900,
                        color: '#ffffff',
                      }}>
                        {Math.round(item.voteAverage * 10)}%
                      </div>
                    )}
                  </div>
                  <p style={{
                    fontSize: 'clamp(0.6rem, 1.6vw, 0.72rem)',
                    fontWeight: 500,
                    color: '#ccc',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    margin: 0,
                  }}>
                    {item.title || item.name}
                  </p>
                  <p style={{
                    fontSize: 'clamp(0.55rem, 1.4vw, 0.65rem)',
                    color: '#555',
                    margin: 0,
                  }}>
                    {(item.releaseDate || item.firstAirDate || '').split('-')[0]}
                  </p>
                </div>
              ))}
            </div>

            {credits.length > displayLimit && (
              <div 
                ref={observerTargetRef} 
                style={{ 
                  height: '40px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  marginTop: '24px' 
                }}
              >
                <div style={{
                  width: '24px',
                  height: '24px',
                  border: '2px solid rgba(255, 255, 255, 0.1)',
                  borderTopColor: COLORS.primary,
                  borderRadius: '50%',
                  animation: 'spin 0.6s linear infinite'
                }} />
              </div>
            )}
          </div>
        </div>

        <div style={{ height: 'env(safe-area-inset-bottom, 16px)' }} />
      </div>

    </div>
  );
}

const ActorPageMemo = memo(ActorPage);
export default ActorPageMemo;
