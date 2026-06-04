import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { triggerHaptic } from '../../../utils/haptics';
import { COLORS } from '../../../constants';
import type { Movie, TVShow } from '../../../types';
import { Trash2, DownloadCloud, AlertTriangle } from 'lucide-react';

interface DownloadItem {
  id: string;
  title: string;
  posterPath: string | null;
  type: 'movie' | 'tv';
  status: 'resolving' | 'downloading' | 'completed' | 'failed';
  progress: number;
  speed?: number;
  streamUrl?: string;
  subtitles?: any[];
  data: Movie | TVShow | any;
  addedAt: number;
}

interface DownloadCenterProps {
  isOpen: boolean;
  onClose: () => void;
  onItemClick: (item: any) => void;
}

const NO_POSTER_SVG = (
  <svg viewBox="0 0 92 138" style={{ width: '100%', height: '100%', fill: '#1f1f23' }}>
    <rect width="92" height="138" rx="8" />
    <path d="M46 50 a12 12 0 1 0 0 24 a12 12 0 1 0 0 -24 M30 85 c0 -15 32 -15 32 0" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="4" strokeLinecap="round" />
  </svg>
);

export default function DownloadCenter({ isOpen, onClose, onItemClick }: DownloadCenterProps) {
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadDownloads();
      window.addEventListener('downloadsChanged', loadDownloads, { passive: true });
      window.addEventListener('storage', loadDownloads, { passive: true });
      return () => {
        window.removeEventListener('downloadsChanged', loadDownloads);
        window.removeEventListener('storage', loadDownloads);
      };
    }
  }, [isOpen]);

  const loadDownloads = () => {
    const raw = localStorage.getItem('cinemovie_downloads');
    if (raw) {
      try {
        setDownloads(JSON.parse(raw));
      } catch (e) {
        console.error('Failed to parse downloads:', e);
      }
    } else {
      setDownloads([]);
    }
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    triggerHaptic('medium');
    setDeleteTargetId(id);
  };

  const executeDelete = () => {
    if (!deleteTargetId) return;
    triggerHaptic('heavy');
    
    const raw = localStorage.getItem('cinemovie_downloads');
    if (raw) {
      try {
        const list: DownloadItem[] = JSON.parse(raw);
        const updated = list.filter(item => item.id !== deleteTargetId);
        localStorage.setItem('cinemovie_downloads', JSON.stringify(updated));
        window.dispatchEvent(new CustomEvent('downloadsChanged'));
        setDownloads(updated);
      } catch (e) {
        console.error('Failed to delete download:', e);
      }
    }
    setDeleteTargetId(null);
  };

  const getDeleteTargetTitle = () => {
    const target = downloads.find(d => d.id === deleteTargetId);
    return target ? target.title : '';
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 4000,
              background: 'rgba(0,0,0,0.5)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
            }}
          />

          {/* Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 26, stiffness: 220 }}
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              bottom: 0,
              width: '100%',
              maxWidth: '420px',
              zIndex: 4001,
              background: 'rgba(15, 15, 15, 0.9)',
              backdropFilter: 'blur(30px) saturate(190%) brightness(1.05)',
              WebkitBackdropFilter: 'blur(30px) saturate(190%) brightness(1.05)',
              borderLeft: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '-12px 0 45px rgba(0,0,0,0.6)',
            }}
          >
            <div style={{ padding: 'calc(24px + env(safe-area-inset-top)) 24px 20px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h2 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 950, letterSpacing: '-0.04em' }}>Offline Library</h2>
                <button 
                  onClick={onClose}
                  style={{ 
                    background: 'rgba(255,255,255,0.06)', 
                    border: 'none', 
                    color: '#fff', 
                    width: '38px', 
                    height: '38px', 
                    borderRadius: '50%', 
                    cursor: 'pointer', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    transition: 'background 0.2s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
              </div>
              <p style={{ margin: 0, opacity: 0.4, fontSize: '0.82rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Your offline movies & series
              </p>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px', position: 'relative' }}>
              {downloads.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '120px 40px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <DownloadCloud size={48} style={{ marginBottom: '20px', opacity: 0.2, color: '#fff' }} />
                  <p style={{ fontWeight: 900, fontSize: '1.2rem', margin: '0 0 6px', color: '#fff' }}>Your shelf is empty</p>
                  <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.4)', lineHeight: 1.5, maxWidth: '240px', margin: '0 auto' }}>
                    Tap the download icon on any detail page to save it for offline watching.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {downloads.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => { triggerHaptic('light'); onItemClick(item.data); onClose(); }}
                      style={{
                        padding: '14px',
                        borderRadius: '16px',
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.05)',
                        cursor: 'pointer',
                        position: 'relative',
                        transition: 'all 0.2s ease',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'; }}
                    >
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <div style={{ width: '56px', aspectRatio: '2/3', borderRadius: '8px', overflow: 'hidden', background: '#111', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {item.posterPath ? (
                            <img
                              src={`https://image.tmdb.org/t/p/w92${item.posterPath}`}
                              alt=""
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                          ) : (
                            NO_POSTER_SVG
                          )}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <h4 style={{ margin: '0 0 4px', fontSize: '0.95rem', fontWeight: 800, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.title}
                          </h4>
                          
                          {item.status === 'completed' ? (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(34,197,94,0.1)', color: '#22c55e', padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 800 }}>
                              ✓ Available Offline
                            </div>
                          ) : item.status === 'failed' ? (
                            <div style={{ color: '#ef4444', fontSize: '0.75rem', fontWeight: 700 }}>
                              ✕ Download Failed
                            </div>
                          ) : (
                            <div style={{ width: '100%', marginTop: '6px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', fontWeight: 700, opacity: 0.5, marginBottom: '4px' }}>
                                <span>{item.status === 'resolving' ? 'Resolving link...' : 'Downloading...'}</span>
                                <span style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                  {item.status === 'downloading' && item.speed !== undefined && (
                                    <span style={{ color: COLORS.primary, fontWeight: 800 }}>{item.speed} MB/s</span>
                                  )}
                                  <span>{item.progress}%</span>
                                </span>
                              </div>
                              <div style={{ height: '3px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                                <div style={{ width: `${item.progress}%`, height: '100%', background: COLORS.primary, transition: 'width 0.3s ease' }} />
                              </div>
                            </div>
                          )}
                        </div>
                        <button 
                          onClick={(e) => handleDelete(e, item.id)}
                          style={{ 
                            background: 'transparent', 
                            border: 'none', 
                            color: 'rgba(255,255,255,0.3)', 
                            cursor: 'pointer', 
                            padding: '8px', 
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s'
                          }}
                          onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; }}
                          onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.3)'; e.currentTarget.style.background = 'transparent'; }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Custom Bottom confirmation sheet */}
            <AnimatePresence>
              {deleteTargetId && (
                <motion.div
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '100%' }}
                  transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    background: '#121214',
                    borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '24px 24px 0 0',
                    padding: '24px 24px calc(24px + env(safe-area-inset-top))',
                    zIndex: 4002,
                    boxShadow: '0 -10px 40px rgba(0,0,0,0.8)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '16px'
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900, color: '#fff', letterSpacing: '-0.02em' }}>Delete Download?</h3>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.4 }}>
                      Are you sure you want to remove <strong style={{ color: '#fff' }}>{getDeleteTargetTitle()}</strong> from your offline library?
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                      onClick={() => { triggerHaptic('light'); setDeleteTargetId(null); }}
                      style={{
                        flex: 1,
                        padding: '12px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '14px',
                        color: '#fff',
                        fontSize: '0.9rem',
                        fontWeight: 800,
                        cursor: 'pointer'
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={executeDelete}
                      style={{
                        flex: 1,
                        padding: '12px',
                        background: '#e11d48',
                        border: 'none',
                        borderRadius: '14px',
                        color: '#fff',
                        fontSize: '0.9rem',
                        fontWeight: 900,
                        cursor: 'pointer',
                        boxShadow: '0 4px 16px rgba(225, 29, 72, 0.3)'
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
