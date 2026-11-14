/**
 * 인스타그램 스타일 3열 썸네일 그리드.
 * 마이페이지와 타인 프로필에서 똑같은 마크업을 복사해 쓰던 것을 하나로 합쳤다.
 */
const PostGrid = ({ posts = [], onOpenModal, emptyMessage = '등록된 기록이 없습니다.' }) => {
  if (posts.length === 0) {
    return (
      <div style={{ padding: '60px 20px', textAlign: 'center', color: '#ADB5BD' }}>
        <div style={{ fontSize: '40px', marginBottom: '16px' }}>📭</div>
        <p style={{ fontSize: '14px', margin: 0 }}>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2px' }}>
      {posts.map((post) => {
        const photoSpots = (Array.isArray(post.route) ? post.route : []).filter((spot) => spot?.photo);
        const firstPhoto = photoSpots[0]?.photo || null;
        const title = post.title || '제목 없는 여행기';

        return (
          <div
            key={post.id}
            role="button"
            tabIndex={0}
            aria-label={title}
            onClick={() => onOpenModal && onOpenModal(post.id)}
            onKeyDown={(e) => e.key === 'Enter' && onOpenModal && onOpenModal(post.id)}
            style={{
              aspectRatio: '1 / 1',
              overflow: 'hidden',
              cursor: onOpenModal ? 'pointer' : 'default',
              position: 'relative',
              backgroundColor: '#F8F9FA'
            }}
          >
            {firstPhoto ? (
              <img src={firstPhoto} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '10px',
                  textAlign: 'center'
                }}
              >
                <span style={{ fontSize: '20px', marginBottom: '4px' }}>📍</span>
                {/* 제목이 15자보다 짧으면 말줄임표를 붙이지 않는다 */}
                <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#495057', wordBreak: 'keep-all' }}>
                  {title.length > 15 ? `${title.slice(0, 15)}…` : title}
                </span>
              </div>
            )}

            {photoSpots.length > 1 && (
              <div
                style={{
                  position: 'absolute',
                  top: '6px',
                  right: '6px',
                  color: '#fff',
                  fontSize: '12px',
                  textShadow: '0 1px 4px rgba(0,0,0,0.5)'
                }}
              >
                <i className="far fa-clone"></i>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default PostGrid;
