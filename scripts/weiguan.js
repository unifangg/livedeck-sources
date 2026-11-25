// Ported from weiguan.py -> LiveDeck script_js (QuickJS Sandbox)
(function () {
  const DEFAULT_HOST = "https://api.drama.9ddm.com";
  const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

  const COMMON_PARAMS = {
    version_code: "1600",
    version_name: "1.6.0",
    device_name: "PJA110",
    device_type: "phone",
    is_first_day: "false",
    is_first_24h: "false",
    app_launch_way: "icon",
    default_homepage: "drama_library",
    device_owning_firm: "OnePlus",
    font_scale: "default",
    os_type: "1",
    clientInfo: "9BBBC7EC6D9045E6BD3B6E6B95A71D9Dd66169e46a7d8de8d766bce0d0e0df57",
  };

  function getHost(config) {
    const raw = (config && (config.host || config.url)) || DEFAULT_HOST;
    return String(raw).trim().replace(/\/+$/, "") || DEFAULT_HOST;
  }

  function cleanText(raw) {
    return String(raw || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }

  function cleanPoster(raw) {
    const s = String(raw || "").trim();
    return s || null;
  }

  function parseYear(raw) {
    const m = /(\d{4})/.exec(String(raw || ""));
    if (!m) return null;
    const n = parseInt(m[1], 10);
    return n >= 1900 && n <= 2100 ? n : null;
  }

  function parseQuality(name) {
    const m = /(\d{3,4})/.exec(String(name || ""));
    if (!m) return null;
    const n = parseInt(m[1], 10);
    return n > 0 ? n : null;
  }

  function formatRemarks(viewCount, episodeCount) {
    const parts = [];
    const vc = Number(viewCount) || 0;
    const ec = Number(episodeCount) || 0;
    if (vc > 0) {
      parts.push(vc >= 10000 ? (vc / 10000).toFixed(1) + "万播放" : vc + "播放");
    }
    if (ec > 0) parts.push(ec + "集");
    return parts.length > 0 ? parts.join(" · ") : null;
  }

  function mapItems(rows) {
    const out = [];
    if (!Array.isArray(rows)) return out;
    for (var i = 0; i < rows.length; i++) {
      const it = rows[i];
      if (!it || !it.oneId || !it.title) continue;
      out.push({
        vodId: String(it.oneId),
        title: String(it.title),
        poster: cleanPoster(it.vertPoster || it.horzPoster),
        remark: formatRemarks(it.viewCount, it.episodeCount),
        year: parseYear(it.publishDate),
        genres: Array.isArray(it.shortPlayTag) ? it.shortPlayTag.map(String).filter(Boolean) : [],
        kind: "series",
      });
    }
    return out;
  }

  async function apiGet(host, path, extraParams) {
    const params = Object.assign({}, COMMON_PARAMS, extraParams || {});
    try {
      const resp = await Host.http.get(host + path, {
        params: params,
        headers: { "User-Agent": UA, "Content-Type": "application/json;charset=utf-8" },
        insecureTls: true,
        timeout: 12,
      });
      return resp && resp.ok ? resp.json() || {} : {};
    } catch (_) {
      return {};
    }
  }

  async function apiPost(host, path, bodyObj) {
    try {
      const resp = await Host.http.post(host + path, undefined, {
        params: COMMON_PARAMS,
        json: bodyObj || {},
        headers: { "User-Agent": UA, "Content-Type": "application/json;charset=utf-8" },
        insecureTls: true,
        timeout: 12,
      });
      return resp && resp.ok ? resp.json() || {} : {};
    } catch (_) {
      return {};
    }
  }

  globalThis.LiveDeckVod = {
    async home(payload) {
      const host = getHost(payload && payload.config);
      const [tagData, listData] = await Promise.all([
        apiGet(host, "/drama/home/shortVideoTags"),
        apiPost(host, "/drama/home/search", {
          audience: "",
          page: 1,
          pageSize: 30,
          searchWord: "",
          subject: "",
        }),
      ]);

      const tags = Array.isArray(tagData.tags) ? tagData.tags : [];
      const audiences = Array.isArray(tagData.audiences) ? tagData.audiences : [];
      const orders =
        Array.isArray(tagData.orders) && tagData.orders.length > 0
          ? tagData.orders
          : ["最热", "最新"];

      const filterGroups = [
        {
          key: "audience",
          name: "受众",
          defaultValue: "",
          options: [{ value: "", label: "全部" }].concat(
            audiences.map(function (a) {
              return { value: String(a), label: String(a) };
            })
          ),
        },
        {
          key: "order",
          name: "排序",
          defaultValue: "",
          options: [{ value: "", label: "全部" }].concat(
            orders.map(function (o) {
              return { value: String(o), label: String(o) };
            })
          ),
        },
      ];

      return {
        categories: tags.map(function (t) {
          return { id: String(t), name: String(t), filters: filterGroups };
        }),
        featured: mapItems(listData.data),
      };
    },

    async category(payload) {
      const host = getHost(payload && payload.config);
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10) || 1);
      const tid = String((payload && payload.categoryId) || "");
      const filters = (payload && payload.filters) || {};
      const order = String(filters.order || "");

      const body = {
        audience: String(filters.audience || ""),
        page: page,
        pageSize: 30,
        searchWord: "",
        subject: tid,
      };
      if (order === "最热") body.order = "hot";
      else if (order === "最新") body.order = "new";

      const data = await apiPost(host, "/drama/home/search", body);
      const items = mapItems(data.data);
      const hasMore = items.length >= 30;
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
      if (!kw) return { items: [], page: 1, totalPages: 1, hasMore: false };

      const data = await apiPost(host, "/drama/home/search", {
        audience: "",
        page: page,
        pageSize: 30,
        searchWord: kw,
        subject: "",
      });
      const items = mapItems(data.data);
      const hasMore = items.length >= 30;
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
      const data = await apiGet(host, "/drama/home/shortVideoDetail", {
        oneId: vid,
        page: "1",
        pageSize: "1000",
      });
      const videoData = Array.isArray(data.data) ? data.data : [];
      if (videoData.length === 0) {
        return { vodId: vid, title: vid, sources: [] };
      }
      const firstEp = videoData[0];

      let description = "";
      let actors = [];
      let genres = [];
      let episodeCount = videoData.length;
      let viewCount = firstEp.collectionCount || 0;
      let poster = cleanPoster(firstEp.vertPoster);

      const sData = await apiPost(host, "/drama/home/search", {
        audience: "",
        page: 1,
        pageSize: 5,
        searchWord: String(firstEp.title || ""),
        subject: "",
      });
      if (Array.isArray(sData.data)) {
        for (var i = 0; i < sData.data.length; i++) {
          const item = sData.data[i];
          if (item && String(item.oneId) === vid) {
            description = cleanText(item.description || "");
            if (Array.isArray(item.actors)) {
              actors = item.actors.map(String).filter(Boolean);
            }
            if (Array.isArray(item.shortPlayTag)) {
              genres = item.shortPlayTag.map(String).filter(Boolean);
            }
            episodeCount = item.episodeCount || episodeCount;
            viewCount = item.viewCount || viewCount;
            if (!poster) poster = cleanPoster(item.vertPoster || item.horzPoster);
            break;
          }
        }
      }

      const actorItems = Array.isArray(data.actorItems) ? data.actorItems : [];
      if (actorItems.length > 0) {
        const blocks = [];
        for (var j = 0; j < actorItems.length; j++) {
          const a = actorItems[j];
          if (!a || !a.name) continue;
          if (actors.indexOf(String(a.name)) === -1) actors.push(String(a.name));
          const lines = [a.name + (a.rolePlayingName ? " 饰演 " + a.rolePlayingName : "")];
          if (a.briefIntroduction) lines.push(String(a.briefIntroduction));
          blocks.push(lines.join("\n"));
        }
        if (blocks.length > 0) {
          description = (description ? description + "\n\n" : "") + "演员信息：\n" + blocks.join("\n\n");
        }
      }

      const episodes = [];
      for (var k = 0; k < videoData.length; k++) {
        const ep = videoData[k];
        if (!ep) continue;
        const idx = ep.playOrder || k + 1;
        const clarity = Array.isArray(ep.videoClarityList) ? ep.videoClarityList : [];
        if (clarity.length === 0) continue;
        episodes.push({
          episodeId: String(ep.episodeOneId || idx),
          name: "第" + idx + "集",
          index: episodes.length,
          playData: JSON.stringify(clarity),
        });
      }

      const parts = [];
      if (viewCount > 0) {
        parts.push(viewCount >= 10000 ? (viewCount / 10000).toFixed(1) + "万播放" : viewCount + "播放");
      }
      if (episodeCount > 0) parts.push("共" + episodeCount + "集");

      return {
        vodId: vid,
        title: String(firstEp.title || vid),
        poster: poster,
        remark: parts.length > 0 ? parts.join(" · ") : null,
        year: parseYear(firstEp.publishDate),
        genres: genres,
        actors: actors,
        directors: [],
        synopsis: description || null,
        kind: "series",
        sources:
          episodes.length > 0
            ? [{ sourceId: "weiguan", name: "围观短剧", episodes: episodes }]
            : [],
      };
    },

    async play(payload) {
      const raw = String((payload && payload.playData) || "").trim();
      const streams = [];
      try {
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          const sorted = list.slice().sort(function (a, b) {
            return (parseQuality(b && b.name) || 0) - (parseQuality(a && a.name) || 0);
          });
          for (var i = 0; i < sorted.length; i++) {
            const it = sorted[i];
            if (!it || !it.url) continue;
            const q = parseQuality(it.name);
            let label = String(it.name || "默认线路");
            if (q === 1080) label = "超清 1080P";
            else if (q === 720) label = "高清 720P";
            else if (q === 480) label = "流畅 480P";
            streams.push({
              label: label,
              quality: q,
              url: String(it.url),
              userAgent: UA,
            });
          }
        }
      } catch (_) {}

      if (streams.length === 0 && /^https?:\/\//i.test(raw)) {
        streams.push({ label: "默认线路", quality: null, url: raw, userAgent: UA });
      }
      if (streams.length === 0) {
        Host.raise("NO_STREAM", "weiguan play failed to resolve stream");
      }
      return { streams: streams };
    },
  };
})();
