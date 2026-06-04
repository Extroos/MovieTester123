import { supabase } from '../../lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

// --- Types ---

export interface WatchPartyInvite {
  id: string;
  sender_id: string;
  sender_name: string;
  sender_avatar?: string;
  item_id: string;
  item_title: string;
  media_type: 'movie' | 'tv';
  session_id: string;
  created_at: string;
}

export interface PartyParticipant {
  user_id: string;
  name: string;
  avatar?: string;
  color: string;
  joined_at: string;
}

export type PartySyncEvent =
  | { type: 'play'; time: number; sender: string }
  | { type: 'pause'; time: number; sender: string }
  | { type: 'seek'; time: number; sender: string }
  | { type: 'joined'; sender: string; name: string }
  | { type: 'request_sync'; sender: string }
  | { type: 'sync_response'; time: number; playing: boolean; sender: string };

// Generates a unique border color for each participant based on their index
const PARTICIPANT_COLORS = ['#e50914', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

// --- Service ---

export const WatchTogetherService = {
  // 1. Create a watch party session ID
  createPartySession(itemId: string | number, mediaType: 'movie' | 'tv'): string {
    const randomHex = Math.floor(Math.random() * 0xffffffff).toString(16).padEnd(8, '0');
    return `party_${itemId}_${mediaType}_${randomHex}`;
  },

  // 2. Send invitation notifications to selected friends
  async sendPartyInvitations(
    friendUserIds: string[], 
    sessionId: string, 
    itemTitle: string,
    itemId?: string | number,
    mediaType?: 'movie' | 'tv',
    posterPath?: string,
    backdropPath?: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Fetch sender's name and avatar for the notification payload
      const { data: senderProfile } = await supabase
        .from('profiles')
        .select('name, avatar')
        .eq('user_id', user.id)
        .single();

      const senderName = senderProfile?.name || 'Someone';

      // Bulk insert notifications for each friend
      const notifications = friendUserIds.map(friendId => ({
        user_id: friendId,
        type: 'watch_party_invite',
        title: 'Watch Party Invitation',
        content: `${senderName} invited you to watch "${itemTitle}" together!`,
        data: {
          session_id: sessionId,
          sender_id: user.id,
          sender_name: senderName,
          sender_avatar: senderProfile?.avatar,
          item_title: itemTitle,
          item_id: itemId,
          media_type: mediaType,
          poster_path: posterPath,
          backdrop_path: backdropPath,
          is_host: false
        }
      }));

      // Append host notification so the host also sees the card on home refresh
      notifications.push({
        user_id: user.id,
        type: 'watch_party_invite',
        title: 'Hosted Watch Party',
        content: `You are hosting a watch party for "${itemTitle}"!`,
        data: {
          session_id: sessionId,
          sender_id: user.id,
          sender_name: senderName,
          sender_avatar: senderProfile?.avatar,
          item_title: itemTitle,
          item_id: itemId,
          media_type: mediaType,
          poster_path: posterPath,
          backdrop_path: backdropPath,
          is_host: true
        }
      });

      if (notifications.length > 0) {
        const { error } = await supabase.from('notifications').insert(notifications);
        if (error) throw error;
      }

      return { success: true, message: `Invitations sent to ${notifications.length} friends!` };
    } catch (e: any) {
      console.error('Error sending watch party invitations:', e);
      return { success: false, message: e.message || 'Failed to send invitations' };
    }
  },

  // 3. Join a real-time sync channel for co-watching
  joinSyncChannel(
    sessionId: string,
    currentUser: { id: string; name: string; avatar?: string },
    onSyncEvent: (event: PartySyncEvent) => void,
    onPresenceChange: (participants: PartyParticipant[]) => void
  ): RealtimeChannel {
    const channelName = `watch_party:${sessionId}`;

    const channel = supabase.channel(channelName, {
      config: {
        broadcast: { self: false }, // Don't receive your own broadcasts
        presence: { key: currentUser.id }
      }
    });

    // Listen for broadcast playback sync events
    channel.on('broadcast', { event: 'sync' }, ({ payload }) => {
      if (payload && payload.sender !== currentUser.id) {
        onSyncEvent(payload as PartySyncEvent);
      }
    });

    // Listen for presence changes (who joins/leaves)
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState<{
        user_id: string;
        name: string;
        avatar?: string;
        joined_at: string;
      }>();

      const participants: PartyParticipant[] = [];
      let colorIdx = 0;

      Object.values(state).forEach((presences) => {
        presences.forEach((presence: any) => {
          participants.push({
            user_id: presence.user_id,
            name: presence.name,
            avatar: presence.avatar,
            color: PARTICIPANT_COLORS[colorIdx % PARTICIPANT_COLORS.length],
            joined_at: presence.joined_at
          });
          colorIdx++;
        });
      });

      onPresenceChange(participants);
    });

    // Subscribe and announce our presence
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({
          user_id: currentUser.id,
          name: currentUser.name,
          avatar: currentUser.avatar,
          joined_at: new Date().toISOString()
        });

        // Broadcast a "joined" event so others see a toast
        channel.send({
          type: 'broadcast',
          event: 'sync',
          payload: {
            type: 'joined',
            sender: currentUser.id,
            name: currentUser.name
          } satisfies PartySyncEvent
        });

        console.log(`[WatchTogether] Joined sync channel: ${channelName}`);
      }
    });

    return channel;
  },

  // 4. Broadcast a playback sync event to all participants
  broadcastSync(channel: RealtimeChannel | null, event: PartySyncEvent) {
    if (!channel) return;
    channel.send({
      type: 'broadcast',
      event: 'sync',
      payload: event
    });
  },

  // 5. Leave and clean up the channel
  leaveChannel(channel: RealtimeChannel | null) {
    if (!channel) return;
    supabase.removeChannel(channel);
    console.log('[WatchTogether] Left sync channel.');
  }
};

