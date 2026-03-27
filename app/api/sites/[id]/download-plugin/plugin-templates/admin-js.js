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
        $(container).html('<div class="' + cls + '"><p>' + message + '</p></div>');
        setTimeout(function() { $(container).fadeOut(function() { $(this).empty().show(); }); }, 4000);
    }

    // Save redirect (create or update)
    $(document).on('submit', '#gp-redirect-form', function(e) {
        e.preventDefault();

        var data = {
            action: 'gp_save_redirect',
            nonce: gpAdmin.nonce,
            source: $('#gp-source').val(),
            target: $('#gp-target').val(),
            type: $('#gp-type').val(),
            redirect_id: editingId
        };

        $.post(gpAdmin.ajaxUrl, data, function(response) {
            if (response.success) {
                location.reload();
            } else {
                showResult('#gp-redirect-result', response.data || 'Error saving redirect', true);
            }
        }).fail(function() {
            showResult('#gp-redirect-result', 'Request failed', true);
        });
    });

    // Edit redirect
    $(document).on('click', '.gp-edit-redirect', function(e) {
        e.preventDefault();
        var row = $(this).closest('tr');
        editingId = row.data('id');
        $('#gp-source').val(row.data('source'));
        $('#gp-target').val(row.data('target'));
        $('#gp-type').val(row.data('type'));
        $('#gp-form-title').text('Edit Redirect');
        $('#gp-cancel-edit').show();
        $('html, body').animate({ scrollTop: $('#gp-redirect-form').offset().top - 50 }, 300);
    });

    // Cancel edit
    $(document).on('click', '#gp-cancel-edit', function(e) {
        e.preventDefault();
        editingId = '';
        $('#gp-redirect-form')[0].reset();
        $('#gp-type').val('301');
        $('#gp-form-title').text('Add New Redirect');
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
        var row = $(this).closest('tr');
        var btn = $(this);
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

})(jQuery);
`;
}
