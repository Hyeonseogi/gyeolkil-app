/**
 * TMAP 보행자 경로 탐색 프록시 (Vercel Serverless Function)
 *
 * 왜 서버를 거치는가
 *  1) TMAP 앱키는 서버 전용 비밀키다. 브라우저에서 직접 부르면 개발자 도구에 그대로 노출된다.
 *  2) TMAP 은 브라우저에서의 교차 출처 요청(CORS)을 허용하지 않는다.
 *
 * 키는 Vercel 프로젝트 설정 > Environment Variables 의 TMAP_APP_KEY 로 주입된다.
 * (VITE_ 접두사가 없으므로 프론트엔드 번들에는 절대 포함되지 않는다.)
 *
 * 개발 환경에서는 vite.config.js 의 동일 경로 프록시가 같은 역할을 한다.
 */
const TMAP_ENDPOINT = 'https://apis.openapi.sk.com/tmap/routes/pedestrian?version=1&format=json';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST 요청만 지원합니다.' });
  }

  const appKey = process.env.TMAP_APP_KEY;
  if (!appKey) {
    console.error('[곁길] TMAP_APP_KEY 환경 변수가 설정되지 않았습니다.');
    return res.status(500).json({ error: '경로 탐색 키가 서버에 설정되지 않았습니다.' });
  }

  const { startX, startY, endX, endY } = req.body || {};
  const coords = [startX, startY, endX, endY].map(Number);
  if (coords.some((v) => !Number.isFinite(v))) {
    return res.status(400).json({ error: '출발지와 목적지 좌표가 필요합니다.' });
  }

  try {
    const upstream = await fetch(TMAP_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', appKey },
      body: JSON.stringify({
        startX: coords[0],
        startY: coords[1],
        endX: coords[2],
        endY: coords[3],
        reqCoordType: 'WGS84GEO',
        resCoordType: 'WGS84GEO',
        startName: '출발',
        endName: '도착'
      })
    });

    const data = await upstream.json();
    if (!upstream.ok) {
      console.error('[곁길] TMAP 응답 오류:', upstream.status);
      return res.status(upstream.status).json(data);
    }

    // 같은 구간을 다시 물어볼 일이 많으므로 하루 동안 캐시한다.
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');
    return res.status(200).json(data);
  } catch (error) {
    console.error('[곁길] TMAP 호출 실패:', error);
    return res.status(502).json({ error: '경로 탐색 서버에 연결할 수 없습니다.' });
  }
}
