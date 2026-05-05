import React, { useState, useEffect } from 'react';
// 🆕 파이어베이스 로그인/로그아웃 기능 불러오기
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './firebase'; 
import PostDetailModal from './components/PostDetailModal'; 
import HomeTab from './pages/HomeTab';
import RecordTab from './pages/RecordTab';
import DiscoverTab from './pages/DiscoverTab';
import FootprintTab from './pages/FootprintTab';
import ChatTab from './pages/ChatTab';
import LoginScreen from './components/LoginScreen';

function App() {
  // 진짜 구글 유저 정보를 담는 상태
  const [currentUser, setCurrentUser] = useState(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  
  const [activeTab, setActiveTab] = useState('home');
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [selectedPostId, setSelectedPostId] = useState(null);

  // 파이어베이스 로그인 감지기 (앱 켜질 때 실행)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setIsAuthChecking(false);
    });
    return () => unsubscribe();
  }, []);

  const [following, setFollowing] = useState(() => {
    return JSON.parse(localStorage.getItem('gyeolkil_following') || '["u2", "u3", "u4"]'); 
  });

  const [notifications, setNotifications] = useState(() => {
    return JSON.parse(localStorage.getItem('gyeolkil_notifs') || '[]');
  });

  const addNotification = (text, avatar) => {
    const newNotif = { id: Date.now(), text, avatar, time: '방금 전', unread: true };
    const updated = [newNotif, ...notifications];
    setNotifications(updated);
    localStorage.setItem('gyeolkil_notifs', JSON.stringify(updated));
  };

  const handleToggleLike = (postId) => {
    console.log(`${postId} 좋아요 클릭 (추후 Firebase Update 연동)`);
  };

  const closeAllPanels = () => { setIsNotifOpen(false); setIsProfileOpen(false); };
  const unreadNotifsCount = notifications.filter(n => n.unread).length;

  // 🆕 파이어베이스 진짜 로그아웃 함수
  const handleLogout = async () => {
    try {
      await signOut(auth); // 파이어베이스 서버에 로그아웃 요청
      closeAllPanels();    // 열려있는 패널 닫기
    } catch (error) {
      console.error("로그아웃 실패:", error);
    }
  };

  // 1. 로그인 확인 중 로딩 화면
  if (isAuthChecking) {
    return (
      <div id="splash-screen">
        <div className="splash-content">
          <div className="loading-spinner" style={{ color: '#fff' }}>연결 중...</div>
        </div>
      </div>
    );
  }

  // 2. 로그인 안 되어 있으면 무조건 로그인 스크린 띄우기
  if (!currentUser) {
    return <LoginScreen />;
  }

  // 3. 메인 앱 화면
  return (
    <div id="app">
      <header className="top-bar">
        <div className="top-bar-left"><span className="app-logo-small">🗺️ 곁길</span></div>
        <div className="top-bar-right">
          <button className="icon-btn" onClick={() => setIsNotifOpen(true)}>
            <i className="fas fa-bell"></i>
            {unreadNotifsCount > 0 && <span className="badge">{unreadNotifsCount}</span>}
          </button>
          <button className="icon-btn" onClick={() => setIsProfileOpen(true)}>
            {/* 🟢 우측 상단 뱃지에 내 구글 프사 띄우기 */}
            <img src={currentUser.photoURL || "https://api.dicebear.com/7.x/adventurer/svg?seed=fallback"} className="top-avatar" alt="프로필" />
          </button>
        </div>
      </header>

      {/* 실시간 알림 패널 */}
      <div className={`side-panel ${isNotifOpen ? 'open' : ''}`}>
        <div className="panel-header">
          <h3>알림</h3><button className="close-panel-btn" onClick={() => { closeAllPanels(); setNotifications(notifications.map(n => ({...n, unread: false}))); }}><i className="fas fa-times"></i></button>
        </div>
        <ul className="notif-list">
          {notifications.length === 0 ? (
            <p style={{ textAlign: 'center', padding: '20px', color: '#ADB5BD' }}>새로운 알림이 없습니다.</p>
          ) : (
            notifications.map(n => (
              <li key={n.id} className={`notif-item ${n.unread ? 'unread' : ''}`}>
                <img src={n.avatar} className="notif-avatar" alt=""/>
                <div className="notif-text">
                  {n.text}
                  <span className="notif-time">{n.time}</span>
                </div>
              </li>
            ))
          )}
        </ul>
      </div>

      {/* 마이페이지 패널 */}
      <div className={`side-panel ${isProfileOpen ? 'open' : ''}`}>
        <div className="panel-header">
          <h3>마이페이지</h3>
          <button className="close-panel-btn" onClick={closeAllPanels}>
            <i className="fas fa-times"></i>
          </button>
        </div>
        
        <div className="profile-content">
          <div style={{ padding: '30px 20px', textAlign: 'center', borderBottom: '1px solid #f1f3f5' }}>
            {/* 🟢 마이페이지에 내 구글 프사, 이름, 이메일 띄우기 */}
            <img 
              src={currentUser.photoURL || "https://api.dicebear.com/7.x/adventurer/svg?seed=fallback"} 
              alt="프로필" 
              style={{ width: '80px', height: '80px', borderRadius: '50%', backgroundColor: '#edf7ee', marginBottom: '12px' }} 
            />
            <h2 style={{ fontSize: '1.25rem', margin: '0 0 4px 0', color: '#212529' }}>{currentUser.displayName || '여행자'}</h2>
            <p style={{ fontSize: '0.85rem', color: '#868e96', margin: '0 0 16px 0' }}>{currentUser.email}</p>
            
            <button style={{
              padding: '6px 20px', borderRadius: '20px', border: '1px solid #dee2e6',
              backgroundColor: '#fff', color: '#495057', fontSize: '0.85rem',
              fontWeight: '600', marginBottom: '24px', cursor: 'pointer',
              transition: 'background-color 0.2s'
            }}>
              프로필 편집
            </button>
            
            {/* 통계 정보 */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '35px' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#212529' }}>0</div>
                <div style={{ fontSize: '0.8rem', color: '#868e96' }}>게시물</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#212529' }}>84</div>
                <div style={{ fontSize: '0.8rem', color: '#868e96' }}>팔로워</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#212529' }}>31</div>
                <div style={{ fontSize: '0.8rem', color: '#868e96' }}>팔로잉</div>
              </div>
            </div>
          </div>

          <ul style={{ listStyle: 'none', padding: '0', margin: '0' }}>
            <li style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid #f1f3f5', cursor: 'pointer' }}>
              <i className="fas fa-bookmark" style={{ color: '#52B788', width: '20px', textAlign: 'center' }}></i>
              <span style={{ fontSize: '1rem', color: '#495057' }}>저장한 여행기 (0)</span>
            </li>
            <li style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid #f1f3f5', cursor: 'pointer' }}>
              <i className="fas fa-map-pin" style={{ color: '#52B788', width: '20px', textAlign: 'center' }}></i>
              <span style={{ fontSize: '1rem', color: '#495057' }}>내 여행 통계</span>
            </li>
            <li style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid #f1f3f5', cursor: 'pointer' }}>
              <i className="fas fa-cog" style={{ color: '#adb5bd', width: '20px', textAlign: 'center' }}></i>
              <span style={{ fontSize: '1rem', color: '#495057' }}>앱 설정</span>
            </li>
            {/* 🟢 로그아웃 버튼에 진짜 로그아웃 함수 연결 */}
            <li 
              style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}
              onClick={handleLogout}
            >
              <i className="fas fa-sign-out-alt" style={{ color: '#e03131', width: '20px', textAlign: 'center' }}></i>
              <span style={{ fontSize: '1rem', color: '#e03131' }}>로그아웃</span>
            </li>
          </ul>
        </div>
      </div>

      {(isNotifOpen || isProfileOpen) && <div id="panel-overlay" className="active" onClick={closeAllPanels}></div>}

      <main className="tab-contents">
        {activeTab === 'home' && (
          <HomeTab 
            following={following} 
            onToggleLike={handleToggleLike} 
            onOpenModal={(id) => setSelectedPostId(id)} 
          />
        )}
        {activeTab === 'discover' && <DiscoverTab posts={[]} />}
        {activeTab === 'record' && <RecordTab onPublish={() => setActiveTab('home')} />}
        {activeTab === 'footprint' && <FootprintTab />}
        {activeTab === 'chat' && <ChatTab />}
      </main>

      <nav className="bottom-nav">
        <button className={`nav-btn ${activeTab === 'home' ? 'active' : ''}`} onClick={() => setActiveTab('home')}><i className="fas fa-home"></i><span>홈</span></button>
        <button className={`nav-btn ${activeTab === 'discover' ? 'active' : ''}`} onClick={() => setActiveTab('discover')}><i className="fas fa-compass"></i><span>발견</span></button>
        <button className={`nav-btn record-nav-btn ${activeTab === 'record' ? 'active' : ''}`} onClick={() => setActiveTab('record')}><div className="record-btn-inner"><i className="fas fa-camera"></i></div></button>
        <button className={`nav-btn ${activeTab === 'footprint' ? 'active' : ''}`} onClick={() => setActiveTab('footprint')}><i className="fas fa-map-marked-alt"></i><span>발자취</span></button>
        <button className={`nav-btn ${activeTab === 'chat' ? 'active' : ''}`} onClick={() => setActiveTab('chat')}><i className="fas fa-comment-dots"></i><span>채팅</span><span className="badge">2</span></button>
      </nav>

      <PostDetailModal 
        postId={selectedPostId} 
        onClose={() => setSelectedPostId(null)} 
      />
    </div>
  );
}

export default App;