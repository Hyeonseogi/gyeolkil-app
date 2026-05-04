import React, { useState } from 'react';
import RouteMap from './RouteMap';
import { USERS, formatTime } from '../data';

const PostModal = ({ post, onClose, onAddComment, following, onToggleFollow, onToggleLike }) => {
  const [commentText, setCommentText] = useState('');
  if (!post) return null;

  const user = USERS.find(u => u.id === post.userId) || { name: '여행자', avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=fallback' };
  const isFollowing = following.includes(post.userId);
  const isMe = post.userId === 'u1'; // u1을 현재 로그인한 내 계정으로 가정

  const handleCommentSubmit = () => {
    if (!commentText.trim()) return;
    onAddComment(post.id, commentText);
    setCommentText(''); // 입력창 초기화
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target.className === 'modal-overlay' && onClose()}>
      <div className="modal-sheet">
        <div className="modal-drag-handle"></div>
        <button className="modal-close-btn" onClick={onClose}><i className="fas fa-times"></i></button>
        
        <div className="modal-user-row">
          <img className="modal-avatar" src={user.avatar} alt={user.name} />
          <div className="modal-user-info">
            <div className="modal-username">{user.name}</div>
            <div className="modal-user-meta">📍 {post.route[0]?.name || ''} · {formatTime(post.createdAt)}</div>
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
            <RouteMap route={post.route} height="200px" />
          </div>
        </div>

        <div className="modal-body-section" style={{ marginTop: '16px' }}>
          <h2 className="modal-title">{post.title}</h2>
          <p className="modal-text">{post.body}</p>
        </div>

        <div className="modal-actions">
          <button className={`modal-action-btn ${post.liked ? 'liked' : ''}`} onClick={() => onToggleLike(post.id)}>
            <i className={post.liked ? "fas fa-heart" : "far fa-heart"}></i>
            <span>{post.likes}</span>
          </button>
          <button className="modal-action-btn">
            <i className="far fa-comment"></i>
            <span>{post.comments}</span>
          </button>
        </div>

        <div className="modal-comments">
          <h3>댓글 {post.comments}개</h3>
          <div id="modal-comment-list">
            {post.commentList?.map(c => {
              const cUser = USERS.find(u => u.id === c.userId) || { name: '사용자', avatar: '' };
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
            <img src="https://api.dicebear.com/7.x/adventurer/svg?seed=user1" alt="나" style={{width:'30px', height:'30px', borderRadius:'50%'}} />
            <input 
              type="text" 
              placeholder="댓글 추가..." 
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCommentSubmit()}
            />
            <button className="comment-send-btn" onClick={handleCommentSubmit}>
              <i className="fas fa-paper-plane"></i>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PostModal;