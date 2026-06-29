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

        {/* Coming Soon Notice (Minimalist Centered Typography) */}
        <div style={{
          margin: isMobileSize ? '100px 24px' : '140px auto',
          maxWidth: '480px',
          textAlign: 'center',
        }}>
          <h2 style={{
            fontSize: '1.25rem',
            fontWeight: 800,
            color: '#fff',
            margin: '0 0 10px',
            letterSpacing: '-0.02em'
          }}>
            Offline Downloads Coming Soon
          </h2>
          <p style={{
            fontSize: '0.85rem',
            lineHeight: '1.6',
            color: 'rgba(255,255,255,0.4)',
            margin: 0,
            fontWeight: 500
          }}>
            Offline library and video downloads are currently undergoing performance optimizations. This feature will be fully active in the next update (version 0.8.0).
          </p>
        </div>
      </div>
      
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
