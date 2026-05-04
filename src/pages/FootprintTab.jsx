import React from 'react';
import { MY_FOOTPRINT } from '../data';

const FootprintTab = () => {
  const footprint = MY_FOOTPRINT;
  const totalPlaces = footprint.reduce((acc, f) => acc + f.places.length, 0);
  const cities = [...new Set(footprint.map(f => f.region))];

  return (
    <section className="tab-page active" style={{ overflowY: 'auto' }}>
      <div className="footprint-page">
        <div className="footprint-header">
          <h2>내 발자취</h2>
          <p className="footprint-sub">여행했던 모든 순간이 여기 남아있어요</p>
        </div>
        
        <div className="footprint-stats">
          <div className="fp-stat"><strong>{totalPlaces}</strong><span>방문 장소</span></div>
          <div className="fp-stat"><strong>{footprint.length}</strong><span>여행 루트</span></div>
          <div className="fp-stat"><strong>{cities.length}</strong><span>도시</span></div>
        </div>

        <div className="footprint-map-wrap" style={{ height: '220px', background: '#edf7ee', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#2D6A4F', fontWeight: 'bold' }}>🗺️ 전국 발자취 지도 영역</p>
        </div>

        <div className="footprint-timeline">
          <h3 className="section-title">🗓 여행 타임라인</h3>
          <div id="footprint-timeline-list">
            {footprint.map((item, idx) => (
              <div key={item.id} className="timeline-item">
                <div className="timeline-dot-col">
                  <div className="timeline-dot"></div>
                  {idx !== footprint.length - 1 && <div className="timeline-line"></div>}
                </div>
                <div className="timeline-content">
                  <div className="timeline-date">{item.date}</div>
                  <div className="timeline-title">{item.title}</div>
                  <div className="timeline-route-mini">
                    {item.places.map((p, i) => (
                      <React.Fragment key={i}>
                        <span className="route-place-chip">{p}</span>
                        {i < item.places.length - 1 && <span className="route-arrow">›</span>}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default FootprintTab;