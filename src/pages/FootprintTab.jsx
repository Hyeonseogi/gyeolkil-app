import React, { useMemo } from 'react';
import { MY_FOOTPRINT } from '../data';
// 추후 우리가 만든 RouteMap을 여기에 불러와서 전국 지도를 렌더링할 수 있습니다!
// import RouteMap from '../components/RouteMap'; 

const FootprintTab = ({ footprints = MY_FOOTPRINT }) => {
  
  // 1. useMemo를 활용한 통계 연산 최적화 및 방어적 코드 추가
  const { totalPlaces, citiesCount } = useMemo(() => {
    // 안전한 배열 처리를 위해 fallback([]) 추가
    const safeFootprints = footprints || [];
    
    const placesCount = safeFootprints.reduce((acc, f) => acc + (f.places?.length || 0), 0);
    const uniqueCities = [...new Set(safeFootprints.map(f => f.region).filter(Boolean))];
    
    return {
      totalPlaces: placesCount,
      citiesCount: uniqueCities.length
    };
  }, [footprints]);

  return (
    <section className="tab-page active" style={{ overflowY: 'auto' }}>
      <div className="footprint-page">
        <div className="footprint-header">
          <h2>내 발자취</h2>
          <p className="footprint-sub">여행했던 모든 순간이 여기 남아있어요</p>
        </div>
        
        <div className="footprint-stats">
          <div className="fp-stat"><strong>{totalPlaces}</strong><span>방문 장소</span></div>
          <div className="fp-stat"><strong>{footprints?.length || 0}</strong><span>여행 루트</span></div>
          <div className="fp-stat"><strong>{citiesCount}</strong><span>도시</span></div>
        </div>

        {/* 2. 전국 지도 영역 (추후 RouteMap 컴포넌트로 대체 예정) */}
        <div className="footprint-map-wrap" style={{ height: '220px', background: '#edf7ee', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '16px', margin: '0 20px 24px' }}>
          <p style={{ color: '#2D6A4F', fontWeight: 'bold' }}>🗺️ 전국 발자취 지도 영역</p>
        </div>

        <div className="footprint-timeline">
          <h3 className="section-title" style={{ padding: '0 20px' }}>🗓 여행 타임라인</h3>
          
          {/* 3. 신규 유저를 위한 Empty State (빈 화면) 처리 */}
          {!footprints || footprints.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: '#888' }}>
              <div style={{ fontSize: '40px', marginBottom: '16px' }}>🏃‍♂️</div>
              <p style={{ marginBottom: '8px', fontWeight: 'bold', color: '#2C2A29' }}>아직 다녀온 여행이 없어요!</p>
              <p style={{ fontSize: '14px' }}>가운데 <strong>[+]</strong> 버튼을 눌러 첫 여정을 기록해보세요.</p>
            </div>
          ) : (
            <div id="footprint-timeline-list" style={{ padding: '0 20px' }}>
              {footprints.map((item, idx) => (
                <div key={item.id} className="timeline-item">
                  <div className="timeline-dot-col">
                    <div className="timeline-dot"></div>
                    {idx !== footprints.length - 1 && <div className="timeline-line"></div>}
                  </div>
                  <div className="timeline-content">
                    <div className="timeline-date">{item.date}</div>
                    <div className="timeline-title">{item.title}</div>
                    <div className="timeline-route-mini">
                      {item.places?.map((p, i) => (
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
          )}
        </div>
      </div>
    </section>
  );
};

export default FootprintTab;