// Ported from kuwoduanju.py -> LiveDeck script_js (QuickJS Sandbox)
(function () {
  const DEFAULT_HOST = "http://wapi.kuwo.cn";
  const DEFAULT_PLAY_HOST = "http://nmobi.kuwo.cn";
  const UA =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1";

  const CLASSES = [
    ["10", "热门短剧"],
    ["11", "都市情感"],
    ["12", "逆袭爽剧"],
    ["13", "甜宠爱情"],
    ["14", "古装穿越"],
    ["15", "战神霸总"],
    ["16", "更多精选"],
  ];

  function getCfg(config) {
    const c = config || {};
    return {
      host: String(c.host || DEFAULT_HOST).trim().replace(/\/+$/, "") || DEFAULT_HOST,
      playHost: String(c.playHost || DEFAULT_PLAY_HOST).trim().replace(/\/+$/, "") || DEFAULT_PLAY_HOST,
    };
  }

  function cleanPoster(raw) {
    const s = String(raw || "").trim();
    return s || null;
  }

  function cleanText(raw) {
    return String(raw || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }

  async function httpGetText(url) {
    try {
      const resp = await Host.http.get(url, {
        headers: {
          "User-Agent": UA,
          Accept: "*/*",
          Referer: "http://www.kuwo.cn/",
        },
        insecureTls: true,
        timeout: 12,
      });
      return resp && resp.ok ? resp.bodyText || resp.body || "" : "";
    } catch (_) {
      return "";
    }
  }

  async function httpGetJson(url) {
    const text = await httpGetText(url);
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (_) {
      return null;
    }
  }

  async function fetchCategoryPage(host, mid, page) {
    const url =
      host +
      "/openapi/v1/shortplay/moduleMore?currentPage=" +
      page +
      "&moduleId=" +
      Host.codec.urlEncode(mid) +
      "&rn=12";
    const data = await httpGetJson(url);
    const items = [];
    let totalPages = 1;
    if (data && typeof data === "object") {
      const body = data.data && typeof data.data === "object" ? data.data : data;
      const raw = Array.isArray(body.list) ? body.list : [];
      totalPages = Math.max(page, parseInt(body.pages || 1, 10) || 1);
      for (var i = 0; i < raw.length; i++) {
        const it = raw[i];
        if (!it) continue;
        let aid = String(it.url || it.albumId || "").trim();
        if (!aid && it.routeData) {
          try {
            const rd = typeof it.routeData === "string" ? JSON.parse(it.routeData) : it.routeData;
            aid = String((rd && rd.params && rd.params.albumId) || "").trim();
          } catch (_) {}
        }
        if (!aid || !it.title) continue;
        items.push({
          vodId: aid,
          title: cleanText(it.title),
          poster: cleanPoster(it.img),
          remark: cleanText(it.currrentDesc || it.subTitle || "") || null,
          kind: "series",
        });
      }
    }
    return {
      items: items,
      page: page,
      totalPages: totalPages,
      hasMore: page < totalPages,
    };
  }

  globalThis.LiveDeckVod = {
    async home(payload) {
      const cfg = getCfg(payload && payload.config);
      const res = await fetchCategoryPage(cfg.host, "10", 1);
      return {
        categories: CLASSES.map(function (c) {
          return { id: c[0], name: c[1], filters: [] };
        }),
        featured: res.items,
      };
    },

    async category(payload) {
      const cfg = getCfg(payload && payload.config);
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10) || 1);
      const mid = String((payload && payload.categoryId) || "10").trim();
      return fetchCategoryPage(cfg.host, mid, page);
    },

    async search(payload) {
      const cfg = getCfg(payload && payload.config);
      const kw = String((payload && payload.keyword) || "").trim().toLowerCase();
      if (!kw) return { items: [], page: 1, totalPages: 1, hasMore: false };

      const pages = await Promise.all(
        CLASSES.map(function (c) {
          return fetchCategoryPage(cfg.host, c[0], 1);
        })
      );
      const items = [];
      const seen = Object.create(null);
      for (var i = 0; i < pages.length; i++) {
        const list = (pages[i] && pages[i].items) || [];
        for (var j = 0; j < list.length; j++) {
          const it = list[j];
          if (seen[it.vodId]) continue;
          if (it.title.toLowerCase().indexOf(kw) >= 0) {
            seen[it.vodId] = true;
            items.push(it);
          }
        }
      }
      return { items: items, page: 1, totalPages: 1, hasMore: false };
    },

    async detail(payload) {
      const cfg = getCfg(payload && payload.config);
      const albumId = String((payload && payload.vodId) || "").trim();
      if (!albumId) return { vodId: "", title: "", sources: [] };
      const data = await httpGetJson(
        cfg.host + "/openapi/v1/shortplay/videoList?albumId=" + Host.codec.urlEncode(albumId)
      );
      if (!data || typeof data !== "object") {
        return { vodId: albumId, title: "短剧" + albumId, sources: [] };
      }
      const body = data.data && typeof data.data === "object" ? data.data : data;
      const shortinfo = body.shortinfo && typeof body.shortinfo === "object" ? body.shortinfo : {};
      const epsRaw = Array.isArray(body.list) ? body.list : [];

      const episodes = [];
      for (var i = 0; i < epsRaw.length; i++) {
        const ep = epsRaw[i];
        if (!ep) continue;
        const mp = ep.mvpayinfo || {};
        const vid = mp.vid || ep.vid || ep.id;
        if (!vid) continue;
        episodes.push({
          episodeId: String(vid),
          name: cleanText(ep.name || "") || "第" + (i + 1) + "集",
          index: episodes.length,
          playData: String(vid),
        });
      }

      return {
        vodId: albumId,
        title: cleanText(shortinfo.title || shortinfo.name || "") || "短剧" + albumId,
        poster: cleanPoster(shortinfo.img || shortinfo.cover),
        remark: cleanText(shortinfo.currrentDesc || "") || null,
        actors: [],
        directors: [],
        synopsis: cleanText(shortinfo.description || shortinfo.subTitle || "") || null,
        kind: "series",
        sources:
          episodes.length > 0
            ? [{ sourceId: "kuwo", name: "酷我短剧", episodes: episodes }]
            : [],
      };
    },

    async play(payload) {
      const cfg = getCfg(payload && payload.config);
      const headers = { Referer: "http://www.kuwo.cn/" };
      let vid = String((payload && payload.playData) || "").trim();
      if (vid.indexOf("$") >= 0) vid = vid.split("$").pop().trim();
      if (!vid) Host.raise("INVALID_PLAY_DATA", "missing kuwo vid");

      if (/^https?:\/\//i.test(vid) && /\.(mp4|m3u8|flv|mkv)(\?|$)/i.test(vid)) {
        return { streams: [{ label: "默认线路", url: vid, userAgent: UA, headers: headers }] };
      }

      const text = await httpGetText(
        cfg.playHost + "/mobi.s?f=web&type=get_url_by_vid&vid=" + Host.codec.urlEncode(vid)
      );
      let playUrl = "";
      const m = /url=(https?:\/\/[^\s\r\n]+)/.exec(text);
      if (m) {
        playUrl = m[1].trim();
      } else if (text) {
        const lines = text.replace(/\r/g, "\n").split("\n");
        for (var i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (line.startsWith("url=")) {
            playUrl = line.slice(4).trim();
            break;
          }
        }
      }
      if (!playUrl) {
        Host.raise("NO_STREAM", "kuwoduanju failed to resolve vid " + vid);
      }
      return { streams: [{ label: "默认线路", url: playUrl, userAgent: UA, headers: headers }] };
    },
  };
})();
