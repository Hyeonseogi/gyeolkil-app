import { Fragment, useState, useRef, useEffect, useCallback, useMemo } from 'react';
import exifr from 'exifr';
import heic2any from 'heic2any';
import RouteMap from '../components/RouteMap';
import LocationPicker from '../components/LocationPicker';
import { collection, addDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import imageCompression from 'browser-image-compression';
import {
  extractRegionsFromRoute,
  formatDuration,
  getDistanceFromLatLonInKm,
  getStayMinutes,
  groupRouteByPlace,
  hasLocation,
  isDefaultPlaceName,
  showToast
} from '../data';
import { reverseGeocode, reverseGeocodeAll } from '../geocode';
import {
  buildPreviewPath,
  estimateTravelMinutes,
  isWalkableDistance,
  loadRoute,
  peekRoute,
  resolveTransitMode
} from '../routing';
import { deleteDraft, listDrafts, putDraft } from '../draftStore';

const CLUSTER_RADIUS_KM = 0.08; // 80m 이내면 같은 장소로 묶는다
const DEFAULT_SPOT_NAME = /^장소 \d+$/;

const RecordTab = ({ currentUser, onPublish }) => {
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [companion, setCompanion] = useState('');
  const [tags, setTags] = useState('');
  const [spots, setSpots] = useState([]);

  const [drafts, setDrafts] = useState([]);
  // 지금 편집 중인 임시저장 — 다시 저장하면 새로 쌓지 않고 덮어쓴다.
  const [currentDraftId, setCurrentDraftId] = useState(null);
  // 장소 지정 창을 띄운 지점의 인덱스 (null 이면 닫힘)
  const [locatingIndex, setLocatingIndex] = useState(null);
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

  useEffect(() => {
    let cancelled = false;
    listDrafts()
      .then((list) => {
        if (!cancelled) setDrafts(list);
      })
      .catch((error) => console.warn('임시저장 목록을 불러오지 못했습니다:', error));
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSaveDraft = async () => {
    if (!title.trim() && spots.length === 0) {
      showToast('저장할 내용이 없습니다.', 'error');
      return;
    }

    // 사진(File)은 IndexedDB 에 그대로 저장하고, 미리보기용 blob: 주소는 불러올 때 다시 만든다.
    const draftSpots = spots.map(({ photo, ...rest }) => rest);
    const id = currentDraftId || `draft_${Date.now()}`;

    try {
      const next = await putDraft({ id, title, body, companion, tags, spots: draftSpots, savedAt: Date.now() });
      setDrafts(next);
      setCurrentDraftId(id);
      showToast('사진까지 함께 기기에 임시저장했습니다.', 'success');
    } catch (error) {
      console.error('임시저장 실패:', error);
      showToast('임시저장에 실패했습니다. 기기 저장 공간을 확인해주세요.', 'error');
    }
  };

  const handleDeleteDraft = async (draftId) => {
    try {
      setDrafts(await deleteDraft(draftId));
      if (draftId === currentDraftId) setCurrentDraftId(null);
    } catch (error) {
      console.error('임시저장 삭제 실패:', error);
      showToast('임시저장을 삭제하지 못했습니다.', 'error');
    }
  };

  /**
   * 좌표로 장소 이름과 시도를 찾아 한 지점에 채운다. (사진 파일로 지점을 식별한다)
   * 사용자가 이름을 직접 붙였으면 이름은 건드리지 않고 시도만 채운다.
   */
  const fillPlaceInfo = useCallback(async (file, lat, lng) => {
    const info = await reverseGeocode(lat, lng);
    if (!info) return;

    setSpots((prev) =>
      prev.map((spot) => {
        // 조회하는 사이에 위치를 다시 바꿨다면 늦게 온 결과는 버린다.
        if (spot.file !== file || spot.lat !== lat || spot.lng !== lng) return spot;
        const canRename = info.name && (isDefaultPlaceName(spot.name) || spot.autoNamed);
        return {
          ...spot,
          sido: info.sido,
          ...(canRename ? { name: info.name, autoNamed: true } : {})
        };
      })
    );
  }, []);

  // 2단계에서 구간별 실제 이동 시간을 미리 불러온다.
  // 결과는 routing 모듈이 기억하고(게시할 때 다시 쓴다), 여기서는 도착했다는 것만 알려 화면을 다시 그린다.
  const [routeTick, setRouteTick] = useState(0);

  // 지도 선도 받아 둔 실제 경로로 그린다. (경로가 도착할 때와 사진 순서가 바뀔 때만 다시 만든다)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const previewPath = useMemo(() => buildPreviewPath(spots), [spots, routeTick]);
  useEffect(() => {
    if (step !== 2) return undefined;

    let cancelled = false;
    for (let i = 0; i < spots.length - 1; i += 1) {
      const start = spots[i];
      const end = spots[i + 1];
      if (!hasLocation(start) || !hasLocation(end)) continue;
      if (start.lat === end.lat && start.lng === end.lng) continue; // 같은 장소 — 이동 없음

      const mode = resolveTransitMode(start, end);
      if (peekRoute(start, end, mode) !== undefined) continue; // 이미 받았거나 실패가 확인된 구간

      loadRoute(start, end, mode).then(() => {
        if (!cancelled) setRouteTick((n) => n + 1);
      });
    }

    return () => {
      cancelled = true;
    };
  }, [spots, step]);

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
          hasGps: lat !== null,
          photo: createPreviewUrl(file),
          file,
          color: '#52B788',
          timestamp: Date.now()
        }
      ]);
      setStep(2);
      if (lat !== null) fillPlaceInfo(file, lat, lng);
    };

    // 위치를 못 찾으면 기본 좌표로 채우지 않고 비워 둔다. 사용자가 직접 장소를 고른다.
    const addSpotWithoutLocation = () => {
      showToast('위치를 찾지 못했어요. "위치 지정"을 눌러 장소를 골라주세요.', 'error');
      addSpot(null, null);
    };

    if (!navigator.geolocation) {
      addSpotWithoutLocation();
      return;
    }

    showToast('현재 위치를 찾고 있습니다...');
    navigator.geolocation.getCurrentPosition(
      (position) => addSpot(position.coords.latitude, position.coords.longitude),
      addSpotWithoutLocation,
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
        // 위치 정보가 없으면 null 로 두고, 2단계에서 사용자가 장소를 직접 지정한다.
        const exifData = await exifr.parse(file);
        const gps = { lat: exifData?.latitude ?? null, lng: exifData?.longitude ?? null };
        const shotAt = exifData?.DateTimeOriginal ? new Date(exifData.DateTimeOriginal).getTime() : NaN;
        const hasShotTime = Number.isFinite(shotAt);
        newSpots.push({
          name: `장소 ${spots.length + i + 1}`,
          ...gps,
          hasGps: hasLocation(gps),
          photo: createPreviewUrl(file),
          file,
          // 촬영 시각이 없으면 파일 날짜로 순서만 잡고, 추정값임을 표시해 둔다.
          // (메신저로 받은 사진은 파일 날짜가 내려받은 날이라 여행 날짜로 쓸 수 없다)
          timestamp: hasShotTime ? shotAt : file.lastModified,
          ...(hasShotTime ? {} : { timeEstimated: true })
        });
      } catch (error) {
        console.warn('EXIF 분석 실패, 위치는 직접 지정받음:', error);
        newSpots.push({
          name: `장소 ${spots.length + i + 1}`,
          lat: null,
          lng: null,
          hasGps: false,
          photo: createPreviewUrl(file),
          file,
          timestamp: file.lastModified,
          timeEstimated: true
        });
      }
    }

    // 촬영 시각 순으로 정렬 → 실제 이동 순서가 된다.
    const allSpots = [...spots, ...newSpots].sort((a, b) => a.timestamp - b.timestamp);

    // 가까운 좌표는 같은 장소로 묶어 지도에 핀이 중복으로 찍히지 않게 한다.
    // (좌표가 없는 지점은 거리가 Infinity 라 묶이지 않는다)
    for (let i = 1; i < allSpots.length; i += 1) {
      const d = getDistanceFromLatLonInKm(allSpots[i - 1].lat, allSpots[i - 1].lng, allSpots[i].lat, allSpots[i].lng);
      if (d < CLUSTER_RADIUS_KM) {
        allSpots[i].lat = allSpots[i - 1].lat;
        allSpots[i].lng = allSpots[i - 1].lng;
      }
    }

    // 좌표로 장소 이름과 시도를 찾아 채운다. 못 찾으면 "장소 n" 그대로 둔다.
    setProgress('장소 이름을 찾는 중...');
    const placeInfo = await reverseGeocodeAll(allSpots);
    const namedSpots = allSpots.map((spot, idx) => {
      const numbered = DEFAULT_SPOT_NAME.test(spot.name) ? { ...spot, name: `장소 ${idx + 1}` } : spot;
      const info = placeInfo[idx];
      if (!info) return numbered;
      const canRename = info.name && (isDefaultPlaceName(numbered.name) || numbered.autoNamed);
      return { ...numbered, sido: info.sido, ...(canRename ? { name: info.name, autoNamed: true } : {}) };
    });

    setSpots(namedSpots);
    setStep(2);
    setIsAnalyzing(false);
    setProgress('');

    const noGpsCount = newSpots.filter((s) => !s.hasGps).length;
    const noTimeCount = newSpots.filter((s) => s.timeEstimated).length;
    const notices = [];
    if (noGpsCount > 0) notices.push(`${noGpsCount}장은 위치 정보가 없어요. "위치 지정"을 눌러 장소를 골라주세요.`);
    if (noTimeCount > 0) notices.push(`${noTimeCount}장은 촬영 시각이 없어 순서가 다를 수 있어요. 끌어서 바로잡아 주세요.`);
    if (notices.length > 0) showToast(notices.join(' '), 'error');
  };

  const handleRemoveSpot = (indexToRemove) => setSpots(spots.filter((_, idx) => idx !== indexToRemove));

  const handleSetLocation = ({ lat, lng, name }) => {
    const target = spots[locatingIndex];
    setSpots((prev) =>
      prev.map((spot, idx) => {
        if (idx !== locatingIndex) return spot;
        // 이름을 직접 붙인 적이 없다면(기본 이름이거나 자동으로 채운 이름) 검색한 장소 이름으로 바꿔 준다.
        const keepName = spot.name && !DEFAULT_SPOT_NAME.test(spot.name) && !spot.autoNamed;
        const useSearchName = !keepName && Boolean(name);
        return {
          ...spot,
          lat,
          lng,
          locationSource: 'manual',
          // 예전 위치의 시도가 남지 않게 비운다. (Firestore 는 undefined 를 못 받으므로 null)
          sido: null,
          name: useSearchName ? name : spot.name,
          // 검색 결과에서 고른 이름은 사용자가 고른 것이므로 주소 변환이 덮어쓰지 않게 한다.
          ...(useSearchName ? { autoNamed: false } : {})
        };
      })
    );
    setLocatingIndex(null);
    showToast('장소를 지정했습니다.', 'success');
    // 시도는 항상 새로 찾고, 이름은 아직 정해지지 않았을 때만 채운다.
    if (target?.file) fillPlaceInfo(target.file, lat, lng);
  };

  const missingLocationCount = spots.filter((spot) => !hasLocation(spot)).length;

  // 사진마다 "몇 번째 장소"인지 — 같은 장소로 묶인 사진은 같은 번호를 받는다. (지도 핀 번호와 맞춘다)
  const placeNumbers = [];
  groupRouteByPlace(spots).forEach((place, placeIdx) => {
    place.indexes.forEach((spotIdx) => {
      placeNumbers[spotIdx] = placeIdx + 1;
    });
  });

  const handleGoToWriteStep = () => {
    if (missingLocationCount > 0) {
      showToast(`위치가 없는 사진 ${missingLocationCount}장의 장소를 먼저 지정해주세요.`, 'error');
      return;
    }
    setStep(3);
  };

  const handleLoadDraft = (draft) => {
    // 저장해 둔 사진 파일로 미리보기 주소를 다시 만든다.
    setSpots(
      (draft.spots || []).map((spot) => ({ ...spot, photo: spot.file ? createPreviewUrl(spot.file) : spot.photo }))
    );
    setTitle(draft.title || '');
    setBody(draft.body || '');
    setCompanion(draft.companion || '');
    setTags(draft.tags || '');
    setCurrentDraftId(draft.id);
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
    if (missingLocationCount > 0) {
      showToast(`위치가 없는 사진 ${missingLocationCount}장의 장소를 먼저 지정해주세요.`, 'error');
      setStep(2);
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
      // (autoNamed 는 편집 화면에서만 쓰는 표시라 저장하지 않는다)
      const spotsForDB = uploadedSpots.map(({ file, autoNamed, ...rest }) => rest);

      // 2. 지점 사이의 실제 이동 경로 복원 (실패하면 직선으로 대체)
      setProgress('이동 경로를 그리는 중...');
      const detailedPath = [];

      for (let i = 0; i < spotsForDB.length - 1; i += 1) {
        const start = spotsForDB[i];
        const end = spotsForDB[i + 1];

        // 같은 장소에서 찍은 사진 사이는 이동이 없으므로 경로 API 를 부르지 않는다.
        if (start.lat === end.lat && start.lng === end.lng) {
          spotsForDB[i].travelTimeToNext = 0;
          spotsForDB[i].transitType = 'walk';
          continue;
        }

        // 2단계 화면에 보였던 이동수단 그대로 저장한다.
        const mode = resolveTransitMode(start, end);
        spotsForDB[i].transitType = mode;

        // 2단계에서 미리 불러 둔 결과가 있으면 그대로 쓴다. 그때 실패했던 구간은 한 번 더 시도한다.
        const result = await loadRoute(start, end, mode, { retryFailed: true });

        if (result) {
          spotsForDB[i].travelTimeToNext = result.minutes;
          result.path.forEach((point) => detailedPath.push(point));
        } else {
          // 경로 API 를 쓸 수 없으면 예상 시간을 쓰고 두 점을 직선으로 잇는다.
          const distKm = getDistanceFromLatLonInKm(start.lat, start.lng, end.lat, end.lng);
          spotsForDB[i].travelTimeToNext = estimateTravelMinutes(distKm, mode);
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

      showToast('여정이 성공적으로 등록되었습니다!', 'success');
      setStep(1);
      setTitle('');
      setBody('');
      setCompanion('');
      setTags('');
      setSpots([]);
      // 게시가 끝난 임시저장은 목록에서 지운다.
      if (currentDraftId) {
        deleteDraft(currentDraftId)
          .then(setDrafts)
          .catch((error) => console.warn('게시한 임시저장 정리 실패:', error));
        setCurrentDraftId(null);
      }
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
      <div className="record-page" style={{ paddingBottom: 0 }}>
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
            <i className="fas fa-compass fa-spin" style={{ fontSize: '32px', color: 'var(--primary)' }}></i>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--primary)' }}>
              {progress || '사진을 분석하는 중...'}
            </div>
          </div>
        )}

        {showDraftsPanel ? (
          <div className="drafts-panel">
            <h3 className="step-title"><i className="fa-regular fa-folder-open ico" aria-hidden="true"></i>임시 저장 목록</h3>
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
                      style={{ background: 'var(--tint)', color: 'var(--primary)', fontSize: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <i className="fa-regular fa-pen-to-square" aria-hidden="true"></i>
                    </div>
                    <div className="draft-info">
                      <div className="draft-title">{d.title || '(제목 없음)'}</div>
                      <div className="draft-meta">{d.spots?.length || 0}개 장소</div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteDraft(d.id)}
                    aria-label="임시저장 삭제"
                    style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '8px' }}
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
            {/* 단계 표시 — 사진 고르기 · 장소 확인 · 글쓰기 */}
            <div className="record-progress" aria-label={`3단계 중 ${step}단계`}>
              {[1, 2, 3].map((n) => (
                <span key={n} className={n <= step ? 'done' : ''}></span>
              ))}
              <em>{step} / 3</em>
            </div>

            {step === 1 && (
              <div className="record-step">
                <div className="record-hero">
                  <div className="record-hero-icon"><i className="fa-solid fa-camera" aria-hidden="true"></i></div>
                  <h2>여행을 기록하세요</h2>
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '8px' }}>
                    사진 속 촬영 시각과 위치로 여행 경로를 자동으로 그려드려요.
                  </p>
                </div>
                <h3 className="step-title">어떻게 기록할까요?</h3>
                <div className="record-options">
                  <button className="record-option-btn" onClick={() => cameraInputRef.current?.click()}>
                    <div className="opt-icon"><i className="fa-solid fa-camera" aria-hidden="true"></i></div>
                    <div className="opt-label">지금 촬영</div>
                  </button>
                  <button className="record-option-btn" onClick={() => galleryInputRef.current?.click()}>
                    <div className="opt-icon"><i className="fa-regular fa-images" aria-hidden="true"></i></div>
                    <div className="opt-label">갤러리 선택</div>
                  </button>
                  <button className="record-option-btn" onClick={() => setShowDraftsPanel(true)}>
                    <div className="opt-icon"><i className="fa-regular fa-folder-open" aria-hidden="true"></i></div>
                    <div className="opt-label">임시저장 열기{drafts.length > 0 ? ` (${drafts.length})` : ''}</div>
                  </button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="record-step">
                <h3 className="step-title">장소 순서와 머문 시간</h3>
                <div style={{ marginBottom: '16px' }}>
                  <RouteMap route={spots} detailedPath={previewPath} height="180px" />
                </div>

                <div className="photo-spots">
                  {spots.map((spot, i) => {
                    let routeConnectionUI = null;

                    if (i < spots.length - 1 && (!hasLocation(spot) || !hasLocation(spots[i + 1]))) {
                      // 좌표가 없으면 거리·이동시간을 계산할 수 없다.
                      routeConnectionUI = (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '4px 0 8px' }}>
                          <div style={{ width: '2px', height: '16px', background: '#ccc' }}></div>
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '6px 12px' }}>
                            장소를 지정하면 이동 시간이 계산돼요
                          </div>
                          <div style={{ width: '2px', height: '16px', background: '#ccc' }}></div>
                        </div>
                      );
                    } else if (i < spots.length - 1 && placeNumbers[i] === placeNumbers[i + 1]) {
                      // 같은 장소로 묶인 사진 사이에는 이동이 없다.
                      routeConnectionUI = (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '2px 0 6px' }}>
                          <div style={{ width: '2px', height: '10px', background: 'var(--tint)' }}></div>
                          <div style={{ fontSize: '11px', color: 'var(--primary)', fontWeight: 700, padding: '2px 10px' }}>
                            <i className="fa-solid fa-camera ico" aria-hidden="true"></i>같은 장소
                          </div>
                          <div style={{ width: '2px', height: '10px', background: 'var(--tint)' }}></div>
                        </div>
                      );
                    } else if (i < spots.length - 1) {
                      const nextSpot = spots[i + 1];
                      const distKm = getDistanceFromLatLonInKm(spot.lat, spot.lng, nextSpot.lat, nextSpot.lng);

                      // 화면에 보이는 이 값이 그대로 저장된다. (게시할 때도 같은 함수로 정한다)
                      const transitType = resolveTransitMode(spot, nextSpot);

                      // 선택된 이동수단은 실제 경로 탐색 결과를 쓰고, 아직 못 받았거나 실패했으면 예상치를 쓴다.
                      const route = peekRoute(spot, nextSpot, transitType);
                      const travelMinutes = route ? route.minutes : estimateTravelMinutes(distKm, transitType);
                      const travelLabel = (mode) => {
                        if (mode === transitType && route) return formatDuration(route.minutes);
                        if (mode === 'walk' && !isWalkableDistance(distKm)) return `직선 ${Math.round(distKm)}km`;
                        return `예상 ${formatDuration(estimateTravelMinutes(distKm, mode))}`;
                      };

                      // 다음 사진이 다른 날이면 null — 밤을 "머무름"으로 세지 않는다.
                      const stayTime = getStayMinutes(spot, nextSpot, travelMinutes);

                      routeConnectionUI = (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '4px 0 8px' }}>
                          <div style={{ width: '2px', height: '16px', background: '#ccc' }}></div>
                          <div
                            style={{
                              display: 'flex',
                              gap: '8px',
                              alignItems: 'center',
                              background: 'var(--surface-2)',
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
                              style={{ border: 'none', background: 'transparent', fontWeight: 'bold', color: 'var(--primary)', outline: 'none', cursor: 'pointer' }}
                            >
                              <option value="walk">도보 ({travelLabel('walk')})</option>
                              <option value="car">차량 ({travelLabel('car')})</option>
                            </select>
                            <span style={{ color: '#ccc' }}>|</span>
                            <span style={{ color: 'var(--text-sub, var(--text-muted))' }}>
                              {spot.timeEstimated || nextSpot.timeEstimated ? (
                                '촬영 시각 없음'
                              ) : stayTime === null ? (
                                '다음 날로 이어짐'
                              ) : stayTime === 0 ? (
                                // 사진 간격이 이동 시간보다 짧다 — 머문 시간 없이 곧장 다음 장소로 간 것
                                '바로 이동'
                              ) : (
                                <>
                                  <i className="fa-regular fa-clock ico" aria-hidden="true"></i><strong>약 {formatDuration(stayTime)}</strong> 머무름
                                </>
                              )}
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
                          <div className="spot-num">{placeNumbers[i]}</div>
                          <img src={spot.photo} alt="" className="spot-thumb" />
                          <div className="spot-info" style={{ flex: 1, minWidth: 0 }}>
                            <input
                              className="spot-location"
                              value={spot.name}
                              aria-label={`${i + 1}번째 장소 이름`}
                              placeholder="이곳의 이름을 적어주세요"
                              onChange={(e) => {
                                const updated = [...spots];
                                // 직접 고친 이름은 주소 변환이 다시 덮어쓰지 않는다.
                                updated[i] = { ...updated[i], name: e.target.value, autoNamed: false };
                                setSpots(updated);
                              }}
                              style={{
                                border: 'none',
                                background: 'transparent',
                                width: '100%',
                                outline: 'none',
                                fontSize: '15px',
                                fontWeight: '800',
                                color: 'var(--primary, var(--primary))',
                                borderBottom: '1px dashed #ccc'
                              }}
                            />
                            {hasLocation(spot) ? (
                              <div className="spot-coords" style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                <i className="fa-solid fa-location-dot ico" aria-hidden="true"></i>{Number(spot.lat).toFixed(4)}, {Number(spot.lng).toFixed(4)}
                                {spot.locationSource === 'manual' && ' · 직접 지정'}
                                <button
                                  onClick={() => setLocatingIndex(i)}
                                  aria-label={`${i + 1}번째 장소 위치 변경`}
                                  style={{ marginLeft: '6px', background: 'none', border: 'none', padding: 0, color: 'var(--primary)', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                                >
                                  변경
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setLocatingIndex(i)}
                                style={{
                                  marginTop: '6px',
                                  padding: '4px 10px',
                                  borderRadius: '12px',
                                  border: 'none',
                                  background: '#FFF4E6',
                                  color: '#E8590C',
                                  fontSize: '12px',
                                  fontWeight: 700,
                                  cursor: 'pointer'
                                }}
                              >
                                <i className="fa-solid fa-location-dot ico" aria-hidden="true"></i>위치 정보 없음 · 위치 지정하기
                              </button>
                            )}
                            {spot.timeEstimated && (
                              <div style={{ fontSize: '11px', color: '#E8590C', marginTop: '4px' }}>
                                <i className="fa-regular fa-clock ico" aria-hidden="true"></i>촬영 시각 정보 없음 · 순서가 다르면 끌어서 옮겨주세요
                              </div>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '0 10px' }}>
                            <button
                              onClick={() => handleRemoveSpot(i)}
                              style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '5px', fontSize: '16px' }}
                              title="삭제하기"
                              aria-label={`${i + 1}번째 장소 삭제`}
                            >
                              <i className="fas fa-trash-alt"></i>
                            </button>
                            <div style={{ color: 'var(--text-faint)', cursor: 'grab', padding: '5px', fontSize: '16px' }}>
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
                    style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px dashed var(--primary)', background: 'var(--tint)', color: 'var(--primary)', fontWeight: 'bold', cursor: 'pointer' }}
                  >
                    <i className="fas fa-camera"></i> + 카메라
                  </button>
                  <button
                    onClick={() => galleryInputRef.current?.click()}
                    style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px dashed var(--primary)', background: 'var(--tint)', color: 'var(--primary)', fontWeight: 'bold', cursor: 'pointer' }}
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
                    <i className="fa-regular fa-floppy-disk ico" aria-hidden="true"></i>임시저장
                  </button>
                  <button className="step-next-btn" onClick={handleGoToWriteStep} disabled={spots.length === 0}>
                    다음
                  </button>
                </div>
                {missingLocationCount > 0 && (
                  <p style={{ margin: '-12px 0 16px', fontSize: '12px', color: '#E8590C', textAlign: 'center' }}>
                    위치가 없는 사진 {missingLocationCount}장의 장소를 지정해야 다음으로 넘어갈 수 있어요.
                  </p>
                )}
              </div>
            )}

            {step === 3 && (
              <div className="record-step">
                <h3 className="step-title">여행 이야기를 써주세요</h3>
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
                    style={{ backgroundColor: 'var(--surface-2)' }}
                    value={companion}
                    onChange={(e) => setCompanion(e.target.value)}
                  >
                    <option value="">누구와 함께한 여행인가요?</option>
                    <option value="solo">나홀로 여행</option>
                    <option value="friends">친구와 함께</option>
                    <option value="couple">연인과 함께</option>
                    <option value="family">가족과 함께</option>
                  </select>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '12px', top: '14px', color: 'var(--primary)', fontWeight: 'bold' }}>#</span>
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
                    <i className="fa-regular fa-floppy-disk ico" aria-hidden="true"></i>임시저장
                  </button>
                  <button className="publish-btn" onClick={handlePublish} disabled={isPublishing}>
                    {isPublishing ? '올리는 중...' : '게시하기'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {locatingIndex !== null && spots[locatingIndex] && (
        <LocationPicker
          initialKeyword={DEFAULT_SPOT_NAME.test(spots[locatingIndex].name) ? '' : spots[locatingIndex].name}
          onSelect={handleSetLocation}
          onClose={() => setLocatingIndex(null)}
        />
      )}
    </section>
  );
};

export default RecordTab;
