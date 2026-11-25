// Ported from netease_pd.py -> LiveDeck script_js (QuickJS Sandbox)
(function () {
  const SITE_URL = "https://public.163.com";
  const HALL_URL = "https://wp.m.163.com/163/html/newsapp/time-hall/index.html";
  const API_HOST = "https://active.163.com";
  const VIDEO_API = "https://so.v.163.com/mobile/getBatchOnlineVideo.do";
  const LIST_API = API_HOST + "/service/form/v1/9347/view/1618.jsonp";
  const ENTRY_API = API_HOST + "/service/form/v1/9347/";
  const SEARCH_API = API_HOST + "/service/form/v1/9347/view/1619.jsonp";
  const READ_API = API_HOST + "/service/form/v1/9344/view/1624.jsonp";
  const PAGE_SIZE = 20;
  const UA =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";

  const CHANNELS = [
    ["movie", "电影", "movie"],
    ["doc", "纪录片", "documentary"],
    ["ani", "动画片", "anime"],
    ["his", "珍贵史料", "documentary"],
    ["daily", "每日精读", "other"],
  ];

  const KIND_MAP = {
    movie: "movie",
    doc: "documentary",
    ani: "anime",
    his: "documentary",
    daily: "other",
  };

  function cleanText(raw) {
    return String(raw || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/\s+/g, " ")
      .trim();
  }

  function absHttps(u) {
    const s = String(u || "").trim();
    if (!s) return null;
    if (s.startsWith("//")) return "https:" + s;
    if (s.startsWith("/")) return SITE_URL + s;
    return s.replace(/^http:\/\//i, "https://");
  }

  function parseYear(raw) {
    const m = /(\d{4})/.exec(String(raw || ""));
    if (!m) return null;
    const n = parseInt(m[1], 10);
    return n >= 1900 && n <= 2100 ? n : null;
  }

  function splitNames(raw) {
    return cleanText(raw)
      .split(/[,，/]+/)
      .map(function (s) {
        return s.trim();
      })
      .filter(Boolean);
  }

  async function fetchText(url, params) {
    try {
      const resp = await Host.http.get(url, {
        params: params || undefined,
        headers: {
          "User-Agent": UA,
          Referer: SITE_URL + "/",
          Accept: "text/html,application/json,application/xhtml+xml;q=0.9,*/*;q=0.8",
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

  async function fetchJsonp(url, params) {
    const q = Object.assign({ callback: "cb" }, params || {});
    const text = (await fetchText(url, q)).trim();
    if (!text) return {};
    const m = /^[a-zA-Z0-9_]+\s*\(\s*([\s\S]*)\s*\)\s*;?\s*$/.exec(text);
    if (m) {
      try {
        return JSON.parse(m[1]);
      } catch (_) {}
    }
    try {
      return JSON.parse(text);
    } catch (_) {
      const m2 = /(\{[\s\S]+\}|\[[\s\S]+\])/.exec(text);
      if (m2) {
        try {
          return JSON.parse(m2[1]);
        } catch (_) {}
      }
    }
    return {};
  }

  function mapItem(it, defaultKind) {
    if (!it || typeof it !== "object") return null;
    const vid = String(it.id || it.vid || "").trim();
    const name = cleanText(it.title || it.media_name || it.name || "");
    if (!vid && !name) return null;
    const pic = absHttps(it.cover_pic || it.cover || it.img || it.imgpath || "");
    const year = parseYear(it.release_date);
    const length = cleanText(it.film_length || "");
    const area = cleanText(it.made_area || "");
    const parts = [];
    if (year) parts.push(String(year));
    if (area) parts.push(area);
    if (length) parts.push(length);
    const remark = parts.length > 0 ? parts.join(" / ") : cleanText(it.meida_type || it.entry_kinds || "") || "公版";
    const ek = String(it.entry_kinds || "").toLowerCase();
    return {
      vodId: vid || name,
      title: name || vid,
      poster: pic,
      remark: remark,
      year: year,
      region: area || null,
      kind: KIND_MAP[ek] || defaultKind || null,
    };
  }

  function mapDaily(it) {
    if (!it || typeof it !== "object") return null;
    const mid = String(it.media_id || "").trim();
    const tid = String(it.id || mid || "").trim();
    if (!tid) return null;
    const text = cleanText(it.text || "");
    const name = text ? text.slice(0, 40) + (text.length > 40 ? "…" : "") : tid;
    const date = cleanText(it.date || "");
    return {
      vodId: "daily_" + tid + (mid ? "_" + mid : ""),
      title: name || date || tid,
      poster: null,
      remark: date || "每日精读",
      year: parseYear(date),
      kind: "other",
    };
  }

  async function resolveVideoStreams(vid) {
    if (!vid) return [];
    const text = await fetchText(VIDEO_API, { vidstr: String(vid) });
    if (!text) return [];
    let data = {};
    try {
      data = JSON.parse(text);
    } catch (_) {
      return [];
    }
    if (String(data.errString || "") !== "success" && String(data.retCode) !== "0") {
      return [];
    }
    const vlist = (data.data && data.data.video_list) || [];
    if (!Array.isArray(vlist) || vlist.length === 0) return [];
    const item = vlist[0] || {};
    const vd = item.video_data || {};
    const candidates = [
      ["m3u8ShdUrl", "超清 HLS", 1080],
      ["m3u8HdUrl", "高清 HLS", 720],
      ["m3u8SdUrl", "标清 HLS", 480],
      ["mp4ShdUrl", "超清 MP4", 1080],
      ["mp4HdUrl", "高清 MP4", 720],
      ["mp4SdUrl", "标清 MP4", 480],
      ["hdUrl", "高清", 720],
      ["sdUrl", "标清", 480],
    ];
    const streams = [];
    const seen = Object.create(null);
    const headers = { Referer: SITE_URL + "/", Origin: SITE_URL };
    for (var i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      const u = absHttps(item[c[0]]);
      if (!u || !/^https?:\/\//i.test(u) || seen[u]) continue;
      seen[u] = true;
      streams.push({
        label: c[1],
        quality: c[2],
        url: u,
        userAgent: UA,
        headers: headers,
      });
    }
    const vdCands = [
      ["hd_url", "高清", 720],
      ["sd_url", "标清", 480],
    ];
    for (var j = 0; j < vdCands.length; j++) {
      const vc = vdCands[j];
      const u = absHttps(vd[vc[0]]);
      if (!u || !/^https?:\/\//i.test(u) || seen[u]) continue;
      seen[u] = true;
      streams.push({
        label: vc[1],
        quality: vc[2],
        url: u,
        userAgent: UA,
        headers: headers,
      });
    }
    return streams;
  }

  function computeTotalPages(paging, page, count) {
    const p = paging || {};
    const total = parseInt(p.total || 0, 10) || 0;
    const nextP = parseInt(p.nextPage || 0, 10) || 0;
    if (nextP > page) return nextP;
    if (total > 0) return Math.max(1, Math.ceil(total / PAGE_SIZE));
    return count >= PAGE_SIZE ? page + 1 : page;
  }

  globalThis.LiveDeckVod = {
    async home() {
      const data = await fetchJsonp(LIST_API, {
        param_entry_kinds: "movie",
        page: "1",
        pageSize: "24",
      });
      const list = Array.isArray(data.list) ? data.list : [];
      const featured = [];
      for (var i = 0; i < list.length; i++) {
        const v = mapItem(list[i], "movie");
        if (v) featured.push(v);
      }
      return {
        categories: CHANNELS.map(function (c) {
          return { id: c[0], name: c[1], filters: [] };
        }),
        featured: featured.slice(0, 24),
      };
    },

    async category(payload) {
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10));
      const tid = String((payload && payload.categoryId) || "movie").trim();
      const items = [];
      let paging = {};
      if (tid === "daily") {
        const data = await fetchJsonp(READ_API, {
          page: String(page),
          pageSize: String(PAGE_SIZE),
        });
        const list = Array.isArray(data.list) ? data.list : [];
        for (var i = 0; i < list.length; i++) {
          const v = mapDaily(list[i]);
          if (v) items.push(v);
        }
        paging = data.paging || {};
      } else {
        const kind = KIND_MAP[tid] || "movie";
        const kindsParam = KIND_MAP[tid] ? tid : "movie";
        const data = await fetchJsonp(LIST_API, {
          param_entry_kinds: kindsParam,
          page: String(page),
          pageSize: String(PAGE_SIZE),
        });
        const list = Array.isArray(data.list) ? data.list : [];
        for (var j = 0; j < list.length; j++) {
          const v = mapItem(list[j], kind);
          if (v) items.push(v);
        }
        paging = data.paging || {};
      }
      const totalPages = computeTotalPages(paging, page, items.length);
      return {
        items: items,
        page: page,
        totalPages: totalPages,
        hasMore: page < totalPages,
      };
    },

    async search(payload) {
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10));
      const kw = String((payload && payload.keyword) || "").trim();
      if (!kw) return { items: [], page: page, totalPages: 1, hasMore: false };
      const data = await fetchJsonp(SEARCH_API, {
        param_title: kw,
        page: String(page),
        pageSize: String(PAGE_SIZE),
        _charset: "UTF-8",
        _decode: "UTF-8",
      });
      const list = Array.isArray(data.list) ? data.list : [];
      const items = [];
      for (var i = 0; i < list.length; i++) {
        const v = mapItem(list[i], null);
        if (v) items.push(v);
      }
      const totalPages = computeTotalPages(data.paging, page, items.length);
      return {
        items: items,
        page: page,
        totalPages: totalPages,
        hasMore: page < totalPages,
      };
    },

    async detail(payload) {
      const raw = String((payload && payload.vodId) || "").trim();
      if (raw.startsWith("daily_")) {
        const parts = raw.split("_");
        const mediaId = parts.length >= 3 ? parts[parts.length - 1] : "";
        const eps =
          mediaId && mediaId.startsWith("V")
            ? [{ episodeId: mediaId, name: "播放", index: 0, playData: "vid:" + mediaId }]
            : [];
        return {
          vodId: raw,
          title: "每日精读",
          poster: null,
          remark: "每日精读",
          actors: [],
          directors: [],
          synopsis: "网易公版每日精读。",
          kind: "other",
          sources: eps.length > 0 ? [{ sourceId: "netease", name: "网易公版", episodes: eps }] : [],
        };
      }

      let name = raw;
      let poster = null;
      let synopsis = null;
      let remark = "公版影像";
      let year = null;
      let region = null;
      let genres = [];
      let actors = [];
      let directors = [];
      let kind = null;
      let playData = "";

      if (/^\d+$/.test(raw)) {
        const data = await fetchJsonp(ENTRY_API + raw + ".jsonp");
        const it = data.value || data;
        if (it && typeof it === "object" && it.title) {
          name = cleanText(it.title) || name;
          poster = absHttps(it.cover_pic || "");
          synopsis = cleanText(it.desc || "") || null;
          directors = splitNames(it.director);
          actors = splitNames(it.protagonist);
          year = parseYear(it.release_date);
          region = cleanText(it.made_area || "") || null;
          const mtype = cleanText(it.meida_type || "");
          if (mtype) genres = [mtype];
          const length = cleanText(it.film_length || "");
          const rParts = [];
          if (year) rParts.push(String(year));
          if (region) rParts.push(region);
          if (length) rParts.push(length);
          if (mtype) rParts.push(mtype);
          if (rParts.length > 0) remark = rParts.join(" / ");
          kind = KIND_MAP[String(it.entry_kinds || "").toLowerCase()] || null;
          if (it.vid) {
            playData = "vid:" + String(it.vid).trim();
          } else if (it.url) {
            playData = String(it.url).trim();
          }
        }
      } else {
        const pageUrl = /^https?:\/\//i.test(raw) ? raw : HALL_URL;
        playData = pageUrl;
      }

      const episodes = playData
        ? [{ episodeId: "1", name: "正片", index: 0, playData: playData }]
        : [];

      return {
        vodId: raw,
        title: name,
        poster: poster,
        remark: remark,
        year: year,
        region: region,
        genres: genres,
        actors: actors,
        directors: directors,
        synopsis: synopsis || "网易公版影像典藏。",
        kind: kind,
        sources: episodes.length > 0 ? [{ sourceId: "netease", name: "网易公版", episodes: episodes }] : [],
      };
    },

    async play(payload) {
      let raw = String((payload && payload.playData) || "").trim();
      const headers = { Referer: SITE_URL + "/", Origin: SITE_URL };

      if (raw.startsWith("vid:")) {
        const streams = await resolveVideoStreams(raw.slice(4).trim());
        if (streams.length === 0) {
          Host.raise("NO_STREAM", "netease_pd no playable stream for " + raw);
        }
        return { streams: streams };
      }

      if (/^V[A-Z0-9]+$/.test(raw)) {
        const streams = await resolveVideoStreams(raw);
        if (streams.length > 0) return { streams: streams };
      }

      if (/^https?:\/\//i.test(raw) && /\.(mp4|m3u8|flv|mpd)(\?|$)/i.test(raw)) {
        return {
          streams: [
            {
              label: "默认线路",
              quality: null,
              url: raw.replace(/^http:\/\//i, "https://"),
              userAgent: UA,
              headers: headers,
            },
          ],
        };
      }

      if (raw.startsWith("/")) raw = SITE_URL + raw;
      if (/^https?:\/\//i.test(raw) && raw.indexOf("163.com") >= 0) {
        const html = await fetchText(raw);
        const m = /https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4|flv)[^\s"'<>]*/i.exec(html);
        if (m) {
          return {
            streams: [
              {
                label: "默认线路",
                quality: null,
                url: m[0].replace(/\\\//g, "/").replace(/^http:\/\//i, "https://"),
                userAgent: UA,
                headers: headers,
              },
            ],
          };
        }
      }

      Host.raise("NO_STREAM", "netease_pd could not extract direct stream for " + raw);
    },
  };
})();
