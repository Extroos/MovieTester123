import React, { useState } from 'react';
import { Eye, EyeOff, Sliders, Play, Settings } from 'lucide-react';
import { SettingRow } from './SettingsRow';
import { t } from '../../../../utils/i18n';

interface SubtitlesSubPageProps {
  settings: any;
  updateSetting: (key: string, val: any) => void;
  isMobile: boolean;
  osApiKey: string;
  setOsApiKey: (val: string) => void;
  osUsername: string;
  setOsUsername: (val: string) => void;
  osPassword: string;
  setOsPassword: (val: string) => void;
  osSaved: boolean;
  setOsSaved: (val: boolean) => void;
  showOsPassword: boolean;
  setShowOsPassword: (val: boolean) => void;
  triggerHaptic: (type: 'light' | 'medium' | 'heavy') => void;
  sectionHeaderStyle: () => React.CSSProperties;
}

export default function SubtitlesSubPage({
  settings,
  updateSetting,
  isMobile,
  osApiKey,
  setOsApiKey,
  osUsername,
  setOsUsername,
  osPassword,
  setOsPassword,
  osSaved,
  setOsSaved,
  showOsPassword,
  setShowOsPassword,
  triggerHaptic,
  sectionHeaderStyle
}: SubtitlesSubPageProps) {
  
  const colors = [
    { name: 'White', value: '#ffffff' },
    { name: 'Yellow', value: '#ffeb3b' },
    { name: 'Cyan', value: '#00e5ff' },
    { name: 'Green', value: '#00e676' }
  ];

  const sizes = [
    { id: 'small', name: 'Small', fs: '0.8rem', previewFs: '0.45rem' },
    { id: 'medium', name: 'Medium', fs: '1rem', previewFs: '0.58rem' },
    { id: 'large', name: 'Large', fs: '1.25rem', previewFs: '0.72rem' },
    { id: 'xlarge', name: 'Extra Large', fs: '1.5rem', previewFs: '0.86rem' }
  ];

  const opacities = [
    { value: 0, name: 'None' },
    { value: 0.25, name: 'Low' },
    { value: 0.5, name: 'Medium' },
    { value: 0.75, name: 'High' },
    { value: 1, name: 'Solid' }
  ];

  const activeSize = sizes.find(s => s.id === settings.subtitleSize) || sizes[1];

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

  return (
    <>
      <div style={getCompactHeaderStyle()}>{t('subtitle_customization')}</div>

      {/* Unified Customization & TV Preview Card */}
      <div style={{
        background: 'rgba(255, 255, 255, 0.015)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        border: '1px solid var(--border-color)',
        borderRadius: '24px',
        padding: isMobile ? '14px' : '24px',
        marginBottom: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        marginTop: '6px'
      }}>
        
        {/* TV Screen Mockup Display */}
        <div style={{ position: 'relative', width: '100%' }}>
          {/* OLED TV Frame and Screen */}
          <div style={{
            width: '100%',
            background: '#121214',
            border: '4px solid #222225',
            borderRadius: '14px',
            padding: '0',
            overflow: 'hidden',
            boxShadow: `0 12px 32px rgba(0,0,0,0.8), 0 0 20px ${settings.subtitleColor}15`,
            transition: 'all 0.3s ease',
            aspectRatio: '16/9'
          }}>
            {/* Screen Content Backdrop */}
            <div style={{
              width: '100%',
              height: '100%',
              background: 'linear-gradient(rgba(0,0,0,0.35), rgba(0,0,0,0.35)), url("https://image.tmdb.org/t/p/w780/hZQN4E4a9c6872xL42nN549fJmZ.jpg") center/cover no-repeat',
              position: 'relative',
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
              paddingBottom: isMobile ? '12px' : '20px',
              boxSizing: 'border-box'
            }}>
              {/* Live Preview Subtitle Block */}
              <span style={{
                fontSize: isMobile ? `calc(${activeSize.previewFs} * 0.9)` : activeSize.previewFs,
                color: settings.subtitleColor,
                background: `rgba(0, 0, 0, ${settings.subtitleBgOpacity})`,
                padding: isMobile ? '3px 8px' : '4px 10px',
                borderRadius: '4px',
                fontWeight: 600,
                textShadow: '0 1.5px 2px rgba(0,0,0,0.95)',
                textAlign: 'center',
                maxWidth: '85%',
                lineHeight: 1.4,
                transition: 'all 0.25s ease',
                whiteSpace: 'normal',
                wordBreak: 'break-word'
              }}>
                "This is a preview of the subtitles layout."
              </span>

              {/* Minimalist TV HUD Indicator */}
              <div style={{
                position: 'absolute',
                top: '8px',
                left: '10px',
                fontSize: '0.55rem',
                color: 'rgba(255,255,255,0.4)',
                fontWeight: 800,
                letterSpacing: '0.05em',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                <Play size={8} fill="rgba(255,255,255,0.4)" /> LIVE PREVIEW (1080p)
              </div>
            </div>
          </div>

          {/* TV Stand Base */}
          <div style={{
            width: '32px',
            height: '8px',
            background: 'linear-gradient(to right, #3a3a3d, #1c1c1f)',
            margin: '0 auto',
            position: 'relative',
            zIndex: 2
          }} />
          <div style={{
            width: '90px',
            height: '3px',
            background: 'linear-gradient(to right, #444447, #1c1c1f, #444447)',
            margin: '0 auto',
            borderRadius: '10px',
            position: 'relative',
            zIndex: 1,
            boxShadow: '0 2px 4px rgba(0,0,0,0.5)'
          }} />
        </div>

        {/* Customization Options Inner Control Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* Option 1: Font Size */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-primary)' }}>{t('subtitle_size')}</span>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', opacity: 0.6 }}>{activeSize.name} size</span>
            </div>
            <div style={{
              display: 'flex',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--border-color)',
              borderRadius: '100px',
              padding: '3px',
              width: '100%',
              boxSizing: 'border-box'
            }}>
              {sizes.map((sz) => {
                const isSel = settings.subtitleSize === sz.id;
                return (
                  <button
                    key={sz.id}
                    onClick={() => {
                      triggerHaptic('light');
                      updateSetting('subtitleSize', sz.id);
                    }}
                    style={{
                      flex: 1,
                      background: isSel ? '#ffffff' : 'transparent',
                      border: 'none',
                      color: isSel ? '#000000' : 'rgba(255, 255, 255, 0.6)',
                      padding: '8px 4px',
                      borderRadius: '100px',
                      fontSize: '0.74rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      whiteSpace: 'nowrap',
                      textAlign: 'center'
                    }}
                  >
                    {sz.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Option 2: Subtitle Color */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-primary)' }}>{t('subtitle_color')}</span>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', opacity: 0.6 }}>{t('text_color')}</span>
            </div>
            <div style={{
              display: 'flex',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--border-color)',
              borderRadius: '100px',
              padding: '3px',
              width: '100%',
              boxSizing: 'border-box'
            }}>
              {colors.map((c) => {
                const isSel = settings.subtitleColor === c.value;
                return (
                  <button
                    key={c.value}
                    onClick={() => {
                      triggerHaptic('light');
                      updateSetting('subtitleColor', c.value);
                    }}
                    style={{
                      flex: 1,
                      background: isSel ? '#ffffff' : 'transparent',
                      border: 'none',
                      color: isSel ? '#000000' : 'rgba(255, 255, 255, 0.6)',
                      padding: '8px 2px',
                      borderRadius: '100px',
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      whiteSpace: 'nowrap',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px'
                    }}
                  >
                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: c.value, border: '1px solid rgba(255,255,255,0.2)', flexShrink: 0 }} />
                    {c.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Option 3: Background Opacity */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-primary)' }}>{t('background_opacity')}</span>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', opacity: 0.6 }}>{t('text_background')}</span>
            </div>
            <div style={{
              display: 'flex',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--border-color)',
              borderRadius: '100px',
              padding: '3px',
              width: '100%',
              boxSizing: 'border-box'
            }}>
              {opacities.map((op) => {
                const isSel = settings.subtitleBgOpacity === op.value;
                return (
                  <button
                    key={op.value}
                    onClick={() => {
                      triggerHaptic('light');
                      updateSetting('subtitleBgOpacity', op.value);
                    }}
                    style={{
                      flex: 1,
                      background: isSel ? '#ffffff' : 'transparent',
                      border: 'none',
                      color: isSel ? '#000000' : 'rgba(255, 255, 255, 0.6)',
                      padding: '8px 2px',
                      borderRadius: '100px',
                      fontSize: '0.7rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      whiteSpace: 'nowrap',
                      textAlign: 'center'
                    }}
                  >
                    {op.name}
                  </button>
                );
              })}
            </div>
          </div>

        </div>

      </div>

      <div style={getCompactHeaderStyle()}>{t('subtitle_engine')}</div>
      
      {/* API Key */}
      <SettingRow 
        label={t('opensubtitles_key')} 
        sub={t('opensubtitles_key_desc')} 
        isMobile={isMobile}
        stackOnMobile={true}
      >
        <input
          type="text"
          value={osApiKey}
          onChange={(e) => { setOsApiKey(e.target.value); setOsSaved(false); }}
          placeholder="Paste API Key here..."
          style={{
            width: '100%',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            padding: '10px 14px',
            color: '#fff',
            fontSize: '0.82rem',
            fontWeight: 600,
            outline: 'none',
            fontFamily: 'monospace',
            boxSizing: 'border-box'
          }}
        />
      </SettingRow>
    </>
  );
}

