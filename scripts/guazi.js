// Ported from guazi.py -> LiveDeck script_js (QuickJS Sandbox)
(function () {
  const DEFAULT_HOSTS = [
    "https://apinew.uozvr.com",
    "https://api.w32z7vtd.com",
    "https://api.6a7nnf7.com",
    "https://api.umygrx3.com",
    "https://api.rmedphk.com",
  ];
  const AES_KEY = "OITxa5OqAYjhswxx";
  const AES_IV = "rCMNwZASNBKZ8mXV";
  const DEVICE_OLD_KEY = "aLFBMWpxBrIDAD1Si/KVvm41";
  const SIGN_SALT = "*&zvdvdvddbfikkkumtmdwqppp?|4Y!s!2br";
  const PLAY_UA = "Lavf/57.83.100";
  const PLAY_REFERER = "http://WJiZxLXA2.com/";

  const RSA_PUBLIC_KEY =
    "-----BEGIN PUBLIC KEY-----\n" +
    "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDUM5+/y8sPsWkd1/RQS64X259E\n" +
    "UwxFXFE5HlA65MqrxnPs0JqoSRojSDy5QhwvROlaD6TwRQHKMY2OAZ6SnQeUJsCh\n" +
    "TEFIR9qUkwrs3/MVUMxjsv6JS6Oe/juclyJGTgVmDhB55EafXsD0SQYVj/QXXsxR\n" +
    "6ewR5E2kL52yAAD4yQIDAQAB\n" +
    "-----END PUBLIC KEY-----";

  const RSA_PRIVATE_KEY =
    "-----BEGIN RSA PRIVATE KEY-----\n" +
    "MIICdgIBADANBgkqhkiG9w0BAQEFAASCAmAwggJcAgEAAoGAe6hKrWLi1zQmjTT1\n" +
    "ozbE4QdFeJGNxubxld6GrFGximxfMsMB6BpJhpcTouAqywAFppiKetUBBbXwYsYU\n" +
    "1wNr648XVmPmCMCy4rY8vdliFnbMUj086DU6Z+/oXBdWU3/b1G0DN3E9wULRSwcK\n" +
    "ZT3wj/cCI1vsCm3gj2R5SqkA9Y0CAwEAAQKBgAJH+4CxV0/zBVcLiBCHvSANm0l7\n" +
    "HetybTh/j2p0Y1sTXro4ALwAaCTUeqdBjWiLSo9lNwDHFyq8zX90+gNxa7c5EqcW\n" +
    "V9FmlVXr8VhfBzcZo1nXeNdXFT7tQ2yah/odtdcx+vRMSGJd1t/5k5bDd9wAvYdI\n" +
    "DblMAg+wiKKZ5KcdAkEA1cCakEN4NexkF5tHPRrR6XOY/XHfkqXxEhMqmNbB9U34\n" +
    "saTJnLWIHC8IXys6Qmzz30TtzCjuOqKRRy+FMM4TdwJBAJQZFPjsGC+RqcG5UvVM\n" +
    "iMPhnwe/bXEehShK86yJK/g/UiKrO87h3aEu5gcJqBygTq3BBBoH2md3pr/W+hUM\n" +
    "WBsCQQChfhTIrdDinKi6lRxrdBnn0Ohjg2cwuqK5zzU9p/N+S9x7Ck8wUI53DKm8\n" +
    "jUJE8WAG7WLj/oCOWEh+ic6NIwTdAkEAj0X8nhx6AXsgCYRql1klbqtVmL8+95KZ\n" +
    "K7PnLWG/IfjQUy3pPGoSaZ7fdquG8bq8oyf5+dzjE/oTXcByS+6XRQJAP/5ciy1b\n" +
    "L3NhUhsaOVy55MHXnPjdcTX0FaLi+ybXZIfIQ2P4rb19mVq1feMbCXhz+L1rG8oa\n" +
    "t5lYKfpe8k83ZA==\n" +
    "-----END RSA PRIVATE KEY-----";

  const CLASSES = [
    ["1", "电影", "movie"],
    ["2", "电视剧", "series"],
    ["4", "动漫", "anime"],
    ["3", "综艺", "variety"],
    ["64", "短剧", "series"],
  ];

  const COMMON_FILTERS = [
    {
      key: "area",
      name: "地区",
      defaultValue: "0",
      options: [
        { value: "0", label: "全部" },
        { value: "大陆", label: "大陆" },
        { value: "香港", label: "香港" },
        { value: "台湾", label: "台湾" },
        { value: "美国", label: "美国" },
        { value: "韩国", label: "韩国" },
        { value: "日本", label: "日本" },
        { value: "英国", label: "英国" },
        { value: "法国", label: "法国" },
        { value: "泰国", label: "泰国" },
        { value: "印度", label: "印度" },
        { value: "其他", label: "其他" },
      ],
    },
    {
      key: "year",
      name: "年份",
      defaultValue: "0",
      options: [
        { value: "0", label: "全部" },
        { value: "2026", label: "2026" },
        { value: "2025", label: "2025" },
        { value: "2024", label: "2024" },
        { value: "2023", label: "2023" },
        { value: "2022", label: "2022" },
        { value: "2021", label: "2021" },
        { value: "2020", label: "2020" },
        { value: "2019", label: "2019" },
        { value: "2018", label: "2018" },
        { value: "2017", label: "2017" },
        { value: "2016", label: "2016" },
        { value: "2015", label: "2015" },
        { value: "2004", label: "更早" },
      ],
    },
    {
      key: "sort",
      name: "排序",
      defaultValue: "d_id",
      options: [
        { value: "d_id", label: "最新" },
        { value: "d_hits", label: "最热" },
        { value: "d_score", label: "推荐" },
      ],
    },
  ];

  const AUTH_CACHE_KEY = "guazi:auth:v1";
  let memAuth = null;

  function getHosts(config) {
    if (config && config.host) {
      const h = String(config.host).trim().replace(/\/+$/, "");
      if (h) return [h].concat(DEFAULT_HOSTS);
    }
    return DEFAULT_HOSTS;
  }

  function getAuthState() {
    if (memAuth && memAuth.deviceId && memAuth.deviceKey) return memAuth;
    const cached = Host.cache.get(AUTH_CACHE_KEY);
    if (cached && cached.deviceId && cached.deviceKey) {
      memAuth = cached;
      return memAuth;
    }
    const rndBytes = Host.crypto.randomBytes(2, "bytes");
    const suffix = ((rndBytes[0] << 8) | rndBytes[1]) % 10000;
    memAuth = {
      deviceId: String(864150060000000 + suffix),
      deviceKey: String(Host.crypto.randomBytes(20, "hex")).toUpperCase(),
      token: "",
      tokenId: "",
      registered: false,
      hostIndex: 0,
    };
    return memAuth;
  }

  function saveAuthState(st) {
    memAuth = st;
    Host.cache.set(AUTH_CACHE_KEY, st, 1800);
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

  function encryptPayload(dataObj) {
    return Host.crypto
      .aesEncrypt({
        data: JSON.stringify(dataObj || {}),
        dataEncoding: "utf8",
        key: AES_KEY,
        keyEncoding: "utf8",
        iv: AES_IV,
        ivEncoding: "utf8",
        mode: "cbc",
        padding: "pkcs7",
        outputEncoding: "hex",
      })
      .toUpperCase();
  }

  function decryptResponse(dataSection) {
    const decKeysJson = Host.crypto.rsaDecrypt({
      data: String(dataSection.keys || ""),
      privateKey: RSA_PRIVATE_KEY,
      dataEncoding: "base64",
      outputEncoding: "utf8",
    });
    const keyInfo = JSON.parse(decKeysJson);
    const plain = Host.crypto.aesDecrypt({
      data: String(dataSection.response_key || ""),
      dataEncoding: "hex",
      key: String(keyInfo.key || ""),
      keyEncoding: "utf8",
      iv: String(keyInfo.iv || ""),
      ivEncoding: "utf8",
      mode: "cbc",
      padding: "pkcs7",
      outputEncoding: "utf8",
    });
    return JSON.parse(plain);
  }

  async function sendEncrypted(host, path, dataObj, st) {
    const requestKey = encryptPayload(dataObj);
    const keys = Host.crypto.rsaEncrypt({
      data: JSON.stringify({ iv: AES_IV, key: AES_KEY }),
      publicKey: RSA_PUBLIC_KEY,
      dataEncoding: "utf8",
      outputEncoding: "base64",
    });
    const t = String(Math.floor(Host.time.nowMillis() / 1000));
    const signStr =
      "token_id=,token=" +
      st.token +
      ",phone_type=1,request_key=" +
      requestKey +
      ",app_id=1,time=" +
      t +
      ",keys=" +
      keys +
      SIGN_SALT;
    const signature = Host.crypto.md5(signStr).toUpperCase();

    const resp = await Host.http.post(host + path, null, {
      form: {
        token: st.token,
        token_id: "",
        phone_type: "1",
        time: t,
        phone_model: "xiaomi-25031",
        keys: keys,
        request_key: requestKey,
        signature: signature,
        app_id: "1",
        ad_version: "1",
      },
      headers: {
        "User-Agent": PLAY_UA,
        code: "GZ0369",
        deviceId: st.deviceId,
        lang: "zh_cn",
        "Cache-Control": "no-cache",
        Version: "2604028",
        PackageName: "com.ae06aebdbb.y286327f5a.ofe849883320260517",
        Ver: "3.0.3.2",
        "api-ver": "3.0.3.2",
        Referer: host,
      },
      insecureTls: true,
      timeout: 12,
    });
    if (!resp || !resp.ok) return null;
    const json = resp.json();
    if (!json || json.code !== 200 || !json.data) {
      return { __bizError: true, raw: json };
    }
    return decryptResponse(json.data);
  }

  async function ensureAuth(hosts, st) {
    if (st.token && st.tokenId) return true;
    for (var i = 0; i < hosts.length; i++) {
      const idx = (st.hostIndex + i) % hosts.length;
      const h = hosts[idx];
      try {
        const authPath = st.registered
          ? "/App/Authentication/Device/signIn"
          : "/App/Authentication/Device/signUp";
        const authParams = st.registered
          ? { new_key: st.deviceKey, old_key: DEVICE_OLD_KEY }
          : { new_key: st.deviceKey, old_key: DEVICE_OLD_KEY, phone_type: 1, code: "" };
        const res = await sendEncrypted(h, authPath, authParams, st);
        if (!res || res.__bizError || !res.token) continue;
        st.token = String(res.token);
        if (res.app_user_id) st.tokenId = String(res.app_user_id);
        st.registered = true;
        st.hostIndex = idx;

        const ref = await sendEncrypted(h, "/App/Authentication/Authenticator/refresh", {}, st);
        if (ref && !ref.__bizError && ref.token) {
          st.token = String(ref.token);
          if (ref.app_user_id) st.tokenId = String(ref.app_user_id);
        }
        saveAuthState(st);
        return true;
      } catch (_) {}
    }
    return false;
  }

  async function requestApi(config, path, dataObj) {
    const hosts = getHosts(config);
    const st = getAuthState();
    for (var attempt = 0; attempt < 2; attempt++) {
      const ok = await ensureAuth(hosts, st);
      if (!ok) return null;
      for (var i = 0; i < hosts.length; i++) {
        const idx = (st.hostIndex + i) % hosts.length;
        try {
          const res = await sendEncrypted(hosts[idx], path, dataObj, st);
          if (res && !res.__bizError) {
            st.hostIndex = idx;
            saveAuthState(st);
            return res;
          }
          if (res && res.__bizError) {
            // Token likely expired; force re-auth
            st.token = "";
            st.tokenId = "";
            break;
          }
        } catch (_) {}
      }
      st.token = "";
      st.tokenId = "";
    }
    return null;
  }

  function mapList(arr) {
    const out = [];
    if (!Array.isArray(arr)) return out;
    for (var i = 0; i < arr.length; i++) {
      const it = arr[i];
      if (!it || !it.vod_id) continue;
      const title = cleanText(it.vod_name || "");
      if (!title) continue;
      const pic = String(it.vod_pic || "").trim();
      const cont = parseInt(it.vod_continu || 0, 10) || 0;
      const remark =
        cleanText(it.new_continue || "") || (cont === 0 ? "电影" : "更新至" + cont + "集");
      out.push({
        vodId: String(it.vod_id),
        title: title,
        poster: pic || null,
        remark: remark || null,
        year: parseYear(it.vod_year),
        region: cleanText(it.vod_area) || null,
        genres: Array.isArray(it.tags) ? it.tags.map(cleanText).filter(Boolean) : [],
        rating: it.vod_scroe ? String(it.vod_scroe) : null,
      });
    }
    return out;
  }

  globalThis.LiveDeckVod = {
    async home(payload) {
      const data = await requestApi(payload && payload.config, "/App/IndexList/indexList", {
        area: "0",
        year: "0",
        pageSize: "30",
        sort: "d_id",
        page: "1",
        tid: "0",
      });
      return {
        categories: CLASSES.map(function (c) {
          return { id: c[0], name: c[1], filters: COMMON_FILTERS };
        }),
        featured: mapList(data && data.list),
      };
    },

    async category(payload) {
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10) || 1);
      const tid = String((payload && payload.categoryId) || "1").trim();
      const filters = (payload && payload.filters) || {};
      const data = await requestApi(payload && payload.config, "/App/IndexList/indexList", {
        area: String(filters.area || "0"),
        year: String(filters.year || "0"),
        pageSize: "30",
        sort: String(filters.sort || "d_id"),
        page: String(page),
        tid: tid,
      });
      const items = mapList(data && data.list);
      const hasMore = items.length >= 30;
      return {
        items: items,
        page: page,
        totalPages: hasMore ? page + 1 : page,
        hasMore: hasMore,
      };
    },

    async search(payload) {
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10) || 1);
      const kw = String((payload && payload.keyword) || "").trim();
      if (!kw) return { items: [], page: page, totalPages: 1, hasMore: false };
      const data = await requestApi(payload && payload.config, "/App/Index/findMoreVod", {
        keywords: kw,
        order_val: "1",
        page: String(page),
      });
      const items = mapList(data && data.list);
      const hasMore = items.length >= 20;
      return {
        items: items,
        page: page,
        totalPages: hasMore ? page + 1 : page,
        hasMore: hasMore,
      };
    },

    async detail(payload) {
      const rawVid = String((payload && payload.vodId) || "").trim();
      const vid = rawVid.split("/")[0];
      if (!vid) return { vodId: "", title: "", sources: [] };
      const st = getAuthState();
      const hosts = getHosts(payload && payload.config);
      await ensureAuth(hosts, st);

      const t = String(Math.floor(Host.time.nowMillis() / 1000));
      const results = await Promise.all([
        requestApi(payload && payload.config, "/App/IndexPlay/playInfo", {
          token_id: st.tokenId,
          vod_id: vid,
          mobile_time: t,
          token: st.token,
        }),
        requestApi(payload && payload.config, "/App/Resource/Vurl/show", {
          vurl_cloud_id: "2",
          vod_d_id: vid,
        }),
      ]);

      const qdata = results[0];
      const jdata = results[1];
      if (!qdata || !qdata.vodInfo) {
        return { vodId: vid, title: "影片 " + vid, sources: [] };
      }
      const vod = qdata.vodInfo;
      const episodes = [];
      const list = (jdata && Array.isArray(jdata.list)) ? jdata.list : [];
      for (var i = 0; i < list.length; i++) {
        const item = list[i];
        if (!item || !item.play || typeof item.play !== "object") continue;
        const paramsByRes = {};
        const resolutions = [];
        const resKeys = Object.keys(item.play);
        for (var j = 0; j < resKeys.length; j++) {
          const rk = resKeys[j];
          const entry = item.play[rk];
          if (entry && entry.param) {
            paramsByRes[rk] = String(entry.param);
            resolutions.push(rk);
          }
        }
        if (resolutions.length === 0) continue;
        resolutions.sort(function (a, b) {
          return (parseInt(b, 10) || 0) - (parseInt(a, 10) || 0);
        });
        const epName =
          list.length === 1
            ? cleanText(item.title || vod.vod_name || "第1集")
            : cleanText(item.title || "第" + (i + 1) + "集");
        episodes.push({
          episodeId: String(item.id || i + 1),
          name: epName || String(i + 1),
          index: episodes.length,
          playData: JSON.stringify({ paramsByRes: paramsByRes, resolutions: resolutions }),
        });
      }

      const pic = String(vod.vod_pic || vod.pic || "").trim();
      return {
        vodId: vid,
        title: cleanText(vod.vod_name || "") || "影片 " + vid,
        poster: pic || null,
        remark: cleanText(vod.new_continue) || null,
        year: parseYear(vod.vod_year),
        region: cleanText(vod.vod_area) || null,
        genres: splitNames(vod.vod_category),
        actors: splitNames(vod.vod_actor),
        directors: splitNames(vod.vod_director),
        rating: vod.vod_scroe ? String(vod.vod_scroe) : null,
        synopsis: cleanText(vod.vod_use_content) || null,
        sources:
          episodes.length > 0
            ? [{ sourceId: "guazi", name: "瓜子影视", episodes: episodes }]
            : [],
      };
    },

    async play(payload) {
      let info;
      const raw = String((payload && payload.playData) || "").trim();
      try {
        info = JSON.parse(raw);
      } catch (_) {
        Host.raise("INVALID_PLAY_DATA", "guazi invalid playData");
      }
      const resolutions = Array.isArray(info.resolutions) ? info.resolutions : [];
      const paramsByRes = info.paramsByRes || {};
      const streams = [];

      for (var i = 0; i < resolutions.length; i++) {
        const res = resolutions[i];
        const paramStr = paramsByRes[res];
        if (!paramStr) continue;
        const sp = new URLSearchParams(paramStr);
        const reqParams = {};
        const entries = sp.entries();
        for (var e = 0; e < entries.length; e++) {
          reqParams[entries[e][0]] = entries[e][1];
        }
        reqParams.resolution = String(res);
        const data = await requestApi(
          payload && payload.config,
          "/App/Resource/VurlDetail/showOne",
          reqParams
        );
        if (data && data.url) {
          const q = parseInt(res, 10);
          streams.push({
            label: q > 0 ? q + "P" : String(res),
            quality: q > 0 ? q : null,
            url: String(data.url).trim(),
            userAgent: PLAY_UA,
            headers: {
              "User-Agent": PLAY_UA,
              Referer: PLAY_REFERER,
            },
          });
        }
      }

      if (streams.length === 0) {
        Host.raise("NO_STREAM", "guazi failed to resolve stream URL");
      }
      return { streams: streams };
    },
  };
})();
