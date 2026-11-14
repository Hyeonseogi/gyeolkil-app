/**
 * 곁길 — 순수 유틸리티 (Firebase 에 의존하지 않아 단위 테스트가 가능하다)
 *
 * 게시글 / 유저 / 채팅 데이터는 모두 Firestore 에서 실시간으로 내려받으므로
 * 여기에는 목업 데이터를 두지 않는다. (초기 프로토타입의 샘플 데이터는 제거됨)
 */

// ── 공통 상수 ────────────────────────────────────────
export const FALLBACK_AVATAR = 'https://api.dicebear.com/7.x/adventurer/svg?seed=fallback';

export const REGION_LABELS = {
  all: '전체',
  seoul: '서울',
  busan: '부산',
  jeju: '제주',
  jeonju: '전주',
  gyeongju: '경주'
};

// 지역 판별용 대략적인 위경도 범위
const REGION_BOUNDS = [
  { key: 'seoul', latMin: 37.41, latMax: 37.72, lngMin: 126.76, lngMax: 127.18 },
  { key: 'busan', latMin: 35.0, latMax: 35.32, lngMin: 128.8, lngMax: 129.35 },
  { key: 'jeju', latMin: 33.1, latMax: 33.6, lngMin: 126.1, lngMax: 126.98 },
  { key: 'jeonju', latMin: 35.74, latMax: 35.91, lngMin: 126.95, lngMax: 127.22 },
  { key: 'gyeongju', latMin: 35.74, latMax: 36.05, lngMin: 128.9, lngMax: 129.45 }
];

// ── 위치 계산 ────────────────────────────────────────

/**
 * 좌표값을 숫자로 바꾸되, 좌표가 "없는" 경우는 확실히 걸러낸다.
 * Number(null) 과 Number('') 는 0 이라서 그냥 Number() 만 쓰면
 * 좌표가 비어 있는 게시물이 적도(0도) 위에 있는 것처럼 취급된다.
 */
export function toCoordinate(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

/**
 * 좋아요 수 — 누른 사람 목록(likedBy)을 기준으로 센다.
 * likes 숫자 필드는 연타·동시 클릭 때 likedBy 와 어긋날 수 있어서,
 * 화면마다 다른 필드를 보면 같은 글의 좋아요 수가 탭마다 달라 보였다.
 */
export function getLikeCount(post) {
  if (Array.isArray(post?.likedBy)) return post.likedBy.length;
  const likes = Number(post?.likes);
  return Number.isFinite(likes) ? Math.max(0, likes) : 0;
}

/** 저장(스크랩) 수 — 좋아요와 같은 이유로 저장한 사람 목록(savedBy)을 기준으로 센다. */
export function getSaveCount(post) {
  if (Array.isArray(post?.savedBy)) return post.savedBy.length;
  const saves = Number(post?.saves);
  return Number.isFinite(saves) ? Math.max(0, saves) : 0;
}

/** 지점에 쓸 수 있는 좌표가 있는지 (위치 정보 없는 사진은 lat/lng 가 null) */
export function hasLocation(spot) {
  return toCoordinate(spot?.lat) !== null && toCoordinate(spot?.lng) !== null;
}

/** 두 좌표 사이의 거리(km) — 하버사인 공식 */
export function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  const coords = [lat1, lon1, lat2, lon2].map(toCoordinate);
  if (coords.some((v) => v === null)) return Infinity;

  const [y1, x1, y2, x2] = coords;
  const R = 6371;
  const toRad = (deg) => deg * (Math.PI / 180);
  const dLat = toRad(y2 - y1);
  const dLon = toRad(x2 - x1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(y1)) * Math.cos(toRad(y2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** 좌표가 어느 지역에 속하는지 판별 (해당 없으면 null) */
export function getRegionFromCoords(lat, lng) {
  const y = toCoordinate(lat);
  const x = toCoordinate(lng);
  if (y === null || x === null) return null;

  const hit = REGION_BOUNDS.find((r) => y >= r.latMin && y <= r.latMax && x >= r.lngMin && x <= r.lngMax);
  return hit ? hit.key : null;
}

/** 여행 경로에 포함된 지역 키 목록 */
export function extractRegionsFromRoute(route) {
  if (!Array.isArray(route)) return [];
  const found = new Set();
  route.forEach((spot) => {
    const region = getRegionFromCoords(
      spot?.lat ?? spot?.latitude ?? spot?.y,
      spot?.lng ?? spot?.longitude ?? spot?.x
    );
    if (region) found.add(region);
  });
  return [...found];
}

// ── 시간 포맷 ────────────────────────────────────────

/** Firestore Timestamp / number / 문자열을 모두 ms 숫자로 변환 */
export const getTimestampValue = (value) => {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * 상대 시간으로 쓰기엔 오래된 날짜. 올해가 아니면 연도를 붙인다.
 * ("6월 10일"만 보여주면 재작년 글도 올해 글처럼 읽힌다)
 */
const formatAbsoluteDate = (ts) => {
  const date = new Date(ts);
  const monthDay = `${date.getMonth() + 1}월 ${date.getDate()}일`;
  return date.getFullYear() === new Date().getFullYear() ? monthDay : `${date.getFullYear()}년 ${monthDay}`;
};

/** 방금 전 / n분 전 / n시간 전 / n일 전 */
export function formatTime(value) {
  const ts = getTimestampValue(value);
  if (!ts) return '';

  const diff = Date.now() - ts;
  if (diff < 60000) return '방금 전';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}분 전`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}시간 전`;
  if (diff < 86400000 * 7) return `${Math.floor(diff / 86400000)}일 전`;

  return formatAbsoluteDate(ts);
}

/** 알림 목록용 짧은 시간 표기 */
export const formatNotificationTime = (value) => {
  const time = getTimestampValue(value);
  if (!time) return '';

  const diff = Date.now() - time;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return '방금 전';
  if (diff < hour) return `${Math.floor(diff / minute)}분 전`;
  if (diff < day) return `${Math.floor(diff / hour)}시간 전`;

  return formatAbsoluteDate(time);
};

/** 2025년 03월 14일 형태의 날짜 라벨 */
export const formatDateLabel = (value) => {
  const ts = getTimestampValue(value);
  if (!ts) return '날짜 미상';
  const date = new Date(ts);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}년 ${mm}월 ${dd}일`;
};

// ── 여행 날짜 ────────────────────────────────────────
// 게시 시각(createdAt)은 "언제 올렸는지"이고, 여행 날짜는 "언제 다녀왔는지"다.
// 여행 날짜는 따로 저장하지 않고 각 장소 사진의 촬영 시각(route[].timestamp)에서 뽑는다.

/** 여정의 여행 기간 { start, end } (ms). 촬영 시각이 하나도 없으면 null */
export const getTripRange = (route) => {
  const times = (Array.isArray(route) ? route : [])
    .map((spot) => getTimestampValue(spot?.timestamp))
    .filter((ts) => ts > 0);
  if (times.length === 0) return null;
  return { start: Math.min(...times), end: Math.max(...times) };
};

/** 타임라인 정렬 기준 — 여행을 시작한 시각. 촬영 시각이 없는 예전 글은 게시 시각으로 대신한다. */
export const getTripSortTime = (post) =>
  getTripRange(post?.route)?.start || getTimestampValue(post?.createdAt);

/**
 * 여행 날짜 라벨. 촬영 시각이 없으면 빈 문자열.
 *   당일치기        2026.08.14
 *   같은 해 여러 날  2026.08.14 – 08.16
 *   해를 넘긴 여행   2025.12.31 – 2026.01.02
 */
export const formatTripDate = (route) => {
  const range = getTripRange(route);
  if (!range) return '';

  const pad = (n) => String(n).padStart(2, '0');
  const start = new Date(range.start);
  const end = new Date(range.end);
  const monthDay = (d) => `${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
  const full = (d) => `${d.getFullYear()}.${monthDay(d)}`;

  if (full(start) === full(end)) return full(start);
  if (start.getFullYear() === end.getFullYear()) return `${full(start)} – ${monthDay(end)}`;
  return `${full(start)} – ${full(end)}`;
};

// ── 체류 시간 · 여행 일차 ─────────────────────────────

/** 분 → "45분" / "2시간" / "2시간 10분". (899분처럼 읽을 수 없는 숫자를 그대로 내놓지 않는다) */
export const formatDuration = (minutes) => {
  const total = Math.max(0, Math.round(Number(minutes) || 0));
  if (total < 60) return `${total}분`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest === 0 ? `${hours}시간` : `${hours}시간 ${rest}분`;
};

/** 그 시각이 속한 날의 0시 (기기 시간대 기준) */
const startOfLocalDay = (ts) => {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

/**
 * 한 장소에 머문 시간(분) = 다음 사진까지의 간격 − 이동 시간.
 * 다음 사진이 다른 날에 찍혔으면 null 을 돌려준다.
 * 간격에 밤이 통째로 들어가서, 그대로 쓰면 "카페에서 15시간 머무름"이 된다.
 */
export const getStayMinutes = (spot, nextSpot, travelMinutes = 0) => {
  const from = getTimestampValue(spot?.timestamp);
  const to = getTimestampValue(nextSpot?.timestamp);
  if (!from || !to) return null;
  if (startOfLocalDay(from) !== startOfLocalDay(to)) return null;

  const gap = Math.round(Math.abs(to - from) / 60000);
  return Math.max(0, gap - (Number(travelMinutes) || 0));
};

/** 이 지점이 여행 며칠째인지 (첫날 = 1). 촬영 시각이 없으면 null */
export const getTripDayNumber = (route, timestamp) => {
  const range = getTripRange(route);
  const ts = getTimestampValue(timestamp);
  if (!range || !ts) return null;
  return Math.round((startOfLocalDay(ts) - startOfLocalDay(range.start)) / 86400000) + 1;
};

/** 여러 날 여행의 타임라인 구분선 문구 — "2일차 · 03.29". 당일치기거나 시각이 없으면 빈 문자열 */
export const formatTripDayLabel = (route, timestamp) => {
  const range = getTripRange(route);
  const day = getTripDayNumber(route, timestamp);
  if (!range || !day) return '';
  if (startOfLocalDay(range.start) === startOfLocalDay(range.end)) return '';

  const d = new Date(getTimestampValue(timestamp));
  const pad = (n) => String(n).padStart(2, '0');
  return `${day}일차 · ${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
};

// ── 토스트 ───────────────────────────────────────────
const TOAST_COLORS = {
  info: 'rgba(44,42,41,.92)',
  success: 'rgba(45,106,79,.94)',
  error: 'rgba(201,42,42,.94)'
};

/**
 * 화면 하단에 잠깐 떴다 사라지는 알림.
 * 흐름을 끊는 window.alert 대신 사용한다.
 */
export function showToast(msg, variant = 'info') {
  if (typeof document === 'undefined') return;

  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    document.body.appendChild(toast);
  }

  toast.textContent = msg;
  toast.style.background = TOAST_COLORS[variant] || TOAST_COLORS.info;
  toast.classList.add('show');

  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), 2400);
}

export function generateId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// ── 알림 ─────────────────────────────────────────────

/** 알림 타입별로 화면에 보여줄 문구 / 미리보기 텍스트 구성 */
export const buildNotificationContent = (notif = {}) => {
  const senderName = notif.senderName || '여행자';
  const previewText = typeof notif.previewText === 'string' ? notif.previewText.trim() : '';
  const postPreview = typeof notif.postPreview === 'string' ? notif.postPreview.trim() : '';

  switch (notif.type) {
    case 'follow':
      return { title: `${senderName}님이 회원님을 팔로우하기 시작했습니다.`, preview: '' };
    case 'comment':
      return {
        title: `${senderName}님이 내 게시글에 댓글을 남겼습니다.`,
        preview: previewText || postPreview
      };
    case 'reply':
      return {
        title: `${senderName}님이 내 댓글에 답글을 남겼습니다.`,
        preview: previewText || postPreview
      };
    case 'like':
      return { title: `${senderName}님이 회원님의 여정을 좋아합니다.`, preview: postPreview };
    default:
      return {
        title: `${senderName}님이 ${notif.message || '새로운 활동을 남겼습니다.'}`,
        preview: previewText || postPreview
      };
  }
};

/** 타입별 아이콘 */
export const getNotificationTypeIcon = (type) => {
  switch (type) {
    case 'like':
      return 'fas fa-heart';
    case 'comment':
      return 'fas fa-comment';
    case 'reply':
      return 'fas fa-reply';
    case 'follow':
      return 'fas fa-user-plus';
    default:
      return 'fas fa-bell';
  }
};

/** 타입별 강조 색상 */
export const getNotificationTypeColors = (type) => {
  switch (type) {
    case 'like':
      return { bg: '#ff0f7b', shadow: '0 6px 18px rgba(255, 15, 123, 0.35)' };
    case 'comment':
    case 'reply':
      return { bg: '#6c5ce7', shadow: '0 6px 18px rgba(108, 92, 231, 0.35)' };
    case 'follow':
      return { bg: '#4dabf7', shadow: '0 6px 18px rgba(77, 171, 247, 0.35)' };
    default:
      return { bg: '#adb5bd', shadow: '0 6px 18px rgba(173, 181, 189, 0.25)' };
  }
};
