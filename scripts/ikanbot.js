// Ported from ikanbot.py -> LiveDeck script_js (QuickJS Sandbox)
(function () {
  const DEFAULT_HOST = "https://v.ikanbot.com";
  const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36";
  const MOBILE_UA =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1";

  const FLAG_MAP = {
    bfzym3u8: "暴风",
    "1080zyk": "优质",
    kuaikan: "快看",
    lzm3u8: "量子",
    ffm3u8: "非凡",
    snm3u8: "索尼",
    qhm3u8: "奇虎",
    haiwaikan: "海外看",
    gsm3u8: "光速",
    zuidam3u8: "最大",
    bjm3u8: "八戒",
    wolong: "卧龙",
    xlm3u8: "新浪",
    yhm3u8: "樱花",
    tkm3u8: "天空",
    jsm3u8: "极速",
    wjm3u8: "无尽",
    sdm3u8: "闪电",
    kcm3u8: "快车",
    jinyingm3u8: "金鹰",
    fsm3u8: "飞速",
    tpm3u8: "淘片",
    lem3u8: "鱼乐",
    dbm3u8: "百度",
    tomm3u8: "番茄",
    ukm3u8: "U酷",
    ikm3u8: "爱坤",
    hnzym3u8: "红牛资源",
    hnm3u8: "红牛",
    "68zy_m3u8": "68",
    kdm3u8: "酷点",
    bdxm3u8: "北斗星",
    hhm3u8: "豪华",
    kbm3u8: "快播",
  };

  const TAB_REMOVE = {
    wjm3u8: true,
    ikm3u8: true,
    sdm3u8: true,
    M3U8: true,
    jinyingm3u8: true,
    fsm3u8: true,
    ukm3u8: true,
  };

  const TAB_ORDER = [
    "bfzym3u8",
    "1080zyk",
    "kuaikan",
    "lzm3u8",
    "ffm3u8",
    "snm3u8",
    "qhm3u8",
    "gsm3u8",
    "zuidam3u8",
    "bjm3u8",
    "wolong",
    "xlm3u8",
    "yhm3u8",
  ];

  const CLASSES = [
    ["/hot/index-movie-热门.html", "电影", "热门"],
    ["/hot/index-tv-热门.html", "剧集", "热门"],
    ["/hot/index-movie-最新.html", "最新电影", "最新"],
    ["/hot/index-tv-最新.html", "最新剧集", "最新"],
  ];

  const TAGS = [
    "热门",
    "最新",
    "经典",
    "豆瓣高分",
    "冷门佳片",
    "华语",
    "欧美",
    "韩国",
    "日本",
    "动作",
    "喜剧",
    "爱情",
    "科幻",
    "悬疑",
    "恐怖",
    "治愈",
  ];

  function getHost(config) {
    const raw = (config && config.host) || DEFAULT_HOST;
    return String(raw).trim().replace(/\/+$/, "") || DEFAULT_HOST;
  }

  function cleanText(raw) {
    return String(raw || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/\s+/g, " ")
      .trim();
  }

  function absUrl(host, u) {
    const s = String(u || "").trim();
    if (!s) return null;
    if (s.startsWith("//")) return "https:" + s;
    if (/^https?:\/\//i.test(s)) return s;
    return host + (s.startsWith("/") ? s : "/" + s);
  }

  async function fetchHtml(host, pathOrUrl) {
    const url = /^https?:\/\//i.test(pathOrUrl) ? pathOrUrl : host + pathOrUrl;
    try {
      const resp = await Host.http.get(url, {
        headers: {
          "User-Agent": UA,
          Referer: host + "/",
          "Accept-Language": "zh-CN,zh;q=0.9",
        },
        insecureTls: true,
        timeout: 15,
      });
      return resp && resp.ok ? resp.bodyText || resp.body || "" : "";
    } catch (_) {
      return "";
    }
  }

  function parseList(host, html) {
    const out = [];
    const seen = Object.create(null);
    if (!html) return out;

    let nodes = Host.html.selectAll(html, "div.v-list div.item");
    let mode = "item";
    if (!nodes || nodes.length === 0) {
      nodes = Host.html.selectAll(html, "div.media");
      mode = "media";
    }
    if (!nodes || nodes.length === 0) {
      nodes = Host.html.selectAll(html, "a.item-root");
      mode = "anchor";
    }

    for (var i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      let vodId = "";
      let title = "";
      let pic = null;
      let remark = null;

      if (mode === "item") {
        const a = Host.html.select(node.html, "a");
        const href = (a && a.attrs && a.attrs.href) || "";
        if (!href.startsWith("/play/")) continue;
        vodId = href;
        title = cleanText(Host.html.text(node.html, "p"));
        const img = Host.html.select(node.html, "img");
        if (img && img.attrs) {
          if (!title) title = cleanText(img.attrs.alt || "");
          pic = absUrl(host, img.attrs["data-src"] || img.attrs.src || "");
        }
        const rem = cleanText(Host.html.text(node.html, "div.text-right"));
        if (rem) remark = rem;
      } else if (mode === "media") {
        const a = Host.html.select(node.html, "a.title-text");
        const href = (a && a.attrs && a.attrs.href) || "";
        if (!href.startsWith("/play/")) continue;
        vodId = href;
        title = cleanText(a.text || "");
        const img = Host.html.select(node.html, "img.media-object");
        if (img && img.attrs) {
          pic = absUrl(host, img.attrs["data-src"] || img.attrs.src || "");
        }
        const rem = cleanText(Host.html.text(node.html, "span.label"));
        if (rem) remark = rem;
      } else {
        const href = (node.attrs && node.attrs.href) || "";
        if (!href.startsWith("/play/")) continue;
        vodId = href;
        const img = Host.html.select(node.html, "img");
        if (img && img.attrs) {
          title = cleanText(img.attrs.alt || "");
          pic = absUrl(host, img.attrs["data-src"] || img.attrs.src || "");
        }
        if (!title) title = cleanText(node.text || "");
        const rem = cleanText(Host.html.text(node.html, "span.label"));
        if (rem) remark = rem;
      }

      if (!vodId || !title || seen[vodId]) continue;
      seen[vodId] = true;
      out.push({
        vodId: vodId,
        title: title,
        poster: pic,
        remark: remark,
      });
    }
    return out;
  }

  function getTks(currentId, eToken) {
    if (!currentId || !eToken) return "";
    let key = String(currentId);
    if (key.length > 4) key = key.slice(-4);
    let token = String(eToken);
    const parts = [];
    for (var i = 0; i < key.length; i++) {
      const digit = parseInt(key.charAt(i), 10);
      if (isNaN(digit)) return "";
      const pos = (digit % 3) + 1;
      if (pos + 8 > token.length) break;
      parts.push(token.slice(pos, pos + 8));
      token = token.slice(pos + 8);
    }
    return parts.join("");
  }

  globalThis.LiveDeckVod = {
    async home(payload) {
      const host = getHost(payload && payload.config);
      const html = await fetchHtml(host, "/");
      const tagOpts = TAGS.map(function (t) {
        return { value: t, label: t };
      });
      return {
        categories: CLASSES.map(function (c) {
          return {
            id: c[0],
            name: c[1],
            filters: [
              {
                key: "tag",
                name: "标签",
                defaultValue: c[2],
                options: tagOpts,
              },
            ],
          };
        }),
        featured: parseList(host, html),
      };
    },

    async category(payload) {
      const host = getHost(payload && payload.config);
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10) || 1);
      const tid = String((payload && payload.categoryId) || "/hot/index-movie-热门.html").trim();
      const m = /index-([^-]+)-/.exec(tid);
      const baseType = m ? m[1] : "movie";
      const filters = (payload && payload.filters) || {};
      let tag = filters.tag ? String(filters.tag).trim() : "";
      if (!tag) tag = tid.indexOf("最新") >= 0 ? "最新" : "热门";
      const encTag = Host.codec.urlEncode(tag);
      const path =
        page > 1
          ? "/hot/index-" + baseType + "-" + encTag + "-p-" + page + ".html"
          : "/hot/index-" + baseType + "-" + encTag + ".html";
      const html = await fetchHtml(host, path);
      const items = parseList(host, html);
      const hasMore = items.length >= 20;
      return {
        items: items,
        page: page,
        totalPages: hasMore ? page + 1 : page,
        hasMore: hasMore,
      };
    },

    async search(payload) {
      const host = getHost(payload && payload.config);
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10) || 1);
      const kw = String((payload && payload.keyword) || "").trim();
      if (!kw) return { items: [], page: page, totalPages: 1, hasMore: false };
      const encKw = Host.codec.urlEncode(kw);
      const path = page > 1 ? "/search?q=" + encKw + "&p=" + page : "/search?q=" + encKw;
      const html = await fetchHtml(host, path);
      const items = parseList(host, html);
      const hasMore = items.length >= 15;
      return {
        items: items,
        page: page,
        totalPages: hasMore ? page + 1 : page,
        hasMore: hasMore,
      };
    },

    async detail(payload) {
      const host = getHost(payload && payload.config);
      const raw = String((payload && payload.vodId) || "").trim();
      const vodId = raw.startsWith("/") ? raw : "/play/" + raw;
      const pageUrl = host + vodId;
      const html = await fetchHtml(host, vodId);
      if (!html) return { vodId: vodId, title: vodId, sources: [] };

      const cidMatch = /id="current_id"\s+value="(\d+)"/.exec(html);
      const etMatch = /id="e_token"\s+value="([^"]+)"/.exec(html);
      const mtMatch = /id="mtype"\s+value="(\d+)"/.exec(html);
      const mtype = mtMatch ? mtMatch[1] : "2";

      const playDict = Object.create(null);
      if (cidMatch && etMatch) {
        const cid = cidMatch[1];
        const tks = getTks(cid, etMatch[1]);
        try {
          const apiResp = await Host.http.get(host + "/api/getResN", {
            params: { videoId: cid, mtype: mtype, token: tks },
            headers: {
              "User-Agent": MOBILE_UA,
              Referer: pageUrl,
            },
            insecureTls: true,
            timeout: 10,
          });
          if (apiResp && apiResp.ok) {
            const data = apiResp.json();
            const list = (data && data.data && data.data.list) || [];
            for (var i = 0; i < list.length; i++) {
              let resData = list[i] && list[i].resData;
              if (typeof resData === "string") {
                try {
                  resData = JSON.parse(resData);
                } catch (_) {
                  continue;
                }
              }
              if (!Array.isArray(resData) || resData.length === 0) continue;
              let rawFlag = "";
              const eps = [];
              for (var j = 0; j < resData.length; j++) {
                const f = resData[j];
                if (!f || !f.url) continue;
                if (!rawFlag && f.flag) rawFlag = String(f.flag);
                let u = String(f.url).trim();
                const dIdx = u.indexOf("$");
                if (dIdx >= 0) u = u.slice(dIdx + 1).trim();
                const epName = cleanText(f.name || "") || "第" + (eps.length + 1) + "集";
                eps.push({
                  episodeId: (rawFlag || "src") + "-" + (eps.length + 1),
                  name: epName,
                  index: eps.length,
                  playData: u,
                });
              }
              if (rawFlag && !TAB_REMOVE[rawFlag] && eps.length > 0) {
                playDict[rawFlag] = {
                  sourceId: rawFlag,
                  name: FLAG_MAP[rawFlag] || rawFlag,
                  episodes: eps,
                };
              }
            }
          }
        } catch (_) {}
      }

      const sources = [];
      for (var k = 0; k < TAB_ORDER.length; k++) {
        const key = TAB_ORDER[k];
        if (playDict[key]) {
          sources.push(playDict[key]);
          delete playDict[key];
        }
      }
      const remKeys = Object.keys(playDict);
      for (var r = 0; r < remKeys.length; r++) {
        sources.push(playDict[remKeys[r]]);
      }

      const title =
        cleanText(Host.html.text(html, "h2")) ||
        cleanText(Host.html.text(html, "h1")) ||
        vodId;
      const img = Host.html.select(html, "div.item-root img");
      const pic = img && img.attrs ? absUrl(host, img.attrs["data-src"] || img.attrs.src || "") : null;
      const synopsis = cleanText(Host.html.text(html, "div.description")) || null;

      return {
        vodId: vodId,
        title: title,
        poster: pic,
        synopsis: synopsis,
        sources: sources,
      };
    },

    async play(payload) {
      let u = String((payload && payload.playData) || "").trim();
      const idx = u.indexOf("$");
      if (idx >= 0) u = u.slice(idx + 1).trim();
      if (!u) Host.raise("NO_STREAM", "ikanbot empty playData");
      return {
        streams: [
          {
            label: "默认线路",
            url: u,
            userAgent: UA,
          },
        ],
      };
    },
  };
})();
