import React, { useState } from 'react';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth } from '../firebase';

const LoginScreen = () => {
  // 1. 로그인 진행 중인지 체크하는 상태 (중복 클릭 방지용)
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleLogin = async () => {
    // 이미 로딩 중이면 함수 실행을 막음
    if (isLoading) return; 
    
    setIsLoading(true); // 로딩 시작

    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      
      const user = result.user;
      console.log("🎉 로그인 성공!", user.displayName, user.email);
      
    } catch (error) {
      // 2. 사용자가 실수로 팝업을 닫은 경우는 에러 알림을 띄우지 않음
      if (error.code !== 'auth/popup-closed-by-user') {
        console.error("로그인 에러:", error);
        alert("로그인 중 문제가 발생했습니다. 네트워크 상태를 확인해주세요.");
      }
    } finally {
      // 성공하든 실패하든 로딩 상태는 다시 해제
      setIsLoading(false);
    }
  };

  return (
    // 전체 배경은 테마 컬러인 팬톤 크림(var(--pantone-cream))을 따른다고 가정합니다.
    <div id="splash-screen" style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="splash-bg"></div>
      
      <div className="splash-content" style={{ textAlign: 'center', padding: '20px' }}>
        <div className="splash-logo" style={{ marginBottom: '16px' }}>
          <span className="logo-emoji" style={{ fontSize: '48px' }}>🗺️</span>
          <h1 className="logo-text" style={{ fontSize: '32px', color: '#2C2A29', margin: '8px 0' }}>곁길</h1>
        </div>
        
        <p className="splash-tagline" style={{ color: '#666', marginBottom: '40px', lineHeight: '1.5' }}>
          발길 닿는 곳마다 기록하는<br />나만의 여행 코스
        </p>

        {/* 3. 로딩 상태에 따른 UI 변화 및 차콜 블랙 버튼 디자인 */}
        <button 
          className="splash-btn" 
          onClick={handleGoogleLogin}
          disabled={isLoading}
          style={{
            background: isLoading ? '#888' : '#2C2A29', // 차콜 블랙
            color: '#fff',
            padding: '14px 24px',
            borderRadius: '8px',
            border: 'none',
            fontSize: '16px',
            fontWeight: 'bold',
            cursor: isLoading ? 'wait' : 'pointer',
            transition: 'background 0.2s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            maxWidth: '280px',
            margin: '0 auto'
          }}
        >
          {/* 아이콘: 로딩 중일 때는 모래시계, 아닐 때는 구글 아이콘 */}
          {isLoading ? (
            <span style={{ marginRight: '8px' }}>⏳</span>
          ) : (
            <i className="fab fa-google" style={{ marginRight: '8px' }}></i>
          )}
          {isLoading ? '구글 계정 연결 중...' : '구글 계정으로 시작하기'}
        </button>
      </div>
    </div>
  );
};

export default LoginScreen;