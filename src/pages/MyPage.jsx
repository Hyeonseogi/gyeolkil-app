import { useEffect, useMemo, useState } from 'react';
import { collection, query, where, onSnapshot, doc } from 'firebase/firestore';
import { db } from '../firebase';
import PostGrid from '../components/PostGrid';
import { FALLBACK_AVATAR, getTimestampValue } from '../data';

const TABS = [
  { key: 'posts', icon: 'fas fa-th', label: '내 여정' },
  { key: 'likes', icon: 'fas fa-heart', label: '좋아요한 여정' },
  { key: 'saved', icon: 'fas fa-bookmark', label: '저장한 여정' },
  { key: 'comments', icon: 'fas fa-comment', label: '댓글 단 여정' }
];

// 탭마다 어떤 필드로 게시물을 찾을지
const TAB_FIELD = {
  posts: null, // userId 로 직접 조회
  likes: 'likedBy',
  saved: 'savedBy',
  comments: 'commentedUserIds'
};

const sortByNewest = (arr) => [...arr].sort((a, b) => getTimestampValue(b.createdAt) - getTimestampValue(a.createdAt));

const MyPage = ({ currentUser, onOpenModal, onNavigate }) => {
  const [myPosts, setMyPosts] = useState([]);
  const [tabPosts, setTabPosts] = useState([]);
  // 어떤 탭의 결과가 담겨 있는지 기록해 두면 로딩 여부를 따로 세팅하지 않아도 된다.
  const [loadedTab, setLoadedTab] = useState(null);
  const [userData, setUserData] = useState(null);
  const [activeTab, setActiveTab] = useState('posts');

  // 내 유저 문서 실시간 구독 (팔로워 / 팔로잉 / 소개글)
  useEffect(() => {
    if (!currentUser) return undefined;

    const unsubscribe = onSnapshot(doc(db, 'users', currentUser.uid), (snap) => {
      if (snap.exists()) setUserData(snap.data());
    });
    return () => unsubscribe();
  }, [currentUser]);

  // 내가 쓴 게시글 (프로필 상단 통계에도 쓰이므로 항상 구독)
  useEffect(() => {
    if (!currentUser) return undefined;

    const q = query(collection(db, 'posts'), where('userId', '==', currentUser.uid));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => setMyPosts(sortByNewest(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })))),
      (error) => console.error('내 게시글 로드 실패:', error)
    );
    return () => unsubscribe();
  }, [currentUser]);

  /**
   * 좋아요 / 저장 / 댓글 탭은 선택된 탭만 조회한다.
   * (예전에는 posts 컬렉션 전체를 내려받아 클라이언트에서 걸렀는데,
   *  게시물이 늘어날수록 읽기 비용과 트래픽이 그대로 커지는 구조였다.)
   */
  useEffect(() => {
    const field = TAB_FIELD[activeTab];
    if (!currentUser || !field) return undefined;

    const q = query(collection(db, 'posts'), where(field, 'array-contains', currentUser.uid));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setTabPosts(sortByNewest(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))));
        setLoadedTab(activeTab);
      },
      (error) => {
        console.error('활동 기록 로드 실패:', error);
        setLoadedTab(activeTab);
      }
    );

    return () => unsubscribe();
  }, [currentUser, activeTab]);

  // 총 방문 장소 수 (발자취 진입 버튼에 노출)
  const totalPlaces = useMemo(
    () => myPosts.reduce((sum, post) => sum + (post.route?.length || 0), 0),
    [myPosts]
  );

  const isTabLoading = activeTab !== 'posts' && loadedTab !== activeTab;
  const visiblePosts = activeTab === 'posts' ? myPosts : isTabLoading ? [] : tabPosts;

  return (
    <section className="tab-page active" style={{ overflowY: 'auto', backgroundColor: '#fff', height: '100%' }}>
      {/* 상단 프로필 영역 (타인 프로필 페이지와 동일한 레이아웃) */}
      <div style={{ padding: '24px 20px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ padding: '3px', borderRadius: '50%', background: 'linear-gradient(45deg, #52B788, #b7e4c7)' }}>
            <img
              src={currentUser?.photoURL || userData?.photoURL || FALLBACK_AVATAR}
              alt="내 프로필"
              onError={(e) => {
                e.currentTarget.src = FALLBACK_AVATAR;
              }}
              style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover', border: '3px solid #fff' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '20px', textAlign: 'center', flex: 1, justifyContent: 'center' }}>
            {[
              { value: myPosts.length, label: '게시물' },
              { value: userData?.followers?.length || 0, label: '팔로워' },
              { value: userData?.following?.length || 0, label: '팔로잉' }
            ].map((stat) => (
              <div key={stat.label}>
                <div style={{ fontSize: '18px', fontWeight: '800', color: '#1A1A1A' }}>{stat.value}</div>
                <div style={{ fontSize: '13px', color: '#495057' }}>{stat.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h1 style={{ fontSize: '15px', fontWeight: '800', marginBottom: '4px', color: '#1A1A1A' }}>
            {currentUser?.displayName || userData?.displayName || '여행자'}
          </h1>
          <p style={{ color: '#495057', fontSize: '14px', lineHeight: '1.4', margin: 0 }}>
            {userData?.bio || '여행 기록을 남기는 중 ✈️'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
          <button
            onClick={() => onNavigate('edit-profile')}
            style={{
              flex: 1,
              padding: '8px',
              borderRadius: '8px',
              border: '1px solid #E1E4E6',
              backgroundColor: '#fff',
              fontWeight: '500',
              fontSize: '13px',
              cursor: 'pointer'
            }}
          >
            프로필 편집
          </button>
          <button
            onClick={() => onNavigate && onNavigate('footprint')}
            style={{
              flex: 1,
              padding: '8px',
              borderRadius: '8px',
              border: 'none',
              background: '#EBFBEE',
              fontSize: '13px',
              fontWeight: 'bold',
              color: '#2B8A3E',
              cursor: 'pointer'
            }}
          >
            📍 방문 장소 {totalPlaces}곳
          </button>
        </div>
      </div>

      {/* 탭 네비게이션 */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid #F1F3F5',
          position: 'sticky',
          top: 0,
          backgroundColor: '#fff',
          zIndex: 10
        }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            aria-label={tab.label}
            aria-pressed={activeTab === tab.key}
            style={{
              flex: 1,
              padding: '14px 0',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              color: activeTab === tab.key ? '#1A1A1A' : '#ADB5BD',
              borderBottom: activeTab === tab.key ? '2px solid #1A1A1A' : '2px solid transparent',
              fontSize: '18px',
              transition: 'all 0.2s'
            }}
          >
            <i className={tab.icon}></i>
          </button>
        ))}
      </div>

      {/* 썸네일 그리드 */}
      <div style={{ paddingBottom: '80px' }}>
        {isTabLoading ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: '#ADB5BD', fontSize: '14px' }}>
            불러오는 중... 🧭
          </div>
        ) : (
          <PostGrid posts={visiblePosts} onOpenModal={onOpenModal} />
        )}
      </div>
    </section>
  );
};

export default MyPage;
