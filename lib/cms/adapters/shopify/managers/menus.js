/**
 * Shopify menus manager
 *
 * Shopify navigation menus are exposed via the Online Store API
 * (resource: menus). Each menu has nested items {title, type, subject, links}.
 * The Admin GraphQL exposes them under `menus(first:…)` and mutations
 * `menuCreate`, `menuUpdate`, `menuDelete`. We surface a WP-shaped menu
 * structure: { id, name, slug, items: [{id, title, url, parent, target}] }.
 */

import { shopifyGraphQL } from '../client';
import { gidNumericId, toGid } from '../gid';

const LIST_MENUS = `
  query ListMenus($first: Int!) {
    menus(first: $first) {
      edges { node {
        id handle title isDefault
        items { id title type url tags resourceId items {
          id title type url tags resourceId items {
            id title type url tags resourceId
          }
        } }
      } }
    }
  }
`;

const CREATE_MENU = `
  mutation MenuCreate($title: String!, $handle: String!, $items: [MenuItemCreateInput!]!) {
    menuCreate(title: $title, handle: $handle, items: $items) {
      menu { id handle title items { id title type url } }
      userErrors { field message code }
    }
  }
`;

const UPDATE_MENU = `
  mutation MenuUpdate($id: ID!, $title: String!, $handle: String!, $items: [MenuItemUpdateInput!]!) {
    menuUpdate(id: $id, title: $title, handle: $handle, items: $items) {
      menu { id handle title items { id title type url } }
      userErrors { field message code }
    }
  }
`;

function flattenItems(items, parent = null, out = []) {
  for (const item of items || []) {
    out.push({
      id: item.id,
      title: item.title,
      url: item.url,
      type: item.type,
      parent,
      target: null,
    });
    if (item.items?.length) flattenItems(item.items, item.id, out);
  }
  return out;
}

function mapMenu(node) {
  if (!node) return null;
  return {
    id: gidNumericId(node.id),
    gid: node.id,
    name: node.title,
    slug: node.handle,
    isDefault: !!node.isDefault,
    items: flattenItems(node.items),
  };
}

/** Build the nested items input from a flat array of WP-shaped items. */
function buildItemsTree(flatItems = []) {
  const byParent = new Map();
  for (const item of flatItems) {
    const key = item.parent || null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(item);
  }
  const build = (parentId) =>
    (byParent.get(parentId) || []).map((it) => ({
      title: it.title,
      type: it.type || 'HTTP',
      url: it.url,
      items: build(it.id),
    }));
  return build(null);
}

export async function getMenus(site) {
  const data = await shopifyGraphQL(site, LIST_MENUS, { first: 50 });
  const items = (data.menus?.edges || []).map((e) => mapMenu(e.node));
  return { items, total: items.length };
}

export async function addMenuItem(site, menuId, item) {
  const rawId = String(menuId);
  const isGid = rawId.startsWith('gid://shopify/');
  const id = isGid ? rawId : toGid('Menu', rawId);

  // Shopify's MenuUpdate replaces the entire item tree - we have to fetch,
  // append, then write back.
  const list = await getMenus(site);
  const menu = list.items.find((m) => m.gid === id || String(m.id) === rawId);
  if (!menu) throw new Error(`[shopify] addMenuItem: menu ${menuId} not found`);

  const nextFlat = [
    ...menu.items,
    {
      id: `__new_${Date.now()}`,
      title: item.title,
      url: item.url,
      type: item.type || 'HTTP',
      parent: item.parent || null,
    },
  ];

  const data = await shopifyGraphQL(site, UPDATE_MENU, {
    id,
    title: menu.name,
    handle: menu.slug,
    items: buildItemsTree(nextFlat),
  });
  if (data.menuUpdate?.userErrors?.length) {
    throw new Error(`[shopify] menuUpdate: ${data.menuUpdate.userErrors.map((e) => e.message).join('; ')}`);
  }
  return mapMenu(data.menuUpdate?.menu);
}

export async function updateMenuItem(site, menuId, itemId, patch) {
  const rawId = String(menuId);
  const id = rawId.startsWith('gid://shopify/') ? rawId : toGid('Menu', rawId);
  const list = await getMenus(site);
  const menu = list.items.find((m) => m.gid === id || String(m.id) === rawId);
  if (!menu) throw new Error(`[shopify] updateMenuItem: menu ${menuId} not found`);

  const nextFlat = menu.items.map((it) =>
    String(it.id) === String(itemId) || it.id === itemId
      ? { ...it, ...patch }
      : it,
  );

  const data = await shopifyGraphQL(site, UPDATE_MENU, {
    id,
    title: menu.name,
    handle: menu.slug,
    items: buildItemsTree(nextFlat),
  });
  if (data.menuUpdate?.userErrors?.length) {
    throw new Error(`[shopify] menuUpdate: ${data.menuUpdate.userErrors.map((e) => e.message).join('; ')}`);
  }
  return mapMenu(data.menuUpdate?.menu);
}

export async function deleteMenuItem(site, menuId, itemId) {
  const rawId = String(menuId);
  const id = rawId.startsWith('gid://shopify/') ? rawId : toGid('Menu', rawId);
  const list = await getMenus(site);
  const menu = list.items.find((m) => m.gid === id || String(m.id) === rawId);
  if (!menu) throw new Error(`[shopify] deleteMenuItem: menu ${menuId} not found`);

  const nextFlat = menu.items.filter(
    (it) => String(it.id) !== String(itemId) && it.parent !== itemId,
  );

  const data = await shopifyGraphQL(site, UPDATE_MENU, {
    id,
    title: menu.name,
    handle: menu.slug,
    items: buildItemsTree(nextFlat),
  });
  if (data.menuUpdate?.userErrors?.length) {
    throw new Error(`[shopify] menuUpdate: ${data.menuUpdate.userErrors.map((e) => e.message).join('; ')}`);
  }
  return mapMenu(data.menuUpdate?.menu);
}

void CREATE_MENU;
