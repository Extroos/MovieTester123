import React from 'react';
import { Shield } from 'lucide-react';
import { t } from '../../../../utils/i18n';

interface ReauthModalProps {
  reauthAction: 'delete_profile' | 'delete_account' | 'change_password' | null;
  onClose: () => void;
  authProvider: string | null;
  reauthPassword: string;
  setReauthPassword: (val: string) => void;
  isVerifyingReauth: boolean;
  reauthError: string | null;
  handleVerifyReauth: (e?: React.FormEvent) => void;
}

export default function ReauthModal({
  reauthAction,
  onClose,
  authProvider,
  reauthPassword,
  setReauthPassword,
  isVerifyingReauth,
  reauthError,
  handleVerifyReauth
}: ReauthModalProps) {
  if (!reauthAction) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 5600,
        background: 'rgba(0,0,0,0.85)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '400px',
          background: '#09090b',
          borderRadius: '24px',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
          padding: '28px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
          animation: 'fadeIn 0.2s ease-out',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            color: '#ef4444'
          }}>
            <Shield size={22} />
          </div>
          <h3 style={{ margin: '0 0 8px', fontSize: '1.2rem', fontWeight: 900, color: '#fff', letterSpacing: '-0.02em' }}>
            {t('verify_identity')}
          </h3>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.4 }}>
            {reauthAction === 'change_password' 
              ? t('verify_desc_password')
              : t('verify_desc_action')}
          </p>
        </div>

        <form onSubmit={handleVerifyReauth} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {(authProvider || 'email') === 'email' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.72rem', fontWeight: 800, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {t('current_password')}
              </label>
              <input
                type="password"
                autoFocus
                placeholder={t('enter_password')}
                value={reauthPassword}
                onChange={(e) => setReauthPassword(e.target.value)}
                disabled={isVerifyingReauth}
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '12px',
                  padding: '12px 14px',
                  color: '#fff',
                  fontSize: '0.9rem',
                  outline: 'none',
                  transition: 'border 0.2s',
                }}
              />
            </div>
          ) : (
            <div style={{
              padding: '12px',
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '12px',
              fontSize: '0.85rem',
              color: 'rgba(255,255,255,0.7)',
              textAlign: 'center'
            }}>
              {t('signed_in_google')}
            </div>
          )}

          {reauthError && (
            <div style={{ color: '#ef4444', fontSize: '0.8rem', fontWeight: 600, textAlign: 'center' }}>
              {reauthError}
            </div>
          )}

          <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isVerifyingReauth}
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.04)',
                color: '#fff',
                fontWeight: 800,
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              disabled={isVerifyingReauth}
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: '12px',
                border: 'none',
                background: '#ffffff',
                color: '#000000',
                fontWeight: 900,
                fontSize: '0.85rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {isVerifyingReauth ? t('verifying') : t('confirm')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
