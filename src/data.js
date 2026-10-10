import { addDoc, collection } from 'firebase/firestore';
import { db } from './firebase';
import { FALLBACK_AVATAR } from './utils';

/**
 * 곁길 — 공용 모듈.
 * 순수 계산/포맷 함수는 utils.js 에 있고 여기서 그대로 다시 내보낸다.
 * (기존 코드가 모두 ./data 에서 가져다 쓰고 있어 진입점을 유지한다)
 */
export * from './utils';

/** 좋아요 / 댓글 / 팔로우 알림 문서를 notifications 컬렉션에 저장 */
export const createSocialNotification = async ({
  receiverId,
  sender,
  type,
  postId = null,
  previewText = '',
  postPreview = '',
  targetUserId = null
}) => {
  // 나 자신에게 보내는 알림은 만들지 않는다.
  if (!receiverId || !sender?.uid || receiverId === sender.uid) return;

  try {
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
  } catch (error) {
    // 알림 실패가 본 동작(좋아요/댓글)까지 막지 않도록 삼킨다.
    console.error('알림 생성 실패:', error);
  }
};
