import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  buildPreviewPath,
  estimateTravelMinutes,
  loadRoute,
  guessTransitMode,
  isWalkableDistance,
  parseCarRoute,
  parseWalkRoute,
  resolveTransitMode,
  routeKey
} from './routing';

const at = (h, min = 0) => new Date(2026, 7, 14, h, min).getTime();

describe('guessTransitMode — 고르지 않았을 때의 이동수단', () => {
  it('3km 보다 멀면 차량이다', () => {
    expect(guessTransitMode(3.1, 120)).toBe('car');
    expect(guessTransitMode(75, null)).toBe('car');
  });

  it('가까워도 사진 간격에 비해 너무 빨리 이동했으면 차량이다', () => {
    expect(guessTransitMode(2, 5)).toBe('car'); // 시속 24km
  });

  it('가깝고 걸을 만한 속도면 도보다', () => {
    expect(guessTransitMode(1.5, 40)).toBe('walk');
    expect(guessTransitMode(2, 30)).toBe('walk'); // 시속 4km
  });

  it('사진 간격을 모르면 거리만 본다', () => {
    expect(guessTransitMode(2, null)).toBe('walk');
    expect(guessTransitMode(2, 0)).toBe('walk');
    expect(guessTransitMode(2, undefined)).toBe('walk');
  });

  it('거리를 알 수 없으면 도보로 둔다', () => {
    expect(guessTransitMode(Infinity, 10)).toBe('walk');
    expect(guessTransitMode(undefined, 10)).toBe('walk');
  });
});

describe('resolveTransitMode — 화면 표시와 저장이 함께 쓰는 이동수단', () => {
  const gyeongbokgung = { lat: 37.5796, lng: 126.977 };
  const cityHall = { lat: 37.5665, lng: 126.978 }; // 직선 1.5km

  it('직접 고른 이동수단이 있으면 그대로 따른다', () => {
    expect(resolveTransitMode({ ...gyeongbokgung, transitType: 'car' }, cityHall)).toBe('car');
    expect(resolveTransitMode({ ...gyeongbokgung, transitType: 'walk' }, { lat: 37.8813, lng: 127.7298 })).toBe('walk');
  });

  it('고르지 않았으면 거리와 사진 간격으로 추측한다 — 1.5km 를 40분에 갔으면 도보', () => {
    const start = { ...gyeongbokgung, timestamp: at(10, 0) };
    const end = { ...cityHall, timestamp: at(10, 40) };
    expect(resolveTransitMode(start, end)).toBe('walk');
  });

  it('1.5km 를 4분에 갔으면 차량 — 예전에는 화면엔 차량으로 보이고 도보로 저장됐다', () => {
    const start = { ...gyeongbokgung, timestamp: at(10, 0) };
    const end = { ...cityHall, timestamp: at(10, 4) };
    expect(resolveTransitMode(start, end)).toBe('car');
  });

  it('촬영 시각이 추정값이면 간격을 믿지 않고 거리만 본다', () => {
    const start = { ...gyeongbokgung, timestamp: at(10, 0), timeEstimated: true };
    const end = { ...cityHall, timestamp: at(10, 4) };
    expect(resolveTransitMode(start, end)).toBe('walk');
  });
});

describe('estimateTravelMinutes — 경로 탐색이 안 될 때의 예상 시간', () => {
  // 2026-11-14 에 같은 구간을 실제 경로 탐색으로 조회한 값과 비교한다.
  const within = (actual, expected, tolerance) => Math.abs(actual - expected) <= expected * tolerance;

  it.each([
    ['경복궁 → 서울시청', 1.5, 24],
    ['성수 → 뚝섬', 0.8, 12],
    ['홍대 → 여의도', 3.8, 70],
    ['강남 → 잠실', 6.6, 97]
  ])('도보 %s: 실제 값의 ±20% 안이다', (_label, distKm, realMinutes) => {
    expect(within(estimateTravelMinutes(distKm, 'walk'), realMinutes, 0.2)).toBe(true);
  });

  it.each([
    ['성수 → 뚝섬', 0.8, 7],
    ['홍대 → 여의도', 3.8, 21],
    ['강남 → 잠실', 6.6, 33],
    ['서울역 → 수원', 32.2, 89],
    ['서울 → 춘천', 74.8, 123]
  ])('차량 %s: 실제 값의 ±25% 안이다', (_label, distKm, realMinutes) => {
    expect(within(estimateTravelMinutes(distKm, 'car'), realMinutes, 0.25)).toBe(true);
  });

  it('시내 차량은 예전 계산(직선 거리 ÷ 시속 40km)보다 훨씬 길게 잡는다', () => {
    // 경복궁 → 서울시청: 예전 3분, 실제 19분
    expect(estimateTravelMinutes(1.5, 'car')).toBeGreaterThanOrEqual(10);
  });

  it('멀수록 오래 걸린다 (거리대가 바뀌는 지점에서 시간이 줄어들지 않는다)', () => {
    let previous = 0;
    for (let km = 0.5; km <= 120; km += 0.5) {
      const minutes = estimateTravelMinutes(km, 'car');
      expect(minutes).toBeGreaterThanOrEqual(previous);
      previous = minutes;
    }
  });

  it('거리가 0 이거나 알 수 없으면 0분이다', () => {
    expect(estimateTravelMinutes(0, 'walk')).toBe(0);
    expect(estimateTravelMinutes(Infinity, 'car')).toBe(0);
    expect(estimateTravelMinutes(undefined, 'car')).toBe(0);
  });

  it('12km 가 넘으면 걸어갈 거리가 아니라고 본다', () => {
    expect(isWalkableDistance(6.6)).toBe(true);
    expect(isWalkableDistance(32)).toBe(false);
  });
});

describe('경로 탐색 응답 해석', () => {
  it('TMAP 보행자 경로: 첫 요소의 총 소요 시간(초)을 분으로 올림하고, 선과 점을 경로로 잇는다', () => {
    const data = {
      features: [
        { geometry: { type: 'Point', coordinates: [126.977, 37.5796] }, properties: { totalTime: 1410, totalDistance: 1700 } },
        { geometry: { type: 'LineString', coordinates: [[126.977, 37.5796], [126.978, 37.57]] }, properties: {} },
        { geometry: { type: 'Point', coordinates: [126.978, 37.5665] }, properties: {} }
      ]
    };
    const route = parseWalkRoute(data);
    expect(route.type).toBe('walk');
    expect(route.minutes).toBe(24); // 1410초 = 23.5분 → 24분
    expect(route.path).toHaveLength(4);
    expect(route.path[0]).toEqual({ lng: 126.977, lat: 37.5796 });
  });

  it('카카오 자동차 경로: 소요 시간(초)을 분으로 올림하고, 꼭짓점 배열을 좌표 쌍으로 푼다', () => {
    const data = {
      routes: [
        {
          result_code: 0,
          summary: { duration: 1130, distance: 3000 },
          sections: [{ roads: [{ vertexes: [126.977, 37.5796, 126.9775, 37.575] }, { vertexes: [126.978, 37.5665] }] }]
        }
      ]
    };
    const route = parseCarRoute(data);
    expect(route.type).toBe('car');
    expect(route.minutes).toBe(19); // 1130초 = 18.8분 → 19분
    expect(route.path).toEqual([
      { lng: 126.977, lat: 37.5796 },
      { lng: 126.9775, lat: 37.575 },
      { lng: 126.978, lat: 37.5665 }
    ]);
  });

  it('경로를 찾지 못한 응답은 null — 호출한 쪽이 예상치와 직선으로 대신한다', () => {
    expect(parseWalkRoute({ error: { code: 'INVALID_API_KEY' } })).toBeNull();
    expect(parseWalkRoute({ features: [] })).toBeNull();
    expect(parseCarRoute({ routes: [{ result_code: 104, result_msg: '출발지와 도착지가 너무 가깝습니다' }] })).toBeNull();
    expect(parseCarRoute(null)).toBeNull();
  });

  it('구간 키는 이동수단과 양 끝 좌표로 정해진다 — 순서가 바뀌면 다른 구간이다', () => {
    const a = { lat: 1, lng: 2 };
    const b = { lat: 3, lng: 4 };
    expect(routeKey(a, b, 'walk')).not.toBe(routeKey(a, b, 'car'));
    expect(routeKey(a, b, 'walk')).not.toBe(routeKey(b, a, 'walk'));
    expect(routeKey(a, b, 'walk')).toBe(routeKey({ ...a }, { ...b }, 'walk'));
  });
});

describe('buildPreviewPath — 2단계 지도에 그릴 경로', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('받아 둔 경로가 없으면 장소 사이를 직선으로 잇고, 같은 장소·위치 없는 사진은 건너뛴다', () => {
    const spots = [
      { lat: 35.1, lng: 129.01, timestamp: at(10) },
      { lat: 35.1, lng: 129.01, timestamp: at(10, 10) },
      { lat: 35.11, lng: 129.02, timestamp: at(11) },
      { lat: null, lng: null, timestamp: at(12) }
    ];
    expect(buildPreviewPath(spots)).toEqual([
      { lat: 35.1, lng: 129.01 },
      { lat: 35.11, lng: 129.02 }
    ]);
  });

  it('받아 둔 실제 경로가 있으면 그 길을 따라 그린다', async () => {
    const start = { lat: 35.2, lng: 129.05, timestamp: at(9) };
    const end = { lat: 35.205, lng: 129.055, timestamp: at(9, 30) };
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        features: [
          { geometry: { type: 'Point', coordinates: [129.05, 35.2] }, properties: { totalTime: 600 } },
          { geometry: { type: 'LineString', coordinates: [[129.05, 35.2], [129.052, 35.203], [129.055, 35.205]] } }
        ]
      })
    })));

    await loadRoute(start, end, resolveTransitMode(start, end));
    expect(buildPreviewPath([start, end])).toEqual([
      { lng: 129.05, lat: 35.2 },
      { lng: 129.05, lat: 35.2 },
      { lng: 129.052, lat: 35.203 },
      { lng: 129.055, lat: 35.205 }
    ]);
  });

  it('빈 목록이나 잘못된 값이면 빈 경로', () => {
    expect(buildPreviewPath([])).toEqual([]);
    expect(buildPreviewPath(null)).toEqual([]);
  });
});

describe('resolveTransitMode — 순서를 직접 바꾼 구간', () => {
  it('다음 사진이 더 일찍 찍혔으면 간격으로 속도를 따지지 않고 거리만 본다', () => {
    // 1.5km — 시각만 보면 4분 만에 간 것처럼 보이지만 순서가 거꾸로라 믿지 않는다
    const later = { lat: 37.5796, lng: 126.977, timestamp: at(10, 4) };
    const earlier = { lat: 37.5666, lng: 126.978, timestamp: at(10) };
    expect(resolveTransitMode(later, earlier)).toBe('walk');
  });
});