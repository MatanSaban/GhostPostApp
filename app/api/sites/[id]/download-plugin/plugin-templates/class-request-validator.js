/**
 * Generate Request Validator class
 */
export function getClassRequestValidator() {
  return `<?php
/**
 * Ghost Post Request Validator
 * 
 * Validates incoming requests using HMAC-SHA256 signatures
 */

if (!defined('ABSPATH')) {
    exit;
}

class GP_Request_Validator {
    
    /**
     * Maximum age of request in seconds (5 minutes)
     */
    const MAX_AGE = 300;
    
    /**
     * Validate a REST API request
     * 
     * @param WP_REST_Request $request
     * @return bool|WP_Error
     */
    public function validate(WP_REST_Request $request) {
        // Get headers
        $site_key = $request->get_header('X-GP-Site-Key');
        $timestamp = (int) $request->get_header('X-GP-Timestamp');
        $signature = $request->get_header('X-GP-Signature');
        
        // Check required headers
        if (empty($site_key) || empty($timestamp) || empty($signature)) {
            return new WP_Error(
                'missing_headers',
                'Missing required authentication headers',
                array('status' => 401)
            );
        }
        
        // Verify site key matches
        if ($site_key !== GP_SITE_KEY) {
            return new WP_Error(
                'invalid_site_key',
                'Invalid site key',
                array('status' => 401)
            );
        }
        
        // Check timestamp is recent
        $now = time();
        $age = $now - $timestamp;
        
        if ($age > self::MAX_AGE) {
            return new WP_Error(
                'request_expired',
                'Request has expired',
                array('status' => 401)
            );
        }
        
        if ($age < -60) { // Allow 1 minute clock skew
            return new WP_Error(
                'invalid_timestamp',
                'Request timestamp is in the future',
                array('status' => 401)
            );
        }
        
        // Get request body
        $body = $request->get_body();
        if (empty($body)) {
            $body = '';
        }
        
        // Verify signature
        $expected_signature = $this->create_signature($body, $timestamp);
        
        if (!hash_equals($expected_signature, $signature)) {
            return new WP_Error(
                'invalid_signature',
                'Invalid request signature',
                array('status' => 401)
            );
        }
        
        return true;
    }
    
    /**
     * Create HMAC-SHA256 signature
     * 
     * @param string $payload Request body
     * @param int $timestamp Unix timestamp
     * @return string
     */
    private function create_signature($payload, $timestamp) {
        $data = $timestamp . '.' . $payload;
        return hash_hmac('sha256', $data, GP_SITE_SECRET);
    }
}
`;
}
