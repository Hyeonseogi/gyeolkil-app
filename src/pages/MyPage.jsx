import React, { useEffect, useMemo, useState } from 'react';
import { collection, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';

const MyPage = ({ onOpenModal, onNavigate }) => {
  const currentUser = auth.currentUser;

  const [myPosts, setMyPosts] = useState([]);
  const [allPosts, setAllPosts] = useState([]);
  const [userData, setUserData] = useState(null); // 🚨 [NEW] 유저 전체 데이터를 상태로 관리
  const [activeTab, setActiveTab] = useState('posts');

  // 1. 내 유저 정보 문서 실시간 로드
  useEffect(() => {
    if (!currentUser) return;
    const userRef = doc(db, 'users', currentUser.uid);
    const unsubscribe = onSnapshot(userRef, (snap) => {
      if (snap.exists()) {
        setUserData(snap.data());
      }
    });
    return () => unsubscribe();
  }, [currentUser]);

  // 2. 내 게시글 로드
  useEffect(() => {
    if (!currentUser) return;
    const q = query(collection(db, 'posts'), where('userId', '==', currentUser.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const arr = [];
      snapshot.forEach((docSnap) => arr.push({ id: docSnap.id, ...docSnap.data() }));
      setMyPosts(arr.sort((a, b) => b.createdAt - a.createdAt));
    });
    return () => unsubscribe();
  }, [currentUser]);

  // 3. 전체 게시글 로드 (좋아요, 저장 등 필터링 용도)
  useEffect(() => {
    if (!currentUser) return;
    const q = query(collection(db, 'posts'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const arr = [];
      snapshot.forEach((docSnap) => arr.push({ id: docSnap.id, ...docSnap.data() }));
      setAllPosts(arr);
    });
    return () => unsubscribe();
  }, [currentUser]);

  // 활동 기록 매핑
  const likedPostObjects = useMemo(() => allPosts.filter((post) => userData?.likedPosts?.includes(post.id)), [allPosts, userData]);
  const savedPostObjects = useMemo(() => allPosts.filter((post) => userData?.savedPosts?.includes(post.id)), [allPosts, userData]);
  const commentedPostObjects = useMemo(() => allPosts.filter((post) => userData?.commentedPosts?.includes(post.id)), [allPosts, userData]);

  // 총 방문 장소 계산 (발자취)
  const totalPlaces = useMemo(() => {
    let count = 0;
    myPosts.forEach((post) => { count += post.route?.length || 0; });
    return count;
  }, [myPosts]);

  // 🚨 [NEW] 인스타 스타일 3열 그리드 렌더러 (타인 프로필과 통일)
  const renderGrid = (posts) => {
    if (posts.length === 0) {
      return (
        <div style={{ padding: '60px 20px', textAlign: 'center', color: '#ADB5BD' }}>
          <div style={{ fontSize: '40px', marginBottom: '16px' }}>📭</div>
          <p style={{ fontSize: '14px' }}>등록된 기록이 없습니다.</p>
        </div>
      );
    }

    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2px' }}>
        {posts.map((post) => {
          const hasPhoto = post.route && post.route.length > 0 && post.route.some(s => s.photo);
          const firstPhoto = hasPhoto ? post.route.find(s => s.photo).photo : null;

          return (
            <div
              key={post.id}
              onClick={() => onOpenModal(post.id)}
              style={{
                aspectRatio: '1 / 1', overflow: 'hidden', cursor: 'pointer',
                position: 'relative', backgroundColor: '#F8F9FA'
              }}
            >
              {firstPhoto ? (
                <img src={firstPhoto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '10px', textAlign: 'center' }}>
                  <span style={{ fontSize: '20px', marginBottom: '4px' }}>📍</span>
                  <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#495057', wordBreak: 'keep-all' }}>{post.title.substring(0, 15)}...</span>
                </div>
              )}

              {hasPhoto && post.route.filter(s => s.photo).length > 1 && (
                <div style={{ position: 'absolute', top: '6px', right: '6px', color: '#fff', fontSize: '12px', textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>
                  <i className="far fa-clone"></i>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <section className="tab-page active" style={{ overflowY: 'auto', backgroundColor: '#fff', height: '100%' }}>
      
      {/* 🚨 [NEW] 상단 프로필 영역 (타인 프로필 페이지와 완벽하게 레이아웃 일치) */}
      <div style={{ padding: '24px 20px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          
          <div style={{ padding: '3px', borderRadius: '50%', background: 'linear-gradient(45deg, #52B788, #b7e4c7)' }}>
            <img
              src={currentUser?.photoURL || 'https://api.dicebear.com/7.x/adventurer/svg?seed=fallback'}
              alt="프로필"
              style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover', border: '3px solid #fff' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '20px', textAlign: 'center', flex: 1, justifyContent: 'center' }}>
            <div>
              <div style={{ fontSize: '18px', fontWeight: '800', color: '#1A1A1A' }}>{myPosts.length}</div>
              <div style={{ fontSize: '13px', color: '#495057' }}>게시물</div>
            </div>
            <div>
              <div style={{ fontSize: '18px', fontWeight: '800', color: '#1A1A1A' }}>{userData?.followers?.length || 0}</div>
              <div style={{ fontSize: '13px', color: '#495057' }}>팔로워</div>
            </div>
            <div>
              <div style={{ fontSize: '18px', fontWeight: '800', color: '#1A1A1A' }}>{userData?.following?.length || 0}</div>
              <div style={{ fontSize: '13px', color: '#495057' }}>팔로잉</div>
            </div>
          </div>
        </div>

        <div>
          <h1 style={{ fontSize: '15px', fontWeight: '800', marginBottom: '4px', color: '#1A1A1A' }}>
            {currentUser?.displayName || '여행자'}
          </h1>
          <p style={{ color: '#495057', fontSize: '14px', lineHeight: '1.4', margin: 0 }}>
            {userData?.bio || '여행 기록을 남기는 중 ✈️'}
          </p>
        </div>

        {/* 🚨 [NEW] 통계 및 프로필 편집 영역 */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
          <button style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid #E5E7EB', background: '#F8F9FA', fontSize: '13px', fontWeight: 'bold', color: '#1A1A1A', cursor: 'pointer' }}>
            프로필 편집
          </button>
          <button onClick={() => onNavigate && onNavigate('footprint')} style={{ flex: 1, padding: '8px', borderRadius: '8px', border: 'none', background: '#EBFBEE', fontSize: '13px', fontWeight: 'bold', color: '#2B8A3E', cursor: 'pointer' }}>
            📍 방문 장소 {totalPlaces}곳
          </button>
        </div>
      </div>

      {/* 탭 네비게이션 */}
      <div style={{ display: 'flex', borderBottom: '1px solid #F1F3F5', position: 'sticky', top: 0, backgroundColor: '#fff', zIndex: 10 }}>
        {[
          { key: 'posts', icon: 'fas fa-th' },
          { key: 'likes', icon: 'fas fa-heart' },
          { key: 'saved', icon: 'fas fa-bookmark' },
          { key: 'comments', icon: 'fas fa-comment' }
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              flex: 1, padding: '14px 0', border: 'none', background: 'none', cursor: 'pointer',
              color: activeTab === tab.key ? '#1A1A1A' : '#ADB5BD',
              borderBottom: activeTab === tab.key ? '2px solid #1A1A1A' : '2px solid transparent',
              fontSize: '18px', transition: 'all 0.2s'
            }}
          >
            <i className={tab.icon}></i>
          </button>
        ))}
      </div>

      {/* 썸네일 그리드 렌더링 영역 */}
      <div style={{ paddingBottom: '80px' }}>
        {activeTab === 'posts' && renderGrid(myPosts)}
        {activeTab === 'likes' && renderGrid(likedPostObjects)}
        {activeTab === 'saved' && renderGrid(savedPostObjects)}
        {activeTab === 'comments' && renderGrid(commentedPostObjects)}
      </div>

    </section>
  );
};

export default MyPage;