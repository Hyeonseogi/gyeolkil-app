/**
 * 임시저장 저장소 (IndexedDB)
 *
 * 예전에는 localStorage 에 JSON 으로 저장해서 사진(File)을 담을 수 없었다.
 * 그래서 임시저장을 불러오면 사진이 전부 사라졌다.
 * IndexedDB 는 File/Blob 을 그대로 저장할 수 있으므로 사진까지 함께 보관한다.
 */

const DB_NAME = 'gyeolkil';
const DB_VERSION = 1;
const STORE = 'drafts';
const MAX_DRAFTS = 20;
const LEGACY_KEY = 'gyeolkil_drafts'; // 예전 localStorage 키

let dbPromise = null;

const openDb = () => {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('이 브라우저는 임시저장을 지원하지 않습니다.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  // 실패했으면 다음 호출 때 다시 시도할 수 있게 캐시를 비운다.
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
};

const run = async (mode, action) => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const result = action(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(result?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
};

const getAll = () => run('readonly', (store) => store.getAll());

/** 예전 localStorage 임시저장을 한 번만 옮겨온다. (사진은 원래 없었으므로 글·좌표만) */
const migrateLegacyDrafts = async () => {
  let legacy;
  try {
    legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null');
  } catch {
    legacy = null;
  }
  if (!Array.isArray(legacy) || legacy.length === 0) return;

  await run('readwrite', (store) => {
    legacy.forEach((draft) => {
      if (draft?.id) store.put(draft);
    });
  });
  localStorage.removeItem(LEGACY_KEY);
};

/** 최근 저장 순으로 정렬된 임시저장 목록 */
export async function listDrafts() {
  await migrateLegacyDrafts();
  const drafts = (await getAll()) || [];
  return drafts.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
}

/** 임시저장을 추가하거나 같은 id 면 덮어쓴다. 최대 개수를 넘으면 오래된 것부터 지운다. */
export async function putDraft(draft) {
  await run('readwrite', (store) => store.put(draft));

  const drafts = await listDrafts();
  const overflow = drafts.slice(MAX_DRAFTS);
  if (overflow.length > 0) {
    await run('readwrite', (store) => overflow.forEach((d) => store.delete(d.id)));
  }
  return drafts.slice(0, MAX_DRAFTS);
}

export async function deleteDraft(id) {
  await run('readwrite', (store) => store.delete(id));
  return listDrafts();
}
