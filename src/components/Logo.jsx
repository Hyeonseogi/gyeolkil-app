/**
 * 곁길 로고 마크 — 두 장소(점)를 잇는 길(선).
 * 상단 바, 로그인 화면, 파비콘(public/favicon.svg)이 같은 모양을 쓴다.
 */
export function LogoMark({ size = 28, background = 'var(--primary)', foreground = '#FFFFFF', title }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={{ display: 'block', flexShrink: 0 }}
    >
      <rect width="28" height="28" rx="8" fill={background} />
      <path d="M8.5 20.5c0-6 11-3 11-10.5" fill="none" stroke={foreground} strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="8.5" cy="20.5" r="2.6" fill={foreground} />
      <circle cx="19.5" cy="9.5" r="2.6" fill={foreground} />
    </svg>
  );
}

/** 마크 + '곁길' 글자 */
export default function Logo({ size = 28 }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
      <LogoMark size={size} />
      <span style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '-0.4px', color: 'var(--ink)' }}>곁길</span>
    </span>
  );
}
