// Ported from tv123.py -> LiveDeck script_js (QuickJS Sandbox, adult categories/filters stripped)
(function () {
  const DEFAULT_HOST = "https://a123tv.com";
  const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

  const CATEGORIES = [
    {
      id: "10",
      name: "电影",
      kind: "movie",
      filters: [
        {
          key: "class",
          name: "类型",
          defaultValue: "",
          options: [
            ["", "全部"],
            ["1001", "动作片"],
            ["1002", "喜剧片"],
            ["1003", "爱情片"],
            ["1004", "科幻片"],
            ["1005", "恐怖片"],
            ["1006", "剧情片"],
            ["1007", "战争片"],
            ["1008", "纪录片"],
            ["1010", "动漫电影"],
            ["1011", "奇幻片"],
            ["1013", "动画片"],
            ["1014", "犯罪片"],
            ["1016", "悬疑片"],
            ["1019", "邵氏电影"],
            ["1022", "歌舞片"],
            ["1024", "家庭片"],
            ["1025", "古装片"],
            ["1026", "历史片"],
            ["1027", "4K电影"],
          ].map(function (x) {
            return { value: x[0], label: x[1] };
          }),
        },
      ],
    },
    {
      id: "11",
      name: "连续剧",
      kind: "series",
      filters: [
        {
          key: "class",
          name: "地区",
          defaultValue: "",
          options: [
            ["", "全部"],
            ["1101", "国产剧"],
            ["1102", "香港剧"],
            ["1105", "台湾剧"],
            ["1103", "韩国剧"],
            ["1104", "欧美剧"],
            ["1106", "日本剧"],
            ["1108", "泰国剧"],
            ["1110", "港台剧"],
            ["1111", "日韩剧"],
            ["1107", "海外剧"],
          ].map(function (x) {
            return { value: x[0], label: x[1] };
          }),
        },
      ],
    },
    {
      id: "12",
      name: "综艺",
      kind: "variety",
      filters: [
        {
          key: "class",
          name: "类型",
          defaultValue: "",
          options: [
            ["", "全部"],
            ["1201", "内地综艺"],
            ["1202", "港台综艺"],
            ["1203", "日韩综艺"],
            ["1204", "欧美综艺"],
            ["1205", "国外综艺"],
          ].map(function (x) {
            return { value: x[0], label: x[1] };
          }),
        },
      ],
    },
    {
      id: "13",
      name: "动漫",
      kind: "anime",
      filters: [
        {
          key: "class",
          name: "类型",
          defaultValue: "",
          options: [
            ["", "全部"],
            ["1301", "国产动漫"],
            ["1302", "日韩动漫"],
            ["1303", "欧美动漫"],
            ["1305", "海外动漫"],
          ].map(function (x) {
            return { value: x[0], label: x[1] };
          }),
        },
      ],
    },
  ];

  function getHost(config) {
    const raw = (config && (config.host || config.url)) || DEFAULT_HOST;
    return String(raw).trim().replace(/\/+$/, "") || DEFAULT_HOST;
  }

  function absUrl(host, u) {
    if (!u) return null;
    const s = String(u).trim();
    if (!s) return null;
    if (s.startsWith("//")) return "https:" + s;
    if (/^https?:\/\//i.test(s)) return s;
    return host + (s.startsWith("/") ? s : "/" + s);
  }

  function cleanText(raw) {
    return String(raw || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim();
  }

  function splitNames(raw) {
    return cleanText(raw)
      .split(/[,，/\s]+/)
      .map(function (s) {
        return s.trim();
      })
      .filter(Boolean);
  }

  function kindForCategory(tid) {
    for (var i = 0; i < CATEGORIES.length; i++) {
      if (CATEGORIES[i].id === String(tid)) return CATEGORIES[i].kind;
    }
    return null;
  }

  function isNsfwText(text) {
    return /(情色|伦理|三级|福利|里番|成人|无码|偷拍|乱伦|巨乳)/.test(String(text || ""));
  }

  async function fetchHtml(host, pathOrUrl) {
    const url = /^https?:\/\//i.test(pathOrUrl)
      ? pathOrUrl
      : host + (pathOrUrl.startsWith("/") ? pathOrUrl : "/" + pathOrUrl);
    try {
      const resp = await Host.http.get(url, {
        headers: {
          "User-Agent": UA,
          Referer: host + "/",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
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

  function parseList(host, html, kind) {
    const items = [];
    const seen = Object.create(null);
    if (!html) return items;
    const cards = Host.html.selectAll(html, "a.w4-item");
    for (var i = 0; i < cards.length; i++) {
      const card = cards[i];
      const href = (card.attrs && card.attrs.href) || "";
      if (!href || seen[href]) continue;
      seen[href] = true;
      const cardHtml = card.html;
      const title =
        cleanText(Host.html.attr(cardHtml, ".t", "title")) ||
        cleanText(Host.html.text(cardHtml, ".t"));
      if (!title) continue;
      const info = cleanText(Host.html.text(cardHtml, ".i"));
      if (isNsfwText(info)) continue;
      const picRaw =
        Host.html.attr(cardHtml, "img", "data-src") ||
        Host.html.attr(cardHtml, "img", "src");
      const remark = cleanText(Host.html.text(cardHtml, ".s span")) || info;
      items.push({
        vodId: href,
        title: title,
        poster: absUrl(host, picRaw),
        remark: remark || null,
        kind: kind || null,
      });
    }
    return items;
  }

  globalThis.LiveDeckVod = {
    async home(payload) {
      const host = getHost(payload && payload.config);
      const html = await fetchHtml(host, "/");
      return {
        categories: CATEGORIES.map(function (c) {
          return { id: c.id, name: c.name, filters: c.filters };
        }),
        featured: parseList(host, html, null).slice(0, 24),
      };
    },

    async category(payload) {
      const host = getHost(payload && payload.config);
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10));
      const tid = String((payload && payload.categoryId) || "10").trim();
      const filters = (payload && payload.filters) || {};
      const realTid = String(filters.class || tid);
      const path = page <= 1 ? "/t/" + realTid + ".html" : "/t/" + realTid + "/p" + page + ".html";
      const html = await fetchHtml(host, path);
      const items = parseList(host, html, kindForCategory(tid));

      let totalPages = page;
      const pRe = /\/p(\d+)\.html[^>]*>\s*(\d+)\s*<\/a>/g;
      let pm;
      while ((pm = pRe.exec(html)) !== null) {
        const n = parseInt(pm[2], 10);
        if (n > totalPages) totalPages = n;
      }
      if (totalPages <= page && items.length >= 20) totalPages = page + 1;

      return {
        items: items,
        page: page,
        totalPages: totalPages,
        hasMore: page < totalPages,
      };
    },

    async search(payload) {
      const host = getHost(payload && payload.config);
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10));
      const kw = String((payload && payload.keyword) || "").trim();
      if (!kw) return { items: [], page: page, totalPages: 1, hasMore: false };
      const enc = Host.codec.urlEncode(kw);
      const path = page <= 1 ? "/s/" + enc + ".html" : "/s/" + enc + "/p" + page + ".html";
      const html = await fetchHtml(host, path);
      const items = parseList(host, html, null);
      const hasMore = items.length >= 20;
      return {
        items: items,
        page: page,
        totalPages: hasMore ? page + 1 : page,
        hasMore: hasMore,
      };
    },

    async detail(payload) {
      const host = getHost(payload && payload.config);
      const vodId = String((payload && payload.vodId) || "").trim();
      const html = await fetchHtml(host, vodId);
      if (!html) {
        return { vodId: vodId, title: vodId, actors: [], directors: [], sources: [] };
      }

      const title =
        cleanText(Host.html.text(html, "li.on h1")) ||
        cleanText(Host.html.text(html, "h1")) ||
        vodId;
      const posterRaw =
        Host.html.attr(html, "[data-poster]", "data-poster") ||
        Host.html.attr(html, 'meta[property="og:image"]', "content");
      const desc = cleanText(Host.html.attr(html, 'meta[name="description"]', "content"));

      let actors = [];
      let directors = [];
      let region = null;
      if (desc) {
        const am = /演员[：:](.*?)(?:[。.]|$)/.exec(desc);
        if (am) actors = splitNames(am[1]);
        const rm = /地区[：:](.*?)(?:[。.]|$)/.exec(desc);
        if (rm) region = cleanText(rm[1]) || null;
        const dm = /导演[：:](.*?)(?:[。.]|$)/.exec(desc);
        if (dm) directors = splitNames(dm[1]);
      }

      const sources = [];
      const ppJson = Host.text.extractJson(html, "var pp");
      if (ppJson) {
        try {
          const pp = JSON.parse(ppJson);
          const no = String(pp.no || "");
          const la = Array.isArray(pp.la) ? pp.la : [];
          for (var i = 0; i < la.length; i++) {
            const line = la[i];
            if (!Array.isArray(line)) continue;
            const lineId = String(line[0] || "");
            const lineName = String(line[1] || "线路" + (i + 1));
            const epCount = Math.max(1, parseInt(line[2] || 1, 10) || 1);
            const directUrl =
              typeof line[4] === "string" && /^https?:\/\//i.test(line[4]) ? line[4] : "";
            const eps = [];
            if (directUrl && epCount <= 1) {
              eps.push({
                episodeId: lineId + "-0",
                name: "正片",
                index: 0,
                playData: directUrl,
              });
            } else {
              for (var j = 0; j < epCount; j++) {
                eps.push({
                  episodeId: lineId + "-" + j,
                  name: epCount === 1 ? "正片" : "第" + (j + 1) + "集",
                  index: j,
                  playData: "/v/" + no + "/" + lineId + "z" + j + ".html",
                });
              }
            }
            if (eps.length > 0) {
              sources.push({
                sourceId: lineId || "line-" + (i + 1),
                name: lineName,
                episodes: eps,
              });
            }
          }
        } catch (_) {}
      }

      if (sources.length === 0) {
        const dm = /data-src="(https?:\/\/[^"]+\.(?:m3u8|mp4)[^"]*)"/i.exec(html);
        if (dm) {
          sources.push({
            sourceId: "default",
            name: "默认",
            episodes: [{ episodeId: "1", name: "正片", index: 0, playData: dm[1] }],
          });
        }
      }

      return {
        vodId: vodId,
        title: title,
        poster: absUrl(host, posterRaw),
        region: region,
        actors: actors,
        directors: directors,
        synopsis: desc || null,
        sources: sources,
      };
    },

    async play(payload) {
      const host = getHost(payload && payload.config);
      const raw = String((payload && payload.playData) || "").trim();
      const headers = { Referer: host + "/" };

      if (/^https?:\/\//i.test(raw) && /\.(m3u8|mp4|flv|mkv|ts)(\?|$)/i.test(raw)) {
        return { streams: [{ label: "默认线路", url: raw, userAgent: UA, headers: headers }] };
      }

      const html = await fetchHtml(host, raw);
      if (!html) {
        Host.raise("NO_STREAM", "tv123 failed to fetch play page: " + raw);
      }

      let videoUrl = "";
      const ds = /data-src="(https?:\/\/[^"]+)"/i.exec(html);
      if (ds) videoUrl = ds[1];

      if (!videoUrl) {
        const ppJson = Host.text.extractJson(html, "var pp");
        if (ppJson) {
          try {
            const pp = JSON.parse(ppJson);
            const la = Array.isArray(pp.la) ? pp.la : [];
            for (var i = 0; i < la.length; i++) {
              if (Array.isArray(la[i]) && typeof la[i][4] === "string" && /^https?:\/\//i.test(la[i][4])) {
                videoUrl = la[i][4];
                break;
              }
            }
          } catch (_) {}
        }
      }

      if (!videoUrl) {
        const mm = /(https?:\/\/[^"'\s<>]+\.(?:m3u8|mp4)[^"'\s<>]*)/i.exec(html);
        if (mm) videoUrl = mm[1];
      }

      if (!videoUrl) {
        Host.raise("NO_STREAM", "tv123 could not extract direct stream from " + raw);
      }

      return {
        streams: [{ label: "默认线路", url: videoUrl, userAgent: UA, headers: headers }],
      };
    },
  };
})();
