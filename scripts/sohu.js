// Ported from sohu.py -> LiveDeck script_js (QuickJS Sandbox)
(function () {
  const SITE_URL = "https://tv.sohu.com";
  const API_URL = "https://api.tv.sohu.com";
  const M_API_URL = "https://m.tv.sohu.com";
  const SEARCH_WEB = "https://so.tv.sohu.com";
  const UA =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";

  const CHANNELS = [
    ["1", "电影", "movie"],
    ["2", "电视剧", "series"],
    ["7", "综艺", "variety"],
    ["16", "动漫", "anime"],
    ["8", "纪录片", "documentary"],
    ["21", "教育", "other"],
  ];

  const KIND_MAP = {
    "1": "movie",
    "2": "series",
    "7": "variety",
    "16": "anime",
    "8": "documentary",
    "21": "other",
  };

  const ORDER_FILTER = {
    key: "o",
    name: "排序",
    defaultValue: "1",
    options: [
      { value: "1", label: "相关" },
      { value: "3", label: "最新" },
      { value: "2", label: "最热" },
    ],
  };

  const QUALITY_MAP = {
    sup: { label: "超清", quality: 1080 },
    ori: { label: "原画", quality: 1080 },
    hig: { label: "高清", quality: 720 },
    nor: { label: "标清", quality: 480 },
  };

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
    return cleanText(raw)
      .split(/[,，/\s]+/)
      .map(function (s) {
        return s.trim();
      })
      .filter(Boolean);
  }

  function absHttps(u) {
    const s = String(u || "").trim();
    if (!s) return null;
    if (s.startsWith("//")) return "https:" + s;
    return s.replace(/^http:\/\//i, "https://");
  }

  async function fetchJson(url, params, extraHeaders) {
    try {
      const resp = await Host.http.get(url, {
        params: params || undefined,
        headers: Object.assign(
          {
            "User-Agent": UA,
            Referer: SITE_URL + "/",
            Accept: "application/json, text/plain, */*",
            "Accept-Language": "zh-CN,zh;q=0.9",
          },
          extraHeaders || {}
        ),
        insecureTls: true,
        timeout: 15,
      });
      if (!resp || !resp.ok) return {};
      const data = resp.json();
      return data && typeof data === "object" ? data : {};
    } catch (_) {
      return {};
    }
  }

  async function fetchText(url) {
    try {
      const resp = await Host.http.get(url, {
        headers: {
          "User-Agent": UA,
          Referer: SITE_URL + "/",
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

  function parseAlbum(item, defaultKind) {
    if (!item || typeof item !== "object") return null;
    const aid = String(item.aid || item.album_id || "").trim();
    if (!aid) return null;
    const title = cleanText(item.album_name || item.video_name || aid);
    if (!title) return null;
    const pic = absHttps(
      item.ver_high_pic ||
        item.hor_high_pic ||
        item.ver_big_pic ||
        item.hor_w16_pic ||
        ""
    );
    const remark =
      cleanText(item.tip || item.update_notification || item.album_sub_name || "") || null;
    const cidKey = String(item.cid || "");
    return {
      vodId: aid,
      title: title,
      poster: pic,
      remark: remark,
      year: parseYear(item.year),
      region: cleanText(item.area || "") || null,
      kind: KIND_MAP[cidKey] || defaultKind || null,
    };
  }

  async function resolveStreams(vid) {
    const streams = [];
    const seen = Object.create(null);
    const playHeaders = { Referer: SITE_URL + "/", Origin: SITE_URL };

    const data = await fetchJson(
      M_API_URL + "/phone_playinfo",
      { vid: String(vid) },
      { Referer: M_API_URL + "/", Accept: "application/json" }
    );
    const body = data.data || data || {};
    const urls = body.urls || {};

    function addGroup(group, fmtLabel) {
      if (!group || typeof group !== "object") return;
      const keys = ["sup", "ori", "hig", "nor"];
      for (var i = 0; i < keys.length; i++) {
        const qk = keys[i];
        const lst = group[qk];
        if (!Array.isArray(lst) || !lst.length) continue;
        const rawUrl = String(lst[0] || "").trim();
        if (!/^https?:\/\//i.test(rawUrl)) continue;
        const u = rawUrl.replace(/^http:\/\//i, "https://");
        if (seen[u]) continue;
        seen[u] = true;
        const meta = QUALITY_MAP[qk];
        streams.push({
          label: meta.label + " " + fmtLabel,
          quality: meta.quality,
          url: u,
          userAgent: UA,
          headers: playHeaders,
        });
      }
    }

    addGroup(urls.mp4, "MP4");
    addGroup(urls.m3u8, "HLS");

    if (streams.length === 0) {
      const infoRes = await fetchJson(API_URL + "/v4/video/info/" + vid + ".json");
      const info = infoRes.data || {};
      const fallbackKeys = [
        ["url_super", "超清", 1080],
        ["url_super_265", "超清HEVC", 1080],
        ["url_high", "高清", 720],
        ["url_high_265", "高清HEVC", 720],
        ["url_original", "原画", 1080],
        ["url_nor", "标清", 480],
        ["url_blue", "蓝光", 1080],
      ];
      for (var j = 0; j < fallbackKeys.length; j++) {
        const fk = fallbackKeys[j];
        const raw = String(info[fk[0]] || "").trim();
        if (!/^https?:\/\//i.test(raw)) continue;
        const u = raw.replace(/^http:\/\//i, "https://");
        if (seen[u]) continue;
        seen[u] = true;
        streams.push({
          label: fk[1],
          quality: fk[2],
          url: u,
          userAgent: UA,
          headers: playHeaders,
        });
      }
    }

    return streams;
  }

  globalThis.LiveDeckVod = {
    async home() {
      const featured = [];
      const seen = Object.create(null);
      const reqs = ["1", "2", "7"].map(function (cid) {
        return {
          url: API_URL + "/v4/search/channel.json",
          method: "GET",
          params: { cid: cid, page: "1", page_size: "8" },
          headers: {
            "User-Agent": UA,
            Referer: SITE_URL + "/",
            Accept: "application/json, text/plain, */*",
          },
          insecureTls: true,
          timeout: 15,
        };
      });
      try {
        const results = await Host.http.batch(reqs, 3);
        for (var i = 0; i < results.length; i++) {
          const r = results[i];
          if (!r || !r.ok || !r.response) continue;
          let json = {};
          try {
            json = r.response.json() || {};
          } catch (_) {}
          const list = (json.data && json.data.videos) || [];
          const kind = CHANNELS[i][2];
          for (var j = 0; j < list.length && j < 8; j++) {
            const v = parseAlbum(list[j], kind);
            if (v && !seen[v.vodId]) {
              seen[v.vodId] = true;
              featured.push(v);
            }
          }
        }
      } catch (_) {}

      return {
        categories: CHANNELS.map(function (c) {
          return {
            id: c[0],
            name: c[1],
            filters: [ORDER_FILTER],
          };
        }),
        featured: featured.slice(0, 24),
      };
    },

    async category(payload) {
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10));
      const cid = String((payload && payload.categoryId) || "1").trim();
      const o = String((payload && payload.filters && payload.filters.o) || "1").trim() || "1";
      const data = await fetchJson(API_URL + "/v4/search/channel.json", {
        cid: cid,
        page: String(page),
        page_size: "24",
        o: o,
      });
      const body = data.data || {};
      const list = Array.isArray(body.videos) ? body.videos : [];
      const items = [];
      const defaultKind = KIND_MAP[cid] || null;
      for (var i = 0; i < list.length; i++) {
        const v = parseAlbum(list[i], defaultKind);
        if (v) items.push(v);
      }
      const total = parseInt(body.count || 0, 10) || 0;
      const totalPages = total > 0 ? Math.min(400, Math.max(1, Math.ceil(total / 24))) : items.length >= 24 ? page + 1 : page;
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

      if (/^\d{5,}$/.test(kw) && page === 1) {
        const infoRes = await fetchJson(API_URL + "/v4/album/info/" + kw + ".json");
        const info = infoRes.data || {};
        if (info.aid || info.album_name) {
          const v = parseAlbum(info, null);
          if (v) return { items: [v], page: 1, totalPages: 1, hasMore: false };
        }
      }

      const items = [];
      const seen = Object.create(null);
      const paths = ["/v4/search/video.json", "/v4/search/album.json"];
      for (var p = 0; p < paths.length; p++) {
        const data = await fetchJson(API_URL + paths[p], {
          key: kw,
          keyword: kw,
          page: String(page),
          page_size: "20",
        });
        const body = data.data || {};
        const rows = body.videos || body.albums || [];
        if (Array.isArray(rows) && rows.length > 0) {
          for (var i = 0; i < rows.length; i++) {
            const v = parseAlbum(rows[i], null);
            if (v && !seen[v.vodId]) {
              seen[v.vodId] = true;
              items.push(v);
            }
          }
          break;
        }
      }

      if (items.length === 0) {
        const html = await fetchText(SEARCH_WEB + "/mts?wd=" + Host.codec.urlEncode(kw) + "&c=0");
        const re = /\/album\/(\d+)\.html[^>]*title="([^"]+)"/g;
        let m;
        while ((m = re.exec(html)) !== null) {
          if (seen[m[1]]) continue;
          seen[m[1]] = true;
          const t = cleanText(m[2]);
          if (t) {
            items.push({
              vodId: m[1],
              title: t,
              poster: null,
              remark: null,
            });
          }
        }
      }

      const hasMore = items.length >= 20;
      return {
        items: items,
        page: page,
        totalPages: hasMore ? page + 1 : page,
        hasMore: hasMore,
      };
    },

    async detail(payload) {
      const raw = String((payload && payload.vodId) || "").trim();
      const aid = raw.split("_")[0].replace(/\D+/g, "") || raw;
      const infoRes = await fetchJson(API_URL + "/v4/album/info/" + aid + ".json");
      const info = infoRes.data || {};

      const episodes = [];
      const seenVid = Object.create(null);
      let page = 1;
      while (page <= 30) {
        const vRes = await fetchJson(API_URL + "/v4/album/videos/" + aid + ".json", {
          page: String(page),
          page_size: "50",
        });
        const part = (vRes.data && vRes.data.videos) || [];
        if (!Array.isArray(part) || part.length === 0) break;
        for (var i = 0; i < part.length; i++) {
          const ep = part[i];
          const vid = String((ep && ep.vid) || "").trim();
          if (!vid || seenVid[vid]) continue;
          seenVid[vid] = true;
          const epName =
            cleanText(ep.albumVideoShowName || ep.video_name || "") ||
            "第" + (episodes.length + 1) + "集";
          const dur = parseInt(ep.total_duration || ep.play_length || 0, 10);
          episodes.push({
            episodeId: vid,
            name: epName,
            index: episodes.length,
            playData: "vid:" + vid,
            durationSec: dur > 0 ? dur : null,
          });
        }
        if (part.length < 50) break;
        page += 1;
      }

      if (episodes.length === 0) {
        episodes.push({
          episodeId: "aid-" + aid,
          name: "正片",
          index: 0,
          playData: "aid:" + aid,
          durationSec: null,
        });
      }

      const cidKey = String(info.cid || "");
      return {
        vodId: aid,
        title: cleanText(info.album_name || info.video_name || "") || "搜狐视频 " + aid,
        poster: absHttps(info.ver_high_pic || info.hor_high_pic || ""),
        remark: cleanText(info.tip || info.update_notification || "") || null,
        year: parseYear(info.year),
        region: cleanText(info.area || "") || null,
        genres: info.second_cate_name ? splitNames(info.second_cate_name) : [],
        actors: splitNames(info.actor),
        directors: splitNames(info.director),
        synopsis: cleanText(info.album_desc || "").slice(0, 800) || null,
        kind: KIND_MAP[cidKey] || null,
        sources: [{ sourceId: "sohu", name: "搜狐视频", episodes: episodes }],
      };
    },

    async play(payload) {
      const raw = String((payload && payload.playData) || "").trim();
      const playHeaders = { Referer: SITE_URL + "/", Origin: SITE_URL };
      if (/^https?:\/\//i.test(raw) && /\.(m3u8|mp4)(\?|$)/i.test(raw)) {
        return {
          streams: [
            {
              label: "默认线路",
              quality: null,
              url: raw.replace(/^http:\/\//i, "https://"),
              userAgent: UA,
              headers: playHeaders,
            },
          ],
        };
      }

      let vid = "";
      if (raw.startsWith("vid:")) {
        vid = raw.slice(4).trim();
      } else if (raw.startsWith("aid:")) {
        const aid = raw.slice(4).trim();
        const vRes = await fetchJson(API_URL + "/v4/album/videos/" + aid + ".json", {
          page: "1",
          page_size: "1",
        });
        const vs = (vRes.data && vRes.data.videos) || [];
        if (vs.length > 0 && vs[0].vid) vid = String(vs[0].vid);
      } else if (/^\d+$/.test(raw)) {
        vid = raw;
      }

      if (!vid) {
        Host.raise("INVALID_PLAY_DATA", "sohu missing vid for playData: " + raw);
      }

      const streams = await resolveStreams(vid);
      if (streams.length === 0) {
        Host.raise("NO_STREAM", "sohu could not resolve playable stream for vid=" + vid);
      }
      return { streams: streams };
    },
  };
})();
