import React, { useState } from 'react';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

const LoginScreen = () => {
  // 1. [현석 님 로직] 로그인 진행 중 체크 (중복 클릭 방지)
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleLogin = async () => {
    if (isLoading) return; 
    
    setIsLoading(true);

    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      const userDocRef = doc(db, 'users', user.uid);
      
      // 2. [데이터 보호 로직] 기존 유저인지 확인
      const userDocSnap = await getDoc(userDocRef);

      // 유저 정보가 없다면 (최초 가입 시에만) 동주 님 로직대로 초기 데이터 세팅
      if (!userDocSnap.exists()) {
        await setDoc(userDocRef, {
          uid: user.uid,
          displayName: user.displayName,
          email: user.email,
          photoURL: user.photoURL,
          bio: '여행 기록을 남기는 중 ✈️',
          followers: [],
          following: [],
          likedPosts: [],
          savedPosts: [],
          commentedPosts: []
        });
      }
      
    } catch (error) {
      // 3. [현석 님 로직] 사용자가 팝업을 닫은 경우 예외 처리
      if (error.code !== 'auth/popup-closed-by-user') {
        console.error("로그인 에러:", error);
        alert("로그인 중 문제가 발생했습니다. 네트워크 상태를 확인해주세요.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  // 4. [동주 님 UI 디자인 + 현석 님 로딩 UX 결합]
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        background: '#D8D3CB' // 팬톤 크림 톤 배경 유지
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '430px',
          height: '100vh',
          backgroundImage: `linear-gradient(rgba(0,0,0,0.18), rgba(0,0,0,0.45)), url('https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?q=80&w=1200')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '70px 28px 50px',
          color: '#fff',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {/* 상단 로고 및 텍스트 영역 */}
        <div>
          <div
            style={{
              width: '110px', height: '110px', borderRadius: '34px',
              background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(10px)',
              display: 'flex', justifyContent: 'center', alignItems: 'center',
              fontSize: '52px', marginBottom: '34px',
              border: '1px solid rgba(255,255,255,0.15)',
              boxShadow: '0 10px 30px rgba(0,0,0,0.15)'
            }}
          >
            🗺️
          </div>
          <h1 style={{ fontSize: '68px', fontWeight: '900', lineHeight: '1', marginBottom: '18px', letterSpacing: '-3px' }}>
            곁길
          </h1>
          <p style={{ fontSize: '22px', color: 'rgba(255,255,255,0.85)', lineHeight: '1.6' }}>
            당신의 여행,<br />우리의 지도
          </p>
        </div>

        {/* 감성 문구 영역 */}
        <div style={{ textAlign: 'center', fontSize: '38px', lineHeight: '1.7', fontWeight: '300', fontFamily: 'cursive', color: 'rgba(255,255,255,0.95)', textShadow: '0 4px 18px rgba(0,0,0,0.25)' }}>
          모든 여행은<br />곁길에서 시작된다
        </div>

        {/* 하단 로그인 버튼 영역 */}
        <div>
          <button
            onClick={handleGoogleLogin}
            disabled={isLoading}
            style={{
              width: '100%',
              border: 'none',
              background: isLoading ? 'rgba(255,255,255,0.7)' : '#fff', // 로딩 중일 때 살짝 투명하게
              color: '#111',
              height: '78px',
              borderRadius: '999px',
              fontSize: '24px', // 아이콘과 텍스트 조화를 위해 살짝 조정
              fontWeight: '800',
              cursor: isLoading ? 'wait' : 'pointer',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '12px',
              boxShadow: '0 14px 35px rgba(0,0,0,0.25)',
              transition: 'all 0.2s'
            }}
          >
            {isLoading ? (
              <span style={{ fontSize: '28px' }}>⏳</span>
            ) : (
              <img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg" alt="Google" style={{ width: '30px', height: '30px' }} />
            )}
            {isLoading ? '연결 중...' : 'Google로 시작하기'}
          </button>

          <div style={{ marginTop: '24px', textAlign: 'center', color: 'rgba(255,255,255,0.75)', fontSize: '15px' }}>
            🔒 안전하게 보호되는 로그인
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;