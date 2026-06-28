import React from 'react';
import { COLORS } from '../../../../constants';
import { triggerHaptic } from '../../../../utils/haptics';
import { t } from '../../../../utils/i18n';

interface AvatarPickerProps {
  showAvatarPicker: boolean;
  onClose: () => void;
  activeProfile: any;
  isUploading: boolean;
  isMobile: boolean;
  handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSelectAvatar: (avatarPath: string) => void;
}

export default function AvatarPicker({
  showAvatarPicker,
  onClose,
  activeProfile,
  isUploading,
  isMobile,
  handleFileUpload,
  handleSelectAvatar
}: AvatarPickerProps) {
  if (!showAvatarPicker) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.6)',
      backdropFilter: 'blur(30px) saturate(200%)',
      WebkitBackdropFilter: 'blur(30px) saturate(200%)',
      zIndex: 5000,
      display: 'flex',
      flexDirection: 'column',
      padding: 'calc(24px + env(safe-area-inset-top)) 24px 40px',
      width: '100%',
      boxSizing: 'border-box'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '2rem', fontWeight: 900, letterSpacing: '-0.05em', color: '#fff' }}>{t('profile_avatar')}</h2>
          <p style={{ margin: '4px 0 0', opacity: 0.5, fontSize: '0.9rem', fontWeight: 700, color: '#fff' }}>{t('choose_avatar')}</p>
        </div>
        <button 
          onClick={() => { triggerHaptic('light'); onClose(); }}
          aria-label="Close"
          className="avatar-picker-close-btn"
          style={{
            background: 'transparent',
            border: 'none',
            color: '#fff',
            cursor: 'pointer',
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <div style={{ marginBottom: '24px' }}>
        <label style={{ 
          display: 'block', 
          padding: '16px 20px', 
          background: '#ffffff', 
          color: '#000000', 
          borderRadius: '16px', 
          textAlign: 'center', 
          fontWeight: 900, 
          cursor: 'pointer',
          opacity: isUploading ? 0.5 : 1,
          transition: 'all 0.2s',
        }}>
          {isUploading ? t('uploading') : t('upload_custom_image')}
          <input type="file" accept="image/*" onChange={handleFileUpload} disabled={isUploading} style={{ display: 'none' }} />
        </label>
      </div>

      <div style={{ 
        flex: 1, 
        overflowY: 'auto', 
        display: 'grid', 
        gridTemplateColumns: isMobile ? 'repeat(4, 1fr)' : 'repeat(auto-fill, minmax(80px, 1fr))', 
        gap: '12px',
        paddingBottom: '40px',
        width: '100%'
      }}>
        {Array.from({ length: 67 }).map((_, i) => (
          <div
            key={i}
            onClick={() => handleSelectAvatar(`/avatars/avatar-${i + 1}.jpg`)}
            style={{
              width: '100%',
              paddingBottom: '100%',
              borderRadius: '12px',
              overflow: 'hidden',
              position: 'relative',
              cursor: 'pointer',
              border: activeProfile?.avatar === `/avatars/avatar-${i + 1}.jpg` ? `3px solid ${COLORS.primary}` : '2px solid transparent',
              boxSizing: 'border-box',
              background: 'rgba(255,255,255,0.03)'
            }}
          >
            <img 
              src={`/avatars/avatar-${i + 1}.jpg`}
              alt=""
              loading="lazy"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                pointerEvents: 'none'
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
