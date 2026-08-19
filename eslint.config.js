import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'coverage']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // const { file, ...rest } = spot 처럼 "특정 키만 빼는" 구조 분해를 허용
      'no-unused-vars': ['error', { ignoreRestSiblings: true, varsIgnorePattern: '^_' }],
    },
  },
  {
    // 설정 파일 · 테스트 · Vercel 서버리스 함수는 Node 환경에서 실행된다
    files: ['*.config.js', 'src/**/*.test.{js,jsx}', 'api/**/*.js'],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      // 서버리스 함수는 React 컴포넌트가 아니므로 이 규칙은 해당되지 않는다
      'react-refresh/only-export-components': 'off',
    },
  },
])
