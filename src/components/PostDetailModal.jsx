import React, { useState, useEffect, useRef } from 'react';
import { 
  doc, onSnapshot, collection, query, orderBy, 
  addDoc, serverTimestamp, updateDoc, arrayUnion, 
  arrayRemove, increment, getDoc, setDoc 
} from 'firebase/firestore';
import { db, auth } from '../firebase'; 
import RouteMap from './RouteMap';
import { formatTime, USERS } from '../data';

const PostDetailModal = ({ postId, onClose, onOpenUser }) => {
  const [post, setPost] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // 댓글 상태 관리
  const [comments, setComments] = useState([]);
  const [commentInput, setCommentInput] = useState('');

  // 인터랙티브 마커 & 장소명 수정 상태
  const [activeIndex, setActiveIndex] = useState(0);
  const [isEditingName, setIsEditingName] = useState(null);
  const [editValue, setEditValue] = useState('');

  // 스크롤 방지
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = 'auto'; };
  }, []);

  // 게시물 단건 & 댓글 목록 실시간 감시
  useEffect(() => {
    if (!postId) return;
    setIsLoading(true);
    
    // 1. 게시물 데이터 실시간 감시
    const postRef = doc(db, 'posts', postId);
    const unsubscribePost = onSnapshot(postRef, (docSnap) => {
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

    // 2. 댓글 데이터 실시간 감시 (작성순)
    const commentsQuery = query(collection(db, 'posts', postId, 'comments'), orderBy('createdAt', 'asc'));
    const unsubscribeComments = onSnapshot(commentsQuery, (snapshot) => {
      const arr = [];
      snapshot.forEach((docSnap) => {
        arr.push({ id: docSnap.id, ...docSnap.data() });
      });
      setComments(arr);
    });

    return () => {
      unsubscribePost();
      unsubscribeComments();
    }; 
  }, [postId]);

  // 게시물 본문 좋아요
  const handleToggleLike = async () => {
    const user = auth.currentUser;
    if (!user) { alert("좋아요를 누르려면 로그인이 필요합니다! 🔒"); return; }
    if (!post) return;

    const postRef = doc(db, 'posts', post.id);
    const currentLikedBy = post.likedBy || [];
    const isLiked = currentLikedBy.includes(user.uid);

    try {
      await updateDoc(postRef, {
        likedBy: isLiked ? arrayRemove(user.uid) : arrayUnion(user.uid),
        likes: increment(isLiked ? -1 : 1)
      });
    } catch (error) { console.error("좋아요 업데이트 실패:", error); }
  };

  // 댓글 작성 DB 연동
  const handleAddComment = async () => {
    const user = auth.currentUser;
    if (!user) { alert('로그인이 필요합니다.'); return; }
    if (!commentInput.trim()) return;

    try {
      // users 문서 보장 및 commentedPosts 업데이트
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        await setDoc(userRef, {
          uid: user.uid, displayName: user.displayName, email: user.email, photoURL: user.photoURL,
          followers: [], following: [], likedPosts: [], savedPosts: [], commentedPosts: []
        });
      }

      // 댓글 생성
      await addDoc(collection(db, 'posts', postId, 'comments'), {
        text: commentInput,
        userId: user.uid,
        authorName: user.displayName,
        authorAvatar: user.photoURL,
        createdAt: serverTimestamp(),
        likes: 0,
        likedBy: [],
        replies: []
      });

      // 게시물 댓글 수 증가
      await updateDoc(doc(db, 'posts', postId), { comments: increment(1) });

      // 유저의 commentedPosts 배열에 추가
      const latestUserSnap = await getDoc(userRef);
      const existing = latestUserSnap.data()?.commentedPosts || [];
      if (!existing.includes(postId)) {
        await updateDoc(userRef, { commentedPosts: arrayUnion(postId) });
      }

      setCommentInput(''); // 인풋 초기화
    } catch (error) {
      console.error('댓글 작성 실패:', error);
    }
  };

  // 사진 슬라이드 및 마커 인덱스 추출
  const handlePhotoScroll = (e) => {
    const { scrollLeft, clientWidth } = e.target;
    if (clientWidth === 0) return;
    const index = Math.round(scrollLeft / clientWidth);
    if (index !== activeIndex && index < (post?.route?.length || 0)) {
      setActiveIndex(index);
    }
  };

  const handleUpdateSpotName = async (index) => {
    if (!editValue.trim() || editValue === post.route[index].name) return setIsEditingName(null);
    const updatedRoute = [...post.route];
    updatedRoute[index].name = editValue;
    try {
      await updateDoc(doc(db, 'posts', post.id), { route: updatedRoute });
    } catch (err) {
      console.error("장소명 서버 수정 실패:", err);
    } finally {
      setIsEditingName(null);
    }
  };

  if (!postId) return null;

  const userName = post?.authorName || USERS?.find(u => u.id === post?.userId)?.name || '여행자';
  const userAvatar = post?.authorAvatar || USERS?.find(u => u.id === post?.userId)?.avatar || 'https://api.dicebear.com/7.x/adventurer/svg?seed=fallback';
  const isLiked = post?.likedBy?.includes(auth.currentUser?.uid);
  const likeCount = Math.max(0, post?.likes || 0); 
  const isMyPost = auth.currentUser?.uid === post?.userId;

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()} style={{ cursor: 'pointer', display: 'flex', alignItems: 'flex-end', position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 999 }}>
      
      <div className="modal-sheet" style={{ cursor: 'default', width: '100%', height: '94vh', backgroundColor: '#fff', borderTopLeftRadius: '24px', borderTopRightRadius: '24px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        
        {/* 상단 핸들러 & 닫기 버튼 */}
        <div className="modal-drag-handle" style={{ width: '40px', height: '4px', backgroundColor: '#E5E7EB', borderRadius: '2px', margin: '12px auto 4px' }}></div>
        <button onClick={onClose} style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', fontSize: '20px', color: '#ADB5BD', cursor: 'pointer', zIndex: 10 }}>
          <i className="fas fa-times"></i>
        </button>

        {isLoading ? (
          <div className="loading-spinner" style={{ padding: '80px 0', textAlign: 'center', color: '#888' }}>상세 내용을 불러오는 중... 🧭</div>
        ) : post ? (
          <div className="modal-scroll-container" style={{ flex: 1, overflowY: 'auto', paddingBottom: '20px' }}>
            
            {/* 유저 헤더 로우 */}
            <div className="modal-user-row" style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', gap: '12px' }}>
              <img className="modal-avatar" src={userAvatar} alt="프로필" style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover' }} onClick={() => onOpenUser && onOpenUser(post.userId)} />
              <div className="modal-user-info" style={{ flex: 1 }}>
                <div className="modal-username" style={{ fontWeight: 'bold', fontSize: '14px', color: '#1A1A1A' }}>{userName}</div>
                <div className="modal-user-meta" style={{ fontSize: '11px', color: '#ADB5BD', marginTop: '2px' }}>
                  {post.createdAt ? formatTime(post.createdAt) : ''} · {post.region === 'seoul' ? '서울' : '기타 지역'}
                </div>
              </div>
              {!isMyPost && <button className="modal-follow-btn" style={{ padding: '6px 14px', borderRadius: '20px', border: '1px solid #1A1A1A', background: 'none', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}>팔로우</button>}
            </div>

            {/* 🗺️ 고정 경로 지도 영역 ( highlightIndex 연동 ) */}
            <div className="modal-route-section" style={{ borderBottom: '1px solid #F1F3F5' }}>
              <div className="modal-route-canvas-wrap" style={{ width: '100%', position: 'relative' }}>
                <RouteMap route={post.route} detailedPath={post.detailedPath} height="220px" highlightIndex={activeIndex} />
              </div>
            </div>

            {/* 본문 텍스트 설명란 */}
            <div className="modal-body-section" style={{ padding: '16px' }}>
              <h2 className="modal-title" style={{ fontSize: '18px', fontWeight: '800', color: '#1A1A1A', marginBottom: '8px' }}>{post.title}</h2>
              <div className="modal-text" style={{ fontSize: '14px', color: '#495057', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>{post.body}</div>
              {post.tags && post.tags.length > 0 && (
                <div className="modal-tags" style={{ marginTop: '10px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {post.tags.map((tag, idx) => <span key={idx} className="post-tag" style={{ color: '#52B788', fontSize: '12px', fontWeight: '600' }}>#{tag}</span>)}
                </div>
              )}
            </div>

            {/* 📸 사진 스택 영역 (마커 인터랙션 연동) */}
            {post.route?.some(spot => spot.photo) && (
              <div className="modal-photos-section" style={{ position: 'relative', width: '100%', aspectRatio: '1 / 1', backgroundColor: '#F8F9FA', overflow: 'hidden', borderTop: '1px solid #F1F3F5' }}>
                <div className="modal-photos-scroll" onScroll={handlePhotoScroll} style={{ display: 'flex', width: '100%', height: '100%', overflowX: 'auto', scrollSnapType: 'x mandatory', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                  {post.route.map((spot, idx) => (
                    <div key={idx} className="modal-photo-item" style={{ width: '100%', height: '100%', flexShrink: 0, scrollSnapAlign: 'start', position: 'relative' }}>
                      <img src={spot.photo || 'https://via.placeholder.com/400'} alt={spot.name} className="modal-photo-img" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      
                      {/* 인라인 장소 이름 수정 오버레이 */}
                      <div className="modal-photo-tag" style={{ position: 'absolute', bottom: '16px', left: '16px', backgroundColor: 'rgba(0,0,0,0.7)', color: '#fff', padding: '6px 14px', borderRadius: '20px', fontSize: '13px', fontWeight: 'bold', zIndex: 2 }}>
                        {isEditingName === idx ? (
                          <input 
                            value={editValue} onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => handleUpdateSpotName(idx)} onKeyDown={(e) => e.key === 'Enter' && handleUpdateSpotName(idx)}
                            autoFocus style={{ border: 'none', background: '#fff', color: '#000', borderRadius: '4px', padding: '1px 6px', outline: 'none', fontSize: '12px', fontWeight: 'bold' }}
                          />
                        ) : (
                          <div onClick={() => { if(isMyPost) { setIsEditingName(idx); setEditValue(spot.name); } }} style={{ cursor: isMyPost ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {idx + 1}. {spot.name} {isMyPost && <i className="fas fa-pen" style={{ fontSize: '10px', opacity: 0.6 }}></i>}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ position: 'absolute', top: '16px', right: '16px', backgroundColor: 'rgba(0,0,0,0.6)', color: '#fff', padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold', zIndex: 2 }}>
                  {activeIndex + 1} / {post.route?.length}
                </div>
              </div>
            )}

            {/* ⏱️ 여정 정보 타임라인 */}
            <div className="modal-timeline-section" style={{ padding: '20px 16px', borderTop: '8px solid #F1F3F5', backgroundColor: '#fff' }}>
              <h3 style={{ fontSize: '15px', fontWeight: '800', color: '#1A1A1A', marginBottom: '16px' }}>⏱️ 여정 타임라인</h3>
              {post.route?.map((spot, i) => {
                let stayTimeMins = 0;
                if (i < post.route.length - 1) {
                  const nextSpot = post.route[i + 1];
                  const timeDiffMins = Math.round(Math.abs(nextSpot.timestamp - spot.timestamp) / 60000);
                  const travelTime = spot.travelTimeToNext || 0;
                  stayTimeMins = Math.max(0, timeDiffMins - travelTime);
                }
                const isCurrent = activeIndex === i;
                return (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column' }}>
                    <div className="timeline-row" style={{ display: 'flex', gap: '14px', padding: '10px 8px', borderRadius: '12px', backgroundColor: isCurrent ? '#F1F9F5' : 'transparent', transition: 'all 0.2s' }}>
                      <div className="node-badge" style={{ width: '22px', height: '22px', borderRadius: '50%', backgroundColor: isCurrent ? '#52B788' : '#ADB5BD', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 'bold', flexShrink: 0, marginTop: '2px' }}>{i + 1}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 'bold', fontSize: '14px', color: isCurrent ? '#2D6A4F' : '#1A1A1A' }}>{spot.name}</div>
                        {i < post.route.length - 1 && stayTimeMins > 0 && <div style={{ fontSize: '12px', color: '#666', marginTop: '3px' }}>☕ 약 <strong>{stayTimeMins}분</strong> 머무름</div>}
                      </div>
                    </div>
                    {i < post.route.length - 1 && (
                      <div className="timeline-connector" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '2px 0 2px 18px' }}>
                        <div style={{ width: '2px', height: '10px', backgroundColor: '#E5E7EB' }}></div>
                        <div style={{ background: '#F3F4F6', color: '#4B5563', padding: '3px 10px', borderRadius: '10px', fontSize: '10px', fontWeight: '600', margin: '2px 0', whiteSpace: 'nowrap' }}>
                          {spot.transitType === 'walk' ? '🚶 도보' : '🚗 차량'} 이동 (약 {spot.travelTimeToNext || 5}분)
                        </div>
                        <div style={{ width: '2px', height: '10px', backgroundColor: '#E5E7EB' }}></div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* 하단 좋아요 등 액션 버튼 */}
            <div className="modal-actions" style={{ display: 'flex', gap: '20px', padding: '16px', borderTop: '1px solid #F1F3F5', fontSize: '18px' }}>
              <button className={`modal-action-btn ${isLiked ? 'liked' : ''}`} onClick={handleToggleLike} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', display:'flex', alignItems:'center', gap:'6px' }}>
                <i className={isLiked ? "fas fa-heart" : "far fa-heart"} style={{ color: isLiked ? '#e63946' : '#495057' }}></i> {likeCount}
              </button>
              <button className="modal-action-btn" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color:'#495057', display:'flex', alignItems:'center', gap:'6px' }}><i className="far fa-comment"></i> {post.comments || 0}</button>
              <button className="modal-action-btn" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color:'#495057', display:'flex', alignItems:'center', gap:'6px', marginLeft:'auto' }}><i className="far fa-bookmark"></i> {post.saves || 0}</button>
            </div>
            
            {/* 💬 실시간 댓글 렌더링 영역 */}
            <div className="modal-comments" style={{ padding: '0 16px 24px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 'bold', marginBottom: '16px' }}>댓글 {post.comments || 0}개</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {comments.map((comment) => (
                  <div key={comment.id} style={{ display: 'flex', gap: '12px' }}>
                    <img src={comment.authorAvatar} alt="" style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover' }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                        <span style={{ fontWeight: 'bold', fontSize: '13px' }}>{comment.authorName}</span>
                        {/* 🚨 [버그 해결!] 파이어베이스 시간 객체를 밀리초로 변환하는 방어 로직 추가! */}
                        <span style={{ fontSize: '11px', color: '#ADB5BD' }}>
                          {formatTime(comment.createdAt?.toMillis ? comment.createdAt.toMillis() : Date.now())}
                        </span>
                      </div>
                      <div style={{ fontSize: '14px', color: '#1A1A1A', lineHeight: '1.4' }}>{comment.text}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        ) : (
          <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>데이터를 찾을 수 없습니다.</div>
        )}

        {/* 실시간 댓글 입력 하단 고정 바 */}
        {post && (
          <div className="modal-comment-input-bar" style={{ padding: '12px 16px', borderTop: '1px solid #F1F3F5', backgroundColor: '#fff', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <img src={auth.currentUser?.photoURL || "https://api.dicebear.com/7.x/adventurer/svg?seed=my"} alt="내 프로필" style={{ width: '32px', height: '32px', borderRadius: '50%' }} />
            <input 
              type="text" 
              placeholder="댓글을 남겨보세요..." 
              value={commentInput}
              onChange={(e) => setCommentInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
              style={{ flex: 1, border: 'none', background: '#F8F9FA', borderRadius: '20px', padding: '10px 14px', outline: 'none', fontSize: '13px' }}
            />
            <button onClick={handleAddComment} disabled={!commentInput.trim()} style={{ background: 'none', border: 'none', color: commentInput.trim() ? '#52B788' : '#ADB5BD', cursor: commentInput.trim() ? 'pointer' : 'default', fontSize: '16px', padding: '0 8px' }}>
              <i className="fas fa-paper-plane"></i>
            </button>
          </div>
        )}

      </div>
      
      <style>{`
        .modal-photos-scroll::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
};

export default PostDetailModal;