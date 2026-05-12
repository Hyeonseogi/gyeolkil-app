import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { auth, db } from './firebase'; 
import PostDetailModal from './components/PostDetailModal'; 
import HomeTab from './pages/HomeTab';
import RecordTab from './pages/RecordTab';
import DiscoverTab from './pages/DiscoverTab';
import FootprintTab from './pages/FootprintTab';
import ChatTab from './pages/ChatTab';
import LoginScreen from './components/LoginScreen';

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  
  const [myPostCount, setMyPostCount] = useState(0);

  const [activeTab, setActiveTab] = useState('home');
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [selectedPostId, setSelectedPostId] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setIsAuthChecking(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!currentUser) {
      setMyPostCount(0);
      return;
    }

    const q = query(collection(db, 'posts'), where('userId', '==', currentUser.uid));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setMyPostCount(snapshot.size); 
    });

    return () => unsubscribe();
  }, [currentUser]);

  // 1. 사이드 패널이 열렸을 때 배경화면 스크롤 방지 로직 추가
  useEffect(() => {
    if (isNotifOpen || isProfileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
    return () => { document.body.style.overflow = 'auto'; };
  }, [isNotifOpen, isProfileOpen]);

  const [following, setFollowing] = useState(() => {
    return JSON.parse(localStorage.getItem('gyeolkil_following') || '["u2", "u3", "u4"]'); 
  });

  const [notifications, setNotifications] = useState(() => {
    return JSON.parse(localStorage.getItem('gyeolkil_notifs') || '[]');
  });

  const closeAllPanels = () => { setIsNotifOpen(false); setIsProfileOpen(false); };
  const unreadNotifsCount = notifications.filter(n => n.unread).length;

  const handleLogout = async () => {
    try {
      await signOut(auth);
      closeAllPanels();
    } catch (error) {
      console.error("로그아웃 실패:", error);
    }
  };

  if (isAuthChecking) {
    return (
      <div id="splash-screen">
        <div className="splash-content">
          <div className="loading-spinner" style={{ color: '#fff' }}>연결 중...</div>
        </div>
      </div>
    );
  }

  if (!currentUser) return <LoginScreen />;

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
            <img src={currentUser.photoURL || "https://api.dicebear.com/7.x/adventurer/svg?seed=fallback"} className="top-avatar" alt="프로필" />
          </button>
        </div>
      </header>

      {/* 알림 패널 */}
      <div className={`side-panel ${isNotifOpen ? 'open' : ''}`}>
        <div className="panel-header">
          <h3>알림</h3><button className="close-panel-btn" onClick={closeAllPanels}><i className="fas fa-times"></i></button>
        </div>
        <ul className="notif-list">
          <p style={{ textAlign: 'center', padding: '20px', color: '#ADB5BD' }}>새로운 알림이 없습니다.</p>
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
            
            <div style={{ display: 'flex', justifyContent: 'center', gap: '35px' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#212529' }}>{myPostCount}</div>
                <div style={{ fontSize: '0.8rem', color: '#868e96' }}>게시물</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#212529' }}>0</div>
                <div style={{ fontSize: '0.8rem', color: '#868e96' }}>팔로워</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#212529' }}>0</div>
                <div style={{ fontSize: '0.8rem', color: '#868e96' }}>팔로잉</div>
              </div>
            </div>
          </div>

          <ul style={{ listStyle: 'none', padding: '0', margin: '0' }}>
            <li style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid #f1f3f5', cursor: 'pointer' }}>
              <i className="fas fa-bookmark" style={{ color: '#52B788', width: '20px', textAlign: 'center' }}></i>
              <span style={{ fontSize: '1rem', color: '#495057' }}>저장한 여행기</span>
            </li>
            
            {/* 2. 클릭 시 패널을 닫고 '발자취' 탭으로 자동 이동하도록 연결! */}
            <li 
              style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid #f1f3f5', cursor: 'pointer' }}
              onClick={() => {
                setActiveTab('footprint');
                closeAllPanels();
              }}
            >
              <i className="fas fa-map-pin" style={{ color: '#52B788', width: '20px', textAlign: 'center' }}></i>
              <span style={{ fontSize: '1rem', color: '#495057' }}>내 여행 통계</span>
            </li>

            <li style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid #f1f3f5', cursor: 'pointer' }}>
              <i className="fas fa-cog" style={{ color: '#adb5bd', width: '20px', textAlign: 'center' }}></i>
              <span style={{ fontSize: '1rem', color: '#495057' }}>앱 설정</span>
            </li>
            <li style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }} onClick={handleLogout}>
              <i className="fas fa-sign-out-alt" style={{ color: '#e03131', width: '20px', textAlign: 'center' }}></i>
              <span style={{ fontSize: '1rem', color: '#e03131' }}>로그아웃</span>
            </li>
          </ul>
        </div>
      </div>

      {(isNotifOpen || isProfileOpen) && <div id="panel-overlay" className="active" onClick={closeAllPanels}></div>}

      <main className="tab-contents">
        {activeTab === 'home' && <HomeTab following={following} onOpenModal={(id) => setSelectedPostId(id)} />}
        
        {/* TODO: DiscoverTab 내부에서 파이어베이스의 posts를 직접 불러오도록 수정하거나, 
            App.jsx에서 posts 상태를 만들어 Home과 Discover에 모두 넘겨주는 방식(State Lifting)을 권장합니다. */}
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

      <PostDetailModal postId={selectedPostId} onClose={() => setSelectedPostId(null)} />
    </div>
  );
}

export default App;