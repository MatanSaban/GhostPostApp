/**
 * Generate Admin CSS
 */
export function getAdminCss() {
  return `/**
 * Ghost Post Connector Admin Styles
 */

.gp-connector-settings {
    max-width: 800px;
}

.gp-connector-settings h1 {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 20px 0;
}

.gp-connector-settings .gp-logo {
    width: 32px;
    height: 32px;
}

/* Cards */
.gp-card,
.gp-status-card,
.gp-info-card,
.gp-permissions-card,
.gp-plugins-card {
    background: #fff;
    border: 1px solid #ccd0d4;
    border-radius: 4px;
    padding: 20px;
    margin-bottom: 20px;
    box-shadow: 0 1px 1px rgba(0, 0, 0, 0.04);
}

.gp-card h2,
.gp-status-card h2,
.gp-info-card h2,
.gp-permissions-card h2,
.gp-plugins-card h2 {
    margin-top: 0;
    padding-bottom: 12px;
    border-bottom: 1px solid #eee;
}

/* Status Indicator */
.gp-status-indicator {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 18px;
    margin: 20px 0;
}

.gp-status-dot {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    display: inline-block;
}

.gp-status-connected .gp-status-dot {
    background: #00a32a;
    box-shadow: 0 0 8px rgba(0, 163, 42, 0.5);
}

.gp-status-disconnected .gp-status-dot {
    background: #dba617;
    box-shadow: 0 0 8px rgba(219, 166, 23, 0.5);
}

.gp-status-error .gp-status-dot {
    background: #d63638;
    box-shadow: 0 0 8px rgba(214, 54, 56, 0.5);
}

.gp-status-unknown .gp-status-dot {
    background: #787c82;
}

.gp-last-ping {
    color: #646970;
    font-style: italic;
}

.gp-error-message {
    background: #fcf0f1;
    border-left: 4px solid #d63638;
    padding: 12px 16px;
    margin: 16px 0;
}

/* Actions */
.gp-actions {
    margin-top: 20px;
    display: flex;
    gap: 10px;
}

/* Info Table */
.gp-info-table {
    width: 100%;
    border-collapse: collapse;
}

.gp-info-table th,
.gp-info-table td {
    padding: 10px 0;
    border-bottom: 1px solid #eee;
    text-align: left;
}

.gp-info-table th {
    width: 180px;
    color: #646970;
    font-weight: 500;
}

.gp-info-table code {
    background: #f0f0f1;
    padding: 4px 8px;
    border-radius: 3px;
    font-size: 12px;
}

/* Permissions List */
.gp-permissions-list {
    list-style: none;
    padding: 0;
    margin: 16px 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 8px;
}

.gp-permissions-list li {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px;
    background: #f6f7f7;
    border-radius: 4px;
}

.gp-permissions-list .dashicons-yes-alt {
    color: #00a32a;
}

.gp-permissions-note {
    color: #646970;
    font-size: 13px;
    margin-top: 16px;
}

/* Plugins List */
.gp-plugins-list {
    list-style: none;
    padding: 0;
    margin: 16px 0;
}

.gp-plugins-list li {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px;
    border-bottom: 1px solid #eee;
}

.gp-plugins-list li:last-child {
    border-bottom: none;
}

.gp-plugins-list .dashicons-yes {
    color: #00a32a;
}

.gp-plugins-list .dashicons-no {
    color: #787c82;
}

.gp-plugins-list .gp-version {
    color: #646970;
    font-size: 12px;
    margin-inline-start: auto;
}

/* Responsive */
@media screen and (max-width: 782px) {
    .gp-connector-settings {
        max-width: 100%;
    }
    
    .gp-permissions-list {
        grid-template-columns: 1fr;
    }
    
    .gp-info-table th {
        width: 120px;
    }
}

/* ==========================================
   Redirections Page
   ========================================== */

.gp-redirections-page {
    max-width: 1100px;
}

.gp-redirections-page h1 {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 20px 0;
}

/* Recommendation Banner */
.gp-recommendation-banner {
    background: linear-gradient(135deg, #fff8e1 0%, #fff3cd 100%);
    border: 1px solid #ffc107;
    border-radius: 6px;
    padding: 16px 20px;
    margin-bottom: 20px;
    display: flex;
    align-items: center;
    gap: 16px;
}

.gp-recommendation-banner .dashicons {
    color: #f0ad4e;
    font-size: 28px;
    width: 28px;
    height: 28px;
}

.gp-recommendation-banner h3 {
    margin: 0 0 4px;
}

.gp-recommendation-banner p {
    margin: 0;
    color: #646970;
}

#gp-import-result {
    margin-top: 10px;
}

/* Stats Row */
.gp-stats-row,
.gp-redirections-stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
    margin-bottom: 24px;
}

.gp-stat-card {
    background: #fff;
    border: 1px solid #ccd0d4;
    border-radius: 4px;
    padding: 16px;
    text-align: center;
    box-shadow: 0 1px 1px rgba(0, 0, 0, 0.04);
}

.gp-stat-card .gp-stat-value,
.gp-stat-card .gp-stat-number {
    font-size: 28px;
    font-weight: 700;
    color: #1d2327;
    display: block;
}

.gp-stat-card .gp-stat-label {
    font-size: 13px;
    color: #646970;
    margin-top: 4px;
    display: block;
}

/* Redirect Form */
.gp-redirect-form-card,
.gp-create-redirect-card {
    background: #fff;
    border: 1px solid #ccd0d4;
    border-radius: 4px;
    padding: 20px;
    margin-bottom: 20px;
    box-shadow: 0 1px 1px rgba(0, 0, 0, 0.04);
}

.gp-redirect-form-card h2,
.gp-create-redirect-card h2 {
    margin-top: 0;
    padding-bottom: 12px;
    border-bottom: 1px solid #eee;
}

.gp-redirect-form-grid {
    display: grid;
    grid-template-columns: 1fr 1fr auto auto;
    gap: 12px;
    align-items: end;
}

.gp-redirect-form-grid .gp-form-group {
    display: flex;
    flex-direction: column;
}

.gp-redirect-form-grid .gp-form-group label {
    font-weight: 600;
    margin-bottom: 6px;
    font-size: 13px;
}

.gp-redirect-form-grid .gp-form-group input,
.gp-redirect-form-grid .gp-form-group select {
    padding: 6px 10px;
    border: 1px solid #8c8f94;
    border-radius: 4px;
    width: 100%;
    box-sizing: border-box;
}

#gp-redirect-result {
    margin-top: 10px;
}

#gp-cancel-edit {
    display: none;
}

/* Redirects Table */
.gp-redirects-table-card {
    background: #fff;
    border: 1px solid #ccd0d4;
    border-radius: 4px;
    padding: 20px;
    box-shadow: 0 1px 1px rgba(0, 0, 0, 0.04);
}

.gp-redirects-table-card h2 {
    margin-top: 0;
    padding-bottom: 12px;
    border-bottom: 1px solid #eee;
}

.gp-count-badge {
    background: #2271b1;
    color: #fff;
    border-radius: 10px;
    padding: 2px 8px;
    font-size: 12px;
    font-weight: 400;
    margin-inline-start: 8px;
    vertical-align: middle;
}

.gp-redirects-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 10px;
}

.gp-redirects-table th {
    text-align: left;
    padding: 10px 8px;
    border-bottom: 2px solid #ccd0d4;
    font-weight: 600;
    color: #1d2327;
}

.gp-redirects-table td {
    padding: 10px 8px;
    border-bottom: 1px solid #eee;
    vertical-align: middle;
}

.gp-redirects-table tr:hover {
    background: #f6f7f7;
}

.gp-redirects-table tr.gp-inactive {
    opacity: 0.5;
}

/* Type Badge */
.gp-type-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 3px;
    font-size: 12px;
    font-weight: 600;
}

.gp-type-301 {
    background: #e7f5e7;
    color: #00a32a;
}

.gp-type-302 {
    background: #e5f5fa;
    color: #0073aa;
}

.gp-type-307 {
    background: #fef8ee;
    color: #dba617;
}

/* Status Toggle */
.gp-toggle-status,
.gp-status-toggle {
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    background: none;
    border: none;
    padding: 4px 8px;
    border-radius: 3px;
}

.gp-toggle-status:hover,
.gp-status-toggle:hover {
    background: #f0f0f1;
}

.gp-toggle-status .gp-dot,
.gp-status-toggle .gp-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    display: inline-block;
}

.gp-toggle-status.gp-active .gp-dot,
.gp-status-toggle.gp-active .gp-dot {
    background: #00a32a;
}

.gp-toggle-status.gp-not-active .gp-dot,
.gp-status-toggle.gp-not-active .gp-dot {
    background: #d63638;
}

.gp-toggle-status .gp-status-label {
    font-size: 12px;
    color: #646970;
}

/* Row Actions */
.gp-row-actions a {
    text-decoration: none;
    margin-right: 8px;
}

.gp-row-actions .gp-delete-redirect {
    color: #d63638;
}

.gp-row-actions .gp-delete-redirect:hover {
    color: #a02122;
}

/* Empty State */
.gp-empty-state {
    text-align: center;
    padding: 40px 20px;
    color: #646970;
}

.gp-empty-state .dashicons {
    font-size: 48px;
    width: 48px;
    height: 48px;
    color: #ccd0d4;
    margin-bottom: 10px;
}

/* Responsive - Redirections */
@media screen and (max-width: 1200px) {
    .gp-redirect-fields,
    .gp-redirect-form-grid {
        grid-template-columns: 1fr 1fr;
    }
}

@media screen and (max-width: 782px) {
    .gp-redirections-page {
        max-width: 100%;
    }
    
    .gp-stats-row,
    .gp-redirections-stats {
        grid-template-columns: repeat(2, 1fr);
    }
    
    .gp-redirect-fields,
    .gp-redirect-form-grid {
        grid-template-columns: 1fr;
    }
    
    .gp-redirects-table {
        font-size: 13px;
    }
}

/* ==========================================
   Settings Page
   ========================================== */

.gp-settings-page .gp-form-group {
    margin-bottom: 16px;
}

.gp-settings-page .gp-form-group label {
    display: block;
    font-weight: 600;
    margin-bottom: 6px;
}

.gp-settings-page .gp-form-group select {
    min-width: 250px;
}

.gp-settings-page .gp-form-group .description {
    margin-top: 6px;
    color: #646970;
    font-style: italic;
}

.gp-settings-page .gp-form-actions {
    margin-top: 16px;
}

/* Deactivate plugin button */
.gp-deactivate-plugin {
    color: #d63638 !important;
    border-color: #d63638 !important;
}

.gp-deactivate-plugin:hover {
    background: #d63638 !important;
    color: #fff !important;
}

/* Synced / Not Synced indicators */
.gp-synced {
    color: #00a32a;
}

.gp-not-synced {
    color: #d63638;
}

/* ==========================================
   RTL Overrides
   ========================================== */

[dir="rtl"] .gp-connector-settings h1,
[dir="rtl"] .gp-redirections-page h1 {
    flex-direction: row-reverse;
}

[dir="rtl"] .gp-info-table th {
    text-align: right;
}

[dir="rtl"] .gp-redirects-table th {
    text-align: right;
}

[dir="rtl"] .gp-recommendation-banner {
    border-left: none;
    border-right: 4px solid #ffc107;
}

[dir="rtl"] .gp-error-message {
    border-left: none;
    border-right: 4px solid #d63638;
}

[dir="rtl"] .gp-recommendation-steps {
    direction: rtl;
}

[dir="rtl"] .gp-actions {
    flex-direction: row-reverse;
}

[dir="rtl"] .gp-redirects-table td code {
    direction: ltr;
    unicode-bidi: embed;
}
`;
}
