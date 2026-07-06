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
      name: t('theme_cinematic_dark'),
      desc: t('theme_cinematic_dark_desc'),
      bg: '#0a0a0a',
      cardBg: '#1a1a1a',
      text: '#ffffff',
      border: '#333333'
    },
    {
      id: 'amoled',
      name: t('theme_deep_amoled'),
      desc: t('theme_deep_amoled_desc'),
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
        gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '20px',
        marginBottom: '32px',
        marginTop: '16px'
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
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  triggerHaptic('heavy');
                  updateSetting('theme', t.id);
                }
              }}
              tabIndex={0}
              className="tv-focusable active-press"
              style={{
                background: isSelected ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.015)',
                border: isSelected ? '2px solid #ffffff' : '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '20px',
                padding: '20px',
                cursor: 'pointer',
                transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
                position: 'relative',
                overflow: 'hidden',
                boxShadow: isSelected ? '0 12px 36px rgba(0, 0, 0, 0.4)' : 'none'
              }}
            >
              {/* Mini mockup preview container */}
              <div style={{
                background: t.bg,
                height: '48px',
                borderRadius: '10px',
                border: `1px solid ${t.border}`,
                padding: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px'
              }}>
                {/* Mini card */}
                <div style={{
                  background: t.cardBg,
                  flex: 1,
                  height: '100%',
                  borderRadius: '6px',
                  border: `1px solid ${t.border}`,
                  display: 'flex',
                  alignItems: 'center',
                  paddingLeft: '8px'
                }}>
                  <div style={{
                    width: '36px',
                    height: '4px',
                    background: t.text,
                    borderRadius: '2px',
                    opacity: 0.3
                  }} />
                </div>
                {/* Dots representation */}
                <div style={{ display: 'flex', gap: '5px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: t.text }} />
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#46D369' }} />
                </div>
              </div>

              {/* Title & Desc */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginTop: '2px' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 900, fontSize: '0.95rem', color: '#ffffff', letterSpacing: '-0.01em' }}>
                    {t.name}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: 'rgba(255, 255, 255, 0.45)', marginTop: '4px', lineHeight: 1.35, fontWeight: 550 }}>
                    {t.desc}
                  </div>
                </div>
                
                {/* Checkbox indicator */}
                <div style={{
                  width: '22px',
                  height: '22px',
                  borderRadius: '50%',
                  border: isSelected ? 'none' : '2.5px solid rgba(255, 255, 255, 0.15)',
                  background: isSelected ? '#ffffff' : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#000000',
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
        gridTemplateColumns: isMobile ? 'repeat(4, 1fr)' : 'repeat(auto-fill, minmax(68px, 1fr))',
        gap: '14px',
        marginBottom: '32px',
        marginTop: '16px'
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
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  triggerHaptic('medium');
                  updateSetting('appLanguage', lang.code);
                  setTimeout(() => {
                    window.location.reload();
                  }, 150);
                }
              }}
              tabIndex={0}
              className="tv-focusable active-press"
              style={{
                background: isSelected ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.015)',
                border: isSelected ? '2px solid #ffffff' : '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '16px',
                padding: '16px 8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s',
              }}
            >
              <img
                src={`https://flagcdn.com/w80/${lang.code === 'en' ? 'us' : (lang.code === 'ar' ? 'sa' : lang.code)}.png`}
                alt={lang.name}
                style={{
                  width: '46px',
                  height: '32px',
                  objectFit: 'cover',
                  borderRadius: '6px',
                  boxShadow: '0 6px 14px rgba(0,0,0,0.5)',
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
            { id: 'off', name: t('haptic_level_off') },
            { id: 'light', name: t('haptic_level_light') },
            { id: 'medium', name: t('haptic_level_medium') },
            { id: 'heavy', name: t('haptic_level_heavy') }
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
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    if (lvl.id === 'off') {
                      updateSetting('hapticsEnabled', false);
                    } else {
                      updateSetting('hapticsEnabled', true);
                      updateSetting('hapticsIntensity', lvl.id);
                      setTimeout(() => triggerHaptic(lvl.id as any), 50);
                    }
                  }
                }}
                tabIndex={0}
                className="tv-focusable"
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
                  textAlign: 'center',
                  outline: 'none'
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
                      title: t('notif_test_title'),
                      body: t('notif_test_body'),
                      id: 999,
                      schedule: { at: new Date(Date.now() + 500) }
                    }
                  ]
                });
                showToast(t('notif_test_sent'));
              } else {
                showToast(t('notif_perm_denied'));
              }
            } catch (err: any) {
              console.error(err);
              showToast(t('notif_failed'));
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
