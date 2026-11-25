// Ported from uvod.py -> LiveDeck script_js (QuickJS Sandbox)
(function () {
  const DEFAULT_API = "https://api-h5.uvod.tv";
  const DEFAULT_WEB = "https://www.uvod.tv";
  const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";
  const AES_IV = "abcdefghijklmnop";
  const ALNUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  const CLIENT_PRIVATE_KEY =
    "-----BEGIN PRIVATE KEY-----\n" +
    "MIICdwIBADANBgkqhkiG9w0BAQEFAASCAmEwggJdAgEAAoGBAJ4FBai1Y6my4+fc\n" +
    "8AD5tyYzxgN8Q7M/PuFv+8i1Xje8ElXYVwzvYd1y/cNxwgW4RX0tDy9ya562V33x\n" +
    "6SyNr29DU6XytOeOlOkxt3gd5169K4iFaJ0l0wA4koMTcCAYVxC9B4+zzS5djYmF\n" +
    "MuRGfYgKYNH99vfY7BZjdAY68ty5AgMBAAECgYB1rbvHJj5wVF7Rf4Hk2BMDCi9+\n" +
    "zP4F8SW88Y6KrDbcPt1QvOonIea56jb9ZCxf4hkt3W6foRBwg86oZo2FtoZcpCJ+\n" +
    "rFqUM2/wyV4CuzlL0+rNNSq7bga7d7UVld4hQYOCffSMifyF5rCFNH1py/4Dvswm\n" +
    "pi5qljf+dPLSlxXl2QJBAMzPJ/QPAwcf5K5nngQtbZCD3nqDFpRixXH4aUAIZcDz\n" +
    "S1RNsHrT61mEwZ/thQC2BUJTQNpGOfgh5Ecd1MnURwsCQQDFhAFfmvK7svkygoKX\n" +
    "t55ARNZy9nmme0StMOfdb4Q2UdJjfw8+zQNtKFOM7VhB7ijHcfFuGsE7UeXBe20n\n" +
    "g/XLAkEAv9SoT2hgJaQxxUk4MCF8pgddstJlq8Z3uTA7JMa4x+kZfXTm/6TOo6I8\n" +
    "2VbXZLsYYe8op0lvsoHMFvBSBljV0QJBAKhxyoYRa98dZB5qZRskciaXTlge0WJk\n" +
    "kA4vvh3/o757izRlQMgrKTfng1GVfIZFqKtnBiIDWTXQw2N9cnqXtH8CQAx+CD5t\n" +
    "l1iT0cMdjvlMg2two3SnpOjpo7gALgumIDHAmsVWhocLtcrnJI032VQSUkNnLq9z\n" +
    "EIfmHDz0TPTNHBQ=\n" +
    "-----END PRIVATE KEY-----";

  const SERVER_PUBLIC_KEY =
    "-----BEGIN PUBLIC KEY-----\n" +
    "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCeBQWotWOpsuPn3PAA+bcmM8YD\n" +
    "fEOzPz7hb/vItV43vBJV2FcM72Hdcv3DccIFuEV9LQ8vcmuetld98eksja9vQ1Ol\n" +
    "8rTnjpTpMbd4HedevSuIhWidJdMAOJKDE3AgGFcQvQePs80uXY2JhTLkRn2ICmDR\n" +
    "/fb32OwWY3QGOvLcuQIDAQAB\n" +
    "-----END PUBLIC KEY-----";

  const BLOCKED_CAT_IDS = { "108": true };
  const BLOCKED_NAME_RE = /(?:午夜|伦理|情色|成人|福利)/;
  const QUALITY_LABELS = { 4: "1080P", 3: "720P", 2: "480P", 1: "360P" };
  const QUALITY_RES = { 4: 1080, 3: 720, 2: 480, 1: 360 };

  function getCfg(config) {
    const c = config || {};
    return {
      api: String(c.baseUrl || c.host || DEFAULT_API).trim().replace(/\/+$/, "") || DEFAULT_API,
      web: String(c.webUrl || DEFAULT_WEB).trim().replace(/\/+$/, "") || DEFAULT_WEB,
      token: String(c.token || "").trim(),
    };
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
      .map(function (s) { return s.trim(); })
      .filter(Boolean);
  }

  function randomKey32() {
    const bytes = Host.crypto.randomBytes(32, "bytes");
    let out = "";
    for (var i = 0; i < 32; i++) {
      out += ALNUM.charAt(bytes[i] % ALNUM.length);
    }
    return out;
  }

  function encryptBody(plainText) {
    const aesKey = randomKey32();
    const ctB64 = Host.crypto.aesEncrypt({
      data: plainText,
      dataEncoding: "utf8",
      key: aesKey,
      keyEncoding: "utf8",
      iv: AES_IV,
      ivEncoding: "utf8",
      mode: "cbc",
      padding: "pkcs7",
      outputEncoding: "base64",
    });
    const rsaB64 = Host.crypto.rsaEncrypt({
      data: aesKey,
      publicKey: SERVER_PUBLIC_KEY,
      dataEncoding: "utf8",
      outputEncoding: "base64",
    });
    return ctB64 + "." + rsaB64;
  }

  function decryptBody(encText) {
    const idx = encText.indexOf(".");
    if (idx < 0) return encText;
    const ctB64 = encText.slice(0, idx);
    const rsaB64 = encText.slice(idx + 1);
    const aesKey = Host.crypto.rsaDecrypt({
      data: rsaB64,
      privateKey: CLIENT_PRIVATE_KEY,
      dataEncoding: "base64",
      outputEncoding: "utf8",
    });
    return Host.crypto.aesDecrypt({
      data: ctB64,
      dataEncoding: "base64",
      key: aesKey,
      keyEncoding: "utf8",
      iv: AES_IV,
      ivEncoding: "utf8",
      mode: "cbc",
      padding: "pkcs7",
      outputEncoding: "utf8",
    });
  }

  function buildHeaders(cfg, payload) {
    const ts = String(Host.time.nowMillis());
    const token = cfg.token || "";
    const keys = Object.keys(payload || {}).sort();
    const parts = [];
    for (var i = 0; i < keys.length; i++) {
      const k = keys[i];
      const v = payload[k];
      if (v === 0 || v === "0" || v === "" || v === false || v === null || v === undefined) continue;
      const valStr =
        k === "keyword"
          ? Host.codec.urlEncode(String(v)).toLowerCase()
          : Host.codec.urlEncode(String(v)).toLowerCase();
      parts.push(k + "=" + valStr);
    }
    const text = token + "-" + parts.join("&") + "-" + ts;
    const sig = Host.crypto.md5(text);
    return {
      "Content-Type": "application/json",
      "X-TOKEN": token,
      "X-TIMESTAMP": ts,
      "X-SIGNATURE": sig,
      Origin: cfg.web,
      Referer: cfg.web + "/",
      Accept: "*/*",
      "User-Agent": UA,
    };
  }

  async function postApi(cfg, path, payload) {
    try {
      const body = encryptBody(JSON.stringify(payload || {}));
      const headers = buildHeaders(cfg, payload || {});
      const resp = await Host.http.post(cfg.api + path, body, {
        headers: headers,
        insecureTls: true,
        timeout: 15,
      });
      if (!resp || !resp.ok) return null;
      const txt = String(resp.bodyText || resp.body || "").trim();
      if (!txt) return null;
      let obj = null;
      try {
        obj = JSON.parse(decryptBody(txt));
      } catch (_) {
        try {
          obj = JSON.parse(txt);
        } catch (_) {}
      }
      if (obj && typeof obj === "object" && obj.error === 0) {
        return obj.data;
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  function inferKind(pid) {
    const s = String(pid || "");
    if (s === "100") return "movie";
    if (s === "101") return "series";
    if (s === "102") return "variety";
    if (s === "103") return "anime";
    if (s === "105") return "documentary";
    return null;
  }

  function mapList(arr) {
    const out = [];
    if (!Array.isArray(arr)) return out;
    for (var i = 0; i < arr.length; i++) {
      const k = arr[i];
      if (!k) continue;
      if (BLOCKED_CAT_IDS[String(k.parent_category_id || "")]) continue;
      const vid = k.id || k.video_id || k.videoId;
      const title = cleanText(k.title || k.name || "");
      if (!vid || !title) continue;
      const pic = String(k.poster || k.cover || k.pic || "").trim();
      const remark = cleanText(k.state || k.remark || k.remarks || (k.score ? String(k.score) + "分" : ""));
      out.push({
        vodId: String(vid),
        title: title,
        poster: pic || null,
        remark: remark || null,
        year: parseYear(k.year),
        region: cleanText(k.region) || null,
        rating: k.score ? String(k.score) : null,
        kind: inferKind(k.parent_category_id),
      });
    }
    return out;
  }

  globalThis.LiveDeckVod = {
    async home(payload) {
      const cfg = getCfg(payload && payload.config);
      const results = await Promise.all([
        postApi(cfg, "/video/category", {}),
        postApi(cfg, "/video/latest", { parent_category_id: 101 }),
      ]);
      const catData = results[0];
      const latData = results[1];

      const rawList =
        (catData && (catData.category_list || catData.list || catData.category)) ||
        (Array.isArray(catData) ? catData : []);
      const parents = [];
      const childrenByPid = Object.create(null);
      for (var i = 0; i < rawList.length; i++) {
        const it = rawList[i];
        if (!it) continue;
        const cid = String(it.id || it.category_id || it.value || "");
        const name = cleanText(it.name || it.label || it.title || "");
        const pid = String(it.pid != null ? it.pid : "0");
        if (!cid || !name) continue;
        if (BLOCKED_CAT_IDS[cid] || BLOCKED_CAT_IDS[pid] || BLOCKED_NAME_RE.test(name)) continue;
        if (pid === "0") {
          parents.push({ id: cid, name: name });
        } else {
          if (!childrenByPid[pid]) childrenByPid[pid] = [];
          childrenByPid[pid].push({ value: cid, label: name });
        }
      }

      const categories = parents.map(function (p) {
        const subs = childrenByPid[p.id] || [];
        const filters =
          subs.length > 0
            ? [
                {
                  key: "category_id",
                  name: "分类",
                  defaultValue: "",
                  options: [{ value: "", label: "全部" }].concat(subs),
                },
              ]
            : [];
        return { id: p.id, name: p.name, filters: filters };
      });

      if (categories.length === 0) {
        const fallback = [
          ["100", "电影"],
          ["101", "电视剧"],
          ["102", "综艺"],
          ["103", "动漫"],
          ["104", "体育"],
          ["105", "纪录片"],
          ["106", "粤台专区"],
        ];
        for (var f = 0; f < fallback.length; f++) {
          categories.push({ id: fallback[f][0], name: fallback[f][1], filters: [] });
        }
      }

      const latList =
        (latData && (latData.video_latest_list || latData.list || latData.rows || latData.items)) ||
        (Array.isArray(latData) ? latData : []);
      return {
        categories: categories,
        featured: mapList(latList),
      };
    },

    async category(payload) {
      const cfg = getCfg(payload && payload.config);
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10) || 1);
      const tid = String((payload && payload.categoryId) || "100").trim();
      if (BLOCKED_CAT_IDS[tid]) {
        return { items: [], page: page, totalPages: 1, hasMore: false };
      }
      const filters = (payload && payload.filters) || {};
      const reqPayload = {
        parent_category_id: tid,
        category_id: filters.category_id ? String(filters.category_id) : null,
        language: null,
        year: filters.year ? String(filters.year) : null,
        region: filters.region ? String(filters.region) : null,
        state: null,
        keyword: "",
        paid: null,
        page: page,
        pagesize: 42,
        sort_field: "",
        sort_type: "asc",
      };
      const data = await postApi(cfg, "/video/list", reqPayload);
      const list =
        (data && (data.video_list || data.list || data.rows || data.items)) ||
        (Array.isArray(data) ? data : []);
      const items = mapList(list);
      const total = data && typeof data.total === "number" ? data.total : 0;
      const totalPages = total > 0 ? Math.max(1, Math.ceil(total / 42)) : items.length >= 42 ? page + 1 : page;
      return {
        items: items,
        page: page,
        totalPages: totalPages,
        hasMore: page < totalPages,
      };
    },

    async search(payload) {
      const cfg = getCfg(payload && payload.config);
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10) || 1);
      const kw = String((payload && payload.keyword) || "").trim();
      if (!kw) return { items: [], page: page, totalPages: 1, hasMore: false };
      const data = await postApi(cfg, "/video/list", {
        parent_category_id: null,
        category_id: null,
        language: null,
        year: null,
        region: null,
        state: null,
        keyword: kw,
        paid: null,
        page: page,
        pagesize: 42,
        sort_field: "",
        sort_type: "asc",
        need_fragment: 1,
      });
      const list =
        (data && (data.video_list || data.list || data.rows || data.items)) ||
        (Array.isArray(data) ? data : []);
      const items = mapList(list);
      const hasMore = items.length >= 42;
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
      if (!vid) return { vodId: "", title: "", sources: [] };
      const data = await postApi(cfg, "/video/info", { id: vid });
      const v = (data && data.video) || {};
      if (BLOCKED_CAT_IDS[String(v.parent_category_id || "")]) {
        return { vodId: vid, title: cleanText(v.title || v.name || vid), sources: [] };
      }

      const fragments = (data && Array.isArray(data.video_fragment_list)) ? data.video_fragment_list : [];
      const episodes = [];
      for (var i = 0; i < fragments.length; i++) {
        const frag = fragments[i];
        if (!frag || !frag.id) continue;
        const quals = Array.isArray(frag.qualities) && frag.qualities.length > 0 ? frag.qualities.slice() : [4];
        quals.sort(function (a, b) { return Number(b) - Number(a); });
        episodes.push({
          episodeId: String(frag.id),
          name: cleanText(frag.symbol || "") || "第" + (i + 1) + "集",
          index: episodes.length,
          playData: JSON.stringify({
            videoId: vid,
            fragmentId: frag.id,
            qualities: quals,
          }),
        });
      }

      const pic = String(v.poster || v.cover || v.pic || "").trim();
      return {
        vodId: vid,
        title: cleanText(v.title || v.name || "") || "影片 " + vid,
        poster: pic || null,
        remark: cleanText(v.state || v.remark || v.duration) || null,
        year: parseYear(v.year),
        region: cleanText(v.region) || null,
        actors: splitNames(v.starring || v.actor),
        directors: splitNames(v.director),
        rating: v.score ? String(v.score) : null,
        synopsis: cleanText(v.description || v.desc) || null,
        kind: inferKind(v.parent_category_id),
        sources:
          episodes.length > 0
            ? [{ sourceId: "uvod", name: "UVOD专线", episodes: episodes }]
            : [],
      };
    },

    async play(payload) {
      const cfg = getCfg(payload && payload.config);
      let info;
      const raw = String((payload && payload.playData) || "").trim();
      try {
        info = JSON.parse(raw);
      } catch (_) {
        info = { videoId: raw, fragmentId: 1, qualities: [4] };
      }
      const quals = Array.isArray(info.qualities) && info.qualities.length > 0 ? info.qualities : [4];
      const headers = {
        "User-Agent": UA,
        Referer: cfg.web + "/",
        Origin: cfg.web,
      };

      const reqs = quals.slice(0, 3).map(function (q) {
        return postApi(cfg, "/video/source", {
          video_id: String(info.videoId || ""),
          video_fragment_id: Number(info.fragmentId) || info.fragmentId,
          quality: Number(q) || 4,
          seek: null,
        }).then(function (data) {
          return { q: Number(q) || 4, data: data };
        });
      });

      const results = await Promise.all(reqs);
      const streams = [];
      const seenUrl = Object.create(null);
      for (var i = 0; i < results.length; i++) {
        const d = results[i].data;
        if (!d) continue;
        const src = d.video_soruce || d.video_source || d.video || d;
        const u = String((src && (src.url || src.playUrl || src.play_url)) || "").trim();
        if (!/^https?:\/\//i.test(u) || seenUrl[u]) continue;
        seenUrl[u] = true;
        const qNum = Number((src && src.quality) || results[i].q) || 0;
        streams.push({
          label: QUALITY_LABELS[qNum] || "默认线路",
          quality: QUALITY_RES[qNum] || null,
          url: u,
          userAgent: UA,
          headers: headers,
        });
      }

      if (streams.length === 0) {
        Host.raise("NO_STREAM", "uvod failed to resolve stream for " + raw);
      }
      return { streams: streams };
    },
  };
})();
