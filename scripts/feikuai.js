// Ported from feikuai.js -> LiveDeck script_js (QuickJS Sandbox)
(function () {
  const DEFAULT_HOSTS = ["https://feikuai.in", "https://feikuai.tv"];
  const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

  const CATEGORIES = [
    ["1", "电影", "movie"],
    ["2", "剧集", "series"],
    ["3", "综艺", "variety"],
    ["4", "动漫", "anime"],
  ];

  let activeHost = DEFAULT_HOSTS[0];

  function getHosts(config) {
    if (config && (config.host || config.url)) {
      const h = String(config.host || config.url).trim().replace(/\/+$/, "");
      if (h) return [h].concat(DEFAULT_HOSTS);
    }
    return DEFAULT_HOSTS;
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
      .filter(Boolean);
  }

  function kindForCategory(tid) {
    for (var i = 0; i < CATEGORIES.length; i++) {
      if (CATEGORIES[i][0] === String(tid)) return CATEGORIES[i][2];
    }
    return null;
  }

  async function fetchHtml(config, pathOrUrl) {
    const hosts = getHosts(config);
    const ordered = [activeHost].concat(
      hosts.filter(function (h) {
        return h !== activeHost;
      })
    );
    const isFull = /^https?:\/\//i.test(pathOrUrl);
    for (var i = 0; i < ordered.length; i++) {
      const h = ordered[i];
      let target = pathOrUrl;
      if (!isFull) {
        target = h + (pathOrUrl.startsWith("/") ? pathOrUrl : "/" + pathOrUrl);
      } else if (i > 0) {
        try {
          const parsed = new URL(pathOrUrl);
          target = h + parsed.pathname + parsed.search;
        } catch (_) {}
      }
      try {
        const resp = await Host.http.get(target, {
          headers: {
            "User-Agent": UA,
            Referer: h + "/",
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9",
          },
          insecureTls: true,
          timeout: 15,
        });
        const body = resp && resp.ok ? resp.bodyText || resp.body || "" : "";
        if (body && body.length > 200) {
          if (resp.finalUrl) {
            try {
              activeHost = new URL(resp.finalUrl).origin;
            } catch (_) {
              activeHost = h;
            }
          } else {
            activeHost = h;
          }
          return body;
        }
      } catch (_) {}
    }
    return "";
  }

  function parsePosterList(host, html, kind) {
    const items = [];
    const seen = Object.create(null);
    if (!html) return items;
    const cards = Host.html.selectAll(html, ".module-poster-items-base .module-poster-item");
    for (var i = 0; i < cards.length; i++) {
      const cardHtml = cards[i].html;
      const href = Host.html.attr(cardHtml, "a", "href") || "";
      if (!href || seen[href]) continue;
      seen[href] = true;
      const title =
        cleanText(Host.html.attr(cardHtml, "a", "title")) ||
        cleanText(Host.html.text(cardHtml, ".module-poster-item-title"));
      if (!title) continue;
      const picRaw =
        Host.html.attr(cardHtml, "img", "data-original") ||
        Host.html.attr(cardHtml, "img", "src");
      const remark = cleanText(Host.html.text(cardHtml, ".module-item-note"));
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

  function decodePlayer(rawUrl, encrypt) {
    let u = String(rawUrl || "").replace(/\\\//g, "/").trim();
    const enc = parseInt(encrypt || 0, 10) || 0;
    if (enc === 1) {
      try {
        u = Host.codec.urlDecode(u);
      } catch (_) {}
    } else if (enc === 2) {
      try {
        u = Host.codec.urlDecode(Host.crypto.base64Decode(Host.codec.urlDecode(u)));
      } catch (_) {
        try {
          u = Host.codec.urlDecode(Host.crypto.base64Decode(u));
        } catch (_) {}
      }
    }
    return u;
  }

  globalThis.LiveDeckVod = {
    async home(payload) {
      const html = await fetchHtml(payload && payload.config, "/");
      return {
        categories: CATEGORIES.map(function (c) {
          return { id: c[0], name: c[1], filters: [] };
        }),
        featured: parsePosterList(activeHost, html, null).slice(0, 36),
      };
    },

    async category(payload) {
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10));
      const tid = String((payload && payload.categoryId) || "1").trim();
      const html = await fetchHtml(
        payload && payload.config,
        "/vodshow/" + tid + "--------" + page + "---.html"
      );
      const items = parsePosterList(activeHost, html, kindForCategory(tid));
      const hasMore = items.length >= 20;
      return {
        items: items,
        page: page,
        totalPages: hasMore ? page + 1 : page,
        hasMore: hasMore,
      };
    },

    async search(payload) {
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10));
      const kw = String((payload && payload.keyword) || "").trim();
      if (!kw) return { items: [], page: page, totalPages: 1, hasMore: false };
      const enc = Host.codec.urlEncode(kw);
      const path =
        page <= 1
          ? "/vodsearch/-------------.html?wd=" + enc
          : "/vodsearch/" + enc + "----------" + page + "---.html";
      const html = await fetchHtml(payload && payload.config, path);
      const cards = Host.html.selectAll(html, "#resultList .module-card-item");
      const items = [];
      const seen = Object.create(null);
      for (var i = 0; i < cards.length; i++) {
        const cardHtml = cards[i].html;
        const href =
          Host.html.attr(cardHtml, ".module-card-item-poster", "href") ||
          Host.html.attr(cardHtml, "a", "href") ||
          "";
        if (!href || seen[href]) continue;
        seen[href] = true;
        const title = cleanText(Host.html.text(cardHtml, ".module-card-item-title"));
        if (!title) continue;
        const picRaw =
          Host.html.attr(cardHtml, "img", "data-original") ||
          Host.html.attr(cardHtml, "img", "src");
        const remark = cleanText(Host.html.text(cardHtml, ".module-item-note"));
        items.push({
          vodId: href,
          title: title,
          poster: absUrl(activeHost, picRaw),
          remark: remark || null,
        });
      }
      const hasMore = items.length >= 20;
      return {
        items: items,
        page: page,
        totalPages: hasMore ? page + 1 : page,
        hasMore: hasMore,
      };
    },

    async detail(payload) {
      const rawId = String((payload && payload.vodId) || "").trim();
      const html = await fetchHtml(payload && payload.config, rawId);
      if (!html) {
        return { vodId: rawId, title: rawId, actors: [], directors: [], sources: [] };
      }

      const title = cleanText(Host.html.text(html, ".module-info-heading h1")) || rawId;
      const posterRaw =
        Host.html.attr(html, ".lazyload", "data-original") ||
        Host.html.attr(html, ".module-item-pic img", "data-original");
      const tagLinks = Host.html.selectTexts(html, ".module-info-tag-link a");
      const year = parseYear(tagLinks[0] || "");
      const region = cleanText(tagLinks[1] || "") || null;
      const genres = tagLinks[2] ? splitNames(tagLinks[2]) : [];

      let actors = [];
      let directors = [];
      let remark = null;
      const infoItems = Host.html.selectAll(html, ".module-info-item");
      for (var i = 0; i < infoItems.length; i++) {
        const text = cleanText(infoItems[i].text);
        const val = cleanText(Host.html.text(infoItems[i].html, ".module-info-item-content"));
        if (!val) continue;
        if (text.indexOf("主演：") >= 0) actors = splitNames(val);
        else if (text.indexOf("导演：") >= 0) directors = splitNames(val);
        else if (text.indexOf("片长：") >= 0) remark = val;
      }

      const synopsis =
        cleanText(Host.html.text(html, ".module-info-introduction-content p")) || null;

      const tabs = Host.html.selectAll(html, "#y-playList .module-tab-item");
      const playLists = Host.html.selectAll(html, ".module-play-list");
      const sources = [];

      for (var t = 0; t < tabs.length && t < playLists.length; t++) {
        const lineName =
          cleanText(Host.html.text(tabs[t].html, "span")) || "线路" + (t + 1);
        const links = Host.html.selectAll(playLists[t].html, "a");
        const eps = [];
        const seenEp = Object.create(null);
        for (var j = 0; j < links.length; j++) {
          const epHref = (links[j].attrs && links[j].attrs.href) || "";
          if (!epHref || epHref.indexOf("/vodplay/") === -1 || seenEp[epHref]) continue;
          seenEp[epHref] = true;
          const epName =
            cleanText(links[j].text) ||
            cleanText(links[j].attrs && links[j].attrs.title) ||
            "第" + (eps.length + 1) + "集";
          eps.push({
            episodeId: String(t + 1) + "-" + (eps.length + 1),
            name: epName,
            index: eps.length,
            playData: epHref,
          });
        }
        if (eps.length > 0) {
          sources.push({
            sourceId: "line-" + (t + 1),
            name: lineName,
            episodes: eps,
          });
        }
      }

      return {
        vodId: rawId,
        title: title,
        poster: absUrl(activeHost, posterRaw),
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
      const raw = String((payload && payload.playData) || "").trim();
      const headers = { Referer: activeHost + "/" };
      if (/^https?:\/\//i.test(raw) && /\.(m3u8|mp4|flv)(\?|$)/i.test(raw)) {
        return { streams: [{ label: "默认线路", url: raw, userAgent: UA, headers: headers }] };
      }

      const html = await fetchHtml(payload && payload.config, raw);
      if (!html) {
        Host.raise("NO_STREAM", "feikuai failed to fetch play page: " + raw);
      }

      let streamUrl = "";
      const jsonStr = Host.text.extractJson(html, "player_aaaa");
      if (jsonStr) {
        try {
          const obj = JSON.parse(jsonStr);
          streamUrl = decodePlayer(obj.url, obj.encrypt);
        } catch (_) {}
      }

      if (!streamUrl) {
        const pm = /player_[a-z0-9_]+\s*=\s*(\{[\s\S]*?\});/i.exec(html);
        if (pm) {
          try {
            const obj = JSON.parse(pm[1]);
            streamUrl = decodePlayer(obj.url, obj.encrypt);
          } catch (_) {}
        }
      }

      if (!streamUrl || !/^https?:\/\//i.test(streamUrl)) {
        const mm = /(https?:\/\/[^\s"'<>\\]+\.(?:m3u8|mp4)[^\s"'<>\\]*)/i.exec(
          html.replace(/\\\//g, "/")
        );
        if (mm) streamUrl = mm[1];
      }

      if (!streamUrl) {
        Host.raise("NO_STREAM", "feikuai could not extract stream from " + raw);
      }

      return {
        streams: [
          {
            label: "默认线路",
            url: absUrl(activeHost, streamUrl),
            userAgent: UA,
            headers: { Referer: absUrl(activeHost, raw) || activeHost + "/" },
          },
        ],
      };
    },
  };
})();
