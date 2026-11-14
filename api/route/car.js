/**
 * 카카오모빌리티 자동차 경로 탐색 프록시 (Vercel Serverless Function)
 *
 * 카카오 REST 키는 서버 전용 비밀키다.
 * 브라우저에서 Authorization 헤더에 직접 넣으면 키가 그대로 공개되고, CORS 에도 막힌다.
 *
 * 키는 Vercel 프로젝트 설정 > Environment Variables 의 KAKAO_REST_KEY 로 주입된다.
 * (VITE_ 접두사가 없으므로 프론트엔드 번들에는 절대 포함되지 않는다.)
 */
const KAKAO_ENDPOINT = 'https://apis-navi.kakaomobility.com/v1/directions';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'GET 요청만 지원합니다.' });
  }

  const restKey = process.env.KAKAO_REST_KEY;
  if (!restKey) {
    console.error('[곁길] KAKAO_REST_KEY 환경 변수가 설정되지 않았습니다.');
    return res.status(500).json({ error: '경로 탐색 키가 서버에 설정되지 않았습니다.' });
  }

  const { origin, destination } = req.query || {};

  // "경도,위도" 형식만 통과시킨다 (임의 값을 그대로 외부 API 로 넘기지 않기 위함)
  const isLngLat = (value) =>
    typeof value === 'string' &&
    value.split(',').length === 2 &&
    value.split(',').every((n) => Number.isFinite(Number(n)));

  if (!isLngLat(origin) || !isLngLat(destination)) {
    return res.status(400).json({ error: 'origin 과 destination 은 "경도,위도" 형식이어야 합니다.' });
  }

  try {
    const url = `${KAKAO_ENDPOINT}?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}`;
    const upstream = await fetch(url, { headers: { Authorization: `KakaoAK ${restKey}` } });

    const data = await upstream.json();
    if (!upstream.ok) {
      console.error('[곁길] 카카오모빌리티 응답 오류:', upstream.status);
      return res.status(upstream.status).json(data);
    }

    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');
    return res.status(200).json(data);
  } catch (error) {
    console.error('[곁길] 카카오모빌리티 호출 실패:', error);
    return res.status(502).json({ error: '경로 탐색 서버에 연결할 수 없습니다.' });
  }
}
