# 风格工坊 · StyleLab

DeepSeek Harness 原生侧边栏插件，提供三套主题、配套装饰与独立的中英文字体选择。包名为 `@local/dsh-stylelab`，无第三方运行时 npm 依赖、无安装脚本、无外部网络资源。

## 安装与使用

需要 DeepSeek Harness `^0.2.1-rc.5`。在 Harness 插件管理器中安装本插件目录或发布包；不要手工修改宿主源码或 profile。React、模块加载器、主题、设置、远程服务和 slot 由 Harness 提供，本包不能作为独立网页运行，也不需要安装另一份 React。

在侧栏打开 **风格工坊**，选择主题：

- **燕麦暖笺 / Oat Parchment**：暖黄纸张与固定复古拼色胶带。
- **雾蓝微光 / Mist Glow**：雾蓝玻璃材质，装饰可选「星轨浮光」或「微型电路」。
- **素纸手札 / Ivory Notebook**：米白横线纸、页边线与「书页拾光」（书签、索引和装订孔）。
- **默认**：原生跟随系统外观，不更改字号或字体。

主题覆盖 14 个公开颜色令牌。装饰不参与点击，保留原生导航、聊天布局及消息/代码背景。模糊仅施加于叶级表面，侧栏根容器不添加滤镜，以免改变固定窗口控件的定位参照。

第三方主题与雾蓝装饰仅在当前页面运行时生效；整页刷新回到已保存的原生外观，装饰恢复默认。设置同步时，主题保护使用公开 `configForms` 快照及受控微任务恢复当前仍注册的自定义主题；显式原生外观选择、真实持久偏好变化和卸载优先。插件不会写入持久外观或额外存储。

## 字体与可移植性

中英文字体各有 **系统默认** / **Maple Mono NF CN** 两个选项，可独立组合、预览后应用。恢复默认仅清空原生 UI、代码、终端的三个字体字段，不改变主题、字号或其他设置。字体通过宿主原生设置服务按最新 revision 合并并持久保存；冲突由宿主拒绝，不盲目重试。未知已有字体保留为「自定义」，不会在读取或启用时覆盖。

**Maple 是可选的本机依赖，不随包分发，也不会自动下载、安装或探测安装状态。** 需要此效果时，请从 [Maple Mono 官方项目](https://github.com/subframe7536/maple-font) / [官方下载页](https://font.subf.dev/zh-cn/download/) 自行安装 `Maple Mono NF CN`。本插件本地名称适配 Maple v7.9 的 400/500/600/700 正体和斜体；其他版本或浏览器可能有不同的字体名称或本地字体访问限制。安装后可能需要重启桌面客户端或浏览器。

网页远程连接 Harness 时，字体必须安装在**浏览器所在设备**，仅服务器安装不够。字体缺失时按 CSS 字体栈及浏览器默认字体回退，选择器仍可保存 Maple，并不表示字体已成功加载。系统/系统组合清空覆盖，使用宿主跨平台默认值；混合组合的 `Segoe UI`、`Consolas`、`Microsoft YaHei UI` 回退名面向 Windows，其他系统缺少这些字体时使用浏览器回退，不保证相同排版。

英文 Maple 使用纯 `local()` 的 `Maple Mono NF CN Latin` CSS 别名，排除中日韩字符，避免抢占独立的中文选择。别名不修改字体文件，需要插件在该客户端保持启用。停用后保留宿主字体设置，但别名消失；中英文均为 Maple 的组合仍包含真实 Maple 家族，其余组合可能改变外观。需要卸载时可先恢复默认。无需相邻字体源码目录、安装路径、符号链接或额外构建资源。

代理工具 `stylelab_font` 提供 `get`、`set`（预设）、`set_languages`（独立语言）；有效 ID 均只有 `default` / `maple`。旧公开子路径 `fonts`、`font-combinations`、`maple-fonts` 继续映射到当前同一实现，旧多字体 ID 不再接受；已保存的外部字体字符串不迁移、不清除。

## 可复用表面契约

其他插件可通过语义属性选择接收主题材质，不需要导入本插件：

```html
<section data-stylelab-scope="inspiration">
  <form data-stylelab-surface="composer">…</form>
  <div data-stylelab-collection="notes">
    <article data-stylelab-surface="note">…</article>
  </div>
  <button data-stylelab-surface="control">…</button>
</section>
```

只有作用域内 notes 集合下的 note 卡片获得装饰；composer/control 只跟随材质或令牌。容器不接管布局。note 的 `::before` / `::after` 留给非交互主题装饰，使用方保留卡片原有尺寸、间距与必要的可见溢出；字体继承 `--dsh-font-family-text`。默认/未知主题不输出这层材质。

## 兼容边界与卸载

侧栏外观兼容层使用 DSH 0.2.1-rc.5 的局部导航类名，因为宿主暂无行容器样式扩展接口。升级后类名变化可能令外观失效，需要适配。手札聊天纹理只匹配语义聊天滚动容器。主题保护依赖当前公开作用域接口及设置采用语义；宿主升级需重新验证模型切换、原生外观选择、字体保存与卸载。

Cordis/slot effect 在停用时清理面板、字典、主题注册、样式和事件监听；原生主题运行时负责回退。不会卸载系统字体或自动清除用户已保存的原生字体设置。本包不创建独立状态文件，也不访问宿主 checkout/profile 文件。

## 开发与验证

需要 Node.js **22.14 或更新版本**及 pnpm 11。从源码仓库的本插件目录执行；安装步骤仅校验空依赖锁文件，不下载第三方包：

```sh
pnpm install --frozen-lockfile
pnpm run build
pnpm test
pnpm run check
pnpm pack
```

源码已是宿主可直接加载的 JavaScript；`build` 做语法、资源和独立包依赖校验，不生成 `dist`，不编译或修改宿主。`test` 使用内置 `node:test`，只运行包内测试；`check` 合并两者。`prepack` 在打包前再次执行完整校验。发布前可另运行 `npm pack --dry-run` 检查白名单，无需生成归档。

测试覆盖字体组合/原生设置合并/兼容导出、本地字体声明、主题对比度、材质作用域、装饰、主题恢复与卸载语义。纯函数及领域服务测试不依赖运行中宿主，不安装字体、不写设置、不模拟 DOM；它们不能替代真实客户端的字体渲染与视觉验收。测试和构建脚本均随包发布，可在独立目录再次校验。

## 许可

插件代码、原创 SVG 图标及 CSS 装饰按 [MIT](./LICENSE) 发布，著作权归 StyleLab contributors。Maple Mono 为可选外部字体，按 SIL Open Font License 1.1 授权，非本插件 MIT 的一部分。包内保留 [来源说明](./fonts/maple-NOTICE.md) 和 [上游许可全文](./fonts/OFL-Maple.txt)，不包含字体二进制或第三方 npm 代码。
