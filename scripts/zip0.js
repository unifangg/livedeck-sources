// Ported from zip0.py -> LiveDeck script_js (QuickJS Sandbox)
(function () {
  const DEFAULT_HOST = "https://zip0.com";
  const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  const LIMIT = 42;
  const POOL_PAGES = 5;
  const POOL_MAX = 200;

  const CLASSES = [
    ["1", "电影", "movie"],
    ["2", "电视剧", "series"],
    ["3", "综艺", "variety"],
    ["4", "动漫", "anime"],
    ["5", "短剧", "series"],
    ["6", "纪录片", "documentary"],
    ["7", "体育", "other"],
  ];

  const KIND_MAP = {
    "1": "movie",
    "2": "series",
    "3": "variety",
    "4": "anime",
    "5": "series",
    "6": "documentary",
    "7": "other",
  };

  const CAT_QUERY = {
    "1": "电影",
    "2": "电视剧",
    "3": "综艺",
    "4": "动漫",
    "5": "短剧",
    "6": "纪录片",
    "7": "体育",
  };

  const CAT_EXTRA = {
    "1": ["片", "动作", "恐怖", "喜剧"],
    "2": ["电视", "日漫", "恐怖", "连续剧", "喜剧"],
    "3": ["电视", "秀", "喜剧", "纪录", "球"],
    "4": ["动画", "番", "日漫", "漫", "国漫"],
    "5": ["剧", "漫", "集", "综艺"],
    "6": ["纪录", "恐怖", "动作"],
    "7": ["赛", "球", "纪", "解说"],
  };

  const SRC_NAME = {
    bfzy: "暴风",
    dyttzy: "天堂",
    zy360: "360",
    lzi: "量子",
    ruyi: "如意",
    ffzy: "非凡",
    jisu: "极速",
    mdzy: "木偶",
    zuid: "最大",
    ikun: "ikun",
  };

  const UNSAFE_RE =
    /(?:伦理|倫理|福利|成人|情色|三级|三級|写真|寫真|里番|裏番|无码|無碼|有码|有碼|色情|18\+|\bAV\b)/i;

  function isUnsafeText(s) {
    return UNSAFE_RE.test(String(s || ""));
  }

  function getHost(config) {
    const raw = (config && (config.host || config.url)) || DEFAULT_HOST;
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

  function absUrl(host, u) {
    if (!u) return null;
    const s = String(u).trim();
    if (!s) return null;
    if (s.startsWith("//")) return "https:" + s;
    if (/^https?:\/\//i.test(s)) return s;
    return s.startsWith("/") ? host + s : host + "/" + s;
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

  function isPlayableHttpStream(url) {
    return (
      /^https?:\/\//i.test(String(url || "")) &&
      /\.(m3u8|mp4|flv|ts|mkv)(\?|$)/i.test(String(url || ""))
    );
  }

  function baseHeaders(host) {
    return {
      "User-Agent": UA,
      Referer: host + "/",
      "Accept-Language": "zh-CN,zh;q=0.9",
    };
  }

  async function fetchText(host, url, timeoutSec) {
    try {
      const resp = await Host.http.get(url, {
        headers: baseHeaders(host),
        insecureTls: true,
        timeout: timeoutSec || 20,
      });
      return resp && resp.ok ? resp.bodyText || resp.body || "" : "";
    } catch (_) {
      return "";
    }
  }

  async function apiSearch(host, q, pn, lim) {
    const limit = Math.min(Math.max(parseInt(lim || 50, 10) || 50, 1), 50);
    const page = Math.max(parseInt(pn || 1, 10) || 1, 1);
    const url =
      host +
      "/api/videos/search?query=" +
      Host.codec.urlEncode(q) +
      "&page=" +
      page +
      "&limit=" +
      limit;
    for (var t = 0; t < 2; t++) {
      const txt = await fetchText(host, url, 25);
      if (txt) {
        try {
          const j = JSON.parse(txt);
          if (j && Array.isArray(j.data)) {
            const pg = j.pagination || {};
            return {
              data: j.data,
              pages: parseInt(pg.pages || 1, 10) || 1,
              total: parseInt(pg.total || 0, 10) || 0,
            };
          }
        } catch (_) {}
      }
      if (t === 0) Host.time.sleep(600);
    }
    return { data: [], pages: 1, total: 0 };
  }

  function bucketOf(cat) {
    const c = String(cat || "");
    if (/(?:短剧|漫剧|爽剧|长剧)/.test(c)) return 5;
    if (/(?:综艺|真人秀|脱口秀|晚会|盛典|音乐|歌舞)/.test(c)) return 3;
    if (/(?:体育|赛事|足球|篮球|网球|排球|格斗|运动|电竞)/.test(c)) return 7;
    if (c.indexOf("纪录") !== -1 || c.indexOf("记录") !== -1) return 6;
    if (c.indexOf("动漫") !== -1 || c.indexOf("动画") !== -1) return 4;
    if (c.indexOf("片") !== -1 || c.indexOf("电影") === 0) return 1;
    if (c.indexOf("剧") !== -1) return 2;
    return 0;
  }

  function mapSearchRow(host, it, seen, defaultKind) {
    if (!it) return null;
    const m = /source=([^&]+)&id=(\d+)/.exec(String(it.url || ""));
    const title = cleanText(it.title);
    if (!m || !title || seen[title]) return null;
    const cat = String(it.category || "");
    if (isUnsafeText(title) || isUnsafeText(cat)) return null;
    seen[title] = true;

    let remark = cleanText(it.remarks);
    if (!remark) {
      const ec = parseInt(it.episodeCount || 0, 10) || 0;
      remark = ec > 1 ? "共" + ec + "集" : cleanText(it.year);
    }
    const poster = absUrl(host, it.image || it.poster || it.cover || "");
    const year = parseYear(it.year);
    const b = bucketOf(cat);
    const kind = (b && KIND_MAP[String(b)]) || defaultKind || null;

    return {
      vodId: m[1] + "|" + m[2],
      title: title.slice(0, 50),
      poster: poster,
      remark: remark ? remark.slice(0, 30) : null,
      year: year,
      region: cleanText(it.area) || null,
      genres: cat ? splitNames(cat) : [],
      kind: kind,
    };
  }

  async function buildPool(host, tid) {
    const cacheKey = "zip0_pool|" + host + "|" + tid;
    const cached = Host.cache.get(cacheKey);
    if (Array.isArray(cached) && cached.length > 0) return cached;

    const mainQ = CAT_QUERY[tid] || "电影";
    const want = parseInt(tid, 10) || 0;
    const requests = [];
    for (var pn = 1; pn <= POOL_PAGES; pn++) {
      requests.push({
        url:
          host +
          "/api/videos/search?query=" +
          Host.codec.urlEncode(mainQ) +
          "&page=" +
          pn +
          "&limit=50",
        method: "GET",
        headers: baseHeaders(host),
        insecureTls: true,
        timeout: 20,
      });
    }
    const extras = CAT_EXTRA[tid] || [];
    for (var e = 0; e < extras.length; e++) {
      requests.push({
        url:
          host +
          "/api/videos/search?query=" +
          Host.codec.urlEncode(extras[e]) +
          "&page=1&limit=50",
        method: "GET",
        headers: baseHeaders(host),
        insecureTls: true,
        timeout: 20,
      });
    }

    const resps = await Host.http.batch(requests, 6);
    const seen = Object.create(null);
    const hit = [];
    const unk = [];
    const kind = KIND_MAP[tid] || null;

    for (var i = 0; i < resps.length; i++) {
      const r = resps[i];
      if (!r || !r.ok || !r.response || !r.response.ok) continue;
      let data = [];
      try {
        const j = r.response.json();
        data = Array.isArray(j && j.data) ? j.data : [];
      } catch (_) {}
      for (var j = 0; j < data.length; j++) {
        const it = data[j];
        const row = mapSearchRow(host, it, seen, kind);
        if (!row) continue;
        const b = bucketOf(it.category);
        if (b === want) hit.push(row);
        else if (b === 0) unk.push(row);
      }
    }

    let out = hit.length > 0 ? hit : unk;
    out.sort(function (a, b) {
      return (b.year || 0) - (a.year || 0);
    });
    out = out.slice(0, POOL_MAX);
    if (out.length > 0) {
      Host.cache.set(cacheKey, out, 1800);
    }
    return out;
  }

  function ssrField(html, key) {
    const re = new RegExp('[,{]' + key + ':"([^"]*)"');
    const m = re.exec(html || "");
    return m ? m[1] : "";
  }

  function extractEpisodesFromWatch(html) {
    const out = [];
    const seen = Object.create(null);
    const str = String(html || "");
    const idx = str.indexOf("episodes:");
    const seg = idx > 0 ? str.slice(idx, idx + 24000) : str;

    const re1 = /name:"([^"]{1,30})",url:"(https?:\/\/[^"]{10,600})"/g;
    let m;
    while ((m = re1.exec(seg)) !== null) {
      const eu = m[2];
      if (seen[eu] || !isPlayableHttpStream(eu)) continue;
      seen[eu] = true;
      out.push({ name: cleanText(m[1]) || "第" + (out.length + 1) + "集", url: eu });
    }
    if (out.length > 0) return out;

    const re2 = /(https?:\/\/[^"'\s<>]+?\.m3u8[^"'\s<>]*)/gi;
    while ((m = re2.exec(str)) !== null) {
      const eu = m[1];
      if (seen[eu]) continue;
      seen[eu] = true;
      out.push({ name: "第" + (out.length + 1) + "集", url: eu });
      if (out.length >= 120) break;
    }
    return out;
  }

  function lineNo(nm) {
    const m = /(\d+)/.exec(nm || "");
    return m ? parseInt(m[1], 10) : 99;
  }

  function extractWatchStream(html) {
    const eps = extractEpisodesFromWatch(html);
    if (eps.length > 0) return eps[0].url;

    const pd = Host.text.extractJson(html, "player_data");
    if (pd) {
      try {
        const u = String((JSON.parse(pd) || {}).url || "").trim();
        if (isPlayableHttpStream(u)) return u;
        const dec = Host.crypto.base64Decode(u);
        if (isPlayableHttpStream(dec)) return dec;
      } catch (_) {}
    }

    const vm = /var\s*(?:now|url)\s*=\s*["']([^"']+)["']/i.exec(html || "");
    if (vm) {
      const u = vm[1].trim();
      if (isPlayableHttpStream(u)) return u;
    }
    return "";
  }

  function streamHeaders(u, host) {
    const m = /^(https?:\/\/[^/]+)/i.exec(u || "");
    return {
      "User-Agent": UA,
      Referer: m ? m[1] + "/" : host + "/",
    };
  }

  globalThis.LiveDeckVod = {
    async home(payload) {
      const host = getHost(payload && payload.config);
      const txt = await fetchText(host, host + "/api/danmaku-rooms", 15);
      const featured = [];
      const seen = Object.create(null);
      if (txt) {
        try {
          const j = JSON.parse(txt);
          const rooms = (j && j.rooms) || [];
          for (var i = 0; i < rooms.length; i++) {
            const it = rooms[i];
            if (!it) continue;
            const m = /source=([^&]+)&id=(\d+)/.exec(String(it.href || ""));
            const title = cleanText(it.title);
            if (!m || !title || seen[title] || isUnsafeText(title)) continue;
            seen[title] = true;
            featured.push({
              vodId: m[1] + "|" + m[2],
              title: title.slice(0, 50),
              poster: absUrl(host, it.image || ""),
              remark: cleanText(it.subtitle) || null,
            });
            if (featured.length >= 48) break;
          }
        } catch (_) {}
      }

      return {
        categories: CLASSES.map(function (c) {
          return { id: c[0], name: c[1], filters: [] };
        }),
        featured: featured,
      };
    },

    async category(payload) {
      const host = getHost(payload && payload.config);
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10) || 1);
      const tid = String((payload && payload.categoryId) || "1").trim();
      const pool = await buildPool(host, tid);
      const totalPages = Math.max(1, Math.ceil(pool.length / LIMIT));
      const start = (page - 1) * LIMIT;
      const items = pool.slice(start, start + LIMIT);
      return {
        items: items,
        page: page,
        totalPages: totalPages,
        hasMore: page < totalPages,
      };
    },

    async search(payload) {
      const host = getHost(payload && payload.config);
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10) || 1);
      let kw = String((payload && payload.keyword) || "").trim();
      if (!kw) return { items: [], page: page, totalPages: 1, hasMore: false };

      let res = await apiSearch(host, kw, page, LIMIT);
      if (res.data.length === 0 && page === 1) {
        const stripped = kw
          .replace(/(?:电影|电视剧|综艺|动漫|短剧|纪录片|连续剧|片)$/, "")
          .trim();
        if (stripped && stripped !== kw) {
          res = await apiSearch(host, stripped, 1, LIMIT);
        }
      }

      const seen = Object.create(null);
      const items = [];
      for (var i = 0; i < res.data.length; i++) {
        const row = mapSearchRow(host, res.data[i], seen, null);
        if (row) items.push(row);
      }
      const totalPages = Math.max(1, res.pages || 1);
      return {
        items: items,
        page: page,
        totalPages: totalPages,
        hasMore: page < totalPages,
      };
    },

    async detail(payload) {
      const host = getHost(payload && payload.config);
      const vid = String((payload && payload.vodId) || "").trim();
      const m = /^([A-Za-z0-9_\-]+)\|(\d+)$/.exec(vid);
      if (!m) {
        Host.raise("INVALID_VOD_ID", "invalid zip0 vodId: " + vid);
      }

      const cacheKey = "zip0_detail|" + host + "|" + vid;
      const cached = Host.cache.get(cacheKey);
      if (cached && cached.vodId) return cached;

      const src0 = m[1];
      const rid0 = m[2];
      const wu0 =
        host + "/watch?source=" + Host.codec.urlEncode(src0) + "&id=" + rid0 + "&episode=1";
      const h0 = await fetchText(host, wu0, 25);
      if (!h0) {
        return {
          vodId: vid,
          title: vid,
          poster: null,
          actors: [],
          directors: [],
          genres: [],
          sources: [],
        };
      }

      let title = ssrField(h0, "title");
      if (!title) {
        const hm = /<h1[^>]*>([\s\S]{0,120}?)<\/h1>/i.exec(h0);
        if (hm) title = cleanText(hm[1]);
      }
      title = cleanText(title) || vid;

      const categoryStr = cleanText(ssrField(h0, "category"));
      if (isUnsafeText(title) || isUnsafeText(categoryStr)) {
        Host.raise("CONTENT_FILTERED", "filtered unsafe content");
      }

      const cands = [[src0, rid0]];
      const candSeen = Object.create(null);
      candSeen[src0 + "|" + rid0] = true;

      const nmKey = title.replace(/\s+/g, "").toLowerCase();
      if (nmKey) {
        const sr = await apiSearch(host, title, 1, 50);
        for (var i = 0; i < sr.data.length; i++) {
          const it = sr.data[i];
          if (cleanText(it.title).replace(/\s+/g, "").toLowerCase() !== nmKey) continue;
          const mm = /source=([^&]+)&id=(\d+)/.exec(String(it.url || ""));
          if (mm) {
            const ck = mm[1] + "|" + mm[2];
            if (!candSeen[ck]) {
              candSeen[ck] = true;
              cands.push([mm[1], mm[2]]);
            }
          }
          if (cands.length >= 12) break;
        }
      }

      const lineRows = [];
      lineRows.push({
        src: src0,
        snm: ssrField(h0, "sourceName"),
        eps: extractEpisodesFromWatch(h0),
      });

      if (cands.length > 1) {
        const reqs = [];
        for (var k = 1; k < cands.length; k++) {
          reqs.push({
            url:
              host +
              "/watch?source=" +
              Host.codec.urlEncode(cands[k][0]) +
              "&id=" +
              cands[k][1] +
              "&episode=1",
            method: "GET",
            headers: baseHeaders(host),
            insecureTls: true,
            timeout: 20,
          });
        }
        const batchRes = await Host.http.batch(reqs, 6);
        for (var b = 0; b < batchRes.length; b++) {
          const br = batchRes[b];
          const html =
            br && br.ok && br.response && br.response.ok
              ? br.response.bodyText || br.response.body || ""
              : "";
          if (!html) continue;
          lineRows.push({
            src: cands[b + 1][0],
            snm: ssrField(html, "sourceName"),
            eps: extractEpisodesFromWatch(html),
          });
        }
      }

      const best = Object.create(null);
      const order = [];
      for (var r = 0; r < lineRows.length; r++) {
        const row = lineRows[r];
        if (!row.eps || row.eps.length === 0) continue;
        if (!best[row.src] || row.eps.length > best[row.src].eps.length) {
          if (!best[row.src]) order.push(row.src);
          best[row.src] = row;
        }
      }

      order.sort(function (a, b) {
        return lineNo(best[a].snm) - lineNo(best[b].snm);
      });

      const sources = [];
      const usedNames = Object.create(null);
      for (var sIdx = 0; sIdx < order.length; sIdx++) {
        const src = order[sIdx];
        const info = best[src];
        let name =
          SRC_NAME[src] ||
          cleanText(info.snm || src).replace(/[$#|]/g, "") ||
          src;
        if (usedNames[name]) name = name + (sources.length + 1);
        usedNames[name] = true;
        sources.push({
          sourceId: src,
          name: name,
          episodes: info.eps.map(function (ep, idx) {
            return {
              episodeId: src + "-" + (idx + 1),
              name: ep.name.slice(0, 30),
              index: idx,
              playData: ep.url,
            };
          }),
        });
      }

      const bk = bucketOf(categoryStr);
      const detail = {
        vodId: vid,
        title: title,
        poster: absUrl(host, ssrField(h0, "poster")),
        remark: cleanText(ssrField(h0, "sourceName")) || null,
        year: parseYear(ssrField(h0, "year")),
        region: cleanText(ssrField(h0, "area")) || null,
        genres: categoryStr ? splitNames(categoryStr) : [],
        actors: splitNames(ssrField(h0, "actors")),
        directors: splitNames(ssrField(h0, "director")),
        synopsis: cleanText(ssrField(h0, "description")).slice(0, 480) || null,
        kind: (bk && KIND_MAP[String(bk)]) || null,
        sources: sources,
      };

      if (sources.length > 0) {
        Host.cache.set(cacheKey, detail, 900);
      }
      return detail;
    },

    async play(payload) {
      const host = getHost(payload && payload.config);
      let u = String((payload && payload.playData) || "").trim();
      if (!u) {
        Host.raise("INVALID_PLAY_DATA", "missing zip0 playData");
      }

      if (isPlayableHttpStream(u)) {
        return {
          streams: [
            {
              label: "默认线路",
              url: u,
              userAgent: UA,
              headers: streamHeaders(u, host),
            },
          ],
        };
      }

      const m = /^([A-Za-z0-9_\-]+)\|(\d+)\|(\d+)$/.exec(u);
      if (m) {
        u =
          host +
          "/watch?source=" +
          Host.codec.urlEncode(m[1]) +
          "&id=" +
          m[2] +
          "&episode=" +
          m[3];
      } else if (!/^https?:\/\//i.test(u)) {
        u = absUrl(host, u) || "";
      }

      if (!u || !/^https?:\/\//i.test(u)) {
        Host.raise("PLAY_URL_NOT_FOUND", "unsupported zip0 stream");
      }

      const html = await fetchText(host, u, 25);
      const streamUrl = extractWatchStream(html);
      if (!streamUrl) {
        Host.raise("PLAY_URL_NOT_FOUND", "no playable HTTP stream found");
      }

      return {
        streams: [
          {
            label: "默认线路",
            url: streamUrl,
            userAgent: UA,
            headers: streamHeaders(streamUrl, host),
          },
        ],
      };
    },
  };
})();
