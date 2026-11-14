import { getDistanceFromLatLonInKm, getShotTime } from './utils';

/**
 * 두 지점 사이의 이동수단·이동 시간·실제 경로.
 *
 * 기록 2단계(미리 보기)와 게시가 같은 함수를 쓴다. 예전에는 2단계가 직선 거리로 어림한
 * 시간을 보여주고 게시할 때만 경로 탐색을 해서, 미리 본 숫자와 게시된 글의 숫자가 달랐다.
 *
 * API 키는 브라우저에 두지 않는다. /api/route/* 를 개발 서버 프록시나 Vercel 서버리스 함수가
 * 대신 호출한다. (정적 배포처럼 그런 서버가 없으면 null 을 돌려주고, 호출한 쪽이 예상치로 대신한다)
 */

export const WALK_THRESHOLD_KM = 3; // 이보다 멀면 걸어서 가지 않았다고 본다
const WALK_LABEL_LIMIT_KM = 12; // 이보다 멀면 도보 "시간"은 의미가 없어 거리만 보여준다

// ── 이동수단 추측 ────────────────────────────────────

/**
 * 사용자가 고르지 않았을 때의 이동수단.
 * 멀면 차량, 가깝더라도 사진 간격에 비해 너무 빨리 이동했으면(시속 10km 초과) 차량으로 본다.
 * 사진 간격을 모르면(촬영 시각이 없는 사진) 거리만 본다.
 */
export function guessTransitMode(distKm, gapMinutes) {
  const dist = Number(distKm);
  if (!Number.isFinite(dist)) return 'walk';
  if (dist > WALK_THRESHOLD_KM) return 'car';

  const gap = Number(gapMinutes);
  if (Number.isFinite(gap) && gap > 0 && dist / (gap / 60) > 10) return 'car';
  return 'walk';
}

/** 한 구간에 적용할 이동수단 — 직접 고른 값이 있으면 그것, 없으면 추측. 화면 표시와 저장이 이 함수 하나를 쓴다. */
export function resolveTransitMode(start, end) {
  if (start?.transitType === 'walk' || start?.transitType === 'car') return start.transitType;

  const distKm = getDistanceFromLatLonInKm(start?.lat, start?.lng, end?.lat, end?.lng);
  const from = getShotTime(start);
  const to = getShotTime(end);
  const gapMinutes = from && to ? Math.abs(to - from) / 60000 : null;
  return guessTransitMode(distKm, gapMinutes);
}

// ── 예상치 ───────────────────────────────────────────

/**
 * 경로 탐색 결과가 없을 때 쓰는 이동 시간 예상(분). 직선 거리만으로 어림한다.
 *
 * 길은 직선이 아니므로 우회 비율을 곱한다. 차량은 시내에서 신호·정체 때문에 느리고
 * 멀리 갈수록(고속도로) 빨라지므로 거리에 따라 평균 속도를 올린다.
 * 실제 경로 탐색 결과 6개 구간(0.8km ~ 75km)과 비교해 맞춘 값이다.
 */
export function estimateTravelMinutes(distKm, mode) {
  const dist = Number(distKm);
  if (!Number.isFinite(dist) || dist <= 0) return 0;

  if (mode === 'walk') return Math.max(1, Math.ceil(((dist * 1.2) / 4.5) * 60));

  const roadKm = dist * 1.4;
  const speedKmH = Math.min(55, 14 + 0.45 * roadKm);
  return Math.max(1, Math.ceil((roadKm / speedKmH) * 60 + 3)); // +3분: 출발·주차
}

/** 걸어서 갈 만한 거리인지 (아니면 도보 시간 대신 거리만 보여준다) */
export const isWalkableDistance = (distKm) => Number(distKm) <= WALK_LABEL_LIMIT_KM;

// ── 응답 해석 ────────────────────────────────────────

/** TMAP 보행자 경로 응답 → { type, minutes, path }. 쓸 수 없는 응답이면 null */
export function parseWalkRoute(data) {
  const features = data?.features;
  if (!Array.isArray(features) || features.length === 0) return null;

  const path = [];
  features.forEach((feature) => {
    const geometry = feature?.geometry;
    if (geometry?.type === 'LineString') {
      (geometry.coordinates || []).forEach((coord) => path.push({ lng: coord[0], lat: coord[1] }));
    } else if (geometry?.type === 'Point') {
      path.push({ lng: geometry.coordinates[0], lat: geometry.coordinates[1] });
    }
  });

  return {
    type: 'walk',
    minutes: Math.ceil((features[0]?.properties?.totalTime || 0) / 60),
    path
  };
}

/** 카카오모빌리티 자동차 경로 응답 → { type, minutes, path }. 쓸 수 없는 응답이면 null */
export function parseCarRoute(data) {
  const route = data?.routes?.[0];
  if (!Array.isArray(route?.sections)) return null;

  const path = [];
  route.sections.forEach((section) => {
    (section?.roads || []).forEach((road) => {
      const vertexes = road?.vertexes || [];
      for (let i = 0; i + 1 < vertexes.length; i += 2) {
        path.push({ lng: vertexes[i], lat: vertexes[i + 1] });
      }
    });
  });

  return {
    type: 'car',
    minutes: Math.ceil((route.summary?.duration || 0) / 60),
    path
  };
}

// ── 조회 (같은 구간은 한 번만) ─────────────────────────

const requestRoute = async (start, end, mode) => {
  try {
    if (mode === 'walk') {
      const res = await fetch('/api/route/pedestrian', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startX: start.lng,
          startY: start.lat,
          endX: end.lng,
          endY: end.lat,
          reqCoordType: 'WGS84GEO',
          resCoordType: 'WGS84GEO',
          startName: '출발',
          endName: '도착'
        })
      });
      return res.ok ? parseWalkRoute(await res.json()) : null;
    }

    const res = await fetch(`/api/route/car?origin=${start.lng},${start.lat}&destination=${end.lng},${end.lat}`);
    return res.ok ? parseCarRoute(await res.json()) : null;
  } catch {
    return null;
  }
};

const finished = new Map(); // key → 결과 (실패는 null)
const inFlight = new Map(); // key → Promise

export const routeKey = (start, end, mode) => `${mode}:${start.lat},${start.lng}>${end.lat},${end.lng}`;

/** 이미 받아 둔 결과. 아직 조회 전이면 undefined, 조회했지만 실패했으면 null */
export const peekRoute = (start, end, mode) => finished.get(routeKey(start, end, mode));

/**
 * 구간의 경로를 가져온다. 같은 구간·같은 이동수단은 한 번만 요청하고 결과를 재사용한다.
 * (2단계에서 미리 불러 둔 결과를 게시할 때 그대로 쓰므로 호출 수가 늘지 않는다)
 * retryFailed: 앞서 실패한 구간을 다시 시도한다 — 게시할 때 한 번 더 기회를 준다.
 */
export function loadRoute(start, end, mode, { retryFailed = false } = {}) {
  const key = routeKey(start, end, mode);

  if (finished.has(key) && !(retryFailed && finished.get(key) === null)) {
    return Promise.resolve(finished.get(key));
  }
  if (!inFlight.has(key)) {
    inFlight.set(
      key,
      requestRoute(start, end, mode).then((result) => {
        finished.set(key, result);
        inFlight.delete(key);
        return result;
      })
    );
  }
  return inFlight.get(key);
}
