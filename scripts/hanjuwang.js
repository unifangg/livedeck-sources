// Ported from hanjuwang.py -> LiveDeck script_js (QuickJS Sandbox)
(function () {
  const DEFAULT_HOST = "https://dyvip2.cc";
  const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

  const CHANNELS = [
    ["dianying", "电影", "/dianying.html", "movie"],
    ["dianshiju", "电视剧", "/dianshiju.html", "series"],
    ["zongyi", "综艺", "/zongyi.html", "variety"],
    ["dongman", "动漫", "/dongman.html", "anime"],
    ["duanju", "短剧", "/duanju.html", "series"],
    ["dianying_hot", "电影热播", "/dianying.html?sort_field=play_hot", "movie"],
    ["dianshiju_hot", "剧集热播", "/dianshiju.html?sort_field=play_hot", "series"],
  ];

  function getHost(config) {
    const raw = (config && (config.host || config.url)) || DEFAULT_HOST;
    return String(raw).trim().replace(/\/+$/, "") || DEFAULT_HOST;
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

  function absUrl(host, u) {
    const s = String(u || "").trim();
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
    if (Array.isArray(raw)) {
      return raw.map(cleanText).filter(Boolean);
    }
    return cleanText(raw)
      .split(/[,，/\s]+/)
      .map(function (s) {
        return s.trim();
      })
      .filter(Boolean);
  }

  function coverFor(vid) {
    return vid ? "https://pic2.tupian.click/img/id/" + vid + ".jpg" : null;
  }

  function extractId(vodId) {
    const s = String(vodId || "");
    let m = /\/(?:tv|movie)\/([a-f0-9]+)/i.exec(s);
    if (m) return m[1];
    m = /[?&]id=([a-f0-9]+)/i.exec(s);
    if (m) return m[1];
    return s.replace(/[^a-f0-9]/gi, "");
  }

  async function fetchText(host, pathOrUrl, extraHeaders) {
    const url = /^https?:\/\//i.test(pathOrUrl)
      ? pathOrUrl
      : host + (pathOrUrl.startsWith("/") ? pathOrUrl : "/" + pathOrUrl);
    const headers = {
      "User-Agent": UA,
      Accept: "text/html,application/json,*/*",
      "Accept-Language": "zh-CN,zh;q=0.9",
      Referer: host + "/",
    };
    if (extraHeaders) {
      const ks = Object.keys(extraHeaders);
      for (var i = 0; i < ks.length; i++) {
        headers[ks[i]] = extraHeaders[ks[i]];
      }
    }
    try {
      const resp = await Host.http.get(url, {
        headers: headers,
        insecureTls: true,
        timeout: 18,
      });
      return resp && resp.ok ? resp.bodyText || resp.body || "" : "";
    } catch (_) {
      return "";
    }
  }

  function parseList(html, defaultKind) {
    const items = [];
    const seen = Object.create(null);
    if (!html) return items;
    const re = /href="(?:https?:\/\/[^"]+)?(\/(?:tv|movie)\/([a-f0-9]+)-\d+\.html)[^"]*"[^>]*(?:title="([^"]*)")?/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
      const path = m[1];
      const vid = m[2];
      if (seen[vid]) continue;
      seen[vid] = true;

      let name = cleanText(m[3] || "");
      const block = html.slice(Math.max(0, m.index - 200), m.index + 600);
      if (!name) {
        const tm = /(?:title|alt)=["']([^"']{2,80})["']/i.exec(block);
        if (tm) name = cleanText(tm[1]);
      }
      let remark = null;
      const rm = /(更新[^<\n]{0,20}|全\d+集|\d+集|HD|TC|1080[Pp])/.exec(block);
      if (rm) {
        const r = cleanText(rm[1]).replace(/\s+/g, "");
        if (r) remark = r;
      }

      const kind = defaultKind || (path.indexOf("/movie/") === 0 ? "movie" : "series");
      items.push({
        vodId: vid,
        title: (name || vid).slice(0, 80),
        poster: coverFor(vid),
        remark: remark,
        kind: kind,
      });
    }
    return items;
  }

  globalThis.LiveDeckVod = {
    async home(payload) {
      const host = getHost(payload && payload.config);
      const html = await fetchText(host, "/");
      return {
        categories: CHANNELS.map(function (c) {
          return { id: c[0], name: c[1], filters: [] };
        }),
        featured: parseList(html, null).slice(0, 24),
      };
    },

    async category(payload) {
      const host = getHost(payload && payload.config);
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10) || 1);
      const tid = String((payload && payload.categoryId) || "dianying").trim();
      let ch = CHANNELS[0];
      for (var i = 0; i < CHANNELS.length; i++) {
        if (CHANNELS[i][0] === tid) {
          ch = CHANNELS[i];
          break;
        }
      }
      const basePath = ch[2];
      const url =
        page <= 1
          ? basePath
          : basePath + (basePath.indexOf("?") >= 0 ? "&" : "?") + "page=" + page;
      const html = await fetchText(host, url);
      const items = parseList(html, ch[3]);
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
      if (!kw) return { items: [], page: 1, totalPages: 1, hasMore: false };
      let url = "/s.html?wd=" + Host.codec.urlEncode(kw);
      if (page > 1) url += "&page=" + page;
      let html = await fetchText(host, url);
      let items = parseList(html, null);
      if (items.length === 0) {
        html = await fetchText(host, "/s.html?q=" + Host.codec.urlEncode(kw));
        items = parseList(html, null);
      }
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
      const rawId = String((payload && payload.vodId) || "");
      const vid = extractId(rawId);
      if (!vid) return { vodId: rawId, title: rawId, sources: [] };

      const text = await fetchText(host, "/api/video?id=" + vid, { Accept: "application/json" });
      let name = "";
      let subtitle = null;
      let pic = coverFor(vid);
      let remark = null;
      let synopsis = null;
      let year = null;
      let region = null;
      let actors = [];
      let directors = [];
      let genres = [];
      const sources = [];

      if (text && text.trim().startsWith("{")) {
        try {
          const data = JSON.parse(text);
          const meta = data.data && typeof data.data === "object" ? data.data : data;
          name = cleanText(
            meta.name || meta.Title || meta.title || meta.vod_name || data.Title || data.title || ""
          );
          subtitle = cleanText(meta.name_sub || meta.sub || "") || null;
          const rawPic =
            meta.cover || meta.Cover || meta.vod_pic || meta.img || data.Cover || data.cover || "";
          if (rawPic) pic = absUrl(host, rawPic) || pic;
          const r = cleanText(
            meta.remark || meta.Remark || meta.remarks || meta.vod_remarks || data.Remark || ""
          );
          if (r) remark = r;
          const desc = cleanText(
            meta.description || meta.desc || meta.Desc || meta.vod_content || data.Desc || ""
          );
          if (desc) synopsis = desc.slice(0, 800);
          year = parseYear(meta.year || meta.Year || meta.vod_year || data.Year || "");
          region = cleanText(meta.area || meta.Area || meta.vod_area || data.Area || "") || null;
          actors = splitNames(meta.actor || meta.Actors || meta.actors || meta.vod_actor || "");
          directors = splitNames(meta.director || meta.Director || meta.vod_director || "");
          genres = splitNames(meta.category_name || meta.Category || meta.type_name || "");

          if (Array.isArray(data.PlayUrlList) && data.PlayUrlList.length > 0) {
            for (var sIdx = 0; sIdx < data.PlayUrlList.length; sIdx++) {
              const grp = data.PlayUrlList[sIdx];
              if (!grp || typeof grp !== "object") continue;
              const sName = cleanText(grp.Origin || grp.origin || grp.name || "") || "线路" + (sIdx + 1);
              const list = Array.isArray(grp.List) ? grp.List : [];
              const eps = [];
              for (var eIdx = 0; eIdx < list.length; eIdx++) {
                const ep = list[eIdx];
                if (!ep || !ep.url) continue;
                const full = absUrl(host, ep.url);
                if (!full) continue;
                eps.push({
                  episodeId: (sIdx + 1) + "-" + (eIdx + 1),
                  name: cleanText(ep.title || ep.name || "") || "第" + (eIdx + 1) + "集",
                  index: eps.length,
                  playData: full,
                });
              }
              if (eps.length > 0) {
                sources.push({ sourceId: "line-" + (sIdx + 1), name: sName, episodes: eps });
              }
            }
          }

          if (sources.length === 0) {
            const singleList = Array.isArray(data.PlayUrls)
              ? data.PlayUrls
              : data.PlayUrl && typeof data.PlayUrl === "object"
                ? [data.PlayUrl]
                : [];
            const eps = [];
            for (var uIdx = 0; uIdx < singleList.length; uIdx++) {
              const ep = singleList[uIdx];
              if (!ep || !ep.url) continue;
              const full = absUrl(host, ep.url);
              if (!full) continue;
              eps.push({
                episodeId: "ep-" + (uIdx + 1),
                name: cleanText(ep.title || ep.origin || "") || "线路" + (uIdx + 1),
                index: eps.length,
                playData: full,
              });
            }
            if (eps.length > 0) {
              sources.push({ sourceId: "hanjuwang", name: "韩剧网", episodes: eps });
            }
          }

          if (sources.length === 0) {
            const covers = data.PlayCovers || data.playCovers || data.Sources || [];
            const eps = [];
            if (Array.isArray(covers)) {
              for (var i = 0; i < covers.length; i++) {
                const c = covers[i];
                if (!c || typeof c !== "object") continue;
                let path = String(c.path || c.url || c.Path || "").trim();
                if (!path && c.id) path = "/api/m3u8?url=" + c.id;
                if (!path) continue;
                const label = cleanText(c.origin || c.name || c.Origin || "") || "线路" + (i + 1);
                const full = absUrl(host, path);
                if (!full) continue;
                eps.push({
                  episodeId: "ep-" + (i + 1),
                  name: label,
                  index: eps.length,
                  playData: full,
                });
              }
            }
            if (eps.length > 0) {
              sources.push({ sourceId: "hanjuwang", name: "韩剧网", episodes: eps });
            }
          }
        } catch (_) {}
      }

      if (sources.length === 0) {
        const html = await fetchText(host, "/live.html?id=" + vid);
        const seen = Object.create(null);
        const eps = [];
        const re = /\/api\/m3u8\?[^"'\s<>]+/gi;
        let m;
        while ((m = re.exec(html)) !== null) {
          const u = m[0].replace(/&amp;/g, "&");
          if (seen[u]) continue;
          seen[u] = true;
          let label = "线路" + (eps.length + 1);
          const om = /origin=([^&]+)/.exec(u);
          if (om) {
            try {
              label = Host.codec.urlDecode(om[1]) || label;
            } catch (_) {}
          }
          const full = absUrl(host, u);
          if (full) {
            eps.push({
              episodeId: "ep-" + (eps.length + 1),
              name: cleanText(label) || "线路" + (eps.length + 1),
              index: eps.length,
              playData: full,
            });
          }
        }
        if (!name && html) {
          const tm = /<title>([^<]+)<\/title>/i.exec(html);
          if (tm) name = cleanText(tm[1]).replace(/\s*[-|—].*$/, "").trim();
        }
        if (eps.length === 0) {
          eps.push({
            episodeId: "ep-1",
            name: "播放",
            index: 0,
            playData: host + "/live.html?id=" + vid,
          });
        }
        sources.push({ sourceId: "hanjuwang", name: "韩剧网", episodes: eps });
      }

      return {
        vodId: vid,
        title: name || vid,
        subtitle: subtitle,
        poster: pic || null,
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
      const headers = { Referer: host + "/", Origin: host };
      let url = absUrl(host, String((payload && payload.playData) || "").trim());
      if (!url) {
        Host.raise("INVALID_PLAY_DATA", "missing playData");
      }

      if (/\.(m3u8|mp4)(\?|$)/i.test(url)) {
        return {
          streams: [{ label: "默认线路", url: url, userAgent: UA, headers: headers }],
        };
      }

      if (url.indexOf("/api/m3u8") >= 0) {
        const body = await fetchText(host, url, {
          Accept: "*/*",
          Referer: host + "/live.html",
        });
        const t = String(body || "").trim();
        if (t && !t.startsWith("#EXTM3U")) {
          if (t.startsWith("{") || t.startsWith("[")) {
            try {
              const j = JSON.parse(t);
              let real = j.url || j.Url || j.play || j.play_url || "";
              if (!real && j.data && typeof j.data === "object") {
                real = j.data.url || j.data.play || "";
              }
              if (real && /^https?:\/\//i.test(String(real))) {
                return {
                  streams: [
                    { label: "默认线路", url: String(real), userAgent: UA, headers: headers },
                  ],
                };
              }
            } catch (_) {}
          }
          const mm = /https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/i.exec(t);
          if (mm) {
            return {
              streams: [
                {
                  label: "默认线路",
                  url: mm[0].replace(/&amp;/g, "&"),
                  userAgent: UA,
                  headers: headers,
                },
              ],
            };
          }
        }
        return {
          streams: [{ label: "默认线路", url: url, userAgent: UA, headers: headers }],
        };
      }

      if (url.indexOf("live.html") >= 0) {
        const html = await fetchText(host, url);
        const mm = /https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4)[^\s"'<>]*/i.exec(html);
        if (mm) {
          return {
            streams: [
              {
                label: "默认线路",
                url: mm[0].replace(/&amp;/g, "&"),
                userAgent: UA,
                headers: headers,
              },
            ],
          };
        }
      }

      return {
        streams: [{ label: "默认线路", url: url, userAgent: UA, headers: headers }],
      };
    },
  };
})();
