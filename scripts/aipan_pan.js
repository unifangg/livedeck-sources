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
    const filtered = list.filter(
      (m) => !Array.isArray(m.panKinds) || m.panKinds.includes("quark") || m.panKinds.includes("uc"),
    );
    const pool = filtered.length > 0 ? filtered : list;
    return pool
      .map((m) => ({
        vodId: "aipan:" + m.id,
        title: Host.text.htmlUnescape(m.title || "").trim(),
        poster: m.cover || undefined,
        year: m.year ? Number(m.year) : undefined,
        rating: m.rate ? String(m.rate) : undefined,
        genres: Array.isArray(m.genres) ? m.genres : [],
        remark: (m.badges && m.badges[0] && m.badges[0].label) || (m.rate ? "评分 " + m.rate : "4K夸克"),
      }))
      .filter((it) => Boolean(it.title));
  }

  globalThis.LiveDeckVod = {
    async home() {
      const data = await fetchApi("/api/movies/list", { page: "1" });
      return { categories: CATEGORIES, featured: mapMovies(data.movies) };
    },
    async category({ categoryId, page }) {
      const pg = Math.max(1, Number(page || 1));
      const cat = String(categoryId || "all");
      const data =
        cat === "all"
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
        Host.cloud.extractShares(txt).forEach((s) => {
          const key = s.provider + ":" + s.pwdId;
          if (!seen[key]) {
            seen[key] = true;
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
      const sources = await Host.cloud.resolveShareSources(shares);
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
      return await Host.cloud.playShare(playData);
    },
  };
})();
