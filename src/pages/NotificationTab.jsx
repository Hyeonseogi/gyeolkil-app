import React, { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebase';

const NotificationTab = () => {
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    // 현재 사용자가 받은 알림을 시간순으로 불러오기
    const q = query(
      collection(db, "notifications"),
      where("receiverId", "==", user.uid),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setNotifications(data);
    });

    return () => unsubscribe();
  }, []);

  return (
    <section className="tab-page active">
      <div className="notification-page">
        <h2 className="section-title">🔔 알림</h2>
        {notifications.length === 0 ? (
          <div className="empty-state">아직 도착한 알림이 없어요.</div>
        ) : (
          <div className="notification-list">
            {notifications.map(notif => (
              <div key={notif.id} className={`notif-item ${!notif.read ? 'unread' : ''}`}>
                <div className="notif-icon">
                  {notif.type === 'like' ? '❤️' : '💬'}
                </div>
                <div className="notif-content">
                  <p><strong>{notif.senderName}</strong>님이 {notif.type === 'like' ? '내 게시물을 좋아합니다.' : `댓글을 남겼습니다: "${notif.message}"`}</p>
                  <span className="notif-time">{new Date(notif.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default NotificationTab;