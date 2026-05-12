import React, { useState, useRef, useEffect } from 'react';
import { CHAT_ROOMS } from '../data';
import { auth } from '../firebase'; // 🔥 파이어베이스 인증 추가

const ChatTab = () => {
  const [selectedRoom, setSelectedRoom] = useState(null);
  // 1. 메시지 입력 상태 추가
  const [messageText, setMessageText] = useState(''); 
  // 2. 자동 스크롤을 위한 Ref
  const messagesEndRef = useRef(null); 

  // 채팅방에 들어오면 무조건 맨 아래(최신 메시지)로 자동 스크롤
  useEffect(() => {
    if (selectedRoom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [selectedRoom]);

  const handleSendMessage = () => {
    if (!messageText.trim()) return;
    
    // TODO: 다음 팀원이 여기에 Firestore (addDoc) 메시지 전송 로직을 작성하면 됩니다!
    console.log("전송할 메시지:", messageText);
    
    // 전송 후 입력창 비우기
    setMessageText('');
  };

  // --- 💬 채팅방 상세 화면 렌더링 ---
  if (selectedRoom) {
    const room = CHAT_ROOMS.find(r => r.id === selectedRoom);
    
    // 방어적 코드: 만약 방을 못 찾으면 튕겨내기
    if (!room) {
      setSelectedRoom(null);
      return null;
    }

    // 실제 로그인된 유저 ID 가져오기 (없으면 'u1'을 임시로 사용)
    const myUid = auth.currentUser?.uid || 'u1';

    return (
      <div className="chat-room-page" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div className="chat-room-header" style={{ padding: '16px', display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
          <button id="back-to-chat-list" onClick={() => setSelectedRoom(null)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', marginRight: '16px' }}>
            <i className="fas fa-arrow-left"></i>
          </button>
          <div className="chat-room-info" style={{ display: 'flex', flexDirection: 'column' }}>
            <strong id="chat-room-name">{room.name}</strong>
            <span id="chat-room-members" style={{ fontSize: '12px', color: '#666' }}>참여자 {room.members}명</span>
          </div>
        </div>
        
        {/* 남은 공간을 꽉 채우고 스크롤되도록 flex: 1 적용 */}
        <div className="chat-messages" style={{ flex: 1, overflowY: 'auto', padding: '16px', backgroundColor: '#f8f9fa' }}>
          {room.messages?.map(msg => (
            // 3. 내 UID와 일치하면 'me' 클래스, 아니면 'other' 클래스 부여
            <div key={msg.id} className={`chat-msg ${msg.userId === myUid ? 'me' : 'other'}`}>
              <div className="chat-bubble">{msg.text}</div>
              <div className="chat-msg-time">{msg.time}</div>
            </div>
          ))}
          {/* 스크롤의 목적지가 될 투명한 빈 태그 */}
          <div ref={messagesEndRef} />
        </div>

        <div className="chat-input-row" style={{ padding: '12px', display: 'flex', gap: '8px', borderTop: '1px solid var(--border)', background: '#fff' }}>
          <input 
            type="text" 
            placeholder="메시지 입력..." 
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
            style={{ flex: 1, padding: '10px', borderRadius: '20px', border: '1px solid #ddd', outline: 'none' }}
          />
          <button 
            id="chat-send-btn" 
            onClick={handleSendMessage}
            disabled={!messageText.trim()}
            style={{ 
              width: '40px', height: '40px', borderRadius: '50%', border: 'none', 
              background: messageText.trim() ? '#2C2A29' : '#ccc', color: '#fff', cursor: 'pointer' 
            }}
          >
            <i className="fas fa-paper-plane"></i>
          </button>
        </div>
      </div>
    );
  }

  // --- 📋 채팅 목록 화면 렌더링 ---
  return (
    <section className="tab-page active" style={{ overflowY: 'auto', height: '100%' }}>
      <div className="chat-list-page" style={{ padding: '16px' }}>
        <h2 className="chat-page-title" style={{ marginBottom: '20px' }}>채팅</h2>
        <div id="chat-rooms-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {CHAT_ROOMS.map(room => (
            <div 
              key={room.id} 
              className="chat-room-item" 
              onClick={() => setSelectedRoom(room.id)}
              style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: '#fff', borderRadius: '12px', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}
            >
              <img className="chat-room-avatar" src={room.avatar} alt={room.name} style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover' }} />
              <div className="chat-room-body" style={{ flex: 1, overflow: 'hidden' }}>
                <div className="chat-room-name-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <strong style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{room.name}</strong>
                  <span className="chat-room-time" style={{ fontSize: '11px', color: '#999' }}>{room.lastTime}</span>
                </div>
                <div className="chat-room-preview" style={{ fontSize: '13px', color: '#666', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{room.lastMsg}</div>
              </div>
              {room.unread > 0 && (
                <div className="chat-unread" style={{ background: '#e63946', color: '#fff', fontSize: '11px', fontWeight: 'bold', padding: '2px 6px', borderRadius: '10px' }}>
                  {room.unread}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ChatTab;