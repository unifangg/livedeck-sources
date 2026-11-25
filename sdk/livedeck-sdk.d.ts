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
    html: boolean;
    xml: boolean;
    crypto: boolean;
    des: boolean;
    rsa: boolean;
    codec: boolean;
    text: boolean;
    cache: boolean;
    require: boolean;
    runtime: boolean;
    danmaku: boolean;
    resolvers: boolean;
    localProxy: boolean;
  }

  interface HostHttpRequestOptions {
    url: string;
    method?: "GET" | "POST" | "HEAD" | "PUT" | "PATCH" | "DELETE";
    headers?: Record<string, string>;
    body?: string;
    bodyBase64?: string;
    params?: Record<string, string>;
    json?: unknown;
    form?: Record<string, string>;
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
  type AesMode = "cbc" | "ecb" | "ctr" | "gcm";
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
    dataEncoding?: ByteEncoding;
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
    subtitle?: string | null;
    poster?: string | null;
    backdrop?: string | null;
    remark?: string | null;
    year?: number | null;
    region?: string | null;
    genres?: string[];
    rating?: string | null;
    kind?: "movie" | "series" | "anime" | "variety" | "documentary" | "other" | null;
  }

  interface SdkVodEpisode {
    episodeId: string;
    name: string;
    index: number;
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
      url: string;
      format?: string | null;
    }>;
    audioTracks?: Array<{
      label: string;
      lang?: string | null;
      url: string;
    }>;
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
  }

  var LiveDeckVod: LiveDeckVodPlugin | undefined;
}

export {};
