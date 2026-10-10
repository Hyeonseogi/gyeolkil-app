import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import PostCard from '../components/PostCard';
import {
  collection, query, orderBy, doc, updateDoc, addDoc, deleteDoc,
  arrayUnion, arrayRemove, increment, onSnapshot, getDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  FALLBACK_AVATAR,
  createSocialNotification,
  getDistanceFromLatLonInKm,
  getTimestampValue,
  showToast
} from '../data';

const NEARBY_RADIUS_KM = 5;
const DEFAULT_LOCATION = { lat: 37.5445, lng: 127.056 }; // 성수역

const CATEGORIES = [
  { key: 'cafe', label: '☕️ 카페', emoji: '☕️' },
  { key: 'food', label: '🍔 맛집', emoji: '🍔' },
  { key: 'movie', label: '🎬 영화', emoji: '🎬' },
  { key: 'etc', label: '🏃‍♀️ 활동', emoji: '🏃‍♀️' }
];

const categoryEmoji = (key) => CATEGORIES.find((c) => c.key === key)?.emoji || '🏃‍♀️';

const HomeTab = ({ currentUser, following, onOpenModal, onOpenUser, onNavigate }) => {
  const [posts, setPosts] = useState([]);
  const [gatherings, setGatherings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const [filter, setFilter] = useState('all');
  const [sortBy, setSortBy] = useState('latest');
  const [selectedGathering, setSelectedGathering] = useState(null);

  // 라이브 모집글 작성 모달
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newCategory, setNewCategory] = useState('cafe');
  const [newMaxMembers, setNewMaxMembers] = useState(4);

  // 내 위치 & 지도 인스턴스
  const [myLocation, setMyLocation] = useState(null);
  const [isLocating, setIsLocating] = useState(false);
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const overlaysRef = useRef([]);

  // 1. 여정 게시글 실시간 구독
  useEffect(() => {
    const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setPosts(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
        setIsLoading(false);
      },
      (error) => {
        console.error('게시글 로드 실패:', error);
        setIsLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // 2. 실시간 동행 모집글 구독
  useEffect(() => {
    const q = query(collection(db, 'gatherings'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => setGatherings(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (error) => console.error('동행 모집글 로드 실패:', error)
    );
    return () => unsubscribe();
  }, []);

  /**
   * 3. GPS 위치 가져오기.
   *    '내 주변' 탭을 누르는 순간에만 실행한다.
   *    (예전에는 effect 안에서 곧바로 setState 를 호출해 렌더링이 연쇄로 일어났다.)
   */
  const requestMyLocation = useCallback(() => {
    if (myLocation || isLocating) return;

    if (!navigator.geolocation) {
      showToast('이 브라우저는 위치 기능을 지원하지 않아 기본 위치로 표시합니다.', 'error');
      setMyLocation(DEFAULT_LOCATION);
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setMyLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
        setIsLocating(false);
      },
      (error) => {
        console.error('GPS 오류:', error);
        showToast('위치를 가져올 수 없어 기본 위치(성수역)로 표시합니다.', 'error');
        setMyLocation(DEFAULT_LOCATION);
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
  }, [myLocation, isLocating]);

  const handleFilterChange = (next) => {
    setFilter(next);
    setSelectedGathering(null);
    if (next === 'nearby') requestMyLocation();
  };

  // 4. 내 주변 5km 이내만 추리기
  const nearbyGatherings = useMemo(() => {
    if (!myLocation) return [];
    return gatherings.filter(
      (g) => getDistanceFromLatLonInKm(myLocation.lat, myLocation.lng, g.lat, g.lng) <= NEARBY_RADIUS_KM
    );
  }, [myLocation, gatherings]);

  const nearbyPosts = useMemo(() => {
    if (!myLocation) return [];
    return posts.filter((p) => {
      const start = p.route?.[0];
      if (!start?.lat) return false;
      return getDistanceFromLatLonInKm(myLocation.lat, myLocation.lng, start.lat, start.lng) <= NEARBY_RADIUS_KM;
    });
  }, [myLocation, posts]);

  // 5. 지도 초기화 / 정리
  useEffect(() => {
    if (filter !== 'nearby' || !myLocation || !mapContainerRef.current || !window.kakao?.maps) {
      return undefined;
    }

    if (!mapRef.current) {
      mapRef.current = new window.kakao.maps.Map(mapContainerRef.current, {
        center: new window.kakao.maps.LatLng(myLocation.lat, myLocation.lng),
        level: 5
      });

      // 내 위치 핀
      new window.kakao.maps.CustomOverlay({
        position: new window.kakao.maps.LatLng(myLocation.lat, myLocation.lng),
        content:
          '<div style="width:16px;height:16px;background-color:#e63946;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 4px rgba(0,0,0,0.3);"></div>',
        map: mapRef.current,
        zIndex: 10
      });
    }

    // 탭을 벗어나면 지도 DOM 이 사라지므로 참조와 오버레이를 함께 정리한다.
    return () => {
      overlaysRef.current.forEach((overlay) => overlay.setMap(null));
      overlaysRef.current = [];
      mapRef.current = null;
    };
  }, [filter, myLocation]);

  // 6. 마커 갱신
  useEffect(() => {
    if (!mapRef.current || !window.kakao?.maps) return;

    overlaysRef.current.forEach((overlay) => overlay.setMap(null));
    overlaysRef.current = [];

    // (1) 여행 기록 핀
    nearbyPosts.forEach((p) => {
      const content = document.createElement('div');
      content.style.cursor = 'pointer';
      content.onclick = () => onOpenModal(p.id);
      content.innerHTML =
        '<div style="width:36px;height:36px;background-color:#F8F9FA;border-radius:50%;border:2px solid #ADB5BD;display:flex;justify-content:center;align-items:center;box-shadow:0 2px 4px rgba(0,0,0,0.2);font-size:16px;">🗺️</div>';

      overlaysRef.current.push(
        new window.kakao.maps.CustomOverlay({
          position: new window.kakao.maps.LatLng(p.route[0].lat, p.route[0].lng),
          content,
          map: mapRef.current,
          yAnchor: 0.5,
          zIndex: 4
        })
      );
    });

    // (2) 실시간 동행 핀
    nearbyGatherings.forEach((g) => {
      const content = document.createElement('div');
      content.style.position = 'relative';
      content.style.cursor = 'pointer';
      content.style.display = 'flex';
      content.style.flexDirection = 'column';
      content.style.alignItems = 'center';
      content.onclick = () => setSelectedGathering(g);

      const iconBg = g.status === 'recruiting' ? '#52B788' : '#6C757D';
      content.innerHTML = `
        <div style="width:44px;height:44px;background-color:${iconBg};border-radius:50%;border:3px solid #fff;display:flex;justify-content:center;align-items:center;box-shadow:0 4px 8px rgba(0,0,0,0.2);font-size:20px;position:relative;z-index:2;">
          ${categoryEmoji(g.category)}
        </div>
        ${g.status === 'recruiting' ? '<div style="position:absolute;width:100%;height:100%;border-radius:50%;background-color:#52B788;animation:ping 1.5s ease-in-out infinite;z-index:1;top:0;left:0;"></div>' : ''}
      `;

      overlaysRef.current.push(
        new window.kakao.maps.CustomOverlay({
          position: new window.kakao.maps.LatLng(g.lat, g.lng),
          content,
          map: mapRef.current,
          yAnchor: 0.5,
          zIndex: 5
        })
      );
    });
  }, [filter, nearbyPosts, nearbyGatherings, onOpenModal]);

  // 7. 동행 모집글 작성
  const handleCreateGathering = async () => {
    if (!currentUser) {
      showToast('로그인이 필요합니다. 🔒', 'error');
      return;
    }
    if (!myLocation) {
      showToast('위치를 확인한 뒤 모집글을 올릴 수 있어요.', 'error');
      return;
    }
    if (!newTitle.trim() || !newBody.trim()) {
      showToast('제목과 내용을 모두 채워주세요.', 'error');
      return;
    }
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'gatherings'), {
        userId: currentUser.uid,
        authorName: currentUser.displayName || '여행자',
        authorAvatar: currentUser.photoURL || '',
        title: newTitle.trim(),
        body: newBody.trim(),
        category: newCategory,
        lat: myLocation.lat,
        lng: myLocation.lng,
        maxMembers: Number(newMaxMembers),
        currentMembers: [currentUser.uid],
        status: 'recruiting',
        createdAt: Date.now()
      });

      setNewTitle('');
      setNewBody('');
      setNewCategory('cafe');
      setNewMaxMembers(4);
      setIsCreateModalOpen(false);
      showToast('⚡ 내 위치에 동행 모집 핀을 올렸습니다!', 'success');
    } catch (error) {
      console.error('동행 글 작성 실패:', error);
      showToast('모집글 등록에 실패했습니다.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteGathering = async (gatheringId) => {
    if (!window.confirm('이 동행 모집을 취소하고 완전히 삭제하시겠습니까?')) return;

    try {
      await deleteDoc(doc(db, 'gatherings', gatheringId));
      setSelectedGathering(null);
      showToast('동행 모집이 취소되었습니다.');
    } catch (error) {
      console.error('동행 모집 삭제 실패:', error);
      showToast('삭제에 실패했습니다.', 'error');
    }
  };

  // 동행 참여 (정원 초과 / 중복 참여 방지)
  const handleJoinGathering = async (gathering) => {
    if (!currentUser) {
      showToast('로그인이 필요합니다. 🔒', 'error');
      return;
    }

    const members = gathering.currentMembers || [];
    if (members.includes(currentUser.uid)) {
      setSelectedGathering(null);
      if (onNavigate) onNavigate('chat');
      return;
    }
    if (members.length >= Number(gathering.maxMembers || 0)) {
      showToast('이미 인원이 가득 찼습니다.', 'error');
      return;
    }

    try {
      const gatheringRef = doc(db, 'gatherings', gathering.id);

      // 다른 사람이 먼저 참여했을 수 있으니 최신 상태를 다시 확인한다.
      const snap = await getDoc(gatheringRef);
      const latest = snap.data();
      if (!latest) {
        showToast('이미 종료된 동행입니다.', 'error');
        setSelectedGathering(null);
        return;
      }

      const latestMembers = latest.currentMembers || [];
      if (latestMembers.length >= Number(latest.maxMembers || 0)) {
        showToast('방금 인원이 모두 찼습니다.', 'error');
        return;
      }

      const willBeFull = latestMembers.length + 1 >= Number(latest.maxMembers || 0);
      await updateDoc(gatheringRef, {
        currentMembers: arrayUnion(currentUser.uid),
        ...(willBeFull ? { status: 'closed' } : {})
      });

      setSelectedGathering(null);
      showToast('🎉 동행에 참여했습니다! 채팅방으로 이동합니다.', 'success');
      if (onNavigate) onNavigate('chat');
    } catch (error) {
      console.error('동행 참여 실패:', error);
      showToast('참여 처리 중 오류가 발생했습니다.', 'error');
    }
  };

  // 좋아요
  const handleToggleLike = async (e, post) => {
    e.stopPropagation();
    if (!currentUser) {
      showToast('로그인이 필요합니다. 🔒', 'error');
      return;
    }

    const likedBy = post.likedBy || [];
    const isLiked = likedBy.includes(currentUser.uid);

    try {
      await updateDoc(doc(db, 'posts', post.id), {
        likedBy: isLiked ? arrayRemove(currentUser.uid) : arrayUnion(currentUser.uid),
        likes: increment(isLiked ? -1 : 1)
      });
      await updateDoc(doc(db, 'users', currentUser.uid), {
        likedPosts: isLiked ? arrayRemove(post.id) : arrayUnion(post.id)
      });

      // 새로 좋아요를 눌렀고 내 글이 아닐 때만 알림 전송
      if (!isLiked && post.userId !== currentUser.uid) {
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
    }
  };

  // 저장(북마크)
  const handleToggleSave = async (e, post) => {
    e.stopPropagation();
    if (!currentUser) {
      showToast('로그인이 필요합니다. 🔒', 'error');
      return;
    }

    const alreadySaved = (post.savedBy || []).includes(currentUser.uid);

    try {
      await updateDoc(doc(db, 'posts', post.id), {
        savedBy: alreadySaved ? arrayRemove(currentUser.uid) : arrayUnion(currentUser.uid),
        saves: increment(alreadySaved ? -1 : 1)
      });
      await updateDoc(doc(db, 'users', currentUser.uid), {
        savedPosts: alreadySaved ? arrayRemove(post.id) : arrayUnion(post.id)
      });
      showToast(alreadySaved ? '저장을 취소했습니다.' : '저장했습니다. 마이페이지에서 볼 수 있어요.');
    } catch (error) {
      console.error('저장 처리 실패:', error);
      showToast('처리에 실패했습니다.', 'error');
    }
  };

  // 피드 필터 + 정렬
  const displayPosts = useMemo(() => {
    const filtered =
      filter === 'following' ? posts.filter((p) => following?.includes(p.userId)) : posts;

    return [...filtered].sort((a, b) => {
      if (sortBy === 'popular') return (b.likes || 0) - (a.likes || 0);
      if (sortBy === 'comments') return (b.comments || 0) - (a.comments || 0);
      if (sortBy === 'scraps') return (b.saves || 0) - (a.saves || 0);
      return getTimestampValue(b.createdAt) - getTimestampValue(a.createdAt);
    });
  }, [posts, filter, following, sortBy]);

  const emptyMessage =
    filter === 'following'
      ? { emoji: '🫂', text: '팔로우한 여행자의 여정이 아직 없어요.', sub: '발견 탭에서 새로운 여행자를 찾아보세요!' }
      : { emoji: '📭', text: '아직 등록된 여정이 없어요.', sub: '첫 번째 여정을 기록해보세요!' };

  return (
    <section
      className="tab-page active"
      style={{ display: 'flex', flexDirection: 'column', backgroundColor: '#fff', height: '100%', overflow: 'hidden', position: 'relative' }}
    >
      {/* 상단 탭 헤더 */}
      <div style={{ zIndex: 10, backgroundColor: '#fff', paddingBottom: '12px', borderBottom: '1px solid #f1f1f1' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 16px 12px' }}>
          <h2 className="section-title" style={{ fontSize: '1.2rem', fontWeight: '800', margin: 0 }}>최신 여정</h2>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            aria-label="정렬 기준"
            style={{
              padding: '6px 10px',
              borderRadius: '8px',
              border: '1px solid #E5E7EB',
              fontSize: '12px',
              outline: 'none',
              backgroundColor: '#fff',
              color: '#495057',
              cursor: 'pointer'
            }}
          >
            <option value="latest">최신 순</option>
            <option value="popular">인기 순</option>
            <option value="comments">댓글 많은 순</option>
            <option value="scraps">스크랩 순</option>
          </select>
        </div>

        <div className="feed-filter" style={{ display: 'flex', gap: '8px', padding: '0 16px', overflowX: 'auto' }}>
          {['all', 'following', 'nearby'].map((f) => (
            <button
              key={f}
              className={`filter-chip ${filter === f ? 'active' : ''}`}
              onClick={() => handleFilterChange(f)}
              aria-pressed={filter === f}
              style={{
                padding: '6px 14px',
                borderRadius: '20px',
                border: 'none',
                cursor: 'pointer',
                backgroundColor: filter === f ? '#1A1A1A' : '#F1F3F5',
                color: filter === f ? '#fff' : '#495057',
                fontSize: '13px',
                fontWeight: filter === f ? 'bold' : 'normal',
                whiteSpace: 'nowrap',
                transition: 'all 0.2s'
              }}
            >
              {f === 'all' ? '전체' : f === 'following' ? '팔로잉' : '📍 내 주변'}
            </button>
          ))}
        </div>
      </div>

      {/* 본문 */}
      <div style={{ flex: 1, overflowY: 'auto', position: 'relative', backgroundColor: filter === 'nearby' ? '#e9ecef' : '#F1F3F5' }}>
        {filter === 'nearby' ? (
          <div style={{ width: '100%', height: '100%', position: 'relative' }}>
            {isLocating ? (
              <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: '#888' }}>
                <i className="fas fa-location-arrow" style={{ fontSize: '24px', marginBottom: '12px', color: '#52B788' }}></i>
                <div>현재 위치를 찾고 있습니다... 📡</div>
              </div>
            ) : (
              <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }}></div>
            )}

            {!isLocating && myLocation && nearbyGatherings.length === 0 && !selectedGathering && (
              <div
                style={{
                  position: 'absolute',
                  top: '16px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  zIndex: 12,
                  background: 'rgba(255,255,255,0.94)',
                  borderRadius: '999px',
                  padding: '8px 16px',
                  fontSize: '12px',
                  color: '#495057',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                  whiteSpace: 'nowrap'
                }}
              >
                반경 {NEARBY_RADIUS_KM}km 안에 모집 중인 동행이 없어요
              </div>
            )}

            {!isLocating && myLocation && (
              <button
                onClick={() => setIsCreateModalOpen(true)}
                style={{
                  position: 'absolute',
                  bottom: '24px',
                  right: '16px',
                  zIndex: 15,
                  backgroundColor: '#52B788',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '30px',
                  padding: '14px 22px',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  boxShadow: '0 4px 16px rgba(82, 183, 136, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <i className="fas fa-plus"></i> 동행 모집하기
              </button>
            )}

            {/* 동행 상세 바텀 시트 */}
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                width: '100%',
                backgroundColor: '#fff',
                borderTopLeftRadius: '24px',
                borderTopRightRadius: '24px',
                boxShadow: '0 -4px 20px rgba(0,0,0,0.1)',
                padding: '24px 20px 100px 20px',
                transform: selectedGathering ? 'translateY(0)' : 'translateY(100%)',
                transition: 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                zIndex: 20
              }}
            >
              {selectedGathering && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                    <div>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '4px 10px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: 'bold',
                          marginBottom: '8px',
                          backgroundColor: selectedGathering.status === 'recruiting' ? '#EBFBEE' : '#F1F3F5',
                          color: selectedGathering.status === 'recruiting' ? '#2B8A3E' : '#868E96'
                        }}
                      >
                        {selectedGathering.status === 'recruiting' ? '🔥 모집 중' : '🔒 모집 마감'}
                      </span>
                      <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#1A1A1A', margin: 0 }}>{selectedGathering.title}</h3>
                    </div>
                    <button
                      onClick={() => setSelectedGathering(null)}
                      aria-label="닫기"
                      style={{ background: 'none', border: 'none', fontSize: '20px', color: '#ADB5BD', cursor: 'pointer' }}
                    >
                      <i className="fas fa-times"></i>
                    </button>
                  </div>

                  <p style={{ fontSize: '14px', color: '#495057', lineHeight: '1.5', marginBottom: '16px', whiteSpace: 'pre-wrap' }}>
                    {selectedGathering.body}
                  </p>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <img
                        src={selectedGathering.authorAvatar || FALLBACK_AVATAR}
                        onError={(e) => {
                          e.currentTarget.src = FALLBACK_AVATAR;
                        }}
                        style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover' }}
                        alt=""
                      />
                      <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#495057' }}>{selectedGathering.authorName}</span>
                    </div>
                    <span style={{ color: '#DEE2E6' }}>|</span>
                    <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#495057' }}>
                      인원 현황 <span style={{ color: '#52B788' }}>{selectedGathering.currentMembers?.length || 1}</span> / {selectedGathering.maxMembers}명
                    </span>
                  </div>

                  {currentUser?.uid === selectedGathering.userId ? (
                    <button
                      onClick={() => handleDeleteGathering(selectedGathering.id)}
                      style={{
                        width: '100%',
                        padding: '16px',
                        borderRadius: '14px',
                        border: 'none',
                        backgroundColor: '#ffe3e3',
                        color: '#e63946',
                        fontSize: '15px',
                        fontWeight: 'bold',
                        cursor: 'pointer'
                      }}
                    >
                      <i className="fas fa-trash-alt"></i> 동행 모집 취소하기 (삭제)
                    </button>
                  ) : (
                    (() => {
                      const joined = (selectedGathering.currentMembers || []).includes(currentUser?.uid);
                      const full = (selectedGathering.currentMembers?.length || 0) >= Number(selectedGathering.maxMembers || 0);
                      const disabled = !joined && full;

                      return (
                        <button
                          onClick={() => handleJoinGathering(selectedGathering)}
                          disabled={disabled}
                          style={{
                            width: '100%',
                            padding: '16px',
                            borderRadius: '14px',
                            border: 'none',
                            backgroundColor: disabled ? '#E9ECEF' : '#1A1A1A',
                            color: disabled ? '#ADB5BD' : '#fff',
                            fontSize: '15px',
                            fontWeight: 'bold',
                            cursor: disabled ? 'default' : 'pointer'
                          }}
                        >
                          {joined ? '채팅방으로 이동하기' : disabled ? '인원이 가득 찼습니다' : '참여 신청하고 채팅방 들어가기'}
                        </button>
                      );
                    })()
                  )}
                </>
              )}
            </div>

            {/* 동행 모집글 작성 모달 */}
            {isCreateModalOpen && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  backgroundColor: 'rgba(0,0,0,0.5)',
                  zIndex: 30,
                  display: 'flex',
                  alignItems: 'flex-end'
                }}
                onClick={(e) => e.target === e.currentTarget && setIsCreateModalOpen(false)}
              >
                <div
                  style={{
                    width: '100%',
                    backgroundColor: '#fff',
                    borderTopLeftRadius: '24px',
                    borderTopRightRadius: '24px',
                    padding: '24px 20px 40px 20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '16px',
                    boxShadow: '0 -4px 24px rgba(0,0,0,0.2)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#1A1A1A', margin: 0 }}>🙋‍♂️ 새로운 동행 만들기</h3>
                    <button
                      onClick={() => setIsCreateModalOpen(false)}
                      aria-label="닫기"
                      style={{ background: 'none', border: 'none', fontSize: '20px', color: '#ADB5BD', cursor: 'pointer' }}
                    >
                      <i className="fas fa-times"></i>
                    </button>
                  </div>

                  <div>
                    <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#868E96', display: 'block', marginBottom: '8px' }}>카테고리</span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {CATEGORIES.map((cat) => (
                        <button
                          key={cat.key}
                          onClick={() => setNewCategory(cat.key)}
                          aria-pressed={newCategory === cat.key}
                          style={{
                            padding: '8px 14px',
                            borderRadius: '10px',
                            border: newCategory === cat.key ? '2px solid #52B788' : '1px solid #E5E7EB',
                            backgroundColor: newCategory === cat.key ? '#F1F9F5' : '#fff',
                            color: newCategory === cat.key ? '#2D6A4F' : '#495057',
                            fontSize: '13px',
                            fontWeight: '600',
                            cursor: 'pointer'
                          }}
                        >
                          {cat.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <input
                    type="text"
                    placeholder="방 제목을 입력하세요 (ex: 뚝섬 갈비 번개)"
                    value={newTitle}
                    maxLength={40}
                    onChange={(e) => setNewTitle(e.target.value)}
                    style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #E5E7EB', fontSize: '14px', outline: 'none' }}
                  />

                  <textarea
                    placeholder="동행 조건을 자유롭게 설명해 주세요! (시간, 세부 모임 장소 등)"
                    value={newBody}
                    maxLength={300}
                    onChange={(e) => setNewBody(e.target.value)}
                    style={{ width: '100%', height: '80px', padding: '12px', borderRadius: '10px', border: '1px solid #E5E7EB', fontSize: '14px', outline: 'none', resize: 'none', fontFamily: 'inherit' }}
                  />

                  <div>
                    <label htmlFor="max-members" style={{ fontSize: '12px', fontWeight: 'bold', color: '#868E96', display: 'block', marginBottom: '8px' }}>
                      최대 인원 설정 ({newMaxMembers}명)
                    </label>
                    <input
                      id="max-members"
                      type="range"
                      min="2"
                      max="8"
                      value={newMaxMembers}
                      onChange={(e) => setNewMaxMembers(Number(e.target.value))}
                      style={{ width: '100%', accentColor: '#52B788' }}
                    />
                  </div>

                  <button
                    onClick={handleCreateGathering}
                    disabled={isSubmitting}
                    style={{
                      width: '100%',
                      padding: '16px',
                      borderRadius: '14px',
                      border: 'none',
                      backgroundColor: isSubmitting ? '#A5D6BC' : '#52B788',
                      color: '#fff',
                      fontSize: '15px',
                      fontWeight: 'bold',
                      cursor: isSubmitting ? 'wait' : 'pointer',
                      marginTop: '8px'
                    }}
                  >
                    {isSubmitting ? '등록 중...' : '실시간 동행 핀 등록하기'}
                  </button>
                </div>
              </div>
            )}

            <style>{`@keyframes ping { 0% { transform: scale(1); opacity: 0.8; } 100% { transform: scale(2); opacity: 0; } }`}</style>
          </div>
        ) : (
          <div id="feed-container" style={{ paddingBottom: '80px' }}>
            {isLoading ? (
              <div className="loading-spinner" style={{ textAlign: 'center', padding: '50px', color: '#888' }}>
                여정을 불러오는 중... 🧭
              </div>
            ) : displayPosts.length === 0 ? (
              <div className="empty-state" style={{ padding: '60px 20px', textAlign: 'center', color: '#868E96' }}>
                <div style={{ fontSize: '40px', marginBottom: '16px' }}>{emptyMessage.emoji}</div>
                <p style={{ margin: '0 0 6px', fontWeight: 'bold', color: '#495057' }}>{emptyMessage.text}</p>
                <p style={{ margin: 0, fontSize: '14px' }}>{emptyMessage.sub}</p>
              </div>
            ) : (
              displayPosts.map((post) => (
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
          </div>
        )}
      </div>
    </section>
  );
};

export default HomeTab;
