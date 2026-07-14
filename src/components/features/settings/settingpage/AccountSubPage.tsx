import React, { useState } from 'react';
import { Shield, Key, Database, AlertTriangle } from 'lucide-react';
import { SettingRow } from './SettingsRow';
import { t } from '../../../../utils/i18n';

interface AccountSubPageProps {
  currentUser: any;
  authProvider: string | null;
  isMobile: boolean;
  activeProfile: any;
  newPassword: string;
  setNewPassword: (val: string) => void;
  confirmNewPassword: string;
  setConfirmNewPassword: (val: string) => void;
  showPasswordChangeForm: boolean;
  setShowPasswordChangeForm: (val: boolean) => void;
  handleClearHistory: () => void;
  handleClearSearchHistory: () => void;
  handleDeleteProfile: () => void;
  handleDeleteAccount: () => void;
  setReauthAction: (action: 'delete_profile' | 'delete_account' | 'change_password' | null) => void;
  showToast: (msg: string) => void;
  triggerHaptic: (type: 'light' | 'medium' | 'heavy') => void;
  onLogout: () => void;
  sectionHeaderStyle: () => React.CSSProperties;
}

export default function AccountSubPage({
  currentUser,
  authProvider,
  isMobile,
  activeProfile,
  newPassword,
  setNewPassword,
  confirmNewPassword,
  setConfirmNewPassword,
  showPasswordChangeForm,
  setShowPasswordChangeForm,
  handleClearHistory,
  handleClearSearchHistory,
  handleDeleteProfile,
  handleDeleteAccount,
  setReauthAction,
  showToast,
  triggerHaptic,
  onLogout,
  sectionHeaderStyle
}: AccountSubPageProps) {
  const isGuest = localStorage.getItem('cinemovie_is_guest') === 'true';
  const [passFocus1, setPassFocus1] = useState(false);
  const [passFocus2, setPassFocus2] = useState(false);

  return (
    <>
      {isGuest ? (
        <div style={{
          padding: '16px',
          background: 'rgba(239, 68, 68, 0.08)',
          border: '1px solid rgba(239, 68, 68, 0.2)',
          borderRadius: '16px',
          marginBottom: '20px',
          marginTop: '8px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Shield size={18} style={{ color: '#ef4444', flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#fff' }}>{t('guest_mode')}</div>
              <div style={{ fontSize: '0.72rem', color: 'rgba(255, 255, 255, 0.5)', marginTop: '2px' }}>
                {t('guest_mode_desc')}
              </div>
            </div>
          </div>
          <button
            onClick={() => { triggerHaptic('heavy'); onLogout(); }}
            style={{
              background: '#ffffff',
              color: '#000000',
              border: 'none',
              borderRadius: '10px',
              padding: '10px 16px',
              fontSize: '0.8rem',
              fontWeight: 800,
              cursor: 'pointer',
              width: '100%',
              textAlign: 'center'
            }}
          >
            {t('connect_register')}
          </button>
        </div>
      ) : (
        <>
          <div style={sectionHeaderStyle()}>{t('connected_profile')}</div>
          <SettingRow 
            label={t('account_email')} 
            sub={currentUser?.email || t('syncing_account')} 
            isMobile={isMobile}
          >
            <span style={{
              padding: '4px 10px',
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '6px',
              fontSize: '0.7rem',
              fontWeight: 800,
              textTransform: 'uppercase',
              color: '#fff'
            }}>
              {authProvider || t('email_address')}
            </span>
          </SettingRow>

          <div style={sectionHeaderStyle()}>{t('security')}</div>
          <SettingRow 
            label={t('update_password')} 
            sub={t('update_password_desc')} 
            isMobile={isMobile}
            stackOnMobile={showPasswordChangeForm}
          >
            {(authProvider || 'email') === 'email' ? (
              <button
                onClick={() => {
                  triggerHaptic('light');
                  setShowPasswordChangeForm(!showPasswordChangeForm);
                }}
                tabIndex={0}
                className="tv-focusable"
                style={{
                  background: showPasswordChangeForm ? 'rgba(255,255,255,0.08)' : '#ffffff',
                  border: showPasswordChangeForm ? '1px solid rgba(255,255,255,0.15)' : 'none',
                  color: showPasswordChangeForm ? '#ffffff' : '#000000',
                  padding: '8px 14px',
                  borderRadius: '8px',
                  fontSize: '0.75rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  outline: 'none'
                }}
              >
                {showPasswordChangeForm ? t('cancel_change') : t('change_password')}
              </button>
            ) : (
              <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', fontStyle: 'italic' }}>
                {t('managed_google')}
              </span>
            )}
          </SettingRow>

          {showPasswordChangeForm && (
            <div style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid var(--border-color)',
              borderRadius: '16px',
              padding: '16px',
              marginTop: '-8px',
              marginBottom: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'rgba(255,255,255,0.5)' }}>{t('new_password')}</label>
                <input
                  type="password"
                  placeholder={t('min_6_chars')}
                  value={newPassword}
                  onFocus={() => setPassFocus1(true)}
                  onBlur={() => setPassFocus1(false)}
                  onChange={(e) => setNewPassword(e.target.value)}
                  tabIndex={0}
                  className="tv-focusable"
                  style={{
                    background: passFocus1 ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)',
                    border: passFocus1 ? '1px solid rgba(255,255,255,0.25)' : '1px solid var(--border-color)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    color: '#fff',
                    fontSize: '0.8rem',
                    outline: 'none'
                  }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'rgba(255,255,255,0.5)' }}>{t('confirm_password')}</label>
                <input
                  type="password"
                  placeholder={t('confirm_password_placeholder')}
                  value={confirmNewPassword}
                  onFocus={() => setPassFocus2(true)}
                  onBlur={() => setPassFocus2(false)}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  tabIndex={0}
                  className="tv-focusable"
                  style={{
                    background: passFocus2 ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)',
                    border: passFocus2 ? '1px solid rgba(255,255,255,0.25)' : '1px solid var(--border-color)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    color: '#fff',
                    fontSize: '0.8rem',
                    outline: 'none'
                  }}
                />
              </div>
              <button
                onClick={() => {
                  triggerHaptic('light');
                  if (newPassword.length < 6) {
                    showToast('Password must be at least 6 characters.');
                    return;
                  }
                  if (newPassword !== confirmNewPassword) {
                    showToast('Passwords do not match.');
                    return;
                  }
                  setReauthAction('change_password');
                }}
                tabIndex={0}
                className="tv-focusable"
                style={{
                  background: '#ffffff',
                  color: '#000000',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '10px',
                  fontWeight: 800,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  marginTop: '4px',
                  outline: 'none'
                }}
              >
                {t('confirm_password_update')}
              </button>
            </div>
          )}
        </>
      )}

      <div style={sectionHeaderStyle()}>{t('privacy_data')}</div>
      <SettingRow 
        label={t('wipe_progress')} 
        sub={t('wipe_progress_desc')} 
        isMobile={isMobile}
      >
        <button 
          onClick={handleClearHistory}
          tabIndex={0}
          className="tv-focusable"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid var(--border-color)',
            color: '#fff',
            cursor: 'pointer',
            padding: '8px 14px',
            borderRadius: '8px',
            fontWeight: 700,
            fontSize: '0.75rem',
            whiteSpace: 'nowrap',
            outline: 'none'
          }}
        >
          {t('wipe_progress_btn')}
        </button>
      </SettingRow>

      <SettingRow 
        label={t('clear_search_history')} 
        sub={t('clear_search_desc')} 
        isMobile={isMobile}
      >
        <button 
          onClick={handleClearSearchHistory}
          tabIndex={0}
          className="tv-focusable"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid var(--border-color)',
            color: '#fff',
            cursor: 'pointer',
            padding: '8px 14px',
            borderRadius: '8px',
            fontWeight: 700,
            fontSize: '0.75rem',
            whiteSpace: 'nowrap',
            outline: 'none'
          }}
        >
          {t('clear_search_btn')}
        </button>
      </SettingRow>

      {!isGuest && (
        <>
          <div style={sectionHeaderStyle()}>{t('danger_zone')}</div>
          <SettingRow 
            label={`${t('delete_profile_label')}: ${activeProfile?.name}`}
            sub={t('delete_profile_desc')} 
            isMobile={isMobile}
          >
            <button 
              onClick={handleDeleteProfile}
              tabIndex={0}
              className="tv-focusable"
              style={{
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                color: '#ef4444',
                cursor: 'pointer',
                padding: '8px 14px',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '0.75rem',
                whiteSpace: 'nowrap',
                outline: 'none'
              }}
            >
              {t('delete_btn')}
            </button>
          </SettingRow>
        </>
      )}

    </>
  );
}
