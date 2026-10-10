import { useState } from 'react';
import { signOut, deleteUser } from 'firebase/auth';
import { doc, deleteDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { showToast } from '../data';

const rowStyle = {
  width: '100%',
  border: 'none',
  background: 'transparent',
  padding: '16px 20px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  cursor: 'pointer',
  fontSize: '15px',
  fontWeight: 'bold',
  color: '#1A1A1A',
  transition: 'background 0.2s'
};

const SettingsPage = ({ onClose }) => {
  const [isPolicyOpen, setIsPolicyOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('로그아웃 실패:', error);
      showToast('로그아웃에 실패했습니다.', 'error');
    }
  };

  const handleDeleteAccount = async () => {
    const confirmed = window.confirm(
      '정말 탈퇴하시겠습니까?\n작성하신 여정과 프로필이 삭제되며 복구할 수 없습니다.'
    );
    if (!confirmed || isDeleting) return;

    const user = auth.currentUser;
    if (!user) return;

    setIsDeleting(true);
    try {
      // 1. Firestore users 문서 삭제
      await deleteDoc(doc(db, 'users', user.uid));
      // 2. Firebase Auth 계정 삭제
      await deleteUser(user);
      showToast('그동안 곁길을 이용해주셔서 감사합니다.', 'success');
    } catch (error) {
      console.error('회원탈퇴 실패:', error);

      // 민감한 작업이라 최근 로그인 상태를 요구한다.
      if (error.code === 'auth/requires-recent-login') {
        showToast('보안을 위해 다시 로그인한 뒤 탈퇴해 주세요.', 'error');
        await signOut(auth);
      } else {
        showToast('탈퇴 처리 중 오류가 발생했습니다.', 'error');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <section className="tab-page active" style={{ overflowY: 'auto', backgroundColor: '#fff', height: '100%', position: 'relative' }}>
      {/* 상단 앱바 */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          backgroundColor: 'rgba(255,255,255,0.9)',
          backdropFilter: 'blur(8px)',
          zIndex: 10,
          padding: '16px 20px',
          borderBottom: '1px solid #F1F3F5',
          display: 'flex',
          alignItems: 'center'
        }}
      >
        {onClose && (
          <button
            onClick={onClose}
            aria-label="뒤로 가기"
            style={{ background: 'none', border: 'none', fontSize: '20px', color: '#1A1A1A', cursor: 'pointer', marginRight: '16px' }}
          >
            <i className="fas fa-arrow-left"></i>
          </button>
        )}
        <span style={{ fontWeight: '800', fontSize: '18px', color: '#1A1A1A' }}>설정</span>
      </div>

      <div style={{ padding: '24px 20px 100px' }}>
        {/* 계정 관리 */}
        <h3 style={{ fontSize: '13px', color: '#ADB5BD', fontWeight: 'bold', marginBottom: '8px', paddingLeft: '8px' }}>계정 관리</h3>
        <div style={{ background: '#f8f9fa', borderRadius: '16px', overflow: 'hidden', marginBottom: '24px' }}>
          <button
            onClick={handleLogout}
            style={{ ...rowStyle, borderBottom: '1px solid #e9ecef' }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = '#f1f3f5';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <i className="fas fa-sign-out-alt" style={{ color: '#ADB5BD', width: '20px' }}></i>
              로그아웃
            </span>
            <i className="fas fa-chevron-right" style={{ color: '#DEE2E6', fontSize: '14px' }}></i>
          </button>

          <button
            onClick={handleDeleteAccount}
            disabled={isDeleting}
            style={{ ...rowStyle, color: '#e63946', cursor: isDeleting ? 'wait' : 'pointer' }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = '#ffe3e3';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <i className="fas fa-user-slash" style={{ color: '#e63946', width: '20px' }}></i>
              {isDeleting ? '탈퇴 처리 중...' : '회원탈퇴'}
            </span>
            <i className="fas fa-chevron-right" style={{ color: '#DEE2E6', fontSize: '14px' }}></i>
          </button>
        </div>

        {/* 앱 정보 */}
        <h3 style={{ fontSize: '13px', color: '#ADB5BD', fontWeight: 'bold', marginBottom: '8px', paddingLeft: '8px' }}>앱 정보</h3>
        <div style={{ background: '#f8f9fa', borderRadius: '16px', overflow: 'hidden' }}>
          <div style={{ ...rowStyle, cursor: 'default', borderBottom: '1px solid #e9ecef' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <i className="fas fa-info-circle" style={{ color: '#ADB5BD', width: '20px' }}></i>
              버전 정보
            </span>
            <span style={{ color: '#ADB5BD', fontSize: '14px', fontWeight: 400 }}>v1.0.0</span>
          </div>

          <button onClick={() => setIsPolicyOpen((prev) => !prev)} style={rowStyle} aria-expanded={isPolicyOpen}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <i className="fas fa-file-alt" style={{ color: '#ADB5BD', width: '20px' }}></i>
              이용약관 및 개인정보처리방침
            </span>
            <i className={`fas fa-chevron-${isPolicyOpen ? 'down' : 'right'}`} style={{ color: '#DEE2E6', fontSize: '14px' }}></i>
          </button>

          {isPolicyOpen && (
            <div style={{ padding: '4px 20px 20px', fontSize: '13px', color: '#495057', lineHeight: 1.7 }}>
              <p style={{ marginTop: 0 }}>
                <strong>수집하는 정보</strong>
                <br />
                구글 계정의 이름·이메일·프로필 사진, 회원님이 직접 올린 사진과 글, 사진에 포함된 촬영 위치(EXIF),
                그리고 &lsquo;내 주변&rsquo; 기능 사용 시의 현재 위치를 수집합니다.
              </p>
              <p>
                <strong>이용 목적</strong>
                <br />
                여행 경로 자동 복원, 지역별 여정 탐색, 주변 동행 추천에만 사용하며 제3자에게 제공하지 않습니다.
              </p>
              <p>
                <strong>보관 및 파기</strong>
                <br />
                회원 탈퇴 시 프로필 정보는 즉시 삭제됩니다. 위치 권한은 브라우저 설정에서 언제든 철회할 수 있습니다.
              </p>
              <p style={{ marginBottom: 0, color: '#868E96' }}>
                본 문서는 교내 학술제 출품용 시연 서비스 기준으로 작성되었습니다.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default SettingsPage;
