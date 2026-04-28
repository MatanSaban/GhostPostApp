/**
 * Generate admin JavaScript file for GhostSEO Connector
 */
export function getAdminJs() {
  return `/**
 * GhostSEO Admin JavaScript
 */

(function($) {
    'use strict';

    $(document).ready(function() {

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
    $(document).on('click', '#gp-test-connection', function() {
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
    $(document).on('click', '#gp-send-ping', function() {
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
    $(document).on('click', '#gp-copy-key', function() {
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
    $(document).on('change', 'input[name="gp_theme"]', function() {
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
    $(document).on('change', '#gp-language-select', function() {
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

    $(document).on('submit', '#gp-redirect-form', function(e) {
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
    $(document).on('click', '#gp-cancel-edit', function() {
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
    $(document).on('click', '#gp-import-redirects', function() {
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
    // Settings tab: Version Check
    // ==========================================
    $(document).on('click', '#gp-check-version', function() {
        var $btn = $(this);
        var $result = $('#gp-version-result');
        var origText = $btn.text();
        $btn.prop('disabled', true).addClass('gp-loading').text(gpAdmin.strings.checking || 'Checking...');
        showResult($result, 'loading', gpAdmin.strings.checking || 'Checking...');

        $.ajax({
            url: gpAdmin.ajaxUrl,
            type: 'POST',
            timeout: 30000,
            data: { action: 'gp_check_version', nonce: gpAdmin.nonce },
            success: function(response) {
                if (response.success) {
                    var d = response.data;
                    if (d.update_available) {
                        showResult($result, 'success', (gpAdmin.strings.update_available || 'Update available! Version') + ' ' + d.latest);
                    } else {
                        showResult($result, 'success', gpAdmin.strings.latest_version || 'You have the latest version!');
                    }
                } else {
                    showResult($result, 'error', gpAdmin.strings.check_failed || 'Failed to check for updates.');
                }
            },
            error: function() {
                showResult($result, 'error', gpAdmin.strings.check_failed || 'Failed to check for updates.');
            },
            complete: function() {
                $btn.prop('disabled', false).removeClass('gp-loading').text(origText);
            }
        });
    });

    // ==========================================
    // SEO Insights tab
    // ==========================================
    function loadSeoData() {
        var $loading = $('#gp-seo-loading');
        var $content = $('#gp-seo-content');
        var $error = $('#gp-seo-error');

        if (!$loading.length) return;

        $loading.show();
        $content.hide();
        $error.hide();

        $.ajax({
            url: gpAdmin.ajaxUrl,
            type: 'POST',
            timeout: 35000,
            data: { action: 'gp_fetch_seo_data', nonce: gpAdmin.nonce },
            success: function(response) {
                $loading.hide();
                if (response.success && response.data) {
                    renderSeoData(response.data);
                    $content.show();
                } else {
                    $error.html(gpAdmin.strings.seo_error || 'Could not load SEO data.').show();
                }
            },
            error: function() {
                $loading.hide();
                $error.html(gpAdmin.strings.seo_error || 'Could not load SEO data.').show();
            }
        });
    }

    function renderSeoData(data) {
        $('#gp-seo-total-traffic').text(data.totalTraffic || '-');
        $('#gp-seo-ai-traffic').text(data.aiTraffic || '-');
        $('#gp-seo-keywords-count').text(data.keywordsCount || '-');
        $('#gp-seo-issues-count').text(data.issuesCount || '0');

        // Render traffic chart
        if (data.trafficChart && window.Chart) {
            var ctx = document.getElementById('gp-traffic-chart');
            if (ctx) {
                new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: data.trafficChart.labels || [],
                        datasets: [
                            {
                                label: gpAdmin.strings.organic_traffic || 'Organic Traffic',
                                data: data.trafficChart.organic || [],
                                borderColor: '#9B4DE0',
                                backgroundColor: 'rgba(155, 77, 224, 0.1)',
                                fill: true,
                                tension: 0.4
                            },
                            {
                                label: gpAdmin.strings.ai_traffic_label || 'AI Traffic',
                                data: data.trafficChart.ai || [],
                                borderColor: '#4ade80',
                                backgroundColor: 'rgba(74, 222, 128, 0.1)',
                                fill: true,
                                tension: 0.4
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { position: 'top' } },
                        scales: { y: { beginAtZero: true } }
                    }
                });
            }
        }

        // Render agent issues
        var $issues = $('#gp-agent-issues');
        if (data.issues && data.issues.length > 0) {
            var html = '<ul class="gp-issues-list">';
            for (var i = 0; i < data.issues.length; i++) {
                var issue = data.issues[i];
                var severity = issue.severity || 'info';
                html += '<li class="gp-issue gp-issue-' + severity + '">';
                html += '<strong>' + $('<span>').text(issue.title || '').html() + '</strong>';
                // URLs must always render LTR - even on Hebrew/RTL pages - so
                // the path doesn't get reversed when it contains Hebrew chars.
                html += '<p class="gp-issue-url" dir="ltr">' + $('<span>').text(issue.description || '').html() + '</p>';
                html += '</li>';
            }
            html += '</ul>';
            $issues.html(html);
        }

        // Render top keywords
        var $kwBody = $('#gp-top-keywords tbody');
        if (data.topKeywords && data.topKeywords.length > 0) {
            var kwHtml = '';
            for (var i = 0; i < data.topKeywords.length; i++) {
                var kw = data.topKeywords[i];
                var changeClass = (kw.change > 0) ? 'gp-change-up' : (kw.change < 0 ? 'gp-change-down' : '');
                var changeSymbol = (kw.change > 0) ? '&#9650;' : (kw.change < 0 ? '&#9660;' : '-');
                kwHtml += '<tr><td>' + (i + 1) + '</td><td>' + $('<span>').text(kw.keyword || '').html() + '</td><td>' + (kw.position || '-') + '</td><td>' + (kw.volume || '-') + '</td><td class="' + changeClass + '">' + changeSymbol + ' ' + Math.abs(kw.change || 0) + '</td></tr>';
            }
            $kwBody.html(kwHtml);
        }

        // Render top pages
        var $pgBody = $('#gp-top-pages tbody');
        if (data.topPages && data.topPages.length > 0) {
            var pgHtml = '';
            for (var i = 0; i < data.topPages.length; i++) {
                var pg = data.topPages[i];
                // The page cell may be a title (any language) or a URL fallback
                // - wrap in unicode-bidi:isolate so a URL with Hebrew slug
                // renders LTR instead of getting reordered by the RTL parent.
                pgHtml += '<tr><td>' + (i + 1) + '</td><td class="gp-page-cell">' + $('<span>').text(pg.page || '').html() + '</td><td>' + (pg.traffic || '-') + '</td><td>' + (pg.avgPosition || '-') + '</td></tr>';
            }
            $pgBody.html(pgHtml);
        }
    }

    // Auto-load SEO data if on SEO tab
    if ($('#gp-seo-loading').length) {
        loadSeoData();
    }

    $(document).on('click', '#gp-refresh-seo', function() {
        var $btn = $(this);
        $btn.prop('disabled', true).addClass('gp-loading').text(gpAdmin.strings.loading_seo || 'Loading...');
        loadSeoData();
        // Re-enable after data loads (success or error)
        var checkDone = setInterval(function() {
            if (!$('#gp-seo-loading').is(':visible')) {
                clearInterval(checkDone);
                $btn.prop('disabled', false).removeClass('gp-loading').text(gpAdmin.strings.refresh_data || 'Refresh Data');
            }
        }, 200);
    });

    // ==========================================
    // Code Snippets tab
    // ==========================================
    // Show add form
    $(document).on('click', '#gp-add-snippet', function() {
        $('#gp-snippet-id').val('');
        $('#gp-snippet-title').val('');
        $('#gp-snippet-description').val('');
        $('#gp-snippet-type').val('html');
        $('#gp-snippet-location').val('header');
        $('#gp-snippet-priority').val('10');
        $('#gp-snippet-code').val('');
        $('#gp-snippet-form-title').text(gpAdmin.strings.add_new_snippet || 'Add New Snippet');
        $('#gp-snippet-form-wrap').slideDown(200);
    });

    // Cancel snippet form
    $(document).on('click', '#gp-cancel-snippet', function() {
        $('#gp-snippet-form-wrap').slideUp(200);
    });

    // Save snippet
    $(document).on('submit', '#gp-snippet-form', function(e) {
        e.preventDefault();
        var $btn = $('#gp-save-snippet');
        var $result = $('#gp-snippet-result');
        $btn.prop('disabled', true);

        $.ajax({
            url: gpAdmin.ajaxUrl,
            type: 'POST',
            data: {
                action: 'gp_save_snippet',
                nonce: gpAdmin.nonce,
                snippet_id: $('#gp-snippet-id').val(),
                title: $('#gp-snippet-title').val(),
                description: $('#gp-snippet-description').val(),
                type: $('#gp-snippet-type').val(),
                location: $('#gp-snippet-location').val(),
                priority: $('#gp-snippet-priority').val(),
                code: $('#gp-snippet-code').val()
            },
            success: function(response) {
                if (response.success) {
                    showResult($result, 'success', gpAdmin.strings.snippet_saved || 'Snippet saved!');
                    setTimeout(function() { location.reload(); }, 800);
                } else {
                    showResult($result, 'error', response.data || gpAdmin.strings.generic_error || 'Error');
                }
            },
            error: function() {
                showResult($result, 'error', gpAdmin.strings.generic_error || 'Error');
            },
            complete: function() { $btn.prop('disabled', false); }
        });
    });

    // Edit snippet
    $(document).on('click', '.gp-edit-snippet', function() {
        var snippetId = $(this).data('id');
        $.ajax({
            url: gpAdmin.ajaxUrl,
            type: 'POST',
            data: { action: 'gp_get_snippet', nonce: gpAdmin.nonce, snippet_id: snippetId },
            success: function(response) {
                if (response.success && response.data) {
                    var s = response.data;
                    $('#gp-snippet-id').val(s.id);
                    $('#gp-snippet-title').val(s.title || '');
                    $('#gp-snippet-description').val(s.description || '');
                    $('#gp-snippet-type').val(s.type || 'html');
                    $('#gp-snippet-location').val(s.location || 'header');
                    $('#gp-snippet-priority').val(s.priority || 10);
                    $('#gp-snippet-code').val(s.code || '');
                    $('#gp-snippet-form-title').text(gpAdmin.strings.edit_snippet || 'Edit Snippet');
                    $('#gp-snippet-form-wrap').slideDown(200);
                    $('html, body').animate({ scrollTop: $('#gp-snippet-form-wrap').offset().top - 100 }, 300);
                }
            }
        });
    });

    // Toggle snippet
    $(document).on('click', '.gp-snippet-toggle', function() {
        var $btn = $(this);
        var isActive = $btn.data('active') === 1 || $btn.data('active') === '1';
        var newState = isActive ? '0' : '1';

        $.ajax({
            url: gpAdmin.ajaxUrl,
            type: 'POST',
            data: { action: 'gp_toggle_snippet', nonce: gpAdmin.nonce, snippet_id: $btn.data('id'), is_active: newState },
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

    // Trash snippet
    $(document).on('click', '.gp-trash-snippet', function() {
        var $btn = $(this);
        var $row = $btn.closest('tr');
        $.ajax({
            url: gpAdmin.ajaxUrl,
            type: 'POST',
            data: { action: 'gp_trash_snippet', nonce: gpAdmin.nonce, snippet_id: $btn.data('id') },
            success: function(response) {
                if (response.success) {
                    $row.fadeOut(300, function() { $(this).remove(); });
                }
            }
        });
    });

    // Restore snippet
    $(document).on('click', '.gp-restore-snippet', function() {
        var $btn = $(this);
        var $row = $btn.closest('tr');
        $.ajax({
            url: gpAdmin.ajaxUrl,
            type: 'POST',
            data: { action: 'gp_restore_snippet', nonce: gpAdmin.nonce, snippet_id: $btn.data('id') },
            success: function(response) {
                if (response.success) {
                    $row.fadeOut(300, function() { $(this).remove(); });
                }
            }
        });
    });

    // Permanent delete snippet
    $(document).on('click', '.gp-permanent-delete-snippet', function() {
        if (!confirm(gpAdmin.strings.confirm_permanent_delete || 'Are you sure? This cannot be undone.')) return;
        var $btn = $(this);
        var $row = $btn.closest('tr');
        $.ajax({
            url: gpAdmin.ajaxUrl,
            type: 'POST',
            data: { action: 'gp_delete_snippet', nonce: gpAdmin.nonce, snippet_id: $btn.data('id') },
            success: function(response) {
                if (response.success) {
                    $row.fadeOut(300, function() { $(this).remove(); });
                }
            }
        });
    });

    // ==========================================
    // Header: Check for Updates / Update Plugin
    // ==========================================
    $(document).on('click', '#gp-header-check-update', function() {
        var $btn = $(this);
        $btn.prop('disabled', true).addClass('gp-loading').text(gpAdmin.strings.checking || 'Checking...');

        $.ajax({
            url: gpAdmin.ajaxUrl,
            type: 'POST',
            timeout: 30000,
            data: { action: 'gp_check_version', nonce: gpAdmin.nonce },
            success: function(response) {
                if (response.success && response.data.update_available) {
                    var d = response.data;
                    $btn.replaceWith(
                        '<button type="button" id="gp-header-update" class="gp-btn gp-btn-update" ' +
                        'data-version="' + d.latest + '" data-download="' + (d.download_url || '') + '">' +
                        '&#8635; ' + (gpAdmin.strings.update_to || 'Update to v') + d.latest +
                        '</button>'
                    );
                } else {
                    $btn.removeClass('gp-loading').text('\u2713 ' + (gpAdmin.strings.up_to_date || 'Up to date'));
                    setTimeout(function() {
                        $btn.prop('disabled', false).text(gpAdmin.strings.check_updates || 'Check for Updates');
                    }, 3000);
                }
            },
            error: function() {
                $btn.prop('disabled', false).removeClass('gp-loading').text(gpAdmin.strings.check_updates || 'Check for Updates');
            }
        });
    });

    // Header: Perform plugin update
    $(document).on('click', '#gp-header-update', function() {
        var $btn = $(this);
        $btn.prop('disabled', true).text(gpAdmin.strings.updating || 'Updating...');

        // Try WP built-in update AJAX if available
        if (window.wp && wp.updates && wp.updates.ajax) {
            wp.updates.ajax('update-plugin', {
                plugin: gpAdmin.pluginBasename || 'ghostseo-connector/ghostseo-connector.php',
                slug: 'ghostseo-connector',
                success: function() {
                    $btn.text('\u2713 ' + (gpAdmin.strings.updated || 'Updated! Reloading...'));
                    setTimeout(function() { location.reload(); }, 1500);
                },
                error: function() {
                    // Fallback: redirect to WP update page
                    window.location.href = gpAdmin.updateCoreUrl || '/wp-admin/update-core.php';
                }
            });
        } else {
            // Fallback: redirect to WP update page
            window.location.href = gpAdmin.updateCoreUrl || '/wp-admin/update-core.php';
        }
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

    }); // end document.ready

})(jQuery);
`;
}