import React, { useEffect, useMemo, useState } from 'react';
import { doc, collection, query, where, onSnapshot, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db, auth } from '../firebase';

const UserProfilePage = ({ userId, onOpenModal, onClose }) => {
  const [userData, setUserData] = useState(null);
  const [posts, setPosts] = useState([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const currentUser = auth.currentUser;

  // 유저 정보 및 게시글 로드
  useEffect(() => {
    if (!userId) return;

    // 1. 상대 유저 정보 감시
    const userRef = doc(db, 'users', userId);
    const unsubscribeUser = onSnapshot(userRef, (snap) => {
      if (snap.exists()) {
        setUserData({ id: snap.id, ...snap.data() });
      } else {
        setUserData(null);
      }
    });

    // 2. 내 팔로잉 목록 감시 (현재 이 유저를 팔로우 중인지 확인)
    let unsubscribeMe = () => {};
    if (currentUser) {
      const myRef = doc(db, 'users', currentUser.uid);
      unsubscribeMe = onSnapshot(myRef, (snap) => {
        setIsFollowing(snap.data()?.following?.includes(userId));
      });
    }

    // 3. 상대 유저가 작성한 게시글 로드
    const q = query(collection(db, 'posts'), where('userId', '==', userId));
    const unsubscribePosts = onSnapshot(q, (snapshot) => {
      const arr = [];
      snapshot.forEach((docSnap) => arr.push({ id: docSnap.id, ...docSnap.data() }));
      setPosts(arr.sort((a, b) => b.createdAt - a.createdAt)); // 최신순 정렬 보정
    });

    return () => {
      unsubscribeUser();
      unsubscribeMe();
      unsubscribePosts();
    };
  }, [userId, currentUser]);

  // 팔로우 & 언팔로우 핸들러
  const handleToggleFollow = async () => {
    if (!currentUser) { alert("로그인이 필요합니다."); return; }

    const myRef = doc(db, 'users', currentUser.uid);
    const targetRef = doc(db, 'users', userId);

    try {
      if (isFollowing) {
        // 언팔로우
        await updateDoc(myRef, { following: arrayRemove(userId) });
        await updateDoc(targetRef, { followers: arrayRemove(currentUser.uid) });
      } else {
        // 팔로우
        await updateDoc(myRef, { following: arrayUnion(userId) });
        await updateDoc(targetRef, { followers: arrayUnion(currentUser.uid) });
      }
    } catch (error) {
      console.error('팔로우 처리 실패:', error);
    }
  };

  // 총 방문 장소 계산 (발자취)
  const totalPlaces = useMemo(() => {
    let count = 0;
    posts.forEach((post) => { count += post.route?.length || 0; });
    return count;
  }, [posts]);

  // 데이터 로딩 중 화면
  if (!userData) {
    return (
      <section className="tab-page active" style={{ padding: '40px', textAlign: 'center', color: '#ADB5BD' }}>
        <div className="loading-spinner">유저 정보를 불러오는 중... 🧭</div>
      </section>
    );
  }

  const isMe = currentUser?.uid === userId;

  return (
    <section className="tab-page active" style={{ overflowY: 'auto', backgroundColor: '#fff', height: '100%', position: 'relative' }}>
      
      {/* 상단 뒤로가기 헤더 */}
      <div style={{ position: 'sticky', top: 0, backgroundColor: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(8px)', zIndex: 10, padding: '16px 20px', borderBottom: '1px solid #F1F3F5', display: 'flex', alignItems: 'center' }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', color: '#1A1A1A', cursor: 'pointer', marginRight: '16px' }}>
          <i className="fas fa-arrow-left"></i>
        </button>
        <span style={{ fontWeight: '800', fontSize: '16px', color: '#1A1A1A' }}>{userData.displayName}</span>
      </div>

      {/* 🚨 [NEW] 상단 프로필 영역 (MyPage와 동일한 레이아웃) */}
      <div style={{ padding: '24px 20px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          
          <div style={{ padding: '3px', borderRadius: '50%', background: 'linear-gradient(45deg, #52B788, #b7e4c7)' }}>
            <img
              src={userData.photoURL || 'https://api.dicebear.com/7.x/adventurer/svg?seed=fallback'}
              alt="프로필"
              style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover', border: '3px solid #fff' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '20px', textAlign: 'center', flex: 1, justifyContent: 'center' }}>
            <div>
              <div style={{ fontSize: '18px', fontWeight: '800', color: '#1A1A1A' }}>{posts.length}</div>
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
            {userData.displayName}
          </h1>
          <p style={{ color: '#495057', fontSize: '14px', lineHeight: '1.4', margin: 0 }}>
            {userData.bio || '여행 기록을 남기는 중 ✈️'}
          </p>
        </div>

        {/* 🚨 [NEW] 통계 및 팔로우 버튼 영역 */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
          {!isMe && (
            <button
              onClick={handleToggleFollow}
              style={{
                flex: 1, padding: '8px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                background: isFollowing ? '#E9ECEF' : '#52B788', 
                color: isFollowing ? '#495057' : '#fff',
                fontSize: '13px', fontWeight: 'bold', transition: 'all 0.2s'
              }}
            >
              {isFollowing ? '팔로잉' : '팔로우'}
            </button>
          )}
          <button style={{ flex: 1, padding: '8px', borderRadius: '8px', border: 'none', background: '#EBFBEE', fontSize: '13px', fontWeight: 'bold', color: '#2B8A3E', cursor: 'default' }}>
            📍 방문 장소 {totalPlaces}곳
          </button>
        </div>
      </div>

      {/* 그리드 탭 네비게이션 */}
      <div style={{ display: 'flex', borderBottom: '1px solid #F1F3F5', backgroundColor: '#fff' }}>
        <button style={{ flex: 1, padding: '14px 0', border: 'none', background: 'none', color: '#1A1A1A', borderBottom: '2px solid #1A1A1A', fontSize: '18px' }}>
          <i className="fas fa-th"></i>
        </button>
        <button disabled style={{ flex: 1, padding: '14px 0', border: 'none', background: 'none', color: '#E9ECEF', fontSize: '18px', cursor: 'default' }}>
          <i className="fas fa-heart"></i>
        </button>
        <button disabled style={{ flex: 1, padding: '14px 0', border: 'none', background: 'none', color: '#E9ECEF', fontSize: '18px', cursor: 'default' }}>
          <i className="fas fa-bookmark"></i>
        </button>
      </div>

      {/* 썸네일 그리드 (인스타 스타일) */}
      <div style={{ paddingBottom: '80px' }}>
        {posts.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: '#ADB5BD' }}>
            <div style={{ fontSize: '40px', marginBottom: '16px' }}>📭</div>
            <p style={{ fontSize: '14px' }}>아직 등록된 기록이 없습니다.</p>
          </div>
        ) : (
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

                  {/* 다중 사진 아이콘 */}
                  {hasPhoto && post.route.filter(s => s.photo).length > 1 && (
                    <div style={{ position: 'absolute', top: '6px', right: '6px', color: '#fff', fontSize: '12px', textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>
                      <i className="far fa-clone"></i>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};

export default UserProfilePage;