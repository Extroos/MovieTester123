// Movie and streaming app types

export type MediaType = 'movie' | 'tv';

export interface Movie {
  id: number;
  title: string;
  overview: string;
  posterPath: string | null;
  backdropPath: string | null;
  releaseDate: string;
  voteAverage: number;
  voteCount: number;
  genres: Genre[];
  runtime?: number;
  tagline?: string;
  adult?: boolean;
  popularity?: number;
  imdbId?: string;
  status?: string;
  budget?: number;
  revenue?: number;
  originalLanguage?: string;
  inTheaters?: boolean;
  certification?: string;
  // Screenscape source tracking
  _source?: 'tmdb' | 'vidsrc' | 'kmmovies' | 'animesalt';
  _sourceUrl?: string;
}

export interface TVShow {
  id: number;
  name: string;
  overview: string;
  posterPath: string | null;
  backdropPath: string | null;
  firstAirDate: string;
  voteAverage: number;
  voteCount: number;
  genres: Genre[];
  numberOfSeasons?: number;
  numberOfEpisodes?: number;
  status?: string;
  tagline?: string;
  popularity?: number;
  episodeRunTime?: number[];
  originCountry?: string[];
  imdbId?: string;
  lastAirDate?: string;
  networks?: { name: string; id: number }[];
  originalLanguage?: string;
  certification?: string;
  // Screenscape source tracking
  _source?: 'tmdb' | 'vidsrc' | 'kmmovies' | 'animesalt';
  _sourceUrl?: string;
}

export interface Season {
  id: number;
  seasonNumber: number;
  name: string;
  overview: string;
  episodeCount: number;
  airDate: string;
  posterPath: string | null;
}

export interface Episode {
  id: number;
  episodeNumber: number;
  seasonNumber: number;
  name: string;
  overview: string;
  airDate: string;
  runtime: number;
  stillPath: string | null;
  voteAverage: number;
}

export interface Genre {
  id: number;
  name: string;
}

export interface Video {
  id: string;
  key: string;
  name: string;
  site: string;
  type: 'Trailer' | 'Teaser' | 'Clip' | 'Featurette';
  official: boolean;
}

export interface MovieCategory {
  title: string;
  movies: Movie[];
  type: 'trending' | 'popular' | 'top_rated' | 'upcoming' | 'genre';
  genreId?: number;
}

export interface TVCategory {
  title: string;
  shows: TVShow[];
  type: 'trending' | 'popular' | 'top_rated' | 'on_the_air' | 'genre';
  genreId?: number;
}

export interface SearchResult {
  results: Movie[];
  page: number;
  totalPages: number;
  totalResults: number;
}

export interface Cast {
  id: number;
  name: string;
  character: string;
  profilePath: string | null;
  order: number;
}

export interface Crew {
  id: number;
  name: string;
  job: string;
  department: string;
  profilePath: string | null;
}

export interface Friend {
  id: string; // The friend's User ID (auth.uid)
  profileId: string; // The friend's Profile ID
  name: string;
  avatar: string;
  status: 'pending' | 'accepted';
}

export interface FriendActivity {
  friend: Friend;
  item: Movie | TVShow;
  progress: number;
  duration: number;
  timestamp: number;
  type: 'movie' | 'tv' | 'anime';
  season?: number;
  episode?: number;
  reactions?: Reaction[];
}

export interface Reaction {
  id: string;
  item_id: string;
  user_id: string;
  target_user_id: string;
  emoji: string;
  created_at: string;
}
