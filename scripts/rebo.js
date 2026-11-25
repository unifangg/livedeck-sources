// Ported from rebo_app.py & rebo.js -> LiveDeck script_js (QuickJS Sandbox)
(function () {
  const DEFAULT_HOST = "http://v.rbotv.cn";
  const UA = "okhttp-okgo/jeasonlzy";
  const SIGN_SALT = "7gp0bnd2sr85ydii2j32pcypscoc4w6c7g5spl";

  const FILTER_LABELS = {
    extend: { key: "class", name: "类型" },
    area: { key: "area", name: "地区" },
    lang: { key: "lang", name: "语言" },
    year: { key: "year", name: "年份" },
  };

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

  function parseYear(raw) {
    const m = /(\d{4})/.exec(String(raw || ""));
    if (!m) return null;
    const n = parseInt(m[1], 10);
    return n >= 1900 && n <= 2100 ? n : null;
  }

  function splitNames(raw) {
    return cleanText(raw)
      .split(/[,，/\s]+/)
      .map(function (s) { return s.trim(); })
      .filter(Boolean);
  }

  function inferKind(typeName) {
    const s = String(typeName || "");
    if (s.indexOf("电影") >= 0) return "movie";
    if (s.indexOf("动漫") >= 0) return "anime";
    if (s.indexOf("综艺") >= 0) return "variety";
    if (s.indexOf("纪录") >= 0) return "documentary";
    if (s.indexOf("剧") >= 0) return "series";
    return null;
  }

  async function apiPost(host, path, extra) {
    const ts = String(Math.floor(Host.time.nowMillis() / 1000));
    const sign = Host.crypto.md5(SIGN_SALT + ts);
    const form = Object.assign({}, extra || {}, { sign: sign, timestamp: ts });
    try {
      const resp = await Host.http.post(host + path, null, {
        form: form,
        headers: {
          "User-Agent": UA,
          "Accept-Language": "zh-CN,zh;q=0.8",
        },
        insecureTls: true,
        timeout: 15,
      });
      if (!resp || !resp.ok) return null;
      return resp.json();
    } catch (_) {
      return null;
    }
  }

  function mapVods(arr) {
    const out = [];
    if (!Array.isArray(arr)) return out;
    for (var i = 0; i < arr.length; i++) {
      const it = arr[i];
      if (!it || !it.vod_id || String(it.vod_id) === "0") continue;
      const title = cleanText(it.vod_name || "");
      if (!title) continue;
      const pic = String(it.vod_pic || it.vod_pic_thumb || "").trim();
      const remark = cleanText(it.vod_remarks || "");
      out.push({
        vodId: String(it.vod_id),
        title: title,
        poster: pic || null,
        remark: remark || null,
        year: parseYear(it.vod_year),
      });
    }
    return out;
  }

  function buildFilters(catItem) {
    const groups = [];
    const keys = Object.keys(FILTER_LABELS);
    for (var i = 0; i < keys.length; i++) {
      const rawKey = keys[i];
      const meta = FILTER_LABELS[rawKey];
      const arr = catItem[rawKey];
      if (!Array.isArray(arr)) continue;
      const opts = [{ value: "", label: "全部" }];
      for (var j = 0; j < arr.length; j++) {
        const val = cleanText(arr[j]);
        if (!val || val === "全部") continue;
        opts.push({ value: val, label: val });
      }
      if (opts.length > 1) {
        groups.push({
          key: meta.key,
          name: meta.name,
          defaultValue: "",
          options: opts,
        });
      }
    }
    return groups;
  }

  globalThis.LiveDeckVod = {
    async home(payload) {
      const host = getHost(payload && payload.config);
      const results = await Promise.all([
        apiPost(host, "/v3/type/top_type", {}),
        apiPost(host, "/v3/type/tj_vod", {}),
      ]);
      const topData = (results[0] && results[0].data) || {};
      const tjData = (results[1] && results[1].data) || {};

      const rawCats = Array.isArray(topData.list) ? topData.list : [];
      const categories = [];
      for (var i = 0; i < rawCats.length; i++) {
        const c = rawCats[i];
        if (!c || !c.type_id || !c.type_name) continue;
        categories.push({
          id: String(c.type_id),
          name: cleanText(c.type_name),
          filters: buildFilters(c),
        });
      }

      const seen = Object.create(null);
      const featured = [];
      function pushUnique(list) {
        const mapped = mapVods(list);
        for (var k = 0; k < mapped.length; k++) {
          const item = mapped[k];
          if (seen[item.vodId]) continue;
          seen[item.vodId] = true;
          featured.push(item);
        }
      }
      pushUnique(tjData.cai);
      pushUnique(tjData.loop);
      const typeVods = Array.isArray(tjData.type_vod) ? tjData.type_vod : [];
      for (var t = 0; t < typeVods.length; t++) {
        pushUnique(typeVods[t] && typeVods[t].vod);
      }

      return {
        categories: categories,
        featured: featured.slice(0, 48),
      };
    },

    async category(payload) {
      const host = getHost(payload && payload.config);
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10) || 1);
      const tid = String((payload && payload.categoryId) || "1").trim();
      const form = {
        type_id: tid,
        limit: "12",
        page: String(page),
      };
      const filters = (payload && payload.filters) || {};
      const fKeys = Object.keys(filters);
      for (var i = 0; i < fKeys.length; i++) {
        const k = fKeys[i];
        const v = String(filters[k] || "").trim();
        if (!v) continue;
        form[k === "extend" ? "class" : k] = v;
      }
      const res = await apiPost(host, "/v3/home/type_search", form);
      const list = (res && res.data && res.data.list) || [];
      const items = mapVods(list);
      const hasMore = items.length >= 12;
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
      const res = await apiPost(host, "/v3/home/search", {
        limit: "12",
        page: String(page),
        keyword: kw,
      });
      const list = (res && res.data && res.data.list) || [];
      const items = mapVods(list);
      const hasMore = items.length >= 12;
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
      if (!vid) return { vodId: "", title: "", sources: [] };
      const res = await apiPost(host, "/v3/home/vod_details", { vod_id: vid });
      const v = res && res.data;
      if (!v || typeof v !== "object") {
        return { vodId: vid, title: "影片 " + vid, sources: [] };
      }

      const sources = [];
      const playList = Array.isArray(v.vod_play_list) ? v.vod_play_list : [];
      for (var i = 0; i < playList.length; i++) {
        const line = playList[i];
        if (!line || !Array.isArray(line.urls)) continue;
        const flag = String(line.flag || "");
        let lineTitle = cleanText(line.title || line.name || "")
          .replace(/[\(（](?:点击|换|勿信)[^)）]*[\)）]|[Z▶❤【].*/g, "")
          .trim();
        if (!lineTitle) lineTitle = "线路" + (i + 1);
        const showName = flag && lineTitle !== flag ? lineTitle + "(" + flag + ")" : lineTitle;
        const parseUrls = Array.isArray(line.parse_urls) ? line.parse_urls : [];
        const referer = String(line.referer || "").trim();
        const ua = String(line.ua || "").trim();

        const eps = [];
        for (var j = 0; j < line.urls.length; j++) {
          const ep = line.urls[j];
          if (!ep || !ep.url) continue;
          const sid = "s-" + (i + 1);
          eps.push({
            episodeId: sid + "-" + (ep.nid || j + 1),
            name: cleanText(ep.name) || "第" + (j + 1) + "集",
            index: eps.length,
            playData: JSON.stringify({
              url: String(ep.url).trim(),
              parseUrls: parseUrls,
              referer: referer,
              ua: ua,
            }),
          });
        }
        if (eps.length > 0) {
          sources.push({
            sourceId: "s-" + (i + 1),
            name: showName,
            episodes: eps,
          });
        }
      }

      const pic = String(v.vod_pic || v.vod_pic_thumb || "").trim();
      const typeName = cleanText(v.type_name || v.vod_class || "");
      return {
        vodId: String(v.vod_id || vid),
        title: cleanText(v.vod_name || "") || "影片 " + vid,
        poster: pic || null,
        remark: cleanText(v.vod_remarks) || null,
        year: parseYear(v.vod_year),
        region: cleanText(v.vod_area) || null,
        genres: splitNames(typeName),
        actors: splitNames(v.vod_actor),
        directors: splitNames(v.vod_director),
        synopsis: cleanText(v.vod_content) || null,
        kind: inferKind(typeName),
        sources: sources,
      };
    },

    async play(payload) {
      let info;
      const raw = String((payload && payload.playData) || "").trim();
      try {
        info = JSON.parse(raw);
      } catch (_) {
        info = { url: raw, parseUrls: [], referer: "", ua: "" };
      }

      const rawUrl = String(info.url || "").trim();
      const parseUrls = Array.isArray(info.parseUrls) ? info.parseUrls : [];
      const headers = {};
      if (info.referer) headers.Referer = info.referer;
      const userAgent = info.ua || UA;

      const streams = [];
      for (var i = 0; i < parseUrls.length; i++) {
        const p = String(parseUrls[i] || "").trim();
        if (!/^https?:\/\//i.test(p)) continue;
        try {
          const resp = await Host.http.get(p + rawUrl, {
            headers: Object.assign({ "User-Agent": userAgent }, headers),
            insecureTls: true,
            timeout: 10,
          });
          if (!resp || !resp.ok) continue;
          const j = resp.json();
          const resolved =
            (j && (j.url || (j.data && j.data.url))) ? String(j.url || j.data.url).trim() : "";
          if (/^https?:\/\//i.test(resolved)) {
            streams.push({
              label: parseUrls.length > 1 ? "解析" + (i + 1) : "默认线路",
              url: resolved,
              userAgent: userAgent,
              headers: headers,
            });
          }
        } catch (_) {}
      }

      if (streams.length === 0 && /^https?:\/\//i.test(rawUrl)) {
        streams.push({
          label: "默认线路",
          url: rawUrl,
          userAgent: userAgent,
          headers: headers,
        });
      }

      if (streams.length === 0) {
        Host.raise("NO_STREAM", "rebo failed to resolve stream for " + rawUrl);
      }
      return { streams: streams };
    },
  };
})();
