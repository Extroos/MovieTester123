import React, { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Header from './components/layout/Header';
import Hero from './components/features/home/Hero';
import ContentRow from './components/features/home/ContentRow';
import ErrorBoundary from './components/common/ErrorBoundary';
import { HeroSkeleton, ContentRowSkeleton } from './components/common/Skeletons';
import OfflineScreen from './components/layout/OfflineScreen';
import LoginPage from './components/features/auth/LoginPage';
import OAuthOnboarding from './components/features/auth/OAuthOnboarding';
import LoadingScreen from './components/layout/LoadingScreen'; 
import { supabase } from './utils/supabase';
import { removeFromMyList } from './services/user/myList';
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
import { QueryClient, QueryClientProvider } from 'react-query';
import { t } from './utils/i18n';
import { FriendService } from './services/friends';
import { WatchProgressService } from './services/progress';
import { getTrending, getPosterUrl, getBackdropUrl, prewarmImages, getMovieDetails, getTVShowDetails } from './services/tmdb';

// Core feature components
import CategoryExplorer from './components/features/home/CategoryExplorer';
import MovieDetails from './components/features/details/MovieDetails';
import TVShowDetails from './components/features/details/TVShowDetails';
import SearchOverlay from './components/features/search/SearchOverlay';
import SearchResults from './components/features/search/SearchResults';
import MyListSubPage from './components/features/settings/settingpage/MyListSubPage';
import BrowseNewsPage from './components/features/newandhot/BrowseNewsPage';
import ActorPage from './components/features/details/ActorPage';

// Lazy-loaded modal routes
const WatchPartyRoomPage = lazy(() => import('./components/features/watchparty/WatchPartyRoomPage'));
import SettingsPage from './components/features/settings/SettingsPage';
import DownloadsPage from './components/features/downloads/DownloadsPage';
const VideoPlayer = lazy(() => import('./components/features/player/VideoPlayer'));


import { useTVNavigation } from './hooks/useTVNavigation';

const queryClient = new QueryClient();

function SimpleLoader() {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: '#09090b',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2000
    }}>
      <div style={{
        width: '32px',
        height: '32px',
        border: '3px solid rgba(255,255,255,0.05)',
        borderTop: '3px solid #ffffff',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite'
      }} />
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes fadeInOverlay {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

type View = 'home' | 'movies' | 'tvshows' | 'newandhot' | 'mylist' | 'settings' | 'downloads';

export default function App() {
  useTVNavigation();
  const [currentView, setCurrentView] = useState<View>('home');
  const [activeSettingsSubPage, setActiveSettingsSubPage] = useState<'streaming' | 'subtitles' | 'appearance' | 'account' | 'social' | 'statistics' | 'mylist' | null>(null);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [selectedNewsGenre, setSelectedNewsGenre] = useState<number | null>(null);

  // Read the active profile once from localStorage so both state initializers
  // below share the same parsed object — avoids double JSON parse on startup.
  const _initialProfile = React.useMemo(() => ProfileService.getActiveProfile(), []);

  const [activeProfile, setActiveProfile] = useState<Profile | null>(_initialProfile);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showProfileSelector, setShowProfileSelector] = useState(!_initialProfile);
  const [minTimeDone, setMinTimeDone] = useState(false);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [mediaPrefetched, setMediaPrefetched] = useState(false);
  const [prefetchedPosters, setPrefetchedPosters] = useState<string[]>([]);
  
  const [showPasswordRecovery, setShowPasswordRecovery] = useState(false);
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const [recoveryConfirmPassword, setRecoveryConfirmPassword] = useState('');
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoveryError, setRecoveryError] = useState('');
  const [recoveryMessage, setRecoveryMessage] = useState('');
  const [isPassFocused, setIsPassFocused] = useState(false);
  const [isConfirmFocused, setIsConfirmFocused] = useState(false);
  
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
  const setDownloadsOpen = useCallback((val: boolean) => {
    if (val) {
      setCurrentView('downloads');
    }
  }, []);
  const [hasActiveDownloads, setHasActiveDownloads] = useState(false);

  useEffect(() => {
    // Initialize theme
    SettingsService.applyTheme(SettingsService.get('theme'));

    // Lock global mobile screen orientation to portrait and configure status bar for native APK platforms
    const initNativeSettings = async () => {
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (Capacitor.isNativePlatform()) {
          const { ScreenOrientation } = await import('@capacitor/screen-orientation');
          await (ScreenOrientation as any).lock({ orientation: 'portrait' }).catch(() => {});

          const { StatusBar, Style } = await import('@capacitor/status-bar');
          await StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
          await StatusBar.setBackgroundColor({ color: '#0a0a0a' }).catch(() => {});
        }
      } catch (e) {}
    };
    initNativeSettings();
  }, []);

  useEffect(() => {
    const handleSettingsChange = () => {
        setMinimalHome(SettingsService.get('minimalHome'));
    };
    window.addEventListener('settingsChanged', handleSettingsChange);
    return () => window.removeEventListener('settingsChanged', handleSettingsChange);
  }, []);

  const handleLogin = useCallback(() => {
    // Auth listener handles state update
  }, []);
  
  const [isGuest, setIsGuest] = useState(localStorage.getItem('cinemovie_is_guest') === 'true');

  const handleContinueAsGuest = useCallback(() => {
    localStorage.setItem('cinemovie_is_guest', 'true');
    setIsGuest(true);
    triggerHaptic('medium');
  }, []);

  const handleLogout = async () => {
    try {
        await supabase.auth.signOut();
    } catch (error) {
        console.error('Logout error:', error);
    }
    setIsAuthenticated(false);
    setIsGuest(false);
    localStorage.removeItem('cinemovie_is_guest');
    setActiveProfile(null);
    setShowProfileSelector(true);
    ProfileService.clearActiveProfile();
    triggerHaptic('medium');
  };

  useEffect(() => {
    // Fast device check: Bypasses minimum loader gate delays if hardware has >= 4 logic cores
    // or has a fast connection, so high-end phone users don't see the loading spinner at all.
    const isFastDevice = (typeof navigator !== 'undefined') && (
      (navigator.hardwareConcurrency && navigator.hardwareConcurrency >= 4) ||
      ((navigator as any).connection && !['slow-2g', '2g', '3g'].includes((navigator as any).connection.effectiveType))
    );

    if (isFastDevice) {
      setMinTimeDone(true);
    } else {
      const timer = setTimeout(() => {
        setMinTimeDone(true);
      }, 200); // Only keep the 200ms delay for slower devices to avoid layout flashes
      return () => clearTimeout(timer);
    }
  }, []);



  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthenticated(!!session);
      setCurrentUser(session?.user || null);
      setSessionLoaded(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const isAuth = !!session;
      setIsAuthenticated(isAuth);
      setCurrentUser(session?.user || null);
      
      if (event === 'PASSWORD_RECOVERY') {
        setShowPasswordRecovery(true);
      }
      
      if (!isAuth) {
        setShowProfileSelector(true);
        setActiveProfile(null);
        ProfileService.clearActiveProfile();
        setCurrentView('home');
      }
    });

    // Handle Capacitor deep link redirection for Google OAuth callbacks
    const handleDeepLink = async () => {
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (Capacitor.isNativePlatform()) {
          const { App: CapApp } = await import('@capacitor/app');
          const { Browser } = await import('@capacitor/browser');
          
          CapApp.addListener('appUrlOpen', async (eventData: any) => {
            console.log('[App] App opened with URL:', eventData.url);
            
            if (eventData.url.startsWith('cinemovie://auth-callback')) {
              await Browser.close().catch(() => {});
              
              const urlObj = new URL(eventData.url.replace('#', '?'));
              const accessToken = urlObj.searchParams.get('access_token');
              const refreshToken = urlObj.searchParams.get('refresh_token');
              
              if (accessToken && refreshToken) {
                console.log('[App] Setting session from deep link tokens...');
                const { error } = await supabase.auth.setSession({
                  access_token: accessToken,
                  refresh_token: refreshToken
                });
                if (error) {
                  console.error('[App] Failed to set session from deep link:', error.message);
                } else {
                  console.log('[App] Session set successfully!');
                }
              }
            }
          });
        }
      } catch (e) {
        console.error('[App] Error in native deep link listener init:', e);
      }
    };
    handleDeepLink();

    return () => subscription.unsubscribe();
  }, []);







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
    
    if (isAuthenticated && !isPlayerActive && !isGuest) {
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
 
      // Backup polling fallback every 60 seconds to load invites dynamically without needing database publications setup
      const pollInterval = setInterval(() => {
        fetchPartyInvites();
      }, 60000);
 
      return () => {
        supabase.removeChannel(channel);
        clearInterval(pollInterval);
      };
    }
  }, [isAuthenticated, fetchPartyInvites, selectedMovie, selectedTVShow]);

  const handleDeclineInvite = useCallback(async (invite: any) => {
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
  }, [fetchPartyInvites]);

  const handleAcceptInvite = useCallback(async (invite: any) => {
    if (localStorage.getItem('cinemovie_is_guest') === 'true') return;
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
  }, [fetchPartyInvites]);
  
  const handleJoinInviteClick = useCallback((invite: any) => {
    setSelectedPartyInvite(invite);
    setActiveInviteToast(null);
  }, []);
  
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

  const combinedTrending = React.useMemo(() => {
    const list = [];
    const maxLen = Math.max(trending?.length || 0, trendingTV?.length || 0);
    for (let i = 0; i < maxLen; i++) {
      if (trending && i < trending.length) list.push({ ...trending[i], mediaType: 'movie' });
      if (trendingTV && i < trendingTV.length) list.push({ ...trendingTV[i], mediaType: 'tv' });
    }
    return list;
  }, [trending, trendingTV]);


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

  // Prefetch ONLY the critical hero backdrop images before revealing the app.
  // Card poster images are loaded on-demand as rows render — no need to block startup on them.
  useEffect(() => {
    if (!sessionLoaded) return; // Always wait for auth session first

    if (!isAuthenticated) {
      // Guest / not logged in — nothing to prefetch, just unblock immediately
      setMediaPrefetched(true);
      return;
    }

    // Don't wait for the full content load — start as soon as the hero data arrives.
    // If hero data isn't ready yet, the 400ms race timeout will release the gate anyway.
    const prefetchAssets = async () => {
      try {
        const urls: string[] = [];
        
        // Only prefetch the two hero backdrop images — these are the only ones
        // visible immediately and worth blocking on.
        if (heroMovie?.backdropPath) {
          urls.push(getBackdropUrl(heroMovie.backdropPath, 'large'));
        }
        if (heroTVShow?.backdropPath) {
          urls.push(getBackdropUrl(heroTVShow.backdropPath, 'large'));
        }

        if (urls.length > 0) {
          // Race hero loads against a 400ms timeout — fast devices preload, slow ones just show quickly
          await Promise.race([
            Promise.all(urls.map(url => preloadImage(url))),
            new Promise(resolve => setTimeout(resolve, 400))
          ]);
        }
      } catch (e) {
        console.error('Failed to prefetch entry dashboard images:', e);
      } finally {
        setMediaPrefetched(true);
      }
    };

    prefetchAssets();
  // Intentionally exclude full row arrays — only re-run when session or hero data changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, sessionLoaded, heroMovie?.backdropPath, heroTVShow?.backdropPath, preloadImage]);

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

  // Periodic in-app update checking logic
  const [updateAvailable, setUpdateAvailable] = useState<any>(null);
  useEffect(() => {
    const triggerUpdateCheck = async () => {
      try {
        const { checkForUpdates } = await import('./services/core/updater');
        const updateData = await checkForUpdates();
        if (updateData) {
          setUpdateAvailable(updateData);
        }
      } catch (err) {
        console.warn('[App] Update check failed:', err);
      }
    };
    triggerUpdateCheck();
    // Re-check every 30 minutes
    const updateTimer = setInterval(triggerUpdateCheck, 30 * 60 * 1000);
    return () => clearInterval(updateTimer);
  }, []);

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

  const mappedPartyInvites = useMemo(() => {
    return partyInvites.map(invite => ({
      id: invite.data.item_id,
      title: invite.data.item_title,
      posterPath: invite.data.poster_path,
      backdropPath: invite.data.backdrop_path,
      firstAirDate: invite.data.media_type === 'tv' ? 'tv' : undefined,
      inviteData: invite
    })) as any;
  }, [partyInvites]);

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
  
  const isOverlayActive = !!selectedMovie || !!selectedTVShow || !!selectedActor || !!selectedCategory || !!selectedPartyInvite || searchOpen || searchResultsOpen || downloadsOpen;
  const lastScrollPosRef = React.useRef<number>(0);

  useEffect(() => {
    if (isOverlayActive) {
      lastScrollPosRef.current = window.scrollY;
    } else {
      const savedPos = lastScrollPosRef.current;
      const timer = setTimeout(() => {
        window.scrollTo({
          top: savedPos,
          behavior: 'auto'
        });
      }, 30);
      return () => clearTimeout(timer);
    }
  }, [isOverlayActive]);
  
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
    // Restore the user's saved language preference from their cloud profile
    SettingsService.restoreLanguageFromProfile((profile as any).appLanguage);
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
      const nextProfile = ProfileService.getActiveProfile();
      const prevProfile = activeProfile;
      setActiveProfile(nextProfile);
      if (!prevProfile || !nextProfile || prevProfile.id !== nextProfile.id) {
        setTimeout(() => {
          content.reloadAll();
        }, 0);
      }
    };
    
    const handleNavigateToDownloads = () => {
      setCurrentView('downloads');
    };

    const handleNavigateToLogin = () => {
      handleLogout();
    };
    
    const handleGenreBadgeClickEvent = (e: any) => {
      const { name, id } = e.detail;
      setSelectedMovie(null);
      setSelectedTVShow(null);
      setSelectedActor(null);
      setSelectedCategory(null);
      localStorage.setItem('cinemovie_preselected_genre', JSON.stringify({ name, id }));
      setSearchOpen(true);
    };

    window.addEventListener('movieClick', handleMovieClickEvent);
    window.addEventListener('tvShowClick', handleTVShowClickEvent);
    window.addEventListener('profileChanged', handleProfileChange);
    window.addEventListener('navigateToDownloads', handleNavigateToDownloads);
    window.addEventListener('navigateToLogin', handleNavigateToLogin);
    window.addEventListener('genreBadgeClick', handleGenreBadgeClickEvent);
    
    const setupNativeEvents = async () => {
      try {
        const { App: CapApp } = await import('@capacitor/app');
        
        // Handle App state changes (returning from background ads or screen unlock)
        await CapApp.addListener('appStateChange', ({ isActive }) => {
          if (isActive) {
            console.log('App became active - ensuring state consistency');
            // If the user resumes their app after lock/background, clear any hanging prefetch locks to prevent gray screen
            setSessionLoaded(true);
            setMediaPrefetched(true);
            setMinTimeDone(true);
            setIsLoading(false);
          }
        });

        let lastBackPress = 0;
        
        const listener = await CapApp.addListener('backButton', ({ canGoBack }) => {
          // Priority 0: Video Player (highest)
          if (document.querySelector('.video-player-overlay')) return;

          // Priority 1: Overlays & Modals
          if (selectedActor) { setSelectedActor(null); return; }
          if (selectedMovie) { setSelectedMovie(null); return; }
          if (selectedTVShow) { setSelectedTVShow(null); return; }
          if (selectedCategory) { setSelectedCategory(null); return; }
          if (searchResultsOpen) { setSearchResultsOpen(false); setSearchOpen(true); return; }
          if (searchOpen) { setSearchOpen(false); return; }

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
      window.removeEventListener('genreBadgeClick', handleGenreBadgeClickEvent);
      nativeCleanupPromise.then(cleanup => cleanup?.());
    };
  }, [selectedMovie, selectedTVShow, selectedActor, searchOpen, searchResultsOpen, currentView, showProfileSelector, activeProfile, content]);

  const handleRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (recoveryPassword.length < 6) {
      setRecoveryError(t('error_password_length'));
      triggerHaptic('medium');
      return;
    }
    if (recoveryPassword !== recoveryConfirmPassword) {
      setRecoveryError(t('error_password_match'));
      triggerHaptic('medium');
      return;
    }
    setRecoveryLoading(true);
    setRecoveryError('');
    setRecoveryMessage('');
    try {
      const { error } = await supabase.auth.updateUser({ password: recoveryPassword });
      if (error) throw error;
      setRecoveryMessage(t('success_password_update'));
      triggerHaptic('heavy');
      setTimeout(() => {
        setShowPasswordRecovery(false);
        setRecoveryPassword('');
        setRecoveryConfirmPassword('');
        setRecoveryMessage('');
      }, 2500);
    } catch (err: any) {
      setRecoveryError(err.message || t('error_password_failed'));
      triggerHaptic('medium');
    } finally {
      setRecoveryLoading(false);
    }
  };

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
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setTimeout(() => {
      setSelectedTVShow(show);
    }, 120);
  }, []);

  const handleMovieClick = useCallback((movie: Movie | TVShow | any) => {
    // Blur any focused input first (e.g. search bar) so the keyboard is dismissed
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    const isTv = movie.mediaType === 'tv' || movie.type === 'tv' || movie.media_type === 'tv' || 'firstAirDate' in movie || 'name' in movie;
    // Small delay lets Android's IME fully dismiss before the details page mounts,
    // preventing the keyboard from re-appearing on the new screen.
    setTimeout(() => {
      if (isTv) {
        handleTVShowClick(movie as any);
        return;
      }
      setSelectedMovie(movie);
    }, 120);
  }, [handleTVShowClick]);

  const handleShowSearchResults = useCallback((query: string, results: Movie[]) => {
    setSearchQuery(query);
    setSearchResults(results);
    setSearchOpen(false);
    setSearchResultsOpen(true);
  }, []);

  const handleNavClick = useCallback((view: View) => {
    triggerHaptic('light');
    setCurrentView(view);
    setSearchResultsOpen(false);
    setActiveSettingsSubPage(null);
    setSelectedNewsGenre(null);
  }, []);

  const handleSurpriseMe = useCallback(() => {
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
  }, [trending, popular, trendingTV, popularTV, handleTVShowClick, handleMovieClick]);

  // Stable see-all callback helper map to prevent re-renders on every rows list change
  const seeAllParamsRef = React.useRef<Record<string, { title: string, movies: any[] }>>({});
  const seeAllCallbacksRef = React.useRef<Record<string, () => void>>({});

  const handleSeeAll = useCallback((key: string) => {
    const params = seeAllParamsRef.current[key];
    if (params) {
      setSelectedCategory({ title: params.title, movies: params.movies });
    }
  }, []);

  const getSeeAllCallback = useCallback((key: string, title: string, movies: any[]) => {
    seeAllParamsRef.current[key] = { title, movies };
    if (!seeAllCallbacksRef.current[key]) {
      seeAllCallbacksRef.current[key] = () => handleSeeAll(key);
    }
    return seeAllCallbacksRef.current[key];
  }, [handleSeeAll]);

  // Stable handlers for open states, profile switches, and other row events
  const handleSearchOpen = useCallback(() => setSearchOpen(true), []);
  const handleDownloadsOpen = useCallback(() => setDownloadsOpen(true), []);
  const handleSwitchProfile = useCallback(() => setShowProfileSelector(true), []);
  const handlePartyInviteClick = useCallback((movie: any) => {
    setSelectedPartyInvite(movie.inviteData);
  }, []);
  const handleProgressTabChange = useCallback((id: string) => {
    setHomeActiveProgressTab(id as any);
  }, []);
  const handleTrendingTabChange = useCallback((id: string) => {
    setHomeActiveTrendingTab(id as any);
  }, []);

  const filterKids = useCallback(<T extends Movie | TVShow>(items: T[]): T[] => {
    if (!activeProfile?.isKids) return items;
    return items.filter(item => {
        const genreIds = (item as any).genreIds || (item as any).genres?.map((g: any) => g.id);
        return genreIds?.some((id: number) => [16, 10751, 12].includes(id));
    });
  }, [activeProfile?.isKids]);

  const isOAuthSetupIncomplete = isAuthenticated && currentUser && 
    (currentUser.app_metadata?.provider === 'google' || currentUser.identities?.some((id: any) => id.provider === 'google')) && 
    !currentUser.user_metadata?.setup_completed &&
    !currentUser.identities?.some((id: any) => id.provider === 'email');

  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        {!isOnline && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            background: 'rgba(239, 68, 68, 0.9)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            color: '#fff',
            textAlign: 'center',
            padding: '8px 12px',
            paddingTop: 'calc(8px + env(safe-area-inset-top, 0px))',
            fontSize: '0.8rem',
            fontWeight: 800,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            animation: 'fadeIn 0.3s ease-out'
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path><path d="M10.71 5.05A16 16 0 0 1 22.58 9"></path><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path><path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path><line x1="12" y1="20" x2="12.01" y2="20"></line></svg>
            <span>{t('offline_warning')}</span>
          </div>
        )}
        {isLoading ? (
          <LoadingScreen />
        ) : showPasswordRecovery ? (
          <div style={{
            width: '100vw',
            height: '100vh',
            background: '#040405',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '20px',
            boxSizing: 'border-box',
            overflow: 'hidden'
          }}>
            {/* Logo */}
            <div style={{
              marginBottom: '1rem',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              width: '100%',
              maxWidth: '320px',
              height: '80px',
              position: 'relative',
              userSelect: 'none',
              pointerEvents: 'none',
            }}>
              <img
                src="/cinemovie-logo.png"
                alt="Cinemovie"
                style={{
                  height: '120px',
                  objectFit: 'contain',
                  filter: 'drop-shadow(0 4px 15px rgba(0,0,0,0.8))',
                  pointerEvents: 'none',
                  userSelect: 'none',
                }}
              />
            </div>

            {/* Content Container (Cardless, transparent, clean layout) */}
            <div style={{
              width: '100%',
              maxWidth: '320px',
              display: 'flex',
              flexDirection: 'column',
              padding: '1rem 0',
              animation: 'fadeInScale 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
              boxSizing: 'border-box'
            }}>
              <h2 style={{
                color: '#ffffff',
                fontSize: '1.8rem',
                fontWeight: 800,
                marginBottom: '0.5rem',
                textAlign: 'left',
                letterSpacing: '-0.5px',
                margin: '0 0 8px 0'
              }}>
                {t('reset_password')}
              </h2>
              
              <p style={{
                color: 'rgba(255, 255, 255, 0.5)',
                fontSize: '0.88rem',
                lineHeight: '1.4',
                margin: '0 0 20px 0',
                fontWeight: 500,
                textAlign: 'left'
              }}>
                {t('reset_password_desc')}
              </p>

              {recoveryError && (
                <div style={{
                  width: '100%',
                  background: 'rgba(255, 71, 87, 0.15)',
                  color: '#ff6b6b',
                  padding: '12px',
                  borderRadius: '8px',
                  textAlign: 'center',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  marginBottom: '1.5rem',
                  border: '1px solid rgba(255, 71, 87, 0.25)',
                  boxSizing: 'border-box'
                }}>{recoveryError}</div>
              )}

              {recoveryMessage && (
                <div style={{
                  width: '100%',
                  background: 'rgba(46, 213, 115, 0.15)',
                  color: '#2ed573',
                  padding: '12px',
                  borderRadius: '8px',
                  textAlign: 'center',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  marginBottom: '1.5rem',
                  border: '1px solid rgba(46, 213, 115, 0.25)',
                  boxSizing: 'border-box'
                }}>{recoveryMessage}</div>
              )}

              <form onSubmit={handleRecoverySubmit} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                <input
                  type="password"
                  placeholder={t('new_password')}
                  value={recoveryPassword}
                  onChange={(e) => { setRecoveryPassword(e.target.value); setRecoveryError(''); }}
                  onFocus={() => setIsPassFocused(true)}
                  onBlur={() => setIsPassFocused(false)}
                  disabled={recoveryLoading || !!recoveryMessage}
                  style={{
                    width: '100%',
                    padding: '16px 20px',
                    borderRadius: '8px',
                    border: isPassFocused ? '1px solid #ffffff' : '1px solid rgba(255, 255, 255, 0.12)',
                    background: 'rgba(255, 255, 255, 0.03)',
                    color: '#ffffff',
                    fontSize: '1rem',
                    fontWeight: 500,
                    outline: 'none',
                    transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                    boxShadow: isPassFocused ? '0 0 16px rgba(255, 255, 255, 0.15)' : 'none',
                    boxSizing: 'border-box'
                  }}
                />

                <input
                  type="password"
                  placeholder={t('confirm_password')}
                  value={recoveryConfirmPassword}
                  onChange={(e) => { setRecoveryConfirmPassword(e.target.value); setRecoveryError(''); }}
                  onFocus={() => setIsConfirmFocused(true)}
                  onBlur={() => setIsConfirmFocused(false)}
                  disabled={recoveryLoading || !!recoveryMessage}
                  style={{
                    width: '100%',
                    padding: '16px 20px',
                    borderRadius: '8px',
                    border: isConfirmFocused ? '1px solid #ffffff' : '1px solid rgba(255, 255, 255, 0.12)',
                    background: 'rgba(255, 255, 255, 0.03)',
                    color: '#ffffff',
                    fontSize: '1rem',
                    fontWeight: 500,
                    outline: 'none',
                    transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                    boxShadow: isConfirmFocused ? '0 0 16px rgba(255, 255, 255, 0.15)' : 'none',
                    boxSizing: 'border-box'
                  }}
                />

                <button
                  type="submit"
                  disabled={recoveryLoading || !!recoveryMessage}
                  style={{
                    background: '#ffffff',
                    color: '#000000',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '16px',
                    fontSize: '1.1rem',
                    fontWeight: 800,
                    cursor: (recoveryLoading || !!recoveryMessage) ? 'not-allowed' : 'pointer',
                    marginTop: '0.5rem',
                    transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                    boxShadow: '0 8px 24px rgba(255, 255, 255, 0.15)',
                    width: '100%',
                    boxSizing: 'border-box'
                  }}
                >
                  {recoveryLoading ? t('updating') : t('save_and_continue')}
                </button>
              </form>
            </div>
          </div>
        ) : isOAuthSetupIncomplete ? (
          <OAuthOnboarding 
            currentUser={currentUser} 
            onComplete={(updatedUser) => {
              setCurrentUser(updatedUser);
            }} 
            onCancel={() => {
              setCurrentUser(null);
              setIsAuthenticated(false);
            }} 
          />
        ) : (!isAuthenticated && !isGuest) ? (
          <LoginPage onLogin={handleLogin} onContinueAsGuest={handleContinueAsGuest} prefetchedPosters={prefetchedPosters} />
        ) : (!activeProfile || showProfileSelector) ? (
          <ProfileSelector onProfileSelected={handleProfileSelected} />
        ) : (
          <div style={{ width: '100%', height: '100vh', overflow: 'hidden', position: 'relative' }}>
            <Suspense fallback={<SimpleLoader />}>
              <div style={{ width: '100%', height: '100vh', overflow: 'hidden', position: 'relative' }}>
                <div style={{ display: isOverlayActive ? 'none' : 'block', width: '100%', height: '100vh', overflow: 'hidden', position: 'relative' }}>

              {/* PERSISTENT CONTENT VIEWS — Wraps main screens to keep them alive and prevent unmount-remount lag */}
              <div style={{
                display: currentView === 'home' ? 'block' : 'none',
                width: '100%',
                height: '100vh',
                overflowY: 'auto',
                WebkitOverflowScrolling: 'touch',
                position: 'absolute',
                inset: 0,
              }}>
                <div style={{ 
                  minHeight: '100vh', 
                  background: COLORS.bgPrimary,
                  paddingBottom: 'calc(130px + env(safe-area-inset-bottom, 0px))',
                }}>
                  <Header 
                    onSearchOpen={handleSearchOpen} 
                    onDownloadsOpen={handleDownloadsOpen}
                    activeProfile={activeProfile} 
                    onSwitchProfile={handleSwitchProfile} 
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
                          marginTop: '-6rem', 
                          zIndex: 10, 
                          background: 'linear-gradient(to bottom, transparent 0%, rgba(var(--bg-primary-rgb, 10,10,10), 0.0) 5%, rgba(var(--bg-primary-rgb, 10,10,10), 0.5) 35%, var(--bg-primary) 65%)', 
                          paddingTop: '6rem',
                          overflowX: 'hidden',
                          pointerEvents: 'none'
                        }}>
                          <div style={{ pointerEvents: 'auto' }}>
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
                                    <span>{t('watch_with_friends')}</span>
                                  </div>
                                }
                                isWide={true}
                                movies={mappedPartyInvites}
                                onMovieClick={handlePartyInviteClick}
                              />
                            )}
                            {(continueWatching.length > 0 || friendActivityItems.length > 0) && (
                              <ContentRow 
                                key={`progress-row-${homeActiveProgressTab}`}
                                title={homeActiveProgressTab === 'continue' ? t('continue_watching') : t('what_were_watching')}
                                movies={homeActiveProgressTab === 'continue' ? continueWatching : friendActivityItems} 
                                onMovieClick={handleMovieClick} 
                                onReaction={homeActiveProgressTab === 'friends' ? handleActivityReaction : undefined}
                                onSeeAll={getSeeAllCallback('home-continue', homeActiveProgressTab === 'continue' ? t('continue_watching') : t('what_were_watching'), homeActiveProgressTab === 'continue' ? continueWatching : friendActivityItems)}
                                tabs={isGuest ? undefined : [
                                  { id: 'continue', label: t('me') || 'Me' },
                                  { id: 'friends', label: t('friends') || 'Friends' }
                                ]}
                                activeTab={isGuest ? 'continue' : homeActiveProgressTab}
                                onTabChange={handleProgressTabChange}
                              />
                            )}
                            {!minimalHome && (
                            <>
                            {(trending.length > 0 || trendingTV.length > 0) && (
                              <ContentRow 
                                title={t('trending_now')}
                                movies={homeActiveTrendingTab === 'movies' ? trending : trendingTV} 
                                onMovieClick={homeActiveTrendingTab === 'movies' ? handleMovieClick : handleTVShowClick}
                                onSeeAll={getSeeAllCallback('home-trending', t('trending_now'), homeActiveTrendingTab === 'movies' ? trending : trendingTV)}
                                tabs={[
                                  { id: 'movies', label: t('movies') },
                                  { id: 'tv', label: t('series') }
                                ]}
                                activeTab={homeActiveTrendingTab}
                                onTabChange={handleTrendingTabChange}
                              />
                            )}
                            {topPicks.length > 0 && (
                              <ContentRow 
                                title={t('top_picks_for_you')} 
                                movies={topPicks} 
                                onMovieClick={handleMovieClick} 
                                onSeeAll={getSeeAllCallback('home-toppicks', t('top_picks_for_you'), topPicks)}
                              />
                            )}
                            {popular.length > 0 && ( 
                                <ContentRow 
                                  title={t('popular_movies')} 
                                  movies={popular} 
                                  onMovieClick={handleMovieClick} 
                                  onSeeAll={getSeeAllCallback('home-popular', t('popular_movies'), popular)}
                                /> 
                             )}
                            {topRated.length > 0 && ( 
                                <ContentRow 
                                  title={t('top_rated')} 
                                  movies={topRated} 
                                  onMovieClick={handleMovieClick} 
                                  onSeeAll={getSeeAllCallback('home-toprated', t('top_rated'), topRated)}
                                /> 
                             )}
                            {action.length > 0 && ( 
                                <ContentRow 
                                  title={t('trending_action')} 
                                  movies={action} 
                                  onMovieClick={handleMovieClick} 
                                  onSeeAll={getSeeAllCallback('home-action', t('trending_action'), action)}
                                /> 
                             )}
                            {comedy.length > 0 && ( 
                                <ContentRow 
                                  title={t('top_comedies')} 
                                  movies={comedy} 
                                  onMovieClick={handleMovieClick} 
                                  onSeeAll={getSeeAllCallback('home-comedy', t('top_comedies'), comedy)}
                                /> 
                             )}
                            {family.length > 0 && ( 
                                <ContentRow 
                                  title={t('trending_family')} 
                                  movies={family} 
                                  onMovieClick={handleMovieClick} 
                                  onSeeAll={getSeeAllCallback('home-family', t('trending_family'), family)}
                                /> 
                             )}
                            
                            {recommendedGenres.map((genre, idx) => (
                              <ContentRow 
                                key={`rec-genre-${genre.genreId}`}
                                title={`${t('best_of')} ${genre.name}`} 
                                movies={genre.items} 
                                onMovieClick={handleMovieClick} 
                                onSeeAll={getSeeAllCallback(`home-genre-${genre.genreId}`, `${t('best_of')} ${genre.name}`, genre.items)}
                              />
                            ))}
 
                            {latestReleases.length > 0 && ( <ContentRow title={t('already_on_vidsrc')} movies={latestReleases} onMovieClick={handleMovieClick} /> )}
                            {upcoming.length > 0 && filterKids(upcoming).length > 0 && ( <ContentRow title={t('upcoming_releases')} movies={filterKids(upcoming)} onMovieClick={handleMovieClick} /> )}
                            </>
                            )}
 
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
 
              <div style={{
                display: currentView === 'movies' ? 'block' : 'none',
                width: '100%',
                height: '100vh',
                overflowY: 'auto',
                WebkitOverflowScrolling: 'touch',
                position: 'absolute',
                inset: 0,
              }}>
                <div style={{ minHeight: '100vh', background: COLORS.bgPrimary, paddingBottom: 'calc(130px + env(safe-area-inset-bottom, 0px))' }}>
                  <Header 
                    onSearchOpen={() => setSearchOpen(true)} 
                    onDownloadsOpen={() => setDownloadsOpen(true)}
                    activeProfile={activeProfile} 
                    onSwitchProfile={handleSwitchProfile} 
                    hasActiveDownloads={hasActiveDownloads}
                    currentView={currentView}
                    onNavClick={handleNavClick}
                    activeInviteToast={activeInviteToast}
                    onAcceptInvite={handleJoinInviteClick}
                    onDeclineInvite={handleDeclineInvite}
                  />
                  <div style={{ paddingTop: 0 }}>
                    <Hero movie={heroMovie} onPlayClick={() => setSelectedMovie(heroMovie)} onInfoClick={() => setSelectedMovie(heroMovie)} onSurpriseMe={handleSurpriseMe} />
                    <div style={{ position: 'relative', marginTop: '-6rem', zIndex: 10, background: 'linear-gradient(to bottom, transparent 0%, rgba(var(--bg-primary-rgb, 10,10,10), 0.0) 5%, rgba(var(--bg-primary-rgb, 10,10,10), 0.5) 35%, var(--bg-primary) 65%)', paddingTop: '6rem', pointerEvents: 'none' }}>
                      <div style={{ pointerEvents: 'auto' }}>
                        {topPicksMovies.length > 0 && ( <ContentRow title={t('top_picks_for_you')} movies={topPicksMovies} onMovieClick={handleMovieClick} onSeeAll={getSeeAllCallback('movies-toppicks', t('top_picks_for_you'), topPicksMovies)} /> )}
                        {trending.length > 0 && ( <ContentRow title={t('trending_now')} movies={trending} onMovieClick={handleMovieClick} onSeeAll={getSeeAllCallback('movies-trending', t('trending_now'), trending)} /> )}
                        {popular.length > 0 && ( <ContentRow title={t('popular_movies')} movies={popular} onMovieClick={handleMovieClick} onSeeAll={getSeeAllCallback('movies-popular', t('popular_movies'), popular)} /> )}
                        {topRated.length > 0 && ( <ContentRow title={t('top_rated')} movies={topRated} onMovieClick={handleMovieClick} onSeeAll={getSeeAllCallback('movies-toprated', t('top_rated'), topRated)} /> )}
                        {action.length > 0 && ( <ContentRow title={t('trending_action')} movies={action} onMovieClick={handleMovieClick} onSeeAll={getSeeAllCallback('movies-action', t('trending_action'), action)} /> )}
                        {comedy.length > 0 && ( <ContentRow title={t('top_comedies')} movies={comedy} onMovieClick={handleMovieClick} onSeeAll={getSeeAllCallback('movies-comedy', t('top_comedies'), comedy)} /> )}
                        {family.length > 0 && ( <ContentRow title={t('family_hits')} movies={family} onMovieClick={handleMovieClick} onSeeAll={getSeeAllCallback('movies-family', t('family_hits'), family)} /> )}
                        {upcoming.length > 0 && ( <ContentRow title={t('upcoming_movies')} movies={upcoming} onMovieClick={handleMovieClick} onSeeAll={getSeeAllCallback('movies-upcoming', t('upcoming_movies'), upcoming)} /> )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
 
              <div style={{
                display: currentView === 'tvshows' ? 'block' : 'none',
                width: '100%',
                height: '100vh',
                overflowY: 'auto',
                WebkitOverflowScrolling: 'touch',
                position: 'absolute',
                inset: 0,
              }}>
                {heroTVShow && (
                  <div style={{ minHeight: '100vh', background: COLORS.bgPrimary, paddingBottom: 'calc(130px + env(safe-area-inset-bottom, 0px))' }}>
                    <Header 
                      onSearchOpen={handleSearchOpen} 
                      onDownloadsOpen={handleDownloadsOpen} 
                      activeProfile={activeProfile} 
                      onSwitchProfile={handleSwitchProfile}
                      hasActiveDownloads={hasActiveDownloads}
                      currentView={currentView}
                      onNavClick={handleNavClick}
                      activeInviteToast={activeInviteToast}
                      onAcceptInvite={handleJoinInviteClick}
                      onDeclineInvite={handleDeclineInvite}
                    />
                    <div style={{ paddingTop: 0 }}>
                      <Hero movie={heroTVShow as any} onPlayClick={() => setSelectedTVShow(heroTVShow)} onInfoClick={() => setSelectedTVShow(heroTVShow)} />
                      <div style={{ position: 'relative', marginTop: '-6rem', zIndex: 10, background: 'linear-gradient(to bottom, transparent 0%, rgba(var(--bg-primary-rgb, 10,10,10), 0.0) 5%, rgba(var(--bg-primary-rgb, 10,10,10), 0.5) 35%, var(--bg-primary) 65%)', paddingTop: '6rem', pointerEvents: 'none' }}>
                        <div style={{ pointerEvents: 'auto' }}>
                          {topPicksTV.length > 0 && ( <ContentRow title={t('top_picks_for_you')} movies={topPicksTV} onMovieClick={handleTVShowClick} onSeeAll={getSeeAllCallback('tv-toppicks', t('top_picks_for_you'), topPicksTV)} /> )}
                          {(trendingTV.length > 0) && ( <ContentRow title={t('trending_now')} movies={trendingTV as any} onMovieClick={handleTVShowClick} onSeeAll={getSeeAllCallback('tv-trending', t('trending_now'), trendingTV as any)} /> )}
                          {popularTV.length > 0 && ( <ContentRow title={t('popular_tv')} movies={popularTV} onMovieClick={handleTVShowClick} onSeeAll={getSeeAllCallback('tv-popular', t('popular_tv'), popularTV)} /> )}
                          {topRatedTV.length > 0 && ( <ContentRow title={t('top_rated')} movies={topRatedTV} onMovieClick={handleTVShowClick} onSeeAll={getSeeAllCallback('tv-toprated', t('top_rated'), topRatedTV)} /> )}
                          {dramaTV.length > 0 && ( <ContentRow title={t('trending_drama')} movies={dramaTV as any} onMovieClick={handleTVShowClick} onSeeAll={getSeeAllCallback('tv-drama', t('trending_drama'), dramaTV as any)} /> )}
                          {comedyTV.length > 0 && ( <ContentRow title={t('comedy_favorites')} movies={comedyTV as any} onMovieClick={handleTVShowClick} onSeeAll={getSeeAllCallback('tv-comedy', t('comedy_favorites'), comedyTV as any)} /> )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
 
              {/* OTHER DYNAMIC VIEWS — Mount/unmount normally to keep active DOM footprint optimal */}
              {currentView === 'mylist' && (
                <div style={{
                  width: '100%',
                  height: '100vh',
                  overflowY: 'auto',
                  WebkitOverflowScrolling: 'touch',
                  position: 'absolute',
                  inset: 0,
                }}>
                  <div style={{ minHeight: '100vh', background: COLORS.bgPrimary, paddingBottom: 'calc(160px + env(safe-area-inset-bottom, 0px))', paddingTop: 'calc(70px + env(safe-area-inset-top, 0px))' }}>
                    <MyListSubPage isMobile={window.innerWidth < 768} sectionHeaderStyle={() => ({})} onMovieClick={handleMovieClick} />
                  </div>
                </div>
              )}
 
              {currentView === 'newandhot' && (
                <div style={{
                  width: '100%',
                  height: '100vh',
                  overflowY: 'auto',
                  WebkitOverflowScrolling: 'touch',
                  position: 'absolute',
                  inset: 0,
                }}>
                  <div style={{ minHeight: '100vh', background: COLORS.bgPrimary, paddingBottom: 'calc(130px + env(safe-area-inset-bottom, 0px))' }}>
                    <Header 
                      onSearchOpen={handleSearchOpen} 
                      onDownloadsOpen={handleDownloadsOpen}
                      activeProfile={activeProfile} 
                      onSwitchProfile={handleSwitchProfile} 
                      hasActiveDownloads={hasActiveDownloads}
                      currentView={currentView}
                      onNavClick={handleNavClick}
                      activeInviteToast={activeInviteToast}
                      onAcceptInvite={handleJoinInviteClick}
                      onDeclineInvite={handleDeclineInvite}
                      activeNewsGenre={selectedNewsGenre}
                      onBackNewsGenre={() => setSelectedNewsGenre(null)}
                    />
                    <BrowseNewsPage 
                      trending={combinedTrending} 
                      upcoming={upcoming} 
                      onItemClick={(item: any) => { if (item.firstAirDate) { handleTVShowClick(item); } else { handleMovieClick(item); } }} 
                      selectedGenre={selectedNewsGenre}
                      onSelectedGenreChange={setSelectedNewsGenre}
                    />
                  </div>
                </div>
              )}
 
              {currentView === 'settings' && (
                <div style={{
                  width: '100%',
                  height: '100vh',
                  overflowY: 'auto',
                  WebkitOverflowScrolling: 'touch',
                  position: 'absolute',
                  inset: 0,
                }}>
                  <div style={{ minHeight: '100vh', background: COLORS.bgPrimary }}>
                    {!showVersionHistory && (
                      <Header 
                        onSearchOpen={handleSearchOpen} 
                        onDownloadsOpen={handleDownloadsOpen}
                        activeProfile={activeProfile} 
                        onSwitchProfile={handleSwitchProfile} 
                        hasActiveDownloads={hasActiveDownloads}
                        currentView={currentView}
                        onNavClick={handleNavClick}
                        activeInviteToast={activeInviteToast}
                        onAcceptInvite={handleJoinInviteClick}
                        onDeclineInvite={handleDeclineInvite}
                        activeSettingsSubPage={activeSettingsSubPage}
                        onBackSettingsSubPage={() => setActiveSettingsSubPage(null)}
                      />
                    )}
                    <SettingsPage 
                      isVisible={currentView === 'settings'}
                      onNavigate={setCurrentView} 
                      heroBackground={heroMovie} 
                      activeProfile={activeProfile} 
                      onSwitchProfile={handleSwitchProfile} 
                      onLogout={handleLogout}
                      activeSubPage={activeSettingsSubPage}
                      onActiveSubPageChange={setActiveSettingsSubPage}
                      showVersionHistory={showVersionHistory}
                      onShowVersionHistoryChange={setShowVersionHistory}
                      onMovieClick={handleMovieClick}
                      updateAvailable={updateAvailable}
                      onClearUpdate={() => setUpdateAvailable(null)}
                    />
                  </div>
                </div>
              )}
              {currentView === 'downloads' && (
                <div style={{
                  width: '100%',
                  height: '100vh',
                  overflowY: 'auto',
                  WebkitOverflowScrolling: 'touch',
                  position: 'absolute',
                  inset: 0,
                }}>
                  <DownloadsPage onNavigate={setCurrentView} />
                </div>
              )}

              <BottomNav currentView={currentView} onNavClick={handleNavClick} onSearchOpen={handleSearchOpen} activeProfile={activeProfile} hasUpdate={!!updateAvailable} />
                </div>


              {searchOpen && ( <SearchOverlay onClose={() => setSearchOpen(false)} onMovieClick={handleMovieClick} onShowResults={handleShowSearchResults} /> )}
              {searchResultsOpen && ( <SearchResults query={searchQuery} results={searchResults} loading={searchLoading} onMovieClick={handleMovieClick} onClose={() => { setSearchResultsOpen(false); setSearchOpen(true); }} /> )}
              <DownloadCenter isOpen={downloadsOpen} onClose={() => setDownloadsOpen(false)} onItemClick={(item: any) => { if (item.firstAirDate || item.name) { handleTVShowClick(item); } else { handleMovieClick(item); } }} />
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
            </div>
          </Suspense>
        </div>
      )}

        
      </ErrorBoundary>
    </QueryClientProvider>
  );
}
