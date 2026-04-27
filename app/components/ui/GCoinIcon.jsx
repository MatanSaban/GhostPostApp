'use client';

/**
 * GCoinIcon — the brand mark for Ai-GCoins.
 * Drop-in replacement for any "credit" icon. Renders the gcoin.svg from
 * /public so the artwork stays identical across the apps. Pass `size` (px,
 * applied to width and height) and an optional className/title.
 */
export default function GCoinIcon({ size = 18, className = '', title, style, ...rest }) {
  return (
    <img
      src="/gcoin.svg"
      alt={title || ''}
      width={size}
      height={size}
      className={className}
      style={{ display: 'inline-block', verticalAlign: 'middle', ...style }}
      aria-hidden={title ? undefined : true}
      {...rest}
    />
  );
}
