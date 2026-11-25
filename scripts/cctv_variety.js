// Ported from cctv_variety.py -> LiveDeck script_js (QuickJS Sandbox)
(function () {
  const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
  const HEADERS = {
    "User-Agent": UA,
    Referer: "https://www.cctv.com/",
    Origin: "https://www.cctv.com",
  };

  const CHANNELS = [
    ["TOPC1451541564922207", "中华情"],
    ["TOPC1451535575561597", "回声嘹亮"],
    ["TOPC1627961377879898", "你好生活第三季"],
    ["TOPC1582272259917160", "我的艺术清单"],
    ["TOPC1451468496522494", "黄金100秒"],
    ["TOPC1451467940101208", "非常6+1"],
    ["TOPC1451984638791216", "向幸福出发"],
    ["TOPC1451984801613379", "幸福账单"],
    ["TOPC1601348042760302", "中国文艺报道"],
    ["TOPC1451547605511387", "舞蹈世界"],
    ["TOPC1451984851125433", "艺览天下"],
    ["TOPC1451535663610626", "天天把歌唱"],
    ["TOPC1611826337610628", "金牌喜剧班"],
    ["TOPC1571300682556971", "环球综艺秀"],
    ["TOPC1579169060379297", "挑战不可能第五季"],
    ["TOPC1451527089955940", "我们有一套"],
    ["TOPC1451527001597710", "为了你"],
    ["TOPC1487120479377477", "朗读者第一季"],
    ["TOPC1474277421637816", "挑战不可能第二季"],
    ["TOPC1451464786232149", "精彩一刻"],
    ["TOPC1547519813971570", "挑战不可能之加油中国"],
    ["TOPC1452063816677656", "挑战不可能第一季"],
    ["TOPC1564019920570762", "机智过人第三季"],
    ["TOPC1547521714115947", "经典咏流传第二季"],
    ["TOPC1509500865106312", "挑战不可能第三季"],
    ["TOPC1513676755770201", "经典咏流传第一季"],
    ["TOPC1516784350726581", "欢乐中国人第二季"],
    ["TOPC1569729252342702", "故事里的中国第一季"],
    ["TOPC1604397385056621", "你好生活第二季"],
    ["TOPC1590026042145705", "喜上加喜"],
    ["TOPC1577697653272281", "走在回家的路上"],
    ["TOPC1451985071887935", "综艺盛典"],
    ["TOPC1451984891490556", "艺术人生"],
    ["TOPC1474275463547690", "全家好拍档"],
    ["TOPC1451984047073332", "大魔术师"],
    ["TOPC1451984214170587", "欢乐一家亲"],
    ["TOPC1451984378754815", "开心辞典"],
    ["TOPC1451985188986150", "综艺星天地"],
    ["TOPC1451984341218765", "激情广场"],
    ["TOPC1451984731428297", "笑星大联盟"],
    ["TOPC1451984447718918", "天天乐"],
    ["TOPC1451984242834620", "欢乐英雄"],
    ["TOPC1451984301286720", "欢乐中国行"],
    ["TOPC1451538709371329", "我爱满堂彩"],
    ["TOPC1569226855085860", "综艺头条"],
    ["TOPC1451542029126607", "魔法奇迹"],
  ];

  function cleanText(raw) {
    return String(raw || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function absHttps(u) {
    const s = String(u || "").trim();
    if (!s) return null;
    if (s.startsWith("//")) return "https:" + s;
    return s.replace(/^http:\/\//i, "https://");
  }

  function parseYear(raw) {
    const m = /(\d{4})/.exec(String(raw || ""));
    if (!m) return null;
    const n = parseInt(m[1], 10);
    return n >= 1900 && n <= 2100 ? n : null;
  }

  async function fetchJson(url, params) {
    try {
      const resp = await Host.http.get(url, {
        params: params || undefined,
        headers: HEADERS,
        insecureTls: true,
        timeout: 15,
      });
      if (!resp || !resp.ok) return {};
      const data = resp.json();
      return data && typeof data === "object" ? data : {};
    } catch (_) {
      return {};
    }
  }

  async function fetchText(url) {
    try {
      const resp = await Host.http.get(url, {
        headers: HEADERS,
        insecureTls: true,
        timeout: 12,
      });
      return resp && resp.ok ? resp.bodyText || resp.body || "" : "";
    } catch (_) {
      return "";
    }
  }

  function mapList(rows) {
    const items = [];
    if (!Array.isArray(rows)) return items;
    for (var i = 0; i < rows.length; i++) {
      const vod = rows[i];
      if (!vod || !vod.guid || !vod.title) continue;
      const img = absHttps(vod.image || "");
      const vodId = img ? vod.guid + "###" + img : String(vod.guid);
      items.push({
        vodId: vodId,
        title: cleanText(vod.title),
        poster: img,
        remark: cleanText(vod.time || "") || null,
        year: parseYear(vod.time || vod.title),
        kind: "variety",
      });
    }
    return items;
  }

  async function fetchCategory(tid, page) {
    const endpoint = tid.startsWith("TOPC")
      ? "https://api.cntv.cn/NewVideo/getVideoListByColumn"
      : "https://api.cntv.cn/NewVideo/getVideoListByAlbumIdNew";
    const json = await fetchJson(endpoint, {
      id: tid,
      p: String(page),
      n: "20",
      sort: "desc",
      mode: "0",
      serviceId: "tvcctv",
      t: "json",
    });
    const data = json.data || {};
    const list = Array.isArray(data.list) ? data.list : [];
    const total = parseInt(data.total || 0, 10) || 0;
    const totalPages = total > 0 ? Math.max(1, Math.ceil(total / 20)) : list.length >= 20 ? page + 1 : page;
    return {
      items: mapList(list),
      page: page,
      totalPages: totalPages,
      hasMore: page < totalPages,
    };
  }

  globalThis.LiveDeckVod = {
    async home() {
      const first = await fetchCategory(CHANNELS[0][0], 1);
      return {
        categories: CHANNELS.map(function (c) {
          return { id: c[0], name: c[1], filters: [] };
        }),
        featured: first.items,
      };
    },

    async category(payload) {
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10));
      const tid = String((payload && payload.categoryId) || CHANNELS[0][0]).trim();
      return fetchCategory(tid, page);
    },

    async search(payload) {
      const page = Math.max(1, parseInt((payload && payload.page) || 1, 10));
      return { items: [], page: page, totalPages: 1, hasMore: false };
    },

    async detail(payload) {
      const raw = String((payload && payload.vodId) || "").trim();
      const parts = raw.split("###");
      const guid = parts[0].trim();
      const passedPoster = parts[1] ? absHttps(parts[1]) : null;

      const jo = await fetchJson("https://vdn.apps.cntv.cn/api/getHttpVideoInfo.do", {
        pid: guid,
      });
      const title = cleanText(jo.title || "") || "央视综艺 " + guid;
      const hlsUrl = absHttps(jo.hls_url || "");
      const dur = parseInt((jo.video && jo.video.totalLength) || 0, 10);
      const episodes = hlsUrl
        ? [
            {
              episodeId: guid,
              name: title,
              index: 0,
              playData: hlsUrl,
              durationSec: dur > 0 ? dur : null,
            },
          ]
        : [];

      return {
        vodId: raw,
        title: title,
        poster: passedPoster,
        year: parseYear(jo.f_mtime || title),
        synopsis: cleanText(jo.tag || "") || null,
        kind: "variety",
        sources: episodes.length > 0 ? [{ sourceId: "cctv", name: "CCTV", episodes: episodes }] : [],
      };
    },

    async play(payload) {
      const masterUrl = absHttps((payload && payload.playData) || "");
      if (!masterUrl) {
        Host.raise("INVALID_PLAY_DATA", "cctv_variety missing hls_url");
      }

      const streams = [];
      const rawText = await fetchText(masterUrl);
      if (rawText) {
        const lines = rawText.split(/\r?\n/);
        let sampleSubPath = "";
        for (var i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (line && !line.startsWith("#")) {
            sampleSubPath = line;
            break;
          }
        }

        const originMatch = /^(https?:\/\/[^/]+)/i.exec(masterUrl);
        if (originMatch && sampleSubPath) {
          const prefix = originMatch[1];
          const segs = sampleSubPath.replace(/^\/+/, "").split("/");
          if (segs.length >= 4) {
            const presets = [
              ["2000", "超清 2000K", 1080],
              ["1200", "高清 1200K", 720],
              ["850", "标清 850K", 480],
            ];
            const candidates = [];
            const reqs = [];
            for (var p = 0; p < presets.length; p++) {
              const copy = segs.slice();
              copy[2] = presets[p][0];
              copy[copy.length - 1] = presets[p][0] + ".m3u8";
              const hdUrl = prefix + "/" + copy.join("/");
              candidates.push({
                label: presets[p][1],
                quality: presets[p][2],
                url: hdUrl,
              });
              reqs.push({
                url: hdUrl,
                method: "HEAD",
                headers: HEADERS,
                insecureTls: true,
                timeout: 6,
              });
            }
            try {
              const resps = await Host.http.batch(reqs, 3);
              for (var r = 0; r < resps.length; r++) {
                if (resps[r] && resps[r].ok && resps[r].response && resps[r].response.status === 200) {
                  streams.push({
                    label: candidates[r].label,
                    quality: candidates[r].quality,
                    url: candidates[r].url,
                    userAgent: UA,
                    headers: HEADERS,
                  });
                }
              }
            } catch (_) {}
          }
        }
      }

      if (rawText || streams.length === 0) {
        streams.push({
          label: streams.length > 0 ? "自适应" : "默认线路",
          quality: null,
          url: masterUrl,
          userAgent: UA,
          headers: HEADERS,
        });
      }

      return { streams: streams };
    },
  };
})();
