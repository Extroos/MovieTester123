import React, { useState } from 'react';
import { Play, Share2, Check, X } from 'lucide-react';
import { t } from '../../../../utils/i18n';

interface StatisticsSubPageProps {
  profileStats: any;
  isMobile: boolean;
  onResetStatsClick: () => void;
  triggerHaptic: (type: 'light' | 'medium' | 'heavy') => void;
  getBackdropUrl: (path: string | null | undefined, size: string) => string;
  getPosterUrl: (path: string | null | undefined, size: string) => string;
  COLORS: any;
}

export default function StatisticsSubPage({
  profileStats,
  isMobile,
  onResetStatsClick,
  triggerHaptic,
  getBackdropUrl,
  getPosterUrl,
  COLORS
}: StatisticsSubPageProps) {
  const [selectedAch, setSelectedAch] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  if (localStorage.getItem('cinemovie_is_guest') === 'true') {
    return (
      <div style={{
        padding: '40px 20px',
        textAlign: 'center',
        background: 'rgba(255, 255, 255, 0.02)',
        border: '1px solid rgba(255, 255, 255, 0.06)',
        borderRadius: '16px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '16px',
        marginTop: '12px'
      }}>
        <div style={{
          width: '60px',
          height: '60px',
          borderRadius: '50%',
          background: 'rgba(255, 255, 255, 0.05)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px solid rgba(255, 255, 255, 0.1)'
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255, 255, 255, 0.4)" strokeWidth="2.5">
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
          </svg>
        </div>
        <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#fff' }}>{t('viewing_insights_disabled')}</h3>
        <p style={{ margin: 0, fontSize: '0.88rem', color: 'rgba(255, 255, 255, 0.5)', lineHeight: 1.5, maxWidth: '320px' }}>
          {t('viewing_insights_desc')}
        </p>
        <button
          onClick={() => { triggerHaptic('heavy'); window.dispatchEvent(new CustomEvent('requestLogin')); }}
          className="tv-focusable"
          style={{
            background: '#ffffff',
            color: '#000000',
            border: 'none',
            borderRadius: '8px',
            padding: '10px 20px',
            fontSize: '0.82rem',
            fontWeight: 800,
            cursor: 'pointer',
            width: '100%',
            marginTop: '8px',
            boxShadow: '0 4px 12px rgba(255,255,255,0.1)',
            outline: 'none'
          }}
        >
          {t('sign_in_sign_up')}
        </button>
      </div>
    );
  }

  if (!profileStats) {
    return <div style={{ padding: '24px', textAlign: 'center', opacity: 0.5, color: '#fff' }}>{t('loading_statistics')}</div>;
  }

  const watchedItems = profileStats.watchedItems || {};
  const itemList = Object.values(watchedItems) as any[];

  // 1. Calculate metrics
  const totalSeconds = profileStats.totalWatchTime || 0;
  const totalHrs = Math.floor(totalSeconds / 3600);
  const totalMins = Math.floor((totalSeconds % 3600) / 60);

  const totalStarted = itemList.length;
  const completedList = itemList.filter(i => i.completed);
  const totalCompleted = completedList.length;
  const completionRate = totalStarted > 0 ? Math.round((totalCompleted / totalStarted) * 100) : 0;

  const moviesCount = itemList.filter(i => i.type === 'movie').length;
  const tvShowsCount = itemList.filter(i => i.type === 'tv').length;
  const animeCount = itemList.filter(i => i.type === 'anime').length;
  const seriesCount = tvShowsCount + animeCount;

  const currentStreak = profileStats.currentStreak || 0;
  const longestStreak = profileStats.longestStreak || 0;

  // 2. Favorite (Most Watched) Items
  const movieItems = itemList.filter(i => i.type === 'movie');
  const favoriteMovie = movieItems.length > 0 ? movieItems.reduce((prev, current) => (prev.watchTime > current.watchTime) ? prev : current) : null;

  const seriesItems = itemList.filter(i => i.type === 'tv' || i.type === 'anime');
  const favoriteSeries = seriesItems.length > 0 ? seriesItems.reduce((prev, current) => (prev.watchTime > current.watchTime) ? prev : current) : null;

  // 3. Genre preference distribution
  const genreTimes: { [name: string]: number } = {};
  itemList.forEach(item => {
    const genres = item.genres || [];
    genres.forEach((g: string) => {
      genreTimes[g] = (genreTimes[g] || 0) + item.watchTime;
    });
  });
  const sortedGenres = Object.entries(genreTimes)
    .map(([name, time]) => ({ name, time }))
    .sort((a, b) => b.time - a.time)
    .slice(0, 4);

  const maxGenreTime = sortedGenres.length > 0 ? sortedGenres[0].time : 1;

  // Helper to parse dates in statistics page (compatible with both formats)
  const parseDateKeyLocal = (dateStr: string): Date => {
    if (dateStr.includes('-')) {
      const [y, m, d] = dateStr.split('-').map(Number);
      return new Date(y, m - 1, d, 0, 0, 0, 0);
    }
    if (dateStr.includes('/')) {
      const [m, d, y] = dateStr.split('/').map(Number);
      return new Date(y, m - 1, d, 0, 0, 0, 0);
    }
    const parsed = new Date(dateStr);
    parsed.setHours(0, 0, 0, 0);
    return parsed;
  };

  const hasWeekendWatch = Object.keys(profileStats.dailyWatchTime || {}).some(dateStr => {
    const parsed = parseDateKeyLocal(dateStr);
    const day = parsed.getDay();
    const time = profileStats.dailyWatchTime[dateStr] || 0;
    return (day === 0 || day === 6) && time > 0;
  });

  // 4. Weekly activity
  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const weeklyData = Array.from({ length: 7 }).map((_, idx) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - idx));
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const isoStr = `${year}-${month}-${day}`;
    const localeStr = d.toLocaleDateString('en-US');
    const time = profileStats.dailyWatchTime?.[isoStr] || profileStats.dailyWatchTime?.[localeStr] || 0;
    return {
      label: daysOfWeek[d.getDay()],
      time,
      dateStr: isoStr
    };
  });

  const maxDayTime = Math.max(...weeklyData.map(d => d.time), 1);

  // 5. Hourly Viewing Habits
  const hourly = profileStats.hourlyActivity || {};
  let morning = 0, afternoon = 0, evening = 0, night = 0;
  for (let h = 0; h < 24; h++) {
    const time = hourly[h] || 0;
    if (h >= 6 && h < 12) morning += time;
    else if (h >= 12 && h < 18) afternoon += time;
    else if (h >= 18 && h < 24) evening += time;
    else night += time;
  }
  const totalHourly = morning + afternoon + evening + night || 1;

  // 6. Recent History list (sorted by lastWatched)
  const recentHistory = [...itemList].sort((a, b) => new Date(b.lastWatched).getTime() - new Date(a.lastWatched).getTime());

  const handleItemClick = (wItem: any) => {
    triggerHaptic('light');
    const isTvShow = wItem.type === 'tv' || wItem.type === 'anime';
    const mapped: any = {
      id: Number(wItem.id),
      title: wItem.title,
      posterPath: wItem.posterPath,
      poster_path: wItem.posterPath,
      backdropPath: wItem.backdropPath || '',
      backdrop_path: wItem.backdropPath || '',
      mediaType: wItem.type === 'anime' ? 'anime' : (wItem.type === 'tv' ? 'tv' : 'movie'),
      type: wItem.type === 'anime' ? 'anime' : (wItem.type === 'tv' ? 'tv' : 'movie'),
    };
    if (isTvShow) {
      mapped.name = wItem.title;
      window.dispatchEvent(new CustomEvent('tvShowClick', { detail: mapped }));
    } else {
      window.dispatchEvent(new CustomEvent('movieClick', { detail: mapped }));
    }
  };

  const getBackdrop = (item: any) => {
    if (item.backdropPath) return getBackdropUrl(item.backdropPath, 'original');
    if (item.posterPath) return getPosterUrl(item.posterPath, 'medium');
    return '';
  };

  // Watch-time equivalents
  const lotrTrilogyCount = (totalSeconds / 41400).toFixed(1);
  const transatlanticFlightCount = (totalSeconds / 28800).toFixed(1);
  const novelsReadCount = (totalSeconds / 18000).toFixed(1);

  // Achievements configuration
  const achievements = [
    {
      id: 'first_steps',
      title: 'First Steps',
      description: 'Watch your very first title',
      unlocked: totalSeconds > 0,
      icon: '🥉',
      glow: 'rgba(205, 127, 50, 0.4)'
    },
    {
      id: 'movie_buff',
      title: 'Movie Buff',
      description: 'Watch at least 5 movies',
      unlocked: moviesCount >= 5,
      icon: '🥈',
      glow: 'rgba(192, 192, 192, 0.4)'
    },
    {
      id: 'cinephile',
      title: 'Cinephile',
      description: 'Watch at least 20 movies',
      unlocked: moviesCount >= 20,
      icon: '🎬',
      glow: 'rgba(236, 72, 153, 0.4)'
    },
    {
      id: 'anime_devotee',
      title: 'Anime Devotee',
      description: 'Watch at least 5 anime titles',
      unlocked: animeCount >= 5,
      icon: '🌸',
      glow: 'rgba(244, 114, 182, 0.4)'
    },
    {
      id: 'marathoner',
      title: 'Marathoner',
      description: 'Watch 10+ hours total',
      unlocked: totalSeconds >= 36000,
      icon: '🥇',
      glow: 'rgba(255, 215, 0, 0.4)'
    },
    {
      id: 'marathon_god',
      title: 'Marathon God',
      description: 'Watch 50+ hours total',
      unlocked: totalSeconds >= 180000,
      icon: '👑',
      glow: 'rgba(139, 92, 246, 0.6)'
    },
    {
      id: 'dedicated',
      title: 'Dedicated',
      description: 'Reach a 3-day watch streak',
      unlocked: longestStreak >= 3,
      icon: '🔥',
      glow: 'rgba(239, 68, 68, 0.4)'
    },
    {
      id: 'streak_master',
      title: 'Streak Master',
      description: 'Reach a 7-day watch streak',
      unlocked: longestStreak >= 7,
      icon: '⚡',
      glow: 'rgba(245, 158, 11, 0.4)'
    },
    {
      id: 'early_bird',
      title: 'Early Bird',
      description: 'Watch during morning hours (6am-12pm)',
      unlocked: morning > 0,
      icon: '🌅',
      glow: 'rgba(251, 191, 36, 0.4)'
    },
    {
      id: 'night_owl',
      title: 'Night Owl',
      description: 'Watch during late night hours',
      unlocked: night > 0,
      icon: '🌌',
      glow: 'rgba(59, 130, 246, 0.4)'
    },
    {
      id: 'weekend_warrior',
      title: 'Weekend Warrior',
      description: 'Watch titles on the weekend',
      unlocked: hasWeekendWatch,
      icon: '🛡️',
      glow: 'rgba(16, 185, 129, 0.4)'
    },
    {
      id: 'completionist',
      title: 'Completionist',
      description: 'Complete 5+ titles fully',
      unlocked: totalCompleted >= 5,
      icon: '🏆',
      glow: 'rgba(168, 85, 247, 0.4)'
    }
  ];


  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '24px' : '32px', width: '100%', boxSizing: 'border-box' }}>
      
      {/* Metric Cards Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: isMobile ? '10px' : '16px'
      }}>
        <div 
          tabIndex={0}
          className="tv-focusable"
          style={{
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: '16px',
            padding: isMobile ? '12px' : '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            outline: 'none'
          }}
        >
          <span style={{ fontSize: '0.62rem', fontWeight: 900, color: 'rgba(255, 255, 255, 0.4)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{t('total_screen_time')}</span>
          <span style={{ fontSize: isMobile ? '1.2rem' : '1.45rem', fontWeight: 900, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {totalHrs > 0 ? `${totalHrs}h ` : ''}{totalMins}m
          </span>
        </div>

        <div 
          tabIndex={0}
          className="tv-focusable"
          style={{
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: '16px',
            padding: isMobile ? '12px' : '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            outline: 'none'
          }}
        >
          <span style={{ fontSize: '0.62rem', fontWeight: 900, color: 'rgba(255, 255, 255, 0.4)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{t('daily_streak')}</span>
          <span style={{ fontSize: isMobile ? '1.2rem' : '1.45rem', fontWeight: 900, color: '#ff8c94', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            🔥 {currentStreak}d <span style={{ fontSize: '0.72rem', fontWeight: 650, color: 'rgba(255, 255, 255, 0.3)' }}>/ {longestStreak}d</span>
          </span>
        </div>

        <div 
          tabIndex={0}
          className="tv-focusable"
          style={{
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: '16px',
            padding: isMobile ? '12px' : '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            outline: 'none'
          }}
        >
          <span style={{ fontSize: '0.62rem', fontWeight: 900, color: 'rgba(255, 255, 255, 0.4)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{t('movies_explored')}</span>
          <span style={{ fontSize: isMobile ? '1.2rem' : '1.45rem', fontWeight: 900, color: '#fff' }}>{moviesCount}</span>
        </div>

        <div 
          tabIndex={0}
          className="tv-focusable"
          style={{
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: '16px',
            padding: isMobile ? '12px' : '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            outline: 'none'
          }}
        >
          <span style={{ fontSize: '0.62rem', fontWeight: 900, color: 'rgba(255, 255, 255, 0.4)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{t('completion_rate')}</span>
          <span style={{ fontSize: isMobile ? '1.2rem' : '1.45rem', fontWeight: 900, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{completionRate}% <span style={{ fontSize: '0.72rem', fontWeight: 650, color: 'rgba(255, 255, 255, 0.3)' }}>({totalCompleted})</span></span>
        </div>
      </div>

      {/* Cinematic Favorites banners */}
      {(favoriteMovie || favoriteSeries) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <h4 style={{ margin: 0, fontSize: '0.82rem', fontWeight: 900, color: '#fff', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{t('top_showcases')}</h4>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {favoriteMovie && (
              <div 
                onClick={() => handleItemClick(favoriteMovie)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleItemClick(favoriteMovie);
                  }
                }}
                tabIndex={0}
                className="tv-focusable"
                style={{
                  position: 'relative',
                  height: isMobile ? '130px' : '160px',
                  borderRadius: '20px',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                  transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                  outline: 'none'
                }}
              >
                <img
                  src={getBackdrop(favoriteMovie)}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.45 }}
                />
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'linear-gradient(to right, rgba(0,0,0,0.95) 40%, rgba(0,0,0,0.4) 80%, transparent 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  padding: isMobile ? '0 16px' : '0 24px',
                }}>
                  <div style={{ display: 'flex', gap: isMobile ? '12px' : '16px', alignItems: 'center', width: '100%' }}>
                    {favoriteMovie.posterPath && (
                      <img
                        src={getPosterUrl(favoriteMovie.posterPath, 'small')}
                        alt=""
                        style={{ width: isMobile ? '44px' : '56px', aspectRatio: '2/3', borderRadius: '8px', objectFit: 'cover', border: '1px solid rgba(255,255,255,0.15)', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}
                      />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: '0.58rem', fontWeight: 900, color: COLORS.primary, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{t('favorite_movie')}</span>
                      <h3 style={{ margin: '2px 0 4px', fontSize: isMobile ? '1.05rem' : '1.2rem', fontWeight: 900, color: '#fff', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                        {favoriteMovie.title}
                      </h3>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <p style={{ margin: 0, fontSize: '0.74rem', color: 'rgba(255, 255, 255, 0.6)', fontWeight: 700 }}>
                          ⏱️ {Math.floor(favoriteMovie.watchTime / 60)}m
                        </p>
                        {favoriteMovie.genres && favoriteMovie.genres.length > 0 && (
                          <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', fontWeight: 650, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px' }}>
                            • {favoriteMovie.genres.slice(0, 1).join(', ')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {favoriteSeries && (
              <div 
                onClick={() => handleItemClick(favoriteSeries)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleItemClick(favoriteSeries);
                  }
                }}
                tabIndex={0}
                className="tv-focusable"
                style={{
                  position: 'relative',
                  height: isMobile ? '130px' : '160px',
                  borderRadius: '20px',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                  transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                  outline: 'none'
                }}
              >
                <img
                  src={getBackdrop(favoriteSeries)}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.45 }}
                />
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'linear-gradient(to right, rgba(0,0,0,0.95) 40%, rgba(0,0,0,0.4) 80%, transparent 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  padding: isMobile ? '0 16px' : '0 24px',
                }}>
                  <div style={{ display: 'flex', gap: isMobile ? '12px' : '16px', alignItems: 'center', width: '100%' }}>
                    {favoriteSeries.posterPath && (
                      <img
                        src={getPosterUrl(favoriteSeries.posterPath, 'small')}
                        alt=""
                        style={{ width: isMobile ? '44px' : '56px', aspectRatio: '2/3', borderRadius: '8px', objectFit: 'cover', border: '1px solid rgba(255,255,255,0.15)', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}
                      />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: '0.58rem', fontWeight: 900, color: COLORS.primary, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{t('favorite_series')}</span>
                      <h3 style={{ margin: '2px 0 4px', fontSize: isMobile ? '1.05rem' : '1.2rem', fontWeight: 900, color: '#fff', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                        {favoriteSeries.title}
                      </h3>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <p style={{ margin: 0, fontSize: '0.74rem', color: 'rgba(255, 255, 255, 0.6)', fontWeight: 700 }}>
                          ⏱️ {Math.floor(favoriteSeries.watchTime / 60)}m
                        </p>
                        {favoriteSeries.genres && favoriteSeries.genres.length > 0 && (
                          <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', fontWeight: 650, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px' }}>
                            • {favoriteSeries.genres.slice(0, 1).join(', ')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Fun Comparisons equivalents */}
      {totalSeconds > 120 && (
        <div 
          tabIndex={0}
          className="tv-focusable"
          style={{
            background: 'rgba(255, 255, 255, 0.01)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            borderRadius: '20px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            outline: 'none'
          }}
        >
          <h4 style={{ margin: 0, fontSize: '0.82rem', fontWeight: 900, color: '#fff', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{t('fun_comparisons')}</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.82rem', color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span>🍿</span>
              <span>Equivalent to watching the entire <b>Lord of the Rings (Extended Edition)</b> trilogy <b>{lotrTrilogyCount}</b> times.</span>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span>✈️</span>
              <span>Equivalent to <b>{transatlanticFlightCount}</b> transatlantic flights from Paris to New York.</span>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span>📚</span>
              <span>Equivalent to the time required to read <b>{novelsReadCount}</b> average-sized novels.</span>
            </div>
          </div>
        </div>
      )}

      {/* Achievements section */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <h4 style={{ margin: 0, fontSize: '0.82rem', fontWeight: 900, color: '#fff', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{t('milestones_badges')}</h4>
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))',
          gap: '10px'
        }}>
          {achievements.map((ach) => (
            <div
              key={ach.id}
              onClick={() => {
                triggerHaptic('light');
                setSelectedAch(ach);
                setCopied(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  triggerHaptic('light');
                  setSelectedAch(ach);
                  setCopied(false);
                }
              }}
              tabIndex={0}
              style={{
                background: ach.unlocked ? 'rgba(255, 255, 255, 0.03)' : 'rgba(255, 255, 255, 0.01)',
                border: ach.unlocked ? `1px solid ${ach.glow}` : '1px solid rgba(255, 255, 255, 0.04)',
                borderRadius: '16px',
                padding: '10px 12px',
                display: 'flex',
                gap: '10px',
                alignItems: 'center',
                opacity: ach.unlocked ? 1 : 0.4,
                boxShadow: ach.unlocked ? `0 4px 16px ${ach.glow.replace('0.4', '0.08')}` : 'none',
                transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                overflow: 'hidden',
                cursor: 'pointer',
                outline: 'none'
              }}
              className="tv-focusable active-press"
            >
              <span style={{ fontSize: '1.5rem', filter: ach.unlocked ? 'none' : 'grayscale(100%)' }}>
                {ach.icon}
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 800, color: ach.unlocked ? '#fff' : 'rgba(255,255,255,0.6)' }}>
                  {ach.title}
                </div>
                <div style={{ fontSize: '0.64rem', color: 'rgba(255, 255, 255, 0.4)', fontWeight: 550, marginTop: '2px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                  {ach.description}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Weekly Activity Column Chart */}
      <div 
        tabIndex={0}
        className="tv-focusable"
        style={{
          background: 'rgba(255, 255, 255, 0.01)',
          border: '1px solid rgba(255, 255, 255, 0.05)',
          borderRadius: '20px',
          padding: isMobile ? '14px' : '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          outline: 'none'
        }}
      >
        <h4 style={{ margin: 0, fontSize: '0.82rem', fontWeight: 900, color: '#fff', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{t('weekly_activity')}</h4>
        
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          height: '140px',
          padding: '0 4px',
          gap: isMobile ? '6px' : '12px'
        }}>
          {weeklyData.map((day, dIdx) => {
            const pct = Math.max(8, Math.round((day.time / maxDayTime) * 100));
            const mins = Math.round(day.time / 60);

            return (
              <div
                key={dIdx}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  flex: 1,
                  gap: '8px',
                  height: '100%',
                  justifyContent: 'flex-end',
                  minWidth: 0
                }}
              >
                <div style={{
                  fontSize: '0.58rem',
                  fontWeight: 800,
                  color: day.time > 0 ? '#fff' : 'rgba(255,255,255,0.2)',
                  transition: 'color 0.2s',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}>
                  {mins > 0 ? `${mins}m` : ''}
                </div>
                <div style={{
                  width: '100%',
                  maxWidth: isMobile ? '14px' : '24px',
                  height: `${pct}%`,
                  background: day.time > 0 ? `linear-gradient(to top, ${COLORS.primary} 30%, #ff8c94 100%)` : 'rgba(255,255,255,0.04)',
                  borderRadius: '4px',
                  transition: 'height 0.5s ease-out, background 0.3s',
                  cursor: 'pointer',
                  boxShadow: day.time > 0 ? `0 4px 12px rgba(229, 9, 20, 0.2)` : 'none'
                }} />
                <div style={{
                  fontSize: '0.65rem',
                  fontWeight: 900,
                  color: 'rgba(255, 255, 255, 0.4)',
                  letterSpacing: '0.02em'
                }}>
                  {day.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Hourly Viewing Habits */}
      <div 
        tabIndex={0}
        className="tv-focusable"
        style={{
          background: 'rgba(255, 255, 255, 0.01)',
          border: '1px solid rgba(255, 255, 255, 0.05)',
          borderRadius: '20px',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          outline: 'none'
        }}
      >
        <h4 style={{ margin: 0, fontSize: '0.82rem', fontWeight: 900, color: '#fff', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{t('viewing_habits')}</h4>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[
            { label: '🌅 Morning (6 AM - 12 PM)', time: morning },
            { label: '☀️ Afternoon (12 PM - 6 PM)', time: afternoon },
            { label: '🌆 Evening (6 PM - 12 AM)', time: evening },
            { label: '🌌 Night (12 AM - 6 AM)', time: night }
          ].map((slot, idx) => {
            const pct = Math.round((slot.time / totalHourly) * 100);
            return (
              <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 700 }}>
                  <span>{slot.label}</span>
                  <span style={{ opacity: 0.5 }}>{pct}% ({Math.round(slot.time / 60)} mins)</span>
                </div>
                <div style={{ height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: '#ffffff', borderRadius: '10px', transition: 'width 0.6s ease-out' }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Top Genres Progress list */}
      {sortedGenres.length > 0 && (
        <div 
          tabIndex={0}
          className="tv-focusable"
          style={{
            background: 'rgba(255, 255, 255, 0.01)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            borderRadius: '20px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            outline: 'none'
          }}
        >
          <h4 style={{ margin: 0, fontSize: '0.82rem', fontWeight: 900, color: '#fff', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{t('favorite_genres')}</h4>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {sortedGenres.map((genre, gIdx) => {
              const pct = Math.round((genre.time / maxGenreTime) * 100);
              return (
                <div key={gIdx} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', fontWeight: 800 }}>
                    <span style={{ color: '#fff' }}>{genre.name}</span>
                    <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>{Math.floor(genre.time / 60)} mins</span>
                  </div>
                  <div style={{
                    height: '6px',
                    background: 'rgba(255,255,255,0.05)',
                    borderRadius: '10px',
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      width: `${pct}%`,
                      height: '100%',
                      background: `linear-gradient(to right, ${COLORS.primary}, #ff7b88)`,
                      borderRadius: '10px',
                      transition: 'width 0.8s cubic-bezier(0.16, 1, 0.3, 1)'
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent History Carousel */}
      {recentHistory.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h4 style={{ margin: 0, fontSize: '0.82rem', fontWeight: 900, color: '#fff', letterSpacing: '0.04em', textTransform: 'uppercase', paddingLeft: '4px' }}>{t('recently_watched')}</h4>
          <div style={{
            display: 'flex',
            gap: '12px',
            overflowX: 'auto',
            paddingBottom: '16px',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            WebkitOverflowScrolling: 'touch'
          }}>
            {recentHistory.map((historyItem) => {
              const completionPct = historyItem.duration > 0 ? (historyItem.progress / historyItem.duration) * 100 : 0;
              return (
                <div 
                  key={historyItem.id}
                  onClick={() => handleItemClick(historyItem)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleItemClick(historyItem);
                    }
                  }}
                  tabIndex={0}
                  className="tv-focusable"
                  style={{
                    flexShrink: 0,
                    width: '100px',
                    cursor: 'pointer',
                    position: 'relative',
                    outline: 'none',
                    borderRadius: '12px'
                  }}
                >
                  <div style={{
                    position: 'relative',
                    aspectRatio: '2/3',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    border: '1px solid rgba(255,255,255,0.08)',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    marginBottom: '8px'
                  }}>
                    {historyItem.posterPath ? (
                      <img 
                        src={getPosterUrl(historyItem.posterPath, 'small')} 
                        alt="" 
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                      />
                    ) : (
                      <div style={{ width: '100%', height: '100%', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Play size={20} style={{ opacity: 0.3, color: '#fff' }} />
                      </div>
                    )}
                    {/* Progress line indicator */}
                    {historyItem.duration > 0 && !historyItem.completed && (
                      <div style={{ position: 'absolute', bottom: '6px', left: '6px', right: '6px', height: '3px', background: 'rgba(255,255,255,0.2)', borderRadius: '2px', overflow: 'hidden' }}>
                        <div style={{ width: `${completionPct}%`, height: '100%', background: COLORS.primary }} />
                      </div>
                    )}
                    {/* Completed Badge */}
                    {historyItem.completed && (
                      <div style={{ position: 'absolute', top: '6px', right: '6px', background: '#22c55e', color: '#fff', fontSize: '8px', fontWeight: 900, padding: '2px 5px', borderRadius: '4px' }}>
                        {t('done_badge')}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'rgba(255,255,255,0.7)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' }}>
                    {historyItem.title}
                  </div>
                  {historyItem.season !== undefined && historyItem.episode !== undefined && (
                    <div style={{ fontSize: '0.62rem', fontWeight: 650, color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginTop: '2px' }}>
                      S{historyItem.season}:E{historyItem.episode}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Milestone Detail Overlay Modal */}
      {selectedAch && (
        <div
          onClick={() => setSelectedAch(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 6500,
            background: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            animation: 'fadeIn 0.2s ease-out'
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '380px',
              background: '#09090b',
              border: `1px solid ${selectedAch.unlocked ? selectedAch.glow : 'rgba(255,255,255,0.08)'}`,
              borderRadius: '24px',
              padding: '32px 24px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '20px',
              textAlign: 'center',
              position: 'relative',
              boxShadow: selectedAch.unlocked ? `0 20px 50px ${selectedAch.glow.replace('0.4', '0.15')}` : '0 20px 50px rgba(0,0,0,0.8)'
            }}
          >
            {/* Close Button */}
            <button
              onClick={() => setSelectedAch(null)}
              className="tv-focusable"
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                background: 'rgba(255,255,255,0.04)',
                border: 'none',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                cursor: 'pointer',
                outline: 'none'
              }}
            >
              <X size={16} />
            </button>

            {/* Badge Icon */}
            <div style={{
              fontSize: '5rem',
              filter: selectedAch.unlocked ? 'none' : 'grayscale(100%)',
              textShadow: selectedAch.unlocked ? `0 0 40px ${selectedAch.glow}` : 'none',
              transform: 'scale(1.1)',
            }}>
              {selectedAch.icon}
            </div>

            {/* Badge Info */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <h3 style={{ margin: 0, fontSize: '1.45rem', fontWeight: 900, color: '#fff', letterSpacing: '-0.02em' }}>
                {selectedAch.title}
              </h3>
              <span style={{
                fontSize: '0.72rem',
                fontWeight: 900,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                padding: '4px 10px',
                borderRadius: '20px',
                width: 'fit-content',
                margin: '4px auto 0',
                background: selectedAch.unlocked ? 'rgba(70,211,105,0.1)' : 'rgba(255,255,255,0.06)',
                color: selectedAch.unlocked ? '#46d369' : 'rgba(255,255,255,0.4)',
                border: selectedAch.unlocked ? '1px solid rgba(70,211,105,0.2)' : '1px solid transparent'
              }}>
                {selectedAch.unlocked ? '✓ Unlocked' : '🔒 Locked'}
              </span>
            </div>

            <p style={{ margin: 0, fontSize: '0.86rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.5, fontWeight: 500 }}>
              {selectedAch.description}
            </p>

            {selectedAch.unlocked && (
              <button
                onClick={() => {
                  triggerHaptic('medium');
                  const textToCopy = `I just unlocked the '${selectedAch.title}' milestone badge on CineMovie! ${selectedAch.icon} - ${selectedAch.description}`;
                  navigator.clipboard.writeText(textToCopy);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="tv-focusable"
                style={{
                  width: '100%',
                  background: copied ? 'rgba(70,211,105,0.15)' : '#ffffff',
                  border: copied ? '1px solid rgba(70,211,105,0.3)' : 'none',
                  color: copied ? '#46d369' : '#000000',
                  padding: '12px',
                  borderRadius: '12px',
                  fontWeight: 800,
                  fontSize: '0.86rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  transition: 'all 0.2s',
                  outline: 'none'
                }}
              >
                {copied ? <Check size={16} /> : <Share2 size={16} />}
                {copied ? 'Copied Brag Link!' : 'Share Milestone'}
              </button>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
