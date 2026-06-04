import React, { useState, useEffect } from 'react';
import { COLORS } from '../../../constants';
import { Profile, ProfileService } from '../../../services/profiles';
import { triggerHaptic, triggerSuccessHaptic } from '../../../utils/haptics';

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
    // Select 6 unique random avatars from 67 available
    const set = new Set<number>();
    while(set.size < 6) {
        set.add(Math.floor(Math.random() * 67) + 1);
    }
    const urls = Array.from(set).map(id => `/avatars/avatar-${id}.jpg`);
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
      const data = await ProfileService.getProfiles();
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
                        transition: 'all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.02) translateY(-2px)'}
                    onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1) translateY(0)'}
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


  const handleSelect = (profile: Profile) => {
    triggerSuccessHaptic();
    onProfileSelected(profile);
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
      <style>{`
        /* Desktop & Interactive Hover Transitions */
        .profiles-grid {
          transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        
        .profile-item, .add-profile-btn {
          transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1) !important;
        }

        /* Tactile Dimming effect on non-hovered items */
        .profiles-grid:hover .profile-item:not(:hover),
        .profiles-grid:hover .add-profile-btn:not(:hover) {
          opacity: 0.35 !important;
          transform: scale(0.95) !important;
          filter: grayscale(20%) blur(0.5px);
        }

        .profile-avatar-img-container {
          transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1) !important;
          border: 2px solid rgba(255, 255, 255, 0.08) !important;
          border-radius: 32px !important;
          background: rgba(255, 255, 255, 0.02) !important;
        }

        .profile-name {
          transition: all 0.3s ease !important;
          color: rgba(255, 255, 255, 0.5) !important;
        }

        /* High-fidelity hover styles */
        .profile-item:hover .profile-avatar-img-container,
        .add-profile-btn:hover .profile-avatar-img-container {
          transform: scale(1.08) translateY(-6px) !important;
          border-color: rgba(255, 255, 255, 0.85) !important;
          box-shadow: 0 25px 50px rgba(0, 0, 0, 0.8), 0 0 30px rgba(255, 255, 255, 0.12) !important;
        }

        .profile-item:hover .profile-name {
          color: #ffffff !important;
          transform: translateY(-2px);
        }

        .add-profile-btn:hover span {
          color: #ffffff !important;
        }

        .profile-manage-btn {
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1) !important;
          border: 1px solid rgba(255, 255, 255, 0.15) !important;
        }

        .profile-manage-btn:hover {
          background: #ffffff !important;
          color: #000000 !important;
          transform: translateY(-3px) !important;
          box-shadow: 0 12px 30px rgba(255, 255, 255, 0.2) !important;
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
      `}</style>

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
                    {isManaging ? 'Manage Profiles' : "Who's watching?"}
                </h1>

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
                        onClick={() => !isManaging && handleSelect(profile)}
                        style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '1.2rem',
                        cursor: isManaging ? 'default' : 'pointer',
                        position: 'relative',
                        animation: `fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) ${idx * 0.1}s both`
                        }}
                        className={`profile-item ${isManaging ? 'managing' : ''} profile-avatar-name`}
                    >
                        <div style={{ position: 'relative' }}>
                            <div 
                                className="profile-avatar profile-avatar-img-container"
                                style={{
                                    width: 'clamp(100px, 14vw, 130px)', 
                                    height: 'clamp(100px, 14vw, 130px)',
                                    borderRadius: '28px', 
                                    overflow: 'hidden',
                                    border: '3.5px solid rgba(255,255,255,0.08)',
                                    background: 'rgba(255, 255, 255, 0.03)',
                                    boxShadow: '0 15px 40px rgba(0,0,0,0.5)',
                                    opacity: (isManaging) ? 0.4 : 1,
                                }}
                            >
                                <img 
                                    src={profile.avatar} 
                                    alt={profile.name}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
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
                    <div 
                        onClick={() => { triggerHaptic('light'); setIsAdding(true); }}
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '1.2rem',
                            cursor: 'pointer', 
                            animation: `fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) ${profiles.length * 0.1}s both`
                        }}
                        className="add-profile-btn profile-avatar-name"
                    >
                        <div 
                            className="add-icon-container profile-avatar-img-container"
                            style={{
                                width: 'clamp(100px, 14vw, 130px)',
                                height: 'clamp(100px, 14vw, 130px)',
                                borderRadius: '28px',
                                background: 'rgba(255,255,255,0.04)',
                                border: '3.5px solid rgba(255,255,255,0.08)',
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
                </div>

                {/* Manage Profiles Toggle */}
                {profiles.length > 0 && (
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
                            transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                            boxShadow: isManaging ? '0 8px 24px rgba(255,255,255,0.15)' : 'none'
                        }}
                        className="manage-btn profile-manage-btn"
                    >
                        {isManaging ? 'Finish' : 'Manage Profiles'}
                    </button>
                )}
              </>
          ) : (
              <div style={{
                width: '100%',
                animation: 'fadeInScale 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              }}>
                <h2 style={{
                    color: '#fff',
                    fontSize: '2.2rem',
                    fontWeight: 900,
                    marginBottom: '2.5rem',
                    textAlign: 'center',
                    letterSpacing: '-0.04em',
                }}>Create Profile</h2>
                
                <div style={{ width: '100%', maxWidth: '380px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2rem' }}>
                    <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        background: 'rgba(255,255,255,0.03)', 
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: '20px',
                        padding: '10px 16px',
                        width: '100%',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
                        gap: '16px'
                    }}>
                        <div style={{
                            width: '60px',
                            height: '60px',
                            borderRadius: '14px',
                            overflow: 'hidden',
                            flexShrink: 0,
                            border: '1px solid rgba(255,255,255,0.1)'
                        }}>
                             <img src={selectedAvatar} alt="Selected" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                        <input
                            autoFocus
                            type="text"
                            value={newProfileName}
                            onChange={(e) => setNewProfileName(e.target.value)}
                            placeholder="Profile Name"
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#fff',
                                fontSize: '1.2rem',
                                fontWeight: 700,
                                width: '100%',
                                outline: 'none',
                            }}
                        />
                    </div>

                    <div style={{ width: '100%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem', fontWeight: 700 }}>Choose Identity</span>
                            <button 
                                onClick={() => { triggerHaptic('light'); generateAvatarOptions(); }}
                                style={{ 
                                    background: 'rgba(255,255,255,0.05)', 
                                    border: 'none', 
                                    color: '#fff', 
                                    padding: '6px 14px', 
                                    borderRadius: '12px', 
                                    fontSize: '0.75rem',
                                    fontWeight: 800,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    cursor: 'pointer',
                                }}
                            >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <path d="M23 4v6h-6M1 20v-6h6"/> 
                                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                                </svg>
                                Shuffle
                            </button>
                        </div>

                        <div style={{ 
                            display: 'grid', 
                            gridTemplateColumns: 'repeat(3, 1fr)', 
                            gap: '12px',
                        }}>
                            {avatarOptions.map((url, index) => (
                                <div 
                                    key={index}
                                    onClick={() => { triggerHaptic('light'); setSelectedAvatar(url); }}
                                    style={{
                                        aspectRatio: '1/1',
                                        borderRadius: '16px',
                                        overflow: 'hidden',
                                        position: 'relative',
                                        cursor: 'pointer',
                                        transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                                        transform: selectedAvatar === url ? 'scale(1.05)' : 'scale(1)',
                                        border: selectedAvatar === url ? '3px solid #ffffff' : '1.5px solid transparent',
                                        boxShadow: selectedAvatar === url ? '0 8px 24px rgba(0,0,0,0.3)' : 'none'
                                    }}
                                >
                                    <img src={url} alt={`Option ${index}`} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: selectedAvatar === url ? 1 : 0.6 }} />
                                </div>
                            ))}
                        </div>
                    </div>

                    <div style={{ display: 'flex', width: '100%', gap: '12px', marginTop: '1rem' }}>
                        <button
                            onClick={() => { triggerHaptic('light'); setIsAdding(false); }}
                            style={{
                                flex: 1,
                                padding: '12px',
                                background: 'rgba(255,255,255,0.05)',
                                color: '#fff',
                                border: '1px solid rgba(255,255,255,0.08)',
                                borderRadius: '14px',
                                fontSize: '0.9rem',
                                fontWeight: 800,
                                cursor: 'pointer',
                                transition: 'all 0.25s',
                            }}
                        >
                            Cancel
                        </button>
                        <button
                                                            onClick={handleAddProfile}
                                                            disabled={addingLoading || !newProfileName.trim()}
                                                            style={{
                                                                flex: 2,
                                                                padding: '12px',
                                                                background: addingLoading || !newProfileName.trim() ? 'rgba(255,255,255,0.05)' : '#ffffff',
                                                                color: addingLoading || !newProfileName.trim() ? 'rgba(255,255,255,0.2)' : '#000000',
                                                                border: 'none',
                                                                borderRadius: '14px',
                                                                fontSize: '0.9rem',
                                                                fontWeight: 900,
                                                                cursor: 'pointer',
                                                                transition: 'all 0.25s',
                                                            }}
                                                        >
                            {addingLoading ? 'Saving...' : 'Save Profile'}
                        </button>
                    </div>
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
                <h3 style={{ margin: '0 0 6px', fontSize: '1.2rem', fontWeight: 900, color: '#fff', letterSpacing: '-0.02em' }}>Delete Profile?</h3>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.4 }}>
                  Are you sure you want to delete <strong style={{ color: '#fff' }}>{profiles.find(p => p.id === deleteProfileId)?.name}</strong>? This action is permanent and cannot be undone.
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
                Cancel
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
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
