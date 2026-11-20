import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  buildNotificationContent,
  countPlaces,
  extractRegionsFromRoute,
  formatDateLabel,
  formatDistanceKm,
  formatDuration,
  formatTripLength,
  getRouteDistanceKm,
  kakaoDirectionsUrl,
  formatNotificationTime,
  formatTime,
  formatTripDate,
  formatTripDayLabel,
  getDistanceFromLatLonInKm,
  getNotificationTypeColors,
  getNotificationTypeIcon,
  getRegionFromCoords,
  getRegionKeysForSpot,
  getLikeCount,
  getSaveCount,
  getShotTime,
  getStayMinutes,
  getTimestampValue,
  getTripDayNumber,
  getTripRange,
  getTripSortTime,
  groupRouteByPlace,
  hasLocation,
  isDefaultPlaceName,
  normalizeSido,
  pickPlaceName,
  REGION_LABELS
} from './utils';

afterEach(() => {
  vi.useRealTimers();
});

describe('getDistanceFromLatLonInKm — 하버사인 거리', () => {
  it('같은 지점의 거리는 0이다', () => {
    expect(getDistanceFromLatLonInKm(37.5445, 127.056, 37.5445, 127.056)).toBe(0);
  });

  it('서울시청 ↔ 부산시청은 약 325km 다', () => {
    const d = getDistanceFromLatLonInKm(37.5665, 126.978, 35.1796, 129.0756);
    expect(d).toBeGreaterThan(315);
    expect(d).toBeLessThan(335);
  });

  it('성수동 안의 두 지점은 클러스터링 반경(80m) 안에 들어온다', () => {
    // 사진 여러 장이 같은 장소로 묶이는지 판단하는 기준
    expect(getDistanceFromLatLonInKm(37.5445, 127.056, 37.5449, 127.0562)).toBeLessThan(0.08);
  });

  it('좌표가 없거나 숫자가 아니면 Infinity 를 돌려준다', () => {
    // "내 주변" 필터가 좌표 없는 게시물을 걸러낼 수 있어야 한다
    expect(getDistanceFromLatLonInKm(undefined, 127, 37, 127)).toBe(Infinity);
    expect(getDistanceFromLatLonInKm(37, 127, null, 127)).toBe(Infinity);
    expect(getDistanceFromLatLonInKm('가나다', 127, 37, 127)).toBe(Infinity);
  });

  it('방향이 바뀌어도 거리는 같다', () => {
    const a = getDistanceFromLatLonInKm(37.5665, 126.978, 33.4996, 126.5312);
    const b = getDistanceFromLatLonInKm(33.4996, 126.5312, 37.5665, 126.978);
    expect(a).toBeCloseTo(b, 6);
  });
});

describe('getLikeCount — 좋아요 수', () => {
  it('likedBy 배열이 있으면 그 길이를 쓴다 (likes 숫자와 어긋나도)', () => {
    expect(getLikeCount({ likedBy: ['a', 'b'], likes: 5 })).toBe(2);
    expect(getLikeCount({ likedBy: [], likes: 3 })).toBe(0);
  });

  it('likedBy 가 없는 예전 글은 likes 숫자를 쓰고, 음수나 이상한 값은 0', () => {
    expect(getLikeCount({ likes: 7 })).toBe(7);
    expect(getLikeCount({ likes: -1 })).toBe(0);
    expect(getLikeCount({ likes: 'abc' })).toBe(0);
    expect(getLikeCount(null)).toBe(0);
  });
});

describe('hasLocation — 지점 좌표 유무', () => {
  it('위도·경도가 모두 있으면 true', () => {
    expect(hasLocation({ lat: 37.5445, lng: 127.056 })).toBe(true);
    expect(hasLocation({ lat: '37.5445', lng: '127.056' })).toBe(true);
  });

  it('위치 정보 없는 사진(null 좌표)은 false — 서울시청 같은 기본값으로 채우지 않는다', () => {
    expect(hasLocation({ lat: null, lng: null })).toBe(false);
    expect(hasLocation({ lat: 37.5, lng: undefined })).toBe(false);
    expect(hasLocation(null)).toBe(false);
  });
});

describe('getRegionFromCoords — 좌표로 지역 판별', () => {
  it.each([
    ['서울 성수동', 37.5445, 127.056, 'seoul'],
    ['부산 해운대', 35.158, 129.16, 'busan'],
    ['제주 서귀포', 33.252, 126.562, 'jeju'],
    ['전주 한옥마을', 35.815, 127.154, 'jeonju'],
    ['대전 성심당', 36.3277, 127.4273, 'daejeon'],
    ['대구 동성로', 35.869, 128.594, 'daegu'],
    ['광주 충장로', 35.1495, 126.9146, 'gwangju'],
    ['울산 태화강', 35.5484, 129.3008, 'ulsan'],
    ['인천 송도', 37.3894, 126.6413, 'incheon'],
    ['세종 정부청사', 36.504, 127.265, 'sejong']
  ])('%s → %s', (_label, lat, lng, expected) => {
    expect(getRegionFromCoords(lat, lng)).toBe(expected);
  });

  it('도(道) 지역은 상자로 판별하지 않는다 — 경계가 복잡해 틀린 지역을 내놓게 된다', () => {
    expect(getRegionFromCoords(37.8813, 127.7298)).toBeNull(); // 강원 춘천
    expect(getRegionFromCoords(36.5684, 128.7294)).toBeNull(); // 경북 안동
    expect(getRegionFromCoords(0, 0)).toBeNull();
  });

  it('잘못된 값이면 null 이다', () => {
    expect(getRegionFromCoords(undefined, undefined)).toBeNull();
    expect(getRegionFromCoords('서울', '한국')).toBeNull();
  });

  it('판별된 지역 키는 화면에 쓰는 라벨을 모두 가지고 있다', () => {
    ['seoul', 'busan', 'jeju', 'jeonju', 'gyeongju', 'incheon', 'daejeon', 'daegu', 'gwangju', 'ulsan', 'sejong'].forEach(
      (key) => {
        expect(REGION_LABELS[key]).toBeTruthy();
      }
    );
  });
});

describe('시도 이름 — 카카오 주소 변환 결과 다루기', () => {
  it('짧은 이름·긴 이름·특별자치도 이름을 모두 두 글자 약칭으로 통일한다', () => {
    expect(normalizeSido('대전')).toBe('대전');
    expect(normalizeSido('대전광역시')).toBe('대전');
    expect(normalizeSido('강원특별자치도')).toBe('강원');
    expect(normalizeSido('전북특별자치도')).toBe('전북');
    expect(normalizeSido('세종특별자치시')).toBe('세종');
    expect(normalizeSido('제주특별자치도')).toBe('제주');
  });

  it('앞 두 글자만 따면 틀리는 이름도 맞게 줄인다', () => {
    expect(normalizeSido('충청북도')).toBe('충북');
    expect(normalizeSido('경상남도')).toBe('경남');
    expect(normalizeSido('전라남도')).toBe('전남');
  });

  it('모르는 이름이나 빈 값은 null 이다', () => {
    expect(normalizeSido('도쿄도')).toBeNull();
    expect(normalizeSido('')).toBeNull();
    expect(normalizeSido(undefined)).toBeNull();
  });

  it('시도를 알면 상자 판별보다 시도를 믿는다 — 도 지역도 지역이 잡힌다', () => {
    const chuncheon = { lat: 37.8813, lng: 127.7298, sido: '강원' };
    expect(getRegionKeysForSpot(chuncheon)).toEqual(['gangwon']);
  });

  it('서울 상자 안이지만 실제로는 경기인 곳은 경기로 본다', () => {
    const hanam = { lat: 37.54, lng: 127.17, sido: '경기' };
    expect(getRegionFromCoords(hanam.lat, hanam.lng)).toBe('seoul');
    expect(getRegionKeysForSpot(hanam)).toEqual(['gyeonggi']);
  });

  it('전주·경주는 시도와 함께 담는다 (대표 여행지 버튼과 시도 버튼 양쪽에서 찾을 수 있게)', () => {
    expect(getRegionKeysForSpot({ lat: 35.815, lng: 127.154, sido: '전북' })).toEqual(['jeonju', 'jeonbuk']);
  });

  it('시도 정보가 없는 예전 글은 좌표 상자로 판별한다', () => {
    expect(getRegionKeysForSpot({ lat: 36.3277, lng: 127.4273 })).toEqual(['daejeon']);
    expect(getRegionKeysForSpot({ lat: 37.8813, lng: 127.7298 })).toEqual([]);
  });

  it('경로의 지역에도 시도가 반영된다', () => {
    const route = [
      { lat: 37.8813, lng: 127.7298, sido: '강원' },
      { lat: 37.75, lng: 128.87, sido: '강원' },
      { lat: 37.5445, lng: 127.056, sido: '서울' }
    ];
    expect(extractRegionsFromRoute(route)).toEqual(['gangwon', 'seoul']);
  });
});

describe('pickPlaceName — 자동으로 채울 장소 이름', () => {
  it('건물 이름이 있으면 그것을 쓴다', () => {
    const result = {
      address: { region_2depth_name: '종로구', region_3depth_name: '세종로' },
      road_address: { building_name: '경복궁' }
    };
    expect(pickPlaceName(result)).toBe('경복궁');
  });

  it('건물 이름이 비어 있으면 구·동 이름을 쓴다', () => {
    const result = {
      address: { region_2depth_name: '중구', region_3depth_name: '은행동' },
      road_address: { building_name: '' }
    };
    expect(pickPlaceName(result)).toBe('중구 은행동');
  });

  it('"전주시 완산구"처럼 두 단계면 뒤쪽만 쓴다', () => {
    const result = { address: { region_2depth_name: '전주시 완산구', region_3depth_name: '풍남동3가' }, road_address: null };
    expect(pickPlaceName(result)).toBe('완산구 풍남동3가');
  });

  it('쓸 정보가 없으면 빈 문자열이다 — 호출한 쪽이 기본 이름을 유지한다', () => {
    expect(pickPlaceName(null)).toBe('');
    expect(pickPlaceName({})).toBe('');
  });
});

describe('groupRouteByPlace — 사진을 장소 단위로 묶기', () => {
  const cafe = { lat: 36.3277, lng: 127.4273 };
  const park = { lat: 36.35, lng: 127.38 };

  it('기본 이름("장소 n")과 직접 붙인 이름을 구분한다', () => {
    expect(isDefaultPlaceName('장소 3')).toBe(true);
    expect(isDefaultPlaceName('')).toBe(true);
    expect(isDefaultPlaceName(undefined)).toBe(true);
    expect(isDefaultPlaceName('성심당')).toBe(false);
    expect(isDefaultPlaceName('장소 3 근처')).toBe(false);
  });

  it('좌표가 같은 연속한 사진은 한 장소다', () => {
    const route = [
      { ...cafe, name: '장소 1' },
      { ...cafe, name: '장소 2' },
      { ...park, name: '장소 3' }
    ];
    const groups = groupRouteByPlace(route);
    expect(groups).toHaveLength(2);
    expect(groups[0].spots).toHaveLength(2);
    expect(groups[0].indexes).toEqual([0, 1]);
    expect(groups[1].indexes).toEqual([2]);
    expect(countPlaces(route)).toBe(2);
  });

  it('묶인 사진 중 하나에만 이름을 붙였으면 그 이름이 장소 이름이 된다', () => {
    const groups = groupRouteByPlace([
      { ...cafe, name: '장소 1' },
      { ...cafe, name: '성심당' }
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe('성심당');
  });

  it('같은 좌표라도 서로 다른 이름을 직접 붙였으면 묶지 않는다', () => {
    const groups = groupRouteByPlace([
      { ...cafe, name: '바버샵' },
      { ...cafe, name: '볼링장' }
    ]);
    expect(groups.map((g) => g.name)).toEqual(['바버샵', '볼링장']);
  });

  it('같은 곳을 다시 들르면 따로 센다 (연속한 경우만 묶는다)', () => {
    const route = [{ ...cafe, name: '숙소' }, { ...park, name: '공원' }, { ...cafe, name: '숙소' }];
    expect(countPlaces(route)).toBe(3);
  });

  it('좌표가 없는 지점은 서로 묶지 않는다', () => {
    const route = [
      { lat: null, lng: null, name: '장소 1' },
      { lat: null, lng: null, name: '장소 2' }
    ];
    expect(countPlaces(route)).toBe(2);
  });

  it('배열이 아니면 빈 배열이다', () => {
    expect(groupRouteByPlace(null)).toEqual([]);
    expect(countPlaces(undefined)).toBe(0);
  });
});

describe('extractRegionsFromRoute — 경로에서 지역 뽑기', () => {
  it('여러 지역을 지나면 모두 담고 중복은 제거한다', () => {
    const route = [
      { lat: 37.5445, lng: 127.056 }, // 서울
      { lat: 37.583, lng: 126.985 }, // 서울(중복)
      { lat: 35.158, lng: 129.16 } // 부산
    ];
    expect(extractRegionsFromRoute(route)).toEqual(['seoul', 'busan']);
  });

  it('latitude / longitude 처럼 다른 필드명도 인식한다', () => {
    expect(extractRegionsFromRoute([{ latitude: 33.252, longitude: 126.562 }])).toEqual(['jeju']);
  });

  it('배열이 아니거나 좌표가 없으면 빈 배열이다', () => {
    expect(extractRegionsFromRoute(null)).toEqual([]);
    expect(extractRegionsFromRoute([{ name: '어딘가' }])).toEqual([]);
  });
});

describe('getTimestampValue — 여러 시간 형식 통일', () => {
  it('숫자(ms)는 그대로 쓴다', () => {
    expect(getTimestampValue(1700000000000)).toBe(1700000000000);
  });

  it('Firestore Timestamp 의 toMillis() 를 사용한다', () => {
    expect(getTimestampValue({ toMillis: () => 1700000000000 })).toBe(1700000000000);
  });

  it('seconds 필드만 있는 형태도 ms 로 바꾼다', () => {
    expect(getTimestampValue({ seconds: 1700000000 })).toBe(1700000000000);
  });

  it('ISO 문자열도 처리한다', () => {
    expect(getTimestampValue('2025-01-01T00:00:00.000Z')).toBe(Date.parse('2025-01-01T00:00:00.000Z'));
  });

  it('값이 없거나 해석할 수 없으면 0 이다', () => {
    // serverTimestamp() 직후에는 null 이 내려오는데, 이때 화면이 깨지면 안 된다
    expect(getTimestampValue(null)).toBe(0);
    expect(getTimestampValue(undefined)).toBe(0);
    expect(getTimestampValue('언젠가')).toBe(0);
  });
});

describe('formatTime — 상대 시간 표기', () => {
  const now = new Date('2025-06-15T12:00:00+09:00');

  const at = (msAgo) => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    return now.getTime() - msAgo;
  };

  it('1분 이내는 방금 전', () => {
    expect(formatTime(at(30 * 1000))).toBe('방금 전');
  });

  it('분 단위', () => {
    expect(formatTime(at(5 * 60 * 1000))).toBe('5분 전');
  });

  it('시간 단위', () => {
    expect(formatTime(at(3 * 60 * 60 * 1000))).toBe('3시간 전');
  });

  it('일 단위', () => {
    expect(formatTime(at(2 * 24 * 60 * 60 * 1000))).toBe('2일 전');
  });

  it('일주일이 지나면 날짜로 표기한다', () => {
    expect(formatTime(at(10 * 24 * 60 * 60 * 1000))).toMatch(/월 \d+일$/);
  });

  it('올해 글은 연도 없이, 지난해 이전 글은 연도를 붙여 표기한다', () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    expect(formatTime(new Date(2025, 2, 7).getTime())).toBe('3월 7일');
    expect(formatTime(new Date(2024, 5, 10).getTime())).toBe('2024년 6월 10일');
    expect(formatNotificationTime(new Date(2023, 11, 25).getTime())).toBe('2023년 12월 25일');
  });

  it('값이 없으면 빈 문자열이라 화면에 undefined 가 찍히지 않는다', () => {
    expect(formatTime(null)).toBe('');
    expect(formatTime(undefined)).toBe('');
  });

  it('알림 시간도 같은 규칙을 따른다', () => {
    expect(formatNotificationTime(at(90 * 1000))).toBe('1분 전');
    expect(formatNotificationTime(null)).toBe('');
  });
});

describe('formatDateLabel — 발자취 타임라인 날짜', () => {
  it('연-월-일을 두 자리로 채워 표기한다', () => {
    expect(formatDateLabel(new Date(2025, 2, 7).getTime())).toBe('2025년 03월 07일');
  });

  it('시간 정보가 없으면 날짜 미상으로 표시한다', () => {
    expect(formatDateLabel(null)).toBe('날짜 미상');
  });
});

describe('여행 날짜 — 사진 촬영 시각에서 뽑는다', () => {
  // 로컬 시간으로 만들어야 실행 환경의 시간대와 무관하게 통과한다.
  const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime();

  it('가장 이른 촬영 시각과 가장 늦은 촬영 시각이 여행 기간이다 (순서가 섞여 있어도)', () => {
    const route = [{ timestamp: at(2026, 8, 15) }, { timestamp: at(2026, 8, 14) }, { timestamp: at(2026, 8, 16) }];
    expect(getTripRange(route)).toEqual({ start: at(2026, 8, 14), end: at(2026, 8, 16) });
  });

  it('촬영 시각이 하나도 없으면 null — 게시일을 여행 날짜인 척 내놓지 않는다', () => {
    expect(getTripRange([{ name: '장소' }, { timestamp: null }, { timestamp: 0 }])).toBeNull();
    expect(getTripRange([])).toBeNull();
    expect(getTripRange(undefined)).toBeNull();
    expect(formatTripDate([{ name: '장소' }])).toBe('');
  });

  it('촬영 시각이 없는 장소는 건너뛰고 나머지로 계산한다', () => {
    const route = [{ name: '시각 없음' }, { timestamp: at(2026, 8, 14) }];
    expect(formatTripDate(route)).toBe('2026.08.14');
  });

  it('당일치기는 날짜 하나로 표시한다', () => {
    const route = [{ timestamp: at(2026, 8, 14, 9) }, { timestamp: at(2026, 8, 14, 21) }];
    expect(formatTripDate(route)).toBe('2026.08.14');
  });

  it('같은 해 여러 날은 끝 날짜의 연도를 생략한다', () => {
    const route = [{ timestamp: at(2026, 8, 14) }, { timestamp: at(2026, 9, 2) }];
    expect(formatTripDate(route)).toBe('2026.08.14 – 09.02');
  });

  it('해를 넘긴 여행은 양쪽 연도를 모두 적는다', () => {
    const route = [{ timestamp: at(2025, 12, 31) }, { timestamp: at(2026, 1, 2) }];
    expect(formatTripDate(route)).toBe('2025.12.31 – 2026.01.02');
  });

  it('타임라인 정렬은 게시일이 아니라 여행을 시작한 날을 따른다', () => {
    const augustTripPostedToday = { createdAt: at(2026, 11, 14), route: [{ timestamp: at(2026, 8, 14) }] };
    const octoberTripPostedEarlier = { createdAt: at(2026, 10, 20), route: [{ timestamp: at(2026, 10, 18) }] };
    const sorted = [augustTripPostedToday, octoberTripPostedEarlier].sort(
      (a, b) => getTripSortTime(b) - getTripSortTime(a)
    );
    expect(sorted[0]).toBe(octoberTripPostedEarlier);
  });

  it('촬영 시각 대신 파일 날짜가 들어간 사진은 여행 날짜 계산에서 뺀다', () => {
    const downloaded = { timestamp: at(2026, 11, 14), timeEstimated: true };
    const real = { timestamp: at(2026, 8, 14) };
    expect(getShotTime(downloaded)).toBe(0);
    expect(getShotTime(real)).toBe(at(2026, 8, 14));
    expect(formatTripDate([downloaded, real])).toBe('2026.08.14');
    expect(formatTripDate([downloaded])).toBe('');
  });

  it('촬영 시각이 없는 예전 글은 게시 시각으로 정렬한다', () => {
    expect(getTripSortTime({ createdAt: at(2026, 5, 1), route: [{ name: '장소' }] })).toBe(at(2026, 5, 1));
    expect(getTripSortTime({ createdAt: at(2026, 5, 1) })).toBe(at(2026, 5, 1));
  });
});

describe('getSaveCount — 저장 수', () => {
  it('저장한 사람 목록이 있으면 숫자 필드보다 목록 길이를 믿는다', () => {
    expect(getSaveCount({ savedBy: ['a', 'b'], saves: 5 })).toBe(2);
  });

  it('목록이 없는 예전 글은 숫자 필드를 쓰고, 음수나 이상한 값은 0 으로 본다', () => {
    expect(getSaveCount({ saves: 3 })).toBe(3);
    expect(getSaveCount({ saves: -1 })).toBe(0);
    expect(getSaveCount({})).toBe(0);
    expect(getSaveCount(null)).toBe(0);
  });
});

describe('체류 시간 · 여행 일차', () => {
  const at = (y, m, d, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime();

  it('1시간이 넘으면 시간·분으로 풀어 쓴다', () => {
    expect(formatDuration(45)).toBe('45분');
    expect(formatDuration(60)).toBe('1시간');
    expect(formatDuration(130)).toBe('2시간 10분');
    expect(formatDuration(899)).toBe('14시간 59분');
  });

  it('숫자가 아니거나 음수면 0분으로 본다', () => {
    expect(formatDuration(undefined)).toBe('0분');
    expect(formatDuration(-5)).toBe('0분');
  });

  it('같은 날 찍은 사진 사이는 간격에서 이동 시간을 뺀 만큼 머문 것이다', () => {
    const cafe = { timestamp: at(2024, 3, 28, 13, 0) };
    const park = { timestamp: at(2024, 3, 28, 15, 30) };
    expect(getStayMinutes(cafe, park, 20)).toBe(130);
  });

  it('이동 시간이 간격보다 길어도 음수가 되지 않는다', () => {
    const a = { timestamp: at(2024, 3, 28, 13, 0) };
    const b = { timestamp: at(2024, 3, 28, 13, 10) };
    expect(getStayMinutes(a, b, 30)).toBe(0);
  });

  it('다음 사진이 다음 날이면 머문 시간으로 세지 않는다 — 밤을 통째로 "머무름"이라 하지 않는다', () => {
    const dinner = { timestamp: at(2024, 3, 28, 20, 0) };
    const breakfast = { timestamp: at(2024, 3, 29, 10, 59) };
    expect(getStayMinutes(dinner, breakfast, 0)).toBeNull();
  });

  it('자정을 사이에 둔 짧은 간격도 날짜가 바뀌면 세지 않는다', () => {
    expect(getStayMinutes({ timestamp: at(2024, 3, 28, 23, 50) }, { timestamp: at(2024, 3, 29, 0, 10) })).toBeNull();
  });

  it('파일 날짜로 대신한 사진이 끼어 있으면 머문 시간을 계산하지 않는다', () => {
    const real = { timestamp: at(2024, 3, 28, 13, 0) };
    const guessed = { timestamp: at(2024, 3, 28, 15, 0), timeEstimated: true };
    expect(getStayMinutes(real, guessed)).toBeNull();
    expect(getStayMinutes(guessed, real)).toBeNull();
  });

  it('촬영 시각이 없으면 계산하지 않는다', () => {
    expect(getStayMinutes({ name: '장소' }, { timestamp: at(2024, 3, 28) })).toBeNull();
    expect(getStayMinutes({ timestamp: at(2024, 3, 28) }, undefined)).toBeNull();
  });

  const threeDays = [
    { timestamp: at(2024, 3, 28, 13) },
    { timestamp: at(2024, 3, 29, 10) },
    { timestamp: at(2024, 3, 30, 9) }
  ];

  it('여행 첫날이 1일차이고, 달력 날짜가 바뀔 때마다 하루씩 는다', () => {
    expect(getTripDayNumber(threeDays, threeDays[0].timestamp)).toBe(1);
    expect(getTripDayNumber(threeDays, threeDays[1].timestamp)).toBe(2);
    expect(getTripDayNumber(threeDays, threeDays[2].timestamp)).toBe(3);
  });

  it('24시간이 안 지났어도 날짜가 바뀌면 다음 일차다', () => {
    const route = [{ timestamp: at(2024, 3, 28, 23) }, { timestamp: at(2024, 3, 29, 1) }];
    expect(getTripDayNumber(route, route[1].timestamp)).toBe(2);
  });

  it('여러 날 여행은 "n일차 · 월.일" 구분선 문구를 만든다', () => {
    expect(formatTripDayLabel(threeDays, threeDays[0].timestamp)).toBe('1일차 · 03.28');
    expect(formatTripDayLabel(threeDays, threeDays[1].timestamp)).toBe('2일차 · 03.29');
  });

  it('당일치기나 촬영 시각이 없는 여정에는 구분선을 만들지 않는다', () => {
    const dayTrip = [{ timestamp: at(2024, 3, 28, 9) }, { timestamp: at(2024, 3, 28, 18) }];
    expect(formatTripDayLabel(dayTrip, dayTrip[1].timestamp)).toBe('');
    expect(formatTripDayLabel([{ name: '장소' }], null)).toBe('');
    expect(getTripDayNumber([{ name: '장소' }], at(2024, 3, 28))).toBeNull();
  });
});

describe('buildNotificationContent — 알림 문구', () => {
  it('팔로우 알림에는 미리보기가 없다', () => {
    const { title, preview } = buildNotificationContent({ type: 'follow', senderName: '민들레' });
    expect(title).toContain('민들레');
    expect(title).toContain('팔로우');
    expect(preview).toBe('');
  });

  it('댓글 알림은 댓글 내용을 미리 보여준다', () => {
    const { title, preview } = buildNotificationContent({
      type: 'comment',
      senderName: '은하',
      previewText: '  저도 가보고 싶어요!  '
    });
    expect(title).toContain('댓글');
    expect(preview).toBe('저도 가보고 싶어요!'); // 앞뒤 공백 제거
  });

  it('답글 알림은 댓글 알림과 구분된다', () => {
    expect(buildNotificationContent({ type: 'reply', senderName: '나그네' }).title).toContain('답글');
  });

  it('좋아요 알림은 게시글 제목을 보여준다', () => {
    const { preview } = buildNotificationContent({ type: 'like', postPreview: '성수동 반나절 코스' });
    expect(preview).toBe('성수동 반나절 코스');
  });

  it('보낸 사람 이름이 없으면 기본값을 쓴다', () => {
    expect(buildNotificationContent({ type: 'like' }).title).toContain('여행자');
  });

  it('모르는 타입이어도 문구가 만들어진다', () => {
    expect(buildNotificationContent({ type: '알수없음' }).title).toBeTruthy();
    expect(buildNotificationContent().title).toBeTruthy();
  });
});

describe('알림 아이콘 / 색상', () => {
  it('타입마다 아이콘이 다르다', () => {
    expect(getNotificationTypeIcon('like')).toBe('fas fa-heart');
    expect(getNotificationTypeIcon('comment')).toBe('fas fa-comment');
    expect(getNotificationTypeIcon('follow')).toBe('fas fa-user-plus');
  });

  it('모르는 타입은 기본 종 아이콘이다', () => {
    expect(getNotificationTypeIcon('무엇이든')).toBe('fas fa-bell');
  });

  it('색상은 항상 배경과 그림자를 함께 돌려준다', () => {
    ['like', 'comment', 'reply', 'follow', undefined].forEach((type) => {
      const colors = getNotificationTypeColors(type);
      expect(colors.bg).toMatch(/^#/);
      expect(colors.shadow).toBeTruthy();
    });
  });
});

describe('여정 요약 — 이동 거리 · 여정 길이', () => {
  const at = (d, h, m = 0) => new Date(2026, 10, d, h, m).getTime();

  it('실제 경로가 있으면 그 길이로, 없으면 장소 사이 직선 거리로 잰다', () => {
    const route = [{ lat: 37.5, lng: 127.0 }, { lat: 37.51, lng: 127.0 }];
    const straight = getRouteDistanceKm({ route });
    expect(straight).toBeCloseTo(1.11, 1);

    // 돌아가는 길은 직선보다 길다
    const detailedPath = [{ lat: 37.5, lng: 127.0 }, { lat: 37.505, lng: 127.01 }, { lat: 37.51, lng: 127.0 }];
    expect(getRouteDistanceKm({ route, detailedPath })).toBeGreaterThan(straight);
  });

  it('좌표가 없는 지점은 건너뛰고, 아무것도 없으면 0', () => {
    expect(getRouteDistanceKm({ route: [{ lat: 37.5, lng: 127.0 }, { lat: null, lng: null }] })).toBe(0);
    expect(getRouteDistanceKm({})).toBe(0);
  });

  it('거리 라벨: 1km 미만은 m, 100km 미만은 소수 한 자리', () => {
    expect(formatDistanceKm(0)).toBe('');
    expect(formatDistanceKm(0.234)).toBe('230m');
    expect(formatDistanceKm(1.84)).toBe('1.8km');
    expect(formatDistanceKm(123.4)).toBe('123km');
  });

  it('당일치기는 첫 사진부터 마지막 사진까지, 여러 날이면 일수', () => {
    expect(formatTripLength([{ timestamp: at(8, 10) }, { timestamp: at(8, 12, 20) }])).toBe('2시간 20분');
    expect(formatTripLength([{ timestamp: at(28, 10) }, { timestamp: at(30, 9) }])).toBe('3일');
  });

  it('사진 한 장이거나 촬영 시각이 없으면 빈 문자열', () => {
    expect(formatTripLength([{ timestamp: at(8, 10) }])).toBe('');
    expect(formatTripLength([{ timestamp: at(8, 10), timeEstimated: true }, { timestamp: at(8, 11), timeEstimated: true }])).toBe('');
  });
});
describe('kakaoDirectionsUrl — 카카오맵 길찾기 링크', () => {
  it('장소 이름과 좌표로 목적지 링크를 만든다', () => {
    expect(kakaoDirectionsUrl('명동성당', 37.5636, 126.9869)).toBe(
      `https://map.kakao.com/link/to/${encodeURIComponent('명동성당')},37.5636,126.9869`
    );
  });

  it('이름의 쉼표는 구분자와 섞이지 않게 빼고, 이름이 없으면 "목적지"', () => {
    expect(kakaoDirectionsUrl('카페, 2층', 1, 2)).toContain(encodeURIComponent('카페  2층'));
    expect(kakaoDirectionsUrl('', 1, 2)).toContain(encodeURIComponent('목적지'));
  });
});