// Enhanced image utilities with fallback support
export const POSTER_PLACEHOLDER = '/movie-placeholder.png';
export const BACKDROP_PLACEHOLDER = '/backdrop-placeholder.png';

// Get poster URL with fallback
export function getPosterUrl(path: string | null | undefined, size: 'small' | 'medium' | 'large' = 'medium'): string {
  if (!path || path === POSTER_PLACEHOLDER) return POSTER_PLACEHOLDER;
  
  const sizeMap = {
    small: 'w185',
    medium: 'w342',
    large: 'w500'
  };
  
  return `https://image.tmdb.org/t/p/${sizeMap[size]}${path}`;
}

// Get backdrop URL with fallback
export function getBackdropUrl(path: string | null | undefined, size: 'small' | 'medium' | 'large' = 'large'): string {
  if (!path || path === BACKDROP_PLACEHOLDER) return BACKDROP_PLACEHOLDER;
  
  const sizeMap = {
    small: 'w300',
    medium: 'w780',
    large: 'w1280'
  };
  
  return `https://image.tmdb.org/t/p/${sizeMap[size]}${path}`;
}

// Get profile URL with null check
export function getProfileUrl(path: string | null | undefined, size: 'small' | 'medium' | 'large' = 'medium'): string {
  if (!path) return '';
  const sizeMap = {
    small: 'w45',
    medium: 'w185',
    large: 'h632'
  };
  return `https://image.tmdb.org/t/p/${sizeMap[size] || 'w185'}${path}`;
}
