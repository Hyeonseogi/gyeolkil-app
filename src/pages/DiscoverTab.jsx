import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import RouteMap from '../components/RouteMap';
import PostCard from '../components/PostCard';
import {
  collection,
  query,
  orderBy,
  limit,
  startAfter,
  getDocs,
  doc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  increment
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  FALLBACK_AVATAR,
  REGION_LABELS,
  createSocialNotification,
  extractRegionsFromRoute,
  getTimestampValue,
  showToast
} from '../data';

const PAGE_SIZE = 20;
const POPULAR_LIMIT = 4;

// 상단에 노출할 추천 키워드
const POPULAR_TAGS = ['#성수동', '#오션뷰', '#드라이브', '#맛집탐방', '#혼자여행', '#데이트', '#힐링'];

const toNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

/** 여러 필드명으로 저장됐을 수 있는 사진 URL 을 하나로 정리 */
const getSpotPhoto = (spot) => {
  if (!spot) return '';
  const candidates = [
    spot.photo,
    spot.photoUrl,
    spot.image,
    spot.imageUrl,
    spot.thumbnail,
    Array.isArray(spot.photos) ? spot.photos[0] : '',
    Array.isArray(spot.images) ? spot.images[0] : ''
  ];
  return candidates.find((value) => typeof value === 'string' && value.trim().length > 0) || '';
};

const normalizeRoute = (route) => {
  if (!Array.isArray(route)) return [];
  return route.map((spot, index) => ({
    ...spot,
    id: spot?.id || `spot-${index}`,
    name: spot?.name || spot?.title || spot?.placeName || '',
    lat: toNumber(spot?.lat ?? spot?.latitude ?? spot?.y),
    lng: toNumber(spot?.lng ?? spot?.longitude ?? spot?.x),
    photo: getSpotPhoto(spot)
  }));
};

/** 저장 형식이 조금씩 다른 게시글을 화면에서 쓰기 좋은 형태로 통일 */
const normalizePost = (post, index = 0) => {
  const route = normalizeRoute(post?.route);
  const likes = Array.isArray(post?.likedBy)
    ? post.likedBy.length
    : Number.isFinite(Number(post?.likes))
      ? Number(post.likes)
      : 0;
  const regions = extractRegionsFromRoute(route);

  return {
    ...post,
    id: post?.id || `post-${index}`,
    title: post?.title || '제목 없는 여행기',
    body: post?.body || '',
    authorName: post?.authorName || '여행자',
    authorAvatar: post?.authorAvatar || FALLBACK_AVATAR,
    likedBy: Array.isArray(post?.likedBy) ? post.likedBy : [],
    savedBy: Array.isArray(post?.savedBy) ? post.savedBy : [],
    likes,
    route,
    createdAtValue: getTimestampValue(post?.createdAt),
    regions,
    primaryRegion: regions[0] || null
  };
};

/** 검색 대상이 되는 텍스트 (제목 + 본문 + 작성자 + 태그 + 장소명) */
const searchTargetText = (post) => {
  const routeNames = Array.isArray(post?.route) ? post.route.map((spot) => spot?.name).filter(Boolean).join(' ') : '';
  const tags = Array.isArray(post?.tags) ? post.tags.join(' ') : '';
  return [post?.title, post?.body, post?.authorName, tags, routeNames].filter(Boolean).join(' ').toLowerCase();
};

const DiscoverTab = ({ currentUser, onOpenModal = () => {}, onOpenUser = () => {} }) => {
  const [region, setRegion] = useState('all');
  const [search, setSearch] = useState('');
  const [dbPosts, setDbPosts] = useState([]);
  const [popularPosts, setPopularPosts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  const lastVisibleRef = useRef(null);
  const loadMoreRef = useRef(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /** 인기 코스 — 좋아요 복합 색인이 없으면 최신 글 중에서 정렬해 대체한다. */
  const fetchPopularPosts = useCallback(async () => {
    try {
      const q = query(
        collection(db, 'posts'),
        orderBy('likes', 'desc'),
        orderBy('createdAt', 'desc'),
        limit(POPULAR_LIMIT)
      );
      const snapshot = await getDocs(q);
      if (!isMountedRef.current) return;
      setPopularPosts(snapshot.docs.map((d, i) => normalizePost({ id: d.id, ...d.data() }, i)));
    } catch (error) {
      console.warn('인기 게시물 색인이 없어 최신 글에서 대체합니다:', error?.code || error);
      try {
        const fallback = await getDocs(query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(50)));
        if (!isMountedRef.current) return;
        setPopularPosts(
          fallback.docs
            .map((d, i) => normalizePost({ id: d.id, ...d.data() }, i))
            .sort((a, b) => b.likes - a.likes || b.createdAtValue - a.createdAtValue)
            .slice(0, POPULAR_LIMIT)
        );
      } catch {
        if (isMountedRef.current) setPopularPosts([]);
      }
    }
  }, []);

  const fetchInitialPosts = useCallback(async () => {
    try {
      const snapshot = await getDocs(
        query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(PAGE_SIZE))
      );
      if (!isMountedRef.current) return;

      setDbPosts(snapshot.docs.map((d, i) => normalizePost({ id: d.id, ...d.data() }, i)));
      lastVisibleRef.current = snapshot.docs[snapshot.docs.length - 1] || null;
      setHasMore(snapshot.docs.length === PAGE_SIZE);
    } catch (error) {
      console.error('게시물 로드 실패:', error);
      if (isMountedRef.current) {
        setDbPosts([]);
        setHasMore(false);
      }
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  }, []);

  const loadMorePosts = useCallback(async () => {
    if (!hasMore || isLoadingMore || !lastVisibleRef.current) return;

    setIsLoadingMore(true);
    try {
      const snapshot = await getDocs(
        query(collection(db, 'posts'), orderBy('createdAt', 'desc'), startAfter(lastVisibleRef.current), limit(PAGE_SIZE))
      );
      if (!isMountedRef.current) return;

      setDbPosts((prev) => [...prev, ...snapshot.docs.map((d, i) => normalizePost({ id: d.id, ...d.data() }, prev.length + i))]);
      lastVisibleRef.current = snapshot.docs[snapshot.docs.length - 1] || lastVisibleRef.current;
      setHasMore(snapshot.docs.length === PAGE_SIZE);
    } catch (error) {
      console.error('게시물 추가 로드 실패:', error);
    } finally {
      if (isMountedRef.current) setIsLoadingMore(false);
    }
  }, [hasMore, isLoadingMore]);

  useEffect(() => {
    const loadFeed = async () => {
      await fetchInitialPosts();
      await fetchPopularPosts();
    };
    loadFeed();
  }, [fetchInitialPosts, fetchPopularPosts]);

  // 무한 스크롤
  useEffect(() => {
    const sentinel = loadMoreRef.current;
    if (!sentinel || !hasMore || isLoading || isLoadingMore) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMorePosts();
      },
      { root: null, rootMargin: '200px 0px', threshold: 0.1 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isLoading, isLoadingMore, loadMorePosts]);

  /** 목록/인기 카드 두 곳의 상태를 함께 갱신 (낙관적 업데이트) */
  const patchPost = useCallback((postId, updater) => {
    const apply = (list) => list.map((item) => (item.id === postId ? normalizePost(updater(item)) : item));
    setDbPosts(apply);
    setPopularPosts(apply);
  }, []);

  const handleToggleLike = async (e, post) => {
    e.stopPropagation();
    if (!currentUser) {
      showToast('로그인이 필요합니다. 🔒', 'error');
      return;
    }

    const likedBy = post.likedBy || [];
    const isLiked = likedBy.includes(currentUser.uid);
    const nextLikedBy = isLiked ? likedBy.filter((uid) => uid !== currentUser.uid) : [...likedBy, currentUser.uid];

    patchPost(post.id, (item) => ({ ...item, likedBy: nextLikedBy, likes: nextLikedBy.length }));

    try {
      await updateDoc(doc(db, 'posts', post.id), {
        likedBy: isLiked ? arrayRemove(currentUser.uid) : arrayUnion(currentUser.uid),
        likes: increment(isLiked ? -1 : 1)
      });
      await updateDoc(doc(db, 'users', currentUser.uid), {
        likedPosts: isLiked ? arrayRemove(post.id) : arrayUnion(post.id)
      });

      if (!isLiked && post.userId && post.userId !== currentUser.uid) {
        await createSocialNotification({
          receiverId: post.userId,
          sender: currentUser,
          type: 'like',
          postId: post.id,
          postPreview: post.title || post.body || ''
        });
      }
    } catch (error) {
      console.error('좋아요 처리 실패:', error);
      showToast('처리에 실패했습니다.', 'error');
      // 서버 반영이 실패했으니 화면을 원래대로 되돌린다.
      patchPost(post.id, (item) => ({ ...item, likedBy, likes: likedBy.length }));
    }
  };

  const handleToggleSave = async (e, post) => {
    e.stopPropagation();
    if (!currentUser) {
      showToast('로그인이 필요합니다. 🔒', 'error');
      return;
    }

    const savedBy = post.savedBy || [];
    const alreadySaved = savedBy.includes(currentUser.uid);
    const nextSavedBy = alreadySaved ? savedBy.filter((uid) => uid !== currentUser.uid) : [...savedBy, currentUser.uid];

    patchPost(post.id, (item) => ({ ...item, savedBy: nextSavedBy }));

    try {
      await updateDoc(doc(db, 'posts', post.id), {
        savedBy: alreadySaved ? arrayRemove(currentUser.uid) : arrayUnion(currentUser.uid),
        saves: increment(alreadySaved ? -1 : 1)
      });
      await updateDoc(doc(db, 'users', currentUser.uid), {
        savedPosts: alreadySaved ? arrayRemove(post.id) : arrayUnion(post.id)
      });
      showToast(alreadySaved ? '저장을 취소했습니다.' : '저장했습니다.');
    } catch (error) {
      console.error('저장 처리 실패:', error);
      showToast('처리에 실패했습니다.', 'error');
      patchPost(post.id, (item) => ({ ...item, savedBy }));
    }
  };

  const filteredPosts = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return [...dbPosts]
      .sort((a, b) => b.createdAtValue - a.createdAtValue)
      .filter((post) => {
        const matchRegion = region === 'all' || post.regions?.includes(region);
        const matchSearch = !keyword || searchTargetText(post).includes(keyword);
        return matchRegion && matchSearch;
      });
  }, [dbPosts, region, search]);

  return (
    <section
      className="tab-page active"
      style={{ overflowY: 'auto', backgroundColor: '#fff', height: '100%', display: 'flex', flexDirection: 'column' }}
    >
      {/* 검색 + 인기 태그 */}
      <div style={{ padding: '20px 16px 0', backgroundColor: '#fff', borderBottom: '1px solid #F1F3F5' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: '#F8F9FA',
            padding: '12px 16px',
            borderRadius: '16px',
            boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.02)'
          }}
        >
          <i className="fas fa-search" style={{ color: '#ADB5BD', marginRight: '10px', fontSize: '16px' }}></i>
          <input
            type="text"
            placeholder="여행지, 코스, 장소 검색..."
            aria-label="여정 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ border: 'none', background: 'transparent', flex: 1, outline: 'none', fontSize: '15px', color: '#1A1A1A' }}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              aria-label="검색어 지우기"
              style={{ background: 'none', border: 'none', color: '#ADB5BD', cursor: 'pointer', padding: '0 4px' }}
            >
              <i className="fas fa-times-circle" style={{ fontSize: '16px' }}></i>
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', margin: '14px 0', paddingBottom: '4px' }} className="photo-slider">
          {POPULAR_TAGS.map((tag) => {
            const tagText = tag.replace('#', '');
            const isActive = search === tagText;
            return (
              <button
                key={tag}
                onClick={() => setSearch(isActive ? '' : tagText)}
                aria-pressed={isActive}
                style={{
                  padding: '6px 14px',
                  borderRadius: '20px',
                  cursor: 'pointer',
                  flexShrink: 0,
                  fontWeight: 'bold',
                  fontSize: '13px',
                  transition: 'all 0.2s',
                  border: isActive ? 'none' : '1px solid #E5E7EB',
                  backgroundColor: isActive ? '#1A1A1A' : '#fff',
                  color: isActive ? '#fff' : '#495057'
                }}
              >
                {tag}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* 인기 코스 */}
        <div className="discover-section" style={{ padding: '20px 16px', backgroundColor: '#fff' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#1A1A1A', margin: '0 0 16px' }}>🔥 이번 주 인기 코스</h3>

          <div className="routes-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
            {isLoading && popularPosts.length === 0 ? (
              <div style={{ gridColumn: '1 / -1', padding: '20px', textAlign: 'center', color: '#ADB5BD', fontSize: '14px' }}>
                인기 루트를 분석 중입니다... 🧐
              </div>
            ) : popularPosts.length > 0 ? (
              popularPosts.map((post) => {
                const thumb = post.route?.find((spot) => spot.photo)?.photo || '';

                return (
                  <div
                    key={post.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onOpenModal(post.id)}
                    onKeyDown={(e) => e.key === 'Enter' && onOpenModal(post.id)}
                    style={{
                      cursor: 'pointer',
                      borderRadius: '16px',
                      border: '1px solid #E5E7EB',
                      overflow: 'hidden',
                      backgroundColor: '#fff',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
                    }}
                  >
                    <div style={{ height: '110px', backgroundColor: '#F8F9FA', position: 'relative' }}>
                      {thumb ? (
                        <img src={thumb} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <RouteMap route={post.route || []} detailedPath={post.detailedPath} height="110px" />
                      )}
                      <div
                        style={{
                          position: 'absolute',
                          top: '8px',
                          right: '8px',
                          backgroundColor: 'rgba(0,0,0,0.6)',
                          color: '#fff',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: 'bold'
                        }}
                      >
                        <i className="fas fa-heart" style={{ color: '#ff6b6b', marginRight: '4px' }}></i>
                        {post.likes || 0}
                      </div>
                    </div>
                    <div style={{ padding: '12px' }}>
                      <h4
                        style={{
                          fontSize: '14px',
                          fontWeight: 'bold',
                          color: '#1A1A1A',
                          margin: '0 0 4px 0',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}
                      >
                        {post.title}
                      </h4>
                      <p style={{ fontSize: '12px', color: '#868E96', margin: 0 }}>📍 {post.route?.length || 0}개의 스팟</p>
                    </div>
                  </div>
                );
              })
            ) : (
              <div style={{ gridColumn: '1 / -1', padding: '20px', textAlign: 'center', color: '#ADB5BD' }}>
                아직 인기 게시물이 없습니다.
              </div>
            )}
          </div>
        </div>

        {/* 지역 필터 */}
        <div style={{ padding: '0 0 16px', backgroundColor: '#fff', borderBottom: '8px solid #F1F3F5' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#1A1A1A', margin: '0 16px 12px' }}>🗺️ 어디로 떠날까요?</h3>
          <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', padding: '0 16px 8px' }} className="photo-slider">
            {Object.entries(REGION_LABELS).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setRegion(key)}
                aria-pressed={region === key}
                style={{
                  padding: '8px 18px',
                  borderRadius: '24px',
                  border: 'none',
                  cursor: 'pointer',
                  backgroundColor: region === key ? '#52B788' : '#F8F9FA',
                  color: region === key ? '#fff' : '#495057',
                  fontSize: '14px',
                  fontWeight: region === key ? 'bold' : '600',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.2s',
                  flexShrink: 0,
                  boxShadow: region === key ? '0 4px 12px rgba(82, 183, 136, 0.3)' : 'none'
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* 피드 */}
        <div id="feed-container" style={{ paddingBottom: '80px', backgroundColor: '#F1F3F5' }}>
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#ADB5BD' }}>
              <i className="fas fa-compass fa-spin" style={{ fontSize: '24px', marginBottom: '12px' }}></i>
              <div style={{ fontSize: '14px' }}>새로운 곁길을 탐색 중입니다...</div>
            </div>
          ) : filteredPosts.length === 0 ? (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: '#ADB5BD' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>📭</div>
              <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: '#495057', margin: '0 0 8px' }}>조건에 맞는 여정이 없어요</h3>
              <p style={{ fontSize: '14px', margin: 0 }}>다른 검색어나 지역을 선택해 보세요.</p>
            </div>
          ) : (
            filteredPosts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                currentUserId={currentUser?.uid}
                onOpenModal={onOpenModal}
                onOpenUser={onOpenUser}
                onToggleLike={handleToggleLike}
                onToggleSave={handleToggleSave}
              />
            ))
          )}

          {!isLoading && hasMore && <div ref={loadMoreRef} style={{ height: '24px', width: '100%' }} />}

          {isLoadingMore && (
            <div style={{ textAlign: 'center', padding: '18px 0 28px', color: '#ADB5BD', fontSize: '13px' }}>
              <i className="fas fa-spinner fa-spin" style={{ marginRight: '6px' }}></i>여정을 더 불러오는 중...
            </div>
          )}

          {!isLoading && !hasMore && filteredPosts.length > 0 && (
            <div style={{ textAlign: 'center', padding: '24px 0 32px', color: '#ADB5BD', fontSize: '12px' }}>
              더 이상 불러올 여정이 없습니다.
            </div>
          )}
        </div>
      </div>

      <style>{`.photo-slider::-webkit-scrollbar { display: none; }`}</style>
    </section>
  );
};

export default DiscoverTab;
