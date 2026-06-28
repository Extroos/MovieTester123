import React from 'react';
import { registerPlugin, Capacitor } from '@capacitor/core';
import type { Movie, TVShow } from '../../../../types';

const NativeStreamingEngine = registerPlugin<any>('NativeStreamingEngine');

const IS_MOBILE_DEVICE = typeof window !== 'undefined' && /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

interface PlayerSettingsProps {
  showSettings: boolean;
  setShowSettings: (show: boolean) => void;
  settingsTab: 'quality' | 'subtitles' | 'speed' | 'servers' | 'download' | 'diagnostics';
  setSettingsTab: React.Dispatch<React.SetStateAction<'quality' | 'subtitles' | 'speed' | 'servers' | 'download' | 'diagnostics'>>;
  selectedServer: 'vidlink-pro' | 'vidsrc-pm' | 'universal' | 'vidsrc-sbs' | 'vidsrc-wtf-1' | 'vidsrc-wtf-2' | 'vidsrc-wtf-3' | 'vidsrc-wtf-4' | 'vidsrc-pk' | 'vidsrc-fyi' | 'test-server';
  handleServerChange: (serverId: 'vidlink-pro' | 'vidsrc-pm' | 'universal' | 'vidsrc-sbs' | 'vidsrc-wtf-1' | 'vidsrc-wtf-2' | 'vidsrc-wtf-3' | 'vidsrc-wtf-4' | 'vidsrc-pk' | 'vidsrc-fyi' | 'test-server') => Promise<void>;
  isSwitchingServer: boolean;
  connectingServerName: string | null;
  serverError: string | null;
  handleCancelServerSwitch: () => void;
  qualities: { height: number; index: number; label?: string }[];
  currentQuality: number;
  handleQualitySelect: (index: number) => void;
  localTracks: { file: string; label: string; kind: string; default?: boolean; isBackup?: boolean }[];
  activeTrackIndex: number;
  handleTrackSelect: (index: number) => Promise<void>;
  loadingSubtitleIndex: number | null;
  subtitleError: string | null;
  lastAttemptedTrack: { file: string; label: string; kind: string; default?: boolean; isBackup?: boolean } | null;
  handleAlternativeSearch: (label: string) => void;
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
  testServerDiagnostics?: string | null;
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
  playbackSpeed,
  setPlaybackSpeed,
  isDownloading,
  downloadProgress,
  downloadStatus,
  handleDownloadOffline,
  handleCancelDownload,
  setOnlineSearchError,
  setOnlineSubs,
  vidlinkDiagnostics,
  testServerDiagnostics
}: PlayerSettingsProps) {
  const [logs, setLogs] = React.useState<string[]>([]);
  const consoleContainerRef = React.useRef<HTMLDivElement>(null);
  const [clickCount, setClickCount] = React.useState(0);
  const [showConsole, setShowConsole] = React.useState(false);
  const [isTransitioning, setIsTransitioning] = React.useState(false);

  const handleTitleClick = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    if (e.cancelable) {
      e.preventDefault();
    }
    setClickCount(prev => {
      const next = prev + 1;
      if (next >= 3) {
        setShowConsole(true);
      }
      return next;
    });
  };

  const handleTabClick = (tabId: any) => {
    setIsTransitioning(true);
    import('../../../../utils/haptics').then(m => m.triggerHaptic('light'));
    setSettingsTab(tabId);
    setTimeout(() => {
      setIsTransitioning(false);
    }, 280);
  };

  const [configUrl, setConfigUrl] = React.useState(() => {
    return localStorage.getItem('cinemovie_ota_config_url') || 'https://raw.githubusercontent.com/username/cinemovie-config/main/config.json';
  });

  React.useEffect(() => {
    if ((settingsTab !== 'servers' && !showConsole) || !Capacitor.isNativePlatform()) return;

    let active = true;
    const fetchLogs = async () => {
      try {
        const res = await NativeStreamingEngine.getNativeLogs();
        if (active && res && Array.isArray(res.logs)) {
          setLogs(res.logs);
        }
      } catch (e) {
        console.warn('Failed to fetch native logs:', e);
      }
    };

    fetchLogs();
    const interval = setInterval(fetchLogs, 1000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [settingsTab, showConsole]);

  React.useEffect(() => {
    if (consoleContainerRef.current) {
      consoleContainerRef.current.scrollTop = consoleContainerRef.current.scrollHeight;
    }
  }, [logs]);

  if (!showSettings) return null;

  return (
    <div 
      style={{ 
        position: 'absolute', 
        inset: 0, 
        zIndex: 10020, 
        background: IS_MOBILE_DEVICE ? 'rgba(0, 0, 0, 0.75)' : 'rgba(0, 0, 0, 0.6)', 
        backdropFilter: IS_MOBILE_DEVICE ? 'none' : 'blur(8px)',
        WebkitBackdropFilter: IS_MOBILE_DEVICE ? 'none' : 'blur(8px)',
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
          <h3 onClick={handleTitleClick} onTouchStart={handleTitleClick} style={{ margin: 0, color: '#fff', fontSize: '1.1rem', fontWeight: 800, letterSpacing: '-0.02em', cursor: 'pointer', userSelect: 'none', padding: '6px 12px', border: '1.5px dashed rgba(255,255,255,0.25)', borderRadius: '8px', background: 'rgba(255,255,255,0.02)', display: 'inline-block' }}>Player Options</h3>
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
            { id: 'quality', label: selectedServer === 'vidsrc-wtf-2' ? 'Languages' : 'Quality', show: qualities.length > 0 },
            { id: 'subtitles', label: 'Subtitles', show: true },
            { id: 'speed', label: 'Speed', show: true }
          ].filter(t => t.show).map(tab => (
            <button
              key={tab.id}
              className="settings-tab-btn"
              onClick={() => handleTabClick(tab.id)}
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

        <div className="player-settings-content" style={{ flex: 1, overflowY: 'auto', height: '420px', maxHeight: '55vh', scrollbarWidth: 'none', pointerEvents: isTransitioning ? 'none' : 'auto' }}>
          {settingsTab === 'servers' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {isSwitchingServer && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ 
                    width: '18px', height: '18px', 
                    border: '2px solid rgba(255,255,255,0.2)', borderTopColor: '#ffffff', 
                    borderRadius: '50%', animation: 'spin 0.8s linear infinite' 
                  }} />
                  <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.82rem', fontWeight: 600 }}>
                    Resolving stream from {connectingServerName || 'server'}...
                  </span>
                </div>
              )}
              <>
                  {serverError && (
                    <div style={{
                      color: '#f87171',
                      fontSize: '0.8rem',
                      padding: '14px 16px',
                      background: 'rgba(248, 113, 113, 0.05)',
                      borderRadius: '14px',
                      border: '1px solid rgba(248, 113, 113, 0.15)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      marginBottom: '10px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700 }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                          <line x1="12" y1="9" x2="12" y2="13"/>
                          <line x1="12" y1="17" x2="12.01" y2="17"/>
                        </svg>
                        <span>Connection to {selectedServer === 'vidlink-pro' ? 'Vidlink Pro' : selectedServer} Failed</span>
                      </div>
                      <span style={{ opacity: 0.85, lineHeight: 1.4 }}>{serverError}</span>

                    </div>
                  )}
                  
                  <div style={{ color: '#fff', fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '6px' }}>
                    Ad-Free Native Streams (Premium Custom Player)
                  </div>
                  <div className="server-cards-grid" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {[
                      { id: 'vidlink-pro', name: 'Vidlink Pro', description: 'Primary gateway — native ad-free stream', badge: 'Recommended' },
                      { id: 'test-server', name: 'VidSrc.to', description: 'Local native stream extraction', badge: 'Ad-Free Native' },
                      { id: 'vidsrc-wtf-2', name: 'VidSrc WTF (Multi Lang)', description: 'Multi-language native stream player', badge: 'Ad-Free Native' },
                      { id: 'vidsrc-sbs', name: 'VidSrc SBS', description: 'Clean resolved native stream player', badge: 'Ad-Free Native' },
                      { id: 'vidsrc-pk', name: 'VidSrc PK', description: 'Fast resolved native stream player', badge: 'Ad-Free Native' },
                      { id: 'vidsrc-fyi', name: 'VidSrc FYI', description: 'Multi-server resolved native stream player', badge: 'Ad-Free Native' },
                    ].map((srv) => (
                      <div key={srv.id} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <button
                          className="server-card"
                          onClick={() => handleServerChange(srv.id as any)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '12px 14px',
                            background: selectedServer === srv.id ? 'rgba(255,255,255,0.06)' : 'transparent',
                            border: selectedServer === srv.id ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(255,255,255,0.05)',
                            borderRadius: '10px',
                            cursor: 'pointer',
                            color: '#fff',
                            width: '100%',
                            transition: 'all 0.2s',
                            textAlign: 'left'
                          }}
                        >
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'flex-start' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '0.86rem', fontWeight: 800 }}>{srv.name}</span>
                              <span style={{ fontSize: '0.62rem', fontWeight: 900, background: 'rgba(255,255,255,0.08)', padding: '2px 6px', borderRadius: '4px', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>{srv.badge}</span>
                            </div>
                            <span style={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.45)', fontWeight: 600 }}>{srv.description}</span>
                          </div>
                          {selectedServer === srv.id && (
                            <span style={{ color: '#4ade80', fontSize: '1rem', display: 'block' }}>✓</span>
                          )}
                        </button>
                        
                        {srv.id === 'test-server' && testServerDiagnostics && (
                          <div style={{
                            background: 'rgba(0, 0, 0, 0.4)',
                            padding: '8px 12px',
                            borderRadius: '8px',
                            fontFamily: 'monospace',
                            fontSize: '0.72rem',
                            color: '#fb7185',
                            wordBreak: 'break-all',
                            textAlign: 'left',
                            borderLeft: '2px solid #fb7185',
                            marginTop: '2px',
                            lineHeight: 1.4
                          }}>
                            <strong>VidSrc.to Diagnostics:</strong>
                            <div style={{ marginTop: '4px', opacity: 0.9 }}>{testServerDiagnostics}</div>
                          </div>
                        )}

                      </div>
                    ))}
                  </div>

                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '6px', marginTop: '12px' }}>
                    With Ads / External Iframe Embeds
                  </div>
                  <div className="server-cards-grid" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {[
                      { id: 'vidsrc-wtf-1', name: 'VidSrc WTF (Multi Server)', description: 'Iframe mirror containing popups & standard video watermarks', badge: 'With Ads' },
                      { id: 'vidsrc-wtf-3', name: 'VidSrc WTF (Multi Embed)', description: 'Iframe mirror containing popups & standard video watermarks', badge: 'With Ads' },
                      { id: 'vidsrc-wtf-4', name: 'VidSrc WTF (Premium)', description: 'External premium link list loaded in an iframe fallback', badge: 'With Ads' },
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
                                : 'rgba(239, 68, 68, 0.15)',
                              color: selectedServer === srv.id
                                ? '#333'
                                : '#f87171',
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



                  {showConsole && (
                    <div style={{
                      marginTop: '16px',
                      background: '#0d0d0d',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '12px',
                      padding: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#fb7185', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Native Engine Logs (Real-time Console)
                        </span>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            onClick={async () => {
                              try {
                                if (navigator.clipboard) {
                                  await navigator.clipboard.writeText(logs.join('\n'));
                                } else {
                                  throw new Error('Clipboard API unavailable');
                                }
                                alert('Logs copied to clipboard!');
                              } catch (e) {
                                const textArea = document.createElement("textarea");
                                textArea.value = logs.join('\n');
                                document.body.appendChild(textArea);
                                textArea.select();
                                document.execCommand("copy");
                                document.body.removeChild(textArea);
                                alert('Logs copied to clipboard!');
                              }
                            }}
                            style={{
                              background: 'rgba(255,255,255,0.06)',
                              border: 'none',
                              color: 'rgba(255,255,255,0.6)',
                              fontSize: '0.66rem',
                              fontWeight: 700,
                              padding: '4px 8px',
                              borderRadius: '6px',
                              cursor: 'pointer'
                            }}
                          >
                            Copy Logs
                          </button>
                          <button
                            onClick={async () => {
                              try {
                                await NativeStreamingEngine.clearNativeLogs();
                                setLogs([]);
                              } catch (e) {}
                            }}
                            style={{
                              background: 'rgba(255,255,255,0.06)',
                              border: 'none',
                              color: 'rgba(255,255,255,0.6)',
                              fontSize: '0.66rem',
                              fontWeight: 700,
                              padding: '4px 8px',
                              borderRadius: '6px',
                              cursor: 'pointer'
                            }}
                          >
                            Clear Console
                          </button>
                        </div>
                      </div>
                      <div 
                        ref={consoleContainerRef}
                        style={{
                          height: '140px',
                          overflowY: 'auto',
                          background: '#050505',
                          borderRadius: '8px',
                          padding: '8px',
                          fontFamily: 'monospace',
                          fontSize: '0.68rem',
                          color: '#34d399',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '4px',
                          boxShadow: 'inset 0 0 10px rgba(0,0,0,0.8)'
                        }}
                      >
                        {logs.length === 0 ? (
                          <div style={{ color: 'rgba(255,255,255,0.3)', fontStyle: 'italic', textAlign: 'center', marginTop: '40px' }}>
                            No logs generated yet. Select a native scraper to begin.
                          </div>
                        ) : (
                          logs.map((log, index) => {
                            let color = '#34d399'; // green for default
                            if (log.includes('Failed') || log.includes('error') || log.includes('crash') || log.includes('HTTP 4') || log.includes('HTTP 5')) {
                              color = '#f87171'; // red for errors
                            } else if (log.includes('Fetch') || log.includes('request') || log.includes('proxyFetch')) {
                              color = '#60a5fa'; // blue for requests
                            }
                            return (
                              <div key={index} style={{ color, wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>
                                {log}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
                </>
            </div>
          )}

          {settingsTab === 'quality' && qualities.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: '8px' }}>
              {selectedServer !== 'vidsrc-wtf-2' && (
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
              )}
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
                  {q.label || `${q.height}p`}
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

              {(() => {
                const officialTracks = localTracks.filter(t => !t.isBackup);
                const backupTracks = localTracks.filter(t => !!t.isBackup);

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {/* OFF BUTTON */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '8px' }}>
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
                    </div>

                    {/* SECTION 1: Official Server Subtitles */}
                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '4px', marginTop: '4px' }}>
                      Official Server Subtitles
                    </div>
                    {officialTracks.length === 0 ? (
                      <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', padding: '8px', textAlign: 'left' }}>
                        No official subtitles returned by this server.
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '8px' }}>
                        {localTracks.map((track, i) => {
                          if (track.isBackup) return null;
                          const isLoading = loadingSubtitleIndex === i;
                          const isActive = activeTrackIndex === i;
                          return (
                            <button 
                              key={i}
                              disabled={loadingSubtitleIndex !== null}
                              onClick={() => handleTrackSelect(i)}
                              style={{ 
                                padding: '14px 10px', 
                                background: isActive ? '#ffffff' : 'rgba(255,255,255,0.05)', 
                                border: '1px solid rgba(255,255,255,0.08)', 
                                borderRadius: '12px',
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
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px' }}>
                                {track.label || `Track ${i+1}`}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* SECTION 2: Backup Subtitles */}
                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '4px', marginTop: '8px' }}>
                      Backup Subtitles (YTS / opensubtitles)
                    </div>
                    {backupTracks.length === 0 ? (
                      <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', padding: '8px', textAlign: 'left' }}>
                        No backup subtitles loaded.
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '8px' }}>
                        {localTracks.map((track, i) => {
                          if (!track.isBackup) return null;
                          const isLoading = loadingSubtitleIndex === i;
                          const isActive = activeTrackIndex === i;
                          return (
                            <button 
                              key={i}
                              disabled={loadingSubtitleIndex !== null}
                              onClick={() => handleTrackSelect(i)}
                              style={{ 
                                padding: '14px 10px', 
                                background: isActive ? '#ffffff' : 'rgba(255,255,255,0.05)', 
                                border: '1px solid rgba(255,255,255,0.08)', 
                                borderRadius: '12px',
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
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px' }}>
                                {track.label || `Track ${i+1}`}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}              {activeTrackIndex !== -1 && (
                <div style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: '20px', 
                  marginTop: '12px',
                  background: 'rgba(255, 255, 255, 0.03)', 
                  padding: '18px', 
                  borderRadius: '16px', 
                  border: '1px solid rgba(255, 255, 255, 0.07)',
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.40)',
                  backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)'
                }}>
                  {/* Title Header */}
                  <div style={{ 
                    color: '#ffffff', 
                    fontSize: '0.8rem', 
                    fontWeight: 900, 
                    textTransform: 'uppercase', 
                    letterSpacing: '0.12em', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '8px',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    paddingBottom: '10px'
                  }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>
                    </svg>
                    Subtitle Customization
                  </div>

                  {/* Premium Live Subtitle Preview */}
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    background: 'rgba(0, 0, 0, 0.35)',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    borderRadius: '12px',
                    padding: '16px 12px',
                    position: 'relative',
                    overflow: 'hidden',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '74px',
                    boxShadow: 'inset 0 0 15px rgba(0, 0, 0, 0.7)'
                  }}>
                    <div style={{
                      position: 'absolute',
                      top: '4px',
                      left: '8px',
                      fontSize: '0.58rem',
                      fontWeight: 900,
                      color: 'rgba(255,255,255,0.25)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em'
                    }}>
                      Live Preview
                    </div>
                    <span style={{
                      color: subtitleColor,
                      backgroundColor: `rgba(0, 0, 0, ${subtitleBgOpacity})`,
                      fontSize: 
                        subtitleSize === 'small' ? '0.85rem' : 
                        subtitleSize === 'normal' ? '1.05rem' : 
                        subtitleSize === 'large' ? '1.25rem' : '1.5rem',
                      fontWeight: 600,
                      borderRadius: '6px',
                      padding: '4px 10px',
                      textAlign: 'center',
                      transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                      textShadow: '0 1.5px 3px rgba(0, 0, 0, 0.95)',
                      maxWidth: '90%',
                      wordBreak: 'break-word',
                      lineHeight: 1.3
                    }}>
                      Sample Subtitle Text
                    </span>
                  </div>

                  {/* Section: Delay & Position */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Sync Delay */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: 'rgba(0,0,0,0.15)', padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.03)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.76rem', fontWeight: 800 }}>
                        <span style={{ color: 'rgba(255,255,255,0.65)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                          Sync Delay
                        </span>
                        <span style={{ 
                          color: subtitleDelay === 0 ? '#ffffff' : subtitleDelay > 0 ? '#4ade80' : '#f87171', 
                          fontFamily: 'monospace',
                          fontWeight: 900,
                          background: 'rgba(255,255,255,0.05)',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          fontSize: '0.74rem'
                        }}>
                          {subtitleDelay === 0 ? '0.0s' : subtitleDelay > 0 ? `+${subtitleDelay.toFixed(1)}s` : `${subtitleDelay.toFixed(1)}s`}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <button 
                          onClick={() => { import('../../../../utils/haptics').then(m => m.triggerHaptic('light')); setSubtitleDelay(prev => Math.max(-30, prev - 0.5)); }}
                          style={{ padding: '8px 10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.06)', color: '#fff', borderRadius: '8px', fontSize: '0.68rem', fontWeight: 800, cursor: 'pointer', transition: 'all 0.15s' }}
                          onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                          onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                        >
                          -0.5s
                        </button>
                        <input 
                          type="range"
                          min="-30"
                          max="30"
                          step="0.5"
                          value={subtitleDelay}
                          onChange={(e) => setSubtitleDelay(parseFloat(e.target.value))}
                          style={{ flex: 1, accentColor: '#ffffff', height: '3px', cursor: 'pointer' }}
                        />
                        <button 
                          onClick={() => { import('../../../../utils/haptics').then(m => m.triggerHaptic('light')); setSubtitleDelay(prev => Math.min(30, prev + 0.5)); }}
                          style={{ padding: '8px 10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.06)', color: '#fff', borderRadius: '8px', fontSize: '0.68rem', fontWeight: 800, cursor: 'pointer', transition: 'all 0.15s' }}
                          onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                          onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                        >
                          +0.5s
                        </button>
                        {subtitleDelay !== 0 && (
                          <button 
                            onClick={() => { import('../../../../utils/haptics').then(m => m.triggerHaptic('light')); setSubtitleDelay(0); }}
                            style={{ padding: '8px 10px', background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#ef4444', borderRadius: '8px', fontSize: '0.68rem', fontWeight: 900, cursor: 'pointer' }}
                          >
                            Reset
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Position shift */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: 'rgba(0,0,0,0.15)', padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.03)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.76rem', fontWeight: 800 }}>
                        <span style={{ color: 'rgba(255,255,255,0.65)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="18 15 12 9 6 15"/></svg>
                          Vertical Position
                        </span>
                        <span style={{ 
                          color: '#ffffff', 
                          fontFamily: 'monospace',
                          fontWeight: 900,
                          background: 'rgba(255,255,255,0.05)',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          fontSize: '0.74rem'
                        }}>
                          {subtitlePosition === 0 ? 'Bottom' : `${Math.abs(subtitlePosition)}px Up`}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.3)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Default</span>
                        <input 
                          type="range"
                          min="-120"
                          max="20"
                          value={subtitlePosition}
                          onChange={(e) => setSubtitlePosition(parseInt(e.target.value))}
                          style={{ flex: 1, accentColor: '#ffffff', height: '3px', cursor: 'pointer' }}
                        />
                        <span style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.3)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>High</span>
                        {subtitlePosition !== -40 && (
                          <button 
                            onClick={() => { import('../../../../utils/haptics').then(m => m.triggerHaptic('light')); setSubtitlePosition(-40); }}
                            style={{ padding: '8px 10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.06)', color: '#fff', borderRadius: '8px', fontSize: '0.68rem', fontWeight: 900, cursor: 'pointer' }}
                          >
                            Reset
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Redesigned Swatches Grid */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '16px' }}>
                    {/* Size and Color Row */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: '14px' }}>
                      {/* Text Size */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Text Size</span>
                        <div style={{ 
                          display: 'flex', 
                          background: 'rgba(0,0,0,0.3)', 
                          border: '1px solid rgba(255,255,255,0.06)', 
                          borderRadius: '10px', 
                          padding: '3px', 
                          gap: '3px' 
                        }}>
                          {(['small', 'normal', 'large', 'xlarge'] as const).map(sz => (
                            <button
                              key={sz}
                              onClick={() => { import('../../../../utils/haptics').then(m => m.triggerHaptic('light')); setSubtitleSize(sz); }}
                              style={{
                                flex: 1,
                                padding: '6px 2px',
                                fontSize: '0.62rem',
                                fontWeight: 900,
                                textTransform: 'uppercase',
                                background: subtitleSize === sz ? '#ffffff' : 'transparent',
                                color: subtitleSize === sz ? '#000000' : 'rgba(255,255,255,0.4)',
                                border: 'none',
                                borderRadius: '7px',
                                cursor: 'pointer',
                                transition: 'all 0.18s ease-out',
                                boxShadow: subtitleSize === sz ? '0 2px 8px rgba(255,255,255,0.15)' : 'none'
                              }}
                            >
                              {sz === 'xlarge' ? 'XL' : sz}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Text Color Swatches */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Text Color</span>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', height: '32px' }}>
                          {[
                            { value: '#ffffff', name: 'White' },
                            { value: '#facc15', name: 'Yellow' },
                            { value: '#4ade80', name: 'Green' },
                            { value: '#22d3ee', name: 'Cyan' },
                          ].map(color => {
                            const isSelected = subtitleColor === color.value;
                            return (
                              <button
                                key={color.value}
                                onClick={() => { import('../../../../utils/haptics').then(m => m.triggerHaptic('light')); setSubtitleColor(color.value); }}
                                style={{
                                  width: '26px',
                                  height: '26px',
                                  borderRadius: '50%',
                                  background: color.value,
                                  border: isSelected ? '2px solid #ffffff' : '1px solid rgba(255,255,255,0.2)',
                                  transform: isSelected ? 'scale(1.15)' : 'none',
                                  cursor: 'pointer',
                                  transition: 'all 0.18s ease-out',
                                  boxShadow: isSelected ? `0 0 12px ${color.value}` : 'none',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center'
                                }}
                                title={color.name}
                              >
                                {isSelected && (
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={color.value === '#ffffff' ? '#000000' : '#ffffff'} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Background Opacity segment controls */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Background Opacity</span>
                      <div style={{ 
                        display: 'flex', 
                        background: 'rgba(0,0,0,0.3)', 
                        border: '1px solid rgba(255,255,255,0.06)', 
                        borderRadius: '10px', 
                        padding: '3px', 
                        gap: '3px' 
                      }}>
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
                              padding: '8px 4px',
                              fontSize: '0.62rem',
                              fontWeight: 900,
                              textTransform: 'uppercase',
                              background: subtitleBgOpacity === op.val ? '#ffffff' : 'transparent',
                              color: subtitleBgOpacity === op.val ? '#000000' : 'rgba(255,255,255,0.4)',
                              border: 'none',
                              borderRadius: '7px',
                              cursor: 'pointer',
                              transition: 'all 0.18s ease-out',
                              boxShadow: subtitleBgOpacity === op.val ? '0 2px 8px rgba(255,255,255,0.15)' : 'none'
                            }}
                          >
                            {op.label}
                          </button>
                        ))}
                      </div>
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
                  <button
                    key={i}
                    onClick={() => handleOnlineSubtitleDownload(sub)}
                    disabled={searchingSubs}
                    style={{
                      width: '100%',
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
                ))}
              </div>
            </div>
          )}

          {settingsTab === 'download' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '8px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ color: '#ffffff', fontWeight: 700, fontSize: '0.95rem' }}>Offline Video Downloader</span>
                <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.78rem', lineHeight: 1.4 }}>
                  Cache this video to your local storage to play back smoothly without network buffering or internet access.
                </span>
              </div>

              <div style={{ 
                background: 'rgba(255,200,100,0.03)', 
                border: '1px solid rgba(255,200,100,0.15)', 
                borderRadius: '16px', 
                padding: '24px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center'
              }}>
                <div style={{
                  width: '48px', height: '48px',
                  borderRadius: '50%',
                  background: 'rgba(255,200,100,0.06)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px solid rgba(255,200,100,0.15)',
                  color: 'rgba(255,200,100,0.9)'
                }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/>
                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ color: 'rgba(255,200,100,0.95)', fontSize: '0.85rem', fontWeight: 800 }}>Downloads Under Maintenance</span>
                  <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.74rem', lineHeight: 1.4 }}>
                    We are currently optimizing the video downloader for mobile to improve segment caching and battery performance. Offline saving is temporarily paused.
                  </span>
                </div>

                <button
                  disabled
                  style={{
                    width: '100%',
                    padding: '14px 20px',
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.05)',
                    borderRadius: '12px',
                    color: 'rgba(255,255,255,0.25)',
                    fontWeight: 800,
                    fontSize: '0.88rem',
                    cursor: 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}
                >
                  Download Unavailable
                </button>
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



        </div>
      </div>
    </div>
  );
});
