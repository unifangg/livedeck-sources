// Ported from feiliu.py -> LiveDeck script_js (QuickJS Sandbox)
(function () {
  const DEFAULT_HOST = "https://www.flixflop.com";
  const UA =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36";

  const NSFW_RE = /(伦理|福利|成人|情色|里番|禁片|三级片|午夜场|色情|女优|18\+|R18|NSFW|Hentai|\bAV\b)/i;

  function getCfg(config) {
    const c = config || {};
    const host = String(c.host || c.url || DEFAULT_HOST).trim().replace(/\/+$/, "") || DEFAULT_HOST;
    const apiBase = String(c.api || host + "/api/v1").trim().replace(/\/+$/, "");
    return { host: host, apiBase: apiBase };
  }

  function cleanText(raw) {
    return String(raw || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/\s+/g, " ")
      .trim();
  }

  function parseYear(raw) {
    const m = /(\d{4})/.exec(String(raw || ""));
    if (!m) return null;
    const n = parseInt(m[1], 10);
    return n >= 1900 && n <= 2100 ? n : null;
  }

  function splitNames(raw) {
    return cleanText(raw)
      .split(/[,，/]+/)
      .map(function (s) { return s.trim(); })
      .filter(Boolean);
  }

  function inferKind(name) {
    const s = String(name || "");
    if (s.indexOf("电影") >= 0) return "movie";
    if (s.indexOf("动漫") >= 0 || s.indexOf("动画") >= 0) return "anime";
    if (s.indexOf("综艺") >= 0) return "variety";
    if (s.indexOf("纪录") >= 0) return "documentary";
    if (s.indexOf("剧") >= 0) return "series";
    return null;
  }

  function isSafeItem(item) {
    const text = [
      item && item.title,
      item && item.remark,
      Array.isArray(item && item.genres) ? item.genres.join(" ") : "",
    ].join(" ");
    return !NSFW_RE.test(text);
  }

  function absPic(host, p) {
    const s = String(p || "").trim();
    if (!s) return null;
    if (s.startsWith("//")) return "https:" + s;
    if (/^https?:\/\//i.test(s)) return s;
    return host + (s.startsWith("/") ? s : "/" + s);
  }

  async function apiGet(cfg, path, params) {
    try {
      const resp = await Host.http.get(cfg.apiBase + path, {
        params: params || undefined,
        headers: {
          Accept: "application/json, text/plain, */*",
          "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
          "User-Agent": UA,
          Referer: cfg.host + "/",
        },
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

  function mapItem(cfg, raw, defaultKind) {
    if (!raw || typeof raw !== "object") return null;
    const vid = String(raw.video_id || "").trim();
    const title = cleanText(raw.title || "");
    if (!vid || !title) return null;
    const item = {
      vodId: vid,
      title: title,
      poster: absPic(cfg.host, raw.cover_image),
      remark: cleanText(raw.remarks || "") || null,
      year: parseYear(raw.published_year),
      kind: defaultKind || null,
    };
    return isSafeItem(item) ? item : null;
  }

  function buildFilterGroups(fdata) {
    const groups = [];
    const areas = Array.isArray(fdata.areas) ? fdata.areas : [];
    if (areas.length > 0) {
      groups.push({
        key: "area",
        name: "地区",
        defaultValue: "",
        options: [{ value: "", label: "全部" }].concat(
          areas.map(function (a) {
            return { value: String(a.area_id || ""), label: cleanText(a.name) };
          })
        ),
      });
    }

    const genres = Array.isArray(fdata.genres)
      ? fdata.genres.filter(function (g) { return g && !NSFW_RE.test(String(g.name || "")); })
      : [];
    if (genres.length > 1) {
      groups.push({
        key: "genre",
        name: "类型",
        defaultValue: "",
        options: [{ value: "", label: "全部" }].concat(
          genres.map(function (g) {
            return { value: String(g.genre_id || ""), label: cleanText(g.name) };
          })
        ),
      });
    }

    const years = Array.isArray(fdata.published_years) ? fdata.published_years : [];
    const validYears = years.filter(function (y) {
      return typeof y === "number" && y >= 1900 && y <= 2100;
    });
    if (validYears.length > 0) {
      groups.push({
        key: "year",
        name: "年份",
        defaultValue: "",
        options: [{ value: "", label: "全部" }].concat(
          validYears.map(function (y) {
            return { value: String(y), label: String(y) };
          })
        ),
      });
    }

    const langs = Array.isArray(fdata.languages) ? fdata.languages : [];
    if (langs.length > 0) {
      groups.push({
        key: "language",
        name: "语言",
        defaultValue: "",
        options: [{ value: "", label: "全部" }].concat(
          langs.map(function (l) {
            return { value: String(l.language_id || ""), label: cleanText(l.name) };
          })
        ),
      });
    }

    return groups;
  }

  function parseEpisodesFromString(urlStr) {
    const s = String(urlStr || "").trim();
    if (!s) return [];
    const parts = s.split("#");
    const eps = [];
    for (var i = 0; i < parts.length; i++) {
      const part = parts[i].trim();
      if (!part) continue;
      const idx = part.indexOf("$");
      let name = "";
      let playUrl = "";
      if (idx >= 0) {
        name = cleanText(part.slice(0, idx)) || "第" + (eps.length + 1) + "集";
        playUrl = part.slice(idx + 1).trim();
      } else {
        name = parts.length === 1 ? "正片" : "第" + (eps.length + 1) + "集";
        playUrl = part;
      }
      if (playUrl) {
        eps.push({
          episodeId: String(eps.length + 1),
          name: name,
          index: eps.length,
          playData: playUrl,
        });
      }
    }
    return eps;
  }

  globalThis.LiveDeckVod = {
    async home(payload) {
      const cfg = getCfg(payload && payload.config);
      const catsRes = await apiGet(cfg, "/categories");
      const rawCats = Array.isArray(catsRes.data) ? catsRes.data : [];
      const cats = rawCats.filter(function (c) {
        return c && c.category_id && c.name && !NSFW_RE.test(String(c.name));
      });

      const filterPromises = cats.map(function (c) {
        return apiGet(cfg, "/explore/" + c.category_id + "/filters");
      });
      const dailyPromise = apiGet(cfg, "/landing/recommendations/daily");

      const allResults = await Promise.all([dailyPromise].concat(filterPromises));
      const dailyData = allResults[0];

      const categories = [];
      for (var i = 0; i < cats.length; i++) {
        const c = cats[i];
        const fRes = allResults[i + 1];
        const fdata = (fRes && fRes.data) || {};
        categories.push({
          id: String(c.category_id),
          name: cleanText(c.name),
          filters: buildFilterGroups(fdata),
        });
      }

      let featured = [];
      const dailyList = Array.isArray(dailyData && dailyData.data) ? dailyData.data : [];
      for (var j = 0; j < dailyList.length; j++) {
        const item = mapItem(cfg, dailyList[j], null);
        if (item) featured.push(item);
      }
      if (featured.length === 0 && cats.length > 0) {
        const cid = cats[0].category_id;
        const wk = await apiGet(cfg, "/landing/" + cid + "/recommendations/weekly");
        const latest = (wk && wk.data && wk.data.latest) || [];
        const kind = inferKind(cats[0].name);
        for (var k = 0; k < latest.length; k++) {
          const item = mapItem(cfg, latest[k], kind);
          if (item) featured.push(item);
        }
      }

      return { categories: categories, featured: featured };
    },

    async category(payload) {
      const cfg = getCfg(payload && payload.config);
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10) || 1);
      const tid = String((payload && payload.categoryId) || "").trim();
      const filters = (payload && payload.filters) || {};
      const params = { page: String(page) };
      const keys = ["area", "genre", "year", "language"];
      for (var i = 0; i < keys.length; i++) {
        const val = String(filters[keys[i]] || "").trim();
        if (val) params[keys[i]] = val;
      }

      const apiData = await apiGet(cfg, "/explore/" + Host.codec.urlEncode(tid), params);
      const meta = (apiData && apiData.meta) || {};
      const total = parseInt(meta.count || 0, 10) || 0;
      const rows = Array.isArray(apiData && apiData.data) ? apiData.data : [];
      const items = [];
      for (var j = 0; j < rows.length; j++) {
        const item = mapItem(cfg, rows[j], null);
        if (item) items.push(item);
      }
      const totalPages = total > 0 ? Math.max(1, Math.ceil(total / 12)) : page;
      return {
        items: items,
        page: page,
        totalPages: totalPages,
        hasMore: total > 0 ? page < totalPages : items.length >= 12,
      };
    },

    async search(payload) {
      const cfg = getCfg(payload && payload.config);
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10) || 1);
      const kw = String((payload && payload.keyword) || "").trim();
      if (!kw) return { items: [], page: page, totalPages: 1, hasMore: false };
      if (page > 1) return { items: [], page: page, totalPages: 1, hasMore: false };

      const apiData = await apiGet(cfg, "/explore/search", { query: kw });
      const rows = Array.isArray(apiData && apiData.data) ? apiData.data : [];
      const items = [];
      for (var i = 0; i < rows.length; i++) {
        const item = mapItem(cfg, rows[i], null);
        if (item) items.push(item);
      }
      return {
        items: items,
        page: page,
        totalPages: 1,
        hasMore: false,
      };
    },

    async detail(payload) {
      const cfg = getCfg(payload && payload.config);
      const vid = String((payload && payload.vodId) || "").trim();
      const pair = await Promise.all([
        apiGet(cfg, "/videos/" + Host.codec.urlEncode(vid) + "/metadata"),
        apiGet(cfg, "/videos/" + Host.codec.urlEncode(vid) + "/sources"),
      ]);
      const data = (pair[0] && pair[0].data) || {};
      const rawSources = Array.isArray(pair[1] && pair[1].data) ? pair[1].data : [];

      const actors = Array.isArray(data.actors)
        ? data.actors.map(function (a) { return cleanText(a && a.name); }).filter(Boolean)
        : [];
      const directors = Array.isArray(data.directors)
        ? data.directors.map(function (d) { return cleanText(d && d.name); }).filter(Boolean)
        : [];

      const sources = [];
      for (var i = 0; i < rawSources.length; i++) {
        const src = rawSources[i];
        if (!src || !src.name || !src.url) continue;
        const eps = parseEpisodesFromString(src.url);
        if (eps.length > 0) {
          sources.push({
            sourceId: "src-" + (i + 1),
            name: cleanText(src.name) || "线路" + (i + 1),
            episodes: eps,
          });
        }
      }

      return {
        vodId: vid,
        title: cleanText(data.title || "") || vid,
        poster: absPic(cfg.host, data.cover_image),
        remark: cleanText(data.remarks || "") || null,
        year: parseYear(data.published_year),
        region: cleanText(data.area || "") || null,
        genres: splitNames(data.genre || data.category || ""),
        actors: actors,
        directors: directors,
        synopsis: cleanText(data.description || "") || null,
        kind: inferKind(data.category || data.genre),
        sources: sources,
      };
    },

    async play(payload) {
      const cfg = getCfg(payload && payload.config);
      const u = String((payload && payload.playData) || "").trim();
      if (!u) {
        Host.raise("INVALID_PLAY_DATA", "empty feiliu playData");
      }
      return {
        streams: [
          {
            label: "默认线路",
            url: u,
            userAgent: UA,
            headers: {
              Referer: cfg.host + "/",
            },
          },
        ],
      };
    },
  };
})();
