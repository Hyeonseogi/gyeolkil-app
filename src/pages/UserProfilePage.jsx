import { useEffect, useMemo, useState } from 'react';
import { doc, collection, query, where, onSnapshot, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from '../firebase';
import PostGrid from '../components/PostGrid';
import { FALLBACK_AVATAR, createSocialNotification, getTimestampValue, showToast } from '../data';

const UserProfilePage = ({ currentUser, userId, onOpenModal, onClose }) => {
  const [userData, setUserData] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [posts, setPosts] = useState([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!userId) return undefined;

    // 1. 상대 유저 정보 구독
    const unsubscribeUser = onSnapshot(doc(db, 'users', userId), (snap) => {
      if (snap.exists()) {
        setUserData({ id: snap.id, ...snap.data() });
        setNotFound(false);
      } else {
        setUserData(null);
        setNotFound(true);
      }
    });

    // 2. 내 팔로잉 목록 구독 (이 유저를 팔로우 중인지)
    let unsubscribeMe = () => {};
    if (currentUser) {
      unsubscribeMe = onSnapshot(doc(db, 'users', currentUser.uid), (snap) => {
        setIsFollowing(!!snap.data()?.following?.includes(userId));
      });
    }

    // 3. 상대 유저가 작성한 게시글
    const q = query(collection(db, 'posts'), where('userId', '==', userId));
    const unsubscribePosts = onSnapshot(q, (snapshot) => {
      const arr = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      arr.sort((a, b) => getTimestampValue(b.createdAt) - getTimestampValue(a.createdAt));
      setPosts(arr);
    });

    return () => {
      unsubscribeUser();
      unsubscribeMe();
      unsubscribePosts();
    };
  }, [userId, currentUser]);

  // 팔로우 / 언팔로우
  const handleToggleFollow = async () => {
    if (!currentUser) {
      showToast('로그인이 필요합니다.', 'error');
      return;
    }
    if (isSubmitting) return;

    setIsSubmitting(true);
    const myRef = doc(db, 'users', currentUser.uid);
    const targetRef = doc(db, 'users', userId);

    try {
      if (isFollowing) {
        await updateDoc(myRef, { following: arrayRemove(userId) });
        await updateDoc(targetRef, { followers: arrayRemove(currentUser.uid) });
        showToast('팔로우를 취소했습니다.');
      } else {
        await updateDoc(myRef, { following: arrayUnion(userId) });
        await updateDoc(targetRef, { followers: arrayUnion(currentUser.uid) });
        await createSocialNotification({
          receiverId: userId,
          sender: currentUser,
          type: 'follow',
          targetUserId: userId
        });
        showToast(`${userData?.displayName || '여행자'}님을 팔로우합니다.`, 'success');
      }
    } catch (error) {
      console.error('팔로우 처리 실패:', error);
      showToast('처리 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 총 방문 장소 계산 (발자취)
  const totalPlaces = useMemo(
    () => posts.reduce((sum, post) => sum + (post.route?.length || 0), 0),
    [posts]
  );

  if (notFound) {
    return (
      <section className="tab-page active" style={{ padding: '60px 20px', textAlign: 'center', color: '#868E96' }}>
        <div style={{ fontSize: '40px', marginBottom: '12px' }}>🔍</div>
        <p style={{ margin: '0 0 20px' }}>존재하지 않거나 탈퇴한 사용자입니다.</p>
        <button
          onClick={onClose}
          style={{ padding: '10px 24px', borderRadius: '999px', border: 'none', background: '#52B788', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
        >
          돌아가기
        </button>
      </section>
    );
  }

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
      <div
        style={{
          position: 'sticky',
          top: 0,
          backgroundColor: 'rgba(255,255,255,0.9)',
          backdropFilter: 'blur(8px)',
          zIndex: 10,
          padding: '16px 20px',
          borderBottom: '1px solid #F1F3F5',
          display: 'flex',
          alignItems: 'center'
        }}
      >
        <button
          onClick={onClose}
          aria-label="뒤로 가기"
          style={{ background: 'none', border: 'none', fontSize: '20px', color: '#1A1A1A', cursor: 'pointer', marginRight: '16px' }}
        >
          <i className="fas fa-arrow-left"></i>
        </button>
        <span style={{ fontWeight: '800', fontSize: '16px', color: '#1A1A1A' }}>{userData.displayName || '여행자'}</span>
      </div>

      {/* 프로필 영역 (MyPage 와 동일한 레이아웃) */}
      <div style={{ padding: '24px 20px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ padding: '3px', borderRadius: '50%', background: 'linear-gradient(45deg, #52B788, #b7e4c7)' }}>
            <img
              src={userData.photoURL || FALLBACK_AVATAR}
              alt=""
              onError={(e) => {
                e.currentTarget.src = FALLBACK_AVATAR;
              }}
              style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover', border: '3px solid #fff' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '20px', textAlign: 'center', flex: 1, justifyContent: 'center' }}>
            {[
              { value: posts.length, label: '게시물' },
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
            {userData.displayName || '여행자'}
          </h1>
          <p style={{ color: '#495057', fontSize: '14px', lineHeight: '1.4', margin: 0 }}>
            {userData.bio || '여행 기록을 남기는 중 ✈️'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
          {!isMe && (
            <button
              onClick={handleToggleFollow}
              disabled={isSubmitting}
              style={{
                flex: 1,
                padding: '8px',
                borderRadius: '8px',
                border: 'none',
                cursor: isSubmitting ? 'wait' : 'pointer',
                background: isFollowing ? '#E9ECEF' : '#52B788',
                color: isFollowing ? '#495057' : '#fff',
                fontSize: '13px',
                fontWeight: 'bold',
                opacity: isSubmitting ? 0.7 : 1,
                transition: 'all 0.2s'
              }}
            >
              {isFollowing ? '팔로잉' : '팔로우'}
            </button>
          )}
          <div
            style={{
              flex: 1,
              padding: '8px',
              borderRadius: '8px',
              background: '#EBFBEE',
              fontSize: '13px',
              fontWeight: 'bold',
              color: '#2B8A3E',
              textAlign: 'center'
            }}
          >
            📍 방문 장소 {totalPlaces}곳
          </div>
        </div>
      </div>

      {/* 게시물 그리드 */}
      <div style={{ display: 'flex', borderBottom: '1px solid #F1F3F5', backgroundColor: '#fff' }}>
        <div
          style={{
            flex: 1,
            padding: '14px 0',
            textAlign: 'center',
            color: '#1A1A1A',
            borderBottom: '2px solid #1A1A1A',
            fontSize: '18px'
          }}
        >
          <i className="fas fa-th"></i>
        </div>
      </div>

      <div style={{ paddingBottom: '80px' }}>
        <PostGrid posts={posts} onOpenModal={onOpenModal} emptyMessage="아직 등록된 기록이 없습니다." />
      </div>
    </section>
  );
};

export default UserProfilePage;
