import type { Movie, Genre, Video, MovieCategory, SearchResult } from '../../types';
import { TMDB_IMAGE_BASE_URL, IMAGE_SIZES } from '../../constants';

// Real TMDB movie data with actual image paths
export const mockMovies: Movie[] = [
  {
    id: 603,
    title: "The Matrix",
    overview: "Set in the 22nd century, The Matrix tells the story of a computer hacker who joins a group of underground insurgents fighting the vast and powerful computers who now rule the earth.",
    posterPath: "/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg",
    backdropPath: "/fNG7i7RqMErkcqhohV2a6cV1Ehy.jpg",
    releaseDate: "1999-03-30",
    voteAverage: 8.2,
    voteCount: 24858,
    genres: [{ id: 28, name: "Action" }, { id: 878, name: "Science Fiction" }],
    runtime: 136,
    tagline: "The fight for the future begins"
  },
  {
    id: 27205,
    title: "Inception",
    overview: "Cobb, a skilled thief who commits corporate espionage by infiltrating the subconscious of his targets is offered a chance to regain his old life as payment for a task considered to be impossible.",
    posterPath: "/9gk7adHYeDvHkCSEqAvQNLV5Uge.jpg",
    backdropPath: "/s3TBrRGB1iav7gFOCNx3H31MoES.jpg",
    releaseDate: "2010-07-16",
    voteAverage: 8.4,
    voteCount: 35245,
    genres: [{ id: 28, name: "Action" }, { id: 878, name: "Science Fiction" }, { id: 53, name: "Thriller" }],
    runtime: 148,
    tagline: "Your mind is the scene of the crime"
  },
  {
    id: 155,
    title: "The Dark Knight",
    overview: "Batman raises the stakes in his war on crime. With the help of Lt. Jim Gordon and District Attorney Harvey Dent, Batman sets out to dismantle the remaining criminal organizations that plague the streets.",
    posterPath: "/qJ2tW6WMUDux911r6m7haRef0WH.jpg",
    backdropPath: "/hqkIcbrOHL86UncnHIsHVcVmzue.jpg",
    releaseDate: "2008-07-16",
    voteAverage: 8.5,
    voteCount: 32145,
    genres: [{ id: 18, name: "Drama" }, { id: 28, name: "Action" }, { id: 80, name: "Crime" }],
    runtime: 152,
    tagline: "Why So Serious?"
  },
  {
    id: 278,
    title: "The Shawshank Redemption",
    overview: "Framed in the 1940s for the double murder of his wife and her lover, upstanding banker Andy Dufresne begins a new life at the Shawshank prison, where he puts his accounting skills to work for an amoral warden.",
    posterPath: "/q6y0Go1tsGEsmtFryDOJo3dEmqu.jpg",
    backdropPath: "/kXfqcdQKsToO0OUXHcrrNCHDBzO.jpg",
    releaseDate: "1994-09-23",
    voteAverage: 8.7,
    voteCount: 26245,
    genres: [{ id: 18, name: "Drama" }, { id: 80, name: "Crime" }],
    runtime: 142,
    tagline: "Fear can hold you prisoner. Hope can set you free."
  },
  {
    id: 550,
    title: "Fight Club",
    overview: "A ticking-time-bomb insomniac and a slippery soap salesman channel primal male aggression into a shocking new form of therapy.",
    posterPath: "/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg",
    backdropPath: "/hZkgoQYus5vegHoetLkCJzb17zJ.jpg",
    releaseDate: "1999-10-15",
    voteAverage: 8.4,
    voteCount: 28456,
    genres: [{ id: 18, name: "Drama" }],
    runtime: 139,
    tagline: "Mischief. Mayhem. Soap."
  },
  {
    id: 13,
    title: "Forrest Gump",
    overview: "A man with a low IQ has accomplished great things in his life and been present during significant historic events—in each case, far exceeding what anyone imagined he could do.",
    posterPath: "/arw2vcBveWOVZr6pxd9XTd1TdQa.jpg",
    backdropPath: "/7c9UVPPiTPltouxRVY6N9uFiMpb.jpg",
    releaseDate: "1994-06-23",
    voteAverage: 8.5,
    voteCount: 26854,
    genres: [{ id: 35, name: "Comedy" }, { id: 18, name: "Drama" }, { id: 10749, name: "Romance" }],
    runtime: 142,
    tagline: "The world will never be the same once you've seen it through the eyes of Forrest Gump"
  }
];

export const mockCategories: MovieCategory[] = [
  {
    title: "Trending Now",
    movies: mockMovies.slice(0, 5),
    type: "trending"
  },
  {
    title: "Top Rated",
    movies: [mockMovies[3], mockMovies[2], mockMovies[1], mockMovies[4], mockMovies[0]],
    type: "top_rated"
  },
  {
    title: "Action & Adventure",
    movies: [mockMovies[0], mockMovies[1], mockMovies[2]],
    type: "genre",
    genreId: 28
  }
];

// Helper function to build image URLs
export function getImageUrl(path: string | null, size: string = 'original'): string {
  if (!path) return '';
  return `${TMDB_IMAGE_BASE_URL}/${size}${path}`;
}

// Get poster URL
export function getPosterUrl(path: string | null, size: 'small' | 'medium' | 'large' | 'original' = 'medium'): string {
  return getImageUrl(path, IMAGE_SIZES.poster[size]);
}

// Get backdrop URL
export function getBackdropUrl(path: string | null, size: 'small' | 'medium' | 'large' | 'original' = 'large'): string {
  return getImageUrl(path, IMAGE_SIZES.backdrop[size]);
}

