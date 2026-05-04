import React, { useState, useRef, useEffect } from 'react';
import exifr from 'exifr';
import RouteMap from '../components/RouteMap';

const RecordTab = ({ onPublish }) => {
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [spots, setSpots] = useState([]);
  
  const [drafts, setDrafts] = useState([]);
  const [showDraftsPanel, setShowDraftsPanel] = useState(false);

  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);

  // 🆕 드래그 앤 드롭을 위한 참조 변수 추가
  const dragItem = useRef();
  const dragOverItem = useRef();

  useEffect(() => {
    const savedDrafts = JSON.parse(localStorage.getItem('gyeolkil_drafts') || '[]');
    setDrafts(savedDrafts);
  }, []);

  // 1. 지금 촬영 (카메라 캡처 + 즉시 GPS 활성화)
  const handleCameraUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const photoUrl = URL.createObjectURL(file);
        setSpots([...spots, {
          name: `장소 ${spots.length + 1}`,
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          photo: photoUrl,
          color: '#52B788'
        }]);
        setStep(2);
      },
      (err) => {
        console.error("GPS 오류:", err);
        alert("위치 권한이 없어 기본 위치로 설정됩니다.");
        const photoUrl = URL.createObjectURL(file);
        setSpots([...spots, { name: `장소 ${spots.length + 1}`, lat: 37.5665, lng: 126.9780, photo: photoUrl, color: '#52B788' }]);
        setStep(2);
      },
      { enableHighAccuracy: true }
    );
  };

  // 2. 갤러리에서 선택 (여러 장 + EXIF에서 위치 추출)
  const handleGalleryUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    const newSpots = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const gps = await exifr.gps(file);
        const photoUrl = URL.createObjectURL(file);

        newSpots.push({
          name: `장소 ${spots.length + i + 1}`,
          lat: gps ? gps.latitude : 37.5665, 
          lng: gps ? gps.longitude : 126.9780,
          photo: photoUrl,
          color: '#52B788'
        });
      } catch (err) {
        console.error('EXIF 실패:', err);
      }
    }
    setSpots([...spots, ...newSpots]);
    setStep(2);
  };

  const handleLoadDraft = (draft) => {
    setSpots(draft.spots || []);
    setTitle(draft.title || '');
    setBody(draft.body || '');
    setShowDraftsPanel(false);
    setStep(2);
  };

  const handlePublish = () => {
    if (!title) return alert("제목을 입력해주세요");
    
    onPublish({
      id: 'p' + Date.now(),
      userId: 'u1', 
      title,
      body,
      tags: [],
      region: 'seoul',
      createdAt: Date.now(),
      likes: 0,
      comments: 0,
      saves: 0,
      route: spots,
      commentList: [],
    });
    
    setStep(1);
    setTitle('');
    setBody('');
    setSpots([]);
  };

  // ==========================================
  // 🆕 드래그 앤 드롭 (장소 순서 변경) 로직
  // ==========================================
  const handleDragStart = (e, position) => {
    dragItem.current = position;
  };

  const handleDragEnter = (e, position) => {
    dragOverItem.current = position;
  };

  const handleDrop = (e) => {
    const copySpots = [...spots];
    const dragItemContent = copySpots[dragItem.current];
    
    copySpots.splice(dragItem.current, 1);
    copySpots.splice(dragOverItem.current, 0, dragItemContent);
    
    dragItem.current = null;
    dragOverItem.current = null;
    setSpots(copySpots);
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
                <div className="record-hero">
                  <div className="record-hero-icon">📷</div>
                  <h2>여행을 기록하세요</h2>
                </div>
                <h3 className="step-title">어떻게 기록할까요?</h3>
                <div className="record-options">
                  <button className="record-option-btn" onClick={() => cameraInputRef.current.click()}>
                    <div className="opt-icon">📸</div>
                    <div className="opt-label">지금 촬영</div>
                  </button>
                  <button className="record-option-btn" onClick={() => galleryInputRef.current.click()}>
                    <div className="opt-icon">🖼️</div>
                    <div className="opt-label">갤러리 선택</div>
                  </button>
                  <button className="record-option-btn" onClick={() => setShowDraftsPanel(true)}>
                    <div className="opt-icon">📝</div>
                    <div className="opt-label">임시저장 열기</div>
                  </button>
                </div>
              </div>
            )}

            {/* =========================================
                STEP 2: 장소 순서 확인 및 추가 업로드
            ========================================= */}
            {step === 2 && (
              <div className="record-step">
                <h3 className="step-title">📍 장소 순서를 확인하세요</h3>
                <div style={{ marginBottom: '16px' }}>
                  <RouteMap route={spots} height="180px" />
                </div>
                
                <div className="photo-spots">
                   {spots.map((spot, i) => (
                     <div 
                       key={spot.name + i} 
                       className="spot-item"
                       // 🆕 드래그 앤 드롭 속성 추가
                       draggable
                       onDragStart={(e) => handleDragStart(e, i)}
                       onDragEnter={(e) => handleDragEnter(e, i)}
                       onDragEnd={handleDrop}
                       onDragOver={(e) => e.preventDefault()}
                       style={{ 
                         cursor: 'grab', 
                         display: 'flex', 
                         alignItems: 'center', 
                         backgroundColor: '#fff', 
                         transition: 'transform 0.1s' 
                       }}
                     >
                       <div className="spot-num">{i + 1}</div>
                       <img src={spot.photo} alt={spot.name} className="spot-thumb" />
                       <div className="spot-info" style={{ flex: 1 }}>
                         <input 
                           className="spot-location" 
                           value={spot.name}
                           onChange={(e) => {
                             const updated = [...spots];
                             updated[i].name = e.target.value;
                             setSpots(updated);
                           }}
                           style={{border: 'none', background: 'transparent', width: '100%', outline: 'none', fontSize: '14px', fontWeight: 'bold'}}
                         />
                         <div className="spot-coords">📍 {spot.lat?.toFixed(4)}, {spot.lng?.toFixed(4)}</div>
                       </div>
                       
                       {/* 🆕 드래그 핸들 아이콘 표시 */}
                       <div style={{ padding: '10px', color: '#adb5bd', cursor: 'grab' }}>
                         <i className="fas fa-bars"></i>
                       </div>
                     </div>
                   ))}
                </div>

                {/* 장소 추가 버튼 영역 */}
                <div style={{ display: 'flex', gap: '10px', marginTop: '16px', marginBottom: '24px' }}>
                  <button 
                    onClick={() => cameraInputRef.current.click()}
                    style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px dashed #52B788', background: '#edf7ee', color: '#2D6A4F', fontWeight: 'bold', cursor: 'pointer' }}>
                    <i className="fas fa-camera"></i> + 카메라
                  </button>
                  <button 
                    onClick={() => galleryInputRef.current.click()}
                    style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px dashed #52B788', background: '#edf7ee', color: '#2D6A4F', fontWeight: 'bold', cursor: 'pointer' }}>
                    <i className="fas fa-image"></i> + 갤러리
                  </button>
                </div>

                <div className="step-actions">
                  <button className="step-back-btn" onClick={() => setStep(1)}>이전</button>
                  <button className="step-next-btn" onClick={() => setStep(3)}>다음</button>
                </div>
              </div>
            )}

            {/* =========================================
                STEP 3: 템플릿 기반 여행기 작성
            ========================================= */}
            {step === 3 && (
              <div className="record-step">
                <h3 className="step-title">✍️ 여행 이야기를 써주세요</h3>
                <div className="write-form" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  
                  {/* 제목 */}
                  <input type="text" className="form-input" placeholder="게시물 제목 (예: 성수동 감성 코스)" value={title} onChange={e => setTitle(e.target.value)} />
                  
                  {/* 누구와 함께 (템플릿) */}
                  <select className="form-input" style={{ backgroundColor: '#f8f9fa' }}>
                    <option value="">누구와 함께한 여행인가요?</option>
                    <option value="solo">🚶 나홀로 여행</option>
                    <option value="friends">👯 친구와 함께</option>
                    <option value="couple">💑 연인과 함께</option>
                    <option value="family">👨‍👩‍👧‍👦 가족과 함께</option>
                  </select>

                  {/* 해시태그 (템플릿) */}
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '12px', top: '14px', color: '#52B788', fontWeight: 'bold' }}>#</span>
                    <input type="text" className="form-input" placeholder="태그 입력 (쉼표로 구분)" style={{ paddingLeft: '28px' }} />
                  </div>

                  {/* 본문 */}
                  <textarea className="form-textarea" placeholder="어떤 여행이었나요? 코스의 꿀팁이나 감상을 자유롭게 적어주세요!" rows="6" value={body} onChange={e => setBody(e.target.value)} />
                </div>

                <div className="step-actions" style={{ marginTop: '24px' }}>
                  <button className="step-back-btn" onClick={() => setStep(2)}>이전</button>
                  <button className="publish-btn" onClick={handlePublish}>게시하기</button>
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