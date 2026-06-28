import React, { useState, useEffect } from 'react';
import { COLORS } from '../../../constants';
import { triggerHaptic } from '../../../utils/haptics';
import packageJson from '../../../../package.json';
import { Profile, ProfileService } from '../../../services/profiles';
import { t } from '../../../utils/i18n';
import { Movie } from '../../../types';
import { getBackdropUrl, getPosterUrl } from '../../../services/tmdb';
import { SettingsService, AppSettings } from '../../../services/settings';
import { WatchProgressService } from '../../../services/progress';
import WatchHistory from './WatchHistory';
import { supabase } from '../../../utils/supabase';
import VersionHistory from './VersionHistory';
import { getLocalServerUrl, setLocalServerUrl } from '../../../services/LocalStreamService';
import { Play, Languages, Sliders, Shield, Users, Copy, Check, Download, Eye, EyeOff, ChevronRight, ChevronLeft, List, BarChart2, LogOut, User } from 'lucide-react';
import { useFriends } from '../../../hooks/useFriends';
import { StatsService } from '../../../services/user/stats';

import { SettingRow, Switch } from './settingpage/SettingsRow';
import ReauthModal from './settingpage/ReauthModal';
import AvatarPicker from './settingpage/AvatarPicker';
import StreamingSubPage from './settingpage/StreamingSubPage';
import SubtitlesSubPage from './settingpage/SubtitlesSubPage';
import AppearanceSubPage from './settingpage/AppearanceSubPage';
import StatisticsSubPage from './settingpage/StatisticsSubPage';
import AccountSubPage from './settingpage/AccountSubPage';
import SocialSubPage from './settingpage/SocialSubPage';
import MyListSubPage from './settingpage/MyListSubPage';


interface SettingsPageProps {
  onNavigate: (view: any) => void;
  heroBackground: Movie | null;
  activeProfile: Profile | null;
  onSwitchProfile: () => void;
  onLogout: () => void;
  activeSubPage?: 'streaming' | 'subtitles' | 'appearance' | 'account' | 'social' | 'statistics' | 'mylist' | null;
  onActiveSubPageChange?: (subPage: 'streaming' | 'subtitles' | 'appearance' | 'account' | 'social' | 'statistics' | 'mylist' | null) => void;
  showVersionHistory: boolean;
  onShowVersionHistoryChange: (show: boolean) => void;
  onMovieClick?: (movie: any) => void;
  isVisible?: boolean;
}

export default function SettingsPage({ 
  onNavigate, 
  heroBackground, 
  activeProfile, 
  onSwitchProfile, 
  onLogout,
  activeSubPage: propActiveSubPage,
  onActiveSubPageChange,
  showVersionHistory,
  onShowVersionHistoryChange,
  onMovieClick,
  isVisible = true
}: SettingsPageProps) {
  const [settings, setSettings] = useState<AppSettings>({ ...SettingsService.getAll() });
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(activeProfile?.name || '');
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [serverUrl, setServerUrl] = useState(getLocalServerUrl());
  const [serverUrlSaved, setServerUrlSaved] = useState(false);
  const [isTestingUrl, setIsTestingUrl] = useState(false);
  const [testStatus, setTestStatus] = useState<'success' | 'error' | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [profileStats, setProfileStats] = useState<any>(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [showOsPassword, setShowOsPassword] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [authProvider, setAuthProvider] = useState<string | null>(null);
  const [reauthAction, setReauthAction] = useState<'delete_profile' | 'delete_account' | 'change_password' | null>(null);
  const [reauthPassword, setReauthPassword] = useState('');
  const [isVerifyingReauth, setIsVerifyingReauth] = useState(false);
  const [reauthError, setReauthError] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showPasswordChangeForm, setShowPasswordChangeForm] = useState(false);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        setCurrentUser(user);
        if (user) {
          const provider = user.app_metadata?.provider || user.identities?.[0]?.provider || 'email';
          setAuthProvider(provider);
        }
      } catch (err) {
        console.error('Error fetching auth user:', err);
      }
    };
    fetchUser();
  }, []);

  const handleVerifyReauth = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!currentUser) return;
    
    setIsVerifyingReauth(true);
    setReauthError(null);
    triggerHaptic('light');

    try {
      const provider = authProvider || 'email';
      
      if (provider === 'email') {
        if (!reauthPassword.trim()) {
          setReauthError('Password is required');
          setIsVerifyingReauth(false);
          return;
        }
        
        const { error } = await supabase.auth.signInWithPassword({
          email: currentUser.email,
          password: reauthPassword,
        });

        if (error) {
          setReauthError('Incorrect password. Please try again.');
          triggerHaptic('heavy');
          setIsVerifyingReauth(false);
          return;
        }
      }

      // Reauth verification succeeded!
      triggerHaptic('medium');
      const action = reauthAction;
      setReauthAction(null);
      setReauthPassword('');

      if (action === 'delete_profile') {
        executeDeleteProfile();
      } else if (action === 'delete_account') {
        executeDeleteAccount();
      } else if (action === 'change_password') {
        const { error } = await supabase.auth.updateUser({
          password: newPassword,
        });

        if (error) {
          showToast(`Password update failed: ${error.message}`);
        } else {
          showToast('Password changed successfully.');
          setNewPassword('');
          setConfirmNewPassword('');
          setShowPasswordChangeForm(false);
        }
      }
    } catch (err: any) {
      setReauthError(err.message || 'An error occurred during verification.');
      triggerHaptic('heavy');
    } finally {
      setIsVerifyingReauth(false);
    }
  };

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

  const [internalActiveSubPage, setInternalActiveSubPage] = useState<'streaming' | 'subtitles' | 'appearance' | 'account' | 'social' | 'statistics' | 'mylist' | null>(null);
  const activeSubPage = propActiveSubPage !== undefined ? propActiveSubPage : internalActiveSubPage;
  const setActiveSubPage = onActiveSubPageChange || setInternalActiveSubPage;

  useEffect(() => {
    if (activeProfile && activeSubPage === 'statistics') {
      StatsService.getStats(activeProfile.id).then(stats => {
        setProfileStats(stats);
      });
    }
    // Scroll to top whenever user enters a subpage
    if (activeSubPage) {
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    }
  }, [activeProfile, activeSubPage]);

  const { 
    friends, 
    requests, 
    sentRequests, 
    activity, 
    loading: friendsLoading, 
    userId, 
    accountName, 
    addFriend, 
    acceptFriend, 
    cancelSentRequest, 
    declineReceivedRequest, 
    searchUsers, 
    refresh: refreshFriends 
  } = useFriends();
  const [socialTab, setSocialTab] = useState<'friends' | 'requests' | 'add'>('friends');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [friendInput, setFriendInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [socialMessage, setSocialMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [isSending, setIsSending] = useState(false);

  const handleUserSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    triggerHaptic('light');
    const results = await searchUsers(searchQuery.trim());
    setSearchResults(results);
    setIsSearching(false);
  };

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
    type: 'remove_friend' | 'clear_history' | 'clear_search' | 'delete_profile' | 'delete_account' | 'reset_statistics';
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

  const executeResetStatistics = async () => {
    if (!activeProfile) return;
    await StatsService.resetStats(activeProfile.id);
    const stats = await StatsService.getStats(activeProfile.id);
    setProfileStats(stats);
    triggerHaptic('heavy');
    showToast('Statistics reset successfully.');
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
      setSettings({ ...SettingsService.getAll() });
    };
    window.addEventListener('settingsChanged', handleSettingsChange);
    return () => window.removeEventListener('settingsChanged', handleSettingsChange);
  }, []);

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    SettingsService.set(key, value);
    setSettings({ ...SettingsService.getAll() });
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
      triggerHaptic('medium');
      setShowAvatarPicker(false);
      await ProfileService.updateProfile(activeProfile.id, { avatar: avatarUrl });
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
  const toggleHaptics = () => updateSetting('hapticsEnabled', !settings.hapticsEnabled);

  // Muted Section Heading Style
  const sectionHeaderStyle = (): React.CSSProperties => ({
    padding: isMobile ? '32px 8px 12px' : '40px 8px 16px',
    fontSize: '0.75rem',
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
    letterSpacing: '0.15em',
    fontWeight: 900,
    borderBottom: '1px solid var(--border-color)',
    marginBottom: '8px'
  });

  if (showVersionHistory) {
    return <VersionHistory onBack={() => onShowVersionHistoryChange(false)} />;
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: COLORS.bgPrimary,
      color: 'var(--text-primary)',
      paddingBottom: isMobile ? '100px' : '140px',
      overflowX: 'hidden'
    }}>
      <style>{`
        .settings-group-container {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          margin-bottom: 16px;
          overflow: hidden;
        }
        .settings-list-item {
          display: flex;
          align-items: center;
          padding: 12px 14px;
          cursor: pointer;
          transition: background 0.2s ease;
          border-bottom: 1px solid var(--border-color);
        }
        .settings-list-item:last-child {
          border-bottom: none;
        }
        .settings-list-item:hover {
          background: var(--bg-card-hover);
        }
        .settings-icon-wrapper {
          width: 30px;
          height: 30px;
          border-radius: 6px;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          display: flex;
          align-items: center;
          justifyContent: center;
          color: var(--text-secondary);
          margin-right: 10px;
          flex-shrink: 0;
          transition: all 0.2s ease;
        }
        .settings-list-item:hover .settings-icon-wrapper {
          background: var(--bg-card-hover);
          border-color: var(--text-muted);
          color: var(--text-primary);
        }
        .settings-item-label {
          flex: 1;
          font-weight: 600;
          font-size: 0.86rem;
          color: var(--text-primary);
        }
        .settings-item-chevron {
          opacity: 0.55;
          transition: transform 0.2s;
          color: var(--text-primary);
          flex-shrink: 0;
        }
        .settings-list-item:hover .settings-item-chevron {
          opacity: 0.95;
          transform: translateX(2px);
        }
        .settings-group-title {
          font-size: 0.68rem;
          text-transform: uppercase;
          color: var(--text-muted);
          letter-spacing: 0.08em;
          font-weight: 800;
          margin: 18px 0 6px 4px;
        }
        .settings-row {
          background: var(--bg-card);
          border-bottom: 1px solid var(--border-color);
          transition: all 0.2s ease;
        }
        .settings-row:hover {
          background: var(--bg-card-hover);
        }
        .settings-category-btn {
          transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .settings-category-btn:hover {
          background: var(--bg-card-hover);
          color: var(--text-primary) !important;
        }
        .settings-profile-switch-btn, .settings-profile-login-btn {
          border: 1px solid var(--border-color);
          background: var(--bg-card);
          color: var(--text-primary);
          border-radius: 6px;
          font-weight: 600;
          font-size: 0.75rem;
          cursor: pointer;
          transition: all 0.2s;
        }
        .settings-profile-switch-btn:hover, .settings-profile-login-btn:hover {
          background: var(--text-primary);
          color: var(--bg-primary);
          border-color: var(--text-primary);
        }
        .settings-btn-clear, .settings-btn-danger {
          padding: 6px 12px;
          border-radius: 6px;
          font-weight: 600;
          font-size: 0.76rem;
          cursor: pointer;
          transition: all 0.2s;
        }
        .settings-btn-clear {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          color: var(--text-primary);
        }
        .settings-btn-clear:hover {
          background: var(--bg-card-hover);
        }
        .settings-btn-danger {
          background: rgba(239, 68, 68, 0.08);
          border: 1px solid rgba(239, 68, 68, 0.15);
          color: #ef4444;
        }
        .settings-btn-danger:hover {
          background: #ef4444;
          color: #fff;
          border-color: #ef4444;
        }
        .settings-version-label {
          margin: 4px 0 0;
          font-size: 0.7rem;
          font-weight: 700;
          color: rgba(255,255,255,0.5);
          letter-spacing: 0.02em;
          text-transform: uppercase;
          display: inline-block;
          cursor: pointer;
          transition: color 0.2s;
        }
        .settings-version-label:hover {
          color: #ffffff;
          text-decoration: underline;
        }
        .settings-back-btn:hover {
          background: rgba(255, 255, 255, 0.08) !important;
          border-color: rgba(255, 255, 255, 0.15) !important;
          transform: scale(1.05);
        }
        @media (max-width: 768px) {
          .settings-category-btn {
            background: rgba(255, 255, 255, 0.03) !important;
            border: 1px solid rgba(255, 255, 255, 0.08) !important;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1) !important;
          }
          .settings-category-btn.active {
            background: #ffffff !important;
            color: #000000 !important;
            border-color: #ffffff !important;
          }
        }
      `}</style>
      {!activeSubPage ? (
        <>
          {/* Compact Header for Settings */}
          {isMobile ? (
            <div style={{
              padding: 'calc(80px + env(safe-area-inset-top, 0px)) 16px 12px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '2px'
            }}>
              <h1 style={{ 
                margin: 0, 
                fontSize: '1.65rem', 
                fontWeight: 900,
                letterSpacing: '-0.03em'
              }}>Settings</h1>
              <p 
                onClick={() => {
                  triggerHaptic('light');
                  onShowVersionHistoryChange(true);
                }}
                className="settings-version-label"
              >Cinemovie v{packageJson.version}</p>
            </div>
          ) : (
            <div style={{ 
              position: 'relative', 
              height: '34vh', 
              maxHeight: '320px',
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
                padding: 'calc(92px + env(safe-area-inset-top, 0px)) 5% 32px 5%'
              }}>
                <h1 style={{ 
                  margin: 0, 
                  fontSize: '3rem', 
                  fontWeight: 900,
                  letterSpacing: '-0.04em'
                }}>Settings</h1>
                <p 
                  onClick={() => {
                    triggerHaptic('light');
                    onShowVersionHistoryChange(true);
                  }}
                  className="settings-version-label"
                >Cinemovie v{packageJson.version}</p>
              </div>
            </div>
          )}

          {/* Main Settings Wrapper - Centered & Capped for OLED layout */}
          <div style={{ 
            padding: '0 16px', 
            marginTop: '8px',
            position: 'relative',
            zIndex: 10
          }}>
            <div style={{
              maxWidth: '800px',
              margin: '0 auto',
              width: '100%'
            }}>
              
              {/* Borderless Profile Header Section */}
              <section style={{ marginBottom: '20px', padding: '0 4px' }}>
                <div style={{ 
                  display: 'flex',
                  alignItems: 'center',
                  gap: isMobile ? '12px' : '20px',
                }}>
                  {(() => {
                    const isGuest = localStorage.getItem('cinemovie_is_guest') === 'true';
                    return (
                      <div 
                        onClick={isGuest ? undefined : () => { triggerHaptic('light'); setShowAvatarPicker(true); }}
                        style={{
                          position: 'relative',
                          cursor: isGuest ? 'default' : 'pointer',
                          flexShrink: 0
                        }}
                      >
                        <img 
                          src={activeProfile?.avatar} 
                          alt=""
                          style={{
                            width: isMobile ? '56px' : '76px',
                            height: isMobile ? '56px' : '76px',
                            borderRadius: '50%',
                            objectFit: 'cover',
                            border: '2px solid rgba(255,255,255,0.12)'
                          }}
                        />
                        {!isGuest && (
                          <div style={{
                            position: 'absolute',
                            bottom: '0px',
                            right: '0px',
                            background: '#ffffff',
                            borderRadius: '50%',
                            width: '20px',
                            height: '20px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: '1.5px solid #0a0a0a',
                            boxShadow: '0 2px 6px rgba(0,0,0,0.5)'
                          }}>
                            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#000000" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                            </svg>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  <div style={{ flex: 1, minWidth: 0 }}>
                    {(() => {
                      const isGuest = localStorage.getItem('cinemovie_is_guest') === 'true';
                      return isEditingName && !isGuest ? (
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <input 
                            autoFocus
                            value={tempName}
                            onChange={(e) => setTempName(e.target.value)}
                            onBlur={handleSaveName}
                            onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                            style={{
                              background: 'var(--bg-card-hover)',
                              border: '1px solid var(--border-color)',
                              color: 'var(--text-primary)',
                              padding: '4px 8px',
                              fontSize: isMobile ? '0.92rem' : '1.1rem',
                              fontWeight: 800,
                              width: '100%',
                              maxWidth: '180px',
                              outline: 'none'
                            }}
                          />
                        </div>
                      ) : (
                        <div 
                          onClick={isGuest ? undefined : () => { triggerHaptic('light'); setIsEditingName(true); setTempName(activeProfile?.name || ''); }}
                          style={{ 
                            fontWeight: 800, 
                            fontSize: isMobile ? '1.15rem' : '1.55rem', 
                            letterSpacing: '-0.02em', 
                            cursor: isGuest ? 'default' : 'pointer', 
                            color: 'var(--text-primary)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            maxWidth: '100%'
                          }}
                        >
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {activeProfile?.name}
                          </span>
                          {!isGuest && (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="3">
                              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                            </svg>
                          )}
                        </div>
                      );
                    })()}
                    <div style={{ 
                      fontSize: isMobile ? '0.68rem' : '0.75rem', 
                      fontWeight: 700,
                      opacity: 0.4,
                      marginTop: '2px',
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase'
                    }}>{activeProfile?.isKids ? 'Kids Profile' : 'Adult Profile'}</div>
                  </div>
                  
                  {localStorage.getItem('cinemovie_is_guest') === 'true' ? (
                    <button 
                      onClick={() => { triggerHaptic('heavy'); onLogout(); }}
                      className="settings-profile-login-btn"
                      style={{
                        padding: isMobile ? '6px 12px' : '10px 18px',
                      }}
                    >
                      Log In
                    </button>
                  ) : (
                    <button 
                      onClick={onSwitchProfile}
                      className="settings-profile-switch-btn"
                      style={{
                        padding: isMobile ? '6px 12px' : '10px 18px',
                        fontSize: isMobile ? '0.7rem' : '0.8rem',
                      }}
                    >
                      Switch
                    </button>
                  )}
                </div>
              </section>

              {/* Watch History */}
              <WatchHistory isVisible={isVisible} onItemClick={(item) => window.dispatchEvent(new CustomEvent('movieClick', { detail: item }))} />

              {/* Library & Downloads Group */}
              <div className="settings-group-title">{t('library_lists')}</div>
              <div className="settings-group-container">
                <div 
                  onClick={() => {
                    triggerHaptic('light');
                    onNavigate('downloads');
                  }}
                  className="settings-list-item"
                >
                  <Download size={16} style={{ marginRight: '12px', opacity: 0.8, color: 'var(--text-primary)', flexShrink: 0 }} />
                  <div className="settings-item-label">{t('offline_downloads')}</div>
                  <ChevronRight size={14} className="settings-item-chevron" />
                </div>

                <div 
                  onClick={() => {
                    triggerHaptic('light');
                    setActiveSubPage('mylist');
                  }}
                  className="settings-list-item"
                >
                  <List size={16} style={{ marginRight: '12px', opacity: 0.8, color: 'var(--text-primary)', flexShrink: 0 }} />
                  <div className="settings-item-label">{t('watchlist')}</div>
                  <ChevronRight size={14} className="settings-item-chevron" />
                </div>
              </div>

              {/* Preferences Group */}
              <div className="settings-group-title">{t('preferences')}</div>
              <div className="settings-group-container">
                <div 
                  onClick={() => {
                    triggerHaptic('light');
                    setActiveSubPage('streaming');
                  }}
                  className="settings-list-item"
                >
                  <Play size={16} style={{ marginRight: '12px', opacity: 0.8, color: 'var(--text-primary)', flexShrink: 0 }} />
                  <div className="settings-item-label">{t('streaming_settings')}</div>
                  <ChevronRight size={14} className="settings-item-chevron" />
                </div>

                <div 
                  onClick={() => {
                    triggerHaptic('light');
                    setActiveSubPage('subtitles');
                  }}
                  className="settings-list-item"
                >
                  <Languages size={16} style={{ marginRight: '12px', opacity: 0.8, color: 'var(--text-primary)', flexShrink: 0 }} />
                  <div className="settings-item-label">{t('subtitle_engine')}</div>
                  <ChevronRight size={14} className="settings-item-chevron" />
                </div>

                <div 
                  onClick={() => {
                    triggerHaptic('light');
                    setActiveSubPage('appearance');
                  }}
                  className="settings-list-item"
                >
                  <Sliders size={16} style={{ marginRight: '12px', opacity: 0.8, color: 'var(--text-primary)', flexShrink: 0 }} />
                  <div className="settings-item-label">{t('appearance_theme')}</div>
                  <ChevronRight size={14} className="settings-item-chevron" />
                </div>
              </div>

              {/* Social & Account Group */}
              <div className="settings-group-title">{t('social_account')}</div>
              <div className="settings-group-container">
                <div 
                  onClick={() => {
                    triggerHaptic('light');
                    setActiveSubPage('statistics');
                  }}
                  className="settings-list-item"
                >
                  <BarChart2 size={16} style={{ marginRight: '12px', opacity: 0.8, color: 'var(--text-primary)', flexShrink: 0 }} />
                  <div className="settings-item-label">{t('statistics_insights')}</div>
                  <ChevronRight size={14} className="settings-item-chevron" />
                </div>

                <div 
                  onClick={() => {
                    triggerHaptic('light');
                    setActiveSubPage('social');
                  }}
                  className="settings-list-item"
                >
                  <Users size={16} style={{ marginRight: '12px', opacity: 0.8, color: 'var(--text-primary)', flexShrink: 0 }} />
                  <div className="settings-item-label">{t('social_friends')}</div>
                  <ChevronRight size={14} className="settings-item-chevron" />
                </div>

                <div 
                  onClick={() => {
                    triggerHaptic('light');
                    setActiveSubPage('account');
                  }}
                  className="settings-list-item"
                >
                  <Shield size={16} style={{ marginRight: '12px', opacity: 0.8, color: 'var(--text-primary)', flexShrink: 0 }} />
                  <div className="settings-item-label">{t('account_privacy')}</div>
                  <ChevronRight size={14} className="settings-item-chevron" />
                </div>

                <div 
                  onClick={async (e) => {
                    e.preventDefault();
                    triggerHaptic('light');
                    const url = 'https://t.me/CinemovieApp';
                    try {
                      const { Capacitor } = await import('@capacitor/core');
                      if (Capacitor.isNativePlatform()) {
                        const { Browser } = await import('@capacitor/browser');
                        await Browser.open({ url });
                        return;
                      }
                    } catch (err) {
                      console.warn('Capacitor check failed, using web fallback');
                    }
                    const newTab = window.open(url, '_blank', 'noopener,noreferrer');
                    if (!newTab || newTab.closed || typeof newTab.closed === 'undefined') {
                      window.location.href = url;
                    }
                  }}
                  className="settings-list-item"
                  style={{ cursor: 'pointer' }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: '12px', opacity: 0.8, color: '#0088cc', flexShrink: 0 }}>
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27-.02-.11.02-1.93 1.23-5.46 3.62-.51.35-.98.53-1.39.52-.46-.01-1.35-.26-2.01-.48-.81-.27-1.46-.42-1.4-.88.03-.24.37-.49 1.02-.75 3.98-1.73 6.64-2.88 7.97-3.45 3.79-1.63 4.57-1.91 5.09-1.92.11 0 .37.03.54.17.14.12.18.28.2.43-.02.07-.02.13-.02.2z"/>
                  </svg>
                  <div className="settings-item-label" style={{ color: '#0088cc', fontWeight: 700 }}>{t('telegram_channel')}</div>
                  <ChevronRight size={14} className="settings-item-chevron" />
                </div>
              </div>

              {/* Centered Logout/Login Action Button */}
              <div style={{ 
                marginTop: '32px', 
                display: 'flex', 
                justifyContent: 'center',
                padding: '0 4px'
              }}>
                {localStorage.getItem('cinemovie_is_guest') === 'true' ? (
                  <button 
                    onClick={() => { triggerHaptic('heavy'); onLogout(); }}
                    className="settings-btn-logout"
                    style={{
                      background: '#ffffff',
                      border: 'none',
                      color: '#000000',
                      padding: '8px 24px',
                      borderRadius: '6px',
                      fontWeight: 700,
                      fontSize: '0.8rem',
                      width: isMobile ? '100%' : 'auto',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      boxShadow: '0 4px 10px rgba(255, 255, 255, 0.08)'
                    }}
                  >
                    <User size={14} />
                    {t('log_in_register')}
                  </button>
                ) : (
                  <button 
                    onClick={() => { triggerHaptic('heavy'); onLogout(); }}
                    className="settings-btn-logout"
                    style={{
                      background: 'rgba(239, 68, 68, 0.08)',
                      border: '1px solid rgba(239, 68, 68, 0.15)',
                      color: '#ef4444',
                      padding: '8px 24px',
                      borderRadius: '6px',
                      fontWeight: 600,
                      fontSize: '0.8rem',
                      width: isMobile ? '100%' : 'auto',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    <LogOut size={14} />
                    {t('log_out')}
                  </button>
                )}
              </div>

            </div>
          </div>
        </>
      ) : (
        <div style={{
          padding: isMobile ? 'calc(88px + env(safe-area-inset-top, 0px)) 16px 40px' : 'calc(108px + env(safe-area-inset-top, 0px)) 5% 60px',
          position: 'relative',
          zIndex: 10
        }}>
          <div style={{
            maxWidth: '800px',
            margin: '0 auto',
            width: '100%'
          }}>
            {/* Premium Header Capsule */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '28px',
            }}>
              <div style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '100px',
                padding: '8px 16px',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                fontSize: '0.9rem',
                fontWeight: 850,
                color: '#fff'
              }}>
                {activeSubPage === 'streaming' && t('streaming_settings')}
                {activeSubPage === 'subtitles' && t('subtitle_engine')}
                {activeSubPage === 'appearance' && t('appearance_theme')}
                {activeSubPage === 'social' && t('social_friends')}
                {activeSubPage === 'account' && t('account_privacy')}
                {activeSubPage === 'statistics' && t('statistics_insights')}
                {activeSubPage === 'mylist' && t('watchlist')}
              </div>
            </div>

            <div style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
              {activeSubPage === 'streaming' && (
                <StreamingSubPage
                  settings={settings}
                  isMobile={isMobile}
                  toggleAutoNext={toggleAutoNext}
                  toggleHostControlsOnly={toggleHostControlsOnly}
                  toggleAutoJoinParty={toggleAutoJoinParty}
                  sectionHeaderStyle={sectionHeaderStyle}
                  serverUrl={serverUrl}
                  setServerUrl={setServerUrl}
                  serverUrlSaved={serverUrlSaved}
                  setServerUrlSaved={setServerUrlSaved}
                  isTestingUrl={isTestingUrl}
                  testStatus={testStatus}
                  testError={testError}
                  handleTestConnection={handleTestConnection}
                  updateSetting={updateSetting}
                  triggerHaptic={triggerHaptic}
                />
              )}

              {activeSubPage === 'subtitles' && (
                <SubtitlesSubPage
                  settings={settings}
                  updateSetting={updateSetting}
                  isMobile={isMobile}
                  osApiKey={osApiKey}
                  setOsApiKey={setOsApiKey}
                  osUsername={osUsername}
                  setOsUsername={setOsUsername}
                  osPassword={osPassword}
                  setOsPassword={setOsPassword}
                  osSaved={osSaved}
                  setOsSaved={setOsSaved}
                  showOsPassword={showOsPassword}
                  setShowOsPassword={setShowOsPassword}
                  triggerHaptic={triggerHaptic}
                  sectionHeaderStyle={sectionHeaderStyle}
                />
              )}

              {activeSubPage === 'appearance' && (
                <AppearanceSubPage
                  settings={settings}
                  isMobile={isMobile}
                  toggleMinimalHome={toggleMinimalHome}
                  updateSetting={updateSetting}
                  toggleHaptics={toggleHaptics}
                  toggleDebug={toggleDebug}
                  triggerHaptic={triggerHaptic}
                  showToast={showToast}
                  sectionHeaderStyle={sectionHeaderStyle}
                />
              )}

              {activeSubPage === 'account' && (
                <AccountSubPage
                  currentUser={currentUser}
                  authProvider={authProvider}
                  isMobile={isMobile}
                  activeProfile={activeProfile}
                  newPassword={newPassword}
                  setNewPassword={setNewPassword}
                  confirmNewPassword={confirmNewPassword}
                  setConfirmNewPassword={setConfirmNewPassword}
                  showPasswordChangeForm={showPasswordChangeForm}
                  setShowPasswordChangeForm={setShowPasswordChangeForm}
                  handleClearHistory={handleClearHistory}
                  handleClearSearchHistory={handleClearSearchHistory}
                  handleDeleteProfile={handleDeleteProfile}
                  handleDeleteAccount={handleDeleteAccount}
                  setReauthAction={setReauthAction}
                  showToast={showToast}
                  triggerHaptic={triggerHaptic}
                  onLogout={onLogout}
                  sectionHeaderStyle={sectionHeaderStyle}
                />
              )}

              {activeSubPage === 'social' && (
                <SocialSubPage
                  isMobile={isMobile}
                  friends={friends}
                  requests={requests}
                  sentRequests={sentRequests}
                  friendsLoading={friendsLoading}
                  accountName={accountName}
                  socialTab={socialTab}
                  setSocialTab={setSocialTab}
                  searchQuery={searchQuery}
                  setSearchQuery={setSearchQuery}
                  searchResults={searchResults}
                  isSearching={isSearching}
                  handleUserSearch={handleUserSearch}
                  handleRemoveFriend={handleRemoveFriend}
                  acceptFriend={acceptFriend}
                  declineReceivedRequest={declineReceivedRequest}
                  cancelSentRequest={cancelSentRequest}
                  addFriend={addFriend}
                  triggerHaptic={triggerHaptic}
                  getFriendStatus={getFriendStatus}
                  onLogout={onLogout}
                  userId={userId}
                  copied={copied}
                  setCopied={setCopied}
                  friendInput={friendInput}
                  setFriendInput={setFriendInput}
                  isSending={isSending}
                  setIsSending={setIsSending}
                  socialMessage={socialMessage}
                  setSocialMessage={setSocialMessage}
                  showToast={showToast}
                />
              )}

              {activeSubPage === 'statistics' && (
                <StatisticsSubPage
                  profileStats={profileStats}
                  isMobile={isMobile}
                  onResetStatsClick={() => {
                    setConfirmModal({
                      type: 'reset_statistics',
                      title: 'Reset Viewing Statistics?',
                      message: 'Are you sure you want to completely clear your viewing history stats, streaks, and achievements? Your active watch progress in Continue Watching will remain, but analytics dashboards will be fully wiped.',
                      actionText: 'Reset Stats',
                      isDanger: true
                    });
                  }}
                  triggerHaptic={triggerHaptic}
                  getBackdropUrl={getBackdropUrl}
                  getPosterUrl={getPosterUrl}
                  COLORS={COLORS}
                />
              )}

              {activeSubPage === 'mylist' && (
                <MyListSubPage
                  isMobile={isMobile}
                  sectionHeaderStyle={sectionHeaderStyle}
                  onMovieClick={onMovieClick}
                />
              )}

            </div>
          </div>
        </div>
      )}

      {/* Avatar Picker Modal */}
      <AvatarPicker
        showAvatarPicker={showAvatarPicker}
        onClose={() => setShowAvatarPicker(false)}
        activeProfile={activeProfile}
        isUploading={isUploading}
        isMobile={isMobile}
        handleFileUpload={handleFileUpload}
        handleSelectAvatar={handleSelectAvatar}
      />
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
                    if (localStorage.getItem('cinemovie_is_guest') === 'true') {
                      executeDeleteProfile();
                    } else {
                      setConfirmModal(null);
                      setReauthAction('delete_profile');
                    }
                  } else if (confirmModal.type === 'delete_account') {
                    setConfirmModal(null);
                    setReauthAction('delete_account');
                  } else if (confirmModal.type === 'reset_statistics') {
                    executeResetStatistics();
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

      {/* Reauthentication Modal Overlay */}
      <ReauthModal
        reauthAction={reauthAction}
        onClose={() => {
          setReauthAction(null);
          setReauthPassword('');
          setReauthError(null);
        }}
        authProvider={authProvider}
        reauthPassword={reauthPassword}
        setReauthPassword={setReauthPassword}
        isVerifyingReauth={isVerifyingReauth}
        reauthError={reauthError}
        handleVerifyReauth={handleVerifyReauth}
      />
    </div>
  );
}
