import React, { useState } from 'react';
import RouteMap from '../components/RouteMap';
import { formatTime, USERS } from '../data';

const HomeTab = ({ posts, following, onToggleLike, onOpenModal }) => {
  const [filter, setFilter] = useState('all');

  // 팔로잉 피드 필터링 적용
  let displayPosts = posts;
  if (filter === 'following') {
    displayPosts = posts.filter(p => following.includes(p.userId));
  } else if (filter === 'popular') {
    displayPosts = [...posts].sort((a, b) => b.likes - a.likes);
  } else if (filter === 'nearby') {
    displayPosts = posts.slice(0, 2); // 샘플 데이터
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
        {displayPosts.length === 0 && (
          <div className="empty-state" style={{ padding: '40px', textAlign: 'center' }}>
            <p>게시물이 없습니다.</p>
          </div>
        )}
        
        {displayPosts.map(post => {
          const user = USERS.find(u => u.id === post.userId) || { name: '여행자', avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=fallback' };
          
          return (
            <article key={post.id} className="post-card" onClick={() => onOpenModal(post.id)}>
              <header className="post-card-header" onClick={(e) => e.stopPropagation()}>
                <img className="post-avatar" src={user.avatar} alt={user.name} />
                <div className="post-user-info">
                  <div className="post-username">{user.name}</div>
                  <div className="post-meta">📍 {post.route[0]?.name || ''} · {formatTime(post.createdAt)}</div>
                </div>
                <button className="post-menu-btn"><i className="fas fa-ellipsis-h"></i></button>
              </header>

              <div className="post-route-map">
                <RouteMap route={post.route} height="160px" />
                <div className="route-title-overlay">
                  <h4>{post.title}</h4>
                  <div className="route-stops-count">{post.route.length}개 장소</div>
                </div>
              </div>

              <div className="post-body">
                <div className="post-text">{post.body}</div>
              </div>

              <div className="post-actions" onClick={(e) => e.stopPropagation()}>
                {/* 좋아요 버튼 연동 */}
                <button className={`action-btn ${post.liked ? 'liked' : ''}`} onClick={() => onToggleLike(post.id)}>
                  <i className={post.liked ? "fas fa-heart" : "far fa-heart"}></i> <span className="like-count">{post.likes}</span>
                </button>
                <button className="action-btn" onClick={() => onOpenModal(post.id)}>
                  <i className="far fa-comment"></i> {post.comments}
                </button>
                <button className={`action-btn ${post.saved ? 'saved' : ''}`}>
                  <i className={post.saved ? "fas fa-bookmark" : "far fa-bookmark"}></i> {post.saves}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};

export default HomeTab;