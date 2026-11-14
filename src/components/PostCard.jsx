import { useState } from 'react';
import RouteMap from './RouteMap';
import { FALLBACK_AVATAR, formatTime, getLikeCount } from '../data';

/**
 * 피드 카드 한 장.
 * 홈 탭과 발견 탭이 완전히 동일한 마크업을 각자 들고 있어서 하나로 합쳤다.
 * 사진이 없는 여정은 경로 지도를 대신 보여준다.
 */
const PostCard = ({ post, currentUserId, onOpenModal, onOpenUser, onToggleLike, onToggleSave }) => {
  const [photoIndex, setPhotoIndex] = useState(0);
  const [brokenPhotos, setBrokenPhotos] = useState({});

  const userName = post.authorName || '여행자';
  const userAvatar = post.authorAvatar || FALLBACK_AVATAR;
  const isLiked = !!currentUserId && post.likedBy?.includes(currentUserId);
  const isSaved = !!currentUserId && post.savedBy?.includes(currentUserId);

  // 깨진 이미지는 슬라이드에서 제외해 빈 칸이 생기지 않도록 한다.
  const photoSpots = (Array.isArray(post.route) ? post.route : []).filter(
    (spot, idx) => spot?.photo && !brokenPhotos[idx]
  );
  const hasPhotos = photoSpots.length > 0;

  const handleScroll = (e) => {
    const { scrollLeft, clientWidth } = e.currentTarget;
    if (clientWidth === 0) return;
    setPhotoIndex(Math.round(scrollLeft / clientWidth));
  };

  const openPost = () => onOpenModal && onOpenModal(post.id);

  return (
    <article
      className="post-card"
      onClick={openPost}
      style={{ backgroundColor: '#fff', marginBottom: '8px', cursor: 'pointer' }}
    >
      <header
        style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', gap: '12px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={userAvatar}
          alt=""
          onClick={() => onOpenUser && onOpenUser(post.userId)}
          onError={(e) => {
            e.currentTarget.src = FALLBACK_AVATAR;
          }}
          style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover', cursor: 'pointer' }}
        />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              role="button"
              tabIndex={0}
              onClick={() => onOpenUser && onOpenUser(post.userId)}
              onKeyDown={(e) => e.key === 'Enter' && onOpenUser && onOpenUser(post.userId)}
              style={{ fontWeight: 'bold', fontSize: '14px', color: '#1A1A1A', cursor: 'pointer' }}
            >
              {userName}
            </span>
            <span style={{ color: '#ADB5BD', fontSize: '12px' }}>• {formatTime(post.createdAt)}</span>
          </div>
          <div
            style={{
              fontSize: '12px',
              color: '#666',
              fontWeight: '500',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}
          >
            📍 {post.route?.[0]?.name || '위치 정보 없음'}
          </div>
        </div>
      </header>

      <div style={{ width: '100%', aspectRatio: '1 / 1', backgroundColor: '#F8F9FA', position: 'relative', overflow: 'hidden' }}>
        {hasPhotos ? (
          <>
            <div
              onScroll={handleScroll}
              className="photo-slider"
              style={{
                display: 'flex',
                width: '100%',
                height: '100%',
                overflowX: 'auto',
                scrollSnapType: 'x mandatory',
                scrollbarWidth: 'none',
                msOverflowStyle: 'none'
              }}
            >
              {photoSpots.map((spot, idx) => (
                <img
                  key={`${post.id}-${idx}`}
                  src={spot.photo}
                  alt={spot.name || `${idx + 1}번째 장소`}
                  loading="lazy"
                  onError={() => setBrokenPhotos((prev) => ({ ...prev, [idx]: true }))}
                  style={{ width: '100%', height: '100%', flexShrink: 0, objectFit: 'cover', scrollSnapAlign: 'start' }}
                />
              ))}
            </div>

            {photoSpots.length > 1 && (
              <div
                style={{
                  position: 'absolute',
                  top: '12px',
                  right: '12px',
                  backgroundColor: 'rgba(0,0,0,0.6)',
                  color: '#fff',
                  padding: '4px 10px',
                  borderRadius: '14px',
                  fontSize: '11px',
                  fontWeight: 'bold',
                  zIndex: 1
                }}
              >
                {Math.min(photoIndex + 1, photoSpots.length)} / {photoSpots.length}
              </div>
            )}
          </>
        ) : (
          <div style={{ width: '100%', height: '100%' }} onClick={(e) => e.stopPropagation()}>
            <RouteMap route={post.route} detailedPath={post.detailedPath} height="100%" />
          </div>
        )}
      </div>

      <div style={{ padding: '12px 16px' }}>
        <div
          style={{ display: 'flex', alignItems: 'center', gap: '16px', color: '#1A1A1A', marginBottom: '10px' }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={(e) => onToggleLike(e, post)}
            aria-label={isLiked ? '좋아요 취소' : '좋아요'}
            aria-pressed={isLiked}
            style={{ background: 'none', border: 'none', padding: 0, color: isLiked ? '#e63946' : '#1A1A1A', fontSize: '20px', cursor: 'pointer' }}
          >
            <i className={isLiked ? 'fas fa-heart' : 'far fa-heart'}></i>
          </button>

          <button
            onClick={openPost}
            aria-label="댓글 보기"
            style={{ background: 'none', border: 'none', padding: 0, color: '#1A1A1A', fontSize: '20px', cursor: 'pointer' }}
          >
            <i className="far fa-comment"></i>
          </button>

          <button
            onClick={(e) => onToggleSave(e, post)}
            aria-label={isSaved ? '저장 취소' : '저장'}
            aria-pressed={isSaved}
            style={{ background: 'none', border: 'none', padding: 0, color: '#1A1A1A', fontSize: '20px', cursor: 'pointer', marginLeft: 'auto' }}
          >
            <i className={isSaved ? 'fas fa-bookmark' : 'far fa-bookmark'}></i>
          </button>
        </div>

        <div style={{ fontWeight: 'bold', fontSize: '13px', color: '#1A1A1A', marginBottom: '6px' }}>
          좋아요 {getLikeCount(post)}개
        </div>
        <div style={{ fontWeight: '800', fontSize: '15px', color: '#1A1A1A', lineHeight: '1.3' }}>
          {post.title || '제목 없는 여행기'}
        </div>
        <div
          style={{
            fontSize: '13px',
            color: '#495057',
            marginTop: '4px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}
        >
          {post.body}
        </div>
      </div>

      <style>{`.photo-slider::-webkit-scrollbar { display: none; }`}</style>
    </article>
  );
};

export default PostCard;
