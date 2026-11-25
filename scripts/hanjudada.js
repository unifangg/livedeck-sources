// Ported from hanjudada.py -> LiveDeck script_js (QuickJS Sandbox)
(function () {
  const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
  const DEFAULT_HOST = "https://www.hanjudada.com";

  const CATS = [
    ["122", "2026年韩剧"],
    ["121", "2025年韩剧"],
    ["120", "2024年韩剧"],
    ["119", "2023年韩剧"],
    ["118", "2022年韩剧"],
    ["117", "2021年韩剧"],
    ["116", "2020年韩剧"],
    ["96", "2019年韩剧"],
    ["97", "2018年韩剧"],
    ["98", "2017年韩剧"],
    ["99", "2016年韩剧"],
    ["100", "2015年韩剧"],
    ["101", "2014年韩剧"],
    ["102", "2013年韩剧"],
    ["103", "2012年韩剧"],
    ["104", "2011年韩剧"],
    ["105", "2010年韩剧"],
    ["106", "2009年韩剧"],
    ["107", "2008年韩剧"],
    ["108", "2007年韩剧"],
    ["109", "2006年韩剧"],
    ["110", "2005年韩剧"],
    ["111", "2004年韩剧"],
    ["112", "2003年韩剧"],
    ["113", "2002年韩剧"],
    ["114", "2001年韩剧"],
    ["115", "2000年及以前"],
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
    return s.startsWith("/") ? host + s : host + "/" + s;
  }

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

  function parseList(host, html) {
    const items = [];
    const seen = Object.create(null);
    if (!html) return items;
    const blocks = html.split(/<li(?:\s[^>]*)?>/i);
    for (var i = 1; i < blocks.length; i++) {
      const b = blocks[i];
      const m = /href="(\/hanju\/(\d+)\.html)"/.exec(b);
      if (!m) continue;
      const vid = m[2];
      if (seen[vid]) continue;
      seen[vid] = true;

      let title = "";
      const tm = /title="([^"]+)"/.exec(b);
      if (tm) title = cleanText(tm[1]);
      if (!title) {
        const hm = /<h2>([\s\S]*?)<\/h2>/i.exec(b);
        if (hm) title = cleanText(hm[1]);
      }
      if (!title) continue;

      let pic = null;
      const pm = /<img[^>]+src="([^"]+)"/i.exec(b);
      if (pm) pic = absUrl(host, pm[1]);

      let remark = null;
      const rm = /<i>([^<]*)<\/i>/i.exec(b);
      if (rm) {
        const r = cleanText(rm[1]);
        if (r) remark = r;
      }

      items.push({
        vodId: vid,
        title: title.slice(0, 90),
        poster: pic,
        remark: remark,
        kind: "series",
      });
    }
    return items;
  }

  globalThis.LiveDeckVod = {
    async home(payload) {
      const host = getHost(payload && payload.config);
      const html = await fetchHtml(host, "/");
      const featured = parseList(host, html).slice(0, 48);
      return {
        categories: CATS.map(function (c) {
          return { id: c[0], name: c[1], filters: [] };
        }),
        featured: featured,
      };
    },

    async category(payload) {
      const host = getHost(payload && payload.config);
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10));
      const tid = String((payload && payload.categoryId) || "122").trim();
      const path =
        page <= 1 ? "/vodtype/" + tid + ".html" : "/vodtype/" + tid + "-" + page + ".html";
      const html = await fetchHtml(host, path);
      const items = parseList(host, html);
      const hasMore = items.length >= 24;
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
      if (!kw) return { items: [], page: page, totalPages: 1, hasMore: false };
      let url = host + "/index.php?m=vod-search&wd=" + Host.codec.urlEncode(kw);
      if (page > 1) url += "&page=" + page;
      const html = await fetchHtml(host, url);
      const items = parseList(host, html);
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
      const raw = String((payload && payload.vodId) || "");
      const cleaned = raw.split("/").pop().replace(".html", "").replace(/\D+/g, "") || raw;
      const html = await fetchHtml(host, "/hanju/" + cleaned + ".html");
      if (!html) {
        return { vodId: cleaned, title: "韩剧 " + cleaned, sources: [] };
      }

      let title = "";
      const tm = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
      if (tm) {
        title = cleanText(tm[1]).replace(/\s*(已完结|更新至.*)$/, "").trim();
      }

      let pic = null;
      let pm = /property=["']og:image["'][^>]*content=["']([^"']+)/i.exec(html);
      if (!pm) pm = /<img[^>]+src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i.exec(html);
      if (pm) pic = absUrl(host, pm[1]);

      function dl(label) {
        const re = new RegExp("<dt>" + label + "：<\\/dt>\\s*<dd>([\\s\\S]*?)<\\/dd>", "i");
        const m = re.exec(html);
        return m ? cleanText(m[1]) : "";
      }

      const actorStr = dl("主演");
      const directorStr = dl("导演");
      const area = dl("地区") || null;
      const year = parseYear(dl("年份"));
      const typeName = dl("类型");
      const cm = /class="tjuqing">([\s\S]*?)<\/div>/i.exec(html);
      const synopsis = cm ? cleanText(cm[1]).slice(0, 800) : null;

      const sources = [];
      const blocks = html.split(/<div[^>]+id="playlist_(\d+)"/i);
      for (var i = 1; i + 1 < blocks.length; i += 2) {
        const sid = blocks[i];
        const body = blocks[i + 1];
        const sm = /<span>([^<]{1,20})<\/span>/i.exec(body);
        const lineName = (sm && cleanText(sm[1])) || "线路" + sid;
        const eps = [];
        const epRe = new RegExp(
          'href="(\\/player\\/' + cleaned + "-" + sid + '-(\\d+)\\.html)"[^>]*>([\\s\\S]*?)<\\/a>',
          "gi"
        );
        let em;
        while ((em = epRe.exec(body)) !== null) {
          const nid = em[2];
          const epName = cleanText(em[3]) || "第" + nid + "集";
          eps.push({
            episodeId: sid + "-" + nid,
            name: epName,
            index: eps.length,
            playData: cleaned + "-" + sid + "-" + nid,
          });
        }
        if (eps.length > 0) {
          sources.push({ sourceId: "line-" + sid, name: lineName, episodes: eps });
        }
      }

      if (sources.length === 0) {
        const fallbackEps = [];
        const seenEp = Object.create(null);
        const allRe = /href="(\/player\/(\d+)-(\d+)-(\d+)\.html)"[^>]*>([\s\S]*?)<\/a>/gi;
        let am;
        while ((am = allRe.exec(html)) !== null) {
          if (seenEp[am[1]]) continue;
          seenEp[am[1]] = true;
          const epName = cleanText(am[5]) || "第" + am[4] + "集";
          fallbackEps.push({
            episodeId: am[3] + "-" + am[4],
            name: epName,
            index: fallbackEps.length,
            playData: am[2] + "-" + am[3] + "-" + am[4],
          });
        }
        if (fallbackEps.length > 0) {
          sources.push({ sourceId: "default", name: "默认", episodes: fallbackEps });
        }
      }

      return {
        vodId: cleaned,
        title: title || "韩剧 " + cleaned,
        poster: pic,
        year: year,
        region: area,
        genres: typeName ? splitNames(typeName) : [],
        actors: splitNames(actorStr),
        directors: splitNames(directorStr),
        synopsis: synopsis,
        kind: "series",
        sources: sources,
      };
    },

    async play(payload) {
      const host = getHost(payload && payload.config);
      const raw = String((payload && payload.playData) || "").trim();
      const m = /(\d+)-(\d+)-(\d+)/.exec(raw);
      if (!m) {
        Host.raise("INVALID_PLAY_DATA", "invalid hanjudada episode payload: " + raw);
      }
      const url = host + "/player/" + m[1] + "-" + m[2] + "-" + m[3] + ".html";
      const html = await fetchHtml(host, url);
      let playUrl = "";
      const jsonStr = Host.text.extractJson(html, "player_aaaa");
      if (jsonStr) {
        try {
          const obj = JSON.parse(jsonStr);
          let u = String(obj.url || "").trim();
          const enc = parseInt(obj.encrypt || 0, 10);
          if (enc === 1) {
            u = Host.codec.urlDecode(u);
          } else if (enc === 2) {
            u = Host.codec.urlDecode(Host.crypto.base64Decode(u));
          }
          if (u.startsWith("//")) u = "https:" + u;
          playUrl = u;
        } catch (_) {}
      }
      if (!playUrl) {
        const hm = /(https?:\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*)/i.exec(html);
        if (hm) playUrl = hm[1];
      }
      return {
        streams: [
          {
            label: "默认线路",
            url: playUrl || url,
            userAgent: UA,
            headers: { Referer: host + "/" },
          },
        ],
      };
    },
  };
})();
