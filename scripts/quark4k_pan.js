/// <reference path="../sdk/livedeck-sdk.d.ts" />

(function () {
  const BASE_URL = "https://quark4k.com";
  const SITE_UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
  const CATEGORIES = [
    { id: "yingshiziyuan", name: "影视资源" },
    { id: "dongmanziyuan", name: "动漫资源" },
    { id: "zhzl", name: "综合资料" },
  ];

  async function fetchApi(pathname, params) {
    const res = await Host.http.get(BASE_URL + pathname, {
      params: params || {},
      headers: { "User-Agent": SITE_UA, Accept: "application/json" },
      insecureTls: true,
      timeout: 15,
    });
    if (!res || !res.ok) Host.raise("UPSTREAM_ERROR", "夸克4K接口请求失败: HTTP " + (res ? res.status : 0));
    return res.json();
  }

  function mapDiscussions(payload) {
    const postById = Object.create(null);
    ((payload && payload.included) || []).forEach((inc) => {
      if (inc && inc.type === "posts" && inc.id) {
        postById[String(inc.id)] = inc.attributes || {};
      }
    });
    const items = [];
    ((payload && payload.data) || []).forEach((disc) => {
      const attrs = disc.attributes || {};
      if (attrs.isSticky) return;
      const fp = disc.relationships && disc.relationships.firstPost && disc.relationships.firstPost.data;
      const post = fp && fp.id ? postById[String(fp.id)] : null;
      const contentHtml = (post && post.contentHtml) || "";
      const imgM = /src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i.exec(contentHtml);
      const poster = imgM ? imgM[1] : undefined;
      const rawTitle = Host.text.htmlUnescape(attrs.title || "").trim();
      if (!rawTitle) return;
      const title = rawTitle.replace(/\s*夸克网盘下载\s*$/i, "").trim();
      items.push({ vodId: "disc:" + disc.id, title, poster, remark: "4K夸克" });
    });
    return items;
  }

  globalThis.LiveDeckVod = {
    async home() {
      const payload = await fetchApi("/api/discussions", {
        "filter[tag]": "yingshiziyuan",
        "page[limit]": "20",
        include: "firstPost",
      });
      return { categories: CATEGORIES, featured: mapDiscussions(payload) };
    },
    async category({ categoryId, page }) {
      const pg = Math.max(1, Number(page || 1));
      const payload = await fetchApi("/api/discussions", {
        "filter[tag]": String(categoryId || "yingshiziyuan"),
        "page[offset]": String((pg - 1) * 20),
        "page[limit]": "20",
        include: "firstPost",
      });
      const items = mapDiscussions(payload);
      return { items, page: pg, hasMore: Boolean(payload.links && payload.links.next) };
    },
    async search({ keyword, page }) {
      const pg = Math.max(1, Number(page || 1));
      const payload = await fetchApi("/api/discussions", {
        "filter[q]": String(keyword || "").trim(),
        "page[offset]": String((pg - 1) * 20),
        "page[limit]": "20",
        include: "firstPost",
      });
      const items = mapDiscussions(payload);
      return { items, page: pg, hasMore: Boolean(payload.links && payload.links.next) };
    },
    async detail({ vodId }) {
      const id = String(vodId || "").replace(/^disc:/, "");
      const payload = await fetchApi("/api/discussions/" + encodeURIComponent(id), {});
      const attrs = (payload.data && payload.data.attributes) || {};
      const title = Host.text.htmlUnescape(attrs.title || "夸克4K").replace(/\s*夸克网盘下载\s*$/i, "").trim();
      let allHtml = "";
      ((payload && payload.included) || []).forEach((inc) => {
        if (inc && inc.type === "posts" && inc.attributes && inc.attributes.contentHtml) {
          allHtml += "\n" + inc.attributes.contentHtml;
        }
      });
      const imgM = /src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i.exec(allHtml);
      const poster = imgM ? imgM[1] : undefined;
      const sources = await Host.cloud.resolveShareSources(allHtml);
      return { vodId, title, poster, sources };
    },
    async play({ playData }) {
      return await Host.cloud.playShare(playData);
    },
  };
})();
