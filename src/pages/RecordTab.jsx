import React, { useState } from 'react';
// 🆕 파이어베이스 데이터 추가 및 현재 로그인 유저 확인 기능
import { collection, addDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';

const RecordTab = ({ onPublish }) => {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 작성 완료 버튼을 눌렀을 때 실행되는 함수
  const handleSubmit = async (e) => {
    e.preventDefault(); // 새로고침 방지
    
    // 1. 현재 로그인한 유저 정보 가져오기
    const user = auth.currentUser;
    if (!user) {
      alert("로그인 정보가 없습니다. 다시 로그인해주세요.");
      return;
    }

    if (!title.trim() || !body.trim()) {
      alert("제목과 내용을 모두 입력해주세요!");
      return;
    }

    setIsSubmitting(true);

    try {
      // 2. 파이어베이스에 저장할 '진짜' 데이터 조립
      const newPost = {
        userId: user.uid, // 🚨 가장 중요: 구글 계정의 고유 ID를 저장!
        authorName: user.displayName || '여행자', // 나중에 쉽게 띄우기 위해 이름도 같이 저장
        authorAvatar: user.photoURL || '',
        title: title,
        body: body,
        region: 'seoul', // 지역 태그 (임시)
        createdAt: Date.now(),
        likes: 0,
        comments: 0,
        saves: 0,
        // 🗺️ 지도 API 연동 전까지 사용할 임시 더미 경로 데이터
        route: [
          { name: '출발지 (임시)', lat: 37.5665, lng: 126.9780, photo: 'https://images.unsplash.com/photo-1517457373958-b7bdd4587205?w=500&q=80' },
          { name: '도착지 (임시)', lat: 37.5651, lng: 126.9895, photo: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=500&q=80' }
        ]
      };

      // 3. 파이어베이스 'posts' 컬렉션에 새 문서 추가 (Create)
      await addDoc(collection(db, 'posts'), newPost);
      
      alert("🎉 여행기가 성공적으로 등록되었습니다!");
      
      // 4. 입력창 초기화 및 홈 탭으로 이동 (App.jsx의 onPublish 실행)
      setTitle('');
      setBody('');
      onPublish(); 

    } catch (error) {
      console.error("게시물 업로드 실패:", error);
      alert("업로드 중 문제가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="tab-page active" style={{ overflowY: 'auto', paddingBottom: '100px' }}>
      <div className="discover-header">
        <h2 className="section-title" style={{ fontSize: '1.2rem', marginBottom: '0' }}>새로운 여정 기록</h2>
      </div>

      <div style={{ padding: '20px' }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* 제목 입력란 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#495057' }}>여행기 제목</label>
            <input 
              type="text" 
              placeholder="어떤 여행이었나요?" 
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{ padding: '15px', borderRadius: '12px', border: '1px solid #dee2e6', fontSize: '1rem', outline: 'none' }}
            />
          </div>

          {/* 본문 입력란 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#495057' }}>여행의 기록</label>
            <textarea 
              placeholder="여행에서 느낀 감정, 꿀팁 등을 자유롭게 적어주세요!" 
              value={body}
              onChange={(e) => setBody(e.target.value)}
              style={{ padding: '15px', borderRadius: '12px', border: '1px solid #dee2e6', fontSize: '1rem', height: '200px', resize: 'none', outline: 'none', fontFamily: 'inherit' }}
            />
          </div>

          {/* 경로 추가 UI (지도 연동 전까지는 시각적인 장식용) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#495057' }}>방문한 장소 (지도 연동 예정)</label>
            <div style={{ padding: '20px', borderRadius: '12px', backgroundColor: '#f8f9fa', border: '1px dashed #ced4da', textAlign: 'center', color: '#868e96', cursor: 'not-allowed' }}>
              <i className="fas fa-map-marker-alt" style={{ fontSize: '1.5rem', marginBottom: '10px', color: '#adb5bd' }}></i>
              <p style={{ margin: 0, fontSize: '0.9rem' }}>장소 검색 및 지도 기능은<br/>다음 업데이트에 추가됩니다!</p>
            </div>
          </div>

          {/* 작성 완료 버튼 */}
          <button 
            type="submit" 
            disabled={isSubmitting}
            style={{ 
              marginTop: '10px', padding: '16px', borderRadius: '12px', 
              backgroundColor: isSubmitting ? '#adb5bd' : '#52B788', 
              color: 'white', fontSize: '1.1rem', fontWeight: 'bold', border: 'none', 
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              boxShadow: isSubmitting ? 'none' : '0 4px 12px rgba(82, 183, 136, 0.3)'
            }}
          >
            {isSubmitting ? '기록 중...' : '여행기 발행하기'}
          </button>
        </form>
      </div>
    </section>
  );
};

export default RecordTab;