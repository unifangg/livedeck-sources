// Ported from bilibili.py -> LiveDeck script_js (QuickJS Sandbox)
(function () {
  const UA =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
  const REFERER = "https://www.bilibili.com/";
  const ORIGIN = "https://www.bilibili.com";
  const BUVID_KEY = "bili:buvid3";

  const CATEGORIES = [
    ["首页", "首页", null],
    ["音乐", "音乐", "other"],
    ["动画", "动画", "anime"],
    ["电影", "电影", "movie"],
    ["电视剧", "电视剧", "series"],
    ["番剧", "番剧", "anime"],
    ["综艺", "综艺", "variety"],
    ["影视", "影视", "other"],
    ["国创", "国创", "anime"],
    ["娱乐", "娱乐", "variety"],
    ["游戏", "游戏", "other"],
    ["搞笑", "搞笑", "other"],
    ["纪录片", "纪录片", "documentary"],
  ];

  const SEARCH_FILTERS = [
    {
      key: "order",
      name: "排序",
      defaultValue: "0",
      options: [
        { value: "0", label: "综合排序" },
        { value: "click", label: "最多点击" },
        { value: "pubdate", label: "最新发布" },
        { value: "dm", label: "最多弹幕" },
        { value: "stow", label: "最多收藏" },
      ],
    },
    {
      key: "duration",
      name: "时长",
      defaultValue: "0",
      options: [
        { value: "0", label: "全部时长" },
        { value: "4", label: "60分钟以上" },
        { value: "3", label: "30~60分钟" },
        { value: "2", label: "10~30分钟" },
        { value: "1", label: "10分钟以下" },
      ],
    },
  ];

  const QN_MAP = {
    127: { label: "8K", quality: 4320 },
    126: { label: "杜比视界", quality: 2160 },
    125: { label: "HDR", quality: 2160 },
    120: { label: "4K", quality: 2160 },
    116: { label: "1080P60", quality: 1080 },
    112: { label: "1080P+", quality: 1080 },
    80: { label: "1080P", quality: 1080 },
    74: { label: "720P60", quality: 720 },
    64: { label: "720P", quality: 720 },
    32: { label: "480P", quality: 480 },
    16: { label: "360P", quality: 360 },
  };

  const CODEC_MAP = {
    12: "hevc",
    7: "avc",
    13: "av1",
  };

  function cleanText(raw) {
    return String(raw || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/\s+/g, " ")
      .trim();
  }

  function absHttps(u) {
    const s = String(u || "").trim();
    if (!s) return null;
    if (s.startsWith("//")) return "https:" + s;
    return s.replace(/^http:\/\//i, "https://");
  }

  function fmtDur(dur) {
    if (dur === null || dur === undefined || dur === "") return null;
    let sec = 0;
    if (typeof dur === "number") {
      sec = Math.floor(dur);
    } else {
      const s = String(dur).trim();
      if (s.indexOf(":") >= 0) {
        const arr = s.split(":");
        if (arr.length === 2) sec = parseInt(arr[0], 10) * 60 + parseInt(arr[1], 10);
        else if (arr.length === 3) sec = parseInt(arr[0], 10) * 3600 + parseInt(arr[1], 10) * 60 + parseInt(arr[2], 10);
      } else {
        sec = parseInt(s, 10);
      }
    }
    if (!sec || sec <= 0) return null;
    if (sec >= 3600) {
      return Math.floor(sec / 3600) + "时" + Math.floor((sec % 3600) / 60) + "分";
    }
    return Math.floor(sec / 60) + "分" + (sec % 60) + "秒";
  }

  function parsePubYear(ts) {
    const n = parseInt(ts || 0, 10);
    if (!n || n <= 0) return null;
    const y = new Date(n * 1000).getUTCFullYear();
    return y >= 1900 && y <= 2100 ? y : null;
  }

  async function ensureCookie(config) {
    const cfgCookie = config && config.cookie ? String(config.cookie).trim() : "";
    if (cfgCookie) return cfgCookie;
    const cached = Host.cache.get(BUVID_KEY);
    if (cached) return "buvid3=" + cached;
    try {
      const resp = await Host.http.get("https://api.bilibili.com/x/frontend/finger/spi", {
        headers: { "User-Agent": UA, Referer: REFERER },
        insecureTls: true,
        timeout: 10,
      });
      if (resp && resp.ok) {
        const js = resp.json() || {};
        const b3 = js.data && js.data.b_3;
        if (b3) {
          Host.cache.set(BUVID_KEY, String(b3), 3600);
          return "buvid3=" + b3;
        }
      }
    } catch (_) {}
    return "";
  }

  async function apiGet(config, url, params) {
    const cookie = await ensureCookie(config);
    const headers = {
      "User-Agent": UA,
      Referer: REFERER,
      Accept: "application/json, text/plain, */*",
    };
    if (cookie) headers.Cookie = cookie;
    try {
      const resp = await Host.http.get(url, {
        params: params || undefined,
        headers: headers,
        insecureTls: true,
        timeout: 15,
      });
      if (!resp || !resp.ok) return {};
      const data = resp.json();
      return data && typeof data === "object" ? data : {};
    } catch (_) {
      return {};
    }
  }

  function mapItems(items, defaultKind) {
    const out = [];
    if (!Array.isArray(items)) return out;
    for (var i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it || typeof it !== "object") continue;
      const bvid = String(it.bvid || (it.history && it.history.bvid) || "").trim();
      if (!bvid) continue;
      const title = cleanText(it.title || "");
      if (!title) continue;
      out.push({
        vodId: bvid,
        title: title,
        poster: absHttps(it.pic || it.cover || ""),
        remark: fmtDur(it.duration),
        year: parsePubYear(it.pubdate),
        kind: defaultKind || null,
      });
    }
    return out;
  }

  async function fetchRecommend(config, page) {
    const js = await apiGet(config, "https://api.bilibili.com/x/web-interface/index/top/rcmd", {
      ps: "16",
      fresh_idx: String(page),
      fresh_idx_1h: String(page),
    });
    let items = (js.data && js.data.item) || [];
    if (!Array.isArray(items) || items.length === 0) {
      const pop = await apiGet(config, "https://api.bilibili.com/x/web-interface/popular", {
        ps: "20",
        pn: String(page),
      });
      items = (pop.data && pop.data.list) || [];
    }
    return mapItems(items, null);
  }

  async function fetchSearch(config, keyword, page, filters) {
    const params = {
      search_type: "video",
      keyword: keyword,
      page: String(page),
    };
    if (filters && filters.order && filters.order !== "0") params.order = String(filters.order);
    if (filters && filters.duration && filters.duration !== "0") params.duration = String(filters.duration);

    const js = await apiGet(config, "https://api.bilibili.com/x/web-interface/search/type", params);
    const data = js.data || {};
    const raw = Array.isArray(data.result) ? data.result : [];
    const filtered = raw.filter(function (it) {
      const t = it && it.type;
      return !t || t === "video" || t === "ketang";
    });
    let items = mapItems(filtered, null);
    if (items.length === 0 && page === 1) {
      const pop = await apiGet(config, "https://api.bilibili.com/x/web-interface/popular", {
        ps: "30",
        pn: "1",
      });
      items = mapItems((pop.data && pop.data.list) || [], null);
      return { items: items, page: page, totalPages: 1, hasMore: false };
    }
    const totalPages = parseInt(data.numPages || 0, 10) || (items.length >= 20 ? page + 1 : page);
    return {
      items: items,
      page: page,
      totalPages: totalPages,
      hasMore: page < totalPages,
    };
  }

  globalThis.LiveDeckVod = {
    async home(payload) {
      const config = (payload && payload.config) || {};
      const featured = await fetchRecommend(config, 1);
      return {
        categories: CATEGORIES.map(function (c) {
          return {
            id: c[0],
            name: c[1],
            filters: c[0] === "首页" ? [] : SEARCH_FILTERS,
          };
        }),
        featured: featured,
      };
    },

    async category(payload) {
      const config = (payload && payload.config) || {};
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10));
      const tid = String((payload && payload.categoryId) || "首页").trim();
      if (tid === "首页") {
        const items = await fetchRecommend(config, page);
        return {
          items: items,
          page: page,
          totalPages: items.length > 0 ? page + 1 : page,
          hasMore: items.length > 0,
        };
      }
      return fetchSearch(config, tid, page, payload && payload.filters);
    },

    async search(payload) {
      const config = (payload && payload.config) || {};
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10));
      const kw = String((payload && payload.keyword) || "").trim();
      if (!kw) return { items: [], page: page, totalPages: 1, hasMore: false };

      if (page === 1 && /^(BV[0-9A-Za-z]{10}|av\d+)$/i.test(kw)) {
        const param = kw.toLowerCase().startsWith("av") ? { aid: kw.slice(2) } : { bvid: kw };
        const view = await apiGet(config, "https://api.bilibili.com/x/web-interface/view", param);
        const d = view.data;
        if (d && d.bvid) {
          return {
            items: [
              {
                vodId: d.bvid,
                title: cleanText(d.title || d.bvid),
                poster: absHttps(d.pic || ""),
                remark: fmtDur(d.duration),
                year: parsePubYear(d.pubdate),
              },
            ],
            page: 1,
            totalPages: 1,
            hasMore: false,
          };
        }
      }

      return fetchSearch(config, kw, page, null);
    },

    async detail(payload) {
      const config = (payload && payload.config) || {};
      const raw = String((payload && payload.vodId) || "").trim().split("$").pop();
      const viewParams = raw.toLowerCase().startsWith("av") ? { aid: raw.slice(2) } : { bvid: raw };
      const js = await apiGet(config, "https://api.bilibili.com/x/web-interface/view", viewParams);
      const data = js.data || {};
      if (!data.aid) {
        return { vodId: raw, title: raw, actors: [], directors: [], sources: [] };
      }

      const aid = String(data.aid);
      const pages = Array.isArray(data.pages) && data.pages.length > 0
        ? data.pages
        : [{ cid: data.cid, part: data.title || "正片", duration: data.duration }];

      const episodes = [];
      for (var i = 0; i < pages.length; i++) {
        const pg = pages[i];
        const cid = pg && pg.cid;
        if (!cid) continue;
        const epDur = parseInt(pg.duration || 0, 10);
        episodes.push({
          episodeId: String(cid),
          name: cleanText(pg.part || "") || "P" + (i + 1),
          index: episodes.length,
          playData: aid + "|" + cid,
          durationSec: epDur > 0 ? epDur : null,
        });
      }

      const ownerName = cleanText((data.owner && data.owner.name) || "");
      const tname = cleanText(data.tname || "");

      return {
        vodId: data.bvid || raw,
        title: cleanText(data.title || "") || raw,
        poster: absHttps(data.pic || ""),
        remark: fmtDur(data.duration),
        year: parsePubYear(data.pubdate),
        genres: tname ? [tname] : [],
        actors: ownerName ? [ownerName] : [],
        directors: [],
        synopsis: cleanText(data.desc || "").slice(0, 800) || null,
        sources: episodes.length > 0 ? [{ sourceId: "bilibili", name: "哔哩哔哩", episodes: episodes }] : [],
      };
    },

    async play(payload) {
      const config = (payload && payload.config) || {};
      const raw = String((payload && payload.playData) || "").trim();
      const parts = raw.split("|");
      if (parts.length < 2) {
        Host.raise("INVALID_PLAY_DATA", "bilibili invalid playData: " + raw);
      }
      const aid = parts[0].trim();
      const cid = parts[1].trim();
      const cookie = await ensureCookie(config);
      const reqHeaders = {
        "User-Agent": UA,
        Referer: REFERER,
        Accept: "application/json, text/plain, */*",
      };
      if (cookie) reqHeaders.Cookie = cookie;

      const playHeaders = { Referer: REFERER, Origin: ORIGIN };
      if (config && config.cookie) playHeaders.Cookie = String(config.cookie).trim();

      const batchReqs = [
        {
          url: "https://api.bilibili.com/x/player/playurl",
          method: "GET",
          params: { avid: aid, cid: cid, qn: "64", fnval: "1", platform: "html5" },
          headers: reqHeaders,
          insecureTls: true,
          timeout: 15,
        },
        {
          url: "https://api.bilibili.com/x/player/playurl",
          method: "GET",
          params: { avid: aid, cid: cid, qn: "80", fnval: "4048", fourk: "1" },
          headers: reqHeaders,
          insecureTls: true,
          timeout: 15,
        },
      ];

      const resps = await Host.http.batch(batchReqs, 2);
      const streams = [];
      const seen = Object.create(null);

      // 1) Direct MP4 durl (720P/360P muxed, works reliably without login)
      try {
        if (resps[0] && resps[0].ok && resps[0].response) {
          const d = (resps[0].response.json() || {}).data || {};
          const durl = Array.isArray(d.durl) ? d.durl : [];
          if (durl.length > 0 && durl[0].url) {
            const u = String(durl[0].url);
            const qn = parseInt(d.quality || 64, 10);
            const qm = QN_MAP[qn] || { label: "MP4", quality: null };
            seen[u] = true;
            streams.push({
              label: qm.label + " MP4",
              quality: qm.quality,
              url: u,
              userAgent: UA,
              headers: playHeaders,
            });
          }
        }
      } catch (_) {}

      // 2) DASH separate video + audio streams
      try {
        if (resps[1] && resps[1].ok && resps[1].response) {
          const d = (resps[1].response.json() || {}).data || {};
          const dash = d.dash || {};
          const videos = Array.isArray(dash.video) ? dash.video : [];
          const audios = (Array.isArray(dash.audio) ? dash.audio : [])
            .slice()
            .sort(function (a, b) {
              return (parseInt(b.bandwidth || 0, 10) || 0) - (parseInt(a.bandwidth || 0, 10) || 0);
            });
          const bestAudio = audios.length > 0 ? audios[0].baseUrl || audios[0].base_url || "" : "";

          const sortedV = videos.slice().sort(function (a, b) {
            const qd = (parseInt(b.id || 0, 10) || 0) - (parseInt(a.id || 0, 10) || 0);
            if (qd !== 0) return qd;
            return (parseInt(a.codecid || 99, 10) || 99) - (parseInt(b.codecid || 99, 10) || 99);
          });

          const seenQ = Object.create(null);
          for (var i = 0; i < sortedV.length; i++) {
            const v = sortedV[i];
            const vUrl = String((v && (v.baseUrl || v.base_url)) || "");
            if (!vUrl || !bestAudio || seen[vUrl]) continue;
            const qn = parseInt(v.id || 0, 10);
            const codec = CODEC_MAP[parseInt(v.codecid || 0, 10)] || null;
            const qKey = qn + "|" + (codec || "");
            if (seenQ[qKey]) continue;
            seenQ[qKey] = true;
            seen[vUrl] = true;
            const qm = QN_MAP[qn] || { label: (v.height || qn) + "P", quality: parseInt(v.height || 0, 10) || null };
            streams.push({
              label: qm.label + (codec ? " " + codec.toUpperCase() : "") + " DASH",
              quality: qm.quality,
              codec: codec,
              videoUrl: vUrl,
              audioUrl: bestAudio,
              userAgent: UA,
              headers: playHeaders,
            });
          }

          if (streams.length === 0) {
            const durl = Array.isArray(d.durl) ? d.durl : [];
            if (durl.length > 0 && durl[0].url) {
              const qn = parseInt(d.quality || 0, 10);
              const qm = QN_MAP[qn] || { label: "默认", quality: null };
              streams.push({
                label: qm.label,
                quality: qm.quality,
                url: String(durl[0].url),
                userAgent: UA,
                headers: playHeaders,
              });
            }
          }
        }
      } catch (_) {}

      if (streams.length === 0) {
        Host.raise("NO_STREAM", "bilibili returned no playable streams for " + raw);
      }
      return { streams: streams };
    },
  };
})();
