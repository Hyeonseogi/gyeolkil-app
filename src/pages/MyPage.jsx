import React, { useEffect, useMemo, useState } from 'react';
import { collection, query, where, onSnapshot, doc } from 'firebase/firestore';
import { db, auth } from '../firebase';

// 🚨 [NEW] App.jsx에서 넘겨준 onNavigate 프롭스 추가!
const MyPage = ({ onOpenModal, onNavigate }) => {
  const currentUser = auth.currentUser;

  const [myPosts, setMyPosts] = useState([]);
  const [allPosts, setAllPosts] = useState([]);
  const [likedPosts, setLikedPosts] = useState([]);
  const [savedPosts, setSavedPosts] = useState([]);
  const [commentedPosts, setCommentedPosts] = useState([]);
  const [activeTab, setActiveTab] = useState('posts');

  // 내 게시글 로드
  useEffect(() => {
    if (!currentUser) return;
    const q = query(collection(db, 'posts'), where('userId', '==', currentUser.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const arr = [];
      snapshot.forEach((docSnap) => arr.push({ id: docSnap.id, ...docSnap.data() }));
      // 최신순 정렬 보정
      setMyPosts(arr.sort((a, b) => b.createdAt - a.createdAt));
    });
    return () => unsubscribe();
  }, [currentUser]);

  // 전체 게시글 로드 (좋아요, 저장 등 필터링 용도)
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

  // 내 유저 정보 문서 로드 (활동 기록 트래킹)
  useEffect(() => {
    if (!currentUser) return;
    const userRef = doc(db, 'users', currentUser.uid);
    const unsubscribe = onSnapshot(userRef, (snap) => {
      const data = snap.data();
      setLikedPosts(data?.likedPosts || []);
      setSavedPosts(data?.savedPosts || []);
      setCommentedPosts(data?.commentedPosts || []);
    });
    return () => unsubscribe();
  }, [currentUser]);

  // 활동 기록 매핑
  const likedPostObjects = useMemo(() => allPosts.filter((post) => likedPosts.includes(post.id)), [allPosts, likedPosts]);
  const savedPostObjects = useMemo(() => allPosts.filter((post) => savedPosts.includes(post.id)), [allPosts, savedPosts]);
  const commentedPostObjects = useMemo(() => allPosts.filter((post) => commentedPosts.includes(post.id)), [allPosts, commentedPosts]);

  // 총 방문 장소 계산 (발자취)
  const totalPlaces = useMemo(() => {
    let count = 0;
    myPosts.forEach((post) => { count += post.route?.length || 0; });
    return count;
  }, [myPosts]);

  // 🚨 [현석 님 스타일 적용] 인스타 스타일 3열 그리드 렌더러
  const renderGrid = (posts) => {
    if (posts.length === 0) {
      return (
        <div style={{ padding: '60px 20px', textAlign: 'center', color: '#ADB5BD' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📭</div>
          <p style={{ fontSize: '14px' }}>아직 등록된 기록이 없습니다.</p>
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
                aspectRatio: '1 / 1',
                overflow: 'hidden',
                cursor: 'pointer',
                position: 'relative',
                backgroundColor: '#F1F3F5'
              }}
            >
              {firstPhoto ? (
                <img src={firstPhoto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                // 사진이 없을 경우의 텍스트 기반 썸네일
                <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '10px', textAlign: 'center' }}>
                  <span style={{ fontSize: '20px', marginBottom: '4px' }}>📍</span>
                  <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#495057', wordBreak: 'keep-all' }}>{post.title.substring(0, 15)}...</span>
                </div>
              )}

              {/* 사진이 여러 장일 때 겹친 아이콘 표시 */}
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
      
      {/* 상단 프로필 영역 */}
      <div style={{ padding: '24px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          {/* 프로필 이미지 (스토리 링 효과 적용) */}
          <div style={{ padding: '3px', borderRadius: '50%', background: 'linear-gradient(45deg, #52B788, #b7e4c7)' }}>
            <img
              src={currentUser?.photoURL || 'https://api.dicebear.com/7.x/adventurer/svg?seed=my'}
              alt="프로필"
              style={{ width: '84px', height: '84px', borderRadius: '50%', objectFit: 'cover', border: '3px solid #fff' }}
            />
          </div>

          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: '22px', fontWeight: '800', marginBottom: '4px', color: '#1A1A1A' }}>
              {currentUser?.displayName || '여행자'}
            </h1>
            <p style={{ color: '#666', fontSize: '14px', lineHeight: '1.4' }}>
              여행 기록을 남기는 중 ✈️<br/>곁길에서 만나요!
            </p>
          </div>
        </div>

        {/* 3단 통계 보드 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '28px', padding: '16px 20px', borderRadius: '16px', background: '#F8F9FA' }}>
          <div style={{ textAlign: 'center', flex: 1 }}>
            <div style={{ fontSize: '18px', fontWeight: '800', color: '#1A1A1A' }}>{myPosts.length}</div>
            <div style={{ fontSize: '12px', color: '#868e96', marginTop: '4px' }}>게시물</div>
          </div>
          <div style={{ width: '1px', backgroundColor: '#E5E7EB', margin: '0 10px' }}></div>
          
          {/* 🚨 [NEW] 방문 장소 클릭 시 발자취 탭으로 라우팅 이동 연결! */}
          <div 
            onClick={() => onNavigate && onNavigate('footprint')}
            style={{ textAlign: 'center', flex: 1, cursor: 'pointer' }}
          >
            <div style={{ fontSize: '18px', fontWeight: '800', color: '#52B788' }}>{totalPlaces}</div>
            <div style={{ fontSize: '12px', color: '#495057', marginTop: '4px', fontWeight: '600' }}>방문 장소 🗺️</div>
          </div>

          <div style={{ width: '1px', backgroundColor: '#E5E7EB', margin: '0 10px' }}></div>
          <div style={{ textAlign: 'center', flex: 1 }}>
            <div style={{ fontSize: '18px', fontWeight: '800', color: '#1A1A1A' }}>{savedPosts.length}</div>
            <div style={{ fontSize: '12px', color: '#868e96', marginTop: '4px' }}>북마크</div>
          </div>
        </div>

        {/* 프로필 편집 버튼 */}
        <div style={{ marginTop: '16px' }}>
          <button style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #E5E7EB', background: '#fff', fontSize: '14px', fontWeight: '600', color: '#1A1A1A', cursor: 'pointer' }}>
            프로필 편집
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