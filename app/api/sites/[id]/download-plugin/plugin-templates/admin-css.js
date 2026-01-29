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
    margin-left: auto;
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
`;
}
