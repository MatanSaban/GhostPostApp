/**
 * Generate the Element Manipulator class.
 * Unified insert / update / delete across Elementor, Beaver Builder, and raw HTML.
 */
export function getClassElementManipulator() {
  return `<?php
/**
 * GP_Element_Manipulator
 *
 * Single entry point for AI-driven structural edits. Accepts a builder-agnostic
 * spec describing what to change and how to locate it, then dispatches to the
 * correct handler for the builder that actually stores the page.
 *
 * All mutations capture a rollback snapshot so the platform can undo cleanly.
 */

if (!defined('ABSPATH')) {
    exit;
}

class GP_Element_Manipulator {

    const HEADING_TAGS = array('h1','h2','h3','h4','h5','h6');

    /**
     * Main entry. $spec shape:
     * [
     *   'operation' => 'insert'|'update'|'delete',
     *   'target'    => [
     *     'kind'     => 'widget_id'|'text_match'|'tag_text'|'selector'|'all_of_tag',
     *     'value'    => string,
     *     'tag'      => ?string,
     *     'position' => 'before'|'after'|'inside_start'|'inside_end'|'replace',
     *   ],
     *   'element'   => [ 'tag'=>string, 'text'=>string, 'attrs'=>array ],
     * ]
     */
    public static function run($post_id, $spec) {
        $post = get_post($post_id);
        if (!$post) {
            return new WP_Error('not_found', 'Post not found', array('status' => 404));
        }

        $operation = isset($spec['operation']) ? $spec['operation'] : '';
        if (!in_array($operation, array('insert','update','delete'), true)) {
            return new WP_Error('bad_op', 'Unknown operation: ' . $operation, array('status' => 400));
        }

        // Accept both shapes for forward/backwards compatibility with the platform:
        //  - canonical: spec.target.{kind,value,tag,position}, spec.element, spec.mutation
        //  - legacy:    spec.locator.{kind,value,tag,text,selector}, spec.position (flat), spec.mutation
        // Earlier platform builds emitted the legacy shape — if we only read
        // spec.target we 400 with "insert requires position…" even when the
        // caller supplied everything correctly under spec.locator + spec.position.
        $target  = isset($spec['target'])  && is_array($spec['target'])  ? $spec['target']  : array();
        $locator = isset($spec['locator']) && is_array($spec['locator']) ? $spec['locator'] : array();
        $element = isset($spec['element']) && is_array($spec['element']) ? $spec['element'] : array();
        $mutation = isset($spec['mutation']) && is_array($spec['mutation']) ? $spec['mutation'] : array();

        // Normalise kind/tag from either shape.
        $target_kind = isset($target['kind']) && $target['kind'] ? $target['kind'] : (isset($locator['kind']) ? $locator['kind'] : '');
        $target_tag  = null;
        if (isset($target['tag']) && $target['tag']) {
            $target_tag = strtolower($target['tag']);
        } elseif (isset($locator['tag']) && $locator['tag']) {
            $target_tag = strtolower($locator['tag']);
        }

        // For value: the plugin packs everything into a single "value" field.
        // tag_text callers may send locator.text; selector callers may send locator.selector.
        $target_value = '';
        if (isset($target['value']) && $target['value'] !== '') {
            $target_value = (string) $target['value'];
        } elseif (isset($locator['value']) && $locator['value'] !== '') {
            $target_value = (string) $locator['value'];
        } elseif ($target_kind === 'tag_text' && isset($locator['text'])) {
            $target_value = (string) $locator['text'];
        } elseif ($target_kind === 'selector' && isset($locator['selector'])) {
            $target_value = (string) $locator['selector'];
        }

        // Position can live under target.position OR flat at spec.position.
        $target_position = 'replace';
        if (isset($target['position']) && $target['position']) {
            $target_position = $target['position'];
        } elseif (isset($spec['position']) && $spec['position']) {
            $target_position = $spec['position'];
        }

        // Update operations: the engine only reads $element. If the caller used
        // the platform's $mutation shape, merge it so the update still lands.
        if ($operation === 'update' && empty($element) && !empty($mutation)) {
            $element = $mutation;
        }

        if ($operation === 'insert' && !in_array($target_position, array('before','after','inside_start','inside_end'), true)) {
            return new WP_Error('bad_position', 'insert requires position before|after|inside_start|inside_end', array('status' => 400));
        }

        // Pick builder. Priority: Elementor -> Beaver Builder -> raw HTML.
        $elementor_raw = get_post_meta($post_id, '_elementor_data', true);
        if (!empty($elementor_raw)) {
            return self::handle_elementor($post_id, $operation, $target_kind, $target_value, $target_tag, $target_position, $element, $elementor_raw);
        }

        // Elementor Pro Theme Builder: the page itself has no _elementor_data,
        // but it's rendered by a template (Single Page / Header / Footer /
        // Archive / etc.). Find the template that actually renders this URL and
        // route the mutation there. We still verify against the page's
        // permalink so the "did the user see it?" check stays honest.
        if ($target_kind === 'widget_id' && $target_value) {
            $template_hit = self::find_widget_in_templates($target_value);
            if ($template_hit) {
                return self::handle_elementor(
                    $template_hit['template_id'],
                    $operation,
                    $target_kind,
                    $target_value,
                    $target_tag,
                    $target_position,
                    $element,
                    $template_hit['raw'],
                    array('verify_post_id' => $post_id, 'rendered_via_template' => true)
                );
            }
        }

        $bb_raw = get_post_meta($post_id, '_fl_builder_data', true);
        if (!empty($bb_raw)) {
            return self::handle_beaver_builder($post_id, $operation, $target_kind, $target_value, $target_tag, $target_position, $element, $bb_raw);
        }

        return self::handle_raw_html($post_id, $operation, $target_kind, $target_value, $target_tag, $target_position, $element, $post->post_content);
    }

    // ─────────────────────── Elementor ───────────────────────

    private static function handle_elementor($post_id, $op, $kind, $value, $tag, $position, $element, $raw, $ctx = array()) {
        $is_json  = is_string($raw);
        $elements = $is_json ? json_decode($raw, true) : $raw;
        if (!is_array($elements)) {
            return new WP_Error('bad_elementor', 'Elementor data is corrupt', array('status' => 500));
        }

        $snapshot = $is_json ? $raw : wp_json_encode($raw);

        // The post whose URL we'll verify against. Usually == $post_id, but for
        // Theme Builder the edit lands on a template post and we must still
        // verify the change is visible on the user-facing page.
        $verify_post_id = isset($ctx['verify_post_id']) && $ctx['verify_post_id'] ? (int) $ctx['verify_post_id'] : (int) $post_id;
        $rendered_via_template = !empty($ctx['rendered_via_template']);

        // Resolve target path (array of indices) in the element tree
        $path = self::elementor_find($elements, $kind, $value, $tag);

        // Theme Builder fallback: widget isn't in THIS post, but may live in a
        // template that renders it. If the caller passed a widget_id and we
        // miss, check elementor_library for the widget before failing. (This
        // path is only reachable when handle_elementor was invoked against a
        // post that DOES have _elementor_data of its own — the top-level
        // dispatcher already handled the "no data at all" case.)
        if (!$path && !$rendered_via_template && $kind === 'widget_id' && $value) {
            $hit = self::find_widget_in_templates($value);
            if ($hit && (int) $hit['template_id'] !== (int) $post_id) {
                return self::handle_elementor(
                    $hit['template_id'],
                    $op, $kind, $value, $tag, $position, $element,
                    $hit['raw'],
                    array('verify_post_id' => $post_id, 'rendered_via_template' => true)
                );
            }
        }

        if ($op !== 'insert' && !$path) {
            return array(
                'applied'        => false,
                'builder'        => 'elementor',
                'reason'         => 'no_target_matched',
                'hint'           => 'Widget not found in this post or any Elementor template. Call get_element_structure for fresh candidates — the page may be rendered by a Theme Builder template with different widget IDs than the visual editor showed.',
                'candidates'     => self::elementor_candidates($elements, $tag),
            );
        }

        // Build the new widget for insert/update. For inserts we look for a
        // nearby widget of the same intended type and clone its design tokens
        // (typography / colors / alignment / advanced styling) so the new
        // element visually matches the surrounding page instead of landing as
        // a bare default-styled widget. The search prefers siblings of the
        // anchor, then walks the ancestor chain, then falls back to scanning
        // the whole tree.
        $new_widget = null;
        if ($op === 'insert' || $op === 'update') {
            $design_source = null;
            if ($op === 'insert') {
                $intended_widget_type = self::widget_type_for_element($element);
                $design_source = self::find_design_source($elements, $path, $intended_widget_type);
            }
            $new_widget = self::build_elementor_widget($element, $design_source);
        }

        // Capture text needles for render verification — MUST happen before the
        // mutation runs so the delete case can read the widget it's about to
        // remove. needle_positive = text that must appear after an insert/update;
        // needle_negative = text that must be gone after a delete.
        $needle_positive = '';
        $needle_negative = '';
        if (($op === 'insert' || $op === 'update') && isset($element['text'])) {
            $needle_positive = wp_strip_all_tags((string) $element['text']);
        }
        if ($op === 'delete' && $path) {
            $delete_node = self::elementor_ref($elements, $path);
            if (is_array($delete_node) && isset($delete_node['settings']) && is_array($delete_node['settings'])) {
                foreach (array('title','text','editor','heading','description') as $k) {
                    if (isset($delete_node['settings'][$k]) && is_string($delete_node['settings'][$k]) && trim((string) $delete_node['settings'][$k]) !== '') {
                        $needle_negative = wp_strip_all_tags((string) $delete_node['settings'][$k]);
                        break;
                    }
                }
            }
        }

        $matched = 0;
        if ($op === 'delete') {
            $matched = self::elementor_delete($elements, $path) ? 1 : 0;
        } elseif ($op === 'update') {
            $matched = self::elementor_update_widget($elements, $path, $element) ? 1 : 0;
        } elseif ($op === 'insert') {
            // For insert, target path may be empty — we prepend in that case
            if (!$path) {
                $container = array(
                    'id' => self::elementor_id(),
                    'elType' => 'container',
                    'settings' => array(),
                    'elements' => array($new_widget),
                );
                array_unshift($elements, $container);
                $matched = 1;
            } else {
                $matched = self::elementor_insert($elements, $path, $new_widget, $position) ? 1 : 0;
            }
        }

        if ($matched === 0) {
            return array(
                'applied' => false,
                'builder' => 'elementor',
                'reason'  => 'mutation_failed',
            );
        }

        $new_json = wp_json_encode($elements, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        // Write strategy: do the raw meta update ourselves, then fire Elementor's
        // post-save lifecycle hooks so Pro regenerates Theme Builder caches and
        // the files manager clears CSS/JS for every page using this document.
        //
        // We deliberately do NOT call $document->save() — it short-circuits
        // (silently, no exception) when current_user_can('edit_post', $id) is
        // false, which it always is for a signed REST request with no logged-in
        // user. That used to set $saved_via_elementor=true while writing
        // nothing, and then we'd skip the meta fallback and the page would
        // never change. Direct meta + hooks gives us deterministic writes plus
        // every after_save side-effect Pro hooks into.
        update_post_meta($post_id, '_elementor_data', wp_slash($new_json));

        $saved_via_elementor = false;
        if (class_exists('\\Elementor\\Plugin') && \\Elementor\\Plugin::$instance) {
            try {
                $documents = \\Elementor\\Plugin::$instance->documents;
                if ($documents) {
                    $document = $documents->get($post_id);
                    if ($document) {
                        // After-save: regenerates Theme Builder template
                        // caches, fires Pro's listeners that invalidate the
                        // rendered HTML cache for every page using this
                        // template, bumps revision metadata.
                        do_action('elementor/document/after_save', $document, array('elements' => $elements));
                        $saved_via_elementor = true;
                    }
                }
            } catch (Exception $e) { /* hooks are best-effort */ }
        }

        // Companion metas. Without _elementor_edit_mode=builder the frontend
        // the_content filter skips _elementor_data entirely and WP serves the
        // stale post_content — our write lands in the DB but the page doesn't
        // change. This is the single biggest cause of "AI said it did it but
        // nothing changed" reports on pages that were never opened in the
        // Elementor editor (theme demos, imports, CPTs, etc.). Guards prevent
        // clobbering existing values for edited pages.
        if (!get_post_meta($post_id, '_elementor_edit_mode', true)) {
            update_post_meta($post_id, '_elementor_edit_mode', 'builder');
        }
        if (!get_post_meta($post_id, '_elementor_template_type', true)) {
            $ptype = get_post_type($post_id);
            update_post_meta($post_id, '_elementor_template_type', $ptype === 'post' ? 'wp-post' : 'wp-page');
        }
        if (defined('ELEMENTOR_VERSION') && !get_post_meta($post_id, '_elementor_version', true)) {
            update_post_meta($post_id, '_elementor_version', ELEMENTOR_VERSION);
        }

        delete_post_meta($post_id, '_elementor_css');
        clean_post_cache($post_id);
        if (class_exists('\\Elementor\\Plugin')) {
            try {
                $elementor = \\Elementor\\Plugin::$instance;
                if ($elementor && isset($elementor->files_manager)) {
                    $elementor->files_manager->clear_cache();
                }
            } catch (Exception $e) { /* best effort */ }
        }

        // Resolve the inserted widget's actual id by re-reading the meta. When
        // Elementor's document API is the writer it normalises every element
        // (default settings, ID re-generation for unrecognised formats, schema
        // migration), so the id we passed in is not necessarily the id stored
        // on disk. We can't keep using the original id for "did it persist?"
        // checks — instead, locate the inserted widget by its unique text
        // content. If we can't match anything we DON'T fail here: the render
        // verify below is the authoritative "did the user see it?" gate; a
        // text mismatch in meta usually means Elementor reshuffled the tree,
        // not that the write was lost.
        $inserted_widget_id = ($op === 'insert' && $new_widget && isset($new_widget['id'])) ? $new_widget['id'] : null;
        if ($op === 'insert' && $needle_positive !== '') {
            $verify_raw = get_post_meta($post_id, '_elementor_data', true);
            $verify_elements = is_string($verify_raw) ? json_decode($verify_raw, true) : $verify_raw;
            if (is_array($verify_elements)) {
                $found_path = self::elementor_find($verify_elements, 'text_match', $needle_positive, null);
                if ($found_path !== null) {
                    $found_node = self::elementor_ref($verify_elements, $found_path);
                    if (is_array($found_node) && isset($found_node['id'])) {
                        $inserted_widget_id = (string) $found_node['id'];
                    }
                }
            }
        }

        // Render verify: fetch the live permalink with a cache-bust and confirm
        // the expected text actually appears (or, for delete, is gone). This is
        // the only real proof the change is visible to visitors — the meta may
        // be correct while the page still renders the stale content.
        // Under Theme Builder routing, verify against the original page URL,
        // not the template post (which often 404s as a standalone URL).
        $render = self::verify_rendered($verify_post_id, $op, $needle_positive, $needle_negative, $inserted_widget_id);
        if (!$render['ok']) {
            return array(
                'applied'              => false,
                'builder'              => 'elementor',
                'reason'               => 'render_mismatch',
                'hint'                 => $render['hint'],
                'url'                  => $render['url'],
                'saved_via_elementor'  => $saved_via_elementor,
                'written_to_post_id'   => (int) $post_id,
                'rendered_via_template'=> $rendered_via_template,
                'rollback'             => array(
                    'post_id'        => (int) $post_id,
                    'meta_key'       => '_elementor_data',
                    'previous_value' => $snapshot,
                ),
            );
        }

        return array(
            'applied'              => true,
            'builder'              => 'elementor',
            'matched_count'        => $matched,
            'inserted_widget_id'   => $inserted_widget_id,
            'saved_via_elementor'  => $saved_via_elementor,
            'written_to_post_id'   => (int) $post_id,
            'rendered_via_template'=> $rendered_via_template,
            'verified'             => true,
            'render_verified'      => true,
            'url'                  => $render['url'],
            'rollback'             => array(
                'post_id'        => (int) $post_id,
                'meta_key'       => '_elementor_data',
                'previous_value' => $snapshot,
            ),
        );
    }

    /**
     * Elementor Pro Theme Builder support: scan the elementor_library post type
     * for a widget whose id matches $widget_id. Returns template_id + decoded
     * elements + raw JSON on hit, or null. Capped at the first hit — if the
     * same id appears in multiple templates (shouldn't happen with UUIDs, but
     * custom IDs exist), we take the first.
     */
    private static function find_widget_in_templates($widget_id) {
        if (!$widget_id) return null;
        $library_ids = get_posts(array(
            'post_type'        => 'elementor_library',
            'post_status'      => array('publish', 'draft', 'private', 'inherit', 'future'),
            'numberposts'      => 500,
            'fields'           => 'ids',
            'suppress_filters' => true,
        ));
        if (!is_array($library_ids)) return null;
        foreach ($library_ids as $tid) {
            $raw = get_post_meta($tid, '_elementor_data', true);
            if (empty($raw)) continue;
            $els = is_string($raw) ? json_decode($raw, true) : $raw;
            if (!is_array($els)) continue;
            $path = self::elementor_find($els, 'widget_id', $widget_id, null);
            if ($path !== null) {
                return array(
                    'template_id' => (int) $tid,
                    'elements'    => $els,
                    'raw'         => is_string($raw) ? $raw : wp_json_encode($raw),
                );
            }
        }
        return null;
    }

    /** Return the path (array of integer indices) of the first matching widget, or null. */
    private static function elementor_find(&$elements, $kind, $value, $tag) {
        $found = null;
        self::elementor_walk($elements, array(), function($el, $path) use (&$found, $kind, $value, $tag) {
            if ($found !== null) return;
            if (!self::elementor_element_matches($el, $kind, $value, $tag)) return;
            $found = $path;
        });
        return $found;
    }

    private static function elementor_element_matches($el, $kind, $value, $tag) {
        if (!is_array($el)) return false;

        // widget_id
        if ($kind === 'widget_id') {
            return isset($el['id']) && (string)$el['id'] === (string)$value;
        }

        // tag-gated checks only consider heading widgets when $tag is a heading
        $el_is_heading = (
            isset($el['widgetType']) && $el['widgetType'] === 'heading'
        );

        // tag_text — tag + text must both match
        if ($kind === 'tag_text') {
            if (!$el_is_heading) return false;
            $h_size = isset($el['settings']['header_size']) ? strtolower($el['settings']['header_size']) : 'h2';
            if ($tag && $h_size !== $tag) return false;
            $text = isset($el['settings']['title']) ? $el['settings']['title'] : '';
            return self::text_contains($text, $value);
        }

        // all_of_tag — any heading matching the tag (first wins)
        if ($kind === 'all_of_tag') {
            if (!$el_is_heading) return false;
            $h_size = isset($el['settings']['header_size']) ? strtolower($el['settings']['header_size']) : 'h2';
            return $tag ? ($h_size === $tag) : true;
        }

        // text_match — scan common text-bearing fields on any widget
        if ($kind === 'text_match') {
            if (!isset($el['settings']) || !is_array($el['settings'])) return false;
            foreach (array('title','text','editor','heading','description') as $k) {
                if (isset($el['settings'][$k]) && is_string($el['settings'][$k])) {
                    if (self::text_contains($el['settings'][$k], $value)) return true;
                }
            }
            return false;
        }

        // selector — not directly meaningful in Elementor tree; caller should resolve
        // to widget_id via the AI fallback, but we do a best-effort id match (#xxx).
        if ($kind === 'selector') {
            if (isset($el['id']) && $value && $value[0] === '#' && substr($value, 1) === $el['id']) return true;
            return false;
        }

        return false;
    }

    /** Traverse tree calling $cb(element, path) for every element. */
    private static function elementor_walk(&$elements, $path, $cb) {
        if (!is_array($elements)) return;
        foreach ($elements as $i => &$el) {
            $cur = array_merge($path, array($i));
            $cb($el, $cur);
            if (!empty($el['elements']) && is_array($el['elements'])) {
                self::elementor_walk($el['elements'], $cur, $cb);
            }
        }
        unset($el);
    }

    /** Return a list of candidate widget ids + text for diagnostic responses. */
    private static function elementor_candidates(&$elements, $tag) {
        $out = array();
        self::elementor_walk($elements, array(), function($el) use (&$out, $tag) {
            if (count($out) >= 20) return;
            if (!isset($el['widgetType']) || $el['widgetType'] !== 'heading') return;
            $h_size = isset($el['settings']['header_size']) ? strtolower($el['settings']['header_size']) : 'h2';
            if ($tag && $h_size !== $tag) return;
            $out[] = array(
                'id'   => isset($el['id']) ? $el['id'] : null,
                'tag'  => $h_size,
                'text' => isset($el['settings']['title']) ? mb_substr($el['settings']['title'], 0, 120) : '',
            );
        });
        return $out;
    }

    /** Insert $new_widget at position relative to the element at $path. */
    private static function elementor_insert(&$elements, $path, $new_widget, $position) {
        if (!$path) return false;
        $parent = &self::elementor_parent_ref($elements, $path);
        $index  = end($path);
        if ($position === 'before') {
            array_splice($parent, $index, 0, array($new_widget));
            return true;
        }
        if ($position === 'after') {
            array_splice($parent, $index + 1, 0, array($new_widget));
            return true;
        }
        // inside_start / inside_end — treat the located element as the container
        $node = &self::elementor_ref($elements, $path);
        if (!is_array($node)) return false;
        if (!isset($node['elements']) || !is_array($node['elements'])) $node['elements'] = array();
        if ($position === 'inside_start') array_unshift($node['elements'], $new_widget);
        else array_push($node['elements'], $new_widget);
        return true;
    }

    private static function elementor_update_widget(&$elements, $path, $element) {
        $node = &self::elementor_ref($elements, $path);
        if (!is_array($node)) return false;
        $new_text = isset($element['text']) ? sanitize_text_field($element['text']) : null;
        $new_tag  = isset($element['tag'])  ? strtolower($element['tag']) : null;
        if (!isset($node['settings']) || !is_array($node['settings'])) $node['settings'] = array();

        // If it's a heading widget, update title + header_size; otherwise update the first text field we find.
        $is_heading = isset($node['widgetType']) && $node['widgetType'] === 'heading';
        if ($is_heading) {
            if ($new_text !== null) $node['settings']['title'] = $new_text;
            if ($new_tag && in_array($new_tag, self::HEADING_TAGS, true)) $node['settings']['header_size'] = $new_tag;
            return true;
        }
        foreach (array('title','text','editor','heading','description') as $k) {
            if (isset($node['settings'][$k]) && is_string($node['settings'][$k]) && $new_text !== null) {
                $node['settings'][$k] = $new_text;
                return true;
            }
        }
        // Fallback: set 'title' anyway
        if ($new_text !== null) $node['settings']['title'] = $new_text;
        return true;
    }

    private static function elementor_delete(&$elements, $path) {
        if (!$path) return false;
        $parent = &self::elementor_parent_ref($elements, $path);
        $index  = end($path);
        if (!isset($parent[$index])) return false;
        array_splice($parent, $index, 1);
        return true;
    }

    private static function &elementor_ref(&$elements, $path) {
        $ref = &$elements;
        $last = count($path) - 1;
        for ($i = 0; $i < $last; $i++) {
            $ref = &$ref[$path[$i]]['elements'];
        }
        $ref = &$ref[$path[$last]];
        return $ref;
    }

    private static function &elementor_parent_ref(&$elements, $path) {
        $ref = &$elements;
        $last = count($path) - 1;
        for ($i = 0; $i < $last; $i++) {
            $ref = &$ref[$path[$i]]['elements'];
        }
        return $ref;
    }

    private static function build_elementor_widget($element, $design_source = null) {
        $tag  = isset($element['tag']) ? strtolower($element['tag']) : 'h2';
        $text = isset($element['text']) ? sanitize_text_field($element['text']) : '';

        // Start from the design source's settings (deep-cloned), then strip
        // identity / content fields that must be unique per widget, then layer
        // the new content on top. This preserves typography, colors, alignment,
        // text shadow, animation, advanced style/CSS — the "look and feel" of
        // the existing page — while letting the caller override what's specific
        // to the new element.
        $base_settings = array();
        if (is_array($design_source) && isset($design_source['settings']) && is_array($design_source['settings'])) {
            $base_settings = self::clone_design_settings($design_source['settings']);
        }

        if (in_array($tag, self::HEADING_TAGS, true)) {
            $settings = array_merge($base_settings, array(
                'title'       => $text,
                'header_size' => $tag,
            ));
            // Caller-provided element.settings overrides everything.
            if (isset($element['settings']) && is_array($element['settings'])) {
                $settings = array_merge($settings, $element['settings']);
            }
            return array(
                'id'         => self::elementor_id(),
                'elType'     => 'widget',
                'widgetType' => 'heading',
                'settings'   => $settings,
                'elements'   => array(),
            );
        }
        // Default to text-editor widget
        $settings = array_merge($base_settings, array(
            'editor' => '<' . $tag . '>' . esc_html($text) . '</' . $tag . '>',
        ));
        if (isset($element['settings']) && is_array($element['settings'])) {
            $settings = array_merge($settings, $element['settings']);
        }
        return array(
            'id'         => self::elementor_id(),
            'elType'     => 'widget',
            'widgetType' => 'text-editor',
            'settings'   => $settings,
            'elements'   => array(),
        );
    }

    /**
     * Map the platform's element spec ({tag, widget_type?}) to the Elementor
     * widgetType we'll create. Used to find a same-type design source.
     */
    private static function widget_type_for_element($element) {
        if (isset($element['widget_type']) && is_string($element['widget_type']) && $element['widget_type'] !== '') {
            return strtolower($element['widget_type']);
        }
        $tag = isset($element['tag']) ? strtolower($element['tag']) : 'h2';
        if (in_array($tag, self::HEADING_TAGS, true)) return 'heading';
        return 'text-editor';
    }

    /**
     * Find a widget to clone design settings from. Search order, first hit wins:
     *   1. The anchor element itself (when it's already the right widgetType).
     *   2. Siblings of the anchor in its parent container.
     *   3. Walk up the ancestors and scan each subtree.
     *   4. Whole-tree fallback.
     * Returns the matched widget array (with 'settings'), or null if nothing
     * suitable exists. The caller treats null as "use defaults" — Elementor
     * globals will then apply, which is decent fallback styling.
     */
    private static function find_design_source(&$elements, $anchor_path, $widget_type) {
        if (!$widget_type) return null;
        // 1. Anchor itself
        if ($anchor_path) {
            $anchor = self::elementor_ref($elements, $anchor_path);
            if (self::is_widget_of_type($anchor, $widget_type)) return $anchor;
        }
        // 2 & 3. Walk up ancestors, scanning each level's subtree.
        if ($anchor_path) {
            $cur_path = $anchor_path;
            while (!empty($cur_path)) {
                array_pop($cur_path);
                $scope = empty($cur_path) ? $elements : self::elementor_ref($elements, $cur_path);
                if (is_array($scope)) {
                    $candidates = empty($cur_path) ? $scope : (isset($scope['elements']) ? $scope['elements'] : array());
                    $hit = self::scan_for_widget_type($candidates, $widget_type);
                    if ($hit) return $hit;
                }
            }
        }
        // 4. Whole-tree fallback.
        return self::scan_for_widget_type($elements, $widget_type);
    }

    private static function is_widget_of_type($el, $widget_type) {
        if (!is_array($el)) return false;
        if (!isset($el['elType']) || $el['elType'] !== 'widget') return false;
        if (!isset($el['widgetType']) || $el['widgetType'] !== $widget_type) return false;
        return true;
    }

    private static function scan_for_widget_type(&$elements, $widget_type) {
        $found = null;
        self::elementor_walk($elements, array(), function($el) use (&$found, $widget_type) {
            if ($found !== null) return;
            if (self::is_widget_of_type($el, $widget_type)) $found = $el;
        });
        return $found;
    }

    /**
     * Deep-clone a settings array, dropping keys that must NOT be inherited:
     *  - title / text / editor / heading / description: content, replaced anyway
     *  - header_size: replaced anyway
     *  - _element_id / _css_id / link / link_to: identity, IDs and link targets
     *    must be unique per widget
     *  - __globals__ entries we keep (they reference theme typography/colors
     *    by global ID, which is exactly the design pattern we want to inherit)
     */
    private static function clone_design_settings($settings) {
        $exclude = array(
            'title', 'text', 'editor', 'heading', 'description',
            'header_size',
            '_element_id', '_css_id',
            'link', 'link_to', 'url',
        );
        $out = array();
        foreach ($settings as $k => $v) {
            if (in_array($k, $exclude, true)) continue;
            $out[$k] = is_array($v) ? json_decode(wp_json_encode($v), true) : $v;
        }
        return $out;
    }

    /**
     * Elementor expects 7-character lowercase hex IDs (e.g. "1a513f0"). Full
     * 36-char UUIDs aren't recognised — Elementor's normalizer rewrites them
     * during $document->save(), which broke our post-write meta verify because
     * we couldn't find the widget by the id we passed in. Match the editor's
     * format so our id sticks and the platform can highlight the widget.
     */
    private static function elementor_id() {
        return substr(bin2hex(random_bytes(4)), 0, 7);
    }

    // ─────────────────────── Beaver Builder ───────────────────────

    private static function handle_beaver_builder($post_id, $op, $kind, $value, $tag, $position, $element, $raw) {
        if (!is_array($raw)) {
            return new WP_Error('bad_bb', 'Beaver Builder data is not an array', array('status' => 500));
        }
        $snapshot = maybe_serialize($raw);

        $match_id = null;
        foreach ($raw as $node_id => $node) {
            $is_obj = is_object($node);
            $type   = $is_obj ? ($node->type ?? null) : ($node['type'] ?? null);
            if ($type !== 'module') continue;
            $slug   = $is_obj ? ($node->slug ?? '') : ($node['slug'] ?? '');
            $settings = $is_obj ? ($node->settings ?? null) : ($node['settings'] ?? null);
            $heading = $settings ? (is_object($settings) ? ($settings->heading ?? '') : ($settings['heading'] ?? '')) : '';
            $node_tag = $settings ? (is_object($settings) ? ($settings->tag ?? '') : ($settings['tag'] ?? '')) : '';

            if ($kind === 'widget_id' && (string)$node_id === (string)$value) { $match_id = $node_id; break; }
            if ($kind === 'tag_text' && $slug === 'heading') {
                if ($tag && strtolower($node_tag) !== $tag) continue;
                if (self::text_contains($heading, $value)) { $match_id = $node_id; break; }
            }
            if ($kind === 'all_of_tag' && $slug === 'heading') {
                if (!$tag || strtolower($node_tag) === $tag) { $match_id = $node_id; break; }
            }
            if ($kind === 'text_match' && self::text_contains((string)$heading, $value)) { $match_id = $node_id; break; }
        }

        if ($op !== 'insert' && !$match_id) {
            return array('applied' => false, 'builder' => 'beaver_builder', 'reason' => 'no_target_matched');
        }

        // Capture needles before mutating the tree.
        $needle_positive = '';
        $needle_negative = '';
        if (($op === 'insert' || $op === 'update') && isset($element['text'])) {
            $needle_positive = wp_strip_all_tags((string) $element['text']);
        }
        if ($op === 'delete' && $match_id) {
            $dn = $raw[$match_id];
            $ds = is_object($dn) ? ($dn->settings ?? null) : ($dn['settings'] ?? null);
            $dh = $ds ? (is_object($ds) ? ($ds->heading ?? '') : ($ds['heading'] ?? '')) : '';
            if (is_string($dh) && trim($dh) !== '') $needle_negative = wp_strip_all_tags($dh);
        }

        $mutated = false;

        if ($op === 'delete' && $match_id) {
            unset($raw[$match_id]);
            $mutated = true;
        }

        if ($op === 'update' && $match_id) {
            $node = $raw[$match_id];
            $new_text = isset($element['text']) ? sanitize_text_field($element['text']) : '';
            $new_tag  = isset($element['tag'])  ? strtolower($element['tag']) : null;
            if (is_object($node)) {
                if (!isset($node->settings) || !is_object($node->settings)) $node->settings = (object) array();
                $node->settings->heading = $new_text;
                if ($new_tag) $node->settings->tag = $new_tag;
            } else {
                if (!isset($node['settings']) || !is_array($node['settings'])) $node['settings'] = array();
                $node['settings']['heading'] = $new_text;
                if ($new_tag) $node['settings']['tag'] = $new_tag;
            }
            $raw[$match_id] = $node;
            $mutated = true;
        }

        if ($op === 'insert') {
            // Find a column to attach to (first column encountered)
            $parent_id = null;
            foreach ($raw as $node_id => $node) {
                $is_obj = is_object($node);
                $type = $is_obj ? ($node->type ?? '') : ($node['type'] ?? '');
                if ($type === 'column') { $parent_id = $node_id; break; }
            }
            if (!$parent_id) {
                return array('applied' => false, 'builder' => 'beaver_builder', 'reason' => 'no_parent_column');
            }
            $new_id = wp_generate_uuid4();
            $tag_for_module = isset($element['tag']) ? strtolower($element['tag']) : 'h2';
            $raw[$new_id] = (object) array(
                'node'     => $new_id,
                'type'     => 'module',
                'parent'   => $parent_id,
                'position' => ($position === 'after' && $match_id) ? 999 : 0,
                'slug'     => 'heading',
                'settings' => (object) array(
                    'heading' => isset($element['text']) ? sanitize_text_field($element['text']) : '',
                    'tag'     => in_array($tag_for_module, self::HEADING_TAGS, true) ? $tag_for_module : 'h2',
                ),
            );
            $mutated = true;
        }

        if (!$mutated) {
            return array('applied' => false, 'builder' => 'beaver_builder', 'reason' => 'unhandled');
        }

        update_post_meta($post_id, '_fl_builder_data', $raw);
        clean_post_cache($post_id);

        $render = self::verify_rendered($post_id, $op, $needle_positive, $needle_negative);
        if (!$render['ok']) {
            return array(
                'applied'  => false,
                'builder'  => 'beaver_builder',
                'reason'   => 'render_mismatch',
                'hint'     => $render['hint'],
                'url'      => $render['url'],
                'rollback' => array('meta_key' => '_fl_builder_data', 'previous_value' => $snapshot),
            );
        }

        return array(
            'applied'         => true,
            'builder'         => 'beaver_builder',
            'matched_count'   => 1,
            'verified'        => true,
            'render_verified' => true,
            'url'             => $render['url'],
            'rollback'        => array('meta_key' => '_fl_builder_data', 'previous_value' => $snapshot),
        );
    }

    // ─────────────────────── Raw HTML (post_content) ───────────────────────

    private static function handle_raw_html($post_id, $op, $kind, $value, $tag, $position, $element, $content) {
        $snapshot = $content;

        if (!class_exists('DOMDocument')) {
            return new WP_Error('no_dom', 'DOMDocument unavailable', array('status' => 500));
        }

        // Needle for render verification.
        $needle_positive = '';
        $needle_negative = '';
        if (($op === 'insert' || $op === 'update') && isset($element['text'])) {
            $needle_positive = wp_strip_all_tags((string) $element['text']);
        }

        if ($op === 'insert' && (!$content || trim($content) === '')) {
            $html = self::render_html_element($element);
            $new_content = $html . ($content ? "\\n" . $content : '');
            GP_Entity_Sync::mark_gp_origin();
            $upd = self::safe_update_post_content($post_id, $new_content);
            if (is_wp_error($upd)) {
                return array(
                    'applied'  => false,
                    'builder'  => 'html',
                    'reason'   => 'wp_update_post_failed',
                    'hint'     => $upd->get_error_message(),
                    'rollback' => array('post_content' => $snapshot),
                );
            }
            $render = self::verify_rendered($post_id, $op, $needle_positive, $needle_negative);
            if (!$render['ok']) {
                return array(
                    'applied'  => false,
                    'builder'  => 'html',
                    'reason'   => 'render_mismatch',
                    'hint'     => $render['hint'],
                    'url'      => $render['url'],
                    'rollback' => array('post_content' => $snapshot),
                );
            }
            return array(
                'applied'         => true,
                'builder'         => 'html',
                'matched_count'   => 1,
                'render_verified' => true,
                'url'             => $render['url'],
                'rollback'        => array('post_content' => $snapshot),
            );
        }

        $dom = new DOMDocument('1.0', 'UTF-8');
        libxml_use_internal_errors(true);
        // Wrap to preserve structure + handle fragments
        $wrapped = '<?xml encoding="UTF-8"?><div id="gp-root">' . $content . '</div>';
        $dom->loadHTML($wrapped, LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD);
        libxml_clear_errors();
        $root = $dom->getElementById('gp-root');
        if (!$root) {
            return array('applied' => false, 'builder' => 'html', 'reason' => 'parse_failed');
        }

        // Resolve target
        $target_node = self::html_find_node($dom, $root, $kind, $value, $tag);

        if ($op !== 'insert' && !$target_node) {
            return array('applied' => false, 'builder' => 'html', 'reason' => 'no_target_matched');
        }

        // Capture deletion needle before removing the node.
        if ($op === 'delete' && $target_node) {
            $del_text = trim((string) $target_node->textContent);
            if ($del_text !== '') $needle_negative = $del_text;
        }

        $matched = 0;
        if ($op === 'delete' && $target_node) {
            $target_node->parentNode->removeChild($target_node);
            $matched = 1;
        } elseif ($op === 'update' && $target_node) {
            $new_tag  = isset($element['tag']) ? strtolower($element['tag']) : $target_node->nodeName;
            $new_text = isset($element['text']) ? $element['text'] : '';
            if (strtolower($target_node->nodeName) === $new_tag) {
                // Replace text content only
                while ($target_node->firstChild) $target_node->removeChild($target_node->firstChild);
                $target_node->appendChild($dom->createTextNode($new_text));
            } else {
                // Replace whole tag
                $replacement = $dom->createElement($new_tag);
                $replacement->appendChild($dom->createTextNode($new_text));
                $target_node->parentNode->replaceChild($replacement, $target_node);
            }
            $matched = 1;
        } elseif ($op === 'insert') {
            $new_tag  = isset($element['tag']) ? strtolower($element['tag']) : 'p';
            $new_text = isset($element['text']) ? $element['text'] : '';
            $new_node = $dom->createElement($new_tag);
            $new_node->appendChild($dom->createTextNode($new_text));
            if (!$target_node) {
                // No anchor — prepend to root
                if ($root->firstChild) $root->insertBefore($new_node, $root->firstChild);
                else $root->appendChild($new_node);
                $matched = 1;
            } else {
                switch ($position) {
                    case 'before':
                        $target_node->parentNode->insertBefore($new_node, $target_node);
                        break;
                    case 'after':
                        if ($target_node->nextSibling) {
                            $target_node->parentNode->insertBefore($new_node, $target_node->nextSibling);
                        } else {
                            $target_node->parentNode->appendChild($new_node);
                        }
                        break;
                    case 'inside_start':
                        if ($target_node->firstChild) $target_node->insertBefore($new_node, $target_node->firstChild);
                        else $target_node->appendChild($new_node);
                        break;
                    case 'inside_end':
                    default:
                        $target_node->appendChild($new_node);
                }
                $matched = 1;
            }
        }

        if (!$matched) {
            return array('applied' => false, 'builder' => 'html', 'reason' => 'mutation_failed');
        }

        // Serialize inner of #gp-root back to post_content
        $new_content = '';
        foreach ($root->childNodes as $child) {
            $new_content .= $dom->saveHTML($child);
        }

        GP_Entity_Sync::mark_gp_origin();
        $upd = self::safe_update_post_content($post_id, $new_content);
        if (is_wp_error($upd)) {
            return array(
                'applied'  => false,
                'builder'  => 'html',
                'reason'   => 'wp_update_post_failed',
                'hint'     => $upd->get_error_message(),
                'rollback' => array('post_content' => $snapshot),
            );
        }

        $render = self::verify_rendered($post_id, $op, $needle_positive, $needle_negative);
        if (!$render['ok']) {
            return array(
                'applied'  => false,
                'builder'  => 'html',
                'reason'   => 'render_mismatch',
                'hint'     => $render['hint'],
                'url'      => $render['url'],
                'rollback' => array('post_content' => $snapshot),
            );
        }

        return array(
            'applied'         => true,
            'builder'         => 'html',
            'matched_count'   => $matched,
            'render_verified' => true,
            'url'             => $render['url'],
            'rollback'        => array('post_content' => $snapshot),
        );
    }

    private static function html_find_node($dom, $root, $kind, $value, $tag) {
        $xpath = new DOMXPath($dom);
        if ($kind === 'widget_id' || $kind === 'selector') {
            // Treat as CSS id selector "#id" or bare id
            $id = $value;
            if (strlen($id) && $id[0] === '#') $id = substr($id, 1);
            $nodes = $xpath->query('.//*[@id=' . self::xpath_literal($id) . ']', $root);
            return $nodes && $nodes->length ? $nodes->item(0) : null;
        }
        if ($kind === 'tag_text' || $kind === 'all_of_tag' || $kind === 'text_match') {
            $tag_q = $tag ? $tag : '*';
            $nodes = $xpath->query('.//' . $tag_q, $root);
            if ($nodes && $nodes->length) {
                if ($kind === 'all_of_tag') return $nodes->item(0);
                foreach ($nodes as $n) {
                    $t = trim((string) $n->textContent);
                    if (self::text_contains($t, $value)) return $n;
                }
            }
            // text_match with no tag filter: scan everything
            if ($kind === 'text_match' && !$tag) {
                $all = $xpath->query('.//*[text()]', $root);
                if ($all) foreach ($all as $n) {
                    if (self::text_contains((string) $n->textContent, $value)) return $n;
                }
            }
        }
        return null;
    }

    private static function render_html_element($element) {
        $tag  = isset($element['tag']) ? strtolower($element['tag']) : 'p';
        $text = isset($element['text']) ? esc_html($element['text']) : '';
        return '<' . $tag . '>' . $text . '</' . $tag . '>';
    }

    // ─────────────────────── Helpers ───────────────────────

    /**
     * Fetch the post's public permalink and prove the mutation is visible to
     * visitors. Returns ['ok' => bool, 'url' => string, 'hint' => string].
     *
     * $needle_positive — text that must APPEAR (for insert/update).
     * $needle_negative — text that must be GONE (for delete).
     *
     * Missing needles (e.g. inserts with empty text, deletes of untitled widgets)
     * downgrade to a 200-OK check so we never block on an unprovable claim.
     */
    private static function verify_rendered($post_id, $op, $needle_positive, $needle_negative, $widget_id = null) {
        $permalink = get_permalink($post_id);
        if (!$permalink) {
            return array('ok' => true, 'url' => '', 'hint' => 'permalink unavailable');
        }

        clean_post_cache($post_id);
        wp_cache_delete($post_id, 'posts');

        $url = add_query_arg(array('gp_cb' => time()), $permalink);
        $resp = wp_remote_get($url, array(
            'timeout'     => 15,
            'sslverify'   => false,
            'redirection' => 3,
            'headers'     => array(
                'Cache-Control' => 'no-cache',
                'Pragma'        => 'no-cache',
                'User-Agent'    => 'GhostPost-VerifyRender/1.0',
            ),
        ));
        if (is_wp_error($resp)) {
            return array('ok' => false, 'url' => $url, 'hint' => 'render fetch failed: ' . $resp->get_error_message());
        }
        $code = (int) wp_remote_retrieve_response_code($resp);
        if ($code >= 400) {
            return array('ok' => false, 'url' => $url, 'hint' => 'render fetch returned HTTP ' . $code);
        }
        $body = (string) wp_remote_retrieve_body($resp);
        if ($body === '') {
            return array('ok' => false, 'url' => $url, 'hint' => 'render fetch returned empty body');
        }

        if (($op === 'insert' || $op === 'update') && $needle_positive !== '') {
            $n = mb_strtolower(trim($needle_positive));
            $h = mb_strtolower($body);
            if (mb_strpos($h, $n) === false) {
                return array(
                    'ok'   => false,
                    'url'  => $url,
                    'hint' => 'expected text "' . mb_substr($needle_positive, 0, 80) . '" not found in rendered HTML — the save landed in the DB but the page does not render it. Check builder-mode metas, theme overrides, or a page cache the plugin cannot reach.',
                );
            }
            // Stronger proof: for Elementor inserts, the newly-created widget's
            // unique id must appear in the rendered HTML as data-id="XXXXXXX".
            // If only the text matches, we could be matching a pre-existing
            // duplicate element (e.g. several H1s on the page) and the user
            // would see no visible change. Requiring data-id eliminates that
            // false positive.
            if ($op === 'insert' && $widget_id && preg_match('/^[a-zA-Z0-9]{6,10}$/', $widget_id)) {
                if (stripos($body, 'data-id="' . $widget_id . '"') === false
                    && stripos($body, "data-id='" . $widget_id . "'") === false) {
                    return array(
                        'ok'   => false,
                        'url'  => $url,
                        'hint' => 'inserted widget id "' . $widget_id . '" not found in rendered HTML — the widget was saved to _elementor_data but Elementor is not rendering it on the frontend. Likely a conflicting template, a cached HTML layer (edge/CDN), or a missing companion meta. Rolling back so the site is not left in a half-applied state.',
                    );
                }
            }
        }
        if ($op === 'delete' && $needle_negative !== '') {
            $n = mb_strtolower(trim($needle_negative));
            $h = mb_strtolower($body);
            if (mb_strpos($h, $n) !== false) {
                return array(
                    'ok'   => false,
                    'url'  => $url,
                    'hint' => 'old text "' . mb_substr($needle_negative, 0, 80) . '" still present in rendered HTML — the delete did not propagate. Likely a page cache that GP_Cache_Manager::clear_all did not flush.',
                );
            }
        }
        return array('ok' => true, 'url' => $url, 'hint' => '');
    }

    /**
     * wp_update_post wrapper that:
     *  - lifts KSES filters while the write runs (admins can already insert
     *    arbitrary HTML; this just prevents a non-admin-scoped filter from
     *    silently stripping a valid tag the AI inserted), then re-adds them.
     *  - returns WP_Error on failure instead of the silent-0 behaviour of the
     *    native call, so the caller can surface a real diagnostic.
     */
    private static function safe_update_post_content($post_id, $new_content) {
        kses_remove_filters();
        $result = wp_update_post(array(
            'ID'           => (int) $post_id,
            'post_content' => $new_content,
        ), true);
        kses_init_filters();
        if (is_wp_error($result)) return $result;
        if ((int) $result !== (int) $post_id) {
            return new WP_Error('wp_update_post_returned_zero', 'wp_update_post returned ' . var_export($result, true));
        }
        return $result;
    }

    private static function text_contains($haystack, $needle) {
        if ($needle === '' || $needle === null) return false;
        $h = mb_strtolower(trim(wp_strip_all_tags((string) $haystack)));
        $n = mb_strtolower(trim((string) $needle));
        if ($n === '' ) return false;
        return strpos($h, $n) !== false;
    }

    /** Build an XPath string literal that can contain single + double quotes. */
    private static function xpath_literal($value) {
        if (strpos($value, "'") === false) return "'" . $value . "'";
        if (strpos($value, '"') === false) return '"' . $value . '"';
        $parts = explode("'", $value);
        return "concat('" . implode("', \\"'\\", '", $parts) . "')";
    }
}
`;
}
