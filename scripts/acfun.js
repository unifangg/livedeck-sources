// Ported from acfun.py -> LiveDeck script_js (QuickJS Sandbox)
(function () {
  const SITE_URL = "https://www.acfun.cn";
  const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

  const CHANNELS = [
    ["60", "全部番剧", "anime"],
    ["61", "番剧", "anime"],
    ["62", "电视剧", "series"],
    ["63", "真人短剧", "series"],
    ["64", "漫剧", "anime"],
    ["65", "AI剧", "anime"],
  ];

  const KIND_MAP = {
    "60": "anime",
    "61": "anime",
    "62": "series",
    "63": "series",
    "64": "anime",
    "65": "anime",
  };

  const BANGUMI_FILTERS = [
    {
      key: "status",
      name: "状态",
      defaultValue: "20",
      options: [
        { value: "20", label: "全部" },
        { value: "21", label: "连载中" },
        { value: "22", label: "已完结" },
        { value: "23", label: "即将上映" },
      ],
    },
    {
      key: "sort",
      name: "排序",
      defaultValue: "11",
      options: [
        { value: "11", label: "最近更新" },
        { value: "12", label: "推荐" },
      ],
    },
  ];

  function cleanText(raw) {
    return String(raw || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/\s+/g, " ")
      .trim();
  }

  function absUrl(u) {
    const s = String(u || "").trim();
    if (!s) return null;
    if (s.startsWith("//")) return "https:" + s;
    if (/^https?:\/\//i.test(s)) return s;
    return SITE_URL + (s.startsWith("/") ? s : "/" + s);
  }

  function parseYear(raw) {
    const m = /(\d{4})/.exec(String(raw || ""));
    if (!m) return null;
    const n = parseInt(m[1], 10);
    return n >= 1900 && n <= 2100 ? n : null;
  }

  async function fetchHtml(url) {
    try {
      const resp = await Host.http.get(url, {
        headers: {
          "User-Agent": UA,
          Referer: SITE_URL + "/",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
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

  function parseBangumiList(html, kind) {
    const items = [];
    const seen = Object.create(null);
    if (!html) return items;
    const nodes = Host.html.selectAll(html, "ul.ac-mod-ul li.ac-mod-li");
    for (var i = 0; i < nodes.length; i++) {
      const nodeHtml = nodes[i].html || "";
      const link = Host.html.select(nodeHtml, "a.ac-mod-link");
      const titleDiv = Host.html.select(nodeHtml, "div.ac-mod-title");
      const img = Host.html.select(nodeHtml, "img");
      const em = Host.html.select(nodeHtml, "em");

      const href = link && link.attrs && link.attrs.href ? String(link.attrs.href) : "";
      const mId = /\/bangumi\/aa(\d+)/.exec(href);
      if (!mId) continue;
      const vodId = "aa" + mId[1];
      if (seen[vodId]) continue;
      seen[vodId] = true;

      const title = cleanText(
        (titleDiv && ((titleDiv.attrs && titleDiv.attrs.title) || titleDiv.text)) || ""
      );
      if (!title) continue;

      const poster = img && img.attrs && img.attrs.src ? absUrl(img.attrs.src) : null;
      const remark = em && em.text ? cleanText(em.text) : null;

      items.push({
        vodId: vodId,
        title: title,
        poster: poster,
        remark: remark || null,
        kind: kind || "anime",
      });
    }
    return items;
  }

  function normalizeVodPath(vodId) {
    const raw = String(vodId || "").trim();
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith("/")) return SITE_URL + raw;
    if (/^aa\d+/.test(raw)) return SITE_URL + "/bangumi/" + raw;
    if (/^ac\d+/.test(raw)) return SITE_URL + "/v/" + raw;
    if (/^\d+$/.test(raw)) return SITE_URL + "/bangumi/aa" + raw;
    return SITE_URL + "/" + raw;
  }

  function parsePlayStreams(html) {
    const streams = [];
    const seen = Object.create(null);
    const playHeaders = { Referer: SITE_URL + "/", Origin: SITE_URL };

    const markers = ["window.bangumiData", "window.videoInfo"];
    let ksPlayStr = "";
    for (var m = 0; m < markers.length; m++) {
      const jsonStr = Host.text.extractJson(html, markers[m]);
      if (!jsonStr) continue;
      try {
        const obj = JSON.parse(jsonStr);
        if (obj && obj.currentVideoInfo && obj.currentVideoInfo.ksPlayJson) {
          ksPlayStr = String(obj.currentVideoInfo.ksPlayJson);
          break;
        }
      } catch (_) {}
    }

    if (ksPlayStr) {
      try {
        const ks = JSON.parse(ksPlayStr);
        const sets = Array.isArray(ks.adaptationSet) ? ks.adaptationSet : [];
        if (sets.length > 0 && Array.isArray(sets[0].representation)) {
          const reps = sets[0].representation.slice().sort(function (a, b) {
            return (parseInt((b && b.height) || 0, 10) || 0) -
              (parseInt((a && a.height) || 0, 10) || 0);
          });
          for (var i = 0; i < reps.length; i++) {
            const rep = reps[i];
            const u = String((rep && rep.url) || "").trim();
            if (!u || seen[u]) continue;
            seen[u] = true;
            const h = parseInt(rep.height || 0, 10);
            const label =
              cleanText(rep.qualityLabel || rep.qualityType || "") ||
              (h > 0 ? h + "P" : "默认线路");
            streams.push({
              label: label,
              quality: h > 0 ? h : null,
              codec: rep.codecs ? String(rep.codecs) : null,
              url: u,
              userAgent: UA,
              headers: playHeaders,
            });
          }
        }
      } catch (_) {}
    }

    if (streams.length === 0) {
      const unesc = html.replace(/\\\//g, "/").replace(/\\"/g, '"');
      const mu = /"url"\s*:\s*"(https?:\/\/[^"]+?\.m3u8[^"]*)"/i.exec(unesc);
      if (mu) {
        streams.push({
          label: "默认线路",
          quality: null,
          url: mu[1],
          userAgent: UA,
          headers: playHeaders,
        });
      }
    }

    return streams;
  }

  globalThis.LiveDeckVod = {
    async home() {
      const html = await fetchHtml(SITE_URL + "/bangumilist?pageNum=1");
      const featured = parseBangumiList(html, "anime");
      return {
        categories: CHANNELS.map(function (c) {
          return {
            id: c[0],
            name: c[1],
            filters: BANGUMI_FILTERS,
          };
        }),
        featured: featured,
      };
    },

    async category(payload) {
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10));
      const cid = String((payload && payload.categoryId) || "60").trim();
      const filters = (payload && payload.filters) || {};
      const status = String(filters.status || "20").trim();
      const sort = String(filters.sort || "11").trim();

      let url = SITE_URL + "/bangumilist?pageNum=" + page;
      if (cid !== "60" || status !== "20" || sort !== "11") {
        url =
          SITE_URL +
          "/bangumilist?filters=" +
          [cid, status, sort, "805306368"].join(",") +
          "&pageNum=" +
          page;
      }

      const html = await fetchHtml(url);
      const items = parseBangumiList(html, KIND_MAP[cid] || "anime");
      const hasMore = items.length >= 24;
      return {
        items: items,
        page: page,
        totalPages: hasMore ? page + 1 : page,
        hasMore: hasMore,
      };
    },

    async search(payload) {
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10));
      const kw = String((payload && payload.keyword) || "").trim();
      if (!kw) return { items: [], page: page, totalPages: 1, hasMore: false };

      const html = await fetchHtml(
        SITE_URL + "/search?keyword=" + Host.codec.urlEncode(kw) + "&pCursor=" + page
      );
      const items = [];
      const seen = Object.create(null);

      const re = /bigPipe\.onPageletArrive\(([\s\S]*?)\)\s*;?\s*<\/script>/g;
      let m;
      while ((m = re.exec(html)) !== null) {
        let obj = null;
        try {
          obj = JSON.parse(m[1]);
        } catch (_) {
          continue;
        }
        const pHtml = (obj && obj.html) || "";
        if (!pHtml) continue;

        const bangumis = Host.html.selectAll(pHtml, "div.search-bangumi, div.bangumi__cover");
        for (var i = 0; i < bangumis.length; i++) {
          const bHtml = bangumis[i].html || "";
          const cm = /content_id"\s*:\s*(\d+)/.exec(bHtml);
          const am = /href="[^"]*\/bangumi\/aa(\d+)/.exec(bHtml);
          const bid = (cm && cm[1]) || (am && am[1]);
          if (!bid) continue;
          const vodId = "aa" + bid;
          if (seen[vodId]) continue;
          seen[vodId] = true;
          const img = Host.html.select(bHtml, "img");
          const title = cleanText((img && img.attrs && img.attrs.alt) || "");
          if (!title) continue;
          const epInfo = Host.html.select(bHtml, "span.episode-info");
          items.push({
            vodId: vodId,
            title: title,
            poster: img && img.attrs && img.attrs.src ? absUrl(img.attrs.src) : null,
            remark: epInfo && epInfo.text ? cleanText(epInfo.text) : null,
            kind: "anime",
          });
        }

        const vCards = Host.html.selectAll(pHtml, "div.search-video");
        for (var j = 0; j < vCards.length; j++) {
          const vHtml = vCards[j].html || "";
          const aNode = Host.html.select(vHtml, "div.video__main__title a, a[href*='/v/ac']");
          const href = aNode && aNode.attrs && aNode.attrs.href ? String(aNode.attrs.href) : "";
          const vm = /\/v\/(ac\d+)/.exec(href);
          if (!vm) continue;
          const vodId = vm[1];
          if (seen[vodId]) continue;
          seen[vodId] = true;
          const titleNode = Host.html.select(vHtml, "div.video__main__title");
          const title = cleanText((titleNode && titleNode.text) || (aNode && aNode.text) || "");
          if (!title) continue;
          const img = Host.html.select(vHtml, "img");
          const dur = Host.html.select(vHtml, "span.video__duration");
          items.push({
            vodId: vodId,
            title: title,
            poster: img && img.attrs && img.attrs.src ? absUrl(img.attrs.src) : null,
            remark: dur && dur.text ? cleanText(dur.text) : null,
            kind: "other",
          });
        }
      }

      const hasMore = items.length >= 20;
      return {
        items: items,
        page: page,
        totalPages: hasMore ? page + 1 : page,
        hasMore: hasMore,
      };
    },

    async detail(payload) {
      const raw = String((payload && payload.vodId) || "").trim();
      const pageUrl = normalizeVodPath(raw);
      const html = await fetchHtml(pageUrl);
      if (!html) {
        return { vodId: raw, title: raw, actors: [], directors: [], sources: [] };
      }

      const isBangumi = pageUrl.indexOf("bangumi") >= 0;
      let info = {};
      const jsonStr = Host.text.extractJson(
        html,
        isBangumi ? "window.bangumiData" : "window.videoInfo"
      );
      if (jsonStr) {
        try {
          info = JSON.parse(jsonStr) || {};
        } catch (_) {}
      }

      const title =
        cleanText(info.bangumiTitle || info.title || "") ||
        cleanText(Host.html.text(html, "h1.title")) ||
        raw;

      let poster = null;
      const covV =
        info.coverImgVInfo &&
        info.coverImgVInfo.thumbnailImage &&
        info.coverImgVInfo.thumbnailImage.cdnUrls &&
        info.coverImgVInfo.thumbnailImage.cdnUrls[0] &&
        info.coverImgVInfo.thumbnailImage.cdnUrls[0].url;
      if (covV) poster = absUrl(covV);
      else if (info.bangumiCoverImageV) poster = absUrl(info.bangumiCoverImageV);
      else if (info.coverUrl) poster = absUrl(info.coverUrl);

      const episodes = [];
      if (isBangumi) {
        const itemsMatch = /"items"\s*:\s*(\[[\s\S]*?\])\s*[,}]/.exec(html);
        if (itemsMatch) {
          try {
            const epItems = JSON.parse(itemsMatch[1]);
            for (var i = 0; i < epItems.length; i++) {
              const ep = epItems[i];
              if (!ep || !ep.bangumiId || !ep.itemId) continue;
              episodes.push({
                episodeId: String(ep.itemId),
                name: cleanText(ep.title || ep.episodeName || "") || "第" + (i + 1) + "话",
                index: episodes.length,
                playData: SITE_URL + "/bangumi/aa" + ep.bangumiId + "_36188_" + ep.itemId,
              });
            }
          } catch (_) {}
        }
        if (episodes.length === 0 && info.bangumiId && info.itemId) {
          episodes.push({
            episodeId: String(info.itemId),
            name: cleanText(info.episodeName || info.title || "正片"),
            index: 0,
            playData: SITE_URL + "/bangumi/aa" + info.bangumiId + "_36188_" + info.itemId,
          });
        }
      } else {
        const listNodes = Host.html.selectAll(html, "ul.scroll-div li");
        for (var j = 0; j < listNodes.length; j++) {
          const attrs = listNodes[j].attrs || {};
          const href = attrs["data-href"] ? absUrl(attrs["data-href"]) : "";
          if (!href) continue;
          episodes.push({
            episodeId: String(j + 1),
            name: cleanText(attrs.title || listNodes[j].text || "") || "P" + (j + 1),
            index: episodes.length,
            playData: href,
          });
        }
        if (episodes.length === 0) {
          episodes.push({
            episodeId: "1",
            name: cleanText(info.title || "正片"),
            index: 0,
            playData: pageUrl,
          });
        }
      }

      const genres = [];
      if (Array.isArray(info.bangumiStyleList)) {
        for (var g = 0; g < info.bangumiStyleList.length; g++) {
          const st = info.bangumiStyleList[g];
          if (st && st.name) genres.push(cleanText(st.name));
        }
      }

      const upName = cleanText((info.user && info.user.name) || "");
      return {
        vodId: raw,
        title: title,
        poster: poster,
        remark: cleanText(info.updateInfoShow || info.lastUpdateItemName || "") || null,
        year: parseYear(info.firstPlayDate || info.createTime),
        genres: genres,
        actors: upName ? [upName] : [],
        directors: [],
        synopsis: cleanText(info.bangumiIntro || info.introduction || info.description || "").slice(0, 800) || null,
        kind: isBangumi ? "anime" : "other",
        sources: episodes.length > 0 ? [{ sourceId: "acfun", name: "AcFun", episodes: episodes }] : [],
      };
    },

    async play(payload) {
      const raw = String((payload && payload.playData) || "").trim();
      if (!raw) {
        Host.raise("INVALID_PLAY_DATA", "acfun missing playData");
      }
      let targetUrl = raw;
      if (raw.indexOf("@") >= 0 && !/^https?:\/\//i.test(raw)) {
        const parts = raw.split("@");
        targetUrl = SITE_URL + "/bangumi/aa" + parts[0] + "_36188_" + parts[1];
      } else if (!/^https?:\/\//i.test(raw)) {
        targetUrl = normalizeVodPath(raw);
      }

      const html = await fetchHtml(targetUrl);
      const streams = parsePlayStreams(html);
      if (streams.length === 0) {
        Host.raise("NO_STREAM", "acfun could not extract playable stream from " + targetUrl);
      }
      return { streams: streams };
    },
  };
})();
