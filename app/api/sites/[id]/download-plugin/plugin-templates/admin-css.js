/**
 * Generate Admin CSS
 */
export function getAdminCss() {
  return `/**
 * Ghost Post Connector — Premium Admin Styles
 * Light theme by default, dark theme available via settings
 * Scoped under .gp-wrap to avoid WordPress conflicts
 */

/* ==========================================
   WordPress Sidebar — Purple Branding
   (applied globally, not scoped to .gp-wrap)
   ========================================== */

/* Using file URL icon → WP renders as <img> — remove grayscale filter */
#adminmenu .toplevel_page_ghost-post-connector .wp-menu-image img {
    filter: none !important;
    opacity: 1 !important;
    width: 20px !important;
    height: 20px !important;
    padding: 7px 0 !important;
}

#adminmenu .toplevel_page_ghost-post-connector:hover .wp-menu-image img,
#adminmenu .toplevel_page_ghost-post-connector.current .wp-menu-image img,
#adminmenu .toplevel_page_ghost-post-connector.wp-has-current-submenu .wp-menu-image img {
    filter: brightness(1.15) !important;
    opacity: 1 !important;
}

#adminmenu .toplevel_page_ghost-post-connector.current,
#adminmenu .toplevel_page_ghost-post-connector.wp-has-current-submenu {
    background: rgba(155, 77, 224, 0.15) !important;
}

#adminmenu .toplevel_page_ghost-post-connector.current > a,
#adminmenu .toplevel_page_ghost-post-connector.wp-has-current-submenu > a {
    color: #B06AE8 !important;
}

#adminmenu .toplevel_page_ghost-post-connector .wp-submenu a:hover,
#adminmenu .toplevel_page_ghost-post-connector .wp-submenu a.current {
    color: #B06AE8 !important;
}

/* ==========================================
   Design Tokens — DARK theme (default)
   ========================================== */

.gp-wrap {
    /* Primary purple — matches Ghost Post platform */
    --gp-primary: #9B4DE0;
    --gp-primary-hover: #B06AE8;
    --gp-primary-dark: #7B2CBF;
    --gp-primary-light: rgba(155, 77, 224, 0.15);
    --gp-primary-ring: rgba(155, 77, 224, 0.3);

    /* Backgrounds */
    --gp-bg: #0A0A0A;
    --gp-card-bg: #111111;
    --gp-card-bg-hover: #161616;
    --gp-surface: #1a1a1a;

    /* Text */
    --gp-text: #f9fafb;
    --gp-text-secondary: #9ca3af;
    --gp-text-muted: #6b7280;

    /* Borders */
    --gp-border: rgba(155, 77, 224, 0.2);
    --gp-border-light: rgba(155, 77, 224, 0.1);
    --gp-border-strong: rgba(155, 77, 224, 0.35);

    /* Inputs */
    --gp-input-bg: rgba(0, 0, 0, 0.4);
    --gp-input-border: rgba(155, 77, 224, 0.3);

    /* Code */
    --gp-code-bg: rgba(155, 77, 224, 0.1);
    --gp-code-border: rgba(155, 77, 224, 0.2);
    --gp-code-text: #c4b5fd;

    /* Status colors */
    --gp-emerald: #4ade80;
    --gp-emerald-light: rgba(74, 222, 128, 0.1);
    --gp-emerald-dark: #22c55e;

    --gp-rose: #f87171;
    --gp-rose-light: rgba(248, 113, 113, 0.1);
    --gp-rose-dark: #ef4444;

    --gp-amber: #fbbf24;
    --gp-amber-light: rgba(251, 191, 36, 0.1);
    --gp-amber-dark: #f59e0b;

    /* Radii */
    --gp-radius-sm: 6px;
    --gp-radius-md: 10px;
    --gp-radius-lg: 12px;
    --gp-radius-xl: 16px;
    --gp-radius-full: 999px;

    /* Shadows */
    --gp-shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.3);
    --gp-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.4), 0 1px 2px -1px rgba(0, 0, 0, 0.3);
    --gp-shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.4), 0 2px 4px -2px rgba(0, 0, 0, 0.3);
    --gp-shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -4px rgba(0, 0, 0, 0.4);

    /* Typography */
    --gp-font: system-ui, -apple-system, 'Inter', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;

    /* Motion */
    --gp-transition: 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

/* ==========================================
   Design Tokens — LIGHT theme override
   ========================================== */

.gp-wrap.gp-theme-light {
    --gp-primary: #7B2CBF;
    --gp-primary-hover: #9B4DE0;
    --gp-primary-dark: #5A1A9A;
    --gp-primary-light: rgba(123, 44, 191, 0.08);
    --gp-primary-ring: rgba(123, 44, 191, 0.25);

    --gp-bg: #ffffff;
    --gp-card-bg: #ffffff;
    --gp-card-bg-hover: #faf9ff;
    --gp-surface: #f3f4f6;

    --gp-text: #111827;
    --gp-text-secondary: #6b7280;
    --gp-text-muted: #9ca3af;

    --gp-border: #e5e7eb;
    --gp-border-light: #f3f4f6;
    --gp-border-strong: #d1d5db;

    --gp-input-bg: #f9fafb;
    --gp-input-border: #d1d5db;

    --gp-code-bg: #f3f4f6;
    --gp-code-border: #e5e7eb;
    --gp-code-text: #7B2CBF;

    --gp-emerald: #10b981;
    --gp-emerald-light: #ecfdf5;
    --gp-emerald-dark: #059669;

    --gp-rose: #f43f5e;
    --gp-rose-light: #fff1f2;
    --gp-rose-dark: #e11d48;

    --gp-amber: #f59e0b;
    --gp-amber-light: #fffbeb;
    --gp-amber-dark: #d97706;

    --gp-shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
    --gp-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1);
    --gp-shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);
    --gp-shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1);
}

/* ==========================================
   Base Reset & Layout
   ========================================== */

.gp-wrap {
    max-width: 960px;
    font-family: var(--gp-font);
    color: var(--gp-text);
    -webkit-font-smoothing: antialiased;
}

.gp-wrap *,
.gp-wrap *::before,
.gp-wrap *::after {
    box-sizing: border-box;
}

/* Force inline SVGs to respect sizing */
.gp-wrap svg {
    display: inline-block;
    vertical-align: middle;
    flex-shrink: 0;
    max-width: 100%;
    height: auto;
}

/* ==========================================
   Header
   ========================================== */

.gp-wrap .gp-header {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 28px 0 24px;
}

.gp-wrap .gp-header-icon {
    width: 36px;
    height: 36px;
    flex-shrink: 0;
    filter: drop-shadow(0 1px 2px rgba(0,0,0,0.15));
}

.gp-wrap .gp-header-title {
    font-size: 22px;
    font-weight: 700;
    color: #111827;
    letter-spacing: -0.025em;
    margin: 0;
    padding: 0;
    border: none;
    line-height: 1.3;
}

.gp-wrap .gp-header-subtitle {
    font-size: 14px;
    color: var(--gp-text-muted);
    font-weight: 400;
    margin-inline-start: auto;
}

/* ==========================================
   Cards
   ========================================== */

.gp-wrap .gp-card {
    background: var(--gp-card-bg);
    border: 1px solid var(--gp-border);
    border-radius: var(--gp-radius-lg);
    padding: 24px;
    margin-bottom: 20px;
    box-shadow: var(--gp-shadow);
    transition: box-shadow var(--gp-transition), background var(--gp-transition);
}

.gp-wrap .gp-card:hover {
    box-shadow: var(--gp-shadow-md);
    background: var(--gp-card-bg-hover);
}

.gp-wrap .gp-card-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 20px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--gp-border-light);
}

.gp-wrap .gp-card-icon {
    width: 20px;
    height: 20px;
    min-width: 20px;
    min-height: 20px;
    max-width: 20px;
    max-height: 20px;
    color: var(--gp-primary);
    flex-shrink: 0;
}

.gp-wrap .gp-card-title {
    font-size: 15px;
    font-weight: 600;
    color: var(--gp-text);
    margin: 0;
    padding: 0;
    border: none;
    line-height: 1.4;
}

/* Card grid layout */
.gp-wrap .gp-card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 20px;
    margin-bottom: 20px;
}

.gp-wrap .gp-card-grid .gp-card {
    margin-bottom: 0;
}

/* ==========================================
   Status Hero Card
   ========================================== */

.gp-wrap .gp-status-hero {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 20px 24px;
    border-radius: var(--gp-radius-lg);
    margin-bottom: 20px;
    border: 1px solid var(--gp-border);
    box-shadow: var(--gp-shadow);
}

.gp-wrap .gp-status-hero.gp-status-connected {
    background: var(--gp-emerald-light);
    border-color: rgba(74, 222, 128, 0.25);
}

.gp-wrap .gp-status-hero.gp-status-disconnected {
    background: var(--gp-amber-light);
    border-color: rgba(251, 191, 36, 0.25);
}

.gp-wrap .gp-status-hero.gp-status-error {
    background: var(--gp-rose-light);
    border-color: rgba(248, 113, 113, 0.25);
}

.gp-wrap .gp-status-hero.gp-status-unknown {
    background: var(--gp-surface);
    border-color: var(--gp-border);
}

/* Light theme overrides for status hero */
.gp-wrap.gp-theme-light .gp-status-hero.gp-status-connected {
    background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);
    border-color: #a7f3d0;
}
.gp-wrap.gp-theme-light .gp-status-hero.gp-status-disconnected {
    background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%);
    border-color: #fde68a;
}
.gp-wrap.gp-theme-light .gp-status-hero.gp-status-error {
    background: linear-gradient(135deg, #fff1f2 0%, #ffe4e6 100%);
    border-color: #fecdd3;
}
.gp-wrap.gp-theme-light .gp-status-hero.gp-status-unknown {
    background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
    border-color: #e2e8f0;
}

.gp-wrap .gp-status-pulse {
    width: 14px;
    height: 14px;
    min-width: 14px;
    border-radius: 50%;
    flex-shrink: 0;
    position: relative;
}

.gp-wrap .gp-status-pulse::after {
    content: '';
    position: absolute;
    inset: -3px;
    border-radius: 50%;
    opacity: 0.4;
}

.gp-wrap .gp-status-connected .gp-status-pulse {
    background: var(--gp-emerald);
    box-shadow: 0 0 0 3px rgba(74, 222, 128, 0.2);
}

.gp-wrap .gp-status-connected .gp-status-pulse::after {
    border: 2px solid var(--gp-emerald);
    animation: gp-pulse 2s ease-in-out infinite;
}

.gp-wrap .gp-status-disconnected .gp-status-pulse {
    background: var(--gp-amber);
    box-shadow: 0 0 0 3px rgba(251, 191, 36, 0.2);
}

.gp-wrap .gp-status-error .gp-status-pulse {
    background: var(--gp-rose);
    box-shadow: 0 0 0 3px rgba(248, 113, 113, 0.2);
}

.gp-wrap .gp-status-unknown .gp-status-pulse {
    background: var(--gp-text-muted);
    box-shadow: 0 0 0 3px rgba(107, 114, 128, 0.2);
}

@keyframes gp-pulse {
    0%, 100% { opacity: 0.4; transform: scale(1); }
    50% { opacity: 0; transform: scale(1.6); }
}

.gp-wrap .gp-status-label {
    font-size: 16px;
    font-weight: 600;
}

.gp-wrap .gp-status-connected .gp-status-label { color: var(--gp-emerald); }
.gp-wrap .gp-status-disconnected .gp-status-label { color: var(--gp-amber); }
.gp-wrap .gp-status-error .gp-status-label { color: var(--gp-rose); }
.gp-wrap .gp-status-unknown .gp-status-label { color: var(--gp-text-muted); }

/* Light theme uses darker status label colors */
.gp-wrap.gp-theme-light .gp-status-connected .gp-status-label { color: #059669; }
.gp-wrap.gp-theme-light .gp-status-disconnected .gp-status-label { color: #d97706; }
.gp-wrap.gp-theme-light .gp-status-error .gp-status-label { color: #e11d48; }
.gp-wrap.gp-theme-light .gp-status-unknown .gp-status-label { color: #64748b; }

.gp-wrap .gp-status-meta {
    margin-inline-start: auto;
    text-align: end;
    font-size: 13px;
    color: var(--gp-text-secondary);
    line-height: 1.5;
}

/* ==========================================
   Badges
   ========================================== */

.gp-wrap .gp-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 10px;
    border-radius: var(--gp-radius-full);
    font-size: 12px;
    font-weight: 600;
    line-height: 1.5;
    letter-spacing: 0.01em;
    white-space: nowrap;
}

.gp-wrap .gp-badge-success {
    background: var(--gp-emerald-light);
    color: var(--gp-emerald);
}

.gp-wrap .gp-badge-error {
    background: var(--gp-rose-light);
    color: var(--gp-rose);
}

.gp-wrap .gp-badge-warning {
    background: var(--gp-amber-light);
    color: var(--gp-amber);
}

.gp-wrap .gp-badge-neutral {
    background: var(--gp-surface);
    color: var(--gp-text-secondary);
}

.gp-wrap .gp-badge-primary {
    background: var(--gp-primary-light);
    color: var(--gp-primary);
}

/* Light theme badge overrides for stronger contrast */
.gp-wrap.gp-theme-light .gp-badge-success { color: #059669; }
.gp-wrap.gp-theme-light .gp-badge-error { color: #e11d48; }
.gp-wrap.gp-theme-light .gp-badge-warning { color: #d97706; }

/* ==========================================
   Buttons
   ========================================== */

.gp-wrap .gp-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px 16px;
    border-radius: var(--gp-radius-sm);
    font-size: 13px;
    font-weight: 600;
    font-family: var(--gp-font);
    line-height: 1.4;
    cursor: pointer;
    transition: all var(--gp-transition);
    border: 1px solid transparent;
    text-decoration: none;
    white-space: nowrap;
}

.gp-wrap .gp-btn:focus-visible {
    outline: 2px solid var(--gp-primary);
    outline-offset: 2px;
}

.gp-wrap .gp-btn-primary {
    background: var(--gp-primary);
    color: #fff;
    border-color: var(--gp-primary);
    box-shadow: var(--gp-shadow-sm);
}

.gp-wrap .gp-btn-primary:hover {
    background: var(--gp-primary-hover);
    border-color: var(--gp-primary-hover);
    box-shadow: var(--gp-shadow);
    color: #fff;
}

.gp-wrap .gp-btn-secondary {
    background: var(--gp-surface);
    color: var(--gp-text);
    border-color: var(--gp-border);
    box-shadow: var(--gp-shadow-sm);
}

.gp-wrap .gp-btn-secondary:hover {
    background: var(--gp-card-bg-hover);
    border-color: var(--gp-border-strong);
}

.gp-wrap .gp-btn-danger {
    background: transparent;
    color: var(--gp-rose);
    border-color: var(--gp-rose);
}

.gp-wrap .gp-btn-danger:hover {
    background: var(--gp-rose);
    color: #fff;
}

.gp-wrap .gp-btn-sm {
    padding: 5px 12px;
    font-size: 12px;
}

.gp-wrap .gp-btn-group {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 20px;
}

/* ==========================================
   Info Table
   ========================================== */

.gp-wrap .gp-info-table {
    width: 100%;
    border-collapse: collapse;
}

.gp-wrap .gp-info-table th,
.gp-wrap .gp-info-table td {
    padding: 12px 0;
    border-bottom: 1px solid var(--gp-border-light);
    text-align: start;
    font-size: 14px;
    vertical-align: middle;
}

.gp-wrap .gp-info-table tr:last-child th,
.gp-wrap .gp-info-table tr:last-child td {
    border-bottom: none;
}

.gp-wrap .gp-info-table th {
    width: 170px;
    color: var(--gp-text-secondary);
    font-weight: 500;
}

.gp-wrap .gp-info-table td {
    color: var(--gp-text);
    font-weight: 500;
}

/* Secret blur toggle */
.gp-wrap .gp-secret-wrap {
    display: inline-flex;
    align-items: center;
    gap: 6px;
}
.gp-wrap .gp-secret-value {
    transition: filter 0.2s ease;
}
.gp-wrap .gp-secret-value.gp-blurred {
    filter: blur(5px);
    user-select: none;
}
.gp-wrap .gp-secret-toggle {
    background: none;
    border: none;
    padding: 2px;
    cursor: pointer;
    color: var(--gp-text-muted);
    display: inline-flex;
    align-items: center;
    border-radius: 4px;
    transition: color 0.15s;
}
.gp-wrap .gp-secret-toggle:hover {
    color: var(--gp-primary);
}

.gp-wrap .gp-info-table code {
    background: var(--gp-code-bg);
    border: 1px solid var(--gp-code-border);
    padding: 3px 8px;
    border-radius: var(--gp-radius-sm);
    font-size: 12px;
    font-family: 'SF Mono', 'Cascadia Code', Consolas, monospace;
    color: var(--gp-code-text);
    word-break: break-all;
}

/* ==========================================
   Permissions Grid
   ========================================== */

.gp-wrap .gp-permissions-grid {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 8px;
}

.gp-wrap .gp-permissions-grid li {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: var(--gp-surface);
    border: 1px solid var(--gp-border-light);
    border-radius: var(--gp-radius-sm);
    font-size: 13px;
    color: var(--gp-text);
    transition: background var(--gp-transition);
}

.gp-wrap .gp-permissions-grid li:hover {
    background: var(--gp-primary-light);
    border-color: var(--gp-primary-ring);
}

.gp-wrap .gp-perm-check {
    width: 16px;
    height: 16px;
    min-width: 16px;
    min-height: 16px;
    max-width: 16px;
    max-height: 16px;
    padding: 2px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: var(--gp-emerald);
    color: #fff;
    flex-shrink: 0;
}

/* ==========================================
   Plugins Detection List
   ========================================== */

.gp-wrap .gp-plugins-list {
    list-style: none;
    padding: 0;
    margin: 0;
}

.gp-wrap .gp-plugins-list li {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 0;
    border-bottom: 1px solid var(--gp-border-light);
    font-size: 14px;
}

.gp-wrap .gp-plugins-list li:last-child {
    border-bottom: none;
}

.gp-wrap .gp-plugin-status {
    width: 8px;
    height: 8px;
    min-width: 8px;
    border-radius: 50%;
    flex-shrink: 0;
}

.gp-wrap .gp-plugin-active {
    background: var(--gp-emerald);
    box-shadow: 0 0 0 3px rgba(74, 222, 128, 0.15);
}

.gp-wrap .gp-plugin-inactive {
    background: var(--gp-text-muted);
}

.gp-wrap .gp-plugin-name {
    font-weight: 500;
    color: var(--gp-text);
}

.gp-wrap .gp-plugin-version {
    margin-inline-start: auto;
    font-size: 12px;
    color: var(--gp-text-muted);
    font-family: 'SF Mono', 'Cascadia Code', Consolas, monospace;
}

.gp-wrap .gp-plugin-action {
    margin-inline-start: auto;
}

/* ==========================================
   Section Label
   ========================================== */

.gp-wrap .gp-section-label {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--gp-text-muted);
    margin-top: 20px;
    margin-bottom: 10px;
}

/* ==========================================
   Forms
   ========================================== */

.gp-wrap .gp-form-group {
    margin-bottom: 18px;
}

.gp-wrap .gp-form-group label {
    display: block;
    font-size: 13px;
    font-weight: 600;
    color: var(--gp-text);
    margin-bottom: 6px;
}

.gp-wrap .gp-form-group select,
.gp-wrap .gp-form-group input[type="text"],
.gp-wrap .gp-form-group input[type="url"] {
    min-width: 260px;
    padding: 8px 12px;
    border: 1px solid var(--gp-input-border);
    border-radius: var(--gp-radius-sm);
    font-size: 14px;
    font-family: var(--gp-font);
    color: var(--gp-text);
    background: var(--gp-input-bg);
    transition: border-color var(--gp-transition), box-shadow var(--gp-transition);
}

.gp-wrap .gp-form-group select:focus,
.gp-wrap .gp-form-group input:focus {
    outline: none;
    border-color: var(--gp-primary);
    box-shadow: 0 0 0 3px var(--gp-primary-ring);
}

.gp-wrap .gp-form-hint {
    margin-top: 6px;
    font-size: 13px;
    color: var(--gp-text-muted);
    font-style: normal;
}

/* ==========================================
   Toggle Switch (iOS-style)
   ========================================== */

.gp-wrap .gp-toggle {
    position: relative;
    display: inline-flex;
    align-items: center;
    cursor: pointer;
    gap: 10px;
    font-size: 14px;
    color: var(--gp-text);
}

.gp-wrap .gp-toggle input[type="checkbox"] {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
}

.gp-wrap .gp-toggle-track {
    width: 44px;
    height: 24px;
    background: var(--gp-text-muted);
    border-radius: 12px;
    position: relative;
    transition: background var(--gp-transition);
    flex-shrink: 0;
}

.gp-wrap .gp-toggle-track::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 20px;
    height: 20px;
    background: #fff;
    border-radius: 50%;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
    transition: transform var(--gp-transition);
}

.gp-wrap .gp-toggle input:checked + .gp-toggle-track {
    background: var(--gp-primary);
}

.gp-wrap .gp-toggle input:checked + .gp-toggle-track::after {
    transform: translateX(20px);
}

.gp-wrap .gp-toggle input:focus-visible + .gp-toggle-track {
    box-shadow: 0 0 0 3px var(--gp-primary-ring);
}

/* ==========================================
   Theme Switcher (Segmented Picker)
   ========================================== */

.gp-wrap .gp-theme-switcher {
    display: inline-flex;
    align-items: center;
    background: var(--gp-surface);
    border: 1px solid var(--gp-border);
    border-radius: var(--gp-radius-full);
    padding: 3px;
    gap: 0;
}

.gp-wrap .gp-theme-switcher .gp-theme-option {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 16px;
    border-radius: var(--gp-radius-full);
    font-size: 13px;
    font-weight: 500;
    font-family: var(--gp-font);
    color: var(--gp-text-muted);
    cursor: pointer;
    border: none;
    background: transparent;
    transition: all var(--gp-transition);
    white-space: nowrap;
}

.gp-wrap .gp-theme-switcher .gp-theme-option:hover {
    color: var(--gp-text-secondary);
}

.gp-wrap .gp-theme-switcher .gp-theme-option.gp-active-option {
    background: var(--gp-primary);
    color: #fff;
    box-shadow: var(--gp-shadow-sm);
}

.gp-wrap .gp-theme-switcher .gp-theme-option svg {
    width: 14px;
    height: 14px;
    min-width: 14px;
    max-width: 14px;
}

/* ==========================================
   Error / Alert Box
   ========================================== */

.gp-wrap .gp-alert {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 14px 18px;
    border-radius: var(--gp-radius-md);
    margin: 16px 0;
    font-size: 14px;
    line-height: 1.5;
}

.gp-wrap .gp-alert-icon {
    width: 18px;
    height: 18px;
    min-width: 18px;
    min-height: 18px;
    max-width: 18px;
    max-height: 18px;
    flex-shrink: 0;
}

.gp-wrap .gp-alert-error {
    background: var(--gp-rose-light);
    border: 1px solid rgba(248, 113, 113, 0.25);
    color: var(--gp-rose);
}

.gp-wrap .gp-alert-success {
    background: var(--gp-emerald-light);
    border: 1px solid rgba(74, 222, 128, 0.25);
    color: var(--gp-emerald);
}

.gp-wrap .gp-alert-warning {
    background: var(--gp-amber-light);
    border: 1px solid rgba(251, 191, 36, 0.25);
    color: var(--gp-amber);
}

/* Light theme alert overrides */
.gp-wrap.gp-theme-light .gp-alert-error {
    background: #fff1f2;
    border-color: #fecdd3;
    color: #e11d48;
}
.gp-wrap.gp-theme-light .gp-alert-success {
    background: #ecfdf5;
    border-color: #a7f3d0;
    color: #059669;
}
.gp-wrap.gp-theme-light .gp-alert-warning {
    background: #fffbeb;
    border-color: #fde68a;
    color: #d97706;
}

/* Result box (AJAX feedback) */
.gp-wrap .gp-result-box {
    margin-top: 12px;
    padding: 10px 14px;
    border-radius: var(--gp-radius-sm);
    font-size: 13px;
}

.gp-wrap .gp-result-box.gp-result-success {
    background: var(--gp-emerald-light);
    color: var(--gp-emerald);
    border: 1px solid rgba(74, 222, 128, 0.25);
}

.gp-wrap .gp-result-box.gp-result-error {
    background: var(--gp-rose-light);
    color: var(--gp-rose);
    border: 1px solid rgba(248, 113, 113, 0.25);
}

/* ==========================================
   Divider
   ========================================== */

.gp-wrap .gp-divider {
    border: none;
    border-top: 1px solid var(--gp-border-light);
    margin: 20px 0;
}

/* ==========================================
   Footer
   ========================================== */

.gp-wrap .gp-footer {
    text-align: center;
    padding: 16px 0 8px;
    font-size: 12px;
    color: var(--gp-text-muted);
}

.gp-wrap .gp-footer a {
    color: var(--gp-primary);
    text-decoration: none;
    font-weight: 500;
}

.gp-wrap .gp-footer a:hover {
    text-decoration: underline;
}

/* ==========================================
   Responsive
   ========================================== */

@media screen and (max-width: 782px) {
    .gp-wrap {
        max-width: 100%;
    }

    .gp-wrap .gp-card-grid {
        grid-template-columns: 1fr;
    }

    .gp-wrap .gp-permissions-grid {
        grid-template-columns: 1fr;
    }

    .gp-wrap .gp-info-table th {
        width: 120px;
    }

    .gp-wrap .gp-status-hero {
        flex-wrap: wrap;
    }

    .gp-wrap .gp-status-meta {
        margin-inline-start: 30px;
        text-align: start;
    }

    .gp-wrap .gp-btn-group {
        flex-direction: column;
    }

    .gp-wrap .gp-btn-group .gp-btn {
        width: 100%;
    }
}

/* ==========================================
   Redirections Page
   ========================================== */

.gp-wrap.gp-redirections-page {
    max-width: 1100px;
}

/* Recommendation Banner */
.gp-wrap .gp-recommendation-banner {
    background: var(--gp-amber-light);
    border: 1px solid rgba(251, 191, 36, 0.25);
    border-radius: var(--gp-radius-lg);
    padding: 18px 24px;
    margin-bottom: 20px;
    display: flex;
    align-items: center;
    gap: 16px;
}

.gp-wrap.gp-theme-light .gp-recommendation-banner {
    background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%);
    border-color: #fde68a;
}

.gp-wrap .gp-recommendation-banner .gp-rec-icon {
    font-size: 28px;
    line-height: 1;
    flex-shrink: 0;
}

.gp-wrap .gp-recommendation-banner h3 {
    margin: 0 0 4px;
    font-size: 14px;
    color: var(--gp-amber);
}

.gp-wrap .gp-recommendation-banner p {
    margin: 0;
    color: var(--gp-text-secondary);
    font-size: 13px;
}

#gp-import-result {
    margin-top: 10px;
}

/* Stats Row */
.gp-wrap .gp-redirections-stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
    margin-bottom: 24px;
}

.gp-wrap .gp-stat-card {
    background: var(--gp-card-bg);
    border: 1px solid var(--gp-border);
    border-radius: var(--gp-radius-lg);
    padding: 20px;
    text-align: center;
    box-shadow: var(--gp-shadow-sm);
    transition: box-shadow var(--gp-transition), transform var(--gp-transition);
}

.gp-wrap .gp-stat-card:hover {
    box-shadow: var(--gp-shadow);
    transform: translateY(-1px);
}

.gp-wrap .gp-stat-value {
    font-size: 28px;
    font-weight: 700;
    color: var(--gp-text);
    display: block;
    line-height: 1.2;
}

.gp-wrap .gp-stat-label {
    font-size: 12px;
    color: var(--gp-text-muted);
    margin-top: 4px;
    display: block;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 500;
}

/* Redirect Form */
.gp-wrap .gp-redirect-form-grid {
    display: grid;
    grid-template-columns: 1fr 1fr auto auto;
    gap: 12px;
    align-items: end;
}

.gp-wrap .gp-redirect-form-grid .gp-form-group {
    display: flex;
    flex-direction: column;
}

.gp-wrap .gp-redirect-form-grid .gp-form-group label {
    font-weight: 600;
    margin-bottom: 6px;
    font-size: 13px;
    color: var(--gp-text-secondary);
}

.gp-wrap .gp-redirect-form-grid .gp-form-group input,
.gp-wrap .gp-redirect-form-grid .gp-form-group select {
    padding: 8px 12px;
    border: 1px solid var(--gp-input-border);
    border-radius: var(--gp-radius-sm);
    width: 100%;
    font-family: var(--gp-font);
    font-size: 14px;
    color: var(--gp-text);
    background: var(--gp-input-bg);
    transition: border-color var(--gp-transition), box-shadow var(--gp-transition);
}

.gp-wrap .gp-redirect-form-grid .gp-form-group input:focus,
.gp-wrap .gp-redirect-form-grid .gp-form-group select:focus {
    outline: none;
    border-color: var(--gp-primary);
    box-shadow: 0 0 0 3px var(--gp-primary-ring);
}

#gp-redirect-result {
    margin-top: 10px;
}

#gp-cancel-edit {
    display: none;
}

/* Count Badge */
.gp-wrap .gp-count-badge {
    background: var(--gp-primary);
    color: #fff;
    border-radius: var(--gp-radius-full);
    padding: 2px 9px;
    font-size: 12px;
    font-weight: 600;
    margin-inline-start: 8px;
    vertical-align: middle;
}

/* Redirects Table */
.gp-wrap .gp-redirects-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 10px;
}

.gp-wrap .gp-redirects-table th {
    text-align: start;
    padding: 10px 12px;
    border-bottom: 2px solid var(--gp-border);
    font-weight: 600;
    color: var(--gp-text-secondary);
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
}

.gp-wrap .gp-redirects-table td {
    padding: 12px;
    border-bottom: 1px solid var(--gp-border-light);
    vertical-align: middle;
    font-size: 14px;
    color: var(--gp-text);
}

.gp-wrap .gp-redirects-table tr:hover {
    background: var(--gp-surface);
}

.gp-wrap .gp-redirects-table tr.gp-inactive {
    opacity: 0.45;
}

.gp-wrap .gp-redirects-table td code {
    background: var(--gp-code-bg);
    border: 1px solid var(--gp-code-border);
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 12px;
    font-family: 'SF Mono', 'Cascadia Code', Consolas, monospace;
    color: var(--gp-code-text);
    word-break: break-all;
}

/* Type Badge */
.gp-wrap .gp-type-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: var(--gp-radius-full);
    font-size: 11px;
    font-weight: 700;
}

.gp-wrap .gp-type-301 {
    background: var(--gp-emerald-light);
    color: var(--gp-emerald);
}

.gp-wrap .gp-type-302 {
    background: var(--gp-primary-light);
    color: var(--gp-primary);
}

.gp-wrap .gp-type-307 {
    background: var(--gp-amber-light);
    color: var(--gp-amber);
}

/* Status Toggle */
.gp-wrap .gp-toggle-status {
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    background: none;
    border: none;
    padding: 4px 8px;
    border-radius: var(--gp-radius-sm);
    font-family: var(--gp-font);
    color: var(--gp-text);
    transition: background var(--gp-transition);
}

.gp-wrap .gp-toggle-status:hover {
    background: var(--gp-surface);
}

.gp-wrap .gp-toggle-status .gp-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    display: inline-block;
}

.gp-wrap .gp-toggle-status.gp-active .gp-dot {
    background: var(--gp-emerald);
}

.gp-wrap .gp-toggle-status.gp-not-active .gp-dot {
    background: var(--gp-rose);
}

/* Row Actions */
.gp-wrap .gp-row-actions a {
    text-decoration: none;
    margin-inline-end: 8px;
    font-size: 13px;
    font-weight: 500;
    color: var(--gp-primary);
}

.gp-wrap .gp-row-actions a:hover {
    text-decoration: underline;
}

.gp-wrap .gp-row-actions .gp-delete-redirect {
    color: var(--gp-rose);
}

.gp-wrap .gp-row-actions .gp-delete-redirect:hover {
    color: var(--gp-rose-dark);
}

/* Empty State */
.gp-wrap .gp-empty-state {
    text-align: center;
    padding: 48px 20px;
    color: var(--gp-text-muted);
}

.gp-wrap .gp-empty-state .dashicons {
    font-size: 48px;
    width: 48px;
    height: 48px;
    color: var(--gp-border);
    margin-bottom: 12px;
}

/* Responsive - Redirections */
@media screen and (max-width: 1200px) {
    .gp-wrap .gp-redirect-form-grid {
        grid-template-columns: 1fr 1fr;
    }
}

@media screen and (max-width: 782px) {
    .gp-wrap.gp-redirections-page {
        max-width: 100%;
    }

    .gp-wrap .gp-redirections-stats {
        grid-template-columns: repeat(2, 1fr);
    }

    .gp-wrap .gp-redirect-form-grid {
        grid-template-columns: 1fr;
    }

    .gp-wrap .gp-redirects-table {
        font-size: 13px;
    }
}

/* ==========================================
   Dashboard Widget
   ========================================== */

.gp-wrap.gp-widget {
    margin: -11px -12px;
    padding: 0;
}

.gp-wrap .gp-widget-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 14px 16px;
    border-bottom: 1px solid var(--gp-border);
}

.gp-wrap .gp-widget-icon {
    flex-shrink: 0;
}

.gp-wrap .gp-widget-title {
    font-size: 14px;
    font-weight: 700;
    color: #111827;
}

.gp-wrap .gp-widget-body {
    padding: 16px;
}

.gp-wrap .gp-widget-stat {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    background: var(--gp-bg);
    border-radius: var(--gp-radius);
    margin-bottom: 12px;
}

.gp-wrap .gp-widget-stat-label {
    font-size: 13px;
    color: var(--gp-text-muted);
    font-weight: 500;
}

.gp-wrap .gp-widget-stat-value {
    font-size: 22px;
    font-weight: 700;
    line-height: 1;
}

.gp-wrap .gp-widget-stat-value small {
    font-size: 13px;
    font-weight: 400;
    color: var(--gp-text-muted);
}

.gp-wrap .gp-score-good { color: #10b981; }
.gp-wrap .gp-score-ok   { color: #f59e0b; }
.gp-wrap .gp-score-bad  { color: #ef4444; }

.gp-wrap .gp-widget-insights {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    background: linear-gradient(135deg, rgba(155,77,224,0.08), rgba(155,77,224,0.16));
    border: 1px solid rgba(155,77,224,0.25);
    border-radius: var(--gp-radius);
    font-size: 13px;
    font-weight: 600;
    color: var(--gp-primary);
    margin-bottom: 12px;
}

.gp-wrap .gp-widget-insights-icon {
    font-size: 18px;
}

.gp-wrap .gp-widget-activity {
    font-size: 12px;
    color: var(--gp-text-muted);
    margin: 0 0 8px;
}

.gp-wrap .gp-widget-empty {
    font-size: 13px;
    color: var(--gp-text-muted);
    text-align: center;
    padding: 12px 0;
    margin: 0;
}

.gp-wrap .gp-widget-footer {
    padding: 12px 16px;
    border-top: 1px solid var(--gp-border);
    text-align: center;
}

.gp-wrap .gp-widget-footer .gp-btn {
    width: 100%;
    justify-content: center;
}

.gp-wrap .gp-widget-last-sync {
    font-size: 11px;
    color: var(--gp-text-muted);
    margin: 6px 0 0;
    display: none;
}

/* Widget Sync Button */
.gp-wrap .gp-widget-sync {
    margin-inline-start: auto;
    background: none;
    border: none;
    padding: 4px;
    cursor: pointer;
    color: var(--gp-text-muted);
    border-radius: 4px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: color 0.15s, background 0.15s;
}

.gp-wrap .gp-widget-sync:hover {
    color: var(--gp-primary);
    background: var(--gp-primary-light);
}

.gp-wrap .gp-widget-sync.gp-syncing .gp-widget-sync-icon {
    animation: gp-spin 0.8s linear infinite;
}

@keyframes gp-spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
}

/* ==========================================
   RTL Overrides
   ========================================== */

[dir="rtl"] .gp-wrap .gp-header {
    direction: rtl;
}

[dir="rtl"] .gp-wrap .gp-status-hero {
    flex-direction: row-reverse;
}

[dir="rtl"] .gp-wrap .gp-info-table th,
[dir="rtl"] .gp-wrap .gp-redirects-table th {
    text-align: right;
}

[dir="rtl"] .gp-wrap .gp-recommendation-banner {
    flex-direction: row-reverse;
}

[dir="rtl"] .gp-wrap .gp-alert {
    flex-direction: row-reverse;
}

[dir="rtl"] .gp-wrap .gp-btn-group {
    flex-direction: row-reverse;
}

[dir="rtl"] .gp-wrap .gp-toggle-track::after {
    left: auto;
    right: 2px;
}

[dir="rtl"] .gp-wrap .gp-toggle input:checked + .gp-toggle-track::after {
    transform: translateX(-20px);
}

[dir="rtl"] .gp-wrap .gp-redirects-table td code {
    direction: ltr;
    unicode-bidi: embed;
}

/* ==========================================
   WordPress Native Overrides
   (override WP defaults inside .gp-wrap)
   ========================================== */

/* Override WP widefat table for dark theme */
.gp-wrap .widefat {
    background: var(--gp-card-bg);
    border-color: var(--gp-border);
}

.gp-wrap .widefat thead th,
.gp-wrap .widefat thead td {
    background: var(--gp-surface);
    color: var(--gp-text-secondary);
    border-color: var(--gp-border);
}

.gp-wrap .widefat tbody td {
    background: var(--gp-card-bg);
    color: var(--gp-text);
    border-color: var(--gp-border-light);
}

.gp-wrap .widefat tbody tr:hover td {
    background: var(--gp-surface);
}

.gp-wrap .widefat tbody tr.gp-inactive-row td {
    opacity: 0.45;
}

/* Override WP native .button within our wrapper */
.gp-wrap .button,
.gp-wrap .button-secondary {
    background: var(--gp-surface) !important;
    color: var(--gp-text) !important;
    border-color: var(--gp-border) !important;
    box-shadow: var(--gp-shadow-sm) !important;
    border-radius: var(--gp-radius-sm) !important;
    font-family: var(--gp-font) !important;
    transition: all var(--gp-transition) !important;
}

.gp-wrap .button:hover,
.gp-wrap .button-secondary:hover {
    background: var(--gp-card-bg-hover) !important;
    border-color: var(--gp-border-strong) !important;
    color: var(--gp-text) !important;
}

.gp-wrap .button-primary {
    background: var(--gp-primary) !important;
    color: #fff !important;
    border-color: var(--gp-primary) !important;
    box-shadow: var(--gp-shadow-sm) !important;
    border-radius: var(--gp-radius-sm) !important;
    font-family: var(--gp-font) !important;
    transition: all var(--gp-transition) !important;
}

.gp-wrap .button-primary:hover {
    background: var(--gp-primary-hover) !important;
    border-color: var(--gp-primary-hover) !important;
    color: #fff !important;
}

/* Override WP dashicons color within our wrapper */
.gp-wrap .dashicons {
    color: var(--gp-text-secondary);
}

/* Override WP notice within our wrapper */
.gp-wrap .notice {
    background: var(--gp-card-bg);
    border-color: var(--gp-border);
    color: var(--gp-text);
    box-shadow: var(--gp-shadow-sm);
}

.gp-wrap .notice-success {
    border-left-color: var(--gp-emerald);
}

.gp-wrap .notice-error {
    border-left-color: var(--gp-rose);
}

/* ==========================================
   Sidebar Branding
   ========================================== */

#adminmenu .toplevel_page_ghost-post-connector > a .wp-menu-name {
    font-weight: 700 !important;
}
`;
}
