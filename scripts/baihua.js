// Ported from baihua.py -> LiveDeck script_js (QuickJS Sandbox)
(function () {
  const DEFAULT_HOST = "https://www.balidwipa.com";
  const UA =
    "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36";

  const CLASSES = [
    ["1", "电影", "movie"],
    ["2", "电视剧", "series"],
    ["3", "综艺", "variety"],
    ["4", "动漫", "anime"],
  ];

  const KIND_MAP = {
    "1": "movie",
    "2": "series",
    "3": "variety",
    "4": "anime",
  };

  const YEAR_OPTIONS = [
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
    { value: "2017", label: "2017" },
    { value: "2016", label: "2016" },
    { value: "2015", label: "2015" },
    { value: "more", label: "更早" },
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

  function parseYear(raw) {
    const m = /(\d{4})/.exec(String(raw || ""));
    if (!m) return null;
    const n = parseInt(m[1], 10);
    return n >= 1900 && n <= 2100 ? n : null;
  }

  function splitNames(raw) {
    return cleanText(raw)
      .split(/[,，、/\s]+/)
      .map(function (s) {
        return s.trim();
      })
      .filter(Boolean);
  }

  function match1(text, re) {
    const m = re.exec(text || "");
    return m && m[1] ? m[1] : "";
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
        timeout: 12,
      });
      return resp && resp.ok ? resp.bodyText || resp.body || "" : "";
    } catch (_) {
      return "";
    }
  }

  function parseListHtml(host, html, kind) {
    const items = [];
    const seen = Object.create(null);
    if (!html) return items;

    const re = /href="\/yiy\/(\d+)\.html"[^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
      const vid = m[1];
      if (seen[vid]) continue;
      const title = cleanText(m[2]);
      if (!title || isUnsafeText(title)) continue;
      seen[vid] = true;

      const start = Math.max(0, m.index - 400);
      const backward = html.slice(start, m.index);
      const imgRe = /<img[^>]*(?:data-src|data-original|src)="([^"]*)"/gi;
      let lastImg = "";
      let im;
      while ((im = imgRe.exec(backward)) !== null) {
        if (im[1]) lastImg = im[1];
      }

      items.push({
        vodId: vid,
        title: title,
        poster: absUrl(host, lastImg),
        remark: null,
        kind: kind || null,
      });
    }

    return items;
  }

  function parsePageCount(html, currentPage, itemCount) {
    let maxPage = 0;
    const re1 = /\/bh\/\d+-(\d+)\.html/g;
    let m;
    while ((m = re1.exec(html || "")) !== null) {
      const n = parseInt(m[1], 10);
      if (n > maxPage) maxPage = n;
    }
    const re2 = /page=(\d+)/g;
    while ((m = re2.exec(html || "")) !== null) {
      const n = parseInt(m[1], 10);
      if (n > maxPage) maxPage = n;
    }
    if (maxPage > 0) return Math.max(maxPage, currentPage);
    return itemCount >= 20 ? currentPage + 1 : currentPage;
  }

  function extractDetailPic(host, html) {
    const og =
      match1(html, /<meta[^>]*og:image[^>]*content="([^"]+)"/i) ||
      match1(html, /<meta[^>]*content="([^"]+)"[^>]*og:image/i);
    if (og) return absUrl(host, og);

    const db =
      match1(html, /(?:src|data-src|data-original)="(https?:\/\/[^"]*doubaocdn[^"]*)"/i) ||
      match1(html, /url\((https?:\/\/[^)]*doubaocdn[^)]*)\)/i);
    if (db) return db;

    const imgRe = /<img[^>]*src="(https?:\/\/[^"]*)"/gi;
    let m;
    while ((m = imgRe.exec(html || "")) !== null) {
      const src = m[1];
      if (!/(icon|logo|favicon|avatar|loading|placeholder|blank)/i.test(src)) {
        return src;
      }
    }
    return null;
  }

  function extractLinksByKeyword(html, keyword) {
    let idx = (html || "").indexOf(keyword);
    if (idx === -1) idx = (html || "").indexOf(keyword.replace("：", ":"));
    if (idx === -1) return [];

    const chunk = html.slice(idx, idx + 1500);
    const stopWords = [
      "主演",
      "导演",
      "上映",
      "更新",
      "状态",
      "语言",
      "编剧",
      "类型",
      "地区",
      "年份",
      "频道",
      "剧情",
      "简介",
      "播放",
      "专辑",
      "豆瓣",
    ];
    let minPos = chunk.length;
    for (var i = 0; i < stopWords.length; i++) {
      const sw = stopWords[i];
      if (sw === keyword) continue;
      const pos = chunk.indexOf(sw, keyword.length);
      if (pos !== -1 && pos < minPos) minPos = pos;
    }
    const block = chunk.slice(0, minPos);
    const names = [];
    const re = />([^<]+)<\/a>/g;
    let m;
    while ((m = re.exec(block)) !== null) {
      const t = cleanText(m[1]);
      if (t && t !== "/") names.push(t);
    }
    return names;
  }

  function parsePlaySources(html, vodId) {
    const tabs = [];
    const tabRe = /href="[^"]*#playlist(\d+)"[^>]*>\s*([^<]*)\s*<\/a>/gi;
    let m;
    while ((m = tabRe.exec(html || "")) !== null) {
      tabs.push({ id: parseInt(m[1], 10), name: cleanText(m[2]) || "线路" + m[1] });
    }

    const eps = [];
    const epRe = /href="\/play\/(\d+)-(\d+)-(\d+)\.html"[^>]*>\s*([^<]*)\s*<\/a>/gi;
    while ((m = epRe.exec(html || "")) !== null) {
      eps.push({
        vodId: m[1],
        sid: parseInt(m[2], 10),
        nid: m[3],
        name: cleanText(m[4]) || "第" + (parseInt(m[3], 10) + 1) + "集",
      });
    }

    const sources = [];
    if (tabs.length > 0 && eps.length > 0) {
      for (var i = 0; i < tabs.length; i++) {
        const tab = tabs[i];
        if (isUnsafeText(tab.name)) continue;
        const expectedSid = tab.id - 1 >= 0 ? tab.id - 1 : tab.id;
        const items = [];
        for (var j = 0; j < eps.length; j++) {
          const ep = eps[j];
          if (ep.sid === expectedSid) {
            items.push({
              episodeId: ep.sid + "-" + ep.nid,
              name: ep.name,
              index: items.length,
              playData: ep.vodId + "-" + ep.sid + "-" + ep.nid,
            });
          }
        }
        if (items.length > 0) {
          sources.push({
            sourceId: "line-" + tab.id,
            name: tab.name,
            episodes: items,
          });
        }
      }
    }

    if (sources.length === 0 && eps.length > 0) {
      sources.push({
        sourceId: "default",
        name: "默认线路",
        episodes: eps.map(function (ep, idx) {
          return {
            episodeId: ep.sid + "-" + ep.nid,
            name: ep.name,
            index: idx,
            playData: ep.vodId + "-" + ep.sid + "-" + ep.nid,
          };
        }),
      });
    }

    if (sources.length === 0) {
      sources.push({
        sourceId: "default",
        name: "默认线路",
        episodes: [
          {
            episodeId: "0-0",
            name: "播放",
            index: 0,
            playData: vodId + "-0-0",
          },
        ],
      });
    }

    return sources;
  }

  function extractPlayerJson(html) {
    const keys = ["player_aaaa", "player_data"];
    for (var i = 0; i < keys.length; i++) {
      const raw = Host.text.extractJson(html, keys[i]);
      if (raw) {
        try {
          return JSON.parse(raw);
        } catch (_) {}
      }
    }
    const m = /player_\w+\s*=\s*(\{[^}]+\})/i.exec(html || "");
    if (m) {
      try {
        return JSON.parse(m[1]);
      } catch (_) {}
    }
    return null;
  }

  function decryptAesEcb(encrypted, html) {
    const key =
      match1(html, /key\s*[:=]\s*["']([A-Za-z0-9]{16})["']/i) ||
      "28fd7d0f7dac4156";
    try {
      const dec = Host.crypto.aesDecrypt({
        data: encrypted,
        dataEncoding: "base64",
        key: key,
        keyEncoding: "utf8",
        mode: "ecb",
        padding: "pkcs7",
        outputEncoding: "utf8",
      });
      if (dec && /^https?:\/\//i.test(dec.trim())) return dec.trim();
    } catch (_) {}
    try {
      const b64 = Host.codec.urlDecode(Host.crypto.base64Decode(encrypted));
      if (b64) return b64;
    } catch (_) {}
    return encrypted;
  }

  globalThis.LiveDeckVod = {
    async home(payload) {
      const host = getHost(payload && payload.config);
      // Skip hijacked homepage; use category 1 directly
      const html = await fetchHtml(host, "/bh/1.html");
      return {
        categories: CLASSES.map(function (c) {
          return {
            id: c[0],
            name: c[1],
            filters: [
              {
                key: "year",
                name: "年份",
                defaultValue: "",
                options: YEAR_OPTIONS,
              },
            ],
          };
        }),
        featured: parseListHtml(host, html, "movie").slice(0, 30),
      };
    },

    async category(payload) {
      const host = getHost(payload && payload.config);
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10) || 1);
      const tid = String((payload && payload.categoryId) || "1").trim();
      const year = String((payload && payload.filters && payload.filters.year) || "").trim();

      let path;
      if (year && year !== "全部") {
        path =
          "/search.php?searchtype=5&tid=" +
          Host.codec.urlEncode(tid) +
          "&year=" +
          Host.codec.urlEncode(year) +
          "&order=time&page=" +
          page;
      } else if (page <= 1) {
        path = "/bh/" + tid + ".html";
      } else {
        path = "/bh/" + tid + "-" + page + ".html";
      }

      const html = await fetchHtml(host, path);
      const items = parseListHtml(host, html, KIND_MAP[tid] || null);
      const totalPages = items.length === 0 ? page : parsePageCount(html, page, items.length);
      return {
        items: items,
        page: page,
        totalPages: totalPages,
        hasMore: items.length > 0 && page < totalPages,
      };
    },

    async search(payload) {
      const host = getHost(payload && payload.config);
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10) || 1);
      const kw = String((payload && payload.keyword) || "").trim();
      if (!kw) return { items: [], page: page, totalPages: 1, hasMore: false };

      const path =
        page <= 1
          ? "/search.php?searchword=" + Host.codec.urlEncode(kw)
          : "/search.php?searchword=" + Host.codec.urlEncode(kw) + "&page=" + page;
      const html = await fetchHtml(host, path);
      const items = parseListHtml(host, html, null);
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
      const raw = String((payload && payload.vodId) || "").trim();
      const vid = raw.replace(/\D+/g, "") || raw;
      const html = await fetchHtml(host, "/yiy/" + vid + ".html");
      if (!html || html.length < 200) {
        return {
          vodId: vid,
          title: "百花影院 " + vid,
          poster: null,
          actors: [],
          directors: [],
          genres: [],
          sources: [],
        };
      }

      const title =
        cleanText(match1(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i)) ||
        cleanText(match1(html, /<title>([^<]*)<\/title>/i)) ||
        "百花影院 " + vid;

      const typeName = cleanText(match1(html, /href="\/bh\/\d+\.html"[^>]*>([^<]+)<\/a>/i));
      const year = parseYear(match1(html, /year=(\d+)/i));
      let area = match1(html, /area=([^&"]+)/i);
      if (area) {
        try {
          area = Host.codec.urlDecode(area);
        } catch (_) {}
      }
      const region = cleanText(area) || null;
      const rating = cleanText(match1(html, /(\d+\.?\d*)\s*分/)) || null;
      const directors = extractLinksByKeyword(html, "导演");
      const actors = extractLinksByKeyword(html, "主演");

      let synopsis = cleanText(
        match1(html, /(?:剧情|简介)[：:]\s*([\s\S]*?)(?:<\/p>|<\/div>|<br|###|<h)/i)
      );
      if (synopsis.length > 500) synopsis = synopsis.slice(0, 500) + "...";

      const remark =
        cleanText(match1(html, /更新[：:]\s*([0-9\-: ]+)/i)) || null;
      const poster = extractDetailPic(host, html);

      if (isUnsafeText(title) || isUnsafeText(typeName)) {
        Host.raise("CONTENT_FILTERED", "filtered unsafe content");
      }

      return {
        vodId: vid,
        title: title,
        poster: poster,
        remark: remark,
        rating: rating,
        year: year,
        region: region,
        genres: typeName ? splitNames(typeName) : [],
        actors: actors,
        directors: directors,
        synopsis: synopsis || null,
        sources: parsePlaySources(html, vid),
      };
    },

    async play(payload) {
      const host = getHost(payload && payload.config);
      const raw = String((payload && payload.playData) || "").trim();
      const m = /(\d+)(?:-|___)(\d+)(?:-|___)(\d+)/.exec(raw);
      if (!m) {
        if (/^https?:\/\//i.test(raw)) {
          return {
            streams: [
              {
                label: "默认线路",
                url: raw,
                userAgent: UA,
                headers: { Referer: host + "/" },
              },
            ],
          };
        }
        Host.raise("INVALID_PLAY_DATA", "invalid baihua episode payload: " + raw);
      }

      const playPageUrl = host + "/play/" + m[1] + "-" + m[2] + "-" + m[3] + ".html";
      const html = await fetchHtml(host, playPageUrl);

      let playUrl = "";
      const pj = extractPlayerJson(html);
      if (pj && pj.url) {
        let u = String(pj.url).trim();
        const enc = parseInt(pj.encrypt || 0, 10);
        if (enc === 1) {
          try {
            u = Host.codec.urlDecode(u);
          } catch (_) {}
        } else if (enc === 2) {
          u = decryptAesEcb(u, html);
        }
        if (u.startsWith("//")) u = "https:" + u;
        playUrl = u;
      }

      if (!playUrl) {
        playUrl =
          match1(html, /(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i) ||
          match1(html, /(https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*)/i) ||
          match1(html, /(https?:\/\/[^\s"'<>]+\.flv[^\s"'<>]*)/i);
      }

      return {
        streams: [
          {
            label: "默认线路",
            url: playUrl || playPageUrl,
            userAgent: UA,
            headers: { Referer: host + "/" },
          },
        ],
      };
    },
  };
})();
