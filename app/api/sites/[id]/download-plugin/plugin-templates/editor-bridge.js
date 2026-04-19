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
  if (params.get('gp_editor') !== 'true') return;
  if (window.self === window.top) return; // only when iframed

  var parentOrigin = document.referrer ? new URL(document.referrer).origin : '*';
  var inspectorEnabled = true;
  var previewMutations = []; // [{ el, prop, prevValue }]
  var overlayEl = null;
  var hoverOutlineEl = null;

  function post(type, payload) {
    var msg = Object.assign({ _gp: true, type: type }, payload || {});
    try { window.parent.postMessage(msg, parentOrigin); } catch (e) {}
  }

  function isBridgeNode(el) {
    return el === overlayEl || el === hoverOutlineEl ||
      (el && el.closest && el.closest('[data-gp-bridge]'));
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

  function elementInfo(el) {
    var rect = el.getBoundingClientRect();
    return {
      tag: el.tagName.toLowerCase(),
      text: (el.innerText || el.textContent || '').trim().substring(0, 200),
      selector: cssPath(el),
      src: el.tagName === 'IMG' ? el.getAttribute('src') : undefined,
      alt: el.tagName === 'IMG' ? el.getAttribute('alt') : undefined,
      href: el.tagName === 'A' ? el.getAttribute('href') : undefined,
      elementorWidget: getElementorWidget(el),
      rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
    };
  }

  function ensureOverlay() {
    if (overlayEl) return;
    overlayEl = document.createElement('div');
    overlayEl.setAttribute('data-gp-bridge', '1');
    overlayEl.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483646;outline:2px solid #7B2CBF;background:rgba(123,44,191,0.08);transition:all 80ms ease;display:none;border-radius:2px;';
    document.documentElement.appendChild(overlayEl);

    hoverOutlineEl = document.createElement('div');
    hoverOutlineEl.setAttribute('data-gp-bridge', '1');
    hoverOutlineEl.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483645;outline:1px dashed #9B4DE0;transition:all 60ms ease;display:none;border-radius:2px;';
    document.documentElement.appendChild(hoverOutlineEl);
  }

  function positionBox(box, el) {
    if (!el) { box.style.display = 'none'; return; }
    var r = el.getBoundingClientRect();
    box.style.left = r.left + 'px';
    box.style.top = r.top + 'px';
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
    post('GP_ELEMENT_HOVER', elementInfo(hoverTarget));
  }

  function onMouseOut(e) {
    if (!inspectorEnabled) return;
    if (e.target === hoverTarget) {
      hoverTarget = null;
      if (hoverOutlineEl) hoverOutlineEl.style.display = 'none';
      post('GP_ELEMENT_HOVER_OUT', {});
    }
  }

  function onClick(e) {
    if (!inspectorEnabled) return;
    if (isBridgeNode(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    selectedTarget = e.target;
    ensureOverlay();
    positionBox(overlayEl, selectedTarget);
    post('GP_ELEMENT_SELECTED', elementInfo(selectedTarget));
  }

  function refreshSelectedBox() {
    if (selectedTarget && overlayEl) positionBox(overlayEl, selectedTarget);
    if (hoverTarget && hoverOutlineEl) positionBox(hoverOutlineEl, hoverTarget);
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
        }
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
