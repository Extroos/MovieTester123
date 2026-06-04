import type { Movie, TVShow } from '../../types';
import { ProfileService } from './profiles';
import { supabase } from '../../lib/supabase';

export interface MyListItem extends Movie, TVShow {
  status: 'plan_to_watch' | 'watching' | 'completed';
  mediaType?: 'movie' | 'tv';
}

export async function getMyList(): Promise<MyListItem[]> {
  try {
    const profile = ProfileService.getActiveProfile();
    if (!profile) return [];

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
