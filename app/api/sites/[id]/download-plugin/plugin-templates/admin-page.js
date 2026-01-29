/**
 * Generate Admin Settings Page
 */
export function getAdminPage() {
  return `<?php
/**
 * Ghost Post Connector Admin Settings Page
 */

if (!defined('ABSPATH')) {
    exit;
}

$status = get_option('gp_connector_connection_status', 'unknown');
$last_ping = get_option('gp_connector_last_ping', null);
$last_error = get_option('gp_connector_last_error', null);
?>

<div class="wrap gp-connector-settings">
    <h1>
        <img src="<?php echo esc_url(GP_CONNECTOR_PLUGIN_URL . 'assets/images/ghost-post-icon.png'); ?>" 
             alt="Ghost Post" 
             class="gp-logo"
             onerror="this.style.display='none'">
        <?php esc_html_e('Ghost Post Connector', 'ghost-post-connector'); ?>
    </h1>
    
    <div class="gp-status-card">
        <h2><?php esc_html_e('Connection Status', 'ghost-post-connector'); ?></h2>
        
        <div class="gp-status-indicator gp-status-<?php echo esc_attr($status); ?>">
            <span class="gp-status-dot"></span>
            <span class="gp-status-text">
                <?php
                switch ($status) {
                    case 'connected':
                        esc_html_e('Connected', 'ghost-post-connector');
                        break;
                    case 'disconnected':
                        esc_html_e('Disconnected', 'ghost-post-connector');
                        break;
                    case 'error':
                        esc_html_e('Error', 'ghost-post-connector');
                        break;
                    default:
                        esc_html_e('Unknown', 'ghost-post-connector');
                }
                ?>
            </span>
        </div>
        
        <?php if ($last_ping): ?>
        <p class="gp-last-ping">
            <?php 
            printf(
                esc_html__('Last ping: %s', 'ghost-post-connector'),
                human_time_diff($last_ping) . ' ' . esc_html__('ago', 'ghost-post-connector')
            ); 
            ?>
        </p>
        <?php endif; ?>
        
        <?php if ($last_error): ?>
        <div class="gp-error-message">
            <strong><?php esc_html_e('Last Error:', 'ghost-post-connector'); ?></strong>
            <?php echo esc_html($last_error); ?>
        </div>
        <?php endif; ?>
        
        <div class="gp-actions">
            <button type="button" class="button button-primary" id="gp-test-connection">
                <?php esc_html_e('Test Connection', 'ghost-post-connector'); ?>
            </button>
            <button type="button" class="button" id="gp-send-ping">
                <?php esc_html_e('Send Ping', 'ghost-post-connector'); ?>
            </button>
            <?php if ($status === 'connected'): ?>
            <button type="button" class="button button-link-delete" id="gp-disconnect">
                <?php esc_html_e('Disconnect', 'ghost-post-connector'); ?>
            </button>
            <?php endif; ?>
        </div>
    </div>
    
    <div class="gp-info-card">
        <h2><?php esc_html_e('Site Information', 'ghost-post-connector'); ?></h2>
        
        <table class="gp-info-table">
            <tr>
                <th><?php esc_html_e('Site Key', 'ghost-post-connector'); ?></th>
                <td><code><?php echo esc_html(GP_SITE_KEY); ?></code></td>
            </tr>
            <tr>
                <th><?php esc_html_e('Site ID', 'ghost-post-connector'); ?></th>
                <td><code><?php echo esc_html(GP_SITE_ID); ?></code></td>
            </tr>
            <tr>
                <th><?php esc_html_e('API URL', 'ghost-post-connector'); ?></th>
                <td><code><?php echo esc_html(GP_API_URL); ?></code></td>
            </tr>
            <tr>
                <th><?php esc_html_e('Plugin Version', 'ghost-post-connector'); ?></th>
                <td><?php echo esc_html(GP_CONNECTOR_VERSION); ?></td>
            </tr>
            <tr>
                <th><?php esc_html_e('WordPress Version', 'ghost-post-connector'); ?></th>
                <td><?php echo esc_html(get_bloginfo('version')); ?></td>
            </tr>
            <tr>
                <th><?php esc_html_e('PHP Version', 'ghost-post-connector'); ?></th>
                <td><?php echo esc_html(phpversion()); ?></td>
            </tr>
        </table>
    </div>
    
    <div class="gp-permissions-card">
        <h2><?php esc_html_e('Permissions', 'ghost-post-connector'); ?></h2>
        <p><?php esc_html_e('Ghost Post has the following permissions on this site:', 'ghost-post-connector'); ?></p>
        
        <ul class="gp-permissions-list">
            <?php
            $permissions = unserialize(GP_PERMISSIONS);
            $permission_labels = array(
                'CONTENT_READ' => __('Read content', 'ghost-post-connector'),
                'CONTENT_CREATE' => __('Create content', 'ghost-post-connector'),
                'CONTENT_UPDATE' => __('Update content', 'ghost-post-connector'),
                'CONTENT_DELETE' => __('Delete content', 'ghost-post-connector'),
                'CONTENT_PUBLISH' => __('Publish content', 'ghost-post-connector'),
                'MEDIA_UPLOAD' => __('Upload media', 'ghost-post-connector'),
                'MEDIA_DELETE' => __('Delete media', 'ghost-post-connector'),
                'SEO_UPDATE' => __('Update SEO meta', 'ghost-post-connector'),
                'REDIRECTS_MANAGE' => __('Manage redirects', 'ghost-post-connector'),
                'SITE_INFO_READ' => __('Read site information', 'ghost-post-connector'),
                'CPT_READ' => __('Read custom post types', 'ghost-post-connector'),
                'CPT_CREATE' => __('Create custom post types', 'ghost-post-connector'),
                'CPT_UPDATE' => __('Update custom post types', 'ghost-post-connector'),
                'CPT_DELETE' => __('Delete custom post types', 'ghost-post-connector'),
                'ACF_READ' => __('Read ACF fields', 'ghost-post-connector'),
                'ACF_UPDATE' => __('Update ACF fields', 'ghost-post-connector'),
                'TAXONOMY_READ' => __('Read taxonomies', 'ghost-post-connector'),
                'TAXONOMY_MANAGE' => __('Manage taxonomies', 'ghost-post-connector'),
            );
            
            foreach ($permissions as $perm) {
                $label = $permission_labels[$perm] ?? $perm;
                echo '<li><span class="dashicons dashicons-yes-alt"></span> ' . esc_html($label) . '</li>';
            }
            ?>
        </ul>
        
        <p class="gp-permissions-note">
            <?php esc_html_e('To modify permissions, go to your Ghost Post dashboard.', 'ghost-post-connector'); ?>
        </p>
    </div>
    
    <div class="gp-plugins-card">
        <h2><?php esc_html_e('Detected Plugins', 'ghost-post-connector'); ?></h2>
        
        <ul class="gp-plugins-list">
            <li>
                <span class="dashicons <?php echo defined('WPSEO_VERSION') ? 'dashicons-yes' : 'dashicons-no'; ?>"></span>
                <?php esc_html_e('Yoast SEO', 'ghost-post-connector'); ?>
                <?php if (defined('WPSEO_VERSION')): ?>
                    <span class="gp-version"><?php echo esc_html(WPSEO_VERSION); ?></span>
                <?php endif; ?>
            </li>
            <li>
                <span class="dashicons <?php echo defined('RANK_MATH_VERSION') ? 'dashicons-yes' : 'dashicons-no'; ?>"></span>
                <?php esc_html_e('RankMath', 'ghost-post-connector'); ?>
                <?php if (defined('RANK_MATH_VERSION')): ?>
                    <span class="gp-version"><?php echo esc_html(RANK_MATH_VERSION); ?></span>
                <?php endif; ?>
            </li>
            <li>
                <span class="dashicons <?php echo class_exists('ACF') ? 'dashicons-yes' : 'dashicons-no'; ?>"></span>
                <?php esc_html_e('Advanced Custom Fields', 'ghost-post-connector'); ?>
                <?php if (defined('ACF_VERSION')): ?>
                    <span class="gp-version"><?php echo esc_html(ACF_VERSION); ?></span>
                <?php endif; ?>
            </li>
        </ul>
    </div>
</div>

<script>
jQuery(document).ready(function($) {
    $('#gp-test-connection').on('click', function() {
        var $btn = $(this);
        $btn.prop('disabled', true).text('<?php esc_html_e('Testing...', 'ghost-post-connector'); ?>');
        
        $.ajax({
            url: ajaxurl,
            method: 'POST',
            data: {
                action: 'gp_test_connection'
            },
            success: function(response) {
                if (response.success) {
                    alert('<?php esc_html_e('Connection successful!', 'ghost-post-connector'); ?>');
                    location.reload();
                } else {
                    alert('<?php esc_html_e('Connection failed:', 'ghost-post-connector'); ?> ' + response.data);
                }
            },
            error: function(xhr) {
                alert('<?php esc_html_e('Connection failed:', 'ghost-post-connector'); ?> ' + xhr.responseText);
            },
            complete: function() {
                $btn.prop('disabled', false).text('<?php esc_html_e('Test Connection', 'ghost-post-connector'); ?>');
            }
        });
    });
    
    $('#gp-send-ping').on('click', function() {
        var $btn = $(this);
        $btn.prop('disabled', true).text('<?php esc_html_e('Sending...', 'ghost-post-connector'); ?>');
        
        $.ajax({
            url: ajaxurl,
            method: 'POST',
            data: {
                action: 'gp_send_ping'
            },
            success: function(response) {
                if (response.success) {
                    alert('<?php esc_html_e('Ping sent successfully!', 'ghost-post-connector'); ?>');
                    location.reload();
                } else {
                    alert('<?php esc_html_e('Ping failed:', 'ghost-post-connector'); ?> ' + response.data);
                }
            },
            complete: function() {
                $btn.prop('disabled', false).text('<?php esc_html_e('Send Ping', 'ghost-post-connector'); ?>');
            }
        });
    });
    
    $('#gp-disconnect').on('click', function() {
        if (!confirm('<?php esc_html_e('Are you sure you want to disconnect from Ghost Post? You can reconnect later by downloading a new plugin.', 'ghost-post-connector'); ?>')) {
            return;
        }
        
        var $btn = $(this);
        $btn.prop('disabled', true).text('<?php esc_html_e('Disconnecting...', 'ghost-post-connector'); ?>');
        
        $.ajax({
            url: ajaxurl,
            method: 'POST',
            data: {
                action: 'gp_disconnect'
            },
            success: function(response) {
                if (response.success) {
                    alert('<?php esc_html_e('Disconnected successfully.', 'ghost-post-connector'); ?>');
                    location.reload();
                } else {
                    alert('<?php esc_html_e('Disconnect failed:', 'ghost-post-connector'); ?> ' + response.data);
                }
            },
            error: function() {
                alert('<?php esc_html_e('Disconnect failed. Please try again.', 'ghost-post-connector'); ?>');
            },
            complete: function() {
                $btn.prop('disabled', false).text('<?php esc_html_e('Disconnect', 'ghost-post-connector'); ?>');
            }
        });
    });
});
</script>
`;
}
