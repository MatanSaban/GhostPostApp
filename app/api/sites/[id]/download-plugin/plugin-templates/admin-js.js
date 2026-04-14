/**
 * Generate admin JavaScript file for Ghost Post Connector
 */
export function getAdminJs() {
  return `(function($) {
    'use strict';

    // ========== Redirects Management ==========

    var editingId = '';

    // Show result message
    function showResult(container, message, isError) {
        var cls = isError ? 'notice notice-error' : 'notice notice-success';
        $(container).html('<div class="' + cls + '"><p>' + message + '</p></div>').show();
        setTimeout(function() { $(container).fadeOut(function() { $(this).empty().show(); }); }, 4000);
    }

    // Save redirect (create or update)
    $(document).on('submit', '#gp-redirect-form', function(e) {
        e.preventDefault();

        var data = {
            action: 'gp_save_redirect',
            nonce: gpAdmin.nonce,
            source: $('#gp-source-url').val(),
            target: $('#gp-target-url').val(),
            type: $('#gp-redirect-type').val(),
            redirect_id: editingId
        };

        $.post(gpAdmin.ajaxUrl, data, function(response) {
            if (response.success) {
                location.reload();
            } else {
                showResult('#gp-save-result', response.data || 'Error saving redirect', true);
            }
        }).fail(function() {
            showResult('#gp-save-result', 'Request failed', true);
        });
    });

    // Edit redirect
    $(document).on('click', '.gp-edit-redirect', function(e) {
        e.preventDefault();
        var btn = $(this);
        editingId = btn.data('id');
        $('#gp-source-url').val(btn.data('source'));
        $('#gp-target-url').val(btn.data('target'));
        $('#gp-redirect-type').val(btn.data('type'));
        $('#gp-save-redirect').text(gpAdmin.strings.save_redirect || 'Save Redirect');
        $('#gp-cancel-edit').show();
        $('html, body').animate({ scrollTop: $('#gp-redirect-form').offset().top - 50 }, 300);
    });

    // Cancel edit
    $(document).on('click', '#gp-cancel-edit', function(e) {
        e.preventDefault();
        editingId = '';
        $('#gp-redirect-form')[0].reset();
        $('#gp-redirect-type').val('301');
        $('#gp-save-redirect').text(gpAdmin.strings.add_redirect || 'Add Redirect');
        $(this).hide();
    });

    // Delete redirect
    $(document).on('click', '.gp-delete-redirect', function(e) {
        e.preventDefault();
        if (!confirm(gpAdmin.strings.confirm_delete)) return;

        var row = $(this).closest('tr');
        var data = {
            action: 'gp_delete_redirect',
            nonce: gpAdmin.nonce,
            redirect_id: row.data('id')
        };

        $.post(gpAdmin.ajaxUrl, data, function(response) {
            if (response.success) {
                row.fadeOut(function() { $(this).remove(); });
            } else {
                alert(response.data || 'Error deleting redirect');
            }
        });
    });

    // Toggle redirect active/inactive
    $(document).on('click', '.gp-toggle-status', function(e) {
        e.preventDefault();
        var btn = $(this);
        var row = btn.closest('tr');
        var data = {
            action: 'gp_toggle_redirect',
            nonce: gpAdmin.nonce,
            redirect_id: row.data('id'),
            active: btn.data('active') ? '1' : '0'
        };

        $.post(gpAdmin.ajaxUrl, data, function(response) {
            if (response.success) {
                location.reload();
            } else {
                alert(response.data || 'Error toggling redirect');
            }
        });
    });

    // Import redirects from detected plugin
    $(document).on('click', '#gp-import-redirects', function(e) {
        e.preventDefault();
        var btn = $(this);
        btn.prop('disabled', true).text(gpAdmin.strings.importing);

        var data = {
            action: 'gp_import_redirects',
            nonce: gpAdmin.nonce
        };

        $.post(gpAdmin.ajaxUrl, data, function(response) {
            if (response.success) {
                showResult('#gp-import-result', gpAdmin.strings.import_success + ' Imported: ' + (response.data.imported || 0), false);
                setTimeout(function() { location.reload(); }, 1500);
            } else {
                showResult('#gp-import-result', response.data || 'Import failed', true);
                btn.prop('disabled', false).text('Import Redirects');
            }
        }).fail(function() {
            showResult('#gp-import-result', 'Request failed', true);
            btn.prop('disabled', false).text('Import Redirects');
        });
    });

    // ========== Deactivate third-party plugin ==========

    $(document).on('click', '.gp-deactivate-plugin', function(e) {
        e.preventDefault();
        var btn = $(this);
        var pluginSlug = btn.data('slug');
        var pluginName = btn.data('name');

        if (!confirm(gpAdmin.strings.confirm_deactivate
            ? gpAdmin.strings.confirm_deactivate.replace('%s', pluginName)
            : 'Are you sure you want to deactivate ' + pluginName + '?')) {
            return;
        }

        btn.prop('disabled', true).text(gpAdmin.strings.deactivating || 'Deactivating...');

        $.post(gpAdmin.ajaxUrl, {
            action: 'gp_deactivate_plugin',
            nonce: gpAdmin.nonce,
            plugin_slug: pluginSlug
        }, function(response) {
            if (response.success) {
                alert(gpAdmin.strings.deactivated || 'Plugin deactivated successfully. Refreshing...');
                location.reload();
            } else {
                alert(response.data || 'Failed to deactivate plugin.');
                btn.prop('disabled', false).text(pluginName);
            }
        }).fail(function() {
            alert('Request failed.');
            btn.prop('disabled', false).text(pluginName);
        });
    });

    // ========== Settings: Theme toggle ==========

    $(document).on('change', '#gp-theme-toggle', function() {
        var isLight = $(this).is(':checked');
        var theme = isLight ? 'light' : 'dark';
        var wrap = $('.gp-wrap');

        // Apply theme immediately
        if (isLight) {
            wrap.addClass('gp-theme-light');
        } else {
            wrap.removeClass('gp-theme-light');
        }

        // Update icon highlights
        var icons = $(this).closest('.gp-theme-switcher').find('.gp-theme-icon');
        icons.removeClass('gp-active-icon');
        if (isLight) {
            icons.last().addClass('gp-active-icon');
        } else {
            icons.first().addClass('gp-active-icon');
        }

        // Save to server
        $.post(gpAdmin.ajaxUrl, {
            action: 'gp_save_theme',
            nonce: gpAdmin.nonce,
            theme: theme,
        });
    });

    // ========== Settings: Language save ==========

    $(document).on('submit', '#gp-language-form', function(e) {
        e.preventDefault();
        var btn = $('#gp-save-language');
        btn.prop('disabled', true).text(gpAdmin.strings.saving || 'Saving...');

        $.post(gpAdmin.ajaxUrl, {
            action: 'gp_save_language',
            nonce: gpAdmin.nonce,
            language: $('#gp-language-select').val()
        }, function(response) {
            if (response.success) {
                showResult('#gp-language-result', gpAdmin.strings.settings_saved || 'Settings saved successfully!', false);
                setTimeout(function() { location.reload(); }, 1000);
            } else {
                showResult('#gp-language-result', response.data || 'Failed to save settings.', true);
            }
        }).fail(function() {
            showResult('#gp-language-result', 'Request failed.', true);
        }).always(function() {
            btn.prop('disabled', false).text(gpAdmin.strings.save_settings || 'Save Settings');
        });
    });

    // ========== Dashboard & Settings: Connection actions ==========

    $(document).on('click', '#gp-check-updates', function() {
        var btn = $(this);
        btn.prop('disabled', true).text(gpAdmin.strings.checking || 'Checking...');

        $.post(gpAdmin.ajaxUrl, { action: 'gp_check_for_updates' }, function(response) {
            if (response.success) {
                if (response.data.update_available) {
                    alert((gpAdmin.strings.update_available || 'Update available! Version') + ' ' + response.data.version + '. ' + (gpAdmin.strings.go_to_plugins || 'Go to Plugins page to update.'));
                } else {
                    alert(gpAdmin.strings.latest_version || 'You have the latest version!');
                }
            } else {
                alert(gpAdmin.strings.check_failed || 'Failed to check for updates.');
            }
        }).fail(function() {
            alert(gpAdmin.strings.check_failed || 'Failed to check for updates.');
        }).always(function() {
            btn.prop('disabled', false).text(gpAdmin.strings.check_updates || 'Check for Updates');
        });
    });

    $(document).on('click', '#gp-test-connection', function() {
        var btn = $(this);
        btn.prop('disabled', true).text(gpAdmin.strings.testing || 'Testing...');

        $.post(gpAdmin.ajaxUrl, { action: 'gp_test_connection' }, function(response) {
            if (response.success) {
                alert(gpAdmin.strings.connection_success || 'Connection successful!');
                location.reload();
            } else {
                alert((gpAdmin.strings.connection_failed || 'Connection failed:') + ' ' + response.data);
            }
        }).fail(function(xhr) {
            alert((gpAdmin.strings.connection_failed || 'Connection failed:') + ' ' + xhr.responseText);
        }).always(function() {
            btn.prop('disabled', false).text(gpAdmin.strings.test_connection || 'Test Connection');
        });
    });

    $(document).on('click', '#gp-send-ping', function() {
        var btn = $(this);
        btn.prop('disabled', true).text(gpAdmin.strings.sending || 'Sending...');

        $.post(gpAdmin.ajaxUrl, { action: 'gp_send_ping' }, function(response) {
            if (response.success) {
                alert(gpAdmin.strings.ping_success || 'Ping sent successfully!');
                location.reload();
            } else {
                alert((gpAdmin.strings.ping_failed || 'Ping failed:') + ' ' + response.data);
            }
        }).always(function() {
            btn.prop('disabled', false).text(gpAdmin.strings.send_ping || 'Send Ping');
        });
    });

    $(document).on('click', '#gp-disconnect', function() {
        if (!confirm(gpAdmin.strings.confirm_disconnect || 'Are you sure you want to disconnect from Ghost Post?')) {
            return;
        }

        var btn = $(this);
        btn.prop('disabled', true).text(gpAdmin.strings.disconnecting || 'Disconnecting...');

        $.post(gpAdmin.ajaxUrl, { action: 'gp_disconnect' }, function(response) {
            if (response.success) {
                alert(gpAdmin.strings.disconnected || 'Disconnected successfully.');
                location.reload();
            } else {
                alert((gpAdmin.strings.disconnect_failed || 'Disconnect failed:') + ' ' + response.data);
            }
        }).fail(function() {
            alert(gpAdmin.strings.disconnect_error || 'Disconnect failed. Please try again.');
        }).always(function() {
            btn.prop('disabled', false).text(gpAdmin.strings.disconnect || 'Disconnect');
        });
    });

})(jQuery);
`;
}
