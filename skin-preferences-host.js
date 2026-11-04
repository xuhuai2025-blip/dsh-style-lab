import z from '@deepseek-ai/schemastery';
import { SKIN_IDS, MIST_MODES, createSkinActions, createSkinTool } from './skin-preferences-core.js';

export { createSkinActions } from './skin-preferences-core.js';
export const inject = ['settingsController', 'tools'];

/** Volatile native Config fields persist without restarting the Client plugin. */
export const Config = z.object({
  skinId: z.union([...SKIN_IDS]).default('native').volatile(),
  mistMode: z.union([...MIST_MODES]).default('hud').volatile(),
});

export function apply(ctx) {
  // The StyleLab page owns these controls; retain the native settings namespace without an extra generated page.
  ctx.inject(['settings'], child => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber));
  });
  const actions = createSkinActions(ctx.settingsController);
  return ctx.effect(() => ctx.tools.register(createSkinTool(actions)));
}
