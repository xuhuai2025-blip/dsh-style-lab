window.__ModuleLoader__.load({
  id: '@local/dsh-stylelab',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const THEMES = [
      {
        "id": "stylelab-oat-parchment",
        "colorScheme": "light",
        "tokens": {
          "--dsw-alias-bg-base": "#F5F0E6",
          "--dsw-alias-bg-layer-1": "#FCF9F2",
          "--dsw-alias-bg-layer-2": "#E8E0D2",
          "--dsw-alias-bg-overlay": "#FCF9F2",
          "--dsw-alias-border-l1": "#DDD4C5",
          "--dsw-alias-border-l2": "#BCAF9B",
          "--dsw-alias-brand-primary": "#815B42",
          "--dsw-alias-label-primary": "#3B3731",
          "--dsw-alias-label-secondary": "#686052",
          "--dsw-alias-state-error-primary": "#96554C",
          "--dsw-alias-state-idle-primary": "#746E61",
          "--dsw-alias-state-success-primary": "#516F5D",
          "--dsw-alias-state-warn-primary": "#806335",
          "--dsw-specific-sidebar-fill": "#EBE5D8"
        }
      },
      {
        "id": "stylelab-mist-glow",
        "colorScheme": "dark",
        "tokens": {
          "--dsw-alias-bg-base": "#1D272D",
          "--dsw-alias-bg-layer-1": "#34444EB3",
          "--dsw-alias-bg-layer-2": "#40525CA6",
          "--dsw-alias-bg-overlay": "#33444EF0",
          "--dsw-alias-border-l1": "#A9BFCB33",
          "--dsw-alias-border-l2": "#B5CAD65C",
          "--dsw-alias-brand-primary": "#ABC6CD",
          "--dsw-alias-label-primary": "#E0E7E8",
          "--dsw-alias-label-secondary": "#B3C1C5",
          "--dsw-alias-state-error-primary": "#D1AAA5",
          "--dsw-alias-state-idle-primary": "#ABBABD",
          "--dsw-alias-state-success-primary": "#A7C3B5",
          "--dsw-alias-state-warn-primary": "#C9BEA2",
          "--dsw-specific-sidebar-fill": "#25343CC7"
        }
      },
      {
        "id": "stylelab-ivory-notebook",
        "colorScheme": "light",
        "tokens": {
          "--dsw-alias-bg-base": "#FAF8F0",
          "--dsw-alias-bg-layer-1": "#FFFCF5",
          "--dsw-alias-bg-layer-2": "#EDEADF",
          "--dsw-alias-bg-overlay": "#FFFDF7",
          "--dsw-alias-border-l1": "#E3E0D3",
          "--dsw-alias-border-l2": "#BCC7C4",
          "--dsw-alias-brand-primary": "#4E695B",
          "--dsw-alias-label-primary": "#353D37",
          "--dsw-alias-label-secondary": "#626A60",
          "--dsw-alias-state-error-primary": "#9B534B",
          "--dsw-alias-state-idle-primary": "#697264",
          "--dsw-alias-state-success-primary": "#4D705A",
          "--dsw-alias-state-warn-primary": "#846634",
          "--dsw-specific-sidebar-fill": "#F0EDE2"
        }
      }
    ];
    // Mirrored from simple-font-languages.json; Maple is an optional client-local font.
    const FONT_LANGUAGES = {
      "english": [
        {"id":"default","text":"Segoe UI","code":"Consolas","terminal":"Consolas"},
        {"id":"maple","text":"Maple Mono NF CN Latin","code":"Maple Mono NF CN Latin","terminal":"Maple Mono NF CN Latin"}
      ],
      "chinese": [
        {"id":"default","family":"Microsoft YaHei UI"},
        {"id":"maple","family":"Maple Mono NF CN"}
      ]
    };
    function composeFontLanguages(english, chinese) {
      const en = FONT_LANGUAGES.english.find(item => item.id === english);
      const cn = FONT_LANGUAGES.chinese.find(item => item.id === chinese);
      if (!en || !cn) return null;
      const keys = { text: 'textFontFamily', code: 'codeFontFamily', terminal: 'terminalFontFamily' };
      return Object.fromEntries(Object.entries(keys).map(([role, field]) => [field, english === 'default' && chinese === 'default' ? '' : [...new Set([en[role], cn.family, 'Microsoft YaHei UI'])].join(', ')]));
    }
    function matchingFontLanguages(families) {
      const fields = ['textFontFamily', 'codeFontFamily', 'terminalFontFamily'];
      const values = [families.text, families.code, families.terminal].map(normalizeFontList);
      let legacy = null;
      for (const en of FONT_LANGUAGES.english) for (const cn of FONT_LANGUAGES.chinese) {
        const combined = composeFontLanguages(en.id, cn.id);
        if (fields.every((field, index) => normalizeFontList(combined[field]) === values[index])) return { english: en.id, chinese: cn.id, exact: true };
        if (!legacy && normalizeFontList(combined.textFontFamily) === values[0]) legacy = { english: en.id, chinese: cn.id, exact: false };
      }
      return legacy;
    }
    function normalizeFontList(value) {
      return String(value || '').replace(/["']/g, '').split(',').map(name => name.trim().toLowerCase()).filter(Boolean).join(',');
    }
    // A shared settings adoption replaces the accepted scope snapshot; an explicit native
    // appearance click publishes before its queued write and therefore keeps the same scope.
    function customThemeForSettingsRefresh(before, after, beforeScope, afterScope) {
      const native = ['light', 'dark', 'system'];
      if (!before || !after || !THEMES.some(theme => theme.id === before.preference) || !native.includes(after.preference)) return null;
      if (!after.themes?.some(theme => theme.id === before.preference)) return null;
      // Native adoption rebuilds both records; setTheme publishes their existing references.
      // This also honors an explicit click while an earlier settings write is still pending.
      if (!before.fontFamilies || !before.fontSizes || before.fontFamilies === after.fontFamilies || before.fontSizes === after.fontSizes) return null;
      if (!beforeScope || !afterScope || beforeScope === afterScope || beforeScope.status !== 'ready' || afterScope.status !== 'ready') return null;
      const previousPreference = beforeScope.value?.preference;
      const acceptedPreference = afterScope.value?.preference;
      if (!native.includes(previousPreference) || previousPreference !== acceptedPreference || after.preference !== acceptedPreference) return null;
      return before.preference;
    }
    // Domain adapter only: no polling, persistence, DOM changes or service interception.
    function createThemeRefreshGuard(theme, form, listen, defer) {
      let active = true;
      let previous = theme.getTheme();
      let previousScope = form.getSnapshot();
      let selectedId = THEMES.some(item => item.id === previous.preference) ? previous.preference : null;
      let pending = null;
      let scheduled = false;
      const isOwned = id => THEMES.some(item => item.id === id);
      const isRegistered = (snapshot, id) => snapshot.themes?.some(item => item.id === id) === true;
      function scheduleRestore() {
        if (scheduled || !pending) return;
        scheduled = true;
        defer(() => {
          scheduled = false;
          const request = pending;
          pending = null;
          if (!active || !request || selectedId !== request.id) return;
          const current = theme.getTheme();
          if (current !== request.snapshot || form.getSnapshot() !== request.scope || !isRegistered(current, request.id)) return;
          if (!['light', 'dark', 'system'].includes(current.preference)) return;
          theme.setTheme(request.id);
        });
      }
      const unsubscribe = listen(snapshot => {
        if (!active) return;
        const scope = form.getSnapshot();
        const restore = selectedId ? customThemeForSettingsRefresh({ ...previous, preference: selectedId }, snapshot, previousScope, scope) : null;
        if (isOwned(snapshot.preference)) {
          selectedId = snapshot.preference;
          pending = null;
        } else if (restore) {
          pending = { id: restore, snapshot, scope };
        } else if (!selectedId || !isRegistered(snapshot, selectedId) || snapshot.preference !== previous.preference || scope !== previousScope) {
          selectedId = null;
          pending = null;
        } else if (pending) {
          // Registry/override events may follow adoption in the same stack; retain the
          // latest snapshot without treating those non-selection events as user intent.
          pending = { ...pending, snapshot, scope };
        }
        previous = snapshot;
        previousScope = scope;
        scheduleRestore();
      });
      return {
        onSelection(id) {
          if (!active) return;
          pending = null;
          selectedId = isOwned(id) ? id : null;
          previous = theme.getTheme();
          previousScope = form.getSnapshot();
        },
        dispose() {
          if (!active) return;
          active = false;
          pending = null;
          selectedId = null;
          unsubscribe();
        }
      };
    }
    const DICTS = {
      en: { title: '风格工坊', oat: 'Oat Parchment', mist: 'Mist Glow', notebook: 'Ivory Notebook', system: 'Default', select: 'Select', selected: 'Selected', error: 'Retry', preview: 'Theme preview', hello: 'Hello, DeepSeek.', reply: 'How can I help you?', techDecoration: 'Decoration', vintage: 'Vintage Tape', hud: 'Starlit Traces', circuit: 'Micro Circuits', pageglow: 'Page Keepsakes', fonts: 'Global font', fontDefault: 'System default', fontMaple: 'Maple Mono NF CN', fontEnglish: 'English font', fontChinese: 'Chinese font', fontApply: 'Apply fonts', fontReset: 'Default fonts', fontCustom: 'Custom (system settings)', fontChineseSample: '让灵感自然流动。', fontEnglishSample: 'Make something wonderful.', fontSaving: 'Saving…', fontFailed: 'Font change failed', fontRetry: 'Retry', fontUnavailable: 'Font settings unavailable' },
      zh: { title: '风格工坊', oat: '燕麦暖笺', mist: '雾蓝微光', system: '默认', notebook: '素纸手札', select: '选择', selected: '已选择', error: '重试', preview: '主题预览', hello: '你好，DeepSeek。', reply: '有什么可以帮你？', techDecoration: '装饰', vintage: '复古胶带', hud: '星轨浮光', circuit: '微型电路', pageglow: '书页拾光', fonts: '全局字体', fontDefault: '系统默认', fontMaple: 'Maple Mono NF CN', fontEnglish: '英文字体', fontChinese: '中文字体', fontApply: '应用字体', fontReset: '恢复默认', fontCustom: '自定义（系统设置）', fontChineseSample: '让灵感自然流动。', fontEnglishSample: 'Make something wonderful.', fontSaving: '保存中…', fontFailed: '字体切换失败', fontRetry: '重试', fontUnavailable: '字体设置暂不可用' }
    };
    const CSS = `
.sl-page{height:100%;min-height:0;overflow:auto;box-sizing:border-box;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit}
.sl-page *{box-sizing:border-box}
.sl-wrap{max-width:1120px;margin:0 auto;padding:32px 28px}
.sl-title{font-size:22px;font-weight:600;line-height:1.4;margin:0 0 24px}
.sl-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:16px}
.sl-row{min-width:0;overflow:hidden;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1)}
.sl-default{grid-column:1/-1}
.sl-row[data-selected=true]{border-color:var(--dsw-alias-brand-primary)}
.sl-controls{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 18px}
.sl-preview{height:200px;display:flex;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);border-bottom:1px solid var(--dsw-alias-border-l1);font-size:11px;overflow:hidden}
.sl-preview-rail{width:24%;min-width:52px;background:var(--dsw-specific-sidebar-fill);border-right:1px solid var(--dsw-alias-border-l1);padding:16px 10px;display:flex;flex-direction:column;gap:12px}
.sl-preview-mark{width:18px;height:18px;border-radius:6px;background:var(--dsw-alias-brand-primary);margin-bottom:10px}
.sl-preview-line{height:5px;border-radius:4px;background:var(--dsw-alias-border-l2)}
.sl-preview-main{flex:1;min-width:0;padding:16px 14px;display:flex;flex-direction:column;gap:16px}
.sl-preview-head{font-size:10px;color:var(--dsw-alias-label-secondary)}
.sl-preview-chat{align-self:flex-end;max-width:95%;line-height:1.5;padding:8px 10px;border-radius:8px;background:var(--dsw-alias-bg-layer-2)}
.sl-preview-reply{line-height:1.6;color:var(--dsw-alias-label-primary)}
.sl-preview-input{margin-top:auto;display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:30px;padding:8px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1)}
.sl-preview-send{color:var(--dsw-alias-brand-primary);font-weight:650}
.sl-preview[data-glass=true]{background:linear-gradient(135deg,color-mix(in srgb,var(--dsw-alias-brand-primary) 10%,var(--dsw-alias-bg-base)),var(--dsw-alias-bg-base) 70%)}
.sl-preview[data-glass=true] .sl-preview-rail,.sl-preview[data-glass=true] .sl-preview-input,.sl-preview[data-glass=true] .sl-preview-chat{backdrop-filter:blur(12px) saturate(.7);-webkit-backdrop-filter:blur(12px) saturate(.7);box-shadow:inset 0 1px 0 var(--dsw-alias-border-l1)}
.sl-name{font-size:14px;font-weight:550;margin:0}
.sl-button{appearance:none;min-height:34px;min-width:76px;padding:7px 14px;border:1px solid var(--dsw-alias-border-l2);border-radius:7px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;cursor:pointer}
.sl-button:hover{background:var(--dsw-alias-bg-layer-2)}
.sl-button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:3px}
.sl-button[aria-pressed=true]{color:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2)}
.sl-button[data-error=true]{color:var(--dsw-alias-state-error-primary)}
.sl-custom{display:flex;align-items:center;min-height:56px;flex-wrap:wrap;gap:10px 16px;padding:12px 16px;border-top:1px solid var(--dsw-alias-border-l1)}
.sl-custom label{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--dsw-alias-label-secondary)}
.sl-custom select{min-height:30px;width:140px;max-width:100%;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);padding:4px 7px;font:inherit;cursor:pointer}
.sl-custom select:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.sl-preview-note-stack{display:flex;flex-direction:column;gap:9px}
.sl-preview-note .sl-preview-line,.sl-preview-tech .sl-preview-line{height:4px;background:var(--dsw-alias-border-l2)}
.sl-preview-tech{min-height:23px;padding:8px 6px;border:1px solid var(--dsw-alias-border-l2);border-radius:5px;background:var(--dsw-alias-bg-layer-1)}
.sl-preview-notebook{min-height:23px;padding:8px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:5px}
.sl-fonts{padding:16px 18px;margin-bottom:20px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1)}
.sl-font-heading{font-size:14px;font-weight:600;margin:0 0 14px}
.sl-font-controls{display:flex;align-items:flex-start;flex-wrap:wrap;gap:16px 20px}
.sl-font-language{flex:1 1 250px;min-width:0}
.sl-font-language .sl-font-sample{margin-top:12px}
.sl-font-label{display:flex;align-items:center;flex-wrap:wrap;gap:8px;font-size:13px;font-weight:550}
.sl-font-actions{display:flex;gap:8px;flex-wrap:wrap;margin-left:auto}
.sl-fonts .sl-button:disabled{opacity:.5;cursor:not-allowed}
.sl-font-select{flex:1 1 160px;min-width:0;max-width:100%;min-height:36px;padding:6px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;cursor:pointer}
.sl-font-select:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.sl-font-select:disabled{opacity:.6;cursor:wait}
.sl-font-sample{margin:0;font-size:15px;line-height:1.8;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
.sl-font-status{margin:8px 0 0;font-size:12px;line-height:1.6;color:var(--dsw-alias-label-secondary)}
.sl-font-status[data-error=true]{color:var(--dsw-alias-state-error-primary)}
@media(max-width:700px){.sl-wrap{padding:24px 16px}.sl-list{grid-template-columns:1fr}.sl-controls{padding:14px}}
`;
    // Sidebar rows have no wrapper-style slot in DSH 0.2.1-rc.5.
    // Scope this compatibility skin to the inspected SidebarRoot navigation classes only.
    // The style element lives in a slot: unloading the plugin removes it without DOM mutation.
    const SIDEBAR_CSS = `
.wtg9ga_root .wtg9ga_panelList{gap:8px}
.wtg9ga_root .wtg9ga_panelList .wtg9ga_panelRow{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 55%,transparent);box-shadow:0 2px 7px color-mix(in srgb,var(--dsw-alias-bg-base) 35%,transparent);transition:background-color 160ms ease,border-color 160ms ease,box-shadow 160ms ease;color:var(--dsw-alias-label-primary)}
.wtg9ga_root:not(.wtg9ga_collapsed) .wtg9ga_panelList .wtg9ga_panelRow{width:100%;min-height:42px;padding:9px 12px}
.wtg9ga_root .wtg9ga_panelList .wtg9ga_panelRow:hover{border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 50%,var(--dsw-alias-border-l1));background:var(--dsw-alias-bg-layer-2);box-shadow:0 3px 10px color-mix(in srgb,var(--dsw-alias-bg-base) 45%,transparent)}
.wtg9ga_root .wtg9ga_panelList .wtg9ga_panelRow[aria-current="page"],
.wtg9ga_root .wtg9ga_panelList .wtg9ga_panelRow[aria-expanded="true"]{border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 70%,var(--dsw-alias-border-l1));background:color-mix(in srgb,var(--dsw-alias-brand-primary) 12%,var(--dsw-alias-bg-layer-1));box-shadow:inset 3px 0 0 var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary)}
.wtg9ga_root .wtg9ga_panelList .wtg9ga_panelRow:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
@media(prefers-reduced-motion:reduce){.wtg9ga_root .wtg9ga_panelList .wtg9ga_panelRow{transition:none}}
`;
    // Keep the sidebar root free of filters: Windows caption controls inside it
    // use position:fixed and must remain anchored to the viewport, not this root.
    // Blur only leaf surfaces; retain the translucent sidebar color and gradient.
    const GLASS_CSS = `
.wtg9ga_root{background:linear-gradient(150deg,color-mix(in srgb,var(--dsw-alias-brand-primary) 6%,transparent),transparent 65%),var(--dsw-specific-sidebar-fill)}
.wtg9ga_root .wtg9ga_panelList .wtg9ga_panelRow{backdrop-filter:blur(14px) saturate(.7);-webkit-backdrop-filter:blur(14px) saturate(.7)}
.sl-page .sl-row,.sl-page .sl-button{backdrop-filter:blur(14px) saturate(.7);-webkit-backdrop-filter:blur(14px) saturate(.7)}
`;
    // Original artwork colors, deliberately separate from UI theme tokens.
    const DECOR_PALETTES = {
      "collage": ["#C5AC73", "#99A68C", "#BE9689", "#98A9B5"]
    };
    // Semantic opt-in contract: no module imports, class-name coupling, or host layout rules.
    const INSPIRATION_SCOPE = '[data-stylelab-scope="inspiration"]';
    const MIST_STYLES = ['hud', 'circuit'];
    const OAT_DECORATION = Object.freeze({ palette: 'collage' });
    // One formatter shares tape artwork and palettes across navigation, preview and notes.
    function makeVintageCss(decoration, preview = false, inspiration = false) {
      const palette = DECOR_PALETTES[decoration.palette] || DECOR_PALETTES.collage;
      const scope = inspiration ? INSPIRATION_SCOPE : preview ? '.sl-preview[data-oat="true"]' : '.wtg9ga_root:not(.wtg9ga_collapsed)';
      const list = scope + (inspiration ? ' [data-stylelab-collection="notes"]' : preview ? ' .sl-preview-note-stack' : ' .wtg9ga_panelList');
      const row = list + (inspiration ? ' [data-stylelab-surface="note"]' : preview ? ' .sl-preview-note' : ' .wtg9ga_panelRow');
      const colors = palette.map((color, index) => {
        const nth = `:nth-child(4n+${index + 1})`;
        const selectors = preview || inspiration ? row + nth : row + nth + ',' + list + ' > ' + nth + ' .wtg9ga_panelRow';
        return `${selectors}{--sl-art:${color}}`;
      }).join('\n');
      return `
${inspiration ? row : scope}{--sl-art:${palette[0]}}
${inspiration ? '' : `${list}{gap:${preview ? '9px' : '14px'};padding-top:${preview ? '2px' : '6px'}}`}
${row}{position:relative;${inspiration ? 'border-color:var(--dsw-alias-border-l2);font-family:var(--dsh-font-family-text,inherit);' : 'isolation:isolate;overflow:visible;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);border-radius:5px 9px 6px 8px;'}background:repeating-linear-gradient(0deg,transparent 0 3px,color-mix(in srgb,var(--dsw-alias-border-l1) 14%,transparent) 3px 4px),linear-gradient(135deg,var(--dsw-alias-bg-layer-1),var(--dsw-alias-bg-base));box-shadow:1px 3px 0 color-mix(in srgb,var(--dsw-alias-brand-primary) 12%,transparent),0 4px 9px color-mix(in srgb,var(--dsw-alias-brand-primary) 7%,transparent);${inspiration ? '' : preview ? 'height:23px;padding:8px 15px 8px 6px' : 'min-height:44px;padding-right:12px'}}
${row}::before{content:"";display:block;pointer-events:none;position:absolute;z-index:1;width:${preview ? '21px' : inspiration ? '40px' : '46px'};height:${preview ? '7px' : inspiration ? '12px' : '14px'};${inspiration ? 'left:38%' : 'right:' + (preview ? '5px' : '22px')};top:${preview ? '-4px' : '-6px'};transform:${inspiration ? 'translateX(-50%) ' : ''}rotate(-7deg);background:repeating-linear-gradient(90deg,transparent 0 4px,color-mix(in srgb,var(--dsw-alias-bg-layer-1) 20%,transparent) 4px 5px),color-mix(in srgb,var(--sl-art) 80%,transparent);clip-path:polygon(3% 0,97% 0,94% 15%,100% 30%,94% 45%,100% 60%,94% 80%,98% 100%,2% 100%,6% 80%,0 60%,6% 45%,0 30%,6% 15%);box-shadow:0 1px 1px color-mix(in srgb,var(--dsw-alias-brand-primary) 12%,transparent)}
${colors}
${preview || inspiration ? '' : `${row} .wtg9ga_panelTitle{font-family:var(--dsh-font-family-text,inherit);letter-spacing:.3px}
${row}:hover{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-1)}
${row}[aria-current="page"],${row}[aria-expanded="true"]{border-color:var(--dsw-alias-brand-primary);box-shadow:inset 3px 0 0 var(--dsw-alias-brand-primary),1px 3px 0 color-mix(in srgb,var(--dsw-alias-brand-primary) 14%,transparent)}`}
`;
    }
    // Original, static corner artwork. Only leaf surfaces establish a local anchor.
    function makeMistCss(mode = 'hud', preview = false, inspiration = false) {
      const row = inspiration
        ? INSPIRATION_SCOPE + ' [data-stylelab-collection="notes"] [data-stylelab-surface="note"]'
        : preview ? '.sl-preview[data-glass="true"] .sl-preview-tech'
          : '.wtg9ga_root:not(.wtg9ga_collapsed) .wtg9ga_panelList .wtg9ga_panelRow';
      const artwork = mode === 'circuit'
        ? '<path d="M1 1h15l4 4h17l4-4h10M23 1h10l4 4h14" fill="none" stroke="black" stroke-width=".9" vector-effect="non-scaling-stroke"/><g fill="black"><circle cx="1" cy="1" r="1"/><circle cx="23" cy="1" r=".9"/><circle cx="51" cy="1" r="1"/><circle cx="51" cy="5" r=".8"/><circle cx="37" cy="5" r="2" opacity=".16"/></g>'
        : '<path d="M41 1h10v9" fill="none" stroke="black" stroke-width=".9" vector-effect="non-scaling-stroke"/><g fill="black"><circle cx="32" cy="2" r="2" opacity=".18"/><circle cx="32" cy="2" r=".8"/><g opacity=".24"><circle cx="4" cy="3" r=".4"/><circle cx="9" cy="3" r=".4"/><circle cx="14" cy="3" r=".4"/><circle cx="19" cy="3" r=".4"/><circle cx="4" cy="8" r=".4"/><circle cx="9" cy="8" r=".4"/><circle cx="14" cy="8" r=".4"/><circle cx="19" cy="8" r=".4"/></g></g>';
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 12" preserveAspectRatio="none">' + artwork + '</svg>';
      const mask = 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")';
      return `
${row}{position:relative}
${row}::before,${row}::after{content:"";display:block;position:absolute;pointer-events:none;z-index:1;width:${preview ? '24px' : '52px'};max-width:32%;height:${preview ? '7px' : '12px'};background:var(--dsw-alias-brand-primary);opacity:.52;mask:${mask} center/100% 100% no-repeat;-webkit-mask:${mask} center/100% 100% no-repeat}
${row}::before{top:3px;right:5px}
${row}::after{bottom:3px;left:5px;transform:rotate(180deg)}
`;
    }
    // Ruled paper and original notebook accents share one formatter in all three destinations.
    function makeNotebookCss(preview = false, inspiration = false) {
      const row = inspiration
        ? INSPIRATION_SCOPE + ' [data-stylelab-collection="notes"] [data-stylelab-surface="note"]'
        : preview ? '.sl-preview[data-notebook="true"] .sl-preview-notebook'
          : '.wtg9ga_root:not(.wtg9ga_collapsed) .wtg9ga_panelList .wtg9ga_panelRow';
      const step = preview ? 10 : 28;
      const rules = `repeating-linear-gradient(to bottom,transparent 0 ${step - 1}px,color-mix(in srgb,var(--dsw-alias-border-l2) 32%,transparent) ${step - 1}px ${step}px)`;
      const margin = `linear-gradient(90deg,transparent 0 ${preview ? 6 : 10}px,color-mix(in srgb,var(--dsw-alias-state-error-primary) 20%,transparent) ${preview ? 6 : 10}px ${preview ? 7 : 11}px,transparent ${preview ? 7 : 11}px)`;
      const artwork = '<path d="M2 0h13v21l-6.5-4.5L2 21z" fill="#9AAB96"/><path d="M4 2h9" stroke="#E9EBDD" stroke-width="1"/>'
        + '<rect x="40" y="0" width="12" height="8" rx="2" fill="#CCA5A0"/><rect x="55" y="0" width="12" height="7" rx="2" fill="#D1BD8D"/><rect x="70" y="0" width="12" height="9" rx="2" fill="#A8B9BC"/>';
      const image = 'url("data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 84 24">' + artwork + '</svg>') + '")';
      const canvas = inspiration ? '' : preview ? `
.sl-preview[data-notebook="true"] .sl-preview-main{background:${rules},var(--dsw-alias-bg-base)}
.sl-preview[data-notebook="true"] .sl-preview-rail{background:${rules},var(--dsw-specific-sidebar-fill)}
` : `
.wtg9ga_root{background:${rules},var(--dsw-specific-sidebar-fill)}
.sl-page[data-notebook="true"],${INSPIRATION_SCOPE}{background:${rules},var(--dsw-alias-bg-base)}
[data-conversation-content][data-conversation-region="chat"] > [data-conversation-scroll]{background-image:${rules}}
`;
      return `
${row}{position:relative;background:${margin},${rules},var(--dsw-alias-bg-layer-1);border-color:var(--dsw-alias-border-l2);font-family:var(--dsh-font-family-text,inherit)}
${row}::before{content:"";display:block;position:absolute;pointer-events:none;left:3px;top:6px;width:${preview ? '3px' : '5px'};height:calc(100% - 12px);max-height:60px;background:radial-gradient(circle at 50% 20%,var(--dsw-alias-bg-layer-2) ${preview ? '.6px' : '1.4px'},var(--dsw-alias-border-l2) ${preview ? '.8px' : '1.7px'},transparent ${preview ? '1px' : '2px'}),radial-gradient(circle at 50% 50%,var(--dsw-alias-bg-layer-2) ${preview ? '.6px' : '1.4px'},var(--dsw-alias-border-l2) ${preview ? '.8px' : '1.7px'},transparent ${preview ? '1px' : '2px'}),radial-gradient(circle at 50% 80%,var(--dsw-alias-bg-layer-2) ${preview ? '.6px' : '1.4px'},var(--dsw-alias-border-l2) ${preview ? '.8px' : '1.7px'},transparent ${preview ? '1px' : '2px'})}
${row}::after{content:"";display:block;position:absolute;pointer-events:none;left:38%;top:-1px;width:84px;max-width:40%;height:${preview ? '7px' : inspiration ? '14px' : '10px'};transform:translateX(-50%);background:${image} center top/100% 100% no-repeat}
${canvas}`;
    }
    // Pure and opt-in: an unknown/native theme emits no material, decoration or font layer.
    function makeInspirationCss(preference, decoration = { palette: 'collage' }, mistMode = 'hud') {
      const note = INSPIRATION_SCOPE + ' [data-stylelab-collection="notes"] [data-stylelab-surface="note"]';
      const composer = INSPIRATION_SCOPE + ' [data-stylelab-surface="composer"]';
      const control = INSPIRATION_SCOPE + ' [data-stylelab-surface="control"]';
      if (preference === THEMES[0].id) return makeVintageCss(decoration, false, true) + `
${composer},${control}{font-family:var(--dsh-font-family-text,inherit);background:var(--dsw-alias-bg-layer-1);border-color:var(--dsw-alias-border-l2)}
`;
      if (preference === THEMES[2].id) return makeNotebookCss(false, true) + `
${composer},${control}{font-family:var(--dsh-font-family-text,inherit);background:var(--dsw-alias-bg-layer-1);border-color:var(--dsw-alias-border-l2)}
`;
      if (preference === THEMES[1].id) return makeMistCss(mistMode, false, true) + `
${note},${composer}{font-family:var(--dsh-font-family-text,inherit);background:linear-gradient(135deg,color-mix(in srgb,var(--dsw-alias-brand-primary) 7%,transparent),transparent 65%),var(--dsw-alias-bg-layer-1);border-color:var(--dsw-alias-border-l2);box-shadow:inset 0 1px 0 var(--dsw-alias-border-l1),0 4px 12px color-mix(in srgb,var(--dsw-alias-bg-base) 24%,transparent);backdrop-filter:blur(14px) saturate(.7);-webkit-backdrop-filter:blur(14px) saturate(.7)}
${control}{font-family:var(--dsh-font-family-text,inherit);background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l2)}
`;
      return '';
    }
    function SidebarFrames() {
      return h('style', { 'data-stylelab-skin': 'sidebar-frames' }, SIDEBAR_CSS);
    }
    // Restrict Maple's English face so its built-in Chinese glyphs cannot override a chosen CJK face.
    // The actual font files stay unmodified; use only verified local official font names.
    const MAPLE_LATIN_RANGE = 'U+0000-2E7F,U+A000-ABFF,U+E000-F8FF,U+FB00-FB4F,U+FE20-FE2F,U+10000-1FFFF,U+F0000-FFFFD,U+100000-10FFFD';
    const MAPLE_LOCAL_FACES = [
      {"weight":400,"style":"normal","name":"Regular","postscript":"Regular"},
      {"weight":400,"style":"italic","name":"Italic","postscript":"Italic"},
      {"weight":500,"style":"normal","name":"Medium","postscript":"Medium"},
      {"weight":500,"style":"italic","name":"Medium Italic","postscript":"MediumItalic"},
      {"weight":600,"style":"normal","name":"SemiBold","postscript":"SemiBold"},
      {"weight":600,"style":"italic","name":"SemiBold Italic","postscript":"SemiBoldItalic"},
      {"weight":700,"style":"normal","name":"Bold","postscript":"Bold"},
      {"weight":700,"style":"italic","name":"Bold Italic","postscript":"BoldItalic"}
    ];
    const MAPLE_FONT_CSS = MAPLE_LOCAL_FACES.map(face => `@font-face{font-family:"Maple Mono NF CN Latin";src:local("Maple Mono NF CN ${face.name}"),local("MapleMono-NF-CN-${face.postscript}");font-weight:${face.weight};font-style:${face.style};font-display:swap;unicode-range:${MAPLE_LATIN_RANGE}}`).join('\n');
    function MapleFontFaces() {
      return h('style', { 'data-stylelab-font': 'maple-latin' }, MAPLE_FONT_CSS);
    }
    function Icon({ size = 22 }) {
      return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, 'aria-hidden': true },
        h('rect', { x: 3, y: 3, width: 18, height: 18, rx: 5 }),
        h('path', { d: 'M12 3v18M8 8l1.6 3.1L13 12l-3.4 1L8 16l-1.2-3L4 12l2.8-.9Z', fill: 'currentColor', stroke: 'none' }),
        h('circle', { cx: 17, cy: 7, r: 1, fill: 'currentColor', stroke: 'none' }));
    }
    return {
      inject: ['slots', 'theme', 'locale', 'remote', 'remote.settings', 'configForms'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register('stylelab', 'en', DICTS.en));
        ctx.effect(() => ctx.locale.register('stylelab', 'zh', DICTS.zh));
        for (const definition of THEMES) ctx.effect(() => ctx.theme.register(definition));
        const t = ctx.locale.bind('stylelab');
        let noteThemeSelection = () => {};
        ctx.effect(() => {
          const guard = createThemeRefreshGuard(ctx.theme, ctx.configForms.get('ui-theme'),
            listener => ctx.on('theme/change', listener), queueMicrotask);
          noteThemeSelection = guard.onSelection;
          return () => { noteThemeSelection = () => {}; guard.dispose(); };
        });
        // Only the two Mist variations need mutable, page-local selection state.
        let mistDecoration = 'hud';
        const mistListeners = new Set();
        const getMistDecoration = () => mistDecoration;
        const subscribeMistDecoration = listener => { mistListeners.add(listener); return () => mistListeners.delete(listener); };
        ctx.effect(() => () => mistListeners.clear());
        function setMistDecoration(value) {
          if (!MIST_STYLES.includes(value) || value === mistDecoration) return;
          mistDecoration = value;
          for (const listener of mistListeners) listener();
        }
        function useMistDecoration() {
          return React.useSyncExternalStore(subscribeMistDecoration, getMistDecoration);
        }
        function useThemeSnapshot() {
          const [snapshot, setSnapshot] = React.useState(() => ctx.theme.getTheme());
          React.useEffect(() => {
            const dispose = ctx.on('theme/change', setSnapshot);
            setSnapshot(ctx.theme.getTheme());
            return dispose;
          }, []);
          return [snapshot, setSnapshot];
        }
        function ThemeMaterial() {
          const [snapshot] = useThemeSnapshot();
          const mist = useMistDecoration();
          return h('style', { 'data-stylelab-skin': 'mist-glass' }, snapshot.preference === THEMES[1].id ? GLASS_CSS + makeMistCss(mist) + makeInspirationCss(snapshot.preference, undefined, mist) : '');
        }
        function OatVintage() {
          const [snapshot] = useThemeSnapshot();
          const choices = OAT_DECORATION;
          return h('style', { 'data-stylelab-skin': 'oat-vintage' }, snapshot.preference === THEMES[0].id ? makeVintageCss(choices) + makeInspirationCss(snapshot.preference, choices) : '');
        }
        function NotebookPaper() {
          const [snapshot] = useThemeSnapshot();
          return h('style', { 'data-stylelab-skin': 'notebook-paper' }, snapshot.preference === THEMES[2].id ? makeNotebookCss() + makeInspirationCss(snapshot.preference) : '');
        }
        function DecorationPicker({ value, styles, onChange = () => {}, themeName }) {
          return h('div', { className: 'sl-custom' },
            h('label', null, h('span', null, t('techDecoration')),
              h('select', { value, onChange: event => onChange(event.target.value), 'aria-label': t(themeName) + ' · ' + t('techDecoration') },
                styles.map(style => h('option', { key: style, value: style }, t(style))))));
        }
        function OatControls() {
          return h(DecorationPicker, { value: 'vintage', styles: ['vintage'], themeName: 'oat' });
        }
        function MistControls() {
          const mist = useMistDecoration();
          return h(DecorationPicker, { value: mist, styles: MIST_STYLES, onChange: setMistDecoration, themeName: 'mist' });
        }
        function NotebookControls() {
          return h(DecorationPicker, { value: 'pageglow', styles: ['pageglow'], themeName: 'notebook' });
        }
        function Preview({ definition, name }) {
          const choices = OAT_DECORATION;
          const mist = useMistDecoration();
          const isOat = definition.id === THEMES[0].id;
          const isNotebook = definition.id === THEMES[2].id;
          return h('div', { className: 'sl-preview', style: { ...definition.tokens, colorScheme: definition.colorScheme }, 'data-glass': definition.id === THEMES[1].id, 'data-oat': isOat, 'data-notebook': isNotebook, role: 'img', 'aria-label': t(name) + ' · ' + t('preview') },
            isOat ? h('style', null, makeVintageCss(choices, true)) : isNotebook ? h('style', null, makeNotebookCss(true)) : h('style', null, makeMistCss(mist, true)),
            h('div', { className: 'sl-preview-rail', 'aria-hidden': true },
              h('div', { className: 'sl-preview-mark' }),
              h('div', { className: 'sl-preview-note-stack' },
                [0, 1, 2].map(index => h('div', { className: isOat ? 'sl-preview-note' : isNotebook ? 'sl-preview-notebook' : 'sl-preview-tech', key: index }, h('div', { className: 'sl-preview-line' }))))),
            h('div', { className: 'sl-preview-main', 'aria-hidden': true },
              h('div', { className: 'sl-preview-head' }, 'DeepSeek Harness'),
              h('div', { className: 'sl-preview-chat' }, t('hello')),
              h('div', { className: 'sl-preview-reply' }, t('reply')),
              h('div', { className: 'sl-preview-input' },
                h('div', { className: 'sl-preview-line', style: { width: '52%' } }),
                h('span', { className: 'sl-preview-send' }, '↑'))));
        }
        function unwrapSettings(result) {
          if (result?.ok === false) throw new Error(result.error?.message || t('fontFailed'));
          return result?.ok === true ? result.value : result;
        }
        async function readFontNamespace() {
          const result = unwrapSettings(await ctx.remote.settings.describe());
          const namespace = result?.namespaces?.find(entry => entry.ns === 'ui-theme' || entry.ns === 'include:ui-theme');
          if (!namespace) throw new Error(t('fontUnavailable'));
          return { namespace, writable: result.writable === true };
        }
        function FontPicker() {
          const [snapshot] = useThemeSnapshot();
          const [writable, setWritable] = React.useState(false);
          const [saving, setSaving] = React.useState(false);
          const [draft, setDraft] = React.useState(null);
          const [error, setError] = React.useState('');
          const [attempt, setAttempt] = React.useState(0);
          const alive = React.useRef(true);
          React.useEffect(() => {
            alive.current = true;
            let current = true;
            readFontNamespace().then(result => {
              if (current) { setWritable(result.writable); setError(result.writable ? '' : t('fontUnavailable')); }
            }).catch(reason => { if (current) setError(reason.message || t('fontUnavailable')); });
            return () => { current = false; alive.current = false; };
          }, [attempt]);
          const saved = matchingFontLanguages(snapshot.fontFamilies);
          const chosen = draft || saved || { english: 'custom', chinese: 'custom' };
          const combined = composeFontLanguages(chosen.english, chosen.chinese);
          const previewFamily = combined ? combined.textFontFamily || 'var(--dsh-font-family-text-default, system-ui)' : snapshot.fontFamilies.text || 'inherit';
          const unchanged = saved?.exact && saved.english === chosen.english && saved.chinese === chosen.chinese;
          const englishLabels = { default: 'fontDefault', maple: 'fontMaple' };
          const chineseLabels = { default: 'fontDefault', maple: 'fontMaple' };
          async function saveFonts(choices) {
            if (saving) return;
            const patch = composeFontLanguages(choices.english, choices.chinese);
            if (!patch) return;
            setSaving(true); setError('');
            try {
              const { namespace, writable: mayWrite } = await readFontNamespace();
              if (!mayWrite) throw new Error(t('fontUnavailable'));
              const same = Object.keys(patch).every(field => normalizeFontList(namespace.value?.[field]) === normalizeFontList(patch[field]));
              if (!same) {
                // Both callers use the same native Host settingsController.update operation.
                const { textFontFamily, codeFontFamily, terminalFontFamily } = patch;
                unwrapSettings(await ctx.remote.settings.update(namespace.ns, { textFontFamily, codeFontFamily, terminalFontFamily }, namespace.revision));
              }
              if (alive.current) setDraft({ english: choices.english, chinese: choices.chinese });
            } catch (reason) {
              if (alive.current) setError(reason.message || t('fontFailed'));
            } finally {
              if (alive.current) setSaving(false);
            }
          }
          function languageSelect(language, label, labels) {
            return h('label', { className: 'sl-font-label' }, h('span', null, t(label)),
              h('select', { className: 'sl-font-select', value: chosen[language], disabled: saving || !writable, onChange: event => setDraft({ ...chosen, [language]: event.target.value }) },
                chosen[language] === 'custom' ? h('option', { value: 'custom', disabled: true }, t('fontCustom')) : null,
                FONT_LANGUAGES[language].map(item => h('option', { key: item.id, value: item.id }, t(labels[item.id])))));
          }
          function languageColumn(language, label, labels, sample, lang) {
            return h('div', { className: 'sl-font-language' },
              languageSelect(language, label, labels),
              h('p', { className: 'sl-font-sample', lang, style: { fontFamily: previewFamily } }, t(sample)));
          }
          return h('section', { className: 'sl-fonts', 'aria-label': t('fonts') },
            h('h2', { className: 'sl-font-heading' }, t('fonts')),
            h('div', { className: 'sl-font-controls' },
              languageColumn('english', 'fontEnglish', englishLabels, 'fontEnglishSample', 'en'),
              languageColumn('chinese', 'fontChinese', chineseLabels, 'fontChineseSample', 'zh-CN'),
              h('div', { className: 'sl-font-actions' },
                h('button', { className: 'sl-button', type: 'button', disabled: saving || !writable || !combined || unchanged, onClick: () => saveFonts(chosen) }, t('fontApply')),
                h('button', { className: 'sl-button', type: 'button', disabled: saving || !writable, onClick: () => saveFonts({ english: 'default', chinese: 'default' }) }, t('fontReset')))),
            saving || error ? h('p', { className: 'sl-font-status', role: 'status', 'data-error': Boolean(error) }, error || t('fontSaving')) : null,
            error && !writable ? h('button', { className: 'sl-button', type: 'button', onClick: () => setAttempt(value => value + 1) }, t('fontRetry')) : null);
        }
        function Panel() {
          React.useSyncExternalStore(ctx.locale.subscribe.bind(ctx.locale), ctx.locale.getSnapshot.bind(ctx.locale));
          const [snapshot, setSnapshot] = useThemeSnapshot();
          const [failed, setFailed] = React.useState(null);
          function choose(id) {
            try {
              noteThemeSelection(id);
              ctx.theme.setTheme(id);
              setSnapshot(ctx.theme.getTheme());
              setFailed(null);
            } catch (error) {
              console.error('[风格工坊] Theme change failed', error);
              setFailed(id);
            }
          }
          const options = [{ id: 'system', name: 'system' }, { id: THEMES[0].id, name: 'oat', definition: THEMES[0] }, { id: THEMES[1].id, name: 'mist', definition: THEMES[1] }, { id: THEMES[2].id, name: 'notebook', definition: THEMES[2] }];
          return h('section', { className: 'sl-page', 'aria-label': t('title'), 'data-notebook': snapshot.preference === THEMES[2].id },
            h('style', null, CSS),
            h('div', { className: 'sl-wrap' },
              h('h1', { className: 'sl-title' }, t('title')),
              h(FontPicker),
              h('div', { className: 'sl-list' }, options.map(option => {
                const selected = snapshot.preference === option.id;
                const label = t(failed === option.id ? 'error' : selected ? 'selected' : 'select');
                return h('article', { className: option.definition ? 'sl-row' : 'sl-row sl-default', key: option.id, 'data-selected': selected },
                  option.definition ? h(Preview, { definition: option.definition, name: option.name }) : null,
                  h('div', { className: 'sl-controls' },
                    h('h2', { className: 'sl-name' }, t(option.name)),
                    h('button', { className: 'sl-button', type: 'button', 'aria-pressed': selected, 'aria-label': label + ' · ' + t(option.name), 'data-error': failed === option.id, onClick: () => choose(option.id) }, label)),
                  option.id === THEMES[0].id ? h(OatControls) : null,
                   option.id === THEMES[1].id ? h(MistControls) : null,
                   option.id === THEMES[2].id ? h(NotebookControls) : null);
              }))));
        }
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'stylelab-maple-fonts', order: 80 }, MapleFontFaces));
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'stylelab-sidebar-frames', order: 90 }, SidebarFrames));
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'stylelab-mist-material', order: 91 }, ThemeMaterial));
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'stylelab-oat-vintage', order: 92 }, OatVintage));
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'stylelab-notebook-paper', order: 93 }, NotebookPaper));
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'stylelab', locale: 'stylelab' }, Panel));
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: 'stylelab', order: 20, label: () => t('title'), locale: 'stylelab' }, Icon));
      }
    };
  }
});
