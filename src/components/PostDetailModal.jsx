import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  doc,
  onSnapshot,
  collection,
  query,
  orderBy,
  addDoc,
  serverTimestamp,
  updateDoc,
  arrayUnion,
  arrayRemove,
  increment,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  writeBatch
} from 'firebase/firestore';
import { db } from '../firebase';
import RouteMap from './RouteMap';
import {
  FALLBACK_AVATAR,
  REGION_LABELS,
  createSocialNotification,
  formatTime,
  getTimestampValue,
  showToast
} from '../data';

// 매 렌더마다 새 배열이 만들어지면 아래 useMemo 가 무의미해지므로 고정 상수를 쓴다.
const EMPTY_ROUTE = [];

const PostDetailModal = ({ postId, currentUser, onClose, onOpenUser }) => {
  const [post, setPost] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // 댓글 & 대댓글
  const [comments, setComments] = useState([]);
  const [commentInput, setCommentInput] = useState('');
  const [replyingTo, setReplyingTo] = useState(null); // { commentId, authorName, userId }
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 사진 슬라이드 & 장소명 수정
  // 게시물이 바뀌면 인덱스도 0 으로 돌아가야 하므로 게시물별로 따로 기억한다.
  const [indexByPost, setIndexByPost] = useState({});
  const activeIndex = indexByPost[postId] || 0;
  const [isEditingName, setIsEditingName] = useState(null);
  const [editValue, setEditValue] = useState('');

  const [isFollowingAuthor, setIsFollowingAuthor] = useState(false);

  // 모달이 열려 있는 동안 배경 스크롤 방지 + ESC 로 닫기
  useEffect(() => {
    if (!postId) return undefined;

    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [postId, onClose]);

  // 게시물 & 댓글 실시간 구독
  useEffect(() => {
    if (!postId) return undefined;

    const unsubscribePost = onSnapshot(doc(db, 'posts', postId), (docSnap) => {
      setPost(docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null);
      setIsLoading(false);
    });

    const commentsQuery = query(collection(db, 'posts', postId, 'comments'), orderBy('createdAt', 'asc'));
    const unsubscribeComments = onSnapshot(commentsQuery, (snapshot) => {
      setComments(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
    });

    return () => {
      unsubscribePost();
      unsubscribeComments();
    };
  }, [postId]);

  // 작성자를 팔로우 중인지 추적 (내 글이면 팔로우 버튼 자체가 없으므로 구독하지 않는다)
  useEffect(() => {
    if (!currentUser || !post?.userId || currentUser.uid === post.userId) return undefined;

    const unsubscribe = onSnapshot(doc(db, 'users', currentUser.uid), (snap) => {
      setIsFollowingAuthor(!!snap.data()?.following?.includes(post.userId));
    });

    return () => unsubscribe();
  }, [post?.userId, currentUser]);

  const isMyPost = currentUser?.uid && currentUser.uid === post?.userId;
  const isLiked = !!currentUser && post?.likedBy?.includes(currentUser.uid);
  const isSaved = !!currentUser && post?.savedBy?.includes(currentUser.uid);

  // 사진이 있는 지점만 슬라이드로 보여준다. (없는 지점까지 넣으면 빈 이미지가 뜬다)
  const route = Array.isArray(post?.route) ? post.route : EMPTY_ROUTE;
  const photoSpots = useMemo(
    () => route.map((spot, routeIndex) => ({ spot, routeIndex })).filter(({ spot }) => spot?.photo),
    [route]
  );

  // 현재 보고 있는 사진이 경로의 몇 번째 지점인지 (지도 마커 강조에 사용)
  const highlightIndex = photoSpots[activeIndex]?.routeIndex ?? null;

  const handleToggleLike = async () => {
    if (!currentUser) {
      showToast('좋아요를 누르려면 로그인이 필요합니다. 🔒', 'error');
      return;
    }
    if (!post) return;

    const liked = (post.likedBy || []).includes(currentUser.uid);

    try {
      await updateDoc(doc(db, 'posts', post.id), {
        likedBy: liked ? arrayRemove(currentUser.uid) : arrayUnion(currentUser.uid),
        likes: increment(liked ? -1 : 1)
      });
      await updateDoc(doc(db, 'users', currentUser.uid), {
        likedPosts: liked ? arrayRemove(post.id) : arrayUnion(post.id)
      });

      if (!liked && post.userId !== currentUser.uid) {
        await createSocialNotification({
          receiverId: post.userId,
          sender: currentUser,
          type: 'like',
          postId: post.id,
          postPreview: post.title || post.body || ''
        });
      }
    } catch (error) {
      console.error('좋아요 업데이트 실패:', error);
      showToast('처리에 실패했습니다.', 'error');
    }
  };

  const handleToggleSave = async () => {
    if (!currentUser) {
      showToast('로그인이 필요합니다. 🔒', 'error');
      return;
    }
    if (!post) return;

    const saved = (post.savedBy || []).includes(currentUser.uid);

    try {
      await updateDoc(doc(db, 'posts', post.id), {
        savedBy: saved ? arrayRemove(currentUser.uid) : arrayUnion(currentUser.uid),
        saves: increment(saved ? -1 : 1)
      });
      await updateDoc(doc(db, 'users', currentUser.uid), {
        savedPosts: saved ? arrayRemove(post.id) : arrayUnion(post.id)
      });
      showToast(saved ? '저장을 취소했습니다.' : '저장했습니다.');
    } catch (error) {
      console.error('저장 처리 실패:', error);
      showToast('처리에 실패했습니다.', 'error');
    }
  };

  const handleToggleFollowAuthor = async () => {
    if (!currentUser || !post?.userId) {
      showToast('로그인이 필요합니다.', 'error');
      return;
    }
    if (currentUser.uid === post.userId) return;

    try {
      if (isFollowingAuthor) {
        await updateDoc(doc(db, 'users', currentUser.uid), { following: arrayRemove(post.userId) });
        await updateDoc(doc(db, 'users', post.userId), { followers: arrayRemove(currentUser.uid) });
      } else {
        await updateDoc(doc(db, 'users', currentUser.uid), { following: arrayUnion(post.userId) });
        await updateDoc(doc(db, 'users', post.userId), { followers: arrayUnion(currentUser.uid) });
        await createSocialNotification({
          receiverId: post.userId,
          sender: currentUser,
          type: 'follow',
          targetUserId: post.userId
        });
      }
    } catch (error) {
      console.error('팔로우 처리 실패:', error);
      showToast('처리에 실패했습니다.', 'error');
    }
  };

  /** 게시물 삭제 — 하위 댓글까지 함께 지운다 (문서만 지우면 댓글이 남는다) */
  const handleDeletePost = async () => {
    if (!window.confirm('정말 이 여정을 삭제하시겠습니까?\n삭제된 데이터는 복구할 수 없습니다.')) return;

    try {
      const commentsSnap = await getDocs(collection(db, 'posts', postId, 'comments'));
      const docs = commentsSnap.docs;

      for (let i = 0; i < docs.length; i += 400) {
        const batch = writeBatch(db);
        docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }

      await deleteDoc(doc(db, 'posts', postId));
      showToast('게시물이 삭제되었습니다.');
      onClose();
    } catch (error) {
      console.error('게시물 삭제 실패:', error);
      showToast('삭제에 실패했습니다.', 'error');
    }
  };

  // 댓글 & 대댓글 작성
  const handleAddComment = async () => {
    if (!currentUser) {
      showToast('로그인이 필요합니다.', 'error');
      return;
    }

    const safeComment = commentInput.trim();
    if (!safeComment || isSubmitting) return;

    setIsSubmitting(true);
    try {
      if (replyingTo) {
        await updateDoc(doc(db, 'posts', postId, 'comments', replyingTo.commentId), {
          replies: arrayUnion({
            id: `${Date.now()}_${currentUser.uid}`,
            text: safeComment,
            userId: currentUser.uid,
            authorName: currentUser.displayName || '여행자',
            authorAvatar: currentUser.photoURL || FALLBACK_AVATAR,
            createdAt: Date.now()
          })
        });

        // 답글은 원 댓글 작성자에게 알린다.
        if (replyingTo.userId && replyingTo.userId !== currentUser.uid) {
          await createSocialNotification({
            receiverId: replyingTo.userId,
            sender: currentUser,
            type: 'reply',
            postId,
            previewText: safeComment,
            postPreview: post?.title || ''
          });
        }
        setReplyingTo(null);
      } else {
        const userRef = doc(db, 'users', currentUser.uid);
        const userSnap = await getDoc(userRef);

        // 유저 문서가 없는 예외 상황(수동 삭제 등)을 대비해 복구한다.
        if (!userSnap.exists()) {
          await setDoc(userRef, {
            uid: currentUser.uid,
            displayName: currentUser.displayName || '여행자',
            email: currentUser.email,
            photoURL: currentUser.photoURL || '',
            followers: [],
            following: [],
            likedPosts: [],
            savedPosts: [],
            commentedPosts: []
          });
        }

        await addDoc(collection(db, 'posts', postId, 'comments'), {
          text: safeComment,
          userId: currentUser.uid,
          authorName: currentUser.displayName || '여행자',
          authorAvatar: currentUser.photoURL || FALLBACK_AVATAR,
          createdAt: serverTimestamp(),
          likes: 0,
          likedBy: [],
          replies: []
        });

        await updateDoc(doc(db, 'posts', postId), {
          comments: increment(1),
          commentedUserIds: arrayUnion(currentUser.uid)
        });

        await updateDoc(userRef, { commentedPosts: arrayUnion(postId) });

        if (post && post.userId !== currentUser.uid) {
          await createSocialNotification({
            receiverId: post.userId,
            sender: currentUser,
            type: 'comment',
            postId,
            previewText: safeComment,
            postPreview: post.title || post.body || ''
          });
        }
      }

      setCommentInput('');
    } catch (error) {
      console.error('댓글 작성 실패:', error);
      showToast('댓글을 남기지 못했습니다.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteComment = async (commentId) => {
    if (!window.confirm('댓글을 삭제하시겠습니까?')) return;

    try {
      await deleteDoc(doc(db, 'posts', postId, 'comments', commentId));
      await updateDoc(doc(db, 'posts', postId), { comments: increment(-1) });
    } catch (error) {
      console.error('댓글 삭제 실패:', error);
      showToast('삭제에 실패했습니다.', 'error');
    }
  };

  const handleDeleteReply = async (commentId, replyObj) => {
    if (!window.confirm('답글을 삭제하시겠습니까?')) return;

    try {
      await updateDoc(doc(db, 'posts', postId, 'comments', commentId), { replies: arrayRemove(replyObj) });
    } catch (error) {
      console.error('대댓글 삭제 실패:', error);
      showToast('삭제에 실패했습니다.', 'error');
    }
  };

  const handlePhotoScroll = (e) => {
    const { scrollLeft, clientWidth } = e.currentTarget;
    if (clientWidth === 0) return;
    const index = Math.round(scrollLeft / clientWidth);
    if (index !== activeIndex && index < photoSpots.length) {
      setIndexByPost((prev) => ({ ...prev, [postId]: index }));
    }
  };

  const handleUpdateSpotName = useCallback(
    async (routeIndex) => {
      const trimmed = editValue.trim();
      const route = post?.route || [];

      if (!trimmed || trimmed === route[routeIndex]?.name) {
        setIsEditingName(null);
        return;
      }

      // 원본을 직접 고치지 않고 새 배열을 만들어 교체한다.
      const updatedRoute = route.map((spot, i) => (i === routeIndex ? { ...spot, name: trimmed } : spot));

      try {
        await updateDoc(doc(db, 'posts', post.id), { route: updatedRoute });
      } catch (error) {
        console.error('장소명 수정 실패:', error);
        showToast('장소 이름을 바꾸지 못했습니다.', 'error');
      } finally {
        setIsEditingName(null);
      }
    },
    [editValue, post]
  );

  if (!postId) return null;

  const userName = post?.authorName || '여행자';
  const userAvatar = post?.authorAvatar || FALLBACK_AVATAR;
  const likeCount = Math.max(0, post?.likes || 0);
  const regionLabel = post?.region ? REGION_LABELS[post.region] || post.region : null;

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="여정 상세"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'flex-end',
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(0,0,0,0.6)',
        zIndex: 999
      }}
    >
      <div
        className="modal-sheet"
        style={{
          cursor: 'default',
          width: '100%',
          height: '94vh',
          backgroundColor: '#fff',
          borderTopLeftRadius: '24px',
          borderTopRightRadius: '24px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          position: 'relative'
        }}
      >
        <div className="modal-drag-handle" style={{ width: '40px', height: '4px', backgroundColor: '#E5E7EB', borderRadius: '2px', margin: '12px auto 4px' }}></div>
        <button
          onClick={onClose}
          aria-label="닫기"
          style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', fontSize: '20px', color: '#ADB5BD', cursor: 'pointer', zIndex: 10 }}
        >
          <i className="fas fa-times"></i>
        </button>

        {isLoading ? (
          <div className="loading-spinner" style={{ padding: '80px 0', textAlign: 'center', color: '#888' }}>
            상세 내용을 불러오는 중... 🧭
          </div>
        ) : post ? (
          <div className="modal-scroll-container" style={{ flex: 1, overflowY: 'auto', paddingBottom: '20px' }}>
            {/* 작성자 */}
            <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', gap: '12px', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, overflow: 'hidden' }}>
                <img
                  src={userAvatar}
                  alt=""
                  onError={(e) => {
                    e.currentTarget.src = FALLBACK_AVATAR;
                  }}
                  style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover', cursor: 'pointer' }}
                  onClick={() => onOpenUser && onOpenUser(post.userId)}
                />
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <div
                    role="button"
                    tabIndex={0}
                    style={{ fontWeight: 'bold', fontSize: '14px', color: '#1A1A1A', cursor: 'pointer' }}
                    onClick={() => onOpenUser && onOpenUser(post.userId)}
                    onKeyDown={(e) => e.key === 'Enter' && onOpenUser && onOpenUser(post.userId)}
                  >
                    {userName}
                  </div>
                  <div style={{ fontSize: '11px', color: '#ADB5BD', marginTop: '2px' }}>
                    {formatTime(post.createdAt)}
                    {regionLabel ? ` · ${regionLabel}` : ''}
                  </div>
                </div>
              </div>

              <div>
                {isMyPost ? (
                  <button
                    onClick={handleDeletePost}
                    style={{ padding: '6px 12px', borderRadius: '8px', border: 'none', background: '#ffe3e3', color: '#e63946', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}
                  >
                    <i className="fas fa-trash-alt" style={{ marginRight: '4px' }}></i>삭제
                  </button>
                ) : (
                  <button
                    onClick={handleToggleFollowAuthor}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '20px',
                      border: isFollowingAuthor ? '1px solid #DEE2E6' : '1px solid #1A1A1A',
                      background: isFollowingAuthor ? '#F1F3F5' : 'transparent',
                      color: isFollowingAuthor ? '#495057' : '#1A1A1A',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      cursor: 'pointer'
                    }}
                  >
                    {isFollowingAuthor ? '팔로잉' : '팔로우'}
                  </button>
                )}
              </div>
            </div>

            {/* 경로 지도 */}
            <div style={{ borderBottom: '1px solid #F1F3F5' }}>
              <RouteMap route={post.route} detailedPath={post.detailedPath} height="220px" highlightIndex={highlightIndex} />
            </div>

            {/* 본문 */}
            <div style={{ padding: '16px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '800', color: '#1A1A1A', marginBottom: '8px' }}>{post.title}</h2>
              <div style={{ fontSize: '14px', color: '#495057', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>{post.body}</div>
              {post.tags?.length > 0 && (
                <div style={{ marginTop: '10px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {post.tags.map((tag, idx) => (
                    <span key={`${tag}-${idx}`} style={{ color: '#52B788', fontSize: '12px', fontWeight: '600' }}>
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* 사진 */}
            {photoSpots.length > 0 && (
              <div style={{ position: 'relative', width: '100%', aspectRatio: '1 / 1', backgroundColor: '#F8F9FA', overflow: 'hidden', borderTop: '1px solid #F1F3F5' }}>
                <div
                  className="modal-photos-scroll"
                  onScroll={handlePhotoScroll}
                  style={{ display: 'flex', width: '100%', height: '100%', overflowX: 'auto', scrollSnapType: 'x mandatory', scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                  {photoSpots.map(({ spot, routeIndex }) => (
                    <div key={routeIndex} style={{ width: '100%', height: '100%', flexShrink: 0, scrollSnapAlign: 'start', position: 'relative' }}>
                      <img src={spot.photo} alt={spot.name || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <div
                        style={{
                          position: 'absolute',
                          bottom: '16px',
                          left: '16px',
                          backgroundColor: 'rgba(0,0,0,0.7)',
                          color: '#fff',
                          padding: '6px 14px',
                          borderRadius: '20px',
                          fontSize: '13px',
                          fontWeight: 'bold',
                          zIndex: 2
                        }}
                      >
                        {isEditingName === routeIndex ? (
                          <input
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => handleUpdateSpotName(routeIndex)}
                            onKeyDown={(e) => e.key === 'Enter' && handleUpdateSpotName(routeIndex)}
                            autoFocus
                            aria-label="장소 이름 수정"
                            style={{ border: 'none', background: '#fff', color: '#000', borderRadius: '4px', padding: '1px 6px', outline: 'none', fontSize: '12px', fontWeight: 'bold' }}
                          />
                        ) : (
                          <div
                            role={isMyPost ? 'button' : undefined}
                            tabIndex={isMyPost ? 0 : undefined}
                            onClick={() => {
                              if (!isMyPost) return;
                              setIsEditingName(routeIndex);
                              setEditValue(spot.name || '');
                            }}
                            style={{ cursor: isMyPost ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: '6px' }}
                          >
                            {routeIndex + 1}. {spot.name || '이름 없는 장소'}
                            {isMyPost && <i className="fas fa-pen" style={{ fontSize: '10px', opacity: 0.6 }}></i>}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {photoSpots.length > 1 && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '16px',
                      right: '16px',
                      backgroundColor: 'rgba(0,0,0,0.6)',
                      color: '#fff',
                      padding: '4px 10px',
                      borderRadius: '12px',
                      fontSize: '11px',
                      fontWeight: 'bold',
                      zIndex: 2
                    }}
                  >
                    {activeIndex + 1} / {photoSpots.length}
                  </div>
                )}
              </div>
            )}

            {/* 여정 타임라인 */}
            {post.route?.length > 0 && (
              <div style={{ padding: '20px 16px', borderTop: '8px solid #F1F3F5', backgroundColor: '#fff' }}>
                <h3 style={{ fontSize: '15px', fontWeight: '800', color: '#1A1A1A', marginBottom: '16px' }}>⏱️ 여정 타임라인</h3>

                {post.route.map((spot, i) => {
                  const nextSpot = post.route[i + 1];
                  let stayTimeMins = 0;

                  if (nextSpot && spot.timestamp && nextSpot.timestamp) {
                    const timeDiffMins = Math.round(Math.abs(nextSpot.timestamp - spot.timestamp) / 60000);
                    stayTimeMins = Math.max(0, timeDiffMins - (spot.travelTimeToNext || 0));
                  }

                  const isCurrent = highlightIndex === i;

                  return (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column' }}>
                      <div
                        style={{
                          display: 'flex',
                          gap: '14px',
                          padding: '10px 8px',
                          borderRadius: '12px',
                          backgroundColor: isCurrent ? '#F1F9F5' : 'transparent',
                          transition: 'all 0.2s'
                        }}
                      >
                        <div
                          style={{
                            width: '22px',
                            height: '22px',
                            borderRadius: '50%',
                            backgroundColor: isCurrent ? '#52B788' : '#ADB5BD',
                            color: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '11px',
                            fontWeight: 'bold',
                            flexShrink: 0,
                            marginTop: '2px'
                          }}
                        >
                          {i + 1}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 'bold', fontSize: '14px', color: isCurrent ? '#2D6A4F' : '#1A1A1A' }}>
                            {spot.name || '이름 없는 장소'}
                          </div>
                          {stayTimeMins > 0 && (
                            <div style={{ fontSize: '12px', color: '#666', marginTop: '3px' }}>
                              ☕ 약 <strong>{stayTimeMins}분</strong> 머무름
                            </div>
                          )}
                        </div>
                      </div>

                      {nextSpot && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '2px 0 2px 18px' }}>
                          <div style={{ width: '2px', height: '10px', backgroundColor: '#E5E7EB' }}></div>
                          <div style={{ background: '#F3F4F6', color: '#4B5563', padding: '3px 10px', borderRadius: '10px', fontSize: '10px', fontWeight: '600', margin: '2px 0', whiteSpace: 'nowrap' }}>
                            {spot.transitType === 'walk' ? '🚶 도보' : '🚗 차량'} 이동
                            {spot.travelTimeToNext ? ` (약 ${spot.travelTimeToNext}분)` : ''}
                          </div>
                          <div style={{ width: '2px', height: '10px', backgroundColor: '#E5E7EB' }}></div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* 액션 */}
            <div style={{ display: 'flex', gap: '20px', padding: '16px', borderTop: '1px solid #F1F3F5' }}>
              <button
                onClick={handleToggleLike}
                aria-label={isLiked ? '좋아요 취소' : '좋아요'}
                aria-pressed={isLiked}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <i className={isLiked ? 'fas fa-heart' : 'far fa-heart'} style={{ color: isLiked ? '#e63946' : '#495057' }}></i> {likeCount}
              </button>

              <div style={{ fontSize: '16px', color: '#495057', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <i className="far fa-comment"></i> {comments.length}
              </div>

              <button
                onClick={handleToggleSave}
                aria-label={isSaved ? '저장 취소' : '저장'}
                aria-pressed={isSaved}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: '#495057', display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}
              >
                <i className={isSaved ? 'fas fa-bookmark' : 'far fa-bookmark'} style={{ color: isSaved ? '#2B8A3E' : '#495057' }}></i>{' '}
                {Math.max(0, post.saves || 0)}
              </button>
            </div>

            {/* 댓글 */}
            <div style={{ padding: '0 16px 24px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 'bold', marginBottom: '16px' }}>댓글 {comments.length}개</h3>

              {comments.length === 0 ? (
                <p style={{ fontSize: '13px', color: '#ADB5BD', textAlign: 'center', padding: '20px 0', margin: 0 }}>
                  첫 번째 댓글을 남겨보세요!
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {comments.map((comment) => (
                    <div key={comment.id} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ display: 'flex', gap: '12px' }}>
                        <img
                          src={comment.authorAvatar || FALLBACK_AVATAR}
                          alt=""
                          onError={(e) => {
                            e.currentTarget.src = FALLBACK_AVATAR;
                          }}
                          style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover' }}
                        />
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                            <span style={{ fontWeight: 'bold', fontSize: '13px' }}>{comment.authorName}</span>
                            <span style={{ fontSize: '11px', color: '#ADB5BD' }}>
                              {/* 서버 시각이 아직 반영되지 않았으면 '방금 전' 으로 보인다 */}
                              {getTimestampValue(comment.createdAt) ? formatTime(comment.createdAt) : '방금 전'}
                            </span>
                          </div>
                          <div style={{ fontSize: '14px', color: '#1A1A1A', lineHeight: '1.4', whiteSpace: 'pre-wrap' }}>{comment.text}</div>

                          <div style={{ display: 'flex', gap: '12px', marginTop: '6px' }}>
                            <button
                              onClick={() => setReplyingTo({ commentId: comment.id, authorName: comment.authorName, userId: comment.userId })}
                              style={{ background: 'none', border: 'none', color: '#ADB5BD', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', padding: 0 }}
                            >
                              답글 달기
                            </button>
                            {currentUser?.uid === comment.userId && (
                              <button
                                onClick={() => handleDeleteComment(comment.id)}
                                style={{ background: 'none', border: 'none', color: '#e63946', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', padding: 0 }}
                              >
                                삭제
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {comment.replies?.length > 0 && (
                        <div style={{ marginLeft: '48px', display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '2px' }}>
                          {comment.replies.map((reply) => (
                            <div key={reply.id} style={{ display: 'flex', gap: '10px' }}>
                              <img
                                src={reply.authorAvatar || FALLBACK_AVATAR}
                                alt=""
                                onError={(e) => {
                                  e.currentTarget.src = FALLBACK_AVATAR;
                                }}
                                style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover' }}
                              />
                              <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                                  <span style={{ fontWeight: 'bold', fontSize: '12px' }}>{reply.authorName}</span>
                                  <span style={{ fontSize: '11px', color: '#ADB5BD' }}>{formatTime(reply.createdAt)}</span>
                                </div>
                                <div style={{ fontSize: '13px', color: '#1A1A1A', lineHeight: '1.4', whiteSpace: 'pre-wrap' }}>{reply.text}</div>
                                {currentUser?.uid === reply.userId && (
                                  <div style={{ marginTop: '4px' }}>
                                    <button
                                      onClick={() => handleDeleteReply(comment.id, reply)}
                                      style={{ background: 'none', border: 'none', color: '#e63946', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', padding: 0 }}
                                    >
                                      삭제
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>
            삭제되었거나 찾을 수 없는 여정입니다.
          </div>
        )}

        {/* 댓글 입력 */}
        {post && (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {replyingTo && (
              <div style={{ width: '100%', padding: '8px 16px', backgroundColor: '#F1F3F5', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: '#495057' }}>
                <span>
                  <strong>{replyingTo.authorName}</strong>님에게 답글 남기는 중...
                </span>
                <button onClick={() => setReplyingTo(null)} aria-label="답글 취소" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ADB5BD' }}>
                  <i className="fas fa-times"></i>
                </button>
              </div>
            )}

            <div style={{ padding: '12px 16px', borderTop: '1px solid #F1F3F5', backgroundColor: '#fff', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <img
                src={currentUser?.photoURL || FALLBACK_AVATAR}
                alt=""
                onError={(e) => {
                  e.currentTarget.src = FALLBACK_AVATAR;
                }}
                style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }}
              />
              <input
                type="text"
                placeholder={replyingTo ? '답글을 입력하세요...' : '댓글을 남겨보세요...'}
                aria-label={replyingTo ? '답글 입력' : '댓글 입력'}
                value={commentInput}
                maxLength={300}
                onChange={(e) => setCommentInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
                style={{ flex: 1, border: 'none', background: '#F8F9FA', borderRadius: '20px', padding: '10px 14px', outline: 'none', fontSize: '13px' }}
              />
              <button
                onClick={handleAddComment}
                disabled={!commentInput.trim() || isSubmitting}
                aria-label="댓글 등록"
                style={{
                  background: 'none',
                  border: 'none',
                  color: commentInput.trim() ? '#52B788' : '#ADB5BD',
                  cursor: commentInput.trim() ? 'pointer' : 'default',
                  fontSize: '16px',
                  padding: '0 8px'
                }}
              >
                <i className="fas fa-paper-plane"></i>
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`.modal-photos-scroll::-webkit-scrollbar { display: none; }`}</style>
    </div>
  );
};

export default PostDetailModal;
