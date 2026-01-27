import { NextRequest, NextResponse } from 'next/server';
import { fetchOGPMetadata } from '@/app/lib/ogp-fetcher';
import { truncateText, findWrapPoint } from '@/app/lib/text-measurement';

const CARD_WIDTH = 800;
const CARD_HEIGHT = 200;
const IMAGE_WIDTH = 382; // 1.91:1 アスペクト比（OGP標準）

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
 * 最適化: タイムアウト短縮、サイズ制限厳格化、WebP/AVIF優先、ストリーミング
 */
async function fetchImageAsBase64(imageUrl: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5秒タイムアウト

    const response = await fetch(imageUrl, {
      signal: controller.signal,
      next: { revalidate: 86400 }, // 24時間キャッシュ
      headers: {
        'User-Agent': 'OGP-Fetcher/1.0',
        'Accept': 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) return null;

    const MAX_SIZE = 2 * 1024 * 1024; // 2MB制限

    // Content-Lengthによる事前チェック
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_SIZE) {
      console.warn(`Image too large (${contentLength} bytes): ${imageUrl}`);
      return null;
    }

    // ストリーミングダウンロード（段階的サイズチェック）
    if (!response.body) {
      return null;
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let receivedLength = 0;

    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      chunks.push(value);
      receivedLength += value.length;

      // 段階的サイズチェック（2MB超過で即中止）
      if (receivedLength > MAX_SIZE) {
        console.warn(`Image exceeded size limit during download: ${imageUrl}`);
        reader.cancel();
        return null;
      }
    }

    // 全チャンクを結合
    const imageData = new Uint8Array(receivedLength);
    let position = 0;
    for (const chunk of chunks) {
      imageData.set(chunk, position);
      position += chunk.length;
    }

    const base64 = Buffer.from(imageData).toString('base64');
    const contentType = response.headers.get('content-type') || 'image/jpeg';

    return `data:${contentType};base64,${base64}`;
  } catch (error) {
    // タイムアウトやネットワークエラーは警告レベル
    if (error instanceof Error && error.name === 'AbortError') {
      console.warn(`Image fetch timeout: ${imageUrl}`);
    } else {
      console.error('Failed to fetch image:', error);
    }
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
  // 幅ベースの切り詰めを使用（文字幅を考慮した精密な測定）
  // タイトル（22px、1行）: 350px幅まで
  const safeTitle = escapeHtml(truncateText(title, 350, 22));

  // 説明文（14px、2行）: 賢い改行処理
  const LINE_WIDTH = 350; // 1行あたりの最大幅
  const FONT_SIZE = 14;
  let descLine1 = '';
  let descLine2 = '';

  if (description) {
    // 1行目: 折り返し位置を見つける
    const wrapPoint = findWrapPoint(description, LINE_WIDTH, FONT_SIZE);
    const firstLine = description.substring(0, wrapPoint).trim();

    // 2行目: 残りのテキスト（wrapPointがスペースの場合は+1してスキップ）
    const remainingStart = description[wrapPoint] === ' ' ? wrapPoint + 1 : wrapPoint;
    const remaining = description.substring(remainingStart).trim();

    descLine1 = escapeHtml(truncateText(firstLine, LINE_WIDTH, FONT_SIZE));
    if (remaining) {
      descLine2 = escapeHtml(truncateText(remaining, LINE_WIDTH, FONT_SIZE));
    }
  }

  // 画像がない場合のプレースホルダー
  const imageElement = imageDataUrl
    ? `<image href="${imageDataUrl}" x="0" y="0" width="${IMAGE_WIDTH}" height="${CARD_HEIGHT}" preserveAspectRatio="xMidYMid slice" clip-path="url(#imageClip)" />`
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
      <rect x="0" y="0" width="${IMAGE_WIDTH}" height="${CARD_HEIGHT}" rx="0" ry="0"/>
    </clipPath>
  </defs>

  <!-- Background -->
  <rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="white" rx="0"/>

  <!-- Border -->
  <rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="none" stroke="#e5e7eb" stroke-width="2" rx="0"/>

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
    <tspan x="${textX}" dy="0">${descLine1}</tspan>
    ${descLine2 ? `<tspan x="${textX}" dy="20">${descLine2}</tspan>` : ''}
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
  <rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="#fee2e2" rx="0"/>
  <rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="none" stroke="#ef4444" stroke-width="2" rx="0"/>
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
  <rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="#fee2e2" rx="0"/>
  <rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="none" stroke="#ef4444" stroke-width="2" rx="0"/>
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
