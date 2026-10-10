import { useState, useEffect, useRef, useMemo } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  arrayRemove,
  addDoc,
  serverTimestamp,
  getDoc,
  setDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { FALLBACK_AVATAR, getTimestampValue, showToast } from '../data';
import { deleteChatRoomCascade, deleteGatheringCascade } from '../deletion';

const formatChatTime = (timestamp) => {
  const ms = getTimestampValue(timestamp);
  if (!ms) return '';

  const date = new Date(ms);
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? '오후' : '오전';
  hours = hours % 12 || 12;
  return `${ampm} ${hours}:${minutes}`;
};

const categoryEmoji = (category) => {
  switch (category) {
    case 'cafe': return '☕️';
    case 'movie': return '🎬';
    case 'food': return '🍔';
    default: return '🏃‍♀️';
  }
};

const ChatTab = ({ currentUser }) => {
  const [chatMode, setChatMode] = useState('private');
  const [followingUsers, setFollowingUsers] = useState([]);
  const [privateRooms, setPrivateRooms] = useState([]);
  const [gatheringRooms, setGatheringRooms] = useState([]);
  // 대화 상대 프로필 캐시 { uid: userDoc } — 팔로우하지 않은 상대도 이름이 보이도록
  const [userCache, setUserCache] = useState({});

  const [activeRoom, setActiveRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');

  const messagesEndRef = useRef(null);

  useEffect(() => {
    const timer = setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    return () => clearTimeout(timer);
  }, [messages]);

  // 팔로잉 목록 + 내가 속한 1:1 대화방
  useEffect(() => {
    if (!currentUser) return undefined;

    const loadFollowing = async () => {
      try {
        const snap = await getDoc(doc(db, 'users', currentUser.uid));
        const following = snap.data()?.following || [];
        if (following.length === 0) {
          setFollowingUsers([]);
          return;
        }

        // 순차 조회 대신 병렬로 받아 대기 시간을 줄인다.
        const results = await Promise.all(following.map((uid) => getDoc(doc(db, 'users', uid))));
        const users = results.filter((s) => s.exists()).map((s) => ({ uid: s.id, ...s.data() }));

        setFollowingUsers(users);
        setUserCache((prev) => {
          const next = { ...prev };
          users.forEach((u) => {
            next[u.uid] = u;
          });
          return next;
        });
      } catch (error) {
        console.error('팔로잉 목록 로드 실패:', error);
      }
    };
    loadFollowing();

    const qPrivate = query(collection(db, 'chatRooms'), where('members', 'array-contains', currentUser.uid));
    const unsubPrivate = onSnapshot(
      qPrivate,
      (snapshot) => setPrivateRooms(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (error) => console.error('대화방 로드 실패:', error)
    );

    return () => unsubPrivate();
  }, [currentUser]);

  // 내가 참여 중인 동행 채팅방
  useEffect(() => {
    if (!currentUser) return undefined;

    const qGathering = query(
      collection(db, 'gatherings'),
      where('currentMembers', 'array-contains', currentUser.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubGathering = onSnapshot(
      qGathering,
      (snapshot) => {
        const arr = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        setGatheringRooms(arr);

        // 보고 있던 동행이 사라졌으면(방장이 취소) 목록으로 돌아간다.
        setActiveRoom((prev) => {
          if (!prev || prev.type !== 'gathering') return prev;
          return arr.some((r) => r.id === prev.id) ? prev : null;
        });
      },
      (error) => console.error('동행 채팅방 로드 실패:', error)
    );

    return () => unsubGathering();
  }, [currentUser]);

  /**
   * 대화 상대 프로필 채우기.
   * 예전에는 팔로잉 목록에서만 찾아서, 팔로우하지 않은 상대와의 대화는
   * 전부 '알 수 없음' 으로 보였다.
   */
  useEffect(() => {
    if (!currentUser) return;

    const missing = privateRooms
      .map((room) => room.members?.find((m) => m !== currentUser.uid))
      .filter((uid) => uid && !userCache[uid]);

    if (missing.length === 0) return;

    let cancelled = false;
    (async () => {
      const results = await Promise.all([...new Set(missing)].map((uid) => getDoc(doc(db, 'users', uid))));
      if (cancelled) return;

      setUserCache((prev) => {
        const next = { ...prev };
        results.forEach((snap) => {
          if (snap.exists()) next[snap.id] = { uid: snap.id, ...snap.data() };
        });
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [privateRooms, currentUser, userCache]);

  const privateRoomUsers = useMemo(
    () =>
      privateRooms
        .map((room) => {
          const otherId = room.members?.find((m) => m !== currentUser?.uid);
          return { ...room, user: userCache[otherId] || null };
        })
        .sort((a, b) => getTimestampValue(b.lastMessageAt || b.createdAt) - getTimestampValue(a.lastMessageAt || a.createdAt)),
    [privateRooms, userCache, currentUser]
  );

  // 선택한 방의 메시지 구독
  useEffect(() => {
    if (!activeRoom) return undefined;

    const collectionPath = activeRoom.type === 'private' ? 'chatRooms' : 'gatherings';
    const q = query(collection(db, collectionPath, activeRoom.id, 'messages'), orderBy('createdAt', 'asc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => setMessages(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (error) => console.error('메시지 로드 실패:', error)
    );

    return () => unsubscribe();
  }, [activeRoom]);

  const handleCreatePrivateRoom = async (targetUser) => {
    if (!currentUser) return;

    // 두 사람의 uid 를 정렬해 조합하면 항상 같은 방 ID 가 나온다 (중복 생성 방지)
    const roomId = [currentUser.uid, targetUser.uid].sort().join('_');
    const roomRef = doc(db, 'chatRooms', roomId);

    try {
      const snap = await getDoc(roomRef);
      if (!snap.exists()) {
        await setDoc(roomRef, {
          members: [currentUser.uid, targetUser.uid],
          createdAt: serverTimestamp(),
          lastMessage: '',
          lastMessageAt: serverTimestamp()
        });
      }
      setActiveRoom({ id: roomId, type: 'private', user: targetUser });
    } catch (error) {
      console.error('대화방 생성 실패:', error);
      showToast('대화방을 열지 못했습니다.', 'error');
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    const msgText = newMessage.trim();
    if (!msgText || !activeRoom || !currentUser) return;

    setNewMessage('');
    const collectionPath = activeRoom.type === 'private' ? 'chatRooms' : 'gatherings';

    try {
      await addDoc(collection(db, collectionPath, activeRoom.id, 'messages'), {
        text: msgText,
        userId: currentUser.uid,
        userName: currentUser.displayName || '여행자',
        userAvatar: currentUser.photoURL || FALLBACK_AVATAR,
        createdAt: serverTimestamp()
      });

      if (activeRoom.type === 'private') {
        await setDoc(
          doc(db, 'chatRooms', activeRoom.id),
          { lastMessage: msgText, lastMessageAt: serverTimestamp() },
          { merge: true }
        );
      }
    } catch (error) {
      console.error('메시지 전송 에러:', error);
      setNewMessage(msgText); // 실패하면 입력값을 되돌려 다시 보낼 수 있게 한다.
      showToast('메시지를 보내지 못했습니다.', 'error');
    }
  };

  const handleLeavePrivateRoom = async () => {
    if (!activeRoom || activeRoom.type !== 'private') return;

    const confirmLeave = window.confirm(
      '채팅방을 나가시겠습니까?\n내가 나가면 상대방과의 대화방 및 모든 메시지가 영구 삭제됩니다.'
    );
    if (!confirmLeave) return;

    try {
      await deleteChatRoomCascade(activeRoom.id);
      setActiveRoom(null);
      showToast('채팅방을 나갔습니다.');
    } catch (error) {
      console.error('개인 채팅방 삭제 실패:', error);
      showToast('채팅방을 나가는 중 오류가 발생했습니다.', 'error');
    }
  };

  const handleLeaveGatheringRoom = async () => {
    if (!activeRoom || !currentUser) return;

    const gathering = gatheringRooms.find((r) => r.id === activeRoom.id);
    if (!gathering) return;

    const isHost = gathering.userId === currentUser.uid;
    const message = isHost
      ? '방장이 나가면 모임 자체가 취소되고 대화 내용도 삭제됩니다.\n진행하시겠습니까?'
      : '채팅방에서 정말 나가시겠습니까?';
    if (!window.confirm(message)) return;

    try {
      if (isHost) {
        await deleteGatheringCascade(activeRoom.id);
        showToast('동행 모집이 취소되었습니다.');
      } else {
        // 정원이 차서 마감됐던 모집도 한 명이 나가면 다시 모집 중이 된다.
        await updateDoc(doc(db, 'gatherings', activeRoom.id), {
          currentMembers: arrayRemove(currentUser.uid),
          status: 'recruiting'
        });
        await addDoc(collection(db, 'gatherings', activeRoom.id, 'messages'), {
          text: `👋 ${currentUser.displayName || '여행자'}님이 퇴장하셨습니다.`,
          userId: 'system',
          createdAt: serverTimestamp()
        });
        showToast('동행 채팅방을 나갔습니다.');
      }
      setActiveRoom(null);
    } catch (error) {
      console.error('채팅방 나가기 실패:', error);
      showToast('나가기에 실패했습니다.', 'error');
    }
  };

  const showList = !activeRoom;
  // 방을 나가면 이전 방의 메시지가 잠깐 비쳐 보이지 않도록 화면에서 걸러 준다.
  const visibleMessages = activeRoom ? messages : [];

  return (
    <section className="tab-page active" style={{ display: 'flex', backgroundColor: '#fcfcfc', height: '100%', overflow: 'hidden' }}>
      {/* 대화 목록 */}
      <div
        style={{
          width: '100%',
          borderRight: '1px solid #eee',
          backgroundColor: '#fff',
          display: showList ? 'flex' : 'none',
          flexDirection: 'column'
        }}
      >
        <div style={{ padding: '20px 20px 10px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: '800', marginBottom: '20px', color: '#111' }}>메시지</h2>
          <div style={{ display: 'flex', gap: '8px', padding: '4px', backgroundColor: '#F1F3F5', borderRadius: '12px' }}>
            {[
              { key: 'private', label: '👤 개인 채팅' },
              { key: 'gathering', label: '🗺️ 동행 채팅' }
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setChatMode(tab.key)}
                aria-pressed={chatMode === tab.key}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: '8px',
                  border: 'none',
                  fontWeight: 'bold',
                  fontSize: '13px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  backgroundColor: chatMode === tab.key ? '#fff' : 'transparent',
                  color: chatMode === tab.key ? '#1A1A1A' : '#868E96',
                  boxShadow: chatMode === tab.key ? '0 2px 4px rgba(0,0,0,0.05)' : 'none'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 20px 90px' }}>
          {chatMode === 'private' && (
            <>
              <div style={{ marginBottom: '24px' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '12px', fontSize: '13px', color: '#868E96' }}>
                  팔로잉 친구들 (대화 시작)
                </div>
                <div style={{ display: 'flex', overflowX: 'auto', gap: '14px', paddingBottom: '8px' }} className="photo-slider">
                  {followingUsers.length === 0 ? (
                    <div style={{ fontSize: '12px', color: '#ADB5BD' }}>팔로잉 중인 친구가 없습니다.</div>
                  ) : (
                    followingUsers.map((user) => (
                      <div
                        key={user.uid}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleCreatePrivateRoom(user)}
                        onKeyDown={(e) => e.key === 'Enter' && handleCreatePrivateRoom(user)}
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', cursor: 'pointer', minWidth: '56px' }}
                      >
                        <img
                          src={user.photoURL || FALLBACK_AVATAR}
                          alt=""
                          onError={(e) => {
                            e.currentTarget.src = FALLBACK_AVATAR;
                          }}
                          style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #fff', boxShadow: '0 2px 6px rgba(0,0,0,0.1)' }}
                        />
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: '600',
                            color: '#333',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            width: '100%',
                            textAlign: 'center'
                          }}
                        >
                          {user.displayName || '여행자'}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div>
                <div style={{ fontWeight: 'bold', marginBottom: '12px', fontSize: '13px', color: '#868E96' }}>최근 대화</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {privateRoomUsers.length === 0 ? (
                    <div style={{ fontSize: '13px', color: '#ADB5BD', textAlign: 'center', padding: '20px 0' }}>
                      진행 중인 대화가 없습니다.
                    </div>
                  ) : (
                    privateRoomUsers.map((room) => (
                      <div
                        key={room.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setActiveRoom({ ...room, type: 'private' })}
                        onKeyDown={(e) => e.key === 'Enter' && setActiveRoom({ ...room, type: 'private' })}
                        style={{
                          background: '#fff',
                          padding: '12px',
                          borderRadius: '16px',
                          cursor: 'pointer',
                          display: 'flex',
                          gap: '14px',
                          alignItems: 'center',
                          border: '1px solid #F1F3F5'
                        }}
                      >
                        <img
                          src={room.user?.photoURL || FALLBACK_AVATAR}
                          alt=""
                          onError={(e) => {
                            e.currentTarget.src = FALLBACK_AVATAR;
                          }}
                          style={{ width: '44px', height: '44px', borderRadius: '50%', objectFit: 'cover' }}
                        />
                        <div style={{ flex: 1, overflow: 'hidden' }}>
                          <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#111', marginBottom: '4px' }}>
                            {room.user?.displayName || '여행자'}
                          </div>
                          <div style={{ fontSize: '13px', color: '#868e96', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {room.lastMessage || '새로운 대화를 시작해보세요!'}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}

          {chatMode === 'gathering' && (
            <div>
              <div style={{ fontWeight: 'bold', marginBottom: '12px', fontSize: '13px', color: '#868E96' }}>참여 중인 동행</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {gatheringRooms.length === 0 ? (
                  <div style={{ fontSize: '13px', color: '#ADB5BD', textAlign: 'center', padding: '40px 0' }}>
                    참여 중인 동행이 없습니다.
                    <br />홈에서 새로운 곁길을 찾아보세요!
                  </div>
                ) : (
                  gatheringRooms.map((room) => (
                    <div
                      key={room.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setActiveRoom({ ...room, type: 'gathering' })}
                      onKeyDown={(e) => e.key === 'Enter' && setActiveRoom({ ...room, type: 'gathering' })}
                      style={{
                        background: '#fff',
                        padding: '14px',
                        borderRadius: '16px',
                        cursor: 'pointer',
                        display: 'flex',
                        gap: '14px',
                        alignItems: 'center',
                        border: '1px solid #F1F3F5',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
                      }}
                    >
                      <div
                        style={{
                          width: '48px',
                          height: '48px',
                          borderRadius: '16px',
                          backgroundColor: '#F1F9F5',
                          display: 'flex',
                          justifyContent: 'center',
                          alignItems: 'center',
                          fontSize: '20px',
                          flexShrink: 0
                        }}
                      >
                        {categoryEmoji(room.category)}
                      </div>
                      <div style={{ flex: 1, overflow: 'hidden' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <h3 style={{ fontSize: '15px', fontWeight: 'bold', color: '#111', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', margin: 0 }}>
                            {room.title}
                          </h3>
                          <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#52B788', backgroundColor: '#EBFBEE', padding: '2px 6px', borderRadius: '8px', flexShrink: 0 }}>
                            {room.currentMembers?.length || 1}/{room.maxMembers}
                          </span>
                        </div>
                        <div style={{ fontSize: '12px', color: '#868e96', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          방장: {room.authorName}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 대화 화면 */}
      <div style={{ flex: 1, display: showList ? 'none' : 'flex', flexDirection: 'column', backgroundColor: '#F8F9FA' }}>
        {activeRoom && (
          <>
            <div
              style={{
                padding: '16px 20px',
                backgroundColor: '#fff',
                borderBottom: '1px solid #eee',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button
                  onClick={() => setActiveRoom(null)}
                  aria-label="대화 목록으로"
                  style={{ background: 'none', border: 'none', fontSize: '20px', color: '#1A1A1A', cursor: 'pointer', padding: '0 8px 0 0' }}
                >
                  <i className="fas fa-chevron-left"></i>
                </button>

                {activeRoom.type === 'private' ? (
                  <>
                    <img
                      src={activeRoom.user?.photoURL || FALLBACK_AVATAR}
                      alt=""
                      onError={(e) => {
                        e.currentTarget.src = FALLBACK_AVATAR;
                      }}
                      style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover' }}
                    />
                    <div style={{ fontWeight: 'bold', fontSize: '16px', color: '#1A1A1A' }}>
                      {activeRoom.user?.displayName || '여행자'}
                    </div>
                  </>
                ) : (
                  <div>
                    <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: '#1A1A1A', margin: 0 }}>{activeRoom.title}</h2>
                    <span style={{ fontSize: '12px', color: '#868E96' }}>
                      참여자 {activeRoom.currentMembers?.length || 1}명
                    </span>
                  </div>
                )}
              </div>

              <button
                onClick={activeRoom.type === 'gathering' ? handleLeaveGatheringRoom : handleLeavePrivateRoom}
                style={{ background: 'none', border: 'none', fontSize: '20px', color: '#E03131', cursor: 'pointer', padding: '4px' }}
                title="채팅방 나가기"
                aria-label="채팅방 나가기"
              >
                <i className="fas fa-sign-out-alt"></i>
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {visibleMessages.length === 0 && (
                <div style={{ textAlign: 'center', color: '#ADB5BD', fontSize: '13px', marginTop: '40px' }}>
                  아직 대화가 없습니다. 먼저 인사를 건네보세요! 👋
                </div>
              )}

              {visibleMessages.map((msg, index) => {
                if (msg.userId === 'system') {
                  return (
                    <div key={msg.id || index} style={{ textAlign: 'center', margin: '8px 0' }}>
                      <span style={{ backgroundColor: 'rgba(0,0,0,0.08)', color: '#495057', fontSize: '11px', padding: '6px 14px', borderRadius: '14px', fontWeight: '500' }}>
                        {msg.text}
                      </span>
                    </div>
                  );
                }

                const isMine = (msg.userId || msg.senderId) === currentUser?.uid;

                return (
                  <div key={msg.id} style={{ display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start', alignItems: 'flex-end', gap: '8px' }}>
                    {!isMine && (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', alignSelf: 'flex-start' }}>
                        <img
                          src={msg.userAvatar || msg.senderAvatar || FALLBACK_AVATAR}
                          alt=""
                          onError={(e) => {
                            e.currentTarget.src = FALLBACK_AVATAR;
                          }}
                          style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }}
                        />
                        <span style={{ fontSize: '10px', color: '#868E96' }}>{msg.userName || msg.senderName}</span>
                      </div>
                    )}

                    {isMine && <span style={{ fontSize: '10px', color: '#ADB5BD', paddingBottom: '2px' }}>{formatChatTime(msg.createdAt)}</span>}

                    <div
                      style={{
                        background: isMine ? '#1A1A1A' : '#fff',
                        color: isMine ? '#fff' : '#1A1A1A',
                        padding: '12px 16px',
                        borderRadius: isMine ? '18px 4px 18px 18px' : '4px 18px 18px 18px',
                        maxWidth: '70%',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
                        fontSize: '14px',
                        lineHeight: '1.4',
                        wordBreak: 'break-word',
                        whiteSpace: 'pre-wrap'
                      }}
                    >
                      {msg.text}
                    </div>

                    {!isMine && <span style={{ fontSize: '10px', color: '#ADB5BD', paddingBottom: '2px' }}>{formatChatTime(msg.createdAt)}</span>}
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <form
              onSubmit={handleSendMessage}
              style={{ borderTop: '1px solid #E5E7EB', padding: '16px 20px', display: 'flex', gap: '12px', backgroundColor: '#fff' }}
            >
              <input
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="메시지 입력..."
                aria-label="메시지 입력"
                maxLength={500}
                style={{ flex: 1, border: 'none', backgroundColor: '#F1F3F5', borderRadius: '24px', padding: '14px 18px', outline: 'none', fontSize: '14px' }}
              />
              <button
                type="submit"
                disabled={!newMessage.trim()}
                aria-label="메시지 보내기"
                style={{
                  border: 'none',
                  background: newMessage.trim() ? '#52B788' : '#E9ECEF',
                  color: newMessage.trim() ? '#fff' : '#ADB5BD',
                  borderRadius: '50%',
                  width: '46px',
                  height: '46px',
                  flexShrink: 0,
                  cursor: newMessage.trim() ? 'pointer' : 'default',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '18px',
                  transition: 'all 0.2s'
                }}
              >
                <i className="fas fa-paper-plane" style={{ marginLeft: '-2px' }}></i>
              </button>
            </form>
          </>
        )}
      </div>

      <style>{`.photo-slider::-webkit-scrollbar { display: none; }`}</style>
    </section>
  );
};

export default ChatTab;
