import { Movie, TVShow } from '../../types';
import { WatchProgressService } from '../user/progress';
import { getPopular, getPopularTV, getTrending, getTrendingTV, getTrendingByGenre } from '../api/tmdb';

interface UserProfile {
  favoriteGenres: Record<number, number>; // genreId -> weight
  viewedItems: Set<number>;
  recentGenres: number[];
}

export const RecommendationService = {
  /**
   * Build a user profile based on history and "My List"
   */
  async buildProfile(): Promise<UserProfile> {
    const progress = await WatchProgressService.getAll();
    const history = Object.values(progress);
    
    const profile: UserProfile = {
      favoriteGenres: {},
      viewedItems: new Set(),
      recentGenres: []
    };

    history.forEach(item => {
      profile.viewedItems.add(Number(item.id));
      
      // Weight genres: more recent = higher weight
      const genres = (item.data as any).genres || [];
      genres.forEach((g: any) => {
        const gid = g.id || g;
        profile.favoriteGenres[gid] = (profile.favoriteGenres[gid] || 0) + 1;
        profile.recentGenres.push(gid);
      });
    });

    return profile;
  },

  /**
   * Score a list of items based on the user profile
   */
  scoreItems(items: (Movie | TVShow)[], profile: UserProfile): (Movie | TVShow)[] {
    return items
      .filter(item => !profile.viewedItems.has(item.id)) // Filter out already watched
      .map(item => {
        let score = 0;
        const genres = (item as any).genres || [];
        
        genres.forEach((g: any) => {
          const gid = g.id || g;
          // Weighted score from profile
          score += (profile.favoriteGenres[gid] || 0) * 2;
          
          // Extra boost for very recent genres
          if (profile.recentGenres.slice(-5).includes(gid)) {
            score += 5;
          }
        });

        // Small random boost for discovery "spice"
        score += Math.random() * 2;

        return { item, score };
      })
      .sort((a, b) => b.score - a.score)
      .map(x => x.item);
  },

  /**
   * Get "Top Picks For You"
   */
  async getTopPicks(): Promise<(Movie | TVShow)[]> {
    const profile = await this.buildProfile();
    
    // Fetch a pool of trending/popular content
    const [trendingMovies, trendingTV] = await Promise.all([
      getTrending(),
      getTrendingTV()
    ]);

    const pool = [...trendingMovies, ...trendingTV];
    return this.scoreItems(pool, profile).slice(0, 20);
  },

  /**
   * Get recommendations for specific top genres
   */
  async getTopGenreRecommendations(): Promise<{ genreId: number, name: string, items: (Movie | TVShow)[] }[]> {
    const profile = await this.buildProfile();
    const sortedGenres = Object.entries(profile.favoriteGenres)
      .sort(([, a], [, b]) => Number(b) - Number(a))
      .slice(0, 3)
      .map(([id]) => parseInt(id, 10));

    if (sortedGenres.length === 0) return [];
    
    const genreRecs = await Promise.all(sortedGenres.map(async (genreId) => {
      // Fetch fresh trending items for this genre
      const [movies, tv] = await Promise.all([
        getTrendingByGenre(genreId, 'movie'),
        getTrendingByGenre(genreId, 'tv')
      ]);
      
      const pool = [...movies, ...tv];
      const scored = this.scoreItems(pool, profile).slice(0, 15);
      
      // Get human-readable name (simple lookup since we don't want to import full GENRES object here usually)
      const name = movies[0]?.genres?.find((g: any) => g.id === genreId)?.name || 
                   tv[0]?.genres?.find((g: any) => g.id === genreId)?.name || 
                   'Recommended';

      return { genreId, name, items: scored };
    }));

    return genreRecs.filter(r => r.items.length > 0);
  }
};


