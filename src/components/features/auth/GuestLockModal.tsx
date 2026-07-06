import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock } from 'lucide-react';
import { COLORS } from '../../../constants';
import { triggerHaptic } from '../../../utils/haptics';

interface GuestLockModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description: string;
}

export default function GuestLockModal({ isOpen, onClose, title, description }: GuestLockModalProps) {
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
              zIndex: 6000,
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
              zIndex: 6001,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
              padding: '16px',
            }}
          >
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
              <h2 style={{ margin: '0 0 8px', fontSize: '1.6rem', fontWeight: 900, letterSpacing: '-0.03em', color: '#fff' }}>{title}</h2>
              <p style={{ margin: '0 0 24px', opacity: 0.7, fontWeight: 600, fontSize: '0.92rem', lineHeight: '1.5', color: '#fff' }}>
                {description}
              </p>
              
              <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
                <button
                  onClick={onClose}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onClose();
                    } else if (e.key === 'ArrowRight') {
                      e.preventDefault();
                      (e.currentTarget.nextElementSibling as HTMLElement)?.focus();
                    }
                  }}
                  className="guest-lock-modal-btn-cancel tv-focusable"
                  tabIndex={0}
                  style={{
                    flex: 1,
                    height: '46px',
                    borderRadius: '12px',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#fff',
                    fontWeight: 900,
                    fontSize: '0.95rem',
                    cursor: 'pointer',
                    outline: 'none'
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
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      triggerHaptic('medium');
                      onClose();
                      window.dispatchEvent(new CustomEvent('navigateToLogin'));
                    } else if (e.key === 'ArrowLeft') {
                      e.preventDefault();
                      (e.currentTarget.previousElementSibling as HTMLElement)?.focus();
                    }
                  }}
                  className="guest-lock-modal-btn-login tv-focusable"
                  tabIndex={0}
                  style={{
                    flex: 1.5,
                    height: '46px',
                    borderRadius: '12px',
                    background: COLORS.primary || '#E2B616',
                    border: 'none',
                    color: '#000',
                    fontWeight: 900,
                    fontSize: '0.95rem',
                    cursor: 'pointer',
                    outline: 'none'
                  }}
                >
                  Login / Register
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
