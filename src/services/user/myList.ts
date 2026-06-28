import type { Movie, TVShow } from '../../types';
import { ProfileService } from './profiles';
import { supabase } from '../../lib/supabase';

export interface MyListItem extends Movie, TVShow {
  status: 'plan_to_watch' | 'watching' | 'completed';
  mediaType?: 'movie' | 'tv';
}

const isGuest = () => localStorage.getItem('cinemovie_is_guest') === 'true';

function getLocalMyList(profileId: string): MyListItem[] {
  try {
    const raw = localStorage.getItem(`cinemovie_guest_mylist_${profileId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function saveLocalMyList(profileId: string, list: MyListItem[]) {
  localStorage.setItem(`cinemovie_guest_mylist_${profileId}`, JSON.stringify(list));
}

export async function getMyList(): Promise<MyListItem[]> {
  try {
    const profile = ProfileService.getActiveProfile();
    if (!profile) return [];

    if (isGuest()) {
      return getLocalMyList(profile.id);
    }

    const { data, error } = await supabase
      .from('my_list')
      .select('*')
      .eq('profile_id', profile.id)
      .order('added_at', { ascending: false });

    if (error) {
      console.error('Error fetching My List:', error);
      return [];
    }

    return data.map((item: any) => {
      const itemData = item.data || {};
      return {
        ...itemData,
        mediaType: item.type,
        status: itemData.status || item.status || 'plan_to_watch'
      };
    });
  } catch (error) {
    console.error('Error reading My List:', error);
    return [];
  }
}

export async function addToMyList(item: Movie | TVShow): Promise<boolean> {
  try {
    const profile = ProfileService.getActiveProfile();
    if (!profile) return false;

    const type = (item as any).title ? 'movie' : 'tv';

    if (isGuest()) {
      const list = getLocalMyList(profile.id);
      if (list.some(i => i.id === item.id && i.mediaType === type)) return true;
      list.push({
        ...item,
        mediaType: type,
        status: 'plan_to_watch'
      } as any);
      saveLocalMyList(profile.id, list);
      return true;
    }
    
    // Inject status into the serialized JSON data
    const itemData = {
      ...item,
      status: 'plan_to_watch'
    };

    const { error } = await supabase
      .from('my_list')
      .insert({
        profile_id: profile.id,
        movie_id: item.id,
        type: type,
        data: itemData
      });

    if (error) {
        if (error.code === '23505') return true; 
        console.error('Error adding to My List:', error);
        return false;
    }
    return true;
  } catch (error) {
    console.error('Error adding to My List:', error);
    return false;
  }
}

export async function updateListItemStatus(itemId: number, type: 'movie' | 'tv', status: string): Promise<boolean> {
  try {
    const profile = ProfileService.getActiveProfile();
    if (!profile) return false;

    if (isGuest()) {
      const list = getLocalMyList(profile.id);
      const index = list.findIndex(i => i.id === itemId && i.mediaType === type);
      if (index !== -1) {
        list[index].status = status as any;
        saveLocalMyList(profile.id, list);
        return true;
      }
      return false;
    }

    // Fetch existing item JSON data first to preserve metadata
    const { data: itemRow, error: fetchError } = await supabase
      .from('my_list')
      .select('data')
      .eq('profile_id', profile.id)
      .eq('movie_id', itemId)
      .eq('type', type)
      .maybeSingle();

    if (fetchError || !itemRow) {
      console.error('Error fetching list item for status update:', fetchError);
      return false;
    }

    const updatedData = {
      ...(itemRow.data as any),
      status: status
    };

    // Update the JSON data field with the new status
    const { error } = await supabase
      .from('my_list')
      .update({ data: updatedData })
      .eq('profile_id', profile.id)
      .eq('movie_id', itemId)
      .eq('type', type);

    if (error) {
      console.error('Error updating My List status:', error);
      return false;
    }
    return true;
  } catch (error) {
    console.error('Error updating My List status:', error);
    return false;
  }
}

export async function removeFromMyList(itemId: number, type: 'movie' | 'tv'): Promise<boolean> {
  try {
    const profile = ProfileService.getActiveProfile();
    if (!profile) return false;

    if (isGuest()) {
      const list = getLocalMyList(profile.id);
      const filtered = list.filter(i => !(i.id === itemId && i.mediaType === type));
      saveLocalMyList(profile.id, filtered);
      return true;
    }

    const { error } = await supabase
      .from('my_list')
      .delete()
      .eq('profile_id', profile.id)
      .eq('movie_id', itemId)
      .eq('type', type);

    if (error) {
      console.error('Error removing from My List:', error);
      return false;
    }
    return true;
  } catch (error) {
     console.error('Error removing from My List:', error);
     return false;
  }
}

export async function isInMyList(itemId: number, type: 'movie' | 'tv'): Promise<boolean> {
  try {
    const profile = ProfileService.getActiveProfile();
    if (!profile) return false;

    if (isGuest()) {
      const list = getLocalMyList(profile.id);
      return list.some(i => i.id === itemId && i.mediaType === type);
    }

    const { data, error } = await supabase
      .from('my_list')
      .select('id')
      .eq('profile_id', profile.id)
      .eq('movie_id', itemId)
      .eq('type', type)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') { 
        return false;
    }

    return !!data;
  } catch (error) {
    console.error('Error checking My List:', error);
    return false;
  }
}

export async function clearMyList(): Promise<boolean> {
  try {
    const profile = ProfileService.getActiveProfile();
    if (!profile) return false;

    if (isGuest()) {
      saveLocalMyList(profile.id, []);
      return true;
    }

    const { error } = await supabase
      .from('my_list')
      .delete()
      .eq('profile_id', profile.id);

    return !error;
  } catch (error) {
    console.error('Error clearing My List:', error);
    return false;
  }
}
