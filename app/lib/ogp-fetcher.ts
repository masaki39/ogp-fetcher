import * as cheerio from 'cheerio';
import { isSafeUrl } from './security';
import type { OGPMetadata, FetchOGPOptions, FetchOGPResponse, FetchOGPError } from './types';

const DEFAULT_TIMEOUT = 30000; // 30秒
const DEFAULT_MAX_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * URLからHTMLを安全に取得
 */
export async function fetchHTML(
  url: string,
  options: FetchOGPOptions = {}
): Promise<FetchOGPResponse> {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const maxSize = options.maxSize ?? DEFAULT_MAX_SIZE;

  // URL安全性チェック
  const { safe, error } = isSafeUrl(url);
  if (!safe) {
    return {
      success: false,
      error: error || 'Invalid URL',
      statusCode: 400,
    };
  }

  // タイムアウト設定
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      next: { revalidate: 3600 }, // 1時間キャッシュ
      headers: {
        'User-Agent': 'OGP-Fetcher/1.0',
      },
    });

    clearTimeout(timeoutId);

    // HTTPステータスチェック
    if (!response.ok) {
      return {
        success: false,
        error: 'Failed to fetch URL',
        statusCode: response.status >= 500 ? 502 : 404,
      };
    }

    // Content-Lengthチェック
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > maxSize) {
      return {
        success: false,
        error: 'Content too large',
        statusCode: 413,
      };
    }

    // HTMLを取得（サイズ制限付き）
    const html = await response.text();

    // テキスト取得後もサイズチェック
    if (html.length > maxSize) {
      return {
        success: false,
        error: 'Content too large',
        statusCode: 413,
      };
    }

    return {
      success: true,
      html,
    };
  } catch (error) {
    clearTimeout(timeoutId);

    // タイムアウトエラー
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        success: false,
        error: 'Request timeout',
        statusCode: 504,
      };
    }

    // その他のエラー（詳細を露出しない）
    console.error('Fetch error:', error);
    return {
      success: false,
      error: 'Failed to fetch URL',
      statusCode: 500,
    };
  }
}

/**
 * HTMLからOGPメタデータを抽出
 */
export function extractOGPMetadata(html: string): OGPMetadata {
  const $ = cheerio.load(html);

  return {
    title: $('meta[property="og:title"]').attr('content') || $('title').text() || undefined,
    description:
      $('meta[property="og:description"]').attr('content') ||
      $('meta[name="description"]').attr('content') ||
      undefined,
    image: $('meta[property="og:image"]').attr('content') || undefined,
  };
}

/**
 * URLからOGPメタデータを取得
 */
export async function fetchOGPMetadata(
  url: string,
  options?: FetchOGPOptions
): Promise<{ success: true; metadata: OGPMetadata } | FetchOGPError> {
  const result = await fetchHTML(url, options);

  if (!result.success) {
    return result;
  }

  const metadata = extractOGPMetadata(result.html);

  return {
    success: true,
    metadata,
  };
}
