// Ported from weishi.py -> LiveDeck script_js (QuickJS Sandbox)
(function () {
  const DEFAULT_HOST = "https://weishitv.xyz";
  const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

  const CHANNELS = [
    { id: "1", name: "电影", kind: "movie" },
    { id: "2", name: "剧集", kind: "series" },
    { id: "3", name: "综艺", kind: "variety" },
    { id: "4", name: "动漫", kind: "anime" },
  ];

  const KIND_MAP = {
    "1": "movie",
    "2": "series",
    "3": "variety",
    "4": "anime",
  };

  const NSFW_RE = /(伦理|福利|成人|情色|里番|禁片|三级片|午夜场|色情|女优|18\+|R18|NSFW|Hentai|\bAV\b)/i;

  function getHost(config) {
    const c = config || {};
    const raw = String(c.host || c.url || c.site || DEFAULT_HOST).trim().replace(/\/+$/, "");
    return /^https?:\/\//i.test(raw) ? raw : DEFAULT_HOST;
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

  function isSafeItem(item) {
    const text = [
      item && item.title,
      item && item.remark,
      Array.isArray(item && item.genres) ? item.genres.join(" ") : "",
    ].join(" ");
    return !NSFW_RE.test(text);
  }

  function absUrl(host, value) {
    const text = String(value || "").trim();
    if (!text) return null;
    if (text.startsWith("//")) return "https:" + text;
    if (/^https?:\/\//i.test(text)) {
      try {
        const u = new URL(text);
        if (u.pathname.indexOf("/index.php/") >= 0) {
          return host + u.pathname + (u.search || "");
        }
        return text;
      } catch (_) {
        return text;
      }
    }
    return Host.text.resolveUrl(host + "/", text) || null;
  }

  function relPath(value) {
    const text = String(value || "").trim();
    if (!text) return "";
    if (/^https?:\/\//i.test(text)) {
      try {
        const u = new URL(text);
        return u.pathname + (u.search || "");
      } catch (_) {
        return text;
      }
    }
    return text.startsWith("/") ? text : "/" + text;
  }

  function isMedia(url) {
    return (
      /^https?:\/\//i.test(String(url || "")) &&
      /\.(m3u8|mp4|flv|mkv|ts|mpd)(?:[?#]|$)/i.test(String(url))
    );
  }

  async function fetchHtml(host, pathOrUrl) {
    const url = /^https?:\/\//i.test(pathOrUrl)
      ? pathOrUrl
      : host + (pathOrUrl.startsWith("/") ? pathOrUrl : "/" + pathOrUrl);
    try {
      const resp = await Host.http.get(url, {
        headers: {
          "User-Agent": UA,
          Referer: host + "/",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
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

  function parseList(host, html, defaultKind) {
    if (!html) return [];
    const items = [];
    const seen = Object.create(null);
    const boxes = Host.html.selectAll(html, ".public-list-box");
    for (var i = 0; i < boxes.length; i++) {
      const box = boxes[i];
      const boxHtml = box && box.html ? box.html : "";
      if (!boxHtml) continue;
      let link = Host.html.select(boxHtml, "a.public-list-exp");
      if (!link || !link.attrs || !link.attrs.href || link.attrs.href.indexOf("/vod/detail/") < 0) {
        link = Host.html.select(boxHtml, "a[href*='/index.php/vod/detail/']");
      }
      if (!link) continue;
      const vodId = relPath(link.attrs && link.attrs.href);
      if (!vodId || seen[vodId]) continue;

      let name = cleanText(link.attrs && link.attrs.title);
      if (!name) {
        const alt = cleanText(Host.html.attr(link.html || boxHtml, "img", "alt") || "");
        name = alt.replace(/封面图$/, "").trim();
      }
      if (!name) continue;
      seen[vodId] = true;

      let rawPic =
        Host.html.attr(link.html || boxHtml, "img", "data-src") ||
        Host.html.attr(link.html || boxHtml, "img", "data-original") ||
        Host.html.attr(link.html || boxHtml, "img", "src") ||
        "";
      const poster =
        !rawPic || String(rawPic).startsWith("data:image/") ? null : absUrl(host, rawPic);

      let remark = cleanText(Host.html.text(boxHtml, ".public-list-prb"));
      if (!remark) remark = cleanText(Host.html.text(boxHtml, ".public-prt"));

      const item = {
        vodId: vodId,
        title: name,
        poster: poster,
        remark: remark || null,
        kind: defaultKind || null,
      };
      if (isSafeItem(item)) items.push(item);
    }
    return items;
  }

  function pageCount(html, fallback) {
    let maxPage = fallback;
    const re = /\/page\/(\d+)\.html/g;
    let m;
    while ((m = re.exec(html || "")) !== null) {
      const n = parseInt(m[1], 10);
      if (n > maxPage) maxPage = n;
    }
    return maxPage;
  }

  globalThis.LiveDeckVod = {
    async home(payload) {
      const host = getHost(payload && payload.config);
      const html = await fetchHtml(host, "/");
      return {
        categories: CHANNELS.filter(function (c) {
          return !NSFW_RE.test(c.name);
        }).map(function (c) {
          return { id: c.id, name: c.name, filters: [] };
        }),
        featured: parseList(host, html, null).slice(0, 60),
      };
    },

    async category(payload) {
      const host = getHost(payload && payload.config);
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10) || 1);
      const tid = String((payload && payload.categoryId) || "1").trim();
      const html = await fetchHtml(
        host,
        "/index.php/vod/show/id/" + Host.codec.urlEncode(tid) + "/page/" + page + ".html"
      );
      const items = parseList(host, html, KIND_MAP[tid] || null);
      const totalPages = pageCount(html, items.length > 0 ? page + 1 : page);
      return {
        items: items,
        page: page,
        totalPages: totalPages,
        hasMore: page < totalPages,
      };
    },

    async search(payload) {
      const host = getHost(payload && payload.config);
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10) || 1);
      const kw = String((payload && payload.keyword) || "").trim();
      if (!kw) return { items: [], page: page, totalPages: 1, hasMore: false };
      const suffix = page > 1 ? "&page=" + page : "";
      const html = await fetchHtml(
        host,
        "/index.php/vod/search.html?wd=" + Host.codec.urlEncode(kw) + suffix
      );
      const items = parseList(host, html, null);
      const totalPages = pageCount(html, items.length > 0 ? page + 1 : page);
      return {
        items: items,
        page: page,
        totalPages: totalPages,
        hasMore: page < totalPages,
      };
    },

    async detail(payload) {
      const host = getHost(payload && payload.config);
      const rawId = String((payload && payload.vodId) || "").trim();
      const vodPath = relPath(rawId);
      const html = await fetchHtml(host, absUrl(host, rawId) || host + "/");
      if (!html) return { vodId: vodPath, title: vodPath, sources: [] };

      const title = cleanText(Host.html.text(html, ".this-desc-title")) || vodPath;
      const picNode = Host.html.select(html, ".this-pic-bj");
      const style = (picNode && picNode.attrs && picNode.attrs.style) || "";
      const pm = /url\(['"]?([^'")]+)/i.exec(style);
      const poster = pm ? absUrl(host, pm[1]) : null;

      const infoSpans = Host.html
        .selectTexts(html, ".this-desc-info span")
        .map(cleanText)
        .filter(Boolean);

      let year = null;
      let yearStr = "";
      let region = null;
      let remark = null;
      for (var i = 0; i < infoSpans.length; i++) {
        const s = infoSpans[i];
        if (!year && /^(19|20)\d{2}$/.test(s)) {
          year = parseYear(s);
          yearStr = s;
        } else if (!remark && /(更新|集|完结|HD|正片)/.test(s)) {
          remark = s;
        } else if (!region && s !== yearStr && !/(更新|集|完结|分$)/.test(s)) {
          region = s;
        }
      }

      const genres = Host.html
        .selectTexts(html, ".this-desc-tags span")
        .map(cleanText)
        .filter(Boolean);

      let directors = [];
      let actors = [];
      const infoNodes = Host.html.selectAll(html, ".this-info");
      for (var j = 0; j < infoNodes.length; j++) {
        const nodeHtml = infoNodes[j].html || "";
        const label = cleanText(Host.html.text(nodeHtml, "strong")).replace(/\s+/g, "");
        const vals = Host.html.selectTexts(nodeHtml, "a").map(cleanText).filter(Boolean);
        if (label.indexOf("导演") >= 0) directors = vals;
        if (label.indexOf("演员") >= 0 || label.indexOf("主演") >= 0) actors = vals;
      }

      const synopsis =
        cleanText(Host.html.text(html, "#height_limit .text"))
          .replace(/^\s*简介[:：]?\s*/, "")
          .trim() || null;

      const lineNodes = Host.html.selectAll(html, ".anthology-tab .line-btn");
      const blocks = Host.html.selectAll(html, ".anthology-list .anthology-list-box");
      const sources = [];
      const count = Math.min(lineNodes.length, blocks.length);
      for (var k = 0; k < count; k++) {
        const lHtml = lineNodes[k].html || "";
        const lineName =
          cleanText(lHtml.replace(/<span[^>]+class=["'][^"']*badge[^"']*["'][^>]*>[\s\S]*?<\/span>/gi, " ")) ||
          "线路" + (k + 1);
        const epNodes = Host.html.selectAll(blocks[k].html || "", "a.episode-btn");
        const episodes = [];
        for (var eIdx = 0; eIdx < epNodes.length; eIdx++) {
          const epNode = epNodes[eIdx];
          const href = epNode.attrs && epNode.attrs.href;
          const epPath = relPath(href);
          if (!epPath) continue;
          const epName = cleanText(epNode.text) || "第" + (episodes.length + 1) + "集";
          episodes.push({
            episodeId: (k + 1) + "-" + (episodes.length + 1),
            name: epName,
            index: episodes.length,
            playData: epPath,
          });
        }
        if (episodes.length > 0) {
          sources.push({
            sourceId: "line-" + (k + 1),
            name: lineName,
            episodes: episodes,
          });
        }
      }

      return {
        vodId: vodPath,
        title: title,
        poster: poster,
        remark: remark,
        year: year,
        region: region,
        genres: genres,
        actors: actors,
        directors: directors,
        synopsis: synopsis,
        sources: sources,
      };
    },

    async play(payload) {
      const host = getHost(payload && payload.config);
      const value = String((payload && payload.playData) || "").trim();
      if (!value) {
        Host.raise("INVALID_PLAY_DATA", "empty weishi playData");
      }
      const headers = { Referer: host + "/" };
      if (isMedia(value)) {
        return {
          streams: [{ label: "默认线路", url: value, userAgent: UA, headers: headers }],
        };
      }

      const playPageUrl = absUrl(host, value);
      const html = await fetchHtml(host, playPageUrl || value);
      const jsonStr = Host.text.extractJson(html, "player_aaaa");
      if (jsonStr) {
        try {
          const player = JSON.parse(jsonStr);
          let u = String(player.url || "").trim();
          const enc = parseInt(player.encrypt || 0, 10) || 0;
          if (enc === 1) u = Host.codec.urlDecode(u);
          else if (enc === 2) u = Host.codec.urlDecode(Host.crypto.base64Decode(u));
          if (/^https?:\/\//i.test(u)) {
            return {
              streams: [{ label: "默认线路", url: u, userAgent: UA, headers: headers }],
            };
          }
        } catch (_) {}
      }

      const m3 = /https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4)[^\s"'<>]*/i.exec(html);
      if (m3) {
        return {
          streams: [{ label: "默认线路", url: m3[0], userAgent: UA, headers: headers }],
        };
      }

      Host.raise("NO_STREAM", "weishi failed to extract stream from " + (playPageUrl || value));
    },
  };
})();
