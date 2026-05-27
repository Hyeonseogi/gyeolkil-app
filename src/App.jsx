import React, { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc } from 'firebase/firestore'; // 🚨 onSnapshot, updateDoc 추가
import { auth, db } from './firebase';

import LoginScreen from './components/LoginScreen';
import PostDetailModal from './components/PostDetailModal';

import HomeTab from './pages/HomeTab';
import DiscoverTab from './pages/DiscoverTab';
import RecordTab from './pages/RecordTab';
import ChatTab from './pages/ChatTab';
import MyPage from './pages/MyPage';
import EditProfilePage from './pages/EditProfilePage';
import UserProfilePage from './pages/UserProfilePage';
import SettingsPage from './pages/SettingsPage';
import FootprintTab from './pages/FootprintTab';

import {
  buildNotificationContent,
  FALLBACK_AVATAR,
  formatNotificationTime,
  getNotificationTypeColors,
  getNotificationTypeIcon
} from './data';

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

  // 안 읽은 알림 개수 계산
  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);

  // 로그인 상태 확인
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setIsAuthChecking(false);
    });
    return () => unsubscribe();
  }, []);

  // 현재 로그인 유저의 팔로잉 목록 실시간 동기화
  useEffect(() => {
    if (!currentUser) {
      setFollowing([]);
      return;
    }

    const unsubscribe = onSnapshot(doc(db, 'users', currentUser.uid), (snap) => {
      setFollowing(snap.data()?.following || []);
    });

    return () => unsubscribe();
  }, [currentUser]);

  // 🚨 [NEW] 실시간 알림 로드 로직
  useEffect(() => {
    if (!currentUser) return;

    const q = query(
      collection(db, 'notifications'),
      where('receiverId', '==', currentUser.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notifs = [];
      snapshot.forEach((docSnap) => notifs.push({ id: docSnap.id, ...docSnap.data() }));
      setNotifications(notifs);
    });

    return () => unsubscribe();
  }, [currentUser]);

  // 내 게시글 수 카운트
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

  // 알림 패널 열릴 때 스크롤 방지 및 읽음 처리
  useEffect(() => {
    document.body.style.overflow = isNotifOpen ? 'hidden' : 'auto';

    // 🚨 패널이 열리면 모든 안 읽은 알림을 '읽음(read: true)'으로 업데이트!
    if (isNotifOpen && unreadCount > 0) {
      const unreadNotifications = notifications.filter((notif) => !notif.read);
      Promise.all(
        unreadNotifications.map((notif) =>
          updateDoc(doc(db, 'notifications', notif.id), { read: true }).catch((e) => {
            console.error('알림 읽음 처리 실패:', e);
          })
        )
      );
    }

    return () => {
      document.body.style.overflow = 'auto';
    };
  }, [isNotifOpen, unreadCount, notifications]);

  const closeAllPanels = () => {
    setIsNotifOpen(false);
  };

  // 특정 유저 프로필 화면으로 이동
  const handleOpenUserProfile = (userId) => {
    if (!userId) return;
    setSelectedUserId(userId);
    setActiveTab('userProfile');
  };

  // 🚨 [NEW] 알림 클릭 시 해당 게시물 또는 유저 프로필로 이동
  const handleNotifClick = (notif) => {
    closeAllPanels();

    if (notif.type === 'follow') {
      handleOpenUserProfile(notif.senderId || notif.targetUserId);
      return;
    }

    if (notif.postId) {
      setSelectedPostId(notif.postId);
      return;
    }

    if (notif.type === 'chat') {
      setActiveTab('chat');
    }
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
          <span className="app-logo-small" onClick={() => setActiveTab('home')} style={{ cursor: 'pointer' }}>
            🗺️ 곁길
          </span>
        </div>

        <div className="top-bar-right" style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          {/* 🚨 [NEW] 알림 버튼 & 안 읽은 배지(Badge) UI */}
          <button className="icon-btn" onClick={() => setIsNotifOpen(true)} style={{ position: 'relative' }} aria-label="알림 열기">
            <i className="fas fa-bell"></i>
            {unreadCount > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: '5px',
                  right: '2px',
                  minWidth: unreadCount > 9 ? '20px' : '18px',
                  height: '18px',
                  padding: unreadCount > 9 ? '0 4px' : 0,
                  background: '#ff0f7b',
                  color: '#fff',
                  fontSize: '10px',
                  fontWeight: '800',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '999px',
                  border: '2px solid #fff',
                  boxShadow: '0 4px 12px rgba(255, 15, 123, 0.35)'
                }}
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          <button className="icon-btn" onClick={() => setActiveTab('settings')}>
            <i className="fas fa-gear"></i>
          </button>
        </div>
      </header>

      {/* 🚨 [NEW] 실제 데이터가 렌더링되는 알림 사이드 패널 */}
      <div
        className={`side-panel ${isNotifOpen ? 'open' : ''}`}
        style={{
          zIndex: 1100,
          background: '#ffffff',
          color: '#1A1A1A',
          width: 'min(390px, 94vw)',
          boxShadow: '-10px 0 30px rgba(0,0,0,0.12)'
        }}
      >
        <div
          className="panel-header"
          style={{
            padding: '20px',
            borderBottom: '1px solid #E9ECEF',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#ffffff'
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: '#1A1A1A' }}>알림</h3>
          </div>

          <button
            onClick={closeAllPanels}
            style={{ background: 'none', border: 'none', fontSize: '20px', color: '#868E96', cursor: 'pointer' }}
            aria-label="알림 닫기"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>

        <ul style={{ listStyle: 'none', padding: 0, margin: 0, overflowY: 'auto', height: 'calc(100% - 81px)' }}>
          {notifications.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '72px 20px',
                color: '#868E96',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                alignItems: 'center'
              }}
            >
              <i className="far fa-bell-slash" style={{ fontSize: '34px' }}></i>
              <p style={{ margin: 0, fontSize: '14px' }}>새로운 알림이 없습니다.</p>
            </div>
          ) : (
            notifications.map((notif) => {
              const { title, preview } = buildNotificationContent(notif);
              const iconClass = getNotificationTypeIcon(notif.type);
              const iconColor = getNotificationTypeColors(notif.type);

              return (
                <li
                  key={notif.id}
                  onClick={() => handleNotifClick(notif)}
                  style={{
                    position: 'relative',
                    padding: '18px 18px 16px',
                    borderBottom: '1px solid #F1F3F5',
                    display: 'flex',
                    gap: '12px',
                    alignItems: 'flex-start',
                    cursor: 'pointer',
                    backgroundColor: notif.read ? '#ffffff' : '#F8FFF9',
                    transition: 'background-color 0.2s'
                  }}
                >
                  <div style={{ position: 'relative', flexShrink: 0, marginTop: '2px' }}>
                    <img
                      src={notif.senderAvatar || FALLBACK_AVATAR}
                      alt={notif.senderName || '사용자'}
                      style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '50%',
                        objectFit: 'cover',
                        border: '1px solid #E9ECEF'
                      }}
                    />
                    <div
                      style={{
                        position: 'absolute',
                        left: '-8px',
                        top: '-6px',
                        width: '22px',
                        height: '22px',
                        borderRadius: '50%',
                        background: iconColor.bg,
                        boxShadow: iconColor.shadow,
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '10px',
                        border: '2px solid #ffffff'
                      }}
                    >
                      <i className={iconClass}></i>
                    </div>
                  </div>

                  <div style={{ flex: 1, minWidth: 0, paddingRight: '14px' }}>
                    <p style={{ margin: 0, fontSize: '17px', color: '#1A1A1A', lineHeight: '1.45', fontWeight: '700' }}>
                      {title}
                      <span style={{ color: '#868E96', fontWeight: '500' }}> · {formatNotificationTime(notif.createdAt)}</span>
                    </p>

                    {preview && (
                      <p
                        style={{
                          margin: '6px 0 0',
                          fontSize: '15px',
                          color: '#495057',
                          lineHeight: '1.45',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}
                      >
                        {preview}
                      </p>
                    )}
                  </div>

                  {!notif.read && (
                    <span
                      style={{
                        position: 'absolute',
                        right: '12px',
                        top: '22px',
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: '#ff4d6d'
                      }}
                    />
                  )}
                </li>
              );
            })
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
            onOpenUser={(id) => {
              setSelectedUserId(id);
              setActiveTab('userProfile');
            }}
            onNavigate={(tabName) => setActiveTab(tabName)}
          />
        )}

        {activeTab === 'discover' && (
          <DiscoverTab
            onOpenModal={(id) => setSelectedPostId(id)}
            onOpenUser={(id) => {
              setSelectedUserId(id);
              setActiveTab('userProfile');
            }}
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
        {activeTab === 'edit-profile' && (
          <EditProfilePage onNavigate={(tabName) => setActiveTab(tabName)} />
        )}
        {activeTab === 'userProfile' && (
          <UserProfilePage
            key={selectedUserId}
            userId={selectedUserId}
            onOpenModal={(id) => setSelectedPostId(id)}
            onClose={() => setActiveTab('home')}
          />
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
            src={currentUser.photoURL || FALLBACK_AVATAR}
            alt="프로필"
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              objectFit: 'cover',
              border: activeTab === 'mypage' || activeTab === 'footprint' ? '2px solid #52B788' : '2px solid transparent'
            }}
          />
        </button>
      </nav>

      {/* 게시글 모달 */}
      <PostDetailModal
        postId={selectedPostId}
        onClose={() => setSelectedPostId(null)}
        onOpenUser={(id) => {
          setSelectedPostId(null);
          setSelectedUserId(id);
          setActiveTab('userProfile');
        }}
      />
    </div>
  );
}

export default App;
