// Ported from xinjianpian.py -> LiveDeck script_js (QuickJS Sandbox)
(function () {
  const DEFAULT_HOST = "https://api.ztcgi.com";
  const DEFAULT_IMG_HOST = "https://img.zgbkz.com";
  const UA =
    "Mozilla/5.0 (Linux; Android 9; V2196A Build/PQ3A.190705.08211809; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/91.0.4472.114 Mobile Safari/537.36;webank/h5face;webank/1.0;netType:NETWORK_WIFI;appVersion:416;packageName:com.jp3.xg3";

  const CLASSES = [
    ["1", "电影", "movie"],
    ["2", "电视剧", "series"],
    ["3", "动漫", "anime"],
    ["4", "综艺", "variety"],
  ];

  const KIND_MAP = {
    "1": "movie",
    "2": "series",
    "3": "anime",
    "4": "variety",
  };

  function makeOpts(pairs) {
    return pairs.map(function (p) {
      return { value: p[0], label: p[1] };
    });
  }

  const CATE_OPTS = makeOpts([
    ["", "全部"],
    ["1", "剧情"],
    ["2", "爱情"],
    ["3", "动画"],
    ["4", "喜剧"],
    ["5", "战争"],
    ["6", "歌舞"],
    ["7", "古装"],
    ["8", "奇幻"],
    ["9", "冒险"],
    ["10", "动作"],
    ["11", "科幻"],
    ["12", "悬疑"],
    ["13", "犯罪"],
    ["14", "家庭"],
    ["15", "传记"],
    ["16", "运动"],
    ["18", "惊悚"],
    ["20", "短片"],
    ["21", "历史"],
    ["22", "音乐"],
    ["23", "西部"],
    ["24", "武侠"],
    ["25", "恐怖"],
  ]);

  const AREA_OPTS = makeOpts([
    ["", "全部"],
    ["1", "国产"],
    ["3", "香港"],
    ["6", "台湾"],
    ["5", "美国"],
    ["18", "韩国"],
    ["2", "日本"],
  ]);

  const YEAR_OPTS = makeOpts([
    ["", "全部"],
    ["107", "2025"],
    ["119", "2024"],
    ["153", "2023"],
    ["101", "2022"],
    ["118", "2021"],
    ["16", "2020"],
    ["7", "2019"],
    ["2", "2018"],
    ["3", "2017"],
    ["22", "2016"],
    ["2015", "2015以前"],
  ]);

  const SORT_OPTS = makeOpts([
    ["update", "最新"],
    ["hot", "最热"],
    ["rating", "评分"],
  ]);

  const UNSAFE_RE =
    /(?:伦理|倫理|福利|成人|情色|三级|三級|写真|寫真|里番|裏番|无码|無碼|有码|有碼|色情|18\+|\bAV\b)/i;

  function isUnsafeText(s) {
    return UNSAFE_RE.test(String(s || ""));
  }

  function getHost(config) {
    const raw = (config && (config.host || config.url)) || DEFAULT_HOST;
    return String(raw).trim().replace(/\/+$/, "") || DEFAULT_HOST;
  }

  function cleanText(raw) {
    return String(raw || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
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

  function absImg(imgHost, path) {
    const p = String(path || "").trim();
    if (!p) return null;
    if (/^https?:\/\//i.test(p)) return p;
    if (p.startsWith("//")) return "https:" + p;
    return imgHost + (p.startsWith("/") ? p : "/" + p);
  }

  function isHttpStream(u) {
    return /^https?:\/\//i.test(String(u || "").trim());
  }

  function isDirectMediaUrl(u) {
    return (
      isHttpStream(u) &&
      /\.(m3u8|mp4|flv|ts|mkv|mov)(\?|$)/i.test(String(u || "").trim())
    );
  }

  async function apiGet(host, path, params) {
    try {
      const resp = await Host.http.get(host + path, {
        params: params || {},
        headers: {
          "User-Agent": UA,
          Referer: host,
          Accept: "application/json, text/plain, */*",
        },
        insecureTls: true,
        timeout: 15,
      });
      if (!resp || !resp.ok) return {};
      return resp.json() || {};
    } catch (_) {
      return {};
    }
  }

  async function getImgHost(host) {
    const ck = "xjp_img_host|" + host;
    const cached = Host.cache.get(ck);
    if (cached) return cached;
    const res = await apiGet(host, "/api/appAuthConfig");
    const dom = String((res && res.data && res.data.imgDomain) || "").trim();
    const imgHost = /^https?:\/\//i.test(dom)
      ? dom.replace(/\/+$/, "")
      : DEFAULT_IMG_HOST;
    Host.cache.set(ck, imgHost, 3600);
    return imgHost;
  }

  globalThis.LiveDeckVod = {
    async home(payload) {
      const host = getHost(payload && payload.config);
      const [imgHost, slideRes] = await Promise.all([
        getImgHost(host),
        apiGet(host, "/api/slide/list", { pos_id: "88" }),
      ]);

      const featured = [];
      const rows = Array.isArray(slideRes.data) ? slideRes.data : [];
      for (var i = 0; i < rows.length; i++) {
        const it = rows[i];
        if (!it || !it.jump_id || !it.title) continue;
        const title = cleanText(it.title);
        if (!title || isUnsafeText(title)) continue;
        featured.push({
          vodId: String(it.jump_id),
          title: title,
          poster: absImg(imgHost, it.thumbnail),
          remark: null,
        });
      }

      const commonFilters = [
        { key: "area", name: "地区", defaultValue: "", options: AREA_OPTS },
        { key: "year", name: "年代", defaultValue: "", options: YEAR_OPTS },
        { key: "sort", name: "排序", defaultValue: "update", options: SORT_OPTS },
      ];

      return {
        categories: CLASSES.map(function (c) {
          const filters =
            c[0] === "1"
              ? [{ key: "cateId", name: "分类", defaultValue: "", options: CATE_OPTS }].concat(
                  commonFilters
                )
              : commonFilters;
          return { id: c[0], name: c[1], filters: filters };
        }),
        featured: featured,
      };
    },

    async category(payload) {
      const host = getHost(payload && payload.config);
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10) || 1);
      const tid = String((payload && payload.categoryId) || "1");
      const f = (payload && payload.filters) || {};

      const [imgHost, res] = await Promise.all([
        getImgHost(host),
        apiGet(host, "/api/crumb/list", {
          fcate_pid: tid,
          page: String(page),
          category_id: String(f.cateId || ""),
          area: String(f.area || ""),
          year: String(f.year || ""),
          type: String(f.cateId || ""),
          sort: String(f.sort || ""),
        }),
      ]);

      const rows = Array.isArray(res.data) ? res.data : [];
      const items = [];
      for (var i = 0; i < rows.length; i++) {
        const it = rows[i];
        if (!it || !it.id || !it.title) continue;
        const title = cleanText(it.title);
        if (!title || isUnsafeText(title)) continue;
        items.push({
          vodId: String(it.id),
          title: title,
          poster: absImg(imgHost, it.path),
          remark: cleanText(it.mask) || null,
          rating: it.score != null && String(it.score) ? String(it.score) : null,
          kind: KIND_MAP[tid] || null,
        });
      }

      const hasMore = rows.length >= 15;
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

      const [imgHost, res] = await Promise.all([
        getImgHost(host),
        apiGet(host, "/api/v2/search/videoV2", {
          key: kw,
          category_id: "88",
          page: String(page),
          pageSize: "20",
        }),
      ]);

      const kwLower = kw.toLowerCase();
      const rows = Array.isArray(res.data) ? res.data : [];
      const items = [];
      for (var i = 0; i < rows.length; i++) {
        const it = rows[i];
        if (!it || !it.id || !it.title) continue;
        const title = cleanText(it.title);
        if (!title || isUnsafeText(title)) continue;
        if (title.toLowerCase().indexOf(kwLower) === -1) continue;
        items.push({
          vodId: String(it.id),
          title: title,
          poster: absImg(imgHost, it.thumbnail),
          remark: cleanText(it.mask) || null,
        });
      }

      const hasMore = rows.length >= 20;
      return {
        items: items,
        page: page,
        totalPages: hasMore ? page + 1 : page,
        hasMore: hasMore,
      };
    },

    async detail(payload) {
      const host = getHost(payload && payload.config);
      const vid = String((payload && payload.vodId) || "").trim();
      const [imgHost, res] = await Promise.all([
        getImgHost(host),
        apiGet(host, "/api/video/detailv2", { id: vid }),
      ]);

      const d = (res && res.data) || {};
      const title = cleanText(d.title) || "新荐片 " + vid;
      const genres = Array.isArray(d.types)
        ? d.types
            .map(function (t) {
              return cleanText(t && t.name);
            })
            .filter(Boolean)
        : [];

      if (isUnsafeText(title) || genres.some(isUnsafeText)) {
        Host.raise("CONTENT_FILTERED", "filtered unsafe content");
      }

      const directSources = [];
      const otherHttpSources = [];
      const srcList = Array.isArray(d.source_list_source)
        ? d.source_list_source
        : [];

      for (var i = 0; i < srcList.length; i++) {
        const src = srcList[i];
        if (!src) continue;
        const srcName = cleanText(src.name) || "线路" + (i + 1);
        if (isUnsafeText(srcName)) continue;

        const rawEps = Array.isArray(src.source_list) ? src.source_list : [];
        const eps = [];
        let hasDirect = false;

        for (var j = 0; j < rawEps.length; j++) {
          const part = rawEps[j];
          if (!part || !part.url) continue;
          const u = String(part.url).trim();
          // Strict protocol filter: HTTP/HTTPS only (skip ftp://, xg://, tvbox-xg:, thunder://, etc.)
          if (!isHttpStream(u)) continue;
          if (isDirectMediaUrl(u)) hasDirect = true;

          const epName =
            cleanText(part.source_name || part.weight || "") ||
            "第" + (eps.length + 1) + "集";
          eps.push({
            episodeId: "src" + (i + 1) + "-" + (eps.length + 1),
            name: epName,
            index: eps.length,
            playData: u,
          });
        }

        if (eps.length > 0) {
          const obj = {
            sourceId: "src-" + (i + 1),
            name: srcName,
            episodes: eps,
          };
          if (hasDirect) directSources.push(obj);
          else otherHttpSources.push(obj);
        }
      }

      // Prefer direct HLS/MP4 sources first; include other HTTP sources only if direct ones don't cover or alongside
      const sources = directSources.concat(otherHttpSources);

      const actors = Array.isArray(d.actors)
        ? d.actors
            .map(function (a) {
              return cleanText(typeof a === "string" ? a : a && a.name);
            })
            .filter(Boolean)
        : splitNames(d.actor || "");

      const directors = Array.isArray(d.directors)
        ? d.directors
            .map(function (a) {
              return cleanText(typeof a === "string" ? a : a && a.name);
            })
            .filter(Boolean)
        : splitNames(d.director || "");

      return {
        vodId: vid,
        title: title,
        poster: absImg(imgHost, d.thumbnail || d.path),
        remark: cleanText(d.mask) || null,
        year: parseYear(d.year),
        region: cleanText(d.area) || null,
        rating: d.score != null && String(d.score) ? String(d.score) : null,
        genres: genres,
        actors: actors,
        directors: directors,
        synopsis: cleanText(d.description) || null,
        sources: sources,
      };
    },

    async play(payload) {
      const host = getHost(payload && payload.config);
      const u = String((payload && payload.playData) || "").trim();
      if (!isHttpStream(u)) {
        Host.raise("UNSUPPORTED_STREAM", "non-HTTP stream is not supported: " + u);
      }
      return {
        streams: [
          {
            label: "默认线路",
            url: u,
            userAgent: UA,
            headers: { Referer: host + "/" },
          },
        ],
      };
    },
  };
})();
