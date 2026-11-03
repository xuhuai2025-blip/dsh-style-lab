/** Self-contained, pure system/Maple font composition and matching. */
export const ENGLISH_FONT_IDS = Object.freeze(['default', 'maple']);
export const CHINESE_FONT_IDS = Object.freeze(['default', 'maple']);
export const PRESET_IDS = Object.freeze(['default', 'maple']);
export const FONT_FIELDS = Object.freeze(['textFontFamily', 'codeFontFamily', 'terminalFontFamily']);

export function normalizeFontFamily(value) {
  if (typeof value !== 'string') return '';
  return value.split(',').map(family => family.trim().replace(/\s+/gu, ' ')
    .replace(/^(['"])(.*)\1$/u, '$2').trim()).join(',');
}

export function readFontFields(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return Object.fromEntries(FONT_FIELDS.map(field => [field, typeof source[field] === 'string' ? source[field] : '']));
}

/** Validate only the two supported choices and detach mutable caller data. */
export function validateFontLanguages(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== 2 || !Object.hasOwn(value, 'english') || !Object.hasOwn(value, 'chinese')) {
    throw new TypeError('Font catalog must contain only english and chinese arrays.');
  }
  function group(records, ids, familyKeys) {
    if (!Array.isArray(records) || records.length !== ids.length) {
      throw new TypeError('Each font language catalog must contain exactly two choices.');
    }
    const seen = new Set();
    return Object.freeze(records.map(record => {
      if (!record || typeof record !== 'object' || Array.isArray(record)
        || Object.keys(record).length !== familyKeys.length + 1
        || !Object.hasOwn(record, 'id') || !ids.includes(record.id) || seen.has(record.id)
        || familyKeys.some(key => !Object.hasOwn(record, key) || typeof record[key] !== 'string'
          || record[key].trim() === '' || record[key].length > 128)) {
        throw new TypeError('Invalid font catalog record. Expected a unique choice and bounded family strings.');
      }
      seen.add(record.id);
      return Object.freeze({ id: record.id, ...Object.fromEntries(familyKeys.map(key => [key, record[key]])) });
    }));
  }
  return Object.freeze({
    english: group(value.english, ENGLISH_FONT_IDS, ['text', 'code', 'terminal']),
    chinese: group(value.chinese, CHINESE_FONT_IDS, ['family']),
  });
}

/** System/system clears overrides; all other pairs keep Latin first, Han second. */
export function composeFontLanguages(catalog, english, chinese) {
  if (typeof english !== 'string' || !ENGLISH_FONT_IDS.includes(english)
    || typeof chinese !== 'string' || !CHINESE_FONT_IDS.includes(chinese)) {
    throw new TypeError('Invalid font languages. Choose default or maple for each language.');
  }
  const latin = catalog.english.find(record => record.id === english);
  const han = catalog.chinese.find(record => record.id === chinese);
  if (!latin || !han) throw new Error('Selected fonts are missing from the catalog.');
  if (english === 'default' && chinese === 'default') return readFontFields({});
  function families(role) {
    const seen = new Set();
    return [latin[role], han.family, 'Microsoft YaHei UI'].filter(family => {
      const normalized = normalizeFontFamily(family);
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    }).join(', ');
  }
  return { textFontFamily: families('text'), codeFontFamily: families('code'), terminalFontFamily: families('terminal') };
}

export function buildFontPatch(catalog, preset) {
  if (typeof preset !== 'string' || !PRESET_IDS.includes(preset)) {
    throw new TypeError('Invalid font preset. Choose default or maple.');
  }
  return composeFontLanguages(catalog, preset, preset);
}

export function createFontPresetCatalog(catalog) {
  return Object.freeze(PRESET_IDS.map(id => Object.freeze({ id, ...buildFontPatch(catalog, id) })));
}

export function matchFontPreset(value, catalog) {
  const fields = readFontFields(value);
  return PRESET_IDS.find(id => {
    const patch = buildFontPatch(catalog, id);
    return FONT_FIELDS.every(field => normalizeFontFamily(fields[field]) === normalizeFontFamily(patch[field]));
  }) ?? 'custom';
}

/** Exact matches win; an explicitly inexact text-only hint never changes settings. */
export function matchFontLanguages(value, catalog) {
  const fields = readFontFields(value);
  let hint = null;
  for (const english of catalog.english) {
    for (const chinese of catalog.chinese) {
      const patch = composeFontLanguages(catalog, english.id, chinese.id);
      if (FONT_FIELDS.every(field => normalizeFontFamily(fields[field]) === normalizeFontFamily(patch[field]))) {
        return { english: english.id, chinese: chinese.id, exact: true };
      }
      if (hint === null && normalizeFontFamily(fields.textFontFamily) === normalizeFontFamily(patch.textFontFamily)) {
        hint = { english: english.id, chinese: chinese.id, exact: false };
      }
    }
  }
  return hint;
}
