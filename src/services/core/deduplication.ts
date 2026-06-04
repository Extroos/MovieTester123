/**
 * Content Deduplication Service
 * Handles detection and merging of duplicate content from multiple API sources
 */

import type { Movie, TVShow } from '../../types';
import type { KMMovie, SaltAnime } from './screenscape';

// ===== TITLE NORMALIZATION =====

/**
 * Normalize a title for comparison
 * - Lowercase
 * - Remove special characters
 * - Remove common suffixes (year, quality, etc.)
 * - Trim whitespace
 */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[:'"\-–—.,!?()[\]{}]/g, ' ')  // Replace special chars with space
    .replace(/\b(the|a|an|and|or|of|in|on|at|to|for|with|by)\b/gi, '') // Remove articles
    .replace(/\b(movie|film|series|season|episode|s\d+|ep\d+)\b/gi, '') // Remove media terms
    .replace(/\b(20\d{2}|19\d{2})\b/g, '') // Remove years
    .replace(/\b(4k|1080p|720p|480p|hdr|dv|bluray|web-?dl|hdtc|remux)\b/gi, '') // Remove quality
    .replace(/\b(dual audio|hindi|english|japanese|subbed|dubbed)\b/gi, '') // Remove language
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .trim();
}

/**
 * Extract year from title string (e.g., "Movie Name 2024" -> 2024)
 */
export function extractYear(title: string): number | null {
  const match = title.match(/\b(20\d{2}|19\d{2})\b/);
  return match ? parseInt(match[1], 10) : null;
}

// ===== DUPLICATE DETECTION =====

interface ContentItem {
  id?: string | number;
  title?: string;
  name?: string;  // For TVShow
  releaseDate?: string;
  firstAirDate?: string;
}

/**
 * Check if two items are likely the same content
 */
export function areSameContent(item1: ContentItem, item2: ContentItem): boolean {
  const title1 = normalizeTitle(item1.title || item1.name || '');
  const title2 = normalizeTitle(item2.title || item2.name || '');
  
  if (!title1 || !title2) return false;
  
  // Exact match after normalization
  if (title1 === title2) return true;
  
  // One contains the other (handles "Movie Name" vs "Movie Name Extended")
  if (title1.includes(title2) || title2.includes(title1)) {
    // Check year similarity if available
    const year1 = extractYear(item1.releaseDate || item1.firstAirDate || item1.title || item1.name || '');
    const year2 = extractYear(item2.releaseDate || item2.firstAirDate || item2.title || item2.name || '');
    
    // If both have years, they must match
    if (year1 && year2) {
      return Math.abs(year1 - year2) <= 1; // Allow 1 year difference
    }
    
    return true;
  }
  
  return false;
}

/**
 * Find duplicate in existing list
 */
export function findDuplicate<T extends ContentItem>(item: ContentItem, existingItems: T[]): T | null {
  for (const existing of existingItems) {
    if (areSameContent(item, existing)) {
      return existing;
    }
  }
  return null;
}

// ===== CONTENT CONVERSION =====

/**
 * Convert KMMovie to Movie format for display
 */
export function kmMovieToMovie(km: KMMovie): Movie {
  // Extract year from title
  const yearMatch = km.title.match(/\b(20\d{2}|19\d{2})\b/);
  const year = yearMatch ? yearMatch[1] : new Date().getFullYear().toString();
  
  // Clean title (remove year and quality info)
  const cleanTitle = km.title
    .replace(/\b(20\d{2}|19\d{2})\b/g, '')
    .replace(/\b(Hindi|English|Dual Audio|Download|4K|1080p|720p|WEB-DL|HDTC|BluRay|REMUX|HDR|DV)\b/gi, '')
    .replace(/[()[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    id: parseInt(km.id || '0', 10) || Math.floor(Math.random() * 1000000) + 900000, // Screenscape IDs start at 900000
    title: cleanTitle,
    overview: `Available in ${km.quality || 'HD'} quality`,
    posterPath: km.image || null,
    backdropPath: km.image || null,
    releaseDate: `${year}-01-01`,
    voteAverage: 0,
    voteCount: 0,
    genres: [],
    // Custom properties for Screenscape
    _source: 'kmmovies' as const,
    _sourceUrl: km.url,
  };
}

/**
 * Convert SaltAnime to Movie/TVShow format for display
 */
export function saltAnimeToContent(anime: SaltAnime): Movie | TVShow {
  const isMovie = anime.type === 'movie';
  
  const base = {
    id: anime.rank || Math.floor(Math.random() * 1000000) + 800000, // AnimeSalt IDs start at 800000
    posterPath: anime.image || null,
    backdropPath: anime.image || null,
    overview: `Popular ${isMovie ? 'anime movie' : 'anime series'}`,
    voteAverage: 0,
    voteCount: 0,
    genres: [{ id: 16, name: 'Animation' }],
    _source: 'animesalt' as const,
    _sourceUrl: anime.url,
  };

  if (isMovie) {
    return {
      ...base,
      title: anime.title,
      releaseDate: new Date().getFullYear().toString() + '-01-01',
    } as Movie;
  } else {
    return {
      ...base,
      name: anime.title,
      firstAirDate: new Date().getFullYear().toString() + '-01-01',
    } as TVShow;
  }
}

// ===== DEDUPLICATION =====

/**
 * Deduplicate KMMovies against TMDB movies
 * Returns only unique KMMovies not already in TMDB
 */
export function deduplicateKMMovies(kmMovies: KMMovie[], tmdbMovies: Movie[]): Movie[] {
  const uniqueKM: Movie[] = [];
  
  for (const km of kmMovies) {
    const asMovie = kmMovieToMovie(km);
    const duplicate = findDuplicate(asMovie, tmdbMovies);
    
    if (!duplicate) {
      uniqueKM.push(asMovie);
    }
    // If duplicate found, we could attach source link to existing movie
    // but for now we just skip it
  }
  
  return uniqueKM;
}

/**
 * Deduplicate AnimeSalt against AniList anime
 * Returns only unique anime not already in AniList
 */
export function deduplicateAnimeSalt(saltAnime: SaltAnime[], anilistAnime: any[]): (Movie | TVShow)[] {
  const unique: (Movie | TVShow)[] = [];
  
  for (const anime of saltAnime) {
    const asContent = saltAnimeToContent(anime);
    const duplicate = findDuplicate(
      { title: anime.title, name: anime.title },
      anilistAnime.map(a => ({ title: a.title, name: a.title }))
    );
    
    if (!duplicate) {
      unique.push(asContent);
    }
  }
  
  return unique;
}

