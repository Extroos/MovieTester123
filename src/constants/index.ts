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

// App Theme Colors (Netflix-inspired professional palette)
export const COLORS = {
  // Main brand colors
  primary: '#FFFFFF',      // White brand color
  primaryHover: '#F3F4F6', // Brighter off-white/grey on hover
  primaryDark: '#E5E7EB',  // Darker silver/grey for active states
  
  // Background colors
  bgPrimary: '#0a0a0a',    // Premium dark background (OLED styled)
  bgSecondary: '#000000',  // Pure black
  bgCard: '#1a1a1a',       // Darker card background
  bgCardHover: '#2a2a2a',  // Card hover state
  
  // Text colors
  textPrimary: '#FFFFFF',   // Main text
  textSecondary: '#D2D2D2', // Secondary text
  textMuted: '#808080',     // Muted text
  
  // UI elements
  border: '#333333',        // Border color
  overlay: 'rgba(0, 0, 0, 0.7)', // Modal/overlay
  success: '#46D369',       // Success/positive
  warning: '#FFA500',       // Warning
  rating: '#FFD700',        // Star rating gold
};

// Breakpoints for responsive design
export const BREAKPOINTS = {
  mobile: '640px',
  tablet: '768px',
  laptop: '1024px',
  desktop: '1280px',
  wide: '1536px',
};
