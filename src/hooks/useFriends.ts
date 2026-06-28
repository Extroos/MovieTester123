import { useState, useEffect, useCallback, useRef } from 'react';
import { FriendService } from '../services/friends';
import { ProfileService } from '../services/profiles';
import type { Friend, FriendActivity } from '../types';
import { supabase } from '../services/supabase';

const isGuest = () => localStorage.getItem('cinemovie_is_guest') === 'true';

export function useFriends() {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [sentRequests, setSentRequests] = useState<any[]>([]);
  const [activity, setActivity] = useState<FriendActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [accountName, setAccountName] = useState<string | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const refresh = useCallback(async () => {
    if (isGuest()) {
      setUserId(null);
      setFriends([]);
      setRequests([]);
      setSentRequests([]);
      setActivity([]);
      setAccountName('Guest');
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // 1. Check Auth (Parallel for speed)
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
         setUserId(null);
         setFriends([]);
         setRequests([]);
         setSentRequests([]);
         setActivity([]);
         setAccountName(null);
         setLoading(false);
         return;
      }
      setUserId(user.id);

      // 2. Fetch Data
      const [friendsList, reqs, sentReqs, acts, userProfiles] = await Promise.all([
        FriendService.getFriends(),
        FriendService.getFriendRequests(),
        FriendService.getOutgoingRequests(),
        FriendService.getFriendActivity(),
        supabase.from('profiles').select('name, created_at').eq('user_id', user.id).order('created_at', { ascending: true })
      ]);

      setFriends(friendsList);
      setRequests(reqs);
      setSentRequests(sentReqs);
      setActivity(acts);

      // Find the oldest profile name for the logged-in user (account name)
      if (userProfiles.data && userProfiles.data.length > 0) {
        setAccountName(userProfiles.data[0].name);
      } else {
        setAccountName(user.email || 'Unknown User');
      }
    } catch (e) {
      console.error('Error refreshing friends:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced refresh — collapses rapid-fire realtime events into a single refetch
  const debouncedRefresh = useCallback(() => {
    if (isGuest()) return;
    clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(refresh, 2000);
  }, [refresh]);

  // Initial Load
  useEffect(() => {
    if (isGuest()) {
      setLoading(false);
      return;
    }

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
    if (isGuest()) return { success: false, error: 'Social features disabled in guest mode' };
    const result = await FriendService.sendFriendRequest(friendId);
    if (result.success) refresh(); // Optimistic update would be better but this is safe
    return result;
  };

  const acceptFriend = async (requestId: string, senderId: string) => {
    if (isGuest()) return false;
    const success = await FriendService.acceptRequest(requestId, senderId);
    if (success) refresh();
    return success;
  };

  const cancelSentRequest = async (requestId: string) => {
    if (isGuest()) return false;
    const success = await FriendService.cancelRequest(requestId);
    if (success) refresh();
    return success;
  };

  const declineReceivedRequest = async (requestId: string) => {
    if (isGuest()) return false;
    const success = await FriendService.declineRequest(requestId);
    if (success) refresh();
    return success;
  };

  const searchUsers = async (query: string) => {
    if (isGuest() || !query.trim()) return [];
    try {
      return await FriendService.searchUsersByAccountName(query);
    } catch (e) {
      console.error("[useFriends] Error in searchUsers hook:", e);
      return [];
    }
  };

  return {
    friends,
    requests,
    sentRequests,
    activity,
    loading,
    userId,
    accountName,
    addFriend,
    acceptFriend,
    cancelSentRequest,
    declineReceivedRequest,
    searchUsers,
    refresh
  };
}
