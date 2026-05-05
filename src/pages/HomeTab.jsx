import React, { useState, useEffect } from 'react';
import RouteMap from '../components/RouteMap';
import { formatTime, USERS } from '../data';
// 🆕 파이어베이스 기능 불러오기 (addDoc 추가됨)
import { collection, getDocs, query, orderBy, addDoc } from 'firebase/firestore';
import { db } from '../firebase';

const HomeTab = ({ following, onToggleLike, onOpenModal }) => {
  const [posts, setPosts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  // 화면이 처음 켜질 때 파이어베이스에서 게시물 가져오기
  useEffect(() => {
    const fetchPosts = async () => {
      setIsLoading(true);
      try {
        const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'));
        const querySnapshot = await getDocs(q);
        
        const fetchedPosts = [];
        querySnapshot.forEach((doc) => {
          fetchedPosts.push({ id: doc.id, ...doc.data() });
        });
        
        setPosts(fetchedPosts);
      } catch (error) {
        console.error("게시물 불러오기 실패:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPosts();
  }, []);


  // 팔로잉 피드 필터링 적용
  let displayPosts = posts;
  if (filter === 'following') {
    displayPosts = posts.filter(p => following && following.includes(p.userId));
  } else if (filter === 'popular') {
    displayPosts = [...posts].sort((a, b) => (b.likes || 0) - (a.likes || 0));
  } else if (filter === 'nearby') {
    displayPosts = posts.slice(0, 2); // TODO: 나중에 GPS 기반 진짜 위치 로직으로 고도화
  }

  return (
    <section className="tab-page active" style={{ overflowY: 'auto' }}>
      

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
          <div className="loading-spinner">게시물을 불러오는 중...</div>
        ) : displayPosts.length === 0 ? (
          <div className="empty-state" style={{ padding: '40px', textAlign: 'center' }}>
            <p>게시물이 없습니다.</p>
          </div>
        ) : (
          displayPosts.map(post => {
            // Firestore에 저장된 userId가 'u1' 등일 때, 기존 USERS 데이터와 매칭
            const user = USERS.find(u => u.id === post.userId) || { name: '여행자', avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=fallback' };
            
            return (
              <article key={post.id} className="post-card" onClick={() => onOpenModal(post.id)}>
                <header className="post-card-header" onClick={(e) => e.stopPropagation()}>
                  <img className="post-avatar" src={user.avatar} alt={user.name} />
                  <div className="post-user-info">
                    <div className="post-username">{user.name}</div>
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
                  <button className={`action-btn ${post.liked ? 'liked' : ''}`} onClick={() => onToggleLike(post.id)}>
                    <i className={post.liked ? "fas fa-heart" : "far fa-heart"}></i> <span className="like-count">{post.likes || 0}</span>
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