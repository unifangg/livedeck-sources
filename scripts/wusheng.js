// Ported from wusheng.py -> LiveDeck script_js (QuickJS Sandbox)
(function () {
  const DEFAULT_HOST = "http://read.api.duodutek.com";
  const UA =
    "Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/50.0.2661.87 Safari/537.36";

  const APP_PARAMS = {
    productId: "2a8c14d1-72e7-498b-af23-381028eb47c0",
    vestId: "2be070e0-c824-4d0e-a67a-8f688890cadb",
    channel: "oppo19",
    osType: "android",
    version: "20",
    token: "202509271001001446030204698626",
  };

  const CATEGORIES = [
    { id: "1287", name: "甜宠" },
    { id: "1288", name: "逆袭" },
    { id: "1289", name: "热血" },
    { id: "1290", name: "现代" },
    { id: "1291", name: "古代" },
  ];

  function getHost(config) {
    const raw = (config && config.host) || DEFAULT_HOST;
    return String(raw).trim().replace(/\/+$/, "") || DEFAULT_HOST;
  }

  function cleanText(raw) {
    return String(raw || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/\s+/g, " ")
      .trim();
  }

  async function apiGet(host, path, params) {
    try {
      const resp = await Host.http.get(host + path, {
        params: Object.assign({}, APP_PARAMS, params || {}),
        headers: { "User-Agent": UA },
        insecureTls: true,
        timeout: 15,
      });
      if (!resp || !resp.ok) return null;
      return resp.json();
    } catch (_) {
      return null;
    }
  }

  function mapItems(datalist) {
    const out = [];
    if (!Array.isArray(datalist)) return out;
    for (var i = 0; i < datalist.length; i++) {
      const vod = datalist[i];
      if (!vod || !vod.id || !vod.name) continue;
      const vid = String(vod.id);
      const title = cleanText(vod.name);
      const pic = String(vod.icon || "").trim() || null;
      const heat = vod.heat != null ? String(vod.heat) + "万播放" : "";
      const intro = cleanText(vod.introduction || "");
      Host.cache.set(
        "wusheng:meta:" + vid,
        { title: title, poster: pic, remark: heat || null, synopsis: intro || null },
        3600
      );
      out.push({
        vodId: vid,
        title: title,
        poster: pic,
        remark: heat || null,
        kind: "series",
      });
    }
    return out;
  }

  async function fetchCategory(host, cid, page) {
    const data = await apiGet(host, "/novel-api/app/pageModel/getResourceById", {
      resourceId: String(cid),
      pageNum: String(page),
      pageSize: "10",
    });
    const list = (data && data.data && data.data.datalist) || [];
    const items = mapItems(list);
    const hasMore = items.length >= 10;
    return {
      items: items,
      page: page,
      totalPages: hasMore ? page + 1 : page,
      hasMore: hasMore,
    };
  }

  globalThis.LiveDeckVod = {
    async home(payload) {
      const host = getHost(payload && payload.config);
      const res = await fetchCategory(host, "1287", 1);
      return {
        categories: CATEGORIES.map(function (c) {
          return { id: c.id, name: c.name, filters: [] };
        }),
        featured: res.items,
      };
    },

    async category(payload) {
      const host = getHost(payload && payload.config);
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10) || 1);
      const cid = String((payload && payload.categoryId) || "1287").trim();
      return fetchCategory(host, cid, page);
    },

    async search(payload) {
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10) || 1);
      return { items: [], page: page, totalPages: 1, hasMore: false };
    },

    async detail(payload) {
      const host = getHost(payload && payload.config);
      const raw = String((payload && payload.vodId) || "").trim();
      const parts = raw.split("@");
      const vid = parts[0];
      if (!vid) return { vodId: "", title: "", sources: [] };

      const cached = Host.cache.get("wusheng:meta:" + vid) || {};
      const res = await apiGet(host, "/novel-api/basedata/book/getChapterList", {
        bookId: vid,
      });
      const list = (res && Array.isArray(res.data)) ? res.data : [];
      const episodes = [];
      let fallbackPoster = null;

      for (var i = 0; i < list.length; i++) {
        const ch = list[i];
        if (!ch) continue;
        if (!fallbackPoster && ch.iconUrl) {
          fallbackPoster = String(ch.iconUrl).trim() || null;
        }
        const sp =
          ch.shortPlayList &&
          ch.shortPlayList[0] &&
          ch.shortPlayList[0].chapterShortPlayVoList &&
          ch.shortPlayList[0].chapterShortPlayVoList[0];
        const playUrl = sp && sp.shortPlayUrl ? String(sp.shortPlayUrl).trim() : "";
        if (!playUrl) continue;
        episodes.push({
          episodeId: String(ch.chapterId || i + 1),
          name: cleanText(ch.chapterName || "") || "第" + (i + 1) + "集",
          index: episodes.length,
          playData: playUrl,
        });
      }

      return {
        vodId: vid,
        title: cached.title || "短剧 " + vid,
        poster: cached.poster || fallbackPoster,
        remark: cached.remark || (episodes.length > 0 ? "全" + episodes.length + "集" : null),
        synopsis: cleanText(parts[1] || "") || cached.synopsis || null,
        genres: ["短剧"],
        kind: "series",
        sources:
          episodes.length > 0
            ? [{ sourceId: "wusheng", name: "短剧专线", episodes: episodes }]
            : [],
      };
    },

    async play(payload) {
      const u = String((payload && payload.playData) || "").trim();
      if (!u) Host.raise("NO_STREAM", "wusheng empty playData");
      return {
        streams: [
          {
            label: "默认线路",
            url: u,
            userAgent: UA,
            headers: { "User-Agent": UA },
          },
        ],
      };
    },
  };
})();
