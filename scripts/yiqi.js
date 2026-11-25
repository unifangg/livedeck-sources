// Ported from yiqi.py -> LiveDeck script_js (QuickJS Sandbox)
(function () {
  const DEFAULT_HOST = "https://www.yiqiys.com";
  const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

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

  const YEAR_OPTS = (function () {
    const out = [{ value: "", label: "全部" }];
    for (var y = 2026; y >= 2010; y--) {
      out.push({ value: String(y), label: String(y) });
    }
    return out;
  })();

  function makeOpts(pairs) {
    return pairs.map(function (p) {
      return { value: p[1], label: p[0] };
    });
  }

  const AREA_MOVIE = makeOpts([
    ["全部", ""],
    ["大陆", "大陆"],
    ["香港", "香港"],
    ["台湾", "台湾"],
    ["美国", "美国"],
    ["法国", "法国"],
    ["英国", "英国"],
    ["日本", "日本"],
    ["韩国", "韩国"],
    ["泰国", "泰国"],
    ["印度", "印度"],
    ["西班牙", "西班牙"],
    ["加拿大", "加拿大"],
    ["俄罗斯", "俄罗斯"],
    ["其它", "其它"],
  ]);

  const AREA_ZH = makeOpts([
    ["全部", ""],
    ["大陆", "大陆"],
    ["香港", "香港"],
    ["美国", "美国"],
    ["台湾", "台湾"],
    ["韩国", "韩国"],
    ["日本", "日本"],
  ]);

  const FILTERS = {
    "1": [
      {
        key: "class",
        name: "类型",
        defaultValue: "",
        options: makeOpts([
          ["全部", ""],
          ["动作片", "5"],
          ["喜剧片", "6"],
          ["爱情片", "7"],
          ["科幻片", "8"],
          ["恐怖片", "9"],
          ["剧情片", "10"],
          ["战争片", "11"],
        ]),
      },
      { key: "area", name: "地区", defaultValue: "", options: AREA_MOVIE },
      { key: "year", name: "年份", defaultValue: "", options: YEAR_OPTS },
    ],
    "2": [
      {
        key: "class",
        name: "类型",
        defaultValue: "",
        options: makeOpts([
          ["全部", ""],
          ["国产剧", "12"],
          ["港台剧", "13"],
          ["欧美剧", "14"],
          ["日韩剧", "15"],
          ["海外剧", "16"],
        ]),
      },
      { key: "area", name: "地区", defaultValue: "", options: AREA_MOVIE },
      { key: "year", name: "年份", defaultValue: "", options: YEAR_OPTS },
    ],
    "3": [
      { key: "area", name: "地区", defaultValue: "", options: AREA_ZH },
      { key: "year", name: "年份", defaultValue: "", options: YEAR_OPTS },
    ],
    "4": [
      { key: "area", name: "地区", defaultValue: "", options: AREA_ZH },
      { key: "year", name: "年份", defaultValue: "", options: YEAR_OPTS },
    ],
  };

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

  function buildShowPath(tid, page, area, year) {
    const parts = ["", "", "", "", "", "", "", "", "", "", "", ""];
    parts[0] = String(tid);
    if (area) parts[1] = Host.codec.urlEncode(String(area));
    if (page > 1) parts[8] = String(page);
    if (year) parts[11] = String(year);
    return "/show/" + parts.join("-") + ".html";
  }

  function parseList(host, html, kind) {
    const items = [];
    const seen = Object.create(null);
    if (!html) return items;

    const re = /<div class="stui-vodlist__box">([\s\S]*?)<\/div>\s*<\/li>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
      const block = m[1];
      const hm = /href="(\/detail\/(\d+)\.html)"/i.exec(block);
      if (!hm) continue;
      const vid = hm[2];
      if (seen[vid]) continue;

      const title = cleanText(
        match1(block, /title="([^"]+)"/i) ||
          match1(block, /<h4[^>]*>\s*<a[^>]*>([^<]+)<\/a>/i)
      );
      if (!title || isUnsafeText(title)) continue;
      seen[vid] = true;

      const pic = absUrl(
        host,
        match1(block, /data-original="([^"]+)"/i) ||
          match1(block, /src="([^"]+)"/i)
      );
      const remark =
        cleanText(
          match1(block, /<span class="pic-text[^"]*">([^<]*)<\/span>/i) ||
            match1(block, /<span class="score[^"]*">([^<]*)<\/span>/i)
        ) || null;

      items.push({
        vodId: vid,
        title: title,
        poster: pic,
        remark: remark,
        kind: kind || null,
      });
    }
    return items;
  }

  function getPageTotal(html) {
    const m = /<li class="active num"><a>\d+\/(\d+)<\/a><\/li>/i.exec(html || "");
    if (m) {
      const n = parseInt(m[1], 10);
      if (n >= 1) return n;
    }
    return 0;
  }

  globalThis.LiveDeckVod = {
    async home(payload) {
      const host = getHost(payload && payload.config);
      const html = await fetchHtml(host, "/");
      return {
        categories: CLASSES.map(function (c) {
          return {
            id: c[0],
            name: c[1],
            filters: FILTERS[c[0]] || [],
          };
        }),
        featured: parseList(host, html, null).slice(0, 24),
      };
    },

    async category(payload) {
      const host = getHost(payload && payload.config);
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10) || 1);
      const tid = String((payload && payload.categoryId) || "1").trim();
      const filters = (payload && payload.filters) || {};
      const realTid = String(filters["class"] || tid).trim();
      const area = String(filters.area || "").trim();
      const year = String(filters.year || "").trim();

      const html = await fetchHtml(host, buildShowPath(realTid, page, area, year));
      const items = parseList(host, html, KIND_MAP[tid] || null);
      const total = getPageTotal(html);
      const totalPages = total > 0 ? Math.max(total, page) : items.length > 0 ? page + 1 : page;
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
        page > 1
          ? "/search/" + Host.codec.urlEncode(kw) + "----------" + page + "---.html"
          : "/search/-------------.html?wd=" + Host.codec.urlEncode(kw);
      let html = await fetchHtml(host, path);
      if (html && html.indexOf("频繁操作") !== -1) {
        Host.time.sleep(3500);
        html = await fetchHtml(host, path);
      }
      const items = parseList(host, html, null);
      const hasMore = items.length > 0;
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
      const html = await fetchHtml(host, "/detail/" + vid + ".html");
      if (!html) {
        return {
          vodId: vid,
          title: "一起影视 " + vid,
          poster: null,
          actors: [],
          directors: [],
          genres: [],
          sources: [],
        };
      }

      const title =
        cleanText(match1(html, /<h1 class="title">([\s\S]*?)<\/h1>/i)) ||
        "一起影视 " + vid;
      const poster = absUrl(host, match1(html, /<img[^>]+data-original="([^"]+)"/i));

      function grab(label) {
        const re = new RegExp(
          '<span class="(?:left )?data2">' + label + '：</span>([\\s\\S]*?)</p>',
          "i"
        );
        return cleanText(match1(html, re));
      }

      const state = grab("状态") || null;
      const year = parseYear(grab("年份"));
      const typeName = grab("类型");
      const region = grab("国家") || null;
      const directorStr = grab("导演");
      const actorStr = cleanText(
        match1(
          html,
          /<span class="left data2">主演：<\/span><span class="data5">([\s\S]*?)<\/span>/i
        )
      );
      const synopsis =
        cleanText(
          match1(html, /<span class="detail-content"[^>]*>([\s\S]*?)<\/span>/i) ||
            match1(html, /<span class="detail-sketch">([\s\S]*?)<\/span>/i)
        ) || null;

      if (isUnsafeText(title) || isUnsafeText(typeName)) {
        Host.raise("CONTENT_FILTERED", "filtered unsafe content");
      }

      const lineNames = [];
      const headRe = /<div class="stui-vodlist__head">[\s\S]*?<h4>([\s\S]*?)<\/h4>/gi;
      let hm;
      while ((hm = headRe.exec(html)) !== null) {
        const name = cleanText(hm[1]);
        if (name) lineNames.push(name);
      }

      const sources = [];
      const plRe = /<ul class="stui-content__playlist[^"]*">([\s\S]*?)<\/ul>/gi;
      let pm;
      let plIdx = 0;
      while ((pm = plRe.exec(html)) !== null) {
        const lineName = lineNames[plIdx] || "线路" + (plIdx + 1);
        plIdx++;
        if (isUnsafeText(lineName)) continue;
        const eps = [];
        const epRe = /<a[^>]+href="(\/play\/\d+-\d+-\d+\.html)"[^>]*>([^<]+)<\/a>/gi;
        let em;
        while ((em = epRe.exec(pm[1])) !== null) {
          const epName = cleanText(em[2]) || "播放";
          eps.push({
            episodeId: "line" + plIdx + "-" + (eps.length + 1),
            name: epName,
            index: eps.length,
            playData: em[1],
          });
        }
        if (eps.length > 0) {
          sources.push({
            sourceId: "line-" + plIdx,
            name: lineName,
            episodes: eps,
          });
        }
      }

      return {
        vodId: vid,
        title: title,
        poster: poster,
        remark: state,
        year: year,
        region: region,
        genres: typeName ? splitNames(typeName) : [],
        actors: splitNames(actorStr),
        directors: splitNames(directorStr),
        synopsis: synopsis,
        sources: sources,
      };
    },

    async play(payload) {
      const host = getHost(payload && payload.config);
      const raw = String((payload && payload.playData) || "").trim();
      if (!raw) {
        Host.raise("INVALID_PLAY_DATA", "missing yiqi playData");
      }

      const playPageUrl = absUrl(host, raw);
      const html = await fetchHtml(host, playPageUrl);

      let videoUrl = "";
      const jsonStr =
        Host.text.extractJson(html, "player_data") ||
        Host.text.extractJson(html, "player_aaaa");
      if (jsonStr) {
        try {
          const data = JSON.parse(jsonStr);
          let u = String(data.url || "").trim();
          const enc = parseInt(data.encrypt || 0, 10);
          if (enc === 1) u = Host.codec.urlDecode(u);
          else if (enc === 2) u = Host.codec.urlDecode(Host.crypto.base64Decode(u));
          if (u.startsWith("//")) u = "https:" + u;
          if (/^https?:\/\//i.test(u)) videoUrl = u;
        } catch (_) {}
      }

      if (!videoUrl) {
        videoUrl = match1(html, /(https?:\/\/[^\s"'<>]+?\.(?:m3u8|mp4)[^\s"'<>]*)/i);
      }

      return {
        streams: [
          {
            label: "默认线路",
            url: videoUrl || playPageUrl,
            userAgent: UA,
            headers: { Referer: host + "/" },
          },
        ],
      };
    },
  };
})();
