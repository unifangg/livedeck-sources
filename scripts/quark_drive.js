/// <reference path="../sdk/livedeck-sdk.d.ts" />

(function () {
  const API_BASE = "https://drive.quark.cn/1/clouddrive";
  const REFERER = "https://pan.quark.cn/";
  const QUARK_UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) quark-cloud-drive/2.5.20 Chrome/100.0.4896.160 Electron/18.3.5.4-b478491100 Safari/537.36 Channel/pckk_other_ch";

  const VIDEO_EXTS = {
    mp4: true,
    mkv: true,
    avi: true,
    mov: true,
    flv: true,
    ts: true,
    m2ts: true,
    wmv: true,
    webm: true,
    rmvb: true,
    iso: true,
    m4v: true,
    mpg: true,
    mpeg: true,
  };
  const SUB_EXTS = {
    ass: true,
    ssa: true,
    srt: true,
    vtt: true,
    sub: true,
  };

  function getExt(name) {
    const idx = String(name || "").lastIndexOf(".");
    return idx >= 0 ? String(name).slice(idx + 1).toLowerCase() : "";
  }

  function isVideoFile(file) {
    if (!file || !file.file) return false;
    if (file.category === 1) return true;
    return Boolean(VIDEO_EXTS[getExt(file.file_name)]);
  }

  function isSubtitleFile(file) {
    return Boolean(file && file.file && SUB_EXTS[getExt(file.file_name)]);
  }

  function formatBytes(n) {
    const num = Number(n || 0);
    if (!num || num <= 0) return "";
    if (num >= 1024 * 1024 * 1024) return (num / (1024 * 1024 * 1024)).toFixed(2) + " GB";
    if (num >= 1024 * 1024) return (num / (1024 * 1024)).toFixed(1) + " MB";
    return Math.round(num / 1024) + " KB";
  }

  function requireCookie() {
    const cookie = (Host.session.getCookieHeader("cloud:quark") || "").trim();
    if (!cookie) {
      Host.raise(
        "AUTH_FAILED",
        "未配置夸克网盘 Cookie：请前往「设置 → 账号 → 网盘账号 → 夸克网盘」粘贴 Cookie 后重试",
      );
    }
    return cookie;
  }

  function syncSetCookies(existingCookie, setCookieHeaders) {
    if (!Array.isArray(setCookieHeaders) || setCookieHeaders.length === 0) return existingCookie;
    const jar = {};
    const order = [];
    String(existingCookie || "")
      .split(";")
      .forEach((seg) => {
        const s = seg.trim();
        const eq = s.indexOf("=");
        if (eq <= 0) return;
        const k = s.slice(0, eq).trim();
        const v = s.slice(eq + 1).trim();
        if (!(k in jar)) order.push(k);
        jar[k] = v;
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
    if (!changed) return existingCookie;
    const merged = order.map((k) => `${k}=${jar[k]}`).join("; ");
    try {
      Host.session.setCookieHeader("cloud:quark", merged);
    } catch (_) {
      // Ignore write failures in read-only slots
    }
    return merged;
  }

  async function quarkRequest(pathname, options) {
    const opts = options || {};
    const cookie = requireCookie();
    const params = Object.assign({ pr: "ucpro", fr: "pc", uc_param_str: "" }, opts.params || {});
    const headers = Object.assign(
      {
        Cookie: cookie,
        Referer: REFERER,
        Accept: "application/json, text/plain, */*",
        "User-Agent": QUARK_UA,
      },
      opts.headers || {},
    );
    const req = {
      url: API_BASE + pathname,
      method: opts.method || "GET",
      params,
      headers,
      timeout: 15,
    };
    if (opts.json !== undefined) {
      req.json = opts.json;
    }
    const res = await Host.http.request(req);
    syncSetCookies(cookie, res.setCookieHeaders);
    let data = null;
    try {
      data = res.json();
    } catch (_) {
      Host.raise("INVALID_RESPONSE", "夸克接口返回非 JSON 响应 (HTTP " + res.status + ")");
    }
    if (res.status === 401 || res.status === 403 || (data && data.code === 10001)) {
      Host.raise("AUTH_FAILED", (data && data.message) || "夸克 Cookie 已失效，请重新粘贴");
    }
    if (!res.ok || !data || (data.code !== 0 && data.status >= 400)) {
      Host.raise("UPSTREAM_ERROR", (data && data.message) || "夸克接口请求失败: HTTP " + res.status);
    }
    return data;
  }

  function mapEntryToVodItem(file, parentFid) {
    const name = Host.text.htmlUnescape(file.file_name || "未命名");
    if (!file.file) {
      return {
        vodId: "dir:" + file.fid + ":" + encodeURIComponent(name),
        title: name,
        remark: "文件夹",
        kind: "series",
      };
    }
    return {
      vodId: "file:" + file.fid + ":" + (parentFid || file.pdir_fid || "0"),
      title: name,
      poster: file.thumbnail || undefined,
      remark: formatBytes(file.size) || "视频",
      kind: "movie",
    };
  }

  async function listFolder(pdirFid, page, size) {
    const data = await quarkRequest("/file/sort", {
      params: {
        pdir_fid: String(pdirFid || "0"),
        _page: String(page || 1),
        _size: String(size || 100),
        _fetch_total: "1",
        fetch_all_file: "1",
        fetch_risk_file_name: "1",
        _sort: "file_type:asc,file_name:asc",
      },
    });
    const list = (data.data && data.data.list) || [];
    const total = (data.metadata && data.metadata._total) || list.length;
    return { list, total };
  }

  function matchSubtitles(baseName, subFiles) {
    const stem = String(baseName || "").replace(/\.[^.]+$/, "").toLowerCase();
    const exact = [];
    const folderWide = [];
    subFiles.forEach((sf) => {
      const sName = Host.text.htmlUnescape(sf.file_name || "");
      const sStem = sName.replace(/\.[^.]+$/, "").toLowerCase();
      const item = { fid: sf.fid, name: sName, format: getExt(sName) || "srt" };
      if (stem && (sStem === stem || sStem.startsWith(stem + "."))) {
        exact.push(item);
      } else {
        folderWide.push(item);
      }
    });
    return exact.length > 0 ? exact : folderWide.slice(0, 6);
  }

  globalThis.LiveDeckVod = {
    async home() {
      const { list } = await listFolder("0", 1, 100);
      const categories = [];
      const featured = [];
      list.forEach((f) => {
        const name = Host.text.htmlUnescape(f.file_name || "");
        if (!f.file) {
          categories.push({ id: String(f.fid), name: name || "文件夹" });
        } else if (isVideoFile(f)) {
          featured.push(mapEntryToVodItem(f, "0"));
        }
      });
      return { categories, featured };
    },

    async category({ categoryId, page }) {
      const pg = Math.max(1, Number(page || 1));
      const { list, total } = await listFolder(categoryId || "0", pg, 60);
      const items = [];
      list.forEach((f) => {
        if (!f.file || isVideoFile(f)) {
          items.push(mapEntryToVodItem(f, categoryId || "0"));
        }
      });
      return {
        items,
        page: pg,
        hasMore: pg * 60 < total,
      };
    },

    async search({ keyword, page }) {
      const pg = Math.max(1, Number(page || 1));
      const data = await quarkRequest("/file/search", {
        params: {
          q: String(keyword || "").trim(),
          _page: String(pg),
          _size: "50",
          _is_hl: "0",
        },
      });
      const list = (data.data && data.data.list) || [];
      const total = (data.metadata && data.metadata._total) || list.length;
      const items = [];
      list.forEach((f) => {
        if (!f.file || isVideoFile(f)) {
          items.push(mapEntryToVodItem(f, f.pdir_fid || "0"));
        }
      });
      return { items, page: pg, hasMore: pg * 50 < total };
    },

    async detail({ vodId }) {
      const raw = String(vodId || "");
      const parts = raw.split(":");
      if (parts[0] === "dir") {
        const dirFid = parts[1] || "0";
        const dirTitle = parts[2] ? decodeURIComponent(parts.slice(2).join(":")) : "夸克文件夹";
        const { list } = await listFolder(dirFid, 1, 200);
        const videos = list.filter(isVideoFile);
        const subs = list.filter(isSubtitleFile);
        const subFolders = list.filter((f) => !f.file).slice(0, 8);
        const sources = [];
        if (videos.length > 0) {
          sources.push({
            sourceId: "dir-" + dirFid,
            name: "当前目录",
            episodes: videos.map((v, idx) => {
              const epName = Host.text.htmlUnescape(v.file_name || "视频 " + (idx + 1));
              return {
                episodeId: v.fid,
                name: epName + (v.size ? " (" + formatBytes(v.size) + ")" : ""),
                index: idx + 1,
                playData: JSON.stringify({ fid: v.fid, subs: matchSubtitles(epName, subs) }),
              };
            }),
          });
        }
        for (let i = 0; i < subFolders.length; i += 1) {
          const sf = subFolders[i];
          const sfName = Host.text.htmlUnescape(sf.file_name || "子目录");
          const subRes = await listFolder(sf.fid, 1, 200);
          const sfVideos = subRes.list.filter(isVideoFile);
          if (sfVideos.length > 0) {
            const sfSubs = subRes.list.filter(isSubtitleFile);
            sources.push({
              sourceId: "sub-" + sf.fid,
              name: sfName,
              episodes: sfVideos.map((v, idx) => {
                const epName = Host.text.htmlUnescape(v.file_name || "视频 " + (idx + 1));
                return {
                  episodeId: v.fid,
                  name: epName + (v.size ? " (" + formatBytes(v.size) + ")" : ""),
                  index: idx + 1,
                  playData: JSON.stringify({ fid: v.fid, subs: matchSubtitles(epName, sfSubs) }),
                };
              }),
            });
          }
        }
        return {
          vodId: raw,
          title: dirTitle,
          sources,
        };
      }

      const fileFid = parts[1] || raw;
      const pdirFid = parts[2] || "0";
      const { list } = await listFolder(pdirFid, 1, 200);
      const target = list.find((f) => f.fid === fileFid);
      const fileTitle = target ? Host.text.htmlUnescape(target.file_name || fileFid) : fileFid;
      const subs = list.filter(isSubtitleFile);
      return {
        vodId: raw,
        title: fileTitle,
        sources: [
          {
            sourceId: "quark-file",
            name: "夸克原画",
            episodes: [
              {
                episodeId: fileFid,
                name: fileTitle,
                index: 1,
                playData: JSON.stringify({ fid: fileFid, subs: matchSubtitles(fileTitle, subs) }),
              },
            ],
          },
        ],
      };
    },

    async play({ playData }) {
      let parsed = { fid: String(playData || ""), subs: [] };
      try {
        if (String(playData || "").trim().startsWith("{")) {
          parsed = JSON.parse(playData);
        }
      } catch (_) {}

      const fid = String(parsed.fid || "");
      const downData = await quarkRequest("/file/download", {
        method: "POST",
        json: { fids: [fid] },
      });
      const currentCookie = requireCookie();
      const baseHeaders = {
        Cookie: currentCookie,
        Referer: REFERER,
        "User-Agent": QUARK_UA,
      };
      const streams = [];
      const first = Array.isArray(downData.data) ? downData.data[0] : null;
      if (first && first.download_url) {
        streams.push({
          label: "原画直连",
          quality: 2160,
          url: first.download_url,
          headers: baseHeaders,
          relay: "always",
        });
      }

      const rankMap = { "4k": 6, "2k": 5, super: 4, high: 3, normal: 2, low: 1 };
      try {
        const trans = await quarkRequest("/file/v2/play", {
          method: "POST",
          json: {
            fid,
            resolutions: "low,normal,high,super,2k,4k",
            supports: "fmp4_av,m3u8,dolby_vision",
          },
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
      } catch (_) {
        // Fallback transcoding is optional when raw download URL is available.
      }

      const subtitles = [];
      const subRefs = Array.isArray(parsed.subs) ? parsed.subs : [];
      if (subRefs.length > 0) {
        try {
          const subDown = await quarkRequest("/file/download", {
            method: "POST",
            json: { fids: subRefs.map((s) => s.fid) },
          });
          const subList = Array.isArray(subDown.data) ? subDown.data : [];
          subList.forEach((row, i) => {
            const ref = subRefs[i];
            if (row && row.download_url && ref) {
              subtitles.push({
                label: ref.name,
                lang: "zh",
                format: ref.format,
                url: row.download_url,
                headers: baseHeaders,
              });
            }
          });
        } catch (_) {}
      }

      return {
        streams,
        subtitles,
        renewable: true,
      };
    },
  };
})();
