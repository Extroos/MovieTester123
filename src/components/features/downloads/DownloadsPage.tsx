import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Movie, TVShow } from '../../../types';
import { OfflineStorageService } from '../../../services/OfflineStorageService';
import { triggerHaptic } from '../../../utils/haptics';
import { COLORS } from '../../../constants';
import VideoPlayer from '../player/VideoPlayer';
import { AlertCircle, Sliders, Check } from 'lucide-react';

interface DownloadsPageProps {
  onNavigate: (view: any) => void;
}

type TabState = 'movies' | 'tv';

interface DownloadItem {
  id: string;
  title: string;
  posterPath: string;
  type: 'movie' | 'tv';
  status: 'resolving' | 'downloading' | 'completed' | 'failed';
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
  const [activeTab, setActiveTab] = useState<TabState>('movies');
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [activeShow, setActiveShow] = useState<any | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  
  const [isMobileSize, setIsMobileSize] = useState(window.innerWidth <= 380);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [selectedQuality, setSelectedQuality] = useState<'1080p' | '720p' | '480p' | '360p'>(
    (localStorage.getItem('cinemovie_download_quality') as any) || '1080p'
  );

  const handleQualityChange = (q: '1080p' | '720p' | '480p' | '360p') => {
    triggerHaptic('light');
    setSelectedQuality(q);
    localStorage.setItem('cinemovie_download_quality', q);
  };
  
  useEffect(() => {
    let resizeTimer: ReturnType<typeof setTimeout>;
    const handleResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        setIsMobileSize(window.innerWidth <= 380);
      }, 150);
    };
    window.addEventListener('resize', handleResize, { passive: true });
    return () => {
      clearTimeout(resizeTimer);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Player State
  const [showPlayer, setShowPlayer] = useState(false);
  const [playerUrl, setPlayerUrl] = useState('');
  const [playerTitle, setPlayerTitle] = useState('');
  const [playerTracks, setPlayerTracks] = useState<any[]>([]);
  const [loadingItemId, setLoadingItemId] = useState<string | null>(null);

  useEffect(() => {
    if (errorToast) {
      const timer = setTimeout(() => setErrorToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [errorToast]);

  // Load downloads
  const loadDownloads = useCallback(() => {
    const raw = localStorage.getItem('cinemovie_downloads');
    if (raw) {
      try {
        setDownloads(JSON.parse(raw));
      } catch (e) {
        console.error(e);
      }
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

  // Handle Play
  const handlePlay = async (item: DownloadItem) => {
    if (item.status !== 'completed') {
      setErrorToast(item.status === 'failed' ? 'Download failed. Please delete and retry.' : 'This video is still downloading...');
      return;
    }
    triggerHaptic('heavy');
    setLoadingItemId(item.id);
    try {
      const playableUrl = await OfflineStorageService.getPlayableUrl(item.id);
      if (playableUrl) {
        setPlayerUrl(playableUrl);
        setPlayerTitle(item.title);
        setPlayerTracks(item.subtitles || []);
        setShowPlayer(true);
      } else if (item.localUrl) {
        setPlayerUrl(item.localUrl);
        setPlayerTitle(item.title);
        setPlayerTracks(item.subtitles || []);
        setShowPlayer(true);
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

  // Handle Delete
  const handleDelete = (item: DownloadItem, e: React.MouseEvent) => {
    e.stopPropagation();
    triggerHaptic('medium');
    setDeleteConfirmationItem(item);
  };

  const confirmDelete = async () => {
    if (!deleteConfirmationItem) return;
    const itemId = deleteConfirmationItem.id;
    try {
      await OfflineStorageService.delete(itemId);
      const raw = localStorage.getItem('cinemovie_downloads');
      if (raw) {
        const list: DownloadItem[] = JSON.parse(raw);
        const updated = list.filter(item => item.id !== itemId);
        localStorage.setItem('cinemovie_downloads', JSON.stringify(updated));
        window.dispatchEvent(new CustomEvent('downloadsChanged'));
        setDownloads(updated);
        // Also update expanded activeShow episodes list if open
        if (activeShow) {
          setActiveShow((prev: any) => prev ? { ...prev, episodes: prev.episodes.filter((ep: any) => ep.id !== itemId) } : null);
        }
      }
    } catch (err) {
      console.error('Delete failed:', err);
    } finally {
      setDeleteConfirmationItem(null);
    }
  };


  // Group TV shows by series
  const tvSeriesGroups = useMemo(() => {
    const groups: Record<number, { show: TVShow, episodes: DownloadItem[] }> = {};
    
    downloads.forEach(item => {
      if (item.type === 'tv') {
        const itemData = item.data || item.metaData;
        if (itemData) {
          const showId = itemData.id;
          if (!groups[showId]) {
            groups[showId] = {
              show: itemData,
              episodes: []
            };
          }
          groups[showId].episodes.push(item);
        }
      }
    });

    return Object.values(groups);
  }, [downloads]);

  // Filtered Movie Downloads
  const movieDownloads = downloads.filter(item => item.type === 'movie');

  return (
    <div style={{
      minHeight: '100vh',
      background: '#09090b',
      color: '#fff',
      paddingTop: 'calc(80px + env(safe-area-inset-top, 0px))',
      paddingBottom: 'calc(100px + env(safe-area-inset-bottom))',
      overflowX: 'hidden'
    }}>
      {/* Editorial Header */}
      <div style={{
        padding: isMobileSize ? '16px 16px 12px' : '24px 6% 16px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
        marginBottom: isMobileSize ? '12px' : '20px'
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1 style={{
                fontSize: isMobileSize ? '1.7rem' : '2.2rem',
                fontWeight: 950,
                color: '#fff',
                lineHeight: 1.1,
                letterSpacing: '-0.04em',
                margin: 0,
              }}>
                Offline Library
              </h1>
              <button 
                onClick={() => { triggerHaptic('light'); setShowQualityMenu(!showQualityMenu); }}
                style={{
                  background: showQualityMenu ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: '#fff',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  outline: 'none'
                }}
                title="Download Settings"
              >
                <Sliders size={14} />
              </button>
            </div>
            <p style={{
              fontSize: isMobileSize ? '0.72rem' : '0.8rem',
              color: 'rgba(255, 255, 255, 0.5)',
              fontWeight: 700,
              margin: '6px 0 0',
              letterSpacing: '0.05em',
              textTransform: 'uppercase'
            }}>
              Stored locally inside the application
            </p>
          </div>
        </div>

        {showQualityMenu && (
          <div style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.05)',
            borderRadius: '12px',
            padding: '12px',
            marginBottom: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            animation: 'fadeIn 0.2s ease-out'
          }}>
            <div>
              <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '8px' }}>
                Download Quality
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                {(['1080p', '720p', '480p', '360p'] as const).map((q) => (
                  <button
                    key={q}
                    onClick={() => handleQualityChange(q)}
                    style={{
                      flex: 1,
                      height: '32px',
                      borderRadius: '8px',
                      background: selectedQuality === q ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                      border: selectedQuality === q ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid rgba(255,255,255,0.03)',
                      color: selectedQuality === q ? '#fff' : 'rgba(255,255,255,0.45)',
                      fontSize: '0.7rem',
                      fontWeight: selectedQuality === q ? 800 : 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                      textTransform: 'uppercase',
                      transition: 'all 0.15s'
                    }}
                  >
                    {selectedQuality === q && <Check size={12} />}
                    {q}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '8px' }}>
                Preferred Download Server
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                {([
                  { id: 'vidlink-pro', label: 'Vidlink Pro' },
                  { id: 'vidsrc-pm', label: 'VidSrc PM' },
                  { id: 'universal', label: 'Universal' }
                ] as const).map((srv) => {
                  const isSel = (localStorage.getItem('cinemovie_download_server') || 'vidlink-pro') === srv.id;
                  return (
                    <button
                      key={srv.id}
                      onClick={() => {
                        triggerHaptic('light');
                        localStorage.setItem('cinemovie_download_server', srv.id);
                        loadDownloads(); // Trigger state update
                      }}
                      style={{
                        flex: 1,
                        height: '32px',
                        borderRadius: '8px',
                        background: isSel ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                        border: isSel ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid rgba(255,255,255,0.03)',
                        color: isSel ? '#fff' : 'rgba(255,255,255,0.45)',
                        fontSize: '0.7rem',
                        fontWeight: isSel ? 800 : 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                        transition: 'all 0.15s'
                      }}
                    >
                      {isSel && <Check size={12} />}
                      {srv.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Tab switchers in premium capsule design */}
        <div style={{ display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.03)', padding: '4px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
          {[
            { id: 'movies', label: "Downloaded Movies" },
            { id: 'tv', label: 'Downloaded Series' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => { triggerHaptic('light'); setActiveTab(tab.id as any); }}
              style={{
                flex: 1,
                height: isMobileSize ? '34px' : '38px',
                background: activeTab === tab.id ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                color: activeTab === tab.id ? '#fff' : 'rgba(255,255,255,0.5)',
                border: activeTab === tab.id ? '1px solid rgba(255, 255, 255, 0.05)' : '1px solid transparent',
                borderRadius: '8px',
                fontSize: isMobileSize ? '0.7rem' : '0.8rem',
                fontWeight: activeTab === tab.id ? 800 : 600,
                cursor: 'pointer',
                transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                textTransform: 'uppercase',
                letterSpacing: '0.02em',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content Area */}
      <div style={{ padding: isMobileSize ? '0 12px' : '0 6%', maxWidth: '1400px', margin: '0 auto' }}>
        {activeTab === 'movies' ? (
          movieDownloads.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'rgba(255,255,255,0.4)' }}>
              No downloaded movies found on this device.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: isMobileSize ? 'repeat(auto-fill, minmax(105px, 1fr))' : 'repeat(auto-fill, minmax(130px, 1fr))', gap: isMobileSize ? '14px 10px' : '20px 16px' }}>
              {movieDownloads.map(item => (
                <div 
                  key={item.id}
                  onClick={() => handlePlay(item)}
                  className="download-card"
                  style={{
                    position: 'relative',
                    cursor: 'pointer',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    background: 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.01) 100%)',
                    border: '1px solid rgba(255,255,255,0.05)'
                  }}
                >
                  <div style={{ position: 'relative', paddingBottom: '150%' }}>
                    <img 
                      src={item.posterPath ? `https://image.tmdb.org/t/p/w342${item.posterPath}` : '/movie-placeholder.png'} 
                      alt={item.title}
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                    
                    {/* Loading overlay when opening player */}
                    {loadingItemId === item.id && (
                      <div style={{
                        position: 'absolute', inset: 0,
                        background: 'rgba(0,0,0,0.72)',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        gap: '8px', borderRadius: '12px',
                        backdropFilter: 'blur(4px)',
                        zIndex: 5,
                      }}>
                        <div style={{ width: '28px', height: '28px', border: '2.5px solid rgba(255,255,255,0.2)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                        <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Opening…</span>
                      </div>
                    )}

                    {/* Progress overlay if downloading, resolving, or failed */}
                    {item.status !== 'completed' && (
                      <div style={{
                        position: 'absolute', inset: 0,
                        background: 'rgba(0,0,0,0.72)',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        gap: '6px',
                        backdropFilter: 'blur(2px)'
                      }}>
                        {item.status === 'failed' ? (
                          <>
                            <AlertCircle size={22} color="#ef4444" />
                            <span style={{ fontSize: '0.7rem', fontWeight: 900, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Failed</span>
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

                    {/* Delete action button */}
                    <button 
                      onClick={(e) => handleDelete(item, e)}
                      style={{
                        position: 'absolute', top: '8px', right: '8px',
                        background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '8px',
                        width: '28px', height: '28px', color: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', zIndex: 10
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                  <div style={{ padding: '8px 10px' }}>
                    <h3 style={{ fontSize: '0.82rem', fontWeight: 700, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.title}
                    </h3>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          tvSeriesGroups.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'rgba(255,255,255,0.4)' }}>
              No downloaded series found on this device.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: isMobileSize ? 'repeat(auto-fill, minmax(105px, 1fr))' : 'repeat(auto-fill, minmax(130px, 1fr))', gap: isMobileSize ? '14px 10px' : '20px 16px' }}>
              {tvSeriesGroups.map(group => (
                <div 
                  key={group.show.id}
                  onClick={() => setActiveShow(group)}
                  className="download-card"
                  style={{
                    position: 'relative',
                    cursor: 'pointer',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    background: 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.01) 100%)',
                    border: '1px solid rgba(255,255,255,0.05)'
                  }}
                >
                  <div style={{ position: 'relative', paddingBottom: '150%' }}>
                    <img 
                      src={group.show.posterPath ? `https://image.tmdb.org/t/p/w342${group.show.posterPath}` : '/movie-placeholder.png'} 
                      alt={group.show.name}
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                    
                    {/* Badge showing count of downloaded episodes */}
                    <div style={{
                      position: 'absolute', top: '8px', left: '8px',
                      background: 'rgba(255,255,255,0.9)', color: '#000',
                      padding: '3px 8px', borderRadius: '6px',
                      fontSize: '0.7rem', fontWeight: 800
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
              ))}
            </div>
          )
        )}
      </div>

      {/* Expanded Series Episodes Overlay */}
      {activeShow && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 2000,
          background: '#09090b', display: 'flex', flexDirection: 'column',
          paddingTop: 'calc(12px + env(safe-area-inset-top, 0px))',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '16px',
            padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)',
            background: 'rgba(9,9,11,0.9)'
          }}>
            <button 
              onClick={() => setActiveShow(null)}
              style={{
                background: 'transparent', border: 'none', color: '#fff',
                cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center'
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6"></polyline>
              </svg>
            </button>
            <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>{activeShow.show.name}</h2>
          </div>

          {/* Episode List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {activeShow.episodes.map((ep: DownloadItem) => (
              <div 
                key={ep.id}
                onClick={() => handlePlay(ep)}
                style={{
                  display: 'flex', alignItems: 'center', gap: isMobileSize ? '10px' : '16px',
                  padding: isMobileSize ? '10px 12px' : '12px 16px', borderRadius: '12px',
                  background: loadingItemId === ep.id ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.04)',
                  cursor: loadingItemId === ep.id ? 'default' : 'pointer',
                  transition: 'background 0.15s',
                  position: 'relative',
                }}
              >
                <div style={{ width: isMobileSize ? '72px' : '80px', aspectRatio: '16/9', borderRadius: '6px', overflow: 'hidden', background: '#18181b', position: 'relative', flexShrink: 0 }}>
                  <img src={activeShow.show.backdropPath ? `https://image.tmdb.org/t/p/w300${activeShow.show.backdropPath}` : '/movie-placeholder.png'} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.2)' }}>
                    {loadingItemId === ep.id ? (
                      <div style={{ width: '22px', height: '22px', border: '2.5px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                    ) : (
                      <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'rgba(0,0,0,0.5)', border: '1.5px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z"/></svg>
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h4 style={{ margin: 0, fontSize: isMobileSize ? '0.82rem' : '0.9rem', fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {ep.title}
                  </h4>
                  {ep.status !== 'completed' && ep.status !== 'failed' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', fontSize: '0.72rem', opacity: 0.6 }}>
                      <span>{ep.status === 'resolving' ? 'Resolving link...' : 'Downloading...'}</span>
                      {ep.status === 'downloading' && ep.speed !== undefined && (
                        <span style={{ color: COLORS.primary, fontWeight: 800 }}>{ep.speed} MB/s</span>
                      )}
                      <span>({ep.progress}%)</span>
                    </div>
                  )}
                  {ep.status === 'failed' && (
                    <div style={{ color: '#ef4444', fontSize: '0.72rem', fontWeight: 700, marginTop: '4px' }}>
                      ✕ Download Failed
                    </div>
                  )}
                </div>
                <button 
                  onClick={(e) => handleDelete(ep, e)}
                  style={{
                    background: 'rgba(255,255,255,0.05)', border: 'none', borderRadius: '8px',
                    width: '32px', height: '32px', color: 'rgba(255,255,255,0.6)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer'
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Local Video Player overlay */}
      {showPlayer && (
        <VideoPlayer 
          src={playerUrl}
          title={playerTitle}
          onClose={() => setShowPlayer(false)}
          tracks={playerTracks}
          isOfflineMode={true}
        />
      )}
      {/* Delete Confirmation Bottom Drawer */}
      {deleteConfirmationItem && (
        <div
          onClick={() => setDeleteConfirmationItem(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 4000,
            background: 'rgba(0,0,0,0.72)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '520px',
              background: '#1c1c1f',
              borderRadius: '24px 24px 0 0',
              border: '1px solid rgba(255,255,255,0.08)',
              borderBottom: 'none',
              boxShadow: '0 -24px 60px rgba(0,0,0,0.7)',
              padding: '20px 20px calc(20px + env(safe-area-inset-bottom, 20px))',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            {/* Handle bar */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '4px' }}>
              <div style={{ width: '36px', height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.2)' }} />
            </div>

            <div style={{ textAlign: 'center' }}>
              <h3 style={{ margin: '0 0 8px', fontSize: '1.2rem', fontWeight: 800, color: '#fff' }}>Delete Downloaded Content?</h3>
              <p style={{ margin: 0, fontSize: '0.88rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.4 }}>
                Are you sure you want to permanently delete <strong style={{ color: '#fff' }}>{deleteConfirmationItem.title}</strong> from your device? This action cannot be undone.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
              <button
                onClick={() => setDeleteConfirmationItem(null)}
                style={{
                  flex: 1,
                  padding: '14px',
                  borderRadius: '12px',
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(255,255,255,0.05)',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                }}
              >
                Keep
              </button>
              <button
                onClick={confirmDelete}
                style={{
                  flex: 1,
                  padding: '14px',
                  borderRadius: '12px',
                  border: 'none',
                  background: '#ef4444',
                  color: '#fff',
                  fontWeight: 800,
                  fontSize: '0.95rem',
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification Banner */}
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
              left: '20px',
              right: '20px',
              margin: '0 auto',
              maxWidth: '480px',
              background: 'rgba(15, 15, 18, 0.9)',
              backdropFilter: 'blur(20px) saturate(180%)',
              WebkitBackdropFilter: 'blur(20px) saturate(180%)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '20px',
              padding: '16px 20px',
              zIndex: 9999,
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
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

export default React.memo(DownloadsPage);
