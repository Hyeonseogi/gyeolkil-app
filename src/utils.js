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
  gyeongju: '경주',
  incheon: '인천',
  daejeon: '대전',
  daegu: '대구',
  gwangju: '광주',
  ulsan: '울산',
  sejong: '세종',
  gyeonggi: '경기',
  gangwon: '강원',
  chungbuk: '충북',
  chungnam: '충남',
  jeonbuk: '전북',
  jeonnam: '전남',
  gyeongbuk: '경북',
  gyeongnam: '경남'
};

/** 발견 탭에 항상 보여 줄 대표 여행지. 나머지 지역은 글이 있을 때만 버튼이 생긴다. */
export const FEATURED_REGION_KEYS = ['seoul', 'busan', 'jeju', 'jeonju', 'gyeongju'];

// 지역 판별용 대략적인 위경도 범위 — 위에 있는 것이 먼저 판정된다.
// 상자 모양이라 경계에서는 틀릴 수 있다. 그래서 모양이 단순한 도시만 두고,
// 도(道) 단위는 상자로 판별하지 않는다. (도는 카카오가 알려준 시도 이름으로만 안다)
const REGION_BOUNDS = [
  { key: 'seoul', latMin: 37.41, latMax: 37.72, lngMin: 126.76, lngMax: 127.18 },
  { key: 'busan', latMin: 35.0, latMax: 35.32, lngMin: 128.8, lngMax: 129.35 },
  { key: 'jeju', latMin: 33.1, latMax: 33.6, lngMin: 126.1, lngMax: 126.98 },
  { key: 'jeonju', latMin: 35.74, latMax: 35.91, lngMin: 126.95, lngMax: 127.22 },
  { key: 'gyeongju', latMin: 35.74, latMax: 36.05, lngMin: 128.9, lngMax: 129.45 },
  { key: 'incheon', latMin: 37.33, latMax: 37.6, lngMin: 126.55, lngMax: 126.76 },
  { key: 'daejeon', latMin: 36.2, latMax: 36.47, lngMin: 127.27, lngMax: 127.53 },
  { key: 'sejong', latMin: 36.47, latMax: 36.72, lngMin: 127.17, lngMax: 127.38 },
  { key: 'daegu', latMin: 35.7, latMax: 36.0, lngMin: 128.42, lngMax: 128.72 },
  { key: 'gwangju', latMin: 35.05, latMax: 35.26, lngMin: 126.66, lngMax: 127.0 },
  { key: 'ulsan', latMin: 35.4, latMax: 35.7, lngMin: 129.05, lngMax: 129.45 }
];

// 카카오 주소 변환이 돌려주는 시도 이름 → 지역 키
const SIDO_KEYS = {
  서울: 'seoul',
  부산: 'busan',
  대구: 'daegu',
  인천: 'incheon',
  광주: 'gwangju',
  대전: 'daejeon',
  울산: 'ulsan',
  세종: 'sejong',
  경기: 'gyeonggi',
  강원: 'gangwon',
  충북: 'chungbuk',
  충남: 'chungnam',
  전북: 'jeonbuk',
  전남: 'jeonnam',
  경북: 'gyeongbuk',
  경남: 'gyeongnam',
  제주: 'jeju'
};

// 앞 두 글자만 따면 틀리는 긴 이름들
const LONG_SIDO_NAMES = {
  충청북도: '충북',
  충청남도: '충남',
  전라북도: '전북',
  전라남도: '전남',
  경상북도: '경북',
  경상남도: '경남'
};

// 시도보다 작은 대표 여행지가 어느 시도에 속하는지
const SUB_CITY_PARENT = { jeonju: 'jeonbuk', gyeongju: 'gyeongbuk' };

/**
 * 시도 이름을 두 글자 약칭으로 통일한다. 모르는 이름이면 null.
 *   "대전" / "대전광역시" → "대전",  "강원특별자치도" → "강원",  "충청북도" → "충북"
 */
export const normalizeSido = (name) => {
  const text = String(name ?? '').trim();
  if (!text) return null;
  const short = LONG_SIDO_NAMES[text] || text.slice(0, 2);
  return SIDO_KEYS[short] ? short : null;
};

/**
 * 카카오 주소 변환 결과에서 장소 이름으로 쓸 만한 것을 고른다.
 * 건물 이름이 있으면 그것을, 없으면 "중구 은행동" 같은 구·동 이름을 쓴다.
 * (근처 가게 이름을 추측해 넣지 않는다 — 틀린 가게 이름보다 정확한 동네 이름이 낫다)
 */
export const pickPlaceName = (result) => {
  const building = String(result?.road_address?.building_name ?? '').trim();
  if (building) return building;

  const address = result?.address || result?.road_address;
  if (!address) return '';
  // "전주시 완산구" 처럼 두 단계로 오면 뒤쪽(구)만 쓴다.
  const district = String(address.region_2depth_name ?? '').trim().split(' ').pop();
  const town = String(address.region_3depth_name ?? '').trim();
  return [district, town].filter(Boolean).join(' ');
};

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

/**
 * 한 지점이 속한 지역 키 목록.
 * 기록할 때 카카오가 알려준 시도(spot.sido)가 있으면 그것을 믿고, 없는 예전 글만 좌표 상자로 판별한다.
 */
export function getRegionKeysForSpot(spot) {
  const boxKey = getRegionFromCoords(
    spot?.lat ?? spot?.latitude ?? spot?.y,
    spot?.lng ?? spot?.longitude ?? spot?.x
  );
  const sidoKey = SIDO_KEYS[normalizeSido(spot?.sido)] || null;

  if (!sidoKey) return boxKey ? [boxKey] : [];
  // 전주·경주는 시도보다 작아서 상자로만 알 수 있다. 같은 시도 안일 때만 함께 넣는다.
  return boxKey && SUB_CITY_PARENT[boxKey] === sidoKey ? [boxKey, sidoKey] : [sidoKey];
}

/** 여행 경로에 포함된 지역 키 목록 */
export function extractRegionsFromRoute(route) {
  if (!Array.isArray(route)) return [];
  const found = new Set();
  route.forEach((spot) => getRegionKeysForSpot(spot).forEach((key) => found.add(key)));
  return [...found];
}

// ── 장소 묶기 ────────────────────────────────────────

const DEFAULT_PLACE_NAME = /^장소 \d+$/;

/** 아직 이름을 붙이지 않은 지점인지 ("장소 3" 같은 기본 이름이거나 비어 있음) */
export const isDefaultPlaceName = (name) => {
  const text = String(name ?? '').trim();
  return !text || DEFAULT_PLACE_NAME.test(text);
};

/**
 * 사진 단위로 저장된 경로를 "장소" 단위로 묶는다.
 * 기록할 때 80m 이내의 사진은 같은 좌표로 맞춰 두는데, 저장은 사진마다 따로 되므로
 * 그대로 세면 한 카페에서 찍은 사진 3장이 "방문 장소 3곳"이 된다.
 *
 * 연달아 있는 지점이 좌표가 같으면 한 장소로 본다. 단, 사용자가 서로 다른 이름을
 * 직접 붙였다면 구분하려는 뜻이므로 묶지 않는다.
 *
 * 반환: [{ name, lat, lng, spots: [...], indexes: [원래 경로에서의 위치...] }]
 */
export function groupRouteByPlace(route) {
  const groups = [];
  (Array.isArray(route) ? route : []).forEach((spot, index) => {
    const last = groups[groups.length - 1];
    const sameSpot =
      last &&
      hasLocation(spot) &&
      toCoordinate(spot.lat) === toCoordinate(last.lat) &&
      toCoordinate(spot.lng) === toCoordinate(last.lng);
    const namesAgree =
      last && (isDefaultPlaceName(spot?.name) || isDefaultPlaceName(last.name) || spot.name === last.name);

    if (sameSpot && namesAgree) {
      last.spots.push(spot);
      last.indexes.push(index);
      if (isDefaultPlaceName(last.name) && !isDefaultPlaceName(spot?.name)) last.name = spot.name;
      return;
    }
    groups.push({ name: spot?.name || '', lat: spot?.lat ?? null, lng: spot?.lng ?? null, spots: [spot], indexes: [index] });
  });
  return groups;
}

/** 경로에 들어 있는 장소 수 (사진 장수가 아니라 묶은 뒤의 수) */
export const countPlaces = (route) => groupRouteByPlace(route).length;

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

/**
 * 믿을 수 있는 촬영 시각 (ms). 없으면 0.
 * 사진에 촬영 시각이 없으면 기록할 때 파일 날짜로 대신하고 timeEstimated 로 표시해 둔다.
 * 파일 날짜는 내려받은 날일 수 있어서 여행 날짜·체류 시간 계산에는 쓰지 않는다.
 */
export const getShotTime = (spot) => (spot?.timeEstimated ? 0 : getTimestampValue(spot?.timestamp));

/** 여정의 여행 기간 { start, end } (ms). 촬영 시각이 하나도 없으면 null */
export const getTripRange = (route) => {
  const times = (Array.isArray(route) ? route : [])
    .map(getShotTime)
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
  const from = getShotTime(spot);
  const to = getShotTime(nextSpot);
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

/**
 * 카카오맵 길찾기 링크 (목적지만 정하고 출발지는 사용자의 현재 위치).
 * 모바일에서는 카카오맵 앱이, 아니면 웹이 열린다. 이름의 쉼표는 링크 구분자라 공백으로 바꾼다.
 */
export const kakaoDirectionsUrl = (name, lat, lng) => {
  const label = String(name || '목적지').replace(/,/g, ' ').trim() || '목적지';
  return `https://map.kakao.com/link/to/${encodeURIComponent(label)},${Number(lat)},${Number(lng)}`;
};

// ── 여정 요약 (피드 카드 · 내 발자취) ─────────────────────

/** 좌표 목록을 차례로 이은 길이(km). 좌표가 없는 점은 건너뛴다. */
const sumPathKm = (points) => {
  const list = (Array.isArray(points) ? points : []).filter(hasLocation);
  let km = 0;
  for (let i = 0; i < list.length - 1; i += 1) {
    km += getDistanceFromLatLonInKm(list[i].lat, list[i].lng, list[i + 1].lat, list[i + 1].lng);
  }
  return km;
};

/**
 * 여정의 이동 거리(km).
 * 실제 경로(detailedPath)가 있으면 그 길이, 없으면 장소 사이 직선 거리의 합.
 */
export const getRouteDistanceKm = (post) => {
  const path = Array.isArray(post?.detailedPath) ? post.detailedPath.filter(hasLocation) : [];
  return path.length > 1 ? sumPathKm(path) : sumPathKm(post?.route);
};

/** 거리 라벨 — "850m" / "1.8km" / "123km". 0 이면 빈 문자열 */
export const formatDistanceKm = (km) => {
  const value = Number(km);
  if (!Number.isFinite(value) || value <= 0) return '';
  if (value < 1) return `${Math.max(10, Math.round((value * 1000) / 10) * 10)}m`;
  if (value < 100) return `${value.toFixed(1)}km`;
  return `${Math.round(value)}km`;
};

/**
 * 여정 길이 라벨. 당일치기면 첫 사진부터 마지막 사진까지("2시간 20분"), 여러 날이면 "3일".
 * 촬영 시각이 없거나 사진 한 장뿐이면 빈 문자열.
 */
export const formatTripLength = (route) => {
  const range = getTripRange(route);
  if (!range || range.end <= range.start) return '';
  const days = Math.round((startOfLocalDay(range.end) - startOfLocalDay(range.start)) / 86400000) + 1;
  if (days > 1) return `${days}일`;
  return formatDuration((range.end - range.start) / 60000);
};

// ── 토스트 ───────────────────────────────────────────
const TOAST_COLORS = {
  info: 'rgba(22,33,27,.92)',
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
