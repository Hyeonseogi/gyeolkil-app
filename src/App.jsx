import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc } from 'firebase/firestore'; // 🚨 onSnapshot, updateDoc 추가
import { auth, db } from './firebase'; 

import LoginScreen from './components/LoginScreen';
import PostDetailModal from './components/PostDetailModal'; 

import HomeTab from './pages/HomeTab';
import DiscoverTab from './pages/DiscoverTab';
import RecordTab from './pages/RecordTab';
import ChatTab from './pages/ChatTab';
import MyPage from './pages/MyPage';
import UserProfilePage from './pages/UserProfilePage';
import SettingsPage from './pages/SettingsPage';
import FootprintTab from './pages/FootprintTab'; 

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [activeTab, setActiveTab] = useState('home');
  const [selectedPostId, setSelectedPostId] = useState(null);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [myPostCount, setMyPostCount] = useState(0);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [following, setFollowing] = useState([]);
  
  // 🚨 [NEW] 알림 데이터 상태 관리
  const [notifications, setNotifications] = useState([]);
  const unreadCount = notifications.filter(n => !n.read).length; // 안 읽은 알림 개수

  // 로그인 상태 확인
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setIsAuthChecking(false);
    });
    return () => unsubscribe();
  }, []);

  // 🚨 [NEW] 실시간 알림 로드 로직
  useEffect(() => {
    if (!currentUser) return;
    const q = query(collection(db, 'notifications'), where('receiverId', '==', currentUser.uid), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notifs = [];
      snapshot.forEach(docSnap => notifs.push({ id: docSnap.id, ...docSnap.data() }));
      setNotifications(notifs);
    });
    return () => unsubscribe();
  }, [currentUser]);

  // 내 게시글 수 카운트
  useEffect(() => {
    if (!currentUser) { setMyPostCount(0); return; }
    const q = query(collection(db, 'posts'), where('userId', '==', currentUser.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => { setMyPostCount(snapshot.size); });
    return () => unsubscribe();
  }, [currentUser]);

  // 알림 패널 열릴 때 스크롤 방지 및 읽음 처리
  useEffect(() => {
    document.body.style.overflow = isNotifOpen ? 'hidden' : 'auto';
    
    // 🚨 패널이 열리면 모든 안 읽은 알림을 '읽음(read: true)'으로 업데이트!
    if (isNotifOpen && unreadCount > 0) {
      notifications.forEach(async (notif) => {
        if (!notif.read) {
          try { await updateDoc(doc(db, 'notifications', notif.id), { read: true }); } 
          catch (e) { console.error('알림 읽음 처리 실패:', e); }
        }
      });
    }
    
    return () => { document.body.style.overflow = 'auto'; };
  }, [isNotifOpen, unreadCount, notifications]);

  const closeAllPanels = () => { setIsNotifOpen(false); };

  // 🚨 [NEW] 알림 클릭 시 해당 게시물 또는 채팅방으로 이동
  const handleNotifClick = (notif) => {
    closeAllPanels();
    if (notif.postId) setSelectedPostId(notif.postId); // 게시물로 팝업
    else if (notif.type === 'chat') setActiveTab('chat'); // 채팅 탭으로 점프
  };

  if (isAuthChecking) {
    return (
      <div id="splash-screen">
        <div className="splash-content">
          <div className="loading-spinner" style={{ color: '#fff' }}>연결 중... 🧭</div>
        </div>
      </div>
    );
  }

  if (!currentUser) return <LoginScreen />;

  return (
    <div id="app">

      {/* 상단 앱바 */}
      <header className="top-bar">
        <div className="top-bar-left">
          <span className="app-logo-small" onClick={() => setActiveTab('home')} style={{cursor: 'pointer'}}>🗺️ 곁길</span>
        </div>
        <div className="top-bar-right" style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          
          {/* 🚨 [NEW] 알림 버튼 & 안 읽은 배지(Badge) UI */}
          <button className="icon-btn" onClick={() => setIsNotifOpen(true)} style={{ position: 'relative' }}>
            <i className="fas fa-bell"></i>
            {unreadCount > 0 && (
              <span style={{ position: 'absolute', top: '4px', right: '4px', background: '#e63946', color: '#fff', fontSize: '9px', fontWeight: 'bold', width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', border: '2px solid #fff' }}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
          
          <button className="icon-btn" onClick={() => setActiveTab('settings')}><i className="fas fa-gear"></i></button>
        </div>
      </header>

      {/* 🚨 [NEW] 실제 데이터가 렌더링되는 알림 사이드 패널 */}
      <div className={`side-panel ${isNotifOpen ? 'open' : ''}`} style={{ zIndex: 1100 }}>
        <div className="panel-header" style={{ padding: '20px', borderBottom: '1px solid #f1f1f1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800' }}>알림</h3>
          <button onClick={closeAllPanels} style={{ background: 'none', border: 'none', fontSize: '20px', color: '#ADB5BD', cursor: 'pointer' }}><i className="fas fa-times"></i></button>
        </div>
        
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, overflowY: 'auto', height: 'calc(100% - 65px)' }}>
          {notifications.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#ADB5BD', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <i className="far fa-bell-slash" style={{ fontSize: '32px' }}></i>
              <p style={{ margin: 0, fontSize: '14px' }}>새로운 알림이 없습니다.</p>
            </div>
          ) : (
            notifications.map(notif => (
              <li 
                key={notif.id} 
                onClick={() => handleNotifClick(notif)}
                style={{ 
                  padding: '16px 20px', borderBottom: '1px solid #f8f9fa', display: 'flex', gap: '12px', alignItems: 'flex-start', cursor: 'pointer',
                  backgroundColor: notif.read ? '#fff' : '#f1f9f5', transition: 'background-color 0.2s'
                }}
              >
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: notif.type === 'like' ? '#ffe3e3' : '#e3f2fd', display: 'flex', justifyContent: 'center', alignItems: 'center', flexShrink: 0, fontSize: '16px', color: notif.type === 'like' ? '#e63946' : '#1e88e5' }}>
                  <i className={notif.type === 'like' ? 'fas fa-heart' : notif.type === 'comment' ? 'fas fa-comment' : 'fas fa-user-plus'}></i>
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: '0 0 4px', fontSize: '14px', color: '#1A1A1A', lineHeight: '1.4' }}>
                    <strong>{notif.senderName}</strong>님이 {notif.message}
                  </p>
                  <span style={{ fontSize: '11px', color: '#ADB5BD', fontWeight: 'bold' }}>
                    {new Date(notif.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </li>
            ))
          )}
        </ul>
      </div>
      {isNotifOpen && <div id="panel-overlay" className="active" onClick={closeAllPanels} style={{ zIndex: 1050 }}></div>}

      {/* 메인 라우터 렌더링 영역 */}
      <main className="tab-contents">
        {activeTab === 'home' && (
          <HomeTab 
            following={following} 
            onOpenModal={(id) => setSelectedPostId(id)} 
            onOpenUser={(id) => { setSelectedUserId(id); setActiveTab('userProfile'); }}
            onNavigate={(tabName) => setActiveTab(tabName)}
          />
        )}
        {activeTab === 'discover' && (
          <DiscoverTab 
            onOpenModal={(id) => setSelectedPostId(id)} 
            onOpenUser={(id) => { setSelectedUserId(id); setActiveTab('userProfile'); }} 
          />
        )}
        {activeTab === 'record' && <RecordTab onPublish={() => setActiveTab('home')} />}
        {activeTab === 'chat' && <ChatTab />}
        
        {activeTab === 'mypage' && (
          <MyPage 
            onOpenModal={(id) => setSelectedPostId(id)} 
            onNavigate={(tabName) => setActiveTab(tabName)} 
          />
        )}
        
        {activeTab === 'userProfile' && (
          <UserProfilePage key={selectedUserId} userId={selectedUserId} onOpenModal={(id) => setSelectedPostId(id)} onClose={() => setActiveTab('home')} />
        )}
        {activeTab === 'settings' && <SettingsPage onClose={() => setActiveTab('mypage')} />}
        {activeTab === 'footprint' && <FootprintTab onClose={() => setActiveTab('mypage')} />}
      </main>

      {/* 하단 네비게이션 바 */}
      <nav className="bottom-nav">
        <button className={`nav-btn ${activeTab === 'home' ? 'active' : ''}`} onClick={() => setActiveTab('home')}>
          <i className="fas fa-home"></i><span>홈</span>
        </button>
        <button className={`nav-btn ${activeTab === 'discover' ? 'active' : ''}`} onClick={() => setActiveTab('discover')}>
          <i className="fas fa-compass"></i><span>발견</span>
        </button>
        <button className={`nav-btn record-nav-btn ${activeTab === 'record' ? 'active' : ''}`} onClick={() => setActiveTab('record')}>
          <div className="record-btn-inner"><i className="fas fa-camera"></i></div>
        </button>
        <button className={`nav-btn ${activeTab === 'chat' ? 'active' : ''}`} onClick={() => setActiveTab('chat')}>
          <i className="fas fa-comment-dots"></i><span>채팅</span>
        </button>
        <button className={`nav-btn ${activeTab === 'mypage' || activeTab === 'footprint' ? 'active' : ''}`} onClick={() => setActiveTab('mypage')}>
          <img 
            src={currentUser.photoURL || 'https://api.dicebear.com/7.x/adventurer/svg?seed=fallback'} 
            alt="프로필" 
            style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover', border: (activeTab === 'mypage' || activeTab === 'footprint') ? '2px solid #52B788' : '2px solid transparent' }} 
          />
        </button>
      </nav>

      {/* 게시글 모달 */}
      <PostDetailModal 
        postId={selectedPostId} 
        onClose={() => setSelectedPostId(null)} 
        onOpenUser={(id) => { setSelectedPostId(null); setSelectedUserId(id); setActiveTab('userProfile'); }} 
      />
    </div>
  );
}

export default App;