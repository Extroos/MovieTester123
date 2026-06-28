// App Configuration and Constants

// TMDB API Configuration
export const TMDB_API_KEY = process.env.TMDB_API_KEY || '';
export const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
export const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p';

// Image sizes
export const IMAGE_SIZES = {
  poster: {
    small: 'w185',
    medium: 'w342',
    large: 'w500',
    original: 'original',
  },
  backdrop: {
    small: 'w300',
    medium: 'w780',
    large: 'w1280',
    original: 'original',
  },
};

// Genre IDs (TMDB standard)
export const GENRES = {
  ACTION: 28,
  ADVENTURE: 12,
  ANIMATION: 16,
  COMEDY: 35,
  CRIME: 80,
  DOCUMENTARY: 99,
  DRAMA: 18,
  FAMILY: 10751,
  FANTASY: 14,
  HISTORY: 36,
  HORROR: 27,
  MUSIC: 10402,
  MYSTERY: 9648,
  ROMANCE: 10749,
  SCIENCE_FICTION: 878,
  THRILLER: 53,
  WAR: 10752,
  WESTERN: 37,
};

// App Theme Colors (Netflix-inspired professional palette with dynamic CSS variable fallback)
export const COLORS = {
  // Main brand colors
  primary: 'var(--color-primary, #FFFFFF)',
  primaryHover: 'var(--color-primary-hover, #F3F4F6)',
  primaryDark: 'var(--color-primary-dark, #E5E7EB)',
  
  // Background colors
  bgPrimary: 'var(--bg-primary, #0a0a0a)',
  bgSecondary: 'var(--bg-secondary, #000000)',
  bgCard: 'var(--bg-card, #1a1a1a)',
  bgCardHover: 'var(--bg-card-hover, #2a2a2a)',
  
  // Text colors
  textPrimary: 'var(--text-primary, #FFFFFF)',
  textSecondary: 'var(--text-secondary, #D2D2D2)',
  textMuted: 'var(--text-muted, #808080)',
  
  // UI elements
  border: 'var(--border-color, #333333)',
  overlay: 'var(--overlay-color, rgba(0, 0, 0, 0.7))',
  success: '#46D369',
  warning: '#FFA500',
  rating: '#FFD700',
};

// Breakpoints for responsive design
export const BREAKPOINTS = {
  mobile: '640px',
  tablet: '768px',
  laptop: '1024px',
  desktop: '1280px',
  wide: '1536px',
};
