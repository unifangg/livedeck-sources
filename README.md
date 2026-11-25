# livedeck-sources

LiveDeck 官方协议（`livedeck.manifest/v1`）精选影视订阅源仓库，包含从原 Python / `drpy` 爬虫精选移植的 **50 个原生 `script_js` 插件**，以及实测可用的 **3 个 `t4` + 3 个 `cms` 站点**（共 **56 个影视源**，全部经过 LiveDeck 真实 QuickJS 沙盒 / 远端接口实测通过，仅收录正规非成人影视内容）。

## 在 LiveDeck 中导入

1. 将本仓库推送至 GitHub：`unifangg/livedeck-sources`（`main` 分支）。
2. 在 LiveDeck 中打开 **订阅管理 → 添加订阅**，填入订阅地址：

```text
https://raw.githubusercontent.com/unifangg/livedeck-sources/main/manifest.json
```

> 本地调试时，也可直接在 LiveDeck 中导入本地 [manifest.json](./manifest.json)。

## 目录结构

- [manifest.json](./manifest.json)：`livedeck.manifest/v1` 订阅入口（含 **50 个原生 `script_js`** + **3 个 `t4`** + **3 个 `cms`**）
- [scripts/](./scripts/)：原生 QuickJS 插件源码（单文件 `.js`，跨 Windows / macOS / Linux / Android 原生运行）
- [sdk/livedeck-sdk.d.ts](./sdk/livedeck-sdk.d.ts)：LiveDeck `Host` 沙盒 TypeScript 类型定义（供开发新插件补全与校验）
- [tools/check_manifest.py](./tools/check_manifest.py)：清单校验与 CMS / T4 测活工具

## 收录清单（共 56 个）

### 1. 原生 `script_js` 综合影视 / 高清路线（35 个）

| 名称 | 脚本 | 筛选 | 说明 |
| :--- | :--- | :---: | :--- |
| 枫叶影视 | [fengye.js](./scripts/fengye.js) | - | SHA1+MD5 接口签名、多清晰度流 |
| 蛋蛋赞影院 | [dandanzan.js](./scripts/dandanzan.js) | - | 电影 / 剧集 / 综艺 / 动漫直连 |
| 片库影视 | [pianku.js](./scripts/pianku.js) | - | 双域名故障转移 + 直连探测 |
| 欧乐影院 | [oulevod.js](./scripts/oulevod.js) | - | JSON API + 多线直连 |
| 独播库 | [duboku.js](./scripts/duboku.js) | - | 签名加密接口、海内外热门剧集 |
| 网飞猫 | [ncat.js](./scripts/ncat.js) | - | SHA1 PoW 校验、多域名兜底 |
| 可可影视 | [keke.js](./scripts/keke.js) | - | 双步搜索令牌、高清直链 |
| 飞流视频 | [feiliu.js](./scripts/feiliu.js) | 是 | JSON 接口、多条件筛选 |
| 威视TV | [weishi.js](./scripts/weishi.js) | - | `player_aaaa` 解析直链 |
| 大马猴影视 | [damahou.js](./scripts/damahou.js) | - | 聚合线路排序与解码接口 |
| 奈非工厂 | [naifei.js](./scripts/naifei.js) | - | 多线路蓝光播放 |
| 6080影视 | [yy6080.js](./scripts/yy6080.js) | 是 | 类型 / 年份 / 地区筛选 |
| 袋鼠影视 | [daishu.js](./scripts/daishu.js) | - | 全分类覆盖 + 异步片单解析 |
| 蝶卡影视 | [dieka.js](./scripts/dieka.js) | 是 | 分类筛选 + Base64 播放线 |
| 百花影院 | [baihua.js](./scripts/baihua.js) | 是 | AES-ECB 解密直连流 |
| 一起影视 | [yiqi.js](./scripts/yiqi.js) | 是 | 多条件筛选 + 自动重试搜索 |
| ZIP0影视 | [zip0.js](./scripts/zip0.js) | - | 批量并发聚合 HTTP 线路 |
| 八戒影视 | [bajie.js](./scripts/bajie.js) | - | 动态域名引导 + 并发推荐 |
| 新荐片 | [xinjianpian.js](./scripts/xinjianpian.js) | 是 | 直连 `.m3u8` 路线优先 |
| PPnix影视 | [ppnix.js](./scripts/ppnix.js) | - | 1080P HLS 直出 |
| EcoHub影视 | [ecohub.js](./scripts/ecohub.js) | 是 | MacCMS V10 JSON 接口 |
| 开端影视 | [kaiduan.js](./scripts/kaiduan.js) | - | AES-128-CBC 响应解密 |
| 热播影视 | [rebo.js](./scripts/rebo.js) | 是 | MD5 接口签名 + 解析直链 |
| 瓜子影视 | [guazi.js](./scripts/guazi.js) | 是 | RSA + AES 签名、多清晰度 |
| UVod影视 | [uvod.js](./scripts/uvod.js) | 是 | AES-256-CBC + RSA 加密 API |
| 爱看机器人 | [ikanbot.js](./scripts/ikanbot.js) | 是 | 多路线直连 `.m3u8` |
| 饭团影视 | [fantuan.js](./scripts/fantuan.js) | 是 | 年份筛选 + `player_aaaa` 解析 |
| 影牛影视 | [moovie.js](./scripts/moovie.js) | - | HTMX 异步检索与播放解析 |
| 看戏影视 | [kanxi.js](./scripts/kanxi.js) | 是 | 类型 / 地区 / 年份筛选 |
| 123TV | [tv123.js](./scripts/tv123.js) | 是 | 分类筛选 + 直连 `.m3u8` |
| 飞快TV | [feikuai.js](./scripts/feikuai.js) | - | 多域名容灾 + 加密解码 |
| 247看 | [kan247.js](./scripts/kan247.js) | - | JSON API + 直连线路筛选 |
| 麻雀视频 | [maque.js](./scripts/maque.js) | - | AES-128-CBC 解密播放链接 |
| 韩剧大大 | [hanjudada.js](./scripts/hanjudada.js) | - | 27 年份分类 + 全站搜索 |
| 新韩剧网 | [xinhanju_js.js](./scripts/xinhanju_js.js) | - | 韩国剧影综漫 |

### 2. 原生 `script_js` 专项 / 官方平台 / 短剧（15 个）

| 名称 | 脚本 | 筛选 | 说明 |
| :--- | :--- | :---: | :--- |
| 韩剧网 | [hanjuwang.js](./scripts/hanjuwang.js) | - | 韩剧 / 热播剧集多线播放 |
| 韩剧巴士 | [hanjubashi.js](./scripts/hanjubashi.js) | 是 | 动态筛选 + 韩剧 / 电影 / 动漫 |
| AcFun番剧 | [acfun.js](./scripts/acfun.js) | 是 | 番剧 / 动漫 / 漫剧（多分辨率 HLS） |
| 哔哩哔哩 | [bilibili.js](./scripts/bilibili.js) | 是 | 匿名 `buvid3`、MP4 + DASH 音画分离流 |
| 搜狐视频 | [sohu.js](./scripts/sohu.js) | 是 | 官方多码率 HLS / MP4 |
| 央视综艺 | [cctv_variety.js](./scripts/cctv_variety.js) | - | 46 个央视综艺栏目高清流 |
| 网易公开课 | [netease_pd.js](./scripts/netease_pd.js) | - | 公版电影 / 纪录片 / 历史 |
| 新片场 | [xinpianchang.js](./scripts/xinpianchang.js) | - | 原创短片 / 广告 / 纪录片 |
| Vimeo精选 | [vimeo.js](./scripts/vimeo.js) | - | 全球短片 / 动画 / 纪录片 |
| 红豆短剧 | [hongdou.js](./scripts/hongdou.js) | 是 | JSON API、20 题材筛选 HLS/MP4 |
| 短剧巴士 | [duanjubashi.js](./scripts/duanjubashi.js) | 是 | 短剧频道筛选与全集解析 |
| 河马短剧 | [hema.js](./scripts/hema.js) | - | Next.js 数据直连 MP4 / HLS |
| 围观短剧 | [weiguan.js](./scripts/weiguan.js) | 是 | 多清晰度 MP4（含 1080P/720P） |
| 酷我短剧 | [kuwoduanju.js](./scripts/kuwoduanju.js) | - | 热门短剧直连 MP4 |
| 悟圣短剧 | [wusheng.js](./scripts/wusheng.js) | - | 短剧 JSON API + HLS 直连 |

### 3. 在线 T4 / CMS 接口（6 个）

- **T4（3 个）**：`55影视`、`枫林影视T4`、`新韩剧网T4`
- **CMS（3 个）**：`龙马影视`、`听风资源`、`聚合影视`

## 开发与校验

```bash
# 校验 manifest.json 与本地脚本引用
python tools/check_manifest.py

# 额外探测远端 CMS/T4 站点连通性
python tools/check_manifest.py --probe
```
