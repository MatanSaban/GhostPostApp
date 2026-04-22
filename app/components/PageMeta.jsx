'use client';

// Client-side metadata applier.
//
// Mounted once inside each client layout (dashboard, admin, auth). On every
// route change OR locale change it looks up the current pathname in
// `pageRegistry` and updates document.title, the description meta tag, and
// the robots tag.
//
// Pages that need a DYNAMIC title (e.g. an entity name the user typed in)
// call `useDynamicPageMeta(title, description?)`. That writes to a tiny
// module-local store; PageMeta subscribes to it via useSyncExternalStore
// and re-applies whenever the override changes — guaranteeing the
// dynamic title wins even though child effects normally fire BEFORE the
// parent layout's effects.
//
// We read meta.* strings from STATIC JSON imports (not the async dictionary
// from locale-context) because they're small, fixed at build time, and
// available synchronously on first render. This avoids a race where the
// layout's effect runs before the async dictionary has loaded and paints
// the wrong title.

import { useEffect, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { useLocale } from '@/app/context/locale-context';
import { getPageMetaForPath, siteConfig } from '@/lib/seo/metadata';
import enDict from '@/i18n/dictionaries/en.json';
import heDict from '@/i18n/dictionaries/he.json';

const STATIC_DICTS = { en: enDict, he: heDict };

// --- module-level override store -------------------------------------------

let _override = { title: null, description: null };
const _subscribers = new Set();

function subscribe(fn) {
  _subscribers.add(fn);
  return () => _subscribers.delete(fn);
}

function getSnapshot() {
  return _override;
}

const _serverSnapshot = { title: null, description: null };
function getServerSnapshot() {
  return _serverSnapshot;
}

function setOverride(next) {
  if (_override.title === next.title && _override.description === next.description) {
    return;
  }
  _override = next;
  _subscribers.forEach((fn) => fn());
}

// Page-level hook. Call from any client component to set a dynamic title
// (and optional description). The override is cleared on unmount unless
// another page has already claimed ownership (back-to-back route changes).
export function useDynamicPageMeta(title, description) {
  useEffect(() => {
    setOverride({
      title: title || null,
      description: description || null,
    });
    return () => {
      if (_override.title === (title || null) && _override.description === (description || null)) {
        setOverride({ title: null, description: null });
      }
    };
  }, [title, description]);
}

// --- DOM helpers -----------------------------------------------------------

function ensureMetaTag(name) {
  if (typeof document === 'undefined') return null;
  let tag = document.head.querySelector(`meta[name="${name}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute('name', name);
    document.head.appendChild(tag);
  }
  return tag;
}

function applyTitle(rawTitle) {
  if (typeof document === 'undefined' || !rawTitle) return;
  const template = siteConfig.titleTemplate.replace('%s', rawTitle);
  document.title = rawTitle.includes(siteConfig.brand) ? rawTitle : template;
}

// --- component -------------------------------------------------------------

export function PageMeta() {
  const pathname = usePathname();
  const { locale } = useLocale();
  const override = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    const dict = STATIC_DICTS[locale] || STATIC_DICTS.en;
    const fallback = getPageMetaForPath(pathname, dict);
    const title = override.title || fallback.title;
    const description = override.description || fallback.description;
    const robots = fallback.robots;

    applyTitle(title);

    const descTag = ensureMetaTag('description');
    if (descTag) descTag.setAttribute('content', description);

    const robotsTag = ensureMetaTag('robots');
    if (robotsTag) {
      robotsTag.setAttribute(
        'content',
        robots === 'index' ? 'index, follow' : 'noindex, nofollow'
      );
    }

    const ogTitle = document.head.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute('content', title);
    const ogDesc = document.head.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.setAttribute('content', description);
  }, [pathname, locale, override.title, override.description]);

  return null;
}

export default PageMeta;
