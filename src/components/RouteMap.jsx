import React, { useState, useEffect } from 'react';
import { Map, Polyline, CustomOverlayMap } from 'react-kakao-maps-sdk';

// 🚨 props에 detailedPath 추가 (기본값 빈 배열)
const RouteMap = ({ route = [], detailedPath = [], width = '100%', height = '260px' }) => {
  const [map, setMap] = useState(null);
  
  const validRoute = route.filter(spot => spot && spot.lat && spot.lng);

  useEffect(() => {
    if (!map || validRoute.length === 0) return;

    if (validRoute.length === 1) {
      const singlePoint = new window.kakao.maps.LatLng(validRoute[0].lat, validRoute[0].lng);
      map.setCenter(singlePoint);
      map.setLevel(5); 
      return;
    }

    const bounds = new window.kakao.maps.LatLngBounds();
    
    // Bounds(화면 줌)는 구불구불한 도로가 아니라, '마커' 기준(validRoute)으로 잡아야 화면이 예쁩니다.
    validRoute.forEach(spot => bounds.extend(new window.kakao.maps.LatLng(spot.lat, spot.lng)));
    map.setBounds(bounds, 48, 48, 48, 48);
  }, [map, validRoute]);

  if (validRoute.length === 0) {
    return <div style={{width, height, background: 'var(--bg)', borderRadius: '16px', border: '1px solid var(--border)'}} />;
  }

  // 🚨 핵심 로직: detailedPath 데이터가 들어오면 그걸로 그리고, 없으면 기존처럼 마커(route)끼리 직선 연결!
  const polylinePath = detailedPath && detailedPath.length > 0 
    ? detailedPath.map(p => ({ lat: p.lat, lng: p.lng }))
    : validRoute.map(spot => ({ lat: spot.lat, lng: spot.lng }));

  return (
    <Map 
      center={{ lat: validRoute[0].lat, lng: validRoute[0].lng }} 
      style={{ width, height, borderRadius: '16px', overflow: 'hidden' }} 
      onCreate={setMap}
      draggable={true} zoomable={true} disableDoubleClickZoom={false}
    >
      {/* 🖤 경로 선 그리기 (직선 or 곡선 자동 판별됨) */}
      {polylinePath.length > 1 && (
        <Polyline
          path={[polylinePath]} // react-kakao-maps-sdk에서는 배열 안에 배열을 넣어야 합니다.
          strokeWeight={4}
          strokeColor={"#52B788"} // 선 색상을 앱 테마색으로 살짝 변경 (기존 #2C2A29)
          strokeOpacity={0.8}
          strokeStyle={"solid"}
        />
      )}
      
      {validRoute.map((spot, i) => (
        <CustomOverlayMap 
          key={i} 
          position={{ lat: spot.lat, lng: spot.lng }}
          yAnchor={1.1} 
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
            {spot.name && (
              <div style={{
                background: 'rgba(255, 255, 255, 0.85)',
                backdropFilter: 'blur(8px)', 
                padding: '4px 10px',
                borderRadius: '20px',
                fontSize: '11px',
                fontWeight: '700',
                color: '#2C2A29',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                border: '1px solid rgba(255,255,255,0.5)',
                whiteSpace: 'nowrap'
              }}>
                {spot.name}
              </div>
            )}
            
            <div style={{
              background: '#2C2A29', 
              color: '#fff', 
              borderRadius: '50%', 
              width: '20px', height: '20px', 
              display: 'flex', alignItems: 'center', justifyContent: 'center', 
              fontSize: '10px', fontWeight: '800', 
              border: '2px solid white', 
              boxShadow: '0 2px 6px rgba(0,0,0,0.2)'
            }}>
              {i + 1}
            </div>
          </div>
        </CustomOverlayMap>
      ))}
    </Map>
  );
};

export default RouteMap;