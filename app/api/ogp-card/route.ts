import { NextRequest, NextResponse } from 'next/server';
import { fetchOGPMetadata } from '@/app/lib/ogp-fetcher';

const CARD_WIDTH = 800;
const CARD_HEIGHT = 200;
const IMAGE_WIDTH = 382; // 1.91:1 アスペクト比（OGP標準）

/**
 * テキストを指定幅に収まるように切り詰め
 */
function truncateText(text: string | undefined, maxLength: number): string {
  if (!text) return '';

  let count = 0;
  let result = '';

  for (const char of text) {
    const charSize = char.match(/[ -~]/) ? 1 : 2;
    if (count + charSize > maxLength) {
      return result + '...'
    }

    count += charSize;
    result += char;
  }

  return result;
}

/**
 * URLからドメイン名を抽出
 */
function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * HTMLエスケープ
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * 画像をfetchしてbase64エンコード
 */
async function fetchImageAsBase64(imageUrl: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒タイムアウト

    const response = await fetch(imageUrl, {
      signal: controller.signal,
      next: { revalidate: 3600 }, // 1時間キャッシュ
      headers: {
        'User-Agent': 'OGP-Fetcher/1.0',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) return null;

    // 画像サイズ制限（5MB）
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > 5 * 1024 * 1024) {
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const contentType = response.headers.get('content-type') || 'image/jpeg';

    return `data:${contentType};base64,${base64}`;
  } catch (error) {
    console.error('Failed to fetch image:', error);
    return null;
  }
}

/**
 * SVGカードを生成
 */
function generateSVGCard(
  title: string,
  description: string,
  imageDataUrl: string | null,
  sourceUrl: string
): string {
  const domain = extractDomain(sourceUrl);
  const safeDomain = escapeHtml(domain);

  // テキスト領域の設定
  const textX = IMAGE_WIDTH + 20; // 画像幅 + 左マージン
  const textWidth = CARD_WIDTH - IMAGE_WIDTH - 40; // 右マージンも考慮（418 - 40 = 378px）

  // テキストがはみ出さないように厳密に制限
  // タイトル（22px、1行）: 30文字まで
  // 説明文（14px、2行）: 各行45文字、合計90文字まで
  const safeTitle = escapeHtml(truncateText(title, 30));
  const safeDescription = escapeHtml(truncateText(description, 60));

  // 画像がない場合のプレースホルダー
  const imageElement = imageDataUrl
    ? `<image href="${imageDataUrl}" x="0" y="0" width="${IMAGE_WIDTH}" height="${CARD_HEIGHT}" preserveAspectRatio="xMidYMid meet" clip-path="url(#imageClip)" />`
    : `<rect x="0" y="0" width="${IMAGE_WIDTH}" height="${CARD_HEIGHT}" fill="#e5e7eb" clip-path="url(#imageClip)"/>
       <text x="${IMAGE_WIDTH / 2}" y="${CARD_HEIGHT / 2}" font-family="Arial, sans-serif" font-size="60" fill="#9ca3af" text-anchor="middle" dominant-baseline="middle">📄</text>`;

  // 200px高さに最適化した配置
  const titleY = 50;
  const descriptionY = 100;
  const domainY = 190;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${CARD_WIDTH}" height="${CARD_HEIGHT}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs>
    <clipPath id="imageClip">
      <rect x="0" y="0" width="${IMAGE_WIDTH}" height="${CARD_HEIGHT}" rx="12" ry="12"/>
    </clipPath>
  </defs>

  <!-- Background -->
  <rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="white" rx="12"/>

  <!-- Border -->
  <rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="none" stroke="#e5e7eb" stroke-width="2" rx="12"/>

  <!-- Image (left side, full height) -->
  ${imageElement}

  <!-- クリック可能なリンク（JavaScriptで処理） -->
  <rect x="0" y="0" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="transparent" style="cursor: pointer;" onclick="window.open('${escapeHtml(sourceUrl)}', '_blank')"/>

  <!-- Title -->
  <text x="${textX}" y="${titleY}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif" font-size="22" font-weight="bold" fill="#111827" pointer-events="none">
    ${safeTitle}
  </text>

  <!-- Description -->
  <text x="${textX}" y="${descriptionY}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif" font-size="14" fill="#6b7280" pointer-events="none">
    <tspan x="${textX}" dy="0">${safeDescription.substring(0, 45)}</tspan>
    ${safeDescription.length > 45 ? `<tspan x="${textX}" dy="20">${safeDescription.substring(45)}</tspan>` : ''}
  </text>

  <!-- Domain -->
  <text x="${textX}" y="${domainY}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif" font-size="12" fill="#9ca3af" pointer-events="none">
    🔗 ${safeDomain}
  </text>
</svg>`;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const url = searchParams.get('url');

  if (!url) {
    // エラー用のSVGを返す
    const errorSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${CARD_WIDTH}" height="${CARD_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="#fee2e2" rx="12"/>
  <rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="none" stroke="#ef4444" stroke-width="2" rx="12"/>
  <text x="${CARD_WIDTH / 2}" y="${CARD_HEIGHT / 2}" font-family="Arial, sans-serif" font-size="18" fill="#991b1b" text-anchor="middle" dominant-baseline="middle">
    ❌ URL parameter is required
  </text>
</svg>`;

    return new NextResponse(errorSvg, {
      status: 400,
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=60',
      },
    });
  }

  const result = await fetchOGPMetadata(url);

  if (!result.success) {
    // エラー用のSVGを返す
    const errorSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${CARD_WIDTH}" height="${CARD_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="#fee2e2" rx="12"/>
  <rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="none" stroke="#ef4444" stroke-width="2" rx="12"/>
  <text x="${CARD_WIDTH / 2}" y="${CARD_HEIGHT / 2 - 10}" font-family="Arial, sans-serif" font-size="18" fill="#991b1b" text-anchor="middle" dominant-baseline="middle">
    ❌ Failed to fetch OGP data
  </text>
  <text x="${CARD_WIDTH / 2}" y="${CARD_HEIGHT / 2 + 20}" font-family="Arial, sans-serif" font-size="14" fill="#991b1b" text-anchor="middle" dominant-baseline="middle">
    ${escapeHtml(result.error)}
  </text>
</svg>`;

    return new NextResponse(errorSvg, {
      status: result.statusCode,
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=60',
      },
    });
  }

  const { title, description, image } = result.metadata;

  // 画像URLを絶対URLに変換
  let absoluteImageUrl = image;
  if (image && !image.startsWith('http')) {
    try {
      const base = new URL(url);
      absoluteImageUrl = new URL(image, base.origin).href;
    } catch {
      // URL解析失敗時はそのまま使用
      absoluteImageUrl = image;
    }
  }

  // 画像をbase64エンコード
  const imageDataUrl = absoluteImageUrl ? await fetchImageAsBase64(absoluteImageUrl) : null;

  const svg = generateSVGCard(
    title || 'No Title',
    description || 'No description available',
    imageDataUrl,
    url
  );

  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
