/** Pure StyleLab preferences actions; the native settings controller owns persistence. */
export const SKIN_NAMESPACE = 'local-stylelab';
export const SKIN_IDS = Object.freeze([
  'native', 'system', 'light', 'dark',
  'stylelab-oat-parchment', 'stylelab-mist-glow', 'stylelab-ivory-notebook',
]);
export const MIST_MODES = Object.freeze(['hud', 'circuit']);
export const SKIN_CATALOG = Object.freeze([
  { id: 'native', label: 'Keep native appearance' },
  { id: 'system', label: 'Follow system' },
  { id: 'light', label: 'Native light' },
  { id: 'dark', label: 'Native dark' },
  { id: 'stylelab-oat-parchment', label: 'Oat parchment' },
  { id: 'stylelab-mist-glow', label: 'Mist glow' },
  { id: 'stylelab-ivory-notebook', label: 'Ivory notebook' },
].map(record => Object.freeze(record)));

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function validateSkin(value) {
  if (!SKIN_IDS.includes(value)) throw new TypeError('skinId must be one of the catalog ids.');
  return value;
}
function validateMist(value) {
  if (!MIST_MODES.includes(value)) throw new TypeError('mistMode must be hud or circuit.');
  return value;
}
export function readSkinPreferences(value) {
  if (!record(value)) throw new TypeError('StyleLab settings must be an object.');
  return {
    skinId: validateSkin(value.skinId ?? 'native'),
    mistMode: validateMist(value.mistMode ?? 'hud'),
  };
}
function namespace(description) {
  const view = description.namespaces?.find(entry => entry.ns === SKIN_NAMESPACE);
  if (!view) throw new Error(`StyleLab settings namespace "${SKIN_NAMESPACE}" is unavailable.`);
  return view;
}
function result(view, writable) {
  return { ...readSkinPreferences(view.value), ns: view.ns, revision: view.revision, writable: writable === true };
}
function validatePatch(patch) {
  if (!record(patch)) throw new TypeError('Expected a partial StyleLab preferences object.');
  if (Object.keys(patch).some(key => !['skinId', 'mistMode', 'expectedRevision'].includes(key))) {
    throw new TypeError('Only skinId, mistMode and expectedRevision may be set.');
  }
  if (!Object.hasOwn(patch, 'skinId') && !Object.hasOwn(patch, 'mistMode')) {
    throw new TypeError('set requires skinId or mistMode.');
  }
  if (Object.hasOwn(patch, 'skinId')) validateSkin(patch.skinId);
  if (Object.hasOwn(patch, 'mistMode')) validateMist(patch.mistMode);
  if (patch.expectedRevision !== undefined && (!Number.isSafeInteger(patch.expectedRevision) || patch.expectedRevision < 0)) {
    throw new TypeError('expectedRevision must be a non-negative safe integer.');
  }
}

/** Both the agent tool and Client form use native path mutations in this namespace only. */
export function createSkinActions(controller) {
  return {
    get() {
      const description = controller.describe();
      return { ...result(namespace(description), description.writable), catalog: SKIN_CATALOG.map(entry => ({ ...entry })) };
    },
    async set(patch) {
      validatePatch(patch);
      const description = controller.describe();
      const view = namespace(description);
      if (description.writable !== true) throw new Error('StyleLab settings are read-only.');
      const current = readSkinPreferences(view.value);
      const expected = patch.expectedRevision ?? view.revision;
      if (patch.expectedRevision !== undefined && expected !== view.revision) {
        throw new Error(`StyleLab settings revision conflict: expected ${expected}, found ${view.revision}.`);
      }
      const ops = ['skinId', 'mistMode'].filter(key => Object.hasOwn(patch, key) && patch[key] !== current[key])
        .map(key => ({ op: 'set', path: [key], value: patch[key] }));
      if (ops.length === 0) return { ...result(view, description.writable), changed: false };
      const updated = await controller.mutate(view.ns, ops, expected);
      return { ...result(updated, description.writable), changed: true };
    },
  };
}

/** Model-facing contract stays deferred and bounded; catalogs are returned by get. */
export function createSkinTool(actions) {
  return {
    name: 'stylelab_skin',
    description: 'Read or persist the Harness skin and Mist decoration mode across restarts without changing fonts or models.',
    deferLoading: true,
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['get', 'set'], description: 'get returns saved values and the skin catalog; set requires skinId or mistMode.' },
        skinId: { type: 'string', enum: [...SKIN_IDS], description: 'For set. native leaves current native appearance unchanged; system follows the OS.' },
        mistMode: { type: 'string', enum: [...MIST_MODES], description: 'For set. Mist decorations only: hud or circuit.' },
        expectedRevision: { type: 'integer', description: 'For set. Optional non-negative safe-integer revision from get; stale revisions fail.' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          skinId: { type: 'string', enum: [...SKIN_IDS] },
          mistMode: { type: 'string', enum: [...MIST_MODES] },
          ns: { type: 'string' }, revision: { type: 'integer' }, writable: { type: 'boolean' },
          changed: { type: 'boolean' },
          catalog: { type: 'array', items: {
            type: 'object', properties: { id: { type: 'string', enum: [...SKIN_IDS] }, label: { type: 'string' } },
            required: ['id', 'label'], additionalProperties: false,
          } },
        },
        required: ['skinId', 'mistMode', 'ns', 'revision', 'writable'],
        additionalProperties: false,
      },
      render(_args, value) { return [{ type: 'text', text: JSON.stringify(value) }]; },
    },
    isConcurrencySafe(args) { return record(args) && args.action === 'get'; },
    async execute(args) {
      if (!record(args)) throw new TypeError('Expected a skin action object.');
      if (args.action === 'get') {
        if (Object.keys(args).some(key => key !== 'action')) throw new TypeError('get accepts only action.');
        return actions.get();
      }
      if (args.action !== 'set') throw new TypeError('Skin action must be get or set.');
      const { action, ...patch } = args;
      return actions.set(patch);
    },
  };
}
