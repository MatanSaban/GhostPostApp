/**
 * Generate GP_I18n class - Internationalization support for Ghost Post Connector
 * Supports English and Hebrew with RTL
 */
export function getClassI18n() {
  return `<?php
/**
 * Ghost Post Connector - Internationalization
 *
 * Hooks into WordPress gettext filter to provide Hebrew translations
 * without requiring .mo/.po files. Supports RTL layout detection.
 */

if (!defined('ABSPATH')) {
    exit;
}

class GP_I18n {

    private static $lang = 'en';
    private static $is_rtl = false;
    private static $translations = array();
    private static $initialized = false;

    /**
     * Initialize the i18n system.
     * Call this early (plugins_loaded or before any output).
     */
    public static function init() {
        if (self::$initialized) {
            return;
        }
        self::$initialized = true;

        $saved = get_option('gp_connector_language', 'auto');
        if ($saved === 'auto') {
            $locale = get_locale();
            self::$lang = (strpos($locale, 'he') === 0) ? 'he' : 'en';
        } else {
            self::$lang = $saved;
        }
        self::$is_rtl = (self::$lang === 'he');

        if (self::$lang === 'he') {
            self::load_hebrew();
            add_filter('gettext', array(__CLASS__, 'filter_gettext'), 10, 3);
        }
    }

    /**
     * WordPress gettext filter - translate strings for our text domain only.
     */
    public static function filter_gettext($translated, $text, $domain) {
        if ($domain !== 'ghost-post-connector') {
            return $translated;
        }
        return isset(self::$translations[$text]) ? self::$translations[$text] : $translated;
    }

    /**
     * Get the current plugin language.
     */
    public static function get_lang() {
        return self::$lang;
    }

    /**
     * Whether the plugin should display in RTL.
     */
    public static function is_rtl() {
        return self::$is_rtl;
    }

    /**
     * Return the dir attribute value for the plugin wrapper.
     */
    public static function dir_attr() {
        return self::$is_rtl ? 'rtl' : 'ltr';
    }

    /**
     * Load Hebrew translations map.
     */
    private static function load_hebrew() {
        self::$translations = array(
            // ---- Menu & Page Titles ----
            'Ghost Post Connector' => 'Ghost Post Connector',
            'Dashboard' => 'לוח בקרה',
            'Redirections' => 'הפניות',
            'Settings' => 'הגדרות',

            // ---- Connection Status ----
            'Connection Status' => 'סטטוס חיבור',
            'Connected' => 'מחובר',
            'Disconnected' => 'מנותק',
            'Error' => 'שגיאה',
            'Unknown' => 'לא ידוע',
            'Last ping: %s' => 'פינג אחרון: %s',
            'ago' => 'לפני',
            'Last Error:' => 'שגיאה אחרונה:',
            'Test Connection' => 'בדוק חיבור',
            'Send Ping' => 'שלח פינג',
            'Disconnect' => 'התנתק',
            'Testing...' => 'בודק...',
            'Sending...' => 'שולח...',
            'Disconnecting...' => 'מתנתק...',
            'Connection successful!' => 'החיבור הצליח!',
            'Connection failed:' => 'החיבור נכשל:',
            'Ping sent successfully!' => 'פינג נשלח בהצלחה!',
            'Ping failed:' => 'הפינג נכשל:',
            'Disconnected successfully.' => 'ההתנתקות הצליחה.',
            'Disconnect failed:' => 'ההתנתקות נכשלה:',
            'Disconnect failed. Please try again.' => 'ההתנתקות נכשלה. אנא נסה שוב.',
            'Are you sure you want to disconnect from Ghost Post? You can reconnect later by downloading a new plugin.' => 'האם אתה בטוח שברצונך להתנתק מ-Ghost Post? ניתן להתחבר מחדש על ידי הורדת תוסף חדש.',

            // ---- Site Information ----
            'Site Information' => 'מידע על האתר',
            'Site Key' => 'מפתח אתר',
            'Site ID' => 'מזהה אתר',
            'API URL' => 'כתובת API',
            'Plugin' => 'תוסף',
            'Plugin Version' => 'גרסת תוסף',
            'WordPress' => 'WordPress',
            'WordPress Version' => 'גרסת WordPress',
            'PHP' => 'PHP',
            'PHP Version' => 'גרסת PHP',
            'Check for Updates' => 'בדוק עדכונים',
            'Checking...' => 'בודק...',
            'Update available! Version' => 'עדכון זמין! גרסה',
            'Go to Plugins page to update.' => 'עבור לעמוד תוספים לעדכון.',
            'You have the latest version!' => 'הגרסה שלך מעודכנת!',
            'Failed to check for updates.' => 'בדיקת עדכונים נכשלה.',
            'Connection Error' => 'שגיאת חיבור',
            'Last ping %s ago' => 'פינג אחרון לפני %s',
            '%d active' => '%d פעילות',
            'Not installed' => 'לא מותקן',
            'Manage' => 'נהל',
            'Powered by %s' => 'מופעל על ידי %s',

            // ---- Dashboard Widget ----
            'Site Health Score' => 'ציון בריאות האתר',
            '%d AI Insight is waiting for your approval!' => 'תובנת AI אחת ממתינה לאישורך!',
            '%d AI Insights are waiting for your approval!' => '%d תובנות AI ממתינות לאישורך!',
            'No data yet. Stats will appear after the next sync.' => 'אין נתונים עדיין. הסטטיסטיקות יופיעו לאחר הסנכרון הבא.',
            'Open GhostPost Dashboard' => 'פתח את לוח הבקרה של GhostPost',
            'Sync' => 'סנכרון',
            'Syncing...' => 'מסנכרן...',
            'Widget updated!' => 'הווידג׳ט עודכן!',
            'Sync failed' => 'הסנכרון נכשל',
            'AI Insights waiting' => 'תובנות AI ממתינות',
            'Ghost Post' => 'Ghost Post',
            'Rank Math' => 'Rank Math',

            // ---- Permissions ----
            'Permissions' => 'הרשאות',
            'Ghost Post has the following permissions on this site:' => 'ל-Ghost Post יש את ההרשאות הבאות באתר זה:',
            'To modify permissions, go to your Ghost Post dashboard.' => 'לשינוי הרשאות, עבור ללוח הבקרה של Ghost Post.',
            'Read content' => 'קריאת תוכן',
            'Create content' => 'יצירת תוכן',
            'Update content' => 'עדכון תוכן',
            'Delete content' => 'מחיקת תוכן',
            'Publish content' => 'פרסום תוכן',
            'Upload media' => 'העלאת מדיה',
            'Delete media' => 'מחיקת מדיה',
            'Update SEO meta' => 'עדכון מטא SEO',
            'Manage redirects' => 'ניהול הפניות',
            'Read site information' => 'קריאת מידע אתר',
            'Read custom post types' => 'קריאת סוגי תוכן מותאמים',
            'Create custom post types' => 'יצירת סוגי תוכן מותאמים',
            'Update custom post types' => 'עדכון סוגי תוכן מותאמים',
            'Delete custom post types' => 'מחיקת סוגי תוכן מותאמים',
            'Read ACF fields' => 'קריאת שדות ACF',
            'Update ACF fields' => 'עדכון שדות ACF',
            'Read taxonomies' => 'קריאת טקסונומיות',
            'Manage taxonomies' => 'ניהול טקסונומיות',

            // ---- Detected Plugins ----
            'Detected Plugins' => 'תוספים שזוהו',
            'Yoast SEO' => 'Yoast SEO',
            'RankMath' => 'RankMath',
            'Advanced Custom Fields' => 'Advanced Custom Fields',
            'Redirection Plugins' => 'תוספי הפניות',
            'No redirection plugins detected.' => 'לא זוהו תוספי הפניות.',
            'Manage Redirections' => 'ניהול הפניות',

            // ---- Redirections Page ----
            'Redirection Plugin Detected' => 'זוהה תוסף הפניות',
            'We detected %s on your site. We recommend importing your existing redirects into Ghost Post and then deactivating the external plugin to avoid conflicts and improve performance.' => 'זיהינו %s באתר שלך. מומלץ לייבא את ההפניות הקיימות ל-Ghost Post ולאחר מכן לכבות את התוסף החיצוני למניעת קונפליקטים ולשיפור הביצועים.',
            'Import existing redirects' => 'ייבוא הפניות קיימות',
            'Verify redirects are working' => 'אמת שההפניות עובדות',
            'Deactivate the external plugin' => 'כבה את התוסף החיצוני',
            'Import %d Redirects' => 'ייבוא %d הפניות',
            '%d redirects found in %s' => '%d הפניות נמצאו ב-%s',
            'Active Redirects' => 'הפניות פעילות',
            'Total Redirects' => 'סה"כ הפניות',
            'Total Hits' => 'סה"כ כניסות',
            'Platform Sync' => 'סנכרון פלטפורמה',
            'Add New Redirect' => 'הוסף הפניה חדשה',
            'Edit Redirect' => 'ערוך הפניה',
            'From URL' => 'מכתובת',
            'To URL' => 'לכתובת',
            'Type' => 'סוג',
            '301 (Permanent)' => '301 (קבוע)',
            '302 (Temporary)' => '302 (זמני)',
            '307 (Temporary Redirect)' => '307 (הפניה זמנית)',
            'Add Redirect' => 'הוסף הפניה',
            'Save Redirect' => 'שמור הפניה',
            'Cancel' => 'בטל',
            'No redirects yet. Add your first redirect above or import from an existing plugin.' => 'אין הפניות עדיין. הוסף הפניה ראשונה למעלה או ייבא מתוסף קיים.',
            'Status' => 'סטטוס',
            'From' => 'מ',
            'To' => 'אל',
            'Hits' => 'כניסות',
            'Actions' => 'פעולות',
            'Active' => 'פעיל',
            'Inactive' => 'מושבת',
            'Deactivate Plugin' => 'כבה תוסף',
            'Deactivate %s' => 'כבה %s',
            'Are you sure you want to deactivate %s?' => 'האם אתה בטוח שברצונך לכבות את %s?',
            'Deactivating...' => 'מכבה...',
            'Plugin deactivated successfully. Refreshing...' => 'התוסף כובה בהצלחה. מרענן...',
            'Failed to deactivate plugin.' => 'כיבוי התוסף נכשל.',

            // ---- Settings Page ----
            'Appearance' => 'מראה',
            'Theme' => 'ערכת נושא',
            'Dark' => 'כהה',
            'Light' => 'בהיר',
            'Toggle between dark and light theme.' => 'מעבר בין ערכת נושא כהה ובהירה.',
            'Connection' => 'חיבור',
            'Language' => 'שפה',
            'Plugin Display Language' => 'שפת תצוגת התוסף',
            'Auto (match WordPress)' => 'אוטומטי (לפי WordPress)',
            'English' => 'English',
            'Hebrew' => 'עברית',
            'When set to Auto, it follows the WordPress dashboard language.' => 'כשמוגדר על אוטומטי, עוקב אחרי שפת לוח הבקרה של WordPress.',
            'Save Settings' => 'שמור הגדרות',
            'Saving...' => 'שומר...',
            'Settings saved successfully!' => 'ההגדרות נשמרו בהצלחה!',
            'Failed to save settings.' => 'שמירת ההגדרות נכשלה.',
            'The plugin language will update after saving. When set to Auto, it follows the WordPress dashboard language.' => 'שפת התוסף תתעדכן לאחר השמירה. כשמוגדר על אוטומטי, עוקב אחרי שפת לוח הבקרה של WordPress.',

            // ---- Admin JS strings ----
            'Testing connection...' => 'בודק חיבור...',
            'Connection successful!' => 'החיבור הצליח!',
            'Connection failed' => 'החיבור נכשל',
            'Are you sure you want to delete this redirect?' => 'האם אתה בטוח שברצונך למחוק הפניה זו?',
            'Importing redirects...' => 'מייבא הפניות...',
            'Import completed!' => 'הייבוא הושלם!',
        );
    }
}
`;
}
