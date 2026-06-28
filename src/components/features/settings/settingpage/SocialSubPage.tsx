import React from 'react';
import { Copy, Check } from 'lucide-react';
import { t } from '../../../../utils/i18n';

interface SocialSubPageProps {
  isMobile: boolean;
  friends: any[];
  requests: any[];
  sentRequests: any[];
  friendsLoading: boolean;
  accountName: string | null;
  socialTab: 'friends' | 'requests' | 'add';
  setSocialTab: (tab: 'friends' | 'requests' | 'add') => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  searchResults: any[];
  isSearching: boolean;
  handleUserSearch: () => void;
  handleRemoveFriend: (friendId: string) => void;
  acceptFriend: (reqId: string, senderId: string) => Promise<any>;
  declineReceivedRequest: (reqId: string) => Promise<any>;
  cancelSentRequest: (reqId: string) => Promise<any>;
  addFriend: (targetProfileId: string) => Promise<any>;
  triggerHaptic: (type: 'light' | 'medium' | 'heavy') => void;
  getFriendStatus: (friendId: string) => string;
  onLogout: () => void;
  userId: string | null;
  copied: boolean;
  setCopied: (val: boolean) => void;
  friendInput: string;
  setFriendInput: (val: string) => void;
  isSending: boolean;
  setIsSending: (val: boolean) => void;
  socialMessage: { type: 'success' | 'error'; text: string } | null;
  setSocialMessage: (msg: { type: 'success' | 'error'; text: string } | null) => void;
  showToast: (msg: string) => void;
}

export default function SocialSubPage({
  isMobile,
  friends,
  requests,
  sentRequests,
  friendsLoading,
  accountName,
  socialTab,
  setSocialTab,
  searchQuery,
  setSearchQuery,
  searchResults,
  isSearching,
  handleUserSearch,
  handleRemoveFriend,
  acceptFriend,
  declineReceivedRequest,
  cancelSentRequest,
  addFriend,
  triggerHaptic,
  getFriendStatus,
  onLogout,
  userId,
  copied,
  setCopied,
  friendInput,
  setFriendInput,
  isSending,
  setIsSending,
  socialMessage,
  setSocialMessage,
  showToast
}: SocialSubPageProps) {
  const isGuest = localStorage.getItem('cinemovie_is_guest') === 'true';

  if (isGuest) {
    return (
      <div style={{
        padding: '40px 20px',
        textAlign: 'center',
        background: 'rgba(255, 255, 255, 0.02)',
        border: '1px solid rgba(255, 255, 255, 0.06)',
        borderRadius: '16px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '16px',
        marginTop: '12px'
      }}>
        <div style={{
          width: '60px',
          height: '60px',
          borderRadius: '50%',
          background: 'rgba(255, 255, 255, 0.05)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px solid rgba(255, 255, 255, 0.1)'
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255, 255, 255, 0.4)" strokeWidth="2.5">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        </div>
        <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#fff' }}>{t('social_features_disabled')}</h3>
        <p style={{ margin: 0, fontSize: '0.88rem', color: 'rgba(255, 255, 255, 0.5)', lineHeight: 1.5, maxWidth: '320px' }}>
          {t('social_features_desc')}
        </p>
      </div>
    );
  }

  return (
    <>
      <div style={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        justifyContent: 'space-between',
        alignItems: isMobile ? 'flex-start' : 'center',
        gap: '12px',
        marginBottom: '20px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
        paddingBottom: '12px'
      }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fff' }}>{t('social_and_friends')}</div>
          {accountName && (
            <div style={{ fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.5)', marginTop: '2px' }}>
              {t('logged_in_as')}: <strong style={{ color: '#fff' }}>{accountName}</strong>
            </div>
          )}
        </div>
        
        {/* Sub-tabs bar */}
        <div style={{
          display: 'flex',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '100px',
          padding: '3px',
          width: isMobile ? '100%' : 'auto',
          justifyContent: 'space-around'
        }}>
          {(['friends', 'requests', 'add'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => {
                triggerHaptic('light');
                setSocialTab(tab);
              }}
              style={{
                background: socialTab === tab ? '#ffffff' : 'transparent',
                border: 'none',
                color: socialTab === tab ? '#000000' : 'rgba(255, 255, 255, 0.6)',
                padding: '6px 14px',
                borderRadius: '100px',
                fontSize: '0.78rem',
                fontWeight: 800,
                cursor: 'pointer',
                transition: 'all 0.2s',
                flex: isMobile ? 1 : 'none',
                whiteSpace: 'nowrap'
              }}
            >
              {tab === 'friends' && `${t('friends')} (${friends.length})`}
              {tab === 'requests' && `${t('requests')} (${requests.length + sentRequests.length})`}
              {tab === 'add' && t('add_friend')}
            </button>
          ))}
        </div>
      </div>

      {/* tab 1: Friends */}
      {socialTab === 'friends' && (
        <div>
          {friends.length === 0 ? (
            <div style={{
              padding: '40px 16px',
              textAlign: 'center',
              background: 'rgba(255,255,255,0.01)',
              border: '1px dashed rgba(255,255,255,0.08)',
              borderRadius: '12px',
              fontSize: '0.86rem',
              color: 'rgba(255,255,255,0.4)',
              fontWeight: 600
            }}>
              {t('no_friends_yet')}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {friends.map((friend) => (
                <div 
                  key={friend.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    background: 'rgba(255, 255, 255, 0.015)',
                    backdropFilter: 'blur(10px)',
                    WebkitBackdropFilter: 'blur(10px)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '16px',
                    transition: 'all 0.2s ease',
                    gap: '12px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
                    <img
                      src={friend.avatar || 'https://upload.wikimedia.org/wikipedia/commons/0/0b/Netflix-avatar.png'}
                      alt=""
                      style={{ width: '42px', height: '42px', borderRadius: '50%', objectFit: 'cover', border: '1.5px solid rgba(255,255,255,0.12)', flexShrink: 0 }}
                    />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{friend.name}</div>
                      <div style={{ 
                        fontSize: '0.72rem', 
                        opacity: 0.85, 
                        marginTop: '3px', 
                        color: '#46D369', 
                        fontWeight: 650, 
                        lineHeight: 1.25,
                        wordBreak: 'break-word',
                        overflowWrap: 'break-word'
                      }}>
                        {getFriendStatus(friend.id)}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemoveFriend(friend.id)}
                    className="settings-btn-danger"
                    style={{
                      padding: '8px 14px',
                      background: 'rgba(239, 68, 68, 0.08)',
                      border: '1px solid rgba(239, 68, 68, 0.15)',
                      color: '#ef4444',
                      borderRadius: '8px',
                      fontWeight: 700,
                      fontSize: '0.74rem',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      flexShrink: 0
                    }}
                  >
                    {t('remove')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* tab 2: Requests */}
      {socialTab === 'requests' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Received requests */}
          <div>
            <div style={{ 
              fontSize: '0.72rem', 
              textTransform: 'uppercase', 
              color: 'rgba(255, 255, 255, 0.4)', 
              letterSpacing: '0.12em', 
              fontWeight: 900,
              borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
              paddingBottom: '6px',
              marginBottom: '12px'
            }}>{t('received_requests')} ({requests.length})</div>

            {requests.length === 0 ? (
              <div style={{ padding: '12px 6px', fontSize: '0.82rem', opacity: 0.4, fontWeight: 500, color: '#fff' }}>{t('no_pending_incoming')}</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {requests.map((req) => (
                  <div 
                    key={req.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 16px',
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid rgba(255, 255, 255, 0.04)',
                      borderRadius: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
                      <img
                        src={req.senderAvatar || 'https://upload.wikimedia.org/wikipedia/commons/0/0b/Netflix-avatar.png'}
                        alt=""
                        style={{ width: '38px', height: '38px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                      />
                      <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{req.senderName}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                      <button
                        onClick={async () => {
                          triggerHaptic('medium');
                          await acceptFriend(req.id, req.sender_id);
                        }}
                        style={{
                          background: '#22c55e',
                          border: 'none',
                          color: '#fff',
                          padding: '6px 12px',
                          borderRadius: '8px',
                          fontSize: '0.78rem',
                          fontWeight: 800,
                          cursor: 'pointer'
                        }}
                      >
                        {t('accept')}
                      </button>
                      <button
                        onClick={async () => {
                          triggerHaptic('light');
                          await declineReceivedRequest(req.id);
                        }}
                        style={{
                          background: 'transparent',
                          border: '1px solid rgba(255,255,255,0.15)',
                          color: 'rgba(255,255,255,0.6)',
                          padding: '6px 12px',
                          borderRadius: '8px',
                          fontSize: '0.78rem',
                          fontWeight: 800,
                          cursor: 'pointer'
                        }}
                      >
                        {t('decline')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sent requests */}
          <div>
            <div style={{ 
              fontSize: '0.72rem', 
              textTransform: 'uppercase', 
              color: 'rgba(255, 255, 255, 0.4)', 
              letterSpacing: '0.12em', 
              fontWeight: 900,
              borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
              paddingBottom: '6px',
              marginBottom: '12px'
            }}>{t('sent_requests')} ({sentRequests.length})</div>

            {sentRequests.length === 0 ? (
              <div style={{ padding: '12px 6px', fontSize: '0.82rem', opacity: 0.4, fontWeight: 500, color: '#fff' }}>{t('no_pending_sent')}</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {sentRequests.map((req) => (
                  <div 
                    key={req.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 16px',
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid rgba(255, 255, 255, 0.04)',
                      borderRadius: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
                      <img
                        src={req.receiverAvatar || 'https://upload.wikimedia.org/wikipedia/commons/0/0b/Netflix-avatar.png'}
                        alt=""
                        style={{ width: '38px', height: '38px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                      />
                      <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{req.receiverName}</div>
                    </div>
                    <button
                      onClick={async () => {
                        triggerHaptic('light');
                        await cancelSentRequest(req.id);
                      }}
                      style={{
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: 'rgba(255,255,255,0.7)',
                        padding: '6px 12px',
                        borderRadius: '8px',
                        fontSize: '0.78rem',
                        fontWeight: 800,
                        cursor: 'pointer',
                        flexShrink: 0
                      }}
                    >
                      {t('cancel')}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* tab 3: Add Friend */}
      {socialTab === 'add' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Search account by name */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            borderRadius: '12px',
            padding: '16px',
          }}>
            <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#fff', marginBottom: '8px' }}>{t('search_by_name')}</div>
            <div style={{ fontSize: '0.76rem', color: 'rgba(255,255,255,0.4)', marginBottom: '12px' }}>
              {t('search_by_name_desc')}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                placeholder={t('type_name_search')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleUserSearch()}
                style={{
                  flex: 1,
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  color: '#fff',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  outline: 'none',
                }}
              />
              <button
                onClick={handleUserSearch}
                disabled={isSearching || !searchQuery.trim()}
                style={{
                  background: '#ffffff',
                  border: 'none',
                  color: '#000000',
                  borderRadius: '8px',
                  padding: '8px 16px',
                  fontWeight: 800,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  transition: 'opacity 0.2s',
                  opacity: (isSearching || !searchQuery.trim()) ? 0.5 : 1
                }}
              >
                {isSearching ? t('searching') : t('search')}
              </button>
            </div>

            {/* Search Results */}
            {searchResults.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '16px' }}>
                {searchResults.map((result) => {
                  const isFriend = friends.some(f => f.id === result.userId);
                  const isPendingReceived = requests.some(r => r.sender_id === result.userId);
                  const isPendingSent = sentRequests.some(s => s.receiverId === result.userId);

                  return (
                    <div
                      key={result.userId}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 12px',
                        background: 'rgba(255,255,255,0.03)',
                        borderRadius: '8px',
                        border: '1px solid rgba(255,255,255,0.05)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                        <img
                          src={result.avatar || 'https://upload.wikimedia.org/wikipedia/commons/0/0b/Netflix-avatar.png'}
                          alt=""
                          style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                        />
                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{result.name}</span>
                      </div>

                      <div style={{ flexShrink: 0 }}>
                        {isFriend ? (
                          <span style={{ fontSize: '0.78rem', color: '#22c55e', fontWeight: 700 }}>{t('friends_status')}</span>
                        ) : isPendingSent ? (
                          <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>{t('requested')}</span>
                        ) : isPendingReceived ? (
                          <button
                            onClick={async () => {
                              triggerHaptic('medium');
                              const req = requests.find(r => r.sender_id === result.userId);
                              if (req) await acceptFriend(req.id, result.userId);
                            }}
                            style={{
                              background: '#22c55e',
                              border: 'none',
                              color: '#fff',
                              padding: '4px 10px',
                              borderRadius: '6px',
                              fontSize: '0.76rem',
                              fontWeight: 800,
                              cursor: 'pointer'
                            }}
                          >
                            {t('accept')}
                          </button>
                        ) : (
                          <button
                            onClick={async () => {
                              triggerHaptic('light');
                              const res = await addFriend(result.userId);
                              if (res.success) {
                                showToast('Friend request sent!');
                              } else {
                                showToast(res.message || 'Failed to send request');
                              }
                            }}
                            style={{
                              background: '#ffffff',
                              color: '#000000',
                              border: 'none',
                              padding: '4px 10px',
                              borderRadius: '6px',
                              fontSize: '0.76rem',
                              fontWeight: 800,
                              cursor: 'pointer'
                            }}
                          >
                            {t('add')}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {searchResults.length === 0 && searchQuery && !isSearching && (
              <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.3)', marginTop: '12px', textAlign: 'center' }}>
                {t('no_users_found')} "{searchQuery}".
              </div>
            )}
          </div>

          {/* Add by User Code */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            borderRadius: '12px',
            padding: '16px'
          }}>
            <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#fff', marginBottom: '12px' }}>{t('add_by_code')}</div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'stretch' }}>
              <input
                type="text"
                placeholder={t('paste_code')}
                value={friendInput}
                onChange={(e) => setFriendInput(e.target.value)}
                style={{
                  flex: 1,
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  color: '#fff',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  outline: 'none',
                }}
              />
              <button
                onClick={async () => {
                  if (!friendInput.trim()) return;
                  setIsSending(true);
                  triggerHaptic('light');
                  const res = await addFriend(friendInput.trim());
                  setIsSending(false);
                  if (res.success) {
                    setFriendInput('');
                    setSocialMessage({ type: 'success', text: (res as any).message || (res as any).error || 'Friend request sent!' });
                    triggerHaptic('medium');
                  } else {
                    setSocialMessage({ type: 'error', text: (res as any).error || (res as any).message || 'Failed to send request.' });
                    triggerHaptic('heavy');
                  }
                  setTimeout(() => setSocialMessage(null), 4000);
                }}
                disabled={isSending || !friendInput.trim()}
                style={{
                  background: '#ffffff',
                  border: 'none',
                  color: '#000000',
                  borderRadius: '8px',
                  padding: '8px 16px',
                  fontWeight: 800,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  transition: 'opacity 0.2s',
                  opacity: (isSending || !friendInput.trim()) ? 0.5 : 1
                }}
              >
                {isSending ? t('sending_request') : t('send_request')}
              </button>
            </div>
            {socialMessage && (
              <div style={{
                marginTop: '12px',
                fontSize: '0.8rem',
                fontWeight: 700,
                color: socialMessage.type === 'success' ? '#22c55e' : '#ef4444'
              }}>
                {socialMessage.text}
              </div>
            )}
          </div>

          {/* Share Identity */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            borderRadius: '12px',
            padding: '16px',
            display: 'flex',
            flexDirection: isMobile ? 'column' : 'row',
            justifyContent: 'space-between',
            alignItems: isMobile ? 'flex-start' : 'center',
            gap: '12px'
          }}>
            <div>
              <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#fff' }}>{t('your_user_code')}</div>
              <div style={{ fontSize: '0.76rem', opacity: 0.5, marginTop: '2px', color: '#fff' }}>{t('share_code_desc')}</div>
            </div>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px',
              width: isMobile ? '100%' : 'auto'
            }}>
              <input
                readOnly
                value={userId || ''}
                style={{
                  background: '#000000',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  color: '#fff',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  outline: 'none',
                  fontFamily: 'monospace',
                  width: isMobile ? '100%' : '240px',
                  textAlign: 'center'
                }}
              />
              <button
                onClick={() => {
                  if (userId) {
                    navigator.clipboard.writeText(userId);
                    setCopied(true);
                    triggerHaptic('medium');
                    setTimeout(() => setCopied(false), 2000);
                  }
                }}
                style={{
                  background: copied ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.1)',
                  border: copied ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(255,255,255,0.15)',
                  color: copied ? '#22c55e' : '#fff',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s',
                  height: '34px',
                  width: '38px',
                  flexShrink: 0
                }}
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
