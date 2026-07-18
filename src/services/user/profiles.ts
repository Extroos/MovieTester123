import { supabase } from '../../lib/supabase';
import { CacheService } from '../core/cache';

export interface Profile {
  id: string;
  user_id?: string;
  name: string;
  avatar: string;
  isKids: boolean;
  autoplay?: boolean;
  haptics?: boolean;
  notifyFriendActivity?: boolean;
  notifyNewContent?: boolean;
  appLanguage?: string;
  pin?: string;
}

const ACTIVE_PROFILE_KEY = 'watchmovie_active_profile_id';
const DEFAULT_AVATAR = 'https://upload.wikimedia.org/wikipedia/commons/0/0b/Netflix-avatar.png'; // Fallback

// Self-healing columns cache: starts assuming all exist, drops them dynamically on column errors
const ProfileColumnsCache = {
  columns: new Set<string>([
    'id', 
    'user_id', 
    'name', 
    'avatar', 
    'is_kids', 
    'autoplay', 
    'haptics', 
    'notify_friend_activity', 
    'notify_new_content', 
    'app_language', 
    'pin'
  ]),
  set(keys: string[]) {
    this.columns = new Set(keys);
  },
  remove(column: string) {
    this.columns.delete(column);
  },
  has(column: string): boolean {
    return this.columns.has(column);
  }
};

const TOTAL_LOCAL_AVATARS = 201;

const getLocalGuestProfiles = (): Profile[] => {
  try {
    const data = localStorage.getItem('cinemovie_guest_profiles');
    if (!data) return [];
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
};

const saveLocalGuestProfiles = (profiles: Profile[]) => {
  localStorage.setItem('cinemovie_guest_profiles', JSON.stringify(profiles));
};

export const ProfileService = {
  async getProfiles(): Promise<Profile[]> {
    if (localStorage.getItem('cinemovie_is_guest') === 'true') {
      const profiles = getLocalGuestProfiles();
      let modified = false;
      const updated = profiles.map((p, idx) => {
        if (idx === 0 && p.name !== 'Guest') {
          p.name = 'Guest';
          modified = true;
        }
        return p;
      });
      if (modified) {
        saveLocalGuestProfiles(updated);
      }
      return updated;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching profiles:', error);
        return [];
      }

      if (!data || data.length === 0) {
        return [];
      }

      // Populate column cache dynamically from database keys
      if (data && data[0]) {
        ProfileColumnsCache.set(Object.keys(data[0]));
      }

      return data.map(p => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        isKids: p.is_kids,
        autoplay: p.autoplay,
        haptics: p.haptics,
        appLanguage: p.app_language || undefined,
        pin: p.pin || undefined
      }));
    } catch (e: any) {
      console.error('Profile fetch error:', e);
      if (e?.code === 'PGRST205' || e?.message?.includes('profiles')) {
        throw new Error('MISSING_TABLES');
      }
      return [];
    }
  },

  getActiveProfile(): Profile | null {
    const stored = localStorage.getItem('watchmovie_active_profile_cache');
    if (!stored) return null;
    try {
      return JSON.parse(stored);
    } catch (e) {
      return null;
    }
  },

  setActiveProfile(id: string, profile: Profile) {
    localStorage.setItem(ACTIVE_PROFILE_KEY, id);
    localStorage.setItem('watchmovie_active_profile_cache', JSON.stringify(profile));
    // Clear page TMDB cache to ensure kids mode changes apply instantly without stale records
    CacheService.clear();
    window.dispatchEvent(new Event('profileChanged'));
  },

  async addProfile(name: string, isKids: boolean, customAvatarUrl?: string, pin?: string): Promise<Profile | null> {
    if (localStorage.getItem('cinemovie_is_guest') === 'true') {
      const localProfiles = getLocalGuestProfiles();
      const newProfile: Profile = {
        id: Math.random().toString(36).substr(2, 9),
        name,
        avatar: customAvatarUrl || '/avatars/avatar-1.jpg',
        isKids,
        autoplay: true,
        haptics: true,
        pin
      };
      localProfiles.push(newProfile);
      saveLocalGuestProfiles(localProfiles);
      return newProfile;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No user logged in');

      let avatar = customAvatarUrl;
      if (!avatar) {
        const randomId = Math.floor(Math.random() * TOTAL_LOCAL_AVATARS) + 1;
        avatar = `/avatars/avatar-${randomId}.jpg`;
      }

      const buildInsertData = () => {
        const insertData: any = {
          user_id: user.id,
          name,
          avatar,
          is_kids: isKids
        };
        if (ProfileColumnsCache.has('autoplay')) insertData.autoplay = true;
        if (ProfileColumnsCache.has('haptics')) insertData.haptics = true;
        if (ProfileColumnsCache.has('notify_friend_activity')) insertData.notify_friend_activity = true;
        if (ProfileColumnsCache.has('notify_new_content')) insertData.notify_new_content = true;
        if (pin && ProfileColumnsCache.has('pin')) insertData.pin = pin;
        return insertData;
      };

      let insertAttempt = buildInsertData();
      let { data, error } = await supabase
        .from('profiles')
        .insert(insertAttempt)
        .select()
        .single();

      if (error && (error.code === '42703' || error.message?.includes('column'))) {
        console.warn('[ProfileService] Retrying insert after missing column detection...', error.message);
        const match = error.message?.match(/column "?(\w+)"?/);
        if (match && match[1]) {
          ProfileColumnsCache.remove(match[1]);
        }
        
        insertAttempt = buildInsertData();
        const retryResult = await supabase
          .from('profiles')
          .insert(insertAttempt)
          .select()
          .single();
        data = retryResult.data;
        error = retryResult.error;

        if (error && (error.code === '42703' || error.message?.includes('column'))) {
          const match2 = error.message?.match(/column "?(\w+)"?/);
          if (match2 && match2[1]) {
            ProfileColumnsCache.remove(match2[1]);
          }

          const baseInsert = {
            user_id: user.id,
            name,
            avatar,
            is_kids: isKids
          };
          const baseResult = await supabase
            .from('profiles')
            .insert(baseInsert)
            .select()
            .single();
          data = baseResult.data;
          error = baseResult.error;
        }
      }

      if (error) throw error;

      return {
        id: data.id,
        name: data.name,
        avatar: data.avatar,
        isKids: data.is_kids,
        autoplay: data.autoplay,
        haptics: data.haptics,
        pin: data.pin
      };
    } catch (e) {
      console.error('Error adding profile:', e);
      return null;
    }
  },

  async updateProfile(id: string, updates: Partial<Profile>): Promise<boolean> {
    const current = this.getActiveProfile();
    if (current && current.id === id) {
      this.setActiveProfile(id, { ...current, ...updates });
    }

    if (localStorage.getItem('cinemovie_is_guest') === 'true') {
      const localProfiles = getLocalGuestProfiles();
      const index = localProfiles.findIndex(p => p.id === id);
      if (index !== -1) {
        localProfiles[index] = { ...localProfiles[index], ...updates };
        saveLocalGuestProfiles(localProfiles);
        return true;
      }
      return false;
    }

    try {
      const buildUpdateData = () => {
        const dbUpdates: any = {};
        if (updates.name !== undefined) dbUpdates.name = updates.name;
        if (updates.avatar !== undefined) dbUpdates.avatar = updates.avatar;
        if (updates.isKids !== undefined) dbUpdates.is_kids = updates.isKids;
        
        if (updates.autoplay !== undefined && ProfileColumnsCache.has('autoplay')) dbUpdates.autoplay = updates.autoplay;
        if (updates.haptics !== undefined && ProfileColumnsCache.has('haptics')) dbUpdates.haptics = updates.haptics;
        if (updates.notifyFriendActivity !== undefined && ProfileColumnsCache.has('notify_friend_activity')) dbUpdates.notify_friend_activity = updates.notifyFriendActivity;
        if (updates.notifyNewContent !== undefined && ProfileColumnsCache.has('notify_new_content')) dbUpdates.notify_new_content = updates.notifyNewContent;
        if (updates.appLanguage !== undefined && ProfileColumnsCache.has('app_language')) dbUpdates.app_language = updates.appLanguage;
        if (updates.pin !== undefined && ProfileColumnsCache.has('pin')) dbUpdates.pin = updates.pin;
        return dbUpdates;
      };

      let updateAttempt = buildUpdateData();
      let { error } = await supabase
        .from('profiles')
        .update(updateAttempt)
        .eq('id', id);

      if (error && (error.code === '42703' || error.message?.includes('column'))) {
        console.warn('[ProfileService] Retrying update after missing column detection...', error.message);
        const match = error.message?.match(/column "?(\w+)"?/);
        if (match && match[1]) {
          ProfileColumnsCache.remove(match[1]);
        }
        
        updateAttempt = buildUpdateData();
        const retryResult = await supabase
          .from('profiles')
          .update(updateAttempt)
          .eq('id', id);
        error = retryResult.error;

        if (error && (error.code === '42703' || error.message?.includes('column'))) {
          const match2 = error.message?.match(/column "?(\w+)"?/);
          if (match2 && match2[1]) {
            ProfileColumnsCache.remove(match2[1]);
          }

          const baseUpdates: any = {};
          if (updates.name !== undefined) baseUpdates.name = updates.name;
          if (updates.avatar !== undefined) baseUpdates.avatar = updates.avatar;
          if (updates.isKids !== undefined) baseUpdates.is_kids = updates.isKids;

          const baseResult = await supabase
            .from('profiles')
            .update(baseUpdates)
            .eq('id', id);
          error = baseResult.error;
        }
      }

      if (error) throw error;

      const updatedProfile = this.getActiveProfile();
      if (updatedProfile && updatedProfile.id === id) {
        this.setActiveProfile(id, { ...updatedProfile, ...updates });
      }

      return true;
    } catch (e) {
      console.error('Error updating profile:', e);
      return false;
    }
  },

  async uploadAvatar(file: File): Promise<string | null> {
    if (localStorage.getItem('cinemovie_is_guest') === 'true') {
      return null;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
      const filePath = `avatars/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file);

      if (uploadError) {
        throw uploadError;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      return publicUrl;
    } catch (e) {
      console.error('Error uploading avatar:', e);
      return null;
    }
  },

  async deleteProfile(id: string): Promise<boolean> {
    if (localStorage.getItem('cinemovie_is_guest') === 'true') {
      const localProfiles = getLocalGuestProfiles();
      const filtered = localProfiles.filter(p => p.id !== id);
      saveLocalGuestProfiles(filtered);
      return true;
    }

    try {
      const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return true;
    } catch (e) {
      console.error('Error deleting profile:', e);
      return false;
    }
  }
};
