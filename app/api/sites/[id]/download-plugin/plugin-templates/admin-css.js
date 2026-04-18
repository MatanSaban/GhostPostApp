/**
 * Generate Admin CSS
 */
export function getAdminCss() {
  return `/**
 * Ghost Post Admin — Tabbed UI + Dashboard Widget
 */

/* ==========================================
   WordPress Sidebar — Purple Branding
   (applied globally, not scoped to any wrapper)
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

#adminmenu .toplevel_page_ghost-post-connector > a .wp-menu-name {
    font-weight: 700 !important;
}

/* ==========================================
   Reset & Wrapper
   ========================================== */
.gp-admin-wrap {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif;
    background: #f0f0f0;
    min-height: 100vh;
    margin-left: -20px;
    margin-top: -1px;
}

/* ==========================================
   Top Bar
   ========================================== */
.gp-topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: #fff;
    border-bottom: 1px solid #e0e0e0;
    padding: 0 32px;
    height: 56px;
    position: sticky;
    top: 32px;
    z-index: 100;
}

.gp-tabs {
    display: flex;
    gap: 0;
    height: 100%;
    align-items: stretch;
}

.gp-tab {
    display: flex;
    align-items: center;
    padding: 0 20px;
    font-size: 14px;
    font-weight: 500;
    color: #555;
    text-decoration: none;
    border-bottom: 3px solid transparent;
    transition: color 0.15s, border-color 0.15s, background 0.15s;
}

.gp-tab:hover {
    color: #1d1d1d;
    background: #f8f8f8;
}

.gp-tab:focus {
    outline: none;
    box-shadow: none;
}

.gp-tab-active {
    color: #fff !important;
    background: #2ecc71 !important;
    border-bottom-color: #2ecc71;
    border-radius: 4px;
    margin: 10px 4px;
    padding: 0 18px;
    height: auto;
    font-weight: 600;
}

.gp-tab-active:hover {
    background: #27ae60 !important;
}

.gp-topbar-brand {
    display: flex;
    align-items: center;
    gap: 12px;
}

.gp-version {
    font-size: 12px;
    color: #2ecc71;
    font-weight: 600;
    background: #e8f8f0;
    padding: 2px 8px;
    border-radius: 4px;
}

.gp-topbar-logo {
    width: 36px;
    height: 36px;
    object-fit: contain;
    border-radius: 6px;
}

/* ==========================================
   Content Area
   ========================================== */
.gp-content {
    padding: 32px;
    max-width: 960px;
    margin: 0 auto;
}

.gp-tab-panel {
    animation: gpFadeIn 0.2s ease;
}

@keyframes gpFadeIn {
    from { opacity: 0; transform: translateY(4px); }
    to   { opacity: 1; transform: translateY(0); }
}

/* ==========================================
   Panel Cards (generic white card)
   ========================================== */
.gp-panel-card,
.gp-connect-card,
.gp-site-info-card {
    background: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 12px;
    padding: 32px;
    margin-bottom: 24px;
}

.gp-panel-card h3,
.gp-site-info-card h3 {
    margin: 0 0 8px;
    font-size: 17px;
    font-weight: 600;
    color: #1d1d1d;
}

.gp-desc {
    color: #777;
    font-size: 13px;
    margin: 0 0 24px;
}

/* ==========================================
   Connection Tab
   ========================================== */
.gp-connect-card {
    text-align: center;
    padding: 48px 32px 40px;
}

.gp-connect-icon {
    color: #2ecc71;
    margin-bottom: 16px;
}

.gp-connect-icon svg {
    width: 48px;
    height: 48px;
}

.gp-connect-card h2 {
    font-size: 22px;
    font-weight: 700;
    color: #1d1d1d;
    margin: 0 0 8px;
}

.gp-connect-desc {
    color: #777;
    font-size: 14px;
    margin: 0 0 28px;
}

.gp-connect-desc a {
    color: #2ecc71;
    text-decoration: underline;
}

/* Key row */
.gp-key-row {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 24px;
    width: 100%;
    max-width: 520px;
}

.gp-key-display {
    flex: 1;
    background: #f7f7f7;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    padding: 12px 16px;
    text-align: center;
}

.gp-key-display code {
    font-size: 14px;
    color: #333;
    background: none;
    letter-spacing: 0.5px;
}

/* Connection details table (when connected) */
.gp-connection-details {
    display: inline-block;
    text-align: left;
    margin-bottom: 24px;
    min-width: 380px;
}

.gp-connect-actions {
    display: flex;
    justify-content: center;
    gap: 12px;
}

.gp-connect-hint {
    color: #999;
    font-size: 12px;
    margin-top: 8px;
}

/* Steps row */
.gp-steps-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
    margin-bottom: 24px;
}

.gp-step-card {
    background: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 12px;
    padding: 24px 16px;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
}

.gp-step-num {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: #e8f8f0;
    color: #2ecc71;
    font-weight: 700;
    font-size: 15px;
    margin-bottom: 4px;
}

.gp-step-card strong {
    font-size: 14px;
    color: #1d1d1d;
}

.gp-step-hint {
    font-size: 12px;
    color: #999;
}

/* ==========================================
   Buttons
   ========================================== */
.gp-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 10px 22px;
    font-size: 14px;
    font-weight: 600;
    border-radius: 8px;
    border: none;
    cursor: pointer;
    text-decoration: none;
    transition: background 0.15s, box-shadow 0.15s, transform 0.1s;
    line-height: 1.4;
}

.gp-btn:active {
    transform: scale(0.98);
}

.gp-btn-primary {
    background: #2ecc71;
    color: #fff;
}

.gp-btn-primary:hover {
    background: #27ae60;
    color: #fff;
}

.gp-btn-outline {
    background: #fff;
    color: #555;
    border: 1px solid #d0d0d0;
}

.gp-btn-outline:hover {
    background: #f5f5f5;
    color: #333;
}

.gp-btn-connect {
    background: #2ecc71;
    color: #fff;
    padding: 14px 32px;
    font-size: 15px;
    border-radius: 28px;
}

.gp-btn-connect:hover {
    background: #27ae60;
    color: #fff;
}

.gp-btn-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 6px;
    border: 1px solid #e0e0e0;
    background: #fff;
    cursor: pointer;
    color: #666;
    transition: background 0.15s, color 0.15s;
}

.gp-btn-icon:hover {
    background: #f0f0f0;
    color: #333;
}

.gp-btn-icon.gp-btn-danger:hover {
    background: #fef2f2;
    color: #dc3545;
    border-color: #fca5a5;
}

/* ==========================================
   Info Table
   ========================================== */
.gp-info-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 16px;
}

.gp-info-table th,
.gp-info-table td {
    padding: 10px 0;
    text-align: left;
    border-bottom: 1px solid #f0f0f0;
    font-size: 13px;
}

.gp-info-table th {
    width: 40%;
    font-weight: 500;
    color: #888;
}

.gp-info-table td code {
    background: #f5f5f5;
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 12px;
    color: #444;
    word-break: break-all;
}

/* ==========================================
   Notices / Results
   ========================================== */
.gp-notice {
    padding: 14px 18px;
    border-radius: 8px;
    margin-bottom: 16px;
}

.gp-notice-warning {
    background: #fffbeb;
    border: 1px solid #fcd34d;
    color: #92400e;
}

.gp-notice p {
    margin: 0;
    font-size: 13px;
}

.gp-result-box {
    margin-top: 16px;
    padding: 12px 16px;
    border-radius: 8px;
    font-size: 13px;
}

.gp-result-box.success {
    background: #e8f8f0;
    border: 1px solid #2ecc71;
    color: #1a7a42;
}

.gp-result-box.error {
    background: #fef2f2;
    border: 1px solid #ef4444;
    color: #991b1b;
}

.gp-result-box.loading {
    background: #f5f5f5;
    border: 1px solid #d0d0d0;
    color: #555;
}

/* ==========================================
   Permissions Grid
   ========================================== */
.gp-permissions-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 24px;
    margin-bottom: 24px;
}

.gp-permission-group h4 {
    margin: 0 0 12px;
    font-size: 14px;
    font-weight: 600;
    color: #1d1d1d;
    padding-bottom: 8px;
    border-bottom: 2px solid #f0f0f0;
}

.gp-permission-group label {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 0;
    cursor: pointer;
    font-size: 13px;
    color: #444;
    transition: color 0.15s;
}

.gp-permission-group label:hover {
    color: #2ecc71;
}

.gp-permission-group input[type="checkbox"] {
    accent-color: #2ecc71;
    width: 16px;
    height: 16px;
}

/* ==========================================
   Activity Tab
   ========================================== */
.gp-activity-table {
    width: 100%;
    border-collapse: collapse;
}

.gp-activity-table th,
.gp-activity-table td {
    padding: 10px 12px;
    text-align: left;
    border-bottom: 1px solid #f0f0f0;
    font-size: 13px;
}

.gp-activity-table th {
    font-size: 11px;
    font-weight: 600;
    color: #999;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.gp-activity-time {
    color: #999;
    white-space: nowrap;
}

.gp-activity-badge {
    display: inline-block;
    padding: 2px 10px;
    font-size: 12px;
    font-weight: 600;
    border-radius: 10px;
    background: #e8f8f0;
    color: #2ecc71;
}

/* ==========================================
   Empty State
   ========================================== */
.gp-empty-state {
    text-align: center;
    padding: 48px 20px;
    color: #aaa;
}

.gp-empty-state svg {
    margin-bottom: 12px;
}

.gp-empty-state p {
    font-size: 14px;
    max-width: 360px;
    margin: 0 auto;
    line-height: 1.6;
}

/* ==========================================
   Redirections Tab
   ========================================== */
.gp-redirections-stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
    margin-bottom: 24px;
}

.gp-stat-card {
    background: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 12px;
    padding: 20px;
    text-align: center;
}

.gp-stat-value {
    display: block;
    font-size: 28px;
    font-weight: 700;
    color: #1d1d1d;
    line-height: 1.2;
}

.gp-stat-value.gp-synced { color: #2ecc71; }
.gp-stat-value.gp-not-synced { color: #ef4444; }

.gp-stat-label {
    display: block;
    font-size: 11px;
    color: #999;
    margin-top: 6px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

/* Recommendation banner */
.gp-recommendation-banner {
    background: #fffbeb;
    border: 1px solid #fcd34d;
    border-radius: 12px;
    padding: 24px;
    margin-bottom: 24px;
}

.gp-recommendation-content h3 {
    margin: 0 0 8px;
    font-size: 15px;
    font-weight: 600;
    color: #92400e;
}

.gp-recommendation-content p {
    margin: 0 0 16px;
    font-size: 13px;
    color: #a16207;
    line-height: 1.5;
}

.gp-recommendation-actions {
    display: flex;
    align-items: center;
    gap: 12px;
}

.gp-import-count {
    font-size: 12px;
    color: #a16207;
}

/* Redirect form */
.gp-redirect-form-grid {
    display: grid;
    grid-template-columns: 1fr 1fr auto auto;
    gap: 16px;
    align-items: flex-end;
}

.gp-form-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.gp-form-group label {
    font-size: 13px;
    font-weight: 500;
    color: #555;
}

.gp-form-group input,
.gp-form-group select {
    width: 100%;
    padding: 10px 14px;
    font-size: 13px;
    border: 1px solid #d0d0d0;
    border-radius: 8px;
    background: #fff;
    transition: border-color 0.15s, box-shadow 0.15s;
}

.gp-form-group input:focus,
.gp-form-group select:focus {
    border-color: #2ecc71;
    box-shadow: 0 0 0 3px rgba(46, 204, 113, 0.15);
    outline: none;
}

.gp-form-actions {
    display: flex;
    gap: 8px;
    align-items: flex-end;
    padding-bottom: 1px;
}

/* Redirect table */
.gp-redirects-table {
    width: 100%;
    border-collapse: collapse;
}

.gp-redirects-table th,
.gp-redirects-table td {
    padding: 12px 12px;
    text-align: left;
    border-bottom: 1px solid #f0f0f0;
    font-size: 13px;
}

.gp-redirects-table th {
    font-size: 11px;
    font-weight: 600;
    color: #999;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    background: #fafafa;
}

.gp-redirects-table td code {
    background: #f5f5f5;
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 12px;
    color: #444;
    word-break: break-all;
}

.gp-col-status { width: 40px; text-align: center; }
.gp-col-type { width: 80px; }
.gp-col-hits { width: 60px; text-align: center; }
.gp-col-actions { width: 90px; }

.gp-col-actions {
    display: flex;
    gap: 6px;
}

.gp-count-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 24px;
    height: 24px;
    padding: 0 8px;
    font-size: 12px;
    font-weight: 600;
    background: #f0f0f0;
    color: #888;
    border-radius: 12px;
    margin-left: 8px;
}

/* Status dots */
.gp-toggle-status {
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px;
}

.gp-status-indicator-dot {
    display: inline-block;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    transition: background-color 0.2s;
}

.gp-status-indicator-dot.active {
    background: #2ecc71;
    box-shadow: 0 0 0 3px rgba(46, 204, 113, 0.2);
}

.gp-status-indicator-dot.inactive {
    background: #ccc;
    box-shadow: 0 0 0 3px rgba(204, 204, 204, 0.2);
}

/* Type badges */
.gp-type-badge {
    display: inline-block;
    padding: 3px 10px;
    font-size: 12px;
    font-weight: 600;
    border-radius: 10px;
}

.gp-type-301 { background: #e8f8f0; color: #1a7a42; }
.gp-type-302 { background: #eff6ff; color: #1e40af; }
.gp-type-307 { background: #fffbeb; color: #92400e; }

.gp-inactive-row { opacity: 0.45; }
.gp-inactive-row td code { text-decoration: line-through; }

/* ==========================================
   Add-ons Tab
   ========================================== */
.gp-addons-grid {
    display: flex;
    flex-direction: column;
    gap: 24px;
}

.gp-addon-category-title {
    margin: 0 0 10px;
    font-size: 13px;
    font-weight: 600;
    color: #999;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding-bottom: 8px;
    border-bottom: 1px solid #f0f0f0;
}

.gp-addon-category {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.gp-addon-card {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 18px 20px;
    border: 1px solid #e0e0e0;
    border-radius: 10px;
    background: #fff;
    transition: border-color 0.15s, box-shadow 0.15s;
}

.gp-addon-card:hover {
    border-color: #ccc;
    box-shadow: 0 2px 8px rgba(0,0,0,0.04);
}

.gp-addon-active {
    border-left: 3px solid #2ecc71;
}

.gp-addon-inactive {
    border-left: 3px solid #e0e0e0;
    opacity: 0.6;
}

.gp-addon-dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
}

.gp-addon-dot.active { background: #2ecc71; }
.gp-addon-dot.inactive { background: #ccc; }

.gp-addon-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.gp-addon-info strong {
    font-size: 14px;
    color: #1d1d1d;
}

.gp-addon-desc {
    font-size: 12px;
    color: #999;
}

.gp-addon-version {
    font-size: 11px;
    color: #2ecc71;
    font-weight: 600;
    background: #e8f8f0;
    padding: 2px 8px;
    border-radius: 4px;
    white-space: nowrap;
}

/* ==========================================
   Responsive
   ========================================== */
@media screen and (max-width: 960px) {
    .gp-topbar {
        padding: 0 16px;
        flex-wrap: wrap;
        height: auto;
        padding-top: 8px;
        padding-bottom: 8px;
    }

    .gp-tabs {
        order: 2;
        width: 100%;
        overflow-x: auto;
    }

    .gp-topbar-brand {
        order: 1;
        width: 100%;
        justify-content: flex-end;
        margin-bottom: 8px;
    }

    .gp-content {
        padding: 20px 16px;
    }

    .gp-steps-row {
        grid-template-columns: repeat(2, 1fr);
    }

    .gp-redirections-stats {
        grid-template-columns: repeat(2, 1fr);
    }

    .gp-redirect-form-grid {
        grid-template-columns: 1fr;
    }
}

@media screen and (max-width: 600px) {
    .gp-tab {
        padding: 0 12px;
        font-size: 13px;
    }

    .gp-steps-row {
        grid-template-columns: 1fr 1fr;
    }

    .gp-connect-card {
        padding: 32px 20px;
    }

    .gp-key-row {
        flex-direction: column;
    }
}

/* Hide WP default notices inside our page */
.gp-admin-wrap .notice:not(.gp-notice),
.gp-admin-wrap .updated,
.gp-admin-wrap .error:not(.gp-result-box) {
    display: none;
}

/* ==========================================
   Dashboard Widget — Design Tokens
   (used by .gp-wrap.gp-widget on WP dashboard)
   ========================================== */

.gp-wrap {
    --gp-primary: #9B4DE0;
    --gp-primary-hover: #B06AE8;
    --gp-primary-dark: #7B2CBF;
    --gp-primary-light: rgba(155, 77, 224, 0.15);
    --gp-primary-ring: rgba(155, 77, 224, 0.3);
    --gp-bg: #0A0A0A;
    --gp-card-bg: #111111;
    --gp-card-bg-hover: #161616;
    --gp-surface: #1a1a1a;
    --gp-text: #f9fafb;
    --gp-text-secondary: #9ca3af;
    --gp-text-muted: #6b7280;
    --gp-border: rgba(155, 77, 224, 0.2);
    --gp-border-light: rgba(155, 77, 224, 0.1);
    --gp-border-strong: rgba(155, 77, 224, 0.35);
    --gp-input-bg: rgba(0, 0, 0, 0.4);
    --gp-input-border: rgba(155, 77, 224, 0.3);
    --gp-code-bg: rgba(155, 77, 224, 0.1);
    --gp-code-border: rgba(155, 77, 224, 0.2);
    --gp-code-text: #c4b5fd;
    --gp-emerald: #4ade80;
    --gp-emerald-light: rgba(74, 222, 128, 0.1);
    --gp-emerald-dark: #22c55e;
    --gp-rose: #f87171;
    --gp-rose-light: rgba(248, 113, 113, 0.1);
    --gp-rose-dark: #ef4444;
    --gp-amber: #fbbf24;
    --gp-amber-light: rgba(251, 191, 36, 0.1);
    --gp-amber-dark: #f59e0b;
    --gp-radius-sm: 6px;
    --gp-radius-md: 10px;
    --gp-radius-lg: 12px;
    --gp-radius-xl: 16px;
    --gp-radius-full: 999px;
    --gp-shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.3);
    --gp-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.4), 0 1px 2px -1px rgba(0, 0, 0, 0.3);
    --gp-shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.4), 0 2px 4px -2px rgba(0, 0, 0, 0.3);
    --gp-shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -4px rgba(0, 0, 0, 0.4);
    --gp-font: system-ui, -apple-system, 'Inter', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    --gp-transition: 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.gp-wrap.gp-theme-light {
    --gp-primary: #7B2CBF;
    --gp-primary-hover: #9B4DE0;
    --gp-primary-dark: #5A1A9A;
    --gp-primary-light: rgba(123, 44, 191, 0.08);
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
    --gp-shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
    --gp-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1);
}

/* ==========================================
   Dashboard Widget
   ========================================== */

.gp-wrap.gp-widget {
    margin: -11px -12px;
    padding: 0;
    background: var(--gp-card-bg);
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
    color: var(--gp-text);
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
    border-radius: var(--gp-radius-md);
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
    border-radius: var(--gp-radius-md);
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

/* Dark theme: override WP postbox container for widget */
#gp_dashboard_widget:has(.gp-wrap.gp-widget:not(.gp-theme-light)),
#gp_dashboard_widget:has(.gp-wrap.gp-widget:not(.gp-theme-light)) .postbox-header,
#gp_dashboard_widget:has(.gp-wrap.gp-widget:not(.gp-theme-light)) .inside {
    background: #1a1625;
    color: #e5e7eb;
}

#gp_dashboard_widget:has(.gp-wrap.gp-widget:not(.gp-theme-light)) {
    border-color: rgba(155, 77, 224, 0.18);
}

#gp_dashboard_widget:has(.gp-wrap.gp-widget:not(.gp-theme-light)) .postbox-header {
    border-bottom-color: rgba(155, 77, 224, 0.18);
}

#gp_dashboard_widget:has(.gp-wrap.gp-widget:not(.gp-theme-light)) .hndle {
    color: #e5e7eb;
}
`;
}