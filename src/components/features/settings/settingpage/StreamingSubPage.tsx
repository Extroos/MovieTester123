import React, { useState } from 'react';
import { SettingRow, Switch } from './SettingsRow';
import { Server, Activity, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import { setLocalServerUrl } from '../../../../services/LocalStreamService';
import { t } from '../../../../utils/i18n';

interface StreamingSubPageProps {
  settings: any;
  isMobile: boolean;
  toggleAutoNext: () => void;
  toggleHostControlsOnly: () => void;
  toggleAutoJoinParty: () => void;
  sectionHeaderStyle: () => React.CSSProperties;
  serverUrl: string;
  setServerUrl: (url: string) => void;
  serverUrlSaved: boolean;
  setServerUrlSaved: (val: boolean) => void;
  isTestingUrl: boolean;
  testStatus: 'success' | 'error' | null;
  testError: string | null;
  handleTestConnection: (overrideUrl?: string) => Promise<void>;
  updateSetting: (key: string, val: any) => void;
  triggerHaptic: (type: 'light' | 'medium' | 'heavy') => void;
}

export default function StreamingSubPage({
  settings,
  isMobile,
  toggleAutoNext,
  toggleHostControlsOnly,
  toggleAutoJoinParty,
  sectionHeaderStyle,
  serverUrl,
  setServerUrl,
  serverUrlSaved,
  setServerUrlSaved,
  isTestingUrl,
  testStatus,
  testError,
  handleTestConnection,
  updateSetting,
  triggerHaptic
}: StreamingSubPageProps) {
  const [isFocused, setIsFocused] = useState(false);

  // Helper to override section header style to be more compact on mobile
  const getCompactHeaderStyle = () => {
    const base = sectionHeaderStyle();
    if (isMobile) {
      return {
        ...base,
        padding: '20px 8px 8px',
        marginTop: '4px',
        fontSize: '0.7rem'
      };
    }
    return base;
  };

  // Determine border color based on status and focus
  const getInputBorder = () => {
    if (testStatus === 'success') return '1px solid rgba(70, 211, 105, 0.4)';
    if (testStatus === 'error') return '1px solid rgba(239, 68, 68, 0.4)';
    return isFocused ? '1px solid rgba(255, 255, 255, 0.25)' : '1px solid var(--border-color)';
  };

  const getInputBorderShadow = () => {
    if (testStatus === 'success') return '0 0 10px rgba(70, 211, 105, 0.15)';
    if (testStatus === 'error') return '0 0 10px rgba(239, 68, 68, 0.15)';
    return isFocused ? '0 0 8px rgba(255, 255, 255, 0.05)' : 'none';
  };

  return (
    <>
      <div style={getCompactHeaderStyle()}>{t('watch_together_sync')}</div>
      <SettingRow 
        label={t('host_only_controls')} 
        sub={isMobile ? t('host_only_desc_short') : t('host_only_desc')} 
        isMobile={isMobile}
      >
        <Switch checked={settings.hostControlsOnly} onChange={toggleHostControlsOnly} isMobile={isMobile} />
      </SettingRow>
      <SettingRow 
        label={t('auto_join_party')} 
        sub={isMobile ? t('auto_join_desc_short') : t('auto_join_desc')} 
        isMobile={isMobile}
      >
        <Switch checked={settings.autoJoinParty} onChange={toggleAutoJoinParty} isMobile={isMobile} />
      </SettingRow>

      <div style={getCompactHeaderStyle()}>{t('playback_engine')}</div>
      <SettingRow 
        label={t('auto_playback')} 
        sub={isMobile ? t('auto_playback_desc_short') : t('auto_playback_desc')} 
        isMobile={isMobile}
      >
        <Switch checked={settings.autoNext} onChange={toggleAutoNext} isMobile={isMobile} />
      </SettingRow>

      <SettingRow 
        label={t('resolution_mirror')} 
        sub={isMobile ? t('resolution_mirror_desc_short') : t('resolution_mirror_desc')} 
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
            { id: 'online', name: t('scraped_web') },
            { id: 'local', name: t('local_server') }
          ].map((mode) => {
            const isSel = settings.mirrorPriority === mode.id;
            return (
              <button
                key={mode.id}
                onClick={() => {
                  triggerHaptic('light');
                  updateSetting('mirrorPriority', mode.id);
                }}
                style={{
                  flex: isMobile ? 1 : 'none',
                  background: isSel ? '#ffffff' : 'transparent',
                  border: 'none',
                  color: isSel ? '#000000' : 'rgba(255, 255, 255, 0.6)',
                  padding: isMobile ? '6px 12px' : '5px 10px',
                  borderRadius: '100px',
                  fontSize: isMobile ? '0.74rem' : '0.74rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  whiteSpace: 'nowrap',
                  textAlign: 'center'
                }}
              >
                {mode.name}
              </button>
            );
          })}
        </div>
      </SettingRow>

      {/* Conditionally Render Local Streaming Server panel ONLY when using local server */}
      {settings.mirrorPriority === 'local' && (
        <>
          <div style={getCompactHeaderStyle()}>{t('local_streaming_server')}</div>
          <div style={{
            background: 'rgba(255, 255, 255, 0.015)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            border: '1px solid var(--border-color)',
            borderRadius: '16px',
            padding: isMobile ? '12px' : '20px',
            marginBottom: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: isMobile ? '8px' : '12px',
            marginTop: '6px'
          }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <div style={{
                width: '26px',
                height: '26px',
                borderRadius: '6px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-primary)',
                flexShrink: 0
              }}>
                <Server size={14} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ 
                  fontWeight: 800, 
                  fontSize: isMobile ? '0.82rem' : '0.86rem', 
                  color: '#fff', 
                  overflow: 'hidden', 
                  textOverflow: 'ellipsis', 
                  whiteSpace: 'nowrap' 
                }}>
                  {t('consumet_config')}
                </div>
                <div style={{ 
                  fontSize: isMobile ? '0.6rem' : '0.65rem', 
                  color: 'var(--text-secondary)', 
                  opacity: 0.6, 
                  overflow: 'hidden', 
                  textOverflow: 'ellipsis', 
                  whiteSpace: 'nowrap' 
                }}>
                  {t('consumet_config_desc')}
                </div>
              </div>
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              background: isFocused ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)',
              border: getInputBorder(),
              boxShadow: getInputBorderShadow(),
              borderRadius: '12px',
              padding: '4px',
              width: '100%',
              boxSizing: 'border-box',
              transition: 'all 0.25s ease'
            }}>
              <input
                type="text"
                value={serverUrl}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                onChange={(e) => {
                  setServerUrl(e.target.value);
                  setServerUrlSaved(false);
                  setLocalServerUrl(e.target.value);
                }}
                placeholder="http://localhost:3001"
                style={{
                  flex: 1,
                  background: 'none',
                  border: 'none',
                  padding: '6px 8px',
                  color: '#fff',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  outline: 'none',
                  minWidth: 0,
                }}
              />
              <button
                onClick={() => {
                  triggerHaptic('medium');
                  handleTestConnection();
                }}
                disabled={isTestingUrl}
                style={{
                  background: testStatus === 'success' ? '#46D369' : '#ffffff',
                  border: 'none',
                  color: testStatus === 'success' ? '#ffffff' : '#000000',
                  padding: isMobile ? '5px 10px' : '6px 12px',
                  borderRadius: '8px',
                  fontWeight: 800,
                  fontSize: isMobile ? '0.7rem' : '0.74rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  transition: 'all 0.2s ease',
                  opacity: isTestingUrl ? 0.6 : 1,
                  flexShrink: 0,
                  boxShadow: testStatus === 'success' ? '0 2px 8px rgba(70, 211, 105, 0.3)' : 'none'
                }}
              >
                {isTestingUrl ? (
                  <RefreshCw size={11} style={{ animation: 'spin 1s linear infinite' }} />
                ) : testStatus === 'success' ? (
                  <CheckCircle size={11} />
                ) : (
                  <Activity size={11} />
                )}
                {isTestingUrl ? t('testing') : testStatus === 'success' ? t('active') : t('test')}
              </button>
            </div>

            {/* Compact Test Result Indicators */}
            {testStatus === 'success' && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                color: '#46D369',
                fontSize: '0.7rem',
                fontWeight: 700,
                padding: '2px 4px',
                animation: 'fadeIn 0.2s ease-out'
              }}>
                <CheckCircle size={12} />
                <span>{t('connection_success')}</span>
              </div>
            )}

            {testStatus === 'error' && (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
                color: '#ef4444',
                fontSize: '0.7rem',
                fontWeight: 700,
                padding: '2px 4px',
                animation: 'fadeIn 0.2s ease-out'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <XCircle size={12} />
                  <span>{t('connection_failed')}</span>
                </div>
                {testError && (
                  <div style={{ 
                    fontSize: '0.62rem', 
                    color: 'rgba(255,255,255,0.45)', 
                    lineHeight: 1.25, 
                    fontWeight: 500, 
                    paddingLeft: '18px' 
                  }}>
                    {testError}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}

