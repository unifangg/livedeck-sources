// Ported from moovie.py -> LiveDeck script_js (QuickJS Sandbox)
(function () {
  const DEFAULT_HOST = "https://moovie.c2v2.com";
  const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

  const CATEGORIES = [
    ["movie", "热门电影", "movie"],
    ["tv", "热门剧集", "series"],
    ["show", "热门综艺", "variety"],
    ["cartoon", "日本动画", "anime"],
  ];

  function getHost(config) {
    const raw = (config && (config.host || config.url)) || DEFAULT_HOST;
    return String(raw).trim().replace(/\/+$/, "") || DEFAULT_HOST;
  }

  function absUrl(host, u) {
    if (!u) return null;
    const s = String(u).trim().replace(/\\\//g, "/").replace(/&amp;/g, "&");
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

  function kindForCategory(tid) {
    for (var i = 0; i < CATEGORIES.length; i++) {
      if (CATEGORIES[i][0] === tid) return CATEGORIES[i][2];
    }
    return null;
  }

  async function fetchText(host, pathOrUrl, htmxOpts) {
    const url = /^https?:\/\//i.test(pathOrUrl)
      ? pathOrUrl
      : host + (pathOrUrl.startsWith("/") ? pathOrUrl : "/" + pathOrUrl);
    const headers = {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      Referer: host + "/",
    };
    if (htmxOpts) {
      headers["HX-Request"] = "true";
      if (htmxOpts.target) headers["HX-Target"] = htmxOpts.target;
      headers["HX-Current-URL"] = htmxOpts.current || url;
    }
    try {
      const resp = await Host.http.get(url, {
        headers: headers,
        insecureTls: true,
        timeout: 15,
      });
      return resp && resp.ok ? resp.bodyText || resp.body || "" : "";
    } catch (_) {
      return "";
    }
  }

  function parseMovieCards(host, html, kind) {
    const items = [];
    const seen = Object.create(null);
    if (!html) return items;
    const cards = Host.html.selectAll(html, ".movie-card");
    for (var i = 0; i < cards.length; i++) {
      const cardHtml = cards[i].html;
      const href = Host.html.attr(cardHtml, "a", "href") || "";
      let kw = "";
      let doubanId = "";
      if (href) {
        try {
          const u = new URL(absUrl(host, href));
          kw = u.searchParams.get("kw") || "";
          doubanId = u.searchParams.get("doubanId") || "";
        } catch (_) {}
      }
      const title =
        cleanText(Host.html.text(cardHtml, ".movie-title")) ||
        cleanText(Host.html.attr(cardHtml, "img", "alt")) ||
        cleanText(kw);
      if (!title) continue;
      const vodId = doubanId ? "douban:" + doubanId + ":" + title : kw || title || href;
      if (seen[vodId]) continue;
      seen[vodId] = true;

      const picRaw =
        Host.html.attr(cardHtml, ".movie-poster img", "src") ||
        Host.html.attr(cardHtml, ".movie-poster img", "data-src") ||
        Host.html.attr(cardHtml, "img", "src");
      const rating = cleanText(Host.html.text(cardHtml, ".movie-rating"));

      items.push({
        vodId: vodId,
        title: title,
        poster: absUrl(host, picRaw),
        remark: rating || null,
        kind: kind || null,
      });
    }
    return items;
  }

  function parseSearchCards(host, html) {
    const items = [];
    const seen = Object.create(null);
    if (!html) return items;

    const resCards = Host.html.selectAll(html, ".search-result-card");
    for (var i = 0; i < resCards.length; i++) {
      const node = resCards[i];
      const cardHtml = node.html;
      const watchHref = Host.html.attr(cardHtml, 'a[href*="/watch/"]', "href") || "";
      const selfHref = (node.attrs && node.attrs.href) || "";
      const playHref =
        selfHref.indexOf("/play/") >= 0
          ? selfHref
          : Host.html.attr(cardHtml, 'a[href*="/play/"]', "href") || "";
      const detailHref = Host.html.attr(cardHtml, 'a[href*="/movie/"]', "href") || "";

      const title =
        cleanText(Host.html.text(cardHtml, ".card-detail-link")) ||
        cleanText(Host.html.attr(cardHtml, "img", "alt")) ||
        cleanText(Host.html.text(cardHtml, ".card-title"));
      if (!title) continue;

      const vodId = watchHref || playHref || detailHref || title;
      if (seen[vodId]) continue;
      seen[vodId] = true;

      const picRaw =
        Host.html.attr(cardHtml, ".card-poster img", "src") ||
        Host.html.attr(cardHtml, ".card-poster img", "data-src") ||
        Host.html.attr(cardHtml, "img", "src");
      const year = parseYear(Host.html.text(cardHtml, ".card-year"));
      const typeStr = cleanText(Host.html.text(cardHtml, ".card-type"));
      const badge = cleanText(Host.html.text(cardHtml, ".card-badge"));
      const remarks = cleanText(Host.html.text(cardHtml, ".card-remarks"));
      const remarkParts = [badge, remarks].filter(Boolean);

      items.push({
        vodId: vodId,
        title: title,
        poster: absUrl(host, picRaw),
        remark: remarkParts.length > 0 ? remarkParts.join(" / ") : null,
        year: year,
        genres: typeStr ? [typeStr] : [],
      });
    }

    const dbcCards = Host.html.selectAll(html, ".dbc-card");
    for (var j = 0; j < dbcCards.length; j++) {
      const cardHtml = dbcCards[j].html;
      const title = cleanText(Host.html.text(cardHtml, ".dbc-title"));
      if (!title || seen[title]) continue;
      seen[title] = true;
      const picRaw = Host.html.attr(cardHtml, ".dbc-poster img", "src");
      const year = parseYear(Host.html.text(cardHtml, ".dbc-year"));
      const rating = cleanText(Host.html.text(cardHtml, ".dbc-rating-val"));
      const tags = Host.html.selectTexts(cardHtml, ".dbc-tag");
      items.push({
        vodId: title,
        title: title,
        poster: absUrl(host, picRaw),
        remark: rating || null,
        year: year,
        genres: tags,
      });
    }

    return items;
  }

  function extractEpisodesFromPlayHtml(host, html, fallbackPath) {
    const eps = [];
    const seen = Object.create(null);
    const links = Host.html.selectAll(html, "#episodesGrid a.ep-btn");
    for (var i = 0; i < links.length; i++) {
      const a = links[i];
      const href = (a.attrs && a.attrs.href) || "";
      if (!href || seen[href]) continue;
      seen[href] = true;
      const label =
        cleanText((a.attrs && a.attrs["data-ep-label"]) || a.text) || "第" + (eps.length + 1) + "集";
      eps.push({
        episodeId: String(eps.length + 1),
        name: label,
        index: eps.length,
        playData: absUrl(host, href),
      });
    }
    if (eps.length === 0) {
      eps.push({
        episodeId: "1",
        name: "正片",
        index: 0,
        playData: absUrl(host, fallbackPath),
      });
    }
    return eps;
  }

  async function detailFromWatchUrl(host, vodId, watchPath) {
    const html = await fetchText(host, watchPath, null);
    if (!html) return { vodId: vodId, title: vodId, actors: [], directors: [], sources: [] };

    let title =
      cleanText(Host.html.text(html, "h1")) ||
      cleanText(Host.html.text(html, ".watch-title")) ||
      vodId;
    const tm = /title:\s*'([^']+)'/.exec(html);
    if (tm && tm[1]) title = cleanText(tm[1].replace(/\s*-\s*[^-]+$/, "")) || title;
    const poster = absUrl(
      host,
      Host.html.attr(html, 'meta[property="og:image"]', "content") ||
        ( /poster:\s*'([^']+)'/.exec(html) || [] )[1]
    );

    const panelLinks = Host.html.selectAll(html, '#sourcePanel a[href*="/watch/"]');
    const candidates = [];
    const seenSrc = Object.create(null);

    try {
      const u0 = new URL(absUrl(host, watchPath));
      const sk0 = u0.searchParams.get("source_key") || "默认线路";
      seenSrc[sk0] = true;
      candidates.push({ name: sk0, href: watchPath, html: html });
    } catch (_) {}

    for (var i = 0; i < panelLinks.length; i++) {
      const href = ((panelLinks[i].attrs && panelLinks[i].attrs.href) || "").replace(/&amp;/g, "&");
      if (!href) continue;
      let sk = "线路" + (candidates.length + 1);
      try {
        sk = new URL(absUrl(host, href)).searchParams.get("source_key") || sk;
      } catch (_) {}
      if (seenSrc[sk]) continue;
      seenSrc[sk] = true;
      candidates.push({ name: sk, href: href, html: null });
      if (candidates.length >= 6) break;
    }

    const toFetch = candidates.filter(function (c) {
      return !c.html;
    });
    if (toFetch.length > 0) {
      try {
        const resList = await Host.http.batch(
          toFetch.map(function (c) {
            return {
              url: absUrl(host, c.href),
              method: "GET",
              headers: { "User-Agent": UA, Referer: host + "/" },
              insecureTls: true,
              timeout: 12,
            };
          }),
          Math.min(4, toFetch.length)
        );
        for (var j = 0; j < toFetch.length; j++) {
          const r = resList[j];
          if (r && r.ok && r.response) {
            toFetch[j].html = r.response.bodyText || r.response.body || "";
          }
        }
      } catch (_) {}
    }

    const sources = [];
    for (var k = 0; k < candidates.length; k++) {
      const c = candidates[k];
      const eps = extractEpisodesFromPlayHtml(host, c.html || "", c.href);
      sources.push({
        sourceId: "src-" + (sources.length + 1),
        name: c.name,
        episodes: eps,
      });
    }

    return {
      vodId: vodId,
      title: title,
      poster: poster,
      actors: [],
      directors: [],
      sources: sources,
    };
  }

  globalThis.LiveDeckVod = {
    async home(payload) {
      const host = getHost(payload && payload.config);
      const html = await fetchText(host, "/discover/movie", {
        target: "#discover-content",
        current: host + "/discover",
      });
      return {
        categories: CATEGORIES.map(function (c) {
          return { id: c[0], name: c[1], filters: [] };
        }),
        featured: parseMovieCards(host, html, "movie").slice(0, 48),
      };
    },

    async category(payload) {
      const host = getHost(payload && payload.config);
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10));
      const tid = String((payload && payload.categoryId) || "movie").trim();
      if (page > 1) {
        return { items: [], page: page, totalPages: page - 1, hasMore: false };
      }
      const html = await fetchText(host, "/discover/" + tid, {
        target: "#discover-content",
        current: host + "/discover",
      });
      const items = parseMovieCards(host, html, kindForCategory(tid));
      return {
        items: items,
        page: 1,
        totalPages: 1,
        hasMore: false,
      };
    },

    async search(payload) {
      const host = getHost(payload && payload.config);
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10));
      const kw = String((payload && payload.keyword) || "").trim();
      if (!kw) return { items: [], page: page, totalPages: 1, hasMore: false };
      const enc = Host.codec.urlEncode(kw);
      const path =
        page <= 1
          ? "/api/htmx/search?q=" + enc
          : "/api/htmx/search?q=" + enc + "&page=" + page;
      const html = await fetchText(host, path, {
        target: "#search-results-container",
        current: host + "/search?q=" + enc,
      });
      const items = parseSearchCards(host, html);
      let maxPage = page;
      const btns = Host.html.selectAll(html, "button.pagination-btn");
      for (var i = 0; i < btns.length; i++) {
        const n = parseInt(cleanText(btns[i].text), 10);
        if (n > maxPage) maxPage = n;
        const hx = (btns[i].attrs && btns[i].attrs["hx-get"]) || "";
        const pm = /[?&]page=(\d+)/.exec(hx);
        if (pm) {
          const pn = parseInt(pm[1], 10);
          if (pn > maxPage) maxPage = pn;
        }
      }
      return {
        items: items,
        page: page,
        totalPages: maxPage,
        hasMore: page < maxPage,
      };
    },

    async detail(payload) {
      const host = getHost(payload && payload.config);
      const rawId = String((payload && payload.vodId) || "").trim();
      if (!rawId) return { vodId: "", title: "", actors: [], directors: [], sources: [] };

      if (rawId.indexOf("/watch/") >= 0) {
        return detailFromWatchUrl(host, rawId, rawId);
      }

      if (rawId.indexOf("/play/") >= 0) {
        const pHtml = await fetchText(host, rawId, null);
        const title = cleanText(Host.html.text(pHtml, "h1")) || rawId;
        const poster = absUrl(host, Host.html.attr(pHtml, 'meta[property="og:image"]', "content"));
        const eps = extractEpisodesFromPlayHtml(host, pHtml, rawId);
        return {
          vodId: rawId,
          title: title,
          poster: poster,
          actors: [],
          directors: [],
          sources: [{ sourceId: "default", name: "默认线路", episodes: eps }],
        };
      }

      let kw = rawId;
      let doubanId = "";
      if (rawId.indexOf("douban:") === 0) {
        const parts = rawId.split(":");
        doubanId = parts[1] || "";
        kw = parts.slice(2).join(":") || doubanId;
      } else if (rawId.indexOf("/movie/") >= 0 || /^\d+$/.test(rawId)) {
        const mPath = rawId.indexOf("/movie/") >= 0 ? rawId : "/movie/" + rawId;
        const mHtml = await fetchText(host, mPath, null);
        const dm = /douban_id=(\d+)/.exec(mHtml) || /\/movie\/(\d+)/.exec(mPath);
        if (dm) doubanId = dm[1];
        const pb = /hx-get="(\/api\/htmx\/movie-playback[^"]+)"/.exec(mHtml);
        if (pb) {
          const pbHtml = await fetchText(host, pb[1].replace(/&amp;/g, "&"), {
            target: "#movie-playback",
            current: absUrl(host, mPath),
          });
          const wm = /href="(\/watch\/[^"]+)"/.exec(pbHtml);
          if (wm) {
            return detailFromWatchUrl(host, rawId, wm[1].replace(/&amp;/g, "&"));
          }
        }
        kw =
          cleanText(Host.html.text(mHtml, ".dbc-title")) ||
          cleanText(Host.html.text(mHtml, "h1")) ||
          rawId;
      }

      if (doubanId) {
        const pbHtml = await fetchText(
          host,
          "/api/htmx/movie-playback?douban_id=" +
            Host.codec.urlEncode(doubanId) +
            "&title=" +
            Host.codec.urlEncode(kw) +
            "&search_title=" +
            Host.codec.urlEncode(kw),
          { target: "#movie-playback", current: host + "/movie/" + doubanId }
        );
        const wm = /href="(\/watch\/[^"]+)"/.exec(pbHtml);
        if (wm) {
          return detailFromWatchUrl(host, rawId, wm[1].replace(/&amp;/g, "&"));
        }
      }

      const enc = Host.codec.urlEncode(kw);
      const searchHtml = await fetchText(host, "/api/htmx/search?q=" + enc, {
        target: "#search-results-container",
        current: host + "/search?q=" + enc,
      });

      const firstWatch = /href="(\/watch\/[^"]+)"/.exec(searchHtml);
      if (firstWatch) {
        return detailFromWatchUrl(host, rawId, firstWatch[1].replace(/&amp;/g, "&"));
      }

      const directLinks = Host.html.selectAll(searchHtml, 'a[href*="/play/"]');
      const candidates = [];
      const seenSrc = Object.create(null);
      for (var dl = 0; dl < directLinks.length; dl++) {
        const href = (directLinks[dl].attrs && directLinks[dl].attrs.href) || "";
        const sm = /\/play\/([^/]+)\/([^/?#]+)/.exec(href);
        if (!sm) continue;
        let srcName = sm[1];
        try {
          srcName = Host.codec.urlDecode(sm[1]);
        } catch (_) {}
        if (seenSrc[srcName]) continue;
        seenSrc[srcName] = true;
        candidates.push({
          sourceId: "src-" + candidates.length,
          name: srcName,
          href: href,
        });
        if (candidates.length >= 6) break;
      }

      if (candidates.length === 0) {
        return { vodId: rawId, title: kw, actors: [], directors: [], sources: [] };
      }

      let batchRes = [];
      try {
        batchRes = await Host.http.batch(
          candidates.map(function (c) {
            return {
              url: absUrl(host, c.href),
              method: "GET",
              headers: { "User-Agent": UA, Referer: host + "/" },
              insecureTls: true,
              timeout: 12,
            };
          }),
          Math.min(4, candidates.length)
        );
      } catch (_) {}

      const sources = [];
      for (var k = 0; k < candidates.length; k++) {
        const r = batchRes[k];
        const pHtml = r && r.ok && r.response ? r.response.bodyText || r.response.body || "" : "";
        sources.push({
          sourceId: candidates[k].sourceId,
          name: candidates[k].name,
          episodes: extractEpisodesFromPlayHtml(host, pHtml, candidates[k].href),
        });
      }

      return {
        vodId: rawId,
        title: kw,
        actors: [],
        directors: [],
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
      const html = (await fetchText(host, raw, null)).replace(/\\\//g, "/");
      let streamUrl = "";
      const im = /initPlayer\(\s*'[^']*'\s*,\s*'([^']+)'\s*,/.exec(html);
      if (im) streamUrl = im[1].trim();
      if (!streamUrl) {
        const re = /(https?:\/\/[^\s"'<>\\]+\.(?:m3u8|mp4)[^\s"'<>\\]*)/gi;
        let mm;
        while ((mm = re.exec(html)) !== null) {
          if (mm[1].indexOf("zngg.net") === -1) {
            streamUrl = mm[1].trim();
            break;
          }
        }
      }
      if (!streamUrl) {
        Host.raise("NO_STREAM", "moovie could not extract direct stream for " + raw);
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
