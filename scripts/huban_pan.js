/// <reference path="../sdk/livedeck-sdk.d.ts" />

(function () {
  const HOSTS = ["http://xhban.xyz:20720", "http://38.76.197.172:16969"];
  const SITE_UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
  const CATEGORIES = [
    { id: "1", name: "电影" },
    { id: "2", name: "剧集" },
    { id: "3", name: "动漫" },
    { id: "4", name: "综艺" },
    { id: "6", name: "短剧" },
    { id: "5", name: "精选" },
  ];

  const QUARK_API = "https://drive-pc.quark.cn/1/clouddrive";
  const QUARK_REFERER = "https://pan.quark.cn/";
  const QUARK_UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) quark-cloud-drive/2.5.20 Chrome/100.0.4896.160 Electron/18.3.5.4-b478491100 Safari/537.36 Channel/pckk_other_ch";
  const TEMP_DIR_NAME = "_LiveDeck_Temp";
  const VIDEO_EXTS = {
    mp4: true, mkv: true, avi: true, mov: true, flv: true, ts: true,
    m2ts: true, wmv: true, webm: true, rmvb: true, iso: true, m4v: true, mpg: true, mpeg: true,
  };
  const SUB_EXTS = { ass: true, ssa: true, srt: true, vtt: true, sub: true };

  function getExt(name) {
    const idx = String(name || "").lastIndexOf(".");
    return idx >= 0 ? String(name).slice(idx + 1).toLowerCase() : "";
  }
  function isVideoFile(f) {
    return Boolean(f && f.file && (f.category === 1 || VIDEO_EXTS[getExt(f.file_name)]));
  }
  function isSubtitleFile(f) {
    return Boolean(f && f.file && SUB_EXTS[getExt(f.file_name)]);
  }
  function formatBytes(n) {
    const num = Number(n || 0);
    if (!num || num <= 0) return "";
    if (num >= 1024 * 1024 * 1024) return (num / (1024 * 1024 * 1024)).toFixed(2) + " GB";
    if (num >= 1024 * 1024) return (num / (1024 * 1024)).toFixed(1) + " MB";
    return Math.round(num / 1024) + " KB";
  }
  function requireQuarkCookie() {
    const cookie = (Host.session.getCookieHeader("cloud:quark") || "").trim();
    if (!cookie) {
      Host.raise("AUTH_FAILED", "请先在「设置 → 平台登录 → 网盘账号 → 夸克网盘」扫码登录");
    }
    return cookie;
  }
  function syncSetCookies(existingCookie, setCookieHeaders) {
    if (!Array.isArray(setCookieHeaders) || setCookieHeaders.length === 0) return;
    const jar = {};
    const order = [];
    String(existingCookie || "").split(";").forEach((seg) => {
      const s = seg.trim();
      const eq = s.indexOf("=");
      if (eq <= 0) return;
      const k = s.slice(0, eq).trim();
      if (!(k in jar)) order.push(k);
      jar[k] = s.slice(eq + 1).trim();
    });
    let changed = false;
    setCookieHeaders.forEach((line) => {
      const pair = String(line || "").split(";")[0].trim();
      const eq = pair.indexOf("=");
      if (eq <= 0) return;
      const k = pair.slice(0, eq).trim();
      const v = pair.slice(eq + 1).trim();
      if ((k === "__puus" || k === "__pus") && v && jar[k] !== v) {
        if (!(k in jar)) order.push(k);
        jar[k] = v;
        changed = true;
      }
    });
    if (changed) {
      try {
        Host.session.setCookieHeader("cloud:quark", order.map((k) => `${k}=${jar[k]}`).join("; "));
      } catch (_) {}
    }
  }
  async function quarkRequest(pathname, opts) {
    const o = opts || {};
    const cookie = requireQuarkCookie();
    const req = {
      url: QUARK_API + pathname,
      method: o.method || "GET",
      params: Object.assign({ pr: "ucpro", fr: "pc", uc_param_str: "" }, o.params || {}),
      headers: Object.assign(
        {
          Cookie: cookie,
          Referer: QUARK_REFERER,
          Accept: "application/json, text/plain, */*",
          "User-Agent": QUARK_UA,
        },
        o.headers || {},
      ),
      timeout: 15,
    };
    if (o.json !== undefined) req.json = o.json;
    const res = await Host.http.request(req);
    syncSetCookies(cookie, res.setCookieHeaders);
    let data = null;
    try {
      data = res.json();
    } catch (_) {
      Host.raise("INVALID_RESPONSE", "夸克接口返回非 JSON 响应 (HTTP " + res.status + ")");
    }
    if (res.status === 401 || res.status === 403 || (data && (data.code === 31001 || data.code === 10001))) {
      Host.raise("AUTH_FAILED", (data && data.message) || "夸克 Cookie 已失效，请重新登录");
    }
    if (!res.ok || !data || (data.code !== 0 && data.status >= 400)) {
      Host.raise("UPSTREAM_ERROR", (data && data.message) || "夸克接口请求失败: HTTP " + res.status);
    }
    return data;
  }
  function extractQuarkShares(text) {
    const src = String(text || "");
    const re = /https?:\/\/pan\.quark\.cn\/s\/([a-zA-Z0-9]+)(?:\?pwd=([a-zA-Z0-9]{4}))?/g;
    const out = [];
    const seen = Object.create(null);
    let m;
    while ((m = re.exec(src)) !== null) {
      const pwdId = m[1];
      if (!pwdId || seen[pwdId]) continue;
      seen[pwdId] = true;
      let passcode = m[2] || "";
      if (!passcode) {
        const tail = src.slice(m.index + m[0].length, m.index + m[0].length + 60);
        const pm = /提取码[:：\s]*([a-zA-Z0-9]{4})/.exec(tail);
        if (pm) passcode = pm[1];
      }
      out.push({ pwdId, passcode });
    }
    return out;
  }
  function matchSubtitles(baseName, subFiles) {
    const stem = String(baseName || "").replace(/\.[^.]+$/, "").toLowerCase();
    const exact = [];
    const folderWide = [];
    subFiles.forEach((sf) => {
      const sName = Host.text.htmlUnescape(sf.file_name || "");
      const sStem = sName.replace(/\.[^.]+$/, "").toLowerCase();
      const ref = { fid: sf.fid, fidToken: sf.share_fid_token || "", name: sName, format: getExt(sName) || "srt" };
      if (stem && (sStem === stem || sStem.startsWith(stem + "."))) exact.push(ref);
      else folderWide.push(ref);
    });
    return exact.length > 0 ? exact : folderWide.slice(0, 4);
  }
  async function resolveQuarkShareSources(shares) {
    const sources = [];
    const limited = (shares || []).slice(0, 3);
    for (let si = 0; si < limited.length; si++) {
      const sh = limited[si];
      try {
        const tokRes = await quarkRequest("/share/sharepage/token", {
          method: "POST",
          json: { pwd_id: sh.pwdId, passcode: sh.passcode || "" },
        });
        const stoken = tokRes.data && tokRes.data.stoken;
        if (!stoken) continue;
        const episodes = [];
        const queue = [{ pdirFid: "0", depth: 0 }];
        let folderCalls = 0;
        while (queue.length > 0 && folderCalls < 8) {
          const cur = queue.shift();
          folderCalls++;
          const detRes = await quarkRequest("/share/sharepage/detail", {
            params: {
              pwd_id: sh.pwdId,
              stoken,
              pdir_fid: cur.pdirFid,
              force: "0",
              _page: "1",
              _size: "100",
              _fetch_banner: "0",
              _fetch_share: "0",
              _fetch_total: "1",
              _sort: "file_type:asc,file_name:asc",
            },
          });
          const list = (detRes.data && detRes.data.list) || [];
          const subs = list.filter(isSubtitleFile);
          list.forEach((entry) => {
            const isDir = !entry.file || entry.dir === true;
            if (isDir) {
              if (cur.depth < 2 && entry.fid) {
                queue.push({ pdirFid: String(entry.fid), depth: cur.depth + 1 });
              }
            } else if (isVideoFile(entry) && entry.fid && entry.share_fid_token) {
              const name = Host.text.htmlUnescape(entry.file_name || "视频 " + (episodes.length + 1));
              episodes.push({
                episodeId: sh.pwdId + "_" + entry.fid,
                name: name + (entry.size ? " (" + formatBytes(entry.size) + ")" : ""),
                index: episodes.length + 1,
                playData: JSON.stringify({
                  pwdId: sh.pwdId,
                  stoken,
                  fid: String(entry.fid),
                  fidToken: String(entry.share_fid_token),
                  pdirFid: String(entry.pdir_fid || cur.pdirFid || "0"),
                  fileName: name,
                  subs: matchSubtitles(name, subs),
                }),
              });
            }
          });
        }
        if (episodes.length > 0) {
          sources.push({
            sourceId: "quark-" + sh.pwdId,
            name: limited.length > 1 ? "夸克网盘 " + (si + 1) : "夸克网盘",
            episodes,
          });
        }
      } catch (_) {}
    }
    return sources;
  }
  async function ensureTempDir() {
    const cached = Host.storage.get("quark_temp_dir_fid");
    const rootRes = await quarkRequest("/file/sort", {
      params: { pdir_fid: "0", _page: "1", _size: "100", _fetch_total: "1", fetch_all_file: "1" },
    });
    const list = (rootRes.data && rootRes.data.list) || [];
    const found = list.find((f) => !f.file && (f.file_name === TEMP_DIR_NAME || (cached && f.fid === cached)));
    if (found && found.fid) {
      Host.storage.set("quark_temp_dir_fid", String(found.fid));
      return String(found.fid);
    }
    const mkRes = await quarkRequest("/file", {
      method: "POST",
      json: { pdir_fid: "0", file_name: TEMP_DIR_NAME, dir_path: "", dir_init_lock: false },
    });
    const newFid = mkRes.data && mkRes.data.fid;
    if (!newFid) Host.raise("UPSTREAM_ERROR", "创建夸克临时转存目录失败");
    Host.storage.set("quark_temp_dir_fid", String(newFid));
    return String(newFid);
  }
  async function pollTask(taskId) {
    for (let i = 0; i < 15; i++) {
      const res = await quarkRequest("/task", {
        params: { task_id: String(taskId), retry_index: String(i) },
      });
      if (res.data && res.data.status === 2) return res.data;
      Host.time.sleep(500);
    }
    Host.raise("TIMEOUT", "夸克转存任务等待超时");
  }
  async function playQuarkShareEpisode(playData) {
    const parsed = JSON.parse(String(playData || "{}"));
    const cookie = requireQuarkCookie();
    const baseHeaders = { Cookie: cookie, Referer: QUARK_REFERER, "User-Agent": QUARK_UA };
    let last = Host.storage.get("quark_last_saved");
    let savedFid = "";
    let savedSubs = [];

    if (last && last.pwdId === parsed.pwdId && last.fid === parsed.fid && last.savedFid) {
      try {
        await quarkRequest("/file/info", { params: { fid: String(last.savedFid) } });
        savedFid = String(last.savedFid);
        savedSubs = Array.isArray(last.savedSubs) ? last.savedSubs : [];
      } catch (_) {
        savedFid = "";
      }
    }

    if (!savedFid) {
      if (last && Array.isArray(last.savedFids) && last.savedFids.length > 0) {
        try {
          const delRes = await quarkRequest("/file/delete", {
            method: "POST",
            json: { action_type: 2, filelist: last.savedFids, exclude_fids: [] },
          });
          if (delRes.data && delRes.data.task_id) await pollTask(delRes.data.task_id);
        } catch (_) {}
      }
      const tempDirFid = await ensureTempDir();
      const subRefs = Array.isArray(parsed.subs) ? parsed.subs.slice(0, 3) : [];
      const fidList = [parsed.fid].concat(subRefs.map((s) => s.fid));
      const tokenList = [parsed.fidToken].concat(subRefs.map((s) => s.fidToken));
      const saveRes = await quarkRequest("/share/sharepage/save", {
        method: "POST",
        json: {
          fid_list: fidList,
          fid_token_list: tokenList,
          to_pdir_fid: tempDirFid,
          pwd_id: parsed.pwdId,
          stoken: parsed.stoken,
          pdir_fid: parsed.pdirFid || "0",
          scene: "link",
        },
      });
      let topFids = [];
      if (saveRes.data && saveRes.data.task_id) {
        const taskData = await pollTask(saveRes.data.task_id);
        topFids = (taskData.save_as && taskData.save_as.save_as_top_fids) || [];
      } else if (saveRes.data && Array.isArray(saveRes.data.save_as_top_fids)) {
        topFids = saveRes.data.save_as_top_fids;
      }
      if (topFids.length > 0) {
        savedFid = String(topFids[0]);
        const savedFids = topFids.map(String);
        savedSubs = subRefs
          .map((s, idx) => (topFids[idx + 1] ? { fid: String(topFids[idx + 1]), name: s.name, format: s.format } : null))
          .filter(Boolean);
        Host.storage.set("quark_last_saved", {
          pwdId: parsed.pwdId, fid: parsed.fid, tempDirFid, savedFid, savedFids, savedSubs,
        });
      } else {
        const listRes = await quarkRequest("/file/sort", {
          params: { pdir_fid: tempDirFid, _page: "1", _size: "50", _sort: "updated_at:desc" },
        });
        const files = ((listRes.data && listRes.data.list) || []).filter((f) => f.file);
        const matchVid = files.find((f) => Host.text.htmlUnescape(f.file_name || "") === parsed.fileName) || files.find(isVideoFile);
        if (!matchVid || !matchVid.fid) Host.raise("UPSTREAM_ERROR", "未在夸克临时目录找到已转存视频");
        savedFid = String(matchVid.fid);
        const savedFids = [savedFid];
        savedSubs = subRefs
          .map((s) => {
            const mf = files.find((f) => Host.text.htmlUnescape(f.file_name || "") === s.name);
            if (mf && mf.fid) {
              savedFids.push(String(mf.fid));
              return { fid: String(mf.fid), name: s.name, format: s.format };
            }
            return null;
          })
          .filter(Boolean);
        Host.storage.set("quark_last_saved", {
          pwdId: parsed.pwdId, fid: parsed.fid, tempDirFid, savedFid, savedFids, savedSubs,
        });
      }
    }

    const downData = await quarkRequest("/file/download", { method: "POST", json: { fids: [savedFid] } });
    const streams = [];
    const first = Array.isArray(downData.data) ? downData.data[0] : null;
    if (first && first.download_url) {
      streams.push({ label: "原画直连", quality: 2160, url: first.download_url, headers: baseHeaders, relay: "always" });
    }
    const rankMap = { "4k": 6, "2k": 5, super: 4, high: 3, normal: 2, low: 1 };
    try {
      const trans = await quarkRequest("/file/v2/play", {
        method: "POST",
        json: { fid: savedFid, resolutions: "low,normal,high,super,2k,4k", supports: "fmp4_av,m3u8,dolby_vision" },
      });
      const vlist = ((trans.data && trans.data.video_list) || []).slice().sort((a, b) => {
        const ra = rankMap[String(a.resolution || (a.video_info && a.video_info.resolution) || "").toLowerCase()] || 0;
        const rb = rankMap[String(b.resolution || (b.video_info && b.video_info.resolution) || "").toLowerCase()] || 0;
        return rb - ra;
      });
      vlist.forEach((item) => {
        const v = item.video_info;
        if (v && v.url) {
          const resTag = String(item.resolution || v.resolution || "HD").toUpperCase();
          const isSvip = String(item.member_right || "").toLowerCase() === "svip";
          streams.push({
            label: "官方转码 " + resTag + (isSvip ? " (SVIP)" : ""),
            url: v.url,
            headers: baseHeaders,
            relay: "always",
          });
        }
      });
    } catch (_) {}

    const subtitles = [];
    if (savedSubs.length > 0) {
      try {
        const subDown = await quarkRequest("/file/download", {
          method: "POST",
          json: { fids: savedSubs.map((s) => s.fid) },
        });
        const subList = Array.isArray(subDown.data) ? subDown.data : [];
        subList.forEach((row, i) => {
          const ref = savedSubs[i];
          if (row && row.download_url && ref) {
            subtitles.push({ label: ref.name, lang: "zh", format: ref.format, url: row.download_url, headers: baseHeaders });
          }
        });
      } catch (_) {}
    }
    return { streams, subtitles, renewable: true };
  }

  async function fetchSite(pathOrUrl) {
    if (/^https?:\/\//i.test(pathOrUrl)) {
      const r = await Host.http.get(pathOrUrl, { headers: { "User-Agent": SITE_UA }, insecureTls: true, timeout: 12 });
      return { base: new URL(pathOrUrl).origin, html: (r && (r.bodyText || r.body)) || "" };
    }
    for (let i = 0; i < HOSTS.length; i++) {
      const base = HOSTS[i];
      try {
        const r = await Host.http.get(base + pathOrUrl, {
          headers: { "User-Agent": SITE_UA, Referer: base + "/" },
          insecureTls: true,
          timeout: 12,
        });
        const html = (r && (r.bodyText || r.body)) || "";
        if (r && r.ok && html.length > 500) return { base, html };
      } catch (_) {}
    }
    Host.raise("NETWORK_ERROR", "虎斑网盘站点暂时无法连接");
  }
  function parseCards(base, html) {
    const items = [];
    const seen = Object.create(null);
    Host.html.selectAll(html, "div.module-item").forEach((card) => {
      const ch = card.html || "";
      const a = Host.html.select(ch, "a[href*='/vod/detail/id/']") || Host.html.select(ch, "a[href]");
      const href = a && a.attrs && a.attrs.href;
      if (!href || !/\/vod\/detail\/id\/\d+/.test(href)) return;
      const vodId = Host.text.resolveUrl(base, href);
      if (seen[vodId]) return;
      seen[vodId] = true;
      const img = Host.html.select(ch, "img");
      const rawPic = (img && img.attrs && (img.attrs["data-src"] || img.attrs["data-original"] || img.attrs.src)) || "";
      const poster = rawPic ? Host.text.resolveUrl(base, rawPic) : undefined;
      const title = Host.text.htmlUnescape((a.attrs && a.attrs.title) || Host.html.text(ch, ".module-item-title") || (img && img.attrs && img.attrs.alt) || "").trim();
      if (!title) return;
      const remark = Host.html.text(ch, ".module-item-note").trim() || Host.html.text(ch, ".module-item-caption").trim() || undefined;
      items.push({ vodId, title, poster, remark });
    });
    return items;
  }
  function parseSearchCards(base, html) {
    const items = [];
    const seen = Object.create(null);
    Host.html.selectAll(html, "div.module-search-item").forEach((card) => {
      const ch = card.html || "";
      let href = (Host.html.attr(ch, "a[href*='/vod/detail/id/']", "href") || "").trim();
      if (!href) {
        const playHref = Host.html.attr(ch, "a[href*='/vod/play/id/']", "href") || "";
        const pm = /\/vod\/play\/id\/(\d+)/.exec(playHref);
        if (pm) href = "/index.php/vod/detail/id/" + pm[1] + ".html";
      }
      if (!href) return;
      const vodId = Host.text.resolveUrl(base, href);
      if (seen[vodId]) return;
      seen[vodId] = true;
      const img = Host.html.select(ch, "img");
      const rawPic = (img && img.attrs && (img.attrs["data-src"] || img.attrs["data-original"] || img.attrs.src)) || "";
      const poster = rawPic ? Host.text.resolveUrl(base, rawPic) : undefined;
      const title = Host.text.htmlUnescape(Host.html.text(ch, "h3") || Host.html.attr(ch, ".video-info-header a", "title") || (img && img.attrs && img.attrs.alt) || "").trim();
      if (!title) return;
      const remark = Host.html.text(ch, ".video-serial").trim() || undefined;
      items.push({ vodId, title, poster, remark });
    });
    return items.length > 0 ? items : parseCards(base, html);
  }

  globalThis.LiveDeckVod = {
    async home() {
      const { base, html } = await fetchSite("/");
      return { categories: CATEGORIES, featured: parseCards(base, html).slice(0, 30) };
    },
    async category({ categoryId, page }) {
      const pg = Math.max(1, Number(page || 1));
      const { base, html } = await fetchSite(`/index.php/vod/show/id/${encodeURIComponent(categoryId || "1")}/page/${pg}.html`);
      const items = parseCards(base, html);
      return { items, page: pg, hasMore: items.length >= 24 };
    },
    async search({ keyword, page }) {
      const pg = Math.max(1, Number(page || 1));
      const kw = encodeURIComponent(String(keyword || "").trim());
      const { base, html } = await fetchSite(`/index.php/vod/search.html?wd=${kw}&page=${pg}`);
      const items = parseSearchCards(base, html);
      return { items, page: pg, hasMore: items.length >= 10 };
    },
    async detail({ vodId }) {
      const { base, html } = await fetchSite(vodId);
      const title = Host.text.htmlUnescape(Host.html.text(html, "h1") || Host.html.text(html, ".video-info-header h1") || "未知影片").trim();
      const rawPic = Host.html.attr(html, ".module-item-pic img", "data-src") || Host.html.attr(html, ".module-item-pic img", "src") || "";
      const poster = rawPic ? Host.text.resolveUrl(base, rawPic) : undefined;
      const synopsis = Host.html.text(html, ".video-info-content").trim() || undefined;
      const shares = extractQuarkShares(html);
      const sources = await resolveQuarkShareSources(shares);
      return { vodId, title, poster, synopsis, sources };
    },
    async play({ playData }) {
      return await playQuarkShareEpisode(playData);
    },
  };
})();
