import React from 'react';
import type { Movie, TVShow } from '../../../../types';

interface PlayerSettingsProps {
  showSettings: boolean;
  setShowSettings: (show: boolean) => void;
  settingsTab: 'quality' | 'subtitles' | 'speed' | 'servers' | 'download' | 'diagnostics';
  setSettingsTab: React.Dispatch<React.SetStateAction<'quality' | 'subtitles' | 'speed' | 'servers' | 'download' | 'diagnostics'>>;
  selectedServer: 'vidlink-pro' | 'vidsrc-pm' | 'universal';
  handleServerChange: (serverId: 'vidlink-pro' | 'vidsrc-pm' | 'universal') => Promise<void>;
  isSwitchingServer: boolean;
  connectingServerName: string | null;
  serverError: string | null;
  handleCancelServerSwitch: () => void;
  qualities: { height: number; index: number }[];
  currentQuality: number;
  handleQualitySelect: (index: number) => void;
  localTracks: { file: string; label: string; kind: string; default?: boolean }[];
  activeTrackIndex: number;
  handleTrackSelect: (index: number) => Promise<void>;
  loadingSubtitleIndex: number | null;
  subtitleError: string | null;
  lastAttemptedTrack: { file: string; label: string; kind: string; default?: boolean } | null;
  handleAlternativeSearch: (label: string) => void;
  downloadTrack: (track: any) => Promise<void>;
  isOfflineMode: boolean;
  item?: Movie | TVShow;
  season?: number;
  episode?: number;

  // Subtitle delay & customization
  subtitleDelay: number;
  setSubtitleDelay: React.Dispatch<React.SetStateAction<number>>;
  subtitlePosition: number;
  setSubtitlePosition: React.Dispatch<React.SetStateAction<number>>;
  subtitleSize: 'small' | 'normal' | 'large' | 'xlarge';
  setSubtitleSize: React.Dispatch<React.SetStateAction<'small' | 'normal' | 'large' | 'xlarge'>>;
  subtitleColor: string;
  setSubtitleColor: React.Dispatch<React.SetStateAction<string>>;
  subtitleBgOpacity: number;
  setSubtitleBgOpacity: React.Dispatch<React.SetStateAction<number>>;
  handleCustomSubtitleUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;

  // Online Subtitles searching
  isSearchingOnline: boolean;
  setIsSearchingOnline: React.Dispatch<React.SetStateAction<boolean>>;
  onlineProvider: 'yify' | 'opensubtitles' | 'subdl';
  setOnlineProvider: React.Dispatch<React.SetStateAction<'yify' | 'opensubtitles' | 'subdl'>>;
  searchLang: string;
  setSearchLang: React.Dispatch<React.SetStateAction<string>>;
  onlineSubs: any[];
  searchingSubs: boolean;
  onlineSearchError: string | null;
  apiKey: string;
  setApiKey: React.Dispatch<React.SetStateAction<string>>;
  username: string;
  setUsername: React.Dispatch<React.SetStateAction<string>>;
  password: string;
  setPassword: React.Dispatch<React.SetStateAction<string>>;
  isCredentialsSaved: boolean;
  setIsCredentialsSaved: React.Dispatch<React.SetStateAction<boolean>>;
  handleOnlineSubtitleSearch: (overrideProvider?: 'yify' | 'opensubtitles' | 'subdl', overrideLang?: string) => Promise<void>;
  handleOnlineSubtitleDownload: (sub: any) => Promise<void>;
  saveOnlineSubtitleToDevice: (sub: any) => Promise<void>;

  // Speed
  playbackSpeed: number;
  setPlaybackSpeed: (speed: number) => void;

  // Offline Downloader downloader tab props
  isDownloading: boolean;
  downloadProgress: number;
  downloadStatus: string;
  handleDownloadOffline: () => void;
  handleCancelDownload: () => void;
  setOnlineSearchError: React.Dispatch<React.SetStateAction<string | null>>;
  setOnlineSubs: React.Dispatch<React.SetStateAction<any[]>>;
  vidlinkDiagnostics?: string | null;
}

const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'ar', name: 'Arabic' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ru', name: 'Russian' },
  { code: 'zh', name: 'Chinese' },
  { code: 'tr', name: 'Turkish' },
];

export const PlayerSettings = React.memo(function PlayerSettings({
  showSettings,
  setShowSettings,
  settingsTab,
  setSettingsTab,
  selectedServer,
  handleServerChange,
  isSwitchingServer,
  connectingServerName,
  serverError,
  handleCancelServerSwitch,
  qualities,
  currentQuality,
  handleQualitySelect,
  localTracks,
  activeTrackIndex,
  handleTrackSelect,
  loadingSubtitleIndex,
  subtitleError,
  lastAttemptedTrack,
  handleAlternativeSearch,
  downloadTrack,
  isOfflineMode,
  item,
  season,
  episode,
  subtitleDelay,
  setSubtitleDelay,
  subtitlePosition,
  setSubtitlePosition,
  subtitleSize,
  setSubtitleSize,
  subtitleColor,
  setSubtitleColor,
  subtitleBgOpacity,
  setSubtitleBgOpacity,
  handleCustomSubtitleUpload,
  isSearchingOnline,
  setIsSearchingOnline,
  onlineProvider,
  setOnlineProvider,
  searchLang,
  setSearchLang,
  onlineSubs,
  searchingSubs,
  onlineSearchError,
  apiKey,
  setApiKey,
  username,
  setUsername,
  password,
  setPassword,
  isCredentialsSaved,
  setIsCredentialsSaved,
  handleOnlineSubtitleSearch,
  handleOnlineSubtitleDownload,
  saveOnlineSubtitleToDevice,
  playbackSpeed,
  setPlaybackSpeed,
  isDownloading,
  downloadProgress,
  downloadStatus,
  handleDownloadOffline,
  handleCancelDownload,
  setOnlineSearchError,
  setOnlineSubs,
  vidlinkDiagnostics
}: PlayerSettingsProps) {
  if (!showSettings) return null;

  return (
    <div 
      style={{ 
        position: 'absolute', 
        inset: 0, 
        zIndex: 10020, 
        background: 'rgba(0,0,0,0.6)', 
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', 
        alignItems: 'flex-end', 
        justifyContent: 'center',
        overflowY: 'auto',
      }} 
      onClick={() => setShowSettings(false)}
    >
      <style>{`
        @media (orientation: landscape) and (max-height: 500px) {
          .player-settings-sheet {
            border-radius: 20px 0 0 20px !important;
            border-top-right-radius: 0 !important;
            border-bottom-right-radius: 0 !important;
            max-height: 100% !important;
            max-width: 360px !important;
            width: 360px !important;
            position: fixed !important;
            top: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            border-bottom: 1px solid rgba(255,255,255,0.08) !important;
            border-right: none !important;
            animation: slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1) !important;
          }
          .player-settings-content {
            max-height: calc(100vh - 110px) !important;
            min-height: 80px !important;
          }
          .server-card {
            flex-direction: row !important;
            align-items: center !important;
            gap: 10px !important;
            padding: 10px 12px !important;
          }
          .server-card-desc {
            display: none !important;
          }
          .server-cards-grid {
            display: grid !important;
            grid-template-columns: 1fr !important;
            gap: 6px !important;
          }
          .settings-tab-btn {
            padding: 6px 8px !important;
            font-size: 0.72rem !important;
          }
          .settings-header {
            margin-bottom: -2px !important;
          }
        }
        @keyframes slideInRight {
            animation: slideLeftGlass 0.3s cubic-bezier(0.16, 1, 0.3, 1) !important;
          }
        }
        @keyframes slideLeftGlass {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        @keyframes slideUpGlass {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
      <div 
        className="player-settings-sheet"
        style={{ 
          background: 'rgba(12, 12, 14, 0.98)', 
          borderTopLeftRadius: '20px', 
          borderTopRightRadius: '20px', 
          border: '1px solid rgba(255,255,255,0.09)',
          borderBottom: 'none',
          padding: '14px 14px calc(14px + env(safe-area-inset-bottom, 0px))', 
          width: '100%', 
          maxWidth: '520px', 
          maxHeight: '82vh', 
          overflowY: 'auto',
          animation: 'slideUpGlass 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none'
        }} 
        onClick={e => e.stopPropagation()}
      >
        <div style={{ width: '36px', height: '4px', background: 'rgba(255,255,255,0.18)', borderRadius: '2px', alignSelf: 'center', marginBottom: '-4px' }} />

        <div className="settings-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, color: '#fff', fontSize: '1.1rem', fontWeight: 800, letterSpacing: '-0.02em' }}>Player Options</h3>
          <button onClick={() => setShowSettings(false)} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '5px 12px', borderRadius: '10px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>Done</button>
        </div>

        {/* Horizontally scrollable and non-wrapping Tab bar optimized for 360px screen */}
        <div 
          style={{ 
            display: 'flex', 
            background: 'rgba(255,255,255,0.03)', 
            borderRadius: '10px', 
            padding: '3px', 
            gap: '3px',
            overflowX: 'auto',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            WebkitOverflowScrolling: 'touch'
          }}
        >
          {[
            { id: 'servers', label: 'Servers', show: !!item && !isOfflineMode },
            { id: 'quality', label: 'Quality', show: qualities.length > 0 },
            { id: 'subtitles', label: 'Subtitles', show: true },
            { id: 'speed', label: 'Speed', show: true },
            {id: 'download', label: 'Downloads', show: !isOfflineMode },
            {id: 'diagnostics', label: 'Stream Logs', show: !!item }
          ].filter(t => t.show).map(tab => (
            <button
              key={tab.id}
              className="settings-tab-btn"
              onClick={() => {
                import('../../../../utils/haptics').then(m => m.triggerHaptic('light'));
                setSettingsTab(tab.id as any);
              }}
              style={{
                flexShrink: 0,
                padding: '8px 12px',
                background: settingsTab === tab.id ? 'rgba(255,255,255,0.08)' : 'transparent',
                border: settingsTab === tab.id ? '1px solid rgba(255,255,255,0.08)' : '1px solid transparent',
                color: settingsTab === tab.id ? '#ffffff' : 'rgba(255,255,255,0.45)',
                borderRadius: '8px',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="player-settings-content" style={{ flex: 1, overflowY: 'auto', minHeight: '100px', maxHeight: '55vh', scrollbarWidth: 'none' }}>
          {settingsTab === 'servers' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {isSwitchingServer ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '24px' }}>
                  <div style={{ 
                    width: '36px', height: '36px', 
                    border: '3px solid rgba(255,255,255,0.2)', borderTopColor: '#ffffff', 
                    borderRadius: '50%', animation: 'spin 0.8s linear infinite' 
                  }} />
                  <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', fontWeight: 600 }}>
                    Resolving stream from selected server...
                  </span>
                </div>
              ) : (
                <>
                  {serverError && (
                    <div style={{ color: '#f87171', fontSize: '0.8rem', padding: '10px', background: 'rgba(248, 113, 113, 0.05)', borderRadius: '10px', border: '1px solid rgba(248, 113, 113, 0.1)', textAlign: 'center', fontWeight: 600 }}>
                      {serverError}
                    </div>
                  )}
                  <div className="server-cards-grid" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {[
                      { id: 'vidlink-pro', name: 'Vidlink Pro', description: 'Primary gateway — vidlink.pro', badge: 'Primary' },
                      { id: 'vidsrc-pm', name: 'VidSrc PM', description: 'Alternative gateway — vidsrc.pm (vaplayer)', badge: 'Gateway' },
                      { id: 'universal', name: 'Universal Player', description: 'Auto-resolves direct HLS streams via failover servers', badge: 'Failover' },
                    ].map((srv) => (
                      <button
                        key={srv.id}
                        className="server-card"
                        onClick={() => handleServerChange(srv.id as any)}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '4px',
                          padding: '12px 16px',
                          borderRadius: '12px',
                          background: selectedServer === srv.id ? '#ffffff' : 'rgba(255,255,255,0.05)',
                          border: selectedServer === srv.id ? 'none' : '1px solid rgba(255,255,255,0.06)',
                          color: selectedServer === srv.id ? '#000000' : '#ffffff',
                          textAlign: 'left',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{srv.name}</span>
                          {srv.badge && (
                            <span style={{
                              fontSize: '0.62rem',
                              fontWeight: 800,
                              padding: '2px 7px',
                              borderRadius: '6px',
                              background: selectedServer === srv.id
                                ? 'rgba(0,0,0,0.12)'
                                : srv.badge === 'Recommended' ? 'rgba(74, 222, 128, 0.15)' : 'rgba(255,255,255,0.08)',
                              color: selectedServer === srv.id
                                ? '#333'
                                : srv.badge === 'Recommended' ? '#4ade80' : 'rgba(255,255,255,0.5)',
                              letterSpacing: '0.02em',
                              textTransform: 'uppercase'
                            }}>{srv.badge}</span>
                          )}
                        </div>
                        <span className="server-card-desc" style={{ fontSize: '0.74rem', opacity: 0.6, color: selectedServer === srv.id ? '#444' : 'rgba(255,255,255,0.5)' }}>
                          {srv.description}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {settingsTab === 'quality' && qualities.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '8px' }}>
              <button 
                onClick={() => handleQualitySelect(-1)}
                style={{ 
                  padding: '14px', borderRadius: '12px', 
                  background: currentQuality === -1 ? '#ffffff' : 'rgba(255,255,255,0.05)', 
                  border: 'none',
                  color: currentQuality === -1 ? '#000000' : '#ffffff', 
                  textAlign: 'center', cursor: 'pointer', fontWeight: 700,
                  transition: 'all 0.2s'
                }}
              >
                Auto
              </button>
              {qualities.map((q) => (
                <button 
                  key={q.index}
                  onClick={() => handleQualitySelect(q.index)}
                  style={{ 
                    padding: '14px', borderRadius: '12px', 
                    background: currentQuality === q.index ? '#ffffff' : 'rgba(255,255,255,0.05)', 
                    border: 'none',
                    color: currentQuality === q.index ? '#000000' : '#ffffff', 
                    textAlign: 'center', cursor: 'pointer', fontWeight: 700,
                    transition: 'all 0.2s'
                  }}
                >
                  {q.height}p
                </button>
              ))}
            </div>
          )}

          {settingsTab === 'subtitles' && !isSearchingOnline && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

              {subtitleError && (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  background: 'rgba(248, 113, 113, 0.08)',
                  padding: '12px 14px',
                  borderRadius: '12px',
                  border: '1px solid rgba(248, 113, 113, 0.15)',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  color: '#f87171',
                }}>
                  <div style={{ textAlign: 'center', lineHeight: '1.4' }}>{subtitleError}</div>
                  <button
                    onClick={() => {
                      const labelToSearch = lastAttemptedTrack ? lastAttemptedTrack.label : 'English';
                      handleAlternativeSearch(labelToSearch);
                    }}
                    style={{
                      background: '#f87171',
                      color: '#0f172a',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      transition: 'opacity 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px'
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    </svg>
                    Search Alternative Online Subtitles
                  </button>
                </div>
              )}

              {localTracks.length === 0 ? (
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem', padding: '16px 8px', textAlign: 'center' }}>
                  No default subtitles found.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '8px' }}>
                  <button 
                    disabled={loadingSubtitleIndex !== null}
                    onClick={() => handleTrackSelect(-1)}
                    style={{ 
                      padding: '14px', borderRadius: '12px', 
                      background: activeTrackIndex === -1 ? '#ffffff' : 'rgba(255,255,255,0.05)', 
                      border: 'none', 
                      color: activeTrackIndex === -1 ? '#000000' : '#fff', 
                      textAlign: 'center', cursor: 'pointer', fontWeight: 700,
                      transition: 'all 0.2s',
                      opacity: loadingSubtitleIndex !== null ? 0.6 : 1
                    }}
                  >
                    Off
                  </button>
                  {localTracks.map((track, i) => {
                    const isLoading = loadingSubtitleIndex === i;
                    const isActive = activeTrackIndex === i;
                    return (
                      <div key={i} style={{ display: 'flex', gap: '4px', background: isActive ? '#ffffff' : 'rgba(255,255,255,0.05)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                        <button 
                          disabled={loadingSubtitleIndex !== null}
                          onClick={() => handleTrackSelect(i)}
                          style={{ 
                            flex: 1,
                            padding: '14px 10px', 
                            background: 'transparent', 
                            border: 'none', 
                            color: isActive ? '#000000' : '#fff', 
                            textAlign: 'center', cursor: 'pointer', fontWeight: 700,
                            transition: 'all 0.2s',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            opacity: loadingSubtitleIndex !== null && !isLoading ? 0.6 : 1
                          }}
                        >
                          {isLoading && (
                            <div style={{ 
                              width: '12px', height: '12px', 
                              border: '2px solid rgba(255,255,255,0.2)', 
                              borderTopColor: isActive ? '#000' : '#fff', 
                              borderRadius: '50%', 
                              animation: 'spin 0.8s linear infinite' 
                            }} />
                          )}
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100px' }}>
                            {track.label || `Track ${i+1}`}
                          </span>
                        </button>
                        <button
                          onClick={() => downloadTrack(track)}
                          title="Download subtitle file to device"
                          style={{
                            background: 'rgba(255,255,255,0.08)',
                            border: 'none',
                            borderLeft: '1px solid rgba(255,255,255,0.1)',
                            color: isActive ? '#000000' : '#fff',
                            width: '38px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                          }}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
                          </svg>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {activeTrackIndex !== -1 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '16px', background: 'rgba(255,255,255,0.01)', padding: '16px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ color: '#ffffff', fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                    Subtitle Customization
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>
                      <span>Subtitle Sync Delay</span>
                      <span style={{ color: subtitleDelay === 0 ? '#fff' : subtitleDelay > 0 ? '#4ade80' : '#f87171', fontFamily: 'monospace' }}>
                        {subtitleDelay === 0 ? '0.0s (In Sync)' : subtitleDelay > 0 ? `+${subtitleDelay.toFixed(1)}s` : `${subtitleDelay.toFixed(1)}s`}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <button 
                        onClick={() => { import('../../../../utils/haptics').then(m => m.triggerHaptic('light')); setSubtitleDelay(prev => Math.max(-5, prev - 0.5)); }}
                        style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.08)', border: 'none', color: '#fff', borderRadius: '8px', fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer' }}
                      >
                        -0.5s
                      </button>
                      <input 
                        type="range"
                        min="-5"
                        max="5"
                        step="0.5"
                        value={subtitleDelay}
                        onChange={(e) => setSubtitleDelay(parseFloat(e.target.value))}
                        style={{ flex: 1, accentColor: '#ffffff', height: '4px', cursor: 'pointer' }}
                      />
                      <button 
                        onClick={() => { import('../../../../utils/haptics').then(m => m.triggerHaptic('light')); setSubtitleDelay(prev => Math.min(5, prev + 0.5)); }}
                        style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.08)', border: 'none', color: '#fff', borderRadius: '8px', fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer' }}
                      >
                        +0.5s
                      </button>
                      {subtitleDelay !== 0 && (
                        <button 
                          onClick={() => { import('../../../../utils/haptics').then(m => m.triggerHaptic('light')); setSubtitleDelay(0); }}
                          style={{ padding: '6px 10px', background: 'rgba(239, 68, 68, 0.15)', border: 'none', color: '#ef4444', borderRadius: '8px', fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer' }}
                        >
                          Reset
                        </button>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>
                      <span>Vertical Position Shift</span>
                      <span style={{ color: '#fff', fontFamily: 'monospace' }}>
                        {subtitlePosition === 0 ? 'Bottom' : `${Math.abs(subtitlePosition)}px Higher`}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>Default</span>
                      <input 
                        type="range"
                        min="-120"
                        max="20"
                        value={subtitlePosition}
                        onChange={(e) => setSubtitlePosition(parseInt(e.target.value))}
                        style={{ flex: 1, accentColor: '#ffffff', height: '4px', cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>High</span>
                      {subtitlePosition !== -40 && (
                        <button 
                          onClick={() => { import('../../../../utils/haptics').then(m => m.triggerHaptic('light')); setSubtitlePosition(-40); }}
                          style={{ padding: '6px 10px', background: 'rgba(255,255,255,0.08)', border: 'none', color: '#fff', borderRadius: '8px', fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer' }}
                        >
                          Reset
                        </button>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>Text Size</span>
                      <div style={{ display: 'flex', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '3px', gap: '3px' }}>
                        {(['small', 'normal', 'large', 'xlarge'] as const).map(sz => (
                          <button
                            key={sz}
                            onClick={() => { import('../../../../utils/haptics').then(m => m.triggerHaptic('light')); setSubtitleSize(sz); }}
                            style={{
                              flex: 1,
                              padding: '6px 2px',
                              fontSize: '0.66rem',
                              fontWeight: 800,
                              textTransform: 'capitalize',
                              background: subtitleSize === sz ? '#ffffff' : 'transparent',
                              color: subtitleSize === sz ? '#000000' : 'rgba(255,255,255,0.5)',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              transition: 'all 0.15s'
                            }}
                          >
                            {sz === 'xlarge' ? 'XL' : sz}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>Text Color</span>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', height: '32px' }}>
                        {[
                          { value: '#ffffff', name: 'White' },
                          { value: '#facc15', name: 'Yellow' },
                          { value: '#4ade80', name: 'Green' },
                          { value: '#22d3ee', name: 'Cyan' },
                        ].map(color => (
                          <button
                            key={color.value}
                            onClick={() => { import('../../../../utils/haptics').then(m => m.triggerHaptic('light')); setSubtitleColor(color.value); }}
                            style={{
                              width: '24px',
                              height: '24px',
                              borderRadius: '50%',
                              background: color.value,
                              border: subtitleColor === color.value ? '2px solid #ffffff' : '1px solid rgba(255,255,255,0.2)',
                              transform: subtitleColor === color.value ? 'scale(1.2)' : 'none',
                              cursor: 'pointer',
                              transition: 'all 0.15s',
                              boxShadow: subtitleColor === color.value ? '0 0 10px rgba(255,255,255,0.4)' : 'none'
                            }}
                            title={color.name}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>Background Opacity</span>
                    <div style={{ display: 'flex', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '3px', gap: '3px' }}>
                      {[
                        { label: 'Off', val: 0 },
                        { label: 'Translucent', val: 0.35 },
                        { label: 'Semi-Dark', val: 0.6 },
                        { label: 'Solid', val: 0.9 }
                      ].map(op => (
                        <button
                          key={op.val}
                          onClick={() => { import('../../../../utils/haptics').then(m => m.triggerHaptic('light')); setSubtitleBgOpacity(op.val); }}
                          style={{
                            flex: 1,
                            padding: '6px 4px',
                            fontSize: '0.66rem',
                            fontWeight: 800,
                            background: subtitleBgOpacity === op.val ? '#ffffff' : 'transparent',
                            color: subtitleBgOpacity === op.val ? '#000000' : 'rgba(255,255,255,0.5)',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            transition: 'all 0.15s'
                          }}
                        >
                          {op.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              
              <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '16px' }}>
                <button
                  onClick={() => {
                    import('../../../../utils/haptics').then(m => m.triggerHaptic('light'));
                    setIsSearchingOnline(true);
                    setOnlineSearchError(null);
                    setOnlineSubs([]);
                    if (!!season || !!episode) {
                      setOnlineProvider('opensubtitles');
                    } else {
                      setOnlineProvider('yify');
                    }
                  }}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    padding: '14px 20px',
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: '12px',
                    color: '#fff',
                    fontSize: '0.88rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                  Search Online
                </button>
                <label style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  padding: '14px 20px',
                  border: '1.5px dashed rgba(255,255,255,0.2)',
                  borderRadius: '12px',
                  color: 'rgba(255,255,255,0.8)',
                  fontSize: '0.88rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
                  </svg>
                  Upload File
                  <input 
                    type="file" 
                    accept=".vtt,.srt" 
                    onChange={handleCustomSubtitleUpload} 
                    style={{ display: 'none' }} 
                  />
                </label>
              </div>
            </div>
          )}

          {settingsTab === 'subtitles' && isSearchingOnline && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button
                  onClick={() => setIsSearchingOnline(false)}
                  style={{
                    background: 'rgba(255,255,255,0.08)',
                    border: 'none',
                    color: '#fff',
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer'
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
                  </svg>
                </button>
                <span style={{ color: '#fff', fontWeight: 700, fontSize: '1rem' }}>Search Subtitles Online</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'flex', background: 'rgba(255,255,255,0.04)', borderRadius: '10px', padding: '3px', gap: '4px' }}>
                  {!(!!season || !!episode) && (
                    <button
                      onClick={() => { import('../../../../utils/haptics').then(m => m.triggerHaptic('light')); setOnlineProvider('yify'); }}
                      style={{
                        flex: 1,
                        padding: '8px',
                        background: onlineProvider === 'yify' ? 'rgba(255,255,255,0.1)' : 'transparent',
                        border: 'none',
                        color: onlineProvider === 'yify' ? '#fff' : 'rgba(255,255,255,0.5)',
                        borderRadius: '6px',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      YIFY (Free)
                    </button>
                  )}
                  <button
                    onClick={() => { import('../../../../utils/haptics').then(m => m.triggerHaptic('light')); setOnlineProvider('opensubtitles'); }}
                    style={{
                      flex: 1,
                      padding: '8px',
                      background: onlineProvider === 'opensubtitles' || (!!season || !!episode && onlineProvider !== 'yify') ? 'rgba(255,255,255,0.1)' : 'transparent',
                      border: 'none',
                      color: onlineProvider === 'opensubtitles' || (!!season || !!episode && onlineProvider !== 'yify') ? '#fff' : 'rgba(255,255,255,0.5)',
                      borderRadius: '6px',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    OpenSubtitles
                  </button>
                </div>



                {onlineProvider === 'opensubtitles' && !apiKey.trim() && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: 'rgba(239, 68, 68, 0.08)', padding: '12px', borderRadius: '10px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                    <div style={{ color: '#f87171', fontSize: '0.76rem', fontWeight: 600 }}>OpenSubtitles credentials not set. Set them below:</div>
                    <input
                      type="text"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="OpenSubtitles API Key"
                      style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '6px 10px', color: '#fff', fontSize: '0.75rem', fontFamily: 'monospace' }}
                    />
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Username"
                        style={{ flex: 1, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '6px 10px', color: '#fff', fontSize: '0.75rem' }}
                      />
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Password"
                        style={{ flex: 1, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '6px 10px', color: '#fff', fontSize: '0.75rem' }}
                      />
                    </div>
                    <button
                      onClick={() => {
                        localStorage.setItem('cinemovie_opensubtitles_apikey', apiKey.trim());
                        localStorage.setItem('cinemovie_opensubtitles_username', username.trim());
                        localStorage.setItem('cinemovie_opensubtitles_password', password.trim());
                        setIsCredentialsSaved(true);
                        setTimeout(() => setIsCredentialsSaved(false), 2000);
                        import('../../../../utils/haptics').then(m => m.triggerHaptic('medium'));
                      }}
                      style={{ background: '#fff', border: 'none', color: '#000', padding: '6px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                    >
                      {isCredentialsSaved ? '✓ Credentials Saved' : 'Save Credentials'}
                    </button>
                  </div>
                )}

                {((onlineProvider === 'opensubtitles' && apiKey.trim()) || onlineProvider === 'yify') && (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <select
                      value={searchLang}
                      onChange={(e) => setSearchLang(e.target.value)}
                      style={{
                        flex: 1,
                        background: 'rgba(0,0,0,0.3)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: '#fff',
                        padding: '10px',
                        borderRadius: '10px',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        outline: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      {LANGUAGES.map(l => (
                        <option key={l.code} value={l.code} style={{ background: '#111' }}>{l.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleOnlineSubtitleSearch()}
                      disabled={searchingSubs}
                      style={{
                        background: '#ffffff',
                        border: 'none',
                        color: '#000000',
                        padding: '0 20px',
                        borderRadius: '10px',
                        fontWeight: 700,
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        opacity: searchingSubs ? 0.6 : 1
                      }}
                    >
                      {searchingSubs ? (
                        <div style={{ width: '14px', height: '14px', border: '2px solid rgba(0,0,0,0.2)', borderTopColor: '#000', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                      ) : 'Search'}
                    </button>
                  </div>
                )}
              </div>

              {onlineSearchError && (
                <div style={{ color: '#f87171', fontSize: '0.8rem', padding: '10px', background: 'rgba(248, 113, 113, 0.05)', borderRadius: '10px', border: '1px solid rgba(248, 113, 113, 0.1)', textAlign: 'center', fontWeight: 600 }}>
                  {onlineSearchError}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', maxHeight: '25vh' }}>
                {onlineSubs.map((sub, i) => (
                  <div key={i} style={{ display: 'flex', gap: '8px', width: '100%', alignItems: 'stretch' }}>
                    <button
                      onClick={() => handleOnlineSubtitleDownload(sub)}
                      disabled={searchingSubs}
                      style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                        padding: '12px 16px',
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: '12px',
                        color: '#fff',
                        textAlign: 'left',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                    >
                      <span style={{ fontWeight: 700, fontSize: '0.85rem', wordBreak: 'break-all' }}>{sub.name || sub.fileName}</span>
                      <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>Language: {sub.language || (LANGUAGES.find(l => l.code === searchLang)?.name)}</span>
                        {sub.rating !== undefined && sub.rating > 0 && (
                          <span>Rating: {sub.rating} ★</span>
                        )}
                      </span>
                    </button>
                    <button
                      onClick={() => saveOnlineSubtitleToDevice(sub)}
                      disabled={searchingSubs}
                      title="Save subtitle file to your computer"
                      style={{
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: '12px',
                        color: '#fff',
                        width: '46px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {settingsTab === 'speed' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '8px' }}>
              {[0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0].map((speed) => (
                <button
                  key={speed}
                  onClick={() => {
                    import('../../../../utils/haptics').then(m => m.triggerHaptic('light'));
                    setPlaybackSpeed(speed);
                    setShowSettings(false);
                  }}
                  style={{
                    padding: '14px',
                    borderRadius: '12px',
                    background: playbackSpeed === speed ? '#ffffff' : 'rgba(255,255,255,0.05)',
                    border: 'none',
                    color: playbackSpeed === speed ? '#000000' : '#ffffff',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  {speed === 1.0 ? 'Normal' : `${speed}x`}
                </button>
              ))}
            </div>
          )}


          {settingsTab === 'diagnostics' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '8px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ color: '#ffffff', fontWeight: 700, fontSize: '0.95rem' }}>Stream & Connection Logs</span>
                <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.78rem', lineHeight: 1.4 }}>
                  Detailed error logs from the server when resolving stream links for the current video.
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px' }}>
                    <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}>Current Server:</span>
                    <span style={{ color: '#fff', fontSize: '0.8rem', fontWeight: 700 }}>
                      {selectedServer === 'vidlink-pro' ? 'Vidlink Pro' : selectedServer === 'vidsrc-pm' ? 'VidSrc PM' : 'Universal Player'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}>Vidlink Gateway Logs & Errors:</span>
                    <div style={{ 
                      maxHeight: '180px', 
                      overflowY: 'auto', 
                      background: 'rgba(0,0,0,0.3)', 
                      borderRadius: '8px', 
                      padding: '10px', 
                      fontFamily: 'monospace', 
                      fontSize: '0.74rem', 
                      lineHeight: 1.5,
                      color: vidlinkDiagnostics ? (vidlinkDiagnostics.toLowerCase().includes('success') ? '#4ade80' : '#f87171') : 'rgba(255,255,255,0.4)',
                      border: '1px solid rgba(255,255,255,0.05)',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all'
                    }}>
                      {vidlinkDiagnostics || "No diagnostics captured yet. Try switching to Vidlink Pro to generate fresh logs."}
                    </div>
                  </div>

                  {vidlinkDiagnostics && !vidlinkDiagnostics.toLowerCase().includes('success') && (
                    <div style={{
                      marginTop: '4px',
                      background: 'rgba(248, 113, 113, 0.05)',
                      border: '1px solid rgba(248, 113, 113, 0.1)',
                      borderRadius: '8px',
                      padding: '10px',
                      fontSize: '0.76rem',
                      color: 'rgba(255, 255, 255, 0.8)',
                      lineHeight: 1.4
                    }}>
                      <div style={{ fontWeight: 800, color: '#f87171', marginBottom: '4px' }}>Troubleshooting Action Required:</div>
                      {vidlinkDiagnostics.includes('403') ? (
                        <span>The Vidlink gateways are currently returning a Cloudflare WAF block (HTTP 403 Forbidden). Try using the other Vidlink gateways above.</span>
                      ) : vidlinkDiagnostics.includes('404') ? (
                        <span>This video is not yet present or has been removed from the provider databases (HTTP 404 Not Found).</span>
                      ) : (
                        <span>Network timeout or gateway connection failures detected. Verify that you have an active internet connection.</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
