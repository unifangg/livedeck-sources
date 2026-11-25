// Ported from hema.py -> LiveDeck script_js (QuickJS Sandbox)
(function () {
  const DEFAULT_HOST = "https://www.kuaikaw.cn";
  const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0";

  const CATEGORIES = [
    ["462", "甜宠"],
    ["1102", "古装仙侠"],
    ["1145", "现代言情"],
    ["1170", "青春"],
    ["585", "豪门恩怨"],
    ["417-464", "逆袭"],
    ["439-465", "重生"],
    ["1159", "系统"],
    ["1147", "总裁"],
    ["943", "职场商战"],
  ];

  function getHost(config) {
    const raw = (config && (config.host || config.url)) || DEFAULT_HOST;
    return String(raw).trim().replace(/\/+$/, "") || DEFAULT_HOST;
  }

  function cleanPoster(raw) {
    const s = String(raw || "").trim();
    if (!s) return null;
    if (s.startsWith("//")) return "https:" + s;
    return s;
  }

  function cleanText(raw) {
    return String(raw || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }

  function makeRemark(status, totalChapters) {
    const s = cleanText(status);
    const t = cleanText(totalChapters);
    if (s && t) return s + " " + t + "集";
    if (t) return t + "集";
    return s || null;
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
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        },
        insecureTls: true,
        timeout: 15,
      });
      return resp && resp.ok ? resp.bodyText || resp.body || "" : "";
    } catch (_) {
      return "";
    }
  }

  function extractPageProps(html) {
    if (!html) return {};
    const m = /<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i.exec(html);
    if (!m) return {};
    try {
      const data = JSON.parse(m[1]);
      return (data && data.props && data.props.pageProps) || {};
    } catch (_) {
      return {};
    }
  }

  function mapBooks(books, seen) {
    const out = [];
    if (!Array.isArray(books)) return out;
    for (var i = 0; i < books.length; i++) {
      const b = books[i];
      if (!b || !b.bookId || !b.bookName) continue;
      const vid = String(b.bookId);
      if (seen) {
        if (seen[vid]) continue;
        seen[vid] = true;
      }
      out.push({
        vodId: vid,
        title: String(b.bookName),
        poster: cleanPoster(b.coverWap || b.wapUrl),
        remark: makeRemark(b.statusDesc, b.totalChapterNum),
        kind: "series",
      });
    }
    return out;
  }

  function pickMp4FromChapter(ch) {
    const v = ch && ch.chapterVideoVo;
    if (!v || typeof v !== "object") return "";
    return String(v.mp4 || v.mp4720p || v.vodMp4Url || "").trim();
  }

  globalThis.LiveDeckVod = {
    async home(payload) {
      const host = getHost(payload && payload.config);
      const html = await fetchHtml(host, "/");
      const props = extractPageProps(html);
      const seen = Object.create(null);
      let featured = mapBooks(props.bannerList, seen);
      if (Array.isArray(props.seoColumnVos)) {
        for (var i = 0; i < props.seoColumnVos.length; i++) {
          const col = props.seoColumnVos[i];
          if (col && Array.isArray(col.bookInfos)) {
            featured = featured.concat(mapBooks(col.bookInfos, seen));
          }
        }
      }
      return {
        categories: CATEGORIES.map(function (c) {
          return { id: c[0], name: c[1], filters: [] };
        }),
        featured: featured,
      };
    },

    async category(payload) {
      const host = getHost(payload && payload.config);
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10) || 1);
      const tid = String((payload && payload.categoryId) || "462").trim();
      const html = await fetchHtml(host, "/browse/" + tid + "/" + page);
      const props = extractPageProps(html);
      const curPage = parseInt(props.page || page, 10) || page;
      const totalPages = Math.max(curPage, parseInt(props.pages || curPage, 10) || curPage);
      return {
        items: mapBooks(props.bookList, null),
        page: curPage,
        totalPages: totalPages,
        hasMore: curPage < totalPages,
      };
    },

    async search(payload) {
      const host = getHost(payload && payload.config);
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10) || 1);
      const kw = String((payload && payload.keyword) || "").trim();
      if (!kw) return { items: [], page: 1, totalPages: 1, hasMore: false };
      const html = await fetchHtml(
        host,
        "/search?searchValue=" + Host.codec.urlEncode(kw) + "&page=" + page
      );
      const props = extractPageProps(html);
      const totalPages = Math.max(page, parseInt(props.pages || 1, 10) || 1);
      return {
        items: mapBooks(props.bookList, null),
        page: page,
        totalPages: totalPages,
        hasMore: page < totalPages,
      };
    },

    async detail(payload) {
      const host = getHost(payload && payload.config);
      const raw = String((payload && payload.vodId) || "").trim();
      let bookId = raw;
      if (raw.startsWith("/episode/")) {
        bookId = raw.replace("/episode/", "").split("/")[0];
      } else if (raw.startsWith("/drama/")) {
        bookId = raw.replace("/drama/", "");
      }
      bookId = bookId.replace(/^\/+/, "");

      const html = await fetchHtml(host, "/drama/" + bookId);
      const props = extractPageProps(html);
      const info = props.bookInfoVo || {};
      const chapterList = Array.isArray(props.chapterList) ? props.chapterList : [];

      const genres = [];
      if (Array.isArray(info.categoryList)) {
        for (var i = 0; i < info.categoryList.length; i++) {
          const n = cleanText(info.categoryList[i] && info.categoryList[i].name);
          if (n) genres.push(n);
        }
      }

      const actors = [];
      if (Array.isArray(info.performerList)) {
        for (var j = 0; j < info.performerList.length; j++) {
          const n = cleanText(info.performerList[j] && info.performerList[j].name);
          if (n) actors.push(n);
        }
      }

      const episodes = [];
      for (var k = 0; k < chapterList.length; k++) {
        const ch = chapterList[k];
        if (!ch) continue;
        const cid = String(ch.chapterId || "");
        const cname = cleanText(ch.chapterName || "") || "第" + (k + 1) + "集";
        const mp4 = pickMp4FromChapter(ch);
        if (mp4 && mp4.indexOf(".mp4") >= 0) {
          episodes.push({
            episodeId: cid || String(k + 1),
            name: cname,
            index: episodes.length,
            playData: mp4,
          });
        } else if (cid) {
          episodes.push({
            episodeId: cid,
            name: cname,
            index: episodes.length,
            playData: bookId + "/" + cid,
          });
        }
      }

      return {
        vodId: bookId,
        title: cleanText(info.title || "") || "短剧 " + bookId,
        poster: cleanPoster(info.coverWap),
        remark: info.totalChapterNum ? String(info.totalChapterNum) + "集" : null,
        year: null,
        region: cleanText(info.countryName || "") || null,
        genres: genres,
        actors: actors,
        directors: [],
        synopsis: cleanText(info.introduction || "") || null,
        kind: "series",
        sources: episodes.length > 0 ? [{ sourceId: "hema", name: "河马剧场", episodes: episodes }] : [],
      };
    },

    async play(payload) {
      const host = getHost(payload && payload.config);
      const headers = { Referer: host + "/" };
      const raw = String((payload && payload.playData) || "").trim();
      if (!raw) Host.raise("INVALID_PLAY_DATA", "missing playData");

      if (/^https?:\/\//i.test(raw) && raw.indexOf(".mp4") >= 0) {
        return { streams: [{ label: "默认线路", url: raw, userAgent: UA, headers: headers }] };
      }

      const parts = raw.split("/");
      const bookId = parts[0];
      const chapterId = parts[1] || "";
      const html = await fetchHtml(host, "/episode/" + bookId + "/" + chapterId);
      const props = extractPageProps(html);

      let mp4Url = "";
      const chapterList = Array.isArray(props.chapterList) ? props.chapterList : [];
      for (var i = 0; i < chapterList.length; i++) {
        if (String(chapterList[i] && chapterList[i].chapterId) === chapterId) {
          mp4Url = pickMp4FromChapter(chapterList[i]);
          if (mp4Url) break;
        }
      }
      if (!mp4Url && props.chapterInfo) {
        mp4Url = pickMp4FromChapter(props.chapterInfo);
      }
      if (!mp4Url) {
        const re = /https?:\/\/[^"']+\.mp4[^"']*/g;
        let m;
        while ((m = re.exec(html)) !== null) {
          if (!mp4Url) mp4Url = m[0];
          if (chapterId && m[0].indexOf(chapterId) >= 0) {
            mp4Url = m[0];
            break;
          }
        }
      }

      if (!mp4Url) {
        Host.raise("NO_STREAM", "hema could not extract mp4 for " + raw);
      }
      return { streams: [{ label: "默认线路", url: mp4Url, userAgent: UA, headers: headers }] };
    },
  };
})();
