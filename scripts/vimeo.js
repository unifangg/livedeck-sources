// Ported from vimeo.py -> LiveDeck script_js (QuickJS Sandbox)
(function () {
  const SITE_URL = "https://vimeo.com";
  const API_URL = "https://api.vimeo.com";
  const PLAYER_URL = "https://player.vimeo.com/video/";
  const VIEWER_URL = "https://vimeo.com/_next/viewer";
  const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

  const CHANNELS = [
    ["staffpicks", "Staff Picks"],
    ["animation", "Animation"],
    ["documentary", "Documentary"],
    ["narrative", "Narrative"],
    ["music", "Music"],
    ["comedy", "Comedy"],
    ["experimental", "Experimental"],
    ["sports", "Sports"],
    ["travel", "Travel"],
    ["adsandcommercials", "Ads"],
    ["brandedcontent", "Branded"],
  ];

  const JWT_KEY = "vimeo:jwt";

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

  function fmtDur(sec) {
    const n = parseInt(sec || 0, 10);
    if (!n || n <= 0) return null;
    const s = n % 60;
    return Math.floor(n / 60) + ":" + (s < 10 ? "0" + s : String(s));
  }

  function extractPic(item) {
    const p = (item && item.pictures) || {};
    if (p.base_link) return String(p.base_link);
    const sizes = Array.isArray(p.sizes) ? p.sizes : [];
    if (sizes.length > 0 && sizes[sizes.length - 1] && sizes[sizes.length - 1].link) {
      return String(sizes[sizes.length - 1].link);
    }
    return null;
  }

  function extractVid(item) {
    const uri = String((item && item.uri) || "");
    const m = /\/videos\/(\d+)/.exec(uri);
    if (m) return m[1];
    const link = String((item && item.link) || "");
    const m2 = /vimeo\.com\/(\d+)/.exec(link);
    return m2 ? m2[1] : "";
  }

  function mapItem(item) {
    const vid = extractVid(item);
    if (!vid) return null;
    const title = cleanText((item && item.name) || "") || vid;
    return {
      vodId: vid,
      title: title,
      poster: extractPic(item),
      remark: fmtDur(item && item.duration),
      year: parseYear(item && item.created_time),
      kind: "other",
    };
  }

  async function fetchText(url, headers) {
    try {
      const resp = await Host.http.get(url, {
        headers: headers || {
          "User-Agent": UA,
          Referer: SITE_URL + "/",
          Accept: "text/html,application/json,*/*",
        },
        insecureTls: true,
        timeout: 20,
      });
      return resp && resp.ok ? resp.bodyText || resp.body || "" : "";
    } catch (_) {
      return "";
    }
  }

  async function fetchJson(url, params, headers) {
    try {
      const resp = await Host.http.get(url, {
        params: params || undefined,
        headers: headers || {
          "User-Agent": UA,
          Referer: SITE_URL + "/",
          Accept: "application/json, text/plain, */*",
        },
        insecureTls: true,
        timeout: 20,
      });
      if (!resp || !resp.ok) return {};
      const data = resp.json();
      return data && typeof data === "object" ? data : {};
    } catch (_) {
      return {};
    }
  }

  async function ensureJwt(config, force) {
    const bearer = config && (config.bearer || config.token) ? String(config.bearer || config.token).trim() : "";
    if (bearer) return { type: "bearer", token: bearer };
    if (config && config.jwt) return { type: "jwt", token: String(config.jwt).trim() };

    if (!force) {
      const cached = Host.cache.get(JWT_KEY);
      if (cached) return { type: "jwt", token: String(cached) };
    }

    const js = await fetchJson(VIEWER_URL, null, {
      "User-Agent": UA,
      Referer: SITE_URL + "/",
      Accept: "application/json",
    });
    if (js && js.jwt) {
      const token = String(js.jwt);
      Host.cache.set(JWT_KEY, token, 240);
      return { type: "jwt", token: token };
    }

    let html = await fetchText(SITE_URL + "/channels/staffpicks");
    if (!html) html = await fetchText(SITE_URL + "/");
    const m = /"jwt"\s*:\s*"([^"]+)"/.exec(html);
    if (m) {
      Host.cache.set(JWT_KEY, m[1], 240);
      return { type: "jwt", token: m[1] };
    }
    return null;
  }

  async function apiGet(config, path, params) {
    for (var attempt = 0; attempt < 2; attempt++) {
      const auth = await ensureJwt(config, attempt > 0);
      const headers = {
        "User-Agent": UA,
        Referer: SITE_URL + "/",
        Origin: SITE_URL,
        Accept: "application/vnd.vimeo.*+json;version=3.4",
      };
      if (auth && auth.token) {
        headers.Authorization = auth.type + " " + auth.token;
      }
      const js = await fetchJson(API_URL + path, params, headers);
      if (js && !js.error && !js.error_code && Object.keys(js).length > 0) {
        return js;
      }
    }
    return {};
  }

  async function loadPlayerConfig(config, vid) {
    const embedHeaders = {
      "User-Agent": UA,
      Referer: SITE_URL + "/" + vid,
      Accept: "text/html,application/xhtml+xml",
    };
    const html = await fetchText(PLAYER_URL + vid, embedHeaders);
    let jsonStr = Host.text.extractJson(html, "window.playerConfig");
    if (!jsonStr) jsonStr = Host.text.extractJson(html, "playerConfig");
    if (jsonStr) {
      try {
        const cfg = JSON.parse(jsonStr);
        if (cfg && cfg.request) return cfg;
      } catch (_) {}
    }

    const cfgApi = await fetchJson(PLAYER_URL + vid + "/config", null, {
      "User-Agent": UA,
      Referer: SITE_URL + "/" + vid,
      Origin: "https://player.vimeo.com",
      Accept: "application/json",
    });
    if (cfgApi && cfgApi.request) return cfgApi;

    const info = await apiGet(config, "/videos/" + vid, { fields: "config_url,player_embed_url" });
    if (info.config_url) {
      const cfg2 = await fetchJson(info.config_url, null, {
        "User-Agent": UA,
        Referer: SITE_URL + "/" + vid,
      });
      if (cfg2 && cfg2.request) return cfg2;
    }
    const hm = /[?&]h=([a-f0-9]+)/i.exec(String(info.player_embed_url || ""));
    if (hm) {
      const cfg3 = await fetchJson(PLAYER_URL + vid + "/config?h=" + hm[1], null, {
        "User-Agent": UA,
        Referer: SITE_URL + "/" + vid,
        Accept: "application/json",
      });
      if (cfg3 && cfg3.request) return cfg3;
    }
    return {};
  }

  async function parseHlsMaster(masterUrl) {
    const text = await fetchText(masterUrl, {
      "User-Agent": UA,
      Referer: SITE_URL + "/",
      Accept: "*/*",
    });
    if (!text || text.trim().charAt(0) === "<") return [];
    const lines = text.split(/\r?\n/);
    const out = [];
    const seenH = Object.create(null);
    for (var i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line.startsWith("#EXT-X-STREAM-INF:")) continue;
      const hm = /RESOLUTION=\d+x(\d+)/.exec(line);
      const h = hm ? parseInt(hm[1], 10) : 0;
      let j = i + 1;
      while (j < lines.length && (!lines[j].trim() || lines[j].trim().startsWith("#"))) {
        j += 1;
      }
      if (j < lines.length) {
        const uri = lines[j].trim();
        if (uri && !uri.startsWith("#") && !seenH[h]) {
          seenH[h] = true;
          out.push({
            height: h,
            url: Host.text.resolveUrl(masterUrl, uri),
          });
        }
        i = j;
      }
    }
    out.sort(function (a, b) {
      return (b.height || 0) - (a.height || 0);
    });
    return out;
  }

  async function collectStreams(cfg) {
    const streams = [];
    const seen = Object.create(null);
    const files = (cfg && cfg.request && cfg.request.files) || {};
    const hlsHeaders = { Referer: SITE_URL + "/", Origin: SITE_URL };
    const mp4Headers = { Referer: SITE_URL + "/" };

    const hls = files.hls || {};
    const cdns = hls.cdns || {};
    const preferred = hls.default_cdn || "";
    const cdnOrder = (preferred ? [preferred] : []).concat(Object.keys(cdns));
    let master = "";
    for (var i = 0; i < cdnOrder.length; i++) {
      const node = cdns[cdnOrder[i]] || {};
      master = node.url || node.avc_url || node.av1_url || "";
      if (master) break;
    }
    if (!master) master = hls.url || "";

    if (master) {
      const variants = await parseHlsMaster(master);
      for (var v = 0; v < variants.length; v++) {
        const vr = variants[v];
        if (!vr.url || seen[vr.url]) continue;
        seen[vr.url] = true;
        streams.push({
          label: vr.height > 0 ? vr.height + "P HLS" : "HLS",
          quality: vr.height > 0 ? vr.height : null,
          url: vr.url,
          userAgent: UA,
          headers: hlsHeaders,
        });
      }
      if (!seen[master]) {
        seen[master] = true;
        streams.push({
          label: "自适应 HLS",
          quality: null,
          url: master,
          userAgent: UA,
          headers: hlsHeaders,
        });
      }
    }

    const prog = (Array.isArray(files.progressive) ? files.progressive : [])
      .filter(function (p) {
        return p && p.url;
      })
      .sort(function (a, b) {
        return (parseInt(b.height || 0, 10) || 0) - (parseInt(a.height || 0, 10) || 0);
      });
    for (var p = 0; p < prog.length; p++) {
      const item = prog[p];
      const u = String(item.url);
      if (seen[u]) continue;
      seen[u] = true;
      const h = parseInt(item.height || 0, 10);
      streams.push({
        label: h > 0 ? h + "P MP4" : "MP4",
        quality: h > 0 ? h : null,
        url: u,
        userAgent: UA,
        headers: mp4Headers,
      });
    }

    return streams;
  }

  globalThis.LiveDeckVod = {
    async home(payload) {
      const config = (payload && payload.config) || {};
      const js = await apiGet(config, "/channels/staffpicks/videos", {
        per_page: "20",
        page: "1",
        sort: "date",
      });
      const data = Array.isArray(js.data) ? js.data : [];
      const featured = [];
      for (var i = 0; i < data.length; i++) {
        const v = mapItem(data[i]);
        if (v) featured.push(v);
      }
      return {
        categories: CHANNELS.map(function (c) {
          return { id: c[0], name: c[1], filters: [] };
        }),
        featured: featured,
      };
    },

    async category(payload) {
      const config = (payload && payload.config) || {};
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10));
      const cate = String((payload && payload.categoryId) || "staffpicks").trim();
      const path =
        cate === "staffpicks"
          ? "/channels/staffpicks/videos"
          : "/categories/" + Host.codec.urlEncode(cate) + "/videos";
      const params = {
        per_page: "20",
        page: String(page),
        sort: cate === "staffpicks" ? "date" : "likes",
      };
      const js = await apiGet(config, path, params);
      const data = Array.isArray(js.data) ? js.data : [];
      const items = [];
      for (var i = 0; i < data.length; i++) {
        const v = mapItem(data[i]);
        if (v) items.push(v);
      }
      const total = parseInt(js.total || 0, 10) || 0;
      const totalPages = total > 0 ? Math.min(200, Math.ceil(total / 20)) : items.length >= 20 ? page + 1 : page;
      return {
        items: items,
        page: page,
        totalPages: totalPages,
        hasMore: page < totalPages,
      };
    },

    async search(payload) {
      const config = (payload && payload.config) || {};
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10));
      const kw = String((payload && payload.keyword) || "").trim();
      if (!kw) return { items: [], page: page, totalPages: 1, hasMore: false };

      const dm = /(\d{6,})/.exec(kw);
      if (dm && page === 1) {
        const js = await apiGet(config, "/videos/" + dm[1]);
        const v = mapItem(js);
        if (v) return { items: [v], page: 1, totalPages: 1, hasMore: false };
      }

      const js = await apiGet(config, "/videos", {
        query: kw,
        per_page: "20",
        page: String(page),
        filter: "content_rating",
        filter_content_rating: "safe",
      });
      const data = Array.isArray(js.data) ? js.data : [];
      const items = [];
      for (var i = 0; i < data.length; i++) {
        const v = mapItem(data[i]);
        if (v) items.push(v);
      }
      const total = parseInt(js.total || 0, 10) || 0;
      const totalPages = total > 0 ? Math.min(200, Math.ceil(total / 20)) : items.length >= 20 ? page + 1 : page;
      return {
        items: items,
        page: page,
        totalPages: totalPages,
        hasMore: page < totalPages,
      };
    },

    async detail(payload) {
      const config = (payload && payload.config) || {};
      const raw = String((payload && payload.vodId) || "").split(":")[0].trim();
      const vid = raw.replace(/\D+/g, "") || raw;
      const js = await apiGet(config, "/videos/" + vid);
      const user = cleanText((js.user && js.user.name) || "");
      const dur = parseInt(js.duration || 0, 10);
      return {
        vodId: vid,
        title: cleanText(js.name || "") || "Vimeo " + vid,
        poster: extractPic(js),
        remark: fmtDur(dur),
        year: parseYear(js.created_time),
        actors: user ? [user] : [],
        directors: [],
        synopsis: cleanText(js.description || "").slice(0, 600) || null,
        kind: "other",
        sources: [
          {
            sourceId: "vimeo",
            name: "Vimeo",
            episodes: [
              {
                episodeId: vid,
                name: "正片",
                index: 0,
                playData: vid,
                durationSec: dur > 0 ? dur : null,
              },
            ],
          },
        ],
      };
    },

    async play(payload) {
      const config = (payload && payload.config) || {};
      const raw = String((payload && payload.playData) || "").trim();
      const left = raw.indexOf("@@") >= 0 ? raw.split("@@")[0] : raw;
      const vid = left.replace(/\D+/g, "") || left;
      if (!vid) {
        Host.raise("INVALID_PLAY_DATA", "vimeo missing video id");
      }
      const cfg = await loadPlayerConfig(config, vid);
      const streams = await collectStreams(cfg);
      if (streams.length === 0) {
        Host.raise("NO_STREAM", "vimeo could not extract playable stream for " + vid);
      }
      return { streams: streams };
    },
  };
})();
