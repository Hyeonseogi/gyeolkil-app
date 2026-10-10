# 🗺️ 곁길 (Gyeolkil)

> **당신의 여행, 우리의 지도**
> 사진 한 장으로 여행 경로를 자동으로 되살리고, 지금 내 주변의 동행을 찾는 여정 기록 소셜 앱

---

## 1. 기획 의도

여행 기록 앱은 많지만 대부분 **사용자가 직접 장소를 하나씩 입력**해야 합니다.
현실에서 여행자는 사진을 찍기 바쁘고, 돌아와서 경로를 정리할 여력은 없습니다.

곁길은 이 순서를 뒤집었습니다.

> **"이미 찍은 사진 안에 여행 기록이 전부 들어 있다"**

사진의 EXIF 메타데이터에는 촬영 시각과 GPS 좌표가 담겨 있습니다.
곁길은 갤러리에서 사진을 고르기만 하면

1. 촬영 시각 순으로 정렬해 **이동 순서**를 복원하고
2. 80m 이내의 좌표를 묶어 **같은 장소**로 인식하고
3. 지점 사이를 실제 도보/차량 경로 API로 이어 **여행 경로를 지도에 그리고**
4. 사진 간 시간 차이에서 이동 시간을 빼 **각 장소의 체류 시간**을 추정합니다.

여기에 "지금, 이 근처에서 함께할 사람"을 찾는 **실시간 동행 모집**을 얹어
기록(과거)과 만남(현재)을 한 앱에서 잇는 것이 곁길의 목표입니다.

---

## 2. 주요 기능

| 화면 | 기능 |
| --- | --- |
| **홈** | 최신 여정 피드 · 팔로잉 필터 · 인기/댓글/스크랩 정렬 · **📍 내 주변** 지도 |
| **내 주변** | 반경 5km 이내의 여정 핀과 실시간 동행 모집 핀을 지도에 표시, 즉석 모집글 작성 |
| **발견** | 키워드·해시태그 검색, 지역별 탐색, 인기 코스, 무한 스크롤 피드 |
| **기록** | 사진 업로드 → 경로 자동 복원 → 순서 편집(드래그) → 이야기 작성 → 게시, 임시저장 |
| **채팅** | 팔로잉 상대와의 1:1 대화 + 참여 중인 동행 단체 채팅 |
| **마이페이지** | 내 여정 / 좋아요 / 저장 / 댓글 단 글, 프로필 편집 |
| **내 발자취** | 전체 여정을 지도 한 장에 모아 보기 + 방문 장소·지역·누적 이동 거리 통계 |
| **알림** | 좋아요·댓글·답글·팔로우 실시간 알림, 읽음 처리 |

---

## 3. 기술 스택

| 구분 | 사용 기술 |
| --- | --- |
| 프론트엔드 | React 19, Vite 8 |
| 백엔드 (BaaS) | Firebase Authentication(Google 로그인), Cloud Firestore, Cloud Storage |
| 지도 | Kakao Maps SDK (`react-kakao-maps-sdk`) |
| 경로 탐색 | TMAP 보행자 경로 API, Kakao Mobility 자동차 경로 API |
| 사진 처리 | `exifr`(EXIF 파싱), `heic2any`(아이폰 HEIC 변환), `browser-image-compression` |
| 테스트 | Vitest |

---

## 4. 실행 방법

### 4-1. 설치

```bash
npm install
```

### 4-2. 환경 변수 설정

`.env.example` 을 복사해 `.env.local` 을 만들고 값을 채웁니다.

```bash
cp .env.example .env.local
```

| 변수 | 발급처 | 비고 |
| --- | --- | --- |
| `VITE_FIREBASE_*` | Firebase 콘솔 > 프로젝트 설정 > SDK 설정 | 6개 모두 필요 |
| `VITE_KAKAO_JS_KEY` | Kakao Developers > 앱 키 > JavaScript 키 | 플랫폼 > Web 에 도메인 등록 필수 |
| `KAKAO_REST_KEY` | Kakao Developers > 앱 키 > REST API 키 | **서버 전용** (아래 5-2 참고) |
| `TMAP_APP_KEY` | SK Open API | **서버 전용** |

> 배포 환경(Vercel)에서는 `.env.local` 대신 프로젝트 설정에 같은 이름으로 등록합니다. (8-1 참고)

> 값이 비어 있으면 앱이 흰 화면 대신 **설정 안내 화면**을 띄우고, 어떤 변수가 비었는지 알려줍니다.

### 4-3. 개발 서버

```bash
npm run dev
```

### 4-4. 그 외 명령어

```bash
npm run build     # 프로덕션 빌드
npm run preview   # 빌드 결과 미리보기
npm run lint      # ESLint 검사
npm test          # 단위 테스트 (Vitest)
```

---

## 5. 설계에서 신경 쓴 점

### 5-1. Firebase 보안 규칙

이 앱은 **다른 사람의 문서에도 써야 합니다.** (팔로우하면 상대의 `followers` 배열이 늘어나고,
좋아요를 누르면 남의 게시글 `likes` 가 올라갑니다.)
그래서 "로그인하면 다 허용"으로 두면 남의 글을 지우거나 알림을 사칭할 수 있습니다.

`firestore.rules` 는 **바뀐 필드만 검사하는 방식**으로 이 문제를 풀었습니다.

```
// 작성자는 전체 수정 가능, 남은 '반응' 필드만 건드릴 수 있다
allow update: if (isSignedIn() && resource.data.userId == request.auth.uid)
  || (isSignedIn() && changedKeys().hasOnly(['likes','likedBy','saves','savedBy','comments','commentedUserIds']));
```

배포:

```bash
firebase deploy --only firestore:rules,storage
```

### 5-2. API 키를 브라우저에 두지 않기

Kakao Mobility **REST 키**와 TMAP **앱키**는 서버 전용 비밀키입니다.
브라우저에서 직접 호출하면 개발자 도구에 키가 그대로 노출되고, CORS 에도 막힙니다.

곁길은 이 두 호출을 **서버를 거쳐** 나가게 하고,
키는 `VITE_` 접두사가 **없는** 환경 변수로만 읽습니다. (`VITE_` 가 없으면 번들에 포함되지 않습니다.)

프론트엔드가 부르는 주소는 개발/배포가 똑같고, 뒤에서 처리하는 주체만 달라집니다.

| 환경 | 처리 주체 |
| --- | --- |
| 로컬 개발 (`npm run dev`) | `vite.config.js` 의 dev 서버 프록시 |
| 배포 (Vercel) | `api/route/*.js` 서버리스 함수 |

```
브라우저  →  /api/route/pedestrian  →  [서버가 appKey 헤더 주입]        →  TMAP
브라우저  →  /api/route/car         →  [서버가 Authorization 주입]      →  Kakao Mobility
```

두 경로 모두 응답을 하루 캐시(`s-maxage=86400`)하므로 같은 구간을 반복 조회해도
외부 API 호출량이 늘지 않습니다.

서버가 없는 순수 정적 호스팅에 올릴 경우에는 이 호출이 실패하는데,
그때는 자동으로 **두 지점을 직선으로 잇는 폴백**이 동작해 앱이 멈추지 않습니다.

### 5-3. 초기 로딩 최적화

EXIF 파서·HEIC 변환기·이미지 압축기만 합쳐 **1.4MB** 가 넘습니다.
이 라이브러리들은 "기록" 탭에서만 쓰이므로 `React.lazy` 로 분리했습니다.

| | 최초 로딩 (gzip) |
| --- | --- |
| 개선 전 | 600 KB (단일 번들) |
| 개선 후 | **약 207 KB** (기록 탭 진입 시 나머지 로드) |

### 5-4. 좌표가 "없는" 값 다루기

`Number(null)` 은 `0` 입니다. 좌표를 그냥 `Number()` 로만 변환하면
**위치 정보가 없는 사진이 적도(0도) 위에 있는 것처럼** 취급되어
"내 주변 5km" 필터에 엉뚱한 게시물이 섞입니다.

`toCoordinate()` 유틸이 `null`·`''`·`boolean` 을 명시적으로 걸러내며,
이 동작은 단위 테스트로 고정해 두었습니다.

---

## 6. 데이터 구조 (Firestore)

```
users/{uid}
  displayName, photoURL, bio
  followers[], following[]
  likedPosts[], savedPosts[], commentedPosts[]

posts/{postId}
  userId, authorName, authorAvatar
  title, body, tags[], companion
  region, regions[]                 // 좌표에서 자동 추론
  route[]                           // { name, lat, lng, photo, timestamp,
                                    //   transitType, travelTimeToNext }
  detailedPath[]                    // 지도에 그릴 실제 경로 좌표
  likes, likedBy[], saves, savedBy[]
  comments, commentedUserIds[]
  createdAt
  └─ comments/{commentId}
       userId, authorName, authorAvatar, text, replies[], createdAt

gatherings/{gatheringId}            // 실시간 동행 모집
  userId, authorName, title, body, category
  lat, lng, maxMembers, currentMembers[], status
  └─ messages/{messageId}

chatRooms/{uidA_uidB}               // 1:1 대화 (uid 정렬 조합 = 중복 방 방지)
  members[], lastMessage, lastMessageAt
  └─ messages/{messageId}

notifications/{notificationId}
  receiverId, senderId, senderName, senderAvatar
  type(like|comment|reply|follow), postId, previewText, read, createdAt
```

### 필요한 복합 색인

발견 탭의 인기 코스 정렬에 다음 색인이 필요합니다.
(없으면 자동으로 최신 글 기준 폴백이 동작하므로 앱은 정상 작동합니다.)

| 컬렉션 | 필드 |
| --- | --- |
| `posts` | `likes` 내림차순, `createdAt` 내림차순 |

---

## 7. 프로젝트 구조

```
src/
├── App.jsx                  라우팅(탭 전환) · 알림 패널 · 전역 인증 상태
├── firebase.js              Firebase 초기화 + 환경 변수 검증
├── utils.js                 순수 유틸 (거리·지역·시간 포맷) — 테스트 대상
├── utils.test.js            단위 테스트 38개
├── data.js                  utils 재수출 + 알림 생성 헬퍼
├── components/
│   ├── PostCard.jsx         피드 카드 (홈·발견 공용)
│   ├── PostGrid.jsx         3열 썸네일 그리드 (마이페이지·타인 프로필 공용)
│   ├── PostDetailModal.jsx  여정 상세 · 타임라인 · 댓글/답글
│   ├── RouteMap.jsx         카카오맵 경로 렌더링
│   ├── LoginScreen.jsx      구글 로그인
│   ├── ErrorBoundary.jsx    렌더링 오류 안내 화면
│   └── SetupNotice.jsx      환경 변수 누락 안내 화면
└── pages/
    ├── HomeTab.jsx          피드 + 내 주변 지도 + 동행 모집
    ├── DiscoverTab.jsx      검색 · 지역 탐색 · 무한 스크롤
    ├── RecordTab.jsx        3단계 여정 기록 (지연 로딩)
    ├── ChatTab.jsx          1:1 / 동행 채팅
    ├── MyPage.jsx           내 프로필 · 활동 기록
    ├── UserProfilePage.jsx  타인 프로필 · 팔로우
    ├── EditProfilePage.jsx  프로필 편집
    ├── FootprintTab.jsx     내 발자취 지도 · 통계 · 타임라인
    └── SettingsPage.jsx     로그아웃 · 탈퇴 · 약관
```

---

## 8. 배포 (Vercel)

`main` 브랜치에 푸시하면 Vercel 이 자동으로 빌드·배포합니다.
프레임워크는 **Vite** 로 자동 인식되며, `api/` 폴더는 서버리스 함수로 함께 배포됩니다.

### 8-1. Vercel 환경 변수

Vercel 프로젝트 > **Settings > Environment Variables** 에 아래 값을 등록합니다.
(Production / Preview / Development 모두 체크)

| 변수 | 용도 | 브라우저 노출 |
| --- | --- | --- |
| `VITE_FIREBASE_API_KEY` 외 5개 | Firebase 연결 | 노출됨 (정상) |
| `VITE_KAKAO_JS_KEY` | 지도 렌더링 | 노출됨 (정상) |
| `KAKAO_REST_KEY` | 자동차 경로 탐색 | **비공개** (서버리스 함수 전용) |
| `TMAP_APP_KEY` | 보행자 경로 탐색 | **비공개** (서버리스 함수 전용) |

> `VITE_` 접두사가 붙은 값만 프론트엔드 번들에 포함됩니다.
> 아래 두 개는 접두사가 없으므로 `api/route/*.js` 안에서만 읽히고 브라우저로 나가지 않습니다.
> 환경 변수를 추가·수정한 뒤에는 **재배포(Redeploy)** 해야 반영됩니다.

### 8-2. 배포 도메인 등록 (빼먹으면 로그인·지도가 동작하지 않습니다)

| 서비스 | 등록 위치 | 등록할 값 |
| --- | --- | --- |
| Firebase | Authentication > Settings > **승인된 도메인** | `<프로젝트>.vercel.app` |
| Kakao | 내 애플리케이션 > 플랫폼 > **Web 사이트 도메인** | `https://<프로젝트>.vercel.app` |

누락 시 증상 — Firebase: 구글 로그인이 `auth/unauthorized-domain` 으로 실패,
Kakao: 지도 영역이 자리표시자로만 표시됩니다.

### 8-3. 보안 규칙 배포

보안 규칙은 Vercel 이 아니라 Firebase 로 따로 올립니다.

```bash
firebase deploy --only firestore:rules,storage
```

---

## 9. 알려진 제약

- **지역 판별** 은 서울·부산·제주·전주·경주 5개 지역의 위경도 범위를 기준으로 합니다.
  그 외 지역은 지역 필터에 잡히지 않습니다.
- **체류 시간** 은 사진 촬영 간격에서 이동 시간을 뺀 추정값입니다.
- 위치 정보(EXIF GPS)가 없는 사진은 기본 좌표(서울시청)로 저장되며, 화면에 안내가 표시됩니다.
- 경로 탐색은 서버(개발 서버 프록시 또는 Vercel 서버리스 함수)를 통해서만 동작합니다.
  서버가 없는 순수 정적 호스팅에서는 직선 경로로 대체됩니다.
