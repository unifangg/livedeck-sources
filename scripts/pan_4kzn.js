/// <reference path="../sdk/livedeck-sdk.d.ts" />

(function () {
  const BASE_URL = "https://4kzn.cc";
  const SITE_UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
  const CATEGORIES = [
    { id: "zuixin", name: "最新" },
    { id: "top250", name: "TOP250" },
    { id: "dianying", name: "电影" },
    { id: "juji", name: "剧集" },
  ];

  async function fetchHtml(pathOrUrl) {
    const url = /^https?:\/\//i.test(pathOrUrl) ? pathOrUrl : BASE_URL + pathOrUrl;
    const res = await Host.http.get(url, {
      headers: { "User-Agent": SITE_UA, Referer: BASE_URL + "/" },
      insecureTls: true,
      timeout: 15,
    });
    if (!res || !res.ok) Host.raise("UPSTREAM_ERROR", "4K指南请求失败: HTTP " + (res ? res.status : 0));
    return res.bodyText || res.body || "";
  }

  function parseCards(html) {
    const items = [];
    const seen = Object.create(null);
    Host.html.selectAll(html, "article.book-item").forEach((card) => {
      const ch = card.html || "";
      const a = Host.html.select(ch, "a[href*='/book/']");
      const href = a && a.attrs && a.attrs.href;
      if (!href) return;
      const vodId = Host.text.resolveUrl(BASE_URL, href);
      if (seen[vodId]) return;
      seen[vodId] = true;
      const img = Host.html.select(ch, "img");
      const rawPic = (img && img.attrs && (img.attrs["data-src"] || img.attrs["data-original"] || img.attrs.src)) || "";
      const poster = rawPic && !rawPic.includes("t1.svg") ? Host.text.resolveUrl(BASE_URL, rawPic) : undefined;
      const title = Host.text.htmlUnescape(Host.html.text(ch, "h3") || (img && img.attrs && img.attrs.alt) || "").trim();
      if (!title) return;
      const remark = Host.html.text(ch, ".item-tags").trim() || "4K夸克";
      items.push({ vodId, title, poster, remark });
    });
    return items;
  }

  globalThis.LiveDeckVod = {
    async home() {
      const html = await fetchHtml("/books/zuixin");
      return { categories: CATEGORIES, featured: parseCards(html).slice(0, 30) };
    },
    async category({ categoryId, page }) {
      const pg = Math.max(1, Number(page || 1));
      const cat = encodeURIComponent(categoryId || "zuixin");
      const path = pg > 1 ? `/books/${cat}/page/${pg}` : `/books/${cat}`;
      const html = await fetchHtml(path);
      const items = parseCards(html);
      return { items, page: pg, hasMore: items.length >= 16 };
    },
    async search({ keyword, page }) {
      const pg = Math.max(1, Number(page || 1));
      const kw = encodeURIComponent(String(keyword || "").trim());
      const path = pg > 1 ? `/?post_type=book&s=${kw}&paged=${pg}` : `/?post_type=book&s=${kw}`;
      const html = await fetchHtml(path);
      const items = parseCards(html);
      return { items, page: pg, hasMore: items.length >= 16 };
    },
    async detail({ vodId }) {
      const html = await fetchHtml(vodId);
      const title = Host.text.htmlUnescape(Host.html.text(html, "h1") || "4K指南影片").trim();
      const rawPic = Host.html.attr(html, ".book-cover img", "data-src") || Host.html.attr(html, ".book-cover img", "src") || "";
      const poster = rawPic ? Host.text.resolveUrl(BASE_URL, rawPic) : undefined;
      const synopsis = Host.html.text(html, ".panel-body").trim().slice(0, 300) || undefined;
      const sources = await Host.cloud.resolveShareSources(html);
      return { vodId, title, poster, synopsis, sources };
    },
    async play({ playData }) {
      return await Host.cloud.playShare(playData);
    },
  };
})();
