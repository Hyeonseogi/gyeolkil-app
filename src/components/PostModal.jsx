import React, { useState, useEffect } from 'react';
import RouteMap from './RouteMap';
import { USERS, formatTime } from '../data';

const PostModal = ({ post, onClose, onAddComment, following, onToggleFollow, onToggleLike }) => {
  const [commentText, setCommentText] = useState('');

  // 1. 모달이 열려있는 동안 배경 피드 스크롤 방지
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'auto'; // 모달 닫힐 때 원래대로 복구
    };
  }, []);

  if (!post) return null;

  const user = USERS.find(u => u.id === post.userId) || { name: '여행자', avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=fallback' };
  
  // following 배열이 undefined일 경우를 대비한 안전한 처리
  const safeFollowing = following || [];
  const isFollowing = safeFollowing.includes(post.userId);
  const isMe = post.userId === 'u1'; // TODO: 추후 실제 로그인된 auth.currentUser.uid 로 변경 필요

  const handleCommentSubmit = () => {
    if (!commentText.trim()) return;
    onAddComment(post.id, commentText);
    setCommentText(''); 
  };

  return (
    // 2. 더 안전하고 정확한 오버레이 배경 클릭 감지
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()} style={{ cursor: 'pointer' }}>
      <div className="modal-sheet" style={{ cursor: 'default' }}>
        <div className="modal-drag-handle"></div>
        <button className="modal-close-btn" onClick={onClose}><i className="fas fa-times"></i></button>
        
        <div className="modal-user-row">
          <img className="modal-avatar" src={user.avatar} alt={user.name} />
          <div className="modal-user-info">
            <div className="modal-username">{user.name}</div>
            {/* 3. post.route 배열이 비어있을 경우를 대비한 방어적 접근 */}
            <div className="modal-user-meta">📍 {post.route?.[0]?.name || '위치 정보 없음'} · {formatTime(post.createdAt)}</div>
          </div>
          {!isMe && (
            <button 
              className={`modal-follow-btn ${isFollowing ? 'following' : ''}`} 
              onClick={() => onToggleFollow(post.userId)}
            >
              {isFollowing ? '팔로잉' : '팔로우'}
            </button>
          )}
        </div>

        <div className="modal-route-section">
          <h3>🗺 여행 루트</h3>
          <div className="modal-route-canvas-wrap" style={{ height: '200px' }}>
            <RouteMap route={post.route || []} height="200px" />
          </div>
        </div>

        <div className="modal-body-section" style={{ marginTop: '16px' }}>
          <h2 className="modal-title">{post.title}</h2>
          <p className="modal-text">{post.body}</p>
        </div>

        <div className="modal-actions">
          <button className={`modal-action-btn ${post.liked ? 'liked' : ''}`} onClick={() => onToggleLike(post.id)}>
            <i className={post.liked ? "fas fa-heart" : "far fa-heart"} style={{ color: post.liked ? '#e63946' : 'inherit' }}></i>
            <span>{Math.max(0, post.likes || 0)}</span>
          </button>
          <button className="modal-action-btn">
            <i className="far fa-comment"></i>
            <span>{post.comments || 0}</span>
          </button>
        </div>

        <div className="modal-comments">
          <h3>댓글 {post.comments || 0}개</h3>
          <div id="modal-comment-list">
            {/* 3. commentList가 비어있어도 에러가 나지 않도록 빈 배열([]) 폴백 추가 */}
            {(post.commentList || []).map(c => {
              const cUser = USERS.find(u => u.id === c.userId) || { name: '사용자', avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=fallback' };
              return (
                <div key={c.id} className="comment-item">
                  <img className="comment-avatar" src={cUser.avatar} alt={cUser.name} />
                  <div className="comment-body">
                    <div className="comment-username">{cUser.name}</div>
                    <div className="comment-text">{c.text}</div>
                    <div className="comment-time">{formatTime(c.createdAt)}</div>
                  </div>
                </div>
              );
            })}
          </div>
          
          <div className="add-comment-row" style={{ marginTop: '12px' }}>
            {/* TODO: 추후 본인의 프로필 이미지(auth.currentUser.photoURL)로 교체 */}
            <img src="https://api.dicebear.com/7.x/adventurer/svg?seed=user1" alt="나" style={{width:'30px', height:'30px', borderRadius:'50%'}} />
            <input 
              type="text" 
              placeholder="댓글 추가..." 
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCommentSubmit()}
            />
            <button className="comment-send-btn" onClick={handleCommentSubmit} disabled={!commentText.trim()}>
              <i className="fas fa-paper-plane"></i>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PostModal;