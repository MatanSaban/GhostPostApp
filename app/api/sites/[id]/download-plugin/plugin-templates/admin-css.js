/**
 * Generate Admin CSS
 */
export function getAdminCss() {
  return `/**
 * Ghost Post Connector — Premium Admin Styles
 * Scoped under .gp-wrap to avoid WordPress conflicts
 */

/* ==========================================
   Design Tokens (CSS Variables)
   ========================================== */

.gp-wrap {
    --gp-primary: #4f46e5;
    --gp-primary-hover: #4338ca;
    --gp-primary-light: #eef2ff;
    --gp-primary-ring: rgba(79, 70, 229, 0.25);

    --gp-slate-50: #f8fafc;
    --gp-slate-100: #f1f5f9;
    --gp-slate-200: #e2e8f0;
    --gp-slate-300: #cbd5e1;
    --gp-slate-400: #94a3b8;
    --gp-slate-500: #64748b;
    --gp-slate-600: #475569;
    --gp-slate-700: #334155;
    --gp-slate-800: #1e293b;
    --gp-slate-900: #0f172a;

    --gp-emerald: #10b981;
    --gp-emerald-light: #ecfdf5;
    --gp-emerald-dark: #059669;

    --gp-rose: #f43f5e;
    --gp-rose-light: #fff1f2;
    --gp-rose-dark: #e11d48;

    --gp-amber: #f59e0b;
    --gp-amber-light: #fffbeb;
    --gp-amber-dark: #d97706;

    --gp-radius-sm: 6px;
    --gp-radius-md: 10px;
    --gp-radius-lg: 12px;
    --gp-radius-xl: 16px;
    --gp-radius-full: 999px;

    --gp-shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
    --gp-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1);
    --gp-shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);
    --gp-shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1);

    --gp-font: system-ui, -apple-system, 'Inter', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;

    --gp-transition: 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

/* ==========================================
   Base Reset & Layout
   ========================================== */

.gp-wrap {
    max-width: 960px;
    font-family: var(--gp-font);
    color: var(--gp-slate-700);
    -webkit-font-smoothing: antialiased;
}

.gp-wrap *,
.gp-wrap *::before,
.gp-wrap *::after {
    box-sizing: border-box;
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
    filter: drop-shadow(0 1px 2px rgba(0,0,0,0.08));
}

.gp-wrap .gp-header-title {
    font-size: 22px;
    font-weight: 700;
    color: var(--gp-slate-900);
    letter-spacing: -0.025em;
    margin: 0;
    padding: 0;
    border: none;
    line-height: 1.3;
}

.gp-wrap .gp-header-subtitle {
    font-size: 14px;
    color: var(--gp-slate-400);
    font-weight: 400;
    margin-inline-start: auto;
}

/* ==========================================
   Cards
   ========================================== */

.gp-wrap .gp-card {
    background: #fff;
    border: 1px solid var(--gp-slate-200);
    border-radius: var(--gp-radius-lg);
    padding: 24px;
    margin-bottom: 20px;
    box-shadow: var(--gp-shadow);
    transition: box-shadow var(--gp-transition);
}

.gp-wrap .gp-card:hover {
    box-shadow: var(--gp-shadow-md);
}

.gp-wrap .gp-card-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 20px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--gp-slate-100);
}

.gp-wrap .gp-card-icon {
    width: 20px;
    height: 20px;
    color: var(--gp-primary);
    flex-shrink: 0;
}

.gp-wrap .gp-card-title {
    font-size: 15px;
    font-weight: 600;
    color: var(--gp-slate-800);
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
    border: 1px solid var(--gp-slate-200);
    box-shadow: var(--gp-shadow);
}

.gp-wrap .gp-status-hero.gp-status-connected {
    background: linear-gradient(135deg, var(--gp-emerald-light) 0%, #d1fae5 100%);
    border-color: #a7f3d0;
}

.gp-wrap .gp-status-hero.gp-status-disconnected {
    background: linear-gradient(135deg, var(--gp-amber-light) 0%, #fef3c7 100%);
    border-color: #fde68a;
}

.gp-wrap .gp-status-hero.gp-status-error {
    background: linear-gradient(135deg, var(--gp-rose-light) 0%, #ffe4e6 100%);
    border-color: #fecdd3;
}

.gp-wrap .gp-status-hero.gp-status-unknown {
    background: linear-gradient(135deg, var(--gp-slate-50) 0%, var(--gp-slate-100) 100%);
    border-color: var(--gp-slate-200);
}

.gp-wrap .gp-status-pulse {
    width: 14px;
    height: 14px;
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
    box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.2);
}

.gp-wrap .gp-status-connected .gp-status-pulse::after {
    border: 2px solid var(--gp-emerald);
    animation: gp-pulse 2s ease-in-out infinite;
}

.gp-wrap .gp-status-disconnected .gp-status-pulse {
    background: var(--gp-amber);
    box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.2);
}

.gp-wrap .gp-status-error .gp-status-pulse {
    background: var(--gp-rose);
    box-shadow: 0 0 0 3px rgba(244, 63, 94, 0.2);
}

.gp-wrap .gp-status-unknown .gp-status-pulse {
    background: var(--gp-slate-400);
    box-shadow: 0 0 0 3px rgba(148, 163, 184, 0.2);
}

@keyframes gp-pulse {
    0%, 100% { opacity: 0.4; transform: scale(1); }
    50% { opacity: 0; transform: scale(1.6); }
}

.gp-wrap .gp-status-label {
    font-size: 16px;
    font-weight: 600;
}

.gp-wrap .gp-status-connected .gp-status-label { color: var(--gp-emerald-dark); }
.gp-wrap .gp-status-disconnected .gp-status-label { color: var(--gp-amber-dark); }
.gp-wrap .gp-status-error .gp-status-label { color: var(--gp-rose-dark); }
.gp-wrap .gp-status-unknown .gp-status-label { color: var(--gp-slate-500); }

.gp-wrap .gp-status-meta {
    margin-inline-start: auto;
    text-align: end;
    font-size: 13px;
    color: var(--gp-slate-500);
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
    color: var(--gp-emerald-dark);
}

.gp-wrap .gp-badge-error {
    background: var(--gp-rose-light);
    color: var(--gp-rose-dark);
}

.gp-wrap .gp-badge-warning {
    background: var(--gp-amber-light);
    color: var(--gp-amber-dark);
}

.gp-wrap .gp-badge-neutral {
    background: var(--gp-slate-100);
    color: var(--gp-slate-600);
}

.gp-wrap .gp-badge-primary {
    background: var(--gp-primary-light);
    color: var(--gp-primary);
}

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
    background: #fff;
    color: var(--gp-slate-700);
    border-color: var(--gp-slate-300);
    box-shadow: var(--gp-shadow-sm);
}

.gp-wrap .gp-btn-secondary:hover {
    background: var(--gp-slate-50);
    border-color: var(--gp-slate-400);
    color: var(--gp-slate-800);
}

.gp-wrap .gp-btn-danger {
    background: #fff;
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
    border-bottom: 1px solid var(--gp-slate-100);
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
    color: var(--gp-slate-500);
    font-weight: 500;
}

.gp-wrap .gp-info-table td {
    color: var(--gp-slate-800);
    font-weight: 500;
}

.gp-wrap .gp-info-table code {
    background: var(--gp-slate-50);
    border: 1px solid var(--gp-slate-200);
    padding: 3px 8px;
    border-radius: var(--gp-radius-sm);
    font-size: 12px;
    font-family: 'SF Mono', 'Cascadia Code', Consolas, monospace;
    color: var(--gp-slate-600);
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
    background: var(--gp-slate-50);
    border: 1px solid var(--gp-slate-100);
    border-radius: var(--gp-radius-sm);
    font-size: 13px;
    color: var(--gp-slate-700);
    transition: background var(--gp-transition);
}

.gp-wrap .gp-permissions-grid li:hover {
    background: var(--gp-primary-light);
    border-color: rgba(79, 70, 229, 0.15);
}

.gp-wrap .gp-perm-check {
    width: 18px;
    height: 18px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: var(--gp-emerald);
    color: #fff;
    flex-shrink: 0;
    font-size: 11px;
    line-height: 1;
}

.gp-wrap .gp-permissions-note {
    color: var(--gp-slate-400);
    font-size: 13px;
    margin-top: 16px;
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
    border-bottom: 1px solid var(--gp-slate-100);
    font-size: 14px;
}

.gp-wrap .gp-plugins-list li:last-child {
    border-bottom: none;
}

.gp-wrap .gp-plugin-status {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
}

.gp-wrap .gp-plugin-active {
    background: var(--gp-emerald);
    box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15);
}

.gp-wrap .gp-plugin-inactive {
    background: var(--gp-slate-300);
}

.gp-wrap .gp-plugin-name {
    font-weight: 500;
    color: var(--gp-slate-700);
}

.gp-wrap .gp-plugin-version {
    margin-inline-start: auto;
    font-size: 12px;
    color: var(--gp-slate-400);
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
    color: var(--gp-slate-400);
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
    color: var(--gp-slate-700);
    margin-bottom: 6px;
}

.gp-wrap .gp-form-group select,
.gp-wrap .gp-form-group input[type="text"],
.gp-wrap .gp-form-group input[type="url"] {
    min-width: 260px;
    padding: 8px 12px;
    border: 1px solid var(--gp-slate-300);
    border-radius: var(--gp-radius-sm);
    font-size: 14px;
    font-family: var(--gp-font);
    color: var(--gp-slate-700);
    background: #fff;
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
    color: var(--gp-slate-400);
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
    color: var(--gp-slate-700);
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
    background: var(--gp-slate-300);
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
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
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

.gp-wrap .gp-alert-error {
    background: var(--gp-rose-light);
    border: 1px solid #fecdd3;
    color: var(--gp-rose-dark);
}

.gp-wrap .gp-alert-success {
    background: var(--gp-emerald-light);
    border: 1px solid #a7f3d0;
    color: var(--gp-emerald-dark);
}

.gp-wrap .gp-alert-warning {
    background: var(--gp-amber-light);
    border: 1px solid #fde68a;
    color: var(--gp-amber-dark);
}

.gp-wrap .gp-alert-icon {
    flex-shrink: 0;
    font-size: 18px;
    line-height: 1;
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
    color: var(--gp-emerald-dark);
    border: 1px solid #a7f3d0;
}

.gp-wrap .gp-result-box.gp-result-error {
    background: var(--gp-rose-light);
    color: var(--gp-rose-dark);
    border: 1px solid #fecdd3;
}

/* ==========================================
   Divider
   ========================================== */

.gp-wrap .gp-divider {
    border: none;
    border-top: 1px solid var(--gp-slate-100);
    margin: 20px 0;
}

/* ==========================================
   Footer
   ========================================== */

.gp-wrap .gp-footer {
    text-align: center;
    padding: 16px 0 8px;
    font-size: 12px;
    color: var(--gp-slate-400);
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
    background: linear-gradient(135deg, var(--gp-amber-light) 0%, #fef3c7 100%);
    border: 1px solid #fde68a;
    border-radius: var(--gp-radius-lg);
    padding: 18px 24px;
    margin-bottom: 20px;
    display: flex;
    align-items: center;
    gap: 16px;
}

.gp-wrap .gp-recommendation-banner .gp-rec-icon {
    font-size: 28px;
    line-height: 1;
    flex-shrink: 0;
}

.gp-wrap .gp-recommendation-banner h3 {
    margin: 0 0 4px;
    font-size: 14px;
    color: var(--gp-amber-dark);
}

.gp-wrap .gp-recommendation-banner p {
    margin: 0;
    color: var(--gp-slate-500);
    font-size: 13px;
}

#gp-import-result {
    margin-top: 10px;
}

/* Stats Row */
.gp-wrap .gp-stats-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
    margin-bottom: 24px;
}

.gp-wrap .gp-stat-card {
    background: #fff;
    border: 1px solid var(--gp-slate-200);
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
    color: var(--gp-slate-800);
    display: block;
    line-height: 1.2;
}

.gp-wrap .gp-stat-label {
    font-size: 12px;
    color: var(--gp-slate-400);
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
    color: var(--gp-slate-600);
}

.gp-wrap .gp-redirect-form-grid .gp-form-group input,
.gp-wrap .gp-redirect-form-grid .gp-form-group select {
    padding: 8px 12px;
    border: 1px solid var(--gp-slate-300);
    border-radius: var(--gp-radius-sm);
    width: 100%;
    font-family: var(--gp-font);
    font-size: 14px;
    color: var(--gp-slate-700);
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
    border-bottom: 2px solid var(--gp-slate-200);
    font-weight: 600;
    color: var(--gp-slate-600);
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
}

.gp-wrap .gp-redirects-table td {
    padding: 12px;
    border-bottom: 1px solid var(--gp-slate-100);
    vertical-align: middle;
    font-size: 14px;
    color: var(--gp-slate-700);
}

.gp-wrap .gp-redirects-table tr:hover {
    background: var(--gp-slate-50);
}

.gp-wrap .gp-redirects-table tr.gp-inactive {
    opacity: 0.45;
}

.gp-wrap .gp-redirects-table td code {
    background: var(--gp-slate-50);
    border: 1px solid var(--gp-slate-200);
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 12px;
    font-family: 'SF Mono', 'Cascadia Code', Consolas, monospace;
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
    color: var(--gp-emerald-dark);
}

.gp-wrap .gp-type-302 {
    background: var(--gp-primary-light);
    color: var(--gp-primary);
}

.gp-wrap .gp-type-307 {
    background: var(--gp-amber-light);
    color: var(--gp-amber-dark);
}

/* Status Toggle */
.gp-wrap .gp-status-toggle {
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
    transition: background var(--gp-transition);
}

.gp-wrap .gp-status-toggle:hover {
    background: var(--gp-slate-100);
}

.gp-wrap .gp-status-toggle .gp-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    display: inline-block;
}

.gp-wrap .gp-status-toggle.gp-active .gp-dot {
    background: var(--gp-emerald);
}

.gp-wrap .gp-status-toggle.gp-not-active .gp-dot {
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
    color: var(--gp-slate-400);
}

.gp-wrap .gp-empty-state .dashicons {
    font-size: 48px;
    width: 48px;
    height: 48px;
    color: var(--gp-slate-200);
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

    .gp-wrap .gp-stats-row {
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
   RTL Overrides
   ========================================== */

[dir="rtl"] .gp-wrap .gp-header {
    flex-direction: row-reverse;
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
`;
}
