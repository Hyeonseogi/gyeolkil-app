import { deleteField, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';

/**
 * 예전 버전은 가입할 때 users 문서에 이메일을 저장했다.
 * users 문서는 로그인한 누구나 읽을 수 있어서 모든 회원의 이메일이 드러나므로,
 * 앱을 열 때 내 문서에 이메일이 남아 있으면 지운다. (보안 규칙상 본인 문서만 고칠 수 있다)
 * 실패해도 앱 사용에는 지장이 없으므로 조용히 넘어간다.
 */
export async function removeLegacyEmail(uid) {
  if (!uid) return false;
  try {
    const ref = doc(db, 'users', uid);
    const snap = await getDoc(ref);
    if (!snap.exists() || !('email' in snap.data())) return false;
    await updateDoc(ref, { email: deleteField() });
    return true;
  } catch (error) {
    console.warn('이메일 정리 실패:', error);
    return false;
  }
}
