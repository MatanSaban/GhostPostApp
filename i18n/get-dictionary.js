// Dictionary loader for Ghost Post Platform

const dictionaries = {
  en: () => import('./dictionaries/en.json').then((module) => module.default),
  he: () => import('./dictionaries/he.json').then((module) => module.default),
};

export const getDictionary = async (locale) => {
  if (!dictionaries[locale]) {
    return dictionaries.en();
  }
  return dictionaries[locale]();
};

// Synchronous version for client-side use (requires pre-loaded dictionaries)
export const getDictionarySync = (locale, dictData) => {
  return dictData[locale] || dictData.en;
};
