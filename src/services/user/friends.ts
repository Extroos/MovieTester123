import { supabase } from '../../lib/supabase';
import { ProfileService } from './profiles';
import type { Friend, FriendActivity, Movie, TVShow } from '../../types';

export const FriendService = {
  // 1. Send Friend Request (by User ID for now, maybe Email later if we have a lookup)
  async sendFriendRequest(friendUserId: string): Promise<{ success: boolean; message: string }> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      if (user.id === friendUserId) return { success: false, message: "You can't add yourself!" };

      // Check if already friends
      const { data: existingFriend } = await supabase
        .from('friends')
        .select('id')
        .or(`and(user_id.eq.${user.id},friend_id.eq.${friendUserId}),and(user_id.eq.${friendUserId},friend_id.eq.${user.id})`)
        .maybeSingle();
        
      if (existingFriend) return { success: false, message: 'Already friends!' };

      // Check if request already sent (prevents 409 Conflict console error)
      const { data: existingRequest } = await supabase
        .from('friend_requests')
        .select('id')
        .or(`and(sender_id.eq.${user.id},receiver_id.eq.${friendUserId}),and(sender_id.eq.${friendUserId},receiver_id.eq.${user.id})`)
        .maybeSingle();

      if (existingRequest) return { success: false, message: 'Request already sent!' };

      // Send Request
      const { error } = await supabase
        .from('friend_requests')
        .insert({
          sender_id: user.id,
          receiver_id: friendUserId,
          status: 'pending'
        });

      if (error) {
          if (error.code === '23505') return { success: false, message: 'Request already sent!' };
          throw error;
      }

      // --- Trigger Notification ---
      try {
          // Get sender's name for the notification
          const { data: senderProfile } = await supabase
            .from('profiles')
            .select('name')
            .eq('user_id', user.id)
            .single();

          await supabase.from('notifications').insert({
              user_id: friendUserId,
              type: 'friend_request',
              title: 'New Friend Request',
              content: `${senderProfile?.name || 'Someone'} sent you a friend request!`,
              data: { sender_id: user.id }
          });
      } catch (notifyError) {
          console.error('Failed to send notification:', notifyError);
          // Don't fail the whole request if notification fails
      }

      return { success: true, message: 'Friend request sent!' };
    } catch (e: any) {
      console.error('Error sending friend request:', e);
      return { success: false, message: e.message || 'Failed to send request' };
    }
  },

  // 2. Get Pending Requests
  async getFriendRequests(): Promise<any[]> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from('friend_requests')
        .select(`
          id,
          sender_id,
          created_at
        `)
        .eq('receiver_id', user.id)
        .eq('status', 'pending');

      if (error) throw error;
      if (!data || data.length === 0) return [];

      // Fetch profiles for these senders
      const senderIds = data.map(r => r.sender_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, name, avatar, created_at')
        .in('user_id', senderIds)
        .order('created_at', { ascending: true });

      // Group profiles by user_id to pick the oldest (primary) profile
      const primaryByUser: { [userId: string]: any } = {};
      profiles?.forEach(p => {
        if (!primaryByUser[p.user_id]) {
          primaryByUser[p.user_id] = p;
        }
      });

      // Map profiles to requests
      return data.map(req => {
        const profile = primaryByUser[req.sender_id];
        return {
          id: req.id,
          sender_id: req.sender_id,
          created_at: req.created_at,
          senderName: profile?.name || 'Unknown User',
          senderAvatar: profile?.avatar
        };
      });
    } catch (e) {
      console.error('Error fetching requests:', e);
      return [];
    }
  },

  // 3. Accept Request
  async acceptRequest(requestId: string, senderId: string): Promise<boolean> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      // Update Request Status
      const { error: updateError } = await supabase
        .from('friend_requests')
        .update({ status: 'accepted' })
        .eq('id', requestId);

      if (updateError) throw updateError;

      // Create Bidirectional Friendship
      const { error: insertError } = await supabase
        .from('friends')
        .insert([
          { user_id: user.id, friend_id: senderId },
          { user_id: senderId, friend_id: user.id }
        ]);

      if (insertError) {
        // If already friends, that's fine - just consider it done.
        if (insertError.code === '23505') return true;
        throw insertError;
      }

      return true;
    } catch (e) {
      console.error('Error accepting request:', e);
      return false;
    }
  },

  // 4. Get Friends List (with their main Profile)
  async getFriends(): Promise<Friend[]> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data: friendsData, error } = await supabase
        .from('friends')
        .select('friend_id')
        .eq('user_id', user.id);

      if (error) throw error;
      if (!friendsData || friendsData.length === 0) return [];

      const friendIds = friendsData.map(f => f.friend_id);

      // Fetch "Main" (oldest) profile for each friend ordered by created_at ascending
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('user_id, id, name, avatar, created_at')
        .in('user_id', friendIds)
        .order('created_at', { ascending: true });

      if (profileError) throw profileError;

      // Deduplicate: oldest profile per user
      const uniqueFriends: Friend[] = [];
      const seenUsers = new Set();

      profiles?.forEach(p => {
        if (!seenUsers.has(p.user_id)) {
          seenUsers.add(p.user_id);
          uniqueFriends.push({
            id: p.user_id,
            profileId: p.id,
            name: p.name,
            avatar: p.avatar,
            status: 'accepted'
          });
        }
      });

      return uniqueFriends;
    } catch (e) {
      console.error('Error fetching friends:', e);
      return [];
    }
  },

  // Get Outgoing (Sent) Requests
  async getOutgoingRequests(): Promise<any[]> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from('friend_requests')
        .select('id, receiver_id, created_at')
        .eq('sender_id', user.id)
        .eq('status', 'pending');

      if (error) throw error;
      if (!data || data.length === 0) return [];

      const receiverIds = data.map(r => r.receiver_id);
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('user_id, id, name, avatar, created_at')
        .in('user_id', receiverIds)
        .order('created_at', { ascending: true });

      if (profileError) throw profileError;

      const primaryByUser: { [userId: string]: any } = {};
      profiles?.forEach(p => {
        if (!primaryByUser[p.user_id]) {
          primaryByUser[p.user_id] = p;
        }
      });

      return data.map(req => {
        const profile = primaryByUser[req.receiver_id];
        return {
          id: req.id,
          receiverId: req.receiver_id,
          createdAt: req.created_at,
          receiverName: profile?.name || 'Unknown User',
          receiverAvatar: profile?.avatar
        };
      });
    } catch (e) {
      console.error('Error fetching outgoing requests:', e);
      return [];
    }
  },

  // Cancel Outgoing Friend Request
  async cancelRequest(requestId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('friend_requests')
        .delete()
        .eq('id', requestId);
      if (error) throw error;
      return true;
    } catch (e) {
      console.error('Error canceling request:', e);
      return false;
    }
  },

  // Decline Received Friend Request
  async declineRequest(requestId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('friend_requests')
        .delete()
        .eq('id', requestId);
      if (error) throw error;
      return true;
    } catch (e) {
      console.error('Error declining request:', e);
      return false;
    }
  },

  // Search profiles matching a query but ONLY return them if that matching profile is the primary account owner (oldest profile)
  async searchUsersByAccountName(query: string): Promise<any[]> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.warn("[FriendService] Search failed: user is not authenticated.");
        return [];
      }

      console.log(`[FriendService] Initiating search for query: "${query}" (logged in as: ${user.id})`);

      // Find profiles matching the search query
      const { data: matchingProfiles, error } = await supabase
        .from('profiles')
        .select('id, user_id, name, avatar, created_at')
        .ilike('name', `%${query}%`)
        .limit(30);

      if (error) {
        console.error("[FriendService] Supabase profile matching error:", error);
        throw error;
      }

      console.log("[FriendService] Profiles matching query in DB:", matchingProfiles);
      if (!matchingProfiles || matchingProfiles.length === 0) return [];

      // Filter out our own profile results
      const foreignProfiles = matchingProfiles.filter(p => p.user_id !== user.id);
      console.log("[FriendService] Foreign profiles (excluding self):", foreignProfiles);
      if (foreignProfiles.length === 0) return [];

      const userIds = Array.from(new Set(foreignProfiles.map(p => p.user_id)));

      // Fetch all profiles for these users sorted by created_at to find the primary ones
      const { data: allUserProfiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, user_id, name, avatar, created_at')
        .in('user_id', userIds)
        .order('created_at', { ascending: true });

      if (profilesError) {
        console.error("[FriendService] Supabase oldest profile fetch error:", profilesError);
        throw profilesError;
      }

      console.log("[FriendService] All profiles for matched users:", allUserProfiles);
      if (!allUserProfiles) return [];

      // Map each user_id to their oldest profile
      const primaryByUser: { [userId: string]: any } = {};
      allUserProfiles.forEach(p => {
        if (!primaryByUser[p.user_id]) {
          primaryByUser[p.user_id] = p;
        }
      });

      // Filter foreignProfiles: a matched profile is valid ONLY if it is the primary profile of that user
      const results: any[] = [];
      const seenUserIds = new Set<string>();

      foreignProfiles.forEach(matchedProfile => {
        const primaryProfile = primaryByUser[matchedProfile.user_id];
        if (primaryProfile && primaryProfile.id === matchedProfile.id) {
          if (!seenUserIds.has(matchedProfile.user_id)) {
            seenUserIds.add(matchedProfile.user_id);
            results.push({
              userId: matchedProfile.user_id,
              name: matchedProfile.name,
              avatar: matchedProfile.avatar
            });
          }
        }
      });

      console.log("[FriendService] Final resolved search results (primary profiles only):", results);
      return results;
    } catch (e: any) {
      console.error('Error searching users by account name:', e);
      throw e;
    }
  },

  // 5. Get Friend Activity
  async getFriendActivity(): Promise<FriendActivity[]> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      // 1. Get List of Friends
      const { data: friendsData } = await supabase
        .from('friends')
        .select('friend_id')
        .eq('user_id', user.id);
        
      if (!friendsData || friendsData.length === 0) return [];
      const friendIds = friendsData.map(f => f.friend_id);

      // 2. Get Progress from these Friends
      // Note: RLS policies allow this now!
      const { data: activityData, error } = await supabase
        .from('watch_progress')
        .select(`
          progress, duration, last_watched, type, data, item_id,
          profiles ( user_id, id, name, avatar )
        `)
        // Type assertion for Supabase join syntax which can be tricky in TS
        // We filter manually or rely on RLS, but explicit filter is good for perf
        // However, we can't easily validly join "profiles" where user_id IN friendIds via pure PostgREST smoothly
        // correctly matching types.
        // Instead, rely on RLS + local filter if needed
        .in('profiles.user_id', friendIds) // This assumes foreign key set up correctly in definitions or implied
        .gt('last_watched', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()) // Last 7 days
        .order('last_watched', { ascending: false })
        .limit(20);

      // Note: The above .in('profiles.user_id') might fail if the relation isn't explicit or if Supabase TS types complain.
      // A safer alternative if relations are tricky: fetch all recent progress (RLS filters it to friends only anyway!)
      // Let's try the safer "RLS-only" approach which is cleaner:
      
      const { data: rawActivity, error: safeError } = await supabase
        .from('watch_progress')
        .select(`
          *,
          profiles ( id, user_id, name, avatar )
        `)
        .order('last_watched', { ascending: false })
        .limit(30);

      if (safeError) throw safeError;

      const activities: FriendActivity[] = [];
      const keys = new Set();

      rawActivity?.forEach((item: any) => {
        // RLS ensures we only see our own or friends. 
        // We filter out our own self.
        if (item.profiles.user_id === user.id) return;

        const uniqueKey = `${item.item_id}-${item.profiles.id}`;
        if (keys.has(uniqueKey)) return; // Dedupe same user watching same thing
        keys.add(uniqueKey);

        let itemData = item.data;
        
        // Robust Anime handling (Flatten AniList structure / fix images)
        if (itemData) {
             const rawTitle = itemData.title;
             const img = itemData.coverImage?.large || itemData.coverImage?.extraLarge || itemData.image || itemData.img || itemData.thumbnail || itemData.picture || itemData.poster_path || itemData.posterPath || itemData.bannerImage;
             
             if (typeof rawTitle === 'object' || itemData.coverImage || !itemData.posterPath) {
                 itemData = {
                     ...itemData,
                     title: (typeof rawTitle === 'object') ? (rawTitle.userPreferred || rawTitle.english || rawTitle.romaji || 'Anime') : (itemData.title || itemData.name),
                     posterPath: img,
                     poster_path: img, // Backcompat
                     backdropPath: itemData.bannerImage || itemData.coverImage?.extraLarge || img, 
                     mediaType: item.type === 'anime' ? 'anime' : itemData.mediaType,
                     id: item.item_id || itemData.id
                 };
             }
        }

        activities.push({
          friend: {
            id: item.profiles.user_id,
            profileId: item.profiles.id,
            name: item.profiles.name,
            avatar: item.profiles.avatar,
            status: 'accepted'
          },
          item: itemData as (Movie | TVShow),
          progress: item.progress,
          duration: item.duration,
          timestamp: new Date(item.last_watched).getTime(),
          type: item.type as 'movie' | 'tv' | 'anime',
          season: item.season_number,
          episode: item.episode_number,
          reactions: [] // We'll populate this in a separate call or batch
        });
      });

      // 3. Batch fetch reactions for these items
      const itemIds = activities.map(a => a.item.id.toString());
      const { data: reactionsData } = await supabase
        .from('activity_reactions')
        .select('*')
        .in('item_id', itemIds);

      if (reactionsData) {
        activities.forEach(act => {
          act.reactions = reactionsData.filter(r => 
            r.item_id === act.item.id.toString() && 
            r.target_user_id === act.friend.id
          );
        });
      }

      return activities;

    } catch (e) {
      console.error('Error fetching activity:', e);
      return [];
    }
  },

  async toggleActivityReaction(itemId: string, mediaType: string, targetUserId: string, emoji: string): Promise<boolean> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      const { data: existing } = await supabase
        .from('activity_reactions')
        .select('id')
        .eq('item_id', itemId)
        .eq('user_id', user.id)
        .eq('target_user_id', targetUserId)
        .eq('emoji', emoji)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('activity_reactions')
          .delete()
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('activity_reactions')
          .insert({
            item_id: itemId,
            media_type: mediaType,
            user_id: user.id,
            target_user_id: targetUserId,
            emoji: emoji
          });
        if (error) throw error;
      }
      return true;
    } catch (e) {
      console.error('Error toggling reaction:', e);
      return false;
    }
  }
};

