import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Movie, TVShow } from '../../../types';
import { getPosterUrl } from '../../../services/tmdb';
import { COLORS } from '../../../constants';
import { triggerHaptic } from '../../../utils/haptics';
import { MyListItem, updateListItemStatus } from '../../../services/myList';
import { MoreVertical, Check, Trash2, Clock, PlayCircle, Bookmark } from 'lucide-react';

interface MyListPageProps {
  movies: MyListItem[];
  onMovieClick: (movie: Movie | TVShow) => void;
  onRemove: (itemId: number, type: 'movie' | 'tv') => void;
  onRefresh: () => void;
}

export default function MyListPage({ movies, onMovieClick, onRemove, onRefresh }: MyListPageProps) {
  const [filter, setFilter] = useState<'all' | 'plan_to_watch' | 'watching' | 'completed'>('all');
  const [activeItemForSheet, setActiveItemForSheet] = useState<MyListItem | null>(null);

  const filteredMovies = filter === 'all' 
    ? movies 
    : movies.filter(m => m.status === filter);

  const handleStatusChange = async (itemId: number, type: 'movie' | 'tv', newStatus: string) => {
    triggerHaptic('medium');
    const success = await updateListItemStatus(itemId, type, newStatus);
    if (success) {
      onRefresh();
    }
    setActiveItemForSheet(null);
  };

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'completed': 
        return { label: 'Completed', color: '#10b981', icon: Check, bg: 'rgba(16, 185, 129, 0.15)' };
      case 'watching': 
        return { label: 'Watching', color: '#3b82f6', icon: PlayCircle, bg: 'rgba(59, 130, 246, 0.15)' };
      case 'plan_to_watch':
      default: 
        return { label: 'Plan to Watch', color: '#a855f7', icon: Clock, bg: 'rgba(168, 85, 247, 0.15)' };
    }
  };

  return (
    <div 
      style={{
        minHeight: '100vh',
        background: '#09090b',
        paddingTop: '0px',
        paddingBottom: 'calc(100px + env(safe-area-inset-bottom))',
        overflowX: 'hidden',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
      }}
    >
      {/* Title & Filter Header */}
      <div style={{
        padding: '24px 20px 16px',
        maxWidth: '1200px',
        margin: '0 auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '24px' }}>
          <div>
            <h1 style={{
              fontSize: '2.2rem',
              fontWeight: 900,
              color: '#fff',
              letterSpacing: '-0.04em',
              margin: '0 0 4px',
            }}>
              My List
            </h1>
            <p style={{ margin: 0, opacity: 0.4, fontSize: '0.85rem', fontWeight: 600 }}>
              {movies.length} {movies.length === 1 ? 'saved title' : 'saved titles'}
            </p>
          </div>
        </div>

        {/* Filter Capsule Bar */}
        <div style={{ 
          display: 'flex', 
          gap: '6px', 
          background: 'rgba(255,255,255,0.03)', 
          padding: '4px', 
          borderRadius: '14px', 
          border: '1px solid rgba(255,255,255,0.05)', 
          overflowX: 'auto', 
          scrollbarWidth: 'none',
          marginBottom: '8px'
        }}>
          {([
            { id: 'all', label: 'All' },
            { id: 'plan_to_watch', label: 'Plan to Watch' },
            { id: 'watching', label: 'Watching' },
            { id: 'completed', label: 'Completed' }
          ] as const).map((tab) => {
            const isActive = filter === tab.id;
            return (
              <button
                key={tab.id}
                onClick={(e) => { e.stopPropagation(); triggerHaptic('light'); setFilter(tab.id); }}
                style={{
                  flex: 1,
                  minWidth: '90px',
                  height: '36px',
                  background: isActive ? '#ffffff' : 'transparent',
                  color: isActive ? '#000000' : 'rgba(255,255,255,0.5)',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '0.8rem',
                  fontWeight: isActive ? 800 : 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Grid Content */}
      <div style={{ 
        padding: '0 20px',
        maxWidth: '1200px',
        margin: '0 auto',
      }}>
        {filteredMovies.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '40vh',
            textAlign: 'center',
            padding: '40px 24px'
          }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '16px',
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.05)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '16px',
              color: 'rgba(255,255,255,0.3)'
            }}>
              <Bookmark size={24} strokeWidth={2} />
            </div>
            <h3 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 800, marginBottom: '6px', letterSpacing: '-0.01em' }}>
              List is empty
            </h3>
            <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.82rem', fontWeight: 500, margin: 0, maxWidth: '220px', lineHeight: 1.4 }}>
              Bookmark titles from their detail page to organize them here.
            </p>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
            gap: '20px 14px',
            paddingTop: '8px'
          }}>
            {filteredMovies.map((item) => {
              const isMovie = (item as any).title !== undefined;
              const displayTitle = isMovie ? (item as any).title : (item as any).name;
              const statusInfo = getStatusInfo(item.status);
              const StatusIcon = statusInfo.icon;

              return (
                <div 
                  key={`${item.id}-${item.mediaType}`} 
                  style={{ display: 'flex', flexDirection: 'column' }}
                >
                  {/* Poster Area */}
                  <div
                    onClick={() => onMovieClick(item)}
                    style={{
                      position: 'relative',
                      width: '100%',
                      paddingBottom: '148%',
                      borderRadius: '14px',
                      overflow: 'hidden',
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                      boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
                      cursor: 'pointer',
                      transition: 'transform 0.2s ease, border-color 0.2s ease'
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.transform = 'scale(1.02)';
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.transform = 'none';
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.06)';
                    }}
                  >
                    <img
                      src={getPosterUrl(item.posterPath || (item as any).poster_path, 'medium')}
                      alt={displayTitle}
                      loading="lazy"
                      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                    
                    {/* Status badge pill overlay */}
                    <div style={{
                      position: 'absolute',
                      bottom: '8px',
                      left: '8px',
                      background: 'rgba(10, 10, 12, 0.85)',
                      backdropFilter: 'blur(8px)',
                      WebkitBackdropFilter: 'blur(8px)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: '8px',
                      padding: '4px 8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      zIndex: 5
                    }}>
                      <StatusIcon size={11} color={statusInfo.color} strokeWidth={2.5} />
                      <span style={{ color: '#fff', fontSize: '0.64rem', fontWeight: 800 }}>
                        {statusInfo.label}
                      </span>
                    </div>

                    {/* Quick Options Button */}
                    <button
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        triggerHaptic('light'); 
                        setActiveItemForSheet(item); 
                      }}
                      style={{
                        position: 'absolute',
                        top: '8px',
                        right: '8px',
                        background: 'rgba(10, 10, 12, 0.8)',
                        backdropFilter: 'blur(8px)',
                        WebkitBackdropFilter: 'blur(8px)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: '8px',
                        width: '26px',
                        height: '26px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        color: '#fff',
                        zIndex: 6
                      }}
                    >
                      <MoreVertical size={14} strokeWidth={2.5} />
                    </button>
                  </div>

                  {/* Title Info */}
                  <div style={{ marginTop: '8px', padding: '0 2px' }}>
                    <h3 
                      onClick={() => onMovieClick(item)}
                      style={{ 
                        margin: 0,
                        fontSize: '0.85rem', 
                        fontWeight: 750, 
                        color: '#fff', 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis', 
                        whiteSpace: 'nowrap',
                        cursor: 'pointer'
                      }}
                    >
                      {displayTitle}
                    </h3>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modern bottom sheet options menu */}
      <AnimatePresence>
        {activeItemForSheet && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setActiveItemForSheet(null)}
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.6)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                zIndex: 2000
              }}
            />

            {/* Bottom Sheet */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              style={{
                position: 'fixed',
                bottom: 0,
                left: 0,
                right: 0,
                background: '#121214',
                borderTop: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '20px 20px 0 0',
                padding: '20px 20px calc(24px + env(safe-area-inset-bottom, 0px))',
                zIndex: 2001,
                boxShadow: '0 -8px 30px rgba(0,0,0,0.7)'
              }}
            >
              {/* Drag bar indicator */}
              <div style={{
                width: '36px',
                height: '4px',
                background: 'rgba(255,255,255,0.15)',
                borderRadius: '2px',
                margin: '0 auto 16px'
              }} />

              <div style={{ marginBottom: '16px' }}>
                <p style={{ margin: 0, opacity: 0.4, fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Manage Item
                </p>
                <h2 style={{
                  margin: '4px 0 0',
                  fontSize: '1.15rem',
                  fontWeight: 900,
                  color: '#fff',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  {(activeItemForSheet as any).title || (activeItemForSheet as any).name}
                </h2>
              </div>

              {/* Status Section */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
                {(['plan_to_watch', 'watching', 'completed'] as const).map((opt) => {
                  const isSelected = activeItemForSheet.status === opt;
                  const isMovie = (activeItemForSheet as any).title !== undefined;
                  const statusDetails = getStatusInfo(opt);
                  const OptIcon = statusDetails.icon;

                  return (
                    <button
                      key={opt}
                      onClick={() => handleStatusChange(activeItemForSheet.id, isMovie ? 'movie' : 'tv', opt)}
                      style={{
                        width: '100%',
                        height: '48px',
                        background: isSelected ? 'rgba(255,255,255,0.05)' : 'transparent',
                        border: 'none',
                        borderRadius: '12px',
                        color: isSelected ? '#fff' : 'rgba(255,255,255,0.5)',
                        fontSize: '0.85rem',
                        fontWeight: isSelected ? 800 : 600,
                        cursor: 'pointer',
                        padding: '0 16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <OptIcon size={16} color={isSelected ? statusDetails.color : 'rgba(255,255,255,0.3)'} strokeWidth={2.5} />
                        <span>{statusDetails.label}</span>
                      </div>
                      {isSelected && <Check size={16} color="#fff" strokeWidth={3} />}
                    </button>
                  );
                })}
              </div>

              <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '0 4px 12px' }} />

              {/* Remove Action */}
              <button
                onClick={() => {
                  triggerHaptic('medium');
                  const isMovie = (activeItemForSheet as any).title !== undefined;
                  onRemove(activeItemForSheet.id, isMovie ? 'movie' : 'tv');
                  setActiveItemForSheet(null);
                }}
                style={{
                  width: '100%',
                  height: '48px',
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: 'none',
                  borderRadius: '12px',
                  color: '#ef4444',
                  fontSize: '0.85rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  padding: '0 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.12)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)'}
              >
                <Trash2 size={16} strokeWidth={2.5} />
                <span>Remove from List</span>
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
