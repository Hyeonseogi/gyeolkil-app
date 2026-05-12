import React, { useState, useEffect } from 'react';
import { doc, updateDoc, arrayUnion, arrayRemove, increment, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebase'; 
import RouteMap from './RouteMap';
import { formatTime, USERS } from '../data';

const PostDetailModal = ({ postId, onClose }) => {
  const [post, setPost] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // 🚨 추가: 다음 팀원이 바로 쓸 수 있도록 댓글 입력 상태 미리 세팅
  const [commentText, setCommentText] = useState('');

  // 1. 뒤로가기 스크롤 방지 로직 추가
  useEffect(() => {
    document.body.style.overflow = 'hidden'; // 열릴 때 스크롤 막기
    return () => {
      document.body.style.overflow = 'auto'; // 닫힐 때 스크롤 복구
    };
  }, []);

  useEffect(() => {
    if (!postId) return;
    setIsLoading(true);
    
    const docRef = doc(db, 'posts', postId);

    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        setPost({ id: docSnap.id, ...docSnap.data() });
      } else {
        console.log("해당 게시물이 없습니다!");
      }
      setIsLoading(false);
    }, (error) => {
      console.error("모달 실시간 데이터 오류:", error);
      setIsLoading(false);
    });

    return () => unsubscribe(); 
  }, [postId]);

  const handleToggleLike = async () => {
    const user = auth.currentUser;
    // 2. 비로그인 유저 예외 처리 알림
    if (!user) {
      alert("좋아요를 누르려면 로그인이 필요합니다! 🔒");
      return;
    }
    if (!post) return;

    const postRef = doc(db, 'posts', post.id);
    const currentLikedBy = post.likedBy || [];
    const isLiked = currentLikedBy.includes(user.uid);

    try {
      await updateDoc(postRef, {
        likedBy: isLiked ? arrayRemove(user.uid) : arrayUnion(user.uid),
        likes: increment(isLiked ? -1 : 1)
      });
    } catch (error) {
      console.error("모달 좋아요 업데이트 실패:", error);
    }
  };

  // 3. 더 안전한 오버레이 클릭 감지
  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!postId) return null;

  const userName = post?.authorName || USERS?.find(u => u.id === post?.userId)?.name || '여행자';
  const userAvatar = post?.authorAvatar || USERS?.find(u => u.id === post?.userId)?.avatar || 'https://api.dicebear.com/7.x/adventurer/svg?seed=fallback';
  
  const isLiked = post?.likedBy?.includes(auth.currentUser?.uid);
  const likeCount = Math.max(0, post?.likes || 0); 

  return (
    <div className="modal-overlay" onClick={handleOverlayClick} style={{ cursor: 'pointer' }}>
      {/* cursor: default를 주어 모달 안쪽 클릭 시 포인터가 남는 것을 방지 */}
      <div className="modal-sheet" style={{ cursor: 'default' }}>
        <div className="modal-drag-handle"></div>
        <button className="modal-close-btn" onClick={onClose}>
          <i className="fas fa-times"></i>
        </button>

        {isLoading ? (
          <div className="loading-spinner" style={{ padding: '80px 0' }}>상세 내용을 불러오는 중...</div>
        ) : post ? (
          <>
            <div className="modal-user-row">
              <img className="modal-avatar" src={userAvatar} alt="프로필" />
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
                <RouteMap route={post.route} detailedPath={post.detailedPath} height="160px" />
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
              <button className={`modal-action-btn ${isLiked ? 'liked' : ''}`} onClick={handleToggleLike}>
                <i className={isLiked ? "fas fa-heart" : "far fa-heart"} style={{ color: isLiked ? '#e63946' : 'inherit' }}></i> {likeCount}
              </button>
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
                <img className="comment-avatar" src={auth.currentUser?.photoURL || "https://api.dicebear.com/7.x/adventurer/svg?seed=my"} alt="내 프로필" />
                {/* 4. 상태 연결 완료! 팀원이 onClick 이벤트만 달면 됩니다. */}
                <input 
                  type="text" 
                  placeholder="멋진 코스네요! 댓글을 남겨보세요..." 
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && alert("댓글 작성 기능은 곧 업데이트됩니다!")}
                />
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