import React, { useState, useEffect, useMemo } from 'react';
import RouteMap from '../components/RouteMap';
import { formatTime, USERS } from '../data';
import { collection, query, orderBy, doc, updateDoc, arrayUnion, arrayRemove, increment, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebase';

const HomeTab = ({ following, onOpenModal }) => {
  const [posts, setPosts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    setIsLoading(true);
    const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const fetchedPosts = [];
      querySnapshot.forEach((doc) => {
        fetchedPosts.push({ id: doc.id, ...doc.data() });
      });
      setPosts(fetchedPosts);
      setIsLoading(false);
    }, (error) => {
      console.error("게시물 실시간 불러오기 실패:", error);
      setIsLoading(false);
    });

    return () => unsubscribe(); 
  }, []);

  const handleToggleLike = async (e, postId, currentLikedBy = []) => {
    e.stopPropagation(); 
    const user = auth.currentUser;
    
    // 🚨 개선: 비로그인 유저에게 명확한 피드백 제공
    if (!user) {
      alert("좋아요를 누르려면 먼저 로그인해주세요! 🔒");
      return;
    }

    const postRef = doc(db, 'posts', postId);
    const isLiked = currentLikedBy.includes(user.uid); 

    try {
      await updateDoc(postRef, {
        likedBy: isLiked ? arrayRemove(user.uid) : arrayUnion(user.uid),
        likes: increment(isLiked ? -1 : 1)
      });
    } catch (error) {
      console.error("좋아요 서버 반영 실패:", error);
    }
  };

  // 🚨 개선: 피드 데이터가 많아질 것을 대비한 연산 최적화
  const displayPosts = useMemo(() => {
    if (filter === 'following') {
      return posts.filter(p => following && following.includes(p.userId));
    } 
    
    if (filter === 'popular') {
      // 불변성을 지키기 위해 스프레드 연산자로 복사 후 정렬
      return [...posts].sort((a, b) => (b.likes || 0) - (a.likes || 0));
    } 
    
    if (filter === 'nearby') {
      // TODO: 추후 navigator.geolocation으로 현재 내 위치(위도/경도)를 가져온 후,
      // post.route[0] 의 좌표와 거리를 계산(Haversine formula 등)하여 가까운 순으로 정렬하는 로직 추가 예정!
      return posts.slice(0, 2); 
    }
    
    return posts; // 'all' 일 때
  }, [posts, filter, following]);

  return (
    <section className="tab-page active" style={{ overflowY: 'auto' }}>
      <div className="discover-header">
        <h2 className="section-title" style={{ fontSize: '1.2rem', marginBottom: '0' }}>최신 여정</h2>
      </div>

      <div className="feed-filter">
        {['all', 'following', 'nearby', 'popular'].map(f => (
          <button 
            key={f}
            className={`filter-chip ${filter === f ? 'active' : ''}`} 
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? '전체' : f === 'following' ? '팔로잉' : f === 'nearby' ? '내 주변' : '인기'}
          </button>
        ))}
      </div>

      <div id="feed-container">
        {isLoading ? (
          <div className="loading-spinner">게시물을 실시간으로 불러오는 중...</div>
        ) : displayPosts.length === 0 ? (
          <div className="empty-state" style={{ padding: '40px', textAlign: 'center' }}>
            <p>게시물이 없습니다.</p>
          </div>
        ) : (
          displayPosts.map(post => {
            const userName = post.authorName || USERS.find(u => u.id === post.userId)?.name || '여행자';
            const userAvatar = post.authorAvatar || USERS.find(u => u.id === post.userId)?.avatar || 'https://api.dicebear.com/7.x/adventurer/svg?seed=fallback';
            
            const isLiked = post.likedBy?.includes(auth.currentUser?.uid);
            const likeCount = Math.max(0, post.likes || 0); 
            
            return (
              <article key={post.id} className="post-card" onClick={() => onOpenModal(post.id)}>
                <header className="post-card-header" onClick={(e) => e.stopPropagation()}>
                  <img className="post-avatar" src={userAvatar} alt={userName} />
                  <div className="post-user-info">
                    <div className="post-username">{userName}</div>
                    <div className="post-meta">📍 {post.route && post.route[0]?.name ? post.route[0].name : '위치 알 수 없음'} · {post.createdAt ? formatTime(post.createdAt) : ''}</div>
                  </div>
                  <button className="post-menu-btn"><i className="fas fa-ellipsis-h"></i></button>
                </header>

                <div className="post-route-map">
                  <RouteMap route={post.route || []} height="160px" />
                  <div className="route-title-overlay">
                    <h4>{post.title}</h4>
                    <div className="route-stops-count">{post.route ? post.route.length : 0}개 장소</div>
                  </div>
                </div>

                <div className="post-body">
                  <div className="post-text">{post.body}</div>
                </div>

                <div className="post-actions" onClick={(e) => e.stopPropagation()}>
                  <button className={`action-btn ${isLiked ? 'liked' : ''}`} onClick={(e) => handleToggleLike(e, post.id, post.likedBy)}>
                    <i className={isLiked ? "fas fa-heart" : "far fa-heart"}></i> <span className="like-count">{likeCount}</span>
                  </button>
                  <button className="action-btn" onClick={() => onOpenModal(post.id)}>
                    <i className="far fa-comment"></i> {post.comments || 0}
                  </button>
                  <button className={`action-btn ${post.saved ? 'saved' : ''}`}>
                    <i className={post.saved ? "fas fa-bookmark" : "far fa-bookmark"}></i> {post.saves || 0}
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
};

export default HomeTab;