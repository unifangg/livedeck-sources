// Ported from keke.py -> LiveDeck script_js (QuickJS Sandbox)
(function () {
  const DEFAULT_HOST = "https://103.51.147.112:51120";
  const DEFAULT_IMG_CDN = "https://vres.esadj.com";
  const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

  const CATEGORIES = [
    ["1", "电影", "movie"],
    ["2", "连续剧", "series"],
    ["3", "动漫", "anime"],
    ["4", "综艺纪录", "variety"],
    ["6", "短剧", "series"],
  ];

  function getCfg(config) {
    const c = config || {};
    return {
      host: String(c.host || DEFAULT_HOST).trim().replace(/\/+$/, "") || DEFAULT_HOST,
      imgCdn: String(c.imgCdn || DEFAULT_IMG_CDN).trim().replace(/\/+$/, "") || DEFAULT_IMG_CDN,
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

  function getVid(url) {
    const s = String(url || "");
    let m = /\/detail\/(\d+)\.html/.exec(s);
    if (m) return m[1];
    m = /\/play\/(\d+)-/.exec(s);
    return m ? m[1] : "";
  }

  function absImg(cfg, src) {
    const s = String(src || "").trim();
    if (!s || s.indexOf("placeholder") >= 0 || s.indexOf("logo_placeholder") >= 0) return null;
    if (s.startsWith("//")) return "https:" + s;
    if (/^https?:\/\//i.test(s)) return s;
    return cfg.imgCdn + (s.startsWith("/") ? s : "/" + s);
  }

  async function fetchHtml(cfg, pathOrUrl) {
    const url = /^https?:\/\//i.test(pathOrUrl) ? pathOrUrl : cfg.host + pathOrUrl;
    try {
      const resp = await Host.http.get(url, {
        headers: {
          "User-Agent": UA,
          Referer: cfg.host + "/",
        },
        insecureTls: true,
        timeout: 15,
      });
      return resp && resp.ok ? resp.bodyText || resp.body || "" : "";
    } catch (_) {
      return "";
    }
  }

  function parseModuleList(cfg, html) {
    const out = [];
    const seen = Object.create(null);
    if (!html) return out;
    const items = Host.html.selectAll(html, ".module-item");
    for (var i = 0; i < items.length; i++) {
      const item = items[i];
      const a = Host.html.select(item.html, ".v-item");
      const href = (a && a.attrs && a.attrs.href) || "";
      const vid = getVid(href);
      if (!vid || seen[vid]) continue;
      seen[vid] = true;

      let title = "";
      const titles = Host.html.selectAll(item.html, ".v-item-title");
      for (var t = 0; t < titles.length; t++) {
        const tn = titles[t];
        const st = (tn.attrs && tn.attrs.style) || "";
        if (/display\s*:\s*none/i.test(st)) continue;
        const txt = cleanText(tn.text);
        if (txt && txt.indexOf("kekys.com") < 0) {
          title = txt;
          break;
        }
      }
      if (!title) continue;

      let pic = null;
      const imgs = Host.html.selectAll(item.html, "img");
      for (var j = 0; j < imgs.length; j++) {
        const im = imgs[j];
        const cand = absImg(cfg, (im.attrs && (im.attrs["data-original"] || im.attrs.src)) || "");
        if (cand) {
          pic = cand;
          break;
        }
      }

      const remark = cleanText(Host.html.text(item.html, ".v-item-bottom span")) || null;
      out.push({
        vodId: vid,
        title: title,
        poster: pic,
        remark: remark,
      });
    }
    return out;
  }

  globalThis.LiveDeckVod = {
    async home(payload) {
      const cfg = getCfg(payload && payload.config);
      const html = await fetchHtml(cfg, "/channel/1.html");
      return {
        categories: CATEGORIES.map(function (c) {
          return { id: c[0], name: c[1], filters: [] };
        }),
        featured: parseModuleList(cfg, html).slice(0, 24),
      };
    },

    async category(payload) {
      const cfg = getCfg(payload && payload.config);
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10) || 1);
      const tid = String((payload && payload.categoryId) || "1").trim();
      const html = await fetchHtml(cfg, "/channel/" + tid + ".html?page=" + page);
      const items = parseModuleList(cfg, html);
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
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10) || 1);
      const kw = String((payload && payload.keyword) || "").trim();
      if (!kw) return { items: [], page: page, totalPages: 1, hasMore: false };

      const encKw = Host.codec.urlEncode(kw);
      let html = await fetchHtml(cfg, "/search?k=" + encKw);
      const tm = /name="t"\s+value="([^"]+)"/.exec(html);
      if (tm && tm[1]) {
        let url = "/search?k=" + encKw + "&t=" + Host.codec.urlEncode(tm[1]);
        if (page > 1) url += "&page=" + page;
        html = await fetchHtml(cfg, url);
      }

      const items = [];
      const seen = Object.create(null);
      const nodes = Host.html.selectAll(html, ".search-result-item");
      for (var i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const href = (node.attrs && node.attrs.href) || "";
        const vid = getVid(href);
        if (!vid || seen[vid]) continue;
        seen[vid] = true;

        let title = cleanText(Host.html.text(node.html, ".title"));
        const imgs = Host.html.selectAll(node.html, "img");
        let pic = null;
        for (var j = 0; j < imgs.length; j++) {
          const im = imgs[j];
          if (!title && im.attrs) {
            title = cleanText(im.attrs.alt || im.attrs.title || "");
          }
          if (!pic && im.attrs) {
            pic = absImg(cfg, im.attrs["data-original"] || im.attrs.src || "");
          }
        }
        if (!title) continue;
        items.push({
          vodId: vid,
          title: title,
          poster: pic,
          remark: null,
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
      const cfg = getCfg(payload && payload.config);
      const raw = String((payload && payload.vodId) || "").trim();
      const vid = getVid(raw) || raw.replace(/\D+/g, "");
      if (!vid) return { vodId: raw, title: raw, sources: [] };
      const html = await fetchHtml(cfg, "/detail/" + vid + ".html");
      if (!html) return { vodId: vid, title: "影片 " + vid, sources: [] };

      let title = "";
      const tm = /<title>([\s\S]*?)<\/title>/i.exec(html);
      if (tm) {
        title = cleanText(tm[1].split("-")[0]).replace(/[\uD835][\uDC00-\uDFFF]+|\s+/g, " ").trim();
      }
      if (!title) title = cleanText(Host.html.text(html, "h1")) || "影片 " + vid;

      let pic = null;
      const ogImg = /<meta\s+property="og:image"\s+content="([^"]+)"/i.exec(html);
      if (ogImg) pic = absImg(cfg, ogImg[1]);

      let desc = null;
      const descMatch = /<meta\s+name="description"\s+content="([^"]+)"/i.exec(html);
      if (descMatch) desc = cleanText(descMatch[1]) || null;

      let directors = [];
      let actors = [];
      let year = null;
      let remark = null;
      const infoRows = Host.html.selectAll(html, ".detail-info-row, .detail-info-row-side");
      for (var r = 0; r < infoRows.length; r++) {
        const txt = cleanText(infoRows[r].text);
        if (txt.indexOf("导演:") === 0) {
          directors = splitNames(txt.slice(3));
        } else if (txt.indexOf("演员:") === 0) {
          actors = splitNames(txt.slice(3));
        } else if (txt.indexOf("首映:") >= 0) {
          if (!year) year = parseYear(txt);
          const rm = /备注:\s*(.+)$/.exec(txt);
          if (rm) remark = cleanText(rm[1]) || null;
        }
      }

      const sourceLabels = Host.html
        .selectTexts(html, ".source-item-label")
        .map(cleanText)
        .filter(Boolean);

      const epNodes = Host.html.selectAll(html, "a.episode-item");
      const epsBySid = Object.create(null);
      const sidsOrder = [];
      for (var e = 0; e < epNodes.length; e++) {
        const node = epNodes[e];
        const href = (node.attrs && node.attrs.href) || "";
        const pm = /\/play\/\d+-(\d+)-(\d+)\.html/.exec(href);
        if (!pm) continue;
        const sid = pm[1];
        const nid = pm[2];
        const epName = cleanText(node.text) || "第" + nid + "集";
        if (!epsBySid[sid]) {
          epsBySid[sid] = [];
          sidsOrder.push(sid);
        }
        epsBySid[sid].push({
          episodeId: sid + "-" + nid,
          name: epName,
          index: epsBySid[sid].length,
          playData: href,
        });
      }

      const sources = [];
      for (var s = 0; s < sidsOrder.length; s++) {
        const sid = sidsOrder[s];
        const lineName = s < sourceLabels.length ? sourceLabels[s] : "线路" + sid;
        if (lineName === "4K") continue;
        sources.push({
          sourceId: "sid-" + sid,
          name: lineName,
          episodes: epsBySid[sid],
        });
      }

      return {
        vodId: vid,
        title: title,
        poster: pic,
        remark: remark,
        year: year,
        actors: actors,
        directors: directors,
        synopsis: desc,
        sources: sources,
      };
    },

    async play(payload) {
      const cfg = getCfg(payload && payload.config);
      const raw = String((payload && payload.playData) || "").trim();
      if (!raw) Host.raise("NO_STREAM", "keke empty playData");
      const html = await fetchHtml(cfg, raw);
      if (!html) Host.raise("NO_STREAM", "keke failed to load play page");

      let videoUrl = "";
      const patterns = [
        /src\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i,
        /"url"\s*:\s*"([^"]+\.(?:m3u8|mp4)[^"]*)"/i,
        /url\s*:\s*'([^']+\.(?:m3u8|mp4)[^']*)'/i,
      ];
      for (var i = 0; i < patterns.length; i++) {
        const m = patterns[i].exec(html);
        if (m && m[1]) {
          videoUrl = m[1].replace(/\\\//g, "/").trim();
          break;
        }
      }
      if (!videoUrl) {
        const all = html.match(/https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4)[^\s"'<>]*/gi) || [];
        for (var j = 0; j < all.length; j++) {
          if (/index\.m3u8|video\.m3u8|\.mp4/i.test(all[j])) {
            videoUrl = all[j];
            break;
          }
        }
        if (!videoUrl && all.length > 0) videoUrl = all[0];
      }

      if (!videoUrl) {
        Host.raise("NO_STREAM", "keke could not find playable stream on " + raw);
      }
      return {
        streams: [
          {
            label: "默认线路",
            url: videoUrl,
            userAgent: UA,
            headers: {
              "User-Agent": UA,
              Referer: cfg.host + "/",
            },
          },
        ],
      };
    },
  };
})();
