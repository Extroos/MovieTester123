import React, { useState, useEffect } from 'react';
import { COLORS } from '../../../constants';
import { triggerHaptic } from '../../../utils/haptics';
import { Profile, ProfileService } from '../../../services/profiles';
import { Movie } from '../../../types';
import { getBackdropUrl } from '../../../services/tmdb';
import { SettingsService, AppSettings } from '../../../services/settings';
import { WatchProgressService } from '../../../services/progress';
import WatchHistory from './WatchHistory';
import { supabase } from '../../../utils/supabase';
import VersionHistory from './VersionHistory';
import { getLocalServerUrl, setLocalServerUrl } from '../../../services/LocalStreamService';
import { Play, Languages, Sliders, Shield, Users, Copy, Check, Download } from 'lucide-react';
import { useFriends } from '../../../hooks/useFriends';

interface SettingsPageProps {
  onNavigate: (view: any) => void;
  heroBackground: Movie | null;
  activeProfile: Profile | null;
  onSwitchProfile: () => void;
  onLogout: () => void;
}

export default function SettingsPage({ 
  onNavigate, 
  heroBackground, 
  activeProfile, 
  onSwitchProfile, 
  onLogout
}: SettingsPageProps) {
  const [settings, setSettings] = useState<AppSettings>(SettingsService.getAll());
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(activeProfile?.name || '');
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [serverUrl, setServerUrl] = useState(getLocalServerUrl());
  const [serverUrlSaved, setServerUrlSaved] = useState(false);
  const [isTestingUrl, setIsTestingUrl] = useState(false);
  const [testStatus, setTestStatus] = useState<'success' | 'error' | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [showVersionHistory, setShowVersionHistory] = useState(false);

  const handleTestConnection = async (overrideUrl?: string) => {
    const urlToTest = (overrideUrl || serverUrl).trim().replace(/\/$/, '');
    if (!urlToTest) return;
    
    setIsTestingUrl(true);
    setTestStatus(null);
    setTestError(null);
    triggerHaptic('light');
    
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 5000); // 5 second timeout
      
      console.log(`[Settings] Testing connection to: ${urlToTest}/health`);
      const res = await fetch(`${urlToTest}/health`, {
        signal: controller.signal
      });
      clearTimeout(id);
      
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'ok') {
          setTestStatus('success');
          triggerHaptic('medium');
          return;
        }
      }
      throw new Error(`Server returned status: ${res.status}`);
    } catch (e: any) {
      console.error('[Settings] Connection test failed:', e);
      setTestStatus('error');
      setTestError(e.message || 'Server unreachable. Verify the IP address, port, and ensure your PC firewall allows incoming connections.');
      triggerHaptic('heavy');
    } finally {
      setIsTestingUrl(false);
    }
  };

  const [osApiKey, setOsApiKey] = useState(localStorage.getItem('cinemovie_opensubtitles_apikey') || '');
  const [osUsername, setOsUsername] = useState(localStorage.getItem('cinemovie_opensubtitles_username') || '');
  const [osPassword, setOsPassword] = useState(localStorage.getItem('cinemovie_opensubtitles_password') || '');
  const [osSaved, setOsSaved] = useState(false);

  const [activeCategory, setActiveCategory] = useState<'streaming' | 'subtitles' | 'appearance' | 'account' | 'social'>('streaming');

  const { friends, requests, activity, addFriend, acceptFriend, userId, refresh: refreshFriends } = useFriends();
  const [friendInput, setFriendInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [socialMessage, setSocialMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [isSending, setIsSending] = useState(false);

  const getRelativeTime = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const getFriendStatus = (friendId: string) => {
    const friendAct = activity?.find(act => act.friend.id === friendId);
    if (!friendAct) return 'No recent activity';
    const timeStr = getRelativeTime(friendAct.timestamp);
    const title = (friendAct.item as any).title || (friendAct.item as any).name;
    return `Last watched: ${title} (${timeStr})`;
  };

  const [confirmModal, setConfirmModal] = useState<{
    type: 'remove_friend' | 'clear_history' | 'clear_search' | 'delete_profile' | 'delete_account';
    title: string;
    message: string;
    actionText: string;
    isDanger?: boolean;
    metadata?: any;
  } | null>(null);

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleRemoveFriend = (friendId: string) => {
    const friend = friends.find(f => f.id === friendId);
    setConfirmModal({
      type: 'remove_friend',
      title: 'Remove Friend?',
      message: `Are you sure you want to remove ${friend ? friend.name : 'this friend'} from your friends list?`,
      actionText: 'Remove',
      isDanger: true,
      metadata: { friendId }
    });
  };

  const executeRemoveFriend = async (friendId: string) => {
    triggerHaptic('medium');
    const { error } = await supabase
      .from('friends')
      .delete()
      .or(`and(user_id.eq.${userId},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${userId})`);
    
    if (error) {
      console.error('Error removing friend:', error);
      showToast('Failed to remove friend.');
    } else {
      await refreshFriends();
      showToast('Friend removed.');
    }
    setConfirmModal(null);
  };

  const handleClearHistory = async () => {
    setConfirmModal({
      type: 'clear_history',
      title: 'Clear Watch History?',
      message: 'Are you sure you want to clear your entire watch history? This cannot be undone.',
      actionText: 'Clear All',
      isDanger: true
    });
  };

  const executeClearHistory = async () => {
    const success = await WatchProgressService.clearAllProgress();
    if (success) {
      triggerHaptic('heavy');
      showToast('Watch history cleared successfully.');
    } else {
      showToast('Failed to clear watch history.');
    }
    setConfirmModal(null);
  };

  const handleClearSearchHistory = () => {
    setConfirmModal({
      type: 'clear_search',
      title: 'Clear Search History?',
      message: 'Are you sure you want to clear your recent search history?',
      actionText: 'Clear',
      isDanger: true
    });
  };

  const executeClearSearchHistory = () => {
    localStorage.removeItem('recent_searches');
    triggerHaptic('medium');
    showToast('Search history cleared.');
    setConfirmModal(null);
  };

  const handleDeleteProfile = async () => {
    if (!activeProfile) return;
    setConfirmModal({
      type: 'delete_profile',
      title: 'Delete Profile?',
      message: `Are you sure you want to delete the profile "${activeProfile.name}"? This will remove all associated watch history and list items.`,
      actionText: 'Delete Profile',
      isDanger: true
    });
  };

  const executeDeleteProfile = async () => {
    if (!activeProfile) return;
    const success = await ProfileService.deleteProfile(activeProfile.id);
    if (success) {
      triggerHaptic('heavy');
      onSwitchProfile();
    } else {
      showToast('Failed to delete profile.');
    }
    setConfirmModal(null);
  };

  const handleDeleteAccount = async () => {
    setConfirmModal({
      type: 'delete_account',
      title: 'Delete Account permanently?',
      message: 'WARNING: This will permanently delete your Cinemovie account and all data. This action is irreversible. Proceed?',
      actionText: 'Terminate',
      isDanger: true
    });
  };

  const executeDeleteAccount = async () => {
    const { error } = await supabase.rpc('delete_user_data');
    if (error) {
        console.error('Account deletion error:', error);
        showToast('Error terminates account data.');
    }
    await supabase.auth.signOut();
    onLogout();
    setConfirmModal(null);
  };

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize, { passive: true });
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const handleSettingsChange = () => {
      setSettings(SettingsService.getAll());
    };
    window.addEventListener('settingsChanged', handleSettingsChange);
    return () => window.removeEventListener('settingsChanged', handleSettingsChange);
  }, []);

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    SettingsService.set(key, value);
    triggerHaptic('light');
  };

  const handleSaveName = async () => {
    if (activeProfile && tempName.trim() && tempName !== activeProfile.name) {
      const success = await ProfileService.updateProfile(activeProfile.id, { name: tempName.trim() });
      if (success) {
        triggerHaptic('medium');
      }
    }
    setIsEditingName(false);
  };

  const handleSelectAvatar = async (avatarUrl: string) => {
    if (activeProfile) {
      const success = await ProfileService.updateProfile(activeProfile.id, { avatar: avatarUrl });
      if (success) {
        triggerHaptic('medium');
        setShowAvatarPicker(false);
      }
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && activeProfile) {
      setIsUploading(true);
      triggerHaptic('light');
      const publicUrl = await ProfileService.uploadAvatar(file);
      if (publicUrl) {
        await ProfileService.updateProfile(activeProfile.id, { avatar: publicUrl });
        triggerHaptic('medium');
      }
      setIsUploading(false);
    }
  };

  const toggleMinimalHome = () => updateSetting('minimalHome', !settings.minimalHome);
  const toggleAutoNext = () => updateSetting('autoNext', !settings.autoNext);
  const toggleDebug = () => updateSetting('debugMode', !settings.debugMode);
  const toggleHostControlsOnly = () => updateSetting('hostControlsOnly', !settings.hostControlsOnly);
  const toggleAutoJoinParty = () => updateSetting('autoJoinParty', !settings.autoJoinParty);

  // Muted Section Heading Style
  const sectionHeaderStyle = (): React.CSSProperties => ({
    padding: isMobile ? '32px 8px 12px' : '40px 8px 16px',
    fontSize: '0.75rem',
    textTransform: 'uppercase',
    color: 'rgba(255, 255, 255, 0.4)',
    letterSpacing: '0.15em',
    fontWeight: 900,
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
    marginBottom: '8px'
  });

  if (showVersionHistory) {
    return <VersionHistory onBack={() => setShowVersionHistory(false)} />;
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: COLORS.bgPrimary,
      color: '#fff',
      paddingBottom: isMobile ? '100px' : '140px',
      overflowX: 'hidden'
    }}>
      {/* Compact Cinematic Header */}
      <div style={{ 
        position: 'relative', 
        height: isMobile ? '24vh' : '38vh', 
        maxHeight: '350px',
        overflow: 'hidden' 
      }}>
        {heroBackground && (
          <img 
            src={getBackdropUrl(heroBackground.backdropPath, 'original')} 
            alt="" 
            style={{ 
              width: '100%', 
              height: '100%', 
              objectFit: 'cover', 
              opacity: 0.3,
              filter: 'brightness(0.6) contrast(1.2) saturate(1.1)'
            }}
          />
        )}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(to bottom, transparent 0%, rgba(10,10,10,0.8) 70%, #0a0a0a 100%)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          padding: isMobile ? 'calc(88px + env(safe-area-inset-top, 0px)) 20px 16px 20px' : 'calc(108px + env(safe-area-inset-top, 0px)) 5% 40px 5%'
        }}>
          <h1 style={{ 
            margin: 0, 
            fontSize: isMobile ? '2rem' : '3.5rem', 
            fontWeight: 900,
            letterSpacing: '-0.04em'
          }}>Settings</h1>
          <p 
            onClick={() => {
              triggerHaptic('light');
              setShowVersionHistory(true);
            }}
            style={{ 
              margin: '4px 0 0', 
              opacity: 0.5, 
              fontSize: '0.75rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              cursor: 'pointer',
              display: 'inline-block',
              transition: 'opacity 0.2s'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.9'; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.5'; }}
          >Cinemovie v0.5.0</p>

        </div>
      </div>

      {/* Main Settings Wrapper - Centered & Capped for OLED layout */}
      <div style={{ 
        padding: '0 5%', 
        marginTop: isMobile ? '-5px' : '-15px',
        position: 'relative',
        zIndex: 10
      }}>
        <div style={{
          maxWidth: '800px',
          margin: '0 auto',
          width: '100%'
        }}>
          
          {/* Borderless Profile Header Section */}
          <section style={{ marginBottom: isMobile ? '32px' : '48px', padding: '0 8px' }}>
            <div style={{ 
              display: 'flex',
              alignItems: 'center',
              gap: isMobile ? '16px' : '28px',
            }}>
              <div 
                onClick={() => { triggerHaptic('light'); setShowAvatarPicker(true); }}
                style={{
                  position: 'relative',
                  cursor: 'pointer',
                  flexShrink: 0
                }}
              >
                <img 
                  src={activeProfile?.avatar} 
                  alt=""
                  style={{
                    width: isMobile ? '76px' : '96px',
                    height: isMobile ? '76px' : '96px',
                    borderRadius: '50%',
                    objectFit: 'cover',
                    border: '2.5px solid rgba(255,255,255,0.12)'
                  }}
                />
                <div style={{
                  position: 'absolute',
                  bottom: '0px',
                  right: '0px',
                  background: '#ffffff',
                  borderRadius: '50%',
                  width: '26px',
                  height: '26px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '2px solid #0a0a0a',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.5)'
                }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#000000" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                  </svg>
                </div>
              </div>

              <div style={{ flex: 1 }}>
                {isEditingName ? (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input 
                      autoFocus
                      value={tempName}
                      onChange={(e) => setTempName(e.target.value)}
                      onBlur={handleSaveName}
                      onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                      style={{
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: '10px',
                        color: '#fff',
                        padding: '6px 12px',
                        fontSize: isMobile ? '1.1rem' : '1.3rem',
                        fontWeight: 800,
                        width: '100%',
                        maxWidth: '280px',
                        outline: 'none'
                      }}
                    />
                  </div>
                ) : (
                  <div 
                    onClick={() => { triggerHaptic('light'); setIsEditingName(true); setTempName(activeProfile?.name || ''); }}
                    style={{ 
                      fontWeight: 900, 
                      fontSize: isMobile ? '1.45rem' : '2.1rem', 
                      letterSpacing: '-0.04em', 
                      cursor: 'pointer', 
                      color: '#fff',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    {activeProfile?.name}
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2.5">
                      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                    </svg>
                  </div>
                )}
                <div style={{ 
                  fontSize: isMobile ? '0.75rem' : '0.82rem', 
                  fontWeight: 700,
                  opacity: 0.4,
                  marginTop: '4px',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase'
                }}>{activeProfile?.isKids ? 'Kids Discovery Profile' : 'Main Cinema Profile'}</div>
              </div>
              
              <button 
                onClick={onSwitchProfile}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.2)',
                  color: '#fff',
                  padding: isMobile ? '8px 14px' : '10px 18px',
                  borderRadius: '12px',
                  fontSize: isMobile ? '0.75rem' : '0.8rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                Switch
              </button>
            </div>
          </section>

          {/* Watch History */}
          <WatchHistory onItemClick={(item) => window.dispatchEvent(new CustomEvent('movieClick', { detail: item }))} />

          {/* Downloads Card */}
          <div 
            onClick={() => {
              triggerHaptic('light');
              onNavigate('downloads');
            }}
            style={{
              marginTop: '24px',
              padding: isMobile ? '16px 20px' : '20px 24px',
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '14px',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: '4px',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.07)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
            }}
          >
            <div style={{ fontWeight: 800, fontSize: isMobile ? '1rem' : '1.1rem', color: '#fff' }}>Offline Downloads</div>
            <div style={{ fontSize: isMobile ? '0.78rem' : '0.85rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>
              View, play, or delete your downloaded movies and series
            </div>
          </div>

          {/* My List Card */}
          <div 
            onClick={() => {
              triggerHaptic('light');
              onNavigate('mylist');
            }}
            style={{
              marginTop: '12px',
              padding: isMobile ? '16px 20px' : '20px 24px',
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '14px',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: '4px',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.07)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
            }}
          >
            <div style={{ fontWeight: 800, fontSize: isMobile ? '1rem' : '1.1rem', color: '#fff' }}>My List</div>
            <div style={{ fontSize: isMobile ? '0.78rem' : '0.85rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>
              View your bookmarked movies, series, and anime watchlists
            </div>
          </div>

          {/* Main Content Layout with Sidebar */}
          <div style={{
            display: 'flex',
            flexDirection: isMobile ? 'column' : 'row',
            gap: isMobile ? '24px' : '40px',
            alignItems: 'flex-start',
            marginTop: '32px',
            borderTop: '1px solid rgba(255, 255, 255, 0.06)',
            paddingTop: '24px',
            width: '100%'
          }}>
            {/* Sidebar Column */}
            <div style={{
              width: isMobile ? '100%' : '240px',
              flexShrink: 0,
              display: 'flex',
              flexDirection: isMobile ? 'row' : 'column',
              gap: '6px',
              borderRight: isMobile ? 'none' : '1px solid rgba(255, 255, 255, 0.06)',
              borderBottom: isMobile ? '1px solid rgba(255, 255, 255, 0.06)' : 'none',
              paddingBottom: isMobile ? '16px' : '0',
              marginBottom: isMobile ? '8px' : '0',
              overflowX: isMobile ? 'auto' : 'visible',
              whiteSpace: isMobile ? 'nowrap' : 'normal',
              msOverflowStyle: 'none',
              scrollbarWidth: 'none',
              WebkitOverflowScrolling: 'touch',
              paddingLeft: isMobile ? '8px' : '0',
              paddingRight: isMobile ? '8px' : '24px'
            }}>
              {([
                { id: 'streaming', label: 'Streaming', icon: Play },
                { id: 'subtitles', label: 'Subtitles', icon: Languages },
                { id: 'appearance', label: 'Appearance', icon: Sliders },
                { id: 'social', label: 'Friends', icon: Users },
                { id: 'account', label: 'Account', icon: Shield }
              ] as const).map(cat => {
                const isActive = activeCategory === cat.id;
                const Icon = cat.icon;
                return (
                  <button
                    key={cat.id}
                    onClick={() => { triggerHaptic('light'); setActiveCategory(cat.id); }}
                    style={{
                      display: isMobile ? 'inline-flex' : 'flex',
                      alignItems: 'center',
                      gap: isMobile ? '8px' : '12px',
                      width: isMobile ? 'auto' : '100%',
                      padding: isMobile ? '8px 16px' : '12px 16px',
                      borderRadius: isMobile ? '20px' : '8px',
                      border: 'none',
                      background: isActive ? (isMobile ? '#ffffff' : 'rgba(255, 255, 255, 0.08)') : 'transparent',
                      color: isActive ? (isMobile ? '#000000' : '#ffffff') : 'rgba(255, 255, 255, 0.5)',
                      fontWeight: isActive ? 800 : 500,
                      fontSize: isMobile ? '0.8rem' : '0.9rem',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.15s ease',
                      borderLeft: isMobile ? 'none' : (isActive ? '3px solid #ffffff' : '3px solid transparent'),
                      flexShrink: 0
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive && !isMobile) {
                        e.currentTarget.style.color = '#ffffff';
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive && !isMobile) {
                        e.currentTarget.style.color = 'rgba(255, 255, 255, 0.5)';
                        e.currentTarget.style.background = 'transparent';
                      }
                    }}
                  >
                    <Icon size={isMobile ? 14 : 16} strokeWidth={2.5} />
                    <span>{cat.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Settings Content Column */}
            <div key={activeCategory} className="settings-section-animate" style={{ 
              flex: 1, 
              width: '100%',
              display: 'flex', 
              flexDirection: 'column' 
            }}>
            
            {/* 1. Streaming & Server */}
            {activeCategory === 'streaming' && (
              <>
                <div style={sectionHeaderStyle()}>Streaming Settings</div>
                <SettingRow label="Auto-Playback" sub="Seamless transitions between episodes" isMobile={isMobile}>
                  <Switch checked={settings.autoNext} onChange={toggleAutoNext} isMobile={isMobile} />
                </SettingRow>
                <div style={sectionHeaderStyle()}>Watch Together Sync Settings</div>
                <SettingRow label="Host-Only Playback Controls" sub="Lock playback control strictly to the watch party host" isMobile={isMobile}>
                  <Switch checked={settings.hostControlsOnly} onChange={toggleHostControlsOnly} isMobile={isMobile} />
                </SettingRow>
                <SettingRow label="Auto-Join Watch Parties" sub="Automatically accept invites and open player without prompt" isMobile={isMobile}>
                  <Switch checked={settings.autoJoinParty} onChange={toggleAutoJoinParty} isMobile={isMobile} />
                </SettingRow>
              </>
            )}

            {/* 2. Subtitles */}
            {activeCategory === 'subtitles' && (
              <>
                <div style={sectionHeaderStyle()}>Subtitle Engine</div>
                <SettingRow 
                  label="OpenSubtitles API Key" 
                  sub="Required for TV show subtitles search (Get key from opensubtitles.org)" 
                  isMobile={isMobile}
                  stackOnMobile={true}
                >
                  <input
                    type="text"
                    value={osApiKey}
                    onChange={(e) => { setOsApiKey(e.target.value); setOsSaved(false); }}
                    placeholder="Paste API Key here..."
                    style={{
                      width: isMobile ? '100%' : '320px',
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '10px',
                      padding: '8px 12px',
                      color: '#fff',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      outline: 'none',
                      fontFamily: 'monospace',
                    }}
                  />
                </SettingRow>
                <SettingRow 
                  label="OpenSubtitles Credentials" 
                  sub="Username and Password required for subtitle downloads" 
                  isMobile={isMobile}
                  stackOnMobile={true}
                >
                  <div style={{ 
                    display: 'flex', 
                    flexDirection: isMobile ? 'column' : 'row',
                    gap: '8px', 
                    alignItems: 'stretch',
                    width: isMobile ? '100%' : 'auto',
                  }}>
                    <input
                      type="text"
                      value={osUsername}
                      onChange={(e) => { setOsUsername(e.target.value); setOsSaved(false); }}
                      placeholder="Username"
                      style={{
                        width: isMobile ? '100%' : '150px',
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '10px',
                        padding: '8px 12px',
                        color: '#fff',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        outline: 'none',
                      }}
                    />
                    <input
                      type="password"
                      value={osPassword}
                      onChange={(e) => { setOsPassword(e.target.value); setOsSaved(false); }}
                      placeholder="Password"
                      style={{
                        width: isMobile ? '100%' : '150px',
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '10px',
                        padding: '8px 12px',
                        color: '#fff',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        outline: 'none',
                      }}
                    />
                    <button
                      onClick={() => {
                        localStorage.setItem('cinemovie_opensubtitles_apikey', osApiKey.trim());
                        localStorage.setItem('cinemovie_opensubtitles_username', osUsername.trim());
                        localStorage.setItem('cinemovie_opensubtitles_password', osPassword.trim());
                        setOsSaved(true);
                        triggerHaptic('medium');
                        setTimeout(() => setOsSaved(false), 2000);
                      }}
                      style={{
                        background: osSaved ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.1)',
                        border: osSaved ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(255,255,255,0.15)',
                        color: osSaved ? '#22c55e' : '#fff',
                        borderRadius: '10px',
                        padding: '8px 14px',
                        fontWeight: 800,
                        fontSize: '0.82rem',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {osSaved ? '✓ Saved' : 'Save'}
                    </button>
                  </div>
                </SettingRow>


              </>
            )}

            {/* 3. Appearance */}
            {activeCategory === 'appearance' && (
              <>
                <div style={sectionHeaderStyle()}>Cinematic Experience</div>
                <SettingRow label="Minimal Discovery" sub="Simplified home layout" isMobile={isMobile}>
                  <Switch checked={settings.minimalHome} onChange={toggleMinimalHome} isMobile={isMobile} />
                </SettingRow>
                <div style={sectionHeaderStyle()}>Visual Theme</div>
                <SettingRow label="Appearance" sub="Select UI atmosphere" isMobile={isMobile}>
                  <select 
                    value={settings.theme}
                    onChange={(e) => updateSetting('theme', e.target.value as any)}
                    style={{
                      background: 'rgba(255,255,255,0.08)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      color: '#fff',
                      padding: '8px 14px',
                      borderRadius: '12px',
                      fontSize: '0.85rem',
                      fontWeight: 800,
                      outline: 'none',
                      appearance: 'none',
                      textAlign: 'center',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="dark" style={{ background: '#111' }}>Cinematic Dark</option>
                    <option value="amoled" style={{ background: '#000' }}>Deep AMOLED</option>
                    <option value="light" style={{ background: '#fff', color: '#000' }}>Classic Light</option>
                  </select>
                </SettingRow>
                <div style={sectionHeaderStyle()}>Developer Settings</div>
                <SettingRow label="Debug Overlay" sub="Show playback stats and diagnostic logs" isMobile={isMobile}>
                  <Switch checked={settings.debugMode} onChange={toggleDebug} isMobile={isMobile} />
                </SettingRow>
                <div style={sectionHeaderStyle()}>Notification Center</div>
                <SettingRow label="App Notifications" sub="Request permission and test notification alerts" isMobile={isMobile}>
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
                    style={{
                      background: 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      color: '#fff',
                      padding: '8px 16px',
                      borderRadius: '12px',
                      fontSize: '0.82rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    Activate & Test Alerts
                  </button>
                </SettingRow>
              </>
            )}

            {/* 4. Account & Privacy */}
            {activeCategory === 'account' && (
              <>
                <div style={sectionHeaderStyle()}>Privacy & Data</div>
                <SettingRow label="Library History" sub="Wipe all watch progress" isMobile={isMobile}>
                  <button 
                    onClick={handleClearHistory}
                    style={{
                      background: 'transparent',
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                      color: '#fff',
                      padding: '8px 16px',
                      borderRadius: '10px',
                      fontSize: '0.8rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      textTransform: 'uppercase'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    Clear All
                  </button>
                </SettingRow>
                <SettingRow label="Search History" sub="Wipe recent queries" isMobile={isMobile}>
                  <button 
                    onClick={handleClearSearchHistory}
                    style={{
                      background: 'transparent',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#fff',
                      padding: '8px 16px',
                      borderRadius: '10px',
                      fontSize: '0.8rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      textTransform: 'uppercase'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    Clear
                  </button>
                </SettingRow>
                <div style={sectionHeaderStyle()}>Danger Zone</div>
                <SettingRow label="Delete Profile" sub={`Wipe "${activeProfile?.name}" data`} isMobile={isMobile}>
                  <button 
                    onClick={handleDeleteProfile}
                    style={{
                      background: 'transparent',
                      border: '1px solid rgba(239, 68, 68, 0.4)',
                      color: '#ef4444',
                      padding: '8px 16px',
                      borderRadius: '10px',
                      fontSize: '0.8rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    Delete
                  </button>
                </SettingRow>
                <SettingRow label="Terminate Account" sub="Permanent data removal" isMobile={isMobile}>
                  <button 
                    onClick={handleDeleteAccount}
                    style={{
                      background: 'transparent',
                      border: '1px solid #ef4444',
                      color: '#ef4444',
                      padding: '8px 16px',
                      borderRadius: '10px',
                      fontSize: '0.8rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#ef4444'; e.currentTarget.style.color = '#000'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#ef4444'; }}
                  >
                    Terminate
                  </button>
                </SettingRow>
              </>
            )}

            {/* 5. Social & Friends */}
            {activeCategory === 'social' && (
              <>
                <div style={sectionHeaderStyle()}>Social & Friends</div>
                
                {/* 1. Share Identity */}
                <div style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: '12px',
                  padding: isMobile ? '16px' : '20px',
                  marginBottom: '24px',
                  display: 'flex',
                  flexDirection: isMobile ? 'column' : 'row',
                  justifyContent: 'space-between',
                  alignItems: isMobile ? 'flex-start' : 'center',
                  gap: '16px'
                }}>
                  <div>
                    <div style={{ fontSize: '1rem', fontWeight: 800, color: '#fff' }}>Your Unique User Code</div>
                    <div style={{ fontSize: '0.8rem', opacity: 0.4, marginTop: '4px' }}>Share this code with your friends so they can add you.</div>
                  </div>
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '8px',
                    width: isMobile ? '100%' : 'auto'
                  }}>
                    <input
                      readOnly
                      value={userId || ''}
                      style={{
                        background: '#000000',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '8px',
                        padding: '8px 12px',
                        color: '#fff',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        outline: 'none',
                        fontFamily: 'monospace',
                        width: isMobile ? '100%' : '280px',
                        textAlign: 'center'
                      }}
                    />
                    <button
                      onClick={() => {
                        if (userId) {
                          navigator.clipboard.writeText(userId);
                          setCopied(true);
                          triggerHaptic('medium');
                          setTimeout(() => setCopied(false), 2000);
                        }
                      }}
                      style={{
                        background: copied ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.1)',
                        border: copied ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(255,255,255,0.15)',
                        color: copied ? '#22c55e' : '#fff',
                        borderRadius: '8px',
                        padding: '8px 12px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s',
                        height: '34px',
                        width: '38px',
                        flexShrink: 0
                      }}
                    >
                      {copied ? <Check size={16} /> : <Copy size={16} />}
                    </button>
                  </div>
                </div>

                {/* 2. Add Friend Input */}
                <div style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: '12px',
                  padding: isMobile ? '16px' : '20px',
                  marginBottom: '24px'
                }}>
                  <div style={{ fontSize: '1rem', fontWeight: 800, color: '#fff', marginBottom: '12px' }}>Add a Friend</div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'stretch' }}>
                    <input
                      type="text"
                      placeholder="Paste your friend's unique code here..."
                      value={friendInput}
                      onChange={(e) => setFriendInput(e.target.value)}
                      style={{
                        flex: 1,
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '8px',
                        padding: '8px 12px',
                        color: '#fff',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        outline: 'none',
                      }}
                    />
                    <button
                      onClick={async () => {
                        if (!friendInput.trim()) return;
                        setIsSending(true);
                        triggerHaptic('light');
                        const res = await addFriend(friendInput.trim());
                        setIsSending(false);
                        if (res.success) {
                          setFriendInput('');
                          setSocialMessage({ type: 'success', text: res.message });
                          triggerHaptic('medium');
                        } else {
                          setSocialMessage({ type: 'error', text: res.message });
                          triggerHaptic('heavy');
                        }
                        setTimeout(() => setSocialMessage(null), 4000);
                      }}
                      disabled={isSending || !friendInput.trim()}
                      style={{
                        background: '#ffffff',
                        border: 'none',
                        color: '#000000',
                        borderRadius: '8px',
                        padding: '8px 16px',
                        fontWeight: 800,
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        transition: 'opacity 0.2s',
                        opacity: (isSending || !friendInput.trim()) ? 0.5 : 1
                      }}
                    >
                      {isSending ? 'Sending...' : 'Add Friend'}
                    </button>
                  </div>
                  {socialMessage && (
                    <div style={{
                      marginTop: '12px',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      color: socialMessage.type === 'success' ? '#22c55e' : '#ef4444'
                    }}>
                      {socialMessage.text}
                    </div>
                  )}
                </div>

                {/* 3. Pending Invites */}
                <div style={{ marginBottom: '32px' }}>
                  <div style={{ 
                    fontSize: '0.75rem', 
                    textTransform: 'uppercase', 
                    color: 'rgba(255, 255, 255, 0.4)', 
                    letterSpacing: '0.15em', 
                    fontWeight: 900,
                    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                    paddingBottom: '8px',
                    marginBottom: '16px'
                  }}>Pending Friend Requests ({requests.length})</div>

                  {requests.length === 0 ? (
                    <div style={{ padding: '16px 8px', fontSize: '0.85rem', opacity: 0.4, fontWeight: 500 }}>No pending friend requests.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {requests.map((req) => (
                        <div 
                          key={req.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '12px 16px',
                            background: 'rgba(255, 255, 255, 0.02)',
                            border: '1px solid rgba(255, 255, 255, 0.04)',
                            borderRadius: '12px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <img
                              src={req.senderAvatar || 'https://upload.wikimedia.org/wikipedia/commons/0/0b/Netflix-avatar.png'}
                              alt=""
                              style={{ width: '38px', height: '38px', borderRadius: '50%', objectFit: 'cover' }}
                            />
                            <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{req.senderName}</div>
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              onClick={() => {
                                triggerHaptic('medium');
                                acceptFriend(req.id, req.sender_id);
                              }}
                              style={{
                                background: '#22c55e',
                                border: 'none',
                                color: '#fff',
                                padding: '6px 12px',
                                borderRadius: '8px',
                                fontSize: '0.8rem',
                                fontWeight: 800,
                                cursor: 'pointer'
                              }}
                            >
                              Accept
                            </button>
                            <button
                              onClick={async () => {
                                triggerHaptic('light');
                                await supabase.from('friend_requests').delete().eq('id', req.id);
                                // Trigger state refresh via settings change dispatcher
                                window.dispatchEvent(new CustomEvent('settingsChanged'));
                              }}
                              style={{
                                background: 'transparent',
                                border: '1px solid rgba(255,255,255,0.15)',
                                color: 'rgba(255,255,255,0.6)',
                                padding: '6px 12px',
                                borderRadius: '8px',
                                fontSize: '0.8rem',
                                fontWeight: 800,
                                cursor: 'pointer'
                              }}
                            >
                              Decline
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 4. Friends List */}
                <div>
                  <div style={{ 
                    fontSize: '0.75rem', 
                    textTransform: 'uppercase', 
                    color: 'rgba(255, 255, 255, 0.4)', 
                    letterSpacing: '0.15em', 
                    fontWeight: 900,
                    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                    paddingBottom: '8px',
                    marginBottom: '16px'
                  }}>Friends ({friends.length})</div>

                  {friends.length === 0 ? (
                    <div style={{ padding: '16px 8px', fontSize: '0.85rem', opacity: 0.4, fontWeight: 500 }}>You haven't added any friends yet.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {friends.map((friend) => (
                        <div 
                          key={friend.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '14px 16px',
                            background: 'rgba(255, 255, 255, 0.02)',
                            border: '1px solid rgba(255, 255, 255, 0.04)',
                            borderRadius: '12px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <img
                              src={friend.avatar || 'https://upload.wikimedia.org/wikipedia/commons/0/0b/Netflix-avatar.png'}
                              alt=""
                              style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' }}
                            />
                            <div>
                              <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>{friend.name}</div>
                              <div style={{ fontSize: '0.75rem', opacity: 0.5, marginTop: '2px', color: '#22c55e', fontWeight: 600 }}>
                                {getFriendStatus(friend.id)}
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => handleRemoveFriend(friend.id)}
                            style={{
                              background: 'transparent',
                              border: '1px solid rgba(239, 68, 68, 0.3)',
                              color: '#ef4444',
                              padding: '6px 14px',
                              borderRadius: '8px',
                              fontSize: '0.8rem',
                              fontWeight: 800,
                              cursor: 'pointer',
                              transition: 'all 0.2s',
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

          {/* Centered Logout Action Button */}
          <div style={{ 
            marginTop: '56px', 
            display: 'flex', 
            justifyContent: 'center' 
          }}>
            <button 
              onClick={() => { triggerHaptic('heavy'); onLogout(); }}
              style={{
                background: 'transparent',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: '#fff',
                padding: '12px 36px',
                borderRadius: '12px',
                fontWeight: 800,
                fontSize: '0.9rem',
                cursor: 'pointer',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => { 
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'; 
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.25)';
              }}
              onMouseLeave={(e) => { 
                e.currentTarget.style.background = 'transparent'; 
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
              }}
            >
              Log Out
            </button>
          </div>

          {/* Footer Copyright Removed */}

        </div>
      </div>

      {/* Avatar Picker Modal */}
      {showAvatarPicker && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(30px) saturate(200%)',
          WebkitBackdropFilter: 'blur(30px) saturate(200%)',
          zIndex: 5000,
          display: 'flex',
          flexDirection: 'column',
          padding: 'calc(24px + env(safe-area-inset-top)) 24px 40px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '2rem', fontWeight: 900, letterSpacing: '-0.05em' }}>Gallery</h2>
              <p style={{ margin: '4px 0 0', opacity: 0.5, fontSize: '0.9rem', fontWeight: 700 }}>Choose your cinematic identity</p>
            </div>
            <button 
              onClick={() => { triggerHaptic('light'); setShowAvatarPicker(false); }}
              aria-label="Close"
              style={{ 
                background: 'rgba(255,255,255,0.1)', 
                border: 'none', 
                color: '#fff', 
                width: '44px', 
                height: '44px', 
                borderRadius: '50%', 
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
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
              {isUploading ? 'Uploading...' : 'Upload Custom Image'}
              <input type="file" accept="image/*" onChange={handleFileUpload} disabled={isUploading} style={{ display: 'none' }} />
            </label>
          </div>

          <div style={{ 
            flex: 1, 
            overflowY: 'auto', 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(70px, 1fr))', 
            gap: '12px',
            paddingBottom: '40px'
          }}>
            {Array.from({ length: 67 }).map((_, i) => (
              <img 
                key={i}
                src={`/avatars/avatar-${i + 1}.jpg`}
                alt=""
                onClick={() => handleSelectAvatar(`/avatars/avatar-${i + 1}.jpg`)}
                style={{
                  width: '100%',
                  aspectRatio: '1/1',
                  borderRadius: '12px',
                  objectFit: 'cover',
                  cursor: 'pointer',
                  border: activeProfile?.avatar === `/avatars/avatar-${i + 1}.jpg` ? `3px solid ${COLORS.primary}` : '2px solid transparent'
                }}
              />
            ))}
          </div>
        </div>
      )}
      {/* Toast Message Banners */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          bottom: isMobile ? '80px' : '40px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(255, 255, 255, 0.95)',
          color: '#000000',
          padding: '12px 24px',
          borderRadius: '30px',
          zIndex: 6000,
          fontWeight: 800,
          fontSize: '0.88rem',
          boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
          animation: 'fadeIn 0.2s ease-out',
          backdropFilter: 'blur(10px)',
          whiteSpace: 'nowrap'
        }}>
          {toastMessage}
        </div>
      )}

      {/* State-driven Premium Confirmation Bottom Sheet / Drawer */}
      {confirmModal && (
        <div
          onClick={() => setConfirmModal(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 5500,
            background: 'rgba(0,0,0,0.76)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '480px',
              background: '#09090b',
              borderRadius: '24px 24px 0 0',
              border: '1px solid rgba(255,255,255,0.08)',
              borderBottom: 'none',
              boxShadow: '0 -20px 60px rgba(0,0,0,0.8)',
              padding: '24px 24px calc(24px + env(safe-area-inset-bottom, 24px))',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
            }}
          >
            {/* Grab handle */}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div style={{ width: '40px', height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.2)' }} />
            </div>

            <div style={{ textAlign: 'center' }}>
              <h3 style={{ margin: '0 0 10px', fontSize: '1.25rem', fontWeight: 900, color: '#fff', letterSpacing: '-0.02em' }}>
                {confirmModal.title}
              </h3>
              <p style={{ margin: 0, fontSize: '0.9rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.5, fontWeight: 500 }}>
                {confirmModal.message}
              </p>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
              <button
                onClick={() => setConfirmModal(null)}
                style={{
                  flex: 1,
                  padding: '14px',
                  borderRadius: '14px',
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(255,255,255,0.04)',
                  color: '#fff',
                  fontWeight: 800,
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (confirmModal.type === 'remove_friend') {
                    executeRemoveFriend(confirmModal.metadata?.friendId);
                  } else if (confirmModal.type === 'clear_history') {
                    executeClearHistory();
                  } else if (confirmModal.type === 'clear_search') {
                    executeClearSearchHistory();
                  } else if (confirmModal.type === 'delete_profile') {
                    executeDeleteProfile();
                  } else if (confirmModal.type === 'delete_account') {
                    executeDeleteAccount();
                  }
                }}
                style={{
                  flex: 1,
                  padding: '14px',
                  borderRadius: '14px',
                  border: 'none',
                  background: confirmModal.isDanger ? '#ef4444' : '#ffffff',
                  color: confirmModal.isDanger ? '#ffffff' : '#000000',
                  fontWeight: 900,
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                }}
              >
                {confirmModal.actionText}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

interface SettingRowProps {
  label: string;
  sub: string;
  isMobile: boolean;
  children: React.ReactNode;
  stackOnMobile?: boolean;
}

function SettingRow({ label, sub, isMobile, children, stackOnMobile = false }: SettingRowProps) {
  const [hovered, setHovered] = useState(false);
  const shouldStack = isMobile && stackOnMobile;

  return (
    <div 
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: isMobile ? '16px 8px' : '20px 8px',
        display: 'flex',
        flexDirection: shouldStack ? 'column' : 'row',
        justifyContent: 'space-between',
        alignItems: shouldStack ? 'stretch' : 'center',
        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
        background: hovered ? 'rgba(255, 255, 255, 0.02)' : 'transparent',
        borderRadius: '12px',
        gap: shouldStack ? '12px' : '16px',
        transition: 'all 0.2s ease',
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 800, fontSize: isMobile ? '0.95rem' : '1.1rem', marginBottom: '2px', color: '#fff' }}>
          {label}
        </div>
        <div style={{ fontSize: isMobile ? '0.72rem' : '0.82rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>
          {sub}
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: shouldStack ? 'stretch' : 'flex-end', width: shouldStack ? '100%' : 'auto' }}>
        {children}
      </div>
    </div>
  );
}

function Switch({ checked, onChange, isMobile }: { checked: boolean, onChange: () => void, isMobile?: boolean }) {
  const trackWidth = isMobile ? 42 : 50;
  const trackHeight = isMobile ? 24 : 28;
  const knobSize = isMobile ? 18 : 22;
  const padding = 2;

  return (
    <div 
      onClick={onChange}
      style={{
        width: `${trackWidth}px`,
        height: `${trackHeight}px`,
        background: checked ? '#ffffff' : 'rgba(255,255,255,0.06)',
        borderRadius: '30px',
        position: 'relative',
        transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        cursor: 'pointer',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: checked ? '0 0 12px rgba(255, 255, 255, 0.15)' : 'none'
      }}
    >
      <div style={{
        position: 'absolute',
        top: `${padding}px`,
        left: `${checked ? (trackWidth - knobSize - padding) : padding}px`,
        width: `${knobSize}px`,
        height: `${knobSize}px`,
        background: checked ? '#000000' : '#ffffff',
        borderRadius: '50%',
        transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
      </div>
    </div>
  );
}
