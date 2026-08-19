/**
 * Firebase 환경 변수가 비어 있을 때 보여주는 설정 안내 화면.
 * 이 상태에서는 로그인·데이터 로드가 전부 실패하므로,
 * 원인을 모른 채 빈 화면을 보는 대신 해결 방법을 알려준다.
 */
const SetupNotice = ({ missingKeys = [] }) => (
  <div
    style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '32px 20px',
      background: '#F8F9FA'
    }}
  >
    <div
      style={{
        width: '100%',
        maxWidth: '460px',
        background: '#fff',
        borderRadius: '20px',
        padding: '32px 28px',
        boxShadow: '0 10px 40px rgba(0,0,0,0.08)'
      }}
    >
      <div style={{ fontSize: '40px', marginBottom: '12px' }}>🔧</div>
      <h1 style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 10px', color: '#1A1A1A' }}>
        환경 설정이 필요합니다
      </h1>
      <p style={{ fontSize: '14px', color: '#495057', lineHeight: 1.7, margin: '0 0 20px' }}>
        Firebase 연결 정보가 비어 있어 곁길을 시작할 수 없습니다.
        프로젝트 루트의 <code style={{ background: '#F1F3F5', padding: '2px 6px', borderRadius: '6px' }}>.env.example</code>
        을 <code style={{ background: '#F1F3F5', padding: '2px 6px', borderRadius: '6px' }}>.env.local</code> 로 복사한 뒤
        값을 채우고 개발 서버를 다시 시작해 주세요.
      </p>

      <div style={{ background: '#FFF5F5', border: '1px solid #FFC9C9', borderRadius: '12px', padding: '14px 16px' }}>
        <div style={{ fontSize: '12px', fontWeight: 700, color: '#C92A2A', marginBottom: '8px' }}>
          비어 있는 값 {missingKeys.length}개
        </div>
        <ul style={{ margin: 0, paddingLeft: '18px', color: '#E03131', fontSize: '13px', lineHeight: 1.8 }}>
          {missingKeys.map((key) => (
            <li key={key}>
              <code>VITE_{key.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase().replace(/^_/, '')}</code>
            </li>
          ))}
        </ul>
      </div>

      <pre
        style={{
          marginTop: '18px',
          marginBottom: 0,
          background: '#1A1A1A',
          color: '#B7E4C7',
          borderRadius: '12px',
          padding: '14px 16px',
          fontSize: '12.5px',
          overflowX: 'auto'
        }}
      >
        cp .env.example .env.local{'\n'}npm run dev
      </pre>
    </div>
  </div>
);

export default SetupNotice;
