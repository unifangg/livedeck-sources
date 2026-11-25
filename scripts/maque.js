// Ported from maque.js -> LiveDeck script_js (QuickJS Sandbox)
(function () {
  const DEFAULT_HOST = "https://www.mqtv.fun";
  const XOR_KEY = "Mcxos@mucho!nmme";
  const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";

  const CATEGORIES = [
    ["/type/movie", "电影", "movie"],
    ["/type/tv", "电视剧", "series"],
    ["/type/va", "综艺", "variety"],
    ["/type/ct", "动漫", "anime"],
  ];

  function getHost(config) {
    const raw = (config && (config.host || config.url)) || DEFAULT_HOST;
    return String(raw).trim().replace(/\/+$/, "") || DEFAULT_HOST;
  }

  function absUrl(host, u) {
    if (!u) return null;
    const s = String(u).trim();
    if (!s) return null;
    if (s.startsWith("//")) return "https:" + s;
    if (/^https?:\/\//i.test(s)) return s;
    return host + (s.startsWith("/") ? s : "/" + s);
  }

  function parseYear(raw) {
    const m = /(\d{4})/.exec(String(raw || ""));
    if (!m) return null;
    const n = parseInt(m[1], 10);
    return n >= 1900 && n <= 2100 ? n : null;
  }

  function splitNames(raw) {
    return String(raw || "")
      .replace(/^(?:主演|导演|类型|地区|年份)[：:]\s*/, "")
      .split(/[,，/\s]+/)
      .map(function (s) {
        return s.trim();
      })
      .filter(Boolean);
  }

  function kindForCategory(tid) {
    for (var i = 0; i < CATEGORIES.length; i++) {
      if (CATEGORIES[i][0] === tid) return CATEGORIES[i][2];
    }
    return null;
  }

  function encodeToken(data) {
    try {
      const jsonStr = JSON.stringify(data);
      const b64 = Host.crypto.base64Encode(jsonStr);
      let xor = "";
      for (var i = 0; i < b64.length; i++) {
        xor += String.fromCharCode(b64.charCodeAt(i) ^ XOR_KEY.charCodeAt(i % XOR_KEY.length));
      }
      return Host.codec.urlEncode(Host.crypto.base64Encode(xor));
    } catch (_) {
      return "";
    }
  }

  function decodeData(encodedStr) {
    try {
      const raw = Host.codec.urlDecode(String(encodedStr || ""));
      const bytes = Host.crypto.base64DecodeBytes(raw);
      let xor = "";
      for (var i = 0; i < bytes.length; i++) {
        xor += String.fromCharCode(bytes[i] ^ XOR_KEY.charCodeAt(i % XOR_KEY.length));
      }
      return JSON.parse(Host.crypto.base64Decode(xor));
    } catch (_) {
      return {};
    }
  }

  function decryptUrl(enc, viewportId, charsetId) {
    const list = [];
    for (var i = 0; i < charsetId.length; i++) {
      list.push({ id: parseInt(charsetId[i], 10), text: viewportId[i] || "" });
    }
    list.sort(function (a, b) {
      return a.id - b.id;
    });
    const seed =
      list
        .map(function (it) {
          return it.text;
        })
        .join("") + "lemon";
    const md5 = Host.crypto.md5(seed);
    return Host.crypto.aesDecrypt({
      data: enc,
      dataEncoding: "base64",
      key: md5.substring(16),
      keyEncoding: "utf8",
      iv: md5.substring(0, 16),
      ivEncoding: "utf8",
      mode: "cbc",
      padding: "pkcs7",
      outputEncoding: "utf8",
    });
  }

  async function fetchText(url, referer, isAjax) {
    const headers = {
      "User-Agent": UA,
      "Accept-Language": "zh-CN,zh;q=0.9",
    };
    if (referer) headers.Referer = referer;
    if (isAjax) headers["x-requested-with"] = "XMLHttpRequest";
    try {
      const resp = await Host.http.get(url, {
        headers: headers,
        insecureTls: true,
        timeout: 15,
      });
      return resp && resp.ok ? resp.bodyText || resp.body || "" : "";
    } catch (_) {
      return "";
    }
  }

  async function getAccessToken(host, path, ref) {
    const html = await fetchText(host + path, ref ? host + ref : host + "/", true);
    const m = /window\.pageid\s*=\s*'(.*?)';/i.exec(html);
    return m ? encodeToken(m[1]) : "";
  }

  function mapShowItems(host, rows, kind) {
    const items = [];
    if (!Array.isArray(rows)) return items;
    for (var i = 0; i < rows.length; i++) {
      const v = rows[i];
      if (!v || !v.url || !v.title) continue;
      items.push({
        vodId: String(v.url),
        title: String(v.title),
        poster: absUrl(host, v.img),
        remark: v.remark ? String(v.remark) : null,
        year: parseYear(v.years),
        kind: kind || null,
      });
    }
    return items;
  }

  globalThis.LiveDeckVod = {
    async home(payload) {
      const host = getHost(payload && payload.config);
      const token = await getAccessToken(host, "/", "");
      let featured = [];
      if (token) {
        const body = await fetchText(
          host + "/libs/VodList.api.php?home=index&token=" + token,
          host + "/",
          true
        );
        try {
          const json = JSON.parse(body);
          const blocks = (json.data && json.data.movie) || [];
          const seen = Object.create(null);
          for (var i = 0; i < blocks.length; i++) {
            const mapped = mapShowItems(host, blocks[i] && blocks[i].show, null);
            for (var j = 0; j < mapped.length; j++) {
              if (!seen[mapped[j].vodId]) {
                seen[mapped[j].vodId] = true;
                featured.push(mapped[j]);
              }
            }
          }
        } catch (_) {}
      }
      return {
        categories: CATEGORIES.map(function (c) {
          return { id: c[0], name: c[1], filters: [] };
        }),
        featured: featured.slice(0, 36),
      };
    },

    async category(payload) {
      const host = getHost(payload && payload.config);
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10));
      const tid = String((payload && payload.categoryId) || "/type/movie").trim();
      const token = await getAccessToken(host, tid, "/");
      const typeId = tid.split("/")[2] || "movie";
      const body = await fetchText(
        host +
          "/libs/VodList.api.php?type=" +
          Host.codec.urlEncode(typeId) +
          "&rank=rankhot&cat=&year=&area=&page=" +
          page +
          "&token=" +
          token,
        host + tid,
        true
      );
      let items = [];
      try {
        const json = JSON.parse(body);
        items = mapShowItems(host, json.data, kindForCategory(tid));
      } catch (_) {}
      const hasMore = items.length >= 20;
      return {
        items: items,
        page: page,
        totalPages: hasMore ? page + 1 : page,
        hasMore: hasMore,
      };
    },

    async search(payload) {
      const host = getHost(payload && payload.config);
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10));
      const kw = String((payload && payload.keyword) || "").trim();
      if (!kw || page > 1) {
        return { items: [], page: page, totalPages: 1, hasMore: false };
      }
      const enc = Host.codec.urlEncode(kw);
      const path = "/search/" + enc;
      const token = await getAccessToken(host, path, "/");
      const body = await fetchText(
        host + "/libs/VodList.api.php?search=" + enc + "&token=" + token,
        host + path,
        true
      );
      const items = [];
      const seen = Object.create(null);
      try {
        const json = JSON.parse(body);
        const decoded = typeof json.data === "string" ? decodeData(json.data) : json.data || {};
        const groups = Array.isArray(decoded.vod_all) ? decoded.vod_all : [];
        for (var i = 0; i < groups.length; i++) {
          const mapped = mapShowItems(host, groups[i] && groups[i].show, null);
          for (var j = 0; j < mapped.length; j++) {
            if (!seen[mapped[j].vodId]) {
              seen[mapped[j].vodId] = true;
              items.push(mapped[j]);
            }
          }
        }
      } catch (_) {}
      return {
        items: items,
        page: 1,
        totalPages: 1,
        hasMore: false,
      };
    },

    async detail(payload) {
      const host = getHost(payload && payload.config);
      const id = String((payload && payload.vodId) || "").trim();
      const token = await getAccessToken(host, id, "/");
      const parts = id.split("/");
      const vid = parts[3] || parts[parts.length - 1] || id;
      const body = await fetchText(
        host + "/libs/VodInfo.api.php?type=ct&id=" + Host.codec.urlEncode(vid) + "&token=" + token,
        host + id,
        true
      );
      let data = {};
      try {
        data = JSON.parse(body).data || {};
      } catch (_) {}

      const parses = (Array.isArray(data.playapi) ? data.playapi : [])
        .map(function (p) {
          const u = String((p && p.url) || "");
          return u.startsWith("//") ? "https:" + u : u;
        })
        .filter(Boolean)
        .join(",");

      const sources = [];
      const playinfo = Array.isArray(data.playinfo) ? data.playinfo : [];
      for (var i = 0; i < playinfo.length; i++) {
        const src = playinfo[i];
        const eps = [];
        const players = Array.isArray(src && src.player) ? src.player : [];
        for (var j = 0; j < players.length; j++) {
          const ep = players[j];
          if (!ep || !ep.url) continue;
          eps.push({
            episodeId: String(i + 1) + "-" + (j + 1),
            name: String(ep.no || "第" + (j + 1) + "集"),
            index: j,
            playData: String(ep.url) + "@" + parses,
          });
        }
        if (eps.length > 0) {
          sources.push({
            sourceId: "src-" + (i + 1),
            name: String(src.cnsite || "线路" + (i + 1)),
            episodes: eps,
          });
        }
      }

      return {
        vodId: id,
        title: String(data.title || vid),
        poster: absUrl(host, data.img),
        remark: data.remark ? String(data.remark) : null,
        year: parseYear(data.year),
        region: data.area ? String(data.area).trim() || null : null,
        genres: splitNames(data.vodtype),
        actors: splitNames(data.actor),
        directors: splitNames(data.director),
        synopsis: data.content ? String(data.content).trim() || null : null,
        sources: sources,
      };
    },

    async play(payload) {
      const host = getHost(payload && payload.config);
      const raw = String((payload && payload.playData) || "").trim();
      const idx = raw.indexOf("@");
      const rawUrl = idx >= 0 ? raw.slice(0, idx) : raw;
      const parses = (idx >= 0 ? raw.slice(idx + 1) : "").split(",").filter(Boolean);

      if (/^https?:\/\//i.test(rawUrl) && /\.(m3u8|mp4)(\?|$)/i.test(rawUrl)) {
        return {
          streams: [
            { label: "默认线路", url: rawUrl, userAgent: UA, headers: { Referer: host + "/" } },
          ],
        };
      }

      for (var i = 0; i < parses.length; i++) {
        const p = parses[i];
        const html = await fetchText(p + rawUrl, host + "/", false);
        if (!html) continue;
        const cMatch = /meta\s+charset="UTF-8"\s+id\s*=\s*"now_([^"]+)"/i.exec(html);
        const vMatch = /meta\s+name="viewport"[^>]*id\s*=\s*"now_([^"]+)"/i.exec(html);
        const uMatch = /"url"\s*:\s*"([^"]+)"/i.exec(html);
        if (cMatch && vMatch && uMatch) {
          try {
            const dec = decryptUrl(uMatch[1], vMatch[1], cMatch[1]).trim();
            if (/^https?:\/\//i.test(dec)) {
              return {
                streams: [
                  { label: "默认线路", url: dec, userAgent: UA, headers: { Referer: host + "/" } },
                ],
              };
            }
          } catch (_) {}
        }
      }

      Host.raise("NO_STREAM", "maque could not decrypt direct stream for " + rawUrl);
    },
  };
})();
