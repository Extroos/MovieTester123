import React, { useState, useEffect } from 'react';
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
  const [newProfileName, setNewProfileName] = useState('');
  const [addingLoading, setAddingLoading] = useState(false);

  const [missingTables, setMissingTables] = useState(false);
  const [isManaging, setIsManaging] = useState(false);
  const [avatarOptions, setAvatarOptions] = useState<string[]>([]);
  const [selectedAvatar, setSelectedAvatar] = useState<string>('');
  const [deleteProfileId, setDeleteProfileId] = useState<string | null>(null);

  const generateAvatarOptions = () => {
    // Select 6 unique random avatars from 201 available
    const set = new Set<number>();
    while(set.size < 6) {
        set.add(Math.floor(Math.random() * 201) + 1);
    }
    const urls = Array.from(set).map(id => `/avatars/avatar-${id}.jpg`);
    // Preload all avatar images eagerly so they appear instantly (no fade-in)
    urls.forEach(url => {
      const img = new Image();
      img.src = url;
    });
    setAvatarOptions(urls);
    setSelectedAvatar(urls[0]);
  };

  useEffect(() => {
    if (isAdding) {
        generateAvatarOptions();
    }
  }, [isAdding]);

  useEffect(() => {
    loadProfiles();
  }, []);

  const loadProfiles = async () => {
    setLoading(true);
    try {
      let data = await ProfileService.getProfiles();
      
      // Cache localStorage read — avoid 3 separate synchronous reads
      const isGuestMode = localStorage.getItem('cinemovie_is_guest') === 'true';

      // Deduplicate guest profiles if any duplicates already exist in local storage
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
        // Only auto-create the default Guest profile on first-time initialization (when currentLocal is null)
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
    setLoading(false);
  };

  
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
                animation: 'slideUpGlass 0.7s cubic-bezier(0.16, 1, 0.3, 1)',
            }}>
                 <h1 style={{ color: '#ffffff', fontSize: '2rem', marginBottom: '1rem', fontWeight: 800, letterSpacing: '-0.5px' }}>Database Setup Required</h1>
                <p style={{ textAlign: 'left', lineHeight: '1.6', color: 'rgba(255, 255, 255, 0.6)', marginBottom: '2rem', fontSize: '1rem' }}>
                    The application needs to create tables in your Supabase project to function correctly. 
                    Please follow these simple steps to complete the setup:
                </p>
                
                <div style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '1.5rem', borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                    <ol style={{ marginLeft: '1.5rem', marginBottom: '1.5rem', color: 'rgba(255, 255, 255, 0.9)', lineHeight: '1.8' }}>
                        <li style={{ marginBottom: '0.5rem' }}>Go to your <a href="https://supabase.com/dashboard/project/_/sql" target="_blank" rel="noreferrer" style={{ color: '#ffffff', fontWeight: 600, textDecoration: 'none', borderBottom: '1px solid currentColor' }}>Supabase SQL Editor</a>.</li>
                        <li style={{ marginBottom: '0.5rem' }}>Click <strong>"New Query"</strong>.</li>
                        <li style={{ marginBottom: '0.5rem' }}>Paste the SQL code provided below.</li>
                        <li style={{ marginBottom: '0.5rem' }}>Click <strong>"Run"</strong> and ensure success.</li>
                        <li>Refresh this page to start.</li>
                    </ol>
                    
                    <div style={{ position: 'relative' }}>
                        <pre style={{ 
                            background: 'rgba(10, 10, 10, 0.8)', 
                            padding: '1.25rem', 
                            borderRadius: '12px', 
                            overflowX: 'auto', 
                            fontSize: '0.875rem', 
                            color: '#34d399',
                            maxHeight: '300px',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            lineHeight: '1.6',
                            fontFamily: 'monospace'
                        }}>
{`-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. PROFILES TABLE
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
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS for Profiles
alter table profiles enable row level security;

create policy "Users can view their own profiles"
  on profiles for select
  using (auth.uid() = user_id);

create policy "Users can insert their own profiles"
  on profiles for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own profiles"
  on profiles for update
  using (auth.uid() = user_id);

create policy "Users can delete their own profiles"
  on profiles for delete
  using (auth.uid() = user_id);

-- 2. MY LIST TABLE
create table my_list (
  id uuid default uuid_generate_v4() primary key,
  profile_id uuid references profiles(id) on delete cascade not null,
  movie_id integer not null, -- TMDB ID
  type text not null check (type in ('movie', 'tv')),
  data jsonb not null,
  added_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(profile_id, movie_id, type)
);

-- RLS for My List
alter table my_list enable row level security;

create policy "Users can view their list via profile"
  on my_list for select
  using (exists (select 1 from profiles where profiles.id = my_list.profile_id and profiles.user_id = auth.uid()));

create policy "Users can insert into their list via profile"
  on my_list for insert
  with check (exists (select 1 from profiles where profiles.id = my_list.profile_id and profiles.user_id = auth.uid()));

create policy "Users can delete from their list via profile"
  on my_list for delete
  using (exists (select 1 from profiles where profiles.id = my_list.profile_id and profiles.user_id = auth.uid()));

-- 3. WATCH PROGRESS TABLE
create table watch_progress (
  id uuid default uuid_generate_v4() primary key,
  profile_id uuid references profiles(id) on delete cascade not null,
  item_id integer not null,
  type text not null check (type in ('movie', 'tv')),
  progress integer not null,
  duration integer not null,
  season_number integer,
  episode_number integer,
  last_watched timestamp with time zone default timezone('utc'::text, now()) not null,
  data jsonb not null,
  unique(profile_id, item_id, type)
);

-- RLS for Watch Progress
alter table watch_progress enable row level security;

create policy "Users can view their progress via profile"
  on watch_progress for select
  using (exists (select 1 from profiles where profiles.id = watch_progress.profile_id and profiles.user_id = auth.uid()));

create policy "Users can insert/update their progress via profile"
  on watch_progress for all
  using (exists (select 1 from profiles where profiles.id = watch_progress.profile_id and profiles.user_id = auth.uid()));

-- 4. REVIEWS TABLE
create table if not exists reviews (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  item_id text not null,
  content text not null,
  rating integer not null check (rating >= 1 and rating <= 10),
  spoiler boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS for Reviews
alter table reviews enable row level security;
create policy "Reviews are viewable by everyone" on reviews for select using (true);
create policy "Users can create reviews" on reviews for insert with check (auth.uid() = user_id);

-- 5. RATINGS TABLE
create table if not exists ratings (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  item_id text not null,
  rating integer not null check (rating >= 1 and rating <= 10),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, item_id)
);

-- RLS for Ratings
alter table ratings enable row level security;
create policy "Ratings are viewable by everyone" on ratings for select using (true);
create policy "Users can rate items" on ratings for insert with check (auth.uid() = user_id);
create policy "Users can update their ratings" on ratings for update using (auth.uid() = user_id);

-- 6. REVIEW LIKES TABLE
create table if not exists review_likes (
  id uuid default uuid_generate_v4() primary key,
  review_id uuid references reviews(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(review_id, user_id)
);

-- RLS for Review Likes
alter table review_likes enable row level security;
create policy "Review likes are viewable by everyone" on review_likes for select using (true);
create policy "Users can like reviews" on review_likes for insert with check (auth.uid() = user_id);
create policy "Users can unlike their own likes" on review_likes for delete using (auth.uid() = user_id);

-- 7. ACTIVITY REACTIONS TABLE
create table if not exists activity_reactions (
  id uuid default uuid_generate_v4() primary key,
  item_id text not null,
  media_type text not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  target_user_id uuid references auth.users(id) on delete cascade not null,
  emoji text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(item_id, user_id, target_user_id, emoji)
);

-- RLS for Activity Reactions
alter table activity_reactions enable row level security;
create policy "Activity reactions are viewable by everyone" on activity_reactions for select using (true);
create policy "Users can react to activity" on activity_reactions for insert with check (auth.uid() = user_id);

-- 8. NOTIFICATIONS TABLE
create table if not exists notifications (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  type text not null,
  title text not null,
  content text not null,
  data jsonb,
  is_read boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS for Notifications
alter table notifications enable row level security;
create policy "Users can view their own notifications" on notifications for select using (auth.uid() = user_id);
create policy "System/users can insert notifications" on notifications for insert with check (true);
create policy "Users can update their own notifications" on notifications for update using (auth.uid() = user_id);
create policy "Users can delete their own notifications" on notifications for delete using (auth.uid() = user_id);

-- 9. FRIENDS TABLE
create table if not exists friends (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  friend_id uuid references auth.users(id) on delete cascade not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, friend_id)
);

-- RLS for Friends
alter table friends enable row level security;
create policy "Users can view their own friends" on friends for select using (auth.uid() = user_id or auth.uid() = friend_id);
create policy "Users can insert friends" on friends for insert with check (auth.uid() = user_id);
create policy "Users can delete friends" on friends for delete using (auth.uid() = user_id);

-- 10. FRIEND REQUESTS TABLE
create table if not exists friend_requests (
  id uuid default uuid_generate_v4() primary key,
  sender_id uuid references auth.users(id) on delete cascade not null,
  receiver_id uuid references auth.users(id) on delete cascade not null,
  status text not null check (status in ('pending', 'accepted', 'declined')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(sender_id, receiver_id)
);

-- RLS for Friend Requests
alter table friend_requests enable row level security;
create policy "Users can view their own requests" on friend_requests for select using (auth.uid() = sender_id or auth.uid() = receiver_id);
create policy "Users can insert request" on friend_requests for insert with check (auth.uid() = sender_id);
create policy "Users can update request" on friend_requests for update using (auth.uid() = receiver_id);
create policy "Users can delete request" on friend_requests for delete using (auth.uid() = sender_id or auth.uid() = receiver_id);
`}
                    </pre>
                    </div>
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

  const handleAddProfile = async () => {
    if (!newProfileName.trim() || addingLoading) return;
    
    setAddingLoading(true);
    triggerSuccessHaptic();
    try {
        const newProfile = await ProfileService.addProfile(newProfileName.trim(), false, selectedAvatar);
        if (newProfile) {
            await loadProfiles();
            setIsAdding(false);
            setNewProfileName('');
        }
    } catch (e) {
        // Fallback for failed add (likely also missing table if not caught by get)
        console.error(e);
    }
    setAddingLoading(false);
  };


  // TV Mode variables
  const isTVMode = typeof localStorage !== 'undefined' && localStorage.getItem('cinemovie_is_tv') === 'true';
  const [backgroundMediaList, setBackgroundMediaList] = useState<any[]>([]);
  const [currentMediaIdx, setCurrentMediaIdx] = useState<number>(0);
  const [activeProfileIdx, setActiveProfileIdx] = useState<number>(0);
  const [isFading, setIsFading] = useState<boolean>(false);
  const [activeMediaLogo, setActiveMediaLogo] = useState<string | null>(null);

  // Fetch background media (TV mode only)
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

  // Fetch current media logo
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
        // Find first English logo
        const englishLogo = logos.find((l: any) => l.iso_639_1 === 'en');
        if (englishLogo) {
          setActiveMediaLogo(`https://image.tmdb.org/t/p/w500${englishLogo.file_path}`);
        }
      })
      .catch(() => {});
  }, [isTVMode, backgroundMediaList, currentMediaIdx]);  // Rotates background media every 30 seconds with cross-fade animation to black (TV mode only)
  useEffect(() => {
    if (!isTVMode || backgroundMediaList.length === 0) return;
    const interval = setInterval(() => {
      // Start fade to black
      setIsFading(true);
      setTimeout(() => {
        setCurrentMediaIdx(prev => (prev + 1) % backgroundMediaList.length);
        // Wait in the dark for 1.2s to change state before fading in
        setTimeout(() => {
          setIsFading(false);
        }, 1200);
      }, 800); // 800ms transition duration to reach complete black screen
    }, 30000);
    return () => clearInterval(interval);
  }, [isTVMode, backgroundMediaList]);

  const [selectingProfile, setSelectingProfile] = useState<Profile | null>(null);

  const handleSelect = (profile: Profile) => {
    triggerSuccessHaptic();
    if (isTVMode) {
      setSelectingProfile(profile);
      setTimeout(() => {
        onProfileSelected(profile);
      }, 2400); // 2.4s delay to load backdrop, row cards, and hero elements silently in background
    } else {
      onProfileSelected(profile);
    }
  };

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

  const handleDeleteProfile = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    triggerHaptic('medium');
    setDeleteProfileId(id);
  };

  const executeDeleteProfile = async () => {
    if (!deleteProfileId) return;
    triggerHaptic('heavy');
    setLoading(true);
    await ProfileService.deleteProfile(deleteProfileId);
    await loadProfiles();
    setDeleteProfileId(null);
    setLoading(false);
  };

  const activeMedia = backgroundMediaList[currentMediaIdx];  // Render TV-optimized split layout
  if (isTVMode) {
    return (
      <div 
        className="profile-selector-container"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 10000,
          background: '#000000',
          display: 'flex',
          flexDirection: 'row',
          overflow: 'hidden',
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }}
      >
        <StaticStyles />

        {/* Fullscreen zoom-to-center select profile transition overlay */}
        {selectingProfile && (
          <div style={{
            position: 'fixed',
            inset: 0,
            background: '#000000',
            zIndex: 200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: 'fadeIn 0.3s ease-out'
          }}>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '24px',
              animation: 'zoomToCenterFadeOut 2.2s cubic-bezier(0.16, 1, 0.3, 1) forwards'
            }}>
              <div style={{
                width: '120px',
                height: '120px',
                borderRadius: '16px',
                overflow: 'hidden',
                boxShadow: '0 0 0 4px #ffffff, 0 20px 50px rgba(0,0,0,0.9)'
              }}>
                <img 
                  src={selectingProfile.avatar} 
                  alt="" 
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                />
              </div>
              <span style={{
                fontSize: '1.8rem',
                fontWeight: 900,
                color: '#ffffff',
                textShadow: '0 4px 12px rgba(0,0,0,0.6)'
              }}>
                {selectingProfile.name}
              </span>
            </div>
          </div>
        )}

        {/* Left Side: Dark Profiles Panel (approx 38% width) */}
        <div style={{
          width: '38%',
          minWidth: '420px',
          height: '100%',
          background: 'linear-gradient(to right, #000000 65%, rgba(0,0,0,0.92) 85%, transparent 100%)',
          zIndex: 15,
          padding: '60px 40px',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'flex-start',
          position: 'relative'
        }}>
          {/* Brand Logo */}
          <div style={{
            position: 'absolute',
            top: '55px',
            left: '40px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            <img 
              src="/cinemovie-logo.png" 
              alt="CineMovie" 
              style={{
                height: '48px',
                width: 'auto',
                objectFit: 'contain'
              }} 
            />
            <span style={{
              fontSize: '0.88rem',
              fontWeight: 700,
              color: 'rgba(255, 255, 255, 0.45)',
              letterSpacing: '0.04em',
              textTransform: 'none',
              marginLeft: '2px'
            }}>
              Choose a Profile
            </span>
          </div>

          {isAdding ? (
            /* TV-Optimized Create Profile Form */
            <div style={{ width: '100%', marginTop: '90px', display: 'flex', flexDirection: 'column', gap: '20px', boxSizing: 'border-box', animation: 'fadeInScale 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }}>
              <h2 style={{ color: '#fff', fontSize: '1.8rem', fontWeight: 900, margin: '0 0 10px 0', letterSpacing: '-0.03em' }}>{t('create_profile')}</h2>
              
              {/* Profile Setup Area (Removed Card Background) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', boxSizing: 'border-box' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', width: '100%' }}>
                  {/* Selected Avatar Preview */}
                  <div style={{ width: '64px', height: '64px', borderRadius: '12px', overflow: 'hidden', border: '2.5px solid rgba(255, 255, 255, 0.15)', flexShrink: 0 }}>
                    <img src={selectedAvatar} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                  {/* Input Name field */}
                  <div style={{ flex: 1 }}>
                    <input
                      autoFocus
                      type="text"
                      value={newProfileName}
                      onChange={(e) => setNewProfileName(e.target.value)}
                      placeholder={t('profile_name')}
                      className="profile-input-tv tv-focusable"
                      style={{
                        width: '100%',
                        padding: '12px 16px',
                        borderRadius: '12px',
                        background: '#141414',
                        border: '1.5px solid rgba(255,255,255,0.08)',
                        color: '#fff',
                        fontSize: '1rem',
                        fontWeight: 700,
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                </div>

                {/* Avatar Selection Area */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', fontWeight: 800 }}>Choose Avatar</span>
                    <button
                      onClick={() => { triggerHaptic('light'); generateAvatarOptions(); }}
                      className="tv-focusable"
                      style={{ background: 'rgba(255,255,255,0.06)', border: 'none', color: '#fff', padding: '4px 10px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer' }}
                    >
                      Shuffle
                    </button>
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px' }}>
                    {avatarOptions.slice(0, 5).map((url: string, index: number) => (
                      <div
                        key={index}
                        onClick={() => setSelectedAvatar(url)}
                        className="tv-focusable"
                        tabIndex={0}
                        style={{
                          aspectRatio: '1/1',
                          borderRadius: '10px',
                          overflow: 'hidden',
                          cursor: 'pointer',
                          border: selectedAvatar === url ? '2.5px solid #ffffff' : '1.5px solid rgba(255,255,255,0.08)',
                          background: '#141414'
                        }}
                      >
                        <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Action Buttons Row */}
              <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
                <button
                  onClick={() => setIsAdding(false)}
                  className="tv-focusable"
                  style={{
                    flex: 1,
                    padding: '12px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    color: '#fff',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '12px',
                    fontSize: '0.9rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    outline: 'none'
                  }}
                >
                  {t('cancel')}
                </button>
                <button
                  onClick={handleAddProfile}
                  disabled={addingLoading || !newProfileName.trim()}
                  className="tv-focusable"
                  style={{
                    flex: 1.5,
                    padding: '12px',
                    background: addingLoading || !newProfileName.trim() ? 'rgba(255, 255, 255, 0.05)' : '#ffffff',
                    color: addingLoading || !newProfileName.trim() ? 'rgba(255, 255, 255, 0.2)' : '#000000',
                    border: 'none',
                    borderRadius: '12px',
                    fontSize: '0.9rem',
                    fontWeight: 900,
                    cursor: addingLoading || !newProfileName.trim() ? 'not-allowed' : 'pointer',
                    outline: 'none'
                  }}
                >
                  {addingLoading ? t('saving') : t('save_profile')}
                </button>
              </div>
            </div>
          ) : (
            /* TV-Optimized Profile Grid list */
            <>
              {/* Profiles Grid (3 columns next to each other, no scrolling) */}
              <div 
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '16px',
                  width: '100%',
                  marginTop: '110px',
                  boxSizing: 'border-box'
                }}
              >
                {profiles.map((profile, idx) => {
                  const isFocused = idx === activeProfileIdx;
                  const hideName = profiles.length >= 4;
                  return (
                    <div
                      key={profile.id}
                      onClick={(e) => {
                        if (isManaging) {
                          handleDeleteProfile(profile.id, e);
                        } else {
                          handleSelect(profile);
                        }
                      }}
                      onFocus={() => setActiveProfileIdx(idx)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          if (isManaging) {
                            handleDeleteProfile(profile.id, e as any);
                          } else {
                            handleSelect(profile);
                          }
                        }
                      }}
                      tabIndex={0}
                      className="profile-item tv-focusable"
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '8px',
                        borderRadius: '12px',
                        cursor: 'pointer',
                        outline: 'none',
                        position: 'relative',
                        transition: 'all 0.2s ease',
                        boxSizing: 'border-box'
                      }}
                    >

                      {/* Profile Avatar Card Container */}
                      <div style={{
                        width: '76px',
                        height: '76px',
                        borderRadius: '8px',
                        overflow: 'hidden',
                        flexShrink: 0,
                        boxShadow: isFocused ? '0 0 0 3px #ffffff' : 'none',
                        transform: isFocused ? 'scale(1.04)' : 'scale(1)',
                        opacity: isFocused ? 1 : 0.5,
                        transition: 'all 0.2s ease',
                        border: 'none',
                        background: '#141414',
                        position: 'relative'
                      }}>
                        <img 
                          src={profile.avatar} 
                          alt="" 
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          onError={(e) => {
                            const target = e.currentTarget as HTMLImageElement;
                            target.src = `/avatars/avatar-${(idx % 6) + 1}.jpg`;
                          }}
                        />

                        {/* TV Deletion Overlay when in Manage mode */}
                        {isManaging && (
                          <div style={{
                            position: 'absolute',
                            inset: 0,
                            background: 'rgba(225, 29, 72, 0.8)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 10
                          }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5">
                              <line x1="18" y1="6" x2="6" y2="18"></line>
                              <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                          </div>
                        )}
                      </div>

                      {/* Profile Name Displayed below the avatar only if 3 or fewer profiles */}
                      {!hideName && (
                        <span style={{
                          fontSize: '0.9rem',
                          fontWeight: 800,
                          color: isFocused ? '#ffffff' : 'rgba(255, 255, 255, 0.6)',
                          textShadow: '0 2px 4px rgba(0,0,0,0.6)',
                          transition: 'color 0.2s ease',
                          textAlign: 'center',
                          maxWidth: '80px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {profile.name}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Action Row: Manage Profiles & Add Profile side-by-side */}
              <div style={{ display: 'flex', gap: '12px', width: '100%', marginTop: '36px', boxSizing: 'border-box' }}>
                {/* Manage Profiles Trigger Button */}
                {profiles.length > 0 && localStorage.getItem('cinemovie_is_guest') !== 'true' && (() => {
                  const isFocused = activeProfileIdx === profiles.length;
                  return (
                    <button
                      onFocus={() => setActiveProfileIdx(profiles.length)}
                      onClick={() => { triggerHaptic('medium'); setIsManaging(!isManaging); }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          triggerHaptic('medium');
                          setIsManaging(!isManaging);
                        }
                      }}
                      tabIndex={0}
                      className="tv-focusable"
                      style={{
                        flex: 1,
                        padding: '10px 16px',
                        background: isManaging ? '#ffffff' : 'rgba(255,255,255,0.06)',
                        color: isManaging ? '#000000' : 'rgba(255,255,255,0.6)',
                        border: isFocused ? '1.5px solid #ffffff' : '1.5px solid rgba(255,255,255,0.1)',
                        borderRadius: '12px',
                        fontSize: '0.85rem',
                        fontWeight: 900,
                        cursor: 'pointer',
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        transition: 'all 0.2s ease',
                        outline: 'none'
                      }}
                    >
                      {isManaging ? 'Finish' : 'Manage'}
                    </button>
                  );
                })()}

                {/* Small Plus/Add Button next to Manage */}
                {!(localStorage.getItem('cinemovie_is_guest') === 'true' && profiles.length >= 1) && (() => {
                  const isFocused = activeProfileIdx === (profiles.length + 1);
                  return (
                    <button
                      onFocus={() => setActiveProfileIdx(profiles.length + 1)}
                      onClick={() => { triggerHaptic('light'); setIsAdding(true); }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          triggerHaptic('light');
                          setIsAdding(true);
                        }
                      }}
                      tabIndex={0}
                      className="tv-focusable"
                      style={{
                        width: '42px',
                        height: '42px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'rgba(255,255,255,0.06)',
                        border: isFocused ? '1.5px solid #ffffff' : '1.5px solid rgba(255,255,255,0.1)',
                        borderRadius: '12px',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        outline: 'none',
                        flexShrink: 0
                      }}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                      </svg>
                    </button>
                  );
                })()}
              </div>
            </>
          )}
        </div>

        {/* Right Side: Rotating Media Poster & Details */}
        <div style={{
          flex: 1,
          height: '100%',
          position: 'relative',
          background: '#000000',
          zIndex: 10
        }}>
          {activeMedia ? (
            <div key={activeMedia.id} style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}>
              <img
                src={`https://image.tmdb.org/t/p/w1280${activeMedia.backdrop_path}`}
                alt=""
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  opacity: isFading ? 0 : 0.75,
                  transition: 'opacity 0.8s ease-in-out'
                }}
              />
              {/* Overlay Gradients to bind it with profiles and screen edges */}
              <div style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(to right, #000000 5%, rgba(0,0,0,0.15) 35%, transparent 100%)'
              }} />
              <div style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(to bottom, transparent 55%, rgba(0,0,0,0.95) 100%)'
              }} />

              {/* Title & Metadata Details Overlay (Bottom Right) */}
              <div style={{
                position: 'absolute',
                bottom: '10%',
                right: '8%',
                maxWidth: '600px',
                textAlign: 'right',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
                gap: '10px',
                zIndex: 12,
                opacity: isFading ? 0 : 1,
                transition: 'opacity 0.8s ease-in-out'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '0.8rem',
                  fontWeight: 900,
                  color: 'rgba(255,255,255,0.7)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em'
                }}>
                  <span>{activeMedia.media_type === 'tv' ? 'Series' : 'Film'}</span>
                </div>

                {/* Show Movie Graphic Logo if available, fallback to styled small text title */}
                {activeMediaLogo ? (
                  <img
                    src={activeMediaLogo}
                    alt={activeMedia.title || activeMedia.name}
                    style={{
                      maxHeight: '120px',
                      maxWidth: '85%',
                      objectFit: 'contain',
                      margin: '12px 0',
                      filter: 'drop-shadow(0 4px 16px rgba(0,0,0,0.8))'
                    }}
                  />
                ) : (
                  <h2 style={{
                    margin: '4px 0 8px 0',
                    fontSize: '2.4rem',
                    fontWeight: 950,
                    color: '#ffffff',
                    lineHeight: 1.05,
                    letterSpacing: '-1px',
                    textShadow: '0 4px 20px rgba(0,0,0,0.95)'
                  }}>
                    {activeMedia.title || activeMedia.name}
                  </h2>
                )}
                
                {/* Custom formatted genre bullet points matching photo */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '0.9rem',
                  fontWeight: 700,
                  color: 'rgba(255,255,255,0.85)',
                  textShadow: '0 2px 4px rgba(0,0,0,0.7)',
                  marginBottom: '6px'
                }}>
                  {activeMedia.genre_ids?.slice(0, 3).map((id: number, gIdx: number) => {
                    const gMap: Record<number, string> = {
                      28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
                      99: 'Doc', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
                      27: 'Horror', 10402: 'Music', 9648: 'Sci-Fi Mystery', 10749: 'Romance', 878: 'Sci-Fi',
                      10770: 'Thriller', 53: 'Thriller', 10752: 'War', 37: 'Western',
                      10759: 'Action', 10762: 'Kids', 10765: 'Sci-Fi Mystery'
                    };
                    const name = gMap[id] || 'Cerebral';
                    return (
                      <React.Fragment key={id}>
                        {gIdx > 0 && <span style={{ color: 'rgba(255,255,255,0.4)' }}>•</span>}
                        <span>{name}</span>
                      </React.Fragment>
                    );
                  }) || (
                    <>
                      <span>Mind-Bending</span>
                      <span style={{ color: 'rgba(255,255,255,0.4)' }}>•</span>
                      <span>Cerebral</span>
                      <span style={{ color: 'rgba(255,255,255,0.4)' }}>•</span>
                      <span>Sci-Fi Mystery</span>
                    </>
                  )}
                </div>

                <p style={{
                  margin: 0,
                  fontSize: '0.88rem',
                  fontWeight: 500,
                  color: 'rgba(255,255,255,0.65)',
                  lineHeight: 1.5,
                  textAlign: 'right',
                  textShadow: '0 2px 8px rgba(0,0,0,0.95)',
                  display: '-webkit-box',
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  maxWidth: '480px'
                }}>
                  {activeMedia.overview}
                </p>
              </div>
            </div>
          ) : (
            <div style={{
              width: '100%',
              height: '100%',
              background: 'radial-gradient(circle at 75% 50%, rgba(255, 255, 255, 0.03) 0%, transparent 60%)'
            }} />
          )}
        </div>

        {/* Custom Profile Deletion Confirmation Drawer inside TV Mode */}
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
            zIndex: 100000,
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
                  autoFocus
                  onClick={() => { triggerHaptic('light'); setDeleteProfileId(null); }}
                  className="tv-focusable"
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
                  className="tv-focusable"
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
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div 
      className="profile-selector-container"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: '#09090b',
        backgroundImage: 'radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.05) 0%, #09090b 80%)',
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
          {!isAdding ? (
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

                <ProfilesGrid
                  profiles={profiles}
                  isManaging={isManaging}
                  handleSelect={handleSelect}
                  handleDeleteProfile={handleDeleteProfile}
                  setIsAdding={setIsAdding}
                />

                {/* Manage Profiles Toggle */}
                {profiles.length > 0 && localStorage.getItem('cinemovie_is_guest') !== 'true' && (
                    <button
                        onClick={() => { triggerHaptic('medium'); setIsManaging(!isManaging); }}
                        tabIndex={0}
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
                            transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                            boxShadow: isManaging ? '0 8px 24px rgba(255,255,255,0.15)' : 'none'
                        }}
                        className="manage-btn profile-manage-btn tv-focusable"
                    >
                      {isManaging ? t('finish') : t('manage_profiles')}
                    </button>
                )}
              </>
          ) : (
              <div className="add-profile-container" style={{
                width: '100%',
                maxWidth: '850px',
                animation: 'fadeInScale 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '2.5rem',
                background: isTVMode ? '#000000' : 'transparent',
                padding: isTVMode ? '40px' : '0',
                borderRadius: '24px'
              }}>
                <h2 className="add-profile-title" style={{
                    color: '#fff',
                    fontSize: '2.8rem',
                    fontWeight: 900,
                    letterSpacing: '-0.04em',
                    margin: 0,
                    textAlign: 'center',
                }}>{t('create_profile')}</h2>
                
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
                    background: isTVMode ? '#09090b' : 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    borderRadius: '24px',
                    padding: '2.5rem 2rem',
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
                    <div style={{ width: '100%' }}>
                      <input
                        autoFocus
                        type="text"
                        value={newProfileName}
                        onChange={(e) => { setNewProfileName(e.target.value); }}
                        placeholder={t('profile_name')}
                        className="profile-input-tv tv-focusable"
                        tabIndex={0}
                        style={{
                          width: '100%',
                          padding: '16px 20px',
                          borderRadius: '16px',
                          background: isTVMode ? '#141414' : 'rgba(0,0,0,0.55)',
                          border: '1.5px solid rgba(255,255,255,0.08)',
                          color: '#fff',
                          fontSize: '1.15rem',
                          fontWeight: 700,
                          outline: 'none',
                          boxSizing: 'border-box'
                        }}
                      />
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
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            triggerHaptic('light');
                            generateAvatarOptions();
                          }
                        }}
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
                    onClick={() => { triggerHaptic('light'); setIsAdding(false); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        triggerHaptic('light');
                        setIsAdding(false);
                      }
                    }}
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
                    onClick={handleAddProfile}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleAddProfile();
                      }
                    }}
                    disabled={addingLoading || !newProfileName.trim()}
                    className="tv-action-btn tv-focusable"
                    tabIndex={0}
                    style={{
                      flex: 2,
                      padding: '16px',
                      background: addingLoading || !newProfileName.trim() ? 'rgba(255, 255, 255, 0.05)' : '#ffffff',
                      color: addingLoading || !newProfileName.trim() ? 'rgba(255, 255, 255, 0.2)' : '#000000',
                      border: 'none',
                      borderRadius: '16px',
                      fontSize: '1rem',
                      fontWeight: 900,
                      cursor: addingLoading || !newProfileName.trim() ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {addingLoading ? t('saving') : t('save_profile')}
                  </button>
                </div>
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

    /* Mobile overrides */
    @media (max-width: 400px), (max-height: 800px) {
      .profile-selector-container {
        padding: 1rem !important;
      }
      .profile-selector-title {
        font-size: 1.8rem !important;
        margin-bottom: 1.8rem !important;
      }
      .profiles-grid {
        gap: 1.2rem !important;
        margin-bottom: 0.5rem !important;
      }
      .profile-avatar-img-container {
        width: 75px !important;
        height: 75px !important;
        border-radius: 18px !important;
      }
      .profile-avatar-name {
        gap: 0.6rem !important;
      }
      .profile-avatar-name span {
        font-size: 0.88rem !important;
      }
      .profile-manage-btn {
        margin-top: 2rem !important;
        padding: 10px 24px !important;
        font-size: 0.78rem !important;
        border-radius: 10px !important;
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

const ProfilesGrid = React.memo(({ profiles, isManaging, handleSelect, handleDeleteProfile, setIsAdding }: any) => {
  return (
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
        {profiles.map((profile: any, idx: number) => (
        <div 
            key={profile.id}
            onClick={() => !isManaging && handleSelect(profile)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (!isManaging) handleSelect(profile);
              }
            }}
            tabIndex={0}
            style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1.2rem',
            cursor: isManaging ? 'default' : 'pointer',
            position: 'relative',
            // Disable heavy entry animation delays on mobile screens for faster rendering
            animation: window.innerWidth <= 768 ? 'none' : `fadeInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) ${idx * 0.05}s both`
            }}
            className={`profile-item ${isManaging ? 'managing' : ''} profile-avatar-name tv-focusable`}
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
                        opacity: (isManaging) ? 0.4 : 1,
                    }}
                >
                    <img 
                        src={profile.avatar} 
                        alt={profile.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={(e) => {
                          const target = e.currentTarget as HTMLImageElement;
                          const fallbackId = Math.floor(Math.random() * 67) + 1;
                          target.src = `/avatars/avatar-${fallbackId}.jpg`;
                        }}
                    />
                    
                    {/* Delete Overlay */}
                    {isManaging && (
                        <div 
                            onClick={(e) => handleDeleteProfile(profile.id, e)}
                            style={{
                                position: 'absolute',
                                inset: 0,
                                background: 'rgba(255, 255, 255, 0.12)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                zIndex: 10,
                                backdropFilter: 'blur(10px)',
                                animation: 'fadeInScale 0.2s ease-out',
                            }}
                        >
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </div>
                    )}
                </div>

                {profile.isKids && (
                    <div style={{
                        position: 'absolute',
                        top: '-6px',
                        right: '-6px',
                        background: 'rgba(255, 255, 255, 0.15)',
                        border: '1px solid rgba(255, 255, 255, 0.25)',
                        color: '#fff',
                        fontSize: '0.72rem',
                        fontWeight: 900,
                        padding: '3px 8px',
                        borderRadius: '10px',
                        letterSpacing: '0.05em',
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
                        zIndex: 11
                    }}>
                        KIDS
                    </div>
                )}
            </div>
            <span style={{
                color: 'rgba(255,255,255,0.5)',
                fontSize: '1.05rem',
                fontWeight: 700,
                letterSpacing: '-0.02em'
            }}
            className="profile-name"
            >
                {profile.name}
            </span>
        </div>
        ))}

        {/* Add Profile Button */}
        {!(localStorage.getItem('cinemovie_is_guest') === 'true' && profiles.length >= 1) && (
          <div 
              onClick={() => { triggerHaptic('light'); setIsAdding(true); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  triggerHaptic('light');
                  setIsAdding(true);
                }
              }}
              tabIndex={0}
              style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '1.2rem',
                  cursor: 'pointer', 
                  animation: window.innerWidth <= 768 ? 'none' : `fadeInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) ${profiles.length * 0.05}s both`
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
                      border: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 15px 40px rgba(0,0,0,0.5)'
                    }}
              >
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19"></line>
                      <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
              </div>
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '1.05rem', fontWeight: 700 }}>Add Profile</span>
          </div>
        )}
    </div>
  );
});
ProfilesGrid.displayName = 'ProfilesGrid';

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
