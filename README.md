# 「哨兵 / Sentinel」· DeepSeek Harness 确认提醒插件

> 任意工作区、任意会话需要你确认时 —— 审批/越权、文件修改、`ask_user_question` 提问 ——
> 哨兵会在 **DSH 右下角逐条弹出紧凑提醒卡片**（不弹 Windows 系统通知），可配置弹出动画与提示音。
> 点「去处理」：卡片立即消失并跳到对应会话，**左下角（工作区列表下方、头像上方）** 显示「✅ 提示有效，正在处理」，5 秒后淡出。
> 30 秒没处理，**只有那一条**会逐级放大、提示音换成更急迫的升级音。
> 点了「去处理」后如果 10 秒内**完全没有操作**（滚动/点击/按键都算在阅读），会再提醒一次并标注「二次提醒」。
>
> **哨兵只负责提醒，绝不替你做任何决定。审批与提问必须由你本人确认。**

## 功能

- **只在 Harness 内提醒**：不使用任何系统/Windows 通知 API；提醒 = 右下角卡片 + 提示音 + 窗口标题提示。
- **框架定位**：客户端测量对话区，卡片右贴滚动条左缘、底边贴对话栏底部、顶边不超过「对话/轨迹」下方横线；**初始卡出现在最底部，新卡依次把旧卡向上顶**（显示序号自上而下 1→2→3，出现顺序自下而上）。
- **两段式缩放（取消折叠）**：条数较少时保持自然大小；高度不够时先尝试保持全部文本、只压缩卡片高度；当压缩到最小全文本高度仍放不下时，**所有卡片同时切换为“紧凑黄条”**——深色底 + 亮黄描边的凸显样式，只显示「第几次 · 项目 · 第几级」，不显示选项按键；整体高度骤减并向下坍缩，保证每个提醒都能看到。
- **Mac Dock 式悬停**：鼠标划过某条紧凑黄条时，该条恢复自然大小并显示完整文本与两个按钮，其余提醒自动保持紧凑；鼠标离开后自动坍缩回黄条。文字大小在压缩/恢复过程中保持不变；升级放大时字体随卡片一起放大。
- **不遮挡底部输入框/原生审批面板**：提醒框架的底边自动停在输入框（或审批面板）上沿之上，原生面板的文字和「允许一次 / 拒绝」等按钮完整露出；不再对会话历史里的旧审批按钮绘制高亮框。
- **升级等级在紧凑模式下也逐级醒目**：等级越高，黄条越高、文字越大、描边越粗、颜色越亮（1→2→3… 级依次变为琥珀→橙→红），升级瞬间该条还会**抖动约 3 秒**；尺寸与文字同步放大，不会被裁切。- **不遮挡原生审批按钮**：卡片不移动；检测到「允许一次 / 拒绝」被卡片覆盖时，在所有卡片**上方**绘制青色高亮环，点击穿透，可直接点到原生按钮。
- **逐条到达**：新提醒按顺序从底部出现，默认间隔 0.7s（可调）；一个待确认事件只生成一张提醒卡（Host 与本地兜底数据统一去重）。
- **去处理一定跳转**：点某条的「去处理」只收起该条并保留其它卡（含折叠卡），同时一定跳到对应会话；跳转前保存视图状态，页面切换后其它提醒仍保持，之后新提醒照常弹出、折叠、升级。
- **点「去处理」**：该卡立即收起 → **左下角**（工作区列表下方、头像上方）「提示有效，正在处理」显示 5 秒后淡出。
- **30 秒分级升级（按条目独立）**：到点后该条卡片整体放大——**文字和卡片一起等比放大**，排版占位同步变大，不重叠；升级音更急迫更响。
- **二次提醒（独立于升级，外观/声音明显不同）**：点「去处理」后若 10 秒内没有任何操作，则重新弹出该条 —— **红色警示卡片 + 「⚠ 二次提醒」横幅 + 双响提示音**；若被折叠会自动展开高亮；有滚动/点击/按键等操作时不打扰。
- **测试提醒**：设置页按钮按**默认 3 秒间隔自动连续弹 3 条**（可点按钮随时重放），用于验证弹出顺序与二次提醒。
- **全部设置都在「插件」里**：设置页注册在 Plugins 页的哨兵 bundle 上，通过官方 Host Config（volatile 字段）保存到 profile 的 `cordis.patch.yml`，改完热生效；无任何浮动设置面板/常驻按钮。
- **可配置**：弹出动画（6 种）、逐条间隔、自定义动画图片（网图 URL 或本地图片/GIF）、首次提示音（6 种）、音量、自定义提示音（URL 或本地音频）、升级开关/间隔/级数/升级音、二次提醒、标题提示、提醒品牌名。

## 安装（推荐：Plugins 页）

DSH 侧边栏 → **Plugins** → **Install / Add plugin**：

- 已发布后：填入包名 `dsh-approval-notifier`（或从插件市场 Discover 一键安装）。
- 本地/离线：填 tarball 的绝对路径（见下方“打包”），或开发目录的绝对路径。
- 安装后出现在 **Installed plugins**：可启停、点开查看配置页；卸载用 bundle 页的 **Remove**（官方管理器会同时清理 profile 依赖与选择项）。

安装/卸载、启停、设置全部由官方插件管理完成，不需要手工改配置。

## 设置在哪里

**Plugins → Installed plugins → 哨兵**（bundle 页）里的配置表单。字段保存在 profile `cordis.patch.yml` 的
`- id: dsh-approval-notifier` 配置覆盖里（官方 Host Config），保存后 HMR 立即生效。

| 字段 | 默认 | 说明 |
|---|---|---|
| 提醒品牌名 | 哨兵 | 通知/标题里显示的名字 |
| 弹出动画 / 逐条间隔 | 向上弹出 / 700ms | 默认从底部向上弹出（6 种预设 + 预览） |
| 自定义动画图片 | 无 | 网图 `https://…` 或本地图片/GIF 上传 |
| 首次提示音 / 音量 | 叮咚 / 0.6 | 6 种预设 + 试听；可换自定义 URL/本地音频 |
| 30 秒升级 | 开 / 30s / 5 级 / 急促警报 | 仅放大该条；升级音可单独选/自定义 |
| 二次提醒 | 开 / 10s | 点去处理后无操作才触发，标注「二次提醒」 |
| 标题提示 | 开 | 窗口标题闪烁待确认数量 |

本地素材上传保存在 `$DSH_HOME/approval-notifier/assets/`（图片 ≤3MB、音频 ≤5MB，按文件头校验），
最多 20 个；`$DSH_HOME` 默认是 `~/.dsh`。

## 行为细节

1. **右下角卡片**：宽 `min(390px, 100vw-36px)` 的紧凑小卡片（第一版尺寸），多条向上堆叠，容器限高滚动。
2. **去处理**：卡片 0.18s 收起动画后移除；跳到会话；左下角绿色提示 `✅ 提示有效，正在处理`，5s 后 300ms 淡出。
3. **二次提醒判定**：点击去处理时记录时间；10s 后若请求仍 pending、页面可见、且期间没有任何
   pointermove/pointerdown/wheel/scroll/keydown/touchstart/focus 事件，则重新显示该卡并带「二次提醒」徽标、
   播放一次普通提示音、重新起算 30s 升级时钟；期间有任何操作则不提醒。每次“去处理”最多一次。
4. **30 秒升级**：按条目独立计时放大（每级 +6%，封顶 +30%）并播放升级音（音量逐级增加）；与二次提醒无重合。
5. **HMR 重载**会重置内存中的“已点开/二次提醒”状态，但审批本身不受影响。

## 开发

Host 半通过宿主提供的 `@deepseek-ai/schemastery`（标准 peer 依赖，运行时由 DSH 解析）声明官方 Config 表单。
在本仓库直接跑测试前：

```bash
npm install                        # 或：node tools/copy-runtime-deps.mjs（用本机 DSH 运行时离线复制依赖）
```

```bash
node selftest.mjs                    # 144 项自检（元数据/Config/路由/素材/布局与安全守卫）
node tools/dev-install.mjs --debug   # 仅开发：按官方 manager 写法装进 desktop profile，并开启诊断 + /debug/pending 假提醒路由
node verify-live.mjs                 # 对运行中的 Host 做实时验证（需 --debug）
node tools/dev-uninstall.mjs         # 仅开发：移除本地测试安装
```

诊断（仅 `debug: true` 时）：`$DSH_HOME/approval-notifier/status.json`，其中
`stats.clientPolls`、`stats.lastClientDiag`（含 `page=` 表示 Plugins 配置页已注册、`stage=`、`second=`）、
`recent` 里有 `client/opened`、`client/escalated`、`client/second-reminder` 等动作回执。

## 打包与上架

```bash
node selftest.mjs             # 167 项自检
node tools/package.mjs        # 自检 + npm pack → dist/dsh-approval-notifier-<version>.tgz + SHA256
npm login && npm publish --access public
```

- 发布后别人即可在 **Plugins → Add plugin** 输入 `dsh-approval-notifier` 安装；
- 收录到插件市场（awesome-dsh-plugin / Discover）的完整步骤、环境要求、截图与更新流程见 [docs/MARKET.md](docs/MARKET.md)；
- 市场条目模板：[market/awesome-dsh-plugin-entry.yml](market/awesome-dsh-plugin-entry.yml)；仓库截图声明：[screenshots.json](screenshots.json)。
- 本仓库**不会**自动发布任何内容；`dist/*.tgz` 也可直接用于 Plugins 页的本地 tarball 安装。

## 结构

```
dsh-approval-notifier/
├─ package.json            # bundle + client 声明、engines.dsh、icon、files、keywords
├─ cordis.patch.yml        # bundle 补丁：插入唯一 Host row（id 即官方设置命名空间）
├─ lib/host.js             # Host 半：观察两个 waterfall + pending/ack/assets 路由 + volatile Config
├─ client/client.js        # 浏览器半：右下角卡片、左下提示、30s 升级、二次提醒、Plugins 配置页
├─ locale/{zh,en}.json     # Plugins 卡片/市场展示用的 meta
├─ icon.svg / LICENSE / CHANGELOG.md / README.md
├─ assets/                 # 市场截图 + 180px 图标（GitHub 仓库用，不打进 npm 包）
├─ market/                 # awesome-dsh-plugin 收录条目模板
├─ screenshots.json        # 市场截图清单（仓库根）
├─ selftest.mjs / verify-live.mjs
├─ tools/{package,market-entry,dev-install,dev-uninstall}.mjs + make-market-assets.py
└─ docs/MARKET.md
```

## 限制

- 覆盖当前这个 DSH Host 进程内的所有工作区/会话（桌面 App 只有一个 Host）。
- App 完全退出时不提醒；窗口最小化时卡片仍在 Harness 内，恢复窗口即可见。
- “阅读”判定基于输入活动（滚动/指针/按键/触摸）；纯静止阅读按“无操作”处理，这是需求定义的规则。
- 二次提醒的状态保存在页面内存里，HMR/刷新会重置。
