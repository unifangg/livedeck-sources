// Ported from oulevod.py -> LiveDeck script_js (QuickJS Sandbox)
(function () {
  const DEFAULT_HOST = "https://www.olevod.com";
  const DEFAULT_API = "https://api.olelive.com";
  const DEFAULT_STATIC = "https://static.olelive.com/";
  const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

  const CHANNELS = [
    { id: "1", name: "电影", kind: "movie" },
    { id: "2", name: "电视剧", kind: "series" },
    { id: "14", name: "短剧", kind: "series" },
    { id: "3", name: "综艺", kind: "variety" },
    { id: "4", name: "动漫", kind: "anime" },
  ];

  const KIND_MAP = {
    "1": "movie",
    "2": "series",
    "14": "series",
    "3": "variety",
    "4": "anime",
  };

  const NSFW_RE = /(伦理|福利|成人|情色|里番|禁片|三级片|午夜场|色情|女优|18\+|R18|NSFW|Hentai|\bAV\b)/i;

  function getCfg(config) {
    const c = config || {};
    const host = String(c.host || c.url || DEFAULT_HOST).trim().replace(/\/+$/, "") || DEFAULT_HOST;
    const api = String(c.api || DEFAULT_API).trim().replace(/\/+$/, "") || DEFAULT_API;
    let stat = String(c.static || DEFAULT_STATIC).trim();
    if (!stat) stat = DEFAULT_STATIC;
    if (!stat.endsWith("/")) stat += "/";
    return { host: host, api: api, staticUrl: stat };
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
      .split(/[,，/\s]+/)
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

  function absPic(cfg, p) {
    const s = String(p || "").trim();
    if (!s) return null;
    if (s.startsWith("//")) return "https:" + s;
    if (/^https?:\/\//i.test(s)) return s;
    return cfg.staticUrl + s.replace(/^\/+/, "");
  }

  function makeVv() {
    const ts = String(Math.floor(Host.time.nowMillis() / 1000));
    const rows = ["", "", "", ""];
    for (var i = 0; i < ts.length; i++) {
      const bits = ts.charCodeAt(i).toString(2);
      rows[0] += bits.length > 2 ? bits.slice(2, 3) : "";
      rows[1] += bits.length > 3 ? bits.slice(3, 4) : "";
      rows[2] += bits.length > 4 ? bits.slice(4, 5) : "";
      rows[3] += bits.length > 5 ? bits.slice(5) : "";
    }
    const parts = rows.map(function (row) {
      if (!row) return "000";
      let hx = parseInt(row, 2).toString(16);
      while (hx.length < 3) hx = "0" + hx;
      return hx;
    });
    const n = Host.crypto.md5(ts);
    return (
      n.slice(0, 3) +
      parts[0] +
      n.slice(6, 11) +
      parts[1] +
      n.slice(14, 19) +
      parts[2] +
      n.slice(22, 27) +
      parts[3] +
      n.slice(30)
    );
  }

  async function fetchJson(cfg, url) {
    const sep = url.indexOf("?") >= 0 ? "&" : "?";
    const full = url + sep + "_vv=" + makeVv();
    try {
      const resp = await Host.http.get(full, {
        headers: {
          "User-Agent": UA,
          Referer: cfg.host + "/",
          Origin: cfg.host,
          Accept: "application/json, text/plain, */*",
          "Accept-Language": "zh-CN,zh;q=0.9",
        },
        insecureTls: true,
        timeout: 15,
      });
      if (!resp || !resp.ok) return {};
      try {
        const data = resp.json();
        return data && typeof data === "object" ? data : {};
      } catch (_) {
        const text = resp.bodyText || resp.body || "";
        const m = /\{[\s\S]+\}/.exec(text);
        if (m) {
          try {
            return JSON.parse(m[0]);
          } catch (__) {}
        }
        return {};
      }
    } catch (_) {
      return {};
    }
  }

  async function fetchText(cfg, url) {
    try {
      const resp = await Host.http.get(url, {
        headers: {
          "User-Agent": UA,
          Referer: cfg.host + "/",
          Accept: "text/html,application/xhtml+xml",
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

  function parseVideoItem(cfg, item, defaultKind) {
    if (!item || typeof item !== "object") return null;
    const vid = String(item.id || item.vod_id || "").trim();
    if (!vid) return null;
    const title = cleanText(item.name || item.vod_name || vid);
    if (!title) return null;
    const remarksRaw =
      item.remarks || item.vod_remarks || item.continu || item.updateInfo || "";
    const remark = cleanText(remarksRaw) || null;
    const typeId = String(item.typeId || item.type_id || "");
    const obj = {
      vodId: vid,
      title: title,
      poster: absPic(cfg, item.picThumb || item.pic || item.vod_pic || ""),
      remark: remark,
      year: parseYear(item.year || item.vod_year),
      kind: KIND_MAP[typeId] || defaultKind || null,
    };
    return isSafeItem(obj) ? obj : null;
  }

  async function listApi(cfg, typeId, pg, limit) {
    const page = Math.max(1, parseInt(pg || 1, 10) || 1);
    const lim = limit || 24;
    const url =
      cfg.api +
      "/v1/pub/vod/list/true/3/0/0/" +
      Host.codec.urlEncode(String(typeId)) +
      "/0/0/update/" +
      page +
      "/" +
      lim;
    let data = await fetchJson(cfg, url);
    if (
      data.code !== 0 &&
      data.code !== "0" &&
      data.code !== undefined &&
      !(data.data && data.data.list)
    ) {
      data = await fetchJson(cfg, url);
    }
    const body = (data && data.data) || {};
    const rawList = Array.isArray(body.list) ? body.list : [];
    const kind = KIND_MAP[String(typeId)] || null;
    const items = [];
    for (var i = 0; i < rawList.length; i++) {
      const v = parseVideoItem(cfg, rawList[i], kind);
      if (v) items.push(v);
    }
    const total = parseInt(body.total || 0, 10) || 0;
    const per = items.length > 0 ? Math.max(items.length, 12) : lim;
    const totalPages = total > 0 ? Math.max(1, Math.ceil(total / per)) : items.length >= 10 ? page + 1 : page;
    return {
      items: items,
      page: page,
      totalPages: totalPages,
      hasMore: page < totalPages,
    };
  }

  function isVideoFormat(url) {
    if (!url) return false;
    const u = String(url).toLowerCase();
    if (/\.(mp4|m3u8|flv|mpd)(\?|#|$)/i.test(u)) return true;
    if (u.indexOf("olemovienews.com") >= 0 || u.indexOf("olelive.com") >= 0) return true;
    return false;
  }

  function buildEpisodes(eps) {
    const list = [];
    if (!Array.isArray(eps)) return list;
    for (var i = 0; i < eps.length; i++) {
      const ep = eps[i];
      if (!ep) continue;
      if (typeof ep === "string") {
        const idx = ep.indexOf("$");
        if (idx > 0) {
          const name = cleanText(ep.slice(0, idx)) || "第" + (list.length + 1) + "集";
          const u = ep.slice(idx + 1).trim();
          if (u) {
            list.push({
              episodeId: String(list.length + 1),
              name: name,
              index: list.length,
              playData: u,
            });
          }
        }
        continue;
      }
      if (typeof ep !== "object") continue;
      let u = String(ep.url || "").trim();
      if (ep.vip === true && !u && Array.isArray(ep.vip_urls) && ep.vip_urls.length > 0) {
        u = String((ep.vip_urls[0] && ep.vip_urls[0].url) || "").trim();
      }
      if (u) {
        const title = cleanText(ep.title || ep.name || (ep.vip ? "VIP" : "播放")) || "第" + (list.length + 1) + "集";
        list.push({
          episodeId: String(ep.id || list.length + 1),
          name: title,
          index: list.length,
          playData: u,
        });
      }
    }
    return list;
  }

  globalThis.LiveDeckVod = {
    async home(payload) {
      const cfg = getCfg(payload && payload.config);
      let featured = [];
      const data = await fetchJson(cfg, cfg.api + "/v1/pub/vod/newest/1/24");
      const rawList = (data && data.data && data.data.list) || [];
      for (var i = 0; i < rawList.length; i++) {
        const v = parseVideoItem(cfg, rawList[i], null);
        if (v) featured.push(v);
      }
      if (featured.length === 0) {
        const res = await listApi(cfg, "1", 1, 24);
        featured = res.items;
      }
      return {
        categories: CHANNELS.filter(function (c) {
          return !NSFW_RE.test(c.name);
        }).map(function (c) {
          return { id: c.id, name: c.name, filters: [] };
        }),
        featured: featured.slice(0, 24),
      };
    },

    async category(payload) {
      const cfg = getCfg(payload && payload.config);
      const tid = String((payload && payload.categoryId) || "1").trim();
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10) || 1);
      return listApi(cfg, tid, page, 24);
    },

    async search(payload) {
      const cfg = getCfg(payload && payload.config);
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10) || 1);
      const kw = String((payload && payload.keyword) || "").trim();
      if (!kw) return { items: [], page: page, totalPages: 1, hasMore: false };
      const data = await fetchJson(
        cfg,
        cfg.api + "/v1/pub/index/search/" + Host.codec.urlEncode(kw) + "/vod/0/" + page + "/24"
      );
      const outer = (data && data.data) || {};
      let rawItems = [];
      if (Array.isArray(outer.data)) {
        for (var i = 0; i < outer.data.length; i++) {
          const b = outer.data[i];
          if (b && Array.isArray(b.list)) {
            rawItems = rawItems.concat(b.list);
          }
        }
      }
      if (rawItems.length === 0 && Array.isArray(outer.list)) {
        rawItems = outer.list;
      }
      const items = [];
      for (var j = 0; j < rawItems.length; j++) {
        const v = parseVideoItem(cfg, rawItems[j], null);
        if (v) items.push(v);
      }
      const hasMore = items.length >= 12;
      return {
        items: items,
        page: page,
        totalPages: hasMore ? page + 1 : page,
        hasMore: hasMore,
      };
    },

    async detail(payload) {
      const cfg = getCfg(payload && payload.config);
      const vid = String((payload && payload.vodId) || "").trim();
      let data = await fetchJson(cfg, cfg.api + "/v1/pub/vod/detail/" + vid + "/true");
      let info = (data && data.data) || {};
      if (!info || (!info.name && !info.vod_name && !info.urls)) {
        data = await fetchJson(cfg, cfg.api + "/v1/pub/vod/detail/" + vid + "/true");
        info = (data && data.data) || {};
      }
      const title = cleanText(info.name || info.vod_name || vid) || vid;
      const poster = absPic(cfg, info.pic || info.picThumb || info.vod_pic || "");
      const remark = cleanText(info.remarks || info.vod_remarks || "") || null;
      const synopsis = cleanText(info.content || info.vod_content || info.blurb || "") || null;
      const actors = splitNames(info.actor || info.vod_actor);
      const directors = splitNames(info.director || info.vod_director);
      const year = parseYear(info.year || info.vod_year);
      const region = cleanText(info.area || info.vod_area || "") || null;
      const genres = splitNames(info.typeName || info.type_name || info.vod_class || "");
      const typeId = String(info.typeId || info.type_id || "");

      const sources = [];
      const urls = Array.isArray(info.urls) ? info.urls : [];
      const free = urls.filter(function (e) { return e && !e.vip; });
      const freeEps = buildEpisodes(free.length > 0 ? free : urls);
      if (freeEps.length > 0) {
        sources.push({ sourceId: "ole", name: "欧乐", episodes: freeEps });
      }

      const vipEps = [];
      for (var i = 0; i < urls.length; i++) {
        const ep = urls[i];
        if (!ep || !Array.isArray(ep.vip_urls)) continue;
        for (var j = 0; j < ep.vip_urls.length; j++) {
          const vu = ep.vip_urls[j];
          if (vu && vu.url) {
            vipEps.push({
              episodeId: "vip-" + (vipEps.length + 1),
              name: cleanText(vu.title || ep.title || "VIP") || "VIP",
              index: vipEps.length,
              playData: String(vu.url).trim(),
            });
          }
        }
      }
      const sameAsFree =
        vipEps.length > 0 &&
        vipEps.length === freeEps.length &&
        vipEps.every(function (v, idx) {
          return freeEps[idx] && v.playData === freeEps[idx].playData;
        });
      if (vipEps.length > 0 && !sameAsFree) {
        sources.push({ sourceId: "ole-vip", name: "欧乐VIP", episodes: vipEps });
      }

      if (sources.length === 0) {
        const groups = info.play_list || info.vod_play_list || [];
        if (Array.isArray(groups)) {
          for (var gIdx = 0; gIdx < groups.length; gIdx++) {
            const g = groups[gIdx];
            if (!g) continue;
            const flag = cleanText(g.from || g.name || "") || "线路" + (gIdx + 1);
            const eps = buildEpisodes(g.urls || g.list || []);
            if (eps.length > 0) {
              sources.push({ sourceId: "line-" + (gIdx + 1), name: flag, episodes: eps });
            }
          }
        }
      }

      if (sources.length === 0) {
        sources.push({
          sourceId: "ole",
          name: "欧乐",
          episodes: [
            {
              episodeId: "1",
              name: "播放",
              index: 0,
              playData: cfg.host + "/index.php/vod/play/id/" + vid + ".html",
            },
          ],
        });
      }

      return {
        vodId: vid,
        title: title,
        poster: poster,
        remark: remark,
        year: year,
        region: region,
        genres: genres,
        actors: actors,
        directors: directors,
        synopsis: synopsis,
        kind: KIND_MAP[typeId] || null,
        sources: sources,
      };
    },

    async play(payload) {
      const cfg = getCfg(payload && payload.config);
      const headers = {
        Referer: cfg.host + "/",
        Origin: cfg.host,
      };
      const raw = String((payload && payload.playData) || "").trim();
      if (!raw) {
        Host.raise("INVALID_PLAY_DATA", "empty oulevod playData");
      }

      if (raw.startsWith("http") && isVideoFormat(raw)) {
        return {
          streams: [{ label: "默认线路", url: raw, userAgent: UA, headers: headers }],
        };
      }

      if (raw.startsWith("http") && raw.indexOf("olevod") >= 0) {
        const html = await fetchText(cfg, raw);
        const jsonStr = Host.text.extractJson(html, "player_aaaa");
        if (jsonStr) {
          try {
            const obj = JSON.parse(jsonStr);
            let u = String(obj.url || "").replace(/\\\//g, "/").trim();
            const enc = parseInt(obj.encrypt || 0, 10) || 0;
            if (enc === 1) u = Host.codec.urlDecode(u);
            else if (enc === 2) u = Host.codec.urlDecode(Host.crypto.base64Decode(u));
            if (u) {
              return {
                streams: [{ label: "默认线路", url: u, userAgent: UA, headers: headers }],
              };
            }
          } catch (_) {}
        }
        const m3 = /https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/i.exec(html);
        if (m3) {
          return {
            streams: [
              {
                label: "默认线路",
                url: m3[0].replace(/\\\//g, "/"),
                userAgent: UA,
                headers: headers,
              },
            ],
          };
        }
      }

      if (/^\d+$/.test(raw)) {
        const data = await fetchJson(cfg, cfg.api + "/v1/pub/vod/detail/" + raw + "/true");
        const urls = (data && data.data && data.data.urls) || [];
        for (var i = 0; i < urls.length; i++) {
          const ep = urls[i];
          if (ep && ep.url && !ep.vip) {
            return {
              streams: [{ label: "默认线路", url: String(ep.url), userAgent: UA, headers: headers }],
            };
          }
        }
        if (urls.length > 0 && urls[0] && urls[0].url) {
          return {
            streams: [{ label: "默认线路", url: String(urls[0].url), userAgent: UA, headers: headers }],
          };
        }
      }

      const fallbackUrl = raw.startsWith("http")
        ? raw
        : cfg.host + "/index.php/vod/play/id/" + raw + ".html";
      return {
        streams: [{ label: "默认线路", url: fallbackUrl, userAgent: UA, headers: headers }],
      };
    },
  };
})();
