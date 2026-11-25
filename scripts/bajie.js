// Ported from bajie.py -> LiveDeck script_js (QuickJS Sandbox)
(function () {
  const DOMAIN_CONFIG_URL =
    "http://osstexll.oss-rg-china-mainland.aliyuncs.com/domainPath.json";
  const APP_UA = "okhttp/4.12.0";
  const PLAY_UA =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1";
  const DEFAULT_DEVICE_ID = "2d590b9842d064a1";

  const UNSAFE_RE =
    /(?:伦理|倫理|福利|成人|情色|三级|三級|写真|寫真|里番|裏番|无码|無碼|有码|有碼|色情|18\+|\bAV\b)/i;

  function isUnsafeText(s) {
    return UNSAFE_RE.test(String(s || ""));
  }

  function cleanText(raw) {
    return String(raw || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function nonEmpty(s) {
    const v = String(s || "").trim();
    return v ? v : null;
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

  function inferKind(name) {
    const s = String(name || "");
    if (s.indexOf("电影") !== -1) return "movie";
    if (s.indexOf("综艺") !== -1) return "variety";
    if (s.indexOf("动漫") !== -1 || s.indexOf("动画") !== -1) return "anime";
    if (s.indexOf("纪录") !== -1) return "documentary";
    if (s.indexOf("剧") !== -1) return "series";
    return null;
  }

  function makeAppHeaders(token, deviceId) {
    return {
      "User-Agent": APP_UA,
      "Content-Type": "application/json;charset=UTF-8",
      "Cache-Control": "no-cache",
      token: token || "",
      deviceId: deviceId || DEFAULT_DEVICE_ID,
      client: "app",
      deviceType: "Android",
    };
  }

  async function ensureSession(config) {
    const customHost =
      config && (config.host || config.url)
        ? String(config.host || config.url).trim().replace(/\/+$/, "")
        : "";
    const cacheKey = "bajie_session|" + (customHost || "auto");
    const cached = Host.cache.get(cacheKey);
    if (cached && cached.host && cached.token) {
      return cached;
    }

    let host = customHost;
    if (!host) {
      const domResp = await Host.http.get(DOMAIN_CONFIG_URL, {
        headers: { "User-Agent": APP_UA },
        insecureTls: true,
        timeout: 12,
      });
      if (!domResp || !domResp.ok) {
        Host.raise("BOOTSTRAP_FAILED", "failed to fetch bajie domainPath.json");
      }
      const domJson = domResp.json();
      const urls = domJson && domJson.url;
      if (!Array.isArray(urls) || !urls[0]) {
        Host.raise("BOOTSTRAP_FAILED", "missing bajie host in domainPath.json");
      }
      host = String(urls[0]).trim().replace(/\/+$/, "");
    }

    const deviceId = DEFAULT_DEVICE_ID;
    const visResp = await Host.http.get(host + "/api/v1/app/user/visitorInfo", {
      headers: makeAppHeaders("", deviceId),
      insecureTls: true,
      timeout: 12,
    });
    if (!visResp || !visResp.ok) {
      Host.raise("AUTH_FAILED", "failed to fetch bajie visitorInfo");
    }
    const visData = (visResp.json() || {}).data || {};
    const session = {
      host: host,
      userid: visData.id,
      token: String(visData.token || ""),
      deviceId: deviceId,
    };
    Host.cache.set(cacheKey, session, 1800);
    return session;
  }

  async function apiPost(session, path, payload) {
    try {
      const resp = await Host.http.request({
        url: session.host + path,
        method: "POST",
        body: payload !== undefined ? JSON.stringify(payload) : "",
        headers: makeAppHeaders(session.token, session.deviceId),
        insecureTls: true,
        timeout: 15,
      });
      if (!resp || !resp.ok) return {};
      return resp.json() || {};
    } catch (_) {
      return {};
    }
  }

  async function apiGet(session, path) {
    try {
      const resp = await Host.http.get(session.host + path, {
        headers: makeAppHeaders(session.token, session.deviceId),
        insecureTls: true,
        timeout: 15,
      });
      if (!resp || !resp.ok) return {};
      return resp.json() || {};
    } catch (_) {
      return {};
    }
  }

  function mapRecords(records) {
    const out = [];
    if (!Array.isArray(records)) return out;
    for (var i = 0; i < records.length; i++) {
      const it = records[i];
      if (!it || !it.id || !it.name) continue;
      const title = cleanText(it.name);
      if (!title || isUnsafeText(title)) continue;
      out.push({
        vodId: String(it.id),
        title: title,
        poster: nonEmpty(it.cover),
        remark: nonEmpty(it.area),
        year: parseYear(it.year),
        region: nonEmpty(it.area),
      });
    }
    return out;
  }

  globalThis.LiveDeckVod = {
    async home(payload) {
      const session = await ensureSession(payload && payload.config);
      const [typeResp, recResp] = await Promise.all([
        apiPost(session, "/api/v1/app/screen/screenType"),
        apiPost(session, "/api/v1/app/recommend/recommendList"),
      ]);

      const categories = [];
      const typeList = Array.isArray(typeResp.data) ? typeResp.data : [];
      for (var i = 0; i < typeList.length; i++) {
        const t = typeList[i];
        if (!t || !t.id || !t.name) continue;
        const name = cleanText(t.name);
        if (!name || isUnsafeText(name)) continue;
        categories.push({ id: String(t.id), name: name, filters: [] });
      }

      const recList = Array.isArray(recResp.data) ? recResp.data : [];
      const reqs = recList
        .filter(function (it) {
          return it && it.id !== undefined;
        })
        .map(function (it) {
          return {
            url: session.host + "/api/v1/app/recommend/recommendSubList",
            method: "POST",
            body: JSON.stringify({
              condition: it.id,
              pageNum: 1,
              pageSize: 6,
            }),
            headers: makeAppHeaders(session.token, session.deviceId),
            insecureTls: true,
            timeout: 15,
          };
        });

      const featured = [];
      const seen = Object.create(null);
      if (reqs.length > 0) {
        const subResps = await Host.http.batch(reqs, 5);
        for (var j = 0; j < subResps.length; j++) {
          const sr = subResps[j];
          if (!sr || !sr.ok || !sr.response || !sr.response.ok) continue;
          try {
            const jdata = sr.response.json();
            const recs = (jdata && jdata.data && jdata.data.records) || [];
            const mapped = mapRecords(recs);
            for (var k = 0; k < mapped.length; k++) {
              if (!seen[mapped[k].vodId]) {
                seen[mapped[k].vodId] = true;
                featured.push(mapped[k]);
              }
            }
          } catch (_) {}
        }
      }

      return { categories: categories, featured: featured };
    },

    async category(payload) {
      const session = await ensureSession(payload && payload.config);
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10) || 1);
      const tid = String((payload && payload.categoryId) || "");
      const res = await apiPost(session, "/api/v1/app/screen/screenMovie", {
        condition: {
          classify: "",
          region: "",
          sreecnTypeEnum: "NEWEST",
          typeId: tid,
          year: "",
        },
        pageNum: page,
        pageSize: 40,
      });
      const records = (res && res.data && res.data.records) || [];
      const items = mapRecords(records);
      const hasMore = records.length >= 40;
      return {
        items: items,
        page: page,
        totalPages: hasMore ? page + 1 : page,
        hasMore: hasMore,
      };
    },

    async search(payload) {
      const session = await ensureSession(payload && payload.config);
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10) || 1);
      const kw = String((payload && payload.keyword) || "").trim();
      if (!kw) return { items: [], page: page, totalPages: 1, hasMore: false };

      const res = await apiPost(session, "/api/v1/app/search/searchMovie", {
        condition: { value: kw },
        pageNum: page,
        pageSize: 40,
      });
      const records = (res && res.data && res.data.records) || [];
      const items = mapRecords(records);
      const hasMore = records.length >= 40;
      return {
        items: items,
        page: page,
        totalPages: hasMore ? page + 1 : page,
        hasMore: hasMore,
      };
    },

    async detail(payload) {
      const session = await ensureSession(payload && payload.config);
      const vid = String((payload && payload.vodId) || "").trim();

      const [detRes, descRes] = await Promise.all([
        apiPost(session, "/api/v1/app/play/movieDetails", {
          id: vid,
          source: 0,
          typeId: "M17",
          userId: session.userid,
        }),
        apiPost(session, "/api/v1/app/play/movieDesc", {
          id: vid,
          typeId: "M17",
        }),
      ]);

      const data = (detRes && detRes.data) || {};
      const data2 = (descRes && descRes.data) || {};
      const title = cleanText(data2.name || data.name || "八戒影视 " + vid);
      const genres = splitNames(data2.classify || "");

      if (isUnsafeText(title) || genres.some(isUnsafeText)) {
        Host.raise("CONTENT_FILTERED", "filtered unsafe content");
      }

      const currentPlayerId = data.playerId;
      const moviePlayerList = Array.isArray(data.moviePlayerList)
        ? data.moviePlayerList
        : [];
      const episodeList = Array.isArray(data.episodeList) ? data.episodeList : [];

      let currentPlayerName = "默认线路";
      for (var i = 0; i < moviePlayerList.length; i++) {
        if (moviePlayerList[i].id === currentPlayerId) {
          currentPlayerName =
            cleanText(moviePlayerList[i].moviePlayerName) || "默认线路";
          break;
        }
      }

      const sources = [];
      const usedNames = Object.create(null);

      if (episodeList.length > 0) {
        usedNames[currentPlayerName] = true;
        sources.push({
          sourceId: String(currentPlayerId || "main"),
          name: currentPlayerName,
          episodes: episodeList.map(function (ep, idx) {
            return {
              episodeId: String(ep.id || idx + 1),
              name: cleanText(ep.episode) || "第" + (idx + 1) + "集",
              index: idx,
              playData: vid + "@" + currentPlayerId + "@" + ep.id + "@episode",
            };
          }),
        });
      }

      for (var j = 0; j < moviePlayerList.length; j++) {
        const p = moviePlayerList[j];
        if (!p || p.id === currentPlayerId || p.episodeTotal == null) continue;
        const total = parseInt(p.episodeTotal, 10) || 0;
        if (total <= 0) continue;
        const name = cleanText(p.moviePlayerName) || "线路" + (sources.length + 1);
        if (usedNames[name] || isUnsafeText(name)) continue;
        usedNames[name] = true;
        const eps = [];
        for (var k = 1; k <= total; k++) {
          eps.push({
            episodeId: p.id + "-" + k,
            name: "第" + k + "集",
            index: k - 1,
            playData: k + "@" + p.id + "@" + vid + "@virtual",
          });
        }
        sources.push({
          sourceId: String(p.id),
          name: name,
          episodes: eps,
        });
      }

      return {
        vodId: String(data2.id || vid),
        title: title,
        poster: nonEmpty(data2.cover),
        year: parseYear(data2.year),
        region: nonEmpty(data2.area),
        rating: data2.score != null && String(data2.score) ? String(data2.score) : null,
        genres: genres,
        actors: splitNames(data2.actor || ""),
        directors: splitNames(data2.director || ""),
        synopsis: cleanText(data2.introduce) || null,
        kind: inferKind(data2.classify),
        sources: sources,
      };
    },

    async play(payload) {
      const session = await ensureSession(payload && payload.config);
      const raw = String((payload && payload.playData) || "").trim();
      const parts = raw.split("@");
      if (parts.length < 4) {
        Host.raise("INVALID_PLAY_DATA", "invalid bajie playData: " + raw);
      }

      const param = parts[0];
      let playerId = parts[1];
      const param2 = parts[2];
      const param3 = parts[3];

      const body =
        param3 === "virtual"
          ? {
              episodeIndex: String((parseInt(param, 10) || 1) - 1),
              id: parseInt(param2, 10) || param2,
              playerId: playerId,
              source: 0,
              typeId: "M16",
              userId: session.userid,
            }
          : {
              episodeId: param2,
              id: param,
              playerId: playerId,
              source: 0,
              typeId: "M16",
              userId: session.userid,
            };

      const det = await apiPost(session, "/api/v1/app/play/movieDetails", body);
      const d = (det && det.data) || {};
      const parseUrl = String(d.url || "").trim();
      if (d.playerId != null) playerId = d.playerId;

      if (!parseUrl) {
        Host.raise("PLAY_URL_NOT_FOUND", "empty bajie parseUrl");
      }

      const ana = await apiGet(
        session,
        "/api/v1/app/play/analysisMovieUrl?playerUrl=" +
          Host.codec.urlEncode(parseUrl) +
          "&playerId=" +
          Host.codec.urlEncode(String(playerId))
      );
      const finalUrl = String((ana && ana.data) || "").trim();
      if (!finalUrl || !/^https?:\/\//i.test(finalUrl)) {
        Host.raise("PLAY_URL_NOT_FOUND", "failed to resolve bajie stream url");
      }

      return {
        streams: [
          {
            label: "默认线路",
            url: finalUrl,
            userAgent: PLAY_UA,
            headers: { "User-Agent": PLAY_UA },
          },
        ],
      };
    },
  };
})();
