/**
 * Generate admin JavaScript file for Ghost Post Connector
 */
export function getAdminJs() {
  return `/**
 * Ghost Post Admin JavaScript
 */

(function($) {
    'use strict';

    var $resultBox = $('#gp-connection-result');

    // ==========================================
    // Helper: show result box
    // ==========================================
    function showResult($el, type, msg) {
        $el.removeClass('success error loading').addClass(type).html(msg).show();
    }

    // ==========================================
    // Connection tab: Test Connection
    // ==========================================
    $('#gp-test-connection').on('click', function() {
        var $btn = $(this);
        $btn.prop('disabled', true);

        showResult($resultBox, 'loading', gpAdmin.strings.testing);

        $.ajax({
            url: gpAdmin.ajaxUrl,
            type: 'POST',
            data: { action: 'gp_test_connection', nonce: gpAdmin.nonce },
            success: function(response) {
                if (response.success) {
                    showResult($resultBox, 'success', gpAdmin.strings.connection_success || 'Connection successful!');
                    setTimeout(function() { location.reload(); }, 1500);
                } else {
                    showResult($resultBox, 'error', (gpAdmin.strings.connection_failed || 'Connection failed:') + ' ' + (response.data.message || response.data || 'Unknown error'));
                }
            },
            error: function(xhr, status, error) {
                showResult($resultBox, 'error', (gpAdmin.strings.connection_failed || 'Connection failed:') + ' ' + error);
            },
            complete: function() {
                $btn.prop('disabled', false);
            }
        });
    });

    // ==========================================
    // Connection tab: Send Ping
    // ==========================================
    $('#gp-send-ping').on('click', function() {
        var $btn = $(this);
        $btn.prop('disabled', true);

        showResult($resultBox, 'loading', gpAdmin.strings.sending || 'Sending ping...');

        $.ajax({
            url: gpAdmin.ajaxUrl,
            type: 'POST',
            data: { action: 'gp_send_ping', nonce: gpAdmin.nonce },
            success: function(response) {
                if (response.success) {
                    showResult($resultBox, 'success', gpAdmin.strings.ping_success || 'Ping sent successfully!');
                } else {
                    showResult($resultBox, 'error', (gpAdmin.strings.ping_failed || 'Ping failed:') + ' ' + (response.data.message || response.data || 'Unknown error'));
                }
            },
            error: function(xhr, status, error) {
                showResult($resultBox, 'error', (gpAdmin.strings.ping_failed || 'Ping failed:') + ' ' + error);
            },
            complete: function() {
                $btn.prop('disabled', false);
            }
        });
    });

    // ==========================================
    // Connection tab: Copy Key
    // ==========================================
    $('#gp-copy-key').on('click', function() {
        var $btn = $(this);
        var keyText = gpAdmin.siteKey || '';

        if (!keyText) return;

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(keyText).then(function() {
                var orig = $btn.text();
                $btn.text('Copied!');
                setTimeout(function() { $btn.text(orig); }, 2000);
            });
        } else {
            // Fallback
            var $temp = $('<textarea>').val(keyText).appendTo('body').select();
            document.execCommand('copy');
            $temp.remove();
            var orig = $btn.text();
            $btn.text('Copied!');
            setTimeout(function() { $btn.text(orig); }, 2000);
        }
    });

    // ==========================================
    // Settings tab: Theme Switcher
    // ==========================================
    $('input[name="gp_theme"]').on('change', function() {
        var newTheme = $(this).val();
        var $wrap = $('.gp-admin-wrap');

        // Immediately apply theme class
        $wrap.removeClass('gp-theme-dark gp-theme-light').addClass('gp-theme-' + newTheme);

        // Save via AJAX
        $.ajax({
            url: gpAdmin.ajaxUrl,
            type: 'POST',
            data: {
                action: 'gp_save_theme',
                nonce: gpAdmin.nonce,
                theme: newTheme
            },
            success: function(response) {
                if (response.success) {
                    // Briefly flash a saved indicator
                    var $label = $('input[name="gp_theme"]:checked').closest('.gp-theme-option').find('.gp-theme-label');
                    var origText = $label.text();
                    $label.text(gpAdmin.strings.theme_saved || 'Saved!');
                    setTimeout(function() { $label.text(origText); }, 1500);
                }
            }
        });
    });

    // ==========================================
    // Settings tab: Language Selector
    // ==========================================
    $('#gp-language-select').on('change', function() {
        var newLang = $(this).val();
        var $result = $('#gp-language-result');

        showResult($result, 'loading', gpAdmin.strings.saving || 'Saving...');

        $.ajax({
            url: gpAdmin.ajaxUrl,
            type: 'POST',
            data: {
                action: 'gp_save_language',
                nonce: gpAdmin.nonce,
                language: newLang
            },
            success: function(response) {
                if (response.success) {
                    showResult($result, 'success', gpAdmin.strings.settings_saved || 'Settings saved! Reloading...');
                    setTimeout(function() { location.reload(); }, 1000);
                } else {
                    showResult($result, 'error', gpAdmin.strings.save_failed || 'Failed to save.');
                }
            },
            error: function() {
                showResult($result, 'error', gpAdmin.strings.save_failed || 'Failed to save.');
            }
        });
    });

    // ==========================================
    // Redirections tab: Save redirect
    // ==========================================
    var $saveResult = $('#gp-save-result');
    var $importResult = $('#gp-import-result');

    $('#gp-redirect-form').on('submit', function(e) {
        e.preventDefault();

        var $btn = $('#gp-save-redirect');
        $btn.prop('disabled', true);

        $.ajax({
            url: gpAdmin.ajaxUrl,
            type: 'POST',
            data: {
                action: 'gp_save_redirect',
                nonce: gpAdmin.nonce,
                redirect_id: $('#gp-redirect-id').val(),
                source: $('#gp-source-url').val(),
                target: $('#gp-target-url').val(),
                type: $('#gp-redirect-type').val()
            },
            success: function(response) {
                if (response.success) {
                    showResult($saveResult, 'success', 'Redirect saved successfully!');
                    setTimeout(function() { location.reload(); }, 800);
                } else {
                    showResult($saveResult, 'error', 'Error: ' + (response.data || 'Unknown error'));
                }
            },
            error: function(xhr, status, error) {
                showResult($saveResult, 'error', 'Error: ' + error);
            },
            complete: function() {
                $btn.prop('disabled', false);
            }
        });
    });

    // Edit redirect
    $(document).on('click', '.gp-edit-redirect', function() {
        var $btn = $(this);
        $('#gp-redirect-id').val($btn.data('id'));
        $('#gp-source-url').val($btn.data('source'));
        $('#gp-target-url').val($btn.data('target'));
        $('#gp-redirect-type').val($btn.data('type'));

        $('#gp-save-redirect').text(gpAdmin.strings.save_redirect || 'Update Redirect');
        $('#gp-cancel-edit').show();

        $('html, body').animate({
            scrollTop: $('#gp-redirect-form').offset().top - 100
        }, 300);
    });

    // Cancel edit
    $('#gp-cancel-edit').on('click', function() {
        $('#gp-redirect-id').val('');
        $('#gp-source-url').val('');
        $('#gp-target-url').val('');
        $('#gp-redirect-type').val('301');
        $('#gp-save-redirect').text(gpAdmin.strings.add_redirect || 'Add Redirect');
        $(this).hide();
    });

    // Delete redirect
    $(document).on('click', '.gp-delete-redirect', function() {
        if (!confirm(gpAdmin.strings.confirm_delete || 'Are you sure you want to delete this redirect?')) return;

        var $btn = $(this);
        var $row = $btn.closest('tr');

        $btn.prop('disabled', true);

        $.ajax({
            url: gpAdmin.ajaxUrl,
            type: 'POST',
            data: {
                action: 'gp_delete_redirect',
                nonce: gpAdmin.nonce,
                redirect_id: $btn.data('id')
            },
            success: function(response) {
                if (response.success) {
                    $row.fadeOut(300, function() { $(this).remove(); });
                } else {
                    alert('Error: ' + (response.data || 'Unknown error'));
                }
            },
            error: function() { alert('Failed to delete redirect.'); },
            complete: function() { $btn.prop('disabled', false); }
        });
    });

    // Toggle redirect status
    $(document).on('click', '.gp-toggle-status', function() {
        var $btn = $(this);
        var isActive = $btn.data('active') === 1 || $btn.data('active') === '1';
        var newState = isActive ? '0' : '1';

        $.ajax({
            url: gpAdmin.ajaxUrl,
            type: 'POST',
            data: {
                action: 'gp_toggle_redirect',
                nonce: gpAdmin.nonce,
                redirect_id: $btn.data('id'),
                is_active: newState
            },
            success: function(response) {
                if (response.success) {
                    $btn.data('active', newState);
                    var $dot = $btn.find('.gp-status-indicator-dot');
                    var $row = $btn.closest('tr');
                    if (newState === '1') {
                        $dot.removeClass('inactive').addClass('active');
                        $row.removeClass('gp-inactive-row');
                    } else {
                        $dot.removeClass('active').addClass('inactive');
                        $row.addClass('gp-inactive-row');
                    }
                }
            }
        });
    });

    // Import redirects
    $('#gp-import-redirects').on('click', function() {
        var $btn = $(this);
        $btn.prop('disabled', true);

        showResult($importResult, 'loading', gpAdmin.strings.importing || 'Importing redirects...');

        $.ajax({
            url: gpAdmin.ajaxUrl,
            type: 'POST',
            data: { action: 'gp_import_redirects', nonce: gpAdmin.nonce },
            success: function(response) {
                if (response.success) {
                    var msg = gpAdmin.strings.import_success || 'Import completed!';
                    if (response.data && response.data.imported !== undefined) {
                        msg += ' ' + response.data.imported + ' redirects imported.';
                    }
                    showResult($importResult, 'success', msg);
                    setTimeout(function() { location.reload(); }, 1500);
                } else {
                    showResult($importResult, 'error', 'Import failed: ' + (response.data || 'Unknown error'));
                }
            },
            error: function(xhr, status, error) {
                showResult($importResult, 'error', 'Import failed: ' + error);
            },
            complete: function() { $btn.prop('disabled', false); }
        });
    });

    // ==========================================
    // Dashboard Widget: Sync button
    // ==========================================
    $(document).on('click', '#gp-widget-sync', function() {
        var btn = $(this);
        if (btn.hasClass('gp-syncing')) return;
        btn.addClass('gp-syncing');

        $.post(gpAdmin.ajaxUrl, {
            action: 'gp_sync_widget',
            nonce: gpAdmin.nonce
        }, function(response) {
            if (response.success && response.data && response.data.widgetData) {
                var d = response.data.widgetData;
                var body = btn.closest('.gp-widget').find('.gp-widget-body');
                var html = '';

                if (d.auditScore !== null && d.auditScore !== undefined) {
                    var cls = d.auditScore >= 70 ? 'gp-score-good' : (d.auditScore >= 40 ? 'gp-score-ok' : 'gp-score-bad');
                    html += '<div class="gp-widget-stat"><span class="gp-widget-stat-label">' +
                        (gpAdmin.strings.site_health_score || 'Site Health Score') +
                        '</span><span class="gp-widget-stat-value ' + cls + '">' +
                        d.auditScore + '<small>/100</small></span></div>';
                }

                if (d.pendingInsights && d.pendingInsights > 0) {
                    html += '<div class="gp-widget-insights"><span class="gp-widget-insights-icon">✨</span><span>' +
                        d.pendingInsights + ' ' + (gpAdmin.strings.insights_waiting || 'AI Insights waiting') +
                        '</span></div>';
                }

                if (d.recentActivity) {
                    html += '<p class="gp-widget-activity">' + $('<span>').text(d.recentActivity).html() + '</p>';
                }

                if (!html) {
                    html = '<p class="gp-widget-empty">' + (gpAdmin.strings.no_data_yet || 'No data yet. Stats will appear after the next sync.') + '</p>';
                }

                body.html(html);
                $('#gp-widget-last-sync').text(gpAdmin.strings.sync_success || 'Widget updated!').show();
                setTimeout(function() { $('#gp-widget-last-sync').fadeOut(); }, 3000);
            }
        }).fail(function() {
            $('#gp-widget-last-sync').text(gpAdmin.strings.sync_failed || 'Sync failed').show();
            setTimeout(function() { $('#gp-widget-last-sync').fadeOut(); }, 3000);
        }).always(function() {
            btn.removeClass('gp-syncing');
        });
    });

})(jQuery);
`;
}