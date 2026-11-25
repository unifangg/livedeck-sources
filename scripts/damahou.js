// Ported from damahou.py -> LiveDeck script_js (QuickJS Sandbox)
(function () {
  const DEFAULT_HOST = "https://dmhyy.com";
  const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";

  const CHANNELS = [
    { id: "23", name: "电影", kind: "movie" },
    { id: "22", name: "剧集", kind: "series" },
    { id: "24", name: "动漫", kind: "anime" },
    { id: "25", name: "综艺", kind: "variety" },
  ];

  const TID_MAP = { "1": "23", "2": "22", "3": "24", "4": "25" };
  const KIND_MAP = { "23": "movie", "22": "series", "24": "anime", "25": "variety" };
  const NSFW_RE = /(伦理|福利|成人|情色|里番|禁片|三级片|午夜场|色情|女优|18\+|R18|NSFW|Hentai|\bAV\b)/i;

  function getCfg(config) {
    const c = config || {};
    const host =
      String(c.host || c.site || c.url || DEFAULT_HOST)
        .split(",")[0]
        .trim()
        .replace(/\/+$/, "") || DEFAULT_HOST;
    const webSign = String(c.webSign || c["web-sign"] || c.web_sign || "").trim();
    return { host: host, webSign: webSign };
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
    if (Array.isArray(raw)) {
      return raw.map(function (x) { return cleanText(x); }).filter(Boolean);
    }
    return cleanText(raw)
      .split(/[,，/]+/)
      .map(function (s) { return s.trim(); })
      .filter(Boolean);
  }

  function isSafeItem(item) {
    const text = [
      item && item.title,
      item && item.remark,
      Array.isArray(item && item.genres) ? item.genres.join(" ") : "",
    ].join(" ");
    return !NSFW_RE.test(text);
  }

  function absPic(host, p) {
    const s = String(p || "").trim();
    if (!s) return null;
    if (s.startsWith("//")) return "https:" + s;
    if (/^https?:\/\//i.test(s)) return s;
    return host + (s.startsWith("/") ? s : "/" + s);
  }

  function isVideoFormat(url) {
    return /\.(m3u8|mp4|flv|mkv|avi)(\?|#|$|\s)/i.test(String(url || ""));
  }

  async function apiGet(cfg, path, params, referer) {
    const headers = {
      "User-Agent": UA,
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "zh-CN,zh;q=0.9",
      Referer: referer || cfg.host + "/",
      "x-platform": "web",
      "x-requested-with": "XMLHttpRequest",
    };
    if (cfg.webSign) headers["web-sign"] = cfg.webSign;
    try {
      const resp = await Host.http.get(cfg.host + path, {
        params: params || undefined,
        headers: headers,
        insecureTls: true,
        timeout: 12,
      });
      if (!resp || !resp.ok) return {};
      const data = resp.json();
      return data && typeof data === "object" ? data : {};
    } catch (_) {
      return {};
    }
  }

  function asList(data) {
    if (Array.isArray(data)) return data;
    if (data && typeof data === "object") {
      const keys = ["data", "list", "items", "records", "rows", "vod_list"];
      for (var i = 0; i < keys.length; i++) {
        const v = data[keys[i]];
        if (Array.isArray(v)) return v;
        if (v && typeof v === "object") {
          const inner = asList(v);
          if (inner.length > 0) return inner;
        }
      }
    }
    return [];
  }

  function mapVodItem(cfg, item, defaultKind) {
    if (!item || typeof item !== "object") return null;
    const vid = item.vod_id || item.id || item.vodId;
    const name = item.vod_name || item.name || item.title;
    if (!vid || !name) return null;
    const title = cleanText(name);
    if (!title) return null;
    const cls = Array.isArray(item.vod_class) ? item.vod_class.join(",") : item.vod_class || "";
    const area = Array.isArray(item.vod_area) ? item.vod_area.join(",") : item.vod_area || "";
    const genres = splitNames(item.type_name || cls);
    const remark = cleanText(
      item.vod_remarks || item.remarks || item.vod_douban_score || item.vod_year || ""
    );
    const obj = {
      vodId: String(vid),
      title: title,
      poster: absPic(cfg.host, item.vod_pic || item.pic || item.cover),
      remark: remark || null,
      year: parseYear(item.vod_year),
      region: cleanText(area) || null,
      genres: genres,
      kind: defaultKind || null,
    };
    return isSafeItem(obj) ? obj : null;
  }

  function mapVodList(cfg, data, defaultKind) {
    const arr = asList(data);
    const out = [];
    const seen = Object.create(null);
    for (var i = 0; i < arr.length; i++) {
      const v = mapVodItem(cfg, arr[i], defaultKind);
      if (!v || seen[v.vodId]) continue;
      seen[v.vodId] = true;
      out.push(v);
    }
    return out;
  }

  function categoryMatch(item, realTid) {
    if (!item || typeof item !== "object") return false;
    const itemTid = String(item.type_id || item.typeId || item.tid || "");
    if (itemTid === realTid) return true;
    const name = String(item.type_name || "");
    const clsVal = item.vod_class || [];
    const cls = Array.isArray(clsVal) ? clsVal.filter(Boolean).join(",") : String(clsVal || "");
    const text = name + "," + cls;
    if (realTid === "23") {
      return (
        (text.indexOf("电影") >= 0 ||
          text.indexOf("动作片") >= 0 ||
          text.indexOf("剧情片") >= 0 ||
          text.indexOf("喜剧片") >= 0) &&
        text.indexOf("电视剧") < 0
      );
    }
    if (realTid === "22") {
      return /(剧集|电视剧|国产剧|连续剧|韩剧|陆剧|欧美剧|日剧)/.test(text);
    }
    if (realTid === "24") {
      return /(动漫|动画|国产动漫|日韩动漫)/.test(text);
    }
    if (realTid === "25") {
      return /(综艺|真人秀)/.test(text);
    }
    return true;
  }

  function lineRank(src) {
    const name = String(
      src.site_name || src.external_display_name || src.vod_play_from || ""
    ).toLowerCase();
    const fromCode = String(src.vod_play_from || src.external_play_from || "").toLowerCase();
    const url = String(src.vod_play_url || "");
    if (/\.(m3u8|mp4|flv)(\?|#|$|\s)/i.test(url)) {
      if (name.indexOf("暴风") >= 0 || fromCode.indexOf("bfzy") >= 0) return 1;
      if (name.indexOf("爱坤") >= 0 || fromCode.indexOf("ikm3u8") >= 0) return 2;
      if (name.indexOf("极速") >= 0 || fromCode.indexOf("jsm3u8") >= 0) return 3;
      if (name.indexOf("如意") >= 0 || fromCode.indexOf("rym3u8") >= 0) return 4;
      if (name.indexOf("量子") >= 0 || fromCode.indexOf("lzm3u8") >= 0) return 5;
      return 10;
    }
    if (parseInt(src.decode_status || 0, 10) === 0) return 50;
    return 99;
  }

  function parseEpisodes(playUrlStr) {
    const parts = String(playUrlStr || "").split("#");
    const eps = [];
    for (var i = 0; i < parts.length; i++) {
      const part = parts[i].trim();
      if (!part) continue;
      const idx = part.indexOf("$");
      let name = "";
      let u = "";
      if (idx >= 0) {
        name = cleanText(part.slice(0, idx)) || "第" + (eps.length + 1) + "集";
        u = part.slice(idx + 1).trim();
      } else {
        name = parts.length === 1 ? "正片" : "第" + (eps.length + 1) + "集";
        u = part;
      }
      if (u) {
        eps.push({
          episodeId: String(eps.length + 1),
          name: name,
          index: eps.length,
          playData: u,
        });
      }
    }
    return eps;
  }

  async function getAggregateSources(cfg, vid) {
    const paths = ["/api.php/web/internal/search_aggregate", "/api.php/web/search_aggregate"];
    for (var i = 0; i < paths.length; i++) {
      const j = await apiGet(cfg, paths[i], { vod_id: String(vid) }, cfg.host + "/play/" + vid);
      const arr = asList(j);
      if (arr.length > 0) return arr;
    }
    return [];
  }

  function buildSources(agg, detail) {
    const rawSources = [];
    const seen = Object.create(null);

    function addSource(name, playUrl) {
      const cleanName = cleanText(name);
      const urlStr = String(playUrl || "").trim();
      if (!cleanName || !urlStr) return;
      const key = cleanName + "|" + urlStr.slice(0, 80);
      if (seen[key]) return;
      seen[key] = true;
      const eps = parseEpisodes(urlStr);
      if (eps.length > 0) {
        rawSources.push({
          sourceId: "src-" + (rawSources.length + 1),
          name: cleanName,
          episodes: eps,
        });
      }
    }

    if (Array.isArray(agg) && agg.length > 0) {
      const sorted = agg.slice().sort(function (a, b) {
        return lineRank(a) - lineRank(b);
      });
      for (var i = 0; i < sorted.length; i++) {
        const src = sorted[i];
        const playUrl = String((src && src.vod_play_url) || "").trim();
        if (!playUrl || !/\.(m3u8|mp4|flv)(\?|#|$|\s)/i.test(playUrl)) continue;
        const lineName =
          src.site_name ||
          src.external_display_name ||
          src.external_play_from ||
          src.vod_play_from ||
          "线路";
        addSource(lineName, playUrl);
        if (rawSources.length >= 4) break;
      }
    }

    const pf = String((detail && detail.vod_play_from) || "");
    const pu = String((detail && detail.vod_play_url) || "");
    if (pf && pu && rawSources.length < 2) {
      const froms = pf.split("$$$");
      const urls = pu.split("$$$");
      for (var j = 0; j < froms.length; j++) {
        const f = froms[j];
        const u = urls[j] || "";
        if (!f || !u || !/\.(m3u8|mp4|flv)(\?|#|$|\s)/i.test(u)) continue;
        addSource(f, u);
        if (rawSources.length >= 4) break;
      }
    }

    if (rawSources.length === 0 && pf && pu) {
      const froms2 = pf.split("$$$");
      const urls2 = pu.split("$$$");
      for (var k = 0; k < Math.min(3, froms2.length); k++) {
        addSource(froms2[k], urls2[k] || "");
      }
    }

    return rawSources;
  }

  globalThis.LiveDeckVod = {
    async home(payload) {
      const cfg = getCfg(payload && payload.config);
      const j = await apiGet(
        cfg,
        "/api.php/web/filter/vod",
        { type_id: "23", page: "1", sort: "hits" },
        cfg.host + "/type/23"
      );
      return {
        categories: CHANNELS.filter(function (c) {
          return !NSFW_RE.test(c.name);
        }).map(function (c) {
          return { id: c.id, name: c.name, filters: [] };
        }),
        featured: mapVodList(cfg, j, "movie"),
      };
    },

    async category(payload) {
      const cfg = getCfg(payload && payload.config);
      const curPage = Math.max(1, parseInt((payload && payload.page) || 1, 10) || 1);
      const rawTid = String((payload && payload.categoryId) || "23").trim();
      const realTid = TID_MAP[rawTid] || rawTid;
      const filters = (payload && payload.filters) || {};
      const sort = String(filters.sort || filters.by || "hits");

      const j = await apiGet(
        cfg,
        "/api.php/web/filter/vod",
        { type_id: realTid, page: String(curPage), sort: sort },
        cfg.host + "/type/" + realTid
      );
      let filtered = asList(j).filter(function (x) {
        return categoryMatch(x, realTid);
      });

      if (filtered.length < 8) {
        const seenIds = Object.create(null);
        for (var i = 0; i < filtered.length; i++) {
          const id = String(filtered[i].vod_id || filtered[i].id || "");
          if (id) seenIds[id] = true;
        }
        for (var extraPage = curPage + 1; extraPage <= curPage + 2; extraPage++) {
          const jj = await apiGet(
            cfg,
            "/api.php/web/filter/vod",
            { type_id: realTid, page: String(extraPage), sort: sort },
            cfg.host + "/type/" + realTid
          );
          const extraArr = asList(jj).filter(function (x) {
            return categoryMatch(x, realTid);
          });
          for (var eIdx = 0; eIdx < extraArr.length; eIdx++) {
            const it = extraArr[eIdx];
            const vid = String(it.vod_id || it.id || "");
            if (vid && !seenIds[vid]) {
              seenIds[vid] = true;
              filtered.push(it);
            }
          }
          if (filtered.length >= 24) break;
        }
      }

      const items = mapVodList(cfg, filtered, KIND_MAP[realTid] || null);
      let pagecount = items.length > 0 ? curPage + 1 : curPage;
      if (j && typeof j === "object") {
        const pc = parseInt(j.pageCount || j.pagecount || 0, 10);
        if (pc > 0) pagecount = pc;
      }

      return {
        items: items,
        page: curPage,
        totalPages: pagecount,
        hasMore: curPage < pagecount,
      };
    },

    async search(payload) {
      const cfg = getCfg(payload && payload.config);
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10) || 1);
      const kw = String((payload && payload.keyword) || "").trim();
      if (!kw) return { items: [], page: page, totalPages: 1, hasMore: false };
      const j = await apiGet(
        cfg,
        "/api.php/web/search/index",
        { wd: kw, page: String(page) },
        cfg.host + "/search?keyword=" + Host.codec.urlEncode(kw)
      );
      const items = mapVodList(cfg, j, null);
      const hasMore = items.length >= 12;
      return {
        items: items,
        page: page,
        totalPages: hasMore ? page + 1 : page,
        hasMore: hasMore,
      };
    },

    async detail(payload) {
      const cfg = getCfg(payload && payload.config);
      const vid = String((payload && payload.vodId) || "").trim();
      const pair = await Promise.all([
        apiGet(cfg, "/api.php/web/vod/get_detail", { vod_id: vid }, cfg.host + "/play/" + vid),
        getAggregateSources(cfg, vid),
      ]);
      const detailArr = asList(pair[0]);
      let detail = detailArr[0] || null;
      const agg = pair[1] || [];
      if (!detail && agg.length > 0) detail = agg[0];
      if (!detail) return { vodId: vid, title: vid, sources: [] };

      const area = Array.isArray(detail.vod_area) ? detail.vod_area.join(",") : detail.vod_area || "";
      const cls = Array.isArray(detail.vod_class) ? detail.vod_class.join(",") : detail.vod_class || "";
      const typeId = String(detail.type_id || detail.typeId || "");

      return {
        vodId: vid,
        title: cleanText(detail.vod_name || detail.name || "") || vid,
        poster: absPic(cfg.host, detail.vod_pic || detail.pic),
        remark: cleanText(detail.vod_remarks || detail.remarks || "") || null,
        year: parseYear(detail.vod_year),
        region: cleanText(area) || null,
        genres: splitNames(detail.type_name || cls),
        actors: splitNames(detail.vod_actor),
        directors: splitNames(detail.vod_director),
        synopsis: cleanText(detail.vod_content) || null,
        kind: KIND_MAP[typeId] || null,
        sources: buildSources(agg, detail),
      };
    },

    async play(payload) {
      const cfg = getCfg(payload && payload.config);
      const url = String((payload && payload.playData) || "").trim();
      if (!url) {
        Host.raise("INVALID_PLAY_DATA", "empty damahou playData");
      }
      const defaultHeaders = { Referer: cfg.host + "/" };

      if (/^https?:\/\//i.test(url) && isVideoFormat(url)) {
        return {
          streams: [{ label: "默认线路", url: url, userAgent: UA, headers: defaultHeaders }],
        };
      }

      const decodeCandidates = [
        { url: url },
        { play_url: url },
        { vod_url: url },
      ];
      for (var i = 0; i < decodeCandidates.length; i++) {
        const j = await apiGet(cfg, "/api.php/web/decode/url", decodeCandidates[i], cfg.host + "/play");
        const data = j && j.data;
        let finalUrl = "";
        let headers = null;
        if (typeof data === "string") {
          finalUrl = data;
        } else if (data && typeof data === "object") {
          finalUrl = data.url || data.play_url || data.playUrl || data.video || "";
          headers = data.header || data.headers || null;
        } else if (j && typeof j === "object") {
          finalUrl = j.url || j.play_url || "";
          headers = j.header || j.headers || null;
        }
        if (finalUrl) {
          return {
            streams: [
              {
                label: "默认线路",
                url: String(finalUrl),
                userAgent: UA,
                headers: headers && typeof headers === "object" ? headers : defaultHeaders,
              },
            ],
          };
        }
      }

      if (/^https?:\/\//i.test(url)) {
        return {
          streams: [{ label: "默认线路", url: url, userAgent: UA, headers: defaultHeaders }],
        };
      }

      Host.raise("NO_STREAM", "damahou could not resolve stream for " + url);
    },
  };
})();
