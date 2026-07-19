import React, { useState, useEffect, useRef } from 'react';
import type { Movie } from '../../../types';
import { searchMulti, getPosterUrl, getTrendingByGenre, getDiscoverNetflix, getDiscoverDisney, getDiscoverOscars, getTrending, getUpcoming } from '../../../services/tmdb';
import { Mic, Keyboard as KeyboardIcon, LayoutGrid, Clapperboard, Tv, Star, Cloud, Zap, Smile, Moon, Sun, Skull, HelpCircle, Heart, Globe, Flame, Mountain, Palette, Film, Search, Users } from 'lucide-react';
import { COLORS, GENRES } from '../../../constants';
import { triggerHaptic } from '../../../utils/haptics';
import { t } from '../../../utils/i18n';

interface SearchOverlayProps {
  onClose: () => void;
  onMovieClick: (movie: Movie) => void;
  onShowResults: (query: string, results: Movie[]) => void;
  disabled?: boolean;
}

export default function SearchOverlay({ onClose, onMovieClick, onShowResults, disabled = false }: SearchOverlayProps) {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [suggestions, setSuggestions] = useState<Movie[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedYear, setSelectedYear] = useState<string>('All');
  const [selectedGenre, setSelectedGenre] = useState<number | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'movie' | 'tv' | 'anime'>('all');
  const [highRatingOnly, setHighRatingOnly] = useState(false);

  const isKids = (() => {
    try {
      const stored = localStorage.getItem('watchmovie_active_profile_cache');
      return stored ? JSON.parse(stored)?.isKids === true : false;
    } catch { return false; }
  })();

  const filterKids = (items: Movie[]): Movie[] => {
    if (!isKids) return items;
    return items.filter(item => {
      if (!item) return false;
      const title = (item.title || (item as any).name || '').toLowerCase();
      const overview = (item.overview || '').toLowerCase();
      const text = title + ' ' + overview;
      
      const blacklist = ['blood', 'gore', 'combat', 'kill', 'murder', 'obsession', 'desire', 'slasher', 'fight', 'mortal', 'odyssey'];
      if (blacklist.some(word => text.includes(word))) return false;
      
      const genreIds = item.genre_ids || (item as any).genreIds || item.genres?.map((g: any) => g.id) || [];
      const hasRestricted = genreIds.some((id: number) => [28, 27, 80, 53, 10752, 9648, 18].includes(id));
      if (hasRestricted) return false;

      return genreIds.some((id: number) => [16, 10751, 35].includes(id));
    });
  };

  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastSearchQuery = useRef<string>('');
  
  // In-memory query cache for instant back-navigation and typing performance
  const searchCache = useRef<Record<string, Movie[]>>({});

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

    // Check for preselected genre badge redirect
    const preselected = localStorage.getItem('cinemovie_preselected_genre');
    if (preselected) {
      localStorage.removeItem('cinemovie_preselected_genre');
      try {
        const { name, id } = JSON.parse(preselected);
        triggerGenreDiscovery(name, id);
      } catch (e) {
        console.error(e);
      }
    }

    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [onClose]);

  useEffect(() => {
    if (disabled) {
      inputRef.current?.blur();
    } else {
      setTimeout(() => {
        if (!disabled) inputRef.current?.focus();
      }, 80);
    }
  }, [disabled]);

  useEffect(() => {
    if (!query.trim()) {
      setSuggestions([]);
      setSearching(false);
      return;
    }

    // Faster 250ms debounce for premium, snappy experience
    const delayDebounceFn = setTimeout(async () => {
      performSearch(query);
    }, 250);

    return () => clearTimeout(delayDebounceFn);
  }, [query]);

  const addToRecent = (term: string) => {
    const updated = [term, ...recentSearches.filter(t => t !== term)].slice(0, 5);
    setRecentSearches(updated);
    localStorage.setItem('recent_searches', JSON.stringify(updated));
  };

  const performSearch = async (searchTerm: string, force: boolean = false) => {
    const term = searchTerm.trim();
    if (!term) return;
    if (!force && term === lastSearchQuery.current) return;

    // Check query cache first to skip fetch
    if (searchCache.current[term]) {
      setSuggestions(searchCache.current[term]);
      lastSearchQuery.current = term;
      setSearching(false);
      return;
    }

    if (abortControllerRef.current) abortControllerRef.current.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    
    setSearching(true);
    try {
      let results: Movie[] = [];
      if (term === 'Trending') {
        const movies = await getTrending('week');
        results = movies;
      } else if (term === 'New') {
        const movies = await getUpcoming();
        results = movies;
      } else if (term === 'Oscar Winners') {
        const movies = await getDiscoverOscars(controller.signal);
        results = movies;
      } else if (term === 'Disney+') {
        const [m, t] = await Promise.all([
          getDiscoverDisney('movie', controller.signal),
          getDiscoverDisney('tv', controller.signal)
        ]);
        results = [...m, ...t].map(item => {
          const isTV = (item as any).name !== undefined || (item as any).mediaType === 'tv';
          return {
            ...item,
            title: (item as any).title || (item as any).name || 'Untitled',
            releaseDate: (item as any).releaseDate || (item as any).firstAirDate || '',
            mediaType: isTV ? 'tv' : 'movie'
          } as unknown as Movie;
        }).sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
      } else if (term === 'Netflix') {
        const [m, t] = await Promise.all([
          getDiscoverNetflix('movie', controller.signal),
          getDiscoverNetflix('tv', controller.signal)
        ]);
        results = [...m, ...t].map(item => {
          const isTV = (item as any).name !== undefined || (item as any).mediaType === 'tv';
          return {
            ...item,
            title: (item as any).title || (item as any).name || 'Untitled',
            releaseDate: (item as any).releaseDate || (item as any).firstAirDate || '',
            mediaType: isTV ? 'tv' : 'movie'
          } as unknown as Movie;
        }).sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
      } else {
        results = await searchMulti(term, controller.signal);
      }
      
      // Save result in cache
      searchCache.current[term] = results;
      
      setSuggestions(results);
      lastSearchQuery.current = term;
    } catch (error: any) {
      if (error.name !== 'AbortError') console.error('Search failed:', error);
    } finally {
      if (!controller.signal.aborted) setSearching(false);
    }
  };

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    inputRef.current?.blur();
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    const term = query.trim();
    if (!term) return;
    triggerHaptic('medium');
    addToRecent(term);

    let results = suggestions;
    if (searching || term !== lastSearchQuery.current) {
      if (searchCache.current[term]) {
        results = searchCache.current[term];
      } else {
        // Cancel active/debounced background searches to avoid race condition writes
        if (abortControllerRef.current) abortControllerRef.current.abort();
        const controller = new AbortController();
        abortControllerRef.current = controller;
        setSearching(true);
        try {
          if (['Trending', 'New', 'Oscar Winners', 'Disney+', 'Netflix'].includes(term)) {
            await performSearch(term, true);
            results = searchCache.current[term] || [];
          } else {
            results = await searchMulti(term, controller.signal);
            searchCache.current[term] = results;
            setSuggestions(results);
            lastSearchQuery.current = term;
          }
        } catch (error: any) {
          if (error.name !== 'AbortError') {
            console.error('Search failed:', error);
          }
          return;
        } finally {
          setSearching(false);
        }
      }
    }
    
    onShowResults(query, applyFilters(results));
  };

  const handleVibeClick = async (vibe: string) => {
    triggerHaptic('medium');
    let targetGenre: number | null = null;

    switch(vibe) {
      case 'Atmospheric': targetGenre = 878; break; // Sci-Fi
      case 'Intense': targetGenre = 53; break; // Thriller
      case 'Light-hearted': targetGenre = 35; break; // Comedy
      case 'Dark': targetGenre = 27; break; // Horror
      case 'Hopeful': targetGenre = 18; break; // Drama
      case 'Crime': targetGenre = 80; break;
      case 'Horror': targetGenre = 27; break;
      case 'Mystery': targetGenre = 9648; break;
      case 'Romance': targetGenre = 10749; break;
      case 'Comedy': targetGenre = 35; break;
      case 'Sci-Fi': targetGenre = 878; break;
      case 'Action': targetGenre = 28; break;
      case 'Adventure': targetGenre = 12; break;
      case 'Fantasy': targetGenre = 14; break;
      case 'Family': targetGenre = 10751; break;
      case 'Animation': targetGenre = 16; break;
    }

    if (!targetGenre) return;

    setSelectedGenre(targetGenre);
    setQuery(vibe);
    
    // Check cache first
    if (searchCache.current[vibe]) {
      setSuggestions(searchCache.current[vibe]);
      lastSearchQuery.current = vibe;
      return;
    }

    if (abortControllerRef.current) abortControllerRef.current.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setSearching(true);
    try {
      // Query discover endpoints for high-quality popular results of this genre
      const [movies, tvShows] = await Promise.all([
        getTrendingByGenre(targetGenre, 'movie', controller.signal),
        getTrendingByGenre(targetGenre, 'tv', controller.signal)
      ]);

      const combined = [...movies, ...tvShows]
        .map(item => {
          const isTV = (item as any).name !== undefined || (item as any).mediaType === 'tv';
          return {
            ...item,
            title: (item as any).title || (item as any).name || 'Untitled',
            releaseDate: (item as any).releaseDate || (item as any).firstAirDate || '',
            mediaType: isTV ? 'tv' : 'movie'
          } as unknown as Movie;
        })
        .sort((a, b) => (b.popularity || 0) - (a.popularity || 0));

      searchCache.current[vibe] = combined;
      setSuggestions(combined);
      lastSearchQuery.current = vibe;
    } catch (error: any) {
      if (error.name !== 'AbortError') console.error('Failed to fetch vibe contents:', error);
    } finally {
      if (!controller.signal.aborted) setSearching(false);
    }
  };

  const triggerGenreDiscovery = async (genreName: string, genreId: number) => {
    setSelectedGenre(genreId);
    setQuery(genreName);
    
    if (searchCache.current[genreName]) {
      setSuggestions(searchCache.current[genreName]);
      lastSearchQuery.current = genreName;
      return;
    }

    if (abortControllerRef.current) abortControllerRef.current.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setSearching(true);
    try {
      const [movies, tvShows] = await Promise.all([
        getTrendingByGenre(genreId, 'movie', controller.signal),
        getTrendingByGenre(genreId, 'tv', controller.signal)
      ]);

      const combined = [...movies, ...tvShows]
        .map(item => {
          const isTV = (item as any).name !== undefined || (item as any).mediaType === 'tv';
          return {
            ...item,
            title: (item as any).title || (item as any).name || 'Untitled',
            releaseDate: (item as any).releaseDate || (item as any).firstAirDate || '',
            mediaType: isTV ? 'tv' : 'movie'
          } as unknown as Movie;
        })
        .sort((a, b) => (b.popularity || 0) - (a.popularity || 0));

      searchCache.current[genreName] = combined;
      setSuggestions(combined);
      lastSearchQuery.current = genreName;
    } catch (error: any) {
      if (error.name !== 'AbortError') console.error('Failed to fetch genre contents:', error);
    } finally {
      if (!controller.signal.aborted) setSearching(false);
    }
  };

  const applyFilters = (items: Movie[]) => {
    return items.filter(item => {
      const yearMatch = selectedYear === 'All' || item.releaseDate?.startsWith(selectedYear) || (item as any).firstAirDate?.startsWith(selectedYear);
      const genreMatch = !selectedGenre || item.genres?.some(g => g.id === selectedGenre) || (item as any).genre_ids?.includes(selectedGenre);
      
      let typeMatch = true;
      const isTV = (item as any).name !== undefined || (item as any).mediaType === 'tv';
      const isAnime = (item as any).mediaType === 'anime' || (item as any).genres?.some((g: any) => g.id === 16) || (item as any).genre_ids?.includes(16);
      
      if (filterType === 'movie') {
        typeMatch = !isTV && !isAnime;
      } else if (filterType === 'tv') {
        typeMatch = isTV && !isAnime;
      } else if (filterType === 'anime') {
        typeMatch = isAnime;
      }
      
      const ratingMatch = !highRatingOnly || (item.voteAverage && item.voteAverage >= 8);

      return yearMatch && genreMatch && typeMatch && ratingMatch;
    });
  };

  const filteredSuggestions = filterKids(applyFilters(suggestions));

  // Compute layout dimensions optimized to match Header.tsx spacing
  const headerOffset = showFilters ? 146 : 92;

  const isTV = typeof document !== 'undefined' && document.body.classList.contains('tv-mode');
  const [showKeyboard, setShowKeyboard] = useState(false);

  const keyboardRows = [
    ['A', 'B', 'C', 'D', 'E', 'F'],
    ['G', 'H', 'I', 'J', 'K', 'L'],
    ['M', 'N', 'O', 'P', 'Q', 'R'],
    ['S', 'T', 'U', 'V', 'W', 'X'],
    ['Y', 'Z', '1', '2', '3', '4'],
    ['5', '6', '7', '8', '9', '0'],
    ['Space', 'Backspace', 'Clear']
  ];

  const handleKeyClick = (key: string) => {
    triggerHaptic('light');
    if (key === 'Space') {
      setQuery(prev => prev + ' ');
    } else if (key === 'Backspace') {
      setQuery(prev => prev.slice(0, -1));
    } else if (key === 'Clear') {
      setQuery('');
    } else {
      setQuery(prev => prev + key);
    }
  };

  if (isTV) {
    return (
      <div 
        className="search-overlay-container"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 2000,
          background: 'radial-gradient(circle at 12% 15%, rgba(229, 9, 20, 0.08) 0%, rgba(9, 9, 11, 1) 50%, rgba(0, 0, 0, 1) 100%)',
          display: 'flex',
          flexDirection: 'column',
          padding: '4vh 4vw',
          boxSizing: 'border-box',
          gap: '2.5vh',
          overflow: 'hidden'
        }}
      >
        <style>{`
          .tv-search-capsule:focus-within {
            border: 1px solid rgba(255,255,255,0.2) !important;
            background: rgba(255,255,255,0.06) !important;
          }
          .tv-search-card:focus {
            border: 2px solid #e50914 !important;
            box-shadow: 0 0 15px rgba(229, 9, 20, 0.4) !important;
            transform: scale(1.03);
          }
          @keyframes blink {
            50% { opacity: 0; }
          }
        `}</style>

        {/* TOP SEARCH BAR */}
        <div 
          className="tv-search-capsule"
          style={{
            display: 'flex',
            alignItems: 'center',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '50px',
            padding: '1.2vh 1.4vw',
            width: '100%',
            boxSizing: 'border-box',
            gap: '1vw',
            transition: 'transform 0.15s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.15s ease, box-shadow 0.15s ease',
            flexShrink: 0
          }}
        >
          {/* Speech Button */}
          <button
            className="tv-focusable"
            tabIndex={0}
            onClick={() => {
              triggerHaptic('medium');
            }}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: 'none',
              color: '#fff',
              borderRadius: '50%',
              width: 'clamp(32px, 5.5vh, 44px)',
              height: 'clamp(32px, 5.5vh, 44px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              outline: 'none',
              flexShrink: 0
            }}
          >
            <Mic size={18} />
          </button>

          {/* Search Icon & Field */}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" style={{ flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>

          <div 
            onClick={() => setShowKeyboard(true)}
            style={{
              flex: 1,
              fontSize: 'clamp(1rem, 2.5vh, 1.2rem)',
              fontWeight: 650,
              color: query ? '#fff' : 'rgba(255,255,255,0.3)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              userSelect: 'none'
            }}
          >
            {query || 'Search movies, TV shows...'}
            {(showKeyboard || query) && (
              <span style={{ 
                width: '2px', 
                height: '1.1em', 
                background: '#e50914', 
                marginLeft: '4px',
                animation: 'blink 1s step-end infinite'
              }} />
            )}
          </div>

          {/* Keyboard Icon Toggle Button */}
          <button
            onClick={() => { triggerHaptic('light'); setShowKeyboard(!showKeyboard); }}
            className="tv-focusable"
            tabIndex={0}
            style={{
              background: showKeyboard ? 'rgba(229, 9, 20, 0.2)' : 'rgba(255,255,255,0.06)',
              border: showKeyboard ? '1px solid #e50914' : 'none',
              color: showKeyboard ? '#e50914' : '#fff',
              borderRadius: '12px',
              padding: '8px 12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              outline: 'none',
              flexShrink: 0
            }}
          >
            <KeyboardIcon size={18} />
          </button>
        </div>

        {/* CONDITIONALLY RENDER SPLIT KEYBOARD OR HOME CATEGORIES */}
        {showKeyboard || query !== '' ? (
          <div style={{ display: 'flex', flexDirection: 'row', gap: '3vw', flex: 1, minHeight: 0 }}>
            {/* LEFT COLUMN: On-Screen D-Pad Keyboard */}
            <div style={{
              width: '30vw',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-start',
              gap: '2vh',
              height: '100%',
              flexShrink: 0
            }}>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.8vh',
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.04)',
                borderRadius: '16px',
                padding: '2vh 1vw',
                boxSizing: 'border-box'
              }}>
                {keyboardRows.map((row, rIdx) => (
                  <div key={rIdx} style={{ display: 'flex', gap: '0.5vw', width: '100%' }}>
                    {row.map((key) => {
                      const isSpecial = ['Space', 'Backspace', 'Clear'].includes(key);
                      return (
                        <button
                          key={key}
                          onClick={() => handleKeyClick(key)}
                          className="tv-focusable"
                          tabIndex={0}
                          style={{
                            flex: isSpecial ? (key === 'Space' ? 2 : 1.5) : 1,
                            height: 'clamp(28px, 5vh, 40px)',
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.04)',
                            color: '#fff',
                            borderRadius: '8px',
                            fontSize: isSpecial ? 'clamp(0.65rem, 1.5vh, 0.8rem)' : 'clamp(0.9rem, 2vh, 1.1rem)',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            outline: 'none',
                            transition: 'all 0.15s'
                          }}
                        >
                          {key === 'Backspace' ? (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
                              <line x1="18" y1="9" x2="12" y2="15" />
                              <line x1="12" y1="9" x2="18" y2="15" />
                            </svg>
                          ) : key}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
              <button 
                onClick={() => { setShowKeyboard(false); if (!query) onClose(); }}
                className="tv-focusable"
                tabIndex={0}
                style={{
                  width: '100%',
                  padding: '1.2vh',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '10px',
                  color: 'rgba(255,255,255,0.6)',
                  fontWeight: 700,
                  fontSize: 'clamp(0.75rem, 1.8vh, 0.9rem)',
                  cursor: 'pointer',
                  outline: 'none'
                }}
              >
                Hide Keyboard
              </button>
            </div>

            {/* RIGHT COLUMN: Results Area */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2vh', minWidth: 0, height: '100%' }}>
              {/* Filter Pills */}
              <div style={{ display: 'flex', gap: '0.6vw', overflowX: 'auto', scrollbarWidth: 'none', flexShrink: 0 }}>
                {([
                  { id: 'all', label: t('all') },
                  { id: 'movie', label: t('movies') },
                  { id: 'tv', label: t('series') },
                  { id: 'anime', label: t('anime_corner') }
                ] as const).map(pill => {
                  const isActive = filterType === pill.id;
                  return (
                    <button
                      key={pill.id}
                      className="tv-focusable"
                      tabIndex={0}
                      onClick={() => { triggerHaptic('light'); setFilterType(pill.id); }}
                      style={{
                        flexShrink: 0,
                        background: isActive ? '#ffffff' : 'rgba(255,255,255,0.05)',
                        color: isActive ? '#000000' : '#ffffff',
                        border: '1px solid rgba(255,255,255,0.08)',
                        padding: '0.8vh 1.2vw',
                        borderRadius: '20px',
                        fontSize: 'clamp(0.7rem, 1.8vh, 0.82rem)',
                        fontWeight: 800,
                        cursor: 'pointer',
                        outline: 'none',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {pill.label}
                    </button>
                  );
                })}
              </div>

              <div className="no-scrollbar" style={{ flex: 1, overflowY: 'auto', paddingLeft: '8px', paddingRight: '8px', paddingTop: '8px' }}>
                {searching ? (
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80%' }}>
                    <div style={{ width: '32px', height: '32px', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#e50914', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                  </div>
                ) : filteredSuggestions.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '80%', gap: '8px', color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>
                    <p style={{ fontSize: 'clamp(0.85rem, 2vh, 1.05rem)', fontWeight: 700, margin: 0 }}>No results found</p>
                    <p style={{ fontSize: 'clamp(0.72rem, 1.7vh, 0.85rem)', margin: 0 }}>Check spelling or try a different term</p>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(clamp(80px, 12vw, 120px), 1fr))', gap: '12px', paddingBottom: '6vh' }}>
                    {filteredSuggestions.map((movie) => {
                      const imageUrl = getPosterUrl(movie.posterPath || (movie as any).poster_path, 'small') || '/movie-placeholder.png';
                      return (
                        <div
                          key={movie.id}
                          onClick={() => {
                            addToRecent(movie.title || (movie as any).name || query);
                            onMovieClick(movie);
                          }}
                          className="tv-focusable tv-search-card"
                          tabIndex={0}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            cursor: 'pointer',
                            borderRadius: '8px',
                            overflow: 'hidden',
                            background: 'rgba(255,255,255,0.03)',
                            border: '2px solid rgba(255,255,255,0.05)',
                            outline: 'none',
                            transition: 'transform 0.15s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.15s ease, box-shadow 0.15s ease'
                          }}
                        >
                          <div style={{ position: 'relative', width: '100%', aspectRatio: '2/3', overflow: 'hidden' }}>
                            <img src={imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.currentTarget.src = '/movie-placeholder.png'; }} />
                          </div>
                          <div style={{ padding: '8px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '4px' }}>
                            <div style={{ fontWeight: 700, fontSize: 'clamp(0.68rem, 1.6vh, 0.8rem)', color: '#fff', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: '1.2', textAlign: 'left' }}>
                              {movie.title || (movie as any).name}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 'clamp(0.55rem, 1.3vh, 0.68rem)', color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>
                              <span>{(movie.releaseDate || (movie as any).firstAirDate || '').split('-')[0] || 'N/A'}</span>
                              <span style={{ fontSize: 'clamp(0.5rem, 1.2vh, 0.6rem)', fontWeight: 800, padding: '1px 4px', borderRadius: '3px', background: (movie as any).name ? 'rgba(99, 102, 241, 0.15)' : 'rgba(239, 68, 68, 0.15)', color: (movie as any).name ? '#a5b4fc' : '#fca5a5' }}>
                                {(movie as any).name ? 'TV' : 'MOVIE'}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* TV SEARCH HOME DASHBOARD (NO QUERY & KEYBOARD HIDDEN) */
          <div className="no-scrollbar" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4.5vh', paddingBottom: '8vh', paddingLeft: '8px', paddingRight: '8px', paddingTop: '8px' }}>
            
            {/* SECTION 1: QUICK ACCESS */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5vh', textAlign: 'left' }}>
              <span style={{ fontSize: 'clamp(0.85rem, 2.2vh, 1.05rem)', fontWeight: 800, color: '#fff', opacity: 0.9 }}>
                Quick Access
              </span>
              <div style={{ display: 'flex', gap: '1vw', width: '100%' }}>
                {[
                  { id: 'all', label: 'All', icon: <LayoutGrid size={18} /> },
                  { id: 'movie', label: 'Movies', icon: <Clapperboard size={18} /> },
                  { id: 'tv', label: 'Series', icon: <Tv size={18} /> },
                  { id: 'anime', label: 'Anime Corner', icon: <Smile size={18} /> },
                  { id: 'top', label: 'Top Rated', icon: <Star size={18} /> }
                ].map((item) => {
                  const isActive = item.id === 'top' ? highRatingOnly : filterType === item.id;
                  return (
                    <button
                      key={item.id}
                      className="tv-focusable tv-search-card"
                      tabIndex={0}
                      onClick={() => {
                        triggerHaptic('medium');
                        if (item.id === 'top') {
                          setHighRatingOnly(prev => !prev);
                        } else {
                          setFilterType(item.id as any);
                        }
                      }}
                      style={{
                        flex: 1,
                        background: 'rgba(255,255,255,0.03)',
                        border: '2px solid rgba(255,255,255,0.06)',
                        borderRadius: '12px',
                        padding: '2.2vh 1.5vw',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '10px',
                        color: '#fff',
                        cursor: 'pointer',
                        outline: 'none',
                        transition: 'transform 0.15s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.15s ease, box-shadow 0.15s ease',
                        fontSize: 'clamp(0.85rem, 2vh, 1rem)',
                        fontWeight: 700
                      }}
                    >
                      <div style={{ color: isActive ? '#e50914' : 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center' }}>
                        {item.icon}
                      </div>
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* SECTION 2: VIBES */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5vh', textAlign: 'left' }}>
              <span style={{ fontSize: 'clamp(0.85rem, 2.2vh, 1.05rem)', fontWeight: 800, color: '#fff', opacity: 0.9 }}>
                Vibes
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1vh' }}>
                {/* Row 1 */}
                <div style={{ display: 'flex', gap: '0.8vw', flexWrap: 'wrap' }}>
                  {[
                    { label: 'Atmospheric', icon: <Cloud size={14} />, color: '#a855f7' },
                    { label: 'Intense', icon: <Zap size={14} />, color: '#f97316' },
                    { label: 'Light-hearted', icon: <Smile size={14} />, color: '#eab308' },
                    { label: 'Dark', icon: <Moon size={14} />, color: '#94a3b8' },
                    { label: 'Hopeful', icon: <Sun size={14} />, color: '#22c55e' },
                    { label: 'Crime', icon: <Search size={14} />, color: '#3b82f6' },
                    { label: 'Horror', icon: <Skull size={14} />, color: '#ef4444' },
                    { label: 'Mystery', icon: <HelpCircle size={14} />, color: '#06b6d4' }
                  ].map((vibe) => (
                    <button
                      key={vibe.label}
                      onClick={() => handleVibeClick(vibe.label)}
                      className="tv-focusable tv-search-card"
                      tabIndex={0}
                      style={{
                        background: 'rgba(255,255,255,0.03)',
                        border: '2px solid rgba(255,255,255,0.05)',
                        borderRadius: '10px',
                        padding: '1.2vh 1.2vw',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        color: '#fff',
                        cursor: 'pointer',
                        outline: 'none',
                        transition: 'transform 0.15s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.15s ease, box-shadow 0.15s ease',
                        fontSize: 'clamp(0.72rem, 1.7vh, 0.85rem)',
                        fontWeight: 600
                      }}
                    >
                      <div style={{ color: vibe.color, display: 'flex', alignItems: 'center' }}>
                        {vibe.icon}
                      </div>
                      {vibe.label}
                    </button>
                  ))}
                </div>
                {/* Row 2 */}
                <div style={{ display: 'flex', gap: '0.8vw', flexWrap: 'wrap' }}>
                  {[
                    { label: 'Romance', icon: <Heart size={14} />, color: '#ec4899' },
                    { label: 'Comedy', icon: <Smile size={14} />, color: '#eab308' },
                    { label: 'Sci-Fi', icon: <Globe size={14} />, color: '#14b8a6' },
                    { label: 'Action', icon: <Zap size={14} />, color: '#f97316' },
                    { label: 'Adventure', icon: <Mountain size={14} />, color: '#10b981' },
                    { label: 'Fantasy', icon: <Palette size={14} />, color: '#8b5cf6' },
                    { label: 'Family', icon: <Users size={14} />, color: '#f59e0b' },
                    { label: 'Animation', icon: <Palette size={14} />, color: '#d946ef' }
                  ].map((vibe) => (
                    <button
                      key={vibe.label}
                      onClick={() => handleVibeClick(vibe.label)}
                      className="tv-focusable tv-search-card"
                      tabIndex={0}
                      style={{
                        background: 'rgba(255,255,255,0.03)',
                        border: '2px solid rgba(255,255,255,0.05)',
                        borderRadius: '10px',
                        padding: '1.2vh 1.2vw',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        color: '#fff',
                        cursor: 'pointer',
                        outline: 'none',
                        transition: 'transform 0.15s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.15s ease, box-shadow 0.15s ease',
                        fontSize: 'clamp(0.72rem, 1.7vh, 0.85rem)',
                        fontWeight: 600
                      }}
                    >
                      <div style={{ color: vibe.color, display: 'flex', alignItems: 'center' }}>
                        {vibe.icon}
                      </div>
                      {vibe.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* SECTION 3: BROWSE CATEGORIES */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5vh', textAlign: 'left' }}>
              <span style={{ fontSize: 'clamp(0.85rem, 2.2vh, 1.05rem)', fontWeight: 800, color: '#fff', opacity: 0.9 }}>
                Browse
              </span>
              <div style={{ display: 'flex', gap: '1.2vw', width: '100%' }}>
                {[
                  { id: 'Trending', label: 'Trending', bg: 'linear-gradient(135deg, #ef4444 0%, #7f1d1d 100%)', graphic: <Flame size={32} style={{ color: 'rgba(255,255,255,0.15)', position: 'absolute', right: '12px', bottom: '12px' }} /> },
                  { id: 'New', label: 'New', bg: 'linear-gradient(135deg, #3b82f6 0%, #1e3a8a 100%)', graphic: <Star size={32} style={{ color: 'rgba(255,255,255,0.15)', position: 'absolute', right: '12px', bottom: '12px' }} /> },
                  { id: 'Oscar Winners', label: 'Oscar Winners', bg: 'linear-gradient(135deg, #eab308 0%, #713f12 100%)', graphic: <Film size={32} style={{ color: 'rgba(255,255,255,0.15)', position: 'absolute', right: '12px', bottom: '12px' }} /> },
                  { id: 'Disney+', label: 'Disney+', bg: 'linear-gradient(135deg, #0d1b2a 0%, #1b4965 100%)', graphic: <span style={{ fontSize: '1.5rem', fontWeight: 900, color: 'rgba(255,255,255,0.15)', position: 'absolute', right: '12px', bottom: '12px', fontFamily: 'sans-serif' }}>D+</span> },
                  { id: 'Netflix', label: 'Netflix', bg: 'linear-gradient(135deg, #111 0%, #e50914 100%)', graphic: <span style={{ fontSize: '1.8rem', fontWeight: 900, color: 'rgba(255,255,255,0.15)', position: 'absolute', right: '12px', bottom: '12px', fontFamily: 'sans-serif' }}>N</span> }
                ].map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => { triggerHaptic('medium'); setQuery(cat.id); }}
                    className="tv-focusable tv-search-card"
                    tabIndex={0}
                    style={{
                      flex: 1,
                      aspectRatio: '16/10',
                      background: ['Disney+', 'Netflix', 'Oscar Winners'].includes(cat.id) ? '#000000' : cat.bg,
                      border: '2px solid transparent',
                      borderRadius: '12px',
                      position: 'relative',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      outline: 'none',
                      fontWeight: 800,
                      fontSize: 'clamp(0.8rem, 2.2vh, 1.05rem)',
                      transition: 'transform 0.15s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.15s ease, box-shadow 0.15s ease',
                      boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                      overflow: 'hidden'
                    }}
                  >
                    {['Disney+', 'Netflix', 'Oscar Winners'].includes(cat.id) ? (
                      <img 
                        src={cat.id === 'Disney+' ? '/disney-logo.png' : cat.id === 'Netflix' ? '/netflix-logo.png' : '/oscar-logo.png'} 
                        style={{ 
                          width: '100%', 
                          height: '100%', 
                          objectFit: 'cover',
                          position: 'absolute',
                          inset: 0
                        }} 
                      />
                    ) : (
                      <>
                        <span style={{ zIndex: 2 }}>{cat.label}</span>
                        {cat.graphic}
                      </>
                    )}
                  </button>
                ))}
              </div>
            </div>

          </div>
        )}
      </div>
    );
  }

  return (

    <div 
      className="search-overlay-container"
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(10, 10, 10, 0.5)', 
        backdropFilter: 'blur(25px) saturate(200%) brightness(1.1)',
        WebkitBackdropFilter: 'blur(25px) saturate(200%) brightness(1.1)',
        display: 'flex', flexDirection: 'column',
        overscrollBehavior: 'contain',
        animation: 'backdropFadeBlur 0.4s ease-out forwards',
      }}
    >
      <style>{`
        @keyframes slideDownFilter {
          from {
            opacity: 0;
            transform: translateY(-8px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>

      {/* Floating Search Capsule - Styled exactly like Header.tsx */}
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
          onClick={() => { inputRef.current?.blur(); onClose(); }} 
          aria-label="Back"
          className="search-overlay-back-btn tv-focusable"
          tabIndex={0}
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

        {/* Search Input Form */}
        <form onSubmit={handleSearch} style={{ flex: 1, height: '100%', display: 'flex', alignItems: 'center', position: 'relative' }}>
          <svg 
            width="18" 
            height="18" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="rgba(255,255,255,0.5)" 
            strokeWidth="2.2" 
            style={{ 
              position: 'absolute', 
              left: '0', 
              pointerEvents: 'none',
              opacity: 0.6
            }}
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          
          <input
            ref={inputRef}
            type="text"
            placeholder={t('search_placeholder')}
            value={query}
            disabled={disabled}
            onChange={(e) => setQuery(e.target.value)}
            className="tv-focusable"
            tabIndex={0}
            style={{ 
              width: '100%', 
              height: '100%',
              padding: '0 32px 0 26px', 
              background: 'transparent', 
              border: 'none', 
              color: '#FFFFFF', 
              fontSize: '14px', 
              fontWeight: 600, 
              outline: 'none' 
            }}
          />

          {/* Controls right */}
          <div style={{ position: 'absolute', right: '0', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {query && (
              <button
                type="button"
                onClick={() => { triggerHaptic('light'); setQuery(''); inputRef.current?.focus(); }}
                className="tv-focusable"
                tabIndex={0}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'rgba(255, 255, 255, 0.5)',
                  cursor: 'pointer',
                  padding: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  outline: 'none'
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
            <button 
              type="button" 
              onClick={() => { triggerHaptic('light'); setShowFilters(!showFilters); }} 
              className={`search-overlay-filter-btn tv-focusable${showFilters ? ' active' : ''}`}
              tabIndex={0}
              style={{ 
                background: showFilters ? COLORS.primary : 'transparent', 
                border: 'none', 
                color: showFilters ? '#000000' : '#FFFFFF', 
                width: '28px', 
                height: '28px', 
                borderRadius: '8px',
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                cursor: 'pointer',
                opacity: showFilters ? 1 : 0.7,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>
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
          padding: '6px 10px',
          background: 'rgba(15, 15, 15, 0.7)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '12px',
          boxShadow: '0 6px 24px rgba(0, 0, 0, 0.4)',
          zIndex: 2000,
          display: 'flex', 
          gap: '8px', 
          overflowX: 'auto', 
          animation: 'slideDownFilter 0.25s cubic-bezier(0.16, 1, 0.3, 1) both',
          scrollbarWidth: 'none'
        }}>
          <select className="tv-focusable" tabIndex={0} value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', padding: '6px 10px', borderRadius: '8px', outline: 'none', fontSize: '12px', fontWeight: 600 }}>
            <option value="All">{t('all_years')}</option>
            {[...Array(30)].map((_, i) => <option key={i} value={2024 - i}>{2024 - i}</option>)}
          </select>
          <select className="tv-focusable" tabIndex={0} value={selectedGenre || ''} onChange={(e) => setSelectedGenre(Number(e.target.value) || null)} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', padding: '6px 10px', borderRadius: '8px', outline: 'none', fontSize: '12px', fontWeight: 600 }}>
            <option value="">{t('all_genres')}</option>
            {Object.entries(GENRES)
              .filter(([name, id]) => !isKids || [16, 10751, 35].includes(id))
              .map(([name, id]) => <option key={id} value={id}>{name.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
      )}

      {/* Filter Quick-Bubble Pills - Slimmed to 30px height */}
      <div style={{
        position: 'fixed',
        top: `calc(${headerOffset}px + env(safe-area-inset-top, 0px))`,
        left: '12px',
        right: '12px',
        height: '30px',
        zIndex: 1999,
        display: 'flex',
        gap: '5px',
        overflowX: 'auto',
        scrollbarWidth: 'none',
        padding: '0 2px',
        alignItems: 'center',
        transition: 'top 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
      }}>
        {([
          { id: 'all', label: t('all') },
          { id: 'movie', label: t('movies') },
          { id: 'tv', label: t('series') },
          { id: 'anime', label: t('anime_corner') }
        ] as const).map(pill => {
          const isActive = filterType === pill.id;
          return (
            <button
              key={pill.id}
              className="tv-focusable"
              tabIndex={0}
              onClick={() => { triggerHaptic('light'); setFilterType(pill.id); }}
              style={{
                flexShrink: 0,
                background: isActive ? '#ffffff' : 'rgba(255,255,255,0.05)',
                color: isActive ? '#000000' : '#ffffff',
                border: '1px solid rgba(255,255,255,0.08)',
                padding: '4px 10px',
                borderRadius: '16px',
                fontSize: '10px',
                fontWeight: 800,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {pill.label}
            </button>
          );
        })}

        <div style={{ width: '1px', height: '12px', background: 'rgba(255,255,255,0.15)', flexShrink: 0, margin: '0 1px' }} />

        <button
          onClick={() => { triggerHaptic('light'); setHighRatingOnly(!highRatingOnly); }}
          className="tv-focusable"
          tabIndex={0}
          style={{
            flexShrink: 0,
            background: highRatingOnly ? COLORS.rating : 'rgba(255,255,255,0.05)',
            color: highRatingOnly ? '#000000' : '#ffffff',
            border: '1px solid rgba(255,255,255,0.08)',
            padding: '4px 10px',
            borderRadius: '16px',
            fontSize: '10px',
            fontWeight: 800,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '3px',
            transition: 'all 0.15s ease'
          }}
        >
          <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
          </svg>
          {t('top_rated')}
        </button>
      </div>

      {/* Main content scroll container with optimized top padding */}
      <div 
        className="no-scrollbar" 
        onScroll={() => {
          if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
          }
        }}
        style={{ 
          flex: 1, 
          overflowY: 'auto', 
          padding: `calc(${headerOffset + 38}px + env(safe-area-inset-top, 0px)) 12px 80px`,
          transition: 'padding-top 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
      >
        {!query && !searching && (
          <div>
            {recentSearches.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <p style={{ fontSize: '11px', fontWeight: 800, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>{t('recent')}</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {recentSearches.map((term, index) => (
                    <button key={term} onClick={() => setQuery(term)} className="search-overlay-tag-btn tv-focusable" tabIndex={0} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', padding: '5px 12px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, animation: 'fadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) both', animationDelay: `${index * 20}ms` }}>{term}</button>
                  ))}
                </div>
              </div>
            )}
            
            <p style={{ fontSize: '11px', fontWeight: 800, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>{t('vibes')}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '20px' }}>
              {(isKids
                ? ['Atmospheric', 'Light-hearted', 'Hopeful', 'Comedy', 'Fantasy', 'Family', 'Animation']
                : ['Atmospheric', 'Intense', 'Light-hearted', 'Dark', 'Hopeful', 'Crime', 'Horror', 'Mystery', 'Romance', 'Comedy', 'Sci-Fi', 'Action', 'Adventure', 'Fantasy', 'Family', 'Animation']
              ).map((vibe, index) => (
                <button 
                  key={vibe} 
                  onClick={() => handleVibeClick(vibe)} 
                  className={`search-overlay-tag-btn tv-focusable${query === vibe ? ' active' : ''}`}
                  tabIndex={0}
                  style={{ 
                    background: query === vibe ? COLORS.primary : 'rgba(255,255,255,0.05)', 
                    border: '1px solid rgba(255,255,255,0.08)', 
                    color: '#fff', 
                    padding: '6px 12px', 
                    borderRadius: '10px', 
                    fontSize: '13px', 
                    fontWeight: 700,
                    animation: 'fadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) both',
                    animationDelay: `${index * 20}ms`
                  }}
                >
                  {vibe}
                </button>
              ))}
            </div>

            <p style={{ fontSize: '11px', fontWeight: 800, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>{t('browse')}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {['Trending', 'New', 'Oscar Winners', 'Disney+', 'Netflix'].map((tag, index) => {
                const label = tag === 'Trending' ? t('trending') :
                              tag === 'New' ? t('new') :
                              tag === 'Oscar Winners' ? t('oscar_winners') : tag;
                return (
                  <button 
                    key={tag} 
                    onClick={() => { triggerHaptic('medium'); setQuery(tag); }} 
                    className={`search-overlay-tag-btn tv-focusable${query === tag ? ' active' : ''}`}
                    tabIndex={0}
                    style={{ 
                      background: query === tag ? COLORS.primary : 'rgba(255,255,255,0.05)', 
                      border: '1px solid rgba(255,255,255,0.08)', 
                      color: '#fff', 
                      padding: '6px 12px', 
                      borderRadius: '10px', 
                      fontSize: '13px', 
                      fontWeight: 600,
                      animation: 'fadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) both',
                      animationDelay: `${index * 20}ms`
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {searching ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '32px' }}><div style={{ width: '26px', height: '26px', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: COLORS.primary, borderRadius: '50%', animation: 'spin 1s linear infinite' }} /></div>
        ) : filteredSuggestions.length === 0 && query.trim() ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingTop: '48px', gap: '10px', textAlign: 'center' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
            </div>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.92rem', fontWeight: 700, margin: 0 }}>{t('no_results_for')} "{query}"</p>
            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.78rem', margin: 0 }}>{t('check_spelling_or_tag')}</p>
          </div>
        ) : filteredSuggestions.map((movie, index) => (
          <div 
            key={movie.id} 
            onClick={() => {
              if (document.activeElement instanceof HTMLElement) {
                document.activeElement.blur();
              }
              addToRecent(movie.title || (movie as any).name || query);
              onMovieClick(movie);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (document.activeElement instanceof HTMLElement) {
                  document.activeElement.blur();
                }
                addToRecent(movie.title || (movie as any).name || query);
                onMovieClick(movie);
              }
            }}
            className="search-result-row tv-focusable"
            tabIndex={0}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '12px', 
              padding: '10px 12px', 
              borderRadius: '12px', 
              background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.01) 100%)', 
              border: '1px solid rgba(255, 255, 255, 0.06)',
              boxShadow: 'inset 0 1px 1px rgba(255, 255, 255, 0.05)',
              marginBottom: '8px', 
              cursor: 'pointer',
              animation: 'fadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) both',
              animationDelay: `${index * 20}ms`
            }}
          >
            <img src={getPosterUrl(movie.posterPath, 'small')} alt="" style={{ width: '38px', height: '56px', borderRadius: '6px', objectFit: 'cover', border: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <h4 style={{ color: '#fff', fontSize: '14px', fontWeight: 700, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{movie.title || (movie as any).name}</h4>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px', margin: '3px 0 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>{(movie.releaseDate || (movie as any).firstAirDate || '').split('-')[0]}</span>
                <span style={{ padding: '1px 5px', borderRadius: '4px', fontSize: '9px', fontWeight: 800, letterSpacing: '0.04em', background: (movie as any).name ? 'rgba(99, 102, 241, 0.2)' : 'rgba(239, 68, 68, 0.2)', color: (movie as any).name ? '#a5b4fc' : '#fca5a5', border: `1px solid ${(movie as any).name ? 'rgba(99,102,241,0.3)' : 'rgba(239,68,68,0.3)'}` }}>{(movie as any).name ? 'TV SHOW' : 'MOVIE'}</span>
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
