import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  buildNotificationContent,
  extractRegionsFromRoute,
  formatDateLabel,
  formatNotificationTime,
  formatTime,
  getDistanceFromLatLonInKm,
  getNotificationTypeColors,
  getNotificationTypeIcon,
  getRegionFromCoords,
  getLikeCount,
  getTimestampValue,
  hasLocation,
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
    ['전주 한옥마을', 35.815, 127.154, 'jeonju']
  ])('%s → %s', (_label, lat, lng, expected) => {
    expect(getRegionFromCoords(lat, lng)).toBe(expected);
  });

  it('등록된 지역 밖이면 null 이다', () => {
    expect(getRegionFromCoords(35.87, 128.6)).toBeNull(); // 대구
    expect(getRegionFromCoords(0, 0)).toBeNull();
  });

  it('잘못된 값이면 null 이다', () => {
    expect(getRegionFromCoords(undefined, undefined)).toBeNull();
    expect(getRegionFromCoords('서울', '한국')).toBeNull();
  });

  it('판별된 지역 키는 화면에 쓰는 라벨을 모두 가지고 있다', () => {
    ['seoul', 'busan', 'jeju', 'jeonju', 'gyeongju'].forEach((key) => {
      expect(REGION_LABELS[key]).toBeTruthy();
    });
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
