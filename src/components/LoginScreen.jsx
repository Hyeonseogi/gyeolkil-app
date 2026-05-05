import React from 'react';
// 🆕 파이어베이스 로그인 전용 패키지 불러오기
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth } from '../firebase';

const LoginScreen = () => {
  // 구글 로그인 팝업 띄우는 함수
  const handleGoogleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      // 파이어베이스야, 구글 로그인 팝업창을 띄워줘!
      const result = await signInWithPopup(auth, provider);
      
      // 로그인이 성공하면 구글이 유저 정보를 던져줍니다.
      const user = result.user;
      console.log("🎉 로그인 성공!", user.displayName, user.email);
      
      // (참고) 로그인이 성공하면 App.jsx의 onAuthStateChanged가 
      // 이를 자동으로 감지해서 화면을 넘겨주기 때문에 여기서 별도의 처리를 안 해도 됩니다.
    } catch (error) {
      console.error("로그인 에러:", error);
      alert("로그인 중 문제가 발생했습니다.");
    }
  };

  return (
    <div id="splash-screen">
      <div className="splash-bg"></div>
      <div className="splash-content">
        <div className="splash-logo">
          <span className="logo-emoji">🗺️</span>
          <span className="logo-text">곁길</span>
        </div>
        <p className="splash-tagline">
          발길 닿는 곳마다 기록하는<br />나만의 여행 코스
        </p>
        {/* 버튼을 누르면 구글 로그인 팝업 함수 실행! */}
        <button className="splash-btn" onClick={handleGoogleLogin}>
          <i className="fab fa-google" style={{ marginRight: '8px' }}></i>
          구글 계정으로 시작하기
        </button>
      </div>
    </div>
  );
};

export default LoginScreen;