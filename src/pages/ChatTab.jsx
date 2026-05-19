import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  collection, query, where, orderBy, onSnapshot, 
  doc, updateDoc, arrayRemove, addDoc, serverTimestamp, deleteDoc, getDoc, setDoc 
} from 'firebase/firestore';
import { db, auth } from '../firebase';

// 날짜/시간 포맷팅
const formatChatTime = (timestamp) => {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  let hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? '오후' : '오전';
  hours = hours % 12 || 12;
  return `${ampm} ${hours}:${minutes}`;
};

const ChatTab = () => {
  const currentUser = auth.currentUser;
  
  // 🚨 [NEW] 상단 탭 스위치 상태: 'private' (개인 1:1) | 'gathering' (동행 그룹)
  const [chatMode, setChatMode] = useState('private'); 

  // 데이터 상태
  const [followingUsers, setFollowingUsers] = useState([]);
  const [privateRooms, setPrivateRooms] = useState([]);
  const [gatheringRooms, setGatheringRooms] = useState([]);
  
  // 현재 열려있는 채팅방 (type 프로퍼티로 private/gathering 구분)
  const [activeRoom, setActiveRoom] = useState(null); 
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  
  const messagesEndRef = useRef(null);

  // 자동 스크롤
  useEffect(() => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }, [messages]);

  // ==========================================
  // 1. 데이터 로드: 팔로잉 & 개인 채팅방
  // ==========================================
  useEffect(() => {
    if (!currentUser) return;
    
    // 팔로잉 유저 목록 가져오기
    const loadFollowing = async () => {
      const myRef = doc(db, 'users', currentUser.uid);
      const snap = await getDoc(myRef);
      const following = snap.data()?.following || [];
      if (following.length === 0) { setFollowingUsers([]); return; }

      const users = [];
      for (const uid of following) {
        const userSnap = await getDoc(doc(db, 'users', uid));
        if (userSnap.exists()) users.push({ uid, ...userSnap.data() });
      }
      setFollowingUsers(users);
    };
    loadFollowing();

    // 1:1 채팅방 목록 실시간 로드
    const qPrivate = query(collection(db, 'chatRooms'), where('members', 'array-contains', currentUser.uid));
    const unsubPrivate = onSnapshot(qPrivate, (snapshot) => {
      const arr = [];
      snapshot.forEach((docSnap) => arr.push({ id: docSnap.id, ...docSnap.data() }));
      setPrivateRooms(arr);
    });

    return () => unsubPrivate();
  }, [currentUser]);

  // ==========================================
  // 2. 데이터 로드: 동행 그룹 채팅방
  // ==========================================
  useEffect(() => {
    if (!currentUser) return;
    const qGathering = query(collection(db, 'gatherings'), where('currentMembers', 'array-contains', currentUser.uid), orderBy('createdAt', 'desc'));
    const unsubGathering = onSnapshot(qGathering, (snapshot) => {
      const arr = [];
      snapshot.forEach((docSnap) => arr.push({ id: docSnap.id, ...docSnap.data() }));
      setGatheringRooms(arr);
      
      // 열려있던 동행 방이 폭파되었는지 체크
      if (activeRoom && activeRoom.type === 'gathering') {
        const stillExists = arr.find(r => r.id === activeRoom.id);
        if (!stillExists) setActiveRoom(null);
      }
    });

    return () => unsubGathering();
  }, [currentUser, activeRoom]);

  // 개인 채팅방 상대방 정보 매핑
  const privateRoomUsers = useMemo(() => {
    return privateRooms.map((room) => {
      const otherId = room.members.find((m) => m !== currentUser?.uid);
      const user = followingUsers.find((u) => u.uid === otherId);
      return { ...room, user };
    });
  }, [privateRooms, followingUsers, currentUser]);

  // ==========================================
  // 3. 메시지 실시간 로드 (활성화된 방 기준)
  // ==========================================
  useEffect(() => {
    if (!activeRoom) return;
    
    // activeRoom.type에 따라 컬렉션 경로 동적 분기
    const collectionPath = activeRoom.type === 'private' ? 'chatRooms' : 'gatherings';
    const q = query(collection(db, collectionPath, activeRoom.id, 'messages'), orderBy('createdAt', 'asc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = [];
      snapshot.forEach((docSnap) => msgs.push({ id: docSnap.id, ...docSnap.data() }));
      setMessages(msgs);
    });
    
    return () => unsubscribe();
  }, [activeRoom]);

  // ==========================================
  // 4. 액션 로직 (방 생성, 전송, 나가기)
  // ==========================================
  
  // 1:1 방 생성 (또는 입장)
  const handleCreatePrivateRoom = async (targetUser) => {
    const roomId = [currentUser.uid, targetUser.uid].sort().join('_');
    const roomRef = doc(db, 'chatRooms', roomId);
    const snap = await getDoc(roomRef);

    if (!snap.exists()) {
      await setDoc(roomRef, {
        members: [currentUser.uid, targetUser.uid],
        createdAt: Date.now(),
        lastMessage: ''
      });
    }
    setActiveRoom({ id: roomId, type: 'private', user: targetUser });
  };

  // 메시지 전송
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeRoom) return;

    const msgText = newMessage.trim();
    setNewMessage(''); 

    const collectionPath = activeRoom.type === 'private' ? 'chatRooms' : 'gatherings';

    try {
      await addDoc(collection(db, collectionPath, activeRoom.id, 'messages'), {
        text: msgText,
        userId: currentUser.uid,
        userName: currentUser.displayName || '여행자',
        userAvatar: currentUser.photoURL || 'https://api.dicebear.com/7.x/adventurer/svg?seed=fallback',
        createdAt: serverTimestamp()
      });

      // 개인 채팅일 경우 방의 마지막 메시지 업데이트
      if (activeRoom.type === 'private') {
        await setDoc(doc(db, 'chatRooms', activeRoom.id), { lastMessage: msgText }, { merge: true });
      }
    } catch (error) { console.error('메시지 전송 에러:', error); }
  };

  // 동행 방 나가기 (개인 채팅은 제외)
  const handleLeaveGatheringRoom = async () => {
    if (!window.confirm('채팅방에서 정말 나가시겠습니까?')) return;

    try {
      const gathering = gatheringRooms.find(r => r.id === activeRoom.id);
      if (!gathering) return;

      const isHost = gathering.userId === currentUser.uid;
      
      if (isHost) {
        if (window.confirm('방장이 나가면 모임 자체가 취소됩니다. 진행하시겠습니까?')) {
          await deleteDoc(doc(db, 'gatherings', activeRoom.id));
          setActiveRoom(null); 
        }
      } else {
        await updateDoc(doc(db, 'gatherings', activeRoom.id), {
          currentMembers: arrayRemove(currentUser.uid)
        });
        await addDoc(collection(db, 'gatherings', activeRoom.id, 'messages'), {
          text: `👋 ${currentUser.displayName || '여행자'}님이 퇴장하셨습니다.`,
          userId: 'system',
          createdAt: serverTimestamp()
        });
        setActiveRoom(null); 
      }
    } catch (error) { console.error('채팅방 나가기 실패:', error); }
  };

  // 모바일 대응 (방이 열리면 리스트 숨김)
  const showList = !activeRoom;

  return (
    <section className="tab-page active" style={{ display: 'flex', backgroundColor: '#fcfcfc', height: '100%', overflow: 'hidden' }}>
      
      {/* ==========================================
          📋 [1] 좌측/메인 채팅 목록 패널
      ========================================== */}
      <div 
        style={{ 
          width: '100%', maxWidth: '360px', borderRight: '1px solid #eee', 
          backgroundColor: '#fff', display: showList ? 'flex' : 'none', flexDirection: 'column'
        }}
      >
        <div style={{ padding: '20px 20px 10px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: '800', marginBottom: '20px', color: '#111' }}>메시지</h2>
          
          {/* 🚨 상단 토글 스위치 */}
          <div style={{ display: 'flex', gap: '8px', padding: '4px', backgroundColor: '#F1F3F5', borderRadius: '12px' }}>
            <button
              onClick={() => setChatMode('private')}
              style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer', transition: 'all 0.2s', backgroundColor: chatMode === 'private' ? '#fff' : 'transparent', color: chatMode === 'private' ? '#1A1A1A' : '#868E96', boxShadow: chatMode === 'private' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none' }}
            >
              👤 개인 채팅
            </button>
            <button
              onClick={() => setChatMode('gathering')}
              style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer', transition: 'all 0.2s', backgroundColor: chatMode === 'gathering' ? '#fff' : 'transparent', color: chatMode === 'gathering' ? '#1A1A1A' : '#868E96', boxShadow: chatMode === 'gathering' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none' }}
            >
              🗺️ 동행 채팅
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 20px 20px' }}>
          
          {/* --- 👤 개인 채팅 모드 --- */}
          {chatMode === 'private' && (
            <>
              {/* 팔로잉 바 */}
              <div style={{ marginBottom: '24px' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '12px', fontSize: '13px', color: '#868E96' }}>팔로잉 친구들 (대화 시작)</div>
                <div style={{ display: 'flex', overflowX: 'auto', gap: '14px', paddingBottom: '8px' }} className="photo-slider">
                  {followingUsers.length === 0 ? (
                    <div style={{ fontSize: '12px', color: '#ADB5BD' }}>팔로잉 중인 친구가 없습니다.</div>
                  ) : (
                    followingUsers.map((user) => (
                      <div key={user.uid} onClick={() => handleCreatePrivateRoom(user)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', cursor: 'pointer', minWidth: '56px' }}>
                        <img src={user.photoURL} alt={user.displayName} style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #fff', boxShadow: '0 2px 6px rgba(0,0,0,0.1)' }} />
                        <span style={{ fontSize: '11px', fontWeight: '600', color: '#333', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%', textAlign: 'center' }}>{user.displayName}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* 최근 1:1 대화 목록 */}
              <div>
                <div style={{ fontWeight: 'bold', marginBottom: '12px', fontSize: '13px', color: '#868E96' }}>최근 대화</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {privateRoomUsers.length === 0 ? (
                    <div style={{ fontSize: '13px', color: '#ADB5BD', textAlign: 'center', padding: '20px 0' }}>진행 중인 대화가 없습니다.</div>
                  ) : (
                    privateRoomUsers.map((room) => (
                      <div 
                        key={room.id} onClick={() => setActiveRoom({ ...room, type: 'private' })}
                        style={{ background: activeRoom?.id === room.id ? '#F8F9FA' : '#fff', padding: '12px', borderRadius: '16px', cursor: 'pointer', display: 'flex', gap: '14px', alignItems: 'center', transition: 'background 0.2s', border: '1px solid transparent', borderColor: activeRoom?.id === room.id ? '#E5E7EB' : 'transparent' }}
                      >
                        <img src={room.user?.photoURL || 'https://via.placeholder.com/150'} alt="" style={{ width: '44px', height: '44px', borderRadius: '50%', objectFit: 'cover' }} />
                        <div style={{ flex: 1, overflow: 'hidden' }}>
                          <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#111', marginBottom: '4px' }}>{room.user?.displayName || '알 수 없음'}</div>
                          <div style={{ fontSize: '13px', color: '#868e96', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{room.lastMessage || '새로운 대화를 시작해보세요!'}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}

          {/* --- 🗺️ 동행 채팅 모드 --- */}
          {chatMode === 'gathering' && (
            <div>
              <div style={{ fontWeight: 'bold', marginBottom: '12px', fontSize: '13px', color: '#868E96' }}>참여 중인 동행</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {gatheringRooms.length === 0 ? (
                  <div style={{ fontSize: '13px', color: '#ADB5BD', textAlign: 'center', padding: '40px 0' }}>참여 중인 동행이 없습니다.<br/>홈에서 새로운 곁길을 찾아보세요!</div>
                ) : (
                  gatheringRooms.map((room) => (
                    <div 
                      key={room.id} onClick={() => setActiveRoom({ ...room, type: 'gathering' })}
                      style={{ background: activeRoom?.id === room.id ? '#EDF7EE' : '#fff', padding: '14px', borderRadius: '16px', cursor: 'pointer', display: 'flex', gap: '14px', alignItems: 'center', transition: 'background 0.2s', border: '1px solid transparent', borderColor: activeRoom?.id === room.id ? '#C3E6CB' : 'transparent', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}
                    >
                      <div style={{ width: '48px', height: '48px', borderRadius: '16px', backgroundColor: '#F1F9F5', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '20px', flexShrink: 0 }}>
                        {room.category === 'cafe' ? '☕️' : room.category === 'movie' ? '🎬' : room.category === 'food' ? '🍔' : '🏃‍♀️'}
                      </div>
                      <div style={{ flex: 1, overflow: 'hidden' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <h3 style={{ fontSize: '15px', fontWeight: 'bold', color: '#111', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', margin: 0 }}>{room.title}</h3>
                          <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#52B788', backgroundColor: '#EBFBEE', padding: '2px 6px', borderRadius: '8px' }}>{room.currentMembers?.length || 1}/{room.maxMembers}</span>
                        </div>
                        <div style={{ fontSize: '12px', color: '#868e96', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>방장: {room.authorName}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* ==========================================
          🚪 [2] 우측/메인 대화창 패널
      ========================================== */}
      <div style={{ flex: 1, display: !showList ? 'flex' : 'none', flexDirection: 'column', backgroundColor: '#F8F9FA' }}>
        
        {!activeRoom ? (
          // 방이 선택되지 않았을 때 (PC 뷰)
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: '#adb5bd' }}>
            <i className="far fa-comments" style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.5 }}></i>
            대화방을 선택해주세요.
          </div>
        ) : (
          <>
            {/* --- 대화방 헤더 --- */}
            <div style={{ padding: '16px 20px', backgroundColor: '#fff', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button onClick={() => setActiveRoom(null)} style={{ background: 'none', border: 'none', fontSize: '20px', color: '#1A1A1A', cursor: 'pointer', padding: '0 8px 0 0' }}>
                  <i className="fas fa-chevron-left"></i>
                </button>
                
                {activeRoom.type === 'private' ? (
                  <>
                    <img src={activeRoom.user?.photoURL} alt="" style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover' }} />
                    <div style={{ fontWeight: 'bold', fontSize: '16px', color: '#1A1A1A' }}>{activeRoom.user?.displayName}</div>
                  </>
                ) : (
                  <div>
                    <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: '#1A1A1A', margin: 0 }}>{activeRoom.title}</h2>
                    <span style={{ fontSize: '12px', color: '#868E96' }}>참여자 {activeRoom.currentMembers?.length || 1}명</span>
                  </div>
                )}
              </div>

              {/* 🚨 동행 방일 때만 나가기 버튼 활성화 */}
              {activeRoom.type === 'gathering' && (
                <button onClick={handleLeaveGatheringRoom} style={{ background: 'none', border: 'none', fontSize: '20px', color: '#ADB5BD', cursor: 'pointer' }}>
                  <i className="fas fa-sign-out-alt"></i>
                </button>
              )}
            </div>

            {/* --- 메시지 리스트 --- */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {messages.map((msg, index) => {
                // 시스템 메시지 렌더링
                if (msg.userId === 'system') {
                  return (
                    <div key={msg.id || index} style={{ textAlign: 'center', margin: '8px 0' }}>
                      <span style={{ backgroundColor: 'rgba(0,0,0,0.08)', color: '#495057', fontSize: '11px', padding: '6px 14px', borderRadius: '14px', fontWeight: '500' }}>
                        {msg.text}
                      </span>
                    </div>
                  );
                }

                const isMine = (msg.userId || msg.senderId) === currentUser?.uid; // 기존 1:1 채팅의 senderId 호환

                return (
                  <div key={msg.id} style={{ display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start', alignItems: 'flex-end', gap: '8px' }}>
                    
                    {!isMine && (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', alignSelf: 'flex-start' }}>
                        <img src={msg.userAvatar || msg.senderAvatar} alt="" style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }} />
                        <span style={{ fontSize: '10px', color: '#868E96' }}>{msg.userName || msg.senderName}</span>
                      </div>
                    )}

                    {isMine && <span style={{ fontSize: '10px', color: '#ADB5BD', paddingBottom: '2px' }}>{formatChatTime(msg.createdAt)}</span>}
                    
                    <div style={{ 
                      background: isMine ? '#1A1A1A' : '#fff', color: isMine ? '#fff' : '#1A1A1A', 
                      padding: '12px 16px', borderRadius: isMine ? '18px 4px 18px 18px' : '4px 18px 18px 18px', 
                      maxWidth: '70%', boxShadow: '0 2px 6px rgba(0,0,0,0.04)', fontSize: '14px', lineHeight: '1.4', wordBreak: 'break-word'
                    }}>
                      {msg.text}
                    </div>

                    {!isMine && <span style={{ fontSize: '10px', color: '#ADB5BD', paddingBottom: '2px' }}>{formatChatTime(msg.createdAt)}</span>}
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* --- 메시지 입력창 --- */}
            <form onSubmit={handleSendMessage} style={{ borderTop: '1px solid #E5E7EB', padding: '16px 20px', display: 'flex', gap: '12px', backgroundColor: '#fff' }}>
              <input
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="메시지 입력..."
                style={{ flex: 1, border: 'none', backgroundColor: '#F1F3F5', borderRadius: '24px', padding: '14px 18px', outline: 'none', fontSize: '14px' }}
              />
              <button
                type="submit" disabled={!newMessage.trim()}
                style={{ 
                  border: 'none', background: newMessage.trim() ? '#52B788' : '#E9ECEF', color: newMessage.trim() ? '#fff' : '#ADB5BD', 
                  borderRadius: '50%', width: '46px', height: '46px', cursor: newMessage.trim() ? 'pointer' : 'default',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', transition: 'all 0.2s'
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