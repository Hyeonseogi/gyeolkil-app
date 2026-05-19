import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import RouteMap from '../components/RouteMap';
import { formatTime } from '../data';
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
  increment,
  getDoc
} from 'firebase/firestore';
import { db, auth } from '../firebase';

const PAGE_SIZE = 20;
const POPULAR_LIMIT = 4;
const EMPTY_POSTS = [];

const REGION_LABELS = {
  all: '전체',
  seoul: '서울',
  busan: '부산',
  jeju: '제주',
  jeonju: '전주',
  gyeongju: '경주'
};

// 🚨 [NEW] 상단에 노출할 트렌디한 추천 키워드 태그 목록
const POPULAR_TAGS = ['#성수동', '#오션뷰', '#드라이브', '#맛집탐방', '#혼자여행', '#데이트', '#힐링'];

const FALLBACK_AVATAR = 'https://api.dicebear.com/7.x/adventurer/svg?seed=fallback';

const toNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const extractCreatedAtValue = (createdAt) => {
  if (!createdAt) return 0;
  if (typeof createdAt === 'number') return createdAt;
  if (createdAt?.seconds) return createdAt.seconds * 1000;
  if (typeof createdAt?.toMillis === 'function') return createdAt.toMillis();
  const parsed = new Date(createdAt).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const getRegionFromCoords = (lat, lng) => {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat >= 37.41 && lat <= 37.72 && lng >= 126.76 && lng <= 127.18) return 'seoul';
  if (lat >= 35.00 && lat <= 35.32 && lng >= 128.80 && lng <= 129.35) return 'busan';
  if (lat >= 33.10 && lat <= 33.60 && lng >= 126.10 && lng <= 126.98) return 'jeju';
  if (lat >= 35.74 && lat <= 35.91 && lng >= 126.95 && lng <= 127.22) return 'jeonju';
  if (lat >= 35.74 && lat <= 36.05 && lng >= 128.90 && lng <= 129.45) return 'gyeongju';
  return null;
};

const extractRegionsFromRoute = (route) => {
  if (!Array.isArray(route)) return [];
  const found = new Set();
  route.forEach((spot) => {
    const lat = toNumber(spot?.lat ?? spot?.latitude ?? spot?.y);
    const lng = toNumber(spot?.lng ?? spot?.longitude ?? spot?.x);
    const regionKey = getRegionFromCoords(lat, lng);
    if (regionKey) found.add(regionKey);
  });
  return [...found];
};

const getSpotPhoto = (spot) => {
  if (!spot) return '';
  const candidates = [
    spot?.photo, spot?.photoUrl, spot?.image, spot?.imageUrl, spot?.thumbnail,
    Array.isArray(spot?.photos) ? spot.photos[0] : '',
    Array.isArray(spot?.images) ? spot.images[0] : ''
  ];
  return candidates.find((value) => typeof value === 'string' && value.trim().length > 0) || '';
};

const getRenderablePhotoSpots = (route, postId, brokenImageMap) => {
  if (!Array.isArray(route)) return [];
  return route
    .map((spot, index) => {
      const resolvedPhoto = getSpotPhoto(spot);
      const imageKey = `${postId}-${spot?.id || index}`;
      return { ...spot, _resolvedPhoto: resolvedPhoto, _imageKey: imageKey };
    })
    .filter((spot) => spot._resolvedPhoto && !brokenImageMap[spot._imageKey]);
};

const normalizeRoute = (route) => {
  if (!Array.isArray(route)) return [];
  return route
    .map((spot, index) => {
      const lat = toNumber(spot?.lat ?? spot?.latitude ?? spot?.y);
      const lng = toNumber(spot?.lng ?? spot?.longitude ?? spot?.x);
      return {
        ...spot, id: spot?.id || `spot-${index}`, name: spot?.name || spot?.title || spot?.placeName || '',
        lat, lng, photo: getSpotPhoto(spot)
      };
    })
    .filter(Boolean);
};

const normalizePost = (post, index = 0) => {
  const route = normalizeRoute(post?.route);
  const likes = Array.isArray(post?.likedBy) ? post.likedBy.length : Number.isFinite(Number(post?.likes)) ? Number(post.likes) : 0;
  const regions = extractRegionsFromRoute(route);
  return {
    ...post, id: post?.id || `post-${index}`, title: post?.title || '제목 없는 여행기', body: post?.body || '',
    authorName: post?.authorName || '여행자', authorAvatar: post?.authorAvatar || FALLBACK_AVATAR,
    likedBy: Array.isArray(post?.likedBy) ? post?.likedBy : [], savedBy: Array.isArray(post?.savedBy) ? post?.savedBy : [],
    likes, route, createdAtValue: extractCreatedAtValue(post?.createdAt), regions, primaryRegion: regions[0] || null
  };
};

const searchTargetText = (post) => {
  const routeNames = Array.isArray(post?.route) ? post.route.map((spot) => spot?.name).filter(Boolean).join(' ') : '';
  return [post?.title, post?.body, post?.authorName, post?.locationLabel, post?.location, routeNames]
    .filter(Boolean).join(' ').toLowerCase();
};

const DiscoverTab = ({ posts, onOpenModal = () => {}, onOpenUser = () => {} }) => {
  const safePosts = Array.isArray(posts) ? posts : EMPTY_POSTS;
  const [region, setRegion] = useState('all');
  const [search, setSearch] = useState('');
  const [dbPosts, setDbPosts] = useState([]);
  const [popularPosts, setPopularPosts] = useState([]);
  const [isLoading, setIsLoading] = useState(safePosts.length === 0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(safePosts.length > PAGE_SIZE);
  const [currentIndices, setCurrentIndices] = useState({});
  const [brokenImageMap, setBrokenImageMap] = useState({});
  const lastVisibleRef = useRef(null);
  const loadMoreRef = useRef(null);
  const isMountedRef = useRef(true);

  const applyPostPatch = useCallback((postList, postId, updater) => {
    return postList.map((item) => {
      if (item.id !== postId) return item;
      return normalizePost(updater(item));
    });
  }, []);

  const markImageBroken = useCallback((imageKey) => {
    setBrokenImageMap((prev) => prev[imageKey] ? prev : { ...prev, [imageKey]: true });
  }, []);

  const fetchPopularPosts = useCallback(async () => {
    if (safePosts.length > 0) {
      const normalized = safePosts.map((post, index) => normalizePost(post, index));
      const nextPopular = [...normalized].sort((a, b) => b.likes - a.likes || b.createdAtValue - a.createdAtValue).slice(0, POPULAR_LIMIT);
      setPopularPosts(nextPopular);
      return;
    }
    try {
      const q = query(collection(db, 'posts'), orderBy('likes', 'desc'), orderBy('createdAt', 'desc'), limit(POPULAR_LIMIT));
      const snapshot = await getDocs(q);
      if (!isMountedRef.current) return;
      const nextPopular = snapshot.docs.map((docSnap, index) => normalizePost({ id: docSnap.id, ...docSnap.data() }, index));
      setPopularPosts(nextPopular);
    } catch (error) {
      console.error('인기 게시물 기본 쿼리 실패:', error);
      try {
        const fallbackQuery = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(50));
        const fallbackSnapshot = await getDocs(fallbackQuery);
        if (!isMountedRef.current) return;
        const fallbackPopular = fallbackSnapshot.docs
          .map((docSnap, index) => normalizePost({ id: docSnap.id, ...docSnap.data() }, index))
          .sort((a, b) => b.likes - a.likes || b.createdAtValue - a.createdAtValue).slice(0, POPULAR_LIMIT);
        setPopularPosts(fallbackPopular);
      } catch (fallbackError) {
        if (isMountedRef.current) setPopularPosts([]);
      }
    }
  }, [safePosts]);

  const fetchInitialPosts = useCallback(async () => {
    if (safePosts.length > 0) {
      const normalized = safePosts.map((post, index) => normalizePost(post, index));
      setDbPosts(normalized.slice(0, PAGE_SIZE));
      setHasMore(normalized.length > PAGE_SIZE);
      lastVisibleRef.current = null;
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(PAGE_SIZE));
      const snapshot = await getDocs(q);
      if (!isMountedRef.current) return;
      const nextPosts = snapshot.docs.map((docSnap, index) => normalizePost({ id: docSnap.id, ...docSnap.data() }, index));
      setDbPosts(nextPosts);
      lastVisibleRef.current = snapshot.docs[snapshot.docs.length - 1] || null;
      setHasMore(snapshot.docs.length === PAGE_SIZE);
    } catch (error) {
      if (isMountedRef.current) { setDbPosts([]); setHasMore(false); }
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  }, [safePosts]);

  const loadMorePosts = useCallback(async () => {
    if (safePosts.length > 0) {
      if (!hasMore || isLoadingMore) return;
      setIsLoadingMore(true);
      try {
        const normalized = safePosts.map((post, index) => normalizePost(post, index));
        const nextChunk = normalized.slice(dbPosts.length, dbPosts.length + PAGE_SIZE);
        setDbPosts((prev) => [...prev, ...nextChunk]);
        setHasMore(normalized.length > dbPosts.length + nextChunk.length);
      } finally {
        if (isMountedRef.current) setIsLoadingMore(false);
      }
      return;
    }
    if (!hasMore || isLoadingMore || !lastVisibleRef.current) return;
    setIsLoadingMore(true);
    try {
      const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), startAfter(lastVisibleRef.current), limit(PAGE_SIZE));
      const snapshot = await getDocs(q);
      if (!isMountedRef.current) return;
      const nextPosts = snapshot.docs.map((docSnap, index) => normalizePost({ id: docSnap.id, ...docSnap.data() }, dbPosts.length + index));
      setDbPosts((prev) => [...prev, ...nextPosts]);
      lastVisibleRef.current = snapshot.docs[snapshot.docs.length - 1] || lastVisibleRef.current;
      setHasMore(snapshot.docs.length === PAGE_SIZE);
    } catch (error) {
      console.error('게시물 추가 로드 실패:', error);
    } finally {
      if (isMountedRef.current) setIsLoadingMore(false);
    }
  }, [safePosts, hasMore, isLoadingMore, dbPosts.length]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  useEffect(() => {
    fetchInitialPosts();
    fetchPopularPosts();
  }, [fetchInitialPosts, fetchPopularPosts]);

  useEffect(() => {
    const sentinel = loadMoreRef.current;
    if (!sentinel || !hasMore || isLoading || isLoadingMore) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) loadMorePosts();
    }, { root: null, rootMargin: '200px 0px', threshold: 0.1 });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isLoading, isLoadingMore, loadMorePosts]);

  const handleToggleLike = async (e, postId, currentLikedBy = []) => {
    e.stopPropagation();
    const user = auth.currentUser;
    if (!user) return;
    const isLiked = currentLikedBy.includes(user.uid);
    const nextLikedBy = isLiked ? currentLikedBy.filter((uid) => uid !== user.uid) : [...currentLikedBy, user.uid];
    const nextLikes = Math.max((Array.isArray(currentLikedBy) ? currentLikedBy.length : 0) + (isLiked ? -1 : 1), 0);
    const patchFn = (item) => ({ ...item, likedBy: nextLikedBy, likes: nextLikes });
    setDbPosts((prev) => applyPostPatch(prev, postId, patchFn));
    setPopularPosts((prev) => applyPostPatch(prev, postId, patchFn));

    try {
      const postRef = doc(db, 'posts', postId);
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(postRef, { likedBy: isLiked ? arrayRemove(user.uid) : arrayUnion(user.uid), likes: increment(isLiked ? -1 : 1) });
      const userSnap = await getDoc(userRef);
      const currentLiked = userSnap.data()?.likedPosts || [];
      const updatedLiked = isLiked ? currentLiked.filter((id) => id !== postId) : [...currentLiked, postId];
      await updateDoc(userRef, { likedPosts: updatedLiked });
      fetchPopularPosts();
    } catch (error) {
      console.error(error);
      fetchInitialPosts(); fetchPopularPosts();
    }
  };

  const handleToggleSave = async (e, postId) => {
    e.stopPropagation();
    const user = auth.currentUser;
    if (!user) return;
    const targetPost = dbPosts.find((item) => item.id === postId) || popularPosts.find((item) => item.id === postId);
    const currentSavedBy = Array.isArray(targetPost?.savedBy) ? targetPost.savedBy : [];
    const alreadySaved = currentSavedBy.includes(user.uid);
    const nextSavedBy = alreadySaved ? currentSavedBy.filter((uid) => uid !== user.uid) : [...currentSavedBy, user.uid];
    const patchFn = (item) => ({ ...item, savedBy: nextSavedBy });
    setDbPosts((prev) => applyPostPatch(prev, postId, patchFn));
    setPopularPosts((prev) => applyPostPatch(prev, postId, patchFn));

    try {
      const userRef = doc(db, 'users', user.uid);
      const postRef = doc(db, 'posts', postId);
      await updateDoc(postRef, { savedBy: alreadySaved ? arrayRemove(user.uid) : arrayUnion(user.uid), saves: increment(alreadySaved ? -1 : 1) });
      const userSnap = await getDoc(userRef);
      const currentSaved = userSnap.data()?.savedPosts || [];
      const updatedSaved = alreadySaved ? currentSaved.filter((id) => id !== postId) : [...currentSaved, postId];
      await updateDoc(userRef, { savedPosts: updatedSaved });
    } catch (error) {
      console.error(error);
      fetchInitialPosts(); fetchPopularPosts();
    }
  };

  const handleScroll = (postId, e) => {
    const { scrollLeft, clientWidth } = e.target;
    if (clientWidth === 0) return;
    const index = Math.round(scrollLeft / clientWidth);
    setCurrentIndices((prev) => ({ ...prev, [postId]: index }));
  };

  const normalizedPosts = useMemo(() => {
    return [...dbPosts].sort((a, b) => b.createdAtValue - a.createdAtValue);
  }, [dbPosts]);

  const filteredPosts = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return normalizedPosts.filter((post) => {
      const matchRegion = region === 'all' || (Array.isArray(post.regions) && post.regions.includes(region));
      const matchSearch = !keyword || searchTargetText(post).includes(keyword);
      return matchRegion && matchSearch;
    });
  }, [normalizedPosts, region, search]);

  return (
    <section className="tab-page active" style={{ overflowY: 'auto', backgroundColor: '#fff', height: '100%', display: 'flex', flexDirection: 'column' }}>
      
      {/* 🚨 [1번 스펙 이식] 검색창 UI 고도화 & 실시간 텍스트 삭제 & 인기 태그 배치 */}
      <div style={{ padding: '20px 16px 0', backgroundColor: '#fff', borderBottom: '1px solid #F1F3F5' }}>
        <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#F8F9FA', padding: '12px 16px', borderRadius: '16px', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.02)' }}>
          <i className="fas fa-search" style={{ color: '#ADB5BD', marginRight: '10px', fontSize: '16px' }}></i>
          <input
            type="text"
            placeholder="여행지, 코스, 장소 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ border: 'none', background: 'transparent', flex: 1, outline: 'none', fontSize: '15px', color: '#1A1A1A' }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', color: '#ADB5BD', cursor: 'pointer', padding: '0 4px' }}>
              <i className="fas fa-times-circle" style={{ fontSize: '16px' }}></i>
            </button>
          )}
        </div>

        {/* 원클릭 인기 해시태그 가로 슬라이더 바 */}
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', margin: '14px 0', paddingBottom: '4px' }} className="photo-slider">
          {POPULAR_TAGS.map(tag => {
            const tagText = tag.replace('#', '');
            const isActive = search === tagText;
            return (
              <button
                key={tag}
                onClick={() => setSearch(isActive ? '' : tagText)} 
                style={{ 
                  padding: '6px 14px', borderRadius: '20px', cursor: 'pointer', flexShrink: 0, fontWeight: 'bold', fontSize: '13px', transition: 'all 0.2s',
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
        
        {/* 🔥 인기 여행 루트 섹션 스타일 정제 */}
        <div className="discover-section" style={{ padding: '20px 16px', backgroundColor: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#1A1A1A', margin: 0 }}>🔥 이번 주 인기 코스</h3>
          </div>
          <div className="routes-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
            {isLoading && popularPosts.length === 0 ? (
              <div style={{ gridColumn: '1 / -1', padding: '20px', textAlign: 'center', color: '#ADB5BD', fontSize: '14px' }}>인기 루트를 분석 중입니다... 🧐</div>
            ) : popularPosts.length > 0 ? (
              popularPosts.map((post) => {
                const popularPhotoSpots = getRenderablePhotoSpots(post.route, post.id, brokenImageMap);
                const popularThumb = popularPhotoSpots[0]?._resolvedPhoto || '';
                const popularThumbKey = popularPhotoSpots[0]?._imageKey || `${post.id}-popular-thumb`;

                return (
                  <div key={post.id} onClick={() => onOpenModal(post.id)} style={{ cursor: 'pointer', borderRadius: '16px', border: '1px solid #E5E7EB', overflow: 'hidden', backgroundColor: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.02)', transition: 'transform 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
                    <div style={{ height: '110px', backgroundColor: '#F8F9FA', position: 'relative' }}>
                      {popularThumb ? (
                        <img src={popularThumb} alt={post.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={() => markImageBroken(popularThumbKey)} />
                      ) : (
                        <RouteMap route={post.route || []} detailedPath={post.detailedPath} height="110px" />
                      )}
                      <div style={{ position: 'absolute', top: '8px', right: '8px', backgroundColor: 'rgba(0,0,0,0.6)', color: '#fff', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold' }}>
                        <i className="fas fa-heart" style={{ color: '#ff6b6b', marginRight: '4px' }}></i>{post.likes || 0}
                      </div>
                    </div>
                    <div style={{ padding: '12px' }}>
                      <h4 style={{ fontSize: '14px', fontWeight: 'bold', color: '#1A1A1A', margin: '0 0 4px 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{post.title}</h4>
                      <p style={{ fontSize: '12px', color: '#868E96', margin: 0 }}>📍 {post.route?.length || 0}개의 스팟</p>
                    </div>
                  </div>
                );
              })
            ) : (
              <div style={{ gridColumn: '1 / -1', padding: '20px', textAlign: 'center', color: '#ADB5BD' }}>아직 인기 게시물이 없습니다.</div>
            )}
          </div>
        </div>

        {/* 🚨 [3번 스펙 이식] 지역별 탐색 그라데이션 및 그림자 칩 UI 고도화 */}
        <div style={{ padding: '0 0 16px', backgroundColor: '#fff', borderBottom: '8px solid #F1F3F5' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#1A1A1A', margin: '0 16px 12px' }}>🗺️ 어디로 떠날까요?</h3>
          <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', padding: '0 16px 8px' }} className="photo-slider">
            {Object.entries(REGION_LABELS).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setRegion(key)}
                style={{
                  padding: '8px 18px', borderRadius: '24px', border: 'none', cursor: 'pointer',
                  backgroundColor: region === key ? '#52B788' : '#F8F9FA',
                  color: region === key ? '#fff' : '#495057',
                  fontSize: '14px', fontWeight: region === key ? 'bold' : '600',
                  whiteSpace: 'nowrap', transition: 'all 0.2s', flexShrink: 0,
                  boxShadow: region === key ? '0 4px 12px rgba(82, 183, 136, 0.3)' : 'none'
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* 🚨 [2번 스펙 이식] 실시간 반응형 피드 컨테이너 렌더링 */}
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
            filteredPosts.map((post) => {
              const userName = post.authorName || '여행자';
              const userAvatar = post.authorAvatar || FALLBACK_AVATAR;
              const isLiked = post.likedBy?.includes(auth.currentUser?.uid);
              const isSaved = post.savedBy?.includes(auth.currentUser?.uid);
              const photoSpots = getRenderablePhotoSpots(post.route, post.id, brokenImageMap);
              const hasPhotos = photoSpots.length > 0;
              const currentIndex = Math.min(currentIndices[post.id] || 0, Math.max(photoSpots.length - 1, 0));

              return (
                <article key={post.id} className="post-card" onClick={() => onOpenModal(post.id)} style={{ backgroundColor: '#fff', marginBottom: '8px', cursor: 'pointer' }}>
                  <header style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', gap: '12px' }} onClick={(e) => e.stopPropagation()}>
                    <img src={userAvatar} alt={userName} onClick={() => onOpenUser(post.userId)} style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover', cursor: 'pointer' }} />
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span onClick={() => onOpenUser(post.userId)} style={{ fontWeight: 'bold', fontSize: '14px', color: '#1A1A1A', cursor: 'pointer' }}>{userName}</span>
                        <span style={{ color: '#ADB5BD', fontSize: '12px' }}>• {post.createdAt ? formatTime(post.createdAt) : ''}</span>
                      </div>
                      <div style={{ fontSize: '12px', color: '#52B788', fontWeight: 'bold' }}>📍 {post.route?.[0]?.name || '위치 정보 없음'}</div>
                    </div>
                    <button style={{ background: 'none', border: 'none', color: '#ADB5BD', padding: '4px' }}><i className="fas fa-ellipsis-h"></i></button>
                  </header>

                  <div style={{ width: '100%', aspectRatio: '1 / 1', backgroundColor: '#F8F9FA', position: 'relative', overflow: 'hidden' }}>
                    {hasPhotos ? (
                      <>
                        <div onScroll={(e) => handleScroll(post.id, e)} className="photo-slider" style={{ display: 'flex', width: '100%', height: '100%', overflowX: 'auto', scrollSnapType: 'x mandatory', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                          {photoSpots.map((spot, idx) => (
                            <img key={spot.id || idx} src={spot._resolvedPhoto} alt={`spot-${idx}`} style={{ width: '100%', height: '100%', flexShrink: 0, objectFit: 'cover', scrollSnapAlign: 'start' }} onError={() => markImageBroken(spot._imageKey)} />
                          ))}
                        </div>
                        {photoSpots.length > 1 && (
                          <div style={{ position: 'absolute', top: '12px', right: '12px', backgroundColor: 'rgba(0,0,0,0.6)', color: '#fff', padding: '4px 10px', borderRadius: '14px', fontSize: '11px', fontWeight: 'bold', zIndex: 1 }}>
                            {currentIndex + 1} / {photoSpots.length}
                          </div>
                        )}
                      </>
                    ) : (
                      <div style={{ width: '100%', height: '100%' }}>
                        <RouteMap route={post.route || []} detailedPath={post.detailedPath} height="100%" />
                      </div>
                    )}
                  </div>

                  <div style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', color: '#1A1A1A', marginBottom: '10px' }} onClick={(e) => e.stopPropagation()}>
                      <button onClick={(e) => handleToggleLike(e, post.id, post.likedBy)} style={{ background: 'none', border: 'none', padding: 0, color: isLiked ? '#e63946' : '#1A1A1A', fontSize: '20px', cursor: 'pointer' }}>
                        <i className={isLiked ? 'fas fa-heart' : 'far fa-heart'}></i>
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); onOpenModal(post.id); }} style={{ background: 'none', border: 'none', padding: 0, color: '#1A1A1A', fontSize: '20px', cursor: 'pointer' }}>
                        <i className="far fa-comment"></i>
                      </button>
                      <button onClick={(e) => handleToggleSave(e, post.id)} style={{ background: 'none', border: 'none', padding: 0, color: '#1A1A1A', fontSize: '20px', cursor: 'pointer', marginLeft: 'auto' }}>
                        <i className={isSaved ? 'fas fa-bookmark' : 'far fa-bookmark'}></i>
                      </button>
                    </div>
                    <div style={{ fontWeight: 'bold', fontSize: '13px', color: '#1A1A1A', marginBottom: '6px' }}>좋아요 {post.likes || 0}개</div>
                    <div style={{ fontWeight: '800', fontSize: '15px', color: '#1A1A1A', lineHeight: '1.3' }}>{post.title}</div>
                    <div style={{ fontSize: '13px', color: '#495057', marginTop: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{post.body}</div>
                  </div>
                </article>
              );
            })
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