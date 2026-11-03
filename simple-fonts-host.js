import { readFileSync } from 'node:fs';
import {
  FONT_FIELDS, PRESET_IDS, ENGLISH_FONT_IDS, CHINESE_FONT_IDS,
  readFontFields, matchFontPreset, buildFontPatch, normalizeFontFamily,
  validateFontLanguages, composeFontLanguages, matchFontLanguages, createFontPresetCatalog,
} from './simple-fonts-core.js';

export const inject = ['settingsController', 'tools'];

const languageCatalog = validateFontLanguages(JSON.parse(readFileSync(new URL('./simple-font-languages.json', import.meta.url), 'utf8')));
const catalog = createFontPresetCatalog(languageCatalog);

function findThemeNamespace(description) {
  const view = description.namespaces.find(entry => entry.ns === 'include:ui-theme' || entry.ns === 'ui-theme');
  if (!view) throw new Error('Native theme settings namespace is absent (expected include:ui-theme or ui-theme).');
  return view;
}

function result(view, writable) {
  const fields = readFontFields(view.value);
  return {
    ...fields,
    preset: matchFontPreset(fields, languageCatalog),
    ns: view.ns,
    revision: view.revision,
    writable: writable === true,
    catalog: catalog.map(record => ({ ...record })),
    languageCatalog: {
      english: languageCatalog.english.map(record => ({ ...record })),
      chinese: languageCatalog.chinese.map(record => ({ ...record })),
    },
    languages: matchFontLanguages(fields, languageCatalog),
  };
}

/** Native settings remain the only persistence path; safe to exercise with a mock. */
export function createFontActions(controller) {
  async function merge(patch) {
    const description = controller.describe();
    const view = findThemeNamespace(description);
    if (description.writable !== true) throw new Error('Native font settings are read-only.');
    const current = readFontFields(view.value);
    if (FONT_FIELDS.every(field => normalizeFontFamily(current[field]) === normalizeFontFamily(patch[field]))) {
      return { ...result(view, description.writable), changed: false };
    }
    // Both actions use the same native merge and described revision, never replacement.
    const updated = await controller.update(view.ns, patch, view.revision);
    return { ...result(updated, description.writable), changed: true };
  }
  return {
    get() {
      const description = controller.describe();
      return result(findThemeNamespace(description), description.writable);
    },
    async set(preset) {
      return merge(buildFontPatch(languageCatalog, preset));
    },
    async setLanguages(english, chinese) {
      return merge(composeFontLanguages(languageCatalog, english, chinese));
    },
  };
}

const familyProperties = Object.fromEntries(FONT_FIELDS.map(field => [field, { type: 'string' }]));
const catalogSchema = {
  type: 'array',
  items: {
    type: 'object',
    properties: { id: { type: 'string', enum: [...PRESET_IDS] }, ...familyProperties },
    required: ['id', ...FONT_FIELDS],
    additionalProperties: false,
  },
};
const languageCatalogSchema = {
  type: 'object',
  properties: {
    english: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', enum: [...ENGLISH_FONT_IDS] },
          text: { type: 'string' }, code: { type: 'string' }, terminal: { type: 'string' },
        },
        required: ['id', 'text', 'code', 'terminal'],
        additionalProperties: false,
      },
    },
    chinese: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string', enum: [...CHINESE_FONT_IDS] }, family: { type: 'string' } },
        required: ['id', 'family'],
        additionalProperties: false,
      },
    },
  },
  required: ['english', 'chinese'],
  additionalProperties: false,
};

export function apply(ctx) {
  const actions = createFontActions(ctx.settingsController);
  return ctx.effect(() => ctx.tools.register({
    name: 'stylelab_font',
    description: 'Read or change native English and Chinese font families without changing theme or font sizes.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['get', 'set', 'set_languages'],
          description: 'get returns saved fonts, match, revision, writability and two-choice catalogs; set applies a preset; set_languages chooses English and Chinese independently.',
        },
        preset: {
          type: 'string',
          enum: [...PRESET_IDS],
          description: 'Required only for set. default restores system fonts; maple selects optional locally installed Maple for both languages.',
        },
        english: {
          type: 'string',
          enum: [...ENGLISH_FONT_IDS],
          description: 'Required only for set_languages. default selects system Latin fonts; maple selects Maple Mono NF CN Latin.',
        },
        chinese: {
          type: 'string',
          enum: [...CHINESE_FONT_IDS],
          description: 'Required only for set_languages. default selects system Chinese fonts; maple selects Maple Mono NF CN.',
        },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          ...familyProperties,
          preset: { type: 'string', enum: [...PRESET_IDS, 'custom'] },
          ns: { type: 'string' },
          revision: { type: 'integer' },
          writable: { type: 'boolean' },
          catalog: catalogSchema,
          languageCatalog: languageCatalogSchema,
          languages: {
            oneOf: [
              {
                type: 'object',
                properties: {
                  english: { type: 'string', enum: [...ENGLISH_FONT_IDS] },
                  chinese: { type: 'string', enum: [...CHINESE_FONT_IDS] },
                  exact: { type: 'boolean' },
                },
                required: ['english', 'chinese', 'exact'],
                additionalProperties: false,
              },
              { type: 'null' },
            ],
          },
          changed: { type: 'boolean' },
        },
        required: [...FONT_FIELDS, 'preset', 'ns', 'revision', 'writable', 'catalog', 'languageCatalog', 'languages'],
        additionalProperties: false,
      },
      render(args, value) {
        return [{ type: 'text', text: JSON.stringify(value) }];
      },
    },
    async execute(args) {
      if (!args || typeof args !== 'object' || Array.isArray(args)) {
        throw new TypeError('Expected a font action with its required arguments.');
      }
      const allowed = args.action === 'get' ? ['action']
        : args.action === 'set' ? ['action', 'preset']
          : args.action === 'set_languages' ? ['action', 'english', 'chinese'] : null;
      if (!allowed) throw new TypeError('Font action must be get, set or set_languages.');
      if (Object.keys(args).some(key => !allowed.includes(key))
        || allowed.some(key => !Object.hasOwn(args, key))) {
        throw new TypeError(`The ${args.action} action requires only: ${allowed.join(', ')}.`);
      }
      if (args.action === 'get') return actions.get();
      if (args.action === 'set') return actions.set(args.preset);
      return actions.setLanguages(args.english, args.chinese);
    },
  }));
}
