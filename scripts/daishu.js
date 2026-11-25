// Ported from daishu.py -> LiveDeck script_js (QuickJS Sandbox)
(function () {
  const DEFAULT_HOST = "https://dsystv.com";
  const UA =
    "Mozilla/5.0 (Linux; Android 11; SAMSUNG SM-G973U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.141 Mobile Safari/537.36";

  const CATS = [
    ["1", "电影", "movie"],
    ["2", "电视剧", "series"],
    ["3", "综艺", "variety"],
    ["4", "动漫", "anime"],
    ["44", "短剧", "series"],
  ];

  const KIND_MAP = {
    "1": "movie",
    "2": "series",
    "3": "variety",
    "4": "anime",
    "44": "series",
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

  function isVideoFormat(url) {
    return /\.(m3u8|mp4|flv|avi|mkv|mov|ts)(\?|$)/i.test(String(url || ""));
  }

  function baseHeaders(host) {
    return {
      "User-Agent": UA,
      Referer: host + "/",
      Origin: host,
      "Accept-Language": "zh-CN,zh;q=0.9",
    };
  }

  async function fetchHtml(host, pathOrUrl) {
    const url = /^https?:\/\//i.test(pathOrUrl)
      ? pathOrUrl
      : host + (pathOrUrl.startsWith("/") ? pathOrUrl : "/" + pathOrUrl);
    try {
      const resp = await Host.http.get(url, {
        headers: baseHeaders(host),
        insecureTls: true,
        timeout: 15,
      });
      return resp && resp.ok ? resp.bodyText || resp.body || "" : "";
    } catch (_) {
      return "";
    }
  }

  async function postSearch(host, kw) {
    try {
      const resp = await Host.http.request({
        url: host + "/search.php",
        method: "POST",
        form: { searchword: kw },
        headers: baseHeaders(host),
        insecureTls: true,
        timeout: 15,
      });
      return resp && resp.ok ? resp.bodyText || resp.body || "" : "";
    } catch (_) {
      return "";
    }
  }

  function parseList(host, html, kind) {
    const items = [];
    const seen = Object.create(null);
    if (!html) return items;

    const re1 =
      /<a[^>]+class=["'][^"']*videopic[^"']*["'][^>]+href=["']\/movie\/index(\d+)\.html["'][^>]*title=["']([^"']+)["']([\s\S]{0,1200}?)<\/a>/gi;
    let m;
    while ((m = re1.exec(html)) !== null) {
      const vid = m[1];
      if (seen[vid]) continue;
      const title = cleanText(m[2]);
      if (!title || isUnsafeText(title)) continue;
      seen[vid] = true;

      const block = m[0];
      let pic = null;
      const imgRe =
        /(?:data-original|data-src)=["']([^"']+\.(?:jpg|jpeg|png|webp|gif)[^"']*)["']/gi;
      let im;
      while ((im = imgRe.exec(block)) !== null) {
        const p = im[1];
        if (
          p.indexOf("load.gif") === -1 &&
          p.indexOf("nopic") === -1 &&
          p.indexOf("logo") === -1 &&
          p.indexOf("templets") === -1
        ) {
          pic = absUrl(host, p);
          break;
        }
      }
      if (!pic) {
        const srcRe =
          /src=["']([^"']+\.(?:jpg|jpeg|png|webp|gif)[^"']*)["']/gi;
        while ((im = srcRe.exec(block)) !== null) {
          const p = im[1];
          if (
            p.indexOf("load.gif") === -1 &&
            p.indexOf("nopic") === -1 &&
            p.indexOf("logo") === -1 &&
            p.indexOf("templets") === -1
          ) {
            pic = absUrl(host, p);
            break;
          }
        }
      }

      const rm =
        cleanText(
          match1(
            block,
            /<span[^>]+class=["'][^"']*note[^"']*["'][^>]*>([\s\S]*?)<\/span>/i
          ) ||
            match1(
              block,
              /<span[^>]+class=["'][^"']*textbg[^"']*["'][^>]*>([\s\S]*?)<\/span>/i
            )
        ) || null;

      items.push({
        vodId: vid,
        title: title.slice(0, 90),
        poster: pic,
        remark: rm,
        kind: kind || null,
      });
    }

    if (items.length === 0) {
      const re2 =
        /href=["']\/movie\/index(\d+)\.html["'][^>]*title=["']([^"']+)["'][\s\S]{0,1200}?<img([^>]+)>/gi;
      while ((m = re2.exec(html)) !== null) {
        const vid = m[1];
        if (seen[vid]) continue;
        const title = cleanText(m[2]);
        if (!title || isUnsafeText(title)) continue;
        seen[vid] = true;

        const attrs = m[3];
        let picRaw =
          match1(attrs, /(?:data-original|data-src)=["']([^"']+)["']/i) ||
          match1(attrs, /src=["']([^"']+)["']/i);
        if (
          picRaw &&
          (picRaw.indexOf("load.gif") !== -1 ||
            picRaw.indexOf("templets") !== -1)
        ) {
          picRaw = "";
        }

        items.push({
          vodId: vid,
          title: title.slice(0, 90),
          poster: absUrl(host, picRaw),
          remark: null,
          kind: kind || null,
        });
      }
    }

    return items;
  }

  function extractEpisodesFromHtml(host, html) {
    const eps = [];
    const seen = Object.create(null);
    if (!html) return eps;

    const re1 =
      /<a[^>]+title=["']([^"']+)["'][^>]+href=["']([^"']*?\/play\/[^"']+)["']/gi;
    let m;
    while ((m = re1.exec(html)) !== null) {
      const t = cleanText(m[1]);
      const u = absUrl(host, m[2]);
      if (t && u && !seen[u]) {
        seen[u] = true;
        eps.push({ name: t, url: u });
      }
    }

    if (eps.length === 0) {
      const re2 =
        /<a[^>]+href=["']([^"']*?\/play\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
      while ((m = re2.exec(html)) !== null) {
        const t = cleanText(m[2]);
        const u = absUrl(host, m[1]);
        if (t && u && !seen[u]) {
          seen[u] = true;
          eps.push({ name: t, url: u });
        }
      }
    }

    return eps;
  }

  async function extractPlaySources(host, html, vid) {
    const sources = [];
    const usedNames = Object.create(null);

    function addSource(rawName, eps) {
      if (!eps || eps.length === 0) return;
      const base = cleanText(rawName) || "线路" + (sources.length + 1);
      if (isUnsafeText(base)) return;
      let name = base;
      if (usedNames[name]) {
        name = base + (sources.length + 1);
      }
      usedNames[name] = true;
      const sid = "line-" + (sources.length + 1);
      sources.push({
        sourceId: sid,
        name: name,
        episodes: eps.map(function (ep, idx) {
          return {
            episodeId: sid + "-" + (idx + 1),
            name: ep.name,
            index: idx,
            playData: ep.url,
          };
        }),
      });
    }

    const panelSections = String(html || "").split(
      /(?=<div[^>]+class=["'][^"']*panel[^"']*["'][^>]+data-playlist-name=)/i
    );
    for (var i = 0; i < panelSections.length; i++) {
      const section = panelSections[i];
      const name = match1(section, /data-playlist-name=["']([^"']+)["']/i);
      if (!name) continue;
      const ul =
        match1(
          section,
          /<ul[^>]+class=["'][^"']*playlistlink[^"']*["'][^>]*>([\s\S]*?)<\/ul>/i
        ) || match1(section, /<ul[^>]*>([\s\S]*?)<\/ul>/i);
      let eps = ul ? extractEpisodesFromHtml(host, ul) : [];
      if (eps.length === 0) {
        const plUrl = match1(section, /data-playlist-url=["']([^"']+)["']/i);
        if (plUrl) {
          const fullUrl = absUrl(host, plUrl.replace(/&amp;/g, "&"));
          if (fullUrl) {
            const subHtml = await fetchHtml(host, fullUrl);
            eps = extractEpisodesFromHtml(host, subHtml);
          }
        }
      }
      addSource(name, eps);
    }

    if (sources.length === 0) {
      const plSections = String(html || "").split(
        /(?=<div[^>]+class=["'][^"']*playlist[^"']*["'][^>]*>)/i
      );
      for (var j = 0; j < plSections.length; j++) {
        const sec = plSections[j];
        const ul = match1(sec, /<ul[^>]*>([\s\S]*?)<\/ul>/i);
        if (!ul) continue;
        const eps = extractEpisodesFromHtml(host, ul);
        if (eps.length === 0) continue;
        const name =
          match1(sec, /data-playlist-name=["']([^"']+)["']/i) ||
          match1(
            sec,
            /<a[^>]+class=["'][^"']*option[^"']*["'][^>]*title=["']([^"']+)["']/i
          ) ||
          match1(sec, /<span class="playlist-line-name">([^<]+)<\/span>/i) ||
          "线路" + (sources.length + 1);
        addSource(name, eps);
      }
    }

    if (sources.length === 0) {
      const eps = [];
      const seen = Object.create(null);
      const escapedVid = String(vid).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(
        '<a[^>]+href=["\']([^"\']*?\\/play\\/' +
          escapedVid +
          '-[^"\']+)["\'][^>]*>([\\s\\S]*?)<\\/a>',
        "gi"
      );
      let m;
      while ((m = re.exec(html || "")) !== null) {
        const u = absUrl(host, m[1]);
        const t = cleanText(m[2]) || "播放";
        if (u && !seen[u]) {
          seen[u] = true;
          eps.push({ name: t, url: u });
        }
      }
      addSource("默认", eps);
    }

    return sources;
  }

  globalThis.LiveDeckVod = {
    async home(payload) {
      const host = getHost(payload && payload.config);
      const html = await fetchHtml(host, "/");
      return {
        categories: CATS.map(function (c) {
          return { id: c[0], name: c[1], filters: [] };
        }),
        featured: parseList(host, html, null).slice(0, 48),
      };
    },

    async category(payload) {
      const host = getHost(payload && payload.config);
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10) || 1);
      const tid = String((payload && payload.categoryId) || "1").trim();
      const path =
        page <= 1
          ? "/frim/index" + tid + ".html"
          : "/search.php?searchtype=5&tid=" +
            Host.codec.urlEncode(tid) +
            "&page=" +
            page;
      const html = await fetchHtml(host, path);
      const items = parseList(host, html, KIND_MAP[tid] || null);
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
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10) || 1);
      const kw = String((payload && payload.keyword) || "").trim();
      if (!kw) return { items: [], page: page, totalPages: 1, hasMore: false };

      let html = "";
      if (page === 1) {
        html = await postSearch(host, kw);
      }
      let items = parseList(host, html, null);
      if (items.length === 0) {
        html = await fetchHtml(
          host,
          "/search.php?searchword=" + Host.codec.urlEncode(kw) + "&page=" + page
        );
        items = parseList(host, html, null);
      }
      const hasMore = items.length >= 18;
      return {
        items: items,
        page: page,
        totalPages: hasMore ? page + 1 : page,
        hasMore: hasMore,
      };
    },

    async detail(payload) {
      const host = getHost(payload && payload.config);
      const raw = String((payload && payload.vodId) || "").trim();
      const vid = raw.replace(/\D+/g, "") || raw;
      const html = await fetchHtml(host, "/movie/index" + vid + ".html");
      if (!html) {
        return {
          vodId: vid,
          title: "袋鼠影视 " + vid,
          poster: null,
          actors: [],
          directors: [],
          genres: [],
          sources: [],
        };
      }

      let title = cleanText(
        match1(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i) ||
          match1(html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i)
      );
      title = title
        .replace(/全集在线观看\s*-\s*国产剧\s*\|\s*袋鼠影视/g, "")
        .replace(/全集在线观看\s*-\s*袋鼠影视/g, "")
        .replace(/[《》]/g, "")
        .trim();

      const poster = absUrl(
        host,
        match1(html, /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)["']/i) ||
          match1(
            html,
            /<a[^>]+class=["'][^"']*videopic[^"']*["'][\s\S]*?<img[^>]+(?:data-original|data-src)=["']([^"']+)["']/i
          ) ||
          match1(
            html,
            /<a[^>]+class=["'][^"']*videopic[^"']*["'][\s\S]*?<img[^>]+src=["']([^"']+)["']/i
          )
      );

      const synopsis =
        cleanText(
          match1(html, /<div[^>]*class=["'][^"']*video-plot[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) ||
            match1(html, /<div class="plot"[^>]*>\s*<p>([\s\S]*?)<\/p>/i) ||
            match1(html, /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i)
        ).slice(0, 800) || null;

      const actorStr = match1(
        html,
        /<li[^>]+data-video-meta=["']([^"']*)["'][^>]*><span class="text-muted">主演：/i
      );
      const directorStr = match1(
        html,
        /<li[^>]+data-video-meta=["']([^"']*)["'][^>]*><span class="text-muted">导演：/i
      );
      const year = parseYear(match1(html, /年份：<\/span>([^<]+)/i));
      const region = cleanText(match1(html, /地区：<\/span>([^<]+)/i)) || null;
      const cate = cleanText(match1(html, /类型：<\/span><a[^>]*>([\s\S]*?)<\/a>/i));
      const remark = cleanText(match1(html, /<span class="note textbg">([\s\S]*?)<\/span>/i)) || null;

      if (isUnsafeText(title) || isUnsafeText(cate)) {
        Host.raise("CONTENT_FILTERED", "filtered unsafe content");
      }

      const sources = await extractPlaySources(host, html, vid);

      return {
        vodId: vid,
        title: title || "袋鼠影视 " + vid,
        poster: poster,
        remark: remark,
        year: year,
        region: region,
        genres: cate ? splitNames(cate) : [],
        actors: splitNames(actorStr),
        directors: splitNames(directorStr),
        synopsis: synopsis,
        sources: sources,
      };
    },

    async play(payload) {
      const host = getHost(payload && payload.config);
      const raw = String((payload && payload.playData) || "").trim();
      if (!raw) {
        Host.raise("INVALID_PLAY_DATA", "missing daishu playData");
      }
      if (isVideoFormat(raw) && /^https?:\/\//i.test(raw)) {
        return {
          streams: [
            {
              label: "默认线路",
              url: raw,
              userAgent: UA,
              headers: { Referer: host + "/", Origin: host },
            },
          ],
        };
      }

      const pageUrl = absUrl(host, raw);
      const html = await fetchHtml(host, pageUrl);
      let playUrl = match1(html, /var\s+now\s*=\s*["']([^"']+)["']/i);

      if (!playUrl) {
        const jsonStr = Host.text.extractJson(html, "player_aaaa");
        if (jsonStr) {
          try {
            const obj = JSON.parse(jsonStr);
            let u = String(obj.url || "").trim();
            const enc = parseInt(obj.encrypt || 0, 10);
            if (enc === 1) u = Host.codec.urlDecode(u);
            else if (enc === 2) u = Host.codec.urlDecode(Host.crypto.base64Decode(u));
            playUrl = u;
          } catch (_) {}
        }
      }

      if (!playUrl) {
        playUrl = match1(
          html,
          /["']([^"']+\.(?:m3u8|mp4|flv|avi|mkv|mov|ts)[^"']*)["']/i
        );
      }

      if (!playUrl) {
        playUrl = match1(
          html,
          /<(?:iframe|embed|source|video)[^>]+src=["']([^"']+)["']/i
        );
      }

      if (playUrl) {
        try {
          if (playUrl.indexOf("%") !== -1) {
            playUrl = Host.codec.urlDecode(playUrl);
          }
        } catch (_) {}
        playUrl = absUrl(host, playUrl) || playUrl;
      }

      return {
        streams: [
          {
            label: "默认线路",
            url: playUrl || pageUrl,
            userAgent: UA,
            headers: { Referer: host + "/", Origin: host },
          },
        ],
      };
    },
  };
})();
