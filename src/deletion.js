import { arrayRemove, collection, deleteDoc, doc, getDoc, getDocs, query, updateDoc, where, writeBatch } from 'firebase/firestore';
import { deleteObject, ref } from 'firebase/storage';
import { db, storage } from './firebase';

/**
 * 연쇄 삭제 모음.
 * Firestore 는 문서를 지워도 하위 컬렉션(댓글·메시지)이 남고,
 * 게시물 문서를 지워도 Storage 의 사진 파일은 남는다. 여기서 한 번에 정리한다.
 */

const BATCH_LIMIT = 400; // writeBatch 한도(500)보다 여유 있게

const deleteRefs = async (refs) => {
  for (let i = 0; i < refs.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    refs.slice(i, i + BATCH_LIMIT).forEach((r) => batch.delete(r));
    await batch.commit();
  }
};

/** 문서와 그 하위 컬렉션 하나를 함께 지운다. 하위 문서를 먼저 지워야 보안 규칙(get 부모)이 통과한다. */
const deleteDocWithChildren = async (collectionPath, id, childCollection) => {
  const children = await getDocs(collection(db, collectionPath, id, childCollection));
  await deleteRefs(children.docs.map((d) => d.ref));
  await deleteDoc(doc(db, collectionPath, id));
};

/** 게시물 사진을 Storage 에서 지운다. 이미 없거나 예전 경로라 권한이 없는 파일은 건너뛴다. */
const deletePostPhotos = async (route) => {
  const urls = (Array.isArray(route) ? route : [])
    .map((spot) => spot?.photo)
    .filter((url) => typeof url === 'string' && url.includes('firebasestorage'));

  await Promise.all(
    urls.map((url) =>
      deleteObject(ref(storage, url)).catch((error) => {
        if (error?.code !== 'storage/object-not-found') console.warn('사진 파일 삭제 실패:', error?.code || error);
      })
    )
  );
};

/** 게시물 + 댓글 + 사진 파일 */
export async function deletePostCascade(post) {
  await deleteDocWithChildren('posts', post.id, 'comments');
  // 문서 삭제가 성공한 뒤에만 사진을 지운다. (반대로 하면 사진만 사라진 게시물이 남을 수 있다)
  await deletePostPhotos(post.route);
}

/** 동행 모집 + 동행 채팅 메시지 */
export const deleteGatheringCascade = (gatheringId) => deleteDocWithChildren('gatherings', gatheringId, 'messages');

/** 1:1 채팅방 + 메시지 */
export const deleteChatRoomCascade = (roomId) => deleteDocWithChildren('chatRooms', roomId, 'messages');

/**
 * 회원탈퇴 전에 내 데이터를 정리한다. (Auth 계정 삭제는 호출한 쪽에서 마지막에)
 * 보안 규칙상 남의 문서는 지울 수 없으므로, 다른 사람 글에 남긴 댓글은 남는다.
 */
export async function deleteAccountData(uid, onProgress = () => {}) {
  const byField = (name, field, op, value) => getDocs(query(collection(db, name), where(field, op, value)));

  onProgress('작성한 여정과 사진을 지우는 중...');
  const posts = await byField('posts', 'userId', '==', uid);
  for (const d of posts.docs) {
    await deletePostCascade({ id: d.id, ...d.data() });
  }

  onProgress('동행 모집을 정리하는 중...');
  const joined = await byField('gatherings', 'currentMembers', 'array-contains', uid);
  for (const d of joined.docs) {
    if (d.data().userId === uid) {
      await deleteGatheringCascade(d.id);
    } else {
      await updateDoc(d.ref, { currentMembers: arrayRemove(uid), status: 'recruiting' });
    }
  }
  // 방장이지만 멤버 목록에서 빠져 있는 예외적인 모집글도 지운다.
  const hosted = await byField('gatherings', 'userId', '==', uid);
  for (const d of hosted.docs) {
    try {
      await deleteGatheringCascade(d.id);
    } catch {
      // 멤버가 아니면 규칙상 메시지를 읽을 수 없다. 모집글 문서라도 지운다.
      await deleteDoc(d.ref);
    }
  }

  onProgress('채팅방을 정리하는 중...');
  const rooms = await byField('chatRooms', 'members', 'array-contains', uid);
  for (const d of rooms.docs) {
    await deleteChatRoomCascade(d.id);
  }

  onProgress('알림을 정리하는 중...');
  const notifications = await byField('notifications', 'receiverId', '==', uid);
  await deleteRefs(notifications.docs.map((d) => d.ref));

  onProgress('프로필을 지우는 중...');
  const me = await getDoc(doc(db, 'users', uid));
  // 내가 팔로우하던 사람들의 팔로워 목록에서 나를 뺀다. (규칙상 followers 필드만 수정 가능)
  const following = me.data()?.following || [];
  await Promise.all(
    following.map((targetId) =>
      updateDoc(doc(db, 'users', targetId), { followers: arrayRemove(uid) }).catch(() => {})
    )
  );
  await deleteDoc(doc(db, 'users', uid));
}
