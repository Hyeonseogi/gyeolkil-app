import { useState } from 'react';
import { showToast } from '../data';

/**
 * 사진에 위치 정보가 없을 때 장소를 직접 고르는 창.
 * 카카오 장소 검색(JS SDK 의 services 라이브러리)을 쓰므로 REST 키가 필요 없다.
 */
const LocationPicker = ({ initialKeyword = '', onSelect, onClose }) => {
  const [keyword, setKeyword] = useState(initialKeyword);
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = (e) => {
    e.preventDefault();
    const trimmed = keyword.trim();
    if (!trimmed) return;

    const services = window.kakao?.maps?.services;
    if (!services) {
      showToast('지도 서비스를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.', 'error');
      return;
    }

    setIsSearching(true);
    new services.Places().keywordSearch(trimmed, (data, status) => {
      setIsSearching(false);
      setHasSearched(true);
      if (status === services.Status.OK) {
        setResults(data.slice(0, 10));
      } else if (status === services.Status.ZERO_RESULT) {
        setResults([]);
      } else {
        setResults([]);
        showToast('장소 검색에 실패했습니다.', 'error');
      }
    });
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      showToast('이 기기에서는 현재 위치를 쓸 수 없습니다.', 'error');
      return;
    }
    showToast('현재 위치를 찾고 있습니다... 📡');
    navigator.geolocation.getCurrentPosition(
      (position) => onSelect({ lat: position.coords.latitude, lng: position.coords.longitude, name: null }),
      () => showToast('현재 위치를 찾지 못했습니다. 장소를 검색해주세요.', 'error'),
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
  };

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="장소 지정"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{ display: 'flex', alignItems: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 600 }}
    >
      <div
        style={{
          width: '100%',
          maxHeight: '80vh',
          backgroundColor: '#fff',
          borderTopLeftRadius: '24px',
          borderTopRightRadius: '24px',
          padding: '20px 20px 32px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#1A1A1A' }}>📍 이 사진을 찍은 장소</h3>
          <button
            onClick={onClose}
            aria-label="닫기"
            style={{ background: 'none', border: 'none', fontSize: '20px', color: '#ADB5BD', cursor: 'pointer' }}
          >
            <i className="fas fa-times"></i>
          </button>
        </div>

        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="장소 이름 검색 (예: 성수동 카페, 경복궁)"
            aria-label="장소 검색어"
            autoFocus
            style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid #E5E7EB', fontSize: '14px', outline: 'none' }}
          />
          <button
            type="submit"
            disabled={isSearching}
            style={{ padding: '0 16px', borderRadius: '10px', border: 'none', background: '#1A1A1A', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
          >
            검색
          </button>
        </form>

        <button
          onClick={handleUseCurrentLocation}
          style={{ padding: '10px', borderRadius: '10px', border: '1px dashed #52B788', background: '#EDF7EE', color: '#2D6A4F', fontWeight: 700, cursor: 'pointer' }}
        >
          <i className="fas fa-location-arrow"></i> 지금 내 위치로 지정
        </button>

        <ul style={{ listStyle: 'none', margin: 0, padding: 0, overflowY: 'auto' }}>
          {isSearching && <li style={{ padding: '16px', textAlign: 'center', color: '#868E96' }}>검색 중...</li>}
          {!isSearching && hasSearched && results.length === 0 && (
            <li style={{ padding: '16px', textAlign: 'center', color: '#868E96' }}>검색 결과가 없습니다.</li>
          )}
          {!isSearching &&
            results.map((place) => (
              <li key={place.id}>
                <button
                  onClick={() => onSelect({ lat: Number(place.y), lng: Number(place.x), name: place.place_name })}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '12px 4px',
                    background: 'none',
                    border: 'none',
                    borderBottom: '1px solid #F1F3F5',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#1A1A1A' }}>{place.place_name}</div>
                  <div style={{ fontSize: '12px', color: '#868E96', marginTop: '2px' }}>
                    {place.road_address_name || place.address_name}
                  </div>
                </button>
              </li>
            ))}
        </ul>
      </div>
    </div>
  );
};

export default LocationPicker;
