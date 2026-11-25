// Ported from yy6080.py -> LiveDeck script_js (QuickJS Sandbox)
(function () {
  const DEFAULT_HOST = "https://www.yy8060.cc";
  const UA =
    "Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 Chrome/120 Safari/537.36";

  const AREAS = ["大陆", "香港", "台湾", "韩国", "日本", "美国", "英国", "泰国", "印度"];
  const YEARS = [];
  for (var y = 2026; y >= 2016; y--) YEARS.push(String(y));

  function makeFilters(classes) {
    return [
      {
        key: "class",
        name: "类型",
        defaultValue: "",
        options: [{ value: "", label: "全部" }].concat(
          classes.map(function (c) {
            return { value: c, label: c };
          })
        ),
      },
      {
        key: "year",
        name: "年份",
        defaultValue: "",
        options: [{ value: "", label: "全部" }].concat(
          YEARS.map(function (yr) {
            return { value: yr, label: yr };
          })
        ),
      },
      {
        key: "area",
        name: "地区",
        defaultValue: "",
        options: [{ value: "", label: "全部" }].concat(
          AREAS.map(function (a) {
            return { value: a, label: a };
          })
        ),
      },
      {
        key: "by",
        name: "排序",
        defaultValue: "time",
        options: [
          { value: "time", label: "时间" },
          { value: "hit", label: "人气" },
          { value: "commend", label: "推荐" },
        ],
      },
    ];
  }

  const CHANNELS = [
    {
      id: "1",
      name: "电影",
      kind: "movie",
      classes: ["动作", "喜剧", "爱情", "科幻", "剧情", "惊悚", "犯罪", "恐怖", "战争", "冒险", "奇幻", "悬疑", "记录"],
    },
    {
      id: "2",
      name: "电视剧",
      kind: "series",
      classes: ["国产剧", "港台剧", "日韩剧", "欧美剧", "海外剧", "剧情", "爱情", "古装", "悬疑", "犯罪"],
    },
    {
      id: "3",
      name: "动漫",
      kind: "anime",
      classes: ["国产动漫", "日韩动漫", "欧美动漫", "动画", "冒险", "奇幻"],
    },
    {
      id: "4",
      name: "综艺",
      kind: "variety",
      classes: ["大陆综艺", "日韩综艺", "港台综艺", "欧美综艺", "真人秀", "脱口秀"],
    },
    { id: "latest", name: "最新", kind: "other", classes: null },
    { id: "rank", name: "榜单", kind: "other", classes: null },
  ];

  const KIND_MAP = {
    "1": "movie",
    "2": "series",
    "3": "anime",
    "4": "variety",
    latest: "other",
    rank: "other",
  };

  const NSFW_RE = /(伦理|福利|成人|情色|里番|禁片|三级片|午夜场|色情|女优|18\+|R18|NSFW|Hentai|\bAV\b)/i;

  function getHost(config) {
    const c = config || {};
    return String(c.host || c.url || DEFAULT_HOST).trim().replace(/\/+$/, "") || DEFAULT_HOST;
  }

  function cleanText(raw) {
    if (raw === null || raw === undefined) return "";
    return String(raw)
      .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#0?39;/g, "'")
      .replace(/&ldquo;/gi, "“")
      .replace(/&rdquo;/gi, "”")
      .replace(/&hellip;/gi, "…")
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

  function absUrl(host, u) {
    const s = String(u || "").trim();
    if (!s) return null;
    if (s.startsWith("//")) return "https:" + s;
    if (/^https?:\/\//i.test(s)) return s;
    return Host.text.resolveUrl(host + "/", s) || null;
  }

  async function fetchHtml(host, pathOrUrl, referer) {
    const url = /^https?:\/\//i.test(pathOrUrl)
      ? pathOrUrl
      : host + (pathOrUrl.startsWith("/") ? pathOrUrl : "/" + pathOrUrl);
    try {
      const resp = await Host.http.get(url, {
        headers: {
          "User-Agent": UA,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "zh-CN,zh;q=0.9",
          Referer: referer || host + "/",
        },
        insecureTls: true,
        timeout: 15,
      });
      return resp && resp.ok ? resp.bodyText || resp.body || "" : "";
    } catch (_) {
      return "";
    }
  }

  function escapeRegex(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function parseList(host, html, defaultKind) {
    const items = [];
    const seen = Object.create(null);
    if (!html) return items;

    let boxes = [];
    const boxRe = /<li[^>]*class=["'][^"']*(?:pic-list-hover|col-xs-1 p-xs-0)[^"']*["'][\s\S]*?<\/li>/gi;
    let m;
    while ((m = boxRe.exec(html)) !== null) {
      boxes.push(m[0]);
    }
    if (boxes.length === 0) {
      const liRe = /<li[\s\S]*?<\/li>/gi;
      while ((m = liRe.exec(html)) !== null) {
        boxes.push(m[0]);
      }
    }

    for (var i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      const hm = /<a[^>]+href=["'](\/vote\/\d+\.html)["'][^>]*>/i.exec(b);
      if (!hm) continue;
      const href = hm[1];
      if (seen[href]) continue;
      seen[href] = true;

      let title = "";
      const tm1 = new RegExp('<a[^>]+href=["\']' + escapeRegex(href) + '["\'][^>]+title=["\']([^"\']+)', "i").exec(b);
      if (tm1) title = cleanText(tm1[1]);
      if (!title) {
        const tm2 = /<h[23][^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i.exec(b);
        if (tm2) title = cleanText(tm2[1]);
      }
      if (!title) {
        const am = /<img[^>]+alt=["']([^"']+)/i.exec(b);
        if (am) title = cleanText(am[1]);
      }
      if (!title) continue;

      let pm = /(?:data-original|data-src)=["']([^"']+?\.(?:jpg|jpeg|png|webp)[^"']*)["']/i.exec(b);
      if (!pm) pm = /<img[^>]+src=["']([^"']+?\.(?:jpg|jpeg|png|webp)[^"']*)["']/i.exec(b);
      const poster = pm ? absUrl(host, pm[1]) : null;

      let rm = /<span[^>]+class=["'][^"']*(?:titles|score)[^"']*["'][^>]*>([\s\S]*?)<\/span>/i.exec(b);
      if (!rm) rm = /<p[^>]+class=["'][^"\']*text-muted[^"']*["'][^>]*>([\s\S]*?)<\/p>/i.exec(b);
      const remark = rm ? cleanText(rm[1]) || null : null;

      const item = {
        vodId: href,
        title: title,
        poster: poster,
        remark: remark,
        kind: defaultKind || null,
      };
      if (isSafeItem(item)) items.push(item);
    }

    return items;
  }

  function parsePlayGroups(html) {
    let area = html;
    const st = html.indexOf("播放地址");
    if (st >= 0) {
      const ed = html.indexOf("剧情简介", st);
      area = html.slice(st, ed > st ? ed : html.length);
    }

    const navs = [];
    const seenPid = Object.create(null);
    const navRe = /<a[^>]+id=["']#(con_playlist_\d+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = navRe.exec(area)) !== null) {
      const pid = m[1];
      const name = cleanText(m[2]);
      if (name && name !== "不能播放，报错" && !seenPid[pid]) {
        seenPid[pid] = true;
        navs.push({ pid: pid, name: name });
      }
    }

    const sources = [];
    for (var i = 0; i < navs.length; i++) {
      const nav = navs[i];
      const ulRe = new RegExp('<ul[^>]+id=["\']' + escapeRegex(nav.pid) + '["\'][^>]*>([\\s\\S]*?)<\\/ul>', "i");
      const um = ulRe.exec(area);
      if (!um) continue;
      const eps = [];
      const epRe = /<a[^>]+href=["'](\/play\/[^"']+\.html)["'][^>]*>([\s\S]*?)<\/a>/gi;
      let em;
      while ((em = epRe.exec(um[1])) !== null) {
        eps.push({
          episodeId: nav.pid + "-" + (eps.length + 1),
          name: cleanText(em[2]) || "播放",
          index: eps.length,
          playData: em[1],
        });
      }
      if (eps.length > 0) {
        sources.push({
          sourceId: nav.pid,
          name: nav.name,
          episodes: eps,
        });
      }
    }

    if (sources.length === 0) {
      const eps = [];
      const seenHref = Object.create(null);
      const epRe2 = /<a[^>]+href=["'](\/play\/[^"']+\.html)["'][^>]*>([\s\S]*?)<\/a>/gi;
      let em2;
      while ((em2 = epRe2.exec(area)) !== null) {
        const href = em2[1];
        if (seenHref[href]) continue;
        seenHref[href] = true;
        eps.push({
          episodeId: "default-" + (eps.length + 1),
          name: cleanText(em2[2]) || "播放",
          index: eps.length,
          playData: href,
        });
      }
      if (eps.length > 0) {
        sources.push({
          sourceId: "default",
          name: "播放",
          episodes: eps,
        });
      }
    }

    return sources;
  }

  globalThis.LiveDeckVod = {
    async home(payload) {
      const host = getHost(payload && payload.config);
      const html = await fetchHtml(host, "/");
      return {
        categories: CHANNELS.filter(function (c) {
          return !NSFW_RE.test(c.name);
        }).map(function (c) {
          return {
            id: c.id,
            name: c.name,
            filters: c.classes ? makeFilters(c.classes) : [],
          };
        }),
        featured: parseList(host, html, null).slice(0, 30),
      };
    },

    async category(payload) {
      const host = getHost(payload && payload.config);
      const pg = Math.max(1, parseInt((payload && payload.page) || 1, 10) || 1);
      const tid = String((payload && payload.categoryId) || "1").trim();
      const filters = (payload && payload.filters) || {};

      let path = "";
      let isStatic = false;
      if (tid === "latest") {
        path = "/n/19.html";
        isStatic = true;
      } else if (tid === "rank") {
        path = "/n/20.html";
        isStatic = true;
      } else {
        const order = String(filters.by || "time");
        const jq = String(filters.class || "");
        const year = String(filters.year || "");
        const area = String(filters.area || "");
        path =
          "/search.php?page=" +
          pg +
          "&searchtype=5&order=" +
          Host.codec.urlEncode(order) +
          "&tid=" +
          Host.codec.urlEncode(tid) +
          "&area=" +
          Host.codec.urlEncode(area) +
          "&year=" +
          Host.codec.urlEncode(year) +
          "&letter=&yuyan=&state=&money=&ver=&jq=" +
          Host.codec.urlEncode(jq);
      }

      if (isStatic && pg > 1) {
        return { items: [], page: pg, totalPages: 1, hasMore: false };
      }

      const html = await fetchHtml(host, path);
      const items = parseList(host, html, KIND_MAP[tid] || null);
      const hasMore = !isStatic && items.length > 0;
      return {
        items: items,
        page: pg,
        totalPages: hasMore ? pg + 1 : pg,
        hasMore: hasMore,
      };
    },

    async search(payload) {
      const host = getHost(payload && payload.config);
      const pg = Math.max(1, parseInt((payload && payload.page) || 1, 10) || 1);
      const kw = String((payload && payload.keyword) || "").trim();
      if (!kw) return { items: [], page: pg, totalPages: 1, hasMore: false };
      const html = await fetchHtml(
        host,
        "/search.php?page=" + pg + "&searchword=" + Host.codec.urlEncode(kw) + "&searchtype="
      );
      const items = parseList(host, html, null);
      const hasMore = items.length > 0;
      return {
        items: items,
        page: pg,
        totalPages: hasMore ? pg + 1 : pg,
        hasMore: hasMore,
      };
    },

    async detail(payload) {
      const host = getHost(payload && payload.config);
      const raw = String((payload && payload.vodId) || "").trim();
      const href = raw.replace(/^vod@@/, "");
      const url = absUrl(host, href) || host + "/";
      const html = await fetchHtml(host, url);
      if (!html) return { vodId: href, title: href, sources: [] };

      let title = "";
      const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
      if (h1) title = cleanText(h1[1]);
      if (!title) {
        const tt = /<title>([\s\S]*?)<\/title>/i.exec(html);
        if (tt) {
          title = cleanText(tt[1]).split("免费在线观看")[0].replace(/[《》]/g, "").trim();
        }
      }

      let pm = /<a[^>]+class=["'][^"']*pic-img[^"']*["'][\s\S]*?<img[^>]+(?:data-original|src)=["']([^"']+)/i.exec(html);
      if (!pm) pm = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i.exec(html);
      const poster = pm ? absUrl(host, pm[1]) : null;

      const dm = /<span[^>]*>简介：<\/span>([\s\S]*?)<\/p>/i.exec(html);
      const synopsis = dm ? cleanText(dm[1]) || null : null;

      const cm = /<span[^>]*>类型：<\/span>([\s\S]*?)<\/div>/i.exec(html);
      const genres = cm ? splitNames(cm[1]) : [];

      const ym = /<span[^>]*>年份：<\/span>([\s\S]*?)<\/div>/i.exec(html);
      const year = ym ? parseYear(ym[1]) : null;

      const am = /<span[^>]*>地区：<\/span>([\s\S]*?)<\/div>/i.exec(html);
      const region = am ? cleanText(am[1]) || null : null;

      return {
        vodId: href,
        title: title || href,
        poster: poster,
        year: year,
        region: region,
        genres: genres,
        actors: [],
        directors: [],
        synopsis: synopsis,
        sources: parsePlayGroups(html),
      };
    },

    async play(payload) {
      const host = getHost(payload && payload.config);
      const raw = String((payload && payload.playData) || "").trim().replace(/^play@@/, "");
      if (!raw) {
        Host.raise("INVALID_PLAY_DATA", "empty yy6080 playData");
      }
      if (/^https?:\/\//i.test(raw) && /\.(m3u8|mp4)(\?|$)/i.test(raw)) {
        return {
          streams: [
            { label: "默认线路", url: raw, userAgent: UA, headers: { Referer: host + "/" } },
          ],
        };
      }
      const url = absUrl(host, raw);
      const html = await fetchHtml(host, url);
      let finalUrl = "";
      const pats = [
        /var\s+now\s*=\s*["']([^"']+)["']/i,
        /(https?:\/\/[^"'<>]+\.(?:m3u8|mp4)[^"'<>]*)/i,
      ];
      for (var i = 0; i < pats.length; i++) {
        const m = pats[i].exec(html);
        if (m && m[1]) {
          finalUrl = m[1].replace(/\\\//g, "/").trim();
          break;
        }
      }
      if (finalUrl) {
        return {
          streams: [
            { label: "默认线路", url: finalUrl, userAgent: UA, headers: { Referer: url } },
          ],
        };
      }
      Host.raise("NO_STREAM", "yy6080 could not extract stream from " + url);
    },
  };
})();
