import React, { useState, useEffect, useRef } from 'react';
import type { Movie } from '../../../types';
import { searchMulti, getPosterUrl } from '../../../services/tmdb';
import { COLORS, GENRES } from '../../../constants';
import { triggerHaptic } from '../../../utils/haptics';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';

interface SearchOverlayProps {
  onClose: () => void;
  onMovieClick: (movie: Movie) => void;
  onShowResults: (query: string, results: Movie[]) => void;
}

export default function SearchOverlay({ onClose, onMovieClick, onShowResults }: SearchOverlayProps) {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [suggestions, setSuggestions] = useState<Movie[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedYear, setSelectedYear] = useState<string>('All');
  const [selectedGenre, setSelectedGenre] = useState<number | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastSearchQuery = useRef<string>('');
  
  const overlayIconRef = useRef<SVGSVGElement>(null);
  const [iconStyle, setIconStyle] = useState<React.CSSProperties>({
    transform: 'none',
    opacity: 0.6
  });
  const [iconStroke, setIconStroke] = useState('rgba(255,255,255,0.6)');

  React.useLayoutEffect(() => {
    // Locate the active/visible search button in the DOM (since multiple headers exist across views)
    let headerSearchBtn: Element | null = null;
    const searchButtons = document.querySelectorAll('button[aria-label="Search"]');
    
    for (let i = 0; i < searchButtons.length; i++) {
      const rect = searchButtons[i].getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        headerSearchBtn = searchButtons[i].querySelector('svg') || searchButtons[i];
        break;
      }
    }

    if (headerSearchBtn && overlayIconRef.current) {
      const startRect = headerSearchBtn.getBoundingClientRect();
      const endRect = overlayIconRef.current.getBoundingClientRect();
      const dx = startRect.left - endRect.left;
      const dy = startRect.top - endRect.top;

      // Position the overlay icon exactly over the header icon (opacity: 1, scale: 1.1)
      setIconStyle({
        transform: `translate(${dx}px, ${dy}px) scale(1.1)`,
        opacity: 1,
        transition: 'none'
      });
      setIconStroke('#ffffff');
      
      // Force a reflow
      overlayIconRef.current.getBoundingClientRect();

      // Animate it to its natural position in the next paint frame
      const animTimer = setTimeout(() => {
        setIconStyle({
          transform: 'translate(0, 0) scale(1)',
          opacity: 0.6,
          transition: 'transform 0.45s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.45s cubic-bezier(0.16, 1, 0.3, 1)'
        });
        setIconStroke('rgba(255,255,255,0.6)');
      }, 30);
      return () => clearTimeout(animTimer);
    }
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
    const saved = localStorage.getItem('recent_searches');
    if (saved) setRecentSearches(JSON.parse(saved));
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [onClose]);

  useEffect(() => {
    if (!query.trim()) {
      setSuggestions([]);
      setSearching(false);
      return;
    }

    const delayDebounceFn = setTimeout(async () => {
      performSearch(query);
    }, 400);

    return () => clearTimeout(delayDebounceFn);
  }, [query]);

  const addToRecent = (term: string) => {
    const updated = [term, ...recentSearches.filter(t => t !== term)].slice(0, 5);
    setRecentSearches(updated);
    localStorage.setItem('recent_searches', JSON.stringify(updated));
  };

  const performSearch = async (searchTerm: string, force: boolean = false) => {
    if (!searchTerm.trim()) return;
    if (!force && searchTerm === lastSearchQuery.current) return;

    if (abortControllerRef.current) abortControllerRef.current.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    
    setSearching(true);
    try {
      const results = await searchMulti(searchTerm, controller.signal);
      setSuggestions(results);
      lastSearchQuery.current = searchTerm;
    } catch (error: any) {
      if (error.name !== 'AbortError') console.error('Search failed:', error);
    } finally {
      if (!controller.signal.aborted) setSearching(false);
    }
  };

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!query.trim()) return;
    triggerHaptic('medium');
    addToRecent(query);

    let results = suggestions;
    if (searching || query !== lastSearchQuery.current) {
      results = await searchMulti(query);
    }
    
    onShowResults(query, applyFilters(results));
  };

  const handleVibeClick = async (vibe: string) => {
    triggerHaptic('medium');
    let targetGenre: number | null = null;
    let keyword = vibe;

    // Map vibes to logical filters
    switch(vibe) {
      case 'Atmospheric': targetGenre = 878; break; // Sci-Fi
      case 'Intense': targetGenre = 53; break; // Thriller
      case 'Light-hearted': targetGenre = 35; break; // Comedy
      case 'Dark': targetGenre = 27; break; // Horror
      case 'Hopeful': targetGenre = 18; break; // Drama/Family
    }

    setSelectedGenre(targetGenre);
    setQuery(vibe);
    performSearch(vibe, true);
  };

  const applyFilters = (items: Movie[]) => {
    return items.filter(item => {
      const yearMatch = selectedYear === 'All' || item.releaseDate?.startsWith(selectedYear) || (item as any).firstAirDate?.startsWith(selectedYear);
      const genreMatch = !selectedGenre || item.genres?.some(g => g.id === selectedGenre) || (item as any).genre_ids?.includes(selectedGenre);
      return yearMatch && genreMatch;
    });
  };

  const filteredSuggestions = applyFilters(suggestions);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2000,
      background: 'rgba(10, 10, 10, 0.5)', 
      backdropFilter: 'blur(25px) saturate(200%) brightness(1.1)',
      WebkitBackdropFilter: 'blur(25px) saturate(200%) brightness(1.1)',
      display: 'flex', flexDirection: 'column',
      overscrollBehavior: 'contain',
      animation: 'backdropFadeBlur 0.4s ease-out forwards',
    }}>
      <style>{`
        @keyframes slideDownFilter {
          from {
            opacity: 0;
            transform: translateY(-10px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
      {/* Floating Search Capsule */}
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
        animation: 'fadeInDown 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards'
      }}>
        {/* Back Button */}
        <button 
          onClick={onClose} 
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

        {/* Search Input Form */}
        <form onSubmit={handleSearch} style={{ flex: 1, height: '100%', display: 'flex', alignItems: 'center', position: 'relative' }}>
          <svg 
            ref={overlayIconRef}
            width="20" 
            height="20" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke={iconStroke} 
            strokeWidth="2.2" 
            style={{ 
              position: 'absolute', 
              left: '0', 
              pointerEvents: 'none',
              willChange: 'transform, opacity',
              ...iconStyle
            }}
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          
          <input
            ref={inputRef}
            type="text"
            placeholder="Search movies, TV shows..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ 
              width: '100%', 
              height: '100%',
              padding: '0 40px 0 32px', 
              background: 'transparent', 
              border: 'none', 
              color: '#FFFFFF', 
              fontSize: '15px', 
              fontWeight: 650, 
              outline: 'none' 
            }}
          />

          {/* Filter toggle button */}
          <div style={{ position: 'absolute', right: '0', display: 'flex', alignItems: 'center' }}>
            <button 
              type="button" 
              onClick={() => { triggerHaptic('light'); setShowFilters(!showFilters); }} 
              style={{ 
                background: showFilters ? COLORS.primary : 'transparent', 
                border: 'none', 
                color: showFilters ? '#000000' : '#FFFFFF', 
                width: '32px', 
                height: '32px', 
                borderRadius: '8px', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                cursor: 'pointer',
                opacity: showFilters ? 1 : 0.7,
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => { if (!showFilters) e.currentTarget.style.opacity = '1'; }}
              onMouseLeave={(e) => { if (!showFilters) e.currentTarget.style.opacity = '0.7'; }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>
            </button>
          </div>
        </form>
      </div>

      {showFilters && (
        <div style={{ 
          position: 'fixed',
          top: 'calc(80px + env(safe-area-inset-top, 0px))',
          left: '12px',
          right: '12px',
          padding: '8px 16px',
          background: 'rgba(15, 15, 15, 0.65)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '14px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
          zIndex: 2000,
          display: 'flex', 
          gap: '12px', 
          overflowX: 'auto', 
          animation: 'slideDownFilter 0.3s cubic-bezier(0.16, 1, 0.3, 1) both',
          scrollbarWidth: 'none'
        }}>
          <select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', padding: '8px 12px', borderRadius: '12px', outline: 'none', fontSize: '14px', fontWeight: 600 }}>
            <option value="All">All Years</option>
            {[...Array(30)].map((_, i) => <option key={i} value={2024 - i}>{2024 - i}</option>)}
          </select>
          <select value={selectedGenre || ''} onChange={(e) => setSelectedGenre(Number(e.target.value) || null)} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', padding: '8px 12px', borderRadius: '12px', outline: 'none', fontSize: '14px', fontWeight: 600 }}>
            <option value="">All Genres</option>
            {Object.entries(GENRES).map(([name, id]) => <option key={id} value={id}>{name.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
      )}

      <div 
        className="no-scrollbar" 
        style={{ 
          flex: 1, 
          overflowY: 'auto', 
          padding: `calc(${showFilters ? 140 : 84}px + env(safe-area-inset-top, 0px)) 20px 80px`,
          transition: 'padding-top 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
      >
        {!query && !searching && (
          <div>
            {recentSearches.length > 0 && (
              <div style={{ marginBottom: '24px' }}>
                <p style={{ fontSize: '12px', fontWeight: 800, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '12px' }}>Recent</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {recentSearches.map((term, index) => (
                    <button key={term} onClick={() => setQuery(term)} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', padding: '6px 14px', borderRadius: '10px', fontSize: '14px', fontWeight: 600, transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)', animation: 'fadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) both', animationDelay: `${index * 30}ms` }} onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'} onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}>{term}</button>
                  ))}
                </div>
              </div>
            )}
            <p style={{ fontSize: '12px', fontWeight: 800, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '12px' }}>Vibes</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '24px' }}>
              {['Atmospheric', 'Intense', 'Light-hearted', 'Dark', 'Hopeful'].map((vibe, index) => (
                <button 
                  key={vibe} 
                  onClick={() => handleVibeClick(vibe)} 
                  style={{ 
                    background: query === vibe ? COLORS.primary : 'rgba(255,255,255,0.05)', 
                    border: '1px solid rgba(255,255,255,0.08)', 
                    color: '#fff', 
                    padding: '8px 16px', 
                    borderRadius: '12px', 
                    fontSize: '14px', 
                    fontWeight: 700,
                    transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                    animation: 'fadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) both',
                    animationDelay: `${index * 30}ms`
                  }}
                  onMouseEnter={(e) => { if (query !== vibe) e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
                  onMouseLeave={(e) => { if (query !== vibe) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                >
                  {vibe}
                </button>
              ))}
            </div>

            <p style={{ fontSize: '12px', fontWeight: 800, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '12px' }}>Browse</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {['Trending', 'New', 'Oscar Winners', 'Disney+', 'Netflix'].map((tag, index) => (
                <button 
                  key={tag} 
                  onClick={() => setQuery(tag)} 
                  style={{ 
                    background: 'rgba(255,255,255,0.05)', 
                    border: '1px solid rgba(255,255,255,0.08)', 
                    color: '#fff', 
                    padding: '8px 16px', 
                    borderRadius: '12px', 
                    fontSize: '14px', 
                    fontWeight: 600,
                    transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                    animation: 'fadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) both',
                    animationDelay: `${index * 30}ms`
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'; }}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        )}

        {searching ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '40px' }}><div style={{ width: '30px', height: '30px', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: COLORS.primary, borderRadius: '50%', animation: 'spin 1s linear infinite' }} /></div>
        ) : filteredSuggestions.length === 0 && query.trim() ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingTop: '60px', gap: '12px', textAlign: 'center' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
            </div>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '1rem', fontWeight: 700, margin: 0 }}>No results for "{query}"</p>
            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.82rem', margin: 0 }}>Try a different spelling or keyword</p>
          </div>
        ) : filteredSuggestions.map((movie, index) => (
          <div 
            key={movie.id} 
            onClick={() => {
              addToRecent(movie.title || (movie as any).name || query);
              onMovieClick(movie);
            }}
            className="search-result-row"
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '16px', 
              padding: '12px 16px', 
              borderRadius: '16px', 
              background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.01) 100%)', 
              border: '1px solid rgba(255, 255, 255, 0.06)',
              boxShadow: 'inset 0 1px 1px rgba(255, 255, 255, 0.05)',
              marginBottom: '10px', 
              cursor: 'pointer',
              animation: 'fadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) both',
              animationDelay: `${index * 30}ms`
            }}
          >
            <img src={getPosterUrl(movie.posterPath, 'small')} alt="" style={{ width: '44px', height: '66px', borderRadius: '8px', objectFit: 'cover', border: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <h4 style={{ color: '#fff', fontSize: '16px', fontWeight: 700, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{movie.title || (movie as any).name}</h4>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px', margin: '4px 0 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>{(movie.releaseDate || (movie as any).firstAirDate || '').split('-')[0]}</span>
                <span style={{ padding: '1px 7px', borderRadius: '5px', fontSize: '10px', fontWeight: 800, letterSpacing: '0.04em', background: (movie as any).name ? 'rgba(99, 102, 241, 0.2)' : 'rgba(239, 68, 68, 0.2)', color: (movie as any).name ? '#a5b4fc' : '#fca5a5', border: `1px solid ${(movie as any).name ? 'rgba(99,102,241,0.3)' : 'rgba(239,68,68,0.3)'}` }}>{(movie as any).name ? 'TV SHOW' : 'MOVIE'}</span>
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
