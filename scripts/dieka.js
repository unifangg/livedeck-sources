// Ported from dieka.py -> LiveDeck script_js (QuickJS Sandbox)
(function () {
  const DEFAULT_HOST = "https://www.diekawang.com";
  const UA =
    "Mozilla/5.0 (Linux; Android 14; 22127RK46C) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

  const CLASSES = [
    ["1", "电影", "movie"],
    ["2", "电视剧", "series"],
    ["3", "综艺", "variety"],
    ["4", "动漫", "anime"],
    ["457", "短剧", "series"],
    ["462", "体育", "other"],
  ];

  const KIND_MAP = {
    "1": "movie",
    "2": "series",
    "3": "variety",
    "4": "anime",
    "457": "series",
    "462": "other",
  };

  // Safe sub-categories only (adult/unsafe sub-category removed)
  const CATE_FILTERS = {
    "1": [
      ["0", "全部"],
      ["9", "动作片"],
      ["10", "喜剧片"],
      ["11", "爱情片"],
      ["12", "恐怖片"],
      ["13", "剧情片"],
      ["14", "科幻片"],
      ["15", "惊悚片"],
      ["16", "奇幻片"],
      ["17", "动画片"],
      ["18", "悬疑片"],
      ["19", "冒险片"],
      ["20", "纪录片"],
      ["21", "战争片"],
    ],
    "2": [
      ["0", "全部"],
      ["22", "国产剧"],
      ["23", "香港剧"],
      ["24", "台湾剧"],
      ["25", "欧美剧"],
      ["26", "日本剧"],
      ["27", "韩国剧"],
      ["28", "泰国剧"],
      ["29", "海外剧"],
    ],
    "3": [
      ["0", "全部"],
      ["30", "大陆综艺"],
      ["31", "港台综艺"],
      ["32", "日韩综艺"],
      ["33", "欧美综艺"],
      ["34", "海外综艺"],
    ],
    "4": [
      ["0", "全部"],
      ["35", "国产动漫"],
      ["36", "日韩动漫"],
      ["37", "欧美动漫"],
      ["38", "海外动漫"],
      ["459", "港台动漫"],
    ],
    "457": [
      ["0", "全部"],
      ["540", "漫剧"],
      ["541", "玄幻"],
      ["542", "剧情"],
      ["543", "女性成长"],
      ["544", "权谋"],
      ["545", "豪门"],
      ["546", "齐幻"],
      ["547", "宫斗"],
      ["548", "脑洞"],
      ["549", "科幻"],
      ["550", "冒险"],
      ["551", "仙侠"],
      ["552", "喜剧"],
      ["553", "动作"],
      ["554", "悬疑"],
      ["555", "战神"],
      ["556", "刑侦"],
      ["557", "求生"],
      ["558", "商战"],
      ["559", "恐怖"],
      ["560", "武侠"],
      ["561", "爱情"],
      ["562", "AI漫剧"],
    ],
    "462": [["0", "全部"]],
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

  function absUrl(host, u) {
    if (!u) return null;
    const s = String(u).trim();
    if (!s) return null;
    if (s.startsWith("//")) return "https:" + s;
    if (/^https?:\/\//i.test(s)) return s;
    return s.startsWith("/") ? host + s : host + "/" + s;
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
      .map(function (s) {
        return s.trim();
      })
      .filter(Boolean);
  }

  function match1(text, re) {
    const m = re.exec(text || "");
    return m && m[1] ? m[1] : "";
  }

  function decodeFile(fileStr) {
    const s = String(fileStr || "").trim();
    if (s.length <= 3) return "";
    try {
      const decoded = Host.crypto.base64Decode(s.slice(3));
      return Host.codec.urlDecode(decoded);
    } catch (_) {
      return "";
    }
  }

  async function fetchHtml(host, pathOrUrl) {
    const url = /^https?:\/\//i.test(pathOrUrl)
      ? pathOrUrl
      : host + (pathOrUrl.startsWith("/") ? pathOrUrl : "/" + pathOrUrl);
    try {
      const resp = await Host.http.get(url, {
        headers: {
          "User-Agent": UA,
          Referer: host + "/",
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

  function parseListCards(host, html, kind) {
    const items = [];
    const seen = Object.create(null);
    if (!html) return items;

    const re1 =
      /<div[^>]*class="[^"]*moon-list-item[^"]*"[^>]*>\s*<a[^>]*href="\/vod\/player\/0\/(\d+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = re1.exec(html)) !== null) {
      const vid = m[1];
      if (seen[vid]) continue;
      const block = m[2];
      const title = cleanText(
        match1(block, /class="[^"]*name[^"]*item-title[^"]*"[^>]*>([\s\S]*?)<\/p>/i) ||
          match1(block, /class="[^"]*item-title[^"]*"[^>]*>([\s\S]*?)<\/p>/i)
      );
      if (!title || isUnsafeText(title)) continue;
      seen[vid] = true;

      const pic = absUrl(
        host,
        match1(block, /data-original="([^"]+)"/i) ||
          match1(block, /data-src="([^"]+)"/i) ||
          match1(block, /src="([^"]+)"/i)
      );
      const remark =
        cleanText(match1(block, /class="[^"]*rate[^"]*"[^>]*>([\s\S]*?)<\/label>/i)) ||
        null;

      items.push({
        vodId: vid,
        title: title,
        poster: pic,
        remark: remark,
        kind: kind || null,
      });
    }

    if (items.length === 0) {
      const re2 =
        /<a[^>]*href="\/vod\/player\/0\/(\d+)"[^>]*class="[^"]*(?:item|goLinklist)[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
      while ((m = re2.exec(html)) !== null) {
        const vid = m[1];
        if (seen[vid]) continue;
        const block = m[2];
        const title = cleanText(match1(block, /<p[^>]*>([\s\S]*?)<\/p>/i));
        if (!title || isUnsafeText(title)) continue;
        seen[vid] = true;

        const pic = absUrl(
          host,
          match1(block, /data-original="([^"]+)"/i) ||
            match1(block, /src="([^"]+)"/i)
        );
        const remark =
          cleanText(match1(block, /class="[^"]*rate[^"]*"[^>]*>([\s\S]*?)<\/label>/i)) ||
          null;

        items.push({
          vodId: vid,
          title: title,
          poster: pic,
          remark: remark,
          kind: kind || null,
        });
      }
    }

    return items;
  }

  function parseSearchCards(host, html) {
    const items = [];
    const seen = Object.create(null);
    if (!html) return items;

    const re =
      /<a[^>]*href="\/vod\/player\/0\/(\d+)"[^>]*class="[^"]*seachlist[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
      const vid = m[1];
      if (seen[vid]) continue;
      const block = m[2];
      const title = cleanText(match1(block, /<h2[^>]*>([\s\S]*?)<\/h2>/i));
      if (!title || isUnsafeText(title)) continue;
      seen[vid] = true;

      const pic = absUrl(
        host,
        match1(block, /data-src="([^"]+)"/i) || match1(block, /src="([^"]+)"/i)
      );

      const parts = [];
      const spanRe = /<span[^>]*>([\s\S]*?)<\/span>/gi;
      let sm;
      while ((sm = spanRe.exec(block)) !== null) {
        const t = cleanText(sm[1]);
        if (t && !isUnsafeText(t)) parts.push(t);
      }

      items.push({
        vodId: vid,
        title: title,
        poster: pic,
        remark: parts.slice(0, 3).join(" ") || null,
      });
    }

    return items.length > 0 ? items : parseListCards(host, html, null);
  }

  function getPageCount(html, currentPage, itemCount) {
    const m = /href="\/vod\/list\/(\d+)\/\d+\/\d+"[^>]*>[^<]*尾页/i.exec(html || "");
    if (m) {
      const n = parseInt(m[1], 10);
      if (n >= 1) return n;
    }
    return itemCount > 0 ? currentPage + 1 : currentPage;
  }

  function parseTemLineList(html) {
    const sources = [];
    const m = /temLineList\s*=\s*(\[[\s\S]*?\])\s*;/i.exec(html || "");
    if (!m) return sources;
    try {
      const list = JSON.parse(m[1]);
      if (!Array.isArray(list)) return sources;
      const byTag = Object.create(null);
      const order = [];
      for (var i = 0; i < list.length; i++) {
        const ep = list[i];
        if (!ep) continue;
        const tag = cleanText(ep.tag || "播放") || "播放";
        if (isUnsafeText(tag)) continue;
        if (!byTag[tag]) {
          byTag[tag] = [];
          order.push(tag);
        }
        const epName = cleanText(ep.name || ep.subTitle || "播放") || "播放";
        const file = String(ep.file || "").trim();
        if (!file) continue;
        byTag[tag].push({
          episodeId: "ep-" + order.length + "-" + (byTag[tag].length + 1),
          name: epName,
          index: byTag[tag].length,
          playData: file,
        });
      }
      for (var j = 0; j < order.length; j++) {
        const t = order[j];
        if (byTag[t].length > 0) {
          sources.push({
            sourceId: "line-" + (j + 1),
            name: t,
            episodes: byTag[t],
          });
        }
      }
    } catch (_) {}
    return sources;
  }

  globalThis.LiveDeckVod = {
    async home(payload) {
      const host = getHost(payload && payload.config);
      const html = await fetchHtml(host, "/vod/list/1/1/0");
      return {
        categories: CLASSES.map(function (c) {
          const opts = (CATE_FILTERS[c[0]] || [["0", "全部"]]).map(function (o) {
            return { value: o[0], label: o[1] };
          });
          return {
            id: c[0],
            name: c[1],
            filters: [
              {
                key: "cate",
                name: "类型",
                defaultValue: "0",
                options: opts,
              },
            ],
          };
        }),
        featured: parseListCards(host, html, "movie"),
      };
    },

    async category(payload) {
      const host = getHost(payload && payload.config);
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10) || 1);
      const tid = String((payload && payload.categoryId) || "1").trim();
      let subType =
        (payload && payload.filters && payload.filters.cate) || "0";
      subType = String(subType || "0").trim();
      if (subType === "460") subType = "0";

      const html = await fetchHtml(host, "/vod/list/" + page + "/" + tid + "/" + subType);
      const items = parseListCards(host, html, KIND_MAP[tid] || null);
      const totalPages = items.length === 0 ? page : getPageCount(html, page, items.length);
      return {
        items: items,
        page: page,
        totalPages: totalPages,
        hasMore: items.length > 0 && page < totalPages,
      };
    },

    async search(payload) {
      const host = getHost(payload && payload.config);
      const kw = String((payload && payload.keyword) || "").trim();
      if (!kw) return { items: [], page: 1, totalPages: 1, hasMore: false };
      const html = await fetchHtml(
        host,
        "/public/auto/search1.html?keyword=" + Host.codec.urlEncode(kw)
      );
      const items = parseSearchCards(host, html);
      return {
        items: items,
        page: 1,
        totalPages: 1,
        hasMore: false,
      };
    },

    async detail(payload) {
      const host = getHost(payload && payload.config);
      const raw = String((payload && payload.vodId) || "").trim();
      const ps = raw.split("|$|");
      const vid = ps[0].replace(/\D+/g, "") || ps[0];
      const oldName = ps[1] || "";
      const oldPic = ps[2] || "";
      const oldRemark = ps[3] || "";

      const html = await fetchHtml(host, "/vod/player/0/" + vid);
      if (!html) {
        return {
          vodId: vid,
          title: oldName || "视频 " + vid,
          poster: absUrl(host, oldPic),
          remark: oldRemark || null,
          actors: [],
          directors: [],
          genres: [],
          sources: [],
        };
      }

      const title =
        cleanText(match1(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i)) ||
        oldName ||
        "视频 " + vid;

      let poster = null;
      const imgRaw = match1(html, /imgUrl:\s*["']([^"']+)/i);
      if (imgRaw) {
        poster = absUrl(host, imgRaw.replace(/\\\//g, "/"));
      }
      if (!poster) {
        poster = absUrl(
          host,
          match1(html, /data-original="([^"]+)"/i) || oldPic
        );
      }

      const rating =
        cleanText(
          match1(html, /class="[^"]*din-condensed[^"]*"[^>]*>([\s\S]*?)<\/span>/i)
        ) || null;

      let year = null;
      let region = null;
      const labelSec = match1(html, /class="label-list"[^>]*>([\s\S]*?)<\/div>/i);
      if (labelSec) {
        const spanRe = /<span[^>]*>([\s\S]*?)<\/span>/gi;
        let sm;
        while ((sm = spanRe.exec(labelSec)) !== null) {
          const txt = cleanText(sm[1]);
          if (!txt) continue;
          if (/^\d{4}$/.test(txt)) {
            year = parseYear(txt);
          } else if (txt !== rating && !region) {
            region = txt;
          }
        }
      }

      const directorStr = match1(
        html,
        /class="worker-name"[^>]*>\s*导演\s*<\/a>\s*<div[^>]*>([\s\S]*?)<\/div>/i
      );
      let actorStr = match1(
        html,
        /class="worker-name"[^>]*>\s*演员\s*<\/a>\s*<div[^>]*>([\s\S]*?)<\/div>/i
      );
      let genres = [];
      const metaKw = match1(html, /<meta\s+name="keywords"\s+content="([^"]+)"/i);
      if (metaKw) {
        const kwParts = metaKw.split(",");
        if (!actorStr && kwParts.length >= 6) {
          actorStr = kwParts[5];
        }
        if (kwParts.length >= 3 && kwParts[2]) {
          genres.push(cleanText(kwParts[2]));
        }
        if (kwParts.length >= 4 && kwParts[3]) {
          genres.push(cleanText(kwParts[3]));
        }
      }
      genres = genres.filter(Boolean);

      if (isUnsafeText(title) || genres.some(isUnsafeText)) {
        Host.raise("CONTENT_FILTERED", "filtered unsafe content");
      }

      const sources = parseTemLineList(html);
      const remark = oldRemark || rating || null;

      return {
        vodId: vid,
        title: title,
        poster: poster,
        remark: remark,
        rating: rating,
        year: year,
        region: region,
        genres: genres,
        actors: splitNames(actorStr),
        directors: splitNames(directorStr),
        synopsis: remark,
        sources: sources,
      };
    },

    async play(payload) {
      const host = getHost(payload && payload.config);
      let playData = String((payload && payload.playData) || "").trim();
      if (!playData) {
        Host.raise("INVALID_PLAY_DATA", "missing dieka playData");
      }

      if (/^https?:\/\//i.test(playData)) {
        return {
          streams: [
            {
              label: "默认线路",
              url: playData,
              userAgent: UA,
              headers: { "User-Agent": UA },
            },
          ],
        };
      }

      if (/^\d+$/.test(playData)) {
        const html = await fetchHtml(host, "/vod/player/0/" + playData);
        const sources = parseTemLineList(html);
        if (sources.length > 0 && sources[0].episodes.length > 0) {
          playData = sources[0].episodes[0].playData;
        }
      }

      let decoded = decodeFile(playData);
      if (decoded && decoded.startsWith("//")) decoded = "https:" + decoded;
      if (!decoded || !/^https?:\/\//i.test(decoded)) {
        Host.raise("PLAY_URL_NOT_FOUND", "failed to decode dieka stream");
      }

      return {
        streams: [
          {
            label: "默认线路",
            url: decoded,
            userAgent: UA,
            headers: { "User-Agent": UA },
          },
        ],
      };
    },
  };
})();
