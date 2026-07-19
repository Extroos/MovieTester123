import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { TVShow } from '../../../types';
import { OfflineStorageService } from '../../../services/OfflineStorageService';
import { GlobalDownloader } from '../../../services/offline/GlobalDownloader';
import { triggerHaptic } from '../../../utils/haptics';
import { COLORS } from '../../../constants';
import VideoPlayer from '../player/VideoPlayer';
import { AlertCircle, Clock } from 'lucide-react';
import { isTVMode } from '../../../utils/tv';

interface DownloadsPageProps {
  onNavigate: (view: any) => void;
}

type TabState = 'movies' | 'tv';

interface DownloadItem {
  id: string;
  title: string;
  posterPath: string;
  type: 'movie' | 'tv';
  status: 'resolving' | 'downloading' | 'completed' | 'failed' | 'queued';
  progress: number;
  speed?: number;
  localUrl?: string;
  streamUrl?: string;
  subtitles?: any[];
  data?: any;
  metaData?: any;
  addedAt: number;
}

function DownloadsPage({ onNavigate }: DownloadsPageProps) {
  const isTV = isTVMode();
  const [activeTab, setActiveTab] = useState<TabState>('movies');
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);

  // Seed fake downloads if the device doesn't have any downloads stored offline yet
  const displayDownloads = useMemo(() => {
    if (downloads.length > 0) return downloads;
    return [
      {
        id: 'fake_wednesday_s1_e1',
        title: 'Wednesday\'s Child Is Full of Woe',
        posterPath: '/jeGv4xjTLJVok152Z472V96zvvZ.jpg',
        type: 'tv',
        status: 'completed',
        progress: 100,
        addedAt: Date.now() - 3600000 * 24,
        data: {
          id: 119051,
          name: 'Wednesday',
          backdropPath: '/iH4Go49y457gL805qK3sJ39mN1q.jpg',
          posterPath: '/jeGv4xjTLJVok152Z472V96zvvZ.jpg'
        },
        metaData: { size: 1.1 * 1024 * 1024 * 1024 }
      },
      {
        id: 'fake_wednesday_s1_e2',
        title: 'Woe Is the Loneliest Number',
        posterPath: '/jeGv4xjTLJVok152Z472V96zvvZ.jpg',
        type: 'tv',
        status: 'completed',
        progress: 100,
        addedAt: Date.now() - 3600000 * 23,
        data: {
          id: 119051,
          name: 'Wednesday',
          backdropPath: '/iH4Go49y457gL805qK3sJ39mN1q.jpg',
          posterPath: '/jeGv4xjTLJVok152Z472V96zvvZ.jpg'
        },
        metaData: { size: 0.95 * 1024 * 1024 * 1024 }
      },
      {
        id: 'fake_stranger_things_s4_e1',
        title: 'Chapter One: The Hellfire Club',
        posterPath: '/49WJfeN0mhmN6RndRI7t6pLr81z.jpg',
        type: 'tv',
        status: 'completed',
        progress: 100,
        addedAt: Date.now() - 3600000 * 12,
        data: {
          id: 66732,
          name: 'Stranger Things',
          backdropPath: '/56v2DnL5aKu7005oMs4O1uXN4rs.jpg',
          posterPath: '/49WJfeN0mhmN6RndRI7t6pLr81z.jpg'
        },
        metaData: { size: 1.4 * 1024 * 1024 * 1024 }
      },
      {
        id: 'fake_avatar_movie',
        title: 'Avatar: The Way of Water',
        posterPath: '/t6TL71Q2i26fsZ7rj6HwG7n6rjq.jpg',
        type: 'movie',
        status: 'completed',
        progress: 100,
        addedAt: Date.now(),
        metaData: {
          backdropPath: '/vL56iB0951j1Q7sK992x472mN9z.jpg',
          size: 2.4 * 1024 * 1024 * 1024
        }
      }
    ] as DownloadItem[];
  }, [downloads]);
  const [activeShow, setActiveShow] = useState<any | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [isMobileSize, setIsMobileSize] = useState(window.innerWidth <= 380);

  useEffect(() => {
    let resizeTimer: ReturnType<typeof setTimeout>;
    const handleResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => setIsMobileSize(window.innerWidth <= 380), 150);
    };
    window.addEventListener('resize', handleResize, { passive: true });
    return () => { clearTimeout(resizeTimer); window.removeEventListener('resize', handleResize); };
  }, []);

  // Player State
  const [showPlayer, setShowPlayer] = useState(false);
  const [playerUrl, setPlayerUrl] = useState('');
  const [playerTitle, setPlayerTitle] = useState('');
  const [playerTracks, setPlayerTracks] = useState<any[]>([]);
  const [loadingItemId, setLoadingItemId] = useState<string | null>(null);
  const [playerItem, setPlayerItem] = useState<any | null>(null);
  const [playerSeason, setPlayerSeason] = useState<number | undefined>(undefined);
  const [playerEpisode, setPlayerEpisode] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (errorToast) {
      const timer = setTimeout(() => setErrorToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [errorToast]);

  const loadDownloads = useCallback(() => {
    const raw = localStorage.getItem('cinemovie_downloads');
    if (raw) {
      try { setDownloads(JSON.parse(raw)); }
      catch (e) { console.error(e); }
    } else {
      setDownloads([]);
    }
  }, []);

  useEffect(() => {
    loadDownloads();
    window.addEventListener('downloadsChanged', loadDownloads, { passive: true });
    window.addEventListener('storage', loadDownloads, { passive: true });
    return () => {
      window.removeEventListener('downloadsChanged', loadDownloads);
      window.removeEventListener('storage', loadDownloads);
    };
  }, [loadDownloads]);

  const handlePlay = async (item: DownloadItem) => {
    if (item.status !== 'completed') {
      setErrorToast(item.status === 'failed' ? 'Download failed. Please delete and retry.' : 'This video is still downloading...');
      return;
    }
    triggerHaptic('heavy');
    setLoadingItemId(item.id);
    try {
      const playableUrl = await OfflineStorageService.getPlayableUrl(item.id);
      const startPlayback = (url: string) => {
        setPlayerUrl(url);
        setPlayerTitle(item.title);
        setPlayerTracks(item.subtitles || []);
        const meta = item.metaData || item.data || item;
        setPlayerItem(meta);
        if (item.type === 'tv') {
          const parts = item.id.split('_');
          if (parts.length >= 4) {
            setPlayerSeason(parseInt(parts[2]));
            setPlayerEpisode(parseInt(parts[3]));
          } else {
            setPlayerSeason(meta.season || 1);
            setPlayerEpisode(meta.episode || 1);
          }
        } else {
          setPlayerSeason(undefined);
          setPlayerEpisode(undefined);
        }
        setShowPlayer(true);
      };
      if (playableUrl) {
        startPlayback(playableUrl);
      } else if (item.localUrl) {
        startPlayback(item.localUrl);
      } else {
        setErrorToast('Could not retrieve local playable URL. Re-download might be required.');
      }
    } catch (err) {
      console.error(err);
      setErrorToast('Error loading offline player.');
    } finally {
      setLoadingItemId(null);
    }
  };

  const [deleteConfirmationItem, setDeleteConfirmationItem] = useState<DownloadItem | null>(null);
  const deleteModalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (deleteConfirmationItem) {
      setTimeout(() => {
        const keepBtn = deleteModalRef.current?.querySelector('.tv-focusable') as HTMLElement | null;
        if (keepBtn) keepBtn.focus();
      }, 80);
    }
  }, [deleteConfirmationItem]);

  const handleDelete = (item: DownloadItem, e?: React.MouseEvent | React.KeyboardEvent) => {
    if (e) { e.stopPropagation(); e.preventDefault(); }
    triggerHaptic('medium');
    setDeleteConfirmationItem(item);
  };

  const confirmDelete = async () => {
    if (!deleteConfirmationItem) return;
    const itemId = deleteConfirmationItem.id;
    try {
      GlobalDownloader.removeFromQueue(itemId);
      await OfflineStorageService.delete(itemId);
      const raw = localStorage.getItem('cinemovie_downloads');
      if (raw) {
        const list: DownloadItem[] = JSON.parse(raw);
        const updated = list.filter(item => item.id !== itemId);
        localStorage.setItem('cinemovie_downloads', JSON.stringify(updated));
        window.dispatchEvent(new CustomEvent('downloadsChanged'));
        setDownloads(updated);
        if (activeShow) {
          const remaining = activeShow.episodes.filter((ep: any) => ep.id !== itemId);
          if (remaining.length === 0) setActiveShow(null);
          else setActiveShow((prev: any) => prev ? { ...prev, episodes: remaining } : null);
        }
      }
    } catch (err) {
      console.error('Delete failed:', err);
    } finally {
      setDeleteConfirmationItem(null);
    }
  };

  const tvSeriesGroups = useMemo(() => {
    const groups: Record<number, { show: TVShow; episodes: DownloadItem[] }> = {};
    displayDownloads.forEach(item => {
      if (item.type === 'tv') {
        const itemData = item.data || item.metaData;
        if (itemData) {
          const showId = itemData.id;
          if (!groups[showId]) groups[showId] = { show: itemData, episodes: [] };
          groups[showId].episodes.push(item);
        }
      }
    });
    return Object.values(groups);
  }, [displayDownloads]);

  const movieDownloads = displayDownloads.filter(item => item.type === 'movie');

  const gridCols = `repeat(auto-fill, minmax(${isMobileSize ? 105 : 130}px, 1fr))`;

  if (isTV) {
    const totalTitles = movieDownloads.length + tvSeriesGroups.length;
    // Calculate total size
    let totalBytes = 0;
    displayDownloads.forEach(dl => {
      if (dl.metaData?.size) {
        totalBytes += dl.metaData.size;
      } else if (dl.data?.size) {
        totalBytes += dl.data.size;
      } else {
        totalBytes += dl.type === 'movie' ? 1.2 * 1024 * 1024 * 1024 : 0.45 * 1024 * 1024 * 1024;
      }
    });
    const totalSizeGB = (totalBytes / (1024 * 1024 * 1024)).toFixed(1);

    // Combine all list items
    const tvItemsList = [
      ...movieDownloads.map(m => ({ type: 'movie' as const, raw: m, key: `movie-${m.id}` })),
      ...tvSeriesGroups.map(s => ({ type: 'tv' as const, raw: s, key: `tv-${s.show.id}` }))
    ];

    return (
      <div style={{
        minHeight: '100vh',
        background: '#09090b',
        color: '#fff',
        paddingTop: '120px',
        paddingBottom: '80px',
        paddingLeft: '6%',
        paddingRight: '6%',
        boxSizing: 'border-box',
        overflowY: tvItemsList.length === 0 ? 'hidden' : 'auto'
      }}>
        {/* Header Block */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '36px',
        }}>
          <div>
            <h1 style={{
              fontSize: '3rem',
              fontWeight: 800,
              color: '#fff',
              margin: 0,
              letterSpacing: '-0.02em'
            }}>
              Library Offline
            </h1>
            <div style={{
              fontSize: '1.05rem',
              color: 'rgba(255,255,255,0.6)',
              marginTop: '8px',
              fontWeight: 500
            }}>
              {totalTitles} titles • {totalSizeGB} GB
            </div>
            <p style={{
              fontSize: '1rem',
              color: 'rgba(255,255,255,0.4)',
              margin: '16px 0 0'
            }}>
              Watch downloads on this TV without an internet connection.
            </p>
          </div>

          {/* Options button */}
          <button
            onClick={() => {
              triggerHaptic('light');
              if (window.confirm("Do you want to clear all offline downloads?")) {
                localStorage.removeItem('cinemovie_downloads');
                window.dispatchEvent(new Event('downloadsChanged'));
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                const firstCard = document.querySelector('.download-tv-card') as HTMLElement | null;
                if (firstCard) {
                  firstCard.focus();
                }
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                const activeHeaderBtn = document.querySelector('.cinemovie-header-nav-btn.active') as HTMLElement | null;
                if (activeHeaderBtn) {
                  activeHeaderBtn.focus();
                } else {
                  const firstHeaderBtn = document.querySelector('.cinemovie-header-nav-btn') as HTMLElement | null;
                  if (firstHeaderBtn) firstHeaderBtn.focus();
                }
              }
            }}
            className="tv-focusable downloads-options-btn"
            tabIndex={0}
            style={{
              background: 'transparent',
              border: '1px solid transparent',
              borderRadius: '8px',
              padding: '10px 20px',
              color: '#fff',
              fontSize: '0.9rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              outline: 'none',
              transition: 'all 0.2s ease'
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transform: 'rotate(90deg)' }}>
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
            OPTIONS
          </button>
        </div>

        {/* Content list block */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          maxWidth: '1200px',
          margin: '0 auto'
        }}>
          {tvItemsList.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '80px 20px',
              color: 'rgba(255, 255, 255, 0.4)',
              fontSize: '1.2rem'
            }}>
              No downloads stored on this device.
            </div>
          ) : (
            tvItemsList.map((item, index) => {
              const title = item.type === 'movie' ? item.raw.title : item.raw.show.name;
              const subtitle = item.type === 'movie' ? 'Movie' : (() => {
                const parts = item.raw.episodes[0].id.split('_');
                const seasonNum = parts.length >= 4 ? parts[2] : '1';
                return `Season ${seasonNum}`;
              })();

              const episodesCount = item.type === 'tv' ? item.raw.episodes.length : 1;
              
              let itemBytes = 0;
              if (item.type === 'movie') {
                itemBytes = item.raw.metaData?.size || item.raw.data?.size || 1.2 * 1024 * 1024 * 1024;
              } else {
                item.raw.episodes.forEach(ep => {
                  itemBytes += ep.metaData?.size || ep.data?.size || 0.45 * 1024 * 1024 * 1024;
                });
              }
              const itemSizeGB = (itemBytes / (1024 * 1024 * 1024)).toFixed(1);

              const details = item.type === 'movie' 
                ? `${itemSizeGB} GB` 
                : `${episodesCount} Episode${episodesCount > 1 ? 's' : ''} • ${itemSizeGB} GB`;

              const imagePath = item.type === 'movie' 
                ? (item.raw.metaData?.backdropPath || item.raw.metaData?.backdrop_path || item.raw.posterPath || '')
                : (item.raw.show.backdropPath || item.raw.show.backdrop_path || item.raw.show.posterPath || '');
              
              const getCleanUrl = (path: string) => {
                if (!path) return '/movie-placeholder.png';
                const clean = path.startsWith('/') ? path : '/' + path;
                return `https://image.tmdb.org/t/p/w500${clean}`;
              };
              const imageUrl = getCleanUrl(imagePath);

              return (
                <div
                  key={item.key}
                  onClick={() => {
                    if (item.type === 'movie') {
                      handlePlay(item.raw);
                    } else {
                      setActiveShow(item.raw);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      if (item.type === 'movie') {
                        handlePlay(item.raw);
                      } else {
                        setActiveShow(item.raw);
                      }
                    } else if (e.key === 'ArrowUp' && index === 0) {
                      e.preventDefault();
                      const optionsBtn = document.querySelector('.downloads-options-btn') as HTMLElement | null;
                      if (optionsBtn) {
                        optionsBtn.focus();
                      }
                    }
                  }}
                  className="tv-focusable download-tv-card"
                  tabIndex={0}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid rgba(255, 255, 255, 0.04)',
                    borderRadius: '12px',
                    padding: '0 24px 0 0',
                    gap: '24px',
                    cursor: 'pointer',
                    outline: 'none',
                    transition: 'all 0.2s ease-out',
                    position: 'relative',
                    height: '130px',
                    overflow: 'hidden'
                  }}
                >
                  {/* Left Widescreen Image */}
                  <div style={{
                    width: '230px',
                    height: '130px',
                    borderTopLeftRadius: '11px',
                    borderBottomLeftRadius: '11px',
                    overflow: 'hidden',
                    background: '#1a1a1a',
                    flexShrink: 0,
                    position: 'relative'
                  }}>
                    <img
                      src={imageUrl}
                      alt={title}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover'
                      }}
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  </div>

                  {/* Middle Left Info */}
                  <div style={{ flex: 1 }}>
                    <h2 style={{
                      fontSize: '1.4rem',
                      fontWeight: 800,
                      color: '#fff',
                      margin: 0
                    }}>
                      {title}
                    </h2>
                    <div style={{
                      fontSize: '0.95rem',
                      color: 'rgba(255, 255, 255, 0.5)',
                      marginTop: '4px',
                      fontWeight: 600
                    }}>
                      {subtitle}
                    </div>
                    <div style={{
                      fontSize: '0.9rem',
                      color: 'rgba(255, 255, 255, 0.4)',
                      marginTop: '6px'
                    }}>
                      {details}
                    </div>
                  </div>

                  {/* Right Icons */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '20px'
                  }}>
                    {/* Circle Checkmark Icon */}
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      background: 'rgba(255, 255, 255, 0.08)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff'
                    }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>

                    {/* Arrow Right Icon */}
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'rgba(255, 255, 255, 0.3)' }}>
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Episode details overlay */}
        {activeShow && (
          <div className="tv-modal-container" style={{
            position: 'fixed', inset: 0, zIndex: 2000,
            background: '#09090b', display: 'flex', flexDirection: 'column',
            paddingTop: '0'
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '16px',
              padding: '28px 6%',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
              background: 'rgba(9,9,11,0.95)', flexShrink: 0,
            }}>
              <button
                onClick={() => setActiveShow(null)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveShow(null); } }}
                className="tv-focusable"
                tabIndex={0}
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#fff', cursor: 'pointer',
                  padding: '10px 20px',
                  borderRadius: '10px',
                  display: 'flex', alignItems: 'center', gap: '8px',
                  fontSize: '0.9rem',
                  fontWeight: 700, outline: 'none',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
                Back
              </button>
              <h2 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800 }}>
                {activeShow.show.name}
              </h2>
            </div>

            <div style={{
              flex: 1, overflowY: 'auto',
              padding: '28px 6%',
              display: 'flex', flexDirection: 'column', gap: '24px',
            }}>
              {(() => {
                const seasonsMap: Record<number, DownloadItem[]> = {};
                activeShow.episodes.forEach((ep: DownloadItem) => {
                  const parts = ep.id.split('_');
                  const seasonNum = parts.length >= 4 ? parseInt(parts[2]) : 1;
                  if (!seasonsMap[seasonNum]) seasonsMap[seasonNum] = [];
                  seasonsMap[seasonNum].push(ep);
                });
                const sortedSeasons = Object.keys(seasonsMap).map(Number).sort((a, b) => a - b);
                return sortedSeasons.map((seasonNum) => {
                  const eps = seasonsMap[seasonNum].sort((a, b) => {
                    const partsA = a.id.split('_'); const partsB = b.id.split('_');
                    const epA = partsA.length >= 4 ? parseInt(partsA[3]) : 0;
                    const epB = partsB.length >= 4 ? parseInt(partsB[3]) : 0;
                    return epA - epB;
                  });
                  return (
                    <div key={seasonNum} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div style={{
                        fontSize: '0.85rem', fontWeight: 800,
                        color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em',
                        textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.05)',
                        paddingBottom: '6px', marginTop: '6px',
                      }}>
                        Season {seasonNum}
                      </div>
                      {eps.map((ep: DownloadItem) => {
                        const parts = ep.id.split('_');
                        const epNum = parts.length >= 4 ? parseInt(parts[3]) : 1;
                        return (
                          <EpisodeRow
                            key={ep.id}
                            ep={ep}
                            epNum={epNum}
                            isTV={true}
                            isMobileSize={false}
                            loadingItemId={loadingItemId}
                            backdropPath={activeShow.show.backdropPath}
                            onPlay={handlePlay}
                            onDelete={handleDelete}
                          />
                        );
                      })}
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}

        {/* Video Player overlay */}
        {showPlayer && (
          <VideoPlayer
            src={playerUrl}
            title={playerTitle}
            onClose={() => setShowPlayer(false)}
            tracks={playerTracks}
            isOfflineMode={true}
            item={playerItem}
            season={playerSeason}
            episode={playerEpisode}
          />
        )}

        {/* Delete Confirmation Dialog */}
        {deleteConfirmationItem && (
          <div
            onClick={() => setDeleteConfirmationItem(null)}
            className="tv-modal-container"
            style={{
              position: 'fixed', inset: 0, zIndex: 4000,
              background: 'rgba(0,0,0,0.8)',
              backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              ref={deleteModalRef}
              onClick={e => e.stopPropagation()}
              style={{
                width: '100%', maxWidth: '560px',
                background: '#1a1a1e',
                borderRadius: '20px',
                border: '1px solid rgba(255,255,255,0.1)',
                boxShadow: '0 0 80px rgba(0,0,0,0.8)',
                padding: '36px',
                display: 'flex', flexDirection: 'column', gap: '20px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <div style={{
                  width: '64px', height: '64px',
                  borderRadius: '50%', background: 'rgba(239,68,68,0.12)',
                  border: '1px solid rgba(239,68,68,0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </div>
              </div>

              <div style={{ textAlign: 'center' }}>
                <h3 style={{ margin: '0 0 10px', fontSize: '1.4rem', fontWeight: 800, color: '#fff' }}>
                  Delete Downloaded Content?
                </h3>
                <p style={{ margin: 0, fontSize: '0.95rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>
                  Permanently delete <strong style={{ color: '#fff' }}>{deleteConfirmationItem.title}</strong> from your device? This cannot be undone.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
                <button
                  onClick={() => setDeleteConfirmationItem(null)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDeleteConfirmationItem(null); }
                    if (e.key === 'ArrowRight') { e.preventDefault(); (e.currentTarget.nextElementSibling as HTMLElement)?.focus(); }
                  }}
                  className="tv-focusable"
                  tabIndex={0}
                  style={{
                    flex: 1, padding: '16px', borderRadius: '12px',
                    border: '1px solid rgba(255,255,255,0.1)',
                    background: 'rgba(255,255,255,0.05)', color: '#fff',
                    fontWeight: 700, fontSize: '1rem',
                    cursor: 'pointer', transition: 'background 0.2s', outline: 'none',
                  }}
                >
                  Keep
                </button>
                <button
                  onClick={confirmDelete}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); confirmDelete(); }
                    if (e.key === 'ArrowLeft') { e.preventDefault(); (e.currentTarget.previousElementSibling as HTMLElement)?.focus(); }
                  }}
                  className="tv-focusable"
                  tabIndex={0}
                  style={{
                    flex: 1, padding: '16px', borderRadius: '12px',
                    border: 'none', background: '#ef4444', color: '#fff',
                    fontWeight: 800, fontSize: '1rem',
                    cursor: 'pointer', transition: 'background 0.2s', outline: 'none',
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#09090b',
      color: '#fff',
      paddingTop: isTV ? '120px' : 'calc(80px + env(safe-area-inset-top, 0px))',
      paddingBottom: isTV ? '80px' : 'calc(100px + env(safe-area-inset-bottom))',
      overflowX: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: isTV ? '0 6% 28px' : (isMobileSize ? '16px 16px 12px' : '24px 6% 16px'),
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        marginBottom: isTV ? '28px' : (isMobileSize ? '12px' : '20px'),
      }}>
        <div style={{ marginBottom: '16px' }}>
          <h1 style={{
            fontSize: isTV ? '2.8rem' : (isMobileSize ? '1.7rem' : '2.2rem'),
            fontWeight: 950, color: '#fff', lineHeight: 1.1,
            letterSpacing: '-0.04em', margin: 0,
          }}>
            Offline Library
          </h1>
          <p style={{
            fontSize: isMobileSize ? '0.72rem' : '0.8rem',
            color: 'rgba(255,255,255,0.5)', fontWeight: 700,
            margin: '6px 0 0', letterSpacing: '0.05em', textTransform: 'uppercase',
          }}>
            Stored locally on this device
          </p>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex', gap: '4px',
          background: 'rgba(255,255,255,0.03)', padding: '4px',
          borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)',
          maxWidth: isTV ? '480px' : undefined,
        }}>
          {[{ id: 'movies', label: 'Movies' }, { id: 'tv', label: 'Series' }].map((tab) => (
            <button
              key={tab.id}
              onClick={() => { triggerHaptic('light'); setActiveTab(tab.id as any); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  triggerHaptic('light');
                  setActiveTab(tab.id as any);
                }
              }}
              className="tv-focusable"
              tabIndex={0}
              style={{
                flex: 1, height: isTV ? '48px' : (isMobileSize ? '34px' : '38px'),
                background: activeTab === tab.id ? 'rgba(255,255,255,0.08)' : 'transparent',
                color: activeTab === tab.id ? '#fff' : 'rgba(255,255,255,0.5)',
                border: activeTab === tab.id ? '1px solid rgba(255,255,255,0.05)' : '1px solid transparent',
                borderRadius: '8px',
                fontSize: isTV ? '1rem' : (isMobileSize ? '0.7rem' : '0.8rem'),
                fontWeight: activeTab === tab.id ? 800 : 600,
                cursor: 'pointer', transition: 'all 0.2s',
                textTransform: 'uppercase', letterSpacing: '0.02em', outline: 'none',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: isMobileSize ? '0 12px' : '0 6%', maxWidth: '1400px', margin: '0 auto' }}>
        {activeTab === 'movies' ? (
          movieDownloads.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'rgba(255,255,255,0.4)' }}>
              No downloaded movies found on this device.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: isTV ? '24px 20px' : (isMobileSize ? '14px 10px' : '20px 16px') }}>
              {movieDownloads.map(item => (
                <MovieCard
                  key={item.id}
                  item={item}
                  isTV={isTV}
                  isMobileSize={isMobileSize}
                  loadingItemId={loadingItemId}
                  onPlay={handlePlay}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )
        ) : (
          tvSeriesGroups.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'rgba(255,255,255,0.4)' }}>
              No downloaded series found on this device.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: isTV ? '24px 20px' : (isMobileSize ? '14px 10px' : '20px 16px') }}>
              {tvSeriesGroups.map(group => (
                <SeriesCard
                  key={(group.show as any).id}
                  group={group}
                  isTV={isTV}
                  isMobileSize={isMobileSize}
                  onOpen={setActiveShow}
                />
              ))}
            </div>
          )
        )}
      </div>

      {/* Episode overlay */}
      {activeShow && (
        <div className="tv-modal-container" style={{
          position: 'fixed', inset: 0, zIndex: 2000,
          background: '#09090b', display: 'flex', flexDirection: 'column',
          paddingTop: isTV ? '0' : 'calc(12px + env(safe-area-inset-top, 0px))',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '16px',
            padding: isTV ? '28px 6%' : '16px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
            background: 'rgba(9,9,11,0.95)', flexShrink: 0,
          }}>
            <button
              onClick={() => setActiveShow(null)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveShow(null); } }}
              className="tv-focusable"
              tabIndex={0}
              style={{
                background: isTV ? 'rgba(255,255,255,0.06)' : 'transparent',
                border: isTV ? '1px solid rgba(255,255,255,0.1)' : 'none',
                color: '#fff', cursor: 'pointer',
                padding: isTV ? '10px 20px' : '6px',
                borderRadius: isTV ? '10px' : '8px',
                display: 'flex', alignItems: 'center', gap: '8px',
                fontSize: isTV ? '0.9rem' : undefined,
                fontWeight: isTV ? 700 : undefined, outline: 'none',
              }}
            >
              <svg width={isTV ? 18 : 22} height={isTV ? 18 : 22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              {isTV && 'Back'}
            </button>
            <h2 style={{ margin: 0, fontSize: isTV ? '1.6rem' : '1.2rem', fontWeight: 800 }}>
              {activeShow.show.name}
            </h2>
          </div>

          <div style={{
            flex: 1, overflowY: 'auto',
            padding: isTV ? '28px 6%' : '20px',
            display: 'flex', flexDirection: 'column', gap: isTV ? '24px' : '16px',
          }}>
            {(() => {
              const seasonsMap: Record<number, DownloadItem[]> = {};
              activeShow.episodes.forEach((ep: DownloadItem) => {
                const parts = ep.id.split('_');
                const seasonNum = parts.length >= 4 ? parseInt(parts[2]) : 1;
                if (!seasonsMap[seasonNum]) seasonsMap[seasonNum] = [];
                seasonsMap[seasonNum].push(ep);
              });
              const sortedSeasons = Object.keys(seasonsMap).map(Number).sort((a, b) => a - b);
              return sortedSeasons.map((seasonNum) => {
                const eps = seasonsMap[seasonNum].sort((a, b) => {
                  const partsA = a.id.split('_'); const partsB = b.id.split('_');
                  const epA = partsA.length >= 4 ? parseInt(partsA[3]) : 0;
                  const epB = partsB.length >= 4 ? parseInt(partsB[3]) : 0;
                  return epA - epB;
                });
                return (
                  <div key={seasonNum} style={{ display: 'flex', flexDirection: 'column', gap: isTV ? '12px' : '10px' }}>
                    <div style={{
                      fontSize: isTV ? '0.85rem' : '0.78rem', fontWeight: 800,
                      color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em',
                      textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.05)',
                      paddingBottom: '6px', marginTop: '6px',
                    }}>
                      Season {seasonNum}
                    </div>
                    {eps.map((ep: DownloadItem) => {
                      const parts = ep.id.split('_');
                      const epNum = parts.length >= 4 ? parseInt(parts[3]) : 1;
                      return (
                        <EpisodeRow
                          key={ep.id}
                          ep={ep}
                          epNum={epNum}
                          isTV={isTV}
                          isMobileSize={isMobileSize}
                          loadingItemId={loadingItemId}
                          backdropPath={activeShow.show.backdropPath}
                          onPlay={handlePlay}
                          onDelete={handleDelete}
                        />
                      );
                    })}
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}

      {/* Player */}
      {showPlayer && (
        <VideoPlayer
          src={playerUrl}
          title={playerTitle}
          onClose={() => setShowPlayer(false)}
          tracks={playerTracks}
          isOfflineMode={true}
          item={playerItem}
          season={playerSeason}
          episode={playerEpisode}
        />
      )}

      {/* Delete Confirmation */}
      {deleteConfirmationItem && (
        <div
          onClick={() => setDeleteConfirmationItem(null)}
          className="tv-modal-container"
          style={{
            position: 'fixed', inset: 0, zIndex: 4000,
            background: 'rgba(0,0,0,0.8)',
            backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: isTV ? 'center' : 'flex-end',
            justifyContent: 'center',
          }}
        >
          <div
            ref={deleteModalRef}
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: isTV ? '560px' : '520px',
              background: '#1a1a1e',
              borderRadius: isTV ? '20px' : '24px 24px 0 0',
              border: '1px solid rgba(255,255,255,0.1)',
              borderBottom: isTV ? '1px solid rgba(255,255,255,0.1)' : 'none',
              boxShadow: isTV ? '0 0 80px rgba(0,0,0,0.8)' : '0 -24px 60px rgba(0,0,0,0.7)',
              padding: isTV ? '36px' : '20px 20px calc(20px + env(safe-area-inset-bottom, 20px))',
              display: 'flex', flexDirection: 'column', gap: '20px',
            }}
          >
            {!isTV && (
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '4px' }}>
                <div style={{ width: '36px', height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.2)' }} />
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div style={{
                width: isTV ? '64px' : '54px', height: isTV ? '64px' : '54px',
                borderRadius: '50%', background: 'rgba(239,68,68,0.12)',
                border: '1px solid rgba(239,68,68,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width={isTV ? 28 : 24} height={isTV ? 28 : 24} viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </div>
            </div>

            <div style={{ textAlign: 'center' }}>
              <h3 style={{ margin: '0 0 10px', fontSize: isTV ? '1.4rem' : '1.2rem', fontWeight: 800, color: '#fff' }}>
                Delete Downloaded Content?
              </h3>
              <p style={{ margin: 0, fontSize: isTV ? '0.95rem' : '0.88rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>
                Permanently delete <strong style={{ color: '#fff' }}>{deleteConfirmationItem.title}</strong> from your device? This cannot be undone.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
              <button
                onClick={() => setDeleteConfirmationItem(null)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDeleteConfirmationItem(null); }
                  if (e.key === 'ArrowRight') { e.preventDefault(); (e.currentTarget.nextElementSibling as HTMLElement)?.focus(); }
                }}
                className="tv-focusable"
                tabIndex={0}
                style={{
                  flex: 1, padding: isTV ? '16px' : '14px', borderRadius: '12px',
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(255,255,255,0.05)', color: '#fff',
                  fontWeight: 700, fontSize: isTV ? '1rem' : '0.95rem',
                  cursor: 'pointer', transition: 'background 0.2s', outline: 'none',
                }}
              >
                Keep
              </button>
              <button
                onClick={confirmDelete}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); confirmDelete(); }
                  if (e.key === 'ArrowLeft') { e.preventDefault(); (e.currentTarget.previousElementSibling as HTMLElement)?.focus(); }
                }}
                className="tv-focusable"
                tabIndex={0}
                style={{
                  flex: 1, padding: isTV ? '16px' : '14px', borderRadius: '12px',
                  border: 'none', background: '#ef4444', color: '#fff',
                  fontWeight: 800, fontSize: isTV ? '1rem' : '0.95rem',
                  cursor: 'pointer', transition: 'background 0.2s', outline: 'none',
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      <AnimatePresence>
        {errorToast && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 250 }}
            style={{
              position: 'fixed',
              bottom: 'calc(100px + env(safe-area-inset-bottom))',
              left: '20px', right: '20px', margin: '0 auto', maxWidth: '480px',
              background: 'rgba(15,15,18,0.9)',
              backdropFilter: 'blur(20px) saturate(180%)',
              WebkitBackdropFilter: 'blur(20px) saturate(180%)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: '20px', padding: '16px 20px', zIndex: 9999,
              display: 'flex', alignItems: 'center', gap: '12px',
              boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
            }}
          >
            <AlertCircle size={20} color="#ef4444" style={{ flexShrink: 0 }} />
            <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#fff', lineHeight: 1.4 }}>
              {errorToast}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Movie Card ─── */
function MovieCard({ item, isTV, isMobileSize, loadingItemId, onPlay, onDelete }: {
  item: DownloadItem;
  isTV: boolean;
  isMobileSize: boolean;
  loadingItemId: string | null;
  onPlay: (item: DownloadItem) => void;
  onDelete: (item: DownloadItem, e?: React.MouseEvent | React.KeyboardEvent) => void;
}) {
  return (
    <div
      className="download-card"
      style={{
        position: 'relative', borderRadius: '12px', overflow: 'hidden',
        background: 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.01) 100%)',
        border: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', flexDirection: 'column',
      }}
    >
      <div
        onClick={() => !isTV && onPlay(item)}
        onKeyDown={(e) => { if (!isTV && e.key === 'Enter') { e.preventDefault(); onPlay(item); } }}
        className={isTV ? undefined : 'tv-focusable'}
        tabIndex={isTV ? -1 : 0}
        style={{ position: 'relative', paddingBottom: '150%', cursor: isTV ? 'default' : 'pointer', outline: 'none' }}
      >
        <img
          src={item.posterPath ? `https://image.tmdb.org/t/p/w342${item.posterPath}` : '/movie-placeholder.png'}
          alt={item.title}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
        {loadingItemId === item.id && (
          <div style={{
            position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.72)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: '8px', backdropFilter: 'blur(4px)', zIndex: 5,
          }}>
            <div style={{ width: '28px', height: '28px', border: '2.5px solid rgba(255,255,255,0.2)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
            <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Opening…</span>
          </div>
        )}
        {item.status !== 'completed' && (
          <div style={{
            position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.72)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: '6px', backdropFilter: 'blur(2px)',
          }}>
            {item.status === 'queued' ? (
              <>
                <Clock size={20} color="rgba(255,255,255,0.6)" style={{ animation: 'pulse 1.5s infinite' }} />
                <span style={{ fontSize: '0.62rem', fontWeight: 900, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'center' }}>In Queue</span>
              </>
            ) : item.status === 'failed' ? (
              <>
                <AlertCircle size={22} color="#ef4444" />
                <span style={{ fontSize: '0.7rem', fontWeight: 900, color: '#ef4444', textTransform: 'uppercase' }}>Failed</span>
              </>
            ) : (
              <>
                <div style={{ width: '18px', height: '18px', border: '2px solid rgba(255,255,255,0.2)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                <span style={{ fontSize: '0.7rem', fontWeight: 800 }}>
                  {item.status === 'resolving' ? 'Resolving...' : `${item.progress}%`}
                </span>
                {item.status === 'downloading' && item.speed !== undefined && (
                  <span style={{ fontSize: '0.62rem', fontWeight: 800, color: COLORS.primary }}>{item.speed} MB/s</span>
                )}
              </>
            )}
          </div>
        )}
        {/* Mobile-only corner delete X */}
        {!isTV && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(item, e); }}
            className="tv-focusable"
            tabIndex={0}
            style={{
              position: 'absolute', top: '8px', right: '8px',
              background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '8px',
              width: '28px', height: '28px', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', zIndex: 10, outline: 'none',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      <div style={{ padding: '8px 10px 4px' }}>
        <h3 style={{ fontSize: '0.82rem', fontWeight: 700, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.title}
        </h3>
      </div>

      {/* TV mode: dedicated Play + Delete row */}
      {isTV && (
        <div style={{ display: 'flex', gap: '6px', padding: '6px 10px 10px' }}>
          <button
            onClick={(e) => { e.stopPropagation(); onPlay(item); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onPlay(item); }
              if (e.key === 'ArrowRight') { e.preventDefault(); (e.currentTarget.nextElementSibling as HTMLElement)?.focus(); }
            }}
            className="tv-focusable"
            tabIndex={0}
            style={{
              flex: 1, height: '38px', borderRadius: '8px',
              background: '#fff', border: 'none', color: '#000',
              fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer', outline: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="#000"><path d="M8 5v14l11-7z" /></svg>
            Play
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(item, e); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); onDelete(item, e); }
              if (e.key === 'ArrowLeft') { e.preventDefault(); (e.currentTarget.previousElementSibling as HTMLElement)?.focus(); }
            }}
            className="tv-focusable"
            tabIndex={0}
            style={{
              width: '38px', height: '38px', borderRadius: '8px',
              background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
              color: '#ef4444', cursor: 'pointer', outline: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Series Card ─── */
function SeriesCard({ group, isTV, isMobileSize, onOpen }: {
  group: { show: any; episodes: DownloadItem[] };
  isTV: boolean;
  isMobileSize: boolean;
  onOpen: (group: any) => void;
}) {
  return (
    <div
      onClick={() => onOpen(group)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(group); } }}
      className="download-card tv-focusable"
      tabIndex={0}
      style={{
        position: 'relative', cursor: 'pointer', borderRadius: '12px', overflow: 'hidden',
        background: 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.01) 100%)',
        border: '1px solid rgba(255,255,255,0.05)', outline: 'none',
      }}
    >
      <div style={{ position: 'relative', paddingBottom: '150%' }}>
        <img
          src={group.show.posterPath ? `https://image.tmdb.org/t/p/w342${group.show.posterPath}` : '/movie-placeholder.png'}
          alt={group.show.name}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
        <div style={{
          position: 'absolute', top: '8px', left: '8px',
          background: 'rgba(255,255,255,0.9)', color: '#000',
          padding: '3px 8px', borderRadius: '6px',
          fontSize: '0.7rem', fontWeight: 800,
        }}>
          {group.episodes.length} EP
        </div>
      </div>
      <div style={{ padding: '8px 10px' }}>
        <h3 style={{ fontSize: '0.82rem', fontWeight: 700, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {group.show.name}
        </h3>
      </div>
    </div>
  );
}

/* ─── Episode Row ─── */
function EpisodeRow({ ep, epNum, isTV, isMobileSize, loadingItemId, backdropPath, onPlay, onDelete }: {
  ep: DownloadItem;
  epNum: number;
  isTV: boolean;
  isMobileSize: boolean;
  loadingItemId: string | null;
  backdropPath?: string;
  onPlay: (ep: DownloadItem) => void;
  onDelete: (ep: DownloadItem, e?: React.MouseEvent | React.KeyboardEvent) => void;
}) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center',
        gap: isTV ? '20px' : (isMobileSize ? '10px' : '16px'),
        padding: isTV ? '16px 20px' : (isMobileSize ? '10px 12px' : '12px 16px'),
        borderRadius: '12px',
        background: loadingItemId === ep.id ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.04)', position: 'relative',
      }}
    >
      {/* Thumbnail (play action) */}
      <div
        onClick={() => onPlay(ep)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPlay(ep); } }}
        className="tv-focusable"
        tabIndex={0}
        style={{
          width: isTV ? '120px' : (isMobileSize ? '72px' : '80px'),
          aspectRatio: '16/9', borderRadius: '6px', overflow: 'hidden',
          background: '#18181b', position: 'relative', flexShrink: 0,
          cursor: 'pointer', outline: 'none',
        }}
      >
        <img
          src={backdropPath ? `https://image.tmdb.org/t/p/w300${backdropPath}` : '/movie-placeholder.png'}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.2)' }}>
          {loadingItemId === ep.id ? (
            <div style={{ width: '22px', height: '22px', border: '2.5px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
          ) : (
            <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'rgba(0,0,0,0.5)', border: '1.5px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z" /></svg>
            </div>
          )}
        </div>
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
          <span style={{
            fontSize: '0.66rem', fontWeight: 900,
            background: 'rgba(255,255,255,0.08)', padding: '2px 6px', borderRadius: '4px',
            color: 'rgba(255,255,255,0.7)', letterSpacing: '0.02em',
          }}>
            EP {epNum}
          </span>
          <h4 style={{ margin: 0, fontSize: isTV ? '0.95rem' : (isMobileSize ? '0.82rem' : '0.9rem'), fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {ep.title}
          </h4>
        </div>
        {ep.status !== 'completed' && ep.status !== 'failed' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', fontSize: '0.72rem', opacity: 0.6 }}>
            <span>{ep.status === 'queued' ? 'In Queue' : ep.status === 'resolving' ? 'Resolving...' : 'Downloading...'}</span>
            {ep.status === 'downloading' && ep.speed !== undefined && (
              <span style={{ color: COLORS.primary, fontWeight: 800 }}>{ep.speed} MB/s</span>
            )}
            {ep.status !== 'queued' && <span>({ep.progress}%)</span>}
          </div>
        )}
        {ep.status === 'failed' && (
          <div style={{ color: '#ef4444', fontSize: '0.72rem', fontWeight: 700, marginTop: '4px' }}>✕ Download Failed</div>
        )}
      </div>

      {/* Delete button */}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(ep, e); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); onDelete(ep, e); }
        }}
        className="tv-focusable"
        tabIndex={0}
        style={{
          background: isTV ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.05)',
          border: isTV ? '1px solid rgba(239,68,68,0.25)' : 'none',
          borderRadius: '8px',
          width: isTV ? '44px' : '32px', height: isTV ? '44px' : '32px',
          color: isTV ? '#ef4444' : 'rgba(255,255,255,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', outline: 'none', flexShrink: 0,
        }}
      >
        <svg width={isTV ? 18 : 14} height={isTV ? 18 : 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      </button>
    </div>
  );
}

export default React.memo(DownloadsPage);
