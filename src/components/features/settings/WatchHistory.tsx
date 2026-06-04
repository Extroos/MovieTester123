import React, { useState, useEffect } from 'react';
import { WatchProgress, WatchProgressService } from '../../../services/progress';
import { getPosterUrl } from '../../../services/tmdb';
import { COLORS } from '../../../constants';
import { triggerHaptic } from '../../../utils/haptics';

interface WatchHistoryProps {
  onItemClick: (item: any) => void;
}

export default function WatchHistory({ onItemClick }: WatchHistoryProps) {
  const [history, setHistory] = useState<WatchProgress[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadHistory = async () => {
      setLoading(true);
      const data = await WatchProgressService.getWatchHistory(0, 30);
      setHistory(data);
      setLoading(false);
    };
    loadHistory();
  }, []);

  if (loading) return null;
  if (history.length === 0) return null;

  return (
    <section style={{ marginBottom: '40px' }}>
      <h2 style={{ 
        fontSize: '0.8rem', 
        textTransform: 'uppercase', 
        color: 'rgba(255,255,255,0.4)', 
        letterSpacing: '0.15em', 
        fontWeight: 900,
        marginBottom: '16px',
        paddingLeft: '8px'
      }}>Watch History</h2>
      
      <div style={{
        display: 'flex',
        gap: '12px',
        overflowX: 'auto',
        paddingBottom: '12px',
        msOverflowStyle: 'none',
        scrollbarWidth: 'none',
        WebkitOverflowScrolling: 'touch'
      }}>
        {history.map((item) => (
          <div 
            key={`${item.type}-${item.itemId}`}
            onClick={() => { triggerHaptic('light'); onItemClick(item.data); }}
            style={{
              flexShrink: 0,
              width: '110px',
              cursor: 'pointer',
              position: 'relative'
            }}
          >
            <div style={{
              position: 'relative',
              aspectRatio: '2/3',
              borderRadius: '12px',
              overflow: 'hidden',
              background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.07) 0%, rgba(255, 255, 255, 0.02) 100%)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              boxShadow: 'inset 0 1px 1px rgba(255, 255, 255, 0.1), 0 4px 12px rgba(0, 0, 0, 0.3)',
              marginBottom: '6px',
              transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.05)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.18)';
              e.currentTarget.style.boxShadow = 'inset 0 1px 1px rgba(255, 255, 255, 0.15), 0 8px 20px rgba(0, 0, 0, 0.5)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
              e.currentTarget.style.boxShadow = 'inset 0 1px 1px rgba(255, 255, 255, 0.1), 0 4px 12px rgba(0, 0, 0, 0.3)';
            }}
            >
              <img 
                src={getPosterUrl(item.data.posterPath || item.data.poster_path, 'small')} 
                alt={item.data.title || item.data.name}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
              
              {/* Progress Bar Overlay */}
              {item.duration > 0 && (
                <div style={{
                  position: 'absolute',
                  bottom: '6px',
                  left: '6px',
                  right: '6px',
                  height: '3px',
                  background: 'rgba(255,255,255,0.2)',
                  borderRadius: '2px',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    width: `${(item.progress / item.duration) * 100}%`,
                    height: '100%',
                    background: COLORS.primary
                  }} />
                </div>
              )}
            </div>
            <div style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              color: 'rgba(255,255,255,0.6)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              textAlign: 'center'
            }}>
              {item.data.title || item.data.name}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
