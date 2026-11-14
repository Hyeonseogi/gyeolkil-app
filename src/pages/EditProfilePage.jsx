import { useState, useEffect } from 'react';
import { updateProfile } from 'firebase/auth';
import {
  doc,
  updateDoc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  writeBatch,
  serverTimestamp
} from 'firebase/firestore';
import { db, storage } from '../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import imageCompression from 'browser-image-compression';
import { FALLBACK_AVATAR, showToast } from '../data';

const NICKNAME_MAX = 20;
const BIO_MAX = 60;

const EditProfilePage = ({ currentUser, onNavigate, onProfileUpdated }) => {
  const [nickname, setNickname] = useState(currentUser?.displayName || '');
  const [bio, setBio] = useState('');
  const [previewImage, setPreviewImage] = useState(currentUser?.photoURL || FALLBACK_AVATAR);
  const [imageFile, setImageFile] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Firestore 에 저장된 프로필(소개글 등)을 불러와 입력값 초기화
  useEffect(() => {
    if (!currentUser) return;

    let cancelled = false;
    const fetchUserData = async () => {
      try {
        const docSnap = await getDoc(doc(db, 'users', currentUser.uid));
        if (cancelled || !docSnap.exists()) return;

        const data = docSnap.data();
        if (data.nickname || data.displayName) setNickname(data.nickname || data.displayName);
        if (data.bio) setBio(data.bio);
        if (data.photoURL) setPreviewImage(data.photoURL);
      } catch (error) {
        console.error('기존 프로필 데이터 로드 에러:', error);
      }
    };

    fetchUserData();
    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  // 프로필 이미지 선택 + 압축
  const handleImageChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('이미지 파일만 올릴 수 있어요.', 'error');
      return;
    }

    // 미리보기
    const reader = new FileReader();
    reader.onloadend = () => setPreviewImage(reader.result);
    reader.readAsDataURL(file);

    // 업로드 용량 최소화 (프로필은 작은 크기로 충분하다)
    try {
      const compressedFile = await imageCompression(file, {
        maxSizeMB: 0.5,
        maxWidthOrHeight: 300,
        useWebWorker: true
      });
      setImageFile(compressedFile);
    } catch (error) {
      console.error('이미지 압축 실패:', error);
      setImageFile(file); // 실패 시 원본 사용
    }
  };

  // 저장 (Auth + Firestore + 과거 게시글의 작성자 정보까지 동기화)
  const handleSave = async (e) => {
    e.preventDefault();
    if (!currentUser || isLoading) return;

    const trimmedNickname = nickname.trim();
    if (!trimmedNickname) {
      showToast('닉네임을 입력해주세요.', 'error');
      return;
    }
    if (trimmedNickname.length > NICKNAME_MAX) {
      showToast(`닉네임은 ${NICKNAME_MAX}자까지 가능합니다.`, 'error');
      return;
    }

    try {
      setIsLoading(true);
      let downloadURL = currentUser.photoURL || FALLBACK_AVATAR;

      if (imageFile) {
        const storageRef = ref(storage, `profiles/${currentUser.uid}_${Date.now()}`);
        await uploadBytes(storageRef, imageFile);
        downloadURL = await getDownloadURL(storageRef);
      }

      // 1. Firebase Authentication 프로필
      await updateProfile(currentUser, { displayName: trimmedNickname, photoURL: downloadURL });

      // 2. Firestore users 문서
      await updateDoc(doc(db, 'users', currentUser.uid), {
        nickname: trimmedNickname,
        displayName: trimmedNickname,
        bio: bio.trim().slice(0, BIO_MAX),
        photoURL: downloadURL,
        updatedAt: serverTimestamp()
      });

      // 3. 내가 예전에 쓴 게시글의 작성자 이름 / 사진도 함께 갱신
      //    (게시글마다 작성자 정보를 복사해 두는 구조라 한 번에 맞춰줘야 한다)
      const postsSnap = await getDocs(query(collection(db, 'posts'), where('userId', '==', currentUser.uid)));
      if (!postsSnap.empty) {
        // Firestore batch 는 한 번에 500 건 제한이 있어 나눠서 커밋한다.
        const docs = postsSnap.docs;
        for (let i = 0; i < docs.length; i += 400) {
          const batch = writeBatch(db);
          docs.slice(i, i + 400).forEach((postDoc) => {
            batch.update(postDoc.ref, { authorName: trimmedNickname, authorAvatar: downloadURL });
          });
          await batch.commit();
        }
      }

      // 4. 화면에 보이는 내 정보 갱신
      if (onProfileUpdated) await onProfileUpdated();

      showToast('프로필이 변경되었습니다.', 'success');
      onNavigate('mypage');
    } catch (error) {
      console.error('프로필 및 게시글 수정 오류:', error);
      showToast('저장에 실패했습니다. 다시 시도해주세요.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="tab-page active" style={{ overflowY: 'auto', backgroundColor: '#fff', height: '100%' }}>
      <div style={{ padding: '20px 20px 100px', maxWidth: '500px', margin: '0 auto', width: '100%' }}>
        {/* 상단 타이틀 */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '30px' }}>
          <button
            type="button"
            onClick={() => onNavigate('mypage')}
            aria-label="뒤로 가기"
            style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', marginRight: '15px', color: '#1A1A1A' }}
          >
            <i className="fas fa-arrow-left"></i>
          </button>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 'bold', color: '#1A1A1A' }}>프로필 편집</h2>
        </div>

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* 프로필 이미지 */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
            <div style={{ position: 'relative', width: '100px', height: '100px' }}>
              <img
                src={previewImage}
                alt="프로필 미리보기"
                onError={(e) => {
                  e.currentTarget.src = FALLBACK_AVATAR;
                }}
                style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', border: '1px solid #E1E4E6' }}
              />
              <label
                htmlFor="profile-upload"
                style={{
                  position: 'absolute',
                  bottom: 0,
                  right: 0,
                  backgroundColor: '#2B8A3E',
                  color: '#fff',
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.15)'
                }}
              >
                <i className="fas fa-camera" style={{ fontSize: '13px' }}></i>
                <span className="sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
                  프로필 사진 변경
                </span>
              </label>
              <input id="profile-upload" type="file" accept="image/*" onChange={handleImageChange} style={{ display: 'none' }} />
            </div>
            <span style={{ fontSize: '13px', color: '#868E96' }}>사진 변경</span>
          </div>

          {/* 닉네임 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <label htmlFor="nickname-input" style={{ fontSize: '14px', fontWeight: '600', color: '#495057' }}>
                닉네임
              </label>
              <span style={{ fontSize: '12px', color: nickname.length > NICKNAME_MAX ? '#e03131' : '#ADB5BD' }}>
                {nickname.length}/{NICKNAME_MAX}
              </span>
            </div>
            <input
              id="nickname-input"
              type="text"
              value={nickname}
              maxLength={NICKNAME_MAX}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="변경할 닉네임을 입력하세요"
              style={{ padding: '12px', borderRadius: '8px', border: '1px solid #CED4DA', fontSize: '15px', outline: 'none' }}
            />
          </div>

          {/* 한줄 소개 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <label htmlFor="bio-input" style={{ fontSize: '14px', fontWeight: '600', color: '#495057' }}>
                한줄 소개
              </label>
              <span style={{ fontSize: '12px', color: '#ADB5BD' }}>
                {bio.length}/{BIO_MAX}
              </span>
            </div>
            <textarea
              id="bio-input"
              value={bio}
              maxLength={BIO_MAX}
              onChange={(e) => setBio(e.target.value)}
              placeholder="나를 표현하는 한줄 소개를 작성해보세요."
              rows="3"
              style={{
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid #CED4DA',
                fontSize: '15px',
                outline: 'none',
                resize: 'none',
                fontFamily: 'inherit'
              }}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            style={{
              backgroundColor: isLoading ? '#8CC7A1' : '#2B8A3E',
              color: '#fff',
              padding: '14px',
              borderRadius: '8px',
              border: 'none',
              fontSize: '16px',
              fontWeight: '600',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              marginTop: '10px',
              boxShadow: '0 4px 6px rgba(43, 138, 62, 0.15)',
              transition: 'background-color 0.2s'
            }}
          >
            {isLoading ? '변경사항 저장 중...' : '변경 완료'}
          </button>
        </form>
      </div>
    </section>
  );
};

export default EditProfilePage;
