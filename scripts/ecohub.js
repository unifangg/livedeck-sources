// Ported from ecohub.py -> LiveDeck script_js (QuickJS Sandbox, adult content stripped)
(function () {
  const DEFAULT_HOST = "https://eco.fe-spark.cn";
  const API_PATH = "/api/provide/vod";
  const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

  const ADULT_RE = /伦理|福利|成人|色情|情色|写真|理论|三级|\bAV\b/i;

  function getCfg(config) {
    const c = config || {};
    return {
      host: String(c.host || DEFAULT_HOST).trim().replace(/\/+$/, "") || DEFAULT_HOST,
      source: c.source ? String(c.source).trim() : "",
    };
  }

  function isAdultText(val) {
    return ADULT_RE.test(String(val || ""));
  }

  function isBlockedCategory(id, name) {
    return String(id) === "19" || isAdultText(name);
  }

  function isBlockedItem(it) {
    if (!it) return true;
    if (String(it.type_id) === "19") return true;
    if (isAdultText(it.type_name) || isAdultText(it.vod_class) || isAdultText(it.vod_name)) {
      return true;
    }
    return false;
  }

  function cleanText(raw) {
    return String(raw || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/\s+/g, " ")
      .trim();
  }

  function cleanPoster(raw) {
    const s = String(raw || "").trim();
    if (!s) return null;
    if (s.startsWith("//")) return "https:" + s;
    return s;
  }

  function parseYear(raw) {
    const m = /(\d{4})/.exec(String(raw || ""));
    if (!m) return null;
    const n = parseInt(m[1], 10);
    return n >= 1900 && n <= 2100 ? n : null;
  }

  function splitNames(raw) {
    return cleanText(raw)
      .split(/[,，/\s]+/)
      .map(function (s) {
        return s.trim();
      })
      .filter(Boolean);
  }

  async function apiGet(cfg, params) {
    const cleanParams = {};
    const ks = Object.keys(params || {});
    for (var i = 0; i < ks.length; i++) {
      const k = ks[i];
      const v = params[k];
      if (v !== undefined && v !== null && v !== "") {
        cleanParams[k] = String(v);
      }
    }
    if (cfg.source && !cleanParams.source) {
      cleanParams.source = cfg.source;
    }

    const headers = {
      "User-Agent": UA,
      Referer: cfg.host + "/",
      "Accept-Language": "zh-CN,zh;q=0.9",
    };
    for (var attempt = 0; attempt < 3; attempt++) {
      try {
        const resp = await Host.http.get(cfg.host + API_PATH, {
          params: cleanParams,
          headers: headers,
          insecureTls: true,
          timeout: 20,
        });
        if (!resp || !resp.ok) continue;
        const data = resp.json();
        if (data && typeof data === "object" && (data.code === 1 || "list" in data || "class" in data)) {
          return data;
        }
      } catch (_) {}
    }
    return {};
  }

  function mapItems(data) {
    const rows = (data && (data.list || data.vod)) || [];
    const out = [];
    if (!Array.isArray(rows)) return out;
    for (var i = 0; i < rows.length; i++) {
      const it = rows[i];
      if (!it || !it.vod_id || !it.vod_name) continue;
      if (isBlockedItem(it)) continue;
      out.push({
        vodId: String(it.vod_id),
        title: cleanText(it.vod_name),
        poster: cleanPoster(it.vod_pic),
        remark: cleanText(it.vod_remarks) || null,
        year: parseYear(it.vod_year),
      });
    }
    return out;
  }

  function parseSourcesFallback(playFrom, playUrl) {
    const froms = String(playFrom || "").split("$$$");
    const groups = String(playUrl || "").split("$$$");
    const sources = [];
    for (var i = 0; i < groups.length; i++) {
      const sName = cleanText(froms[i] || "") || "线路" + (i + 1);
      const eps = [];
      const parts = groups[i].split("#");
      for (var j = 0; j < parts.length; j++) {
        const p = parts[j].trim();
        if (!p) continue;
        const idx = p.indexOf("$");
        const epName = idx >= 0 ? p.slice(0, idx).trim() : "第" + (j + 1) + "集";
        const epUrl = idx >= 0 ? p.slice(idx + 1).trim() : p;
        if (!epUrl) continue;
        eps.push({
          episodeId: (i + 1) + "-" + (j + 1),
          name: epName || "第" + (j + 1) + "集",
          index: eps.length,
          playData: epUrl,
        });
      }
      if (eps.length > 0) {
        sources.push({ sourceId: "src-" + (i + 1), name: sName, episodes: eps });
      }
    }
    return sources;
  }

  globalThis.LiveDeckVod = {
    async home(payload) {
      const cfg = getCfg(payload && payload.config);
      const [clsData, tvRes, movieRes, animeRes] = await Promise.all([
        apiGet(cfg, { ac: "class" }),
        apiGet(cfg, { ac: "list", t: "1", pg: "1" }),
        apiGet(cfg, { ac: "list", t: "9", pg: "1" }),
        apiGet(cfg, { ac: "list", t: "20", pg: "1" }),
      ]);

      const rawFilters = (clsData && clsData.filters) || {};
      const categories = [];
      const rawClasses = (clsData && clsData.class) || [];
      for (var i = 0; i < rawClasses.length; i++) {
        const c = rawClasses[i];
        const tid = String(c.type_id || "");
        const tname = cleanText(c.type_name || "");
        if (!tid || !tname || isBlockedCategory(tid, tname)) continue;

        const flist = Array.isArray(rawFilters[tid]) ? rawFilters[tid] : [];
        const filters = [];
        for (var j = 0; j < flist.length; j++) {
          const f = flist[j];
          if (!f || !f.key) continue;
          const vals = Array.isArray(f.value) ? f.value : [];
          const opts = [];
          for (var k = 0; k < vals.length; k++) {
            const v = vals[k];
            const label = cleanText(v && v.n);
            const value = String((v && v.v) || "");
            if (!label || isAdultText(label) || isAdultText(value)) continue;
            opts.push({ value: value, label: label });
          }
          if (opts.length > 0) {
            filters.push({
              key: String(f.key),
              name: cleanText(f.name || f.key),
              defaultValue: opts[0].value,
              options: opts,
            });
          }
        }
        categories.push({ id: tid, name: tname, filters: filters });
      }

      const featured = []
        .concat(mapItems(tvRes).slice(0, 8))
        .concat(mapItems(movieRes).slice(0, 8))
        .concat(mapItems(animeRes).slice(0, 8))
        .slice(0, 24);

      return { categories: categories, featured: featured };
    },

    async category(payload) {
      const cfg = getCfg(payload && payload.config);
      const tid = String((payload && payload.categoryId) || "1").trim();
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10) || 1);
      if (isBlockedCategory(tid, "")) {
        return { items: [], page: page, totalPages: 1, hasMore: false };
      }

      const params = { ac: "list", t: tid, pg: String(page) };
      const filters = (payload && payload.filters) || {};
      const ks = Object.keys(filters);
      for (var i = 0; i < ks.length; i++) {
        const k = ks[i];
        const v = filters[k];
        if (v !== undefined && v !== null && v !== "" && v !== "__others__" && !isAdultText(v)) {
          params[k] = String(v);
        }
      }

      const data = await apiGet(cfg, params);
      const items = mapItems(data);
      const curPage = parseInt(data.page || page, 10) || page;
      const totalPages = Math.max(curPage, parseInt(data.pagecount || curPage, 10) || curPage);
      return {
        items: items,
        page: curPage,
        totalPages: totalPages,
        hasMore: curPage < totalPages,
      };
    },

    async search(payload) {
      const cfg = getCfg(payload && payload.config);
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10) || 1);
      const kw = String((payload && payload.keyword) || "").trim();
      if (!kw || isAdultText(kw)) {
        return { items: [], page: 1, totalPages: 1, hasMore: false };
      }
      const data = await apiGet(cfg, { ac: "search", wd: kw, pg: String(page) });
      const items = mapItems(data);
      const curPage = parseInt(data.page || page, 10) || page;
      const totalPages = Math.max(curPage, parseInt(data.pagecount || curPage, 10) || curPage);
      return {
        items: items,
        page: curPage,
        totalPages: totalPages,
        hasMore: curPage < totalPages,
      };
    },

    async detail(payload) {
      const cfg = getCfg(payload && payload.config);
      const vid = String((payload && payload.vodId) || "").trim();
      const data = await apiGet(cfg, { ac: "detail", ids: vid });
      const rows = (data && (data.list || data.vod)) || [];
      if (!Array.isArray(rows) || rows.length === 0) {
        return { vodId: vid, title: vid, sources: [] };
      }
      const it = rows[0];
      if (isBlockedItem(it)) {
        Host.raise("BLOCKED_CONTENT", "adult content is filtered");
      }

      const playFrom = String(it.vod_play_from || "");
      const playUrl = String(it.vod_play_url || "");
      let sources = [];
      if (playUrl) {
        try {
          sources = Host.text.parseDelimitedSources(playFrom, playUrl);
        } catch (_) {
          sources = [];
        }
        if (!Array.isArray(sources) || sources.length === 0) {
          sources = parseSourcesFallback(playFrom, playUrl);
        }
      }

      return {
        vodId: String(it.vod_id || vid),
        title: cleanText(it.vod_name || vid),
        subtitle: cleanText(it.vod_sub || "") || null,
        poster: cleanPoster(it.vod_pic),
        remark: cleanText(it.vod_remarks || "") || null,
        year: parseYear(it.vod_year),
        region: cleanText(it.vod_area || "") || null,
        genres: splitNames(it.vod_class || it.type_name || ""),
        actors: splitNames(it.vod_actor || ""),
        directors: splitNames(it.vod_director || ""),
        synopsis: cleanText(it.vod_content || it.vod_blurb || "") || null,
        sources: sources,
      };
    },

    async play(payload) {
      const cfg = getCfg(payload && payload.config);
      const headers = { Referer: cfg.host + "/" };
      let url = String((payload && payload.playData) || "").trim();
      if (url.startsWith("//")) url = "https:" + url;
      if (/^https?:\/\//i.test(url) && /\.(m3u8|mp4|flv|mkv|ts|mpd)([?#]|$)/i.test(url)) {
        return { streams: [{ label: "默认线路", url: url, userAgent: UA, headers: headers }] };
      }
      const m = /https?:\/\/[^\s"'<>]+?\.(?:m3u8|mp4)[^\s"'<>]*/i.exec(url);
      if (m) {
        return { streams: [{ label: "默认线路", url: m[0], userAgent: UA, headers: headers }] };
      }
      if (!url) Host.raise("NO_STREAM", "empty ecohub playData");
      return { streams: [{ label: "默认线路", url: url, userAgent: UA, headers: headers }] };
    },
  };
})();
