import React, { useState } from 'react';
import HomeTab from './pages/HomeTab';
import RecordTab from './pages/RecordTab';
import DiscoverTab from './pages/DiscoverTab';
import FootprintTab from './pages/FootprintTab';
import ChatTab from './pages/ChatTab';
import LoginScreen from './components/LoginScreen';
import PostModal from './components/PostModal';
import { POSTS_INITIAL } from './data';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [activeTab, setActiveTab] = useState('home');
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [selectedPostId, setSelectedPostId] = useState(null);

  // 1. 전역 상태 관리 (게시물, 팔로우, 알림)
  const [posts, setPosts] = useState(() => {
    const saved = localStorage.getItem('gyeolkil_posts');
    return saved ? JSON.parse(saved) : POSTS_INITIAL;
  });
  
  const [following, setFollowing] = useState(() => {
    return JSON.parse(localStorage.getItem('gyeolkil_following') || '["u2", "u3", "u4"]'); // 기본 팔로잉 샘플
  });

  const [notifications, setNotifications] = useState(() => {
    return JSON.parse(localStorage.getItem('gyeolkil_notifs') || '[]');
  });

  // 2. 액션 헬퍼 함수
  const addNotification = (text, avatar) => {
    const newNotif = { id: Date.now(), text, avatar, time: '방금 전', unread: true };
    const updated = [newNotif, ...notifications];
    setNotifications(updated);
    localStorage.setItem('gyeolkil_notifs', JSON.stringify(updated));
  };

  const handleAddPost = (newPost) => {
    const updated = [newPost, ...posts];
    setPosts(updated);
    localStorage.setItem('gyeolkil_posts', JSON.stringify(updated));
    setActiveTab('home');
  };

  const handleToggleLike = (postId) => {
    const updated = posts.map(p => {
      if (p.id === postId) {
        const isLiked = !p.liked;
        if (isLiked && p.userId !== 'u1') addNotification('누군가 회원님의 게시물을 좋아합니다.', 'https://api.dicebear.com/7.x/adventurer/svg?seed=like');
        return { ...p, liked: isLiked, likes: p.likes + (isLiked ? 1 : -1) };
      }
      return p;
    });
    setPosts(updated);
    localStorage.setItem('gyeolkil_posts', JSON.stringify(updated));
  };

  const handleToggleFollow = (userId) => {
    const isFollowing = following.includes(userId);
    const updated = isFollowing ? following.filter(id => id !== userId) : [...following, userId];
    setFollowing(updated);
    localStorage.setItem('gyeolkil_following', JSON.stringify(updated));
    if (!isFollowing) addNotification('새로운 사용자가 당신을 팔로우합니다.', `https://api.dicebear.com/7.x/adventurer/svg?seed=${userId}`);
  };

  const handleAddComment = (postId, text) => {
    const updated = posts.map(p => {
      if (p.id === postId) {
        if (p.userId !== 'u1') addNotification('회원님의 게시물에 새로운 댓글이 달렸어요.', 'https://api.dicebear.com/7.x/adventurer/svg?seed=user1');
        return {
          ...p,
          comments: p.comments + 1,
          commentList: [...p.commentList, { id: 'c' + Date.now(), userId: 'u1', text, createdAt: Date.now() }]
        };
      }
      return p;
    });
    setPosts(updated);
    localStorage.setItem('gyeolkil_posts', JSON.stringify(updated));
  };

  const closeAllPanels = () => { setIsNotifOpen(false); setIsProfileOpen(false); };
  const unreadNotifsCount = notifications.filter(n => n.unread).length;

  if (!isLoggedIn) return <LoginScreen onLogin={() => setIsLoggedIn(true)} />;

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
            <img src="https://api.dicebear.com/7.x/adventurer/svg?seed=user1" className="top-avatar" alt="프로필" />
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
          {/* 유저 프로필 상단 */}
          <div style={{ padding: '30px 20px', textAlign: 'center', borderBottom: '1px solid #f1f3f5' }}>
            <img 
              src="https://api.dicebear.com/7.x/adventurer/svg?seed=user1" 
              alt="프로필" 
              style={{ width: '80px', height: '80px', borderRadius: '50%', backgroundColor: '#edf7ee', marginBottom: '12px' }} 
            />
            <h2 style={{ fontSize: '1.25rem', margin: '0 0 8px 0', color: '#212529' }}>여행자_민들레</h2>
            <p style={{ fontSize: '0.9rem', color: '#868e96', margin: '0 0 16px 0' }}>발길 닿는 곳마다 기록 🌿</p>
            
            {/* 프로필 편집 버튼 */}
            <button style={{
              padding: '6px 20px', borderRadius: '20px', border: '1px solid #dee2e6',
              backgroundColor: '#fff', color: '#495057', fontSize: '0.85rem',
              fontWeight: '600', marginBottom: '24px', cursor: 'pointer',
              transition: 'background-color 0.2s'
            }}>
              프로필 편집
            </button>
            
            {/* 통계 정보 (게시물 연동) */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '35px' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#212529' }}>
                  {posts.filter(p => p.userId === 'u1').length}
                </div>
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

          {/* 마이페이지 메뉴 리스트 */}
          <ul style={{ listStyle: 'none', padding: '0', margin: '0' }}>
            <li style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid #f1f3f5', cursor: 'pointer' }}>
              <i className="fas fa-bookmark" style={{ color: '#52B788', width: '20px', textAlign: 'center' }}></i>
              <span style={{ fontSize: '1rem', color: '#495057' }}>저장한 여행기 ({posts.filter(p => p.saved).length})</span>
            </li>
            <li style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid #f1f3f5', cursor: 'pointer' }}>
              <i className="fas fa-map-pin" style={{ color: '#52B788', width: '20px', textAlign: 'center' }}></i>
              <span style={{ fontSize: '1rem', color: '#495057' }}>내 여행 통계</span>
            </li>
            <li style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid #f1f3f5', cursor: 'pointer' }}>
              <i className="fas fa-cog" style={{ color: '#adb5bd', width: '20px', textAlign: 'center' }}></i>
              <span style={{ fontSize: '1rem', color: '#495057' }}>앱 설정</span>
            </li>
            <li 
              style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}
              onClick={() => {
                closeAllPanels();
                setIsLoggedIn(false); // 로그아웃 처리
              }}
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
            posts={posts} 
            following={following} 
            onToggleLike={handleToggleLike} 
            onOpenModal={(id) => setSelectedPostId(id)} 
          />
        )}
        {activeTab === 'discover' && <DiscoverTab posts={posts} />}
        {activeTab === 'record' && <RecordTab onPublish={handleAddPost} />}
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

      {selectedPostId && (
        <PostModal 
          post={posts.find(p => p.id === selectedPostId)} 
          following={following}
          onClose={() => setSelectedPostId(null)} 
          onAddComment={handleAddComment}
          onToggleFollow={handleToggleFollow}
          onToggleLike={handleToggleLike}
        />
      )}
    </div>
  );
}

export default App;