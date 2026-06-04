import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Movie, TVShow } from '../../../types';
import { getPosterUrl } from '../../../services/tmdb';
import { triggerHaptic } from '../../../utils/haptics';
import { MyListItem, updateListItemStatus } from '../../../services/myList';
import { MoreVertical, Check, Trash2, Clock, PlayCircle, Bookmark } from 'lucide-react';

interface MyListPageProps {
  movies: MyListItem[];
  onMovieClick: (movie: Movie | TVShow) => void;
  onRemove: (itemId: number, type: 'movie' | 'tv') => void;
  onRefresh: () => void;
}

function MyListPage({ movies, onMovieClick, onRemove, onRefresh }: MyListPageProps) {
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
        return { label: 'Completed', color: 'rgba(255,255,255,0.7)', icon: Check };
      case 'watching': 
        return { label: 'Watching', color: 'rgba(255,255,255,0.7)', icon: PlayCircle };
      case 'plan_to_watch':
      default: 
        return { label: 'Plan to Watch', color: 'rgba(255,255,255,0.7)', icon: Clock };
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '20px' }}>
          <div>
            <h1 style={{
              fontSize: '1.8rem',
              fontWeight: 800,
              color: '#fff',
              letterSpacing: '-0.03em',
              margin: '0 0 2px',
            }}>
              My List
            </h1>
            <p style={{ margin: 0, opacity: 0.35, fontSize: '0.8rem', fontWeight: 550 }}>
              {movies.length} {movies.length === 1 ? 'title' : 'titles'}
            </p>
          </div>
        </div>

        {/* Filter Capsule Bar */}
        <div style={{ 
          display: 'flex', 
          gap: '6px', 
          background: 'rgba(255,255,255,0.02)', 
          padding: '3px', 
          borderRadius: '10px', 
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
                  minWidth: '80px',
                  height: '32px',
                  background: isActive ? 'rgba(255,255,255,0.08)' : 'transparent',
                  color: isActive ? '#ffffff' : 'rgba(255,255,255,0.4)',
                  border: 'none',
                  borderRadius: '7px',
                  fontSize: '0.76rem',
                  fontWeight: isActive ? 700 : 550,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease'
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
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.05)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '14px',
              color: 'rgba(255,255,255,0.2)'
            }}>
              <Bookmark size={20} strokeWidth={1.8} />
            </div>
            <h3 style={{ color: '#fff', fontSize: '0.98rem', fontWeight: 700, marginBottom: '4px' }}>
              No titles here
            </h3>
            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.78rem', margin: 0, maxWidth: '200px', lineHeight: 1.35 }}>
              Bookmark movies or series to keep track of what to watch.
            </p>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
            gap: '16px 12px',
            paddingTop: '4px'
          }}>
            {filteredMovies.map((item) => {
              const isMovie = (item as any).title !== undefined;
              const displayTitle = isMovie ? (item as any).title : (item as any).name;
              const statusInfo = getStatusInfo(item.status);

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
                      borderRadius: '10px',
                      overflow: 'hidden',
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid rgba(255, 255, 255, 0.05)',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
                      cursor: 'pointer',
                    }}
                  >
                    <img
                      src={getPosterUrl(item.posterPath || (item as any).poster_path, 'medium')}
                      alt={displayTitle}
                      loading="lazy"
                      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                    
                    {/* Minimal subtle options indicator */}
                    <button
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        triggerHaptic('light'); 
                        setActiveItemForSheet(item); 
                      }}
                      style={{
                        position: 'absolute',
                        top: '6px',
                        right: '6px',
                        background: 'rgba(10, 10, 12, 0.75)',
                        backdropFilter: 'blur(8px)',
                        WebkitBackdropFilter: 'blur(8px)',
                        border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: '6px',
                        width: '24px',
                        height: '24px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        color: '#fff',
                        zIndex: 6
                      }}
                    >
                      <MoreVertical size={12} />
                    </button>
                  </div>

                  {/* Title & Status Info */}
                  <div style={{ marginTop: '6px', padding: '0 2px' }}>
                    <h3 
                      onClick={() => onMovieClick(item)}
                      style={{ 
                        margin: 0,
                        fontSize: '0.78rem', 
                        fontWeight: 650, 
                        color: '#fff', 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis', 
                        whiteSpace: 'nowrap',
                        cursor: 'pointer'
                      }}
                    >
                      {displayTitle}
                    </h3>
                    <p style={{ margin: '2px 0 0', fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)', fontWeight: 500 }}>
                      {statusInfo.label}
                    </p>
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
                background: 'rgba(0,0,0,0.5)',
                backdropFilter: 'blur(4px)',
                WebkitBackdropFilter: 'blur(4px)',
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
                borderTop: '1px solid rgba(255,255,255,0.06)',
                borderRadius: '16px 16px 0 0',
                padding: '16px 16px calc(20px + env(safe-area-inset-bottom, 0px))',
                zIndex: 2001,
              }}
            >
              {/* Drag bar indicator */}
              <div style={{
                width: '32px',
                height: '3px',
                background: 'rgba(255,255,255,0.12)',
                borderRadius: '1.5px',
                margin: '0 auto 12px'
              }} />

              <div style={{ marginBottom: '12px' }}>
                <h2 style={{
                  margin: 0,
                  fontSize: '1rem',
                  fontWeight: 750,
                  color: '#fff',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  {(activeItemForSheet as any).title || (activeItemForSheet as any).name}
                </h2>
              </div>

              {/* Status Section */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '12px' }}>
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
                        height: '44px',
                        background: isSelected ? 'rgba(255,255,255,0.04)' : 'transparent',
                        border: 'none',
                        borderRadius: '8px',
                        color: isSelected ? '#fff' : 'rgba(255,255,255,0.4)',
                        fontSize: '0.8rem',
                        fontWeight: isSelected ? 700 : 550,
                        cursor: 'pointer',
                        padding: '0 12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <OptIcon size={14} color={isSelected ? '#fff' : 'rgba(255,255,255,0.25)'} />
                        <span>{statusDetails.label}</span>
                      </div>
                      {isSelected && <Check size={14} color="#fff" strokeWidth={2.5} />}
                    </button>
                  );
                })}
              </div>

              <div style={{ height: '1px', background: 'rgba(255,255,255,0.05)', margin: '0 2px 10px' }} />

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
                  height: '44px',
                  background: 'rgba(239, 68, 68, 0.06)',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#ef4444',
                  fontSize: '0.8rem',
                  fontWeight: 750,
                  cursor: 'pointer',
                  padding: '0 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'background 0.15s'
                }}
              >
                <Trash2 size={14} />
                <span>Remove from List</span>
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

export default React.memo(MyListPage);
