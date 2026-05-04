import React from 'react';

const LoginScreen = ({ onLogin }) => {
  return (
    <div id="splash-screen" style={{ opacity: 1, transition: 'opacity 0.5s', display: 'flex', zIndex: 9999 }}>
      <div className="splash-bg"></div>
      <div className="splash-content" style={{ width: '100%', padding: '0 24px' }}>
        
        <div className="splash-logo" style={{ marginBottom: '10px' }}>
          <span className="logo-emoji" style={{ fontSize: '3.5rem' }}>🗺️</span>
          <h1 className="logo-text" style={{ fontSize: '3rem' }}>곁길</h1>
        </div>
        <p className="splash-tagline" style={{ marginBottom: '50px' }}>
          나의 여행을 기록하고<br/>공유하고 공감하다
        </p>

        {/* 카카오 로그인 버튼 (노란색) */}
        <button 
          onClick={onLogin}
          style={{
            width: '100%', padding: '14px', borderRadius: '12px',
            backgroundColor: '#FEE500', color: '#000000',
            fontWeight: 'bold', fontSize: '1rem', border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: '8px', marginBottom: '12px', cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
          }}
        >
          <i className="fas fa-comment"></i> 카카오로 시작하기
        </button>

        {/* 구글 로그인 버튼 (흰색) */}
        <button 
          onClick={onLogin}
          style={{
            width: '100%', padding: '14px', borderRadius: '12px',
            backgroundColor: '#FFFFFF', color: '#3c4043',
            fontWeight: 'bold', fontSize: '1rem', border: '1px solid #dadce0',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: '8px', cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
          }}
        >
          <i className="fab fa-google" style={{ color: '#EA4335' }}></i> Google로 시작하기
        </button>
        
      </div>
    </div>
  );
};

export default LoginScreen;