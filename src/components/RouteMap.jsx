import React, { useState, useEffect } from 'react';
import { Map, Polyline, CustomOverlayMap } from 'react-kakao-maps-sdk';

const RouteMap = ({ route = [], width = '100%', height = '260px' }) => {
  const [map, setMap] = useState(null);
  
  // 유효한 좌표가 있는 장소만 필터링
  const validRoute = route.filter(spot => spot && spot.lat && spot.lng);

  useEffect(() => {
    if (!map || validRoute.length === 0) return;

    // 🚨 핵심 개선: 장소가 딱 1개일 때는 억지로 Bounds를 잡지 않고 적당한 줌 레벨 지정
    if (validRoute.length === 1) {
      const singlePoint = new window.kakao.maps.LatLng(validRoute[0].lat, validRoute[0].lng);
      map.setCenter(singlePoint);
      map.setLevel(5); // 1개일 때 보기 좋은 줌 레벨
      return;
    }

    // 장소가 2개 이상일 때는 기존처럼 모든 마커가 보이도록 자동 줌인/아웃
    const bounds = new window.kakao.maps.LatLngBounds();
    validRoute.forEach(spot => bounds.extend(new window.kakao.maps.LatLng(spot.lat, spot.lng)));
    
    // 장소명이 잘리지 않도록 여백(padding) 적용
    map.setBounds(bounds, 48, 48, 48, 48);
  }, [map, validRoute]);

  if (validRoute.length === 0) {
    return <div style={{width, height, background: 'var(--bg)', borderRadius: '16px', border: '1px solid var(--border)'}} />;
  }

  const path = validRoute.map(spot => ({ lat: spot.lat, lng: spot.lng }));

  return (
    <Map 
      center={path[0]} 
      style={{ width, height, borderRadius: '16px', overflow: 'hidden' }} 
      onCreate={setMap}
      draggable={false} zoomable={false} disableDoubleClickZoom={true}
    >
      {/* 🖤 경로 선: 투명도를 주어 지도의 도로와 차별화 */}
      {path.length > 1 && (
        <Polyline
          path={[path]}
          strokeWeight={4}
          strokeColor={"#2C2A29"} 
          strokeOpacity={0.6}
          strokeStyle={"solid"}
        />
      )}
      
      {validRoute.map((spot, i) => (
        <CustomOverlayMap 
          key={i} 
          position={{ lat: spot.lat, lng: spot.lng }}
          yAnchor={1.1} // 마커 위치를 위로 살짝 띄움
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
            
            {/* 장소명 커스텀 태그 */}
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
            
            {/* 포인트 마커 */}
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