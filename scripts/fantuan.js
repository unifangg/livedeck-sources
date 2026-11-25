// Ported from fantuan.py -> LiveDeck script_js (QuickJS Sandbox)
(function () {
  const DEFAULT_HOST = "https://fantuansjz.com";
  const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

  const CATEGORIES = [
    ["1", "电影"],
    ["2", "剧集"],
    ["3", "综艺"],
    ["4", "动漫"],
    ["40", "豆瓣"],
  ];

  const YEAR_FILTER = {
    key: "year",
    name: "年代",
    defaultValue: "",
    options: [
      { value: "", label: "全部" },
      { value: "2026", label: "2026" },
      { value: "2025", label: "2025" },
      { value: "2024", label: "2024" },
      { value: "2023", label: "2023" },
      { value: "2022", label: "2022" },
      { value: "2021", label: "2021" },
      { value: "2020", label: "2020" },
      { value: "2019", label: "2019" },
      { value: "2018", label: "2018" },
    ],
  };

  function getHost(config) {
    const raw = (config && config.host) || DEFAULT_HOST;
    return String(raw).trim().replace(/\/+$/, "") || DEFAULT_HOST;
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

  function absUrl(host, u) {
    const s = String(u || "").trim();
    if (!s) return null;
    if (s.startsWith("//")) return "https:" + s;
    if (/^https?:\/\//i.test(s)) return s;
    return host + (s.startsWith("/") ? s : "/" + s);
  }

  async function fetchHtml(host, pathOrUrl) {
    const url = /^https?:\/\//i.test(pathOrUrl) ? pathOrUrl : host + pathOrUrl;
    try {
      const resp = await Host.http.get(url, {
        headers: {
          "User-Agent": UA,
          Referer: host + "/",
        },
        insecureTls: true,
        timeout: 15,
      });
      return resp && resp.ok ? resp.bodyText || resp.body || "" : "";
    } catch (_) {
      return "";
    }
  }

  function parseGridList(host, html) {
    const out = [];
    const seen = Object.create(null);
    if (!html) return out;
    const items = Host.html.selectAll(html, "ul.fed-list-info li");
    for (var i = 0; i < items.length; i++) {
      const li = items[i];
      const titleA = Host.html.select(li.html, "a.fed-list-title");
      if (!titleA || !titleA.attrs || !titleA.attrs.href) continue;
      const vid = titleA.attrs.href;
      if (seen[vid]) continue;
      seen[vid] = true;
      const title = cleanText(titleA.text);
      if (!title) continue;
      const picA = Host.html.select(li.html, "a.fed-list-pics");
      const pic = picA && picA.attrs ? absUrl(host, picA.attrs["data-original"] || picA.attrs.src || "") : null;
      const remark = cleanText(Host.html.text(li.html, "span.fed-list-remarks")) || null;
      out.push({
        vodId: vid,
        title: title,
        poster: pic,
        remark: remark,
      });
    }
    return out;
  }

  function decodePlayerUrl(raw, encrypt) {
    let u = String(raw || "").replace(/\\\//g, "/").trim();
    const enc = parseInt(encrypt || 0, 10) || 0;
    if (enc === 1) {
      try { u = Host.codec.urlDecode(u); } catch (_) {}
    } else if (enc === 2) {
      try { u = Host.codec.urlDecode(Host.crypto.base64Decode(u)); } catch (_) {}
    }
    if (u.startsWith("//")) u = "https:" + u;
    return u;
  }

  globalThis.LiveDeckVod = {
    async home(payload) {
      const host = getHost(payload && payload.config);
      const html = await fetchHtml(host, "/");
      return {
        categories: CATEGORIES.map(function (c) {
          return { id: c[0], name: c[1], filters: [YEAR_FILTER] };
        }),
        featured: parseGridList(host, html),
      };
    },

    async category(payload) {
      const host = getHost(payload && payload.config);
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10) || 1);
      const cid = String((payload && payload.categoryId) || "1").trim();
      const filters = (payload && payload.filters) || {};
      const year = String(filters.year || "").trim();
      const path =
        page === 1 && !year
          ? "/sjvodtype/" + cid + ".html"
          : "/sjvodshow/" + cid + "--------" + page + "---" + year + ".html";
      const html = await fetchHtml(host, path);
      const items = parseGridList(host, html);
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
      const encKw = Host.codec.urlEncode(kw);
      const path =
        page === 1
          ? "/sjvodsearch/-------------.html?wd=" + encKw
          : "/sjvodsearch/" + encKw + "----------" + page + "---.html";
      const html = await fetchHtml(host, path);
      const out = [];
      const seen = Object.create(null);
      const cards = Host.html.selectAll(html, "dl.fed-list-deta");
      for (var i = 0; i < cards.length; i++) {
        const card = cards[i];
        const title = cleanText(Host.html.text(card.html, "h3.fed-part-eone"));
        const picA = Host.html.select(card.html, "a.fed-list-pics");
        if (!picA || !picA.attrs || !picA.attrs.href || !title) continue;
        const vid = picA.attrs.href.replace("/sjvodplay/", "/sjvoddetail/").replace(/-1-1(?=\.html|$)/, "");
        if (seen[vid]) continue;
        seen[vid] = true;
        const pic = absUrl(host, picA.attrs["data-original"] || picA.attrs.src || "");
        const remark = cleanText(Host.html.text(card.html, "span.fed-list-remarks")) || null;
        out.push({
          vodId: vid,
          title: title,
          poster: pic,
          remark: remark,
        });
      }
      const hasMore = out.length >= 10;
      return {
        items: out,
        page: page,
        totalPages: hasMore ? page + 1 : page,
        hasMore: hasMore,
      };
    },

    async detail(payload) {
      const host = getHost(payload && payload.config);
      const raw = String((payload && payload.vodId) || "").trim();
      if (!raw) return { vodId: "", title: "", sources: [] };
      const html = await fetchHtml(host, raw);
      if (!html) return { vodId: raw, title: raw, sources: [] };

      let title =
        cleanText(Host.html.text(html, "h1.fed-part-eone")) ||
        cleanText(Host.html.text(html, "h3")) ||
        "";
      if (!title) {
        const tm = /<title>[^《]*《([^》]+)》/i.exec(html);
        if (tm) title = cleanText(tm[1]);
      }
      if (!title) title = raw;
      const picEl = Host.html.select(html, "a.fed-list-pics");
      const pic = picEl && picEl.attrs ? absUrl(host, picEl.attrs["data-original"] || "") : null;
      const remark = cleanText(Host.html.text(html, "span.fed-text-white.fed-text-center")) || null;

      let directors = [];
      let actors = [];
      let year = null;
      let region = null;
      let synopsis = null;

      const metaLis = Host.html.selectAll(html, "ul.fed-part-rows li");
      for (var m = 0; m < metaLis.length; m++) {
        const txt = cleanText(metaLis[m].text);
        if (txt.indexOf("导演：") >= 0) {
          directors = splitNames(txt.replace(/^.*导演：/, ""));
        } else if (txt.indexOf("主演：") >= 0) {
          actors = splitNames(txt.replace(/^.*主演：/, ""));
        } else if (txt.indexOf("年份：") >= 0) {
          year = parseYear(txt);
        } else if (txt.indexOf("地区：") >= 0) {
          region = cleanText(txt.replace(/^.*地区：/, "")) || null;
        }
      }
      const descRaw = Host.text.between(html, "剧情介绍:", '">');
      if (descRaw) synopsis = cleanText(descRaw) || null;
      if (!synopsis) {
        const pDesc = cleanText(Host.html.text(html, "p.fed-padding"));
        if (pDesc) synopsis = pDesc;
      }

      const tabNames = Host.html.selectTexts(html, "ul.fed-padding a").map(cleanText);
      const epLists = Host.html.selectAll(html, "ul.fed-tabs-btm");
      const sources = [];

      for (var i = 0; i < epLists.length; i++) {
        const lineName = (i < tabNames.length && tabNames[i]) || "线路" + (i + 1);
        const links = Host.html.selectAll(epLists[i].html, "a");
        const eps = [];
        for (var j = 0; j < links.length; j++) {
          const href = (links[j].attrs && links[j].attrs.href) || "";
          if (!href) continue;
          const epName = cleanText(links[j].text) || "第" + (eps.length + 1) + "集";
          eps.push({
            episodeId: (i + 1) + "-" + (eps.length + 1),
            name: epName,
            index: eps.length,
            playData: absUrl(host, href) || href,
          });
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
        vodId: raw,
        title: title,
        poster: pic,
        remark: remark,
        year: year,
        region: region,
        actors: actors,
        directors: directors,
        synopsis: synopsis,
        sources: sources,
      };
    },

    async play(payload) {
      const host = getHost(payload && payload.config);
      const raw = String((payload && payload.playData) || "").trim();
      if (!raw) Host.raise("NO_STREAM", "fantuan empty playData");

      if (raw.indexOf("/tp/jd.m3u8") >= 0 || /\.(?:m3u8|mp4)(?:\?|$)/i.test(raw)) {
        return {
          streams: [
            {
              label: "默认线路",
              url: raw,
              userAgent: UA,
              headers: { "User-Agent": UA, Referer: host + "/" },
            },
          ],
        };
      }

      const html = await fetchHtml(host, raw);
      if (!html) Host.raise("NO_STREAM", "fantuan failed to fetch play page");

      let streamUrl = "";
      const jsonStr = Host.text.extractJson(html, "player_aaaa");
      if (jsonStr) {
        try {
          const obj = JSON.parse(jsonStr);
          streamUrl = decodePlayerUrl(obj.url, obj.encrypt);
        } catch (_) {
          const um = /"url"\s*:\s*"([^"]+)"/.exec(jsonStr);
          if (um) streamUrl = um[1].replace(/\\\//g, "/").trim();
        }
      }
      if (!streamUrl) {
        const direct = /https?:\/\/[^\s"'<>\\]+\.(?:m3u8|mp4)[^\s"'<>\\]*/i.exec(html);
        if (direct) streamUrl = direct[0].replace(/\\\//g, "/");
      }

      if (!/^https?:\/\//i.test(streamUrl)) {
        Host.raise("NO_STREAM", "fantuan could not extract stream for " + raw);
      }

      return {
        streams: [
          {
            label: "默认线路",
            url: streamUrl,
            userAgent: UA,
            headers: { "User-Agent": UA, Referer: host + "/" },
          },
        ],
      };
    },
  };
})();
