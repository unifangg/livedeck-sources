// Ported from xinpianchang.py -> LiveDeck script_js (QuickJS Sandbox)
(function () {
  const SITE_URL = "https://www.xinpianchang.com";
  const MOD_API = "https://mod-api.xinpianchang.com/mod/api/v2/media";
  const DEFAULT_APP_KEY = "61a2f329348b3bf77";
  const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

  const CHANNELS = [
    ["9999", "全球精选"],
    ["1", "广告片"],
    ["16", "宣传片"],
    ["332", "竖屏广告"],
    ["329", "AIGC"],
    ["61", "摄影"],
    ["142", "剪辑二创"],
    ["31", "剧情短片"],
    ["49", "纪录片"],
    ["347", "三维CG"],
    ["69", "二维动画"],
    ["27", "音乐声音"],
    ["76", "视觉探索"],
    ["144", "学习分享"],
    ["315", "校园作品"],
    ["29", "短视频"],
    ["editor", "编辑精选"],
  ];

  const BUILD_ID_KEY = "xpc:buildId";

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
    return s.replace(/^http:\/\//i, "https://");
  }

  function parseYear(raw) {
    const m = /(\d{4})/.exec(String(raw || ""));
    if (!m) return null;
    const n = parseInt(m[1], 10);
    return n >= 1900 && n <= 2100 ? n : null;
  }

  function fmtDuration(sec) {
    const n = parseInt(sec || 0, 10);
    if (!n || n <= 0) return "";
    const m = Math.floor(n / 60);
    const s = n % 60;
    const h = Math.floor(m / 60);
    const mm = m % 60;
    function pad(v) {
      return v < 10 ? "0" + v : String(v);
    }
    return h > 0 ? h + ":" + pad(mm) + ":" + pad(s) : m + ":" + pad(s);
  }

  async function fetchRaw(url) {
    try {
      const resp = await Host.http.get(url, {
        headers: {
          "User-Agent": UA,
          Referer: SITE_URL + "/",
          Accept: "application/json, text/html, */*",
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

  function extractNextData(html) {
    if (!html) return null;
    const m = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i.exec(html);
    if (!m) return null;
    try {
      return JSON.parse(m[1]);
    } catch (_) {
      return null;
    }
  }

  async function ensureBuildId(force) {
    if (!force) {
      const cached = Host.cache.get(BUILD_ID_KEY);
      if (cached) return String(cached);
    }
    const html = await fetchRaw(SITE_URL + "/recommend/editor");
    const nd = extractNextData(html);
    if (nd && nd.buildId) {
      const bid = String(nd.buildId);
      Host.cache.set(BUILD_ID_KEY, bid, 1800);
      return bid;
    }
    return "";
  }

  async function nextJson(path) {
    let bid = await ensureBuildId(false);
    if (!bid) return {};
    const cleanPath = path.startsWith("/") ? path : "/" + path;
    let text = await fetchRaw(SITE_URL + "/_next/data/" + bid + cleanPath);
    if (!text || text.trim().charAt(0) !== "{") {
      bid = await ensureBuildId(true);
      if (!bid) return {};
      text = await fetchRaw(SITE_URL + "/_next/data/" + bid + cleanPath);
    }
    if (!text || text.trim().charAt(0) !== "{") return {};
    try {
      return JSON.parse(text);
    } catch (_) {
      return {};
    }
  }

  function parseItem(item) {
    if (!item || typeof item !== "object") return null;
    const vid = String(item.id || "").trim();
    if (!vid) return null;
    const title = cleanText(item.title || "");
    if (!title) return null;
    const poster = absHttps(item.cover || "");
    const dur = fmtDuration(item.duration);
    const badge = cleanText((item.display_badge && item.display_badge.badge_name) || "");
    const author = cleanText(
      (item.author && item.author.userinfo && item.author.userinfo.username) || ""
    );
    let remark = dur;
    if (badge && remark) remark = badge + " · " + remark;
    else if (badge) remark = badge;
    else if (!remark && author) remark = author;
    return {
      vodId: vid,
      title: title,
      poster: poster,
      remark: remark || null,
      year: parseYear(item.publish_time),
      kind: "other",
    };
  }

  async function fetchProgressive(mediaId, appKey) {
    const key = appKey || DEFAULT_APP_KEY;
    const text = await fetchRaw(
      MOD_API + "/" + Host.codec.urlEncode(String(mediaId)) + "?appKey=" + Host.codec.urlEncode(key)
    );
    if (!text) return [];
    let data = {};
    try {
      data = JSON.parse(text);
    } catch (_) {
      return [];
    }
    const prog = (data.data && data.data.resource && data.data.resource.progressive) || [];
    if (!Array.isArray(prog)) return [];
    return prog
      .slice()
      .sort(function (a, b) {
        return (parseInt((b && (b.height || b.codedHeight)) || 0, 10) || 0) -
          (parseInt((a && (a.height || a.codedHeight)) || 0, 10) || 0);
      });
  }

  async function fetchDetailData(aid) {
    const json = await nextJson("/a" + aid + ".json");
    let detail = (json.pageProps && json.pageProps.detail) || null;
    if (!detail) {
      const html = await fetchRaw(SITE_URL + "/a" + aid);
      const nd = extractNextData(html);
      if (nd && nd.buildId) {
        Host.cache.set(BUILD_ID_KEY, String(nd.buildId), 1800);
      }
      detail = (nd && nd.props && nd.props.pageProps && nd.props.pageProps.detail) || null;
    }
    return detail;
  }

  globalThis.LiveDeckVod = {
    async home() {
      const featured = [];
      const seen = Object.create(null);
      const data = await nextJson("/recommend/editor.json");
      const sections =
        (data.pageProps &&
          data.pageProps.editorRecommendData &&
          data.pageProps.editorRecommendData.section) ||
        [];
      for (var i = 0; i < sections.length; i++) {
        const arts = (sections[i] && sections[i].articles) || [];
        for (var j = 0; j < arts.length; j++) {
          const v = parseItem(arts[j]);
          if (v && !seen[v.vodId]) {
            seen[v.vodId] = true;
            featured.push(v);
            if (featured.length >= 24) break;
          }
        }
        if (featured.length >= 24) break;
      }
      return {
        categories: CHANNELS.map(function (c) {
          return { id: c[0], name: c[1], filters: [] };
        }),
        featured: featured,
      };
    },

    async category(payload) {
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10));
      const tid = String((payload && payload.categoryId) || "9999").trim();
      const items = [];
      const seen = Object.create(null);
      let total = 0;

      if (tid === "editor") {
        const data = await nextJson("/recommend/editor.json");
        const sections =
          (data.pageProps &&
            data.pageProps.editorRecommendData &&
            data.pageProps.editorRecommendData.section) ||
          [];
        for (var i = 0; i < sections.length; i++) {
          const arts = (sections[i] && sections[i].articles) || [];
          for (var j = 0; j < arts.length; j++) {
            const v = parseItem(arts[j]);
            if (v && !seen[v.vodId]) {
              seen[v.vodId] = true;
              items.push(v);
            }
          }
        }
        return { items: items, page: 1, totalPages: 1, hasMore: false };
      }

      let path = "/discover/article-" + tid + "-0.json";
      if (page > 1) path += "?page=" + page;
      const data = await nextJson(path);
      const dad = (data.pageProps && data.pageProps.discoverArticleData) || {};
      const list = Array.isArray(dad.list) ? dad.list : [];
      for (var k = 0; k < list.length; k++) {
        const v = parseItem(list[k]);
        if (v && !seen[v.vodId]) {
          seen[v.vodId] = true;
          items.push(v);
        }
      }
      total = parseInt(dad.total || 0, 10) || 0;
      const totalPages = total > 0 ? Math.max(1, Math.ceil(total / 60)) : items.length >= 40 ? page + 1 : page;
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

      const items = [];
      const seen = Object.create(null);
      let total = 0;

      const html = await fetchRaw(
        SITE_URL + "/search?kw=" + Host.codec.urlEncode(kw) + "&page=" + page
      );
      const nd = extractNextData(html);
      const sd = (nd && nd.props && nd.props.pageProps && nd.props.pageProps.searchData) || {};
      const list = Array.isArray(sd.list) ? sd.list : [];
      for (var i = 0; i < list.length; i++) {
        const v = parseItem(list[i]);
        if (v && !seen[v.vodId]) {
          seen[v.vodId] = true;
          items.push(v);
        }
      }
      total = parseInt(sd.total || 0, 10) || 0;
      const perPage = parseInt(sd.perPage || 50, 10) || 50;
      const totalPages = total > 0 ? Math.max(1, Math.ceil(total / perPage)) : items.length >= 20 ? page + 1 : page;
      return {
        items: items,
        page: page,
        totalPages: totalPages,
        hasMore: page < totalPages,
      };
    },

    async detail(payload) {
      const raw = String((payload && payload.vodId) || "").trim();
      const aid = raw.replace(/\D+/g, "") || raw;
      const detail = await fetchDetailData(aid);
      if (!detail) {
        return { vodId: aid, title: "作品 " + aid, actors: [], directors: [], sources: [] };
      }

      const videoMeta = detail.video || {};
      const mediaId = String(
        videoMeta.vid || detail.media_id || detail.video_library_id || ""
      ).trim();
      const appKey = String(videoMeta.appKey || DEFAULT_APP_KEY).trim();
      const dur = parseInt(detail.duration || 0, 10);

      const cats = Array.isArray(detail.categories) ? detail.categories : [];
      const genres = [];
      for (var i = 0; i < cats.length && i < 6; i++) {
        const g = typeof cats[i] === "string" ? cats[i] : cats[i] && cats[i].name;
        if (g) genres.push(cleanText(g));
      }
      const author = cleanText(
        (detail.author && detail.author.userinfo && detail.author.userinfo.username) || ""
      );

      const episodes = mediaId
        ? [
            {
              episodeId: mediaId,
              name: "正片",
              index: 0,
              playData: mediaId + "@" + appKey,
              durationSec: dur > 0 ? dur : null,
            },
          ]
        : [
            {
              episodeId: aid,
              name: "正片",
              index: 0,
              playData: "aid:" + aid,
              durationSec: dur > 0 ? dur : null,
            },
          ];

      return {
        vodId: aid,
        title: cleanText(detail.title || "") || "作品 " + aid,
        poster: absHttps(detail.cover || ""),
        remark: fmtDuration(dur) || null,
        year: parseYear(detail.publish_time),
        genres: genres,
        actors: author ? [author] : [],
        directors: [],
        synopsis: cleanText(detail.content || detail.description || "").slice(0, 800) || null,
        kind: "other",
        sources: [{ sourceId: "xpc", name: "新片场", episodes: episodes }],
      };
    },

    async play(payload) {
      const raw = String((payload && payload.playData) || "").trim();
      const headers = { Referer: SITE_URL + "/", Origin: SITE_URL };
      if (/^https?:\/\//i.test(raw) && /\.(mp4|m3u8)(\?|$)/i.test(raw)) {
        return {
          streams: [
            {
              label: "默认线路",
              quality: null,
              url: raw,
              userAgent: UA,
              headers: headers,
            },
          ],
        };
      }

      let mediaId = "";
      let appKey = DEFAULT_APP_KEY;
      if (raw.startsWith("aid:")) {
        const aid = raw.slice(4).replace(/\D+/g, "");
        const detail = await fetchDetailData(aid);
        const vm = (detail && detail.video) || {};
        mediaId = String(vm.vid || (detail && detail.media_id) || "").trim();
        if (vm.appKey) appKey = String(vm.appKey);
      } else if (raw.indexOf("@") >= 0) {
        const parts = raw.split("@");
        mediaId = parts[0].trim();
        appKey = parts[1].trim() || DEFAULT_APP_KEY;
      } else {
        const aid = raw.replace(/\D+/g, "");
        if (aid) {
          const detail = await fetchDetailData(aid);
          const vm = (detail && detail.video) || {};
          mediaId = String(vm.vid || (detail && detail.media_id) || "").trim();
          if (vm.appKey) appKey = String(vm.appKey);
        }
      }

      if (!mediaId) {
        Host.raise("NO_STREAM", "xinpianchang missing mediaId for " + raw);
      }

      const prog = await fetchProgressive(mediaId, appKey);
      const streams = [];
      const seen = Object.create(null);
      for (var i = 0; i < prog.length; i++) {
        const p = prog[i];
        const u = absHttps((p && (p.url || p.backupUrl)) || "");
        if (!u || seen[u]) continue;
        seen[u] = true;
        const h = parseInt(p.height || p.codedHeight || 0, 10);
        const label = cleanText(p.profile || p.quality || (h > 0 ? h + "P" : "")) || "默认";
        streams.push({
          label: label,
          quality: h > 0 ? h : null,
          url: u,
          userAgent: UA,
          headers: headers,
        });
      }

      if (streams.length === 0) {
        Host.raise("NO_STREAM", "xinpianchang returned no progressive streams for " + mediaId);
      }
      return { streams: streams };
    },
  };
})();
