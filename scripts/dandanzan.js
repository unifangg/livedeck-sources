// Ported from dandanzan.py -> LiveDeck script_js (QuickJS Sandbox, mainstream categories only)
(function () {
  const DEFAULT_HOST = "https://www.dandanzan.club";
  const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

  const CLASSES = [
    ["1", "电影", "movie"],
    ["2", "电视剧", "series"],
    ["3", "综艺", "variety"],
    ["4", "动漫", "anime"],
    ["57", "短剧", "series"],
  ];

  function getHost(config) {
    const raw = (config && (config.host || config.url)) || DEFAULT_HOST;
    return String(raw).trim().replace(/\/+$/, "") || DEFAULT_HOST;
  }

  function absUrl(host, p) {
    if (!p) return "";
    const s = String(p).trim();
    if (/^https?:\/\//i.test(s)) return s;
    if (s.startsWith("//")) return "https:" + s;
    return host + (s.startsWith("/") ? s : "/" + s);
  }

  function cleanText(raw) {
    return String(raw || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/\s+/g, " ")
      .trim();
  }

  async function fetchHtml(host, pathOrUrl) {
    const url = absUrl(host, pathOrUrl);
    try {
      const resp = await Host.http.get(url, {
        headers: {
          "User-Agent": UA,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "zh-CN,zh;q=0.9",
          Referer: host + "/",
        },
        insecureTls: true,
        timeout: 18,
      });
      return resp && resp.ok ? resp.bodyText || resp.body || "" : "";
    } catch (_) {
      return "";
    }
  }

  function findPicForHref(html, href) {
    const escaped = href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    let m = new RegExp('href="' + escaped + '"[^>]*data-original="([^"]+)"', "i").exec(html);
    if (!m) m = new RegExp('data-original="([^"]+)"[^>]*href="' + escaped + '"', "i").exec(html);
    if (!m) m = new RegExp('href="' + escaped + '"[^>]*src="([^"]+)"', "i").exec(html);
    return m ? absUrl("", m[1]) || m[1] : "";
  }

  function parseList(host, html) {
    const items = [];
    const seen = Object.create(null);
    if (!html) return items;

    const re1 = /<a[^>]+class="[^"]*vodlist__thumb[^"]*"[^>]+href="([^"]+)"[^>]*title="([^"]*)"[^>]*(?:data-original="([^"]*)")?/gi;
    let m;
    while ((m = re1.exec(html)) !== null) {
      const href = m[1];
      if (seen[href]) continue;
      seen[href] = true;
      let pic = m[3] || "";
      if (!pic) pic = findPicForHref(html, href);
      items.push({
        vodId: href,
        title: cleanText(m[2]) || href,
        poster: pic ? absUrl(host, pic) : null,
        remark: "蛋蛋赞",
      });
    }

    if (items.length === 0) {
      const re2 = /href="(\/index\.php\/vod\/detail\/id\/\d+\.html)"[^>]*title="([^"]*)"/gi;
      while ((m = re2.exec(html)) !== null) {
        const href = m[1];
        if (seen[href]) continue;
        seen[href] = true;
        const pic = findPicForHref(html, href);
        items.push({
          vodId: href,
          title: cleanText(m[2]) || href,
          poster: pic ? absUrl(host, pic) : null,
          remark: "蛋蛋赞",
        });
      }
    }
    return items;
  }

  globalThis.LiveDeckVod = {
    async home(payload) {
      const host = getHost(payload && payload.config);
      const html = await fetchHtml(host, "/");
      return {
        categories: CLASSES.map(function (c) {
          return { id: c[0], name: c[1], filters: [] };
        }),
        featured: parseList(host, html).slice(0, 24),
      };
    },

    async category(payload) {
      const host = getHost(payload && payload.config);
      const pg = Math.max(1, parseInt((payload && payload.page) || 1, 10));
      const tid = String((payload && payload.categoryId) || "1");
      const url =
        pg <= 1
          ? host + "/index.php/vod/type/id/" + tid + ".html"
          : host + "/index.php/vod/show/id/" + tid + "/page/" + pg + ".html";
      const html = await fetchHtml(host, url);
      const items = parseList(host, html);
      let maxPage = pg;
      const pRe = /\/page\/(\d+)\.html/g;
      let pm;
      while ((pm = pRe.exec(html)) !== null) {
        const pNum = parseInt(pm[1], 10);
        if (pNum > maxPage) maxPage = pNum;
      }
      return {
        items: items,
        page: pg,
        totalPages: maxPage,
        hasMore: pg < maxPage,
      };
    },

    async search(payload) {
      const host = getHost(payload && payload.config);
      const pg = Math.max(1, parseInt((payload && payload.page) || 1, 10));
      const kw = String((payload && payload.keyword) || "").trim();
      if (!kw) return { items: [], page: pg, totalPages: 1, hasMore: false };
      const encKw = Host.codec.urlEncode(kw);
      let html = await fetchHtml(host, "/index.php/vod/search/page/" + pg + "/wd/" + encKw + ".html");
      let items = parseList(host, html);
      if (items.length === 0) {
        html = await fetchHtml(host, "/index.php/vod/search.html?wd=" + encKw + "&page=" + pg);
        items = parseList(host, html);
      }
      const hasMore = items.length >= 12;
      return {
        items: items,
        page: pg,
        totalPages: hasMore ? pg + 1 : pg,
        hasMore: hasMore,
      };
    },

    async detail(payload) {
      const host = getHost(payload && payload.config);
      const path = String((payload && payload.vodId) || "").trim();
      const html = await fetchHtml(host, path);
      if (!html) return { vodId: path, title: path, sources: [] };

      let title = "";
      let m = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
      if (m) {
        title = cleanText(m[1]).replace(/\(\d{4}\).*$/, "").trim();
      }
      if (!title) {
        m = /<title>([^<]+)/i.exec(html);
        if (m) title = m[1].split("-")[0].split("_")[0].trim();
      }

      let pic = "";
      m = /property=["']og:image["'][^>]*content=["']([^"']+)/i.exec(html);
      if (m) pic = m[1];
      if (!pic) {
        m = /data-original="(https?:\/\/[^"]+)"/i.exec(html);
        if (m) pic = m[1];
      }

      const groups = Object.create(null);
      const order = [];
      const epRe = /<a[^>]+href="(\/index\.php\/vod\/play\/id\/\d+\/sid\/(\d+)\/nid\/(\d+)\.html)"[^>]*>([\s\S]*?)<\/a>/gi;
      while ((m = epRe.exec(html)) !== null) {
        const href = m[1];
        const sid = m[2];
        const nid = m[3];
        const name = cleanText(m[4]) || "第" + nid + "集";
        if (!groups[sid]) {
          groups[sid] = [];
          order.push(sid);
        }
        groups[sid].push({
          episodeId: sid + "-" + nid,
          name: name,
          index: groups[sid].length,
          playData: absUrl(host, href),
        });
      }

      const sources = order.map(function (sid) {
        return {
          sourceId: "line-" + sid,
          name: "线路" + sid,
          episodes: groups[sid],
        };
      });

      return {
        vodId: path,
        title: title || path,
        poster: pic ? absUrl(host, pic) : null,
        remark: "蛋蛋赞",
        sources: sources,
      };
    },

    async play(payload) {
      const host = getHost(payload && payload.config);
      const headers = { Referer: host + "/" };
      const play = String((payload && payload.playData) || "").trim();
      if (/^https?:\/\//i.test(play) && /\.(m3u8|mp4)(\?|$)/i.test(play)) {
        return { streams: [{ label: "默认线路", url: play, userAgent: UA, headers: headers }] };
      }

      const pageUrl = absUrl(host, play);
      const html = await fetchHtml(host, pageUrl);
      const jsonStr = Host.text.extractJson(html, "player_aaaa");
      if (jsonStr) {
        try {
          const obj = JSON.parse(jsonStr);
          let raw = String(obj.url || "");
          const enc = parseInt(obj.encrypt || 0, 10);
          if (enc === 1) {
            raw = Host.codec.urlDecode(raw);
          } else if (enc === 2) {
            raw = Host.codec.urlDecode(Host.crypto.base64Decode(raw));
          }
          raw = raw.replace(/\\\//g, "/");
          if (/^https?:\/\//i.test(raw) && (/\.(m3u8|mp4)/i.test(raw) || raw.indexOf("/play/") >= 0)) {
            return { streams: [{ label: "默认线路", url: raw, userAgent: UA, headers: headers }] };
          }
        } catch (_) {}
      }

      const m3u8Re = /https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/gi;
      let m3;
      while ((m3 = m3u8Re.exec(html)) !== null) {
        const u = m3[0].replace(/&amp;/g, "&");
        if (u.toLowerCase().indexOf("preview") === -1) {
          return { streams: [{ label: "默认线路", url: u, userAgent: UA, headers: headers }] };
        }
      }

      Host.raise("NO_STREAM", "dandanzan could not extract direct stream from " + pageUrl);
    },
  };
})();
