// Ported from duanjubashi.py -> LiveDeck script_js (QuickJS Sandbox)
(function () {
  const DEFAULT_HOST = "https://www.duanju84.com";
  const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

  const CATEGORIES = [
    ["27", "短剧"],
    ["label_boy", "男频爽剧"],
    ["label_girl", "女频爽剧"],
    ["label_hot", "热门推荐"],
  ];

  const CLASS_FALLBACK = [
    "重生", "民国", "穿越", "年代", "现代", "言情", "反转", "爽文",
    "女恋", "总裁", "闪婚", "离婚", "都市", "脑洞", "古装", "仙侠",
  ];

  const FROM_NAMES = {
    bfzym3u8: "暴风",
    lzm3u8: "量子",
    ffm3u8: "非凡",
    snm3u8: "闪电",
    tkm3u8: "天空",
    hnm3u8: "海纳",
    jsm3u8: "极速",
    dbm3u8: "多宝",
    lem3u8: "乐视",
    wjm3u8: "无尽",
    ukm3u8: "优酷",
    play: "默认",
  };

  function getHost(config) {
    const raw = (config && (config.host || config.url)) || DEFAULT_HOST;
    return String(raw).trim().replace(/\/+$/, "") || DEFAULT_HOST;
  }

  function decodeEntities(str) {
    return String(str || "")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">");
  }

  function cleanText(raw) {
    return decodeEntities(raw).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }

  function absUrl(host, u) {
    const s = String(u || "").trim();
    if (!s) return null;
    if (s.startsWith("//")) return "https:" + s;
    if (/^https?:\/\//i.test(s)) return s;
    return host + (s.startsWith("/") ? s : "/" + s);
  }

  function encPlus(val) {
    const s = String(val || "").trim();
    if (!s) return "";
    return Host.codec.urlEncode(s).replace(/%20/g, "+");
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

  async function fetchHtml(host, pathOrUrl) {
    const url = /^https?:\/\//i.test(pathOrUrl)
      ? pathOrUrl
      : host + (pathOrUrl.startsWith("/") ? pathOrUrl : "/" + pathOrUrl);
    for (var i = 0; i < 2; i++) {
      try {
        const resp = await Host.http.get(url, {
          headers: {
            "User-Agent": UA,
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9",
            Referer: host + "/",
          },
          insecureTls: true,
          timeout: 15,
        });
        if (resp && resp.ok) return resp.bodyText || resp.body || "";
      } catch (_) {}
    }
    return "";
  }

  function parseList(host, html) {
    const items = [];
    const seen = Object.create(null);
    if (!html) return items;
    const re = /<a\s+href="(\/duanju\/(\d+)\.html)"\s+title="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
      const vid = m[2];
      if (seen[vid]) continue;
      seen[vid] = true;
      let name = cleanText(m[3]);
      const inner = m[4];
      if (!name) {
        const pm = /<p class="txt-ov">([\s\S]*?)<\/p>/i.exec(inner);
        if (pm) name = cleanText(pm[1]);
      }
      if (!name || name.startsWith("http") || name.length < 2) continue;

      let pic = null;
      const dm = /data-original="([^"]+)"/i.exec(inner);
      if (dm) pic = absUrl(host, dm[1]);
      if (!pic) {
        const im = /<img[^>]+src="([^"]+)"/i.exec(inner);
        if (im && im[1].indexOf("load.png") === -1) {
          pic = absUrl(host, im[1]);
        }
      }
      items.push({
        vodId: vid,
        title: name,
        poster: pic,
        kind: "series",
      });
    }
    return items;
  }

  function segPagecount(html, route, segLen, pageIdx) {
    let maxP = 1;
    const re = new RegExp("/" + route + '/([^"\'<>]+?)\\.html', "g");
    let m;
    while ((m = re.exec(html || "")) !== null) {
      const seg = m[1].split("-");
      if (seg.length === segLen && /^\d+$/.test(seg[pageIdx])) {
        const n = parseInt(seg[pageIdx], 10);
        if (n > maxP) maxP = n;
      }
    }
    return maxP;
  }

  function maxLabelPage(html) {
    let maxP = 1;
    const re = /\/label\/[^"/]+\/page\/(\d+)\.html/g;
    let m;
    while ((m = re.exec(html || "")) !== null) {
      const n = parseInt(m[1], 10);
      if (n > maxP) maxP = n;
    }
    return maxP;
  }

  async function buildShowFilters(host) {
    const cacheKey = "duanjubashi:classes:" + host;
    let classPairs = Host.cache.get(cacheKey);
    if (!classPairs) {
      const html = await fetchHtml(host, "/list/27.html");
      classPairs = [];
      const seen = Object.create(null);
      const re = /href="\/show\/27---([^-"]*)-{8}\.html"\s+title="([^"]*)"/g;
      let m;
      while ((m = re.exec(html)) !== null) {
        const label = cleanText(m[2]);
        if (!label || label === "全部") continue;
        let raw = m[1];
        try {
          raw = Host.codec.urlDecode(raw.replace(/\+/g, " ")).trim();
        } catch (_) {}
        if (raw && !seen[raw]) {
          seen[raw] = true;
          classPairs.push([label, raw]);
        }
      }
      if (classPairs.length === 0) {
        classPairs = CLASS_FALLBACK.map(function (n) {
          return [n, n];
        });
      }
      Host.cache.set(cacheKey, classPairs, 3600);
    }

    return [
      {
        key: "class",
        name: "类型",
        defaultValue: "",
        options: [{ value: "", label: "全部" }].concat(
          classPairs.map(function (p) {
            return { value: p[1], label: p[0] };
          })
        ),
      },
      {
        key: "by",
        name: "排序",
        defaultValue: "",
        options: [
          { value: "", label: "默认" },
          { value: "time", label: "最新" },
          { value: "hits", label: "人气" },
          { value: "score", label: "评分" },
        ],
      },
      {
        key: "year",
        name: "年份",
        defaultValue: "",
        options: [{ value: "", label: "全部" }].concat(
          ["2026", "2025", "2024", "2023", "2022", "2021", "2020"].map(function (y) {
            return { value: y, label: y };
          })
        ),
      },
    ];
  }

  function parseEps(chunk, sourceIdx) {
    const eps = [];
    const re = /<a href="(\/djplay\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = re.exec(chunk || "")) !== null) {
      const t = cleanText(m[2]).replace(/[#\$]/g, "").trim();
      if (!t) continue;
      eps.push({
        episodeId: sourceIdx + "-" + (eps.length + 1),
        name: t,
        index: eps.length,
        playData: m[1],
      });
    }
    return eps;
  }

  globalThis.LiveDeckVod = {
    async home(payload) {
      const host = getHost(payload && payload.config);
      const [homeHtml, showFilters] = await Promise.all([
        fetchHtml(host, "/"),
        buildShowFilters(host),
      ]);
      return {
        categories: CATEGORIES.map(function (c) {
          return {
            id: c[0],
            name: c[1],
            filters: c[0] === "27" ? showFilters : [],
          };
        }),
        featured: parseList(host, homeHtml),
      };
    },

    async category(payload) {
      const host = getHost(payload && payload.config);
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10) || 1);
      const tid = String((payload && payload.categoryId) || "27").trim();
      const filters = (payload && payload.filters) || {};

      let html = "";
      let totalPages = page;
      if (tid.startsWith("label_")) {
        const tag = tid.slice(6);
        const path = page <= 1 ? "/label/" + tag + ".html" : "/label/" + tag + "/page/" + page + ".html";
        html = await fetchHtml(host, path);
        totalPages = Math.max(maxLabelPage(html), page);
      } else {
        const seg = new Array(12).fill("");
        seg[0] = tid;
        seg[1] = encPlus(filters.area);
        seg[2] = encPlus(filters.by);
        seg[3] = encPlus(filters.class);
        seg[4] = encPlus(filters.lang);
        seg[8] = String(page);
        seg[11] = encPlus(filters.year);
        html = await fetchHtml(host, "/show/" + seg.join("-") + ".html");
        totalPages = Math.max(segPagecount(html, "show", 12, 8), page);
      }

      const items = parseList(host, html);
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
      if (!kw) return { items: [], page: 1, totalPages: 1, hasMore: false };

      const seg = new Array(14).fill("");
      seg[0] = encPlus(kw);
      seg[10] = String(page);
      const path = "/search/" + seg.join("-") + ".html";
      let html = await fetchHtml(host, path);
      if (html && html.indexOf("频繁操作") >= 0) {
        Host.time.sleep(3200);
        html = await fetchHtml(host, path);
      }
      const items = parseList(host, html);
      const totalPages = Math.max(segPagecount(html, "search", 14, 10), page);
      return {
        items: items,
        page: page,
        totalPages: totalPages,
        hasMore: page < totalPages,
      };
    },

    async detail(payload) {
      const host = getHost(payload && payload.config);
      const vid = String((payload && payload.vodId) || "").trim();
      const [html, phtml] = await Promise.all([
        fetchHtml(host, "/duanju/" + vid + ".html"),
        fetchHtml(host, "/djplay/" + vid + "-1-1.html"),
      ]);
      if (!html) return { vodId: vid, title: vid, sources: [] };

      let name = "";
      let m = /<div class="detail-title[^"]*"[^>]*>\s*<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
      if (m) name = cleanText(m[1]);
      if (!name) {
        m = /<title>([\s\S]*?)<\/title>/i.exec(html);
        if (m) name = cleanText(m[1]).split("-")[0].trim();
      }

      let pic = null;
      m = /<div class="detail-pic[^"]*"[^>]*>\s*<img[^>]+data-original="([^"]+)"/i.exec(html);
      if (m) pic = absUrl(host, m[1]);
      if (!pic) {
        m = /data-original="(https?:\/\/[^"]+)"/i.exec(html);
        if (m) pic = absUrl(host, m[1]);
      }

      let actors = [];
      let genres = [];
      let remark = null;
      const dlRe = /<dt>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi;
      while ((m = dlRe.exec(html)) !== null) {
        const k = cleanText(m[1]).replace(/[：:]$/, "");
        const v = cleanText(m[2]);
        if (k === "主角" || k === "主演") {
          actors = splitNames(v);
        } else if (k === "分类") {
          genres = splitNames(v);
        } else if (k === "状态" || k === "备注") {
          if (v) remark = v;
        }
      }

      let synopsis = "";
      m = /<div class="content-info[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(html);
      if (m) synopsis = cleanText(m[1]);
      if (name && synopsis.startsWith("《" + name + "》")) {
        synopsis = synopsis.slice(name.length + 2).trim();
      }

      let year = null;
      m = /((?:19|20)\d{2})年上映/.exec(synopsis);
      if (m) year = parseYear(m[1]);
      if (!year && pic) {
        m = /\/upload\/vod\/((?:19|20)\d{2})\d{4}/.exec(pic);
        if (m) year = parseYear(m[1]);
      }

      const sources = [];
      if (phtml) {
        const tabM = /<section class="tab clearfix" id="play_tab">([\s\S]*?)<\/section>/i.exec(phtml);
        const tabNames = [];
        if (tabM) {
          const liRe = /<li[^>]*><a[^>]*>([\s\S]*?)<\/a><\/li>/gi;
          let lm;
          while ((lm = liRe.exec(tabM[1])) !== null) {
            tabNames.push(cleanText(lm[1]));
          }
        }
        let alt = "";
        if (tabNames.length === 0) {
          const fm = /"from"\s*:\s*"([^"]*)"/.exec(phtml);
          if (fm) alt = FROM_NAMES[fm[1]] || fm[1] || "";
        }
        const boxM = /<section class="tab_box[^"]*" id="play_tab_box">([\s\S]*?)<\/section>/i.exec(phtml);
        if (boxM) {
          const itemRe = /<div class="item[^"]*">\s*<div class="video_list[^"]*">([\s\S]*?)<\/div>/gi;
          let im;
          let idx = 0;
          while ((im = itemRe.exec(boxM[1])) !== null) {
            const eps = parseEps(im[1], idx + 1);
            if (eps.length > 0) {
              const sName =
                (idx < tabNames.length && tabNames[idx]) ||
                (idx === 0 && alt) ||
                "线路" + (idx + 1);
              sources.push({ sourceId: "line-" + (idx + 1), name: sName, episodes: eps });
            }
            idx += 1;
          }
        }
      }

      if (sources.length === 0) {
        const box = /id="play_tab_box">\s*<div class="video_list[^"]*">([\s\S]*?)<\/div>/i.exec(html);
        const eps = box ? parseEps(box[1], 1) : [];
        if (eps.length > 0) {
          sources.push({ sourceId: "default", name: "默认", episodes: eps });
        }
      }

      return {
        vodId: vid,
        title: name || vid,
        poster: pic,
        remark: remark,
        year: year,
        region: "中国大陆",
        genres: genres,
        actors: actors,
        directors: [],
        synopsis: synopsis || null,
        kind: "series",
        sources: sources,
      };
    },

    async play(payload) {
      const host = getHost(payload && payload.config);
      const headers = { Referer: host + "/" };
      const pageUrl = absUrl(host, String((payload && payload.playData) || "").trim());
      if (!pageUrl) Host.raise("INVALID_PLAY_DATA", "missing playData");

      const html = await fetchHtml(host, pageUrl);
      let real = "";

      const m1 = /var\s+url\s*=\s*'([^']+\.m3u8[^']*)'/.exec(html);
      if (m1) real = m1[1];

      if (!real) {
        const jsonStr = Host.text.extractJson(html, "player_aaaa");
        if (jsonStr) {
          try {
            const obj = JSON.parse(jsonStr);
            real = String(obj.url || "");
          } catch (_) {}
        }
      }

      if (!real) {
        const m3 = /(https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/.exec(html);
        if (m3) real = m3[1];
      }

      if (!real) {
        Host.raise("NO_STREAM", "duanjubashi could not extract stream from " + pageUrl);
      }

      real = real.replace(/\\\//g, "/");
      if (real.startsWith("//")) real = "https:" + real;
      return {
        streams: [{ label: "默认线路", url: real, userAgent: UA, headers: headers }],
      };
    },
  };
})();
