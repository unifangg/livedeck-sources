// Ported from kanxi.py -> LiveDeck script_js (QuickJS Sandbox)
(function () {
  const DEFAULT_HOST = "https://www.kanxiya.com";
  const UA =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1";

  const AREAS = [
    ["", "全部"],
    ["大陆", "大陆"],
    ["香港", "香港"],
    ["台湾", "台湾"],
    ["美国", "美国"],
    ["韩国", "韩国"],
    ["日本", "日本"],
    ["泰国", "泰国"],
    ["新加坡", "新加坡"],
    ["马来西亚", "马来西亚"],
    ["印度", "印度"],
    ["英国", "英国"],
    ["法国", "法国"],
    ["加拿大", "加拿大"],
    ["西班牙", "西班牙"],
    ["俄罗斯", "俄罗斯"],
    ["其它", "其它"],
  ].map(function (x) {
    return { value: x[0], label: x[1] };
  });

  const YEARS = [{ value: "", label: "全部" }];
  for (var y = 2026; y >= 2010; y--) {
    YEARS.push({ value: String(y), label: String(y) });
  }

  const MOVIE_CLASSES = [
    ["1", "全部"],
    ["5", "动作片"],
    ["6", "喜剧片"],
    ["7", "爱情片"],
    ["8", "科幻片"],
    ["9", "恐怖片"],
    ["10", "剧情片"],
    ["11", "战争片"],
  ].map(function (x) {
    return { value: x[0], label: x[1] };
  });

  const SERIES_CLASSES = [
    ["2", "全部"],
    ["12", "国产剧"],
    ["13", "港台剧"],
    ["14", "欧美剧"],
    ["15", "日韩剧"],
    ["16", "海外剧"],
  ].map(function (x) {
    return { value: x[0], label: x[1] };
  });

  const CATEGORIES = [
    {
      id: "1",
      name: "电影",
      kind: "movie",
      filters: [
        { key: "class", name: "类型", defaultValue: "1", options: MOVIE_CLASSES },
        { key: "area", name: "地区", defaultValue: "", options: AREAS },
        { key: "year", name: "年份", defaultValue: "", options: YEARS },
      ],
    },
    {
      id: "2",
      name: "电视剧",
      kind: "series",
      filters: [
        { key: "class", name: "类型", defaultValue: "2", options: SERIES_CLASSES },
        { key: "area", name: "地区", defaultValue: "", options: AREAS },
        { key: "year", name: "年份", defaultValue: "", options: YEARS },
      ],
    },
    {
      id: "3",
      name: "综艺",
      kind: "variety",
      filters: [
        { key: "area", name: "地区", defaultValue: "", options: AREAS },
        { key: "year", name: "年份", defaultValue: "", options: YEARS },
      ],
    },
    {
      id: "4",
      name: "动漫",
      kind: "anime",
      filters: [
        { key: "area", name: "地区", defaultValue: "", options: AREAS },
        { key: "year", name: "年份", defaultValue: "", options: YEARS },
      ],
    },
  ];

  function getHost(config) {
    const raw = (config && (config.host || config.url)) || DEFAULT_HOST;
    return String(raw).trim().replace(/\/+$/, "") || DEFAULT_HOST;
  }

  function absUrl(host, u) {
    if (!u) return null;
    const s = String(u).trim().replace(/&amp;/g, "&");
    if (!s) return null;
    if (s.startsWith("//")) return "https:" + s;
    if (/^https?:\/\//i.test(s)) return s;
    return host + (s.startsWith("/") ? s : "/" + s);
  }

  function cleanText(raw) {
    return String(raw || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&(?:nbsp|ensp|emsp|thinsp);/gi, " ")
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
      if (CATEGORIES[i].id === String(tid)) return CATEGORIES[i].kind;
    }
    return null;
  }

  async function fetchHtml(host, pathOrUrl) {
    const url = /^https?:\/\//i.test(pathOrUrl)
      ? pathOrUrl
      : host + (pathOrUrl.startsWith("/") ? pathOrUrl : "/" + pathOrUrl);
    try {
      const resp = await Host.http.get(url, {
        headers: {
          "User-Agent": UA,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "zh-CN,zh;q=0.9",
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

  function parseList(host, html, kind) {
    const items = [];
    const seen = Object.create(null);
    if (!html) return items;
    const boxes = Host.html.selectAll(html, "ul.stui-vodlist li .stui-vodlist__box");
    for (var i = 0; i < boxes.length; i++) {
      const boxHtml = boxes[i].html;
      const href = Host.html.attr(boxHtml, "a.stui-vodlist__thumb", "href") || "";
      const vm = /\/post\/(\d+)\.html/.exec(href);
      if (!vm) continue;
      const vid = vm[1];
      if (seen[vid]) continue;
      seen[vid] = true;

      const title =
        cleanText(Host.html.attr(boxHtml, "a.stui-vodlist__thumb", "title")) ||
        cleanText(Host.html.attr(boxHtml, "img", "alt")) ||
        cleanText(Host.html.text(boxHtml, ".title"));
      if (!title) continue;

      const picRaw =
        Host.html.attr(boxHtml, "a.stui-vodlist__thumb", "data-original") ||
        Host.html.attr(boxHtml, "a.stui-vodlist__thumb", "data-src") ||
        Host.html.attr(boxHtml, "img", "data-original") ||
        Host.html.attr(boxHtml, "img", "src");
      const remark = cleanText(Host.html.text(boxHtml, ".pic-text"));

      items.push({
        vodId: vid,
        title: title,
        poster: absUrl(host, picRaw),
        remark: remark || null,
        kind: kind || null,
      });
    }
    return items;
  }

  function decodePlayerUrl(rawUrl, encrypt) {
    let u = String(rawUrl || "").replace(/\\\//g, "/").trim();
    const enc = parseInt(encrypt || 0, 10) || 0;
    if (enc === 1) {
      try {
        u = Host.codec.urlDecode(u);
      } catch (_) {}
    } else if (enc === 2) {
      try {
        u = Host.codec.urlDecode(Host.crypto.base64Decode(u));
      } catch (_) {}
    }
    return u;
  }

  globalThis.LiveDeckVod = {
    async home(payload) {
      const host = getHost(payload && payload.config);
      const html = await fetchHtml(host, "/");
      return {
        categories: CATEGORIES.map(function (c) {
          return { id: c.id, name: c.name, filters: c.filters };
        }),
        featured: parseList(host, html, null).slice(0, 36),
      };
    },

    async category(payload) {
      const host = getHost(payload && payload.config);
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10));
      const tid = String((payload && payload.categoryId) || "1").trim();
      const filters = (payload && payload.filters) || {};
      const routeTid = String(filters.class || tid);
      const area = filters.area ? Host.codec.urlEncode(String(filters.area)) : "";
      const year = String(filters.year || "");
      const path =
        "/tags/" +
        [routeTid, area, "", "", "", "", "", "", String(page), "", "", year].join("-") +
        ".html";
      const html = await fetchHtml(host, path);
      const items = parseList(host, html, kindForCategory(tid));

      let totalPages = page;
      const tailMatch = /href="([^"]*)"[^>]*>尾页<\/a>/i.exec(html);
      if (tailMatch) {
        const pm = /-(\d+)---/.exec(tailMatch[1]);
        if (pm) {
          const pNum = parseInt(pm[1], 10);
          if (pNum > totalPages) totalPages = pNum;
        }
      }
      if (totalPages <= page && items.length >= 24) {
        totalPages = page + 1;
      }

      return {
        items: items,
        page: page,
        totalPages: totalPages,
        hasMore: page < totalPages,
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
          ? "/search/" + enc + "-------------.html"
          : "/search/" + enc + "----------" + page + "---.html";
      const html = await fetchHtml(host, path);
      const items = parseList(host, html, null);
      const hasMore = items.length >= 24;
      return {
        items: items,
        page: page,
        totalPages: hasMore ? page + 1 : page,
        hasMore: hasMore,
      };
    },

    async detail(payload) {
      const host = getHost(payload && payload.config);
      const raw = String((payload && payload.vodId) || "").trim();
      const vm = /(\d+)/.exec(raw);
      const vid = vm ? vm[1] : raw;
      const html = await fetchHtml(host, "/post/" + vid + ".html");
      if (!html) {
        return { vodId: vid, title: vid, actors: [], directors: [], sources: [] };
      }

      const title =
        cleanText(Host.html.text(html, "h1.title")) ||
        cleanText(Host.html.text(html, ".stui-content__detail h1")) ||
        vid;
      const posterRaw =
        Host.html.attr(html, ".stui-content__thumb img", "data-original") ||
        Host.html.attr(html, ".stui-content__thumb img", "src") ||
        Host.html.attr(html, ".stui-vodlist__thumb img", "data-original");

      let year = null;
      let region = null;
      let remark = null;
      let actors = [];
      let directors = [];
      let genres = [];

      const pNodes = Host.html.selectAll(html, ".stui-content__detail p");
      for (var i = 0; i < pNodes.length; i++) {
        const pHtml = pNodes[i].html;
        const label = cleanText(Host.html.text(pHtml, ".data2"));
        if (!label) continue;
        const full = cleanText(pNodes[i].text);
        const val = full.replace(label, "").trim();
        if (label.indexOf("演员") === 0) {
          const actorText = cleanText(Host.html.text(pHtml, ".data5")) || val;
          actors = splitNames(actorText);
        } else if (label.indexOf("状态") === 0) {
          remark = val || null;
        } else if (label.indexOf("年份") === 0) {
          year = parseYear(val);
        } else if (label.indexOf("地区") === 0) {
          region = val || null;
        } else if (label.indexOf("类型") === 0) {
          genres = splitNames(val);
        } else if (label.indexOf("导演") === 0) {
          directors = splitNames(val);
        }
      }

      const synopsis =
        cleanText(Host.html.text(html, ".detail-content")) ||
        cleanText(Host.html.text(html, ".detail-sketch")) ||
        null;

      const sources = [];
      const heads = Host.html.selectAll(html, ".stui-vodlist__head");
      for (var h = 0; h < heads.length; h++) {
        const headHtml = heads[h].html;
        const srcName = cleanText(Host.html.text(headHtml, "h4")).replace(/\s+/g, "");
        if (!srcName) continue;
        const links = Host.html.selectAll(headHtml, "ul.stui-content__playlist li a");
        const eps = [];
        for (var j = 0; j < links.length; j++) {
          const a = links[j];
          const href = (a.attrs && a.attrs.href) || "";
          const pm = /\/play\/(.*?)\.html/.exec(href);
          if (!pm) continue;
          const epName = cleanText(a.text) || "第" + (eps.length + 1) + "集";
          eps.push({
            episodeId: pm[1],
            name: epName,
            index: eps.length,
            playData: pm[1],
          });
        }
        if (eps.length > 0) {
          sources.push({
            sourceId: "line-" + (sources.length + 1),
            name: srcName,
            episodes: eps,
          });
        }
      }

      return {
        vodId: vid,
        title: title,
        poster: absUrl(host, posterRaw),
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
      const raw = String((payload && payload.playData) || "").trim();
      const playUrl = /^https?:\/\//i.test(raw) ? raw : host + "/play/" + raw + ".html";
      const html = await fetchHtml(host, playUrl);
      if (!html) {
        Host.raise("NO_STREAM", "kanxi failed to fetch play page: " + playUrl);
      }

      let streamUrl = "";
      const jsonStr =
        Host.text.extractJson(html, "player_data") || Host.text.extractJson(html, "player_aaaa");
      if (jsonStr) {
        try {
          const obj = JSON.parse(jsonStr);
          streamUrl = decodePlayerUrl(obj.url, obj.encrypt);
        } catch (_) {}
      }

      if (!streamUrl || !/^https?:\/\//i.test(streamUrl)) {
        const mm = /(https?:\/\/[^\s"'<>\\]+\.(?:m3u8|mp4)[^\s"'<>\\]*)/i.exec(
          html.replace(/\\\//g, "/")
        );
        if (mm) streamUrl = mm[1];
      }

      if (!streamUrl || !/^https?:\/\//i.test(streamUrl)) {
        Host.raise("NO_STREAM", "kanxi could not extract direct stream from " + playUrl);
      }

      return {
        streams: [
          {
            label: "默认线路",
            url: streamUrl,
            userAgent: UA,
            headers: { Referer: host + "/" },
          },
        ],
      };
    },
  };
})();
