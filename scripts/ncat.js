// Ported from ncat.py -> LiveDeck script_js (QuickJS Sandbox)
(function () {
  const DEFAULT_HOSTS = ["https://www.ncat25.com", "https://www.ncat1.app"];
  const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36";

  const CHANNELS = [
    { id: "1", name: "电影", kind: "movie" },
    { id: "2", name: "连续剧", kind: "series" },
    { id: "3", name: "动漫", kind: "anime" },
    { id: "4", name: "综艺纪录", kind: "variety" },
    { id: "6", name: "短剧", kind: "series" },
  ];

  const KIND_MAP = {
    "1": "movie",
    "2": "series",
    "3": "anime",
    "4": "variety",
    "6": "series",
  };

  const NSFW_RE = /(伦理|福利|成人|情色|里番|禁片|三级片|午夜场|色情|女优|18\+|R18|NSFW|Hentai|\bAV\b)/i;

  let activeHost = "";
  let cachedToken = "";
  const cookieJar = Object.create(null);

  function getHosts(config) {
    const c = config || {};
    const custom = String(c.host || c.url || "").trim().replace(/\/+$/, "");
    const list = [];
    if (custom) list.push(custom);
    for (var i = 0; i < DEFAULT_HOSTS.length; i++) {
      if (list.indexOf(DEFAULT_HOSTS[i]) < 0) list.push(DEFAULT_HOSTS[i]);
    }
    return list;
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

  function absPic(host, src) {
    const s = String(src || "").trim();
    if (!s) return null;
    if (s.startsWith("//")) return "https:" + s;
    if (/^https?:\/\//i.test(s)) return s;
    return host + (s.startsWith("/") ? s : "/" + s);
  }

  function getCookieHeader(host) {
    const store = cookieJar[host];
    if (!store) return "";
    const parts = [];
    const keys = Object.keys(store);
    for (var i = 0; i < keys.length; i++) {
      parts.push(keys[i] + "=" + store[keys[i]]);
    }
    return parts.join("; ");
  }

  function saveCookies(host, setCookieHeaders) {
    if (!Array.isArray(setCookieHeaders) || setCookieHeaders.length === 0) return;
    if (!cookieJar[host]) cookieJar[host] = Object.create(null);
    for (var i = 0; i < setCookieHeaders.length; i++) {
      const first = String(setCookieHeaders[i] || "").split(";")[0];
      const eq = first.indexOf("=");
      if (eq > 0) {
        cookieJar[host][first.slice(0, eq).trim()] = first.slice(eq + 1).trim();
      }
    }
  }

  function solveCdndefend(html) {
    const m = /a0_0x2a54=\['([0-9A-F]{40})'/.exec(html || "");
    if (!m) return null;
    const h = m[1];
    const n1 = parseInt(h.charAt(0), 16);
    const offset = n1 * 2;
    for (var i = 0; i <= 5000000; i++) {
      const hex = Host.crypto.sha1(h + String(i));
      if (hex.slice(offset, offset + 4) === "b00b") {
        return h + String(i);
      }
    }
    return null;
  }

  async function crackHost(host) {
    try {
      const resp = await Host.http.get(host + "/", {
        headers: {
          "User-Agent": UA,
          "Accept-Language": "zh-CN,zh;q=0.9",
          Referer: host + "/",
          Cookie: getCookieHeader(host),
        },
        followRedirects: false,
        insecureTls: true,
        timeout: 20,
      });
      if (!resp) return false;
      saveCookies(host, resp.setCookieHeaders);
      const body = resp.bodyText || resp.body || "";
      const solved = solveCdndefend(body);
      if (!solved) {
        return resp.statusCode < 400 && body.indexOf("a0_0x2a54") < 0;
      }
      if (!cookieJar[host]) cookieJar[host] = Object.create(null);
      cookieJar[host]["cdndefend_js_cookie"] = solved;

      const resp2 = await Host.http.get(host + "/", {
        headers: {
          "User-Agent": UA,
          "Accept-Language": "zh-CN,zh;q=0.9",
          Referer: host + "/",
          Cookie: getCookieHeader(host),
        },
        insecureTls: true,
        timeout: 20,
      });
      if (!resp2) return false;
      saveCookies(host, resp2.setCookieHeaders);
      const body2 = resp2.bodyText || resp2.body || "";
      return (
        resp2.ok &&
        body2.indexOf("cdndefend") < 0 &&
        body2.indexOf("a0_0x2a54") < 0
      );
    } catch (_) {
      return false;
    }
  }

  async function ensureHost(config) {
    if (activeHost) return activeHost;
    const hosts = getHosts(config);
    for (var i = 0; i < hosts.length; i++) {
      if (await crackHost(hosts[i])) {
        activeHost = hosts[i];
        return activeHost;
      }
    }
    activeHost = hosts[0];
    return activeHost;
  }

  async function safeGet(config, pathOrUrl, extraHeaders) {
    const host = await ensureHost(config);
    const url = /^https?:\/\//i.test(pathOrUrl)
      ? pathOrUrl
      : host + (pathOrUrl.startsWith("/") ? pathOrUrl : "/" + pathOrUrl);

    for (var attempt = 0; attempt < 2; attempt++) {
      const headers = {
        "User-Agent": UA,
        "Accept-Language": "zh-CN,zh;q=0.9",
        Referer: host + "/",
      };
      const ck = getCookieHeader(host);
      if (ck) headers.Cookie = ck;
      if (extraHeaders) {
        const keys = Object.keys(extraHeaders);
        for (var i = 0; i < keys.length; i++) {
          headers[keys[i]] = extraHeaders[keys[i]];
        }
      }
      try {
        const resp = await Host.http.get(url, {
          headers: headers,
          insecureTls: true,
          timeout: 20,
        });
        if (!resp) return "";
        saveCookies(host, resp.setCookieHeaders);
        const text = resp.bodyText || resp.body || "";
        if (text.indexOf("a0_0x2a54") >= 0 && attempt === 0) {
          const solved = solveCdndefend(text);
          if (solved) {
            if (!cookieJar[host]) cookieJar[host] = Object.create(null);
            cookieJar[host]["cdndefend_js_cookie"] = solved;
            continue;
          }
        }
        return resp.ok ? text : "";
      } catch (_) {
        return "";
      }
    }
    return "";
  }

  async function getSearchToken(config) {
    if (cachedToken) return cachedToken;
    const html = await safeGet(config, "/");
    const m = /name="t"\s+value="([^"]+)"/i.exec(html || "");
    if (m) cachedToken = m[1];
    return cachedToken;
  }

  function parseVideos(host, html, defaultKind) {
    const videos = [];
    const seen = Object.create(null);
    if (!html) return videos;

    const blocks = html.split(/<div class="module-item">/i);
    for (var i = 1; i < blocks.length; i++) {
      const b = blocks[i].slice(0, 2500);
      const lm = /<a href="(\/detail\/(\d+)\.html)"[^>]*>/i.exec(b);
      if (!lm) continue;
      const vid = lm[2];
      if (seen[vid]) continue;

      const tm = /<div class="v-item-title">([\s\S]*?)<\/div>/i.exec(b);
      const name = tm ? cleanText(tm[1]) : "";
      if (!name) continue;
      seen[vid] = true;

      let remark = null;
      const rm = /<div class="v-item-bottom">\s*<span>([\s\S]*?)<\/span>/i.exec(b);
      if (rm) {
        const r = cleanText(rm[1]);
        if (r) remark = r;
      }

      let pic = "";
      const pmRe = /data-original="([^"]+)"/gi;
      let pm;
      while ((pm = pmRe.exec(b)) !== null) {
        const p = pm[1];
        if (p.indexOf("logo_placeholder") < 0 && p.indexOf("vod_pc_static_ncat") < 0) {
          pic = p;
          break;
        }
      }
      if (!pic) {
        const sm = /<img[^>]+src="([^"]+)"/i.exec(b);
        if (sm && sm[1].indexOf("logo_placeholder") < 0 && sm[1].indexOf("vod_pc_static_ncat") < 0) {
          pic = sm[1];
        }
      }

      const item = {
        vodId: vid,
        title: name,
        poster: absPic(host, pic),
        remark: remark,
        kind: defaultKind || null,
      };
      if (isSafeItem(item)) videos.push(item);
    }

    if (videos.length === 0) {
      const sRe = /<a href="(\/detail\/(\d+)\.html)" class="search-result-item"[\s\S]*?<img[^>]+data-original="([^"]+)"[^>]*>/gi;
      let sm;
      while ((sm = sRe.exec(html)) !== null) {
        const vid = sm[2];
        if (seen[vid]) continue;
        seen[vid] = true;
        const altM = /alt="([^"]+)"/i.exec(sm[0]);
        const name = altM ? cleanText(altM[1]) : "";
        if (!name) continue;
        const item = {
          vodId: vid,
          title: name,
          poster: absPic(host, sm[3]),
          remark: null,
          kind: defaultKind || null,
        };
        if (isSafeItem(item)) videos.push(item);
      }
    }

    return videos;
  }

  function hasMathWatermark(text) {
    for (const ch of text) {
      const cp = ch.codePointAt(0);
      if (cp >= 0x1d400 && cp <= 0x1d7ff) return true;
    }
    return false;
  }

  globalThis.LiveDeckVod = {
    async home(payload) {
      const config = payload && payload.config;
      const host = await ensureHost(config);
      const html = await safeGet(config, "/");
      return {
        categories: CHANNELS.filter(function (c) {
          return !NSFW_RE.test(c.name);
        }).map(function (c) {
          return { id: c.id, name: c.name, filters: [] };
        }),
        featured: parseVideos(host, html, null).slice(0, 30),
      };
    },

    async category(payload) {
      const config = payload && payload.config;
      const host = await ensureHost(config);
      const tid = String((payload && payload.categoryId) || "1").trim();
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10) || 1);
      if (page > 1) {
        return { items: [], page: page, totalPages: 1, hasMore: false };
      }
      const html = await safeGet(config, "/channel/" + tid + ".html");
      const items = parseVideos(host, html, KIND_MAP[tid] || null);
      return {
        items: items,
        page: page,
        totalPages: 1,
        hasMore: false,
      };
    },

    async search(payload) {
      const config = payload && payload.config;
      const host = await ensureHost(config);
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10) || 1);
      const kw = String((payload && payload.keyword) || "").trim();
      if (!kw) return { items: [], page: page, totalPages: 1, hasMore: false };
      let token = await getSearchToken(config);
      if (!token) return { items: [], page: page, totalPages: 1, hasMore: false };
      let html = await safeGet(
        config,
        "/search?k=" + Host.codec.urlEncode(kw) + "&t=" + Host.codec.urlEncode(token)
      );
      let items = parseVideos(host, html, null);
      if (items.length === 0) {
        cachedToken = "";
        token = await getSearchToken(config);
        if (token) {
          html = await safeGet(
            config,
            "/search?k=" + Host.codec.urlEncode(kw) + "&t=" + Host.codec.urlEncode(token)
          );
          items = parseVideos(host, html, null);
        }
      }
      return {
        items: items,
        page: page,
        totalPages: 1,
        hasMore: false,
      };
    },

    async detail(payload) {
      const config = payload && payload.config;
      const host = await ensureHost(config);
      const raw = String((payload && payload.vodId) || "").trim();
      const vm = /(\d+)/.exec(raw);
      const vid = vm ? vm[1] : raw;
      const html = await safeGet(config, "/detail/" + vid + ".html");
      if (!html) return { vodId: vid, title: vid, sources: [] };

      let name = "";
      const dm = /class="detail-title[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(html);
      if (dm) {
        const stRe = /<strong[^>]*>([^<]{2,60})<\/strong>/gi;
        let stm;
        while ((stm = stRe.exec(dm[1])) !== null) {
          const t = cleanText(stm[1]);
          if (t && !hasMathWatermark(t) && !/[a-zA-Z0-9]{2,}\./.test(t)) {
            name = t;
            break;
          }
        }
      }
      if (!name) {
        const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
        if (h1) name = cleanText(h1[1]);
      }

      let pic = null;
      const pm = /data-original="(\/vod1\/vod\/cover\/[^"]+)"/i.exec(html);
      if (pm) {
        pic = absPic(host, pm[1]);
      } else {
        const pm2 = /class="[^"]*detail-pic[^"]*"[\s\S]{0,300}?(?:data-original|src)="([^"]+)"/i.exec(html);
        if (pm2) pic = absPic(host, pm2[1]);
      }

      const info = {};
      const rowRe = /class="detail-info-row-side">([^<]*)<\/div>\s*<div class="detail-info-row-main">([\s\S]*?)<\/div>/gi;
      let rm;
      while ((rm = rowRe.exec(html)) !== null) {
        const side = cleanText(rm[1]).replace(/[：:]+$/, "");
        const main = cleanText(rm[2]);
        if (side) info[side] = main;
      }

      const labelNodes = Host.html.selectAll(html, ".source-item-label");
      const listNodes = Host.html.selectAll(html, ".episode-list-box-main .episode-list");
      const sources = [];
      const count = Math.min(labelNodes.length, listNodes.length);
      for (var i = 0; i < count; i++) {
        const lineName = cleanText(labelNodes[i].text) || "线路" + (i + 1);
        const listHtml = listNodes[i].html || "";
        const eps = [];
        const epRe = /href="(\/play\/[^"]+)"[^>]*class="episode-item"[^>]*>\s*<span>([^<]*)<\/span>/gi;
        let em;
        while ((em = epRe.exec(listHtml)) !== null) {
          const epTitle = cleanText(em[2]) || "第" + (eps.length + 1) + "集";
          eps.push({
            episodeId: (i + 1) + "-" + (eps.length + 1),
            name: epTitle,
            index: eps.length,
            playData: host + em[1],
          });
        }
        if (eps.length === 0) {
          const aNodes = Host.html.selectAll(listHtml, "a.episode-item");
          for (var j = 0; j < aNodes.length; j++) {
            const href = aNodes[j].attrs && aNodes[j].attrs.href;
            if (!href) continue;
            const epTitle = cleanText(aNodes[j].text) || "第" + (eps.length + 1) + "集";
            eps.push({
              episodeId: (i + 1) + "-" + (eps.length + 1),
              name: epTitle,
              index: eps.length,
              playData: absPic(host, href),
            });
          }
        }
        if (eps.length > 0) {
          sources.push({
            sourceId: "line-" + (i + 1),
            name: lineName,
            episodes: eps,
          });
        }
      }

      return {
        vodId: vid,
        title: name || "影片 " + vid,
        poster: pic,
        remark: info["备注"] || null,
        year: parseYear(info["首映"]),
        actors: splitNames(info["演员"] || ""),
        directors: splitNames(info["导演"] || ""),
        synopsis: info["剧情"] || info["简介"] || null,
        sources: sources,
      };
    },

    async play(payload) {
      const config = payload && payload.config;
      const host = await ensureHost(config);
      const raw = String((payload && payload.playData) || "").trim();
      if (!raw) {
        Host.raise("INVALID_PLAY_DATA", "empty ncat playData");
      }
      const headers = { Referer: host + "/" };
      if (/^https?:\/\//i.test(raw) && /\.(m3u8|mp4)(\?|$)/i.test(raw)) {
        return {
          streams: [{ label: "默认线路", url: raw, userAgent: UA, headers: headers }],
        };
      }
      const playUrl = absPic(host, raw);
      const html = await safeGet(config, playUrl, { Referer: playUrl });
      const pm = /playSource\s*=\s*\{\s*src:\s*["']([^"']+)["']/.exec(html);
      if (pm && /^https?:\/\//i.test(pm[1])) {
        return {
          streams: [{ label: "默认线路", url: pm[1], userAgent: UA, headers: headers }],
        };
      }
      const m3 = /https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4)[^\s"'<>]*/i.exec(html);
      if (m3) {
        return {
          streams: [{ label: "默认线路", url: m3[0], userAgent: UA, headers: headers }],
        };
      }
      Host.raise("NO_STREAM", "ncat could not extract stream from " + playUrl);
    },
  };
})();
