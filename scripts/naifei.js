// Ported from naifei.py -> LiveDeck script_js (QuickJS Sandbox)
(function () {
  const DEFAULT_HOST = "https://www.netflixgc.com";
  const UA =
    "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36";

  const CHANNELS = [
    { id: "1", name: "电影", kind: "movie" },
    { id: "2", name: "连续剧", kind: "series" },
    { id: "24", name: "纪录片", kind: "documentary" },
    { id: "3", name: "漫剧", kind: "anime" },
    { id: "23", name: "综艺", kind: "variety" },
    { id: "57", name: "直播", kind: "other" },
  ];

  const KIND_MAP = {
    "1": "movie",
    "2": "series",
    "24": "documentary",
    "3": "anime",
    "23": "variety",
    "57": "other",
  };

  const NSFW_RE = /(伦理|福利|成人|情色|里番|禁片|三级片|午夜场|色情|女优|18\+|R18|NSFW|Hentai|\bAV\b)/i;

  function getHost(config) {
    const c = config || {};
    return String(c.host || c.url || DEFAULT_HOST).trim().replace(/\/+$/, "") || DEFAULT_HOST;
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
      .split(/[,，/]+/)
      .map(function (s) { return s.trim(); })
      .filter(Boolean);
  }

  function isSafeItem(item) {
    const text = [
      item && item.title,
      item && item.remark,
      Array.isArray(item && item.genres) ? item.genres.join(" ") : "",
    ].join(" ");
    return !NSFW_RE.test(text);
  }

  function fixPic(host, url) {
    let s = String(url || "").trim();
    if (!s) return null;
    const m = /image\.baidu\.com\/search\/down\?url=([^&]+)/.exec(s);
    if (m) {
      try {
        const inner = Host.codec.urlDecode(m[1]);
        if (inner.indexOf("ffeiimg.com/upload/") >= 0) s = inner;
      } catch (_) {}
    }
    s = s.replace("ffeiimg.com/upload/", "ffeiimg.com//upload/");
    if (s.startsWith("//")) return "https:" + s;
    if (/^https?:\/\//i.test(s)) return s;
    return host + (s.startsWith("/") ? s : "/" + s);
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
        timeout: 20,
      });
      return resp && resp.ok ? resp.bodyText || resp.body || "" : "";
    } catch (_) {
      return "";
    }
  }

  async function postForm(host, url, form) {
    try {
      const resp = await Host.http.post(url, undefined, {
        form: form,
        headers: {
          "User-Agent": UA,
          Referer: host + "/",
        },
        insecureTls: true,
        timeout: 20,
      });
      return resp && resp.ok ? resp.bodyText || resp.body || "" : "";
    } catch (_) {
      return "";
    }
  }

  function parseItems(host, html, defaultKind) {
    const items = [];
    const seen = Object.create(null);
    if (!html) return items;

    const re1 = /href="\/voddetail\/(\d+)\.html"[^>]*title="([^"]*)"/g;
    let m;
    while ((m = re1.exec(html)) !== null) {
      const vid = m[1];
      if (seen[vid]) continue;
      const name = cleanText(m[2]);
      if (!name || name.length > 100) continue;
      const after = html.slice(m.index + m[0].length, m.index + m[0].length + 800);
      let cover = /(?:data-src|data-original|original|src)="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp))"/i.exec(after);
      if (!cover) cover = /src="(https?:\/\/[^"]+)"/.exec(after);
      let remark = /class="[^"]*(?:slide-info-remarks|module-item-note|pic-text|public-list-prb|remarks|status)[^"]*"[^>]*>([^<]+)</.exec(after);
      if (!remark) remark = /<div[^>]*class="[^"]*(?:note|text|remark)[^"]*"[^>]*>([^<]+)</i.exec(after);
      seen[vid] = true;
      const item = {
        vodId: vid,
        title: name.slice(0, 50),
        poster: fixPic(host, cover ? cover[1] : ""),
        remark: remark ? cleanText(remark[1]) || null : null,
        kind: defaultKind || null,
      };
      if (isSafeItem(item)) items.push(item);
    }

    const re2 = /href="\/voddetail\/(\d+)\.html"[^>]*>\s*<h3[^>]*>([^<]+)<\/h3>/g;
    while ((m = re2.exec(html)) !== null) {
      const vid = m[1];
      if (seen[vid]) continue;
      const name = cleanText(m[2]);
      if (!name || name.length > 100) continue;
      const before = html.slice(Math.max(0, m.index - 600), m.index);
      const cover = /(?:data-src|src)="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp))"/i.exec(before);
      const after = html.slice(m.index + m[0].length, m.index + m[0].length + 600);
      const remark = /class="[^"]*slide-info-remarks cor5[^"]*"[^>]*>([^<]+)</.exec(after);
      seen[vid] = true;
      const item = {
        vodId: vid,
        title: name.slice(0, 50),
        poster: fixPic(host, cover ? cover[1] : ""),
        remark: remark ? cleanText(remark[1]) || null : null,
        kind: defaultKind || null,
      };
      if (isSafeItem(item)) items.push(item);
    }

    return items;
  }

  function parsePageCount(html, currentPage) {
    let maxPage = currentPage;
    const re = /href="\/vodshow\/\d+--------(\d+)---\.html"/g;
    let m;
    while ((m = re.exec(html || "")) !== null) {
      const n = parseInt(m[1], 10);
      if (n > maxPage) maxPage = n;
    }
    if (/title="下一页"|class="[^"]*next[^"]*"/.test(html || "") && maxPage <= currentPage + 5) {
      maxPage = currentPage + 5;
    }
    return maxPage;
  }

  globalThis.LiveDeckVod = {
    async home(payload) {
      const host = getHost(payload && payload.config);
      const html = await fetchHtml(host, "/");
      return {
        categories: CHANNELS.filter(function (c) {
          return !NSFW_RE.test(c.name);
        }).map(function (c) {
          return { id: c.id, name: c.name, filters: [] };
        }),
        featured: parseItems(host, html, null),
      };
    },

    async category(payload) {
      const host = getHost(payload && payload.config);
      const pn = Math.max(1, parseInt((payload && payload.page) || 1, 10) || 1);
      let cat = String((payload && payload.categoryId) || "1").trim();
      if (!KIND_MAP[cat]) cat = "1";
      const kind = KIND_MAP[cat] || null;

      try {
        const text = await postForm(host, host + "/index.php/ds_api/vod", {
          type: cat,
          class: "",
          area: "",
          year: "",
          lang: "",
          version: "",
          state: "",
          letter: "",
          time: "",
          level: "0",
          weekday: "",
          by: "time",
          page: String(pn),
        });
        if (text) {
          const res = JSON.parse(text);
          if (res && res.code === 1) {
            const rawList = Array.isArray(res.list) ? res.list : [];
            const items = [];
            for (var i = 0; i < rawList.length; i++) {
              const it = rawList[i];
              if (!it) continue;
              const obj = {
                vodId: String(it.vod_id || ""),
                title: cleanText(it.vod_name || ""),
                poster: fixPic(host, it.vod_pic),
                remark: cleanText(it.vod_remarks || "") || null,
                year: parseYear(it.vod_year),
                kind: kind,
              };
              if (obj.vodId && obj.title && isSafeItem(obj)) items.push(obj);
            }
            const pagecount = Math.max(1, parseInt(res.pagecount || 1, 10) || 1);
            return {
              items: items,
              page: pn,
              totalPages: pagecount,
              hasMore: pn < pagecount,
            };
          }
        }
      } catch (_) {}

      const pageStr = pn > 1 ? String(pn) : "";
      const html = await fetchHtml(host, "/vodshow/" + cat + "--------" + pageStr + "---.html");
      const items = parseItems(host, html, kind);
      const pagecount = parsePageCount(html, pn);
      return {
        items: items,
        page: pn,
        totalPages: pagecount,
        hasMore: pn < pagecount,
      };
    },

    async search(payload) {
      const host = getHost(payload && payload.config);
      const pn = Math.max(1, parseInt((payload && payload.page) || 1, 10) || 1);
      const kw = String((payload && payload.keyword) || "").trim();
      if (!kw) return { items: [], page: pn, totalPages: 1, hasMore: false };
      const enc = Host.codec.urlEncode(kw);
      const path =
        pn > 1
          ? "/vodsearch/" + enc + "----------" + pn + "---.html"
          : "/vodsearch/" + enc + "-------------.html";
      const html = await fetchHtml(host, path);
      const items = parseItems(host, html, null);
      const hasMore = items.length >= 12;
      return {
        items: items,
        page: pn,
        totalPages: hasMore ? pn + 1 : pn,
        hasMore: hasMore,
      };
    },

    async detail(payload) {
      const host = getHost(payload && payload.config);
      const raw = String((payload && payload.vodId) || "");
      const vm = /(\d+)/.exec(raw);
      const vid = vm ? vm[1] : raw;
      if (!vid) return { vodId: raw, title: raw, sources: [] };
      const h = await fetchHtml(host, "/voddetail/" + vid + ".html");
      if (!h) return { vodId: vid, title: vid, sources: [] };

      let title = "";
      const tn = /<title>([\s\S]*?)<\/title>/i.exec(h);
      if (tn) title = cleanText(tn[1]).split("_")[0].trim();
      if (!title) {
        const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(h);
        if (h1) title = cleanText(h1[1]);
      }

      let picMatch = /class="[^"]*lazy[^"]*"[\s\S]*?data-src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp))"/i.exec(h);
      if (!picMatch) picMatch = /data-src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp))"/i.exec(h);
      if (!picMatch) picMatch = /<img[^>]*(?:data-original|src)="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp))"/i.exec(h);
      const poster = fixPic(host, picMatch ? picMatch[1] : "");

      let descMatch = /<meta\s+name="description"\s+content="([^"]+)"/i.exec(h);
      if (!descMatch) descMatch = /class="[^"]*vod-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(h);
      const synopsis = descMatch ? cleanText(descMatch[1]).slice(0, 500) || null : null;

      let ym = /<em[^>]*>([12]\d{3})<\/em>/.exec(h);
      if (!ym) ym = /([12]\d{3})<\/[a-z]+>/i.exec(h);
      const year = parseYear(ym ? ym[1] : "");

      let am = /地区[：:]?<\/span>\s*([^<\n]+?)(?:\s|<\/)/.exec(h);
      if (!am) am = /地区[：:]?\s*([^<\n]+?)(?:\s|<\/)/.exec(h);
      const region = am ? cleanText(am[1]).replace(/，+$/, "").trim() || null : null;

      let cm = /分类[：:]?<\/span>\s*([^<\n]+?)(?:\s|<\/)/.exec(h);
      if (!cm) cm = /类型[：:]?\s*([^<\n]+?)(?:\s|<\/)/.exec(h);
      const genres = cm ? splitNames(cm[1].replace(/，+$/, "")) : [];

      let dm = /导演[：:]<\/span>([\s\S]*?)(?:<\/p>|<\/div>|<div)/i.exec(h);
      if (!dm) dm = /导演[：:]?\s*([^<\n]+?)(?:\s|<\/)/.exec(h);
      const directors = dm ? splitNames(dm[1].replace(/，+$/, "")) : [];

      let am2 = /主演[：:]<\/span>([\s\S]*?)(?:<\/p>|<\/div>|<div)/i.exec(h);
      if (!am2) am2 = /(?:演员|主演)[：:]?\s*([^<\n]+?)(?:\s|<\/)/.exec(h);
      const actors = am2 ? splitNames(am2[1].replace(/，+$/, "")) : [];

      let rm = /class="[^"]*slide-info-remarks[^"]*"[^>]*>([^<]+)</.exec(h);
      if (!rm) rm = /更新[至到]?([^<\n]+)/.exec(h);
      const remark = rm ? cleanText(rm[1]) || null : null;

      const tabNodes = Host.html.selectAll(
        h,
        ".anthology-tab a.swiper-slide, .module-tab-items a.swiper-slide, .play-tab a.swiper-slide, .tab-list a.swiper-slide"
      );
      const validTabNames = [];
      for (var tIdx = 0; tIdx < tabNodes.length; tIdx++) {
        const rawTabHtml = String(tabNodes[tIdx].html || "").replace(
          /<span[^>]*class="[^"]*badge[^"]*"[^>]*>[\s\S]*?<\/span>/gi,
          ""
        );
        const tabName = cleanText(rawTabHtml);
        if (
          tabName &&
          tabName.indexOf("排序") < 0 &&
          tabName.indexOf("报错") < 0 &&
          tabName.length < 20
        ) {
          validTabNames.push(tabName);
        }
      }

      const ulNodes = Host.html.selectAll(h, ".anthology-list ul");
      const sources = [];
      if (ulNodes.length > 0) {
        for (var uIdx = 0; uIdx < ulNodes.length; uIdx++) {
          const ulHtml = ulNodes[uIdx].html || "";
          const epRe = /href="(\/vodplay\/\d+-\d+-\d+\.html)"[^>]*>([^<]+)<\/a>/gi;
          const eps = [];
          let em;
          while ((em = epRe.exec(ulHtml)) !== null) {
            eps.push({
              episodeId: (uIdx + 1) + "-" + (eps.length + 1),
              name: cleanText(em[2]) || "第" + (eps.length + 1) + "集",
              index: eps.length,
              playData: host + em[1],
            });
          }
          if (eps.length > 0) {
            sources.push({
              sourceId: "line-" + (uIdx + 1),
              name: validTabNames[uIdx] || "线路" + (uIdx + 1),
              episodes: eps,
            });
          }
        }
      } else {
        const routes = Object.create(null);
        const routeOrder = [];
        const allRe = /href="(\/vodplay\/\d+-(\d+)-(\d+)\.html)"[^>]*>([^<]+)<\/a>/gi;
        let am3;
        while ((am3 = allRe.exec(h)) !== null) {
          const rId = am3[2];
          if (!routes[rId]) {
            routes[rId] = [];
            routeOrder.push(rId);
          }
          routes[rId].push({
            episodeId: rId + "-" + am3[3],
            name: cleanText(am3[4]) || "第" + am3[3] + "集",
            index: routes[rId].length,
            playData: host + am3[1],
          });
        }
        routeOrder.sort(function (a, b) {
          return (parseInt(a, 10) || 999) - (parseInt(b, 10) || 999);
        });
        for (var rIdx = 0; rIdx < routeOrder.length; rIdx++) {
          const rKey = routeOrder[rIdx];
          sources.push({
            sourceId: "line-" + rKey,
            name: validTabNames[rIdx] || "线路" + rKey,
            episodes: routes[rKey],
          });
        }
      }

      if (sources.length > 1) {
        let blu1Idx = -1;
        let lastBluIdx = -1;
        for (var sIdx = 0; sIdx < sources.length; sIdx++) {
          const sName = sources[sIdx].name.trim();
          if (sName === "蓝光-1" && blu1Idx < 0) blu1Idx = sIdx;
          if (sName.startsWith("蓝光")) lastBluIdx = sIdx;
        }
        if (blu1Idx >= 0 && lastBluIdx > blu1Idx) {
          const moved = sources.splice(blu1Idx, 1)[0];
          sources.splice(lastBluIdx, 0, moved);
        }
      }

      return {
        vodId: vid,
        title: title || vid,
        poster: poster,
        remark: remark,
        year: year,
        region: region,
        genres: genres,
        actors: actors,
        directors: directors,
        synopsis: synopsis,
        sources: sources,
      };
    },

    async play(payload) {
      const host = getHost(payload && payload.config);
      let url = String((payload && payload.playData) || "").trim();
      if (!url) {
        Host.raise("INVALID_PLAY_DATA", "empty naifei playData");
      }
      const headers = { Referer: host + "/" };

      if (
        /^https?:\/\//i.test(url) &&
        url.indexOf("/vodplay/") < 0 &&
        (/\.(m3u8|mp4)(\?|#|$)/i.test(url))
      ) {
        return {
          streams: [{ label: "默认线路", url: url, userAgent: UA, headers: headers }],
        };
      }

      const fullUrl = /^https?:\/\//i.test(url)
        ? url
        : host + (url.startsWith("/") ? url : "/" + url);
      const html = await fetchHtml(host, fullUrl);

      const jsonStr = Host.text.extractJson(html, "player_aaaa");
      if (jsonStr) {
        try {
          const data = JSON.parse(jsonStr);
          let playUrl = String(data.url || "").trim();
          if (playUrl) {
            const enc = parseInt(data.encrypt || 0, 10) || 0;
            if (enc === 2) {
              try {
                playUrl = Host.codec.urlDecode(Host.crypto.base64Decode(playUrl));
              } catch (_) {
                playUrl = Host.codec.urlDecode(playUrl);
              }
            } else if (enc === 1) {
              playUrl = Host.codec.urlDecode(playUrl);
            }
            if (/^https?:\/\//i.test(playUrl)) {
              return {
                streams: [{ label: "默认线路", url: playUrl, userAgent: UA, headers: headers }],
              };
            }
            if (playUrl.startsWith("NBY-")) {
              return {
                streams: [
                  {
                    label: "默认线路",
                    url:
                      "https://cjbfq.netflixgc.tv/player/ec.php?code=netflix&if=1&url=" +
                      Host.codec.urlEncode(playUrl),
                    userAgent: UA,
                    headers: headers,
                  },
                ],
              };
            }
          }
        } catch (_) {}
      }

      const m3u8 = /(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i.exec(html);
      if (m3u8) {
        return {
          streams: [{ label: "默认线路", url: m3u8[1], userAgent: UA, headers: headers }],
        };
      }
      const mp4 = /(https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*)/i.exec(html);
      if (mp4) {
        return {
          streams: [{ label: "默认线路", url: mp4[1], userAgent: UA, headers: headers }],
        };
      }

      Host.raise("NO_STREAM", "naifei could not extract stream from " + fullUrl);
    },
  };
})();
