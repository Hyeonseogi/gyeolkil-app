import React, { useState, useRef, useEffect } from 'react';
import exifr from 'exifr';
import heic2any from 'heic2any';
import RouteMap from '../components/RouteMap';
import { collection, addDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, auth } from '../firebase'; 
import imageCompression from 'browser-image-compression';

// 두 위도/경도 사이의 거리를 km 단위로 계산하는 하버사인 공식
const getDistanceFromLatLonInKm = (lat1, lon1, lat2, lon2) => {
  const R = 6371; 
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; 
};

const RecordTab = ({ onPublish }) => {
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [companion, setCompanion] = useState('');
  const [tags, setTags] = useState('');
  const [spots, setSpots] = useState([]);
  
  const [drafts, setDrafts] = useState([]);
  const [showDraftsPanel, setShowDraftsPanel] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);
  const dragItem = useRef(null);
  const dragOverItem = useRef(null);

  useEffect(() => {
    const savedDrafts = JSON.parse(localStorage.getItem('gyeolkil_drafts') || '[]');
    setDrafts(savedDrafts);
  }, []);

  const handleSaveDraft = () => {
    const draftSpots = spots.map(({ file, ...rest }) => rest);
    const newDraft = { id: 'draft_' + Date.now(), title, body, companion, tags, spots: draftSpots, savedAt: Date.now() };
    const existingDrafts = JSON.parse(localStorage.getItem('gyeolkil_drafts') || '[]');
    localStorage.setItem('gyeolkil_drafts', JSON.stringify([newDraft, ...existingDrafts]));
    alert("현재까지의 작성 내용이 기기에 안전하게 임시저장 되었습니다! 💾");
  };

  const handleCameraUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    alert("현재 위치를 찾고 있습니다. 잠시만 기다려주세요! 📡");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const photoUrl = URL.createObjectURL(file);
        setSpots([...spots, { name: `장소 ${spots.length + 1}`, lat: position.coords.latitude, lng: position.coords.longitude, photo: photoUrl, file: file, color: '#52B788', timestamp: Date.now() }]);
        setStep(2);
      },
      (err) => {
        const photoUrl = URL.createObjectURL(file);
        setSpots([...spots, { name: `장소 ${spots.length + 1}`, lat: 37.5665, lng: 126.9780, photo: photoUrl, file: file, color: '#52B788', timestamp: Date.now() }]);
        setStep(2);
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
  };

  const handleGalleryUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    setIsPublishing(true); 
    const newSpots = [];

    for (let i = 0; i < files.length; i++) {
      let file = files[i];
      try {
        if (file.name.toLowerCase().endsWith('.heic') || file.type === 'image/heic') {
          const convertedBlob = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.8 });
          const blobArray = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
          file = new File([blobArray], file.name.replace(/\.heic$/i, '.jpg'), { type: 'image/jpeg' });
        }
        const exifData = await exifr.parse(file);
        const timestamp = exifData?.DateTimeOriginal ? new Date(exifData.DateTimeOriginal).getTime() : file.lastModified;
        newSpots.push({
          name: `장소 ${spots.length + i + 1}`,
          lat: exifData?.latitude || 37.5665, 
          lng: exifData?.longitude || 126.9780,
          photo: URL.createObjectURL(file), file, timestamp 
        });
      } catch (err) {
        newSpots.push({ name: `장소 ${spots.length + i + 1}`, lat: 37.5665, lng: 126.9780, photo: URL.createObjectURL(file), file, timestamp: file.lastModified });
      }
    }

    const allSpots = [...spots, ...newSpots].sort((a, b) => a.timestamp - b.timestamp);
    
    // 🚨 [NEW 3번 해결] 클러스터링: 30m 이내 좌표는 같은 장소로 인식하여 오차 병합!
    for (let i = 1; i < allSpots.length; i++) {
      if (getDistanceFromLatLonInKm(allSpots[i-1].lat, allSpots[i-1].lng, allSpots[i].lat, allSpots[i].lng) < 0.03) {
        allSpots[i].lat = allSpots[i-1].lat;
        allSpots[i].lng = allSpots[i-1].lng;
      }
    }

    const renamedSpots = allSpots.map((s, idx) => ({ ...s, name: s.name.startsWith('장소') ? `장소 ${idx + 1}` : s.name }));
    setSpots(renamedSpots);
    setStep(2);
    setIsPublishing(false); 
  };

  const handleRemoveSpot = (indexToRemove) => setSpots(spots.filter((_, idx) => idx !== indexToRemove));
  const handleLoadDraft = (draft) => { setSpots(draft.spots || []); setTitle(draft.title || ''); setBody(draft.body || ''); setCompanion(draft.companion || ''); setTags(draft.tags || ''); setShowDraftsPanel(false); setStep(2); };
  const handleDragStart = (e, position) => { dragItem.current = position; };
  const handleDragEnter = (e, position) => { dragOverItem.current = position; };
  const handleDrop = (e) => {
    if (dragItem.current === null || dragOverItem.current === null) return;
    const copySpots = [...spots];
    const dragItemContent = copySpots[dragItem.current];
    copySpots.splice(dragItem.current, 1);
    copySpots.splice(dragOverItem.current, 0, dragItemContent);
    dragItem.current = null; dragOverItem.current = null;
    setSpots(copySpots);
  };

  const handlePublish = async () => {
    if (!title) return alert("제목을 입력해주세요");
    if (spots.length === 0) return alert("사진을 최소 1장 이상 추가해주세요");

    const user = auth.currentUser;
    if (!user) return alert("로그인 정보가 없습니다. 다시 로그인해주세요.");

    setIsPublishing(true);

    try {
      // 1. 이미지 업로드 (압축 유지)
      const uploadedSpots = await Promise.all(
        spots.map(async (spot, index) => {
          if (spot.file) {
            const compressedFile = await imageCompression(spot.file, { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true });
            const fileRef = ref(storage, `posts/${Date.now()}_${index}`);
            await uploadBytes(fileRef, compressedFile);
            const downloadUrl = await getDownloadURL(fileRef);
            return { ...spot, photo: downloadUrl }; 
          }
          return spot;
        })
      );

      const spotsForDB = uploadedSpots.map(({ file, ...rest }) => rest);

      // 🚨 [NEW 2 & 4번 해결] 하이브리드 길찾기 (도보 + 차량)
      let detailedPath = [];
      const pathPromises = [];
      
      for (let i = 0; i < spotsForDB.length - 1; i++) {
        const start = spotsForDB[i];
        const end = spotsForDB[i + 1];
        const distKm = getDistanceFromLatLonInKm(start.lat, start.lng, end.lat, end.lng);
        
        let fetchPromise;
        if (distKm < 3) {
          // 🏃 거리가 3km 미만이면 TMAP 보행자 API 호출!
          fetchPromise = fetch(`https://apis.openapi.sk.com/tmap/routes/pedestrian?version=1&format=json`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'appKey': import.meta.env.VITE_TMAP_APP_KEY },
            body: JSON.stringify({
              startX: start.lng, startY: start.lat, endX: end.lng, endY: end.lat,
              reqCoordType: "WGS84GEO", resCoordType: "WGS84GEO", startName: "출발", endName: "도착"
            })
          }).then(res => res.json()).then(data => ({ type: 'tmap', data, start, end })).catch(() => null);
        } else {
          // 🚗 3km 이상이면 기존 카카오 자동차 API 호출!
          fetchPromise = fetch(`https://apis-navi.kakaomobility.com/v1/directions?origin=${start.lng},${start.lat}&destination=${end.lng},${end.lat}`, {
            headers: { Authorization: `KakaoAK ${import.meta.env.VITE_KAKAO_REST_KEY}` }
          }).then(res => res.json()).then(data => ({ type: 'kakao', data, start, end })).catch(() => null);
        }
        pathPromises.push(fetchPromise);
      }

      for (let i = 0; i < pathPromises.length; i++) {
        const result = await pathPromises[i];
        if (!result) {
           detailedPath.push({ lat: spotsForDB[i].lat, lng: spotsForDB[i].lng }, { lat: spotsForDB[i+1].lat, lng: spotsForDB[i+1].lng });
           continue;
        }

        const { type, data, start, end } = result;

        if (type === 'tmap' && data && data.features) {
          // 🚨 [NEW 4번 해결] TMAP이 계산해준 '정확한 도보 소요 시간' DB에 저장!
          const totalTimeSeconds = data.features[0]?.properties?.totalTime || 0; 
          spotsForDB[i].travelTimeToNext = Math.ceil(totalTimeSeconds / 60); // 분 단위로 변환해서 저장
          spotsForDB[i].transitType = 'walk';

          data.features.forEach(feature => {
            if (feature.geometry.type === 'LineString') {
              feature.geometry.coordinates.forEach(coord => detailedPath.push({ lng: coord[0], lat: coord[1] }));
            } else if (feature.geometry.type === 'Point') {
              detailedPath.push({ lng: feature.geometry.coordinates[0], lat: feature.geometry.coordinates[1] });
            }
          });
        } else if (type === 'kakao' && data?.routes?.[0]?.sections) {
          // 카카오 자동차 소요 시간 저장
          const totalTimeSeconds = data.routes[0].summary?.duration || 0;
          spotsForDB[i].travelTimeToNext = Math.ceil(totalTimeSeconds / 60);
          spotsForDB[i].transitType = 'car';

          data.routes[0].sections.forEach(section => {
            section?.roads?.forEach(road => {
              const vertexes = road.vertexes || [];
              for (let j = 0; j < vertexes.length; j += 2) detailedPath.push({ lng: vertexes[j], lat: vertexes[j+1] });
            });
          });
        } else {
          detailedPath.push({ lat: start.lat, lng: start.lng }, { lat: end.lat, lng: end.lng });
        }
      }

      await addDoc(collection(db, "posts"), {
        userId: user.uid, authorName: user.displayName || '여행자', authorAvatar: user.photoURL || '',
        title, body, companion, tags: tags.split(',').map(tag => tag.trim()).filter(tag => tag !== ''), 
        region: 'seoul', createdAt: Date.now(), likes: 0, comments: 0, saves: 0,
        route: spotsForDB, // 👈 여기에 정확한 이동시간(travelTimeToNext)이 포함되어 저장됩니다!
        detailedPath: detailedPath, likedBy: [] 
      });

      alert("게시물이 성공적으로 업로드되었습니다! 🎉");
      setStep(1); setTitle(''); setBody(''); setCompanion(''); setTags(''); setSpots([]);
      if (onPublish) onPublish();
    } catch (error) {
      console.error("게시 오류:", error);
      alert("업로드 중 문제가 발생했습니다. 다시 시도해주세요.");
    } finally {
      setIsPublishing(false); 
    }
  };

  return (
    <section className="tab-page active" style={{ overflowY: 'auto' }}>
      <div className="record-page">
        <input type="file" accept="image/*" capture="environment" ref={cameraInputRef} style={{ display: 'none' }} onChange={handleCameraUpload} />
        <input type="file" multiple accept="image/*" ref={galleryInputRef} style={{ display: 'none' }} onChange={handleGalleryUpload} />

        {showDraftsPanel ? (
          <div className="drafts-panel">
            <h3 className="step-title">📝 임시 저장 목록</h3>
            {drafts.length === 0 ? (
              <div className="empty-state"><p>임시 저장된 기록이 없어요</p></div>
            ) : (
              drafts.map(d => (
                <div key={d.id} className="draft-item" onClick={() => handleLoadDraft(d)}>
                  <div className="draft-thumb" style={{background: 'var(--primary-bg)', fontSize: '24px', display:'flex', alignItems:'center', justifyContent:'center'}}>📝</div>
                  <div className="draft-info">
                    <div className="draft-title">{d.title || '(제목 없음)'}</div>
                    <div className="draft-meta">{d.spots?.length || 0}개 장소</div>
                  </div>
                </div>
              ))
            )}
            <button className="step-back-btn" onClick={() => setShowDraftsPanel(false)}>뒤로</button>
          </div>
        ) : (
          <>
            {step === 1 && (
              <div className="record-step">
                <div className="record-hero"><div className="record-hero-icon">📷</div><h2>여행을 기록하세요</h2></div>
                <h3 className="step-title">어떻게 기록할까요?</h3>
                <div className="record-options">
                  <button className="record-option-btn" onClick={() => cameraInputRef.current.click()}><div className="opt-icon">📸</div><div className="opt-label">지금 촬영</div></button>
                  <button className="record-option-btn" onClick={() => galleryInputRef.current.click()}><div className="opt-icon">🖼️</div><div className="opt-label">갤러리 선택</div></button>
                  <button className="record-option-btn" onClick={() => setShowDraftsPanel(true)}><div className="opt-icon">📝</div><div className="opt-label">임시저장 열기</div></button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="record-step">
                <h3 className="step-title">📍 장소 순서와 체류시간 확인</h3>
                <div style={{ marginBottom: '16px' }}><RouteMap route={spots} height="180px" /></div>
                
                <div className="photo-spots">
                   {spots.map((spot, i) => {
                     let routeConnectionUI = null;
                     if (i < spots.length - 1) {
                       const nextSpot = spots[i + 1];
                       const distKm = getDistanceFromLatLonInKm(spot.lat, spot.lng, nextSpot.lat, nextSpot.lng);
                       const timeDiffMins = Math.round(Math.abs(nextSpot.timestamp - spot.timestamp) / 60000); 
                       const speedKmH = distKm / (timeDiffMins / 60 || 1);
                       const isCar = speedKmH > 10 || distKm > 3;
                       const estTravelTime = isCar ? Math.ceil((distKm / 40) * 60) : Math.ceil((distKm / 4) * 60);
                       const stayTime = Math.max(0, timeDiffMins - estTravelTime);

                       routeConnectionUI = (
                         <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '4px 0 8px' }}>
                           <div style={{ width: '2px', height: '16px', background: '#ccc' }}></div>
                           <div style={{ display: 'flex', gap: '8px', alignItems: 'center', background: '#f8f9fa', padding: '8px 12px', borderRadius: '20px', border: '1px solid #eee', fontSize: '12px' }}>
                             <select style={{ border: 'none', background: 'transparent', fontWeight: 'bold', color: '#52B788', outline: 'none', cursor: 'pointer' }} defaultValue={isCar ? 'car' : 'walk'}>
                               <option value="walk">🚶 도보 (예상 {estTravelTime}분)</option>
                               <option value="car">🚗 차/대중교통 (예상 {estTravelTime}분)</option>
                             </select>
                             <span style={{ color: '#ccc' }}>|</span>
                             <span style={{ color: 'var(--text-sub)' }}>☕ <strong>약 {stayTime}분</strong> 머무름</span>
                           </div>
                           <div style={{ width: '2px', height: '16px', background: '#ccc' }}></div>
                         </div>
                       );
                     }
                     return (
                       <React.Fragment key={spot.name + i}>
                         <div className="spot-item" draggable onDragStart={(e) => handleDragStart(e, i)} onDragEnter={(e) => handleDragEnter(e, i)} onDragEnd={handleDrop} onDragOver={(e) => e.preventDefault()} style={{ cursor: 'grab', display: 'flex', alignItems: 'center', backgroundColor: '#fff', transition: 'transform 0.1s' }}>
                           <div className="spot-num">{i + 1}</div>
                           <img src={spot.photo} alt={spot.name} className="spot-thumb" />
                           <div className="spot-info" style={{ flex: 1 }}>
                             <input className="spot-location" value={spot.name} placeholder="이곳의 이름을 적어주세요 (클릭)" onChange={(e) => { const updated = [...spots]; updated[i].name = e.target.value; setSpots(updated); }} style={{ border: 'none', background: 'transparent', width: '100%', outline: 'none', fontSize: '15px', fontWeight: '800', color: 'var(--primary)', borderBottom: '1px dashed #ccc' }} />
                             <div className="spot-coords">📍 {spot.lat?.toFixed(4)}, {spot.lng?.toFixed(4)}</div>
                           </div>
                           <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '0 10px' }}>
                             <button onClick={() => handleRemoveSpot(i)} style={{ color: '#e63946', cursor: 'pointer', padding: '5px', fontSize: '16px' }} title="삭제하기"><i className="fas fa-trash-alt"></i></button>
                             <div style={{ color: '#adb5bd', cursor: 'grab', padding: '5px', fontSize: '16px' }}><i className="fas fa-bars"></i></div>
                           </div>
                         </div>
                         {routeConnectionUI}
                       </React.Fragment>
                     );
                   })}
                </div>

                <div style={{ display: 'flex', gap: '10px', marginTop: '16px', marginBottom: '24px' }}>
                  <button onClick={() => cameraInputRef.current.click()} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px dashed #52B788', background: '#edf7ee', color: '#2D6A4F', fontWeight: 'bold', cursor: 'pointer' }}><i className="fas fa-camera"></i> + 카메라</button>
                  <button onClick={() => galleryInputRef.current.click()} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px dashed #52B788', background: '#edf7ee', color: '#2D6A4F', fontWeight: 'bold', cursor: 'pointer' }}><i className="fas fa-image"></i> + 갤러리</button>
                </div>
                
                <div className="step-actions">
                  <button className="step-back-btn" onClick={() => setStep(1)}>이전</button>
                  <button onClick={handleSaveDraft} style={{ flex: 1, padding: '14px', borderRadius: '12px', border: '1px solid #ccc', background: '#fff', color: '#666', fontWeight: 'bold', cursor: 'pointer' }}>💾 임시저장</button>
                  <button className="step-next-btn" onClick={() => setStep(3)}>다음</button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="record-step">
                <h3 className="step-title">✍️ 여행 이야기를 써주세요</h3>
                <div className="write-form" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <input type="text" className="form-input" placeholder="게시물 제목 (예: 성수동 감성 코스)" value={title} onChange={e => setTitle(e.target.value)} />
                  <select className="form-input" style={{ backgroundColor: '#f8f9fa' }} value={companion} onChange={e => setCompanion(e.target.value)}>
                    <option value="">누구와 함께한 여행인가요?</option>
                    <option value="solo">🚶 나홀로 여행</option>
                    <option value="friends">👯 친구와 함께</option>
                    <option value="couple">💑 연인과 함께</option>
                    <option value="family">👨‍👩‍👧‍👦 가족과 함께</option>
                  </select>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '12px', top: '14px', color: '#52B788', fontWeight: 'bold' }}>#</span>
                    <input type="text" className="form-input" placeholder="태그 입력 (쉼표로 구분)" style={{ paddingLeft: '28px' }} value={tags} onChange={e => setTags(e.target.value)} />
                  </div>
                  <textarea className="form-textarea" placeholder="어떤 여행이었나요? 코스의 꿀팁이나 감상을 자유롭게 적어주세요!" rows="6" value={body} onChange={e => setBody(e.target.value)} />
                </div>

                <div className="step-actions" style={{ marginTop: '24px' }}>
                  <button className="step-back-btn" onClick={() => setStep(2)} disabled={isPublishing}>이전</button>
                  <button onClick={handleSaveDraft} disabled={isPublishing} style={{ flex: 1, padding: '14px', borderRadius: '12px', border: '1px solid #ccc', background: '#fff', color: '#666', fontWeight: 'bold', cursor: 'pointer' }}>💾 임시저장</button>
                  <button className="publish-btn" onClick={handlePublish} disabled={isPublishing}>
                    {isPublishing ? '☁️ 서버에 올리는 중...' : '게시하기'}
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