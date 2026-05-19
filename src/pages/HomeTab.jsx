import React, { useState, useEffect, useMemo } from 'react';
import RouteMap from '../components/RouteMap';
import { formatTime } from '../data'; 
import { 
  collection, query, orderBy, doc, updateDoc, 
  arrayUnion, arrayRemove, increment, onSnapshot, getDoc 
} from 'firebase/firestore';
import { db, auth } from '../firebase';

const HomeTab = ({ following, onOpenModal, onOpenUser }) => {
  const [posts, setPosts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    setIsLoading(true);
    const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const fetchedPosts = [];
      querySnapshot.forEach((docSnap) => {
        fetchedPosts.push({ id: docSnap.id, ...docSnap.data() });
      });
      setPosts(fetchedPosts);
      setIsLoading(false);
    }, (error) => {
      console.error('게시물 불러오기 실패:', error);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleToggleLike = async (e, postId, currentLikedBy = []) => {
    e.stopPropagation();
    const user = auth.currentUser;
    if (!user) return;

    try {
      const postRef = doc(db, 'posts', postId);
      const userRef = doc(db, 'users', user.uid);
      const isLiked = currentLikedBy.includes(user.uid);

      await updateDoc(postRef, {
        likedBy: isLiked ? arrayRemove(user.uid) : arrayUnion(user.uid),
        likes: increment(isLiked ? -1 : 1)
      });

      const userSnap = await getDoc(userRef);
      const currentLiked = userSnap.data()?.likedPosts || [];
      let updatedLiked = isLiked 
        ? currentLiked.filter((id) => id !== postId) 
        : [...currentLiked, postId];

      await updateDoc(userRef, { likedPosts: updatedLiked });
    } catch (error) { console.error(error); }
  };

  const handleToggleSave = async (e, postId) => {
    e.stopPropagation();
    const user = auth.currentUser;
    if (!user) return;

    try {
      const userRef = doc(db, 'users', user.uid);
      const postRef = doc(db, 'posts', postId);
      const postSnap = await getDoc(postRef);
      const postData = postSnap.data();
      const savedBy = postData?.savedBy || [];
      const alreadySaved = savedBy.includes(user.uid);

      await updateDoc(postRef, {
        savedBy: alreadySaved ? arrayRemove(user.uid) : arrayUnion(user.uid),
        saves: increment(alreadySaved ? -1 : 1)
      });

      const userSnap = await getDoc(userRef);
      const currentSaved = userSnap.data()?.savedPosts || [];
      let updatedSaved = alreadySaved 
        ? currentSaved.filter((id) => id !== postId) 
        : [...currentSaved, postId];

      await updateDoc(userRef, { savedPosts: updatedSaved });
    } catch (error) { console.error(error); }
  };

  const displayPosts = useMemo(() => {
    if (filter === 'following') {
      return posts.filter((p) => following && following.includes(p.userId));
    }
    if (filter === 'popular') {
      return [...posts].sort((a, b) => (b.likes || 0) - (a.likes || 0));
    }
    if (filter === 'nearby') {
      return posts.slice(0, 5); 
    }
    return posts;
  }, [posts, filter, following]);

  const [currentIndices, setCurrentIndices] = useState({});
  const handleScroll = (postId, e) => {
    const { scrollLeft, clientWidth } = e.target;
    if (clientWidth === 0) return;
    const index = Math.round(scrollLeft / clientWidth);
    setCurrentIndices(prev => ({ ...prev, [postId]: index }));
  };

  return (
    <section className="tab-page active" style={{ overflowY: 'auto', backgroundColor: '#fff', height: '100%' }}>
      
      <div className="discover-header" style={{ padding: '16px 16px 0' }}>
        <h2 className="section-title" style={{ fontSize: '1.2rem', marginBottom: '12px', fontWeight: '800' }}>최신 여정</h2>
      </div>

      <div className="feed-filter" style={{ display: 'flex', gap: '8px', padding: '0 16px 12px', overflowX: 'auto', borderBottom: '1px solid #f1f1f1' }}>
        {['all', 'following', 'nearby', 'popular'].map((f) => (
          <button
            key={f}
            className={`filter-chip ${filter === f ? 'active' : ''}`}
            onClick={() => setFilter(f)}
            style={{
              padding: '6px 14px', borderRadius: '20px', border: 'none', cursor: 'pointer',
              backgroundColor: filter === f ? '#1A1A1A' : '#F1F3F5',
              color: filter === f ? '#fff' : '#495057',
              fontSize: '13px', fontWeight: filter === f ? 'bold' : 'normal',
              whiteSpace: 'nowrap', transition: 'all 0.2s'
            }}
          >
            {f === 'all' ? '전체' : f === 'following' ? '팔로잉' : f === 'nearby' ? '내 주변' : '인기'}
          </button>
        ))}
      </div>

      <div id="feed-container" style={{ paddingBottom: '80px', backgroundColor: '#F1F3F5' }}>
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
                    <div style={{ fontSize: '12px', color: '#666', fontWeight: '500' }}>
                      📍 {post.route?.[0]?.name || '위치 정보 없음'}
                    </div>
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
                    
                    {/* 🚨 [버그 해결!] 바로 이 부분입니다! (e) => 추가 및 e.stopPropagation() 연동 완료 */}
                    <button onClick={(e) => { e.stopPropagation(); onOpenModal(post.id); }} style={{ background: 'none', border: 'none', padding: 0, color: '#1A1A1A', fontSize: '20px', cursor: 'pointer' }}>
                      <i className="far fa-comment"></i>
                    </button>
                    
                    <button onClick={(e) => handleToggleSave(e, post.id)} style={{ background: 'none', border: 'none', padding: 0, color: '#1A1A1A', fontSize: '20px', cursor: 'pointer', marginLeft: 'auto' }}>
                      <i className={isSaved ? "fas fa-bookmark" : "far fa-bookmark"}></i>
                    </button>
                  </div>

                  <div style={{ fontWeight: 'bold', fontSize: '13px', color: '#1A1A1A', marginBottom: '6px' }}>좋아요 {post.likes || 0}개</div>
                  <div style={{ fontWeight: '800', fontSize: '15px', color: '#1A1A1A', lineHeight: '1.3' }}>{post.title}</div>
                  
                  <div style={{ fontSize: '13px', color: '#495057', marginTop: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {post.body}
                  </div>
                </div>

              </article>
            );
          })
        )}
      </div>
      
      <style>{`.photo-slider::-webkit-scrollbar { display: none; }`}</style>
    </section>
  );
};

export default HomeTab;