// Ported from duboku.py -> LiveDeck script_js (QuickJS Sandbox)
(function () {
  const DEFAULT_HOST = "https://api.dbokutv.com";
  const DEFAULT_REFERER = "https://www.duboku.tv/";
  const PLAY_ORIGIN = "https://w.duboku.io";
  const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";
  const PLAY_UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

  const CHANNELS = [
    { id: "2", name: "连续剧", kind: "series" },
    { id: "3", name: "综艺", kind: "variety" },
    { id: "1", name: "电影", kind: "movie" },
    { id: "4", name: "动漫", kind: "anime" },
  ];

  const KIND_MAP = {
    "1": "movie",
    "2": "series",
    "3": "variety",
    "4": "anime",
  };

  const NSFW_RE = /(伦理|福利|成人|情色|里番|禁片|三级片|午夜场|色情|女优|18\+|R18|NSFW|Hentai|\bAV\b)/i;

  function getCfg(config) {
    const c = config || {};
    const host = String(c.host || c.url || DEFAULT_HOST).trim().replace(/\/+$/, "") || DEFAULT_HOST;
    const referer = String(c.referer || DEFAULT_REFERER).trim() || DEFAULT_REFERER;
    return { host: host, referer: referer };
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
    if (Array.isArray(raw)) {
      return raw.map(function (x) { return cleanText(x); }).filter(Boolean);
    }
    return cleanText(raw)
      .split(/[,，/]+/)
      .map(function (s) { return s.trim(); })
      .filter(Boolean);
  }

  function isSafeItem(item) {
    const text = [
      item && item.title,
      item && item.remark,
      Array.isArray(item && item.genres) ? item.genres.join(" ") : "",
    ].join(" ");
    return !NSFW_RE.test(text);
  }

  function decodeToken(data) {
    if (!data || typeof data !== "string") return "";
    const stripped = data.replace(/^['"]+|['"]+$/g, "");
    if (!stripped) return "";
    const segLen = 10;
    let processed = "";
    for (var i = 0; i < stripped.length; i += segLen) {
      const seg = stripped.slice(i, i + segLen);
      processed += seg.split("").reverse().join("");
    }
    processed = processed.replace(/\./g, "=");
    const rem = processed.length % 4;
    if (rem !== 0) {
      processed += "====".slice(0, 4 - rem);
    }
    try {
      return Host.crypto.base64Decode(processed);
    } catch (_) {
      return "";
    }
  }

  function interleaveStrings(a, b) {
    let out = "";
    const minLen = Math.min(a.length, b.length);
    for (var i = 0; i < minLen; i++) {
      out += a.charAt(i) + b.charAt(i);
    }
    out += a.slice(minLen) + b.slice(minLen);
    return out;
  }

  function randomString(len) {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let out = "";
    for (var i = 0; i < len; i++) {
      out += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return out;
  }

  function signUrl(raw) {
    const randomNumber = Math.floor(Math.random() * 800000001);
    const valueA = randomNumber + 100000000;
    const valueB = 900000000 - randomNumber;
    const tsStr = String(Math.floor(Host.time.nowMillis() / 1000));
    const interleaved = interleaveStrings(String(valueA) + String(valueB), tsStr);
    const ssid = Host.crypto.base64Encode(interleaved).replace(/=/g, ".");
    const randomSign = randomString(60);
    const randomToken = randomString(38);
    return raw + "?sign=" + randomSign + "&token=" + randomToken + "&ssid=" + ssid;
  }

  async function apiGetJson(cfg, url) {
    try {
      const resp = await Host.http.get(url, {
        headers: {
          "User-Agent": UA,
          Referer: cfg.referer,
          Accept: "application/json, text/plain, */*",
        },
        insecureTls: true,
        timeout: 15,
      });
      if (!resp || !resp.ok) return null;
      return resp.json();
    } catch (_) {
      return null;
    }
  }

  function mapItem(raw, defaultKind) {
    if (!raw || typeof raw !== "object") return null;
    const vodId = decodeToken(raw.DId || raw.DuId || "");
    const title = cleanText(raw.Name || "");
    if (!vodId || !title) return null;
    const posterRaw = decodeToken(raw.TnId || "").trim();
    const poster = posterRaw || null;
    const remark = cleanText(raw.Tag || "") || null;
    const rating = raw.Rating !== undefined && raw.Rating !== null && String(raw.Rating).trim() !== ""
      ? String(raw.Rating).trim()
      : null;
    const item = {
      vodId: vodId,
      title: title,
      poster: poster,
      remark: remark,
      rating: rating,
      kind: defaultKind || null,
    };
    return isSafeItem(item) ? item : null;
  }

  globalThis.LiveDeckVod = {
    async home(payload) {
      const cfg = getCfg(payload && payload.config);
      const data = await apiGetJson(cfg, signUrl(cfg.host + "/home"));
      const featured = [];
      const seen = Object.create(null);
      if (Array.isArray(data)) {
        for (var i = 0; i < data.length; i++) {
          const group = data[i];
          const vlist = (group && group.VodList) || [];
          for (var j = 0; j < vlist.length; j++) {
            const item = mapItem(vlist[j], null);
            if (!item || seen[item.vodId]) continue;
            seen[item.vodId] = true;
            featured.push(item);
          }
        }
      }
      return {
        categories: CHANNELS.filter(function (c) {
          return !NSFW_RE.test(c.name);
        }).map(function (c) {
          return { id: c.id, name: c.name, filters: [] };
        }),
        featured: featured.slice(0, 48),
      };
    },

    async category(payload) {
      const cfg = getCfg(payload && payload.config);
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10) || 1);
      const tid = String((payload && payload.categoryId) || "2").trim();
      const pagePart = page === 1 ? "" : String(page);
      const url = signUrl(cfg.host + "/vodshow/" + tid + "--------" + pagePart + "---");
      const data = await apiGetJson(cfg, url);
      const items = [];
      const kind = KIND_MAP[tid] || null;
      const vlist = (data && data.VodList) || [];
      if (Array.isArray(vlist)) {
        for (var i = 0; i < vlist.length; i++) {
          const item = mapItem(vlist[i], kind);
          if (item) items.push(item);
        }
      }
      let pagecount = 0;
      const plist = (data && data.PaginationList) || [];
      if (Array.isArray(plist)) {
        for (var j = 0; j < plist.length; j++) {
          const p = plist[j];
          if (p && p.Type === "StartEnd") {
            const decoded = decodeToken(p.PId || p.PuId || "");
            const parts = decoded.split("-");
            const n = parseInt(parts[8] || "0", 10);
            if (n > 0) pagecount = n;
          }
        }
        if (pagecount === 0) {
          for (var k = 0; k < plist.length; k++) {
            const p2 = plist[k];
            if (p2 && p2.Type === "ShortPage" && p2.Name) {
              const parts2 = String(p2.Name).split("/");
              const n2 = parseInt(parts2[1] || "0", 10);
              if (n2 > 0) pagecount = n2;
            }
          }
        }
      }
      if (pagecount <= 0) pagecount = items.length > 0 ? page : 1;
      return {
        items: items,
        page: page,
        totalPages: pagecount,
        hasMore: page < pagecount,
      };
    },

    async search(payload) {
      const cfg = getCfg(payload && payload.config);
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10) || 1);
      const kw = String((payload && payload.keyword) || "").trim();
      if (!kw) return { items: [], page: page, totalPages: 1, hasMore: false };
      const url = signUrl(cfg.host + "/vodsearch") + "&wd=" + Host.codec.urlEncode(kw);
      const data = await apiGetJson(cfg, url);
      const items = [];
      if (Array.isArray(data)) {
        for (var i = 0; i < data.length; i++) {
          const item = mapItem(data[i], null);
          if (item) items.push(item);
        }
      }
      return {
        items: items,
        page: page,
        totalPages: page,
        hasMore: false,
      };
    },

    async detail(payload) {
      const cfg = getCfg(payload && payload.config);
      const rawId = String((payload && payload.vodId) || "").trim();
      const path = rawId.startsWith("/") ? rawId : "/" + rawId;
      const data = await apiGetJson(cfg, signUrl(cfg.host + path));
      if (!data || typeof data !== "object") {
        return { vodId: rawId, title: rawId, sources: [] };
      }

      const episodes = [];
      const playlist = Array.isArray(data.Playlist) ? data.Playlist : [];
      for (var i = 0; i < playlist.length; i++) {
        const ep = playlist[i];
        if (!ep) continue;
        const vidUrl = decodeToken(ep.VId || "");
        if (!vidUrl) continue;
        const epName = cleanText(ep.EpisodeName || "") || "第" + (episodes.length + 1) + "集";
        episodes.push({
          episodeId: String(episodes.length + 1),
          name: epName,
          index: episodes.length,
          playData: vidUrl,
        });
      }

      const posterRaw = decodeToken(data.TnId || "").trim();
      const ratingStr =
        data.Rating !== undefined && data.Rating !== null && String(data.Rating).trim() !== ""
          ? String(data.Rating).trim()
          : "";
      const genres = []
        .concat(splitNames(data.Genre))
        .concat(splitNames(data.Scenario))
        .concat(splitNames(data.Language));

      return {
        vodId: rawId,
        title: cleanText(data.Name || "") || rawId,
        poster: posterRaw || null,
        remark: ratingStr ? "评分：" + ratingStr : null,
        rating: ratingStr || null,
        year: parseYear(data.ReleaseYear),
        region: cleanText(data.Region || "") || null,
        genres: genres,
        actors: splitNames(data.Actor),
        directors: splitNames(data.Director),
        synopsis: cleanText(data.Description || "") || null,
        sources:
          episodes.length > 0
            ? [{ sourceId: "duboku", name: "独播库", episodes: episodes }]
            : [],
      };
    },

    async play(payload) {
      const cfg = getCfg(payload && payload.config);
      const videoPath = String((payload && payload.playData) || "").trim();
      if (!videoPath) {
        Host.raise("INVALID_PLAY_DATA", "empty duboku playData");
      }
      const path = videoPath.startsWith("/") ? videoPath : "/" + videoPath;
      const res = await apiGetJson(cfg, signUrl(cfg.host + path));
      const streamUrl = decodeToken((res && res.HId) || "");
      if (!streamUrl) {
        Host.raise("NO_STREAM", "duboku failed to decode stream URL for " + videoPath);
      }
      return {
        streams: [
          {
            label: "默认线路",
            url: streamUrl,
            userAgent: PLAY_UA,
            headers: {
              Origin: PLAY_ORIGIN,
              Referer: PLAY_ORIGIN + "/",
            },
          },
        ],
      };
    },
  };
})();
