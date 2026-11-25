// Ported from pianku.py -> LiveDeck script_js (QuickJS Sandbox)
(function () {
  const DEFAULT_HOSTS = [
    "https://4k01.pianku.online",
    "https://www.pianku.online",
  ];
  const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

  const CHANNELS = [
    ["20", "电影"],
    ["37", "剧集"],
    ["43", "动漫"],
    ["45", "综艺"],
    ["47", "B站"],
    ["21", "动作片"],
    ["22", "喜剧片"],
    ["23", "爱情片"],
  ];

  let activeHost = DEFAULT_HOSTS[0];

  function getHosts(config) {
    if (config && config.host) {
      const h = String(config.host).trim().replace(/\/+$/, "");
      if (h) return [h].concat(DEFAULT_HOSTS);
    }
    return DEFAULT_HOSTS;
  }

  function absUrl(host, u) {
    if (!u) return "";
    const s = String(u).trim().replace(/\\\//g, "/");
    if (s.startsWith("//")) return "https:" + s;
    if (/^https?:\/\//i.test(s)) return s;
    return host + (s.startsWith("/") ? s : "/" + s);
  }

  function cleanText(t) {
    return String(t || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/\s+/g, " ")
      .trim();
  }

  async function fetchRaw(url, referer) {
    try {
      const resp = await Host.http.get(url, {
        headers: {
          "User-Agent": UA,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
          Referer: referer,
        },
        insecureTls: true,
        timeout: 15,
      });
      return resp && resp.ok ? resp.bodyText || resp.body || "" : "";
    } catch (_) {
      return "";
    }
  }

  async function fetchHtml(config, pathOrUrl) {
    const hosts = getHosts(config);
    const ordered = [activeHost].concat(
      hosts.filter(function (h) { return h !== activeHost; })
    );
    const isFull = /^https?:\/\//i.test(pathOrUrl);
    for (var i = 0; i < ordered.length; i++) {
      const h = ordered[i];
      let target = pathOrUrl;
      if (!isFull) {
        target = h + (pathOrUrl.startsWith("/") ? pathOrUrl : "/" + pathOrUrl);
      } else if (i > 0) {
        try {
          const parsed = new URL(pathOrUrl);
          target = h + parsed.pathname + parsed.search;
        } catch (_) {}
      }
      const html = await fetchRaw(target, h + "/");
      if (html && html.length > 200) {
        activeHost = h;
        return html;
      }
    }
    return "";
  }

  function parseList(html) {
    const videos = [];
    const seen = Object.create(null);
    if (!html) return videos;

    let blocks = [];
    const itemRe = /<div class="vod-item">([\s\S]*?)<\/div>\s*<\/div>/gi;
    let m;
    while ((m = itemRe.exec(html)) !== null) {
      blocks.push(m[1]);
    }
    if (blocks.length === 0) {
      const aRe = /(<a[^>]+href="[^"]*\/voddetail\/\d+\.html"[^>]*>[\s\S]*?<\/a>)/gi;
      while ((m = aRe.exec(html)) !== null) {
        blocks.push(m[1]);
      }
    }

    for (var i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      const vm = /\/voddetail\/(\d+)\.html/.exec(b);
      if (!vm) continue;
      const vid = vm[1];
      if (seen[vid]) continue;
      seen[vid] = true;

      let name = "";
      let tm = /title="([^"]+)"/i.exec(b);
      if (tm) name = cleanText(tm[1]);
      if (!name) {
        tm = /class="title"[^>]*>([^<]+)/i.exec(b);
        if (tm) name = cleanText(tm[1]);
      }
      if (!name) {
        tm = /<h4[^>]*>([^<]+)/i.exec(b);
        if (tm) name = cleanText(tm[1]);
      }

      let pic = null;
      const pm = /(?:data-src|src)="(https?:\/\/[^"]+)"/i.exec(b);
      if (pm) pic = pm[1];

      let remark = null;
      let rm = /class="remarks"[^>]*>([^<]+)/i.exec(b);
      if (rm) remark = cleanText(rm[1]);
      if (!remark) {
        rm = /(更新[^<\n]{0,20}|全\d+集|\d+集全|已完结|连载中|HD|完结)/.exec(b);
        if (rm) remark = rm[1].replace(/\s+/g, "");
      }

      videos.push({
        vodId: vid,
        title: (name || "影片#" + vid).slice(0, 80),
        poster: pic,
        remark: remark || null,
      });
    }

    if (videos.length < 3) {
      const fallRe = /href="(?:https?:\/\/[^"]+)?(\/voddetail\/(\d+)\.html)"[^>]*(?:title="([^"]*)")?/gi;
      while ((m = fallRe.exec(html)) !== null) {
        const vid = m[2];
        if (seen[vid]) continue;
        seen[vid] = true;
        const block = html.slice(Math.max(0, m.index - 50), m.index + 800);
        let name = cleanText(m[3] || "");
        if (!name) {
          const tm = /class="title"[^>]*>([^<]+)/i.exec(block);
          if (tm) name = cleanText(tm[1]);
        }
        const pm = /(?:data-src|src)="(https?:\/\/[^"]+)"/i.exec(block);
        videos.push({
          vodId: vid,
          title: (name || "影片#" + vid).slice(0, 80),
          poster: pm ? pm[1] : null,
          remark: null,
        });
      }
    }
    return videos;
  }

  function decodePlayer(encoded, encrypt) {
    let u = String(encoded || "").replace(/\\\//g, "/");
    const enc = parseInt(encrypt || 0, 10) || 0;
    if (enc === 1) {
      try { u = Host.codec.urlDecode(u); } catch (_) {}
    } else if (enc === 2) {
      try { u = Host.codec.urlDecode(Host.crypto.base64Decode(u)); } catch (_) {}
    }
    return u;
  }

  globalThis.LiveDeckVod = {
    async home(payload) {
      const html = await fetchHtml(payload && payload.config, "/");
      return {
        categories: CHANNELS.map(function (c) {
          return { id: c[0], name: c[1], filters: [] };
        }),
        featured: parseList(html).slice(0, 30),
      };
    },

    async category(payload) {
      const pg = Math.max(1, parseInt((payload && payload.page) || 1, 10));
      const tid = String((payload && payload.categoryId) || "20").trim();
      const path = pg <= 1 ? "/vodtype/" + tid + ".html" : "/vodtype/" + tid + "-" + pg + ".html";
      const html = await fetchHtml(payload && payload.config, path);
      const items = parseList(html);
      const hasMore = items.length >= 20;
      return {
        items: items,
        page: pg,
        totalPages: hasMore ? pg + 1 : pg,
        hasMore: hasMore,
      };
    },

    async search(payload) {
      const pg = Math.max(1, parseInt((payload && payload.page) || 1, 10));
      const kw = String((payload && payload.keyword) || "").trim();
      if (!kw) return { items: [], page: 1, totalPages: 1, hasMore: false };
      const encKw = Host.codec.urlEncode(kw);
      const path =
        pg <= 1
          ? "/vodsearch/-------------.html?wd=" + encKw
          : "/vodsearch/" + encKw + "----------" + pg + "---.html";
      const html = await fetchHtml(payload && payload.config, path);
      const items = parseList(html);
      const hasMore = items.length >= 20;
      return {
        items: items,
        page: pg,
        totalPages: hasMore ? pg + 1 : pg,
        hasMore: hasMore,
      };
    },

    async detail(payload) {
      const raw = String((payload && payload.vodId) || "").trim();
      const vm = /\/voddetail\/(\d+)/.exec(raw);
      const vid = vm ? vm[1] : raw.replace(/\D+/g, "");
      if (!vid) return { vodId: raw, title: raw, sources: [] };
      const html = await fetchHtml(payload && payload.config, "/voddetail/" + vid + ".html");
      if (!html) return { vodId: vid, title: "影片#" + vid, sources: [] };

      let name = "影片#" + vid;
      let m = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
      if (m) name = cleanText(m[1]) || name;
      if (name.startsWith("影片#")) {
        m = /<title>([^<]+)<\/title>/i.exec(html);
        if (m) name = cleanText(m[1].replace(/\s*[-|—].*$/, "")) || name;
      }

      let pic = "";
      m = /class="[^"]*detail-pic[^"]*"[\s\S]{0,200}?(?:data-src|src)="([^"]+)"/i.exec(html);
      if (!m) m = /(?:data-src|src)="(https?:\/\/[^"]+\.(?:jpg|png|webp)[^"]*)"/i.exec(html);
      if (m) pic = absUrl(activeHost, m[1]);

      let synopsis = null;
      m = /剧情简介[\s\S]*?<p>([\s\S]*?)<\/p>/i.exec(html);
      if (m) synopsis = cleanText(m[1]).slice(0, 500) || null;

      const tabMap = Object.create(null);
      const tRe1 = /class="source-tab-item"[^>]*data-target="playlist-(\d+)"[^>]*>([^<]+)/g;
      while ((m = tRe1.exec(html)) !== null) tabMap[m[1]] = cleanText(m[2]);
      const tRe2 = /data-target="playlist-(\d+)"[^>]*class="source-tab-item"[^>]*>([^<]+)/g;
      while ((m = tRe2.exec(html)) !== null) {
        if (!tabMap[m[1]]) tabMap[m[1]] = cleanText(m[2]);
      }

      const groups = Object.create(null);
      const order = [];
      const plRe = /id="playlist-(\d+)"([\s\S]*?)(?=id="playlist-|\Z)/g;
      const chunks = html.split(/id="playlist-(\d+)"/);
      for (var c = 1; c + 1 < chunks.length; c += 2) {
        const sid = chunks[c];
        const body = chunks[c + 1];
        const eps = [];
        const epRe = /href="(\/vodplay\/(\d+)-(\d+)-(\d+)\.html)"[^>]*(?:title="([^"]*)")?[^>]*>([^<]*)/g;
        while ((m = epRe.exec(body)) !== null) {
          const label = cleanText(m[5] || m[6]) || "第" + m[4] + "集";
          eps.push({
            episodeId: sid + "-" + m[4],
            name: label,
            index: eps.length,
            playData: absUrl(activeHost, m[1]),
          });
        }
        if (eps.length > 0) {
          groups[sid] = eps;
          order.push(sid);
        }
      }

      if (order.length === 0) {
        const gRe = /href="(\/vodplay\/(\d+)-(\d+)-(\d+)\.html)"[^>]*(?:title="([^"]*)")?[^>]*>([^<]*)/g;
        while ((m = gRe.exec(html)) !== null) {
          const sid = m[3];
          const label = cleanText(m[5] || m[6]) || "第" + m[4] + "集";
          if (!groups[sid]) {
            groups[sid] = [];
            order.push(sid);
          }
          groups[sid].push({
            episodeId: sid + "-" + m[4],
            name: label,
            index: groups[sid].length,
            playData: absUrl(activeHost, m[1]),
          });
        }
      }

      const sources = [];
      for (var i = 0; i < order.length; i++) {
        const sid = order[i];
        const tname = tabMap[sid] || "线路" + sid;
        if (/自营|jlm3u8|自建|专线/i.test(tname)) {
          sources.push({ sourceId: "pl-" + sid, name: tname, episodes: groups[sid] });
        }
      }
      if (sources.length === 0 && order.length > 0) {
        const probeReqs = [];
        for (var j = 0; j < order.length; j++) {
          const sid = order[j];
          const firstEp = groups[sid][0];
          probeReqs.push({
            url: firstEp.playData,
            method: "GET",
            headers: { "User-Agent": UA, Referer: activeHost + "/" },
            insecureTls: true,
            timeout: 6,
          });
        }
        let batchRes = [];
        try {
          batchRes = await Host.http.batch(probeReqs, Math.min(4, probeReqs.length));
        } catch (_) {}

        const directSources = [];
        const fallbackSources = [];
        for (var k = 0; k < order.length; k++) {
          const sid = order[k];
          const r = batchRes[k];
          const body = r && r.ok && r.response ? r.response.bodyText || "" : "";
          const hasDirect = /"from"\s*:\s*"[^"]*jlm3u8/i.test(body) || /https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4)/i.test(body);
          const srcObj = {
            sourceId: "pl-" + sid,
            name: (tabMap[sid] || "线路" + sid) + (hasDirect ? " (直连)" : ""),
            episodes: groups[sid],
          };
          if (hasDirect) {
            directSources.push(srcObj);
          } else {
            fallbackSources.push(srcObj);
          }
        }
        for (var dIdx = 0; dIdx < directSources.length; dIdx++) sources.push(directSources[dIdx]);
        for (var fIdx = 0; fIdx < fallbackSources.length; fIdx++) sources.push(fallbackSources[fIdx]);
      }

      return {
        vodId: vid,
        title: name,
        poster: pic || null,
        synopsis: synopsis,
        sources: sources,
      };
    },

    async play(payload) {
      const headers = { Referer: activeHost + "/", Origin: activeHost };
      let play = String((payload && payload.playData) || "").trim();
      if (play.indexOf("$") >= 0) play = play.split("$").pop().trim();

      if (/^https?:\/\//i.test(play) && /\.(m3u8|mp4)(\?|$)/i.test(play)) {
        return { streams: [{ label: "默认线路", url: play, userAgent: UA, headers: headers }] };
      }

      const html = await fetchHtml(payload && payload.config, play);
      const jsonStr = Host.text.extractJson(html, "player_aaaa");
      if (jsonStr) {
        let player = {};
        try {
          player = JSON.parse(jsonStr);
        } catch (_) {
          const um = /"url"\s*:\s*"([^"]*)"/.exec(jsonStr);
          const em = /"encrypt"\s*:\s*(\d+)/.exec(jsonStr);
          if (um) player.url = um[1];
          if (em) player.encrypt = em[1];
        }
        const url = decodePlayer(player.url, player.encrypt);
        if (url && /^https?:\/\//i.test(url)) {
          return {
            streams: [
              {
                label: "默认线路",
                url: url,
                userAgent: UA,
                headers: headers,
                parse: !/\.(m3u8|mp4)(\?|$)/i.test(url),
              },
            ],
          };
        }
      }

      const direct = /https?:\/\/[^"'\s<>]+\.(?:m3u8|mp4)[^"'\s<>]*/i.exec(html);
      if (direct) {
        return {
          streams: [
            {
              label: "默认线路",
              url: direct[0].replace(/\\\//g, "/"),
              userAgent: UA,
              headers: headers,
            },
          ],
        };
      }

      Host.raise("NO_STREAM", "pianku could not extract stream for " + play);
    },
  };
})();
