# Maple Mono NF CN — optional local font

- Project: The Maple Mono Project Authors, [official repository](https://github.com/subframe7536/maple-font).
- Downloads: [official font site](https://font.subf.dev/zh-cn/download/).
- Local-name compatibility target: v7.9, `MapleMono-NF-CN-unhinted.zip` ([upstream release](https://github.com/subframe7536/maple-font/releases/tag/v7.9)).
- License: SIL Open Font License 1.1. The unmodified [upstream license](https://raw.githubusercontent.com/subframe7536/maple-font/v7.9/OFL.txt) is included as [OFL-Maple.txt](./OFL-Maple.txt).

No font binary, font source, installer or downloaded archive is included in this plugin. The plugin does not install or modify fonts and never loads them from a CDN. Users who want Maple must install the official `Maple Mono NF CN` family themselves, on each device displaying the GUI. Without it, normal CSS/system fallback applies; the selected font ID does not certify availability.

The plugin defines `Maple Mono NF CN Latin` as a local-only CSS alias for the official Regular/Medium/SemiBold/Bold faces and their italics (weights 400/500/600/700), using full and PostScript names. Its unicode-range excludes CJK glyphs so Chinese can be selected independently. This alias does not modify or redistribute font software and exists only while the plugin is active in the client. Font discovery and rendering depend on the client platform/browser; installation may require restarting the client.

Maple's license is separate from the plugin's MIT license. The included OFL text is provided for attribution and reference, not as a claim that Maple binaries are bundled or that the upstream project endorses this plugin.
