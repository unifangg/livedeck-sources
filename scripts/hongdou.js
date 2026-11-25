// Ported from hongdou.py -> LiveDeck script_js (QuickJS Sandbox)
(function () {
  const DEFAULT_HOST = "https://hdou.tv";
  const DEFAULT_API = "https://api.dramaplay.shop";
  const DEFAULT_IMAGE_HOST = "https://static.hdou.tv";
  const LIMIT = 24;
  const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

  const CLASSES = [
    ["0", "最新短剧"],
    ["334", "都市"],
    ["155", "古装"],
    ["338", "爱情"],
    ["362", "总裁"],
    ["285", "甜宠"],
    ["332", "逆袭"],
    ["341", "重生"],
    ["306", "穿越"],
    ["397", "玄幻"],
    ["220", "悬疑"],
    ["320", "萌宝"],
    ["307", "系统"],
    ["250", "校园"],
    ["343", "闪婚"],
  ];

  const GENRES = [
    ["0", "全部"],
    ["334", "都市"],
    ["155", "古装"],
    ["338", "爱情"],
    ["362", "总裁"],
    ["285", "甜宠"],
    ["332", "逆袭"],
    ["341", "重生"],
    ["306", "穿越"],
    ["397", "玄幻"],
    ["220", "悬疑"],
    ["320", "萌宝"],
    ["307", "系统"],
    ["250", "校园"],
    ["343", "闪婚"],
    ["346", "马甲"],
    ["299", "神医"],
    ["260", "民国"],
    ["256", "武侠"],
    ["190", "宫廷"],
  ];

  function getCfg(config) {
    const c = config || {};
    return {
      host: String(c.host || DEFAULT_HOST).trim().replace(/\/+$/, "") || DEFAULT_HOST,
      api: String(c.api || DEFAULT_API).trim().replace(/\/+$/, "") || DEFAULT_API,
      imageHost: String(c.imageHost || DEFAULT_IMAGE_HOST).trim().replace(/\/+$/, "") || DEFAULT_IMAGE_HOST,
    };
  }

  function cleanText(val) {
    return String(val || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function absImage(cfg, val) {
    const s = String(val || "").trim();
    if (!s) return null;
    if (s.startsWith("//")) return "https:" + s;
    if (/^https?:\/\//i.test(s)) return s.replace(/([^:])\/\/+/g, "$1/");
    return cfg.imageHost + "/" + s.replace(/^\/+/, "");
  }

  function makeRemark(item) {
    const total = item.sum || item.video || 0;
    return String(item.tp || (total ? "全" + total + "集" : item.text || "") || "") || null;
  }

  function mapItems(cfg, rows) {
    const out = [];
    if (!Array.isArray(rows)) return out;
    for (var i = 0; i < rows.length; i++) {
      const it = rows[i];
      if (!it || !it.id || !it.name) continue;
      out.push({
        vodId: String(it.id),
        title: String(it.name),
        poster: absImage(cfg, it.img || it.pic),
        remark: makeRemark(it),
        kind: "series",
      });
    }
    return out;
  }

  async function apiGet(cfg, path, params) {
    try {
      const resp = await Host.http.get(cfg.api + path, {
        params: params || {},
        headers: {
          "User-Agent": UA,
          Referer: cfg.host + "/",
          Origin: cfg.host,
          Accept: "application/json, text/plain, */*",
          "Accept-Language": "zh-CN,zh;q=0.9",
        },
        insecureTls: true,
        timeout: 18,
      });
      if (!resp || !resp.ok) return {};
      const data = resp.json();
      return data && typeof data === "object" ? data : {};
    } catch (_) {
      return {};
    }
  }

  async function fetchList(cfg, pg, typeId, keyword) {
    const page = Math.max(1, parseInt(pg || 1, 10));
    const params = {
      limit: String(LIMIT),
      offset: String((page - 1) * LIMIT),
      lx: "1",
    };
    if (typeId && String(typeId) !== "0") params.typeid = String(typeId);
    if (keyword) params.keytext = String(keyword);
    const data = await apiGet(cfg, "/api/video/lists", params);
    const total = parseInt(data.total || 0, 10) || 0;
    const rows = Array.isArray(data.rows) ? data.rows : [];
    const totalPages = total > 0 ? Math.max(1, Math.ceil(total / LIMIT)) : 1;
    return {
      items: mapItems(cfg, rows),
      page: page,
      totalPages: totalPages,
      hasMore: page < totalPages,
    };
  }

  async function fetchAllEpisodes(cfg, vodId) {
    const all = [];
    const seen = Object.create(null);
    let page = 1;
    let total = null;
    while (page <= 15) {
      const data = await apiGet(cfg, "/api/video/videoinfo", {
        page: String(page),
        uid: "0",
        vid: String(vodId),
        mid: "0",
        token: "",
      });
      const rows = data.data || data.result || [];
      if (!Array.isArray(rows) || rows.length === 0) break;
      if (total === null) {
        total = parseInt(data.total || data.affectedDocs || 0, 10) || 0;
      }
      for (var i = 0; i < rows.length; i++) {
        const ep = rows[i];
        const eid = (ep && (ep.id || ep._id)) || "";
        const key = String(eid) + "|" + String((ep && ep.name) || "");
        if (seen[key]) continue;
        seen[key] = true;
        all.push(ep);
      }
      if (total > 0 && all.length >= total) break;
      if (rows.length < 10) break;
      page += 1;
    }
    all.sort(function (a, b) {
      const aw = parseInt((a && a.weigh) || 0, 10) || 1e9;
      const bw = parseInt((b && b.weigh) || 0, 10) || 1e9;
      if (aw !== bw) return aw - bw;
      return (parseInt((a && a.id) || 0, 10) || 0) - (parseInt((b && b.id) || 0, 10) || 0);
    });
    return all;
  }

  function extractActors(val) {
    if (Array.isArray(val)) return val.map(String).filter(Boolean);
    try {
      const parsed = JSON.parse(String(val || "[]"));
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch (_) {}
    return cleanText(val)
      .split(/[,，/\s]+/)
      .filter(Boolean);
  }

  globalThis.LiveDeckVod = {
    async home(payload) {
      const cfg = getCfg(payload && payload.config);
      const listRes = await fetchList(cfg, 1, "0", "");
      const genreOpts = GENRES.map(function (g) {
        return { value: g[0], label: g[1] };
      });
      return {
        categories: CLASSES.map(function (c) {
          return {
            id: c[0],
            name: c[1],
            filters: [
              {
                key: "typeid",
                name: "题材",
                defaultValue: c[0],
                options: genreOpts,
              },
            ],
          };
        }),
        featured: listRes.items,
      };
    },

    async category(payload) {
      const cfg = getCfg(payload && payload.config);
      const tid =
        payload && payload.filters && payload.filters.typeid
          ? payload.filters.typeid
          : (payload && payload.categoryId) || "0";
      return fetchList(cfg, (payload && payload.page) || 1, tid, "");
    },

    async search(payload) {
      const cfg = getCfg(payload && payload.config);
      return fetchList(cfg, (payload && payload.page) || 1, "0", (payload && payload.keyword) || "");
    },

    async detail(payload) {
      const cfg = getCfg(payload && payload.config);
      const vid = String((payload && payload.vodId) || "");
      const info = await apiGet(cfg, "/api/video/info", { id: vid, mid: "0" });
      const episodes = await fetchAllEpisodes(cfg, vid);

      const hlsEps = [];
      const mp4Eps = [];
      for (var i = 0; i < episodes.length; i++) {
        const ep = episodes[i];
        const idx = i + 1;
        const epName =
          String((ep && (ep.name || ep.fjname || ep.title)) || "第" + idx + "集")
            .replace(/[$#]/g, " ")
            .trim() || "第" + idx + "集";
        const src = String((ep && ep.src) || "").trim();
        const vurl = String((ep && (ep.videourl || ep.url)) || "").trim();
        let hlsUrl = "";
        let mp4Url = "";
        const cands = [src, vurl];
        for (var j = 0; j < cands.length; j++) {
          let u = cands[j];
          if (!u) continue;
          if (u.startsWith("//")) u = "https:" + u;
          if (/\.m3u8(\?|$)/i.test(u)) {
            if (!hlsUrl) hlsUrl = u;
          } else if (/\.mp4(\?|$)/i.test(u)) {
            if (!mp4Url) mp4Url = u;
          } else if (!hlsUrl) {
            hlsUrl = u;
          }
        }
        if (hlsUrl) {
          hlsEps.push({ episodeId: "hls-" + idx, name: epName, index: hlsEps.length, playData: hlsUrl });
        }
        if (mp4Url) {
          mp4Eps.push({ episodeId: "mp4-" + idx, name: epName, index: mp4Eps.length, playData: mp4Url });
        }
      }

      if (hlsEps.length === 0 && mp4Eps.length === 0 && info.videourl) {
        let u = String(info.videourl).trim();
        if (u.startsWith("//")) u = "https:" + u;
        const label = String(info.ji || "第1集");
        if (/\.m3u8(\?|$)/i.test(u)) {
          hlsEps.push({ episodeId: "hls-1", name: label, index: 0, playData: u });
        } else {
          mp4Eps.push({ episodeId: "mp4-1", name: label, index: 0, playData: u });
        }
      }

      const sources = [];
      if (hlsEps.length > 0) sources.push({ sourceId: "hls", name: "红豆HLS", episodes: hlsEps });
      if (mp4Eps.length > 0) sources.push({ sourceId: "mp4", name: "红豆MP4", episodes: mp4Eps });

      const yearStr = String(info.updatetime || "").slice(0, 4);
      const year = /^\d{4}$/.test(yearStr) ? parseInt(yearStr, 10) : null;

      return {
        vodId: vid,
        title: String(info.name || "短剧" + vid),
        poster: absImage(cfg, info.img || info.pic),
        remark: makeRemark(info) || (episodes.length > 0 ? "全" + episodes.length + "集" : null),
        year: year,
        genres: info.text ? [String(info.text)] : ["短剧"],
        actors: extractActors(info.yyid),
        synopsis: cleanText(info.story || info.info) || null,
        kind: "series",
        sources: sources,
      };
    },

    async play(payload) {
      const cfg = getCfg(payload && payload.config);
      let u = String((payload && payload.playData) || "").trim();
      if (u.startsWith("//")) u = "https:" + u;
      return {
        streams: [
          {
            label: "默认线路",
            url: u,
            userAgent: UA,
            headers: {
              Referer: cfg.host + "/",
              Origin: cfg.host,
            },
          },
        ],
      };
    },
  };
})();
