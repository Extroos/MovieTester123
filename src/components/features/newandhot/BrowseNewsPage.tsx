import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Movie, TVShow } from '../../../types';
import { 
  getBackdropUrl, 
  getPosterUrl, 
  getMoviesByGenre, 
  getTVShowsByGenre 
} from '../../../services/tmdb';
import { triggerHaptic } from '../../../utils/haptics';
import { COLORS } from '../../../constants';

// --- Premium Design Tokens ---
const DESIGN = {
  glass: 'rgba(10, 10, 12, 0.45)',
  blur: '24px', 
  saturate: '190%',
  border: '1px solid rgba(255, 255, 255, 0.06)',
  borderActive: '1px solid rgba(255, 255, 255, 0.15)',
  shadow: 'inset 0 1px 0px rgba(255, 255, 255, 0.08), 0 12px 32px rgba(0, 0, 0, 0.5)',
  ease: [0.16, 1, 0.3, 1], 
};

interface BrowseNewsProps {
  trending: (Movie | TVShow)[];
  upcoming: Movie[];
  onItemClick: (item: any) => void;
}

const GENRES = [
  { id: 28, name: 'Action' },
  { id: 12, name: 'Adventure' },
  { id: 16, name: 'Animation' },
  { id: 35, name: 'Comedy' },
  { id: 80, name: 'Crime' },
  { id: 99, name: 'Documentary' },
  { id: 18, name: 'Drama' },
  { id: 10751, name: 'Family' },
  { id: 14, name: 'Fantasy' },
  { id: 27, name: 'Horror' },
  { id: 10402, name: 'Music' },
  { id: 9648, name: 'Mystery' },
  { id: 10749, name: 'Romance' },
  { id: 878, name: 'Sci-Fi' },
  { id: 53, name: 'Thriller' },
];

type ContentItem = (Movie | TVShow) & { mediaType: 'movie' | 'tv' };

export default function BrowseNewsPage({ trending, upcoming, onItemClick }: BrowseNewsProps) {
  const [activeTab, setActiveTab] = useState<'everyone' | 'coming' | 'categories'>('everyone');
  const [selectedGenre, setSelectedGenre] = useState<number | null>(null);
  const [genreContent, setGenreContent] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selectedGenre) {
      const loadContent = async () => {
        setLoading(true);
        try {
          const [m, s] = await Promise.all([
            getMoviesByGenre(selectedGenre),
            getTVShowsByGenre(selectedGenre)
          ]);
          setGenreContent([
            ...m.map(x => ({ ...x, mediaType: 'movie' as const })),
            ...s.map(x => ({ ...x, mediaType: 'tv' as const }))
          ].sort(() => Math.random() - 0.5));
        } catch (e) { console.error(e); }
        setLoading(false);
      };
      loadContent();
    }
  }, [selectedGenre]);

  const handleBack = useCallback(() => {
    triggerHaptic('light');
    setSelectedGenre(null);
  }, []);

  // Compute unique popular movie cover photo per genre with absolute reliability
  const genresWithImages = useMemo(() => {
    const allContent = [...trending, ...upcoming].filter(item => !!(item.backdropPath || item.posterPath));
    const usedMovieIds = new Set<number>();
    
    return GENRES.map(genre => {
      // 1. Find a unique movie matching this genre id
      let matchedMovie = allContent.find(item => {
        const ids = item.genres?.map((g: any) => g.id) || [];
        const hasGenre = ids.includes(genre.id);
        const isUnique = !usedMovieIds.has(item.id);
        return hasGenre && isUnique;
      });
      
      // 2. If no unique match by genre, try any match by genre (allowing duplicate)
      if (!matchedMovie) {
        matchedMovie = allContent.find(item => {
          const ids = item.genres?.map((g: any) => g.id) || [];
          return ids.includes(genre.id);
        });
      }
      
      // 3. If still no match, fallback to the most popular unused movie in the list
      if (!matchedMovie) {
        matchedMovie = allContent.find(item => !usedMovieIds.has(item.id));
      }
      
      // 4. Ultimate fallback to the first movie in the list
      if (!matchedMovie && allContent.length > 0) {
        matchedMovie = allContent[0];
      }

      let imagePath = '';
      if (matchedMovie) {
        usedMovieIds.add(matchedMovie.id);
        const relativePath = matchedMovie.backdropPath || matchedMovie.posterPath || '';
        imagePath = getBackdropUrl(relativePath, 'medium') || '';
      }

      // If no image could be resolved, use a premium dark fallback gradient
      if (!imagePath) {
        imagePath = 'linear-gradient(135deg, rgba(30,30,40,0.6) 0%, rgba(9,9,11,1) 100%)';
      }

      return {
        ...genre,
        imagePath
      };
    });
  }, [trending, upcoming]);

  if (selectedGenre) {
    const genre = GENRES.find(g => g.id === selectedGenre);
    return (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={{ minHeight: '100vh', background: '#09090b', paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div style={{ 
          position: 'sticky',
          top: 'calc(16px + env(safe-area-inset-top, 0px))',
          margin: '16px 16px 0',
          height: '52px',
          background: 'rgba(18, 18, 22, 0.7)',
          backdropFilter: 'blur(24px) saturate(190%)',
          WebkitBackdropFilter: 'blur(24px) saturate(190%)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '16px',
          boxShadow: '0 12px 40px rgba(0, 0, 0, 0.6)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
        }}>
          <button 
            onClick={handleBack} 
            style={{ 
              background: 'transparent', 
              border: 'none', 
              color: '#fff', 
              padding: '6px', 
              cursor: 'pointer', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              opacity: 0.9,
              outline: 'none',
              transition: 'opacity 0.2s ease, transform 0.2s ease'
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.opacity = '1';
                e.currentTarget.style.transform = 'scale(1.08)';
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.opacity = '0.9';
                e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
          </button>
          
          <div style={{ width: '1px', height: '18px', background: 'rgba(255,255,255,0.12)', margin: '0 14px' }} />

          <h2 style={{ 
            margin: 0, 
            fontSize: '15px', 
            fontWeight: 800, 
            color: '#FFFFFF',
            letterSpacing: '-0.2px',
            textTransform: 'uppercase'
          }}>{genre?.name}</h2>
        </div>
        
        <div style={{ 
          padding: '24px 16px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
          gap: '12px',
          paddingBottom: '120px'
        }}>
          {loading ? Array(12).fill(0).map((_, i) => (
            <div key={i} style={{ aspectRatio: '2/3', background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.04) 0%, rgba(255, 255, 255, 0.01) 100%)', borderRadius: '14px', border: DESIGN.border }} />
          )) :
            genreContent.map((item, idx) => (
              <div 
                key={item.id} 
                className="genre-content-card"
                onClick={() => onItemClick(item)} 
                style={{ 
                  aspectRatio: '2/3', 
                  borderRadius: '14px', 
                  overflow: 'hidden', 
                  background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.07) 0%, rgba(255, 255, 255, 0.02) 100%)', 
                  border: DESIGN.border, 
                  boxShadow: 'inset 0 1px 1px rgba(255, 255, 255, 0.05), 0 6px 16px rgba(0,0,0,0.4)',
                  position: 'relative',
                  animationDelay: `${idx * 12}ms`
                }}
              >
                <img src={getPosterUrl(item.posterPath, 'medium')} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            ))
          }
        </div>
      </motion.div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#09090b',
      color: '#fff',
      paddingTop: 'calc(68px + env(safe-area-inset-top, 0px))',
      paddingBottom: '120px'
    }}>
      {/* Editorial Header (Compact & Mobile-friendly) */}
      <div style={{
        padding: '8px 16px 12px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
        marginBottom: '12px'
      }}>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 900, letterSpacing: '-0.03em', margin: 0, lineHeight: 1.15 }}>New & Hot</h1>

        {/* Tab switchers in premium capsule design */}
        <div style={{ display: 'flex', gap: '4px', marginTop: '10px', background: 'rgba(255,255,255,0.03)', padding: '4px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
          {[
            { id: 'everyone', label: "Everyone's Watching" },
            { id: 'coming', label: 'Coming Soon' },
            { id: 'categories', label: 'Categories' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => { triggerHaptic('light'); setActiveTab(tab.id as any); }}
              style={{
                flex: 1,
                height: '36px',
                background: activeTab === tab.id ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                border: activeTab === tab.id ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid transparent',
                color: activeTab === tab.id ? '#fff' : 'rgba(255,255,255,0.5)',
                fontSize: '0.75rem',
                fontWeight: activeTab === tab.id ? 850 : 600,
                borderRadius: '12px',
                cursor: 'pointer',
                transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                textTransform: 'uppercase',
                letterSpacing: '0.02em',
              }}
              onMouseEnter={(e) => {
                  if (activeTab !== tab.id) {
                      e.currentTarget.style.color = '#fff';
                      e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                  }
              }}
              onMouseLeave={(e) => {
                  if (activeTab !== tab.id) {
                      e.currentTarget.style.color = 'rgba(255,255,255,0.5)';
                      e.currentTarget.style.background = 'transparent';
                  }
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '4px 16px 24px' }}>
        <AnimatePresence mode="wait">
          {activeTab === 'categories' ? (
            <motion.div 
              key="categories"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ ease: DESIGN.ease, duration: 0.4 }}
              style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}
            >
               {genresWithImages.map(genre => (
                <div
                  key={genre.id}
                  className="news-category-card"
                  onClick={() => { triggerHaptic('medium'); setSelectedGenre(genre.id); }}
                  style={{ 
                    aspectRatio: '1.7/1', 
                    borderRadius: '20px', 
                    position: 'relative', 
                    overflow: 'hidden', 
                    cursor: 'pointer', 
                    background: '#121214',
                    border: DESIGN.border,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.3)'
                  }}
                >
                  {/* Photo of a unique popular movie for this genre - Crisp and clear */}
                  {genre.imagePath.startsWith('linear') ? (
                    <div style={{ position: 'absolute', inset: 0, background: genre.imagePath }} />
                  ) : (
                    <img 
                      src={genre.imagePath} 
                      alt="" 
                      style={{ 
                        position: 'absolute', 
                        inset: 0, 
                        width: '100%', 
                        height: '100%', 
                        objectFit: 'cover',
                        opacity: 1
                      }} 
                    />
                  )}
                  
                  {/* Smooth, subtle gradient at the bottom for text readability, keeping photos crisp and clear */}
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.2) 50%, transparent 100%)',
                  }} />

                  <div style={{ 
                    position: 'absolute', 
                    inset: 0, 
                    padding: '16px', 
                    display: 'flex', 
                    alignItems: 'flex-end',
                  }}>
                    <span style={{ fontWeight: 900, fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#fff' }}>{genre.name}</span>
                  </div>
                </div>
              ))}
            </motion.div>
          ) : (
            <motion.div
              key={activeTab}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              {(() => {
                const list = activeTab === 'everyone' ? trending : upcoming;
                
                return list.map((item, index) => (
                  <div 
                    key={item.id} 
                    className="news-feed-card"
                    style={{ 
                      marginBottom: '32px', 
                      background: 'rgba(255,255,255,0.015)', 
                      borderRadius: '24px', 
                      padding: '12px', 
                      border: '1px solid rgba(255,255,255,0.03)',
                      animationDelay: `${Math.min(index % 4 * 80, 240)}ms`
                    }}
                  >
                    <div 
                      onClick={() => onItemClick(item)} 
                      className="news-media-box"
                      style={{ 
                        position: 'relative', 
                        aspectRatio: '16/9', 
                        borderRadius: '16px', 
                        overflow: 'hidden', 
                        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.01) 100%)',
                        border: DESIGN.border,
                        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
                        width: '100%',
                        cursor: 'pointer'
                      }}
                    >
                      <img 
                        src={getBackdropUrl(item.backdropPath, 'original') || getPosterUrl(item.posterPath, 'large')} 
                        alt="" 
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                        loading="lazy"
                      />
                      
                      {/* Premium White Badge */}
                      <div style={{ 
                        position: 'absolute', 
                        top: '12px', 
                        right: '12px', 
                        background: '#ffffff', 
                        color: '#000000',
                        padding: '5px 10px', 
                        borderRadius: '8px', 
                        fontSize: '0.65rem', 
                        fontWeight: 900,
                        letterSpacing: '0.06em',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                        textTransform: 'uppercase'
                      }}>
                        {activeTab === 'everyone' ? "EVERYONE'S WATCHING" : 'COMING SOON'}
                      </div>
                    </div>
                    
                    <div style={{ 
                      marginTop: '16px', 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'flex-start',
                      padding: '0 4px',
                      textAlign: 'left'
                    }}>
                      <div style={{ flex: 1, marginRight: '16px' }}>
                        <h3 
                          onClick={() => onItemClick(item)} 
                          style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.25, cursor: 'pointer', color: '#fff' }}
                        >
                          {(item as Movie).title || (item as TVShow).name}
                        </h3>
                        <p style={{ 
                          margin: '8px 0 0', 
                          fontSize: '0.85rem', 
                          color: 'rgba(255, 255, 255, 0.55)', 
                          lineHeight: '1.5', 
                          display: '-webkit-box', 
                          WebkitLineClamp: 2, 
                          WebkitBoxOrient: 'vertical', 
                          overflow: 'hidden',
                          fontWeight: 400
                        }}>
                          {item.overview}
                        </p>
                      </div>
                      
                    </div>
                  </div>
                ));
              })()}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
