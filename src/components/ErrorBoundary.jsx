import { Component } from 'react';

/**
 * 예기치 못한 렌더링 오류가 났을 때 흰 화면 대신 안내 화면을 보여준다.
 * (React 에서 에러 경계는 아직 클래스 컴포넌트로만 만들 수 있다.)
 */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[곁길] 렌더링 오류:', error, info?.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '14px',
          padding: '40px 28px',
          textAlign: 'center',
          background: '#F8F9FA',
          color: '#1A1A1A'
        }}
      >
        <div style={{ fontSize: '48px' }}>🧭</div>
        <h1 style={{ fontSize: '20px', fontWeight: 800, margin: 0 }}>길을 잃었어요</h1>
        <p style={{ fontSize: '14px', color: '#495057', lineHeight: 1.6, margin: 0 }}>
          예상치 못한 오류가 발생했습니다.
          <br />
          새로고침하면 대부분 해결됩니다.
        </p>

        <button
          onClick={this.handleReload}
          style={{
            marginTop: '8px',
            padding: '14px 32px',
            borderRadius: '999px',
            border: 'none',
            background: '#52B788',
            color: '#fff',
            fontSize: '15px',
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 6px 18px rgba(82,183,136,0.35)'
          }}
        >
          다시 시도하기
        </button>

        {import.meta.env.DEV && (
          <pre
            style={{
              marginTop: '20px',
              maxWidth: '100%',
              overflowX: 'auto',
              textAlign: 'left',
              fontSize: '12px',
              color: '#e03131',
              background: '#fff',
              border: '1px solid #ffc9c9',
              borderRadius: '12px',
              padding: '14px'
            }}
          >
            {String(error?.stack || error)}
          </pre>
        )}
      </div>
    );
  }
}

export default ErrorBoundary;
