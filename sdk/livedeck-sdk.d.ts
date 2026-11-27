/**
 * LiveDeck VOD & Live Script Plugin SDK (QuickJS Sandbox)
 */

declare global {
  class URLSearchParams {
    constructor(init?: string | string[][] | Record<string, string> | URLSearchParams);
    get(name: string): string | null;
    getAll(name: string): string[];
    has(name: string): boolean;
    set(name: string, value: string): void;
    append(name: string, value: string): void;
    delete(name: string): void;
    keys(): string[];
    values(): string[];
    entries(): Array<[string, string]>;
    forEach(cb: (value: string, key: string, parent: URLSearchParams) => void, thisArg?: unknown): void;
    toString(): string;
  }

  class URL {
    constructor(input: string, base?: string);
    readonly href: string;
    readonly origin: string;
    readonly protocol: string;
    readonly host: string;
    readonly hostname: string;
    readonly port: string;
    readonly pathname: string;
    search: string;
    readonly hash: string;
    readonly searchParams: URLSearchParams;
    toString(): string;
    toJSON(): string;
  }

  interface HostCapabilities {
    loginTransaction: boolean;
    loginChallengeProtocol: number;
    credentialExposure: boolean;
    http: boolean;
    multipart: boolean;
    brotli: boolean;
    html: boolean;
    xml: boolean;
    crypto: boolean;
    aesCfb: boolean;
    aesOfb: boolean;
    des: boolean;
    rsa: boolean;
    rsaOaep: boolean;
    rsaSign: boolean;
    pbkdf2: boolean;
    sm4: boolean;
    codec: boolean;
    text: boolean;
    cache: boolean;
    require: boolean;
    runtime: boolean;
    danmaku: boolean;
    resolvers: boolean;
    localProxy: boolean;
  }

  type HostMultipartPart = {
    name: string;
    value?: string | number | boolean;
    valueBase64?: string;
    filename?: string;
    contentType?: string;
  };

  interface HostHttpRequestOptions {
    url: string;
    method?: "GET" | "POST" | "HEAD" | "PUT" | "PATCH" | "DELETE";
    headers?: Record<string, string>;
    body?: string;
    bodyBase64?: string;
    params?: Record<string, string>;
    json?: unknown;
    form?: Record<string, string>;
    multipart?: Record<string, string | number | boolean> | HostMultipartPart[];
    insecureTls?: boolean;
    timeout?: number;
    followRedirects?: boolean;
    maxRedirects?: number;
    responseType?: "text" | "bytes" | "base64";
    cookieJar?: boolean;
    platformId?: string;
    authMode?: "platform_cookie" | "login_transaction";
    transactionId?: string;
  }

  interface HostHttpResponse {
    ok: boolean;
    status: number;
    statusCode: number;
    url: string;
    finalUrl: string;
    headers: Record<string, string>;
    setCookieHeaders: string[];
    body: string;
    bodyText: string;
    bodyBase64: string;
    bytes?: number[];
    json<T = unknown>(): T;
  }

  interface HostHttpBatchItemResult {
    ok: boolean;
    response?: HostHttpResponse;
    error?: string;
  }

  interface DomNodeSnapshot {
    tag: string;
    text: string;
    html: string;
    attrs: Record<string, string>;
  }

  type BinaryInput = string | ArrayBuffer | ArrayBufferView | number[];
  type AesMode = "cbc" | "ecb" | "ctr" | "gcm" | "cfb" | "cfb8" | "ofb";
  type Sm4Mode = "cbc" | "ecb" | "ctr" | "cfb" | "ofb";
  type AesPadding = "pkcs7" | "pkcs5" | "zero" | "none";
  type ByteEncoding = "utf8" | "base64" | "base64url" | "hex";

  interface HostAesOptions {
    data: string;
    dataEncoding?: ByteEncoding;
    key: string;
    keyEncoding?: ByteEncoding;
    iv?: string;
    ivEncoding?: ByteEncoding;
    aad?: string;
    aadEncoding?: ByteEncoding;
    mode?: AesMode;
    padding?: AesPadding;
    outputEncoding?: ByteEncoding;
  }

  interface HostDesOptions {
    data: string;
    dataEncoding?: ByteEncoding;
    key: string;
    keyEncoding?: ByteEncoding;
    iv?: string;
    ivEncoding?: ByteEncoding;
    mode?: "cbc" | "ecb";
    padding?: AesPadding;
    outputEncoding?: ByteEncoding;
  }

  interface HostRsaOptions {
    data: string;
    key?: string;
    publicKey?: string;
    privateKey?: string;
    padding?: "pkcs1" | "oaep" | "oaep-sha256" | "oaep-sha1";
    hash?: "sha256" | "sha1" | "sha512" | "md5";
    signature?: string;
    signatureEncoding?: ByteEncoding;
    dataEncoding?: ByteEncoding;
    outputEncoding?: ByteEncoding;
  }

  interface HostPbkdf2Options {
    password: string;
    salt: string;
    iterations?: number;
    keyLen?: number;
    algo?: "sha256" | "sha1" | "sha512";
    passwordEncoding?: ByteEncoding;
    saltEncoding?: ByteEncoding;
    outputEncoding?: ByteEncoding;
  }

  interface HostSm4Options {
    data: string;
    dataEncoding?: ByteEncoding;
    key: string;
    keyEncoding?: ByteEncoding;
    iv?: string;
    ivEncoding?: ByteEncoding;
    mode?: Sm4Mode;
    padding?: AesPadding;
    outputEncoding?: ByteEncoding;
  }

  interface HostWsMessageEvent {
    type: "open" | "text" | "binary" | "close" | "error";
    text?: string;
    base64?: string;
    code?: number;
    reason?: string;
    error?: string;
  }

  interface HostWsConnection {
    id: number;
    onMessage(cb: (ev: HostWsMessageEvent) => void): void;
    send(msg: string | { type: "text" | "binary"; text?: string; base64?: string }): Promise<void>;
    close(opts?: { code?: number; reason?: string }): Promise<void>;
  }

  const Host: {
    capabilities: HostCapabilities;
    http: {
      request(options: HostHttpRequestOptions): Promise<HostHttpResponse>;
      get(url: string, options?: Omit<HostHttpRequestOptions, "url" | "method">): Promise<HostHttpResponse>;
      post(
        url: string,
        body?: string,
        options?: Omit<HostHttpRequestOptions, "url" | "method" | "body">,
      ): Promise<HostHttpResponse>;
      head(url: string, options?: Omit<HostHttpRequestOptions, "url" | "method">): Promise<HostHttpResponse>;
      put(
        url: string,
        body?: string,
        options?: Omit<HostHttpRequestOptions, "url" | "method" | "body">,
      ): Promise<HostHttpResponse>;
      delete(url: string, options?: Omit<HostHttpRequestOptions, "url" | "method">): Promise<HostHttpResponse>;
      batch(requests: HostHttpRequestOptions[], concurrency?: number): Promise<HostHttpBatchItemResult[]>;
    };
    html: {
      select(html: string, selector: string): DomNodeSnapshot | null;
      selectAll(html: string, selector: string): DomNodeSnapshot[];
      selectTexts(html: string, selector: string): string[];
      selectAttrs(html: string, selector: string, attrName: string): string[];
      text(html: string, selector: string): string;
      attr(html: string, selector: string, attrName: string): string | null;
      rawHtml(html: string, selector: string): string;
      xpath(html: string, expr: string): string[];
      xpathOne(html: string, expr: string): string | null;
      xpathNodes(html: string, expr: string): DomNodeSnapshot[];
      pdfa(html: string, rule: string): string[];
      pdfh(html: string, rule: string): string;
      pd(html: string, rule: string, baseUrl?: string): string;
    };
    xml: {
      select(xml: string, selector: string): DomNodeSnapshot | null;
      selectAll(xml: string, selector: string): DomNodeSnapshot[];
      xpath(xml: string, expr: string): string[];
      xpathOne(xml: string, expr: string): string | null;
      xpathNodes(xml: string, expr: string): DomNodeSnapshot[];
      toJson(xml: string): Record<string, unknown>;
    };
    crypto: {
      md5(input: string): string;
      sha1(input: BinaryInput): string;
      sha256(input: BinaryInput): string;
      sha512(input: BinaryInput): string;
      hmac(algo: "md5" | "sha1" | "sha256" | "sha512", key: BinaryInput, data: BinaryInput): string;
      aesEncrypt(options: HostAesOptions): string;
      aesDecrypt(options: HostAesOptions): string;
      desEncrypt(options: HostDesOptions): string;
      desDecrypt(options: HostDesOptions): string;
      tripleDesEncrypt(options: HostDesOptions): string;
      tripleDesDecrypt(options: HostDesOptions): string;
      rsaEncrypt(options: HostRsaOptions): string;
      rsaDecrypt(options: HostRsaOptions): string;
      rsaPublicDecrypt(options: HostRsaOptions): string;
      rsaSign(options: HostRsaOptions): string;
      rsaVerify(options: HostRsaOptions): boolean;
      pbkdf2(options: HostPbkdf2Options): string;
      sm4Encrypt(options: HostSm4Options): string;
      sm4Decrypt(options: HostSm4Options): string;
      rc4(key: BinaryInput, data: BinaryInput, options?: { dataEncoding?: ByteEncoding; outputEncoding?: ByteEncoding }): string;
      randomBytes(len: number, outputEncoding?: ByteEncoding | "bytes"): string | number[];
      uuid(): string;
      base64Encode(input: BinaryInput): string;
      base64Decode(input: string): string;
      base64DecodeBytes(input: string): number[];
      base64UrlEncode(input: BinaryInput): string;
      base64UrlDecode(input: string, outputEncoding?: ByteEncoding | "bytes"): string | number[];
      hexEncode(input: BinaryInput): string;
      hexDecode(input: string, outputEncoding?: ByteEncoding | "bytes"): string | number[];
    };
    codec: {
      gzipCompress(input: BinaryInput): number[];
      gzipDecompress(input: BinaryInput): number[];
      zlibCompress(input: BinaryInput): number[];
      zlibDecompress(input: BinaryInput): number[];
      deflateCompress(input: BinaryInput): number[];
      deflateDecompress(input: BinaryInput): number[];
      decodeText(input: BinaryInput, encoding?: string): string;
      encodeText(text: string, encoding?: string): number[];
      urlEncode(str: string): string;
      urlDecode(str: string): string;
    };
    text: {
      extractJson(html: string, prefix?: string): string | null;
      between(str: string, left: string, right: string): string | null;
      resolveUrl(base: string, rel: string): string;
      s2t(str: string): string;
      t2s(str: string): string;
      parseDelimitedSources(playFrom: string, playUrl: string): SdkVodPlaySource[];
    };
    cache: {
      get<T = unknown>(key: string): T | null;
      set(key: string, value: unknown, ttlSec?: number): void;
      del(key: string): void;
    };
    storage: {
      get<T = unknown>(key: string): T | null;
      set(key: string, value: unknown): void;
    };
    session: {
      getCookieHeader(platformId?: string): string;
      seedTransactionCookies(transactionId: string, cookies: unknown[], scope?: string): void;
    };
    time: {
      nowMillis(): number;
      sleep(ms: number): void;
    };
    ws: {
      open(options: { url: string; headers?: Record<string, string> }): Promise<HostWsConnection>;
    };
    makeError(code: string, message: string, context?: Record<string, unknown>): Error;
    raise(code: string, message: string, context?: Record<string, unknown>): never;
  };

  /** Jailed CommonJS relative loader (`./` or `../` inside package root, `.js`/`.json` only). */
  function require(specifier: string): unknown;

  interface SdkVodFilterOption {
    value: string;
    label: string;
  }

  interface SdkVodFilterGroup {
    key: string;
    name: string;
    options: SdkVodFilterOption[];
    defaultValue?: string | null;
  }

  interface SdkVodCategory {
    id: string;
    name: string;
    filters?: SdkVodFilterGroup[];
  }

   interface SdkVodItem {
    vodId: string;
    title: string;
    originalTitle?: string | null;
    subtitle?: string | null;
    poster?: string | null;
    backdrop?: string | null;
    remark?: string | null;
    year?: number | null;
    season?: number | null;
    region?: string | null;
    genres?: string[];
    rating?: string | null;
    kind?: "movie" | "series" | "anime" | "variety" | "documentary" | "other" | null;
    doubanId?: string | null;
    tmdbId?: string | null;
    imdbId?: string | null;
  }

  interface SdkVodEpisode {
    episodeId: string;
    name: string;
    index: number;
    episodeNumber?: number | null;
    playData: string;
    durationSec?: number | null;
  }

  interface SdkVodPlaySource {
    sourceId: string;
    name: string;
    episodes: SdkVodEpisode[];
  }

  interface SdkVodDetail extends SdkVodItem {
    synopsis?: string | null;
    actors?: string[];
    directors?: string[];
    statusText?: string | null;
    sources: SdkVodPlaySource[];
  }

  interface SdkSkipSegment {
    start: number;
    end: number;
    kind: "intro" | "outro" | "ad" | "recap" | string;
  }

  interface SdkSkipInfo {
    intro?: [number, number] | null;
    outro?: [number, number] | null;
    segments?: SdkSkipSegment[];
  }

  interface SdkTimedDanmakuComment {
    timeSec: number;
    /** `0` scrolling, `1` top fixed, `2` bottom fixed. */
    mode?: number;
    /** 24-bit RGB integer, e.g. `16777215` for `#FFFFFF`. */
    color?: number;
    text: string;
  }

  interface SdkDanmakuTrack {
    label: string;
    format?: "auto" | "bilibili_xml" | "dandanplay_json" | "dplayer_json" | string | null;
    url?: string | null;
    headers?: Record<string, string>;
    comments?: SdkTimedDanmakuComment[];
  }

  interface SdkMediaMatchContext {
    title: string;
    originalTitle?: string | null;
    year?: number | null;
    season?: number | null;
    episode?: number | null;
    episodeName?: string | null;
    durationSec?: number | null;
    doubanId?: string | null;
    tmdbId?: string | null;
    imdbId?: string | null;
    playUrl?: string | null;
  }

  interface SdkDanmakuSearchMatch {
    episodeId: string;
    animeTitle: string;
    episodeTitle: string;
    episodeNumber?: number | null;
    commentCount?: number | null;
  }

  interface SdkMediaPlayResult {
    streams: Array<{
      label: string;
      quality?: string | null;
      codec?: string | null;
      url?: string | null;
      videoUrl?: string | null;
      audioUrl?: string | null;
      userAgent?: string | null;
      headers?: Record<string, string>;
      ttlSec?: number | null;
      expiresAt?: number | null;
    }>;
    subtitles?: Array<{
      label: string;
      lang?: string | null;
      url?: string | null;
      body?: string | null;
      format?: string | null;
    }>;
    audioTracks?: Array<{
      label: string;
      lang?: string | null;
      url: string;
    }>;
    skip?: SdkSkipInfo | null;
    danmakuTracks?: SdkDanmakuTrack[];
  }

  interface SdkProxyResponse {
    status?: number;
    contentType?: string;
    headers?: Record<string, string>;
    body?: string;
    bodyBase64?: string;
    bodyBytes?: number[];
    upstreamUrl?: string;
    stripImageHeader?: boolean;
  }

  interface LiveDeckVodPlugin {
    home(payload: { config: Record<string, unknown> }):
      | Promise<{ categories: SdkVodCategory[]; featured: SdkVodItem[] }>
      | { categories: SdkVodCategory[]; featured: SdkVodItem[] };
    category(payload: {
      categoryId: string;
      page: number;
      filters: Record<string, string>;
      config: Record<string, unknown>;
    }):
      | Promise<{ items: SdkVodItem[]; page: number; totalPages?: number | null; hasMore: boolean }>
      | { items: SdkVodItem[]; page: number; totalPages?: number | null; hasMore: boolean };
    search(payload: { keyword: string; page: number; config: Record<string, unknown> }):
      | Promise<{ items: SdkVodItem[]; page: number; totalPages?: number | null; hasMore: boolean }>
      | { items: SdkVodItem[]; page: number; totalPages?: number | null; hasMore: boolean };
    detail(payload: { vodId: string; config: Record<string, unknown> }):
      | Promise<SdkVodDetail>
      | SdkVodDetail;
    play(payload: {
      vodId: string;
      sourceId: string;
      episodeId: string;
      playData: string;
      config: Record<string, unknown>;
    }):
      | Promise<SdkMediaPlayResult>
      | SdkMediaPlayResult;
    proxy?(payload: {
      path: string;
      query: string;
      params: Record<string, string>;
      headers: Record<string, string>;
      config: Record<string, unknown>;
    }):
      | Promise<SdkProxyResponse>
      | SdkProxyResponse;
    searchDanmaku?(payload: {
      keyword: string;
      year?: number | null;
      season?: number | null;
      episode?: number | null;
      config: Record<string, unknown>;
    }):
      | Promise<{ matches: SdkDanmakuSearchMatch[] } | SdkDanmakuSearchMatch[]>
      | { matches: SdkDanmakuSearchMatch[] }
      | SdkDanmakuSearchMatch[];
    getDanmaku?(payload: {
      episodeId?: string;
      title?: string | null;
      episode?: number | null;
      playUrl?: string | null;
      config: Record<string, unknown>;
    }):
      | Promise<{ comments?: SdkTimedDanmakuComment[]; url?: string; format?: string } | SdkTimedDanmakuComment[]>
      | { comments?: SdkTimedDanmakuComment[]; url?: string; format?: string }
      | SdkTimedDanmakuComment[];
  }

  var LiveDeckVod: LiveDeckVodPlugin | undefined;
}

export {};
