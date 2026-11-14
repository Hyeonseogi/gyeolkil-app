import { useState, useEffect, useMemo } from 'react';
import { Map, Polyline, CustomOverlayMap } from 'react-kakao-maps-sdk';
import { groupRouteByPlace, toCoordinate } from '../data';

// 카카오 SDK 가 아직(또는 끝내) 로드되지 않았을 때 대신 보여줄 자리표시자
const MapPlaceholder = ({ width, height, message }) => (
  <div
    style={{
      width,
      height,
      background: '#F1F3F5',
      borderRadius: '16px',
      border: '1px solid #E5E7EB',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#ADB5BD',
      fontSize: '13px',
      textAlign: 'center',
      padding: '12px'
    }}
  >
    {message}
  </div>
);

const isKakaoReady = () => typeof window !== 'undefined' && Boolean(window.kakao?.maps?.LatLng);

/**
 * 카카오 SDK 가 준비됐는지 알려준다.
 * SDK 는 외부 스크립트라 React 보다 늦게 도착할 수 있는데,
 * 한 번만 확인하면 늦게 로드된 경우 지도가 영영 비어 있게 된다.
 * 준비될 때까지 잠깐 지켜보다가 도착하면 다시 렌더링한다.
 */
const useKakaoReady = () => {
  const [ready, setReady] = useState(isKakaoReady);

  useEffect(() => {
    if (ready) return undefined;

    let cancelled = false;
    const startedAt = Date.now();

    const timer = setInterval(() => {
      if (cancelled) return;
      if (isKakaoReady()) {
        setReady(true);
        clearInterval(timer);
      } else if (Date.now() - startedAt > 10000) {
        // 10초가 지나도 안 오면 키 누락·네트워크 차단으로 보고 포기한다.
        clearInterval(timer);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [ready]);

  return ready;
};

const RouteMap = ({ route = [], detailedPath = [], width = '100%', height = '260px', highlightIndex = null }) => {
  const [map, setMap] = useState(null);
  const kakaoReady = useKakaoReady();

  // 좌표가 있는 지점만 추린다.
  // useMemo 가 없으면 렌더링마다 새 배열이 만들어져 아래 useEffect 가 매번 실행되고,
  // 그때마다 setBounds/panTo 가 호출돼 사용자가 지도를 확대·이동할 수 없게 된다.
  const validRoute = useMemo(
    () => (Array.isArray(route) ? route : []).filter(
      (spot) => spot && toCoordinate(spot.lat) !== null && toCoordinate(spot.lng) !== null
    ),
    [route]
  );

  // 핀은 사진마다가 아니라 장소마다 하나씩 찍는다.
  // 같은 장소의 사진들은 좌표가 같아서, 따로 찍으면 핀이 겹쳐 번호 하나만 보인다.
  const places = useMemo(() => groupRouteByPlace(validRoute), [validRoute]);

  const polylinePath = useMemo(() => {
    const source = Array.isArray(detailedPath) && detailedPath.length > 0 ? detailedPath : validRoute;
    return source
      .map((p) => ({ lat: Number(p.lat), lng: Number(p.lng) }))
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  }, [detailedPath, validRoute]);

  // 경로 전체가 한눈에 들어오도록 지도 범위를 맞춘다. (경로가 바뀔 때만)
  useEffect(() => {
    if (!map || validRoute.length === 0 || !window.kakao?.maps) return;

    if (validRoute.length === 1) {
      map.setCenter(new window.kakao.maps.LatLng(validRoute[0].lat, validRoute[0].lng));
      map.setLevel(5);
      return;
    }

    const bounds = new window.kakao.maps.LatLngBounds();
    validRoute.forEach((spot) => bounds.extend(new window.kakao.maps.LatLng(spot.lat, spot.lng)));
    map.setBounds(bounds, 48, 48, 48, 48);
  }, [map, validRoute]);

  // 사진을 넘길 때 해당 마커로 지도 중심을 부드럽게 이동
  useEffect(() => {
    if (!map || highlightIndex === null || !window.kakao?.maps) return;
    const spot = validRoute[highlightIndex];
    if (!spot) return;
    map.panTo(new window.kakao.maps.LatLng(spot.lat, spot.lng));
  }, [highlightIndex, map, validRoute]);

  // 카카오 SDK 미로드(키 누락·네트워크 차단)여도 앱 전체가 죽지 않도록 방어
  if (!kakaoReady) {
    return <MapPlaceholder width={width} height={height} message="🗺️ 지도를 불러오는 중..." />;
  }

  if (validRoute.length === 0) {
    return <MapPlaceholder width={width} height={height} message="위치 정보가 없는 여정입니다" />;
  }

  return (
    <Map
      center={{ lat: validRoute[0].lat, lng: validRoute[0].lng }}
      style={{ width, height, borderRadius: '16px', overflow: 'hidden' }}
      onCreate={setMap}
      draggable
      zoomable
      disableDoubleClickZoom={false}
    >
      {/* 경로 선 그리기 */}
      {polylinePath.length > 1 && (
        <Polyline
          path={[polylinePath]}
          strokeWeight={4}
          strokeColor="#52B788" // 곁길 테마 컬러
          strokeOpacity={0.8}
          strokeStyle="solid"
        />
      )}

      {places.map((place, i) => {
        // 부모가 현재 보고 있는 사진이 이 장소에 속하면 마커를 강조
        const isActive = highlightIndex !== null && place.indexes.includes(highlightIndex);

        return (
          <CustomOverlayMap
            key={`${place.lat},${place.lng},${i}`}
            position={{ lat: place.lat, lng: place.lng }}
            yAnchor={0.5} // 핀 중심을 좌표 한가운데로 맞춤
          >
            <div
              title={place.name || `${i + 1}번째 장소`}
              style={{
                background: isActive ? '#52B788' : '#2C2A29',
                color: '#fff',
                borderRadius: '50%',
                width: isActive ? '32px' : '22px',
                height: isActive ? '32px' : '22px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: isActive ? '14px' : '10px',
                fontWeight: '800',
                border: isActive ? '3px solid white' : '2px solid white',
                boxShadow: isActive ? '0 4px 12px rgba(82, 183, 136, 0.6)' : '0 2px 6px rgba(0,0,0,0.2)',
                transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                transform: isActive ? 'scale(1)' : 'scale(0.9)',
                zIndex: isActive ? 10 : 1
              }}
            >
              {i + 1}
            </div>
          </CustomOverlayMap>
        );
      })}
    </Map>
  );
};

export default RouteMap;
