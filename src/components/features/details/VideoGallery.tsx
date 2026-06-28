import React from 'react';
import { Video } from '../../../types';
import { COLORS } from '../../../constants';
import { triggerHaptic } from '../../../utils/haptics';

interface VideoGalleryProps {
  videos: Video[];
  onVideoClick: (video: Video) => void;
}

const VideoGallery = React.memo(function VideoGallery({ videos, onVideoClick }: VideoGalleryProps) {
  if (!videos || videos.length === 0) return null;

  // Filter to show interesting videos
  const galleryVideos = React.useMemo(() => {
    return videos.filter(v => 
      v.site === 'YouTube' && 
      (v.type === 'Trailer' || v.type === 'Teaser' || v.type === 'Clip')
    );
  }, [videos]);

  if (galleryVideos.length <= 1) return null; // Already shown in hero or too few

  return (
    <div style={{ marginTop: '40px', marginBottom: '40px' }}>
      <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={COLORS.primary} strokeWidth="2.5">
          <polygon points="23 7 16 12 23 17 23 7"></polygon>
          <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
        </svg>
        Trailers & Clips
      </h3>
      
      <div style={{ 
        display: 'flex', 
        gap: '16px', 
        overflowX: 'auto', 
        paddingBottom: '16px',
        scrollSnapType: 'x mandatory',
        WebkitOverflowScrolling: 'touch',
        msOverflowStyle: 'none',
        scrollbarWidth: 'none'
      }} className="hide-scrollbar">
        {galleryVideos.map((video) => (
          <div 
            key={video.id}
            onClick={() => {
              import('../../../utils/haptics').then(m => m.triggerHaptic('light'));
              onVideoClick(video);
            }}
            style={{ 
              flex: '0 0 240px',
              cursor: 'pointer',
              scrollSnapAlign: 'start'
            }}
          >
            <div 
              className="video-gallery-card-inner"
              style={{ 
                position: 'relative',
                aspectRatio: '16/9',
                borderRadius: '16px',
                overflow: 'hidden',
                background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.07) 0%, rgba(255, 255, 255, 0.02) 100%)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                boxShadow: 'inset 0 1px 1px rgba(255, 255, 255, 0.1), 0 4px 12px rgba(0, 0, 0, 0.3)',
                marginBottom: '10px',
              }}
            >
              <img 
                src={`https://img.youtube.com/vi/${video.key}/mqdefault.jpg`}
                alt={video.name}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
              <div style={{ 
                position: 'absolute', inset: 0, 
                background: 'rgba(0,0,0,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: 1, transition: 'opacity 0.2s'
              }}>
                <div style={{ 
                  width: '40px', height: '40px', 
                  borderRadius: '50%', background: 'rgba(255, 255, 255, 0.9)', 
                  display: 'flex', alignItems: 'center', justifyContent: 'center' 
                }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="#000"><path d="M8 5v14l11-7z"/></svg>
                </div>
              </div>
            </div>
            <div style={{ fontSize: '0.85rem', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'rgba(255,255,255,0.9)' }}>
              {video.name}
            </div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: COLORS.primary, opacity: 0.8, marginTop: '2px', textTransform: 'uppercase' }}>
              {video.type}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

export default VideoGallery;
