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

// 파이어베이스 초기화
const app = initializeApp(firebaseConfig);

// 다른 파일에서 쓸 수 있도록 내보내기
export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);