import { supabase } from '../../lib/supabase';

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
}

const ACTIVE_PROFILE_KEY = 'watchmovie_active_profile_id';
const DEFAULT_AVATAR = 'https://upload.wikimedia.org/wikipedia/commons/0/0b/Netflix-avatar.png'; // Fallback
const TOTAL_LOCAL_AVATARS = 67;

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

      return data.map(p => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        isKids: p.is_kids,
        autoplay: p.autoplay,
        haptics: p.haptics
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
      const parsed = JSON.parse(stored);
      if (localStorage.getItem('cinemovie_is_guest') === 'true' && parsed && parsed.name !== 'Guest') {
        parsed.name = 'Guest';
        localStorage.setItem('watchmovie_active_profile_cache', JSON.stringify(parsed));
      }
      return parsed;
    } catch (e) {
      return null;
    }
  },

  setActiveProfile(id: string, profileData?: Profile) {
    localStorage.setItem(ACTIVE_PROFILE_KEY, id);
    if (profileData) {
        localStorage.setItem('watchmovie_active_profile_cache', JSON.stringify(profileData));
    }
    window.dispatchEvent(new CustomEvent('profileChanged', { detail: id }));
  },

  clearActiveProfile() {
    localStorage.removeItem(ACTIVE_PROFILE_KEY);
    localStorage.removeItem('watchmovie_active_profile_cache');
    window.dispatchEvent(new CustomEvent('profileChanged', { detail: null }));
  },

  async addProfile(name: string, isKids: boolean, customAvatarUrl?: string): Promise<Profile | null> {
    if (localStorage.getItem('cinemovie_is_guest') === 'true') {
      let avatar = customAvatarUrl;
      if (!avatar) {
        const randomId = Math.floor(Math.random() * TOTAL_LOCAL_AVATARS) + 1;
        avatar = `/avatars/avatar-${randomId}.jpg`;
      }
      const localProfiles = getLocalGuestProfiles();
      const newProfile: Profile = {
        id: Math.random().toString(36).substr(2, 9),
        name,
        avatar,
        isKids,
        autoplay: true,
        haptics: true
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
        // Fallback random avatar from local collection
        const randomId = Math.floor(Math.random() * TOTAL_LOCAL_AVATARS) + 1;
        avatar = `/avatars/avatar-${randomId}.jpg`;
      }

      // Try inserting with all settings columns first
      const { data, error } = await supabase
        .from('profiles')
        .insert({
          user_id: user.id,
          name,
          avatar,
          is_kids: isKids,
          autoplay: true,
          haptics: true,
          notify_friend_activity: true,
          notify_new_content: true
        })
        .select()
        .single();

      if (error) {
        // Check for missing column error code '42703' or standard PostgreSQL 'column does not exist' message
        if (error.code === '42703' || error.message?.includes('column')) {
          console.warn('[ProfileService] Profiles table missing settings columns. Retrying base insert...');
          const { data: baseData, error: baseError } = await supabase
            .from('profiles')
            .insert({
              user_id: user.id,
              name,
              avatar,
              is_kids: isKids
            })
            .select()
            .single();

          if (baseError) throw baseError;
          return {
            id: baseData.id,
            name: baseData.name,
            avatar: baseData.avatar,
            isKids: baseData.is_kids,
            autoplay: true,
            haptics: true
          };
        }
        throw error;
      }

      return {
        id: data.id,
        name: data.name,
        avatar: data.avatar,
        isKids: data.is_kids,
        autoplay: data.autoplay,
        haptics: data.haptics
      };
    } catch (e) {
      console.error('Error adding profile:', e);
      return null;
    }
  },

  async updateProfile(id: string, updates: Partial<Profile>): Promise<boolean> {
      // Optimistically update cache and dispatch event for immediate UI updates
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
          const dbUpdates: any = {};
          if (updates.name !== undefined) dbUpdates.name = updates.name;
          if (updates.avatar !== undefined) dbUpdates.avatar = updates.avatar;
          if (updates.isKids !== undefined) dbUpdates.is_kids = updates.isKids;
          if (updates.autoplay !== undefined) dbUpdates.autoplay = updates.autoplay;
          if (updates.haptics !== undefined) dbUpdates.haptics = updates.haptics;
          if (updates.notifyFriendActivity !== undefined) dbUpdates.notify_friend_activity = updates.notifyFriendActivity;
          if (updates.notifyNewContent !== undefined) dbUpdates.notify_new_content = updates.notifyNewContent;

          const { error } = await supabase
              .from('profiles')
              .update(dbUpdates)
              .eq('id', id);

          if (error) {
              // Retry updating only base fields if columns are missing
              if (error.code === '42703' || error.message?.includes('column')) {
                  console.warn('[ProfileService] Profiles table missing settings columns. Retrying base update...');
                  const baseUpdates: any = {};
                  if (updates.name !== undefined) baseUpdates.name = updates.name;
                  if (updates.avatar !== undefined) baseUpdates.avatar = updates.avatar;
                  if (updates.isKids !== undefined) baseUpdates.is_kids = updates.isKids;

                  const { error: baseError } = await supabase
                      .from('profiles')
                      .update(baseUpdates)
                      .eq('id', id);

                  if (baseError) throw baseError;
                  return true;
              }
              throw error;
          }
          
          // Update cache if this is the active profile
          const current = this.getActiveProfile();
          if (current && current.id === id) {
              this.setActiveProfile(id, { ...current, ...updates });
          }

          return true;
      } catch (e) {
          console.error('Error updating profile:', e);
          return false;
      }
  },

  async uploadAvatar(file: File): Promise<string | null> {
    if (localStorage.getItem('cinemovie_is_guest') === 'true') {
      // Local avatars only for guests, no uploads supported, return a local data URL if needed
      // but standard is to just choose from gallery. We'll return null to let upload fail or return local url
      return null;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Math.random()}.${fileExt}`;
      const filePath = `avatars/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      return data.publicUrl;
    } catch (e) {
      console.error('Error uploading avatar:', e);
      return null;
    }
  },

  async deleteProfile(id: string): Promise<boolean> {
    try {
      localStorage.removeItem(`cinemovie_guest_progress_${id}`);
    } catch (e) {}

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

