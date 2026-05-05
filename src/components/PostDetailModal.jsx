import React, { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import RouteMap from './RouteMap';
import { formatTime, USERS } from '../data';

const PostDetailModal = ({ postId, onClose }) => {
  const [post, setPost] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!postId) return;

    const fetchPostDetail = async () => {
      setIsLoading(true);
      try {
        const docRef = doc(db, 'posts', postId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          setPost({ id: docSnap.id, ...docSnap.data() });
        } else {
          console.log("해당 게시물이 없습니다!");
        }
      } catch (error) {
        console.error("게시물 상세 불러오기 실패:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPostDetail();
  }, [postId]);

  const handleOverlayClick = (e) => {
    if (e.target.className === 'modal-overlay') {
      onClose();
    }
  };

  if (!postId) return null;

  // 🚨 핵심 수정: 파이어베이스 데이터를 먼저 확인하고, 없으면 가짜 데이터를 쓰도록 변경
  const userName = post?.authorName || USERS?.find(u => u.id === post?.userId)?.name || '여행자';
  const userAvatar = post?.authorAvatar || USERS?.find(u => u.id === post?.userId)?.avatar || 'https://api.dicebear.com/7.x/adventurer/svg?seed=fallback';

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal-sheet">
        <div className="modal-drag-handle"></div>
        <button className="modal-close-btn" onClick={onClose}>
          <i className="fas fa-times"></i>
        </button>

        {isLoading ? (
          <div className="loading-spinner" style={{ padding: '80px 0' }}>상세 내용을 불러오는 중...</div>
        ) : post ? (
          <>
            <div className="modal-user-row">
              <img 
                className="modal-avatar" 
                src={userAvatar} 
                alt="프로필" 
              />
              <div className="modal-user-info">
                <div className="modal-username">{userName}</div>
                <div className="modal-user-meta">
                  {post.createdAt ? formatTime(post.createdAt) : ''} · {post.region === 'seoul' ? '서울' : post.region === 'jeju' ? '제주' : post.region === 'busan' ? '부산' : '기타 지역'}
                </div>
              </div>
              <button className="modal-follow-btn">팔로우</button>
            </div>

            <div className="modal-route-section">
              <h3>여행 경로</h3>
              <div className="modal-route-canvas-wrap">
                <RouteMap route={post.route || []} height="200px" />
              </div>
              <div className="modal-route-stops">
                {post.route?.map((spot, idx) => (
                  <div key={idx} className="modal-stop-item">
                    <div className="modal-stop-badge">
                      <span className="modal-stop-num">{idx + 1}</span>
                      <span className="modal-stop-name">{spot.name}</span>
                    </div>
                    {idx < post.route.length - 1 && <i className="fas fa-chevron-right modal-stop-arrow"></i>}
                  </div>
                ))}
              </div>
            </div>

            {post.route?.some(spot => spot.photo) && (
              <div className="modal-photos-section">
                <h3>장소 사진</h3>
                <div className="modal-photos-scroll">
                  {post.route.filter(spot => spot.photo).map((spot, idx) => (
                    <div key={idx} className="modal-photo-item">
                      <img src={spot.photo} alt={spot.name} className="modal-photo-img" />
                      <div className="modal-photo-tag">{spot.name}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="modal-body-section">
              <h2 className="modal-title">{post.title}</h2>
              <div className="modal-text">{post.body}</div>
              {post.tags && (
                <div className="modal-tags">
                  {post.tags.map((tag, idx) => <span key={idx} className="post-tag">#{tag}</span>)}
                </div>
              )}
            </div>

            <div className="modal-actions">
              <button className="modal-action-btn"><i className="far fa-heart"></i> {post.likes || 0}</button>
              <button className="modal-action-btn"><i className="far fa-comment"></i> {post.comments || 0}</button>
              <button className="modal-action-btn"><i className="far fa-bookmark"></i> {post.saves || 0}</button>
            </div>

            <div className="modal-route-cta">
              <div>
                <div className="modal-route-cta-text">이 코스 따라가기</div>
                <div className="modal-route-cta-sub">내 발자국 지도에 추가하고 길 안내 받기</div>
              </div>
              <i className="fas fa-arrow-right"></i>
            </div>
            
            <div className="modal-comments">
              <div className="add-comment-row">
                <img className="comment-avatar" src="https://api.dicebear.com/7.x/adventurer/svg?seed=my" alt="내 프로필" />
                <input type="text" placeholder="멋진 코스네요! 댓글을 남겨보세요..." />
                <button className="comment-send-btn"><i className="fas fa-paper-plane"></i></button>
              </div>
            </div>
          </>
        ) : (
          <div style={{ padding: '40px', textAlign: 'center' }}>데이터를 찾을 수 없습니다.</div>
        )}
      </div>
    </div>
  );
};

export default PostDetailModal;