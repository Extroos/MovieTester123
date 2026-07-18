import React, { useState, useEffect, memo, useRef } from 'react';
import type { Movie, TVShow } from '../../../types';
import { getPersonDetails, getPersonCombinedCredits, getProfileUrl, getPosterUrl, getBackdropUrl } from '../../../services/tmdb';
import { COLORS } from '../../../constants';
import { triggerHaptic } from '../../../utils/haptics';

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

  const isTV = typeof document !== 'undefined' && document.body.classList.contains('tv-mode');

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
        background: isTV ? 'radial-gradient(circle at 10% 20%, rgba(20, 20, 25, 0.98) 0%, rgba(10, 10, 12, 0.99) 100%)' : isMobile ? '#0a0a0a' : 'rgba(10,10,10,0.9)',
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
  const bioLimit = isTV ? 380 : isMobile ? 120 : 280;
  const showReadMore = biography.length > bioLimit;
  const displayBio = bioExpanded ? biography : biography.substring(0, bioLimit) + (showReadMore ? '...' : '');

  // Render TV Widescreen mode cleanly
  if (isTV) {
    return (
      <div 
        className="tv-actor-page-overlay tv-settings-container"
        style={{
          position: 'fixed', inset: 0, zIndex: 4000,
          background: 'radial-gradient(circle at 10% 20%, rgba(15, 15, 20, 0.98) 0%, rgba(8, 8, 10, 0.99) 100%)',
          color: '#ffffff',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'row',
        }}
      >
        {/* Left Side: Actor info and Bio Card */}
        <div style={{
          width: '34vw',
          height: '100%',
          background: 'rgba(2, 2, 4, 0.45)',
          backdropFilter: 'blur(30px)',
          WebkitBackdropFilter: 'blur(30px)',
          borderRight: '1px solid rgba(255,255,255,0.08)',
          padding: '6vh 3vw',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto'
        }} className="no-scrollbar">
          
          {/* Back/Close Button */}
          <button
            onClick={onClose}
            className="tv-focusable"
            aria-label="Back"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: '#ffffff',
              width: '42px',
              height: '42px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              marginBottom: '4vh',
              outline: 'none',
              transition: 'all 0.2s'
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>

          {/* Actor Profile Frame */}
          <div style={{ display: 'flex', gap: '1.5vw', alignItems: 'center', marginBottom: '3vh' }}>
            <div style={{
              width: '100px', height: '140px', borderRadius: '12px', overflow: 'hidden',
              border: '1px solid rgba(255,255,255,0.1)', flexShrink: 0,
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)'
            }}>
              {details.profile_path ? (
                <img src={getProfileUrl(details.profile_path)} alt={details.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#18181b' }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                </div>
              )}
            </div>

            <div>
              <h1 style={{ margin: '0 0 6px 0', fontSize: '1.45rem', fontWeight: 950, letterSpacing: '-0.02em', lineHeight: 1.15 }}>{details.name}</h1>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', color: 'rgba(255,255,255,0.4)', fontSize: '0.72rem', fontWeight: 800 }}>
                {details.known_for_department && <span>{details.known_for_department}</span>}
                {details.birthday && <span>• {details.birthday.split('-')[0]}</span>}
                {credits.length > 0 && <span>• {credits.length} credits</span>}
              </div>
            </div>
          </div>

          {/* Actor Biography block */}
          {biography && (
            <div style={{ flex: 1 }}>
              <h2 style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.5)', margin: '0 0 1vh 0', fontWeight: 900 }}>Biography</h2>
              <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.8)', lineHeight: 1.6, margin: 0, textAlign: 'left' }}>
                {displayBio}
              </p>
              {showReadMore && (
                <button
                  onClick={(e) => { e.stopPropagation(); setBioExpanded(!bioExpanded); }}
                  className="tv-focusable"
                  tabIndex={0}
                  style={{
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                    color: '#fff', fontSize: '0.75rem', fontWeight: 800,
                    padding: '6px 14px', marginTop: '1.5vh', borderRadius: '6px',
                    cursor: 'pointer', outline: 'none'
                  }}
                >
                  {bioExpanded ? 'Read Less' : 'Read More'}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right Side: Filmography Grid (Widescreen landscape layout) */}
        <div style={{
          flex: 1,
          height: '100%',
          padding: '6vh 4vw',
          boxSizing: 'border-box',
          overflowY: 'auto'
        }} className="no-scrollbar">
          <h2 style={{ margin: '0 0 3vh 0', fontSize: '1.25rem', fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Filmography</h2>
          
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
            gap: '2vh 1.5vw'
          }}>
            {credits.slice(0, displayLimit).map((item: any, index: number) => (
              <div 
                key={`${item.id}-${item.title || item.name}-${index}`}
                onClick={() => { triggerHaptic('light'); item.title ? onMovieClick(item) : onTVShowClick(item); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    triggerHaptic('light');
                    if (item.title) onMovieClick(item); else onTVShowClick(item);
                  }
                }}
                tabIndex={0}
                className="tv-focusable"
                style={{
                  cursor: 'pointer',
                  borderRadius: '12px',
                  outline: 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{
                  position: 'relative',
                  aspectRatio: '2/3',
                  borderRadius: '10px',
                  overflow: 'hidden',
                  background: '#18181b',
                  border: '1px solid rgba(255,255,255,0.06)',
                  marginBottom: '8px',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)'
                }}>
                  {item.posterPath ? (
                    <img src={getPosterUrl(item.posterPath, 'medium')} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.2)', fontSize: '0.75rem', fontWeight: 800 }}>No Image</div>
                  )}
                  {item.voteAverage > 0 && (
                    <div style={{
                      position: 'absolute', top: '6px', right: '6px',
                      background: 'rgba(0,0,0,0.7)',
                      padding: '2.5px 5.5px',
                      borderRadius: '4px',
                      fontSize: '0.6rem',
                      fontWeight: 900,
                      color: '#ffffff',
                    }}>
                      {Math.round(item.voteAverage * 10)}%
                    </div>
                  )}
                </div>
                
                <p style={{
                  fontSize: '0.78rem',
                  fontWeight: 800,
                  color: '#fff',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  margin: '0 0 2px 0',
                }}>
                  {item.title || item.name}
                </p>
                <p style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.3)', margin: 0 }}>
                  {(item.releaseDate || item.firstAirDate || '').split('-')[0]}
                </p>
              </div>
            ))}
          </div>

          {credits.length > displayLimit && (
            <div ref={observerTargetRef} style={{ height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '30px' }}>
              <div style={{ width: '20px', height: '20px', border: '2px solid rgba(255, 255, 255, 0.1)', borderTopColor: COLORS.primary, borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
            </div>
          )}
        </div>

        <style>{`
          .tv-focusable:focus {
            background: #ffffff !important;
            color: #000000 !important;
            transform: scale(1.03) !important;
            box-shadow: 0 0 0 3px #ffffff !important;
          }
          .tv-focusable:focus p {
            color: #000000 !important;
          }
          .tv-focusable:focus svg {
            color: #000000 !important;
          }
        `}</style>
      </div>
    );
  }

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
