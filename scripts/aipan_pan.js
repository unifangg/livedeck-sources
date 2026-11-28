/// <reference path="../sdk/livedeck-sdk.d.ts" />

(function () {
  const BASE_URL = "https://www.aipan.me";
  const SITE_UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
  const CATEGORIES = [
    { id: "all", name: "最新热映" },
    { id: "2026", name: "2026新片" },
    { id: "2025", name: "2025精选" },
    { id: "4K", name: "4K高码" },
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

  async function fetchApi(pathname, params) {
    const res = await Host.http.get(BASE_URL + pathname, {
      params: params || {},
      headers: {
        "User-Agent": SITE_UA,
        Accept: "application/json, text/plain, */*",
        Referer: BASE_URL + "/",
      },
      insecureTls: true,
      timeout: 12,
    });
    if (!res || !res.ok) Host.raise("UPSTREAM_ERROR", "爱盼网盘接口请求失败: HTTP " + (res ? res.status : 0));
    return res.json();
  }
  function mapMovies(rawList) {
    const list = Array.isArray(rawList) ? rawList : [];
    const filtered = list.filter((m) => !Array.isArray(m.panKinds) || m.panKinds.includes("quark"));
    const pool = filtered.length > 0 ? filtered : list;
    return pool.map((m) => ({
      vodId: "aipan:" + m.id,
      title: Host.text.htmlUnescape(m.title || "").trim(),
      poster: m.cover || undefined,
      year: m.year ? Number(m.year) : undefined,
      rating: m.rate ? String(m.rate) : undefined,
      genres: Array.isArray(m.genres) ? m.genres : [],
      remark: (m.badges && m.badges[0] && m.badges[0].label) || (m.rate ? "评分 " + m.rate : "4K夸克"),
    })).filter((it) => Boolean(it.title));
  }

  globalThis.LiveDeckVod = {
    async home() {
      const data = await fetchApi("/api/movies/list", { page: "1" });
      return { categories: CATEGORIES, featured: mapMovies(data.movies) };
    },
    async category({ categoryId, page }) {
      const pg = Math.max(1, Number(page || 1));
      const cat = String(categoryId || "all");
      const data = cat === "all"
        ? await fetchApi("/api/movies/list", { page: String(pg) })
        : await fetchApi("/api/movies/search", { q: cat, page: String(pg) });
      const items = mapMovies(data.movies);
      return { items, page: pg, hasMore: items.length >= 12 };
    },
    async search({ keyword, page }) {
      const pg = Math.max(1, Number(page || 1));
      const data = await fetchApi("/api/movies/search", {
        q: String(keyword || "").trim(),
        page: String(pg),
      });
      const items = mapMovies(data.movies);
      return { items, page: pg, hasMore: items.length >= 12 };
    },
    async detail({ vodId }) {
      const id = String(vodId || "").replace(/^aipan:/, "");
      const data = await fetchApi("/api/movies/detail/" + encodeURIComponent(id), {});
      const shares = [];
      const seen = Object.create(null);
      const addFromText = (txt) => {
        extractQuarkShares(txt).forEach((s) => {
          if (!seen[s.pwdId]) {
            seen[s.pwdId] = true;
            shares.push(s);
          }
        });
      };
      (Array.isArray(data.panLinks) ? data.panLinks : []).forEach((l) => {
        if (l && l.url) addFromText(l.url + " " + (l.title || ""));
      });
      (Array.isArray(data.resources) ? data.resources : []).forEach((r) => {
        if (r && r.url) addFromText(r.url + " " + (r.name || ""));
      });
      if (shares.length === 0) addFromText(JSON.stringify(data));
      const sources = await resolveQuarkShareSources(shares);
      return {
        vodId,
        title: Host.text.htmlUnescape(data.title || "爱盼影片").trim(),
        poster: data.posterUrl || undefined,
        synopsis: data.synopsis || undefined,
        year: data.year ? Number(data.year) : undefined,
        region: data.region || undefined,
        genres: Array.isArray(data.genres) ? data.genres : [],
        directors: Array.isArray(data.directors) ? data.directors : [],
        actors: Array.isArray(data.actors) ? data.actors : [],
        sources,
      };
    },
    async play({ playData }) {
      return await playQuarkShareEpisode(playData);
    },
  };
})();
