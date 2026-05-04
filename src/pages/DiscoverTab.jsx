import React, { useState } from 'react';
import RouteMap from '../components/RouteMap';

const DiscoverTab = ({ posts }) => {
  const [region, setRegion] = useState('all');
  const [search, setSearch] = useState('');

  const popularPosts = [...posts].sort((a, b) => b.likes - a.likes).slice(0, 4);
  const filteredPosts = posts.filter(p => region === 'all' || p.region === region);

  return (
    <section className="tab-page active" style={{ overflowY: 'auto' }}>
      <div className="discover-header">
        <div className="search-bar">
          <i className="fas fa-search"></i>
          <input 
            type="text" 
            placeholder="여행지, 코스, 사람 검색..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      
      <div className="discover-section">
        <h3 className="section-title">🔥 인기 여행 루트</h3>
        <div className="routes-grid">
          {popularPosts.map(post => (
            <div key={post.id} className="route-card">
              <div className="route-card-canvas" style={{ background: '#edf7ee', height: '90px' }}>
                 <RouteMap route={post.route} height="90px" />
              </div>
              <div className="route-card-info">
                <h4>{post.title}</h4>
                <p>❤️ {post.likes} · {post.route.length}곳</p>
              </div>
            </div>
          ))}
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
          {filteredPosts.map(post => (
            <div key={post.id} className="discover-post-card">
              <div className="discover-thumb-canvas" style={{ background: '#edf7ee', height: '110px' }}>
                <RouteMap route={post.route} height="110px" />
              </div>
              <div className="discover-card-info">
                <h4>{post.title}</h4>
                <p>❤️ {post.likes} · 📍 {post.route[0]?.name || ''}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default DiscoverTab;