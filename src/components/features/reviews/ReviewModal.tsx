import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ReviewService } from '../../../services/ReviewService';
import { triggerHaptic } from '../../../utils/haptics';
import { COLORS } from '../../../constants';
import { Star, Lock } from 'lucide-react';

interface ReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemId: string;
  itemTitle: string;
  onSuccess: () => void;
}

export default function ReviewModal({ isOpen, onClose, itemId, itemTitle, onSuccess }: ReviewModalProps) {
  const [rating, setRating] = useState(0);
  const [content, setContent] = useState('');
  const [spoiler, setSpoiler] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isGuest = localStorage.getItem('cinemovie_is_guest') === 'true';

  const handleSubmit = async () => {
    if (rating === 0) {
      setError('Please select a rating!');
      triggerHaptic('medium');
      return;
    }
    if (content.length < 10) {
      setError('Review is too short! (Minimum 10 characters)');
      triggerHaptic('medium');
      return;
    }

    setLoading(true);
    setError(null);
    triggerHaptic('medium');
    const success = await ReviewService.submitReview(itemId, content, rating, spoiler);
    setLoading(false);

    if (success) {
      triggerHaptic('heavy');
      onSuccess();
      onClose();
    } else {
      setError('Failed to submit review. Ensure the database migrations are applied.');
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 5000,
              background: 'rgba(0,0,0,0.8)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
            }}
          />

          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 5001,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
              padding: '16px',
            }}
          >
            {isGuest ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                style={{
                  pointerEvents: 'auto',
                  width: '100%',
                  maxWidth: '400px',
                  background: 'rgba(30, 30, 30, 0.85)',
                  backdropFilter: 'blur(30px) saturate(200%)',
                  WebkitBackdropFilter: 'blur(30px) saturate(200%)',
                  borderRadius: '24px',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  padding: '32px',
                  boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  textAlign: 'center',
                }}
              >
                <div style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '20px',
                  color: COLORS.primary || '#E2B616'
                }}>
                  <Lock size={24} />
                </div>
                <h2 style={{ margin: '0 0 8px', fontSize: '1.6rem', fontWeight: 900, letterSpacing: '-0.03em' }}>Critique Locked</h2>
                <p style={{ margin: '0 0 24px', opacity: 0.7, fontWeight: 600, fontSize: '0.92rem', lineHeight: '1.5' }}>
                  Critiques and ratings are reserved for registered users. Log in or create an account to share your thoughts on {itemTitle}!
                </p>
                
                <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
                  <button
                    onClick={onClose}
                    style={{
                      flex: 1,
                      height: '46px',
                      borderRadius: '12px',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: '#fff',
                      fontWeight: 900,
                      fontSize: '0.95rem',
                      cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      triggerHaptic('medium');
                      onClose();
                      window.dispatchEvent(new CustomEvent('navigateToLogin'));
                    }}
                    style={{
                      flex: 1.5,
                      height: '46px',
                      borderRadius: '12px',
                      background: COLORS.primary || '#E2B616',
                      border: 'none',
                      color: '#000',
                      fontWeight: 900,
                      fontSize: '0.95rem',
                      cursor: 'pointer'
                    }}
                  >
                    Login / Register
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                style={{
                  pointerEvents: 'auto',
                  width: '100%',
                  maxWidth: '420px',
                  maxHeight: '85vh',
                  background: 'rgba(30, 30, 30, 0.85)',
                  backdropFilter: 'blur(30px) saturate(200%)',
                  WebkitBackdropFilter: 'blur(30px) saturate(200%)',
                  borderRadius: '24px',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  padding: window.innerWidth <= 380 ? '20px' : '32px',
                  boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                  display: 'flex',
                  flexDirection: 'column',
                  overflowY: 'auto',
                  WebkitOverflowScrolling: 'touch',
                }}
              >
                <h2 style={{ margin: '0 0 4px', fontSize: window.innerWidth <= 380 ? '1.5rem' : '2rem', fontWeight: 900, letterSpacing: '-0.05em' }}>Critique</h2>
                <p style={{ margin: '0 0 16px', opacity: 0.6, fontWeight: 700, fontSize: '0.85rem' }}>Sharing your thoughts on {itemTitle}</p>

                <div style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: '4px', marginBottom: '8px', flexWrap: 'wrap' }}>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((star) => (
                      <button
                        key={star}
                        onClick={() => { setRating(star); setError(null); triggerHaptic('light'); }}
                        className="review-modal-star-btn"
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          padding: '2px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        <Star 
                          size={window.innerWidth <= 380 ? 18 : 20} 
                          fill={star <= rating ? COLORS.primary : 'none'} 
                          stroke={star <= rating ? COLORS.primary : 'rgba(255,255,255,0.3)'} 
                          style={{ transform: star <= rating ? 'scale(1.15)' : 'scale(1)', transition: 'all 0.2s ease' }}
                        />
                      </button>
                    ))}
                  </div>
                  <div style={{ textAlign: 'center', fontSize: '1rem', fontWeight: 900, color: COLORS.primary }}>
                    {rating > 0 ? `${rating}/10` : 'Select a rating'}
                  </div>
                </div>

                <textarea
                  placeholder="What did you think? (Minimum 10 characters)"
                  value={content}
                  onChange={(e) => { setContent(e.target.value); setError(null); }}
                  className="review-modal-textarea"
                  style={{
                    height: window.innerWidth <= 380 ? '100px' : '130px',
                    marginBottom: '16px',
                  }}
                />

                <div 
                  onClick={() => { setSpoiler(!spoiler); triggerHaptic('light'); }}
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', cursor: 'pointer' }}
                >
                  <div style={{ 
                    width: '20px', height: '20px', borderRadius: '6px', 
                    background: spoiler ? COLORS.primary : 'rgba(255,255,255,0.1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.2s ease'
                  }}>
                    {spoiler && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                  </div>
                  <span style={{ fontWeight: 800, fontSize: '0.82rem', opacity: spoiler ? 1 : 0.6 }}>CONTAINS SPOILERS</span>
                </div>

                {error && (
                  <div style={{
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                    color: '#ef4444',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    marginBottom: '16px',
                    textAlign: 'center',
                    animation: 'slideUpGlass 0.2s ease-out'
                  }}>
                    {error}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '12px' }}>
                  <button
                    onClick={onClose}
                    className="review-modal-btn-cancel"
                    style={{
                      flex: 1,
                      height: '46px',
                      borderRadius: '12px',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: '#fff',
                      fontWeight: 900,
                      fontSize: '1rem',
                      cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={loading}
                    className="review-modal-btn-submit"
                    style={{
                      flex: 2,
                      height: '46px',
                      borderRadius: '12px',
                      background: COLORS.primary,
                      border: 'none',
                      color: '#000',
                      fontWeight: 900,
                      fontSize: '1rem',
                      cursor: 'pointer',
                      opacity: loading ? 0.5 : 1
                    }}
                  >
                    {loading ? 'Submitting...' : 'Submit Critique'}
                  </button>
                </div>
              </motion.div>
            )}
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
