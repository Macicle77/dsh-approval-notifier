# 上架插件市场 · 操作手册（awesome-dsh-plugin / Discover）

「哨兵 / Sentinel」(`dsh-approval-notifier`) 的发布路径：**npm 包（推荐）+ GitHub 仓库 + awesome-dsh-plugin 收录 PR**。
npm 包发布后，别人即可在 DSH 的 Plugins 页直接安装；市场收录只是增加发现入口。
本仓库**不会**自动发布或提 PR。

## 0. 环境准备

| 需要 | 说明 |
|---|---|
| Node.js ≥ 20 + npm | 打包、自检、`npm publish`（本机 `D:\Node` 或 DSH 内置 node 均可，但建议用普通终端） |
| npm 账号 | 已注册并验证邮箱；建议开启 2FA（发布时需要 OTP）；包名 `dsh-approval-notifier` 目前未被占用 |
| GitHub 账号 + git | 收录要求项目在 GitHub 上，且仓库**创建满 1 天**、添加 `dsh-plugin` topic |
| 网络 | npm registry；提交 PR 需要 GitHub 访问（中国网络可给 npm/pnpm 配镜像） |
| 可选 | 截图（1–8 张 PNG/JPG/WEBP）与 180px 方形图标 |

## 1. 元数据已填好（发布前核对）

`package.json` 中现在已填写：

- `author`: `macicle <shibuqingmu@sina.com>`；
- `repository`: `git+https://github.com/Macicle77/dsh-approval-notifier.git`；
- `homepage` / `bugs`: 同一仓库。

> 如果你的 GitHub 账号或仓库名不是 `Macicle77/dsh-approval-notifier`，发布前把这三处和 `market/awesome-dsh-plugin-entry.yml` 里的地址一起改掉即可。

已处理的兼容性：

- `engines.dsh`: `>=0.2.1-rc.1 <0.2.2-0 || >=0.2.2-rc.1 <0.3.0-0`（覆盖当前 DSH 0.2.2-rc.1，以及 0.2.1 预发布线；升级 DSH 后需追加新分支）；
- `peerDependencies`: `@deepseek-ai/cordis: ^4.0.5`、`@deepseek-ai/schemastery: ^3.18.5`（宿主提供，声明为可选 peer，避免预发布版本被 node-semver 静默排除）。

## 2. 本地检查与打包

```bash
cd dsh-approval-notifier
node selftest.mjs          # 167/167（元数据、Config、路由、素材、静态守卫）
node tools/package.mjs     # 自检 + npm pack → dist/dsh-approval-notifier-<version>.tgz
```

确认 tarball 内容（应只有 `package/lib/…`、`package/client/…`、`package/locale/…`、`package.json`、`cordis.patch.yml`、`icon.svg`、README/LICENSE/CHANGELOG）：

```bash
tar -tzf dist/dsh-approval-notifier-2.0.0.tgz
```

> 发布前建议在**另一个 DSH profile**（或另一台机器）用 Plugins → Add plugin → tarball 绝对路径安装一次，确认能弹出提醒、配置页能保存。

## 3. 发布到 npm（必做，用户才能按包名安装）

```bash
npm login                 # 浏览器/终端登录；如开启 2FA 会要求 OTP
npm publish --access public
npm view dsh-approval-notifier version
```

注意：

- 版本遵循 SemVer：修 bug 用 `2.0.1`，新功能用 `2.1.0`；`package.json` 的 `version` 必填且与 tag 一致；
- 首次发布是 `2.0.0`，之后每次改完都要先 bump 版本再 `npm publish`；
- 如果发布失败提示包名被占用，可改用 `@<你的scope>/dsh-approval-notifier`，同时更新 README/市场条目里的名字；
- npm 发布后用户即可：**Plugins → Add plugin → 输入 `dsh-approval-notifier`** 安装（无需等市场收录）。

## 4. 把源码推到 GitHub

```bash
cd dsh-approval-notifier
git init
git add .
git commit -m "Sentinel 2.0.0"
git remote add origin https://github.com/Macicle77/dsh-approval-notifier.git
git push -u origin main
```

- 仓库根必须有 `package.json`（含 `dsh.bundle`）与 `cordis.patch.yml`；
- 加 GitHub topic **`dsh-plugin`**（Settings → Topics）；
- 仓库需创建满 1 天后再提交收录 PR（CI 自动检查）；
- 可选：仓库根放 `screenshots.json`（本目录已生成，引用 `assets/screenshot-*.png`）与 `assets/icon-180.png`。

## 5. 提交 awesome-dsh-plugin 收录

DSH 插件市场（dshmarket / Discover）的默认目录来自 **awesome-dsh-plugin**；收录方式是向该仓库提 PR，**一个插件一个 YAML 文件**：

1. Fork `awesome-dsh-plugin/awesome-dsh-plugin`；
2. 新增 `data/plugins/Macicle77__dsh-approval-notifier.yml`（本仓库已准备模板 `market/awesome-dsh-plugin-entry.yml`，直接复制即可）：

```yaml
url: https://github.com/Macicle77/dsh-approval-notifier
name: Macicle77/dsh-approval-notifier
category: notify
description:
  en: 'Sentinel: one compact reminder per pending confirmation in any DeepSeek Harness workspace or session, with configurable animation, sound, per-item escalation and a second reminder. Only reminds — it never answers for you.'
  zh: '哨兵：任意工作区/会话需要确认时逐条提醒，可配置动画与提示音，支持按条升级与二次提醒；只提醒，绝不替你做决定。'
icon: https://raw.githubusercontent.com/Macicle77/dsh-approval-notifier/main/assets/icon-180.png
```

3. 按 [contributing.md](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/contributing.md) 提交 PR（一个 PR 最多 3 条；描述必须与代码一致，不要营销词）；
4. CI 会检查：`dsh.bundle` 声明、仓库年龄、README 生成、格式等；通过后维护者合并，网站与 Discover 目录自动更新。

可用的 `category` 中与本插件最贴合的是 **`notify`**（不要选 `ui` 除非只做视觉）。

## 6. Discover 索引源（用户侧）

DSH 0.2.1+：Plugins → Discover → **Index sources** 添加：

```
https://cdn.jsdelivr.net/npm/dsh-plugin-catalog/index.json
```

目录由 awesome-dsh-plugin 数据生成，收录后自动出现在 Discover；用户不需要手动加源（视其配置而定）。

## 7. 更新版本

1. 改完代码 → `node selftest.mjs` → bump `version` → `node tools/package.mjs`；
2. `npm publish`；
3. 收录信息（YAML 描述、截图）更新时，只改**自己的** `data/plugins/<owner>__<repo>.yml` 并重新提 PR（不要手改生成的 README）；
4. 升级 DSH 兼容性时同步改 `engines.dsh`（给新预发布线加显式 `||` 分支，否则 node-semver 会静默排除）。

## 8. 安全与审核提示

- 插件只观察 `approval/request` 与 `user-questions/request` 并透传，绝不自动允许/拒绝；不访问网络、不读取审批结果；
- 市场收录**不是安全审计**；README 中已声明“只提醒、不代决”；
- 发布前检查 `dist/*.tgz` 不包含 `.dsh-debug/`、`node_modules/`、测试脚本等开发文件（`files` 白名单已限制）。
