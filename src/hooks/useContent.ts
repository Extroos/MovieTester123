import { useState, useEffect, useCallback } from 'react';
import * as tmdb from '../services/tmdb';
import { VidSrcService } from '../services/vidsrc';
import { getMyList } from '../services/myList';
import { WatchProgressService } from '../services/progress';
import { RecommendationService } from '../services/recommendations';
import { ProfileService } from '../services/profiles';
import type { Movie, TVShow } from '../types';
import { withRetry, getSettledValue } from '../utils/resilience';

interface ContentState {
  trending: Movie[];
  popular: Movie[];
  topRated: Movie[];
  upcoming: Movie[];
  action: (Movie | TVShow)[];
  comedy: (Movie | TVShow)[];
  family: (Movie | TVShow)[];
  scifi: (Movie | TVShow)[];
  horror: (Movie | TVShow)[];
  documentary: (Movie | TVShow)[];
  adventure: (Movie | TVShow)[];

  trendingTV: TVShow[];
  popularTV: TVShow[];
  topRatedTV: TVShow[];
  dramaTV: TVShow[];
  comedyTV: TVShow[];
  scifiTV: TVShow[];
  crimeTV: TVShow[];
  mysteryTV: TVShow[];
  documentaryTV: TVShow[];

  // VidSrc content (hydrated with TMDB data)
  latestReleases: Movie[];

  myList: (Movie | TVShow)[];
  continueWatching: (Movie | TVShow)[];
  topPicks: (Movie | TVShow)[];

  heroMovie: Movie | null;
  heroTVShow: TVShow | null;
  recommendedGenres: { genreId: number, name: string, items: (Movie | TVShow)[] }[];
}

const EMPTY_STATE: ContentState = {
  trending: [], popular: [], topRated: [], upcoming: [], action: [], comedy: [], family: [],
  scifi: [], horror: [], documentary: [], adventure: [],
  trendingTV: [], popularTV: [], topRatedTV: [], dramaTV: [], comedyTV: [],
  scifiTV: [], crimeTV: [], mysteryTV: [], documentaryTV: [],
  latestReleases: [],
  myList: [], continueWatching: [], topPicks: [],
  heroMovie: null, heroTVShow: null,
  recommendedGenres: []
};

const interleave = (movies: Movie[], tv: TVShow[]): (Movie | TVShow)[] => {
  const result: (Movie | TVShow)[] = [];
  const max = Math.max(movies.length, tv.length);
  for (let i = 0; i < max; i++) {
    if (movies[i]) result.push({ ...movies[i], mediaType: 'movie' } as any);
    if (tv[i]) result.push({ ...tv[i], mediaType: 'tv' } as any);
  }
  return result.slice(0, 20);
};

const interleaveSet = (settledResult: PromiseSettledResult<[PromiseSettledResult<Movie[]>, PromiseSettledResult<TVShow[]>]>) => {
  if (settledResult.status === 'rejected') return [];
  const [movies, tv] = settledResult.value;
  return interleave(getSettledValue(movies, []), getSettledValue(tv, []));
};

export function useContent(profileId?: string) {
  const [content, setContent] = useState<ContentState>(EMPTY_STATE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadContent = useCallback(async (isMounted: boolean = true) => {
    try {
      setLoading(true);
      const profile = ProfileService.getActiveProfile();

      // ─────────────────────────────────────────────────────────────────
      // TIER 1: Critical — only 5 API calls, fires immediately.
      // Goal: hero image + first two rows visible in < 1 second.
      // ─────────────────────────────────────────────────────────────────
      let myListData: (Movie | TVShow)[] = [];
      let continueWatchingData: (Movie | TVShow)[] = [];

      if (profile) {
        [myListData, continueWatchingData] = await Promise.all([
          withRetry(() => getMyList()),
          withRetry(() => WatchProgressService.getContinueWatching())
        ]);
      }

      const [tier1Trending, tier1TrendingTV, tier1Popular] = await Promise.all([
        withRetry(() => tmdb.getTrending()),
        withRetry(() => tmdb.getTrendingTV()),
        withRetry(() => tmdb.getPopular()),
      ]);

      if (!isMounted) return;

      // Paint immediately with critical rows
      setContent(prev => ({
        ...prev,
        trending: tier1Trending.map(m => ({ ...m, mediaType: 'movie' } as any)),
        trendingTV: tier1TrendingTV.map(t => ({ ...t, mediaType: 'tv' } as any)),
        popular: tier1Popular.map(m => ({ ...m, mediaType: 'movie' } as any)),
        myList: myListData,
        continueWatching: continueWatchingData,
        heroMovie: tier1Trending[0] || null,
        heroTVShow: tier1TrendingTV[0] || null,
      }));
      setLoading(false); // UI is unblocked — hero + 2 rows visible

      // ─────────────────────────────────────────────────────────────────
      // TIER 2: Deferred — remaining genre rows, loaded after a 300ms
      // yield so the browser can paint Tier 1 first.
      // ─────────────────────────────────────────────────────────────────
      await new Promise(resolve => setTimeout(resolve, 300));
      if (!isMounted) return;

      const results = await Promise.allSettled([
        withRetry(() => tmdb.getTopRated()),                                         // [0]
        withRetry(() => tmdb.getUpcoming()),                                         // [1]

        // Mixed genre rows (movie + TV interleaved)
        Promise.allSettled([withRetry(() => tmdb.getTrendingByGenre(28, 'movie')), withRetry(() => tmdb.getTrendingByGenre(10759, 'tv'))]),   // [2] Action
        Promise.allSettled([withRetry(() => tmdb.getTrendingByGenre(35, 'movie')), withRetry(() => tmdb.getTrendingByGenre(35, 'tv'))]),      // [3] Comedy
        Promise.allSettled([withRetry(() => tmdb.getTrendingByGenre(10751, 'movie')), withRetry(() => tmdb.getTrendingByGenre(10751, 'tv'))]),// [4] Family
        Promise.allSettled([withRetry(() => tmdb.getTrendingByGenre(878, 'movie')), withRetry(() => tmdb.getTrendingByGenre(10765, 'tv'))]),  // [5] Sci-Fi
        Promise.allSettled([withRetry(() => tmdb.getTrendingByGenre(27, 'movie')), withRetry(() => tmdb.getTrendingByGenre(10765, 'tv'))]),   // [6] Horror
        Promise.allSettled([withRetry(() => tmdb.getTrendingByGenre(99, 'movie')), withRetry(() => tmdb.getTrendingByGenre(99, 'tv'))]),      // [7] Documentary
        Promise.allSettled([withRetry(() => tmdb.getTrendingByGenre(12, 'movie')), withRetry(() => tmdb.getTrendingByGenre(10759, 'tv'))]),   // [8] Adventure

        // TV-specific rows
        withRetry(() => tmdb.getPopularTV()),                                        // [9]
        withRetry(() => tmdb.getTopRatedTV()),                                       // [10]
        withRetry(() => tmdb.getTrendingByGenre(18, 'tv')),                          // [11] Drama
        withRetry(() => tmdb.getTrendingByGenre(35, 'tv')),                          // [12] Comedy
        withRetry(() => tmdb.getTrendingByGenre(10765, 'tv')),                       // [13] SciFi
        withRetry(() => tmdb.getTrendingByGenre(80, 'tv')),                          // [14] Crime
        withRetry(() => tmdb.getTrendingByGenre(9648, 'tv')),                        // [15] Mystery
        withRetry(() => tmdb.getTrendingByGenre(99, 'tv')),                          // [16] Documentary
      ]);

      if (!isMounted) return;

      const topRated   = getSettledValue(results[0], []);
      const upcoming   = getSettledValue(results[1], []);
      const actionMix  = interleaveSet(results[2] as any);
      const comedyMix  = interleaveSet(results[3] as any);
      const familyMix  = interleaveSet(results[4] as any);
      const scifiMix   = interleaveSet(results[5] as any);
      const horrorMix  = interleaveSet(results[6] as any);
      const documentaryMix = interleaveSet(results[7] as any);
      const adventureMix = interleaveSet(results[8] as any);
      const popularTV  = getSettledValue(results[9], []);
      const topRatedTV = getSettledValue(results[10], []);
      const dramaTV    = getSettledValue(results[11], []);
      const comedyTV   = getSettledValue(results[12], []);
      const scifiTV    = getSettledValue(results[13], []);
      const crimeTV    = getSettledValue(results[14], []);
      const mysteryTV  = getSettledValue(results[15], []);
      const documentaryTV = getSettledValue(results[16], []);

      let topPicks: (Movie | TVShow)[] = [];
      let recommendedGenres: { genreId: number, name: string, items: (Movie | TVShow)[] }[] = [];
      try {
        [topPicks, recommendedGenres] = await Promise.all([
          RecommendationService.getTopPicks(),
          RecommendationService.getTopGenreRecommendations()
        ]);
      } catch (e) { /* non-critical */ }

      let latestVidSrc: Movie[] = [];
      try {
        const vidSrcItems = await VidSrcService.getLatestMovies(1);
        const vidSrcIds = vidSrcItems.filter(i => i.tmdb_id).map(i => i.tmdb_id).slice(0, 10);
        const detailsResults = await Promise.allSettled(vidSrcIds.map(id => tmdb.getMovieDetails(parseInt(id, 10))));
        latestVidSrc = detailsResults
          .filter((r): r is PromiseFulfilledResult<Movie | null> => r.status === 'fulfilled' && r.value !== null)
          .map(r => r.value as Movie);
      } catch (e) { /* non-critical */ }

      if (!isMounted) return;

      // Merge Tier 2 into state — Tier 1 data preserved
      setContent(prev => ({
        ...prev,
        topRated: topRated.map(m => ({ ...m, mediaType: 'movie' } as any)),
        upcoming: upcoming.map(m => ({ ...m, mediaType: 'movie' } as any)),
        action: actionMix,
        comedy: comedyMix,
        family: familyMix,
        scifi: scifiMix,
        horror: horrorMix,
        documentary: documentaryMix,
        adventure: adventureMix,
        popularTV: popularTV.map(t => ({ ...t, mediaType: 'tv' } as any)),
        topRatedTV: topRatedTV.map(t => ({ ...t, mediaType: 'tv' } as any)),
        dramaTV: dramaTV.map(t => ({ ...t, mediaType: 'tv' } as any)),
        comedyTV: comedyTV.map(t => ({ ...t, mediaType: 'tv' } as any)),
        scifiTV: scifiTV.map(t => ({ ...t, mediaType: 'tv' } as any)),
        crimeTV: crimeTV.map(t => ({ ...t, mediaType: 'tv' } as any)),
        mysteryTV: mysteryTV.map(t => ({ ...t, mediaType: 'tv' } as any)),
        documentaryTV: documentaryTV.map(t => ({ ...t, mediaType: 'tv' } as any)),
        latestReleases: latestVidSrc,
        topPicks,
        recommendedGenres,
      }));

    } catch (err) {
      console.error('Content load error:', err);
      if (isMounted) setError(err as Error);
      if (isMounted) setLoading(false);
    }
  }, [profileId]);

  useEffect(() => {
    let isMounted = true;
    loadContent(isMounted);
    return () => { isMounted = false; };
  }, [loadContent]);

  const refreshMyList = async () => {
    const list = await getMyList();
    setContent(prev => ({ ...prev, myList: list }));
  };

  const refreshContinueWatching = async () => {
    const cw = await WatchProgressService.getContinueWatching();
    setContent(prev => ({ ...prev, continueWatching: cw }));
  };

  return {
    ...content,
    loading,
    error,
    refreshMyList,
    refreshContinueWatching,
    reloadAll: () => loadContent(true)
  };
}
