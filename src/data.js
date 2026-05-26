import { addDoc, collection } from 'firebase/firestore';
import { db } from './firebase';

/**
 * 곁길 — 샘플 데이터
 * 실제 서비스에서는 API / IndexedDB 로 대체
 */

// ── 사용자 ──────────────────────────────────────────
export const USERS = [
  { id: 'u1', name: '여행자_민들레', bio: '발길 닿는 곳마다 기록 🌿', avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=user1', followers: 84, following: 31 },
  { id: 'u2', name: '여행자_은하',   bio: '혼자 떠나는 게 좋아요 ✈️', avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=user2', followers: 210, following: 55 },
  { id: 'u3', name: '길위의_나그네', bio: '전국 방방곡곡 🗾',           avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=user3', followers: 463, following: 120 },
  { id: 'u4', name: '도시탐험가',    bio: '도시 속 숨겨진 공간 찾기 🔍', avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=user4', followers: 1204, following: 88 },
  { id: 'u5', name: '바람따라',      bio: '카페 투어가 삶의 낙 ☕',     avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=user5', followers: 320, following: 142 },
];

// ── 장소(POI) 팔레트 ────────────────────────────────
export const PLACES = {
  // 서울 성수동
  seongsu:  { name: '성수동',       region: 'seoul',   color: '#52B788', lat: 37.544, lng: 127.056 },
  lpbar:    { name: 'LP바 골목',    region: 'seoul',   color: '#2D6A4F', lat: 37.545, lng: 127.058 },
  cafe1:    { name: '소금집카페',   region: 'seoul',   color: '#F77F00', lat: 37.546, lng: 127.054 },
  handmade: { name: '공방거리',     region: 'seoul',   color: '#52B788', lat: 37.547, lng: 127.059 },
  // 서울 북촌·삼청동
  bukchon:  { name: '북촌한옥마을', region: 'seoul',   color: '#2D6A4F', lat: 37.583, lng: 126.985 },
  samcheong:{ name: '삼청동',       region: 'seoul',   color: '#52B788', lat: 37.585, lng: 126.982 },
  gyeongbok:{ name: '경복궁',       region: 'seoul',   color: '#F77F00', lat: 37.579, lng: 126.977 },
  // 부산 해운대
  haeundae: { name: '해운대',       region: 'busan',   color: '#0096C7', lat: 35.158, lng: 129.160 },
  gwangalli:{ name: '광안리',       region: 'busan',   color: '#48CAE4', lat: 35.152, lng: 129.118 },
  gamcheon: { name: '감천문화마을', region: 'busan',   color: '#F77F00', lat: 35.097, lng: 129.010 },
  // 전주 한옥마을
  jeonju:   { name: '전주 한옥마을',region: 'jeonju',  color: '#F77F00', lat: 35.815, lng: 127.154 },
  omokdae:  { name: '오목대',       region: 'jeonju',  color: '#2D6A4F', lat: 35.817, lng: 127.157 },
  nambu:    { name: '남부시장',     region: 'jeonju',  color: '#52B788', lat: 35.812, lng: 127.149 },
  // 제주
  jeju_ol:  { name: '올레7코스',    region: 'jeju',    color: '#52B788', lat: 33.244, lng: 126.560 },
  jeju_sea: { name: '서귀포 바다',  region: 'jeju',    color: '#0096C7', lat: 33.252, lng: 126.562 },
  jeju_cafe:{ name: '카페 하루',    region: 'jeju',    color: '#F77F00', lat: 33.258, lng: 126.555 },
};

// ── 게시물 ───────────────────────────────────────────
export const POSTS_INITIAL = [
  {
    id: 'p1',
    userId: 'u2',
    title: '성수동 반나절 코스 ☀️',
    body: '혼자 온 성수동인데 여기서 사람 만나고 맥주 한 잔 했어요. 공방 골목 꼭 가보세요, 진짜 감성 폭발🌿',
    tags: ['성수동', '서울', '혼자여행', '카페투어'],
    region: 'seoul',
    createdAt: Date.now() - 1000 * 60 * 20,   // 20분 전
    likes: 47,
    comments: 8,
    saves: 23,
    liked: false,
    saved: false,
    route: [
      { ...PLACES.seongsu,  photo: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400&q=80', memo: '출발! 성수동역 2번 출구' },
      { ...PLACES.lpbar,    photo: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&q=80', memo: 'LP 틀어주는 분위기 좋은 바' },
      { ...PLACES.cafe1,    photo: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=400&q=80', memo: '소금 커피가 인생 커피' },
      { ...PLACES.handmade, photo: 'https://images.unsplash.com/photo-1452860606245-08befc0ff44b?w=400&q=80', memo: '공방 구경하다 반지 하나 만들었음' },
    ],
    commentList: [
      { id: 'c1', userId: 'u3', text: '저도 이 코스 가봤는데 너무 좋았어요!', createdAt: Date.now() - 60000 * 10 },
      { id: 'c2', userId: 'u5', text: 'LP바 이름이 뭐예요? 저도 가고 싶어요 ㅠ', createdAt: Date.now() - 60000 * 5 },
    ]
  },
  {
    id: 'p2',
    userId: 'u3',
    title: '북촌·삼청동 고즈넉한 하루',
    body: '경복궁부터 삼청동까지 천천히 걸었어요. 가을 단풍이 아직 조금 남아있어서 너무 예뻤습니다 🍂',
    tags: ['북촌', '삼청동', '경복궁', '서울나들이'],
    region: 'seoul',
    createdAt: Date.now() - 1000 * 60 * 60 * 3,
    likes: 132,
    comments: 19,
    saves: 67,
    liked: false,
    saved: false,
    route: [
      { ...PLACES.gyeongbok, photo: 'https://images.unsplash.com/photo-1548115184-bc6544d06a58?w=400&q=80', memo: '경복궁 입장! 수문장 교대식 봤어요' },
      { ...PLACES.bukchon,   photo: 'https://images.unsplash.com/photo-1534050359320-02900022671e?w=400&q=80', memo: '한옥 골목길 산책' },
      { ...PLACES.samcheong, photo: 'https://images.unsplash.com/photo-1605289982774-9a6fef564df8?w=400&q=80', memo: '삼청동 카페에서 쉬어가기' },
    ],
    commentList: [
      { id: 'c3', userId: 'u1', text: '북촌 한옥 진짜 예쁘죠 ㅠㅠ 저도 가고싶어요', createdAt: Date.now() - 60000 * 30 },
    ]
  },
  {
    id: 'p3',
    userId: 'u4',
    title: '부산 2박 3일 핵심 코스 🌊',
    body: '해운대-광안리-감천 이 세 곳만 가도 부산 여행 완성이에요. 특히 감천문화마을 오전에 가야 사람 없어서 사진 잘 나와요!',
    tags: ['부산', '해운대', '감천문화마을', '여행스타그램'],
    region: 'busan',
    createdAt: Date.now() - 1000 * 60 * 60 * 24,
    likes: 284,
    comments: 35,
    saves: 189,
    liked: false,
    saved: false,
    route: [
      { ...PLACES.haeundae,  photo: 'https://images.unsplash.com/photo-1617713964959-d2aea5c57c30?w=400&q=80', memo: '해운대 해수욕장, 바다가 너무 맑다' },
      { ...PLACES.gwangalli, photo: 'https://images.unsplash.com/photo-1608501078713-8e445a709b39?w=400&q=80', memo: '광안대교 야경 포인트' },
      { ...PLACES.gamcheon,  photo: 'https://images.unsplash.com/photo-1570394344813-a64a49a23fd6?w=400&q=80', memo: '알록달록 감천문화마을' },
    ],
    commentList: [
      { id: 'c4', userId: 'u2', text: '감천 오전 팁 감사해요! 저도 낮에 갔다가 너무 붐볐어요', createdAt: Date.now() - 60000 * 60 * 2 },
      { id: 'c5', userId: 'u5', text: '광안대교 야경은 진짜 넋놓고 봤어요 🌉', createdAt: Date.now() - 60000 * 60 },
    ]
  },
  {
    id: 'p4',
    userId: 'u5',
    title: '전주 한옥마을 당일치기 🏯',
    body: '전주는 음식이 반이에요! 남부시장 야시장에서 파전에 막걸리 한 잔 꼭 드세요. 비빔밥도 당연히 먹어야죠.',
    tags: ['전주', '한옥마을', '전주비빔밥', '당일치기'],
    region: 'jeonju',
    createdAt: Date.now() - 1000 * 60 * 60 * 48,
    likes: 98,
    comments: 14,
    saves: 55,
    liked: false,
    saved: false,
    route: [
      { ...PLACES.jeonju,  photo: 'https://images.unsplash.com/photo-1568913516957-e72f9d1b4dd7?w=400&q=80', memo: '한옥마을 입구, 한복 빌려 입었어요' },
      { ...PLACES.omokdae, photo: 'https://images.unsplash.com/photo-1601577568901-5ffb27f2041e?w=400&q=80', memo: '오목대에서 내려다본 뷰' },
      { ...PLACES.nambu,   photo: 'https://images.unsplash.com/photo-1535591273668-578e31182c4f?w=400&q=80', memo: '남부시장 야시장, 파전 + 막걸리' },
    ],
    commentList: [
      { id: 'c6', userId: 'u3', text: '남부시장 야시장 시간이 언제예요?', createdAt: Date.now() - 60000 * 120 },
      { id: 'c7', userId: 'u5', text: '금-일 저녁 6시~11시예요!', createdAt: Date.now() - 60000 * 110 },
    ]
  },
  {
    id: 'p5',
    userId: 'u1',
    title: '제주 올레 7코스 완주 🌊',
    body: '약 17km인데 쉬엄쉬엄 걸으면 5시간이면 완주해요. 중간에 카페에서 쉬면서 바다 보는 그 순간이 최고였어요.',
    tags: ['제주', '올레7코스', '걷기여행', '제주바다'],
    region: 'jeju',
    createdAt: Date.now() - 1000 * 60 * 60 * 72,
    likes: 203,
    comments: 27,
    saves: 141,
    liked: false,
    saved: false,
    route: [
      { ...PLACES.jeju_ol,   photo: 'https://images.unsplash.com/photo-1531219432768-9f540ce91ef3?w=400&q=80', memo: '올레 7코스 시작점' },
      { ...PLACES.jeju_cafe, photo: 'https://images.unsplash.com/photo-1445116572660-236099ec97a0?w=400&q=80', memo: '중간 카페에서 잠시 쉬기' },
      { ...PLACES.jeju_sea,  photo: 'https://images.unsplash.com/photo-1584979747315-d84851c8a030?w=400&q=80', memo: '서귀포 바다 도착! 완주 인증샷' },
    ],
    commentList: [
      { id: 'c8', userId: 'u4', text: '올레길 완주 대단해요! 다리 안 아팠나요?ㅋㅋ', createdAt: Date.now() - 60000 * 200 },
    ]
  },
];

// ── 채팅방 ───────────────────────────────────────────
export const CHAT_ROOMS = [
  {
    id: 'r1',
    name: '성수동 여행 후기 나눔',
    avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=room1',
    members: 8,
    lastMsg: '소금집카페 웨이팅 얼마나 있었어요?',
    lastTime: '14:23',
    unread: 3,
    messages: [
      { id: 'm1', userId: 'u2', text: '안녕하세요! 성수동 코스 공유해요 🌿', time: '14:10' },
      { id: 'm2', userId: 'u3', text: 'LP바 분위기 진짜 좋죠? 저도 갔었어요!', time: '14:15' },
      { id: 'm3', userId: 'u5', text: '소금집카페 웨이팅 얼마나 있었어요?', time: '14:23' },
    ]
  },
  {
    id: 'r2',
    name: '부산 여행자 모임',
    avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=room2',
    members: 15,
    lastMsg: '광안대교 야경 11시가 제일 예뻐요',
    lastTime: '어제',
    unread: 0,
    messages: [
      { id: 'm4', userId: 'u4', text: '부산 처음 가는데 꿀팁 부탁드려요!', time: '어제 20:00' },
      { id: 'm5', userId: 'u3', text: '감천 오전에 가세요! 사람 없어서 사진 잘 나와요', time: '어제 20:05' },
      { id: 'm6', userId: 'u2', text: '광안대교 야경 11시가 제일 예뻐요', time: '어제 20:12' },
    ]
  },
  {
    id: 'r3',
    name: '제주 올레길 동행',
    avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=room3',
    members: 5,
    lastMsg: '다음 주 7코스 같이 가실 분!',
    lastTime: '월요일',
    unread: 0,
    messages: [
      { id: 'm7', userId: 'u1', text: '7코스 완주했어요! 17km지만 할 만해요', time: '월요일 10:00' },
      { id: 'm8', userId: 'u5', text: '와 대단해요! 저는 아직 못 해봤는데', time: '월요일 10:15' },
      { id: 'm9', userId: 'u4', text: '다음 주 7코스 같이 가실 분!', time: '월요일 11:00' },
    ]
  },
];

// ── 내 발자취 타임라인 ─────────────────────────────
export const MY_FOOTPRINT = [
  {
    id: 'ft1',
    date: '2024년 11월 15일',
    title: '제주 올레 7코스 완주',
    places: ['올레7코스', '카페 하루', '서귀포 바다'],
    photos: [
      'https://images.unsplash.com/photo-1531219432768-9f540ce91ef3?w=200&q=80',
      'https://images.unsplash.com/photo-1445116572660-236099ec97a0?w=200&q=80',
      'https://images.unsplash.com/photo-1584979747315-d84851c8a030?w=200&q=80',
    ],
    region: 'jeju',
  },
  {
    id: 'ft2',
    date: '2024년 10월 22일',
    title: '성수동 반나절 나들이',
    places: ['성수동', 'LP바 골목', '소금집카페', '공방거리'],
    photos: [
      'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=200&q=80',
      'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=200&q=80',
      'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=200&q=80',
    ],
    region: 'seoul',
  },
  {
    id: 'ft3',
    date: '2024년 09월 08일',
    title: '전주 한옥마을 당일치기',
    places: ['한옥마을', '오목대', '남부시장'],
    photos: [
      'https://images.unsplash.com/photo-1568913516957-e72f9d1b4dd7?w=200&q=80',
      'https://images.unsplash.com/photo-1601577568901-5ffb27f2041e?w=200&q=80',
      'https://images.unsplash.com/photo-1535591273668-578e31182c4f?w=200&q=80',
    ],
    region: 'jeonju',
  },
];

// ── 앱 상태 ──────────────────────────────────────────
export const AppState = {
  posts: JSON.parse(localStorage.getItem('gyeolkil_posts') || 'null') || [...POSTS_INITIAL],
  currentUser: USERS[0],
  users: USERS,
  chatRooms: CHAT_ROOMS,
  drafts: JSON.parse(localStorage.getItem('gyeolkil_drafts') || '[]'),
  footprint: MY_FOOTPRINT,

  // 게시물 저장
  savePosts() {
    localStorage.setItem('gyeolkil_posts', JSON.stringify(this.posts));
  },
  // 임시저장 저장
  saveDrafts() {
    localStorage.setItem('gyeolkil_drafts', JSON.stringify(this.drafts));
  },
  // 게시물 추가
  addPost(post) {
    this.posts.unshift(post);
    this.savePosts();
  },
  // 게시물 찾기
  getPost(id) {
    return this.posts.find(p => p.id === id);
  },
  // 사용자 찾기
  getUser(id) {
    return this.users.find(u => u.id === id);
  },
  // 좋아요 토글
  toggleLike(postId) {
    const post = this.getPost(postId);
    if (!post) return;
    post.liked = !post.liked;
    post.likes += post.liked ? 1 : -1;
    this.savePosts();
    return post;
  },
  // 저장 토글
  toggleSave(postId) {
    const post = this.getPost(postId);
    if (!post) return;
    post.saved = !post.saved;
    post.saves += post.saved ? 1 : -1;
    this.savePosts();
    return post;
  },
  // 댓글 추가
  addComment(postId, text) {
    const post = this.getPost(postId);
    if (!post) return;
    const comment = {
      id: 'c' + Date.now(),
      userId: this.currentUser.id,
      text,
      createdAt: Date.now()
    };
    post.commentList.push(comment);
    post.comments++;
    this.savePosts();
    return comment;
  },
  // 임시저장
  saveDraft(draft) {
    const existing = this.drafts.findIndex(d => d.id === draft.id);
    if (existing >= 0) {
      this.drafts[existing] = draft;
    } else {
      this.drafts.unshift(draft);
    }
    this.saveDrafts();
  },
  deleteDraft(id) {
    this.drafts = this.drafts.filter(d => d.id !== id);
    this.saveDrafts();
  },
  // 지역 필터
  getPostsByRegion(region) {
    if (region === 'all') return this.posts;
    return this.posts.filter(p => p.region === region);
  },
  // 팔로잉 게시물 (데모: 2~5번 유저)
  getFollowingPosts() {
    return this.posts.filter(p => ['u2','u3','u4'].includes(p.userId));
  }
};

// ── 유틸 함수 ────────────────────────────────────────
export function formatTime(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return '방금 전';
  if (diff < 3600000) return Math.floor(diff / 60000) + '분 전';
  if (diff < 86400000) return Math.floor(diff / 3600000) + '시간 전';
  return Math.floor(diff / 86400000) + '일 전';
}

export function showToast(msg) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), 2200);
}

export function generateId() {
  return 'p' + Date.now() + Math.random().toString(36).slice(2, 7);
}

// 프로필 이미지가 없을 때 사용할 기본 아바타
export const FALLBACK_AVATAR = 'https://api.dicebear.com/7.x/adventurer/svg?seed=fallback';

// Firestore Timestamp / number / string 값을 모두 ms 숫자로 변환
export const getTimestampValue = (value) => {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

// 알림 시간을 '방금 전 / n분 전 / n시간 전 / n월 n일' 형태로 포맷
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

  const date = new Date(time);
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
};

// 알림 타입별로 화면에 보여줄 문구/미리보기 텍스트 구성
export const buildNotificationContent = (notif = {}) => {
  const senderName = notif.senderName || '여행자';
  const previewText = typeof notif.previewText === 'string' ? notif.previewText.trim() : '';
  const postPreview = typeof notif.postPreview === 'string' ? notif.postPreview.trim() : '';

  switch (notif.type) {
    case 'follow':
      return {
        title: `${senderName}님이 팔로우하였습니다.`,
        preview: ''
      };
    case 'comment':
      return {
        title: `${senderName}님이 내 게시글에 댓글을 작성했습니다.`,
        preview: previewText || postPreview
      };
    case 'like':
      return {
        title: `${senderName}님이 마음에 들어 합니다.`,
        preview: postPreview
      };
    default:
      return {
        title: `${senderName}님이 ${notif.message || '새로운 활동을 남겼습니다.'}`,
        preview: previewText || postPreview
      };
  }
};

// 타입별 아이콘 매핑
export const getNotificationTypeIcon = (type) => {
  switch (type) {
    case 'like':
      return 'fas fa-heart';
    case 'comment':
      return 'fas fa-comment';
    case 'follow':
      return 'fas fa-user-plus';
    default:
      return 'fas fa-bell';
  }
};

// 타입별 강조 색상 매핑
export const getNotificationTypeColors = (type) => {
  switch (type) {
    case 'like':
      return {
        bg: '#ff0f7b',
        shadow: '0 6px 18px rgba(255, 15, 123, 0.35)'
      };
    case 'comment':
      return {
        bg: '#6c5ce7',
        shadow: '0 6px 18px rgba(108, 92, 231, 0.35)'
      };
    case 'follow':
      return {
        bg: '#4dabf7',
        shadow: '0 6px 18px rgba(77, 171, 247, 0.35)'
      };
    default:
      return {
        bg: '#adb5bd',
        shadow: '0 6px 18px rgba(173, 181, 189, 0.25)'
      };
  }
};

// 좋아요 / 댓글 / 팔로우 알림 문서를 Firestore notifications 컬렉션에 저장
export const createSocialNotification = async ({
  receiverId,
  sender,
  type,
  postId = null,
  previewText = '',
  postPreview = '',
  targetUserId = null
}) => {
  if (!receiverId || !sender?.uid || receiverId === sender.uid) return;

  await addDoc(collection(db, 'notifications'), {
    receiverId,
    senderId: sender.uid,
    senderName: sender.displayName || '여행자',
    senderAvatar: sender.photoURL || FALLBACK_AVATAR,
    type,
    postId,
    targetUserId,
    previewText,
    postPreview,
    read: false,
    createdAt: Date.now()
  });
};

