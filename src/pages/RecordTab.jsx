import { Fragment, useState, useRef, useEffect, useCallback } from 'react';
import exifr from 'exifr';
import heic2any from 'heic2any';
import RouteMap from '../components/RouteMap';
import { collection, addDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import imageCompression from 'browser-image-compression';
import { extractRegionsFromRoute, getDistanceFromLatLonInKm, showToast } from '../data';

const DRAFTS_KEY = 'gyeolkil_drafts';
const DEFAULT_COORDS = { lat: 37.5665, lng: 126.978 }; // 위치 정보를 못 찾았을 때(서울시청)
const CLUSTER_RADIUS_KM = 0.08; // 80m 이내면 같은 장소로 묶는다
const WALK_THRESHOLD_KM = 3; // 이보다 가까우면 도보 경로로 계산

const readDrafts = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(DRAFTS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

/**
 * 두 지점 사이의 실제 경로를 가져온다.
 * API 키는 브라우저에 두지 않고 개발 서버의 /api/route/* 프록시가 주입한다.
 * (정적 배포처럼 프록시가 없는 환경에서는 null 을 돌려주고 직선으로 대체된다.)
 */
const fetchRouteBetween = async (start, end) => {
  const distKm = getDistanceFromLatLonInKm(start.lat, start.lng, end.lat, end.lng);
  const preferWalk = start.transitType ? start.transitType === 'walk' : distKm < WALK_THRESHOLD_KM;

  try {
    if (preferWalk) {
      const res = await fetch('/api/route/pedestrian', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startX: start.lng,
          startY: start.lat,
          endX: end.lng,
          endY: end.lat,
          reqCoordType: 'WGS84GEO',
          resCoordType: 'WGS84GEO',
          startName: '출발',
          endName: '도착'
        })
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data?.features ? { type: 'walk', data } : null;
    }

    const res = await fetch(`/api/route/car?origin=${start.lng},${start.lat}&destination=${end.lng},${end.lat}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data?.routes?.[0]?.sections ? { type: 'car', data } : null;
  } catch {
    return null;
  }
};

const RecordTab = ({ currentUser, onPublish }) => {
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [companion, setCompanion] = useState('');
  const [tags, setTags] = useState('');
  const [spots, setSpots] = useState([]);

  // localStorage 읽기는 최초 렌더 때 한 번만 하면 되므로 초기값으로 넣는다.
  const [drafts, setDrafts] = useState(readDrafts);
  const [showDraftsPanel, setShowDraftsPanel] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState('');

  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);
  const dragItem = useRef(null);
  const dragOverItem = useRef(null);
  // 미리보기용 objectURL 을 모아 두었다가 언마운트 때 해제 (메모리 누수 방지)
  const objectUrlsRef = useRef([]);

  useEffect(
    () => () => {
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlsRef.current = [];
    },
    []
  );

  const createPreviewUrl = useCallback((file) => {
    const url = URL.createObjectURL(file);
    objectUrlsRef.current.push(url);
    return url;
  }, []);

  const handleSaveDraft = () => {
    if (!title.trim() && spots.length === 0) {
      showToast('저장할 내용이 없습니다.', 'error');
      return;
    }

    // File 객체는 JSON 으로 저장할 수 없으므로 제외한다.
    const draftSpots = spots.map(({ file, photo, ...rest }) => rest);
    const newDraft = {
      id: `draft_${Date.now()}`,
      title,
      body,
      companion,
      tags,
      spots: draftSpots,
      savedAt: Date.now()
    };

    const next = [newDraft, ...readDrafts()].slice(0, 20);
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(next));
    setDrafts(next);
    showToast('작성 중인 내용을 기기에 임시저장했습니다. 💾', 'success');
  };

  const handleDeleteDraft = (draftId) => {
    const next = readDrafts().filter((d) => d.id !== draftId);
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(next));
    setDrafts(next);
  };

  const handleCameraUpload = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 같은 파일을 다시 골라도 인식되도록 초기화
    if (!file) return;

    const addSpot = (lat, lng) => {
      setSpots((prev) => [
        ...prev,
        {
          name: `장소 ${prev.length + 1}`,
          lat,
          lng,
          photo: createPreviewUrl(file),
          file,
          color: '#52B788',
          timestamp: Date.now()
        }
      ]);
      setStep(2);
    };

    if (!navigator.geolocation) {
      addSpot(DEFAULT_COORDS.lat, DEFAULT_COORDS.lng);
      return;
    }

    showToast('현재 위치를 찾고 있습니다... 📡');
    navigator.geolocation.getCurrentPosition(
      (position) => addSpot(position.coords.latitude, position.coords.longitude),
      () => {
        showToast('위치를 찾지 못해 기본 좌표로 저장합니다.', 'error');
        addSpot(DEFAULT_COORDS.lat, DEFAULT_COORDS.lng);
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
  };

  const handleGalleryUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;

    setIsAnalyzing(true);
    const newSpots = [];

    for (let i = 0; i < files.length; i += 1) {
      let file = files[i];
      setProgress(`사진 분석 중... (${i + 1}/${files.length})`);

      try {
        // 아이폰 HEIC 는 브라우저가 못 읽으므로 JPEG 로 변환
        if (file.name.toLowerCase().endsWith('.heic') || file.type === 'image/heic') {
          const convertedBlob = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.8 });
          const blobArray = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
          file = new File([blobArray], file.name.replace(/\.heic$/i, '.jpg'), { type: 'image/jpeg' });
        }

        // EXIF 에서 촬영 위치·시각을 뽑아 경로를 자동 복원한다.
        const exifData = await exifr.parse(file);
        newSpots.push({
          name: `장소 ${spots.length + i + 1}`,
          lat: exifData?.latitude ?? DEFAULT_COORDS.lat,
          lng: exifData?.longitude ?? DEFAULT_COORDS.lng,
          hasGps: Boolean(exifData?.latitude && exifData?.longitude),
          photo: createPreviewUrl(file),
          file,
          timestamp: exifData?.DateTimeOriginal ? new Date(exifData.DateTimeOriginal).getTime() : file.lastModified
        });
      } catch (error) {
        console.warn('EXIF 분석 실패, 기본값으로 대체:', error);
        newSpots.push({
          name: `장소 ${spots.length + i + 1}`,
          lat: DEFAULT_COORDS.lat,
          lng: DEFAULT_COORDS.lng,
          hasGps: false,
          photo: createPreviewUrl(file),
          file,
          timestamp: file.lastModified
        });
      }
    }

    // 촬영 시각 순으로 정렬 → 실제 이동 순서가 된다.
    const allSpots = [...spots, ...newSpots].sort((a, b) => a.timestamp - b.timestamp);

    // 가까운 좌표는 같은 장소로 묶어 지도에 핀이 중복으로 찍히지 않게 한다.
    for (let i = 1; i < allSpots.length; i += 1) {
      const d = getDistanceFromLatLonInKm(allSpots[i - 1].lat, allSpots[i - 1].lng, allSpots[i].lat, allSpots[i].lng);
      if (d < CLUSTER_RADIUS_KM) {
        allSpots[i].lat = allSpots[i - 1].lat;
        allSpots[i].lng = allSpots[i - 1].lng;
      }
    }

    setSpots(allSpots.map((s, idx) => ({ ...s, name: s.name.startsWith('장소') ? `장소 ${idx + 1}` : s.name })));
    setStep(2);
    setIsAnalyzing(false);
    setProgress('');

    const noGpsCount = newSpots.filter((s) => !s.hasGps).length;
    if (noGpsCount > 0) {
      showToast(`${noGpsCount}장은 위치 정보가 없어 기본 좌표로 표시됩니다.`, 'error');
    }
  };

  const handleRemoveSpot = (indexToRemove) => setSpots(spots.filter((_, idx) => idx !== indexToRemove));

  const handleLoadDraft = (draft) => {
    setSpots(draft.spots || []);
    setTitle(draft.title || '');
    setBody(draft.body || '');
    setCompanion(draft.companion || '');
    setTags(draft.tags || '');
    setShowDraftsPanel(false);
    setStep(2);
  };

  const handleDragStart = (position) => {
    dragItem.current = position;
  };
  const handleDragEnter = (position) => {
    dragOverItem.current = position;
  };
  const handleDrop = () => {
    if (dragItem.current === null || dragOverItem.current === null) return;
    const copySpots = [...spots];
    const [moved] = copySpots.splice(dragItem.current, 1);
    copySpots.splice(dragOverItem.current, 0, moved);
    dragItem.current = null;
    dragOverItem.current = null;
    setSpots(copySpots);
  };

  const handlePublish = async () => {
    if (!title.trim()) {
      showToast('제목을 입력해주세요.', 'error');
      return;
    }
    if (spots.length === 0) {
      showToast('사진을 최소 1장 이상 추가해주세요.', 'error');
      return;
    }
    if (!currentUser) {
      showToast('로그인 정보가 없습니다. 다시 로그인해주세요.', 'error');
      return;
    }
    if (isPublishing) return;

    setIsPublishing(true);

    try {
      // 1. 이미지 압축 후 Storage 업로드
      setProgress('사진을 업로드하는 중...');
      const uploadedSpots = await Promise.all(
        spots.map(async (spot, index) => {
          if (!spot.file) return spot;

          const compressedFile = await imageCompression(spot.file, {
            maxSizeMB: 1,
            maxWidthOrHeight: 1920,
            useWebWorker: true
          });
          const fileRef = ref(storage, `posts/${currentUser.uid}/${Date.now()}_${index}`);
          await uploadBytes(fileRef, compressedFile);
          return { ...spot, photo: await getDownloadURL(fileRef) };
        })
      );

      // File 객체는 Firestore 에 저장할 수 없으므로 제거
      const spotsForDB = uploadedSpots.map(({ file, ...rest }) => rest);

      // 2. 지점 사이의 실제 이동 경로 복원 (실패하면 직선으로 대체)
      setProgress('이동 경로를 그리는 중...');
      const detailedPath = [];

      for (let i = 0; i < spotsForDB.length - 1; i += 1) {
        const start = spotsForDB[i];
        const end = spotsForDB[i + 1];

        const result = await fetchRouteBetween(start, end);

        if (result?.type === 'walk') {
          spotsForDB[i].travelTimeToNext = Math.ceil((result.data.features[0]?.properties?.totalTime || 0) / 60);
          spotsForDB[i].transitType = 'walk';
          result.data.features.forEach((feature) => {
            if (feature.geometry.type === 'LineString') {
              feature.geometry.coordinates.forEach((coord) => detailedPath.push({ lng: coord[0], lat: coord[1] }));
            } else if (feature.geometry.type === 'Point') {
              detailedPath.push({ lng: feature.geometry.coordinates[0], lat: feature.geometry.coordinates[1] });
            }
          });
        } else if (result?.type === 'car') {
          spotsForDB[i].travelTimeToNext = Math.ceil((result.data.routes[0].summary?.duration || 0) / 60);
          spotsForDB[i].transitType = 'car';
          result.data.routes[0].sections.forEach((section) => {
            section?.roads?.forEach((road) => {
              const vertexes = road.vertexes || [];
              for (let j = 0; j < vertexes.length; j += 2) {
                detailedPath.push({ lng: vertexes[j], lat: vertexes[j + 1] });
              }
            });
          });
        } else {
          // 경로 API 를 쓸 수 없으면 두 점을 직선으로 잇는다.
          const distKm = getDistanceFromLatLonInKm(start.lat, start.lng, end.lat, end.lng);
          const isCar = start.transitType ? start.transitType === 'car' : distKm >= WALK_THRESHOLD_KM;
          spotsForDB[i].transitType = isCar ? 'car' : 'walk';
          spotsForDB[i].travelTimeToNext = Math.max(1, Math.ceil((distKm / (isCar ? 40 : 4)) * 60));
          detailedPath.push({ lat: start.lat, lng: start.lng }, { lat: end.lat, lng: end.lng });
        }
      }

      // 3. 좌표로부터 지역을 추론해 저장 (예전에는 무조건 'seoul' 로 넣었다)
      const regions = extractRegionsFromRoute(spotsForDB);

      setProgress('여정을 등록하는 중...');
      await addDoc(collection(db, 'posts'), {
        userId: currentUser.uid,
        authorName: currentUser.displayName || '여행자',
        authorAvatar: currentUser.photoURL || '',
        title: title.trim(),
        body: body.trim(),
        companion,
        tags: tags.split(',').map((tag) => tag.trim().replace(/^#/, '')).filter(Boolean),
        regions,
        region: regions[0] || null,
        createdAt: Date.now(),
        likes: 0,
        comments: 0,
        saves: 0,
        route: spotsForDB,
        detailedPath,
        likedBy: [],
        savedBy: [],
        commentedUserIds: []
      });

      showToast('여정이 성공적으로 등록되었습니다! 🎉', 'success');
      setStep(1);
      setTitle('');
      setBody('');
      setCompanion('');
      setTags('');
      setSpots([]);
      if (onPublish) onPublish();
    } catch (error) {
      console.error('게시 오류:', error);
      showToast('업로드 중 문제가 발생했습니다. 다시 시도해주세요.', 'error');
    } finally {
      setIsPublishing(false);
      setProgress('');
    }
  };

  const isBusy = isPublishing || isAnalyzing;

  return (
    <section className="tab-page active" style={{ overflowY: 'auto' }}>
      <div className="record-page" style={{ paddingBottom: '90px' }}>
        <input type="file" accept="image/*" capture="environment" ref={cameraInputRef} style={{ display: 'none' }} onChange={handleCameraUpload} />
        <input type="file" multiple accept="image/*,.heic" ref={galleryInputRef} style={{ display: 'none' }} onChange={handleGalleryUpload} />

        {/* 진행 상태 오버레이 */}
        {isBusy && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(255,255,255,0.86)',
              zIndex: 500,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '14px'
            }}
          >
            <i className="fas fa-compass fa-spin" style={{ fontSize: '32px', color: '#52B788' }}></i>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#2D6A4F' }}>
              {progress || '사진을 분석하는 중...'}
            </div>
          </div>
        )}

        {showDraftsPanel ? (
          <div className="drafts-panel">
            <h3 className="step-title">📝 임시 저장 목록</h3>
            {drafts.length === 0 ? (
              <div className="empty-state">
                <p>임시 저장된 기록이 없어요</p>
              </div>
            ) : (
              drafts.map((d) => (
                <div key={d.id} className="draft-item" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => handleLoadDraft(d)}
                    onKeyDown={(e) => e.key === 'Enter' && handleLoadDraft(d)}
                    style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, cursor: 'pointer' }}
                  >
                    <div
                      className="draft-thumb"
                      style={{ background: 'var(--primary-bg, #EBFBEE)', fontSize: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      📝
                    </div>
                    <div className="draft-info">
                      <div className="draft-title">{d.title || '(제목 없음)'}</div>
                      <div className="draft-meta">{d.spots?.length || 0}개 장소</div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteDraft(d.id)}
                    aria-label="임시저장 삭제"
                    style={{ background: 'none', border: 'none', color: '#e63946', cursor: 'pointer', padding: '8px' }}
                  >
                    <i className="fas fa-trash-alt"></i>
                  </button>
                </div>
              ))
            )}
            <button className="step-back-btn" onClick={() => setShowDraftsPanel(false)}>뒤로</button>
          </div>
        ) : (
          <>
            {step === 1 && (
              <div className="record-step">
                <div className="record-hero">
                  <div className="record-hero-icon">📷</div>
                  <h2>여행을 기록하세요</h2>
                  <p style={{ fontSize: '13px', color: '#868E96', marginTop: '8px' }}>
                    사진 속 촬영 시각과 위치로 여행 경로를 자동으로 그려드려요.
                  </p>
                </div>
                <h3 className="step-title">어떻게 기록할까요?</h3>
                <div className="record-options">
                  <button className="record-option-btn" onClick={() => cameraInputRef.current?.click()}>
                    <div className="opt-icon">📸</div>
                    <div className="opt-label">지금 촬영</div>
                  </button>
                  <button className="record-option-btn" onClick={() => galleryInputRef.current?.click()}>
                    <div className="opt-icon">🖼️</div>
                    <div className="opt-label">갤러리 선택</div>
                  </button>
                  <button className="record-option-btn" onClick={() => setShowDraftsPanel(true)}>
                    <div className="opt-icon">📝</div>
                    <div className="opt-label">임시저장 열기{drafts.length > 0 ? ` (${drafts.length})` : ''}</div>
                  </button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="record-step">
                <h3 className="step-title">📍 장소 순서와 체류시간 확인</h3>
                <div style={{ marginBottom: '16px' }}>
                  <RouteMap route={spots} height="180px" />
                </div>

                <div className="photo-spots">
                  {spots.map((spot, i) => {
                    let routeConnectionUI = null;

                    if (i < spots.length - 1) {
                      const nextSpot = spots[i + 1];
                      const distKm = getDistanceFromLatLonInKm(spot.lat, spot.lng, nextSpot.lat, nextSpot.lng);
                      const timeDiffMins = Math.round(Math.abs(nextSpot.timestamp - spot.timestamp) / 60000);

                      // 사용자가 직접 고른 이동수단이 있으면 그것을 우선한다.
                      const speedKmH = distKm / (timeDiffMins / 60 || 1);
                      const guessedType = speedKmH > 10 || distKm > WALK_THRESHOLD_KM ? 'car' : 'walk';
                      const transitType = spot.transitType || guessedType;

                      const estTravelTime = Math.max(
                        1,
                        Math.ceil((distKm / (transitType === 'car' ? 40 : 4)) * 60)
                      );
                      const stayTime = Math.max(0, timeDiffMins - estTravelTime);

                      routeConnectionUI = (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '4px 0 8px' }}>
                          <div style={{ width: '2px', height: '16px', background: '#ccc' }}></div>
                          <div
                            style={{
                              display: 'flex',
                              gap: '8px',
                              alignItems: 'center',
                              background: '#f8f9fa',
                              padding: '8px 12px',
                              borderRadius: '20px',
                              border: '1px solid #eee',
                              fontSize: '12px'
                            }}
                          >
                            <select
                              aria-label={`${i + 1}번째 구간 이동수단`}
                              value={transitType}
                              onChange={(e) => {
                                const updated = [...spots];
                                updated[i] = { ...updated[i], transitType: e.target.value };
                                setSpots(updated);
                              }}
                              style={{ border: 'none', background: 'transparent', fontWeight: 'bold', color: '#52B788', outline: 'none', cursor: 'pointer' }}
                            >
                              <option value="walk">🚶 도보 (예상 {Math.ceil((distKm / 4) * 60)}분)</option>
                              <option value="car">🚗 차/대중교통 (예상 {Math.max(1, Math.ceil((distKm / 40) * 60))}분)</option>
                            </select>
                            <span style={{ color: '#ccc' }}>|</span>
                            <span style={{ color: 'var(--text-sub, #868E96)' }}>
                              ☕ <strong>약 {stayTime}분</strong> 머무름
                            </span>
                          </div>
                          <div style={{ width: '2px', height: '16px', background: '#ccc' }}></div>
                        </div>
                      );
                    }

                    return (
                      <Fragment key={`${spot.photo}-${i}`}>
                        <div
                          className="spot-item"
                          draggable
                          onDragStart={() => handleDragStart(i)}
                          onDragEnter={() => handleDragEnter(i)}
                          onDragEnd={handleDrop}
                          onDragOver={(e) => e.preventDefault()}
                          style={{ cursor: 'grab', display: 'flex', alignItems: 'center', backgroundColor: '#fff' }}
                        >
                          <div className="spot-num">{i + 1}</div>
                          <img src={spot.photo} alt="" className="spot-thumb" />
                          <div className="spot-info" style={{ flex: 1, minWidth: 0 }}>
                            <input
                              className="spot-location"
                              value={spot.name}
                              aria-label={`${i + 1}번째 장소 이름`}
                              placeholder="이곳의 이름을 적어주세요"
                              onChange={(e) => {
                                const updated = [...spots];
                                updated[i] = { ...updated[i], name: e.target.value };
                                setSpots(updated);
                              }}
                              style={{
                                border: 'none',
                                background: 'transparent',
                                width: '100%',
                                outline: 'none',
                                fontSize: '15px',
                                fontWeight: '800',
                                color: 'var(--primary, #2D6A4F)',
                                borderBottom: '1px dashed #ccc'
                              }}
                            />
                            <div className="spot-coords" style={{ fontSize: '11px', color: '#868E96', marginTop: '4px' }}>
                              📍 {spot.lat?.toFixed(4)}, {spot.lng?.toFixed(4)}
                              {spot.hasGps === false && <span style={{ color: '#e8590c' }}> · 위치 정보 없음</span>}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '0 10px' }}>
                            <button
                              onClick={() => handleRemoveSpot(i)}
                              style={{ background: 'none', border: 'none', color: '#e63946', cursor: 'pointer', padding: '5px', fontSize: '16px' }}
                              title="삭제하기"
                              aria-label={`${i + 1}번째 장소 삭제`}
                            >
                              <i className="fas fa-trash-alt"></i>
                            </button>
                            <div style={{ color: '#adb5bd', cursor: 'grab', padding: '5px', fontSize: '16px' }}>
                              <i className="fas fa-bars"></i>
                            </div>
                          </div>
                        </div>
                        {routeConnectionUI}
                      </Fragment>
                    );
                  })}
                </div>

                <div style={{ display: 'flex', gap: '10px', marginTop: '16px', marginBottom: '24px' }}>
                  <button
                    onClick={() => cameraInputRef.current?.click()}
                    style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px dashed #52B788', background: '#edf7ee', color: '#2D6A4F', fontWeight: 'bold', cursor: 'pointer' }}
                  >
                    <i className="fas fa-camera"></i> + 카메라
                  </button>
                  <button
                    onClick={() => galleryInputRef.current?.click()}
                    style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px dashed #52B788', background: '#edf7ee', color: '#2D6A4F', fontWeight: 'bold', cursor: 'pointer' }}
                  >
                    <i className="fas fa-image"></i> + 갤러리
                  </button>
                </div>

                <div className="step-actions" style={{ display: 'flex', gap: '10px' }}>
                  <button className="step-back-btn" onClick={() => setStep(1)}>이전</button>
                  <button
                    onClick={handleSaveDraft}
                    style={{ flex: 1, padding: '14px', borderRadius: '12px', border: '1px solid #ccc', background: '#fff', color: '#666', fontWeight: 'bold', cursor: 'pointer' }}
                  >
                    💾 임시저장
                  </button>
                  <button className="step-next-btn" onClick={() => setStep(3)} disabled={spots.length === 0}>
                    다음
                  </button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="record-step">
                <h3 className="step-title">✍️ 여행 이야기를 써주세요</h3>
                <div className="write-form" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="게시물 제목 (예: 성수동 감성 코스)"
                    value={title}
                    maxLength={60}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                  <select
                    className="form-input"
                    aria-label="동행 유형"
                    style={{ backgroundColor: '#f8f9fa' }}
                    value={companion}
                    onChange={(e) => setCompanion(e.target.value)}
                  >
                    <option value="">누구와 함께한 여행인가요?</option>
                    <option value="solo">🚶 나홀로 여행</option>
                    <option value="friends">👯 친구와 함께</option>
                    <option value="couple">💑 연인과 함께</option>
                    <option value="family">👨‍👩‍👧‍👦 가족과 함께</option>
                  </select>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '12px', top: '14px', color: '#52B788', fontWeight: 'bold' }}>#</span>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="태그 입력 (쉼표로 구분)"
                      style={{ paddingLeft: '28px' }}
                      value={tags}
                      onChange={(e) => setTags(e.target.value)}
                    />
                  </div>
                  <textarea
                    className="form-textarea"
                    placeholder="어떤 여행이었나요? 코스의 꿀팁이나 감상을 자유롭게 적어주세요!"
                    rows="6"
                    value={body}
                    maxLength={2000}
                    onChange={(e) => setBody(e.target.value)}
                  />
                </div>

                <div className="step-actions" style={{ marginTop: '24px', display: 'flex', gap: '10px' }}>
                  <button className="step-back-btn" onClick={() => setStep(2)} disabled={isPublishing}>이전</button>
                  <button
                    onClick={handleSaveDraft}
                    disabled={isPublishing}
                    style={{ flex: 1, padding: '14px', borderRadius: '12px', border: '1px solid #ccc', background: '#fff', color: '#666', fontWeight: 'bold', cursor: 'pointer' }}
                  >
                    💾 임시저장
                  </button>
                  <button className="publish-btn" onClick={handlePublish} disabled={isPublishing}>
                    {isPublishing ? '☁️ 올리는 중...' : '게시하기'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
};

export default RecordTab;
