import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
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
import FootprintTab from './pages/FootprintTab'; // 🚨 다시 부활시킨 발자취 탭!

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [activeTab, setActiveTab] = useState('home');
  const [selectedPostId, setSelectedPostId] = useState(null);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [myPostCount, setMyPostCount] = useState(0);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [following, setFollowing] = useState([]);

  // 로그인 상태 확인
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setIsAuthChecking(false);
    });
    return () => unsubscribe();
  }, []);

  // 내 게시글 수 카운트
  useEffect(() => {
    if (!currentUser) { setMyPostCount(0); return; }
    const q = query(collection(db, 'posts'), where('userId', '==', currentUser.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => { setMyPostCount(snapshot.size); });
    return () => unsubscribe();
  }, [currentUser]);

  // 알림 패널 열릴 때 스크롤 방지
  useEffect(() => {
    document.body.style.overflow = isNotifOpen ? 'hidden' : 'auto';
    return () => { document.body.style.overflow = 'auto'; };
  }, [isNotifOpen]);

  const closeAllPanels = () => { setIsNotifOpen(false); };

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
        <div className="top-bar-right">
          <button className="icon-btn" onClick={() => setIsNotifOpen(true)}><i className="fas fa-bell"></i></button>
          {/* 설정 버튼 */}
          <button className="icon-btn" onClick={() => setActiveTab('settings')}><i className="fas fa-gear"></i></button>
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
      {isNotifOpen && <div id="panel-overlay" className="active" onClick={closeAllPanels}></div>}

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
        
        {/* 🚨 [NEW] MyPage에 activeTab을 변경할 수 있는 권한(setActiveTab)을 props로 넘겨줍니다. */}
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
        
        {/* 🚨 [부활] 드디어 렌더링되는 현석 님의 발자취 탭! */}
        {activeTab === 'footprint' && <FootprintTab onClose={() => setActiveTab('mypage')} />}
      </main>

      {/* 🚨 [동주 님 UI 반영] 인스타 스타일 하단바 */}
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
        
        {/* 우측 하단 아바타(마이페이지) 버튼 */}
        <button className={`nav-btn ${activeTab === 'mypage' || activeTab === 'footprint' ? 'active' : ''}`} onClick={() => setActiveTab('mypage')}>
          <img 
            src={currentUser.photoURL || 'https://api.dicebear.com/7.x/adventurer/svg?seed=fallback'} 
            alt="프로필" 
            style={{ 
              width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover', 
              border: (activeTab === 'mypage' || activeTab === 'footprint') ? '2px solid #52B788' : '2px solid transparent' 
            }} 
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