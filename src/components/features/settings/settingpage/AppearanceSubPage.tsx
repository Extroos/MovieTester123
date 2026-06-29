import React from 'react';
import { SettingRow, Switch } from './SettingsRow';
import { Check } from 'lucide-react';
import { LANGUAGES_LIST, t } from '../../../../utils/i18n';

interface AppearanceSubPageProps {
  settings: any;
  isMobile: boolean;
  toggleMinimalHome: () => void;
  updateSetting: (key: string, val: any) => void;
  toggleHaptics: () => void;
  toggleDebug: () => void;
  triggerHaptic: (type: 'light' | 'medium' | 'heavy') => void;
  showToast: (msg: string) => void;
  sectionHeaderStyle: () => React.CSSProperties;
}

export default function AppearanceSubPage({
  settings,
  isMobile,
  toggleMinimalHome,
  updateSetting,
  toggleHaptics,
  toggleDebug,
  triggerHaptic,
  showToast,
  sectionHeaderStyle
}: AppearanceSubPageProps) {
  
  const themes = [
    {
      id: 'dark',
      name: 'Cinematic Dark',
      desc: 'Default dark mode with charcoal cards',
      bg: '#0a0a0a',
      cardBg: '#1a1a1a',
      text: '#ffffff',
      border: '#333333'
    },
    {
      id: 'amoled',
      name: 'Deep AMOLED',
      desc: 'Pure pitch black for battery saving',
      bg: '#000000',
      cardBg: '#0d0d0d',
      text: '#ffffff',
      border: '#1c1c1e'
    }
  ];

  return (
    <>
      <div style={sectionHeaderStyle()}>{t('preferences')}</div>
      <SettingRow label={t('minimal_discovery')} sub={t('minimal_discovery_desc')} isMobile={isMobile}>
        <Switch checked={settings.minimalHome} onChange={toggleMinimalHome} isMobile={isMobile} />
      </SettingRow>
      
      <div style={sectionHeaderStyle()}>{t('visual_theme')}</div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr',
        gap: '16px',
        marginBottom: '28px',
        marginTop: '12px'
      }}>
        {themes.map((t) => {
          const isSelected = settings.theme === t.id;
          return (
            <div
              key={t.id}
              onClick={() => {
                triggerHaptic('heavy');
                updateSetting('theme', t.id);
              }}
              style={{
                background: isSelected ? 'var(--bg-card-hover)' : 'var(--bg-card)',
                border: isSelected ? '2px solid var(--text-primary)' : '1px solid var(--border-color)',
                borderRadius: '16px',
                padding: '16px',
                cursor: 'pointer',
                transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                position: 'relative',
                overflow: 'hidden',
                boxShadow: isSelected ? '0 8px 24px rgba(0, 0, 0, 0.15)' : 'none'
              }}
              className="active-press"
            >
              {/* Mini mockup preview container */}
              <div style={{
                background: t.bg,
                height: '42px',
                borderRadius: '8px',
                border: `1px solid ${t.border}`,
                padding: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px'
              }}>
                {/* Mini card */}
                <div style={{
                  background: t.cardBg,
                  flex: 1,
                  height: '100%',
                  borderRadius: '4px',
                  border: `1px solid ${t.border}`,
                  display: 'flex',
                  alignItems: 'center',
                  paddingLeft: '6px'
                }}>
                  <div style={{
                    width: '32px',
                    height: '4px',
                    background: t.text,
                    borderRadius: '2px',
                    opacity: 0.3
                  }} />
                </div>
                {/* Dots representation */}
                <div style={{ display: 'flex', gap: '4px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: t.text }} />
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#46D369' }} />
                </div>
              </div>

              {/* Title & Desc */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginTop: '2px' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                    {t.name}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', opacity: 0.7, marginTop: '2px', lineHeight: 1.25 }}>
                    {t.desc}
                  </div>
                </div>
                
                {/* Checkbox indicator */}
                <div style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  border: isSelected ? 'none' : '2px solid var(--border-color)',
                  background: isSelected ? 'var(--text-primary)' : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--bg-primary)',
                  flexShrink: 0
                }}>
                  {isSelected && <Check size={12} strokeWidth={3} />}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={sectionHeaderStyle()}>{t('app_language')}</div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? 'repeat(4, 1fr)' : 'repeat(7, 1fr)',
        gap: '12px',
        marginBottom: '28px',
        marginTop: '12px'
      }}>
        {LANGUAGES_LIST.map((lang) => {
          const isSelected = (settings.appLanguage || 'en') === lang.code;
          return (
            <div
              key={lang.code}
              onClick={() => {
                triggerHaptic('medium');
                updateSetting('appLanguage', lang.code);
                setTimeout(() => {
                  window.location.reload();
                }, 150);
              }}
              style={{
                background: isSelected ? 'var(--bg-card-hover)' : 'var(--bg-card)',
                border: isSelected ? '2px solid var(--text-primary)' : '1px solid var(--border-color)',
                borderRadius: '12px',
                padding: '16px 8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s',
              }}
              className="active-press"
            >
              <img
                src={`https://flagcdn.com/w80/${lang.code === 'en' ? 'us' : (lang.code === 'ar' ? 'sa' : lang.code)}.png`}
                alt={lang.name}
                style={{
                  width: '44px',
                  height: '30px',
                  objectFit: 'cover',
                  borderRadius: '4px',
                  boxShadow: '0 4px 10px rgba(0,0,0,0.35)',
                  border: '1px solid rgba(255,255,255,0.1)'
                }}
              />
            </div>
          );
        })}
      </div>

      <SettingRow 
        label={t('haptic_feedback')} 
        sub={t('haptic_feedback_desc')} 
        isMobile={isMobile}
        stackOnMobile={true}
      >
        <div style={{
          display: 'flex',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid var(--border-color)',
          borderRadius: '100px',
          padding: '3px',
          width: isMobile ? '100%' : 'auto',
          boxSizing: 'border-box'
        }}>
          {[
            { id: 'off', name: 'Off' },
            { id: 'light', name: 'Light' },
            { id: 'medium', name: 'Medium' },
            { id: 'heavy', name: 'Heavy' }
          ].map((lvl) => {
            const isSel = lvl.id === 'off' ? !settings.hapticsEnabled : (settings.hapticsEnabled && settings.hapticsIntensity === lvl.id);
            return (
              <button
                key={lvl.id}
                onClick={() => {
                  if (lvl.id === 'off') {
                    updateSetting('hapticsEnabled', false);
                  } else {
                    updateSetting('hapticsEnabled', true);
                    updateSetting('hapticsIntensity', lvl.id);
                    setTimeout(() => triggerHaptic(lvl.id as any), 50);
                  }
                }}
                style={{
                  flex: isMobile ? 1 : 'none',
                  background: isSel ? '#ffffff' : 'transparent',
                  border: 'none',
                  color: isSel ? '#000000' : 'rgba(255, 255, 255, 0.6)',
                  padding: isMobile ? '6px 8px' : '6px 12px',
                  borderRadius: '100px',
                  fontSize: '0.76rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  whiteSpace: 'nowrap',
                  textAlign: 'center'
                }}
              >
                {lvl.name}
              </button>
            );
          })}
        </div>
      </SettingRow>
      
      <div style={sectionHeaderStyle()}>{t('developer_settings')}</div>
      <SettingRow label={t('debug_overlay')} sub={t('debug_overlay_desc')} isMobile={isMobile}>
        <Switch checked={settings.debugMode} onChange={toggleDebug} isMobile={isMobile} />
      </SettingRow>
      
      <div style={sectionHeaderStyle()}>{t('notification_center')}</div>
      <SettingRow label={t('app_notifications')} sub={t('app_notifications_desc')} isMobile={isMobile}>
        <button
          onClick={async () => {
            triggerHaptic('medium');
            try {
              const { LocalNotifications } = await import('@capacitor/local-notifications');
              const perm = await LocalNotifications.requestPermissions();
              if (perm.display === 'granted') {
                await LocalNotifications.schedule({
                  notifications: [
                    {
                      title: "CineMovie Alerts",
                      body: "Notification permission active! Swipe up/tap to confirm.",
                      id: 999,
                      schedule: { at: new Date(Date.now() + 500) }
                    }
                  ]
                });
                showToast("Test notification sent! Swipe down your panel.");
              } else {
                showToast("Notification permission denied on this device.");
              }
            } catch (err: any) {
              console.error(err);
              showToast("Notifications not supported or failed to request.");
            }
          }}
          className="active-press tv-focusable"
          style={{
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            color: 'var(--text-primary)',
            padding: '10px 20px',
            borderRadius: '20px',
            fontSize: '0.82rem',
            fontWeight: 800,
            cursor: 'pointer',
            transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
            e.currentTarget.style.transform = 'scale(1.02)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          {t('activate_alerts')}
        </button>
      </SettingRow>
    </>
  );
}
