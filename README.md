# livedeck-sources

LiveDeck 官方订阅协议（`livedeck.manifest/v1`）的点播源示例与社区兼容迁移仓库，提供可跨 Windows / macOS / Linux / Android 运行的原生 `script_js`、`t4` 与 `cms` 订阅清单。

## 在 LiveDeck 中导入

在 LiveDeck 中打开 **订阅管理 → 添加订阅**，填入订阅地址：

```text
https://raw.githubusercontent.com/unifangg/livedeck-sources/main/manifest.json
```

> 本地调试时，也可直接在 LiveDeck 中导入本仓库的 [manifest.json](./manifest.json)。

## 源来源与移植说明

本仓库不单独罗列具体影视站点清单，所有内置源均移植或整理自以下开源社区生态，并统一重写为 LiveDeck 协议与沙盒接口：

- **Python Spider / TVBox / CatVodSpider 开源生态**：将原本依赖 Python 运行时、本地 HTTP 代理与 `BeautifulSoup` / `PyQuery` 的规则脚本，重写为无外部依赖的单文件 QuickJS `script_js` 插件（使用 `Host.http`、`Host.html`、`Host.crypto`、`Host.codec` 与 `Host.text` 原生桥接）。
- **`drpy` / `drpy2` 规则生态**：移植常见网页规则与多维筛选逻辑，直接使用 LiveDeck 内建的 `Host.html.pdfa` / `pdfh` / `pd` 与 `Host.text.extractJson` 解析管线。
- **标准 MacCMS V10 与 T4 公开接口**：以纯声明式 `cms` / `t4` 条目接入 `livedeck.manifest/v1`，并配合 `adRules` 进行 HLS 广告切片净化。

> 如果想学习如何从零编写 LiveDeck 点播源、直播扩展或将这些社区规则迁移到 LiveDeck，请访问 [LiveDeck 官方文档](https://livedeck-app.github.io/docs/)。

## 目录结构

- [manifest.json](./manifest.json)：`livedeck.manifest/v1` 订阅入口文件
- [scripts/](./scripts/)：原生 QuickJS 点播插件脚本源码（单文件 `.js`）
- [sdk/livedeck-sdk.d.ts](./sdk/livedeck-sdk.d.ts)：LiveDeck `Host` 沙盒 TypeScript 类型定义（供开发新插件补全与校验）
- [tools/check_manifest.py](./tools/check_manifest.py)：清单校验与接口测活工具

## 开发与校验

```bash
# 校验 manifest.json 与本地脚本引用
python tools/check_manifest.py

# 额外探测远端 CMS/T4 站点连通性
python tools/check_manifest.py --probe
```

## 扩展能力支持（点播弹幕与 `http_api`）

LiveDeck Manifest v1 采用 **`driver`（执行方式）× `capabilities`（提供能力）** 正交模型，并支持向前兼容扩展：

1. **独立的声明式弹幕源（`driver: "http_api"`）**：可在 `manifest.json` 的 `items` 中追加 `"capabilities": ["danmaku"]` 与 `"danmaku": { "protocol": "dandanplay", "priority": 100, "autoMatch": true }`，无需编写 JS 脚本即可对接 DandanPlay / 自建 `danmu_api`。
2. **随片自带时间轴弹幕（`play()` 多轨返回）**：`script_js` 插件可在 `play()` 返回对象中附加 `danmakuTracks` 数组及 `skip: { intro, outro, segments }`；详见 [sdk/livedeck-sdk.d.ts](./sdk/livedeck-sdk.d.ts)。
3. **自定义脚本弹幕源（`driver: "script_js"`）**：声明 `"capabilities": ["danmaku"]` 的脚本可按需实现 `searchDanmaku` / `getDanmaku`。
