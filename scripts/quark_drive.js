/// <reference path="../sdk/livedeck-sdk.d.ts" />

(function () {
  const cloud = Host.cloud;
  const quark = cloud.quark;
  const IGNORED_FOLDERS = { _LiveDeck_Temp: true };

  function isIgnoredFolder(file) {
    if (!file || file.file) return false;
    const name = Host.text.htmlUnescape(file.file_name || "").trim();
    return Boolean(IGNORED_FOLDERS[name]);
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
      remark: cloud.formatBytes(file.size) || "视频",
      kind: "movie",
    };
  }

  function mapEpisodes(videos, subs) {
    return videos.map((v, idx) => {
      const epName = Host.text.htmlUnescape(v.file_name || "视频 " + (idx + 1));
      return {
        episodeId: v.fid,
        name: epName + (v.size ? " (" + cloud.formatBytes(v.size) + ")" : ""),
        index: idx + 1,
        playData: JSON.stringify({ fid: v.fid, subs: cloud.matchSubtitles(epName, subs) }),
      };
    });
  }

  globalThis.LiveDeckVod = {
    async home() {
      const { list } = await quark.listFolder("0", 1, 100);
      const rootDirs = [];
      const featured = [];
      list.forEach((f) => {
        if (!f.file) {
          if (!isIgnoredFolder(f)) rootDirs.push(f);
        } else if (cloud.isVideoFile(f)) {
          featured.push(mapEntryToVodItem(f, "0"));
        }
      });

      const categories = [];
      const probed = rootDirs.slice(0, 16);
      const childMap = await quark.listFoldersBatch(
        probed.map((f) => f.fid),
        50,
      );
      rootDirs.forEach((f, idx) => {
        const name = Host.text.htmlUnescape(f.file_name || "") || "文件夹";
        if (idx < probed.length) {
          const childRes = childMap[String(f.fid)] || { list: [], total: 0 };
          const directVideos = childRes.list.filter(cloud.isVideoFile);
          const subDirs = childRes.list.filter((c) => !c.file && !isIgnoredFolder(c));
          if (directVideos.length === 0 && subDirs.length > 0 && subDirs.length <= 12) {
            subDirs.forEach((sf) => {
              const sfName = Host.text.htmlUnescape(sf.file_name || "") || "子目录";
              categories.push({ id: String(sf.fid), name: name + " / " + sfName });
            });
            return;
          }
        }
        categories.push({ id: String(f.fid), name });
      });

      return { categories, featured };
    },

    async category({ categoryId, page }) {
      const pg = Math.max(1, Number(page || 1));
      const pageSize = 100;
      const { list, total } = await quark.listFolder(categoryId || "0", pg, pageSize);
      const items = [];
      list.forEach((f) => {
        if (isIgnoredFolder(f)) return;
        if (!f.file || cloud.isVideoFile(f)) {
          items.push(mapEntryToVodItem(f, categoryId || "0"));
        }
      });
      return { items, page: pg, hasMore: pg * pageSize < total };
    },

    async search({ keyword, page }) {
      const pg = Math.max(1, Number(page || 1));
      const data = await quark.request("/file/search", {
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
        if (isIgnoredFolder(f)) return;
        if (!f.file || cloud.isVideoFile(f)) {
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
        const { list } = await quark.listFolder(dirFid, 1, 200);
        const videos = list.filter(cloud.isVideoFile);
        const subs = list.filter(cloud.isSubtitleFile);
        const subFolders = list.filter((f) => !f.file && !isIgnoredFolder(f)).slice(0, 48);
        const sources = [];
        if (videos.length > 0) {
          sources.push({
            sourceId: "dir-" + dirFid,
            name: "当前目录",
            episodes: mapEpisodes(videos, subs),
          });
        }

        const subMap = await quark.listFoldersBatch(
          subFolders.map((sf) => sf.fid),
          200,
        );
        const grandSubs = [];
        subFolders.forEach((sf) => {
          const sfName = Host.text.htmlUnescape(sf.file_name || "子目录");
          const sfRes = subMap[String(sf.fid)] || { list: [], total: 0 };
          const sfVideos = sfRes.list.filter(cloud.isVideoFile);
          if (sfVideos.length > 0) {
            sources.push({
              sourceId: "sub-" + sf.fid,
              name: sfName,
              episodes: mapEpisodes(sfVideos, sfRes.list.filter(cloud.isSubtitleFile)),
            });
          }
          sfRes.list
            .filter((c) => !c.file && !isIgnoredFolder(c))
            .forEach((gsf) => {
              if (grandSubs.length < 48) grandSubs.push({ parentName: sfName, folder: gsf });
            });
        });

        if (grandSubs.length > 0) {
          const grandMap = await quark.listFoldersBatch(
            grandSubs.map((g) => g.folder.fid),
            200,
          );
          grandSubs.forEach((g) => {
            const gsf = g.folder;
            const gsfName = Host.text.htmlUnescape(gsf.file_name || "子目录");
            const gsfRes = grandMap[String(gsf.fid)] || { list: [], total: 0 };
            const gsfVideos = gsfRes.list.filter(cloud.isVideoFile);
            if (gsfVideos.length > 0) {
              sources.push({
                sourceId: "sub-" + gsf.fid,
                name: g.parentName + " / " + gsfName,
                episodes: mapEpisodes(gsfVideos, gsfRes.list.filter(cloud.isSubtitleFile)),
              });
            }
          });
        }

        return { vodId: raw, title: dirTitle, sources };
      }

      const fileFid = parts[1] || raw;
      const pdirFid = parts[2] || "0";
      const { list } = await quark.listFolder(pdirFid, 1, 200);
      const target = list.find((f) => f.fid === fileFid);
      const fileTitle = target ? Host.text.htmlUnescape(target.file_name || fileFid) : fileFid;
      const subs = list.filter(cloud.isSubtitleFile);
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
                playData: JSON.stringify({ fid: fileFid, subs: cloud.matchSubtitles(fileTitle, subs) }),
              },
            ],
          },
        ],
      };
    },

    async play({ playData }) {
      let parsed = { fid: String(playData || ""), subs: [] };
      try {
        if (String(playData || "").trim().startsWith("{")) parsed = JSON.parse(playData);
      } catch (_) {}
      return await quark.playFile(parsed.fid, parsed.subs || []);
    },
  };
})();
