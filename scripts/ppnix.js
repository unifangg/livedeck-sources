// Ported from ppnix.py -> LiveDeck script_js (QuickJS Sandbox)
(function () {
  const DEFAULT_HOST = "https://www.ppnix.com";
  const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36";

  const CATS = [
    ["movie", "电影", "movie"],
    ["tv", "电视剧", "series"],
    ["movie/剧情", "电影·剧情", "movie"],
    ["movie/喜剧", "电影·喜剧", "movie"],
    ["movie/动作", "电影·动作", "movie"],
    ["movie/爱情", "电影·爱情", "movie"],
    ["movie/科幻", "电影·科幻", "movie"],
    ["movie/恐怖", "电影·恐怖", "movie"],
    ["movie/动画", "电影·动画", "anime"],
    ["movie/悬疑", "电影·悬疑", "movie"],
  ];

  const UNSAFE_RE =
    /(?:伦理|倫理|福利|成人|情色|三级|三級|写真|寫真|里番|裏番|无码|無碼|有码|有碼|色情|18\+|\bAV\b)/i;

  function isUnsafeText(s) {
    return UNSAFE_RE.test(String(s || ""));
  }

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
    return s.startsWith("/") ? host + s : host + "/" + s;
  }

  function cleanText(raw) {
    return String(raw || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/\s+/g, " ")
      .trim();
  }

  function match1(text, re) {
    const m = re.exec(text || "");
    return m && m[1] ? m[1] : "";
  }

  function inferKind(tid) {
    if (String(tid).indexOf("动画") !== -1) return "anime";
    if (String(tid).indexOf("tv") === 0) return "series";
    return "movie";
  }

  async function fetchHtml(host, pathOrUrl) {
    const url = /^https?:\/\//i.test(pathOrUrl)
      ? pathOrUrl
      : host + (pathOrUrl.startsWith("/") ? pathOrUrl : "/" + pathOrUrl);
    try {
      const resp = await Host.http.get(url, {
        headers: {
          "User-Agent": UA,
          Referer: host + "/cn/",
          "Accept-Language": "zh-CN,zh;q=0.9",
        },
        insecureTls: true,
        timeout: 20,
      });
      return resp && resp.ok ? resp.bodyText || resp.body || "" : "";
    } catch (_) {
      return "";
    }
  }

  function parseList(host, html, kind) {
    const items = [];
    const seen = Object.create(null);
    if (!html) return items;

    const re =
      /<a href="(\/cn\/(?:movie|tv)\/(\d+)\.html)"[^>]*class="thumbnail"[^>]*>\s*<img[^>]+src="([^"]*)"[^>]*alt="([^"]*)"/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
      const path = m[1];
      const pid = m[2];
      if (seen[pid]) continue;
      const title = cleanText(m[4] || pid);
      if (!title || isUnsafeText(title)) continue;
      seen[pid] = true;

      items.push({
        vodId: path,
        title: title,
        poster: absUrl(host, m[3]),
        remark: null,
        kind: kind || (path.indexOf("/tv/") !== -1 ? "series" : "movie"),
      });
    }
    return items;
  }

  globalThis.LiveDeckVod = {
    async home(payload) {
      const host = getHost(payload && payload.config);
      const html = await fetchHtml(host, "/cn/");
      return {
        categories: CATS.map(function (c) {
          return { id: c[0], name: c[1], filters: [] };
        }),
        featured: parseList(host, html, null).slice(0, 24),
      };
    },

    async category(payload) {
      const host = getHost(payload && payload.config);
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10) || 1);
      const tid = String((payload && payload.categoryId) || "movie")
        .trim()
        .replace(/^\/+|\/+$/g, "");

      let path;
      const slashIdx = tid.indexOf("/");
      if (slashIdx !== -1) {
        const base = tid.slice(0, slashIdx);
        const genre = Host.codec.urlEncode(tid.slice(slashIdx + 1));
        path =
          page <= 1
            ? "/cn/" + base + "/" + genre + "----.html"
            : "/cn/" + base + "/" + genre + "---" + page + "-.html";
      } else {
        path = page <= 1 ? "/cn/" + tid + "/" : "/cn/" + tid + "/---" + page + "-.html";
      }

      const html = await fetchHtml(host, path);
      const items = parseList(host, html, inferKind(tid));
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

      const word = Host.codec.urlEncode(kw.replace(/-/g, " ").trim());
      const path =
        page > 1
          ? "/cn/search/" + word + "---" + page + "-.html"
          : "/cn/search/" + word + "--.html";
      const html = await fetchHtml(host, path);
      const items = parseList(host, html, null);
      const hasMore = items.length >= 20;
      return {
        items: items,
        page: page,
        totalPages: hasMore ? page + 1 : page,
        hasMore: hasMore,
      };
    },

    async detail(payload) {
      const host = getHost(payload && payload.config);
      let path = String((payload && payload.vodId) || "").trim();
      if (!path.startsWith("/")) path = "/cn/movie/" + path;
      if (!path.endsWith(".html")) path = path.replace(/\/+$/, "") + ".html";

      const html = await fetchHtml(host, path);
      if (!html) {
        return {
          vodId: path,
          title: path,
          poster: null,
          actors: [],
          directors: [],
          genres: [],
          sources: [],
        };
      }

      let title = "";
      let year = null;
      const rawTitle = match1(html, /<title>([^<]+)<\/title>/i);
      if (rawTitle) {
        const ym = /\((\d{4})\)/.exec(rawTitle);
        if (ym) {
          const yn = parseInt(ym[1], 10);
          if (yn >= 1900 && yn <= 2100) year = yn;
        }
        title = cleanText(rawTitle.split(" - ")[0]).replace(/\s*\(\d{4}\)\s*$/, "").trim();
      }

      if (isUnsafeText(title)) {
        Host.raise("CONTENT_FILTERED", "filtered unsafe content");
      }

      const poster = absUrl(
        host,
        match1(html, /property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
          match1(html, /class="thumbnail"[^>]*>\s*<img[^>]+src="([^"]+)"/i)
      );

      let infoid = match1(html, /infoid\s*=\s*['"]?(\d+)/i);
      if (!infoid) {
        infoid = match1(path, /\/cn\/(?:movie|tv)\/(\d+)/i);
      }

      const params = [];
      const mm = /m3u8\s*=\s*\[([^\]]+)\]/i.exec(html);
      if (mm) {
        const qRe = /['"]([^'"]+)['"]/g;
        let qm;
        while ((qm = qRe.exec(mm[1])) !== null) {
          if (qm[1]) params.push(qm[1]);
        }
      }
      if (params.length === 0) params.push("1080P");

      const episodes = params.map(function (p, idx) {
        const epName = /^\d+$/.test(p) ? "第" + p + "集" : p;
        return {
          episodeId: String(idx + 1),
          name: epName,
          index: idx,
          playData: host + "/info/m3u8/" + infoid + "/" + p + ".m3u8",
        };
      });

      return {
        vodId: path,
        title: title || infoid || path,
        poster: poster,
        year: year,
        actors: [],
        directors: [],
        genres: [],
        synopsis: title || null,
        kind: path.indexOf("/tv/") !== -1 ? "series" : "movie",
        sources:
          episodes.length > 0
            ? [{ sourceId: "ppnix", name: "PPnix", episodes: episodes }]
            : [],
      };
    },

    async play(payload) {
      const host = getHost(payload && payload.config);
      let playUrl = String((payload && payload.playData) || "").trim();
      if (!playUrl) {
        Host.raise("INVALID_PLAY_DATA", "missing ppnix playData");
      }
      if (playUrl.startsWith("/")) playUrl = host + playUrl;

      return {
        streams: [
          {
            label: "默认线路",
            url: playUrl,
            userAgent: UA,
            headers: { Referer: host + "/cn/" },
          },
        ],
      };
    },
  };
})();
