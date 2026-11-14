import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import RouteMap from '../components/RouteMap';
import {
  REGION_LABELS,
  extractRegionsFromRoute,
  formatDateLabel,
  getDistanceFromLatLonInKm,
  getTimestampValue,
  toCoordinate
} from '../data';

/**
 * 내 발자취 — 내가 올린 모든 여정을 지도 한 장과 타임라인으로 되짚어 본다.
 * (예전에는 하드코딩된 샘플 데이터를 보여줬지만, 이제 Firestore 의 실제 기록을 쓴다.)
 */
const FootprintTab = ({ currentUser, onOpenModal, onClose }) => {
  const [posts, setPosts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) return undefined;

    const q = query(collection(db, 'posts'), where('userId', '==', currentUser.uid));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const arr = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
        arr.sort((a, b) => getTimestampValue(b.createdAt) - getTimestampValue(a.createdAt));
        setPosts(arr);
        setIsLoading(false);
      },
      (error) => {
        console.error('발자취 로드 실패:', error);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [currentUser]);

  // 통계: 방문 장소 수, 여행 루트 수, 지역 수, 총 이동 거리
  const stats = useMemo(() => {
    let places = 0;
    let distanceKm = 0;
    const regions = new Set();

    posts.forEach((post) => {
      const route = Array.isArray(post.route) ? post.route : [];
      places += route.length;
      extractRegionsFromRoute(route).forEach((r) => regions.add(r));

      for (let i = 0; i < route.length - 1; i += 1) {
        const d = getDistanceFromLatLonInKm(route[i].lat, route[i].lng, route[i + 1].lat, route[i + 1].lng);
        if (Number.isFinite(d)) distanceKm += d;
      }
    });

    return { places, routes: posts.length, regions: [...regions], distanceKm };
  }, [posts]);

  // 지도에 찍을 전체 발자취 (모든 여정의 좌표를 하나로 합친다)
  const allSpots = useMemo(
    () =>
      posts
        .flatMap((post) => (Array.isArray(post.route) ? post.route : []))
        .filter((spot) => toCoordinate(spot?.lat) !== null && toCoordinate(spot?.lng) !== null),
    [posts]
  );

  const isEmpty = !isLoading && posts.length === 0;

  return (
    <section className="tab-page active" style={{ overflowY: 'auto', backgroundColor: '#fff', height: '100%' }}>
      {/* 상단 헤더 (뒤로가기) */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          backgroundColor: 'rgba(255,255,255,0.92)',
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
        <span style={{ fontWeight: '800', fontSize: '18px', color: '#1A1A1A' }}>내 발자취</span>
      </div>

      <div className="footprint-page" style={{ paddingBottom: '90px' }}>
        <div style={{ padding: '20px 20px 8px' }}>
          <p style={{ margin: 0, fontSize: '14px', color: '#868E96' }}>여행했던 모든 순간이 여기 남아있어요</p>
        </div>

        {/* 통계 */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '8px',
            margin: '12px 20px 20px',
            padding: '16px 8px',
            background: '#F8FFF9',
            border: '1px solid #E6F4EA',
            borderRadius: '16px'
          }}
        >
          {[
            { value: stats.places, label: '방문 장소' },
            { value: stats.routes, label: '여행 루트' },
            { value: stats.regions.length, label: '지역' },
            { value: `${stats.distanceKm.toFixed(1)}km`, label: '이동 거리' }
          ].map((item) => (
            <div key={item.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '17px', fontWeight: 800, color: '#2D6A4F' }}>{item.value}</div>
              <div style={{ fontSize: '11px', color: '#868E96', marginTop: '2px' }}>{item.label}</div>
            </div>
          ))}
        </div>

        {/* 전체 발자취 지도 */}
        <div style={{ margin: '0 20px 12px' }}>
          {allSpots.length > 0 ? (
            <RouteMap route={allSpots} height="220px" />
          ) : (
            <div
              style={{
                height: '220px',
                background: '#F1F3F5',
                borderRadius: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ADB5BD',
                fontSize: '13px'
              }}
            >
              🗺️ 아직 지도에 찍힌 발자취가 없어요
            </div>
          )}
        </div>

        {/* 방문한 지역 배지 */}
        {stats.regions.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', padding: '0 20px 20px' }}>
            {stats.regions.map((region) => (
              <span
                key={region}
                style={{
                  padding: '5px 12px',
                  borderRadius: '999px',
                  background: '#EBFBEE',
                  color: '#2B8A3E',
                  fontSize: '12px',
                  fontWeight: 700
                }}
              >
                📍 {REGION_LABELS[region] || region}
              </span>
            ))}
          </div>
        )}

        {/* 타임라인 */}
        <div className="footprint-timeline">
          <h3 style={{ padding: '0 20px', fontSize: '16px', fontWeight: 800, color: '#1A1A1A', marginBottom: '14px' }}>
            🗓 여행 타임라인
          </h3>

          {isLoading ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: '#ADB5BD', fontSize: '14px' }}>
              발자취를 불러오는 중... 🧭
            </div>
          ) : isEmpty ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: '#868E96' }}>
              <div style={{ fontSize: '40px', marginBottom: '16px' }}>🏃</div>
              <p style={{ marginBottom: '8px', fontWeight: 'bold', color: '#2C2A29' }}>아직 다녀온 여행이 없어요!</p>
              <p style={{ fontSize: '14px', margin: 0 }}>
                하단 가운데 <strong>카메라</strong> 버튼을 눌러 첫 여정을 기록해보세요.
              </p>
            </div>
          ) : (
            <div style={{ padding: '0 20px' }}>
              {posts.map((post, idx) => {
                const route = Array.isArray(post.route) ? post.route : [];
                const places = route.map((spot) => spot?.name).filter(Boolean);

                return (
                  <div key={post.id} className="timeline-item" style={{ display: 'flex', gap: '14px' }}>
                    <div className="timeline-dot-col" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <div
                        className="timeline-dot"
                        style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#52B788', marginTop: '6px', flexShrink: 0 }}
                      ></div>
                      {idx !== posts.length - 1 && (
                        <div className="timeline-line" style={{ flex: 1, width: '2px', background: '#E6F4EA', margin: '4px 0' }}></div>
                      )}
                    </div>

                    <div
                      className="timeline-content"
                      role="button"
                      tabIndex={0}
                      onClick={() => onOpenModal && onOpenModal(post.id)}
                      onKeyDown={(e) => e.key === 'Enter' && onOpenModal && onOpenModal(post.id)}
                      style={{ flex: 1, paddingBottom: '22px', cursor: onOpenModal ? 'pointer' : 'default' }}
                    >
                      <div style={{ fontSize: '12px', color: '#868E96', marginBottom: '4px' }}>
                        {formatDateLabel(post.createdAt)}
                      </div>
                      <div style={{ fontSize: '15px', fontWeight: 800, color: '#1A1A1A', marginBottom: '8px' }}>
                        {post.title || '제목 없는 여행기'}
                      </div>

                      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px' }}>
                        {places.length === 0 ? (
                          <span style={{ fontSize: '12px', color: '#ADB5BD' }}>기록된 장소 없음</span>
                        ) : (
                          places.map((place, i) => (
                            <span key={`${post.id}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <span
                                className="route-place-chip"
                                style={{
                                  padding: '4px 10px',
                                  borderRadius: '999px',
                                  background: '#F1F3F5',
                                  color: '#495057',
                                  fontSize: '12px'
                                }}
                              >
                                {place}
                              </span>
                              {i < places.length - 1 && <span style={{ color: '#CED4DA' }}>›</span>}
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default FootprintTab;
