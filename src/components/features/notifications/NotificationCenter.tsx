import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { NotificationService, Notification } from '../../../services/NotificationService';
import { triggerHaptic } from '../../../utils/haptics';
import { COLORS } from '../../../constants';
import { Users, Film, Inbox, Check, Bell, Trash2 } from 'lucide-react';

interface NotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function NotificationCenter({ isOpen, onClose }: NotificationCenterProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [showConfirmClear, setShowConfirmClear] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadNotifications();
    }
  }, [isOpen]);

  const loadNotifications = async () => {
    setLoading(true);
    const data = await NotificationService.getNotifications();
    setNotifications(data);
    setLoading(false);
  };

  const handleMarkRead = async (id: string) => {
    triggerHaptic('light');
    const success = await NotificationService.markAsRead(id);
    if (success) {
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    }
  };

  const handleMarkAllRead = async () => {
    triggerHaptic('medium');
    const success = await NotificationService.markAllAsRead();
    if (success) {
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    }
  };

  const handleClearAll = () => {
    triggerHaptic('medium');
    setShowConfirmClear(true);
  };

  const executeClearAll = async () => {
    triggerHaptic('heavy');
    const success = await NotificationService.deleteAllNotifications();
    if (success) {
      setNotifications([]);
    }
    setShowConfirmClear(false);
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    triggerHaptic('heavy');
    const success = await NotificationService.deleteNotification(id);
    if (success) {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }
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
              background: 'rgba(0,0,0,0.4)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
            }}
          />

          {/* Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              bottom: 0,
              width: '100%',
              maxWidth: '400px',
              zIndex: 4001,
              background: 'rgba(20, 20, 20, 0.85)',
              backdropFilter: 'blur(25px) saturate(200%) brightness(1.1)',
              WebkitBackdropFilter: 'blur(25px) saturate(200%) brightness(1.1)',
              borderLeft: '1px solid rgba(255, 255, 255, 0.1)',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '-10px 0 40px rgba(0,0,0,0.5)',
            }}
          >
            <div style={{ padding: 'calc(24px + env(safe-area-inset-top)) 24px 20px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h2 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 900, letterSpacing: '-0.05em' }}>Inbox</h2>
                <button 
                  onClick={onClose}
                  style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', width: '40px', height: '40px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={{ margin: 0, opacity: 0.6, fontSize: '0.85rem', fontWeight: 700 }}>Stay updated with your pulse.</p>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {notifications.some(n => !n.is_read) && (
                    <button 
                      onClick={handleMarkAllRead}
                      style={{ background: 'none', border: 'none', color: COLORS.primary, fontSize: '0.85rem', fontWeight: 900, cursor: 'pointer', padding: '4px 8px' }}
                    >
                      Mark all
                    </button>
                  )}
                  {notifications.length > 0 && (
                    <button 
                      onClick={handleClearAll}
                      style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem', fontWeight: 900, cursor: 'pointer', padding: '4px 8px' }}
                    >
                      Clear all
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
              {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
                  <div className="spinner" />
                </div>
              ) : notifications.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '100px 40px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <Inbox size={48} style={{ marginBottom: '20px', opacity: 0.25, color: '#fff' }} />
                  <p style={{ fontWeight: 900, fontSize: '1.2rem', margin: '0 0 6px', color: '#fff' }}>Outer peace</p>
                  <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.4)', margin: 0 }}>No new notifications.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {notifications.map((n) => (
                    <motion.div
                      key={n.id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      onClick={() => !n.is_read && handleMarkRead(n.id)}
                      style={{
                        padding: '20px',
                        borderRadius: '20px',
                        background: n.is_read ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.08)',
                        border: '1px solid rgba(255,255,255,0.06)',
                        cursor: n.is_read ? 'default' : 'pointer',
                        position: 'relative',
                        transition: 'all 0.3s ease',
                      }}
                      whileHover={{ scale: 1.01, background: 'rgba(255,255,255,0.1)' }}
                    >
                      {!n.is_read && (
                        <div style={{ position: 'absolute', top: '24px', left: '8px', width: '6px', height: '6px', borderRadius: '50%', background: COLORS.primary }} />
                      )}
                      
                      <div style={{ display: 'flex', gap: '16px' }}>
                        <div style={{ 
                          width: '44px', height: '44px', borderRadius: '14px', 
                          background: n.type === 'friend_request' ? 'rgba(52, 152, 219, 0.15)' : 'rgba(255, 255, 255, 0.08)',
                          border: n.type === 'friend_request' ? '1px solid rgba(52, 152, 219, 0.3)' : '1px solid rgba(255,255,255,0.1)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                        }}>
                          {n.type === 'friend_request' ? (
                            <Users size={18} color="#3498db" />
                          ) : (
                            <Film size={18} color="#fff" />
                          )}
                        </div>
                        <div style={{ flex: 1 }}>
                          <h4 style={{ margin: '0 0 4px', fontSize: '1rem', fontWeight: 900, color: n.is_read ? 'rgba(255,255,255,0.6)' : '#fff' }}>{n.title}</h4>
                          <p style={{ margin: '0 0 8px', fontSize: '0.9rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.4 }}>{n.content}</p>
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, opacity: 0.3 }}>
                            {new Date(n.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <button 
                          onClick={(e) => handleDelete(e, n.id)}
                          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.2)', cursor: 'pointer', alignSelf: 'flex-start', padding: '4px' }}
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            {/* Custom Premium Confirmation Sheet */}
            <AnimatePresence>
              {showConfirmClear && (
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
                    <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900, color: '#fff', letterSpacing: '-0.02em' }}>Clear Inbox?</h3>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.4 }}>
                      Are you sure you want to clear all notifications? This action cannot be undone.
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                      onClick={() => { triggerHaptic('light'); setShowConfirmClear(false); }}
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
                      onClick={executeClearAll}
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
                      Clear All
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
