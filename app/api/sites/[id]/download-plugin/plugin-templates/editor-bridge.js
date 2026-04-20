/**
 * Generate the editor-bridge.js asset served when gp_editor=true.
 * Enables the Ghost Post platform chat to inspect and mutate elements in the live site.
 */
export function getEditorBridgeJs() {
  return `/* Ghost Post Editor Bridge
 * Activates only when URL has ?gp_editor=true AND the page is iframed.
 * Communicates with the Ghost Post platform via window.postMessage.
 */
(function () {
  'use strict';

  var params = new URLSearchParams(window.location.search);
  var editorFlag = params.get('gp_editor');
  // Accept both signed mode (gp_editor=1 + HMAC params) and legacy (gp_editor=true).
  // The plugin PHP gates CSP + bridge-enqueue on validity; by the time this
  // script runs, the server has already verified the request.
  if (editorFlag !== 'true' && editorFlag !== '1') return;
  if (window.self === window.top) return; // only when iframed

  // parentOrigin must be the platform origin (the window hosting the iframe).
  // On the initial iframe load document.referrer points at the platform and
  // that's fine, but after a same-origin link navigation INSIDE the iframe,
  // document.referrer becomes the PREVIOUS site page — which would make
  // every postMessage target the site's own origin and the browser silently
  // drops the traffic in both directions (platform->bridge AND
  // bridge->platform). The signed preview URL carries gp_origin (the platform
  // origin) and we preserve it across link navigations, so prefer that.
  var parentOrigin;
  var signedOriginParam = params.get('gp_origin');
  if (signedOriginParam) {
    try { parentOrigin = new URL(signedOriginParam).origin; }
    catch (e) { parentOrigin = '*'; }
  } else {
    parentOrigin = document.referrer ? new URL(document.referrer).origin : '*';
  }
  var inspectorEnabled = true;
  var previewMutations = []; // [{ el, prop, prevValue }]
  var overlayEl = null;
  var hoverOutlineEl = null;
  var tooltipEl = null;
  var cursorStyleEl = null;

  // Force a crosshair cursor across the whole page (including over links and
  // other elements with their own cursor rule) while the inspector is on, so
  // the user gets a devtools-picker affordance signalling "click to select".
  function ensureCursorStyle() {
    if (cursorStyleEl) return;
    cursorStyleEl = document.createElement('style');
    cursorStyleEl.setAttribute('data-gp-bridge', '1');
    cursorStyleEl.textContent = 'html.gp-inspect-on, html.gp-inspect-on * { cursor: crosshair !important; }';
    (document.head || document.documentElement).appendChild(cursorStyleEl);
  }
  function applyCursor() {
    ensureCursorStyle();
    var cl = document.documentElement.classList;
    if (inspectorEnabled) cl.add('gp-inspect-on');
    else cl.remove('gp-inspect-on');
  }

  // Preview query params we must preserve on same-origin link navigation so
  // the next page re-embeds correctly in the platform iframe.
  var PRESERVE_PARAMS = ['gp_editor', 'gp_origin', 'gp_exp', 'gp_sig', 'token'];

  function post(type, payload) {
    var msg = Object.assign({ _gp: true, type: type }, payload || {});
    try { window.parent.postMessage(msg, parentOrigin); } catch (e) {}
  }

  function isBridgeNode(el) {
    return el === overlayEl || el === hoverOutlineEl || el === tooltipEl ||
      (el && el.closest && el.closest('[data-gp-bridge]'));
  }

  function describeElement(el) {
    if (!el || !el.tagName) return '';
    var tag = el.tagName.toLowerCase();
    var raw = el.className;
    // SVG className is an SVGAnimatedString, not a plain string.
    var classStr = (typeof raw === 'string') ? raw : (raw && raw.baseVal) || '';
    var classes = classStr.split(/\s+/).filter(Boolean).slice(0, 4);
    var suffix = classes.length ? '.' + classes.join('.') : '';
    return tag + suffix;
  }

  function navigateWithPreviewParams(href) {
    try {
      var destUrl = new URL(href, window.location.href);
      if (destUrl.origin !== window.location.origin) return false;
      var current = new URLSearchParams(window.location.search);
      PRESERVE_PARAMS.forEach(function (k) {
        if (current.has(k) && !destUrl.searchParams.has(k)) {
          destUrl.searchParams.set(k, current.get(k));
        }
      });
      window.location.href = destUrl.toString();
      return true;
    } catch (_) {
      return false;
    }
  }

  function cssPath(el) {
    if (!el || el.nodeType !== 1) return '';
    if (el.id) return '#' + CSS.escape(el.id);
    var parts = [];
    var node = el;
    while (node && node.nodeType === 1 && node !== document.body) {
      var part = node.tagName.toLowerCase();
      var parent = node.parentNode;
      if (parent) {
        var same = Array.prototype.filter.call(parent.children, function (c) {
          return c.tagName === node.tagName;
        });
        if (same.length > 1) {
          var idx = same.indexOf(node) + 1;
          part += ':nth-of-type(' + idx + ')';
        }
      }
      parts.unshift(part);
      node = node.parentNode;
      if (parts.length > 8) break;
    }
    return parts.join(' > ');
  }

  function getElementorWidget(el) {
    var w = el.closest && el.closest('[data-element_type]');
    return w ? (w.getAttribute('data-widget_type') || w.getAttribute('data-element_type')) : null;
  }

  function getElementorId(el) {
    if (!el || !el.closest) return null;
    var w = el.closest('[data-element_type="widget"][data-id]')
         || el.closest('[data-element_type][data-id]')
         || el.closest('[data-id]');
    return w ? w.getAttribute('data-id') : null;
  }

  function getElementorAncestors(el) {
    if (!el || !el.closest) return [];
    var chain = [];
    var node = el;
    var seen = {};
    while (node && node !== document.body) {
      if (node.getAttribute && node.getAttribute('data-id')) {
        var id = node.getAttribute('data-id');
        if (!seen[id]) {
          seen[id] = 1;
          chain.push({
            id: id,
            type: node.getAttribute('data-element_type') || null,
            widget: node.getAttribute('data-widget_type') || null
          });
          if (chain.length >= 6) break;
        }
      }
      node = node.parentNode;
    }
    return chain;
  }

  function elementInfo(el, opts) {
    opts = opts || {};
    var rect = el.getBoundingClientRect();
    var info = {
      tag: el.tagName.toLowerCase(),
      text: (el.innerText || el.textContent || '').trim().substring(0, 200),
      selector: cssPath(el),
      src: el.tagName === 'IMG' ? el.getAttribute('src') : undefined,
      alt: el.tagName === 'IMG' ? el.getAttribute('alt') : undefined,
      href: el.tagName === 'A' ? el.getAttribute('href') : undefined,
      elementorWidget: getElementorWidget(el),
      elementorId: getElementorId(el),
      elementorAncestors: getElementorAncestors(el),
      rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
    };
    if (opts.includeHtml) {
      var html = el.outerHTML || '';
      // Cap at ~8KB so we don't blow up the chat context with huge subtrees.
      info.outerHTML = html.length > 8000 ? html.substring(0, 8000) + '... [truncated]' : html;
    }
    return info;
  }

  /* -------- Screenshot capture (html2canvas, lazy-loaded from CDN) -------- */

  var html2canvasPromise = null;
  function loadHtml2Canvas() {
    if (window.html2canvas) return Promise.resolve(window.html2canvas);
    if (html2canvasPromise) return html2canvasPromise;
    html2canvasPromise = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = 'https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js';
      script.async = true;
      script.onload = function () {
        if (window.html2canvas) resolve(window.html2canvas);
        else reject(new Error('html2canvas not exposed after load'));
      };
      script.onerror = function () { reject(new Error('html2canvas load failed')); };
      document.head.appendChild(script);
    });
    return html2canvasPromise;
  }

  function captureElement(el) {
    return loadHtml2Canvas().then(function (h2c) {
      // Hide bridge overlays so they don't bleed into the screenshot.
      var prevOverlay = overlayEl && overlayEl.style.display;
      var prevHover = hoverOutlineEl && hoverOutlineEl.style.display;
      if (overlayEl) overlayEl.style.display = 'none';
      if (hoverOutlineEl) hoverOutlineEl.style.display = 'none';

      var restoreOverlays = function () {
        if (overlayEl && prevOverlay != null) overlayEl.style.display = prevOverlay;
        if (hoverOutlineEl && prevHover != null) hoverOutlineEl.style.display = prevHover;
      };

      return h2c(el, {
        backgroundColor: null,
        scale: 1,
        logging: false,
        useCORS: true,
        allowTaint: false,
      }).then(function (canvas) {
        restoreOverlays();
        // Cap the output size so the screenshot fits comfortably in the chat payload.
        var maxW = 900;
        if (canvas.width > maxW) {
          var scale = maxW / canvas.width;
          var out = document.createElement('canvas');
          out.width = Math.round(canvas.width * scale);
          out.height = Math.round(canvas.height * scale);
          var ctx = out.getContext('2d');
          ctx.drawImage(canvas, 0, 0, out.width, out.height);
          canvas = out;
        }
        return canvas.toDataURL('image/jpeg', 0.82);
      }, function (err) {
        restoreOverlays();
        throw err;
      });
    });
  }

  function ensureOverlay() {
    if (overlayEl) return;
    // Force direction:ltr + anchor to top/left = 0 and position via transform.
    // Some RTL themes put the scrollbar/containing-block origin on the right,
    // which makes left:Xpx on a position:fixed overlay drift. Transforms
    // are direction-agnostic, so the highlight lands on the same pixels in
    // both RTL and LTR layouts.
    var baseCss = 'position:fixed;pointer-events:none;display:none;border-radius:2px;top:0;left:0;right:auto;bottom:auto;direction:ltr;transform-origin:0 0;will-change:transform,width,height;';
    overlayEl = document.createElement('div');
    overlayEl.setAttribute('data-gp-bridge', '1');
    overlayEl.style.cssText = baseCss + 'z-index:2147483646;outline:2px solid #7B2CBF;background:rgba(123,44,191,0.08);transition:transform 80ms ease, width 80ms ease, height 80ms ease;';
    document.documentElement.appendChild(overlayEl);

    hoverOutlineEl = document.createElement('div');
    hoverOutlineEl.setAttribute('data-gp-bridge', '1');
    hoverOutlineEl.style.cssText = baseCss + 'z-index:2147483645;outline:1px dashed #9B4DE0;background:rgba(123,44,191,0.035);transition:transform 60ms ease, width 60ms ease, height 60ms ease;';
    document.documentElement.appendChild(hoverOutlineEl);

    tooltipEl = document.createElement('div');
    tooltipEl.setAttribute('data-gp-bridge', '1');
    tooltipEl.style.cssText = 'position:fixed;pointer-events:none;display:none;top:0;left:0;right:auto;bottom:auto;direction:ltr;transform-origin:0 0;will-change:transform;z-index:2147483647;font:600 11px/1.3 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#fff;background:#7B2CBF;padding:3px 7px;border-radius:3px;white-space:nowrap;letter-spacing:0.01em;box-shadow:0 1px 3px rgba(0,0,0,0.25);';
    document.documentElement.appendChild(tooltipEl);
  }

  function positionTooltip(el) {
    if (!tooltipEl || !el) { if (tooltipEl) tooltipEl.style.display = 'none'; return; }
    tooltipEl.textContent = describeElement(el);
    tooltipEl.style.display = 'block';
    var r = el.getBoundingClientRect();
    var o = fixedOrigin();
    var th = tooltipEl.offsetHeight || 20;
    var y = r.top - o.y - th - 4;
    if (y < 0) y = r.top - o.y + r.height + 4;
    var x = r.left - o.x;
    tooltipEl.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
  }

  // In RTL pages (Chrome/Firefox), the vertical scrollbar is drawn on the LEFT
  // of the viewport. A position:fixed element with left:0 starts AFTER the
  // scrollbar, but getBoundingClientRect() on a regular element reports
  // coordinates relative to the actual viewport left edge (including the
  // scrollbar column). Result: our overlay sits scrollbarWidth pixels to the
  // right/left of the target. We compensate by measuring the real origin of a
  // zero-positioned fixed probe against getBoundingClientRect() and
  // subtracting that delta every frame. Works for any browser/RTL edge case.
  var fixedOriginProbe = null;
  function fixedOrigin() {
    if (!fixedOriginProbe) {
      fixedOriginProbe = document.createElement('div');
      fixedOriginProbe.setAttribute('data-gp-bridge', '1');
      fixedOriginProbe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;visibility:hidden;direction:ltr;';
      document.documentElement.appendChild(fixedOriginProbe);
    }
    var pr = fixedOriginProbe.getBoundingClientRect();
    return { x: pr.left, y: pr.top };
  }

  function positionBox(box, el) {
    if (!el) { box.style.display = 'none'; return; }
    var r = el.getBoundingClientRect();
    var o = fixedOrigin();
    // translate3d is direction-agnostic — unlike left, which is re-interpreted
    // as start-side on some RTL layouts with horizontal overflow.
    box.style.transform = 'translate3d(' + (r.left - o.x) + 'px,' + (r.top - o.y) + 'px,0)';
    box.style.width = r.width + 'px';
    box.style.height = r.height + 'px';
    box.style.display = 'block';
  }

  var hoverTarget = null;
  var selectedTarget = null;

  function onMouseOver(e) {
    if (!inspectorEnabled) return;
    if (isBridgeNode(e.target)) return;
    hoverTarget = e.target;
    ensureOverlay();
    positionBox(hoverOutlineEl, hoverTarget);
    positionTooltip(hoverTarget);
    post('GP_ELEMENT_HOVER', elementInfo(hoverTarget));
  }

  function onMouseOut(e) {
    if (!inspectorEnabled) return;
    if (e.target === hoverTarget) {
      hoverTarget = null;
      if (hoverOutlineEl) hoverOutlineEl.style.display = 'none';
      if (tooltipEl) tooltipEl.style.display = 'none';
      post('GP_ELEMENT_HOVER_OUT', {});
    }
  }

  function onClick(e) {
    if (isBridgeNode(e.target)) return;

    // When the inspector is ON the page behaves like a devtools picker:
    // every click selects the element under the cursor and link navigation
    // is blocked entirely (including clicks directly on <a> and on any
    // nested anchor-wrapped content). Navigation only happens when the
    // inspector is OFF, mirroring normal browsing.
    if (inspectorEnabled) {
      e.preventDefault();
      e.stopPropagation();
      selectedTarget = e.target;
      ensureOverlay();
      positionBox(overlayEl, selectedTarget);
      if (tooltipEl) tooltipEl.style.display = 'none';
      var info = elementInfo(selectedTarget, { includeHtml: true });
      post('GP_ELEMENT_SELECTED', info);
      var capturedTarget = selectedTarget;
      captureElement(capturedTarget).then(function (dataUrl) {
        if (selectedTarget !== capturedTarget) return; // selection changed, drop
        post('GP_ELEMENT_SCREENSHOT', { selector: info.selector, screenshot: dataUrl });
      }).catch(function (err) {
        try { console.warn('[GP Bridge] screenshot failed:', err && err.message); } catch (_) {}
      });
      return;
    }

    // Inspector OFF — let the user follow links. Accept direct anchor clicks
    // and bubble up through ancestor anchors (common for anchor-wrapped
    // images / headings in Elementor themes).
    var clickedAnchor = (e.target.tagName === 'A' && e.target.getAttribute('href')) ? e.target : null;
    var ancestorAnchor = clickedAnchor || (e.target.closest && e.target.closest('a[href]'));

    function runLinkNav(anchorEl) {
      var href = anchorEl.getAttribute('href');
      if (!href || href.charAt(0) === '#' || href.indexOf('javascript:') === 0) return false;
      try {
        var destUrl = new URL(href, window.location.href);
        if (destUrl.origin === window.location.origin) {
          post('GP_LINK_NAVIGATING', { url: destUrl.pathname + destUrl.search });
        }
      } catch (_) {}
      return navigateWithPreviewParams(href);
    }

    if (ancestorAnchor && runLinkNav(ancestorAnchor)) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  function refreshSelectedBox() {
    if (selectedTarget && overlayEl) positionBox(overlayEl, selectedTarget);
    if (hoverTarget && hoverOutlineEl) positionBox(hoverOutlineEl, hoverTarget);
    if (hoverTarget && tooltipEl && tooltipEl.style.display === 'block') positionTooltip(hoverTarget);
  }

  function applyPreviewChange(selector, changes) {
    var el = document.querySelector(selector);
    if (!el) return;
    if (typeof changes.text === 'string') {
      previewMutations.push({ el: el, prop: 'textContent', prevValue: el.textContent });
      el.textContent = changes.text;
    }
    if (changes.style && typeof changes.style === 'object') {
      Object.keys(changes.style).forEach(function (k) {
        previewMutations.push({ el: el, prop: 'style:' + k, prevValue: el.style[k] });
        el.style[k] = changes.style[k];
      });
    }
    if (typeof changes.attr === 'object' && changes.attr) {
      Object.keys(changes.attr).forEach(function (k) {
        previewMutations.push({ el: el, prop: 'attr:' + k, prevValue: el.getAttribute(k) });
        el.setAttribute(k, changes.attr[k]);
      });
    }
  }

  function resetPreview() {
    while (previewMutations.length) {
      var m = previewMutations.pop();
      if (m.prop === 'textContent') {
        m.el.textContent = m.prevValue;
      } else if (m.prop.indexOf('style:') === 0) {
        m.el.style[m.prop.slice(6)] = m.prevValue || '';
      } else if (m.prop.indexOf('attr:') === 0) {
        var name = m.prop.slice(5);
        if (m.prevValue === null) m.el.removeAttribute(name);
        else m.el.setAttribute(name, m.prevValue);
      }
    }
  }

  function highlightElement(selector) {
    var el = document.querySelector(selector);
    if (!el) return;
    try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
    ensureOverlay();
    positionBox(overlayEl, el);
    overlayEl.style.outline = '3px solid #00FF9D';
    setTimeout(function () { if (overlayEl) overlayEl.style.outline = '2px solid #7B2CBF'; }, 900);
  }

  window.addEventListener('message', function (event) {
    if (parentOrigin !== '*' && event.origin !== parentOrigin) return;
    var data = event.data;
    if (!data || typeof data.type !== 'string') return;
    switch (data.type) {
      case 'GP_SET_INSPECTOR_ENABLED':
        inspectorEnabled = !!data.enabled;
        if (!inspectorEnabled) {
          if (hoverOutlineEl) hoverOutlineEl.style.display = 'none';
          if (overlayEl) overlayEl.style.display = 'none';
          if (tooltipEl) tooltipEl.style.display = 'none';
        }
        applyCursor();
        break;
      case 'GP_CLEAR_SELECTION':
        selectedTarget = null;
        if (overlayEl) overlayEl.style.display = 'none';
        break;
      case 'GP_PREVIEW_CHANGE':
        applyPreviewChange(data.selector, data);
        break;
      case 'GP_PREVIEW_RESET':
        resetPreview();
        break;
      case 'GP_HIGHLIGHT_ELEMENT':
        highlightElement(data.selector);
        break;
    }
  });

  function patchHistory(method) {
    var orig = history[method];
    history[method] = function () {
      var r = orig.apply(this, arguments);
      post('GP_URL_CHANGED', { url: location.pathname + location.search });
      return r;
    };
  }

  function init() {
    applyCursor();
    document.addEventListener('mouseover', onMouseOver, true);
    document.addEventListener('mouseout', onMouseOut, true);
    document.addEventListener('click', onClick, true);
    window.addEventListener('scroll', refreshSelectedBox, true);
    window.addEventListener('resize', refreshSelectedBox);
    window.addEventListener('popstate', function () {
      post('GP_URL_CHANGED', { url: location.pathname + location.search });
    });
    patchHistory('pushState');
    patchHistory('replaceState');
    post('GP_BRIDGE_READY', { url: location.pathname + location.search });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
`;
}
