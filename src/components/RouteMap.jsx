import React from 'react';
import { Map, Polyline, CustomOverlayMap } from 'react-kakao-maps-sdk';

const RouteMap = ({ route, width = '100%', height = '260px' }) => {
  if (!route || route.length === 0) return <div style={{width, height, background: '#edf7ee'}} />;

  const path = route.map(spot => ({ lat: spot.lat, lng: spot.lng }));
  const center = path[0] || { lat: 37.5665, lng: 126.9780 };

  return (
    <Map center={center} style={{ width, height, borderRadius: '8px' }} level={5}>
      <Polyline
        path={[path]}
        strokeWeight={4}
        strokeColor={"#52B788"}
        strokeOpacity={0.9}
        strokeStyle={"shortdash"}
      />
      {route.map((spot, i) => (
        <CustomOverlayMap key={i} position={{ lat: spot.lat, lng: spot.lng }}>
          <div style={{
            background: spot.color || '#2D6A4F', color: '#fff', borderRadius: '50%', 
            width: '24px', height: '24px', display: 'flex', alignItems: 'center', 
            justifyContent: 'center', fontSize: '12px', fontWeight: 'bold', 
            border: '2px solid white', boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
          }}>
            {i + 1}
          </div>
          {spot.name && (
            <div style={{
              background: 'rgba(255,255,255,0.9)', padding: '2px 6px', borderRadius: '4px',
              fontSize: '10px', fontWeight: 'bold', marginTop: '4px', boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
              whiteSpace: 'nowrap', color: '#1b4332'
            }}>
              {spot.name}
            </div>
          )}
        </CustomOverlayMap>
      ))}
    </Map>
  );
};

export default RouteMap;