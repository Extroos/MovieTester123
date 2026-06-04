import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Header from './components/layout/Header';
import Hero from './components/features/home/Hero';
import ContentRow from './components/features/home/ContentRow';
import CategoryExplorer from './components/features/home/CategoryExplorer';
import MovieDetails from './components/features/details/MovieDetails';
import TVShowDetails from './components/features/details/TVShowDetails';
import SearchOverlay from './components/features/search/SearchOverlay';
import SearchResults from './components/features/search/SearchResults';
import MyListPage from './components/features/mylist/MyListPage';
import BrowseNewsPage from './components/features/newandhot/BrowseNewsPage';
import WatchPartyRoomPage from './components/features/watchparty/WatchPartyRoomPage';
import ActorPage from './components/features/details/ActorPage';
import SettingsPage from './components/features/settings/SettingsPage';
import ErrorBoundary from './components/common/ErrorBoundary';
import { HeroSkeleton, ContentRowSkeleton } from './components/common/Skeletons';
import OfflineScreen from './components/layout/OfflineScreen';
import LoginPage from './components/features/auth/LoginPage';
import LoadingScreen from './components/layout/LoadingScreen'; 
import { supabase } from './utils/supabase';
import { removeFromMyList } from './services/myList';
import { useContent } from './hooks/useContent';
import type { Movie, TVShow } from './types';
import { COLORS } from './constants';
import { triggerHaptic } from './utils/haptics';
import { useFriends } from './hooks/useFriends';
import { Profile, ProfileService } from './services/profiles';
import ProfileSelector from './components/features/auth/ProfileSelector';
import BottomNav from './components/layout/BottomNav';
import { SettingsService } from './services/settings';
import DownloadCenter from './components/features/downloads/DownloadCenter';
import DownloadsPage from './components/features/downloads/DownloadsPage';
import { QueryClient, QueryClientProvider } from 'react-query';
import { FriendService } from './services/friends';
import { WatchProgressService } from './services/progress';
import { getTrending, getPosterUrl, getBackdropUrl, prewarmImages, getMovieDetails, getTVShowDetails } from './services/tmdb';

const queryClient = new QueryClient();

type View = 'home' | 'movies' | 'tvshows' | 'newandhot' | 'mylist' | 'settings' | 'downloads';

export default function App() {
  const [currentView, setCurrentView] = useState<View>('home');

  const [activeProfile, setActiveProfile] = useState<Profile | null>(ProfileService.getActiveProfile());
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showProfileSelector, setShowProfileSelector] = useState(!ProfileService.getActiveProfile());
  const [minTimeDone, setMinTimeDone] = useState(false);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [mediaPrefetched, setMediaPrefetched] = useState(false);
  const [prefetchedPosters, setPrefetchedPosters] = useState<string[]>([]);
  
  useEffect(() => {
    const prefetchLoginPosters = async () => {
      try {
        const movies = await getTrending('week');
        if (movies && movies.length > 0) {
          const paths = movies.map(m => m.posterPath).filter(Boolean) as string[];
          const repeatedPaths = [...paths, ...paths, ...paths, ...paths];
          // Prewarm/preload images into browser cache so they render instantly on the login page
          const urls = repeatedPaths.slice(0, 90).map(path => getPosterUrl(path, 'medium'));
          prewarmImages(urls);
          setPrefetchedPosters(repeatedPaths);
        }
      } catch (e) {
        console.error('Failed to prefetch login posters:', e);
      }
    };
    prefetchLoginPosters();
  }, []);

  const [minimalHome, setMinimalHome] = useState(SettingsService.get('minimalHome'));
  const [selectedCategory, setSelectedCategory] = useState<{ title: string, movies: (Movie | TVShow)[] } | null>(null);
  const [downloadsOpen, _setDownloadsOpen] = useState(false);
  const setDownloadsOpen = (val: boolean) => {
    if (val) {
      setCurrentView('downloads');
    }
  };
  const [hasActiveDownloads, setHasActiveDownloads] = useState(false);

  useEffect(() => {
    // Initialize theme
    SettingsService.applyTheme(SettingsService.get('theme'));

    // Lock global mobile screen orientation to portrait for native APK platforms
    const initOrientation = async () => {
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (Capacitor.isNativePlatform()) {
          const { ScreenOrientation } = await import('@capacitor/screen-orientation');
          await (ScreenOrientation as any).lock({ orientation: 'portrait' }).catch(() => {});
        }
      } catch (e) {}
    };
    initOrientation();
  }, []);

  useEffect(() => {
    const handleSettingsChange = () => {
        setMinimalHome(SettingsService.get('minimalHome'));
    };
    window.addEventListener('settingsChanged', handleSettingsChange);
    return () => window.removeEventListener('settingsChanged', handleSettingsChange);
  }, []);

  const handleLogin = () => {
    // Auth listener handles state update
  };
  
  const handleLogout = async () => {
    try {
        await supabase.auth.signOut();
    } catch (error) {
        console.error('Logout error:', error);
    }
    setIsAuthenticated(false);
    setActiveProfile(null);
    setShowProfileSelector(true);
    ProfileService.clearActiveProfile();
    triggerHaptic('medium');
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setMinTimeDone(true);
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthenticated(!!session);
      setSessionLoaded(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const isAuth = !!session;
      setIsAuthenticated(isAuth);
      
      if (!isAuth) {
        setShowProfileSelector(true);
        setActiveProfile(null);
        ProfileService.clearActiveProfile();
        setCurrentView('home');
      }
    });

    return () => subscription.unsubscribe();
  }, []);




  const scrollPositions = React.useRef<Record<string, number>>({});
  
  useEffect(() => {
    const timer = setTimeout(() => {
      const savedPosition = scrollPositions.current[currentView] || 0;
      window.scrollTo({
        top: savedPosition,
        behavior: 'auto'
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [currentView]);

  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [selectedTVShow, setSelectedTVShow] = useState<TVShow | null>(null);
  const [selectedActor, setSelectedActor] = useState<number | null>(null);

  const [partyInvites, setPartyInvites] = useState<any[]>([]);
  const [activeInviteToast, setActiveInviteToast] = useState<any | null>(null);
  const [selectedPartyInvite, setSelectedPartyInvite] = useState<any | null>(null);

  const fetchPartyInvites = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .eq('type', 'watch_party_invite')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      const newInvites = data || [];
      
      // Dynamically resolve backdrop path for old database invites in the background
      const resolvedInvites = await Promise.all(newInvites.map(async (invite) => {
        if (invite.data && !invite.data.backdrop_path) {
          try {
            const itemId = invite.data.item_id;
            const mediaType = invite.data.media_type;
            if (itemId && mediaType) {
              const details = mediaType === 'tv' 
                ? await getTVShowDetails(itemId) 
                : await getMovieDetails(itemId);
              if (details && details.backdropPath) {
                return {
                  ...invite,
                  data: {
                    ...invite.data,
                    backdrop_path: details.backdropPath
                  }
                };
              }
            }
          } catch (e) {
            console.warn('[App] Failed to dynamically load backdrop path for invite:', invite.id, e);
          }
        }
        return invite;
      }));

      setPartyInvites(prev => {
        // Only trigger toast for newly added notifications that weren't in the previous cache
        const prevIds = new Set(prev.map(i => i.id));
        const newlyAdded = resolvedInvites.filter(i => !prevIds.has(i.id));
        if (newlyAdded.length > 0) {
          // Trigger the top floating invitation popover banner ONLY if not host
          const nonHostNew = newlyAdded.filter(i => !i.data?.is_host);
          if (nonHostNew.length > 0) {
            if (SettingsService.get('autoJoinParty')) {
              console.log('[App] Auto-joining watch party invite via polling:', nonHostNew[0].id);
              handleAcceptInvite(nonHostNew[0]);
            } else {
              setActiveInviteToast(nonHostNew[0]);
            }
          }
        }
        return resolvedInvites;
      });
    } catch (e) {
      console.error('Error fetching co-watching party invites:', e);
    }
  }, []);

  useEffect(() => {
    const isPlayerActive = !!selectedMovie || !!selectedTVShow;
    
    if (isAuthenticated && !isPlayerActive) {
      fetchPartyInvites();
      const channel = supabase
        .channel('watch_party_invites')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'notifications' },
          (payload) => {
            fetchPartyInvites();
            const newRecord = payload.new;
            if (newRecord && newRecord.type === 'watch_party_invite' && !newRecord.data?.is_host) {
              if (SettingsService.get('autoJoinParty')) {
                console.log('[App] Auto-joining watch party invite:', newRecord.id);
                handleAcceptInvite(newRecord);
              } else {
                setActiveInviteToast(newRecord);
              }
            }
          }
        )
        .on(
          'postgres_changes',
          { event: 'DELETE', schema: 'public', table: 'notifications' },
          () => {
            fetchPartyInvites();
          }
        )
        .subscribe();
 
      // Backup polling fallback every 8 seconds to load invites dynamically without needing database publications setup
      const pollInterval = setInterval(() => {
        fetchPartyInvites();
      }, 8000);
 
      return () => {
        supabase.removeChannel(channel);
        clearInterval(pollInterval);
      };
    }
  }, [isAuthenticated, fetchPartyInvites, selectedMovie, selectedTVShow]);

  const handleDeclineInvite = async (invite: any) => {
    triggerHaptic('medium');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const isHost = invite.data?.is_host === true || invite.data?.sender_id === user?.id;
      
      if (isHost && invite.data?.session_id) {
        // Host ends the watch party, deleting it globally so it disappears for all
        await supabase.from('notifications').delete().filter('data->>session_id', 'eq', invite.data.session_id);
      } else {
        // Guest declines/removes their own invite
        await supabase.from('notifications').delete().eq('id', invite.id);
      }
      fetchPartyInvites();
    } catch (err) {
      console.warn('Failed to decline invite notification:', err);
    }
    setActiveInviteToast(null);
  };

  const handleAcceptInvite = async (invite: any) => {
    triggerHaptic('medium');
    const { item_id, media_type, session_id, item_title, is_host } = invite.data;

    // Delete the accepted notification so it disappears from headers and is not re-fetched
    try {
      await supabase.from('notifications').delete().eq('id', invite.id);
      fetchPartyInvites();
    } catch (err) {
      console.warn('Failed to remove accepted notification:', err);
    }

    if (media_type === 'tv') {
      try {
        const fullShow = await getTVShowDetails(item_id);
        if (fullShow) {
          // Check if show has details S/E, default to S1:E1
          let seasonNum = 1;
          let episodeNum = 1;
          const match = item_title.match(/S(\d+):E(\d+)/i);
          if (match) {
            seasonNum = parseInt(match[1]);
            episodeNum = parseInt(match[2]);
          }
          
          // Inject party session parameters to session storage or pass directly
          sessionStorage.setItem(`co_watch_session_${item_id}_tv`, session_id);
          sessionStorage.setItem(`co_watch_is_host_${item_id}_tv`, is_host ? 'true' : 'false');
          setSelectedTVShow(fullShow);
        }
      } catch (err) {
        console.error(err);
      }
    } else {
      try {
        const fullMovie = await getMovieDetails(item_id);
        if (fullMovie) {
          sessionStorage.setItem(`co_watch_session_${item_id}_movie`, session_id);
          sessionStorage.setItem(`co_watch_is_host_${item_id}_movie`, is_host ? 'true' : 'false');
          setSelectedMovie(fullMovie);
        }
      } catch (err) {
        console.error(err);
      }
    }
  };
  
  const handleJoinInviteClick = (invite: any) => {
    setSelectedPartyInvite(invite);
    setActiveInviteToast(null);
  };
  
  const content = useContent(activeProfile?.id);
  const { 
    trending, popular, topRated, upcoming, action, comedy, family,
    trendingTV, popularTV, topRatedTV, dramaTV, comedyTV,
    latestReleases, 
    myList, continueWatching, topPicks,
    recommendedGenres,
    heroMovie, heroTVShow,
    loading, error,
    refreshMyList
  } = content;

  const { activity: friendActivity } = useFriends(); 

  // Helper to preload an image and return a promise
  const preloadImage = useCallback((url: string): Promise<void> => {
    return new Promise((resolve) => {
      if (!url || url.includes('placeholder')) {
        resolve();
        return;
      }
      const img = new Image();
      img.src = url;
      img.onload = () => resolve();
      img.onerror = () => resolve();
    });
  }, []);

  // Prefetch and prewarm critical home screen media assets
  useEffect(() => {
    if (sessionLoaded && (!isAuthenticated || !activeProfile)) {
      setMediaPrefetched(true);
      return;
    }

    if (loading) return; // Wait for useContent to fetch the initial data rows

    const prefetchAssets = async () => {
      try {
        const urls: string[] = [];
        
        // 1. Hero banner backdrops
        if (heroMovie?.backdropPath) {
          urls.push(getBackdropUrl(heroMovie.backdropPath, 'large'));
        }
        if (heroTVShow?.backdropPath) {
          urls.push(getBackdropUrl(heroTVShow.backdropPath, 'large'));
        }

        // 2. High priority movie card posters for instant, flicker-free rendering
        trending.slice(0, 5).forEach(m => {
          if (m.posterPath) urls.push(getPosterUrl(m.posterPath, 'medium'));
        });
        trendingTV.slice(0, 5).forEach(t => {
          if (t.posterPath) urls.push(getPosterUrl(t.posterPath, 'medium'));
        });
        popular.slice(0, 3).forEach(m => {
          if (m.posterPath) urls.push(getPosterUrl(m.posterPath, 'medium'));
        });
        continueWatching.slice(0, 3).forEach(m => {
          if (m.posterPath) urls.push(getPosterUrl(m.posterPath, 'medium'));
        });

        // Race asset loads against a 2.5 second timeout to keep the app highly resilient
        await Promise.race([
          Promise.all(urls.map(url => preloadImage(url))),
          new Promise(resolve => setTimeout(resolve, 2500))
        ]);
      } catch (e) {
        console.error('Failed to prefetch entry dashboard images:', e);
      } finally {
        setMediaPrefetched(true);
      }
    };

    prefetchAssets();
  }, [isAuthenticated, activeProfile, loading, heroMovie, heroTVShow, trending, trendingTV, popular, continueWatching, preloadImage, sessionLoaded]);

  // Master startup controller
  useEffect(() => {
    if (sessionLoaded && minTimeDone && mediaPrefetched) {
      setIsLoading(false);
    }
  }, [sessionLoaded, minTimeDone, mediaPrefetched]); 

  // Flush offline watch-progress queue when device regains connectivity
  const refreshContinueWatchingRef = React.useRef<(() => Promise<void>) | undefined>(undefined);
  refreshContinueWatchingRef.current = content.refreshContinueWatching;

  useEffect(() => {
    const handleOnline = () => {
      console.log('[App] Device came online — syncing offline progress queue...');
      WatchProgressService.syncOfflineQueue()
        .then(() => refreshContinueWatchingRef.current?.())
        .catch(e => console.error('[App] Offline queue sync error:', e));
    };

    window.addEventListener('online', handleOnline);

    // Also try immediately on mount — catches queued items from previous offline sessions
    if (navigator.onLine && WatchProgressService.getOfflineQueueLength() > 0) {
      WatchProgressService.syncOfflineQueue().then(() => refreshContinueWatchingRef.current?.());
    }

    return () => window.removeEventListener('online', handleOnline);
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !activeProfile) return;
    
    const checkActiveDownloads = () => {
      const raw = localStorage.getItem('cinemovie_downloads');
      if (raw) {
        try {
          const list = JSON.parse(raw);
          setHasActiveDownloads(list.some((d: any) => d.status === 'resolving' || d.status === 'downloading'));
        } catch (e) {}
      }
    };

    checkActiveDownloads();
    window.addEventListener('downloadsChanged', checkActiveDownloads, { passive: true });
    window.addEventListener('storage', checkActiveDownloads, { passive: true });
    return () => {
      window.removeEventListener('downloadsChanged', checkActiveDownloads);
      window.removeEventListener('storage', checkActiveDownloads);
    };
  }, [isAuthenticated, activeProfile]);

  const friendActivityItems = useMemo(() => {
    const groupedActivity = new Map<string, any>();
    const LIVE_THRESHOLD = 45 * 1000;
    const now = Date.now();

    friendActivity.forEach(act => {
      const key = String(act.item.id);
      const existing = groupedActivity.get(key);
      const isLive = (now - act.timestamp) < LIVE_THRESHOLD;

      const watcher = {
        friend: act.friend,
        episode: act.episode,
        season: act.season,
        progress: act.progress,
        timestamp: act.timestamp,
        isLive
      };

      if (existing) {
        existing.watchers.push(watcher);
        existing.isLive = existing.isLive || isLive;
        if (act.timestamp > existing.timestamp) {
          existing.timestamp = act.timestamp;
          existing.watchedAt = act.timestamp;
          existing.friendEpisode = act.episode;
          existing.watchedBy = act.friend;
          existing.progress = act.progress;
        }
      } else {
        groupedActivity.set(key, {
          ...act.item,
          watchers: [watcher],
          watchedBy: act.friend,
          friendEpisode: act.episode,
          timestamp: act.timestamp,
          watchedAt: act.timestamp,
          isLive,
          progress: act.progress
        });
      }
    });

    return Array.from(groupedActivity.values());
  }, [friendActivity]);

  const whatWereWatchingItems = useMemo(() => {
    const mergedMap = new Map<string, any>();
    
    // 1. Add user's continue watching items
    continueWatching.forEach(item => {
      mergedMap.set(String(item.id), {
        ...item,
        watchedAt: (item as any).watchedAt || 0
      });
    });
    
    // 2. Add/merge friend activity items, keeping the one with the most recent watchedAt/timestamp
    friendActivityItems.forEach(item => {
      const key = String(item.id);
      const existing = mergedMap.get(key);
      const friendTime = item.watchedAt || item.timestamp || 0;
      const userTime = existing?.watchedAt || 0;
      
      if (!existing || friendTime > userTime) {
        mergedMap.set(key, {
          ...item,
          progress: existing ? existing.progress : undefined,
          duration: existing ? existing.duration : undefined,
          season: existing ? (existing as any).season : undefined,
          episode: existing ? (existing as any).episode : undefined,
          watchedAt: Math.max(friendTime, userTime)
        });
      } else {
        mergedMap.set(key, {
          ...existing,
          watchers: item.watchers,
          watchedBy: item.watchedBy,
          friendEpisode: item.friendEpisode,
          isLive: item.isLive
        });
      }
    });
    
    // 3. Convert map values back to array and sort strictly descending by watchedAt
    return Array.from(mergedMap.values()).sort((a, b) => {
      const ta = a.watchedAt || a.timestamp || 0;
      const tb = b.watchedAt || b.timestamp || 0;
      return tb - ta;
    });
  }, [friendActivityItems, continueWatching]);

  // Filtered continue watching progress and personalized top picks by mediaType for sub-menus
  const continueWatchingMovies = useMemo(() => {
    return continueWatching.filter(item => (item as any).title !== undefined || (item as any).mediaType === 'movie');
  }, [continueWatching]);

  const continueWatchingTV = useMemo(() => {
    return continueWatching.filter(item => (item as any).name !== undefined || (item as any).mediaType === 'tv');
  }, [continueWatching]);

  const topPicksMovies = useMemo(() => {
    return topPicks.filter(item => (item as any).title !== undefined || (item as any).mediaType === 'movie');
  }, [topPicks]);

  const topPicksTV = useMemo(() => {
    return topPicks.filter(item => (item as any).name !== undefined || (item as any).mediaType === 'tv');
  }, [topPicks]);

  const [homeActiveProgressTab, setHomeActiveProgressTab] = useState<'continue' | 'friends'>('continue');
  const [homeActiveTrendingTab, setHomeActiveTrendingTab] = useState<'movies' | 'tv'>('movies');

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchResultsOpen, setSearchResultsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Movie[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleProfileSelected = async (profile: Profile) => {
    triggerHaptic('medium');
    ProfileService.setActiveProfile(profile.id, profile);
    setActiveProfile(profile);
    setShowProfileSelector(false);
    setCurrentView('home');
  };

  const handleActivityReaction = useCallback(async (itemId: string, mediaType: string, targetUserId: string, emoji: string) => {
    const success = await FriendService.toggleActivityReaction(itemId, mediaType, targetUserId, emoji);
    if (success) {
      // In a real app we'd wait for realtime or update local state
      // For now, let's just refresh friends to show new reaction count
      // useFriends hook handles the realtime subscription mostly
    }
  }, []);

  useEffect(() => {
    const handleMovieClickEvent = (e: any) => handleMovieClick(e.detail);
    const handleTVShowClickEvent = (e: any) => handleTVShowClick(e.detail);
    const handleProfileChange = () => {
      setActiveProfile(ProfileService.getActiveProfile());
      content.reloadAll();
    };
    
    const handleNavigateToDownloads = () => {
      setCurrentView('downloads');
    };
    
    window.addEventListener('movieClick', handleMovieClickEvent);
    window.addEventListener('tvShowClick', handleTVShowClickEvent);
    window.addEventListener('profileChanged', handleProfileChange);
    window.addEventListener('navigateToDownloads', handleNavigateToDownloads);
    
    const setupNativeEvents = async () => {
      try {
        const { App: CapApp } = await import('@capacitor/app');
        
        // Handle App state changes (returning from background ads)
        await CapApp.addListener('appStateChange', ({ isActive }) => {
          if (isActive) {
            console.log('App became active - ensuring state consistency');
            // If we are in the video player, we might want to ensure immersive mode is still on
            const videoOverlay = document.querySelector('.video-player-overlay');
            if (videoOverlay) {
                // Logic to re-trigger immersion if needed can go here
            }
          }
        });

        let lastBackPress = 0;
        
        const listener = await CapApp.addListener('backButton', ({ canGoBack }) => {
          // Priority 0: Video Player (highest)
          if (document.querySelector('.video-player-overlay')) return;

          // Priority 1: Overlays & Modals
          if (selectedMovie) { setSelectedMovie(null); return; }
          if (selectedTVShow) { setSelectedTVShow(null); return; }
          if (selectedActor) { setSelectedActor(null); return; }
          if (selectedCategory) { setSelectedCategory(null); return; }
          if (searchOpen) { setSearchOpen(false); return; }
          if (searchResultsOpen) { setSearchResultsOpen(false); return; }

          // Priority 2: Views
          if (showProfileSelector && activeProfile) {
            setShowProfileSelector(false);
            return;
          }

          if (currentView !== 'home') {
            setCurrentView('home');
            return;
          }

          // Priority 3: App Exit
          const now = Date.now();
          if (now - lastBackPress < 2000) {
            CapApp.exitApp();
          } else {
            lastBackPress = now;
          }
        });
        
        return () => listener.remove();
      } catch (e) {
        console.warn('Capacitor App plugin not available', e);
      }
    };

    const nativeCleanupPromise = setupNativeEvents();
    
    return () => {
      window.removeEventListener('movieClick', handleMovieClickEvent);
      window.removeEventListener('tvShowClick', handleTVShowClickEvent);
      window.removeEventListener('profileChanged', handleProfileChange);
      window.removeEventListener('navigateToDownloads', handleNavigateToDownloads);
      nativeCleanupPromise.then(cleanup => cleanup?.());
    };
  }, [selectedMovie, selectedTVShow, selectedActor, searchOpen, searchResultsOpen, currentView, showProfileSelector, activeProfile, content]);

  useEffect(() => {
    if (currentView === 'mylist') {
      refreshMyList();
    }
  }, [currentView, refreshMyList]);

  const handleRemoveFromList = useCallback(async (itemId: number, type: 'movie' | 'tv') => {
    await removeFromMyList(itemId, type);
    content.refreshMyList();
  }, [content]);

  const handleTVShowClick = useCallback((show: TVShow) => {
    setSelectedTVShow(show);
    // REMOVED: setSearchResultsOpen(false) - Preserve context for back navigation
  }, []);

  const handleMovieClick = useCallback((movie: Movie | TVShow | any) => {
    const isTv = movie.mediaType === 'tv' || movie.type === 'tv' || movie.media_type === 'tv' || 'firstAirDate' in movie || 'name' in movie;
    if (isTv) {
        handleTVShowClick(movie as any);
        return;
    }
    setSelectedMovie(movie);
    // REMOVED: setSearchResultsOpen(false) - Preserve context for back navigation
  }, [handleTVShowClick]);

  const handleShowSearchResults = useCallback((query: string, results: Movie[]) => {
    setSearchQuery(query);
    setSearchResults(results);
    setSearchOpen(false);
    setSearchResultsOpen(true);
  }, []);

  const handleNavClick = useCallback((view: View) => {
    triggerHaptic('light');
    scrollPositions.current[currentView] = window.scrollY;
    setCurrentView(view);
    setSearchResultsOpen(false);
  }, [currentView]);


  const handleSurpriseMe = () => {
    triggerHaptic('medium');
    const allContent = [...trending, ...popular, ...trendingTV, ...popularTV];
    if (allContent.length > 0) {
      const randomItem = allContent[Math.floor(Math.random() * allContent.length)];
      if ((randomItem as any).firstAirDate) {
        handleTVShowClick(randomItem as any);
      } else {
        handleMovieClick(randomItem as any);
      }
    }
  };

  if (!isOnline) {
    return <OfflineScreen onRetry={() => window.location.reload()} />;
  }

  const filterKids = <T extends Movie | TVShow>(items: T[]): T[] => {
    if (!activeProfile?.isKids) return items;
    return items.filter(item => {
        const genreIds = (item as any).genreIds || (item as any).genres?.map((g: any) => g.id);
        return genreIds?.some((id: number) => [16, 10751, 12].includes(id));
    });
  };

  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        {isLoading ? (
          <LoadingScreen />
        ) : !isAuthenticated ? (
          <LoginPage onLogin={handleLogin} prefetchedPosters={prefetchedPosters} />
        ) : (!activeProfile || showProfileSelector) ? (
          <ProfileSelector onProfileSelected={handleProfileSelected} />
        ) : (
          <div style={{ width: '100%' }}>
              <div style={{ width: '100%', minHeight: '100vh', position: 'relative' }}>

              <div style={{ display: currentView === 'home' ? 'block' : 'none' }}>
                <div style={{ 
                  minHeight: '100vh', 
                  background: COLORS.bgPrimary,
                  paddingBottom: 'calc(130px + env(safe-area-inset-bottom, 0px))',
                }}>
                  <Header 
                    onSearchOpen={() => setSearchOpen(true)} 
                    onDownloadsOpen={() => setDownloadsOpen(true)}
                    activeProfile={activeProfile} 
                    onSwitchProfile={() => setShowProfileSelector(true)} 
                    hasActiveDownloads={hasActiveDownloads}
                    currentView={currentView}
                    onNavClick={handleNavClick}
                    activeInviteToast={activeInviteToast}
                    onAcceptInvite={handleJoinInviteClick}
                    onDeclineInvite={handleDeclineInvite}
                  />
                  <div style={{ paddingTop: 0 }}>
                    {loading ? (
                        <div style={{ paddingTop: '64px' }}>
                          <HeroSkeleton />
                          <ContentRowSkeleton />
                          <ContentRowSkeleton />
                        </div>
                    ) : (
                        <>
                          <Hero movie={heroMovie} onPlayClick={() => setSelectedMovie(heroMovie)} onInfoClick={() => setSelectedMovie(heroMovie)} />
                          <div style={{ 
                            position: 'relative', 
                            marginTop: '-2rem', 
                            zIndex: 10, 
                            background: 'linear-gradient(to bottom, transparent 0%, #0a0a0a 10%)', 
                            paddingTop: '2rem',
                            overflowX: 'hidden' // Strictly contain rows from pushing viewport width
                          }}>
                            {partyInvites.length > 0 && (
                              <ContentRow 
                                title={
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#10b981' }}>
                                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                      <circle cx="9" cy="7" r="4" />
                                      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                                    </svg>
                                    <span>Watch with Friends</span>
                                  </div>
                                }
                                isWide={true}
                                movies={partyInvites.map(invite => ({
                                  id: invite.data.item_id,
                                  title: invite.data.item_title,
                                  posterPath: invite.data.poster_path,
                                  backdropPath: invite.data.backdrop_path,
                                  firstAirDate: invite.data.media_type === 'tv' ? 'tv' : undefined,
                                  inviteData: invite
                                }))} 
                                onMovieClick={(movie: any) => {
                                  setSelectedPartyInvite(movie.inviteData);
                                }}
                              />
                            )}
                            {(continueWatching.length > 0 || friendActivityItems.length > 0) && (
                              <ContentRow 
                                title={homeActiveProgressTab === 'continue' ? 'Continue' : "What We're Watching"}
                                movies={homeActiveProgressTab === 'continue' ? continueWatching : friendActivityItems} 
                                onMovieClick={handleMovieClick} 
                                onReaction={homeActiveProgressTab === 'friends' ? handleActivityReaction : undefined}
                                onSeeAll={() => setSelectedCategory({ 
                                  title: homeActiveProgressTab === 'continue' ? 'Continue' : "What We're Watching", 
                                  movies: homeActiveProgressTab === 'continue' ? continueWatching : friendActivityItems 
                                })}
                                tabs={[
                                  { id: 'continue', label: 'Me' },
                                  { id: 'friends', label: 'Friends' }
                                ]}
                                activeTab={homeActiveProgressTab}
                                onTabChange={(id) => setHomeActiveProgressTab(id as any)}
                              />
                            )}
                            {!minimalHome && (
                            <>
                            {(trending.length > 0 || trendingTV.length > 0) && (
                              <ContentRow 
                                title="Trending"
                                movies={homeActiveTrendingTab === 'movies' ? trending : trendingTV} 
                                onMovieClick={homeActiveTrendingTab === 'movies' ? handleMovieClick : (show: any) => handleTVShowClick(show)}
                                onSeeAll={() => setSelectedCategory({ 
                                  title: "Trending", 
                                  movies: homeActiveTrendingTab === 'movies' ? trending : trendingTV 
                                })}
                                tabs={[
                                  { id: 'movies', label: 'Movies' },
                                  { id: 'tv', label: 'TVShows' }
                                ]}
                                activeTab={homeActiveTrendingTab}
                                onTabChange={(id) => setHomeActiveTrendingTab(id as any)}
                              />
                            )}
                            {topPicks.length > 0 && (
                              <ContentRow 
                                title="Top Picks for You" 
                                movies={topPicks} 
                                onMovieClick={handleMovieClick} 
                                onSeeAll={() => setSelectedCategory({ title: "Top Picks for You", movies: topPicks })}
                              />
                            )}
                            {popular.length > 0 && ( 
                                <ContentRow 
                                  title="Popular Movies" 
                                  movies={popular} 
                                  onMovieClick={handleMovieClick} 
                                  onSeeAll={() => setSelectedCategory({ title: "Popular Movies", movies: popular })}
                                /> 
                             )}
                            {topRated.length > 0 && ( 
                                <ContentRow 
                                  title="Critically Acclaimed" 
                                  movies={topRated} 
                                  onMovieClick={handleMovieClick} 
                                  onSeeAll={() => setSelectedCategory({ title: "Critically Acclaimed", movies: topRated })}
                                /> 
                             )}
                            {action.length > 0 && ( 
                                <ContentRow 
                                  title="Trending Action" 
                                  movies={action} 
                                  onMovieClick={handleMovieClick} 
                                  onSeeAll={() => setSelectedCategory({ title: "Trending Action", movies: action })}
                                /> 
                             )}
                            {comedy.length > 0 && ( 
                                <ContentRow 
                                  title="Top Comedies" 
                                  movies={comedy} 
                                  onMovieClick={handleMovieClick} 
                                  onSeeAll={() => setSelectedCategory({ title: "Top Comedies", movies: comedy })}
                                /> 
                             )}
                            {family.length > 0 && ( 
                                <ContentRow 
                                  title="Trending Family" 
                                  movies={family} 
                                  onMovieClick={handleMovieClick} 
                                  onSeeAll={() => setSelectedCategory({ title: "Trending Family", movies: family })}
                                /> 
                             )}
                            
                            {recommendedGenres.map((genre, idx) => (
                              <ContentRow 
                                key={`rec-genre-${genre.genreId}`}
                                title={`Best of ${genre.name}`} 
                                movies={genre.items} 
                                onMovieClick={handleMovieClick} 
                                onSeeAll={() => setSelectedCategory({ title: `Best of ${genre.name}`, movies: genre.items })}
                              />
                            ))}

                            {latestReleases.length > 0 && ( <ContentRow title="🎬 Already on VidSrc" movies={latestReleases} onMovieClick={handleMovieClick} /> )}
                            {upcoming.length > 0 && filterKids(upcoming).length > 0 && ( <ContentRow title="Upcoming Releases" movies={filterKids(upcoming)} onMovieClick={handleMovieClick} /> )}
                            </>
                            )}
                          </div>
                        </>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ display: currentView === 'movies' ? 'block' : 'none' }}>
                <div style={{ minHeight: '100vh', background: COLORS.bgPrimary, paddingBottom: 'calc(130px + env(safe-area-inset-bottom, 0px))' }}>
                  <Header 
                    onSearchOpen={() => setSearchOpen(true)} 
                    onDownloadsOpen={() => setDownloadsOpen(true)}
                    activeProfile={activeProfile} 
                    onSwitchProfile={() => setShowProfileSelector(true)} 
                    hasActiveDownloads={hasActiveDownloads}
                    currentView={currentView}
                    onNavClick={handleNavClick}
                    activeInviteToast={activeInviteToast}
                    onAcceptInvite={handleJoinInviteClick}
                    onDeclineInvite={handleDeclineInvite}
                  />
                  <div style={{ paddingTop: 0 }}>
                    <Hero movie={heroMovie} onPlayClick={() => setSelectedMovie(heroMovie)} onInfoClick={() => setSelectedMovie(heroMovie)} onSurpriseMe={handleSurpriseMe} />
                    <div style={{ position: 'relative', marginTop: '-2rem', zIndex: 10, background: 'linear-gradient(to bottom, transparent 0%, #0a0a0a 10%)', paddingTop: '2rem' }}>
                      {continueWatchingMovies.length > 0 && ( <ContentRow title="Continue" movies={continueWatchingMovies} onMovieClick={handleMovieClick} onSeeAll={() => setSelectedCategory({ title: "Continue", movies: continueWatchingMovies })} /> )}
                      {topPicksMovies.length > 0 && ( <ContentRow title="Top Picks for You" movies={topPicksMovies} onMovieClick={handleMovieClick} onSeeAll={() => setSelectedCategory({ title: "Top Picks for You", movies: topPicksMovies })} /> )}
                      {trending.length > 0 && ( <ContentRow title="Trending Now" movies={trending} onMovieClick={handleMovieClick} onSeeAll={() => setSelectedCategory({ title: "Trending Now", movies: trending })} /> )}
                      {popular.length > 0 && ( <ContentRow title="Popular Movies" movies={popular} onMovieClick={handleMovieClick} onSeeAll={() => setSelectedCategory({ title: "Popular Movies", movies: popular })} /> )}
                      {topRated.length > 0 && ( <ContentRow title="Top Rated Movies" movies={topRated} onMovieClick={handleMovieClick} onSeeAll={() => setSelectedCategory({ title: "Top Rated Movies", movies: topRated })} /> )}
                      {action.length > 0 && ( <ContentRow title="Trending Action" movies={action} onMovieClick={handleMovieClick} onSeeAll={() => setSelectedCategory({ title: "Trending Action", movies: action })} /> )}
                      {comedy.length > 0 && ( <ContentRow title="Top Comedies" movies={comedy} onMovieClick={handleMovieClick} onSeeAll={() => setSelectedCategory({ title: "Top Comedies", movies: comedy })} /> )}
                      {family.length > 0 && ( <ContentRow title="Family Hits" movies={family} onMovieClick={handleMovieClick} onSeeAll={() => setSelectedCategory({ title: "Family Hits", movies: family })} /> )}
                      {upcoming.length > 0 && ( <ContentRow title="Upcoming Movies" movies={upcoming} onMovieClick={handleMovieClick} onSeeAll={() => setSelectedCategory({ title: "Upcoming Movies", movies: upcoming })} /> )}
                    </div>
                  </div>
                </div>
              </div>

              {heroTVShow && (
                <div style={{ display: currentView === 'tvshows' ? 'block' : 'none' }}>
                  <div style={{ minHeight: '100vh', background: COLORS.bgPrimary, paddingBottom: 'calc(130px + env(safe-area-inset-bottom, 0px))' }}>
                    <Header 
                      onSearchOpen={() => setSearchOpen(true)} 
                      onDownloadsOpen={() => setDownloadsOpen(true)} 
                      activeProfile={activeProfile} 
                      onSwitchProfile={() => setShowProfileSelector(true)}
                      hasActiveDownloads={hasActiveDownloads}
                      currentView={currentView}
                      onNavClick={handleNavClick}
                      activeInviteToast={activeInviteToast}
                      onAcceptInvite={handleJoinInviteClick}
                      onDeclineInvite={handleDeclineInvite}
                    />
                    <div style={{ paddingTop: 0 }}>
                      <Hero movie={heroTVShow as any} onPlayClick={() => setSelectedTVShow(heroTVShow)} onInfoClick={() => setSelectedTVShow(heroTVShow)} />
                      <div style={{ position: 'relative', marginTop: '-2rem', zIndex: 10, background: 'linear-gradient(to bottom, transparent 0%, #0a0a0a 10%)', paddingTop: '2rem' }}>
                        {continueWatchingTV.length > 0 && ( <ContentRow title="Continue" movies={continueWatchingTV} onMovieClick={(show: any) => handleTVShowClick(show)} onSeeAll={() => setSelectedCategory({ title: "Continue", movies: continueWatchingTV })} /> )}
                        {topPicksTV.length > 0 && ( <ContentRow title="Top Picks for You" movies={topPicksTV} onMovieClick={(show: any) => handleTVShowClick(show)} onSeeAll={() => setSelectedCategory({ title: "Top Picks for You", movies: topPicksTV })} /> )}
                        {(trendingTV.length > 0) && ( <ContentRow title="Trending Series" movies={trendingTV as any} onMovieClick={(show: any) => handleTVShowClick(show)} onSeeAll={() => setSelectedCategory({ title: "Trending Series", movies: trendingTV as any })} /> )}
                        {popularTV.length > 0 && ( <ContentRow title="Most Popular" movies={popularTV} onMovieClick={(show: any) => handleTVShowClick(show)} onSeeAll={() => setSelectedCategory({ title: "Most Popular", movies: popularTV })} /> )}
                        {topRatedTV.length > 0 && ( <ContentRow title="Top Rated" movies={topRatedTV} onMovieClick={(show: any) => handleTVShowClick(show)} onSeeAll={() => setSelectedCategory({ title: "Top Rated", movies: topRatedTV })} /> )}
                        {dramaTV.length > 0 && ( <ContentRow title="Trending Drama" movies={dramaTV as any} onMovieClick={(show: any) => handleTVShowClick(show)} onSeeAll={() => setSelectedCategory({ title: "Trending Drama", movies: dramaTV as any })} /> )}
                        {comedyTV.length > 0 && ( <ContentRow title="Comedy Favorites" movies={comedyTV as any} onMovieClick={(show: any) => handleTVShowClick(show)} onSeeAll={() => setSelectedCategory({ title: "Comedy Favorites", movies: comedyTV as any })} /> )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div style={{ display: currentView === 'mylist' ? 'block' : 'none' }}>
                <div style={{ minHeight: '100vh', background: COLORS.bgPrimary, paddingBottom: 'calc(130px + env(safe-area-inset-bottom, 0px))', paddingTop: 'calc(24px + env(safe-area-inset-top, 0px))' }}>
                  <MyListPage movies={myList as any} onMovieClick={handleMovieClick} onRemove={handleRemoveFromList} onRefresh={refreshMyList} />
                </div>
              </div>

              <div style={{ display: currentView === 'newandhot' ? 'block' : 'none' }}>
                <div style={{ minHeight: '100vh', background: COLORS.bgPrimary, paddingBottom: 'calc(130px + env(safe-area-inset-bottom, 0px))' }}>
                  <Header 
                    onSearchOpen={() => setSearchOpen(true)} 
                    onDownloadsOpen={() => setDownloadsOpen(true)}
                    activeProfile={activeProfile} 
                    onSwitchProfile={() => setShowProfileSelector(true)} 
                    hasActiveDownloads={hasActiveDownloads}
                    currentView={currentView}
                    onNavClick={handleNavClick}
                    activeInviteToast={activeInviteToast}
                    onAcceptInvite={handleJoinInviteClick}
                    onDeclineInvite={handleDeclineInvite}
                  />
                  <BrowseNewsPage trending={trending} upcoming={upcoming} onItemClick={(item: any) => { if (item.firstAirDate) { handleTVShowClick(item); } else { handleMovieClick(item); } }} />
                </div>
              </div>

              <div style={{ display: currentView === 'settings' ? 'block' : 'none' }}>
                <div style={{ minHeight: '100vh', background: COLORS.bgPrimary }}>
                  <Header 
                    onSearchOpen={() => setSearchOpen(true)} 
                    onDownloadsOpen={() => setDownloadsOpen(true)}
                    activeProfile={activeProfile} 
                    onSwitchProfile={() => setShowProfileSelector(true)} 
                    hasActiveDownloads={hasActiveDownloads}
                    currentView={currentView}
                    onNavClick={handleNavClick}
                    activeInviteToast={activeInviteToast}
                    onAcceptInvite={handleJoinInviteClick}
                    onDeclineInvite={handleDeclineInvite}
                  />
                  <SettingsPage onNavigate={setCurrentView} heroBackground={heroMovie} activeProfile={activeProfile} onSwitchProfile={() => setShowProfileSelector(true)} onLogout={handleLogout} />
                </div>
              </div>

              <div style={{ display: currentView === 'downloads' ? 'block' : 'none' }}>
                <DownloadsPage onNavigate={setCurrentView} />
              </div>

              <BottomNav currentView={currentView} onNavClick={handleNavClick} />

              {searchOpen && ( <SearchOverlay onClose={() => setSearchOpen(false)} onMovieClick={handleMovieClick} onShowResults={handleShowSearchResults} /> )}
              {searchResultsOpen && ( <SearchResults query={searchQuery} results={searchResults} loading={searchLoading} onMovieClick={handleMovieClick} onClose={() => setSearchResultsOpen(false)} /> )}
              <DownloadCenter isOpen={downloadsOpen} onClose={() => setDownloadsOpen(false)} onItemClick={(item: any) => { if (item.firstAirDate || item.name) { handleTVShowClick(item); } else { handleMovieClick(item); } }} />
              {selectedMovie && ( <MovieDetails movie={selectedMovie} onClose={() => { setSelectedMovie(null); content.refreshContinueWatching(); }} onListUpdate={content.refreshMyList} onActorClick={(id) => setSelectedActor(id)} /> )}
              {selectedTVShow && ( <TVShowDetails show={selectedTVShow} onClose={() => { setSelectedTVShow(null); content.refreshContinueWatching(); }} onListUpdate={content.refreshMyList} onActorClick={(id) => setSelectedActor(id)} /> )}
              {selectedPartyInvite && (
                <WatchPartyRoomPage
                  invite={selectedPartyInvite}
                  onAccept={() => {
                    handleAcceptInvite(selectedPartyInvite);
                    setSelectedPartyInvite(null);
                  }}
                  onDecline={() => {
                    handleDeclineInvite(selectedPartyInvite);
                    setSelectedPartyInvite(null);
                  }}
                  onClose={() => setSelectedPartyInvite(null)}
                />
              )}
              {selectedActor && (
                <ActorPage
                  personId={selectedActor}
                  onClose={() => setSelectedActor(null)}
                  onMovieClick={(movie) => {
                    setSelectedActor(null);
                    handleMovieClick(movie);
                  }}
                  onTVShowClick={(show) => {
                    setSelectedActor(null);
                    handleTVShowClick(show);
                  }}
                />
              )}
              
              <AnimatePresence>
                {selectedCategory && (
                  <CategoryExplorer
                    title={selectedCategory.title}
                    movies={selectedCategory.movies}
                    onClose={() => setSelectedCategory(null)}
                    onMovieClick={(movie) => {
                      if ((movie as any).firstAirDate || (movie as any).name) {
                        handleTVShowClick(movie as any);
                      } else {
                        handleMovieClick(movie as any);
                      }
                    }}
                  />
                )}
              </AnimatePresence>
            </div>
          </div>
        )}

        
      </ErrorBoundary>
    </QueryClientProvider>
  );
}
