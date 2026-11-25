// Ported from kaiduan.py -> LiveDeck script_js (QuickJS Sandbox)
(function () {
  const DEFAULT_HOST = "https://api.kaiduan.fun";
  const UA =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_2; rv:107) Gecko/20100101 Firefox/98";
  const PLAY_UA = "ijkplayer/1.0.0 (Linux;Android 11) ExoPlayerLib/2.14.1";
  const AES_PREFIX = "AkEdSJx";
  const BLOCKED_RE = /(?:情色|伦理|福利|写真)/;

  const CATEGORIES = [
    { id: "电影", name: "电影", kind: "movie" },
    { id: "连续剧", name: "连续剧", kind: "series" },
    { id: "动漫", name: "动漫", kind: "anime" },
    { id: "短剧", name: "短剧", kind: "series" },
    { id: "综艺", name: "综艺", kind: "variety" },
    { id: "纪录片", name: "纪录片", kind: "documentary" },
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

  function parseYear(raw) {
    const m = /(\d{4})/.exec(String(raw || ""));
    if (!m) return null;
    const n = parseInt(m[1], 10);
    return n >= 1900 && n <= 2100 ? n : null;
  }

  function splitNames(raw) {
    if (Array.isArray(raw)) {
      return raw.map(function (s) { return cleanText(s); }).filter(Boolean);
    }
    return cleanText(raw)
      .split(/[、,，/\s]+/)
      .map(function (s) { return s.trim(); })
      .filter(Boolean);
  }

  function inferKind(catStr) {
    const s = String(catStr || "");
    if (s.indexOf("电影") >= 0) return "movie";
    if (s.indexOf("动漫") >= 0) return "anime";
    if (s.indexOf("综艺") >= 0) return "variety";
    if (s.indexOf("纪录") >= 0) return "documentary";
    if (s.indexOf("剧") >= 0) return "series";
    return null;
  }

  function decryptPayload(rawText) {
    const s = String(rawText || "").trim();
    if (!s.startsWith(AES_PREFIX)) return s;
    const decoded = Host.crypto.base64DecodeBytes(s.slice(AES_PREFIX.length));
    if (!Array.isArray(decoded) || decoded.length < 32) {
      Host.raise("CRYPTO_ERROR", "kaiduan encrypted payload too short");
    }
    const keyHex = Host.crypto.hexEncode(decoded.slice(0, 16));
    const ivHex = Host.crypto.hexEncode(decoded.slice(16, 32));
    const ctHex = Host.crypto.hexEncode(decoded.slice(32));
    return Host.crypto.aesDecrypt({
      data: ctHex,
      dataEncoding: "hex",
      key: keyHex,
      keyEncoding: "hex",
      iv: ivHex,
      ivEncoding: "hex",
      mode: "cbc",
      padding: "pkcs7",
      outputEncoding: "utf8",
    });
  }

  async function apiGet(host, path, params) {
    const url = /^https?:\/\//i.test(path) ? path : host + path;
    const resp = await Host.http.get(url, {
      params: params || undefined,
      headers: {
        "User-Agent": UA,
        Referer: host + "/",
      },
      insecureTls: true,
      timeout: 15,
    });
    if (!resp || !resp.ok) return null;
    const plain = decryptPayload(resp.bodyText || resp.body || "");
    if (!plain) return null;
    try {
      return JSON.parse(plain);
    } catch (_) {
      return null;
    }
  }

  function mapItems(arr) {
    const out = [];
    if (!Array.isArray(arr)) return out;
    for (var i = 0; i < arr.length; i++) {
      const it = arr[i];
      if (!it || typeof it !== "object") continue;
      const classify = String(it.classify || it.category || it.vodClass || "");
      if (BLOCKED_RE.test(classify)) continue;
      const vodId = it.url != null ? it.url : (it.vodId != null ? it.vodId : it.id);
      const title = cleanText(it.name || it.vodName || "");
      if (!vodId || !title) continue;
      const pic = String(it.pic || it.vodPic || "").trim();
      const remark = cleanText(it.remarks || it.vodRemarks || "");
      out.push({
        vodId: String(vodId),
        title: title,
        poster: pic || null,
        remark: remark || null,
        year: parseYear(it.year || it.vodYear),
        region: cleanText(it.area || it.vodArea) || null,
        genres: splitNames(classify),
        kind: inferKind(classify || it.parent_category),
      });
    }
    return out;
  }

  function parseEpisodesFromUrlsStr(sourceId, urlsStr) {
    const eps = [];
    const parts = String(urlsStr || "").split("#");
    for (var i = 0; i < parts.length; i++) {
      const seg = parts[i].trim();
      if (!seg) continue;
      const idx = seg.indexOf("$");
      const name = idx >= 0 ? cleanText(seg.slice(0, idx)) : "第" + (eps.length + 1) + "集";
      const playUrl = idx >= 0 ? seg.slice(idx + 1).trim() : seg;
      if (!playUrl) continue;
      eps.push({
        episodeId: sourceId + "-" + (eps.length + 1),
        name: name || "第" + (eps.length + 1) + "集",
        index: eps.length,
        playData: playUrl,
      });
    }
    return eps;
  }

  function headerLookup(headers, target) {
    if (!headers) return "";
    const low = target.toLowerCase();
    const keys = Object.keys(headers);
    for (var i = 0; i < keys.length; i++) {
      if (keys[i].toLowerCase() === low) return String(headers[keys[i]] || "");
    }
    return "";
  }

  globalThis.LiveDeckVod = {
    async home(payload) {
      const host = getHost(payload && payload.config);
      const data = await apiGet(host, "/user/movie/cms/v1/category", {
        count: "20",
        names: "电影,连续剧,动漫,短剧,综艺,纪录片",
        page: "1",
      });
      const featured = mapItems(data && data.datas);
      return {
        categories: CATEGORIES.map(function (c) {
          return { id: c.id, name: c.name, filters: [] };
        }),
        featured: featured,
      };
    },

    async category(payload) {
      const host = getHost(payload && payload.config);
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10) || 1);
      const tid = String((payload && payload.categoryId) || "电影").trim();
      const data = await apiGet(host, "/user/movie/cms/v1/category", {
        count: "20",
        names: tid,
        page: String(page),
      });
      const items = mapItems(data && data.datas);
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
      const data = await apiGet(host, "/user/movie/cms/v1/search", {
        name: kw,
        page: String(page),
        count: "10",
      });
      const list = (data && (data.datas || data.data)) || (Array.isArray(data) ? data : []);
      const items = mapItems(list);
      const hasMore = items.length >= 10;
      return {
        items: items,
        page: page,
        totalPages: hasMore ? page + 1 : page,
        hasMore: hasMore,
      };
    },

    async detail(payload) {
      const host = getHost(payload && payload.config);
      const vid = String((payload && payload.vodId) || "").trim();
      if (!vid) return { vodId: "", title: "", sources: [] };
      const path = /^https?:\/\//i.test(vid)
        ? vid
        : "/user/movie/cms/v1/play?id=" + Host.codec.urlEncode(vid);
      const raw = await apiGet(host, path);
      if (!raw || typeof raw !== "object") {
        return { vodId: vid, title: "影片 " + vid, sources: [] };
      }
      const d = raw.data && typeof raw.data === "object" ? raw.data : raw;
      const classify = String(d.classify || d.category || d.vodClass || "");
      if (BLOCKED_RE.test(classify)) {
        return { vodId: vid, title: cleanText(d.name || d.vodName || vid), sources: [] };
      }

      const sources = [];
      const epList = Array.isArray(d.episodes || d.episodeList) ? (d.episodes || d.episodeList) : [];
      const flatEps = [];
      for (var i = 0; i < epList.length; i++) {
        const item = epList[i];
        if (!item) continue;
        if (Array.isArray(item.episode)) {
          const lineName = cleanText(item.title || item.name || "线路" + (sources.length + 1));
          const sid = "s-" + (sources.length + 1);
          const eps = [];
          for (var j = 0; j < item.episode.length; j++) {
            const ep = item.episode[j];
            if (!ep || !ep.url) continue;
            eps.push({
              episodeId: sid + "-" + (eps.length + 1),
              name: cleanText(ep.name) || "第" + (eps.length + 1) + "集",
              index: eps.length,
              playData: String(ep.url).trim(),
            });
          }
          if (eps.length > 0) sources.push({ sourceId: sid, name: lineName, episodes: eps });
        } else if (item.url) {
          flatEps.push({
            episodeId: "line1-" + (flatEps.length + 1),
            name: cleanText(item.name) || "第" + (flatEps.length + 1) + "集",
            index: flatEps.length,
            playData: String(item.url).trim(),
          });
        }
      }
      if (flatEps.length > 0) {
        sources.push({ sourceId: "line1", name: "1线", episodes: flatEps });
      }
      if (sources.length === 0 && Array.isArray(raw.datas)) {
        for (var k = 0; k < raw.datas.length; k++) {
          const ds = raw.datas[k];
          if (!ds || !ds.urls) continue;
          const sid = "d-" + (k + 1);
          const eps = parseEpisodesFromUrlsStr(sid, ds.urls);
          if (eps.length > 0) {
            sources.push({
              sourceId: sid,
              name: cleanText(ds.name) || "线路" + (k + 1),
              episodes: eps,
            });
          }
        }
      }

      // Prefer direct playable / non-kdjx sources first
      sources.sort(function (a, b) {
        const aDirect = a.episodes[0] && /\/other\/jx\/v1\/redirect\//i.test(a.episodes[0].playData) ? 1 : 0;
        const bDirect = b.episodes[0] && /\/other\/jx\/v1\/redirect\//i.test(b.episodes[0].playData) ? 1 : 0;
        return aDirect - bDirect;
      });

      const pic = String(d.pic || d.vodPic || "").trim();
      return {
        vodId: vid,
        title: cleanText(d.name || d.vodName || "") || "影片 " + vid,
        poster: pic || null,
        remark: cleanText(d.remarks || d.vodRemarks) || null,
        year: parseYear(d.year || d.vodYear),
        region: cleanText(d.area || d.vodArea) || null,
        genres: splitNames(classify),
        actors: splitNames(d.actor || d.vodActor),
        directors: splitNames(d.director || d.vodDirector),
        synopsis: cleanText(d.details || d.vodContent || d.content) || null,
        kind: inferKind(classify || d.parent_category),
        sources: sources,
      };
    },

    async play(payload) {
      let u = String((payload && payload.playData) || "").trim();
      if (!u) Host.raise("NO_STREAM", "kaiduan empty playData");
      if (u.indexOf("|") >= 0) {
        try {
          const resp = await Host.http.get(u, {
            headers: { "User-Agent": UA },
            followRedirects: false,
            insecureTls: true,
            timeout: 18,
          });
          if (resp && resp.status >= 300 && resp.status < 400) {
            const loc = headerLookup(resp.headers, "location");
            if (loc) u = Host.text.resolveUrl(u, loc);
          }
        } catch (_) {}
      }
      return {
        streams: [
          {
            label: "默认线路",
            url: u,
            userAgent: PLAY_UA,
            headers: { "User-Agent": PLAY_UA },
          },
        ],
      };
    },
  };
})();
