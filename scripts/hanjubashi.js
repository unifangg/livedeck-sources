// Ported from hanjubashi.py -> LiveDeck script_js (QuickJS Sandbox, adult category 20 stripped)
(function () {
  const DEFAULT_HOST = "https://www.hanju84.cc";
  const BACKUP_HOSTS = [
    "https://www.hanju84.cc",
    "https://hanju84.cc",
    "https://m.hanju84.cc",
  ];
  const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

  // Category 20 (理论片 / adult) intentionally omitted
  const CATEGORIES = [
    { id: "2", name: "韩剧", kind: "series" },
    { id: "1", name: "韩国电影", kind: "movie" },
    { id: "3", name: "综艺", kind: "variety" },
    { id: "4", name: "动漫", kind: "anime" },
    { id: "27", name: "短剧", kind: "series" },
  ];

  const SUB_TYPES = {
    "2": [
      ["全部", ""],
      ["韩国剧", "16"],
      ["国产剧", "12"],
      ["香港剧", "13"],
      ["日本剧", "15"],
      ["欧美剧", "17"],
      ["泰国剧", "19"],
    ],
    "1": [
      ["全部", ""],
      ["剧情片", "10"],
      ["喜剧片", "6"],
      ["动作片", "5"],
      ["爱情片", "7"],
      ["恐怖片", "9"],
      ["科幻片", "8"],
      ["纪录片", "22"],
      ["动画片", "33"],
    ],
    "3": [
      ["全部", ""],
      ["日韩综艺", "25"],
      ["内地综艺", "23"],
      ["港台综艺", "24"],
      ["欧美综艺", "26"],
    ],
    "4": [
      ["全部", ""],
      ["日韩动漫", "30"],
      ["国产动漫", "28"],
      ["欧美动漫", "31"],
    ],
    "27": [],
  };

  const DEFAULT_CLASS = {
    "2": ["喜剧", "爱情", "剧情", "奇幻", "悬疑", "惊悚", "犯罪", "家庭", "动作", "古装", "科幻", "恐怖"],
    "1": ["喜剧", "剧情", "爱情", "动作", "科幻", "悬疑", "犯罪", "惊悚", "冒险", "奇幻", "恐怖", "战争", "灾难"],
    "3": ["选秀", "情感", "访谈", "播报", "旅游", "音乐", "美食", "纪实", "曲艺", "生活", "游戏互动", "财经", "求职"],
    "4": ["奇幻", "战斗", "玄幻", "穿越", "科幻", "武侠", "热血", "耽美", "搞笑"],
    "27": ["重生", "民国", "穿越", "年代", "现代", "言情", "反转", "爽文", "女恋", "总裁", "闪婚", "离婚", "都市", "脑洞", "古装", "仙侠"],
  };

  const DEFAULT_YEAR = ["2026", "2025", "2024", "2023", "2022", "2021", "2020", "2019", "2018", "2017", "2016"];
  const AREA_LIST = ["韩国", "中国大陆", "中国香港", "中国台湾", "日本", "美国", "泰国", "英国", "法国", "其它"];
  const BY_LIST = [
    ["最近更新", "time"],
    ["最多播放", "hits"],
    ["最好评", "score"],
  ];

  function getConfiguredHost(config) {
    const raw = config && (config.host || config.url);
    return raw ? String(raw).trim().replace(/\/+$/, "") : "";
  }

  function absUrl(host, u) {
    const s = String(u || "").trim();
    if (!s) return null;
    if (s.startsWith("//")) return "https:" + s;
    if (/^https?:\/\//i.test(s)) return s;
    return host + (s.startsWith("/") ? s : "/" + s);
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
        return s && s !== "未知";
      });
  }

  function isVideoFormat(url) {
    if (!url) return false;
    const u = String(url).toLowerCase().split("?")[0];
    return /\.(m3u8|mp4|flv|ts|mkv|avi|m4a)$/.test(u);
  }

  function showUrl(host, tid, area, by, cls, year, page) {
    const f = new Array(12).fill("");
    f[0] = String(tid);
    f[1] = area ? Host.codec.urlEncode(area) : "";
    f[2] = by || "";
    f[3] = cls ? Host.codec.urlEncode(cls) : "";
    f[8] = page && page > 1 ? String(page) : "";
    f[11] = year || "";
    return host + "/show-" + f.join("-") + ".html";
  }

  function searchUrl(host, wd, page) {
    const f = new Array(14).fill("");
    f[0] = Host.codec.urlEncode(wd);
    f[10] = page && page > 1 ? String(page) : "";
    return host + "/s-" + f.join("-") + ".html";
  }

  async function fetchHtml(url, referer, timeoutSec) {
    try {
      const resp = await Host.http.get(url, {
        headers: {
          "User-Agent": UA,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "zh-CN,zh;q=0.9",
          Referer: referer || url,
        },
        insecureTls: true,
        timeout: timeoutSec || 18,
      });
      return resp && resp.ok ? resp.bodyText || resp.body || "" : "";
    } catch (_) {
      return "";
    }
  }

  async function resolveHostAndHome(config) {
    const custom = getConfiguredHost(config);
    if (custom) {
      const html = await fetchHtml(custom + "/", custom + "/", 15);
      return { host: custom, homeHtml: html };
    }
    const cached = Host.cache.get("hanjubashi:host");
    if (cached) {
      const html = await fetchHtml(cached + "/", cached + "/", 15);
      if (html) return { host: cached, homeHtml: html };
    }
    for (var i = 0; i < BACKUP_HOSTS.length; i++) {
      const h = BACKUP_HOSTS[i];
      const html = await fetchHtml(h + "/", h + "/", 10);
      if (html && html.indexOf("韩剧") >= 0) {
        Host.cache.set("hanjubashi:host", h, 3600);
        return { host: h, homeHtml: html };
      }
    }
    return { host: DEFAULT_HOST, homeHtml: "" };
  }

  async function resolveHost(config) {
    const custom = getConfiguredHost(config);
    if (custom) return custom;
    const cached = Host.cache.get("hanjubashi:host");
    return cached || DEFAULT_HOST;
  }

  function parseFilterValues(html, tid) {
    const esc = String(tid).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const clsRe = new RegExp('href="/show-' + esc + '---([^-"]*?)--------\\.html"', "g");
    const yearRe = new RegExp('href="/show-' + esc + '-----------([^-"]+)\\.html"', "g");
    const cls = [];
    const years = [];
    const seenC = Object.create(null);
    const seenY = Object.create(null);
    let m;
    while ((m = clsRe.exec(html)) !== null) {
      if (!m[1]) continue;
      let val = m[1];
      try {
        val = Host.codec.urlDecode(val);
      } catch (_) {}
      if (val && !seenC[val]) {
        seenC[val] = true;
        cls.push(val);
      }
    }
    while ((m = yearRe.exec(html)) !== null) {
      if (!m[1]) continue;
      let val = m[1];
      try {
        val = Host.codec.urlDecode(val);
      } catch (_) {}
      if (val && !seenY[val]) {
        seenY[val] = true;
        years.push(val);
      }
    }
    return { cls: cls, years: years };
  }

  async function loadFiltersMap(host) {
    const cacheKey = "hanjubashi:filters:" + host;
    const cached = Host.cache.get(cacheKey);
    if (cached) return cached;

    const results = Object.create(null);
    await Promise.all(
      CATEGORIES.map(async function (cat) {
        const html = await fetchHtml(showUrl(host, cat.id, "", "", "", "", 1), host + "/", 10);
        if (html) {
          const parsed = parseFilterValues(html, cat.id);
          if (parsed.cls.length > 0) results[cat.id] = parsed;
        }
      })
    );
    if (Object.keys(results).length > 0) {
      Host.cache.set(cacheKey, results, 3600);
    }
    return results;
  }

  function buildCategoryFilters(tid, dynamicMap) {
    const dyn = dynamicMap && dynamicMap[tid];
    const clsVals = dyn && dyn.cls && dyn.cls.length > 0 ? dyn.cls : DEFAULT_CLASS[tid] || [];
    const yearVals = dyn && dyn.years && dyn.years.length > 0 ? dyn.years : DEFAULT_YEAR;
    const filters = [];

    const subs = SUB_TYPES[tid] || [];
    if (subs.length > 0) {
      filters.push({
        key: "tid",
        name: "子分类",
        defaultValue: "",
        options: subs.map(function (s) {
          return { value: s[1], label: s[0] };
        }),
      });
    }

    if (clsVals.length > 0) {
      filters.push({
        key: "class",
        name: "剧情",
        defaultValue: "",
        options: [{ value: "", label: "全部" }].concat(
          clsVals.map(function (c) {
            return { value: c, label: c };
          })
        ),
      });
    }

    filters.push({
      key: "area",
      name: "地区",
      defaultValue: "",
      options: [{ value: "", label: "全部" }].concat(
        AREA_LIST.map(function (a) {
          return { value: a, label: a };
        })
      ),
    });

    filters.push({
      key: "year",
      name: "年份",
      defaultValue: "",
      options: [{ value: "", label: "全部" }].concat(
        yearVals.map(function (y) {
          return { value: y, label: y };
        })
      ),
    });

    filters.push({
      key: "by",
      name: "排序",
      defaultValue: "",
      options: [{ value: "", label: "默认" }].concat(
        BY_LIST.map(function (b) {
          return { value: b[1], label: b[0] };
        })
      ),
    });

    return filters;
  }

  function parseList(host, html) {
    const items = [];
    const seen = Object.create(null);
    if (!html) return items;

    const blkRe = /<div[^>]*class="[^"]*cover_box[^"]*"[^>]*>([\s\S]{0,900}?)<\/h6>/gi;
    let m;
    while ((m = blkRe.exec(html)) !== null) {
      const blk = m[1];
      const vm = /href="\/v-(\d+)\.html"/.exec(blk);
      if (!vm) continue;
      const vid = vm[1];
      if (seen[vid]) continue;
      const tm = /class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/a>/i.exec(blk);
      const name = tm ? cleanText(tm[1]) : "";
      if (!name) continue;
      seen[vid] = true;
      const pm =
        /data-bg=["']([^"']+)["']/i.exec(blk) ||
        /data-original=["']([^"']+)["']/i.exec(blk) ||
        /data-src=["']([^"']+)["']/i.exec(blk) ||
        /<img[^>]+src=["']([^"']+)["']/i.exec(blk);
      const rm = /class="[^"]*label[^"]*"[^>]*>([\s\S]*?)<\/span>/i.exec(blk);
      const remark = rm ? cleanText(rm[1]) : "";
      items.push({
        vodId: vid,
        title: name,
        poster: pm ? absUrl(host, pm[1]) : null,
        remark: remark || null,
      });
    }

    if (items.length > 0) return items;

    const fallRe = /<a[^>]*class="[^"]*title[^"]*"[^>]*href="\/v-(\d+)\.html"[^>]*>([\s\S]*?)<\/a>/gi;
    while ((m = fallRe.exec(html)) !== null) {
      const vid = m[1];
      if (seen[vid]) continue;
      const name = cleanText(m[2]);
      if (!name) continue;
      seen[vid] = true;
      const pm = new RegExp('href="/v-' + vid + '\\.html"[^>]*?data-bg=["\']([^"\']+)["\']', "i").exec(html);
      items.push({
        vodId: vid,
        title: name,
        poster: pm ? absUrl(host, pm[1]) : null,
        remark: null,
      });
    }
    return items;
  }

  function parsePagecount(html, curPage) {
    if (!html) return curPage;
    let total = curPage;
    let m = /href="\/type-\d+-(\d+)\.html">\s*尾页/.exec(html);
    if (m) return Math.max(parseInt(m[1], 10) || curPage, curPage);
    m = /href="\/s-[^"]*?-(\d+)---\.html">\s*尾页/.exec(html);
    if (m) return Math.max(parseInt(m[1], 10) || curPage, curPage);
    const r1 = /href="\/type-\d+-(\d+)\.html"/g;
    while ((m = r1.exec(html)) !== null) {
      const n = parseInt(m[1], 10) || 1;
      if (n > total) total = n;
    }
    const r2 = /href="\/s-[^"]*?-(\d+)---\.html"/g;
    while ((m = r2.exec(html)) !== null) {
      const n = parseInt(m[1], 10) || 1;
      if (n > total) total = n;
    }
    const r3 = /href="\/show-[^"]*?--------(\d+)---[^"]*\.html"/g;
    while ((m = r3.exec(html)) !== null) {
      const n = parseInt(m[1], 10) || 1;
      if (n > total) total = n;
    }
    return total;
  }

  globalThis.LiveDeckVod = {
    async home(payload) {
      const res = await resolveHostAndHome(payload && payload.config);
      const dynamicMap = await loadFiltersMap(res.host);
      return {
        categories: CATEGORIES.map(function (c) {
          return {
            id: c.id,
            name: c.name,
            filters: buildCategoryFilters(c.id, dynamicMap),
          };
        }),
        featured: parseList(res.host, res.homeHtml),
      };
    },

    async category(payload) {
      const host = await resolveHost(payload && payload.config);
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10) || 1);
      const filters = (payload && payload.filters) || {};
      const realTid = String(filters.tid || "").trim() || String((payload && payload.categoryId) || "2");
      if (realTid === "20") {
        return { items: [], page: page, totalPages: page, hasMore: false };
      }
      const url = showUrl(
        host,
        realTid,
        String(filters.area || "").trim(),
        String(filters.by || "").trim(),
        String(filters.class || "").trim(),
        String(filters.year || "").trim(),
        page
      );
      const html = await fetchHtml(url, host + "/", 18);
      const items = parseList(host, html);
      let totalPages = parsePagecount(html, page);
      if (items.length === 0 && page > 1) totalPages = page;
      return {
        items: items,
        page: page,
        totalPages: totalPages,
        hasMore: page < totalPages,
      };
    },

    async search(payload) {
      const host = await resolveHost(payload && payload.config);
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10) || 1);
      const kw = String((payload && payload.keyword) || "").trim();
      if (!kw) return { items: [], page: 1, totalPages: 1, hasMore: false };
      let html = await fetchHtml(searchUrl(host, kw, page), host + "/", 18);
      if (!html && page === 1) {
        html = await fetchHtml(
          host + "/s--------------.html?wd=" + Host.codec.urlEncode(kw),
          host + "/",
          18
        );
      }
      const items = parseList(host, html);
      const totalPages = parsePagecount(html, page);
      return {
        items: items,
        page: page,
        totalPages: totalPages,
        hasMore: page < totalPages,
      };
    },

    async detail(payload) {
      const host = await resolveHost(payload && payload.config);
      const raw = String((payload && payload.vodId) || "");
      const vid = raw.replace(/\D+/g, "") || raw;
      const html = await fetchHtml(host + "/v-" + vid + ".html", host + "/", 18);
      if (!html) return { vodId: vid, title: vid, sources: [] };

      let name = "";
      let m = /<h1[^>]*class="[^"]*title[^"]*"[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/i.exec(html);
      if (m) name = cleanText(m[1]);
      if (!name) {
        m = /<title>([\s\S]*?)<\/title>/i.exec(html);
        if (m) name = cleanText(m[1]).split("_")[0].split("-")[0].trim();
      }

      let pic = null;
      m =
        /<img[^>]+src="([^"]+)"[^>]*class="[^"]*cover[^"]*"/i.exec(html) ||
        /<img[^>]*class="[^"]*cover[^"]*"[^>]+src="([^"]+)"/i.exec(html);
      if (m) pic = absUrl(host, m[1]);

      let remark = "";
      m = /class="[^"]*rating[^"]*"[^>]*>([\s\S]*?)<\/span>[\s\S]{0,60}?class="[^"]*label[^"]*"[^>]*>([\s\S]*?)<\/span>/i.exec(
        html
      );
      if (m) {
        remark = cleanText(m[2]);
      } else {
        m = /class="[^"]*label[^"]*"[^>]*>([\s\S]*?)<\/span>/i.exec(html);
        if (m) remark = cleanText(m[1]);
      }

      let region = null;
      let year = null;
      m = /<p[^>]*id="see_more"[^>]*>([\s\S]*?)<\/p>/i.exec(html);
      if (m) {
        const info = cleanText(
          m[1].replace(/<span[^>]*class="[^"]*see_more[^"]*"[^>]*>[\s\S]*?<\/span>/gi, "")
        );
        const head = info.split("|")[0];
        const parts = head
          .split("·")
          .map(function (p) {
            return p.trim();
          })
          .filter(Boolean);
        if (parts.length > 0) region = parts[0];
        for (var i = 0; i < parts.length; i++) {
          const y = parseYear(parts[i]);
          if (y) {
            year = y;
            break;
          }
        }
      }

      function pick(label) {
        const re = new RegExp(
          'class="[^"]*item[^"]*"[^>]*>\\s*' + label + "\\s*[：:]\\s*<\\/span>([\\s\\S]*?)<\\/p>",
          "i"
        );
        const mm = re.exec(html);
        return mm ? cleanText(mm[1]) : "";
      }

      const directors = splitNames(pick("导演"));
      const actors = splitNames(pick("主演"));
      const writer = pick("编剧");
      const alias = pick("又名");
      let content = pick("剧情");
      if (
        !content ||
        content === "暂无简介，敬请期待" ||
        content.replace(/[^\u4e00-\u9fa5\uac00-\ud7a3a-zA-Z0-9]/g, "").length < 6
      ) {
        content = "";
      }
      const extra = [];
      if (alias) extra.push("又名: " + alias);
      if (writer && writer !== "未知") extra.push("编剧: " + writer);
      if (extra.length > 0) {
        content = extra.join("　") + (content ? "\n" + content : "");
      }

      let typeName = "";
      m = /<li[^>]*class="current"[^>]*>\s*<a[^>]*href="\/show-\d+-[^"]*"[^>]*>([\s\S]*?)<\/a>/i.exec(
        html
      );
      if (m) typeName = cleanText(m[1]);

      const sourceNames = [];
      m = /<ul[^>]*class="[^"]*play_from[^"]*"[^>]*>([\s\S]*?)<\/ul>/i.exec(html);
      if (m) {
        const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
        let lm;
        while ((lm = liRe.exec(m[1])) !== null) {
          const nm = cleanText(
            lm[1].replace(/<span[^>]*class="[^"]*badge[^"]*"[^>]*>[\s\S]*?<\/span>/gi, "")
          );
          sourceNames.push(nm || "线路");
        }
      }

      const sources = [];
      const blkRe = /<ul[^>]*class="[^"]*play_list[^"]*"[^>]*>([\s\S]*?)<\/ul>/gi;
      let bm;
      let sIdx = 0;
      while ((bm = blkRe.exec(html)) !== null) {
        const blk = bm[1];
        const eps = [];
        const r1 = /href="(\/p-[\d\-]+\.html)"[^>]*>([^<]*)<\/a>/gi;
        let em;
        while ((em = r1.exec(blk)) !== null) {
          eps.push({ href: em[1], txt: em[2] });
        }
        if (eps.length === 0) {
          const r2 = /title="([^"]*)"\s+href="(\/p-[\d\-]+\.html)"/gi;
          while ((em = r2.exec(blk)) !== null) {
            eps.push({ href: em[2], txt: em[1] });
          }
        }
        if (eps.length > 0) {
          const sName = sourceNames[sIdx] || "线路" + (sIdx + 1);
          sources.push({
            sourceId: "line-" + (sIdx + 1),
            name: sName,
            episodes: eps.map(function (e, idx) {
              return {
                episodeId: (sIdx + 1) + "-" + (idx + 1),
                name: cleanText(e.txt).replace(/[$#]/g, " ").trim() || "播放",
                index: idx,
                playData: e.href,
              };
            }),
          });
        }
        sIdx += 1;
      }

      if (sources.length === 0) {
        sources.push({
          sourceId: "default",
          name: "默认",
          episodes: [
            {
              episodeId: "1-1",
              name: "正片",
              index: 0,
              playData: "/p-" + vid + "-1-1.html",
            },
          ],
        });
      }

      return {
        vodId: vid,
        title: name || "未知",
        poster: pic,
        remark: remark || null,
        year: year,
        region: region,
        genres: typeName ? [typeName] : [],
        actors: actors,
        directors: directors,
        synopsis: content || null,
        sources: sources,
      };
    },

    async play(payload) {
      const host = await resolveHost(payload && payload.config);
      const headers = { Referer: host + "/" };
      const path = String((payload && payload.playData) || "").trim();
      const pageUrl = absUrl(host, path);
      if (!pageUrl) Host.raise("INVALID_PLAY_DATA", "missing playData");
      const html = await fetchHtml(pageUrl, host + "/", 18);

      let real = "";
      const im = /<iframe[^>]+src="([^"]+)"/i.exec(html);
      if (im) {
        const src = decodeEntities(im[1]);
        const q = /[?&]url=([^&"']+)/.exec(src);
        if (q) {
          try {
            real = Host.codec.urlDecode(q[1]);
          } catch (_) {
            real = q[1];
          }
        } else if (isVideoFormat(src)) {
          real = src;
        } else {
          real = absUrl(host, src) || "";
        }
      }

      if (!real || !/^https?:\/\//i.test(real)) {
        const pm = /var\s+player_\w+\s*=\s*(\{[\s\S]*?\})\s*[;<]/.exec(html);
        if (pm) {
          try {
            const data = JSON.parse(pm[1]);
            let u = String(data.url || "");
            const enc = parseInt(data.encrypt || 0, 10) || 0;
            if (enc === 1) {
              u = Host.codec.urlDecode(u);
            } else if (enc === 2) {
              u = Host.codec.urlDecode(Host.crypto.base64Decode(u));
            }
            if (u) real = u;
          } catch (_) {}
        }
      }

      if (!real) {
        const m3 =
          /(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i.exec(html) ||
          /(https?:\/\/[^\s"'<>]+\.(?:mp4|flv|ts)(?:\?[^\s"'<>]*)?)/i.exec(html);
        if (m3) real = m3[1];
      }

      const finalUrl = absUrl(host, real);
      if (!finalUrl) {
        Host.raise("NO_STREAM", "hanjubashi could not extract stream from " + pageUrl);
      }
      return {
        streams: [{ label: "默认线路", url: finalUrl, userAgent: UA, headers: headers }],
      };
    },
  };
})();
