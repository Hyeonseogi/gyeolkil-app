import { normalizeSido, pickPlaceName } from './utils';

/**
 * 좌표 → 장소 이름·시도 (카카오 지도 SDK 의 services 라이브러리).
 * 브라우저용 JavaScript 키로 동작하므로 서버 프록시나 REST 키가 필요 없다.
 *
 * 실패해도 기록 흐름을 막지 않는다. SDK 가 없거나, 응답이 늦거나, 바다 한가운데처럼
 * 주소가 없는 좌표면 null 을 돌려주고, 호출한 쪽은 기본 이름("장소 n")을 그대로 둔다.
 */
const LOOKUP_TIMEOUT_MS = 3000;

export function reverseGeocode(lat, lng) {
  return new Promise((resolve) => {
    const services = typeof window !== 'undefined' ? window.kakao?.maps?.services : null;
    if (!services?.Geocoder) {
      resolve(null);
      return;
    }

    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), LOOKUP_TIMEOUT_MS);

    try {
      // 카카오 API 는 (경도, 위도) 순서로 받는다.
      new services.Geocoder().coord2Address(lng, lat, (results, status) => {
        clearTimeout(timer);
        const first = status === services.Status.OK ? results?.[0] : null;
        if (!first) {
          finish(null);
          return;
        }
        finish({
          name: pickPlaceName(first),
          sido: normalizeSido(first.address?.region_1depth_name || first.road_address?.region_1depth_name)
        });
      });
    } catch (error) {
      clearTimeout(timer);
      console.warn('주소 변환 실패:', error);
      finish(null);
    }
  });
}

/**
 * 여러 지점을 한 번에 조회한다. 같은 좌표(80m 묶기로 맞춰진 사진들)는 한 번만 묻는다.
 * 반환: 입력과 같은 순서의 결과 배열 (조회하지 못한 지점은 null)
 */
export async function reverseGeocodeAll(spots) {
  const cache = new Map();
  return Promise.all(
    spots.map((spot) => {
      if (spot?.lat === null || spot?.lat === undefined || spot?.lng === null || spot?.lng === undefined) {
        return Promise.resolve(null);
      }
      const key = `${spot.lat},${spot.lng}`;
      if (!cache.has(key)) cache.set(key, reverseGeocode(spot.lat, spot.lng));
      return cache.get(key);
    })
  );
}
