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
      const sources = await Host.cloud.resolveShareSources(html);
      return { vodId, title, poster, synopsis, sources };
    },
    async play({ playData }) {
      return await Host.cloud.playShare(playData);
    },
  };
})();
