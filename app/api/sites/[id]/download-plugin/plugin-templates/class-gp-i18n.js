/**
 * Generate GP_I18n class - Internationalization support for GhostSEO Connector
 * Supports English and Hebrew with RTL
 */
export function getClassI18n() {
  return `<?php
/**
 * GhostSEO Connector - Internationalization
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
            add_filter('ngettext', array(__CLASS__, 'filter_ngettext'), 10, 5);
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
     * WordPress ngettext filter - translate plural strings for our text domain only.
     */
    public static function filter_ngettext($translation, $single, $plural, $number, $domain) {
        if ($domain !== 'ghost-post-connector') {
            return $translation;
        }
        $key = ($number === 1) ? $single : $plural;
        return isset(self::$translations[$key]) ? self::$translations[$key] : $translation;
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
            'GhostSEO Connector' => 'GhostSEO Connector',
            'Dashboard' => 'לוח בקרה',
            'Redirections' => 'הפניות',
            'Settings' => 'הגדרות',
            'Activity' => 'פעילות',
            'Add-ons' => 'תוספים',

            // ---- Connection Status ----
            'Connection Status' => 'סטטוס חיבור',
            'Connected' => 'מחובר',
            'Disconnected' => 'מנותק',
            'Your site is connected to GhostSEO' => 'האתר שלך מחובר ל-GhostSEO',
            'GhostSEO is managing this site. All systems are operational.' => 'GhostSEO מנהל את האתר הזה. כל המערכות פעילות.',
            'Last Check' => 'בדיקה אחרונה',
            'Site URL' => 'כתובת האתר',
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
            'Are you sure you want to disconnect from GhostSEO? You can reconnect later by downloading a new plugin.' => 'האם אתה בטוח שברצונך להתנתק מ-GhostSEO? ניתן להתחבר מחדש על ידי הורדת תוסף חדש.',
            'Connection' => 'חיבור',

            // ---- Site Information ----
            'Site Information' => 'מידע על האתר',
            'Site Key' => 'מפתח אתר',
            'Site ID' => 'מזהה אתר',
            'API URL' => 'כתובת API',
            'Platform URL' => 'כתובת הפלטפורמה',
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
            'Last Ping' => 'פינג אחרון',
            'Last Connection Check' => 'בדיקת חיבור אחרונה',
            'Never' => 'אף פעם',
            '%s ago' => 'לפני %s',

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
            'GhostSEO' => 'GhostSEO',
            'Rank Math' => 'Rank Math',

            // ---- Permissions ----
            'Permissions' => 'הרשאות',
            'GhostSEO has the following permissions on this site:' => 'ל-GhostSEO יש את ההרשאות הבאות באתר זה:',
            'To modify permissions, go to your GhostSEO dashboard.' => 'לשינוי הרשאות, עבור ללוח הבקרה של GhostSEO.',
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

            // ---- Detected Plugins / Add-ons ----
            'Detected Plugins' => 'תוספים שזוהו',
            'Yoast SEO' => 'Yoast SEO',
            'RankMath' => 'RankMath',
            'Advanced Custom Fields' => 'Advanced Custom Fields',
            'Redirection Plugins' => 'תוספי הפניות',
            'No redirection plugins detected.' => 'לא זוהו תוספי הפניות.',
            'Manage Redirections' => 'ניהול הפניות',
            'Active Integrations' => 'אינטגרציות פעילות',
            'Active plugins that GhostSEO integrates with on your site.' => 'תוספים פעילים ש-GhostSEO משתלב איתם באתר שלך.',
            'No supported integrations detected on this site.' => 'לא זוהו אינטגרציות נתמכות באתר זה.',
            'SEO Plugins' => 'תוספי SEO',
            'Content Plugins' => 'תוספי תוכן',

            // ---- Redirections Page ----
            'Redirection Plugin Detected' => 'זוהה תוסף הפניות',
            'We detected %s on your site. We recommend importing your existing redirects into GhostSEO and then deactivating the external plugin to avoid conflicts and improve performance.' => 'זיהינו %s באתר שלך. מומלץ לייבא את ההפניות הקיימות ל-GhostSEO ולאחר מכן לכבות את התוסף החיצוני למניעת קונפליקטים ולשיפור הביצועים.',
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
            'Choose the display theme for the GhostSEO admin panel.' => 'בחר את ערכת הנושא לתצוגה בלוח הניהול של GhostSEO.',
            'Language' => 'שפה',
            'Plugin Display Language' => 'שפת תצוגת התוסף',
            'Auto (match WordPress)' => 'אוטומטי (לפי WordPress)',
            'English' => 'English',
            'Hebrew' => 'עברית',
            'When set to Auto, it follows the WordPress dashboard language.' => 'כשמוגדר על אוטומטי, עוקב אחרי שפת לוח הבקרה של WordPress.',
            'Choose the plugin display language. When set to Auto, it follows the WordPress dashboard language.' => 'בחר את שפת התצוגה של התוסף. כשמוגדר על אוטומטי, עוקב אחרי שפת לוח הבקרה של WordPress.',
            'Save Settings' => 'שמור הגדרות',
            'Saving...' => 'שומר...',
            'Settings saved successfully!' => 'ההגדרות נשמרו בהצלחה!',
            'Failed to save settings.' => 'שמירת ההגדרות נכשלה.',
            'The plugin language will update after saving. When set to Auto, it follows the WordPress dashboard language.' => 'שפת התוסף תתעדכן לאחר השמירה. כשמוגדר על אוטומטי, עוקב אחרי שפת לוח הבקרה של WordPress.',
            'Theme saved!' => 'ערכת הנושא נשמרה!',

            // ---- Activity Tab ----
            'Recent Activity' => 'פעילות אחרונה',
            'Actions performed by GhostSEO on your site.' => 'פעולות שבוצעו על ידי GhostSEO באתר שלך.',
            'Action' => 'פעולה',
            'Details' => 'פרטים',
            'Time' => 'זמן',
            'No activity recorded yet. Actions will appear here once GhostSEO starts managing your content.' => 'טרם נרשמה פעילות. פעולות יופיעו כאן ברגע ש-GhostSEO יתחיל לנהל את התוכן שלך.',
            'No activity recorded yet. Actions performed by GhostSEO will appear here.' => 'טרם נרשמה פעילות. פעולות שבוצעו על ידי GhostSEO יופיעו כאן.',
            'connection_verified' => 'חיבור אומת',
            'disconnected' => 'מנותק',
            'content_created' => 'תוכן נוצר',
            'content_updated' => 'תוכן עודכן',
            'content_deleted' => 'תוכן נמחק',
            'media_uploaded' => 'מדיה הועלתה',
            'seo_updated' => 'SEO עודכן',
            'redirect_created' => 'הפניה נוצרה',
            'redirect_updated' => 'הפניה עודכנה',
            'redirect_deleted' => 'הפניה נמחקה',
            'plugin_deactivated' => 'תוסף כובה',
            'settings_changed' => 'הגדרות שונו',

            // ---- Activity Detail strings ----
            'Connection verified with GhostPost platform' => 'החיבור אומת עם פלטפורמת GhostPost',
            'Disconnected from GhostPost platform' => 'התנתק מפלטפורמת GhostPost',

            // ---- Admin JS strings ----
            'Testing connection...' => 'בודק חיבור...',
            'Connection successful!' => 'החיבור הצליח!',
            'Connection failed' => 'החיבור נכשל',
            'Are you sure you want to delete this redirect?' => 'האם אתה בטוח שברצונך למחוק הפניה זו?',
            'Importing redirects...' => 'מייבא הפניות...',
            'Import completed!' => 'הייבוא הושלם!',

            // ---- Version & Update ----
            'Version Information' => 'מידע על גרסה',
            'Current plugin version and update status.' => 'גרסת התוסף הנוכחית וסטטוס עדכון.',
            'Current Version' => 'גרסה נוכחית',
            'Latest Version' => 'גרסה אחרונה',
            'Update Now' => 'עדכן עכשיו',
            'Up to date' => 'מעודכן',
            'Not checked yet' => 'טרם נבדק',
            'Update to v%s' => 'עדכן לגרסה %s',
            'Checking for updates...' => 'בודק עדכונים...',
            'You are using the latest version.' => 'אתה משתמש בגרסה העדכנית ביותר.',
            'Could not check for updates.' => 'לא ניתן לבדוק עדכונים.',
            'Update available! Version' => 'עדכון זמין! גרסה',

            // ---- SEO Insights ----
            'SEO Insights' => 'תובנות SEO',
            'Overview of your website SEO performance from GhostSEO platform.' => 'סקירה כללית של ביצועי ה-SEO של האתר שלך מפלטפורמת GhostSEO.',
            'Refresh Data' => 'רענן נתונים',
            'Loading SEO data...' => 'טוען נתוני SEO...',
            'Could not load SEO data.' => 'לא ניתן לטעון נתוני SEO.',
            'Total Traffic' => 'תנועה כוללת',
            'AI Traffic' => 'תנועת AI',
            'Tracked Keywords' => 'מילות מפתח במעקב',
            'Agent Issues' => 'בעיות סוכן',
            'Traffic Overview' => 'סקירת תנועה',
            'AI Agent Issues' => 'בעיות סוכן AI',
            'No issues found.' => 'לא נמצאו בעיות.',
            'Top 10 Keywords' => '10 מילות המפתח המובילות',
            'Keyword' => 'מילת מפתח',
            'Position' => 'מיקום',
            'Volume' => 'נפח חיפוש',
            'Change' => 'שינוי',
            'Top 10 Pages' => '10 העמודים המובילים',
            'Page' => 'עמוד',
            'Traffic' => 'תנועה',
            'Avg. Position' => 'מיקום ממוצע',
            'Organic Traffic' => 'תנועה אורגנית',

            // ---- Header Update ----
            'Update to v' => 'עדכן לגרסה ',
            'Updating...' => 'מעדכן...',
            'Updated! Reloading...' => 'עודכן! טוען מחדש...',

            // ---- Code Snippets ----
            'Code Snippets' => 'קטעי קוד',
            'Active Snippets' => 'קטעי קוד פעילים',
            'Trash' => 'פח',
            'Trash is empty.' => 'הפח ריק.',
            'Add New Snippet' => 'הוסף קטע קוד חדש',
            'Edit Snippet' => 'ערוך קטע קוד',
            'Save Snippet' => 'שמור קטע קוד',
            'Title' => 'כותרת',
            'Description' => 'תיאור',
            'Code Type' => 'סוג קוד',
            'Location' => 'מיקום',
            'Header' => 'כותרת עליונה',
            'Footer' => 'כותרת תחתונה',
            'Everywhere' => 'בכל מקום',
            'Priority' => 'עדיפות',
            'Code' => 'קוד',
            'Last Edit' => 'עריכה אחרונה',
            'Restore' => 'שחזר',
            'Delete Permanently' => 'מחק לצמיתות',
            'Edit' => 'ערוך',
            'Move to Trash' => 'העבר לפח',
            'No code snippets yet. Add your first snippet or let GhostSEO manage custom code for your site.' => 'אין קטעי קוד עדיין. הוסף את קטע הקוד הראשון שלך או תן ל-GhostSEO לנהל קוד מותאם אישית לאתר שלך.',
            'Snippet saved successfully!' => 'קטע הקוד נשמר בהצלחה!',
            'Snippet moved to trash.' => 'קטע הקוד הועבר לפח.',
            'Snippet restored.' => 'קטע הקוד שוחזר.',
            'Snippet permanently deleted.' => 'קטע הקוד נמחק לצמיתות.',
            'Are you sure? This cannot be undone.' => 'האם אתה בטוח? לא ניתן לבטל פעולה זו.',
            'An error occurred. Please try again.' => 'אירעה שגיאה. אנא נסה שוב.',
            'e.g. Google Analytics Script' => 'לדוגמה: סקריפט Google Analytics',
            'Brief description of what this snippet does' => 'תיאור קצר של מה שקטע הקוד עושה',
            'Paste your code here...' => 'הדבק את הקוד שלך כאן...',
            'Choose the display theme for the GhostSEO plugin.' => 'בחר את ערכת הנושא לתצוגה בתוסף GhostSEO.',
        );
    }
}
`;
}