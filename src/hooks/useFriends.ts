import { useState, useEffect, useCallback, useRef } from 'react';
import { FriendService } from '../services/friends';
import { ProfileService } from '../services/profiles';
import type { Friend, FriendActivity } from '../types';
import { supabase } from '../services/supabase';

export function useFriends() {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [activity, setActivity] = useState<FriendActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Check Auth (Parallel for speed)
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
         setUserId(null);
         setFriends([]);
         setRequests([]);
         setActivity([]);
         setLoading(false);
         return;
      }
      setUserId(user.id);

      // 2. Fetch Data
      const [friendsList, reqs, acts] = await Promise.all([
        FriendService.getFriends(),
        FriendService.getFriendRequests(),
        FriendService.getFriendActivity()
      ]);

      setFriends(friendsList);
      setRequests(reqs);
      setActivity(acts);
    } catch (e) {
      console.error('Error refreshing friends:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced refresh — collapses rapid-fire realtime events into a single refetch
  const debouncedRefresh = useCallback(() => {
    clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(refresh, 2000);
  }, [refresh]);

  // Initial Load
  useEffect(() => {
    refresh();

    // Setup Realtime Listener just for requests/friends to keep UI snappy
    // Note: We'd need to listen to 'friend_requests' table changes logic here
    const channel = supabase.channel('social_updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friend_requests' },
        () => debouncedRefresh()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friends' },
        () => debouncedRefresh()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'watch_progress' },
        () => debouncedRefresh()
      )
      .subscribe();

    return () => {
      clearTimeout(refreshTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [refresh, debouncedRefresh]);

  const addFriend = async (friendId: string) => {
    const result = await FriendService.sendFriendRequest(friendId);
    if (result.success) refresh(); // Optimistic update would be better but this is safe
    return result;
  };

  const acceptFriend = async (requestId: string, senderId: string) => {
    const success = await FriendService.acceptRequest(requestId, senderId);
    if (success) refresh();
    return success;
  };

  return {
    friends,
    requests,
    activity,
    loading,
    userId,
    addFriend,
    acceptFriend,
    refresh
  };
}

