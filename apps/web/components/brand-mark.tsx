// ブランドのロゴマーク（虫眼鏡＝商談前リサーチ）。外部画像に依存しないインラインSVG。
// ヘッダー等で使い回すため、サイズは className で調整できるようにする。
export function BrandMark({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient
          id="brandmark-g"
          x1="0"
          y1="0"
          x2="32"
          y2="32"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#6366F1" />
          <stop offset="1" stopColor="#8B5CF6" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#brandmark-g)" />
      <circle cx="14" cy="14" r="6" fill="none" stroke="#fff" strokeWidth="2.4" />
      <path
        d="M18.4 18.4 L23 23"
        stroke="#fff"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
