// Ported from fengye.py -> LiveDeck script_js (QuickJS Sandbox)
(function () {
  const DEFAULT_HOST = "https://www.fyeys.com";
  const DEFAULT_SIGN_KEY = "cb808529bae6b6be45ecfab29a4889bc";
  const API_PREFIX = "/api/mw-movie";
  const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

  const CLASSES = [
    ["1", "电影", "movie"],
    ["2", "电视剧", "series"],
    ["3", "综艺", "variety"],
    ["4", "动漫", "anime"],
    ["88", "短剧", "series"],
  ];

  let deviceId = Host.crypto.uuid();

  function getCfg(config) {
    const c = config || {};
    return {
      host: String(c.host || DEFAULT_HOST).trim().replace(/\/+$/, "") || DEFAULT_HOST,
      signKey: String(c.signKey || DEFAULT_SIGN_KEY).trim() || DEFAULT_SIGN_KEY,
    };
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
      .split(/[,，/\s]+/)
      .map(function (s) { return s.trim(); })
      .filter(Boolean);
  }

  function signParams(params, signKey, t) {
    const keys = Object.keys(params).sort();
    const parts = [];
    for (var i = 0; i < keys.length; i++) {
      const k = keys[i];
      const v = params[k];
      if (v === undefined || v === null || v === "" || String(v) === "undefined" || String(v) === "null") {
        continue;
      }
      parts.push(k + "=" + String(v));
    }
    const base = parts.length > 0 ? parts.join("&") + "&key=" + signKey + "&t=" + t : "key=" + signKey + "&t=" + t;
    return Host.crypto.sha1(Host.crypto.md5(base));
  }

  async function fetchHtml(host, pathOrUrl) {
    const url = /^https?:\/\//i.test(pathOrUrl) ? pathOrUrl : host + pathOrUrl;
    try {
      const resp = await Host.http.get(url, {
        headers: {
          "User-Agent": UA,
          Referer: host + "/",
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

  async function apiGet(cfg, path, params) {
    const t = String(Host.time.nowMillis());
    const sign = signParams(params || {}, cfg.signKey, t);
    const cleanParams = {};
    const keys = Object.keys(params || {});
    for (var i = 0; i < keys.length; i++) {
      const k = keys[i];
      const v = params[k];
      if (v !== undefined && v !== null && v !== "") {
        cleanParams[k] = String(v);
      }
    }
    try {
      const resp = await Host.http.get(cfg.host + API_PREFIX + path, {
        params: cleanParams,
        headers: {
          "User-Agent": UA,
          Referer: cfg.host + "/",
          Origin: cfg.host,
          Accept: "application/json, text/plain, */*",
          "Accept-Language": "zh-CN,zh;q=0.9",
          "client-type": "1",
          authorization: "",
          deviceId: deviceId,
          sign: sign,
          t: t,
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

  function parseList(html) {
    const items = [];
    const seen = Object.create(null);
    if (!html) return items;
    const re = /href="(\/detail\/(\d+))"/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      const path = m[1];
      const vid = m[2];
      if (seen[vid]) continue;
      seen[vid] = true;
      const start = Math.max(0, m.index - 50);
      const end = Math.min(html.length, m.index + m[0].length + 900);
      const block = html.slice(start, end);

      let name = "";
      const nm = /(?:card-name|CardName|title)[^>]*>([\s\S]*?)</i.exec(block);
      if (nm) name = cleanText(nm[1]);
      if (!name) {
        const am = /alt="([^"]+)"/i.exec(block);
        if (am) name = cleanText(am[1]);
      }
      if (!name) name = "影片" + vid;

      let pic = null;
      const pm = /(https:\/\/[^"'\s)]+\.(?:jpg|jpeg|png|webp))/i.exec(block);
      if (pm) {
        pic = pm[1];
      } else {
        const um = /url\(([^)]+)\)/.exec(block);
        if (um) pic = um[1].replace(/^['"]|['"]$/g, "");
      }

      let remark = null;
      const rm = /(?:remarks|tag|score|episode)[^>]*>([\s\S]*?)</i.exec(block);
      if (rm) {
        const r = cleanText(rm[1]);
        if (r) remark = r;
      }

      items.push({
        vodId: path,
        title: name,
        poster: pic || null,
        remark: remark,
      });
    }
    return items;
  }

  function extractDetailJson(html) {
    let m = /\\"vodId\\":(\d+)/.exec(html);
    if (!m) m = /"vodId":(\d+)/.exec(html);
    if (!m) return null;
    const chunk = html.slice(m.index, m.index + 80000);
    let unesc = chunk.replace(/\\"/g, '"').replace(/\\n/g, "\n");
    if (!unesc.startsWith("{")) unesc = "{" + unesc;

    let episodeList = [];
    const em = /"episodeList"\s*:\s*(\[[\s\S]*?\])/.exec(unesc);
    if (em) {
      try {
        episodeList = JSON.parse(em[1]);
      } catch (_) {}
    }

    function field(name) {
      const reStr = new RegExp('"' + name + '"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"');
      const ms = reStr.exec(unesc);
      if (ms) {
        try {
          return JSON.parse('"' + ms[1] + '"');
        } catch (_) {
          return ms[1];
        }
      }
      const reRaw = new RegExp('"' + name + '"\\s*:\\s*([^,}\\]]+)');
      const mr = reRaw.exec(unesc);
      return mr ? mr[1].trim().replace(/^"|"$/g, "") : "";
    }

    return {
      vodId: m[1],
      vodName: field("vodName"),
      vodPic: field("vodPic"),
      vodContent: field("vodContent") || field("vodBlurb"),
      vodActor: field("vodActor"),
      vodDirector: field("vodDirector"),
      vodYear: field("vodYear"),
      vodArea: field("vodArea"),
      vodRemarks: field("vodRemarks"),
      typeName: field("typeName"),
      episodeList: episodeList,
    };
  }

  globalThis.LiveDeckVod = {
    async home(payload) {
      const cfg = getCfg(payload && payload.config);
      const html = await fetchHtml(cfg.host, "/");
      return {
        categories: CLASSES.map(function (c) {
          return { id: c[0], name: c[1], filters: [] };
        }),
        featured: parseList(html).slice(0, 24),
      };
    },

    async category(payload) {
      const cfg = getCfg(payload && payload.config);
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10));
      const tid = String((payload && payload.categoryId) || "1").trim();
      const html = await fetchHtml(cfg.host, "/vod/show/id/" + tid + "/page/" + page);
      const items = parseList(html);
      const hasMore = items.length >= 20;
      return {
        items: items,
        page: page,
        totalPages: hasMore ? page + 1 : page,
        hasMore: hasMore,
      };
    },

    async search(payload) {
      const cfg = getCfg(payload && payload.config);
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10));
      const kw = String((payload && payload.keyword) || "").trim();
      if (!kw) return { items: [], page: page, totalPages: 1, hasMore: false };
      let path = "/vod/search/" + Host.codec.urlEncode(kw);
      if (page > 1) path += "?page=" + page;
      const html = await fetchHtml(cfg.host, path);
      const items = parseList(html);
      const hasMore = items.length > 0;
      return {
        items: items,
        page: page,
        totalPages: hasMore ? page + 1 : page,
        hasMore: hasMore,
      };
    },

    async detail(payload) {
      const cfg = getCfg(payload && payload.config);
      const raw = String((payload && payload.vodId) || "");
      const path = raw.startsWith("/") ? raw : "/detail/" + raw.replace(/^detail\//, "");
      const html = await fetchHtml(cfg.host, path);
      let data = extractDetailJson(html);
      if (!data) {
        const vm = /(\d+)/.exec(path);
        if (vm) {
          const api = await apiGet(cfg, "/anonymous/video/detail", { id: vm[1] });
          if (api && api.code === 200 && api.data) {
            const d = api.data;
            data = {
              vodId: String(d.vodId || vm[1]),
              vodName: d.vodName || "",
              vodPic: d.vodPic || "",
              vodContent: d.vodContent || d.vodBlurb || "",
              vodActor: d.vodActor || "",
              vodDirector: d.vodDirector || "",
              vodYear: d.vodYear || "",
              vodArea: d.vodArea || "",
              vodRemarks: d.vodRemarks || "",
              typeName: d.typeName || "",
              episodeList: d.episodeList || [],
            };
          }
        }
      }
      if (!data) {
        return { vodId: path, title: path, sources: [] };
      }

      const vid = String(data.vodId || "");
      const episodes = [];
      const epList = Array.isArray(data.episodeList) ? data.episodeList : [];
      for (var i = 0; i < epList.length; i++) {
        const ep = epList[i];
        const nid = ep && ep.nid;
        if (!nid) continue;
        episodes.push({
          episodeId: String(nid),
          name: String(ep.name || nid),
          index: episodes.length,
          playData: vid + "@" + nid,
        });
      }
      if (episodes.length === 0 && html) {
        const playRe = new RegExp('href="(\\/vod\\/play\\/' + vid + '\\/sid\\/(\\d+))"[^>]*>([\\s\\S]*?)<\\/a>', "gi");
        let pm;
        while ((pm = playRe.exec(html)) !== null) {
          const nid = pm[2];
          episodes.push({
            episodeId: nid,
            name: cleanText(pm[3]) || nid,
            index: episodes.length,
            playData: vid + "@" + nid,
          });
        }
      }

      return {
        vodId: "/detail/" + vid,
        title: data.vodName || "影片 " + vid,
        poster: data.vodPic || null,
        remark: data.vodRemarks || null,
        year: parseYear(data.vodYear),
        region: data.vodArea || null,
        genres: splitNames(data.typeName),
        actors: splitNames(data.vodActor),
        directors: splitNames(data.vodDirector),
        synopsis: data.vodContent || null,
        sources: episodes.length > 0 ? [{ sourceId: "fengye", name: "枫叶影视", episodes: episodes }] : [],
      };
    },

    async play(payload) {
      const cfg = getCfg(payload && payload.config);
      const raw = String((payload && payload.playData) || "");
      let vodId = raw;
      let nid = "";
      if (raw.indexOf("@") >= 0) {
        const parts = raw.split("@");
        vodId = parts[0];
        nid = parts[1];
      } else {
        const mm = /\/vod\/play\/(\d+)\/.*?(\d+)$/.exec(raw);
        if (mm) {
          vodId = mm[1];
          nid = mm[2];
        }
      }

      const headers = { Referer: cfg.host + "/" };
      const streams = [];
      if (vodId && nid) {
        const res = await apiGet(cfg, "/anonymous/v2/video/episode/url", {
          id: String(vodId),
          nid: String(nid),
        });
        if (res && res.code === 200 && res.data) {
          const d = res.data;
          if (d && Array.isArray(d.list) && d.list.length > 0) {
            const sorted = d.list.slice().sort(function (a, b) {
              const af = a && (a.flag === true || a.needLogin === false) ? 1 : 0;
              const bf = b && (b.flag === true || b.needLogin === false) ? 1 : 0;
              if (af !== bf) return bf - af;
              return (parseInt((b && b.resolution) || 0, 10) || 0) - (parseInt((a && a.resolution) || 0, 10) || 0);
            });
            for (var i = 0; i < sorted.length; i++) {
              const s = sorted[i];
              if (!s || !s.url) continue;
              const q = parseInt(s.resolution || 0, 10);
              streams.push({
                label: q > 0 ? q + "P" : "默认线路",
                quality: q > 0 ? q : null,
                url: String(s.url),
                userAgent: UA,
                headers: headers,
              });
            }
          } else if (typeof d === "string" && d.startsWith("http")) {
            streams.push({ label: "默认线路", url: d, userAgent: UA, headers: headers });
          } else if (d && (d.url || d.playUrl)) {
            streams.push({ label: "默认线路", url: String(d.url || d.playUrl), userAgent: UA, headers: headers });
          }
        }
      }
      if (streams.length === 0) {
        Host.raise("NO_STREAM", "fengye play failed to resolve stream URL for " + raw);
      }
      return { streams: streams };
    },
  };
})();
