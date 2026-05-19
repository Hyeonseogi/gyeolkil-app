import React, { useEffect, useMemo, useState, useRef } from 'react';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, orderBy, doc, getDoc, setDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { formatTime } from '../data'; // 필요시 시간 포맷팅 함수 임포트

const ChatTab = () => {
  const currentUser = auth.currentUser;
  
  const [followingUsers, setFollowingUsers] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');

  // 🚨 [현석 님 UX 로직] 자동 스크롤을 위한 Ref
  const messagesEndRef = useRef(null);

  // 채팅방 메시지 업데이트 시 자동 스크롤
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 1. [동주 님 로직] 팔로잉 로드
  useEffect(() => {
    if (!currentUser) return;
    const loadFollowing = async () => {
      const myRef = doc(db, 'users', currentUser.uid);
      const snap = await getDoc(myRef);
      const following = snap.data()?.following || [];

      if (following.length === 0) {
        setFollowingUsers([]);
        return;
      }

      const users = [];
      for (const uid of following) {
        const userSnap = await getDoc(doc(db, 'users', uid));
        if (userSnap.exists()) {
          users.push({ uid, ...userSnap.data() });
        }
      }
      setFollowingUsers(users);
    };
    loadFollowing();
  }, [currentUser]);

  // 2. [동주 님 로직] 채팅방 목록 실시간 로드
  useEffect(() => {
    if (!currentUser) return;
    const q = query(collection(db, 'chatRooms'), where('members', 'array-contains', currentUser.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const arr = [];
      snapshot.forEach((docSnap) => {
        arr.push({ id: docSnap.id, ...docSnap.data() });
      });
      setRooms(arr);
    });
    return () => unsubscribe();
  }, [currentUser]);

  // 3. [동주 님 로직] 메시지 실시간 감시
  useEffect(() => {
    if (!selectedRoom) return;
    const q = query(collection(db, 'chatRooms', selectedRoom.id, 'messages'), orderBy('createdAt', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const arr = [];
      snapshot.forEach((docSnap) => {
        arr.push({ id: docSnap.id, ...docSnap.data() });
      });
      setMessages(arr);
    });
    return () => unsubscribe();
  }, [selectedRoom]);

  // 채팅방 생성 로직
  const handleCreateRoom = async (targetUser) => {
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
    
    // 방 생성 후 선택 (UI 전환)
    const newRoomData = { id: roomId, members: [currentUser.uid, targetUser.uid] };
    setSelectedRoom(newRoomData);
  };

  // 메시지 전송 로직
  const handleSendMessage = async () => {
    if (!messageInput.trim() || !selectedRoom) return;

    const messageText = messageInput; // 입력값 복사
    setMessageInput(''); // 전송 직후 즉시 입력창 초기화 (UX 향상)

    try {
      await addDoc(collection(db, 'chatRooms', selectedRoom.id, 'messages'), {
        text: messageText,
        senderId: currentUser.uid,
        senderName: currentUser.displayName,
        senderAvatar: currentUser.photoURL,
        createdAt: serverTimestamp()
      });

      await setDoc(doc(db, 'chatRooms', selectedRoom.id), {
        lastMessage: messageText
      }, { merge: true });
    } catch (error) {
      console.error("메시지 전송 에러:", error);
    }
  };

  // 상대 유저 정보 매핑
  const roomUsers = useMemo(() => {
    return rooms.map((room) => {
      const otherId = room.members.find((m) => m !== currentUser?.uid);
      const user = followingUsers.find((u) => u.uid === otherId);
      return { ...room, user };
    });
  }, [rooms, followingUsers, currentUser]);

  // 모바일 대응: 방이 선택되었을 때 리스트 숨기기
  const showList = !selectedRoom;

  return (
    <section className="tab-page active" style={{ height: '100%', display: 'flex', backgroundColor: '#fcfcfc' }}>
      
      {/* 📋 좌측/메인 채팅 목록 패널 */}
      <div 
        style={{ 
          width: '100%', maxWidth: '360px', 
          borderRight: '1px solid #eee', 
          overflowY: 'auto', backgroundColor: '#fff',
          display: showList ? 'block' : 'none' // 모바일: 방 선택 시 숨김
        }}
      >
        <div style={{ padding: '20px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: '800', marginBottom: '24px', color: '#111' }}>채팅</h2>

          {/* 팔로잉 (새 채팅 시작) */}
          <div style={{ marginBottom: '30px' }}>
            <div style={{ fontWeight: 'bold', marginBottom: '14px', fontSize: '15px', color: '#495057' }}>새로운 대화 시작</div>
            <div style={{ display: 'flex', overflowX: 'auto', gap: '14px', paddingBottom: '10px' }} className="photo-slider">
              {followingUsers.length === 0 ? (
                <div style={{ fontSize: '13px', color: '#ADB5BD' }}>팔로잉 중인 친구가 없습니다.</div>
              ) : (
                followingUsers.map((user) => (
                  <div key={user.uid} onClick={() => handleCreateRoom(user)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', cursor: 'pointer', minWidth: '60px' }}>
                    <img src={user.photoURL} alt={user.displayName} style={{ width: '52px', height: '52px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #fff', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }} />
                    <span style={{ fontSize: '12px', fontWeight: '600', color: '#333' }}>{user.displayName}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* 최근 채팅 목록 */}
          <div>
            <div style={{ fontWeight: 'bold', marginBottom: '14px', fontSize: '15px', color: '#495057' }}>최근 대화</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {roomUsers.length === 0 ? (
                <div style={{ fontSize: '13px', color: '#ADB5BD', textAlign: 'center', padding: '20px 0' }}>진행 중인 대화가 없습니다.</div>
              ) : (
                roomUsers.map((room) => (
                  <div 
                    key={room.id} 
                    onClick={() => setSelectedRoom(room)}
                    style={{
                      border: 'none',
                      background: selectedRoom?.id === room.id ? '#EDF7EE' : '#fff',
                      padding: '12px 14px',
                      borderRadius: '16px',
                      cursor: 'pointer',
                      display: 'flex',
                      gap: '14px',
                      alignItems: 'center',
                      transition: 'background 0.2s'
                    }}
                  >
                    <img src={room.user?.photoURL || 'https://via.placeholder.com/150'} alt="" style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover' }} />
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                      <div style={{ fontWeight: 'bold', fontSize: '15px', color: '#111', marginBottom: '4px' }}>
                        {room.user?.displayName || '알 수 없음'}
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
        </div>
      </div>

      {/* 💬 우측/메인 대화창 패널 */}
      <div 
        style={{ 
          flex: 1, 
          display: !showList ? 'flex' : 'none', // 모바일: 방 선택 시 보임 (PC는 flex 유지)
          flexDirection: 'column',
          backgroundColor: '#F8F9FA'
        }}
      >
        {!selectedRoom ? (
          // PC 화면용 (선택된 방이 없을 때)
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: '#adb5bd' }}>
            <i className="far fa-comments" style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.5 }}></i>
            대화할 친구를 선택해주세요.
          </div>
        ) : (
          <>
            {/* 채팅방 헤더 */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center', gap: '14px', backgroundColor: '#fff' }}>
              <button onClick={() => setSelectedRoom(null)} style={{ background: 'none', border: 'none', fontSize: '20px', color: '#111', cursor: 'pointer', padding: '0 8px 0 0' }}>
                <i className="fas fa-arrow-left"></i>
              </button>
              {roomUsers.find(r => r.id === selectedRoom.id)?.user && (
                <img src={roomUsers.find(r => r.id === selectedRoom.id).user.photoURL} alt="" style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' }} />
              )}
              <div style={{ fontWeight: 'bold', fontSize: '16px', color: '#111' }}>
                {roomUsers.find(r => r.id === selectedRoom.id)?.user?.displayName || '대화방'}
              </div>
            </div>

            {/* 메시지 리스트 */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {messages.map((msg) => {
                const isMine = msg.senderId === currentUser?.uid;
                
                // 시간 포맷팅 (옵션)
                const timeString = msg.createdAt ? new Date(msg.createdAt.toMillis()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

                return (
                  <div key={msg.id} style={{ display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start', alignItems: 'flex-end', gap: '6px' }}>
                    
                    {!isMine && (
                      <img src={msg.senderAvatar} alt="" style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover', alignSelf: 'flex-start' }} />
                    )}

                    {isMine && <span style={{ fontSize: '11px', color: '#ADB5BD', marginBottom: '2px' }}>{timeString}</span>}
                    
                    <div style={{ 
                      background: isMine ? '#2C2A29' : '#fff', 
                      color: isMine ? '#fff' : '#212529', 
                      padding: '12px 16px', 
                      borderRadius: isMine ? '16px 2px 16px 16px' : '2px 16px 16px 16px', 
                      maxWidth: '75%',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                      fontSize: '14px',
                      lineHeight: '1.4'
                    }}>
                      {msg.text}
                    </div>

                    {!isMine && <span style={{ fontSize: '11px', color: '#ADB5BD', marginBottom: '2px' }}>{timeString}</span>}
                  </div>
                );
              })}
              {/* 🚨 자동 스크롤의 목적지 */}
              <div ref={messagesEndRef} />
            </div>

            {/* 입력창 */}
            <div style={{ borderTop: '1px solid #eee', padding: '16px 20px', display: 'flex', gap: '12px', backgroundColor: '#fff' }}>
              <input
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="메시지 입력..."
                style={{ flex: 1, border: 'none', backgroundColor: '#F8F9FA', borderRadius: '24px', padding: '14px 18px', outline: 'none', fontSize: '14px' }}
              />
              <button
                onClick={handleSendMessage}
                disabled={!messageInput.trim()}
                style={{ 
                  border: 'none', background: messageInput.trim() ? '#52B788' : '#E9ECEF', 
                  color: messageInput.trim() ? '#fff' : '#ADB5BD', 
                  borderRadius: '50%', width: '46px', height: '46px', 
                  cursor: messageInput.trim() ? 'pointer' : 'default',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '18px', transition: 'all 0.2s'
                }}
              >
                <i className="fas fa-paper-plane"></i>
              </button>
            </div>
          </>
        )}
      </div>

      <style>{`
        .photo-slider::-webkit-scrollbar { display: none; }
      `}</style>
    </section>
  );
};

export default ChatTab;