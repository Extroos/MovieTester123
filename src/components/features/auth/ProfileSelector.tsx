import React, { useState, useEffect, useRef } from 'react';
import { COLORS } from '../../../constants';
import { Profile, ProfileService } from '../../../services/profiles';
import { triggerHaptic, triggerSuccessHaptic } from '../../../utils/haptics';
import { t } from '../../../utils/i18n';
import { API_KEY } from '../../../services/api/tmdb';

interface ProfileSelectorProps {
  onProfileSelected: (profile: Profile) => void;
}

export default function ProfileSelector({ onProfileSelected }: ProfileSelectorProps) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  
  // Creation/Edit Form State
  const [newProfileName, setNewProfileName] = useState('');
  const [newProfileIsKids, setNewProfileIsKids] = useState(false);
  const [newProfileHasPin, setNewProfileHasPin] = useState(false);
  const [newProfilePin, setNewProfilePin] = useState('');
  
  const [addingLoading, setAddingLoading] = useState(false);
  const [missingTables, setMissingTables] = useState(false);
  const [isManaging, setIsManaging] = useState(false);
  const [avatarOptions, setAvatarOptions] = useState<string[]>([]);
  const [selectedAvatar, setSelectedAvatar] = useState<string>('');
  const [deleteProfileId, setDeleteProfileId] = useState<string | null>(null);

  // PIN Unlock State
  const [unlockProfile, setUnlockProfile] = useState<Profile | null>(null);
  const [enteredPin, setEnteredPin] = useState('');
  const [pinError, setPinError] = useState(false);

  // PIN Setup Modal State
  const [showPinSetupModal, setShowPinSetupModal] = useState(false);
  const [tempPin, setTempPin] = useState('');

  // TV Mode variables
  const isTVMode = typeof document !== 'undefined' && document.body.classList.contains('tv-mode');
  const changeAvatarRowRef = useRef<HTMLDivElement>(null);
  const [backgroundMediaList, setBackgroundMediaList] = useState<any[]>([]);
  const [currentMediaIdx, setCurrentMediaIdx] = useState<number>(0);
  const [activeProfileIdx, setActiveProfileIdx] = useState<number>(0);
  const [isFading, setIsFading] = useState<boolean>(false);
  const [activeMediaLogo, setActiveMediaLogo] = useState<string | null>(null);
  const [selectingProfile, setSelectingProfile] = useState<Profile | null>(null);

  // States for TV Mode inline settings panel
  const [selectedProfileToManage, setSelectedProfileToManage] = useState<Profile | null>(null);
  const [isEditingNameInline, setIsEditingNameInline] = useState(false);
  const [isSelectingAvatarInline, setIsSelectingAvatarInline] = useState(false);
  const [isSettingPinInline, setIsSettingPinInline] = useState(false);
  const [isNameInputFocused, setIsNameInputFocused] = useState(false);
  const [isPinInputFocused, setIsPinInputFocused] = useState(false);

  const generateAvatarOptions = (currentAvatar?: string) => {
    const set = new Set<number>();
    // If there is an existing avatar, parse its ID if possible to avoid duplication in random pool
    let existingId: number | null = null;
    if (currentAvatar) {
      const match = currentAvatar.match(/avatar-(\d+)\./);
      if (match) {
        existingId = parseInt(match[1], 10);
        set.add(existingId);
      }
    }

    while(set.size < 6) {
        set.add(Math.floor(Math.random() * 201) + 1);
    }
    
    const urls = Array.from(set).map(id => `/avatars/avatar-${id}.jpg`);
    urls.forEach(url => {
      const img = new Image();
      img.src = url;
    });

    // If currentAvatar is not in parsed format, ensure it is in the list
    if (currentAvatar && !urls.includes(currentAvatar)) {
      urls[0] = currentAvatar; // Overwrite first option with current avatar
    }

    setAvatarOptions(urls);
    if (currentAvatar) {
      setSelectedAvatar(currentAvatar);
    } else {
      setSelectedAvatar(urls[0]);
    }
  };

  useEffect(() => {
    if (isAdding) {
        generateAvatarOptions();
    } else if (editingProfile) {
        generateAvatarOptions(editingProfile.avatar);
    }
  }, [isAdding, editingProfile]);

  useEffect(() => {
    loadProfiles();
  }, []);

  useEffect(() => {
    if (profiles.length > 0 && !selectedProfileToManage) {
      setSelectedProfileToManage(profiles[0]);
    }
  }, [profiles, selectedProfileToManage]);

  useEffect(() => {
    if (!isTVMode || !isManaging) return;
    if (activeProfileIdx >= 0 && activeProfileIdx < profiles.length) {
      const target = profiles[activeProfileIdx];
      setSelectedProfileToManage(target);
      setNewProfileName(target.name);
      setNewProfileIsKids(target.isKids);
      setSelectedAvatar(target.avatar);
      if (target.pin && target.pin.length === 4) {
        setNewProfileHasPin(true);
        setNewProfilePin(target.pin);
      } else {
        setNewProfileHasPin(false);
        setNewProfilePin('');
      }
    }
  }, [activeProfileIdx, isManaging, profiles, isTVMode]);

  const loadProfiles = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      let data = await ProfileService.getProfiles();
      const isGuestMode = localStorage.getItem('cinemovie_is_guest') === 'true';

      if (isGuestMode && data.length > 0) {
        const unique = new Map();
        data.forEach(p => {
          const key = `${p.name}-${p.avatar}`;
          if (!unique.has(key)) {
            unique.set(key, p);
          }
        });
        if (unique.size < data.length) {
          data = Array.from(unique.values());
          localStorage.setItem('cinemovie_guest_profiles', JSON.stringify(data));
        }
      }

      if (isGuestMode && data.length === 0) {
        const currentLocal = localStorage.getItem('cinemovie_guest_profiles');
        if (currentLocal === null) {
          const defaultProfile = await ProfileService.addProfile('Guest', false, '/avatars/avatar-1.jpg');
          if (defaultProfile) {
            data = [defaultProfile];
          }
        }
      }
      setProfiles(data);
    } catch (error: any) {
      if (error.message === 'MISSING_TABLES') {
        setMissingTables(true);
      }
    }
    if (!silent) setLoading(false);
  };

  const handleAddProfile = async () => {
    if (!newProfileName.trim() || addingLoading) return;
    
    setAddingLoading(true);
    triggerSuccessHaptic();
    try {
        const pinValue = newProfileHasPin && newProfilePin.length === 4 ? newProfilePin : undefined;
        const newProfile = await ProfileService.addProfile(newProfileName.trim(), newProfileIsKids, selectedAvatar, pinValue);
        if (newProfile) {
            await loadProfiles();
            setIsAdding(false);
            setNewProfileName('');
            setNewProfileIsKids(false);
            setNewProfileHasPin(false);
            setNewProfilePin('');
          setTempPin('');
            setTempPin('');
        }
    } catch (e) {
        console.error(e);
    }
    setAddingLoading(false);
  };

  const handleUpdateProfileField = async (profileId: string, fields: any) => {
    try {
      await ProfileService.updateProfile(profileId, fields);
      await loadProfiles(true);
    } catch (e) {
      console.error('Failed to update profile field:', e);
    }
  };

  const handleUpdateProfile = async () => {
    if (!editingProfile || !newProfileName.trim() || addingLoading) return;

    setAddingLoading(true);
    triggerSuccessHaptic();
    try {
        const pinValue = newProfileHasPin && newProfilePin.length === 4 ? newProfilePin : '';
        const success = await ProfileService.updateProfile(editingProfile.id, {
          name: newProfileName.trim(),
          isKids: newProfileIsKids,
          avatar: selectedAvatar,
          pin: pinValue
        });
        if (success) {
          await loadProfiles();
          setEditingProfile(null);
          setNewProfileName('');
          setNewProfileIsKids(false);
          setNewProfileHasPin(false);
          setNewProfilePin('');
        }
    } catch (e) {
      console.error(e);
    }
    setAddingLoading(false);
  };

  // TV Mode background media fetching
  useEffect(() => {
    if (!isTVMode) return;
    Promise.all([
      fetch(`https://api.themoviedb.org/3/trending/movie/week?api_key=${API_KEY}&language=en-US`).then(r => r.json()).catch(() => ({ results: [] })),
      fetch(`https://api.themoviedb.org/3/trending/tv/week?api_key=${API_KEY}&language=en-US`).then(r => r.json()).catch(() => ({ results: [] }))
    ]).then(([moviesData, tvData]) => {
      const list = [];
      const movies = moviesData.results || [];
      const tv = tvData.results || [];
      const len = Math.max(movies.length, tv.length);
      for (let i = 0; i < len; i++) {
        if (movies[i] && movies[i].backdrop_path) list.push({ ...movies[i], media_type: 'movie' });
        if (tv[i] && tv[i].backdrop_path) list.push({ ...tv[i], media_type: 'tv' });
      }
      if (list.length > 0) {
        setBackgroundMediaList(list.slice(0, 15));
      }
    });
  }, [isTVMode]);

  useEffect(() => {
    if (!isTVMode || backgroundMediaList.length === 0) return;
    const media = backgroundMediaList[currentMediaIdx];
    if (!media) return;
    setActiveMediaLogo(null);
    const type = media.media_type || (media.title ? 'movie' : 'tv');
    fetch(`https://api.themoviedb.org/3/${type}/${media.id}/images?api_key=${API_KEY}`)
      .then(res => res.json())
      .then(data => {
        const logos = data.logos || [];
        const englishLogo = logos.find((l: any) => l.iso_639_1 === 'en');
        if (englishLogo) {
          setActiveMediaLogo(`https://image.tmdb.org/t/p/w500${englishLogo.file_path}`);
        }
      })
      .catch(() => {});
  }, [isTVMode, backgroundMediaList, currentMediaIdx]);

  useEffect(() => {
    if (!isTVMode || backgroundMediaList.length === 0) return;
    const interval = setInterval(() => {
      setIsFading(true);
      setTimeout(() => {
        setCurrentMediaIdx(prev => (prev + 1) % backgroundMediaList.length);
        setTimeout(() => {
          setIsFading(false);
        }, 1200);
      }, 800);
    }, 30000);
    return () => clearInterval(interval);
  }, [isTVMode, backgroundMediaList]);

  const handleSelect = (profile: Profile) => {
    triggerSuccessHaptic();
    
    // Check if profile lock is enabled
    if (profile.pin && profile.pin.length === 4) {
      setUnlockProfile(profile);
      setEnteredPin('');
      setPinError(false);
      return;
    }

    proceedWithSelection(profile);
  };

  const proceedWithSelection = (profile: Profile) => {
    if (isTVMode) {
      setSelectingProfile(profile);
      setTimeout(() => {
        onProfileSelected(profile);
      }, 2400);
    } else {
      onProfileSelected(profile);
    }
  };

  const executeDeleteProfile = async () => {
    if (!deleteProfileId) return;
    triggerHaptic('heavy');
    setLoading(true);
    await ProfileService.deleteProfile(deleteProfileId);
    await loadProfiles();
    setDeleteProfileId(null);
    setEditingProfile(null); // Exit editing if we deleted it
    setLoading(false);
  };

  const handlePinDigit = (digit: string) => {
    if (enteredPin.length >= 4) return;
    triggerHaptic('light');
    const nextPin = enteredPin + digit;
    setEnteredPin(nextPin);

    if (nextPin.length === 4) {
      if (unlockProfile && nextPin === unlockProfile.pin) {
        triggerSuccessHaptic();
        setTimeout(() => {
          setUnlockProfile(null);
          proceedWithSelection(unlockProfile);
        }, 300);
      } else {
        triggerHaptic('heavy');
        setPinError(true);
        setTimeout(() => {
          setEnteredPin('');
          setPinError(false);
        }, 800);
      }
    }
  };

  const handlePinDelete = () => {
    if (enteredPin.length === 0) return;
    triggerHaptic('medium');
    setEnteredPin(enteredPin.slice(0, -1));
  };

  const openEditProfile = (profile: Profile, e: React.MouseEvent) => {
    e.stopPropagation();
    triggerHaptic('medium');
    setEditingProfile(profile);
    setNewProfileName(profile.name);
    setNewProfileIsKids(profile.isKids);
    setSelectedAvatar(profile.avatar);
    if (profile.pin && profile.pin.length === 4) {
      setNewProfileHasPin(true);
      setNewProfilePin(profile.pin);
    } else {
      setNewProfileHasPin(false);
      setNewProfilePin('');
    }
  };

  // SQL Script display block
  if (missingTables) {
    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
            background: 'rgba(10, 10, 10, 0.7)',
            backdropFilter: 'blur(20px) saturate(220%) brightness(0.9)',
            WebkitBackdropFilter: 'blur(20px) saturate(220%) brightness(0.9)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
            color: '#fff',
            overflowY: 'auto'
        }}>
            <div style={{
                maxWidth: '800px',
                width: '100%',
                background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.07) 0%, rgba(255, 255, 255, 0.02) 100%)',
                backdropFilter: 'blur(20px) saturate(180%)',
                WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '24px',
                padding: '3rem 2rem',
                boxShadow: 'inset 0 1px 1px rgba(255, 255, 255, 0.1), 0 24px 80px rgba(0,0,0,0.5)',
            }}>
                 <h1 style={{ color: '#ffffff', fontSize: '2rem', marginBottom: '1rem', fontWeight: 800, letterSpacing: '-0.5px' }}>Database Setup / Migration Required</h1>
                <p style={{ textAlign: 'left', lineHeight: '1.6', color: 'rgba(255, 255, 255, 0.6)', marginBottom: '2rem', fontSize: '1rem' }}>
                    The application needs to prepare the profiles table in your Supabase project to support profiles and Profile PIN Locks.
                </p>
                
                <div style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '1.5rem', borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                    <p style={{ color: '#fff', fontWeight: 700, marginBottom: '0.5rem' }}>If setting up for the first time:</p>
                    <pre style={{ 
                        background: 'rgba(10, 10, 10, 0.8)', 
                        padding: '1.25rem', 
                        borderRadius: '12px', 
                        overflowX: 'auto', 
                        fontSize: '0.875rem', 
                        color: '#34d399',
                        maxHeight: '180px',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        lineHeight: '1.6',
                        fontFamily: 'monospace',
                        marginBottom: '1rem'
                    }}>
{`-- Create profiles table with PIN Lock column
create table profiles (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  avatar text not null,
  is_kids boolean default false,
  autoplay boolean default true,
  haptics boolean default true,
  notify_friend_activity boolean default true,
  notify_new_content boolean default true,
  pin text check (pin ~ '^[0-9]{4}$'), -- 4-digit PIN
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);`}
                    </pre>

                    <p style={{ color: '#fff', fontWeight: 700, marginBottom: '0.5rem' }}>If migrating an existing profiles table:</p>
                    <pre style={{ 
                        background: 'rgba(10, 10, 10, 0.8)', 
                        padding: '1.25rem', 
                        borderRadius: '12px', 
                        overflowX: 'auto', 
                        fontSize: '0.875rem', 
                        color: '#fbbf24',
                        maxHeight: '100px',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        lineHeight: '1.6',
                        fontFamily: 'monospace'
                    }}>
{`-- Add pin column to profiles
alter table profiles add column if not exists pin text check (pin ~ '^[0-9]{4}$');`}
                    </pre>
                </div>
                
                <button 
                    onClick={() => { triggerHaptic('medium'); window.location.reload(); }}
                    className="profile-refresh-btn"
                    style={{
                        marginTop: '2rem',
                        width: '100%',
                        padding: '1rem 2rem',
                        background: '#ffffff',
                        color: '#000000',
                        border: 'none',
                        borderRadius: '14px',
                        fontSize: '1.1rem',
                        fontWeight: '800',
                        cursor: 'pointer',
                        boxShadow: '0 8px 24px rgba(255, 255, 255, 0.15)',
                    }}
                >
                    I've Run the SQL - Refresh Page
                </button>
            </div>
        </div>
    );
  }

  if (loading) {
     return (
         <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
            background: '#141414',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#aaa'
        }}>
            <div style={{ width: '40px', height: '40px', border: '4px solid #333', borderTopColor: '#ffffff', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
        </div>
     );
  }

  if (selectingProfile) {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        zIndex: 15000,
        background: '#000000',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        animation: 'fadeIn 0.3s ease-in-out'
      }}>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '24px',
          animation: 'zoomInProfile 2.2s cubic-bezier(0.16, 1, 0.3, 1) forwards'
        }}>
          <div style={{
            width: '120px',
            height: '120px',
            borderRadius: '28px',
            overflow: 'hidden',
            border: '3px solid #ffffff',
            boxShadow: '0 20px 50px rgba(0,0,0,0.8)'
          }}>
            <img src={selectingProfile.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 900, margin: 0, letterSpacing: '-0.5px' }}>
            Welcome, {selectingProfile.name}
          </h2>
          <div style={{
            width: '32px',
            height: '32px',
            border: '3.5px solid rgba(255,255,255,0.1)',
            borderTopColor: '#ffffff',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }} />
        </div>
        <style>{`
          @keyframes zoomInProfile {
            0% {
              transform: scale(0.9);
              opacity: 0;
            }
            15% {
              transform: scale(1);
              opacity: 1;
            }
            85% {
              transform: scale(1.05);
              opacity: 1;
            }
            100% {
              transform: scale(1.2);
              opacity: 0;
            }
          }
        `}</style>
      </div>
    );
  }

  // 1-0 Numeric Pad locks screen
  if (unlockProfile) {
    if (isTVMode) {
      return (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 11000,
          background: '#09090b',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          color: '#fff',
          fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
          <StaticStyles />
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
            marginBottom: '24px',
            textAlign: 'center'
          }}>
            <div style={{
              width: '74px',
              height: '74px',
              borderRadius: '16px',
              overflow: 'hidden',
              border: '2.5px solid rgba(255,255,255,0.15)',
              boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
            }}>
              <img src={unlockProfile.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <h2 style={{ fontSize: '1.6rem', fontWeight: 900, margin: '4px 0 2px 0' }}>Profile Locked</h2>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', margin: 0 }}>
              Enter PIN for <strong>{unlockProfile.name}</strong>
            </p>
          </div>

          {/* PIN circle dots */}
          <div 
            className={pinError ? 'shake' : ''}
            style={{
              display: 'flex',
              gap: '16px',
              marginBottom: '32px',
              transition: 'transform 0.1s ease'
            }}
          >
            {[0, 1, 2, 3].map((idx) => (
              <div
                key={idx}
                style={{
                  width: '14px',
                  height: '14px',
                  borderRadius: '50%',
                  border: '2px solid rgba(255,255,255,0.4)',
                  background: enteredPin.length > idx 
                    ? (pinError ? '#ef4444' : '#ffffff') 
                    : 'transparent',
                  boxShadow: enteredPin.length > idx && !pinError ? '0 0 10px #fff' : 'none',
                  transition: 'all 0.15s cubic-bezier(0.16, 1, 0.3, 1)'
                }}
              />
            ))}
          </div>

          {/* Horizontal Bar for TV Users (0-9 + Backspace + Cancel) */}
          <div style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            width: '100%',
            maxWidth: '650px',
            flexWrap: 'wrap'
          }}>
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map((num) => (
              <button
                key={num}
                onClick={() => handlePinDigit(num)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handlePinDigit(num);
                  }
                }}
                tabIndex={0}
                className="tv-focusable"
                style={{
                  width: '46px',
                  height: '46px',
                  borderRadius: '50%',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1.5px solid rgba(255,255,255,0.12)',
                  color: '#fff',
                  fontSize: '1.2rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  outline: 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                {num}
              </button>
            ))}

            {/* Backspace Button */}
            <button
              onClick={handlePinDelete}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handlePinDelete();
                }
              }}
              tabIndex={0}
              className="tv-focusable"
              style={{
                width: '46px',
                height: '46px',
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.06)',
                border: '1.5px solid rgba(255,255,255,0.12)',
                color: '#fff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                outline: 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/>
                <line x1="18" y1="9" x2="12" y2="15"/>
                <line x1="12" y1="9" x2="18" y2="15"/>
              </svg>
            </button>

            {/* Cancel Button */}
            <button
              onClick={() => { triggerHaptic('light'); setUnlockProfile(null); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  triggerHaptic('light');
                  setUnlockProfile(null);
                }
              }}
              tabIndex={0}
              className="tv-focusable"
              style={{
                padding: '8px 18px',
                borderRadius: '20px',
                background: 'rgba(255,255,255,0.06)',
                border: '1.5px solid rgba(255,255,255,0.12)',
                color: 'rgba(255,255,255,0.6)',
                fontSize: '0.85rem',
                fontWeight: 800,
                cursor: 'pointer',
                outline: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '46px',
                transition: 'all 0.15s ease'
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      );
    }

    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        zIndex: 11000,
        background: '#09090b',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        color: '#fff',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '16px',
          marginBottom: '32px',
          textAlign: 'center'
        }}>
          <div style={{
            width: '84px',
            height: '84px',
            borderRadius: '20px',
            overflow: 'hidden',
            border: '2px solid rgba(255,255,255,0.1)',
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
          }}>
            <img src={unlockProfile.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 900, margin: '8px 0 4px 0' }}>Profile Locked</h2>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem', margin: 0 }}>
            Enter PIN for <strong>{unlockProfile.name}</strong>
          </p>
        </div>

        {/* PIN circle dots */}
        <div 
          className={pinError ? 'shake' : ''}
          style={{
            display: 'flex',
            gap: '20px',
            marginBottom: '40px',
            transition: 'transform 0.1s ease'
          }}
        >
          {[0, 1, 2, 3].map((idx) => (
            <div
              key={idx}
              style={{
                width: '18px',
                height: '18px',
                borderRadius: '50%',
                border: '2px solid rgba(255,255,255,0.4)',
                background: enteredPin.length > idx 
                  ? (pinError ? '#ef4444' : '#ffffff') 
                  : 'transparent',
                boxShadow: enteredPin.length > idx && !pinError ? '0 0 12px #fff' : 'none',
                transition: 'all 0.15s cubic-bezier(0.16, 1, 0.3, 1)'
              }}
            />
          ))}
        </div>

        {/* Premium Numeric Key Button Pad (Designed for phone viewport) */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '16px',
          maxWidth: '280px',
          width: '100%',
          boxSizing: 'border-box'
        }}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
            <button
              key={num}
              onClick={() => handlePinDigit(num)}
              style={{
                aspectRatio: '1/1',
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#fff',
                fontSize: '1.6rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                outline: 'none',
                transition: 'all 0.15s ease'
              }}
              className="pin-btn"
            >
              {num}
            </button>
          ))}
          
          {/* Bottom row: Cancel / 0 / Backspace */}
          <button
            onClick={() => { triggerHaptic('light'); setUnlockProfile(null); }}
            style={{
              aspectRatio: '1/1',
              borderRadius: '50%',
              background: 'transparent',
              border: 'none',
              color: 'rgba(255,255,255,0.6)',
              fontSize: '0.9rem',
              fontWeight: 800,
              cursor: 'pointer',
              outline: 'none'
            }}
          >
            Cancel
          </button>
          
          <button
            onClick={() => handlePinDigit('0')}
            style={{
              aspectRatio: '1/1',
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: '#fff',
              fontSize: '1.6rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              outline: 'none'
            }}
            className="pin-btn"
          >
            0
          </button>

          <button
            onClick={handlePinDelete}
            style={{
              aspectRatio: '1/1',
              borderRadius: '50%',
              background: 'transparent',
              border: 'none',
              color: '#fff',
              fontSize: '1.2rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              outline: 'none'
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/>
              <line x1="18" y1="9" x2="12" y2="15"/>
              <line x1="12" y1="9" x2="18" y2="15"/>
            </svg>
          </button>
        </div>
      </div>
    );
  }
  const activeMedia = backgroundMediaList[currentMediaIdx];  
  
  // Render TV-optimized split layout
  if (isTVMode) {
    const activeProfile = profiles[activeProfileIdx];
    const isAddingProfileFocused = activeProfileIdx === profiles.length;
    const disableOthers = isSelectingAvatarInline;

    return (
      <div 
        className="profile-selector-container"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 10000,
          background: '#000000',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }}
      >
        <StaticStyles />

        {/* Full-width rotating background movie backdrop */}
        <div style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 1, background: '#000000' }}>
          {activeMedia ? (
            <div key={activeMedia.id} style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}>
              <img
                src={`https://image.tmdb.org/t/p/w1280${activeMedia.backdrop_path}`}
                alt=""
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  opacity: isFading ? 0 : 0.45,
                  transition: 'opacity 0.8s ease-in-out'
                }}
              />
            </div>
          ) : (
            <div style={{ width: '100%', height: '100%', background: 'radial-gradient(circle at 75% 50%, rgba(255, 255, 255, 0.02) 0%, transparent 60%)' }} />
          )}
          {/* Left-to-right black gradient vignette */}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(to right, #040405 0%, #040405 35%, rgba(4, 4, 5, 0.85) 60%, rgba(4, 4, 5, 0.3) 85%, transparent 100%)',
            pointerEvents: 'none'
          }} />
          {/* Bottom vignette */}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(to bottom, transparent 40%, rgba(4, 4, 5, 0.95) 100%)',
            pointerEvents: 'none'
          }} />
        </div>

        {/* Main Content Area */}
        <div style={{
          position: 'relative',
          zIndex: 10,
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'flex-start',
          paddingLeft: '8vw',
          paddingRight: '8vw',
          boxSizing: 'border-box',
          overflow: 'hidden'
        }}>
          <div style={{ width: '100%', maxWidth: '900px', height: isManaging ? '92%' : 'auto', display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {/* Premium Brand Logo in TV Mode */}
            <div style={{ marginBottom: '16px', userSelect: 'none' }}>
              <img 
                src="/cinemovie-logo.png" 
                alt="CineMovie" 
                style={{ height: '48px', width: 'auto', objectFit: 'contain', filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.6))' }}
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>

            <h1 style={{ fontSize: '1.7rem', fontWeight: 900, color: '#ffffff', margin: 0, letterSpacing: '-1px' }}>
              {isManaging ? 'Manage Profiles' : "Who's watching?"}
            </h1>
            <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', margin: '0 0 14px 0', fontWeight: 500 }}>
              {isManaging ? 'Add, edit or delete profiles. You can have up to 5 profiles.' : 'Choose a profile to continue to Cinemovie'}
            </p>

            {/* Profiles horizontal row */}
            <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '14px', flexWrap: 'wrap', width: '100%', margin: '0 0 14px 0' }}>
              {profiles.map((profile, idx) => {
                const isFocused = activeProfileIdx === idx;
                return (
                  <div 
                    key={profile.id}
                    onClick={() => {
                      if (!isManaging) {
                        handleSelect(profile);
                      }
                    }}
                    onFocus={() => {
                      setActiveProfileIdx(idx);
                      setSelectedProfileToManage(profile);
                    }}
                    tabIndex={disableOthers ? -1 : 0}
                    className={disableOthers ? "profile-item profile-avatar-name" : "profile-item profile-avatar-name tv-focusable"}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '8px',
                      cursor: 'pointer',
                      outline: 'none',
                      transition: 'transform 0.2s ease',
                      transform: isFocused ? 'scale(1.05)' : 'scale(1)',
                    }}
                  >
                    {/* Profile Card Container with outline styling */}
                    <div style={{
                      width: '92px',
                      height: '92px',
                      borderRadius: '14px',
                      overflow: 'hidden',
                      position: 'relative',
                      background: '#121214',
                      border: isFocused ? '3px solid #ffffff' : '3px solid transparent',
                      boxShadow: isFocused ? '0 10px 25px rgba(255, 255, 255, 0.25)' : '0 8px 20px rgba(0,0,0,0.6)',
                      transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                      boxSizing: 'border-box'
                    }}>
                      <img 
                        src={profile.avatar} 
                        alt="" 
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} 
                      />

                      {/* Lock Icon */}
                      {profile.pin && (
                        <div style={{
                          position: 'absolute',
                          top: '8px',
                          left: '8px',
                          background: 'rgba(0,0,0,0.7)',
                          color: '#fff',
                          padding: '3px',
                          borderRadius: '5px',
                          zIndex: 10,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                          </svg>
                        </div>
                      )}

                      {/* Kids Badge */}
                      {profile.isKids && (
                        <div style={{
                          position: 'absolute',
                          top: '8px',
                          right: '8px',
                          background: 'rgba(239, 68, 68, 0.95)',
                          color: '#fff',
                          fontSize: '0.58rem',
                          fontWeight: 900,
                          padding: '2px 5px',
                          borderRadius: '4px',
                          letterSpacing: '0.04em',
                          zIndex: 10
                        }}>
                          KIDS
                        </div>
                      )}

                      {/* Pencil Edit overlay icon inside card */}
                      {isManaging && (
                        <div style={{
                          position: 'absolute',
                          inset: 0,
                          background: 'rgba(0,0,0,0.5)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          zIndex: 12
                        }}>
                          <div style={{
                            background: 'rgba(0,0,0,0.6)',
                            borderRadius: '50%',
                            padding: '6px',
                            border: '1.5px solid rgba(255,255,255,0.3)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
                              <path d="M12 20h9"/>
                              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                            </svg>
                          </div>
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                      <span style={{
                        fontSize: '0.8rem',
                        fontWeight: isFocused ? 800 : 500,
                        color: isFocused ? '#ffffff' : 'rgba(255,255,255,0.6)',
                        textAlign: 'center',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        width: '90px',
                        transition: 'color 0.2s ease'
                      }}>
                        {profile.name}
                      </span>
                      {isManaging && (
                        <span style={{
                          fontSize: '0.62rem',
                          fontWeight: 700,
                          color: idx === 0 ? '#ef4444' : 'rgba(255,255,255,0.4)',
                        }}>
                          {idx === 0 ? 'Main Profile' : 'Edit Profile'}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Add Profile Card in the row */}
              {isManaging && !(localStorage.getItem('cinemovie_is_guest') === 'true' && profiles.length >= 1) && (() => {
                const isFocused = activeProfileIdx === profiles.length;
                return (
                  <div 
                    onClick={() => { 
                      triggerHaptic('light'); 
                      setIsAdding(true); 
                      setNewProfileName('');
                      setNewProfileIsKids(false);
                      setNewProfileHasPin(false);
                      setNewProfilePin('');
                    }}
                    onFocus={() => {
                      setActiveProfileIdx(profiles.length);
                      setSelectedProfileToManage(null);
                    }}
                    tabIndex={disableOthers ? -1 : 0}
                    className={disableOthers ? "" : "tv-focusable"}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '8px',
                      cursor: 'pointer',
                      outline: 'none',
                      transition: 'transform 0.2s ease',
                      transform: isFocused ? 'scale(1.05)' : 'scale(1)',
                    }}
                  >
                    <div style={{
                      width: '92px',
                      height: '92px',
                      borderRadius: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: isFocused ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                      border: isFocused ? '3px solid #ffffff' : '2px dashed rgba(255, 255, 255, 0.25)',
                      boxShadow: isFocused ? '0 10px 25px rgba(255,255,255,0.2)' : 'none',
                      transition: 'all 0.2s ease',
                      boxSizing: 'border-box'
                    }}>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                      </svg>
                    </div>
                    <span style={{
                      fontSize: '0.8rem',
                      fontWeight: isFocused ? 800 : 500,
                      color: isFocused ? '#ffffff' : 'rgba(255,255,255,0.6)',
                      transition: 'color 0.2s ease'
                    }}>
                      Add Profile
                    </span>
                  </div>
                );
              })()}
            </div>

            {/* If NOT in managing mode: Show the Manage Profiles button */}
            {!isManaging && profiles.length > 0 && localStorage.getItem('cinemovie_is_guest') !== 'true' && (() => {
              const isFocused = activeProfileIdx === (profiles.length + 1);
              return (
                <div style={{ marginTop: '8px' }}>
                  <button
                    onFocus={() => { setActiveProfileIdx(profiles.length + 1); }}
                    onClick={() => { triggerHaptic('medium'); setIsManaging(true); }}
                    tabIndex={0}
                    className="tv-focusable"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '10px 20px',
                      background: 'transparent',
                      color: '#ffffff',
                      border: isFocused ? '1.5px solid #ffffff' : '1.5px solid rgba(255,255,255,0.25)',
                      borderRadius: '12px',
                      fontSize: '0.82rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      outline: 'none',
                      boxShadow: isFocused ? '0 0 15px rgba(255,255,255,0.2)' : 'none'
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transform: 'translateY(-0.5px)' }}>
                      <path d="M12 20h9"/>
                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                    </svg>
                    <span>Manage Profiles</span>
                  </button>
                </div>
              );
            })()}

            {isManaging && (
              <div style={{ width: '100%', flex: 1, minHeight: 0, overflowY: (isAddingProfileFocused || isSelectingAvatarInline) ? 'hidden' : 'auto', display: 'flex', flexDirection: 'column', gap: '20px', paddingRight: '8px' }}>
                <div style={{ width: '100%', height: '1px', background: 'rgba(255,255,255,0.1)', margin: '12px 0 4px 0' }} />
                
                {/* ── Case A: Focused on Add Profile card (Inline Creation Form) ── */}
                {isAddingProfileFocused ? (
                  <div style={{ display: 'flex', flexDirection: 'row', gap: '24px', alignItems: 'flex-start', width: '100%', padding: 0, boxSizing: 'border-box' }}>
                    {/* Left Column: Form Details & Actions */}
                    <div style={{ flex: 1.2, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <h3 style={{ fontSize: '1rem', fontWeight: 900, color: '#fff', margin: '0 0 2px 12px' }}>Create New Profile</h3>
                      
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <div style={{ width: '40px', height: '40px', borderRadius: '8px', overflow: 'hidden', border: '1.5px solid rgba(255,255,255,0.15)', flexShrink: 0 }}>
                          <img src={selectedAvatar || '/avatars/avatar-1.jpg'} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                        <input 
                          type="text"
                          tabIndex={0}
                          value={newProfileName}
                          onChange={(e) => setNewProfileName(e.target.value)}
                          onFocus={() => setIsNameInputFocused(true)}
                          onBlur={() => setIsNameInputFocused(false)}
                          placeholder="Profile Name"
                          className="profile-input-tv tv-focusable"
                          style={{
                            flex: 1,
                            padding: '8px 12px',
                            borderRadius: '8px',
                            background: '#141414',
                            border: isNameInputFocused ? '1.5px solid #ffffff' : '1.5px solid rgba(255,255,255,0.15)',
                            color: '#fff',
                            fontSize: '0.82rem',
                            fontWeight: 700,
                            outline: 'none',
                            boxShadow: isNameInputFocused ? '0 0 15px rgba(255,255,255,0.2)' : 'none'
                          }}
                        />
                      </div>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', margin: '4px 0', alignItems: 'center' }}>
                        <label 
                          tabIndex={0}
                          className="tv-focusable"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setNewProfileIsKids(!newProfileIsKids);
                            }
                          }}
                          style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: '#fff', fontSize: '0.78rem', fontWeight: 600, outline: 'none', padding: '2px 6px', borderRadius: '4px' }}
                        >
                          <input type="checkbox" checked={newProfileIsKids} readOnly style={{ width: '14px', height: '14px', accentColor: '#fff', pointerEvents: 'none' }} />
                          Kids Profile
                        </label>
                        <label 
                          tabIndex={0}
                          className="tv-focusable"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setNewProfileHasPin(!newProfileHasPin);
                            }
                          }}
                          style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: '#fff', fontSize: '0.78rem', fontWeight: 600, outline: 'none', padding: '2px 6px', borderRadius: '4px' }}
                        >
                          <input type="checkbox" checked={newProfileHasPin} readOnly style={{ width: '14px', height: '14px', accentColor: '#fff', pointerEvents: 'none' }} />
                          Require PIN
                        </label>
                        {newProfileHasPin && (
                          <input 
                            type="text" 
                            maxLength={4} 
                            tabIndex={0}
                            value={newProfilePin} 
                            onChange={(e) => setNewProfilePin(e.target.value.replace(/[^0-9]/g, ''))} 
                            onFocus={() => setIsPinInputFocused(true)}
                            onBlur={() => setIsPinInputFocused(false)}
                            placeholder="PIN"
                            className="profile-input-tv tv-focusable"
                            style={{ 
                              width: '80px', 
                              padding: '6px 8px', 
                              borderRadius: '6px', 
                              background: '#141414', 
                              border: isPinInputFocused ? '1.5px solid #ffffff' : '1.5px solid rgba(255,255,255,0.15)', 
                              color: '#fff', 
                              textAlign: 'center', 
                              fontSize: '0.9rem', 
                              letterSpacing: '0.15em',
                              fontWeight: 'bold', 
                              outline: 'none',
                              boxShadow: isPinInputFocused ? '0 0 15px rgba(255,255,255,0.2)' : 'none'
                            }}
                          />
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                        <button 
                          onClick={() => { setIsAdding(false); setActiveProfileIdx(0); }}
                          className="tv-action-btn tv-focusable"
                          style={{ flex: 1, padding: '8px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff', fontSize: '0.8rem', fontWeight: 700 }}
                        >
                          Cancel
                        </button>
                        <button 
                          onClick={handleAddProfile} disabled={!newProfileName.trim() || (newProfileHasPin && newProfilePin.length !== 4)}
                          className="tv-action-btn tv-focusable"
                          style={{ flex: 1.2, padding: '8px', background: '#fff', border: 'none', borderRadius: '8px', color: '#000', fontSize: '0.8rem', fontWeight: 900, opacity: (!newProfileName.trim()) ? 0.4 : 1 }}
                        >
                          Create Profile
                        </button>
                      </div>
                    </div>

                    {/* Right Column: Choose Avatar Grid */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', fontWeight: 700 }}>Choose Avatar:</span>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 56px)', gap: '6px' }}>
                        {['/avatars/avatar-1.jpg', '/avatars/avatar-2.jpg', '/avatars/avatar-3.jpg', '/avatars/avatar-4.jpg', '/avatars/avatar-5.jpg', '/avatars/avatar-6.jpg'].map((url, i) => (
                          <div 
                            key={i} 
                            tabIndex={0}
                            className="tv-focusable"
                            onClick={() => setSelectedAvatar(url)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setSelectedAvatar(url);
                              }
                            }}
                            style={{
                              width: '56px', height: '56px', borderRadius: '6px', overflow: 'hidden', cursor: 'pointer', border: selectedAvatar === url ? '3.5px solid #ffffff' : '1.5px solid rgba(255,255,255,0.15)', transition: 'all 0.15s ease', flexShrink: 0, outline: 'none'
                            }}
                          >
                            <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  
                  /* ── Case B: Focused on a normal profile (Inline Settings Rows) ── */
                  selectedProfileToManage && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <h3 style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.5)', fontWeight: 700, margin: '0 0 4px 16px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Profile Settings
                      </h3>

                      <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        background: 'transparent',
                        border: 'none',
                        overflow: 'hidden'
                      }}>
                        {/* 1. Rename Profile Setting Row */}
                        <div 
                          tabIndex={disableOthers ? -1 : 0}
                          className={disableOthers ? "tv-setting-row" : "tv-setting-row tv-focusable"}
                          onClick={() => setIsEditingNameInline(!isEditingNameInline)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setIsEditingNameInline(!isEditingNameInline);
                            }
                          }}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', outline: 'none'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2.5">
                              <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                            </svg>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                              <span style={{ fontSize: '0.84rem', fontWeight: 700, color: '#fff' }}>Rename Profile</span>
                              <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)' }}>Change the screen name for this profile.</span>
                            </div>
                          </div>
                          
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {isEditingNameInline ? (
                              <input 
                                autoFocus
                                type="text"
                                value={newProfileName}
                                onChange={(e) => {
                                  setNewProfileName(e.target.value);
                                  handleUpdateProfileField(selectedProfileToManage.id, { name: e.target.value });
                                }}
                                onBlur={() => setIsEditingNameInline(false)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    setIsEditingNameInline(false);
                                  }
                                }}
                                style={{
                                  padding: '4px 6px', borderRadius: '5px', background: '#141414', border: '1px solid #fff', color: '#fff', fontSize: '0.8rem', outline: 'none', width: '100px'
                                }}
                              />
                            ) : (
                              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fff' }}>{selectedProfileToManage.name}</span>
                            )}
                            <span style={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900, fontSize: '0.82rem' }}>&gt;</span>
                          </div>
                        </div>

                        {/* 2. Change Avatar Setting Row */}
                        <div 
                          ref={changeAvatarRowRef}
                          tabIndex={disableOthers ? -1 : 0}
                          className={disableOthers ? "tv-setting-row" : "tv-setting-row tv-focusable"}
                          onClick={() => {
                            if (!isSelectingAvatarInline) {
                              generateAvatarOptions(selectedProfileToManage.avatar);
                            }
                            setIsSelectingAvatarInline(!isSelectingAvatarInline);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              if (!isSelectingAvatarInline) {
                                generateAvatarOptions(selectedProfileToManage.avatar);
                              }
                              setIsSelectingAvatarInline(!isSelectingAvatarInline);
                            }
                          }}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', outline: 'none'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2.5">
                              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                            </svg>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                              <span style={{ fontSize: '0.84rem', fontWeight: 700, color: '#fff' }}>Change Avatar</span>
                              <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)' }}>Choose a new profile icon to display.</span>
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: '24px', height: '24px', borderRadius: '5px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.2)' }}>
                              <img src={selectedProfileToManage.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            </div>
                            <span style={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900, fontSize: '0.82rem' }}>&gt;</span>
                          </div>
                        </div>

                        {/* Inline Avatar Choice Grid (Visible when isSelectingAvatarInline is true) */}
                        {isSelectingAvatarInline && (
                          <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', fontWeight: 700 }}>Select New Avatar:</span>
                              <div style={{ display: 'flex', gap: '10px' }}>
                                <button
                                  tabIndex={0}
                                  className="tv-focusable"
                                  onClick={() => { triggerHaptic('light'); generateAvatarOptions(selectedProfileToManage.avatar); }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      triggerHaptic('light');
                                      generateAvatarOptions(selectedProfileToManage.avatar);
                                    }
                                  }}
                                  style={{
                                    background: 'rgba(255, 255, 255, 0.06)',
                                    border: '1.5px solid rgba(255,255,255,0.12)',
                                    color: '#fff',
                                    padding: '4px 12px',
                                    borderRadius: '8px',
                                    fontSize: '0.75rem',
                                    fontWeight: 800,
                                    cursor: 'pointer',
                                    outline: 'none',
                                    display: 'flex',
                                    alignItems: 'center'
                                  }}
                                >
                                  Shuffle
                                </button>
                                <button
                                  tabIndex={0}
                                  className="tv-focusable"
                                  onClick={() => { 
                                    triggerHaptic('light'); 
                                    setIsSelectingAvatarInline(false);
                                    setTimeout(() => {
                                      changeAvatarRowRef.current?.focus();
                                    }, 50);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      triggerHaptic('light');
                                      setIsSelectingAvatarInline(false);
                                      setTimeout(() => {
                                        changeAvatarRowRef.current?.focus();
                                      }, 50);
                                    }
                                  }}
                                  style={{
                                    background: 'rgba(255, 255, 255, 0.1)',
                                    border: '1.5px solid rgba(255,255,255,0.2)',
                                    color: '#fff',
                                    padding: '4px 12px',
                                    borderRadius: '8px',
                                    fontSize: '0.75rem',
                                    fontWeight: 800,
                                    cursor: 'pointer',
                                    outline: 'none',
                                    display: 'flex',
                                    alignItems: 'center'
                                  }}
                                >
                                  Leave
                                </button>
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '4px' }}>
                              {avatarOptions.map((url, i) => (
                                <div 
                                  key={url} 
                                  tabIndex={0}
                                  className="tv-focusable"
                                  onClick={() => {
                                    handleUpdateProfileField(selectedProfileToManage.id, { avatar: url });
                                    setIsSelectingAvatarInline(false);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      handleUpdateProfileField(selectedProfileToManage.id, { avatar: url });
                                      setIsSelectingAvatarInline(false);
                                    }
                                  }}
                                  style={{
                                    width: '50px', height: '50px', borderRadius: '8px', overflow: 'hidden', cursor: 'pointer', border: selectedProfileToManage.avatar === url ? '3px solid #ffffff' : '1px solid rgba(255,255,255,0.15)', outline: 'none', flexShrink: 0
                                  }}
                                >
                                  <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* 3. PIN Protection Setting Row */}
                        <div 
                          tabIndex={disableOthers ? -1 : 0}
                          className={disableOthers ? "tv-setting-row" : "tv-setting-row tv-focusable"}
                          onClick={() => {
                            if (selectedProfileToManage.pin) {
                              // If there is already a PIN, clicking deletes it
                              handleUpdateProfileField(selectedProfileToManage.id, { pin: '' });
                            } else {
                              setIsSettingPinInline(!isSettingPinInline);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              if (selectedProfileToManage.pin) {
                                handleUpdateProfileField(selectedProfileToManage.id, { pin: '' });
                              } else {
                                setIsSettingPinInline(!isSettingPinInline);
                              }
                            }
                          }}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', outline: 'none'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2.5">
                              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                            </svg>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                              <span style={{ fontSize: '0.84rem', fontWeight: 700, color: '#fff' }}>PIN Protection</span>
                              <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)' }}>Require a PIN to access this profile.</span>
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: selectedProfileToManage.pin ? '#ef4444' : 'rgba(255,255,255,0.45)' }}>
                              {selectedProfileToManage.pin ? 'On' : 'Off'}
                            </span>
                            <span style={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900, fontSize: '0.82rem' }}>&gt;</span>
                          </div>
                        </div>

                        {/* Inline PIN Setup Input */}
                        {isSettingPinInline && !selectedProfileToManage.pin && (
                          <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: '12px', background: 'rgba(0,0,0,0.2)' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#fff' }}>Enter 4-Digit PIN:</span>
                            <input 
                              autoFocus
                              type="text"
                              maxLength={4}
                              placeholder="PIN"
                              value={newProfilePin}
                              onChange={(e) => {
                                const val = e.target.value.replace(/[^0-9]/g, '');
                                setNewProfilePin(val);
                                if (val.length === 4) {
                                  handleUpdateProfileField(selectedProfileToManage.id, { pin: val });
                                  setIsSettingPinInline(false);
                                  setNewProfilePin('');
                                }
                              }}
                              style={{
                                padding: '4px', borderRadius: '5px', background: '#141414', border: '1px solid #fff', color: '#fff', textAlign: 'center', width: '70px', letterSpacing: '0.1em', fontWeight: 'bold'
                              }}
                            />
                          </div>
                        )}

                        {/* 4. Kids Profile Setting Row */}
                        <div 
                          tabIndex={disableOthers ? -1 : 0}
                          className={disableOthers ? "tv-setting-row" : "tv-setting-row tv-focusable"}
                          onClick={() => handleUpdateProfileField(selectedProfileToManage.id, { isKids: !selectedProfileToManage.isKids })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleUpdateProfileField(selectedProfileToManage.id, { isKids: !selectedProfileToManage.isKids });
                            }
                          }}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: selectedProfileToManage.id === profiles[0].id ? 'none' : '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', outline: 'none'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2.5">
                              <circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>
                            </svg>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                              <span style={{ fontSize: '0.84rem', fontWeight: 700, color: '#fff' }}>Kids Profile</span>
                              <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)' }}>Manage content restrictions for Kids profiles.</span>
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: selectedProfileToManage.isKids ? '#eab308' : 'rgba(255,255,255,0.45)' }}>
                              {selectedProfileToManage.isKids ? 'Kids' : 'Standard'}
                            </span>
                            <span style={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900, fontSize: '0.82rem' }}>&gt;</span>
                          </div>
                        </div>

                        {/* 5. Delete Profile Setting Row (Only for non-main profiles) */}
                        {selectedProfileToManage.id !== profiles[0].id && (
                          <div 
                            tabIndex={disableOthers ? -1 : 0}
                            className={disableOthers ? "tv-setting-row" : "tv-setting-row tv-focusable"}
                            onClick={() => setDeleteProfileId(selectedProfileToManage.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setDeleteProfileId(selectedProfileToManage.id);
                              }
                            }}
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', cursor: 'pointer', outline: 'none', borderBottom: '1px solid rgba(255,255,255,0.06)'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5">
                                <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>
                              </svg>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                                <span style={{ fontSize: '0.84rem', fontWeight: 700, color: '#ef4444' }}>Delete Profile</span>
                                <span style={{ fontSize: '0.7rem', color: 'rgba(239,68,68,0.55)' }}>Permanently delete this profile and all watchlist data.</span>
                              </div>
                            </div>
                            <span style={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900, fontSize: '0.82rem' }}>&gt;</span>
                          </div>
                        )}

                        {/* 6. Finish Setting Row (Replaces Transfer Profile row) */}
                        <div 
                          tabIndex={disableOthers ? -1 : 0}
                          className={disableOthers ? "tv-setting-row" : "tv-setting-row tv-focusable"}
                          onClick={() => setIsManaging(false)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setIsManaging(false);
                            }
                          }}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', cursor: 'pointer', outline: 'none'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5">
                              <polyline points="20 6 9 17 4 12"/>
                            </svg>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                              <span style={{ fontSize: '0.84rem', fontWeight: 700, color: '#ffffff' }}>Finish</span>
                              <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.45)' }}>Exit manage profiles and save all changes.</span>
                            </div>
                          </div>
                          <span style={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900, fontSize: '0.82rem' }}>&gt;</span>
                        </div>
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
            {/* Custom Profile Deletion Confirmation Drawer for TV */}
            {deleteProfileId && (
              <div style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0, 0, 0, 0.6)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10005,
                padding: '20px',
                animation: 'fadeInGlass 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
              }}>
                <div style={{
                  maxWidth: '380px',
                  width: '100%',
                  background: 'rgba(20, 20, 20, 0.95)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '24px',
                  padding: '24px',
                  boxShadow: '0 24px 80px rgba(0,0,0,0.8)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '20px',
                  textAlign: 'center'
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                      width: '64px',
                      height: '64px',
                      borderRadius: '16px',
                      overflow: 'hidden',
                      border: '2px solid rgba(255,255,255,0.1)'
                    }}>
                      <img 
                        src={profiles.find(p => p.id === deleteProfileId)?.avatar || ''} 
                        alt="" 
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                      />
                    </div>
                    <div>
                      <h3 style={{ margin: '0 0 6px', fontSize: '1.2rem', fontWeight: 900, color: '#fff', letterSpacing: '-0.02em' }}>Delete Profile?</h3>
                      <p style={{ margin: 0, fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.4 }}>
                        Delete {profiles.find(p => p.id === deleteProfileId)?.name || ''}? All watchlist data for this profile will be permanently deleted.
                      </p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                      tabIndex={0}
                      className="tv-focusable"
                      onClick={() => { triggerHaptic('light'); setDeleteProfileId(null); }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          triggerHaptic('light');
                          setDeleteProfileId(null);
                        }
                      }}
                      style={{
                        flex: 1,
                        padding: '12px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1.5px solid rgba(255, 255, 255, 0.12)',
                        borderRadius: '14px',
                        color: '#fff',
                        fontSize: '0.9rem',
                        fontWeight: 800,
                        cursor: 'pointer',
                        outline: 'none'
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      tabIndex={0}
                      className="tv-focusable"
                      onClick={executeDeleteProfile}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          executeDeleteProfile();
                        }
                      }}
                      style={{
                        flex: 1,
                        padding: '12px',
                        background: '#e11d48',
                        border: 'none',
                        borderRadius: '14px',
                        color: '#fff',
                        fontSize: '0.9rem',
                        fontWeight: 900,
                        cursor: 'pointer',
                        outline: 'none',
                        boxShadow: '0 4px 16px rgba(225, 29, 72, 0.3)'
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Render Mobile / Web View Layout
  return (
    <div 
      className="profile-selector-container"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.05) 0%, #09090b 80%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 1.5rem',
        overflowY: 'auto',
        animation: 'fadeInGlass 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <StaticStyles />

      <div style={{
          width: '100%',
          maxWidth: '800px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          animation: 'slideUpGlass 0.7s cubic-bezier(0.16, 1, 0.3, 1)',
      }}>
          {!isAdding && !editingProfile ? (
              <>
                <h1 
                  className="profile-selector-title"
                  style={{
                    color: '#fff',
                    fontSize: 'clamp(2rem, 6vw, 3rem)',
                    fontWeight: 900,
                    marginBottom: '3.5rem',
                    textAlign: 'center',
                    letterSpacing: '-0.05em',
                    textShadow: '0 10px 40px rgba(0,0,0,0.6)',
                  }}
                >
                    {isManaging ? t('manage_profiles') : t('whos_watching')}
                </h1>

                {/* Profiles grid component */}
                <div 
                  className="profiles-grid"
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    justifyContent: 'center',
                    gap: '2.5rem',
                    width: '100%',
                    marginBottom: '1rem',
                  }}
                >
                  {profiles.map((profile, idx) => (
                    <div 
                      key={profile.id}
                      onClick={(e) => isManaging ? openEditProfile(profile, e) : handleSelect(profile)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          if (isManaging) openEditProfile(profile, e as any);
                          else handleSelect(profile);
                        }
                      }}
                      tabIndex={0}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '1.2rem',
                        cursor: 'pointer',
                        position: 'relative'
                      }}
                      className="profile-item profile-avatar-name tv-focusable"
                    >
                      <div style={{ position: 'relative' }}>
                        <div 
                          className="profile-avatar profile-avatar-img-container"
                          style={{
                            width: 'clamp(100px, 14vw, 130px)', 
                            height: 'clamp(100px, 14vw, 130px)',
                            borderRadius: '28px', 
                            overflow: 'hidden',
                            border: 'none',
                            background: 'rgba(255, 255, 255, 0.03)',
                            boxShadow: '0 15px 40px rgba(0,0,0,0.5)',
                            opacity: isManaging ? 0.45 : 1
                          }}
                        >
                          <img src={profile.avatar} alt={profile.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          {isManaging && (
                            <div style={{
                              position: 'absolute',
                              inset: 0,
                              background: 'rgba(0,0,0,0.5)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}>
                              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
                                <path d="M12 20h9"/>
                                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                              </svg>
                            </div>
                          )}
                        </div>

                        {profile.isKids && (
                          <div style={{
                            position: 'absolute',
                            top: '-6px',
                            right: '-6px',
                            background: '#ffffff',
                            border: '1.5px solid #ffffff',
                            color: '#000000',
                            fontSize: '0.68rem',
                            fontWeight: 950,
                            padding: '2px 8px',
                            borderRadius: '8px',
                            letterSpacing: '0.06em',
                            boxShadow: '0 4px 14px rgba(0, 0, 0, 0.65)',
                            zIndex: 11
                          }}>
                            KIDS
                          </div>
                        )}

                        {profile.pin && (
                          <div style={{
                            position: 'absolute',
                            bottom: '0',
                            right: '0',
                            background: 'rgba(0,0,0,0.85)',
                            color: '#fff',
                            padding: '5px',
                            borderRadius: '10px',
                            zIndex: 11,
                            boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                            </svg>
                          </div>
                        )}
                      </div>
                      
                      <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '1.05rem', fontWeight: 700, letterSpacing: '-0.02em' }} className="profile-name">
                        {profile.name}
                      </span>
                    </div>
                  ))}

                  {/* Add Profile Trigger */}
                  {isManaging && !(localStorage.getItem('cinemovie_is_guest') === 'true' && profiles.length >= 1) && (
                    <div 
                      onClick={() => { 
                        triggerHaptic('light'); 
                        setIsAdding(true); 
                        setNewProfileName('');
                        setNewProfileIsKids(false);
                        setNewProfileHasPin(false);
                        setNewProfilePin('');
                      }}
                      tabIndex={0}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '1.2rem',
                        cursor: 'pointer'
                      }}
                      className="add-profile-btn profile-avatar-name tv-focusable"
                    >
                      <div 
                        className="add-icon-container profile-avatar-img-container"
                        style={{
                          width: 'clamp(100px, 14vw, 130px)',
                          height: 'clamp(100px, 14vw, 130px)',
                          borderRadius: '28px',
                          background: 'rgba(255,255,255,0.04)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: '0 15px 40px rgba(0,0,0,0.5)'
                        }}
                      >
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5">
                          <line x1="12" y1="5" x2="12" y2="19"></line>
                          <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                      </div>
                      <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '1.05rem', fontWeight: 700 }}>Add Profile</span>
                    </div>
                  )}
                </div>

                {/* Manage button */}
                {profiles.length > 0 && localStorage.getItem('cinemovie_is_guest') !== 'true' && (
                  <button
                    onClick={() => { triggerHaptic('medium'); setIsManaging(!isManaging); }}
                    style={{
                      marginTop: '4.5rem',
                      padding: '12px 36px',
                      background: isManaging ? '#fff' : 'rgba(255,255,255,0.05)',
                      color: isManaging ? '#000' : '#888',
                      border: isManaging ? 'none' : '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '14px',
                      fontSize: '0.85rem',
                      fontWeight: 900,
                      cursor: 'pointer',
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      transition: 'all 0.3s ease'
                    }}
                    className="manage-btn profile-manage-btn tv-focusable"
                  >
                    {isManaging ? t('finish') : t('manage_profiles')}
                  </button>
                )}
              </>
          ) : (
              // Add / Edit Profile View in Mobile/Web Mode
              <div className="add-profile-container" style={{
                width: '100%',
                maxWidth: '850px',
                animation: 'fadeInScale 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '2.5rem'
              }}>
                <h2 className="add-profile-title" style={{
                    color: '#fff',
                    fontSize: '2.8rem',
                    fontWeight: 900,
                    letterSpacing: '-0.04em',
                    margin: 0,
                    textAlign: 'center',
                }}>
                  {isAdding ? t('create_profile') : 'Edit Profile'}
                </h2>
                
                <div className="add-profile-row" style={{
                  width: '100%',
                  display: 'flex',
                  flexDirection: 'row',
                  gap: '3.5rem',
                  alignItems: 'flex-start',
                  justifyContent: 'center',
                  flexWrap: 'wrap',
                }}>
                  {/* Left Column: Avatar Preview and Profile Name Input */}
                  <div className="add-profile-left-col" style={{
                    flex: '1 1 300px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '2rem',
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    borderRadius: '24px',
                    padding: '2.5rem 2rem',
                    boxSizing: 'border-box'
                  }}>
                    {/* Selected Avatar Preview */}
                    <div className="add-profile-avatar-preview" style={{
                      width: '140px',
                      height: '140px',
                      borderRadius: '28px',
                      overflow: 'hidden',
                      border: '4px solid rgba(255, 255, 255, 0.12)',
                      boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
                    }}>
                      <img 
                        src={selectedAvatar} 
                        alt="Selected" 
                        loading="eager" 
                        decoding="sync" 
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} 
                        onError={(e) => {
                          const target = e.currentTarget as HTMLImageElement;
                          const fallbackId = Math.floor(Math.random() * 67) + 1;
                          target.src = `/avatars/avatar-${fallbackId}.jpg`;
                        }}
                      />
                    </div>

                    {/* Name Input Box */}
                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <input
                        autoFocus
                        type="text"
                        value={newProfileName}
                        onChange={(e) => setNewProfileName(e.target.value)}
                        placeholder={t('profile_name')}
                        className="profile-input-tv"
                        style={{
                          width: '100%',
                          padding: '16px 20px',
                          borderRadius: '16px',
                          background: 'rgba(0,0,0,0.55)',
                          border: '1.5px solid rgba(255,255,255,0.08)',
                          color: '#fff',
                          fontSize: '1.15rem',
                          fontWeight: 700,
                          outline: 'none',
                          boxSizing: 'border-box'
                        }}
                      />

                      {/* Side-by-Side Premium Config Grid */}
                      <div className="options-row-grid" style={{
                        display: 'flex',
                        flexDirection: 'row',
                        gap: '12px',
                        width: '100%',
                        flexWrap: 'nowrap'
                      }}>
                        {/* Kids Mode Config Block */}
                        <div 
                          onClick={() => { triggerHaptic('light'); setNewProfileIsKids(!newProfileIsKids); }}
                          style={{
                            flex: 1,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                            cursor: 'pointer',
                            padding: '14px 12px',
                            background: 'rgba(255,255,255,0.02)',
                            border: newProfileIsKids ? '1.5px solid #ffffff' : '1.5px solid rgba(255,255,255,0.06)',
                            borderRadius: '16px',
                            userSelect: 'none',
                            transition: 'all 0.2s ease',
                            position: 'relative',
                            overflow: 'hidden'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                            <span style={{ color: '#fff', fontSize: '0.88rem', fontWeight: 800 }}>Kids Profile</span>
                            {/* Premium Custom Toggle Pill */}
                            <div style={{
                              width: '32px',
                              height: '18px',
                              borderRadius: '10px',
                              background: newProfileIsKids ? '#fff' : 'rgba(255,255,255,0.1)',
                              position: 'relative',
                              transition: 'all 0.2s ease'
                            }}>
                              <div style={{
                                width: '14px',
                                height: '14px',
                                borderRadius: '50%',
                                background: newProfileIsKids ? '#000' : '#fff',
                                position: 'absolute',
                                top: '2px',
                                left: newProfileIsKids ? '16px' : '2px',
                                transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
                              }} />
                            </div>
                          </div>
                          <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.72rem', lineHeight: '1.25' }}>
                            Family safe titles
                          </span>
                        </div>

                        {/* Profile PIN Lock Config Block */}
                        <div 
                          onClick={() => {
                            triggerHaptic('light');
                            if (newProfileHasPin) {
                              setNewProfileHasPin(false);
                              setNewProfilePin('');
                              setTempPin('');
                            } else {
                              setTempPin('');
                              setShowPinSetupModal(true);
                            }
                          }}
                          style={{
                            flex: 1,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                            cursor: 'pointer',
                            padding: '14px 12px',
                            background: 'rgba(255,255,255,0.02)',
                            border: newProfileHasPin ? '1.5px solid #ffffff' : '1.5px solid rgba(255,255,255,0.06)',
                            borderRadius: '16px',
                            userSelect: 'none',
                            transition: 'all 0.2s ease',
                            position: 'relative',
                            overflow: 'hidden'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                            <span style={{ color: '#fff', fontSize: '0.88rem', fontWeight: 800 }}>Profile Lock</span>
                            {/* Premium Custom Toggle Pill */}
                            <div style={{
                              width: '32px',
                              height: '18px',
                              borderRadius: '10px',
                              background: newProfileHasPin ? '#fff' : 'rgba(255,255,255,0.1)',
                              position: 'relative',
                              transition: 'all 0.2s ease'
                            }}>
                              <div style={{
                                width: '14px',
                                height: '14px',
                                borderRadius: '50%',
                                background: newProfileHasPin ? '#000' : '#fff',
                                position: 'absolute',
                                top: '2px',
                                left: newProfileHasPin ? '16px' : '2px',
                                transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
                              }} />
                            </div>
                          </div>
                          <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.72rem', lineHeight: '1.25' }}>
                            {newProfileHasPin ? `Lock Active: ${newProfilePin}` : 'Require 4-digit PIN'}
                          </span>
                        </div>
                      </div>

                      {/* Setup PIN Floating Centered Modal */}
                      {showPinSetupModal && (
                        <div style={{
                          position: 'fixed',
                          inset: 0,
                          zIndex: 12000,
                          background: 'rgba(0, 0, 0, 0.75)',
                          backdropFilter: 'blur(20px)',
                          WebkitBackdropFilter: 'blur(20px)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: '20px',
                          animation: 'fadeIn 0.2s ease-out'
                        }}>
                          <div style={{
                            width: '100%',
                            maxWidth: '320px',
                            background: '#09090b',
                            border: '1.5px solid rgba(255,255,255,0.1)',
                            borderRadius: '24px',
                            padding: '24px',
                            boxShadow: '0 24px 80px rgba(0,0,0,0.8)',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '24px',
                            animation: 'scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
                          }}>
                            <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900, color: '#fff' }}>Set Profile PIN</h3>
                              <p style={{ margin: 0, fontSize: '0.85rem', color: 'rgba(255,255,255,0.45)' }}>Create a 4-digit security code</p>
                            </div>

                            {/* PIN dots */}
                            <div style={{ display: 'flex', gap: '16px' }}>
                              {[0, 1, 2, 3].map((i) => (
                                <div
                                  key={i}
                                  style={{
                                    width: '14px',
                                    height: '14px',
                                    borderRadius: '50%',
                                    border: '2px solid rgba(255,255,255,0.3)',
                                    background: tempPin.length > i ? '#ffffff' : 'transparent',
                                    boxShadow: tempPin.length > i ? '0 0 10px #fff' : 'none',
                                    transition: 'all 0.1s ease'
                                  }}
                                />
                              ))}
                            </div>

                            {/* Center-aligned ergonomic custom pad layout */}
                            <div style={{
                              display: 'grid',
                              gridTemplateColumns: 'repeat(3, 1fr)',
                              gap: '14px',
                              width: '100%',
                              maxWidth: '240px'
                            }}>
                              {['1','2','3','4','5','6','7','8','9'].map((digit) => (
                                <button
                                  key={digit}
                                  onClick={() => {
                                    if (tempPin.length < 4) {
                                      triggerHaptic('light');
                                      const next = tempPin + digit;
                                      setTempPin(next);
                                      if (next.length === 4) {
                                        triggerSuccessHaptic();
                                        setNewProfileHasPin(true);
                                        setNewProfilePin(next);
                                        setTimeout(() => setShowPinSetupModal(false), 200);
                                      }
                                    }
                                  }}
                                  style={{
                                    aspectRatio: '1/1',
                                    borderRadius: '50%',
                                    background: 'rgba(255,255,255,0.06)',
                                    border: '1px solid rgba(255,255,255,0.08)',
                                    color: '#fff',
                                    fontSize: '1.4rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    outline: 'none',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'all 0.15s ease'
                                  }}
                                  className="pin-btn"
                                >
                                  {digit}
                                </button>
                              ))}

                              <button
                                onClick={() => {
                                  triggerHaptic('medium');
                                  setShowPinSetupModal(false);
                                }}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: 'rgba(255,255,255,0.5)',
                                  fontSize: '0.85rem',
                                  fontWeight: 800,
                                  cursor: 'pointer',
                                  outline: 'none'
                                }}
                              >
                                Cancel
                              </button>

                              <button
                                onClick={() => {
                                  if (tempPin.length < 4) {
                                    triggerHaptic('light');
                                    const next = tempPin + '0';
                                    setTempPin(next);
                                    if (next.length === 4) {
                                      triggerSuccessHaptic();
                                      setNewProfileHasPin(true);
                                      setNewProfilePin(next);
                                      setTimeout(() => setShowPinSetupModal(false), 200);
                                    }
                                  }
                                }}
                                style={{
                                  aspectRatio: '1/1',
                                  borderRadius: '50%',
                                  background: 'rgba(255,255,255,0.06)',
                                  border: '1px solid rgba(255,255,255,0.08)',
                                  color: '#fff',
                                  fontSize: '1.4rem',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  outline: 'none',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  transition: 'all 0.15s ease'
                                }}
                                className="pin-btn"
                              >
                                0
                              </button>

                              <button
                                onClick={() => {
                                  if (tempPin.length > 0) {
                                    triggerHaptic('medium');
                                    setTempPin(tempPin.slice(0, -1));
                                  }
                                }}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: '#fff',
                                  cursor: 'pointer',
                                  outline: 'none',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center'
                                }}
                              >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                  <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/>
                                  <line x1="18" y1="9" x2="12" y2="15"/>
                                  <line x1="12" y1="9" x2="18" y2="15"/>
                                </svg>
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                      </div>
                    </div>

                  {/* Right Column: Avatar Choices Grid */}
                  <div className="add-profile-right-col" style={{
                    flex: '1.2 1 350px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1.5rem',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '1.1rem', fontWeight: 800 }}>{t('choose_identity')}</span>
                      <button 
                        onClick={() => { triggerHaptic('light'); generateAvatarOptions(); }}
                        className="tv-action-btn tv-focusable"
                        tabIndex={0}
                        style={{ 
                            background: 'rgba(255, 255, 255, 0.06)', 
                            border: '1px solid rgba(255,255,255,0.12)', 
                            color: '#fff', 
                            padding: '8px 16px', 
                            borderRadius: '12px', 
                            fontSize: '0.85rem',
                            fontWeight: 800,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            cursor: 'pointer',
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M23 4v6h-6M1 20v-6h6"/> 
                            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                        </svg>
                        {t('shuffle_avatars')}
                      </button>
                    </div>

                    <AvatarGrid
                      avatarOptions={avatarOptions}
                      selectedAvatar={selectedAvatar}
                      setSelectedAvatar={setSelectedAvatar}
                    />
                  </div>
                </div>

                {/* Bottom Row Actions */}
                <div className="add-profile-actions" style={{ display: 'flex', width: '100%', maxWidth: '500px', gap: '20px', marginTop: '1.5rem' }}>
                  <button
                    onClick={() => { triggerHaptic('light'); setIsAdding(false); setEditingProfile(null); }}
                    className="tv-action-btn tv-focusable"
                    tabIndex={0}
                    style={{
                      flex: 1,
                      padding: '16px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      color: '#fff',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '16px',
                      fontSize: '1rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    {t('cancel')}
                  </button>
                  <button
                    onClick={isAdding ? handleAddProfile : handleUpdateProfile}
                    disabled={addingLoading || !newProfileName.trim() || (newProfileHasPin && newProfilePin.length !== 4)}
                    className="tv-action-btn tv-focusable"
                    tabIndex={0}
                    style={{
                      flex: 2,
                      padding: '16px',
                      background: addingLoading || !newProfileName.trim() || (newProfileHasPin && newProfilePin.length !== 4) ? 'rgba(255, 255, 255, 0.05)' : '#ffffff',
                      color: addingLoading || !newProfileName.trim() || (newProfileHasPin && newProfilePin.length !== 4) ? 'rgba(255, 255, 255, 0.2)' : '#000000',
                      border: 'none',
                      borderRadius: '16px',
                      fontSize: '1rem',
                      fontWeight: 900,
                      cursor: addingLoading || !newProfileName.trim() || (newProfileHasPin && newProfilePin.length !== 4) ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {addingLoading ? t('saving') : t('save_profile')}
                  </button>
                </div>

                {!isAdding && editingProfile && (
                  <button
                    onClick={() => setDeleteProfileId(editingProfile.id)}
                    style={{
                      width: '100%',
                      maxWidth: '500px',
                      padding: '16px',
                      background: 'rgba(239, 68, 68, 0.1)',
                      border: '1.5px solid rgba(239, 68, 68, 0.2)',
                      borderRadius: '16px',
                      color: '#ef4444',
                      fontSize: '0.95rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      marginTop: '-1rem'
                    }}
                  >
                    Delete Profile
                  </button>
                )}
              </div>
          )}
      </div>

      {/* Custom Profile Deletion Confirmation Drawer */}
      {deleteProfileId && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10005,
          padding: '20px',
          animation: 'fadeInGlass 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        }}>
          <div style={{
            maxWidth: '380px',
            width: '100%',
            background: 'rgba(20, 20, 20, 0.95)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '24px',
            padding: '24px',
            boxShadow: '0 24px 80px rgba(0,0,0,0.8)',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            textAlign: 'center'
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '16px',
                overflow: 'hidden',
                border: '2px solid rgba(255,255,255,0.1)'
              }}>
                <img 
                  src={profiles.find(p => p.id === deleteProfileId)?.avatar || ''} 
                  alt="" 
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                />
              </div>
              <div>
                <h3 style={{ margin: '0 0 6px', fontSize: '1.2rem', fontWeight: 900, color: '#fff', letterSpacing: '-0.02em' }}>{t('delete_profile_title')}</h3>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.4 }}>
                  {t('delete_profile_confirm').replace('{name}', profiles.find(p => p.id === deleteProfileId)?.name || '')}
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => { triggerHaptic('light'); setDeleteProfileId(null); }}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '14px',
                  color: '#fff',
                  fontSize: '0.9rem',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                {t('cancel')}
              </button>
              <button
                onClick={executeDeleteProfile}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: '#e11d48',
                  border: 'none',
                  borderRadius: '14px',
                  color: '#fff',
                  fontSize: '0.9rem',
                  fontWeight: 900,
                  cursor: 'pointer',
                  boxShadow: '0 4px 16px rgba(225, 29, 72, 0.3)'
                }}
              >
                {t('delete_btn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const StaticStyles = React.memo(() => (
  <style>{`
    /* TV Setting Row focus styling */
    .tv-setting-row {
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
    }
    .tv-setting-row:focus,
    .tv-setting-row:focus-within,
    .tv-setting-row:focus-visible {
      transform: none !important;
      background: rgba(255, 255, 255, 0.08) !important;
      border-radius: 8px;
    }

    /* Desktop & Interactive Hover/Focus Transitions */
    .profiles-grid {
      transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    }
    
    .profile-item, .add-profile-btn {
      transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1) !important;
      outline: none !important;
    }

    /* Tactile Dimming effect on non-hovered and non-focused items */
    @media (min-width: 769px) {
      .profiles-grid:hover .profile-item:not(:hover),
      .profiles-grid:hover .add-profile-btn:not(:hover),
      .profiles-grid:focus-within .profile-item:not(:focus-within),
      .profiles-grid:focus-within .add-profile-btn:not(:focus-within) {
        opacity: 0.35 !important;
        transform: scale(0.95) !important;
        filter: grayscale(20%) blur(0.5px);
      }
      .profile-item:hover .profile-avatar-img-container,
      .profile-item:focus .profile-avatar-img-container,
      .add-profile-btn:hover .profile-avatar-img-container,
      .add-profile-btn:focus .profile-avatar-img-container {
        transform: scale(1.1) translateY(-8px) !important;
        border-color: transparent !important;
        box-shadow: 0 25px 55px rgba(0, 0, 0, 0.95) !important;
      }
      .profile-item:hover .profile-name,
      .profile-item:focus .profile-name {
        color: #ffffff !important;
        transform: translateY(-2px);
      }
    }

    /* Ensure active hovered/focused items stand out and do not get dimmed */
    .profile-item:hover, .profile-item:focus,
    .add-profile-btn:hover, .add-profile-btn:focus {
      opacity: 1 !important;
      transform: scale(1) !important;
    }

    .profile-avatar-img-container {
      transition: border-color 0.2s ease, transform 0.2s ease !important;
      border: none !important;
      border-radius: 32px !important;
      background: rgba(255, 255, 255, 0.02) !important;
    }

    .profile-name {
      transition: color 0.2s ease !important;
      color: rgba(255, 255, 255, 0.5) !important;
    }

    .add-profile-btn:hover span,
    .add-profile-btn:focus span {
      color: #ffffff !important;
    }

    .profile-manage-btn {
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1) !important;
      border: 1px solid rgba(255, 255, 255, 0.15) !important;
      outline: none !important;
    }

    .profile-manage-btn:hover, .profile-manage-btn:focus {
      background: #ffffff !important;
      color: #000000 !important;
      transform: translateY(-3px) !important;
      box-shadow: 0 12px 30px rgba(255, 255, 255, 0.2) !important;
    }

    /* Disable global tv-focusable shadow outlines on profile items at all times */
    body.tv-mode .profile-item.tv-focusable,
    body.tv-mode .profile-item.tv-focusable:focus,
    body.tv-mode .profile-item.tv-focusable:focus-within,
    body.tv-mode .add-profile-btn.tv-focusable,
    body.tv-mode .add-profile-btn.tv-focusable:focus,
    body.tv-mode .add-profile-btn.tv-focusable:focus-within,
    body.tv-mode .avatar-choice-item.tv-focusable,
    body.tv-mode .avatar-choice-item.tv-focusable:focus,
    body.tv-mode .avatar-choice-item.tv-focusable:focus-within {
      box-shadow: none !important;
      border-color: transparent !important;
      outline: none !important;
      border: none !important;
      background: transparent !important;
    }

    /* Create Profile TV Input & Buttons */
    .profile-input-tv {
      width: 100%;
      padding: 16px 20px;
      border-radius: 16px;
      background: rgba(0, 0, 0, 0.55);
      border: 1.5px solid rgba(255, 255, 255, 0.12);
      color: #fff;
      font-size: 1.15rem;
      font-weight: 700;
      outline: none;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .profile-input-tv:focus {
      border-color: #ffffff !important;
      background: rgba(255, 255, 255, 0.08) !important;
      box-shadow: 0 0 24px rgba(255, 255, 255, 0.25) !important;
    }

    .avatar-choice-item {
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1) !important;
      outline: none !important;
    }
    .avatar-choice-item:hover, .avatar-choice-item:focus {
      transform: scale(1.1) !important;
      border-color: #ffffff !important;
      box-shadow: 0 15px 35px rgba(0, 0, 0, 0.8), 0 0 20px rgba(255, 255, 255, 0.18) !important;
    }

    .tv-action-btn {
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1) !important;
      outline: none !important;
    }
    .tv-action-btn:hover, .tv-action-btn:focus {
      transform: scale(1.04) !important;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.45) !important;
    }
    .tv-action-btn:focus {
      border-color: #ffffff !important;
      background: #ffffff !important;
      color: #000000 !important;
    }

    .pin-btn:active {
      background: rgba(255,255,255,0.2) !important;
      transform: scale(0.92);
    }

    .shake {
      animation: shakeAnim 0.4s ease;
    }

    @keyframes shakeAnim {
      0%, 100% { transform: translateX(0); }
      20%, 60% { transform: translateX(-8px); }
      40%, 80% { transform: translateX(8px); }
    }

    /* Mobile overrides */
    @media (max-width: 400px), (max-height: 800px) {
      .profile-selector-container {
        padding: 0.75rem !important;
      }
      .profile-selector-title {
        font-size: 1.6rem !important;
        margin-bottom: 1rem !important;
      }
      .profiles-grid {
        gap: 1rem !important;
        margin-bottom: 0.5rem !important;
      }
      .profiles-grid .profile-avatar-img-container {
        width: 88px !important;
        height: 88px !important;
        border-radius: 20px !important;
      }
      .profile-avatar-name {
        gap: 0.5rem !important;
      }
      .profile-avatar-name span {
        font-size: 0.85rem !important;
      }
      .profile-manage-btn {
        margin-top: 1.5rem !important;
        padding: 8px 20px !important;
        font-size: 0.75rem !important;
        border-radius: 8px !important;
      }
      
      /* Add/Edit Profile Mobile Viewport Compactor */
      .add-profile-container {
        gap: 0.75rem !important;
      }
      .add-profile-title {
        font-size: 1.8rem !important;
      }
      .add-profile-row {
        gap: 0.75rem !important;
      }
      .add-profile-left-col {
        padding: 1rem !important;
        gap: 1rem !important;
        border-radius: 16px !important;
      }
      .add-profile-avatar-preview {
        width: 80px !important;
        height: 80px !important;
        border-radius: 18px !important;
        border-width: 2.5px !important;
      }
      .profile-input-tv {
        padding: 10px 14px !important;
        font-size: 0.95rem !important;
        border-radius: 12px !important;
      }
      .options-row-grid {
        gap: 8px !important;
      }
      .options-row-grid > div {
        padding: 10px 8px !important;
        border-radius: 12px !important;
        gap: 4px !important;
      }
      .options-row-grid span {
        font-size: 0.78rem !important;
      }
      .options-row-grid span:last-child {
        font-size: 0.65rem !important;
      }
      
      /* Avatar Choice Grid Compactor */
      .add-profile-right-col {
        gap: 0.5rem !important;
      }
      .add-profile-right-col span {
        font-size: 0.9rem !important;
      }
      .add-profile-right-col button {
        padding: 6px 12px !important;
        font-size: 0.75rem !important;
        border-radius: 8px !important;
      }
      .add-profile-avatar-grid {
        gap: 8px !important;
      }
      .avatar-choice-item {
        border-radius: 12px !important;
      }
      
      /* Action Buttons Compactor */
      .add-profile-actions {
        margin-top: 0.25rem !important;
        gap: 8px !important;
      }
      .add-profile-actions button {
        padding: 10px !important;
        font-size: 0.85rem !important;
        border-radius: 12px !important;
      }
      .add-profile-container > button {
        padding: 10px !important;
        font-size: 0.85rem !important;
        border-radius: 12px !important;
        margin-top: -0.5rem !important;
      }
    }
    
    @media (max-width: 768px) {
      .add-profile-container {
        max-width: 100% !important;
        gap: 1.5rem !important;
        padding: 0 0.5rem !important;
      }
      .add-profile-title {
        font-size: 1.8rem !important;
        margin-bottom: 0.5rem !important;
      }
      .add-profile-row {
        flex-direction: column !important;
        gap: 1.25rem !important;
        width: 100% !important;
      }
      .add-profile-left-col {
        flex: 1 1 auto !important;
        padding: 1.25rem 1rem !important;
        border-radius: 16px !important;
        gap: 1.25rem !important;
        width: 100% !important;
        box-sizing: border-box !important;
      }
      .add-profile-avatar-preview {
        width: 100px !important;
        height: 100px !important;
        border-radius: 20px !important;
        border-width: 3px !important;
      }
      .add-profile-right-col {
        flex: 1 1 auto !important;
        gap: 1rem !important;
        width: 100% !important;
        box-sizing: border-box !important;
      }
      .add-profile-avatar-grid {
        gap: 10px !important;
      }
      .add-profile-actions {
        margin-top: 1rem !important;
        gap: 12px !important;
        width: 100% !important;
      }
      .add-profile-actions button {
        padding: 12px !important;
        border-radius: 12px !important;
        font-size: 0.9rem !important;
      }
    }
    
    @keyframes zoomToCenterFadeOut {
      0% {
        transform: scale(1);
        opacity: 1;
      }
      35% {
        transform: scale(1.1);
        opacity: 1;
      }
      100% {
        transform: scale(2.2);
        opacity: 0;
      }
    }
  `}</style>
));
StaticStyles.displayName = 'StaticStyles';

const AvatarGrid = React.memo(({ avatarOptions, selectedAvatar, setSelectedAvatar }: any) => {
  return (
    <div className="add-profile-avatar-grid" style={{ 
      display: 'grid', 
      gridTemplateColumns: 'repeat(3, 1fr)', 
      gap: '16px',
    }}>
      {avatarOptions.map((url: string, index: number) => (
        <div 
          key={index}
          onClick={() => { triggerHaptic('light'); setSelectedAvatar(url); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              triggerHaptic('light');
              setSelectedAvatar(url);
            }
          }}
          className="avatar-choice-item tv-focusable"
          tabIndex={0}
          style={{
            aspectRatio: '1/1',
            borderRadius: '20px',
            overflow: 'hidden',
            position: 'relative',
            cursor: 'pointer',
            border: selectedAvatar === url ? '3.5px solid #ffffff' : '2px solid rgba(255,255,255,0.08)',
            boxShadow: selectedAvatar === url ? '0 12px 30px rgba(255, 255, 255, 0.15)' : '0 10px 25px rgba(0,0,0,0.5)',
            background: '#141414',
          }}
        >
          <img 
            src={url} 
            alt={`Option ${index}`} 
            loading="eager" 
            decoding="sync" 
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} 
            onError={(e) => {
              const target = e.currentTarget as HTMLImageElement;
              const fallbackId = Math.floor(Math.random() * 67) + 1;
              target.src = `/avatars/avatar-${fallbackId}.jpg`;
            }}
          />
        </div>
      ))}
    </div>
  );
});
AvatarGrid.displayName = 'AvatarGrid';
