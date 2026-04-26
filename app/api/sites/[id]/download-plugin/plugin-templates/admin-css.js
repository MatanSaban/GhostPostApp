/**
 * Generate Admin CSS
 */
export function getAdminCss() {
  return `/**
 * GhostSEO Admin - Tabbed UI + Dashboard Widget
 */

/* ==========================================
   WordPress Sidebar - Purple Branding
   ========================================== */

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
   Design Tokens - Dark Theme (default)
   ========================================== */
.gp-admin-wrap {
    --gp-bg: #0f0f1a;
    --gp-surface: #1a1a2e;
    --gp-card: #16162a;
    --gp-text: #f0f0f5;
    --gp-text-secondary: #9ca3af;
    --gp-text-muted: #6b7280;
    --gp-border: rgba(155, 77, 224, 0.18);
    --gp-border-light: rgba(155, 77, 224, 0.08);
    --gp-primary: #9B4DE0;
    --gp-primary-hover: #B06AE8;
    --gp-primary-dark: #7B2CBF;
    --gp-gradient: linear-gradient(135deg, #7B2CBF 0%, #4361EE 100%);
    --gp-accent: #00FF9D;
    --gp-success: #4ade80;
    --gp-success-bg: rgba(74, 222, 128, 0.12);
    --gp-danger: #f87171;
    --gp-danger-bg: rgba(248, 113, 113, 0.12);
    --gp-warning: #fbbf24;
    --gp-warning-bg: rgba(251, 191, 36, 0.12);
    --gp-input-bg: rgba(0, 0, 0, 0.3);
    --gp-input-border: rgba(155, 77, 224, 0.25);
    --gp-code-bg: rgba(155, 77, 224, 0.1);
    --gp-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    --gp-topbar-bg: #12122a;
    --gp-tab-hover: rgba(155, 77, 224, 0.08);
}

/* Light Theme Overrides */
.gp-admin-wrap.gp-theme-light {
    --gp-bg: #f5f5f7;
    --gp-surface: #ffffff;
    --gp-card: #ffffff;
    --gp-text: #1d1d1f;
    --gp-text-secondary: #6b7280;
    --gp-text-muted: #9ca3af;
    --gp-border: rgba(0, 0, 0, 0.1);
    --gp-border-light: rgba(0, 0, 0, 0.05);
    --gp-primary: #7B2CBF;
    --gp-primary-hover: #9B4DE0;
    --gp-primary-dark: #5A1A9A;
    --gp-gradient: linear-gradient(135deg, #7B2CBF 0%, #4361EE 100%);
    --gp-success-bg: rgba(74, 222, 128, 0.08);
    --gp-danger-bg: rgba(248, 113, 113, 0.08);
    --gp-warning-bg: rgba(251, 191, 36, 0.1);
    --gp-input-bg: #f9fafb;
    --gp-input-border: #d1d5db;
    --gp-code-bg: rgba(0, 0, 0, 0.04);
    --gp-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    --gp-topbar-bg: #ffffff;
    --gp-tab-hover: rgba(0, 0, 0, 0.04);
}

/* ==========================================
   Reset & Wrapper
   ========================================== */
.gp-admin-wrap {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif;
    background: var(--gp-bg);
    color: var(--gp-text);
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
    background: var(--gp-topbar-bg);
    border-bottom: 1px solid var(--gp-border);
    padding: 0 32px;
    height: 56px;
    position: sticky;
    top: 32px;
    z-index: 100;
}

.gp-topbar-brand {
    display: flex;
    align-items: center;
    gap: 10px;
}

.gp-topbar-logo {
    width: 28px;
    height: 28px;
    object-fit: contain;
    border-radius: 6px;
}

.gp-topbar-title {
    font-size: 16px;
    font-weight: 700;
    color: var(--gp-text);
    letter-spacing: -0.3px;
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
    color: var(--gp-text-secondary);
    text-decoration: none;
    border-bottom: 3px solid transparent;
    transition: color 0.15s, border-color 0.15s, background 0.15s;
}

.gp-tab:hover {
    color: var(--gp-text);
    background: var(--gp-tab-hover);
}

.gp-tab:focus {
    outline: none;
    box-shadow: none;
}

.gp-tab-active {
    color: #fff !important;
    background: var(--gp-gradient) !important;
    border-bottom-color: transparent;
    border-radius: 4px;
    margin: 10px 4px;
    padding: 0 18px;
    height: auto;
    font-weight: 600;
}

.gp-tab-active:hover {
    opacity: 0.92;
}

.gp-version {
    font-size: 11px;
    color: var(--gp-primary);
    font-weight: 600;
    background: rgba(155, 77, 224, 0.12);
    padding: 2px 8px;
    border-radius: 4px;
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
   Panel Cards
   ========================================== */
.gp-panel-card,
.gp-connect-card,
.gp-site-info-card {
    background: var(--gp-card);
    border: 1px solid var(--gp-border);
    border-radius: 12px;
    padding: 32px;
    margin-bottom: 24px;
    box-shadow: var(--gp-shadow);
}

.gp-panel-card h3,
.gp-site-info-card h3 {
    margin: 0 0 8px;
    font-size: 17px;
    font-weight: 600;
    color: var(--gp-text);
}

.gp-desc {
    color: var(--gp-text-muted);
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

.gp-connect-card h2 {
    font-size: 22px;
    font-weight: 700;
    color: var(--gp-text);
    margin: 0 0 8px;
}

.gp-connect-desc {
    color: var(--gp-text-secondary);
    font-size: 14px;
    margin: 0 0 28px;
}

.gp-connect-desc a {
    color: var(--gp-primary);
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
    background: var(--gp-input-bg);
    border: 1px solid var(--gp-border);
    border-radius: 8px;
    padding: 12px 16px;
    text-align: center;
}

.gp-key-display code {
    font-size: 14px;
    color: var(--gp-text);
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
    color: var(--gp-text-muted);
    font-size: 12px;
    margin-top: 8px;
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
    background: var(--gp-gradient);
    color: #fff;
}

.gp-btn-primary:hover {
    opacity: 0.9;
    color: #fff;
}

.gp-btn-outline {
    background: transparent;
    color: var(--gp-text-secondary);
    border: 1px solid var(--gp-border);
}

.gp-btn-outline:hover {
    background: var(--gp-tab-hover);
    color: var(--gp-text);
}

.gp-btn-connect {
    background: var(--gp-gradient);
    color: #fff;
    padding: 14px 32px;
    font-size: 15px;
    border-radius: 28px;
}

.gp-btn-connect:hover {
    opacity: 0.9;
    color: #fff;
}

.gp-btn-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 6px;
    border: 1px solid var(--gp-border);
    background: transparent;
    cursor: pointer;
    color: var(--gp-text-secondary);
    transition: background 0.15s, color 0.15s;
}

.gp-btn-icon:hover {
    background: var(--gp-tab-hover);
    color: var(--gp-text);
}

.gp-btn-icon.gp-btn-danger:hover {
    background: var(--gp-danger-bg);
    color: var(--gp-danger);
    border-color: rgba(248, 113, 113, 0.3);
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
    border-bottom: 1px solid var(--gp-border-light);
    font-size: 13px;
}

.gp-info-table th {
    width: 40%;
    font-weight: 500;
    color: var(--gp-text-muted);
}

.gp-info-table td {
    color: var(--gp-text);
}

.gp-info-table td code {
    background: var(--gp-code-bg);
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 12px;
    color: var(--gp-text);
    word-break: break-all;
}

.gp-info-table td a {
    color: var(--gp-primary);
    text-decoration: none;
}

.gp-info-table td a:hover {
    text-decoration: underline;
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
    background: var(--gp-warning-bg);
    border: 1px solid rgba(251, 191, 36, 0.3);
    color: var(--gp-warning);
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
    background: var(--gp-success-bg);
    border: 1px solid rgba(74, 222, 128, 0.3);
    color: var(--gp-success);
}

.gp-result-box.error {
    background: var(--gp-danger-bg);
    border: 1px solid rgba(248, 113, 113, 0.3);
    color: var(--gp-danger);
}

.gp-result-box.loading {
    background: var(--gp-code-bg);
    border: 1px solid var(--gp-border);
    color: var(--gp-text-secondary);
}

/* ==========================================
   Theme Switcher
   ========================================== */
.gp-theme-switcher {
    display: flex;
    gap: 20px;
}

.gp-theme-option {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    cursor: pointer;
}

.gp-theme-option input[type="radio"] {
    display: none;
}

.gp-theme-preview {
    width: 120px;
    height: 80px;
    border-radius: 10px;
    border: 2px solid var(--gp-border);
    overflow: hidden;
    transition: border-color 0.2s, box-shadow 0.2s;
    position: relative;
}

.gp-theme-option input:checked + .gp-theme-preview {
    border-color: var(--gp-primary);
    box-shadow: 0 0 0 3px rgba(155, 77, 224, 0.25);
}

.gp-theme-preview-dark {
    background: #0f0f1a;
}

.gp-theme-preview-dark .gp-theme-preview-bar {
    display: block;
    height: 16px;
    background: #12122a;
    border-bottom: 1px solid rgba(155, 77, 224, 0.18);
}

.gp-theme-preview-dark .gp-theme-preview-content {
    display: block;
    margin: 8px;
    height: 12px;
    border-radius: 4px;
    background: #16162a;
}

.gp-theme-preview-light {
    background: #f5f5f7;
}

.gp-theme-preview-light .gp-theme-preview-bar {
    display: block;
    height: 16px;
    background: #ffffff;
    border-bottom: 1px solid rgba(0, 0, 0, 0.1);
}

.gp-theme-preview-light .gp-theme-preview-content {
    display: block;
    margin: 8px;
    height: 12px;
    border-radius: 4px;
    background: #ffffff;
}

.gp-theme-label {
    font-size: 13px;
    font-weight: 500;
    color: var(--gp-text-secondary);
}

.gp-theme-option input:checked ~ .gp-theme-label {
    color: var(--gp-primary);
    font-weight: 600;
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
    border-bottom: 1px solid var(--gp-border-light);
    font-size: 13px;
    color: var(--gp-text);
}

.gp-activity-table th {
    font-size: 11px;
    font-weight: 600;
    color: var(--gp-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.gp-activity-time {
    color: var(--gp-text-muted);
    white-space: nowrap;
}

.gp-activity-badge {
    display: inline-block;
    padding: 2px 10px;
    font-size: 12px;
    font-weight: 600;
    border-radius: 10px;
    background: rgba(155, 77, 224, 0.12);
    color: var(--gp-primary);
}

/* ==========================================
   Empty State
   ========================================== */
.gp-empty-state {
    text-align: center;
    padding: 48px 20px;
    color: var(--gp-text-muted);
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
    background: var(--gp-card);
    border: 1px solid var(--gp-border);
    border-radius: 12px;
    padding: 20px;
    text-align: center;
    box-shadow: var(--gp-shadow);
}

.gp-stat-value {
    display: block;
    font-size: 28px;
    font-weight: 700;
    color: var(--gp-text);
    line-height: 1.2;
}

.gp-stat-value.gp-synced { color: var(--gp-success); }
.gp-stat-value.gp-not-synced { color: var(--gp-danger); }

.gp-stat-label {
    display: block;
    font-size: 11px;
    color: var(--gp-text-muted);
    margin-top: 6px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

/* Recommendation banner */
.gp-recommendation-banner {
    background: var(--gp-warning-bg);
    border: 1px solid rgba(251, 191, 36, 0.3);
    border-radius: 12px;
    padding: 24px;
    margin-bottom: 24px;
}

.gp-recommendation-content h3 {
    margin: 0 0 8px;
    font-size: 15px;
    font-weight: 600;
    color: var(--gp-warning);
}

.gp-recommendation-content p {
    margin: 0 0 16px;
    font-size: 13px;
    color: var(--gp-text-secondary);
    line-height: 1.5;
}

.gp-recommendation-actions {
    display: flex;
    align-items: center;
    gap: 12px;
}

.gp-import-count {
    font-size: 12px;
    color: var(--gp-text-muted);
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
    color: var(--gp-text-secondary);
}

.gp-form-group input,
.gp-form-group select {
    width: 100%;
    padding: 10px 14px;
    font-size: 13px;
    border: 1px solid var(--gp-input-border);
    border-radius: 8px;
    background: var(--gp-input-bg);
    color: var(--gp-text);
    transition: border-color 0.15s, box-shadow 0.15s;
}

.gp-form-group input:focus,
.gp-form-group select:focus {
    border-color: var(--gp-primary);
    box-shadow: 0 0 0 3px rgba(155, 77, 224, 0.15);
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
    border-bottom: 1px solid var(--gp-border-light);
    font-size: 13px;
    color: var(--gp-text);
}

.gp-redirects-table th {
    font-size: 11px;
    font-weight: 600;
    color: var(--gp-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    background: transparent;
}

.gp-redirects-table td code {
    background: var(--gp-code-bg);
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 12px;
    color: var(--gp-text);
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
    background: rgba(155, 77, 224, 0.12);
    color: var(--gp-primary);
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
    background: var(--gp-success);
    box-shadow: 0 0 0 3px rgba(74, 222, 128, 0.2);
}

.gp-status-indicator-dot.inactive {
    background: var(--gp-text-muted);
    box-shadow: 0 0 0 3px rgba(107, 114, 128, 0.2);
}

/* Type badges */
.gp-type-badge {
    display: inline-block;
    padding: 3px 10px;
    font-size: 12px;
    font-weight: 600;
    border-radius: 10px;
}

.gp-type-301 { background: var(--gp-success-bg); color: var(--gp-success); }
.gp-type-302 { background: rgba(96, 165, 250, 0.12); color: #60a5fa; }
.gp-type-307 { background: var(--gp-warning-bg); color: var(--gp-warning); }

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
    color: var(--gp-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--gp-border-light);
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
    border: 1px solid var(--gp-border);
    border-radius: 10px;
    background: var(--gp-card);
    transition: border-color 0.15s, box-shadow 0.15s;
}

.gp-addon-card:hover {
    border-color: var(--gp-primary);
    box-shadow: 0 2px 8px rgba(155, 77, 224, 0.1);
}

.gp-addon-active {
    border-left: 3px solid var(--gp-success);
}

.gp-addon-dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
}

.gp-addon-dot.active { background: var(--gp-success); }

.gp-addon-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.gp-addon-info strong {
    font-size: 14px;
    color: var(--gp-text);
}

.gp-addon-desc {
    font-size: 12px;
    color: var(--gp-text-muted);
}

.gp-addon-version {
    font-size: 11px;
    color: var(--gp-primary);
    font-weight: 600;
    background: rgba(155, 77, 224, 0.12);
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
        justify-content: flex-start;
        margin-bottom: 8px;
    }

    .gp-content {
        padding: 20px 16px;
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
   Update Button (Topbar)
   ========================================== */
.gp-btn-update {
    background: #ef4444;
    color: #fff !important;
    padding: 6px 16px;
    font-size: 12px;
    font-weight: 600;
    border-radius: 6px;
    border: none;
    cursor: pointer;
    text-decoration: none;
    animation: gp-pulse-update 2s infinite;
    display: inline-flex;
    align-items: center;
    gap: 4px;
}

.gp-btn-update:hover {
    background: #dc2626;
    color: #fff !important;
}

@keyframes gp-pulse-update {
    0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
    50% { box-shadow: 0 0 0 6px rgba(239, 68, 68, 0); }
}

.gp-btn-sm {
    padding: 5px 12px;
    font-size: 12px;
}

/* Loading state for buttons */
.gp-btn.gp-loading {
    position: relative;
    pointer-events: none;
    opacity: 0.7;
}

.gp-btn.gp-loading::after {
    content: '';
    display: inline-block;
    width: 12px;
    height: 12px;
    border: 2px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
    animation: gp-spin 0.6s linear infinite;
    margin-left: 6px;
    vertical-align: middle;
}

@keyframes gp-spin {
    to { transform: rotate(360deg); }
}

/* Header check-update button outline style */
#gp-header-check-update {
    white-space: nowrap;
}

/* ==========================================
   Version Section
   ========================================== */
.gp-version-info {
    margin-top: 8px;
}

.gp-version-badge {
    display: inline-block;
    padding: 3px 10px;
    font-size: 13px;
    font-weight: 600;
    border-radius: 6px;
    background: rgba(155, 77, 224, 0.12);
    color: var(--gp-primary);
}

.gp-version-badge.gp-version-new {
    background: rgba(239, 68, 68, 0.12);
    color: #ef4444;
}

.gp-up-to-date {
    color: var(--gp-success);
    font-size: 13px;
    font-weight: 600;
    margin-left: 8px;
}

.gp-text-muted {
    color: var(--gp-text-muted);
}

/* ==========================================
   SEO Insights Tab
   ========================================== */
.gp-seo-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 24px;
}

.gp-seo-stats-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
    margin-bottom: 24px;
}

.gp-chart-card {
    margin-bottom: 24px;
}

.gp-chart-container {
    position: relative;
    height: 300px;
}

.gp-seo-two-col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
    margin-top: 24px;
}

.gp-seo-table {
    width: 100%;
    border-collapse: collapse;
}

.gp-seo-table th,
.gp-seo-table td {
    padding: 8px 12px;
    text-align: left;
    border-bottom: 1px solid var(--gp-border-light);
    font-size: 13px;
    color: var(--gp-text);
}

.gp-seo-table th {
    font-size: 11px;
    font-weight: 600;
    color: var(--gp-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.gp-change-up { color: var(--gp-success); }
.gp-change-down { color: var(--gp-danger); }

.gp-issues-list {
    list-style: none;
    padding: 0;
    margin: 0;
}

.gp-issue {
    padding: 12px 16px;
    border-radius: 8px;
    margin-bottom: 8px;
    border-left: 3px solid var(--gp-border);
}

.gp-issue-critical { border-left-color: var(--gp-danger); background: var(--gp-danger-bg); }
.gp-issue-warning { border-left-color: var(--gp-warning); background: var(--gp-warning-bg); }
.gp-issue-info { border-left-color: var(--gp-primary); background: var(--gp-code-bg); }

.gp-issue strong { display: block; margin-bottom: 4px; font-size: 13px; }
.gp-issue p { margin: 0; font-size: 12px; color: var(--gp-text-secondary); }

.gp-loading-state {
    text-align: center;
    padding: 48px 20px;
    color: var(--gp-text-muted);
}

.gp-spinner {
    display: inline-block;
    width: 32px;
    height: 32px;
    border: 3px solid var(--gp-border);
    border-top-color: var(--gp-primary);
    border-radius: 50%;
    animation: gp-spin 0.8s linear infinite;
    margin-bottom: 12px;
}

/* ==========================================
   Code Snippets Tab
   ========================================== */
.gp-snippets-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
}

.gp-snippets-views {
    display: flex;
    gap: 8px;
}

.gp-snippet-form-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 16px;
}

.gp-form-full {
    grid-column: 1 / -1;
}

.gp-code-editor {
    width: 100%;
    font-family: 'Fira Code', 'Consolas', 'Monaco', monospace;
    font-size: 13px;
    line-height: 1.5;
    padding: 16px;
    background: #0d1117;
    color: #c9d1d9;
    border: 1px solid var(--gp-input-border);
    border-radius: 8px;
    resize: vertical;
    tab-size: 4;
}

.gp-snippet-form-actions {
    display: flex;
    gap: 8px;
    margin-top: 16px;
}

.gp-snippet-desc {
    display: block;
    font-size: 12px;
    color: var(--gp-text-muted);
    margin-top: 2px;
}

.gp-snippets-table {
    width: 100%;
    border-collapse: collapse;
}

.gp-snippets-table th,
.gp-snippets-table td {
    padding: 12px 12px;
    text-align: left;
    border-bottom: 1px solid var(--gp-border-light);
    font-size: 13px;
    color: var(--gp-text);
}

.gp-snippets-table th {
    font-size: 11px;
    font-weight: 600;
    color: var(--gp-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.gp-type-snippet-php { background: rgba(121, 134, 203, 0.15); color: #7986CB; }
.gp-type-snippet-js { background: rgba(255, 202, 40, 0.15); color: #FFCA28; }
.gp-type-snippet-html { background: rgba(239, 108, 0, 0.15); color: #EF6C00; }
.gp-type-snippet-css { background: rgba(38, 166, 154, 0.15); color: #26A69A; }
.gp-type-snippet-php_js { background: rgba(121, 134, 203, 0.15); color: #7986CB; }
.gp-type-snippet-js_css { background: rgba(255, 202, 40, 0.15); color: #FFCA28; }
.gp-type-snippet-html_css { background: rgba(239, 108, 0, 0.15); color: #EF6C00; }

@media screen and (max-width: 960px) {
    .gp-seo-stats-row {
        grid-template-columns: repeat(2, 1fr);
    }
    .gp-seo-two-col {
        grid-template-columns: 1fr;
    }
    .gp-snippet-form-grid {
        grid-template-columns: 1fr;
    }
    .gp-snippets-header {
        flex-direction: column;
        gap: 12px;
    }
}

/* ==========================================
   Dashboard Widget - Design Tokens
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
    max-width: 100%;
    justify-content: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    box-sizing: border-box;
}

.gp-wrap .gp-widget-last-sync {
    font-size: 11px;
    color: var(--gp-text-muted);
    margin: 6px 0 0;
    display: none;
}

/* Widget badges */
.gp-wrap .gp-badge {
    display: inline-flex;
    align-items: center;
    padding: 2px 10px;
    font-size: 11px;
    font-weight: 600;
    border-radius: 999px;
    line-height: 1.5;
}

.gp-wrap .gp-badge-success {
    background: rgba(74, 222, 128, 0.12);
    color: #4ade80;
}

.gp-wrap .gp-badge-neutral {
    background: rgba(107, 114, 128, 0.15);
    color: #9ca3af;
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