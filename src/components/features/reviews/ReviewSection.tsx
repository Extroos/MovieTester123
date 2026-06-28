import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ReviewService, Review } from '../../../services/ReviewService';
import { triggerHaptic } from '../../../utils/haptics';
import { COLORS } from '../../../constants';

interface ReviewSectionProps {
  itemId: string;
  type: 'movie' | 'tv';
}

export default function ReviewSection({ itemId, type }: ReviewSectionProps) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [stats, setStats] = useState({ average: 0, count: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [itemId]);

  const loadData = async () => {
    setLoading(true);
    const [reviewData, statData] = await Promise.all([
      ReviewService.getReviews(itemId),
      ReviewService.getAverageRating(itemId)
    ]);
    setReviews(reviewData);
    setStats(statData);
    setLoading(false);
  };

  const handleToggleLike = async (reviewId: string) => {
    triggerHaptic('light');
    const { success, liked } = await ReviewService.toggleReviewLike(reviewId);
    if (success) {
      setReviews(prev => prev.map(r => {
        if (r.id === reviewId) {
          return {
            ...r,
            is_liked: liked,
            likes_count: liked ? r.likes_count + 1 : r.likes_count - 1
          };
        }
        return r;
      }));
    }
  };

  if (loading) return (
    <div style={{ padding: '40px', textAlign: 'center' }}>
      <div className="spinner" style={{ margin: '0 auto' }} />
    </div>
  );

  return (
    <div style={{ padding: '40px 0', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '32px' }}>
        <div>
          <h3 style={{ margin: '0 0 8px', fontSize: '1.8rem', fontWeight: 900, letterSpacing: '-0.05em' }}>Critique & Community</h3>
          <p style={{ margin: 0, opacity: 0.6, fontWeight: 700 }}>What the Cinemovie pulse is saying.</p>
        </div>
        
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '3rem', fontWeight: 900, color: COLORS.primary, lineHeight: 1 }}>
            {stats.average > 0 ? stats.average : '—'}
          </div>
          <div style={{ fontSize: '0.8rem', fontWeight: 800, opacity: 0.5, marginTop: '4px' }}>
            CINESCORE ({stats.count} RATINGS)
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
        {reviews.length === 0 ? (
          <div style={{ 
            gridColumn: '1 / -1', 
            padding: '60px', 
            background: 'rgba(255,255,255,0.03)', 
            borderRadius: '24px', 
            textAlign: 'center',
            border: '1px dashed rgba(255,255,255,0.1)'
          }}>
            <p style={{ opacity: 0.4, margin: 0, fontWeight: 700 }}>Be the first to leave a review.</p>
          </div>
        ) : (
          reviews.map((review) => (
            <motion.div
              key={review.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                padding: '24px',
                background: 'rgba(255,255,255,0.05)',
                backdropFilter: 'blur(10px)',
                borderRadius: '24px',
                border: '1px solid rgba(255,255,255,0.08)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <img 
                    src={review.profiles?.avatar} 
                    alt="" 
                    style={{ width: '32px', height: '32px', borderRadius: '10px', objectFit: 'cover' }}
                  />
                  <div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 900 }}>{review.profiles?.name}</div>
                    <div style={{ fontSize: '0.75rem', opacity: 0.5 }}>{new Date(review.created_at).toLocaleDateString()}</div>
                  </div>
                </div>
                <div style={{ 
                  background: 'rgba(255, 255, 255, 0.15)', 
                  padding: '4px 10px', 
                  borderRadius: '8px', 
                  color: COLORS.primary,
                  fontWeight: 900,
                  fontSize: '0.9rem'
                }}>
                  {review.rating}/10
                </div>
              </div>

              <p style={{ 
                margin: '0 0 20px', 
                fontSize: '0.95rem', 
                lineHeight: 1.6, 
                color: 'rgba(255,255,255,0.8)',
                filter: review.spoiler ? 'blur(4px)' : 'none',
                transition: 'filter 0.3s ease',
                cursor: review.spoiler ? 'help' : 'default'
              }}
              onClick={(e) => {
                if (review.spoiler) {
                    (e.currentTarget as any).style.filter = 'none';
                }
              }}
              >
                {review.content}
              </p>
              
              {review.spoiler && <div style={{ fontSize: '0.75rem', color: COLORS.primary, fontWeight: 800, marginBottom: '16px' }}>SPOILER - TAP TO REVEAL</div>}

              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={() => handleToggleLike(review.id)}
                  className="review-section-like-btn"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 14px',
                    background: review.is_liked ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid',
                    borderColor: review.is_liked ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.1)',
                    borderRadius: '12px',
                    color: review.is_liked ? COLORS.primary : '#fff',
                    fontSize: '0.8rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill={review.is_liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.5">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                  </svg>
                  {review.likes_count || 0}
                </button>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
