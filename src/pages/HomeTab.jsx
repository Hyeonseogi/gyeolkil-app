import React, { useState, useEffect, useMemo, useRef } from 'react';
import RouteMap from '../components/RouteMap';
import { formatTime } from '../data'; 
import { 
  collection, query, orderBy, doc, updateDoc, addDoc, deleteDoc,
  arrayUnion, arrayRemove, increment, onSnapshot, getDoc 
} from 'firebase/firestore';
import { db, auth } from '../firebase';

// 하버사인 거리 계산 공식
const getDistanceFromLatLonInKm = (lat1, lon1, lat2, lon2) => {
  const R = 6371; 
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; 
};

// 🚨 onNavigate props 추가됨
const HomeTab = ({ following, onOpenModal, onOpenUser, onNavigate }) => {
  const [posts, setPosts] = useState([]);
  const [gatherings, setGatherings] = useState([]); 
  const [isLoading, setIsLoading] = useState(true);
  
  const [filter, setFilter] = useState('all'); 
  const [sortBy, setSortBy] = useState('latest'); 
  const [selectedGathering, setSelectedGathering] = useState(null); 

  // 라이브 모집글 쓰기 모달 및 인풋 상태들
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newCategory, setNewCategory] = useState('cafe');
  const [newMaxMembers, setNewMaxMembers] = useState(4);

  // 내 위치 상태 및 지도 객체 캐싱 레퍼런스
  const [myLocation, setMyLocation] = useState(null);
  const [isLocating, setIsLocating] = useState(false);
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const overlaysRef = useRef([]);

  // 1. 일반 여정 게시글 실시간 감시
  useEffect(() => {
    setIsLoading(true);
    const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const fetchedPosts = [];
      querySnapshot.forEach((docSnap) => fetchedPosts.push({ id: docSnap.id, ...docSnap.data() }));
      setPosts(fetchedPosts);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 2. 실시간 동행 모집글(gatherings) 컬렉션 실시간 감시
  useEffect(() => {
    const q = query(collection(db, 'gatherings'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const fetchedGatherings = [];
      querySnapshot.forEach((docSnap) => {
        fetchedGatherings.push({ id: docSnap.id, ...docSnap.data() });
      });
      setGatherings(fetchedGatherings);
    });
    return () => unsubscribe();
  }, []);

  // 3. '내 주변' 탭 진입 시 GPS 위치 가져오기
  useEffect(() => {
    if (filter === 'nearby' && !myLocation) {
      setIsLocating(true);
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setMyLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
          setIsLocating(false);
        },
        (error) => {
          console.error("GPS 오류:", error);
          alert("위치를 가져올 수 없어 기본 위치(성수역)로 설정됩니다.");
          setMyLocation({ lat: 37.5445, lng: 127.056 });
          setIsLocating(false);
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
      );
    }
  }, [filter, myLocation]);

  // 4. 내 주변 5km 이내 데이터 필터링 계산
  const nearbyGatherings = useMemo(() => {
    if (!myLocation) return [];
    return gatherings.filter(g => getDistanceFromLatLonInKm(myLocation.lat, myLocation.lng, g.lat, g.lng) <= 5);
  }, [myLocation, gatherings]);

  const nearbyPosts = useMemo(() => {
    if (!myLocation) return [];
    return posts.filter(p => {
      if (!p.route || p.route.length === 0 || !p.route[0].lat) return false; 
      return getDistanceFromLatLonInKm(myLocation.lat, myLocation.lng, p.route[0].lat, p.route[0].lng) <= 5;
    });
  }, [myLocation, posts]);

  // 5. 지도 객체 초기화
  useEffect(() => {
    if (filter === 'nearby' && myLocation && mapContainerRef.current && window.kakao && window.kakao.maps) {
      if (!mapRef.current) {
        const options = {
          center: new window.kakao.maps.LatLng(myLocation.lat, myLocation.lng),
          level: 5 
        };
        mapRef.current = new window.kakao.maps.Map(mapContainerRef.current, options);

        // 내 위치 고정 핀
        const myLocContent = '<div style="width:16px;height:16px;background-color:#e63946;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 4px rgba(0,0,0,0.3);"></div>';
        new window.kakao.maps.CustomOverlay({
          position: new window.kakao.maps.LatLng(myLocation.lat, myLocation.lng),
          content: myLocContent, map: mapRef.current, zIndex: 10
        });
      }
    } else {
      mapRef.current = null; 
    }
  }, [filter, myLocation]);

  // 6. 마커 업데이트 실시간 반영
  useEffect(() => {
    if (!mapRef.current || !window.kakao) return;

    overlaysRef.current.forEach(overlay => overlay.setMap(null));
    overlaysRef.current = [];

    // (1) 일반 여행 기록 핀 꽂기
    nearbyPosts.forEach(p => {
      const content = document.createElement('div');
      content.style.position = 'relative';
      content.style.cursor = 'pointer';
      content.onclick = () => onOpenModal(p.id); 
      content.innerHTML = `<div style="width:36px;height:36px;background-color:#F8F9FA;border-radius:50%;border:2px solid #ADB5BD;display:flex;justify-content:center;align-items:center;box-shadow:0 2px 4px rgba(0,0,0,0.2);font-size:16px;">🗺️</div>`;

      const overlay = new window.kakao.maps.CustomOverlay({
        position: new window.kakao.maps.LatLng(p.route[0].lat, p.route[0].lng),
        content: content, map: mapRef.current, yAnchor: 0.5, zIndex: 4
      });
      overlaysRef.current.push(overlay);
    });

    // (2) 실시간 동행 라이브 핀 꽂기
    nearbyGatherings.forEach(g => {
      const content = document.createElement('div');
      content.style.position = 'relative';
      content.style.cursor = 'pointer';
      content.style.display = 'flex';
      content.style.flexDirection = 'column';
      content.style.alignItems = 'center';
      content.onclick = () => setSelectedGathering(g);

      const iconBg = g.status === 'recruiting' ? '#52B788' : '#6C757D';
      const emoji = g.category === 'cafe' ? '☕️' : g.category === 'movie' ? '🎬' : g.category === 'food' ? '🍔' : '🏃‍♀️';

      content.innerHTML = `
        <div style="width:44px;height:44px;background-color:${iconBg};border-radius:50%;border:3px solid #fff;display:flex;justify-content:center;align-items:center;box-shadow:0 4px 8px rgba(0,0,0,0.2);font-size:20px;position:relative;z-index:2;">
          ${emoji}
        </div>
        ${g.status === 'recruiting' ? `<div style="position:absolute;width:100%;height:100%;border-radius:50%;background-color:#52B788;animation:ping 1.5s ease-in-out infinite;z-index:1;top:0;left:0;"></div>` : ''}
      `;

      const overlay = new window.kakao.maps.CustomOverlay({
        position: new window.kakao.maps.LatLng(g.lat, g.lng),
        content: content, map: mapRef.current, yAnchor: 0.5, zIndex: 5
      });
      overlaysRef.current.push(overlay);
    });

  }, [filter, nearbyPosts, nearbyGatherings, onOpenModal]);

  // 7. 동행 글 작성 후 Firestore DB 업로드 로직
  const handleCreateGathering = async () => {
    const user = auth.currentUser;
    if (!user) { alert('로그인이 필요합니다! 🔒'); return; }
    if (!newTitle.trim() || !newBody.trim()) { alert('내용을 모두 채워주세요!'); return; }

    try {
      await addDoc(collection(db, 'gatherings'), {
        userId: user.uid,
        authorName: user.displayName || '여행자',
        authorAvatar: user.photoURL || '',
        title: newTitle,
        body: newBody,
        category: newCategory,
        lat: myLocation.lat,
        lng: myLocation.lng,
        maxMembers: Number(newMaxMembers),
        currentMembers: [user.uid], 
        status: 'recruiting',
        createdAt: Date.now(),
        chatRoomId: `room_${Date.now()}` 
      });

      setNewTitle(''); setNewBody(''); setNewCategory('cafe'); setNewMaxMembers(4);
      setIsCreateModalOpen(false);
      alert('⚡ 실시간 동행 모집 핀이 내 위치에 생성되었습니다!');
    } catch (error) {
      console.error('동행 글 작성 실패:', error);
    }
  };

  const handleDeleteGathering = async (gatheringId) => {
    if (!window.confirm('이 동행 모집을 취소하고 완전히 삭제하시겠습니까?')) return;
    try {
      await deleteDoc(doc(db, 'gatherings', gatheringId));
      setSelectedGathering(null);
      alert('동행 모집이 성공적으로 취소되었습니다.');
    } catch (error) {
      console.error('동행 모집 삭제 실패:', error);
    }
  };

  // 🚨 [NEW] 동행 참여 및 채팅방 진입 로직
  const handleJoinGathering = async (gatheringId) => {
    const user = auth.currentUser;
    if (!user) { alert('로그인이 필요합니다! 🔒'); return; }

    try {
      const gatheringRef = doc(db, 'gatherings', gatheringId);
      await updateDoc(gatheringRef, {
        currentMembers: arrayUnion(user.uid)
      });
      alert('🎉 동행에 성공적으로 참여했습니다! 채팅방으로 이동합니다.');
      setSelectedGathering(null);
      if (onNavigate) onNavigate('chat');
    } catch (error) {
      console.error('동행 참여 실패:', error);
      alert('참여 처리 중 오류가 발생했습니다.');
    }
  };

  // 🚨 [핵심 버그 수정] 마이페이지 연동을 위한 좋아요 로직 업데이트
  const handleToggleLike = async (e, postId, currentLikedBy = []) => {
    e.stopPropagation();
    const user = auth.currentUser;
    if (!user) return;
    try {
      const postRef = doc(db, 'posts', postId);
      const userRef = doc(db, 'users', user.uid); // 내 유저 정보 레퍼런스
      const isLiked = currentLikedBy.includes(user.uid);
      
      // 1. 게시물 하트 수 업데이트
      await updateDoc(postRef, {
        likedBy: isLiked ? arrayRemove(user.uid) : arrayUnion(user.uid),
        likes: increment(isLiked ? -1 : 1)
      });
      
      // 2. 내 유저 정보에 하트 누른 글 기록 (마이페이지 동기화용)
      await updateDoc(userRef, {
        likedPosts: isLiked ? arrayRemove(postId) : arrayUnion(postId)
      });
    } catch (error) { console.error(error); }
  };

  // 🚨 [핵심 버그 수정] 마이페이지 연동을 위한 북마크 로직 업데이트
  const handleToggleSave = async (e, postId) => {
    e.stopPropagation();
    const user = auth.currentUser;
    if (!user) return;
    try {
      const postRef = doc(db, 'posts', postId);
      const userRef = doc(db, 'users', user.uid); // 내 유저 정보 레퍼런스
      const postSnap = await getDoc(postRef);
      const savedBy = postSnap.data()?.savedBy || [];
      const alreadySaved = savedBy.includes(user.uid);
      
      // 1. 게시물 북마크 업데이트
      await updateDoc(postRef, {
        savedBy: alreadySaved ? arrayRemove(user.uid) : arrayUnion(user.uid),
        saves: increment(alreadySaved ? -1 : 1)
      });
      
      // 2. 내 유저 정보에 북마크한 글 기록 (마이페이지 동기화용)
      await updateDoc(userRef, {
        savedPosts: alreadySaved ? arrayRemove(postId) : arrayUnion(postId)
      });
    } catch (error) { console.error(error); }
  };

  // 피드 정렬 로직
  const displayPosts = useMemo(() => {
    let filtered = posts;
    if (filter === 'following') filtered = posts.filter((p) => following && following.includes(p.userId));
    return [...filtered].sort((a, b) => {
      if (sortBy === 'popular') return (b.likes || 0) - (a.likes || 0);
      if (sortBy === 'comments') return (b.comments || 0) - (a.comments || 0);
      if (sortBy === 'scraps') return (b.saves || 0) - (a.saves || 0);
      return b.createdAt - a.createdAt; 
    });
  }, [posts, filter, following, sortBy]);

  const [currentIndices, setCurrentIndices] = useState({});
  const handleScroll = (postId, e) => {
    const { scrollLeft, clientWidth } = e.target;
    if (clientWidth === 0) return;
    setCurrentIndices(prev => ({ ...prev, [postId]: Math.round(scrollLeft / clientWidth) }));
  };

  return (
    <section className="tab-page active" style={{ display: 'flex', flexDirection: 'column', backgroundColor: '#fff', height: '100%', overflow: 'hidden', position: 'relative' }}>
      
      {/* 상단 탭 헤더 */}
      <div style={{ zIndex: 10, backgroundColor: '#fff', paddingBottom: '12px', borderBottom: '1px solid #f1f1f1' }}>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 16px 12px' }}>
          <h2 className="section-title" style={{ fontSize: '1.2rem', fontWeight: '800', margin: 0 }}>최신 여정</h2>
          
          <select 
            value={sortBy} 
            onChange={(e) => setSortBy(e.target.value)}
            style={{ 
              padding: '6px 10px', borderRadius: '8px', border: '1px solid #E5E7EB', 
              fontSize: '12px', outline: 'none', backgroundColor: '#fff', color: '#495057', cursor: 'pointer'
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
              onClick={() => { setFilter(f); setSelectedGathering(null); }} 
              style={{
                padding: '6px 14px', borderRadius: '20px', border: 'none', cursor: 'pointer',
                backgroundColor: filter === f ? '#1A1A1A' : '#F1F3F5',
                color: filter === f ? '#fff' : '#495057',
                fontSize: '13px', fontWeight: filter === f ? 'bold' : 'normal',
                whiteSpace: 'nowrap', transition: 'all 0.2s'
              }}
            >
              {f === 'all' ? '전체' : f === 'following' ? '팔로잉' : '📍 내 주변'}
            </button>
          ))}
        </div>
      </div>

      {/* 본문 콘텐츠 영역 */}
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

            {!isLocating && myLocation && (
              <button 
                onClick={() => setIsCreateModalOpen(true)}
                style={{
                  position: 'absolute', bottom: '24px', right: '16px', zIndex: 15,
                  backgroundColor: '#52B788', color: '#fff', border: 'none', borderRadius: '30px',
                  padding: '14px 22px', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer',
                  boxShadow: '0 4px 16px rgba(82, 183, 136, 0.4)', display: 'flex', alignItems: 'center', gap: '8px',
                  transition: 'transform 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
              >
                <i className="fas fa-plus"></i> 동행 모집하기
              </button>
            )}

            {/* 조회용 바텀 시트 */}
            <div style={{
              position: 'absolute', bottom: 0, left: 0, width: '100%',
              backgroundColor: '#fff', borderTopLeftRadius: '24px', borderTopRightRadius: '24px',
              boxShadow: '0 -4px 20px rgba(0,0,0,0.1)', padding: '24px 20px 100px 20px', 
              transform: selectedGathering ? 'translateY(0)' : 'translateY(100%)',
              transition: 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)', zIndex: 20
            }}>
              {selectedGathering && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                    <div>
                      <span style={{ 
                        display: 'inline-block', padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold', marginBottom: '8px',
                        backgroundColor: selectedGathering.status === 'recruiting' ? '#EBFBEE' : '#F1F3F5',
                        color: selectedGathering.status === 'recruiting' ? '#2B8A3E' : '#868E96'
                      }}>
                        {selectedGathering.status === 'recruiting' ? '🔥 모집 중' : '🔒 모집 마감'}
                      </span>
                      <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#1A1A1A' }}>{selectedGathering.title}</h3>
                    </div>
                    <button onClick={() => setSelectedGathering(null)} style={{ background: 'none', border: 'none', fontSize: '20px', color: '#ADB5BD', cursor: 'pointer' }}><i className="fas fa-times"></i></button>
                  </div>
                  <p style={{ fontSize: '14px', color: '#495057', lineHeight: '1.5', marginBottom: '16px', whiteSpace: 'pre-wrap' }}>{selectedGathering.body}</p>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <img src={selectedGathering.authorAvatar || "https://api.dicebear.com/7.x/adventurer/svg?seed=fallback"} style={{ width: '24px', height: '24px', borderRadius: '50%' }} alt="host" />
                      <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#495057' }}>{selectedGathering.authorName}</span>
                    </div>
                    <span style={{ color: '#DEE2E6' }}>|</span>
                    <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#495057' }}>
                      인원 현황 <span style={{ color: '#52B788' }}>{selectedGathering.currentMembers?.length || 1}</span> / {selectedGathering.maxMembers}명
                    </span>
                  </div>

                  {auth.currentUser?.uid === selectedGathering.userId ? (
                    <button 
                      onClick={() => handleDeleteGathering(selectedGathering.id)}
                      style={{
                        width: '100%', padding: '16px', borderRadius: '14px', border: 'none',
                        backgroundColor: '#ffe3e3', color: '#e63946',
                        fontSize: '15px', fontWeight: 'bold', cursor: 'pointer', transition: 'background-color 0.2s'
                      }}
                    >
                      <i className="fas fa-trash-alt"></i> 동행 모집 취소하기 (삭제)
                    </button>
                  ) : (
                    <button 
                      onClick={() => handleJoinGathering(selectedGathering.id)}
                      disabled={selectedGathering.status === 'closed'}
                      style={{
                        width: '100%', padding: '16px', borderRadius: '14px', border: 'none',
                        backgroundColor: selectedGathering.status === 'recruiting' ? '#1A1A1A' : '#E9ECEF',
                        color: selectedGathering.status === 'recruiting' ? '#fff' : '#ADB5BD',
                        fontSize: '15px', fontWeight: 'bold', cursor: selectedGathering.status === 'recruiting' ? 'pointer' : 'default'
                      }}
                    >
                      {selectedGathering.status === 'recruiting' ? '참여 신청하고 채팅방 들어가기' : '인원이 가득 찼습니다'}
                    </button>
                  )}
                </>
              )}
            </div>

            {/* 라이브 동행 작성용 모달 오버레이 */}
            {isCreateModalOpen && (
              <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 30, display: 'flex', alignItems: 'flex-end' }}>
                <div style={{ width: '100%', backgroundColor: '#fff', borderTopLeftRadius: '24px', borderTopRightRadius: '24px', padding: '24px 20px 40px 20px', display: 'flex', flexDirection: 'column', gap: '16px', boxShadow: '0 -4px 24px rgba(0,0,0,0.2)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#1A1A1A' }}>🙋‍♂️ 새로운 동행 만들기</h3>
                    <button onClick={() => setIsCreateModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '20px', color: '#ADB5BD', cursor: 'pointer' }}><i className="fas fa-times"></i></button>
                  </div>

                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#868E96', display: 'block', marginBottom: '8px' }}>카테고리</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {[{key:'cafe', n:'☕️ 카페'}, {key:'food', n:'🍔 맛집'}, {key:'movie', n:'🎬 영화'}, {key:'etc', n:'🏃‍♀️ 활동'}].map(cat => (
                        <button key={cat.key} onClick={() => setNewCategory(cat.key)} style={{ padding: '8px 14px', borderRadius: '10px', border: newCategory === cat.key ? '2px solid #52B788' : '1px solid #E5E7EB', backgroundColor: newCategory === cat.key ? '#F1F9F5' : '#fff', color: newCategory === cat.key ? '#2D6A4F' : '#495057', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>{cat.n}</button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <input type="text" placeholder="방 제목을 입력하세요 (ex: 뚝섬 갈비 번개)" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #E5E7EB', fontSize: '14px', outline: 'none' }} />
                  </div>
                  <div>
                    <textarea placeholder="동행 조건을 자유롭게 설명해 주세요! (시간, 세부 모임 장소 등)" value={newBody} onChange={(e) => setNewBody(e.target.value)} style={{ width: '100%', height: '80px', padding: '12px', borderRadius: '10px', border: '1px solid #E5E7EB', fontSize: '14px', outline: 'none', resize: 'none' }} />
                  </div>

                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#868E96', display: 'block', marginBottom: '8px' }}>최대 인원 설정 ({newMaxMembers}명)</label>
                    <input type="range" min="2" max="8" value={newMaxMembers} onChange={(e) => setNewMaxMembers(e.target.value)} style={{ width: '100%', accentColor: '#52B788' }} />
                  </div>

                  <button onClick={handleCreateGathering} style={{ width: '100%', padding: '16px', borderRadius: '14px', border: 'none', backgroundColor: '#52B788', color: '#fff', fontSize: '15px', fontWeight: 'bold', cursor: 'pointer', marginTop: '8px' }}>
                    실시간 동행 핀 등록하기
                  </button>
                </div>
              </div>
            )}

            <style>{`
              @keyframes ping { 0% { transform: scale(1); opacity: 0.8; } 100% { transform: scale(2); opacity: 0; } }
            `}</style>
          </div>
        ) : (
          <div id="feed-container" style={{ paddingBottom: '80px' }}>
            {isLoading ? (
              <div className="loading-spinner" style={{ textAlign: 'center', padding: '50px', color: '#888' }}>여정을 불러오는 중... 🧭</div>
            ) : displayPosts.length === 0 ? (
              <div className="empty-state" style={{ padding: '40px', textAlign: 'center', color: '#888' }}>
                <div style={{ fontSize: '40px', marginBottom: '16px' }}>📭</div>
                <p>게시물이 없습니다.</p>
              </div>
            ) : (
              displayPosts.map((post) => {
                const userName = post.authorName || '여행자';
                const userAvatar = post.authorAvatar || 'https://api.dicebear.com/7.x/adventurer/svg?seed=fallback';
                const isLiked = post.likedBy?.includes(auth.currentUser?.uid);
                const isSaved = post.savedBy?.includes(auth.currentUser?.uid);
                const hasPhotos = post.route && post.route.length > 0 && post.route.some(s => s.photo);
                const currentIndex = currentIndices[post.id] || 0;

                return (
                  <article key={post.id} className="post-card" onClick={() => onOpenModal(post.id)} style={{ backgroundColor: '#fff', marginBottom: '8px' }}>
                    <header style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', gap: '12px' }} onClick={(e) => e.stopPropagation()}>
                      <img src={userAvatar} alt={userName} onClick={() => onOpenUser(post.userId)} style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover', cursor: 'pointer' }} />
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span onClick={() => onOpenUser(post.userId)} style={{ fontWeight: 'bold', fontSize: '14px', color: '#1A1A1A', cursor: 'pointer' }}>{userName}</span>
                          <span style={{ color: '#ADB5BD', fontSize: '12px' }}>• {post.createdAt ? formatTime(post.createdAt) : ''}</span>
                        </div>
                        <div style={{ fontSize: '12px', color: '#666', fontWeight: '500' }}>📍 {post.route?.[0]?.name || '위치 정보 없음'}</div>
                      </div>
                      <button style={{ background: 'none', border: 'none', color: '#ADB5BD', padding: '4px' }}><i className="fas fa-ellipsis-h"></i></button>
                    </header>

                    <div style={{ width: '100%', aspectRatio: '1 / 1', backgroundColor: '#F8F9FA', position: 'relative', overflow: 'hidden' }}>
                      {hasPhotos ? (
                        <>
                          <div onScroll={(e) => handleScroll(post.id, e)} className="photo-slider" style={{ display: 'flex', width: '100%', height: '100%', overflowX: 'auto', scrollSnapType: 'x mandatory', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                            {post.route.filter(s => s.photo).map((spot, idx) => (
                              <img key={idx} src={spot.photo} alt={`spot-${idx}`} style={{ width: '100%', height: '100%', flexShrink: 0, objectFit: 'cover', scrollSnapAlign: 'start' }} />
                            ))}
                          </div>
                          {post.route.filter(s => s.photo).length > 1 && (
                            <div style={{ position: 'absolute', top: '12px', right: '12px', backgroundColor: 'rgba(0,0,0,0.6)', color: '#fff', padding: '4px 10px', borderRadius: '14px', fontSize: '11px', fontWeight: 'bold', zIndex: 1 }}>
                              {currentIndex + 1} / {post.route.filter(s => s.photo).length}
                            </div>
                          )}
                        </>
                      ) : (
                        <div style={{ width: '100%', height: '100%' }}>
                          <RouteMap route={post.route} detailedPath={post.detailedPath} height="100%" />
                        </div>
                      )}
                    </div>

                    <div style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', color: '#1A1A1A', marginBottom: '10px' }} onClick={(e) => e.stopPropagation()}>
                        <button onClick={(e) => handleToggleLike(e, post.id, post.likedBy)} style={{ background: 'none', border: 'none', padding: 0, color: isLiked ? '#e63946' : '#1A1A1A', fontSize: '20px', cursor: 'pointer' }}>
                          <i className={isLiked ? "fas fa-heart" : "far fa-heart"}></i>
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); onOpenModal(post.id); }} style={{ background: 'none', border: 'none', padding: 0, color: '#1A1A1A', fontSize: '20px', cursor: 'pointer' }}>
                          <i className="far fa-comment"></i>
                        </button>
                        <button onClick={(e) => handleToggleSave(e, post.id)} style={{ background: 'none', border: 'none', padding: 0, color: '#1A1A1A', fontSize: '20px', cursor: 'pointer', marginLeft: 'auto' }}>
                          <i className={isSaved ? "fas fa-bookmark" : "far fa-bookmark"}></i>
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
          </div>
        )}
      </div>
      <style>{`.photo-slider::-webkit-scrollbar { display: none; }`}</style>
    </section>
  );
};

export default HomeTab;