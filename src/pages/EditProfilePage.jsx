import React, { useState, useEffect } from 'react';
import { updateProfile } from 'firebase/auth';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from '../firebase';
import imageCompression from 'browser-image-compression';
import { FALLBACK_AVATAR } from '../data'; // 기본 프로필 이미지 경로

const EditProfilePage = ({ onNavigate }) => {
  const currentUser = auth.currentUser;
  
  const [nickname, setNickname] = useState('');
  const [bio, setBio] = useState('');
  const [previewImage, setPreviewImage] = useState(FALLBACK_AVATAR);
  const [imageFile, setImageFile] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // 1. 기존 유저 정보 로드하여 Input 초기값 설정 (Auth와 Firestore 동기화 픽스)
  useEffect(() => {
    if (!currentUser) return;
    
    // Auth 인증 데이터 우선 기본값으로 세팅
    setNickname(currentUser.displayName || '');
    setPreviewImage(currentUser.photoURL || FALLBACK_AVATAR);

    const fetchUserData = async () => {
      try {
        const userRef = doc(db, 'users', currentUser.uid);
        const docSnap = await getDoc(userRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          // Firestore에 nickname 또는 displayName 필드가 있으면 그것으로 상태 업데이트
          if (data.nickname) setNickname(data.nickname);
          else if (data.displayName) setNickname(data.displayName);
          
          if (data.bio) setBio(data.bio);
          if (data.photoURL) setPreviewImage(data.photoURL);
        }
      } catch (error) {
        console.error('기존 프로필 데이터 로드 에러:', error);
      }
    };
    fetchUserData();
  }, [currentUser]);

  // 2. 프로필 이미지 선택 및 최적화 압축
  const handleImageChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // 화면 미리보기 세팅
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreviewImage(reader.result);
    };
    reader.readAsDataURL(file);

    // 이미지 파일 압축 (서버 부담 및 데이터 소모 최소화)
    try {
      const options = {
        maxSizeMB: 0.5,
        maxWidthOrHeight: 300, // 프로필용은 작아도 충분합니다
        useWebWorker: true,
      };
      const compressedFile = await imageCompression(file, options);
      setImageFile(compressedFile);
    } catch (error) {
      console.error('이미지 압축 실패:', error);
      setImageFile(file); // 실패 시 원본으로 대체
    }
  };

  // 3. 저장하기 (Firebase Auth 및 Firestore 동시 완벽 업데이트)
  const handleSave = async (e) => {
    e.preventDefault();
    if (!currentUser) return;
    if (!nickname.trim()) {
      alert('닉네임을 입력해주세요.');
      return;
    }

    try {
      setIsLoading(true);
      let downloadURL = currentUser.photoURL || FALLBACK_AVATAR;

      // 새 이미지가 선택된 경우에만 업로드 진행
      if (imageFile) {
        const storageRef = ref(storage, `profiles/${currentUser.uid}_${Date.now()}`);
        await uploadBytes(storageRef, imageFile);
        downloadURL = await getDownloadURL(storageRef);
      }

      // 1. Firebase Authentication 프로필 정보 업데이트
      await updateProfile(currentUser, {
        displayName: nickname.trim(),
        photoURL: downloadURL
      });

      // 2. Firestore 데이터베이스 'users' 컬렉션 문서 업데이트
      const userRef = doc(db, 'users', currentUser.uid);
      await updateDoc(userRef, {
        nickname: nickname.trim(),
        displayName: nickname.trim(),
        bio: bio.trim(),
        photoURL: downloadURL,
        updatedAt: new Date()
      });

      // 🚨 [NEW 추가] 3. 내가 과거에 'posts' 컬렉션에 올렸던 모든 게시글의 닉네임과 사진도 일괄 업데이트
      // 파이어베이스 라이브러리에서 필요한 함수들을 상단 import에 추가하거나, 아래처럼 직접 호출 가능합니다.
      const { collection, query, where, getDocs, writeBatch } = await import('firebase/firestore');
      
      const postsQuery = query(collection(db, 'posts'), where('userId', '==', currentUser.uid));
      const postsSnap = await getDocs(postsQuery);

      if (!postsSnap.empty) {
        const batch = writeBatch(db);
        postsSnap.forEach((postDoc) => {
          // 팀원들이 posts 데이터 구조 설계 시 사용한 필드명(authorName, authorAvatar 등)을 확인 후 맞춰주세요.
          batch.update(postDoc.ref, {
            authorName: nickname.trim(),
            authorAvatar: downloadURL
          });
        });
        await batch.commit(); // 여러 개의 게시글을 한 번에 전송 및 수정
      }

      alert('프로필과 과거 게시글 정보가 모두 성공적으로 변경되었습니다!');
      
      if (currentUser.reload) {
        await currentUser.reload();
      }

      onNavigate('mypage'); // 완료 후 마이페이지로 이동
    } catch (error) {
      console.error('프로필 및 게시글 수정 오류:', error);
      alert('저장에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '500px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      
      {/* 상단 타이틀 영역 */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '30px' }}>
        <button 
          type="button"
          onClick={() => onNavigate('mypage')}
          style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', marginRight: '15px', color: '#1A1A1A' }}
        >
          <i className="fas fa-arrow-left"></i>
        </button>
        <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 'bold', color: '#1A1A1A' }}>프로필 편집</h2>
      </div>

      {/* 입력 폼 영역 */}
      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        
        {/* 프로필 이미지 변경 아바타 */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
          <div style={{ position: 'relative', width: '100px', height: '100px' }}>
            <img 
              src={previewImage} 
              alt="프로필 미리보기" 
              onError={(e) => { e.target.src = FALLBACK_AVATAR }}
              style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', border: '1px solid #E1E4E6' }}
            />
            <label 
              htmlFor="profile-upload"
              style={{
                position: 'absolute', bottom: 0, right: 0, backgroundColor: '#2B8A3E', 
                color: '#fff', width: '32px', height: '32px', borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                boxShadow: '0 2px 4px rgba(0,0,0,0.15)'
              }}
            >
              <i className="fas fa-camera" style={{ fontSize: '13px' }}></i>
            </label>
            <input 
              id="profile-upload" 
              type="file" 
              accept="image/*" 
              onChange={handleImageChange} 
              style={{ display: 'none' }}
            />
          </div>
          <span style={{ fontSize: '13px', color: '#868E96' }}>사진 변경</span>
        </div>

        {/* 닉네임 필드 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: '14px', fontWeight: '600', color: '#495057' }}>닉네임</label>
          <input 
            type="text" 
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="변경할 닉네임을 입력하세요"
            style={{
              padding: '12px', borderRadius: '8px', border: '1px solid #CED4DA',
              fontSize: '15px', outline: 'none'
            }}
          />
        </div>

        {/* 한줄 소개 필드 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: '14px', fontWeight: '600', color: '#495057' }}>한줄 소개</label>
          <textarea 
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="나를 표현하는 한줄 소개를 작성해보세요."
            rows="3"
            style={{
              padding: '12px', borderRadius: '8px', border: '1px solid #CED4DA',
              fontSize: '15px', outline: 'none', resize: 'none', fontFamily: 'inherit'
            }}
          />
        </div>

        {/* 완료 버튼 */}
        <button 
          type="submit" 
          disabled={isLoading}
          style={{
            backgroundColor: '#2B8A3E', color: '#fff', padding: '14px',
            borderRadius: '8px', border: 'none', fontSize: '16px', fontWeight: '600',
            cursor: isLoading ? 'not-allowed' : 'pointer', marginTop: '10px',
            boxShadow: '0 4px 6px rgba(43, 138, 62, 0.15)', transition: 'background-color 0.2s'
          }}
        >
          {isLoading ? '변경사항 저장 중...' : '변경 완료'}
        </button>

      </form>
    </div>
  );
};

export default EditProfilePage;