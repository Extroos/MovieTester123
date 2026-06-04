import React from 'react';
import { COLORS } from '../../../constants';
import { triggerHaptic } from '../../../utils/haptics';
import { FriendService } from '../../../services/friends';
import { supabase } from '../../../services/supabase';

interface WatchPartyRoomPageProps {
  invite: any;
  onAccept: () => void;
  onDecline: () => void;
  onClose: () => void;
}

export default function WatchPartyRoomPage({ invite, onAccept, onDecline, onClose }: WatchPartyRoomPageProps) {
  if (!invite) return null;

  const { item_title, sender_name, sender_avatar, poster_path, media_type, is_host } = invite.data || {};

  const [friends, setFriends] = React.useState<any[]>([]);
  const [activeInvitees, setActiveInvitees] = React.useState<Set<string>>(new Set());
  const [loading, setLoading] = React.useState(false);
  const [invitingIds, setInvitingIds] = React.useState<Record<string, boolean>>({});

  const loadPartyStatus = React.useCallback(async () => {
    if (!is_host) return;
    setLoading(true);
    try {
      const friendsList = await FriendService.getFriends();
      setFriends(friendsList);

      const { data } = await supabase
        .from('notifications')
        .select('user_id')
        .eq('type', 'watch_party_invite')
        .filter('data->>session_id', 'eq', invite.data.session_id);

      const activeSet = new Set<string>((data || []).map(item => item.user_id).filter(Boolean));
      setActiveInvitees(activeSet);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [is_host, invite.data.session_id]);

  React.useEffect(() => {
    loadPartyStatus();
  }, [loadPartyStatus]);

  const handleReinvite = async (friend: any) => {
    triggerHaptic('medium');
    setInvitingIds(prev => ({ ...prev, [friend.id]: true }));
    try {
      const notifications = [{
        user_id: friend.id,
        type: 'watch_party_invite',
        title: 'Watch Party Invitation',
        content: `${sender_name} invited you to watch "${item_title}" together!`,
        data: {
          session_id: invite.data.session_id,
          sender_id: invite.data.sender_id,
          sender_name: sender_name,
          sender_avatar: sender_avatar,
          item_title: item_title,
          item_id: invite.data.item_id,
          media_type: media_type,
          poster_path: poster_path,
          is_host: false
        }
      }];

      await supabase.from('notifications').insert(notifications);
      setActiveInvitees(prev => {
        const next = new Set(prev);
        next.add(friend.id);
        return next;
      });
    } catch (e) {
      console.error('Error re-inviting friend:', e);
    } finally {
      setInvitingIds(prev => ({ ...prev, [friend.id]: false }));
    }
  };

  return (
    <div 
      style={{ 
        position: 'fixed',
        inset: 0,
        zIndex: 10500,
        background: '#09090b',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 1.5rem',
        overflowY: 'auto',
        fontFamily: "'Outfit', 'Inter', -apple-system, sans-serif"
      }}
    >
      <div 
        style={{
          width: '100%',
          maxWidth: '440px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          gap: '20px',
          position: 'relative'
        }}
      >
        {/* Close Button */}
        <button
          onClick={() => { triggerHaptic('light'); onClose(); }}
          style={{
            position: 'absolute',
            top: '-20px',
            right: '0',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '50%',
            width: '36px',
            height: '36px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        {/* Sender Info Badge */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', marginTop: '20px' }}>
          <div 
            style={{ 
              width: '60px', 
              height: '60px', 
              borderRadius: '50%', 
              border: '1.5px solid rgba(255, 255, 255, 0.2)',
              backgroundImage: `url(${sender_avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(sender_name || 'Friend')}`})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              boxShadow: '0 8px 30px rgba(0, 0, 0, 0.5)'
            }} 
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
              {is_host ? 'Watch Party Host' : 'Watch Party Invite'}
            </span>
            <span style={{ fontSize: '1.15rem', fontWeight: 700, color: '#ffffff', letterSpacing: '-0.01em' }}>
              {is_host ? 'You invited your friends' : `${sender_name || 'A Friend'} invited you`}
            </span>
          </div>
        </div>

        {/* Media Poster & Title */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '18px', width: '100%', margin: '5px 0' }}>
          <div 
            style={{ 
              width: '124px', 
              height: '186px', 
              borderRadius: '16px', 
              overflow: 'hidden',
              boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
              border: '1px solid rgba(255,255,255,0.08)'
            }}
          >
            <img 
              src={poster_path ? `https://image.tmdb.org/t/p/w300${poster_path}` : '/fallback-poster.jpg'} 
              alt={item_title}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
          <div>
            <h2 style={{ fontSize: '1.40rem', fontWeight: 800, color: '#ffffff', margin: '0 0 6px 0', letterSpacing: '-0.02em' }}>
              {item_title}
            </h2>
            <span style={{ 
              fontSize: '0.68rem', 
              fontWeight: 800, 
              color: 'rgba(255, 255, 255, 0.7)', 
              background: 'rgba(255, 255, 255, 0.06)', 
              padding: '4px 12px', 
              borderRadius: '20px',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              border: '1px solid rgba(255,255,255,0.05)'
            }}>
              {media_type === 'tv' ? 'Series' : 'Movie'} • Sync Stream
            </span>
          </div>
        </div>

        {/* Content Details */}
        <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.45)', lineHeight: '1.6', margin: '0 0 5px 0', maxWidth: '340px' }}>
          {is_host 
            ? 'Connect automatically and stream synchronously. Playback actions like play, pause, and seek will sync in real time with your guests.'
            : `Connect automatically and stream synchronously. Playback actions like play, pause, and seek will sync in real time with ${sender_name}.`}
        </p>

        {/* Hoster's Guests/Friends Management Section */}
        {is_host && friends.length > 0 && (
          <div style={{
            width: '100%',
            maxWidth: '300px',
            background: 'rgba(255, 255, 255, 0.03)',
            borderRadius: '16px',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            padding: '12px 16px',
            margin: '5px 0',
            textAlign: 'left',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            <h4 style={{ margin: '0 0 2px 0', fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Manage Guests
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '120px', overflowY: 'auto' }}>
              {friends.map(friend => {
                const isPending = activeInvitees.has(friend.id);
                const isInviting = invitingIds[friend.id];
                return (
                  <div key={friend.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                      <img 
                        src={friend.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${friend.name}`} 
                        alt={friend.name}
                        style={{ width: '22px', height: '22px', borderRadius: '50%', objectFit: 'cover', background: 'rgba(255,255,255,0.05)' }}
                      />
                      <span style={{ fontSize: '0.74rem', fontWeight: 600, color: '#ffffff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {friend.name}
                      </span>
                    </div>
                    {isPending ? (
                      <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#10b981', background: 'rgba(16, 185, 129, 0.12)', padding: '2px 8px', borderRadius: '10px' }}>
                        Invited
                      </span>
                    ) : (
                      <button
                        disabled={isInviting}
                        onClick={() => handleReinvite(friend)}
                        style={{
                          background: 'rgba(255, 255, 255, 0.06)',
                          color: '#ffffff',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                          borderRadius: '12px',
                          padding: '3px 8px',
                          fontSize: '0.62rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          opacity: isInviting ? 0.5 : 1,
                          transition: 'all 0.2s ease'
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                      >
                        {isInviting ? 'Inviting...' : 'Re-invite'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', maxWidth: '300px' }}>
          <button
            onClick={() => { triggerHaptic('heavy'); onAccept(); }}
            style={{
              width: '100%',
              padding: '12px 24px',
              background: '#ffffff',
              color: '#000000',
              border: 'none',
              borderRadius: '20px',
              fontSize: '0.85rem',
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: '0 8px 20px rgba(255, 255, 255, 0.12)',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.02)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
            {is_host ? 'Start & Join Party' : 'Accept & Join Party'}
          </button>
          <button
            onClick={() => { triggerHaptic('medium'); onDecline(); }}
            style={{
              width: '100%',
              padding: '11px 24px',
              background: 'rgba(255, 255, 255, 0.04)',
              color: 'rgba(255,255,255,0.7)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '20px',
              fontSize: '0.85rem',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'; e.currentTarget.style.color = '#ffffff'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'; e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; }}
          >
            {is_host ? 'End Party' : 'Leave / Decline'}
          </button>
        </div>
      </div>
    </div>
  );
}
