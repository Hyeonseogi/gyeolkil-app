import React from 'react';
import { signOut, deleteUser } from 'firebase/auth';
import { doc, deleteDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

const SettingsPage = ({ onClose }) => {

  // 로그아웃
  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('로그아웃 실패:', error);
    }
  };

  // 회원탈퇴
  const handleDeleteAccount = async () => {
    const confirmed = window.confirm('정말 탈퇴하시겠습니까?\n이용하신 모든 정보가 삭제되며 복구할 수 없습니다.');
    if (!confirmed) return;

    try {
      const user = auth.currentUser;
      if (!user) return;

      // 1. Firestore users 컬렉션에서 데이터 삭제
      await deleteDoc(doc(db, 'users', user.uid));
      // 2. Firebase Auth에서 계정 삭제
      await deleteUser(user);

      alert('그동안 곁길을 이용해주셔서 감사합니다.\n회원탈퇴가 완료되었습니다.');
    } catch (error) {
      console.error('회원탈퇴 실패:', error);

      // 재인증(최근 로그인)이 필요한 경우 예외 처리
      if (error.code === 'auth/requires-recent-login') {
        alert('보안을 위해 다시 로그인한 직후에 탈퇴 처리가 가능합니다.');
        await signOut(auth); // 강제 로그아웃 시켜서 재로그인 유도
      }
    }
  };

  return (
    <section className="tab-page active" style={{ overflowY: 'auto', backgroundColor: '#fff', height: '100%', position: 'relative' }}>
      
      {/* 🚨 [NEW] 상단 앱바 헤더 (뒤로가기 지원) */}
      <div style={{ position: 'sticky', top: 0, backgroundColor: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(8px)', zIndex: 10, padding: '16px 20px', borderBottom: '1px solid #F1F3F5', display: 'flex', alignItems: 'center' }}>
        {onClose && (
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', color: '#1A1A1A', cursor: 'pointer', marginRight: '16px' }}>
            <i className="fas fa-arrow-left"></i>
          </button>
        )}
        <span style={{ fontWeight: '800', fontSize: '18px', color: '#1A1A1A' }}>설정</span>
      </div>

      <div style={{ padding: '24px 20px' }}>
        
        {/* 계정 관리 섹션 */}
        <h3 style={{ fontSize: '13px', color: '#ADB5BD', fontWeight: 'bold', marginBottom: '8px', paddingLeft: '8px' }}>계정 관리</h3>
        <div style={{ background: '#f8f9fa', borderRadius: '16px', overflow: 'hidden', marginBottom: '24px' }}>
          
          {/* 로그아웃 버튼 */}
          <button
            onClick={handleLogout}
            style={{
              width: '100%', border: 'none', background: 'transparent',
              padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              cursor: 'pointer', fontSize: '15px', fontWeight: 'bold', color: '#1A1A1A',
              borderBottom: '1px solid #e9ecef', transition: 'background 0.2s'
            }}
            onMouseOver={(e) => e.target.style.background = '#f1f3f5'}
            onMouseOut={(e) => e.target.style.background = 'transparent'}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <i className="fas fa-sign-out-alt" style={{ color: '#ADB5BD', width: '20px' }}></i>
              <span>로그아웃</span>
            </div>
            <i className="fas fa-chevron-right" style={{ color: '#DEE2E6', fontSize: '14px' }}></i>
          </button>

          {/* 회원탈퇴 버튼 */}
          <button
            onClick={handleDeleteAccount}
            style={{
              width: '100%', border: 'none', background: 'transparent',
              padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              cursor: 'pointer', fontSize: '15px', fontWeight: 'bold', color: '#e63946',
              transition: 'background 0.2s'
            }}
            onMouseOver={(e) => e.target.style.background = '#ffe3e3'}
            onMouseOut={(e) => e.target.style.background = 'transparent'}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <i className="fas fa-user-slash" style={{ color: '#e63946', width: '20px' }}></i>
              <span>회원탈퇴</span>
            </div>
            <i className="fas fa-chevron-right" style={{ color: '#DEE2E6', fontSize: '14px' }}></i>
          </button>
        </div>

        {/* 앱 정보 섹션 */}
        <h3 style={{ fontSize: '13px', color: '#ADB5BD', fontWeight: 'bold', marginBottom: '8px', paddingLeft: '8px' }}>앱 정보</h3>
        <div style={{ background: '#f8f9fa', borderRadius: '16px', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '15px', fontWeight: 'bold', color: '#1A1A1A', borderBottom: '1px solid #e9ecef' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <i className="fas fa-info-circle" style={{ color: '#ADB5BD', width: '20px' }}></i>
              <span>버전 정보</span>
            </div>
            <span style={{ color: '#ADB5BD', fontSize: '14px' }}>v1.0.0</span>
          </div>
          <button style={{ width: '100%', border: 'none', background: 'transparent', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', fontSize: '15px', fontWeight: 'bold', color: '#1A1A1A' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <i className="fas fa-file-alt" style={{ color: '#ADB5BD', width: '20px' }}></i>
              <span>이용약관 및 개인정보처리방침</span>
            </div>
            <i className="fas fa-chevron-right" style={{ color: '#DEE2E6', fontSize: '14px' }}></i>
          </button>
        </div>

      </div>
    </section>
  );
};

export default SettingsPage;