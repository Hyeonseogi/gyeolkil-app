import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, orderBy, onSnapshot, doc, writeBatch } from 'firebase/firestore';
import { auth, db, missingFirebaseKeys } from './firebase';

import LoginScreen from './components/LoginScreen';
import PostDetailModal from './components/PostDetailModal';
import SetupNotice from './components/SetupNotice';

import HomeTab from './pages/HomeTab';
import DiscoverTab from './pages/DiscoverTab';
import ChatTab from './pages/ChatTab';
import MyPage from './pages/MyPage';
import EditProfilePage from './pages/EditProfilePage';
import UserProfilePage from './pages/UserProfilePage';
import SettingsPage from './pages/SettingsPage';
import FootprintTab from './pages/FootprintTab';

/**
 * 기록 탭은 EXIF 파서(exifr) · HEIC 변환기(heic2any) · 이미지 압축기를 쓰는데,
 * 이 라이브러리들만 1.4MB 가 넘는다. 실제로 기록을 시작할 때 내려받도록 분리한다.
 */
const RecordTab = lazy(() => import('./pages/RecordTab'));

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
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [following, setFollowing] = useState([]);
  const [notifications, setNotifications] = useState([]);

  // 안 읽은 알림 개수
  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);

  // 로그인 상태 확인 (로그아웃 시 화면에 남는 데이터도 함께 비운다)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setIsAuthChecking(false);
      if (!user) {
        setFollowing([]);
        setNotifications([]);
        setActiveTab('home');
        setSelectedPostId(null);
        setSelectedUserId(null);
        setIsNotifOpen(false);
      }
    });
    return () => unsubscribe();
  }, []);

  /**
   * 프로필을 수정하면 Firebase 는 같은 user 객체를 그대로 변경하기 때문에
   * React 가 변화를 감지하지 못한다. 새 참조로 교체해 화면을 갱신한다.
   */
  const refreshCurrentUser = useCallback(async () => {
    if (!auth.currentUser) return;
    await auth.currentUser.reload();
    setCurrentUser(Object.assign(Object.create(Object.getPrototypeOf(auth.currentUser)), auth.currentUser));
  }, []);

  // 현재 로그인 유저의 팔로잉 목록 실시간 동기화
  useEffect(() => {
    if (!currentUser) return undefined;

    const unsubscribe = onSnapshot(doc(db, 'users', currentUser.uid), (snap) => {
      setFollowing(snap.data()?.following || []);
    });

    return () => unsubscribe();
  }, [currentUser]);

  // 실시간 알림 로드
  useEffect(() => {
    if (!currentUser) return undefined;

    const q = query(
      collection(db, 'notifications'),
      where('receiverId', '==', currentUser.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setNotifications(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
      },
      (error) => console.error('알림 구독 실패:', error)
    );

    return () => unsubscribe();
  }, [currentUser]);

  // 알림 패널이 열려 있는 동안 배경 스크롤 방지
  useEffect(() => {
    if (!isNotifOpen) return undefined;

    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e) => {
      if (e.key === 'Escape') setIsNotifOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isNotifOpen]);

  /**
   * 패널을 열면 안 읽은 알림을 한 번에 읽음 처리한다.
   * 문서를 하나씩 updateDoc 하면 알림 수만큼 쓰기가 발생하므로 batch 로 묶는다.
   */
  const openNotifications = useCallback(async () => {
    setIsNotifOpen(true);

    const unread = notifications.filter((n) => !n.read);
    if (unread.length === 0) return;

    try {
      const batch = writeBatch(db);
      // Firestore batch 는 한 번에 500 건까지 처리할 수 있다.
      unread.slice(0, 500).forEach((notif) => {
        batch.update(doc(db, 'notifications', notif.id), { read: true });
      });
      await batch.commit();
    } catch (error) {
      console.error('알림 읽음 처리 실패:', error);
    }
  }, [notifications]);

  const closeAllPanels = () => setIsNotifOpen(false);

  // 특정 유저 프로필 화면으로 이동
  const handleOpenUserProfile = useCallback((userId) => {
    if (!userId) return;
    setSelectedPostId(null);
    setSelectedUserId(userId);
    setActiveTab('userProfile');
  }, []);

  // 알림 클릭 시 해당 게시물 또는 유저 프로필로 이동
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

    if (notif.type === 'chat') setActiveTab('chat');
  };

  // 환경 변수가 비어 있으면 로그인 자체가 불가능하므로 원인을 먼저 안내
  if (missingFirebaseKeys.length > 0) {
    return <SetupNotice missingKeys={missingFirebaseKeys} />;
  }

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
          <span
            className="app-logo-small"
            role="button"
            tabIndex={0}
            onClick={() => setActiveTab('home')}
            onKeyDown={(e) => e.key === 'Enter' && setActiveTab('home')}
            style={{ cursor: 'pointer' }}
          >
            🗺️ 곁길
          </span>
        </div>

        <div className="top-bar-right" style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          {/* 알림 버튼 & 안 읽은 배지 */}
          <button
            className="icon-btn"
            onClick={openNotifications}
            style={{ position: 'relative' }}
            aria-label={unreadCount > 0 ? `알림 열기, 안 읽은 알림 ${unreadCount}개` : '알림 열기'}
          >
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

          <button className="icon-btn" onClick={() => setActiveTab('settings')} aria-label="설정 열기">
            <i className="fas fa-gear"></i>
          </button>
        </div>
      </header>

      {/* 알림 사이드 패널 */}
      <div
        className={`side-panel ${isNotifOpen ? 'open' : ''}`}
        role="dialog"
        aria-label="알림"
        aria-hidden={!isNotifOpen}
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
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: '#1A1A1A' }}>알림</h3>

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
                  role="button"
                  tabIndex={0}
                  onClick={() => handleNotifClick(notif)}
                  onKeyDown={(e) => e.key === 'Enter' && handleNotifClick(notif)}
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
                      alt=""
                      onError={(e) => {
                        e.currentTarget.src = FALLBACK_AVATAR;
                      }}
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
                    <p style={{ margin: 0, fontSize: '15px', color: '#1A1A1A', lineHeight: '1.45', fontWeight: '700' }}>
                      {title}
                      <span style={{ color: '#868E96', fontWeight: '500' }}> · {formatNotificationTime(notif.createdAt)}</span>
                    </p>

                    {preview && (
                      <p
                        style={{
                          margin: '6px 0 0',
                          fontSize: '14px',
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
                      aria-label="읽지 않음"
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
            currentUser={currentUser}
            following={following}
            onOpenModal={setSelectedPostId}
            onOpenUser={handleOpenUserProfile}
            onNavigate={setActiveTab}
          />
        )}

        {activeTab === 'discover' && (
          <DiscoverTab
            currentUser={currentUser}
            onOpenModal={setSelectedPostId}
            onOpenUser={handleOpenUserProfile}
          />
        )}

        {activeTab === 'record' && (
          <Suspense
            fallback={
              <div style={{ padding: '80px 20px', textAlign: 'center', color: '#ADB5BD' }}>
                기록 도구를 준비하는 중... 📷
              </div>
            }
          >
            <RecordTab currentUser={currentUser} onPublish={() => setActiveTab('home')} />
          </Suspense>
        )}
        {activeTab === 'chat' && <ChatTab currentUser={currentUser} />}

        {activeTab === 'mypage' && (
          <MyPage currentUser={currentUser} onOpenModal={setSelectedPostId} onNavigate={setActiveTab} />
        )}
        {activeTab === 'edit-profile' && (
          <EditProfilePage
            currentUser={currentUser}
            onProfileUpdated={refreshCurrentUser}
            onNavigate={setActiveTab}
          />
        )}
        {activeTab === 'userProfile' && (
          <UserProfilePage
            key={selectedUserId}
            currentUser={currentUser}
            userId={selectedUserId}
            onOpenModal={setSelectedPostId}
            onClose={() => setActiveTab('home')}
          />
        )}

        {activeTab === 'settings' && <SettingsPage onClose={() => setActiveTab('mypage')} />}
        {activeTab === 'footprint' && (
          <FootprintTab currentUser={currentUser} onOpenModal={setSelectedPostId} onClose={() => setActiveTab('mypage')} />
        )}
      </main>

      {/* 하단 네비게이션 바 */}
      <nav className="bottom-nav" aria-label="주요 메뉴">
        <button
          className={`nav-btn ${activeTab === 'home' ? 'active' : ''}`}
          onClick={() => setActiveTab('home')}
          aria-current={activeTab === 'home' ? 'page' : undefined}
        >
          <i className="fas fa-home"></i><span>홈</span>
        </button>
        <button
          className={`nav-btn ${activeTab === 'discover' ? 'active' : ''}`}
          onClick={() => setActiveTab('discover')}
          aria-current={activeTab === 'discover' ? 'page' : undefined}
        >
          <i className="fas fa-compass"></i><span>발견</span>
        </button>
        <button
          className={`nav-btn record-nav-btn ${activeTab === 'record' ? 'active' : ''}`}
          onClick={() => setActiveTab('record')}
          aria-label="여정 기록하기"
        >
          <div className="record-btn-inner"><i className="fas fa-camera"></i></div>
        </button>
        <button
          className={`nav-btn ${activeTab === 'chat' ? 'active' : ''}`}
          onClick={() => setActiveTab('chat')}
          aria-current={activeTab === 'chat' ? 'page' : undefined}
        >
          <i className="fas fa-comment-dots"></i><span>채팅</span>
        </button>
        <button
          className={`nav-btn ${activeTab === 'mypage' || activeTab === 'footprint' ? 'active' : ''}`}
          onClick={() => setActiveTab('mypage')}
          aria-label="마이페이지"
        >
          <img
            src={currentUser.photoURL || FALLBACK_AVATAR}
            alt=""
            onError={(e) => {
              e.currentTarget.src = FALLBACK_AVATAR;
            }}
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
        currentUser={currentUser}
        onClose={() => setSelectedPostId(null)}
        onOpenUser={handleOpenUserProfile}
      />
    </div>
  );
}

export default App;
