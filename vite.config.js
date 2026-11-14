import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * 경로 탐색 API 프록시
 * -------------------------------------------------------------
 * 카카오 모빌리티 REST 키와 TMAP 앱키는 "서버 전용 비밀키"입니다.
 * 브라우저에서 직접 호출하면 (1) 키가 그대로 노출되고 (2) CORS 에 막힙니다.
 *
 * 그래서 개발 서버가 대신 호출해 주도록 프록시를 두고,
 * 키는 VITE_ 접두사가 없는 환경 변수로만 읽습니다.
 * (VITE_ 가 없으면 번들에 포함되지 않아 브라우저로 새어나가지 않습니다.)
 *
 *   /api/route/pedestrian  ->  TMAP 보행자 경로
 *   /api/route/car         ->  카카오 모빌리티 자동차 경로
 *
 * 정적 호스팅(빌드 결과물만 배포)에는 프록시가 없으므로,
 * 앱은 자동으로 직선 경로 폴백으로 동작합니다.
 */
const createRouteProxy = (env) => ({
  '/api/route/pedestrian': {
    target: 'https://apis.openapi.sk.com',
    changeOrigin: true,
    rewrite: () => '/tmap/routes/pedestrian?version=1&format=json',
    configure: (proxy) => {
      proxy.on('proxyReq', (proxyReq) => {
        if (env.TMAP_APP_KEY) proxyReq.setHeader('appKey', env.TMAP_APP_KEY)
      })
    }
  },
  '/api/route/car': {
    target: 'https://apis-navi.kakaomobility.com',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api\/route\/car/, '/v1/directions'),
    configure: (proxy) => {
      proxy.on('proxyReq', (proxyReq) => {
        if (env.KAKAO_REST_KEY) proxyReq.setHeader('Authorization', `KakaoAK ${env.KAKAO_REST_KEY}`)
      })
    }
  }
})

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // '' = VITE_ 접두사와 무관하게 모든 변수를 읽음 (서버 쪽에서만 사용)
  const env = loadEnv(mode, process.cwd(), '')
  const proxy = createRouteProxy(env)

  return {
    plugins: [react()],
    server: { proxy },
    preview: { proxy },
    build: {
      // 초기 로딩 체감 속도를 위해 무거운 SDK 를 별도 청크로 분리
      // (rolldown 기반 Vite 8 에서는 manualChunks 를 함수로 넘겨야 한다)
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            if (!id.includes('node_modules')) return undefined
            if (id.includes('@firebase/firestore') || id.includes('@firebase/storage')) return 'firebase-data'
            if (id.includes('@firebase') || id.includes('firebase')) return 'firebase-app'
            if (id.includes('kakao')) return 'kakao-maps'
            if (id.includes('exifr') || id.includes('heic2any') || id.includes('browser-image-compression')) return 'media-tools'
            if (id.includes('react')) return 'react-vendor'
            return undefined
          }
        }
      },
      chunkSizeWarningLimit: 900
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.{js,jsx}']
    }
  }
})
