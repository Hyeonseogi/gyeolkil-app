import React, { useState, useMemo } from 'react';
import RouteMap from '../components/RouteMap';

const DiscoverTab = ({ posts = [] }) => { // 🚨 방어적 코드: posts가 undefined일 때를 대비해 기본값 빈 배열 설정
  const [region, setRegion] = useState('all');
  const [search, setSearch] = useState('');

  // 1. useMemo를 활용한 성능 최적화 (인기 게시물 추출)
  const popularPosts = useMemo(() => {
    return [...posts]
      .sort((a, b) => (b.likes || 0) - (a.likes || 0))
      .slice(0, 4);
  }, [posts]);

  // 2. 지역 필터 + 텍스트 검색 기능 완벽 연동
  const filteredPosts = useMemo(() => {
    return posts.filter(p => {
      // 지역 조건 충족 여부
      const matchRegion = region === 'all' || p.region === region;
      
      // 검색어 조건 충족 여부 (제목, 본문, 또는 루트의 장소명 중 하나라도 포함되면 통과)
      const keyword = search.toLowerCase();
      const matchSearch = 
        !keyword || 
        (p.title && p.title.toLowerCase().includes(keyword)) ||
        (p.body && p.body.toLowerCase().includes(keyword)) ||
        (p.route && p.route.some(spot => spot.name && spot.name.toLowerCase().includes(keyword)));

      return matchRegion && matchSearch;
    });
  }, [posts, region, search]);

  return (
    <section className="tab-page active" style={{ overflowY: 'auto' }}>
      <div className="discover-header">
        <div className="search-bar">
          <i className="fas fa-search"></i>
          <input 
            type="text" 
            placeholder="여행지, 코스, 장소 검색..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      
      <div className="discover-section">
        <h3 className="section-title">🔥 인기 여행 루트</h3>
        <div className="routes-grid">
          {popularPosts.length > 0 ? (
            popularPosts.map(post => (
              <div key={post.id} className="route-card">
                <div className="route-card-canvas" style={{ background: '#edf7ee', height: '90px', borderRadius: '12px 12px 0 0', overflow: 'hidden' }}>
                  <RouteMap route={post.route || []} height="90px" />
                </div>
                <div className="route-card-info">
                  <h4 style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{post.title}</h4>
                  {/* 방어적 코드: route가 없을 때를 대비한 ? 추가 */}
                  <p>❤️ {post.likes || 0} · {post.route?.length || 0}곳</p>
                </div>
              </div>
            ))
          ) : (
            <div style={{ padding: '20px', textAlign: 'center', color: '#999', width: '100%' }}>아직 인기 게시물이 없습니다.</div>
          )}
        </div>
      </div>

      <div className="discover-section">
        <h3 className="section-title">📍 지역별 탐색</h3>
        <div className="region-chips">
          {['all', 'seoul', 'busan', 'jeju', 'jeonju', 'gyeongju'].map(r => (
            <button key={r} className={`region-chip ${region === r ? 'active' : ''}`} onClick={() => setRegion(r)}>
              {r === 'all' ? '전체' : r === 'seoul' ? '서울' : r === 'busan' ? '부산' : r === 'jeju' ? '제주' : r === 'jeonju' ? '전주' : '경주'}
            </button>
          ))}
        </div>
        
        <div className="discover-grid">
          {/* 3. 검색 및 필터링 결과가 없을 때의 UI 처리 */}
          {filteredPosts.length > 0 ? (
            filteredPosts.map(post => (
              <div key={post.id} className="discover-post-card">
                <div className="discover-thumb-canvas" style={{ background: '#edf7ee', height: '110px', borderRadius: '12px 12px 0 0', overflow: 'hidden' }}>
                  <RouteMap route={post.route || []} height="110px" />
                </div>
                <div className="discover-card-info">
                  <h4 style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{post.title}</h4>
                  <p>❤️ {post.likes || 0} · 📍 {post.route?.[0]?.name || '위치 미상'}</p>
                </div>
              </div>
            ))
          ) : (
            <div style={{ gridColumn: '1 / -1', padding: '40px 0', textAlign: 'center', color: '#888' }}>
              <i className="fas fa-search" style={{ fontSize: '24px', marginBottom: '12px', color: '#ccc' }}></i>
              <p>해당하는 여행 루트가 없습니다.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default DiscoverTab;