// Ported from xinhanju_py.py -> LiveDeck script_js (QuickJS Sandbox)
(function () {
  const DEFAULT_HOST = "https://www.jennyhow.com";
  const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

  const CATEGORIES = [
    ["/hxq/1.html", "最新韩剧", "series"],
    ["/hxq/2.html", "韩国电影", "movie"],
    ["/hxq/3.html", "韩国综艺", "variety"],
    ["/hxq/4.html", "韩国动漫", "anime"],
  ];

  function getHost(config) {
    const raw = (config && (config.host || config.url)) || DEFAULT_HOST;
    return String(raw).trim().replace(/\/+$/, "") || DEFAULT_HOST;
  }

  function absUrl(host, u) {
    if (!u) return null;
    const s = String(u).trim().replace(/\\\//g, "/");
    if (!s) return null;
    if (s.startsWith("//")) return "https:" + s;
    if (/^https?:\/\//i.test(s)) return s;
    return host + (s.startsWith("/") ? s : "/" + s);
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
      .map(function (s) {
        return s.trim();
      })
      .filter(function (s) {
        return Boolean(s) && s !== "内详";
      });
  }

  function kindForCategory(tid) {
    for (var i = 0; i < CATEGORIES.length; i++) {
      if (CATEGORIES[i][0] === tid) return CATEGORIES[i][2];
    }
    return null;
  }

  let cookieWarmed = false;

  async function fetchHtml(host, pathOrUrl) {
    const url = /^https?:\/\//i.test(pathOrUrl)
      ? pathOrUrl
      : host + (pathOrUrl.startsWith("/") ? pathOrUrl : "/" + pathOrUrl);
    try {
      const resp = await Host.http.get(url, {
        headers: {
          "User-Agent": UA,
          Referer: host + "/",
          "Accept-Language": "zh-CN,zh;q=0.9",
        },
        cookieJar: true,
        insecureTls: true,
        timeout: 15,
      });
      if (resp && resp.ok) cookieWarmed = true;
      return resp && resp.ok ? resp.bodyText || resp.body || "" : "";
    } catch (_) {
      return "";
    }
  }

  function parseItems(host, html, kind) {
    const items = [];
    const seen = Object.create(null);
    if (!html) return items;

    let cards = Host.html.selectAll(html, "div.module-search-item");
    if (cards.length === 0) {
      cards = Host.html.selectAll(html, "div.module-item");
    }
    for (var i = 0; i < cards.length; i++) {
      const cardHtml = cards[i].html;
      const href =
        Host.html.attr(cardHtml, "a.module-item-pic", "href") ||
        Host.html.attr(cardHtml, "a.module-item-title", "href") ||
        Host.html.attr(cardHtml, "a", "href") ||
        "";
      if (!href || href.indexOf("/hxq/") === 0) continue;
      if (seen[href]) continue;
      seen[href] = true;

      const title =
        cleanText(Host.html.attr(cardHtml, "a.module-item-title", "title")) ||
        cleanText(Host.html.attr(cardHtml, "a.module-item-pic", "title")) ||
        cleanText(Host.html.attr(cardHtml, "img", "alt")) ||
        cleanText(Host.html.attr(cardHtml, "a", "title")) ||
        cleanText(Host.html.text(cardHtml, ".module-item-title"));
      if (!title) continue;

      const picRaw =
        Host.html.attr(cardHtml, "img", "data-src") ||
        Host.html.attr(cardHtml, "img", "data-original") ||
        Host.html.attr(cardHtml, "img", "src");
      const remark =
        cleanText(Host.html.text(cardHtml, ".module-item-text")) ||
        cleanText(Host.html.text(cardHtml, ".module-item-note"));

      items.push({
        vodId: href,
        title: title,
        poster: absUrl(host, picRaw),
        remark: remark || null,
        kind: kind || null,
      });
    }
    return items;
  }

  globalThis.LiveDeckVod = {
    async home(payload) {
      const host = getHost(payload && payload.config);
      const html = await fetchHtml(host, "/");
      return {
        categories: CATEGORIES.map(function (c) {
          return { id: c[0], name: c[1], filters: [] };
        }),
        featured: parseItems(host, html, null).slice(0, 36),
      };
    },

    async category(payload) {
      const host = getHost(payload && payload.config);
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10));
      let tid = String((payload && payload.categoryId) || "/hxq/1.html").trim();
      if (tid === "1" || tid === "20") tid = "/hxq/1.html";
      else if (tid === "2" || tid === "21") tid = "/hxq/2.html";
      else if (tid === "3" || tid === "22") tid = "/hxq/3.html";
      else if (tid === "4" || tid === "23") tid = "/hxq/4.html";

      const path =
        page > 1 && tid.endsWith(".html") ? tid.replace(".html", "-" + page + ".html") : tid;
      const html = await fetchHtml(host, path);
      const items = parseItems(host, html, kindForCategory(tid));
      const hasMore = items.length >= 16;
      return {
        items: items,
        page: page,
        totalPages: hasMore ? page + 1 : page,
        hasMore: hasMore,
      };
    },

    async search(payload) {
      const host = getHost(payload && payload.config);
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10));
      const kw = String((payload && payload.keyword) || "").trim();
      if (!kw) return { items: [], page: page, totalPages: 1, hasMore: false };

      let html = "";
      if (page <= 1) {
        if (!cookieWarmed) {
          await fetchHtml(host, "/");
        }
        try {
          const resp = await Host.http.post(host + "/search.php", undefined, {
            form: { searchword: kw },
            headers: {
              "User-Agent": UA,
              Referer: host + "/",
              Origin: host,
              "Accept-Language": "zh-CN,zh;q=0.9",
            },
            cookieJar: true,
            insecureTls: true,
            timeout: 15,
          });
          if (resp && resp.ok) html = resp.bodyText || resp.body || "";
        } catch (_) {}
      } else {
        html = await fetchHtml(
          host,
          "/search.php?searchword=" + Host.codec.urlEncode(kw) + "&page=" + page
        );
      }

      const items = parseItems(host, html, null);
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
      const rawId = String((payload && payload.vodId) || "").trim();
      const path = rawId.startsWith("http") || rawId.startsWith("/") ? rawId : "/hanxiaoquan/" + rawId + ".html";
      const html = await fetchHtml(host, path);
      if (!html) {
        return { vodId: rawId, title: rawId, actors: [], directors: [], sources: [] };
      }

      const title =
        cleanText(Host.html.text(html, "h1.page-title")) ||
        cleanText(Host.html.text(html, "h1")) ||
        rawId;
      const posterRaw =
        Host.html.attr(html, "img.lazyload", "data-src") ||
        Host.html.attr(html, "img.lazyload", "data-original") ||
        Host.html.attr(html, "img.lazy", "data-src") ||
        Host.html.attr(html, ".video-cover img", "src");

      let year = null;
      let region = null;
      let actors = [];
      let directors = [];
      let genres = [];
      let synopsis = null;

      const genreText = cleanText(Host.html.text(html, '.video-info-aux a[href*="/hxq/"]'));
      if (genreText) genres = [genreText];
      const areaText = cleanText(Host.html.text(html, '.video-info-aux a[href*="area="]'));
      if (areaText) region = areaText;
      const yearAux = cleanText(Host.html.text(html, '.video-info-aux a[href*="year="]'));
      if (yearAux) year = parseYear(yearAux);

      const infoRows = Host.html.selectAll(html, ".video-info-items");
      for (var i = 0; i < infoRows.length; i++) {
        const rowHtml = infoRows[i].html;
        const label = cleanText(Host.html.text(rowHtml, ".video-info-itemtitle"));
        const val = cleanText(Host.html.text(rowHtml, ".video-info-item"));
        if (!label || !val) continue;
        if (label.indexOf("导演") >= 0) {
          directors = splitNames(val);
        } else if (label.indexOf("主演") >= 0) {
          actors = splitNames(val.replace(/\/\s*$/, ""));
        } else if ((label.indexOf("上映") >= 0 || label.indexOf("年份") >= 0) && !year) {
          year = parseYear(val);
        } else if (label.indexOf("剧情") >= 0 || label.indexOf("简介") >= 0) {
          synopsis = val;
        }
      }

      if (!synopsis) {
        synopsis =
          cleanText(Host.html.text(html, ".module-info-introduction-content")) ||
          cleanText(Host.html.text(html, ".module-info-introduction")) ||
          null;
      }

      const sources = [];
      const tabs = Host.html.selectAll(html, "ul.nav-tabs li a");
      for (var t = 0; t < tabs.length; t++) {
        const tab = tabs[t];
        const href = (tab.attrs && tab.attrs.href) || "";
        const targetId = href.replace(/^#/, "");
        if (!targetId) continue;
        const lineName = cleanText(tab.text) || "线路" + (t + 1);
        const epLinks = Host.html.selectAll(html, "#" + targetId + " a");
        const eps = [];
        for (var e = 0; e < epLinks.length; e++) {
          const ep = epLinks[e];
          const epHref = (ep.attrs && ep.attrs.href) || "";
          if (!epHref || epHref.indexOf("/play/") === -1) continue;
          const epName =
            cleanText((ep.attrs && ep.attrs.title) || ep.text) || "第" + (eps.length + 1) + "集";
          eps.push({
            episodeId: targetId + "-" + (eps.length + 1),
            name: epName,
            index: eps.length,
            playData: epHref,
          });
        }
        if (eps.length > 0) {
          sources.push({
            sourceId: targetId,
            name: lineName,
            episodes: eps,
          });
        }
      }

      return {
        vodId: rawId,
        title: title,
        poster: absUrl(host, posterRaw),
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
      const raw = String((payload && payload.playData) || "").trim();
      if (/^https?:\/\//i.test(raw) && /\.(m3u8|mp4|flv)(\?|$)/i.test(raw)) {
        return {
          streams: [{ label: "默认线路", url: raw, userAgent: UA, headers: { Referer: host + "/" } }],
        };
      }

      const html = await fetchHtml(host, raw);
      if (!html) {
        Host.raise("NO_STREAM", "xinhanju failed to fetch play page: " + raw);
      }

      let streamUrl = "";
      const nm = /var\s+now\s*=\s*['"]([^'"]+)['"]/.exec(html);
      if (nm) streamUrl = nm[1].trim();

      if (!streamUrl) {
        const jsonStr = Host.text.extractJson(html, "player_aaaa");
        if (jsonStr) {
          try {
            const obj = JSON.parse(jsonStr);
            streamUrl = String(obj.url || "").replace(/\\\//g, "/").trim();
          } catch (_) {}
        }
      }

      if (!streamUrl) {
        const mm = /(https?:\/\/[^\s"'<>\\]+\.(?:m3u8|mp4)[^\s"'<>\\]*)/i.exec(
          html.replace(/\\\//g, "/")
        );
        if (mm) streamUrl = mm[1];
      }

      if (!streamUrl) {
        Host.raise("NO_STREAM", "xinhanju could not extract stream from " + raw);
      }

      return {
        streams: [
          {
            label: "默认线路",
            url: absUrl(host, streamUrl),
            userAgent: UA,
            headers: { Referer: host + "/" },
          },
        ],
      };
    },
  };
})();
