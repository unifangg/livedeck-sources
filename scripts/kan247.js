// Ported from kan247.js -> LiveDeck script_js (QuickJS Sandbox)
(function () {
  const DEFAULT_HOST = "https://247kan.com";
  const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36";

  const CATEGORIES = [
    ["1", "电影", "movie"],
    ["2", "连续剧", "series"],
    ["3", "综艺", "variety"],
    ["4", "动漫", "anime"],
    ["5", "短剧", "series"],
    ["6", "纪录片", "documentary"],
  ];

  const DIRECT_EXT_RE = /\.(m3u8|mp4|flv|m4s|mkv)(\?.*)?$/i;
  const WEB_VIP_RE = /^(youku|qq|iqiyi|qiyi|mgtv|bilibili|sohu|pptv)$/i;

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

  function parseYear(raw) {
    const m = /(\d{4})/.exec(String(raw || ""));
    if (!m) return null;
    const n = parseInt(m[1], 10);
    return n >= 1900 && n <= 2100 ? n : null;
  }

  function splitNames(raw) {
    return String(raw || "")
      .split(/[,，/\s]+/)
      .map(function (s) {
        return s.trim();
      })
      .filter(Boolean);
  }

  function kindForCategory(tid) {
    for (var i = 0; i < CATEGORIES.length; i++) {
      if (CATEGORIES[i][0] === String(tid)) return CATEGORIES[i][2];
    }
    return null;
  }

  async function apiGet(host, path, params) {
    try {
      const resp = await Host.http.get(host + path, {
        params: params || {},
        headers: {
          "User-Agent": UA,
          Accept: "application/json, text/plain, */*",
          "Accept-Language": "zh-CN,zh;q=0.9",
          Referer: host + "/",
        },
        insecureTls: true,
        timeout: 15,
      });
      if (!resp || !resp.ok) return {};
      const parsed = resp.json();
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function mapVideos(host, rows, kind) {
    const out = [];
    if (!Array.isArray(rows)) return out;
    for (var i = 0; i < rows.length; i++) {
      const it = rows[i];
      if (!it || !it.vod_id || !it.vod_name) continue;
      out.push({
        vodId: String(it.vod_id),
        title: String(it.vod_name),
        poster: absUrl(host, it.vod_pic),
        remark: it.vod_remarks ? String(it.vod_remarks) : null,
        year: parseYear(it.vod_year),
        region: it.vod_area ? String(it.vod_area) : null,
        genres: it.type_name ? splitNames(it.type_name) : [],
        kind: kind || null,
      });
    }
    return out;
  }

  globalThis.LiveDeckVod = {
    async home(payload) {
      const host = getHost(payload && payload.config);
      const json = await apiGet(host, "/api/home", {});
      const data = json.data || {};
      const rows = data.featured || data.latest || [];
      return {
        categories: CATEGORIES.map(function (c) {
          return { id: c[0], name: c[1], filters: [] };
        }),
        featured: mapVideos(host, rows, null),
      };
    },

    async category(payload) {
      const host = getHost(payload && payload.config);
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10));
      const tid = String((payload && payload.categoryId) || "1").trim();
      const json = await apiGet(host, "/api/videos", {
        type_id: tid,
        page: String(page),
        limit: "20",
      });
      const data = json.data || {};
      const items = mapVideos(host, data.videos || [], kindForCategory(tid));
      const total = parseInt((data.pagination && data.pagination.total) || data.total || 0, 10) || 0;
      const totalPages = total > 0 ? Math.max(1, Math.ceil(total / 20)) : items.length >= 20 ? page + 1 : page;
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
      const json = await apiGet(host, "/api/videos", {
        page: String(page),
        limit: "20",
        search: kw,
      });
      const data = json.data || {};
      const items = mapVideos(host, data.videos || [], null);
      const total =
        parseInt((data.pagination && data.pagination.total) || data.total || items.length, 10) ||
        items.length;
      const totalPages = Math.max(1, Math.ceil(total / 20));
      return {
        items: items,
        page: page,
        totalPages: totalPages,
        hasMore: page < totalPages,
      };
    },

    async detail(payload) {
      const host = getHost(payload && payload.config);
      const raw = String((payload && payload.vodId) || "").trim();
      const vm = /(\d+)/.exec(raw);
      const vid = vm ? vm[1] : raw;
      const json = await apiGet(host, "/api/videos/" + vid, {});
      const data = json.data || {};

      const directSources = [];
      const fallbackSources = [];

      if (Array.isArray(data.episodes) && data.episodes.length > 0) {
        const routeOrder = [];
        const routeMap = Object.create(null);
        for (var i = 0; i < data.episodes.length; i++) {
          const ep = data.episodes[i];
          if (!ep || !ep.url) continue;
          const route = String(ep.route || "默认线路");
          if (!routeMap[route]) {
            routeMap[route] = [];
            routeOrder.push(route);
          }
          routeMap[route].push({
            name: String(ep.name || "第" + (ep.episode || routeMap[route].length + 1) + "集"),
            epNum: parseInt(ep.episode_number || ep.episode || 0, 10) || 0,
            url: String(ep.url).trim(),
          });
        }

        for (var r = 0; r < routeOrder.length; r++) {
          const routeName = routeOrder[r];
          if (WEB_VIP_RE.test(routeName)) continue;
          const list = routeMap[routeName];
          list.sort(function (a, b) {
            if (a.epNum !== b.epNum) return a.epNum - b.epNum;
            const an = parseInt((/(\d+)/.exec(a.name) || [0, 0])[1], 10) || 0;
            const bn = parseInt((/(\d+)/.exec(b.name) || [0, 0])[1], 10) || 0;
            return an - bn;
          });
          const eps = [];
          let directCount = 0;
          for (var e = 0; e < list.length; e++) {
            const u = absUrl(host, list[e].url) || list[e].url;
            if (DIRECT_EXT_RE.test(u)) directCount++;
            eps.push({
              episodeId: routeName + "-" + (e + 1),
              name: list[e].name,
              index: e,
              playData: u,
            });
          }
          if (eps.length === 0) continue;
          const srcObj = {
            sourceId: routeName,
            name: routeName,
            episodes: eps,
          };
          if (directCount > 0) directSources.push(srcObj);
          else fallbackSources.push(srcObj);
        }
      }

      const sources = directSources.length > 0 ? directSources : fallbackSources;
      return {
        vodId: String(data.vod_id || vid),
        title: String(data.vod_name || vid),
        poster: absUrl(host, data.vod_pic),
        remark: data.vod_remarks ? String(data.vod_remarks) : null,
        year: parseYear(data.vod_year),
        region: data.vod_area ? String(data.vod_area) : null,
        genres: data.type_name ? splitNames(data.type_name) : [],
        actors: splitNames(data.vod_actor),
        directors: splitNames(data.vod_director),
        synopsis: data.vod_content ? String(data.vod_content) : null,
        sources: sources,
      };
    },

    async play(payload) {
      const host = getHost(payload && payload.config);
      let playUrl = String((payload && payload.playData) || "").trim();
      if (!playUrl) Host.raise("NO_STREAM", "kan247 empty playData");
      playUrl = absUrl(host, playUrl) || playUrl;
      const headers = { Referer: host + "/" };

      if (DIRECT_EXT_RE.test(playUrl)) {
        return {
          streams: [{ label: "默认线路", url: playUrl, userAgent: UA, headers: headers }],
        };
      }

      try {
        const resp = await Host.http.get(playUrl, {
          headers: { "User-Agent": UA, Referer: host + "/" },
          insecureTls: true,
          timeout: 12,
        });
        const html = resp && resp.ok ? (resp.bodyText || resp.body || "").replace(/\\\//g, "/") : "";
        const mm =
          /"url"\s*:\s*"([^"]+\.(?:m3u8|mp4)[^"]*)"/i.exec(html) ||
          /"src"\s*:\s*"([^"]+\.(?:m3u8|mp4)[^"]*)"/i.exec(html) ||
          /(https?:\/\/[^\s"'<>\\]+\.(?:m3u8|mp4)[^\s"'<>\\]*)/i.exec(html);
        if (mm) {
          return {
            streams: [{ label: "默认线路", url: mm[1], userAgent: UA, headers: headers }],
          };
        }
      } catch (_) {}

      Host.raise("NO_STREAM", "kan247 could not extract direct stream from " + playUrl);
    },
  };
})();
