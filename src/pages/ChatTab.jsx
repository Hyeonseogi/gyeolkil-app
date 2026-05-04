import React, { useState } from 'react';
import { CHAT_ROOMS } from '../data';

const ChatTab = () => {
  const [selectedRoom, setSelectedRoom] = useState(null);

  if (selectedRoom) {
    const room = CHAT_ROOMS.find(r => r.id === selectedRoom);
    return (
      <div className="chat-room-page">
        <div className="chat-room-header">
          <button id="back-to-chat-list" onClick={() => setSelectedRoom(null)}><i className="fas fa-arrow-left"></i></button>
          <div className="chat-room-info">
            <span id="chat-room-name">{room.name}</span>
            <span id="chat-room-members">참여자 {room.members}명</span>
          </div>
        </div>
        <div className="chat-messages">
          {room.messages.map(msg => (
            <div key={msg.id} className={`chat-msg ${msg.userId === 'u1' ? 'me' : 'other'}`}>
              <div className="chat-bubble">{msg.text}</div>
              <div className="chat-msg-time">{msg.time}</div>
            </div>
          ))}
        </div>
        <div className="chat-input-row">
          <input type="text" placeholder="메시지 입력..." />
          <button id="chat-send-btn"><i className="fas fa-paper-plane"></i></button>
        </div>
      </div>
    );
  }

  return (
    <section className="tab-page active" style={{ overflowY: 'auto' }}>
      <div className="chat-list-page">
        <h2 className="chat-page-title">채팅</h2>
        <div id="chat-rooms-list">
          {CHAT_ROOMS.map(room => (
            <div key={room.id} className="chat-room-item" onClick={() => setSelectedRoom(room.id)}>
              <img className="chat-room-avatar" src={room.avatar} alt={room.name} />
              <div className="chat-room-body">
                <div className="chat-room-name-row">
                  <strong>{room.name}</strong>
                  <span className="chat-room-time">{room.lastTime}</span>
                </div>
                <div className="chat-room-preview">{room.lastMsg}</div>
              </div>
              {room.unread > 0 && <div className="chat-unread">{room.unread}</div>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ChatTab;