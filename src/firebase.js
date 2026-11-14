// src/firebase.js
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore'; // 데이터베이스 (글, 댓글 등 저장)
import { getStorage } from 'firebase/storage';     // 스토리지 (사진 저장)
import { getAuth } from 'firebase/auth';           // 인증 (로그인)

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// 환경 변수가 빠진 채로 실행되면 Firebase 는 알아보기 힘든 에러를 던진다.
// 어떤 값이 비어 있는지 먼저 알려줘서 설정 실수를 빠르게 잡을 수 있게 한다.
export const missingFirebaseKeys = Object.entries(firebaseConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missingFirebaseKeys.length > 0) {
  console.error(
    `[곁길] Firebase 환경 변수가 비어 있습니다: ${missingFirebaseKeys.join(', ')}\n` +
    '.env.example 을 복사해 .env.local 을 만들고 값을 채운 뒤 개발 서버를 재시작하세요.'
  );
}

// 파이어베이스 초기화
const app = initializeApp(firebaseConfig);

// 다른 파일에서 쓸 수 있도록 내보내기
export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);
