import React, { useState, useEffect } from 'react';
import { Map, Polyline, CustomOverlayMap } from 'react-kakao-maps-sdk';

// 🚨 [NEW] props에 highlightIndex 추가 (기본값 null)
const RouteMap = ({ route = [], detailedPath = [], width = '100%', height = '260px', highlightIndex = null }) => {
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
    validRoute.forEach(spot => bounds.extend(new window.kakao.maps.LatLng(spot.lat, spot.lng)));
    map.setBounds(bounds, 48, 48, 48, 48);
  }, [map, validRoute]);

  // 🚨 [NEW] activeIndex가 바뀔 때마다 지도의 중심을 해당 마커로 부드럽게 이동시킴 (PanTo)
  useEffect(() => {
    if (map && highlightIndex !== null && validRoute[highlightIndex]) {
      const spot = validRoute[highlightIndex];
      const moveLatLon = new window.kakao.maps.LatLng(spot.lat, spot.lng);
      map.panTo(moveLatLon); // 중심 이동 애니메이션
    }
  }, [highlightIndex, map, validRoute]);

  if (validRoute.length === 0) {
    return <div style={{width, height, background: 'var(--bg)', borderRadius: '16px', border: '1px solid var(--border)'}} />;
  }

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
      {/* 경로 선 그리기 */}
      {polylinePath.length > 1 && (
        <Polyline
          path={[polylinePath]} 
          strokeWeight={4}
          strokeColor={"#52B788"} // 곁길 테마 컬러
          strokeOpacity={0.8}
          strokeStyle={"solid"}
        />
      )}
      
      {validRoute.map((spot, i) => {
        // 🚨 [NEW] 현재 마커가 부모 컴포넌트에서 선택한(보고 있는) 사진의 인덱스와 같은지 확인
        const isActive = highlightIndex === i;

        return (
          <CustomOverlayMap 
            key={i} 
            position={{ lat: spot.lat, lng: spot.lng }}
            yAnchor={0.5} // 핀 중심을 좌표 한가운데로 맞춤
          >
            {/* 🚨 [NEW] 인터랙티브 마커 디자인 (말풍선 삭제 & 애니메이션 추가) */}
            <div style={{
              background: isActive ? '#52B788' : '#2C2A29', // 활성화 시 초록색, 아니면 다크그레이
              color: '#fff', 
              borderRadius: '50%', 
              width: isActive ? '32px' : '22px',   // 활성화 시 1.5배 커짐!
              height: isActive ? '32px' : '22px', 
              display: 'flex', alignItems: 'center', justifyContent: 'center', 
              fontSize: isActive ? '14px' : '10px', 
              fontWeight: '800', 
              border: isActive ? '3px solid white' : '2px solid white', 
              boxShadow: isActive ? '0 4px 12px rgba(82, 183, 136, 0.6)' : '0 2px 6px rgba(0,0,0,0.2)',
              transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)', // 쫀득하게 커지는 애니메이션
              transform: isActive ? 'scale(1)' : 'scale(0.9)',
              zIndex: isActive ? 10 : 1 // 활성화된 핀이 가장 위로 올라오도록 설정
            }}>
              {i + 1}
            </div>
          </CustomOverlayMap>
        );
      })}
    </Map>
  );
};

export default RouteMap;