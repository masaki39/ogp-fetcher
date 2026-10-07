import { NextRequest, NextResponse } from 'next/server';
import { fetchOGPMetadata } from '@/app/lib/ogp-fetcher';
import { truncateText, findWrapPoint } from '@/app/lib/text-measurement';

interface LayoutConfig {
  cardWidth: number;
  cardHeight: number;
  imageWidth: number;
  imageHeight: number;
  borderRadius: number;
  borderWidth: number;
  borderColor: string;
  darkBorderColor: string;
  textX: number;
  textStartY: number;
  textWidth: number;
  titleFontSize: number;
  titleMaxLines: number;
  descFontSize: number;
  descMaxLines: number;
  domainFontSize: number;
  domainY: number;
  lineHeights: {
    title: number;
    description: number;
  };
  titleDescMargin: number;
  imagePosition: 'left' | 'top';
}

const LAYOUT_CONFIGS: Record<string, LayoutConfig> = {
  horizontal: {
    cardWidth: 700,
    cardHeight: 150,
    imageWidth: 286.5,
    imageHeight: 150,
    borderRadius: 0,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    darkBorderColor: '#374151',
    textX: 306.5,
    textStartY: 40,
    textWidth: 353.5,
    titleFontSize: 22,
    titleMaxLines: 1,
    descFontSize: 14,
    descMaxLines: 2,
    domainFontSize: 12,
    domainY: 140,
    lineHeights: { title: 0, description: 20 },
    titleDescMargin: 30,
    imagePosition: 'left'
  },
  vertical: {
    cardWidth: 300,
    cardHeight: 300,
    imageWidth: 300,
    imageHeight: 157,
    borderRadius: 20,
    borderWidth: 8,
    borderColor: '#e0e7ff',
    darkBorderColor: '#312e81',
    textX: 15,
    textStartY: 177,
    textWidth: 270,
    titleFontSize: 18,
    titleMaxLines: 2,
    descFontSize: 13,
    descMaxLines: 3,
    domainFontSize: 11,
    domainY: 290,
    lineHeights: { title: 26, description: 18 },
    titleDescMargin: 0,
    imagePosition: 'top'
  }
}

type ThemeId = 'light' | 'dark';

interface ThemeColors {
  background: string;
  title: string;
  description: string;
  domain: string;
  placeholderBackground: string;
  placeholderIcon: string;
}

const THEME_COLORS: Record<ThemeId, ThemeColors> = {
  light: {
    background: 'white',
    title: '#111827',
    description: '#6b7280',
    domain: '#9ca3af',
    placeholderBackground: '#e5e7eb',
    placeholderIcon: '#9ca3af',
  },
  dark: {
    background: '#111827',
    title: '#f9fafb',
    description: '#9ca3af',
    domain: '#6b7280',
    placeholderBackground: '#374151',
    placeholderIcon: '#6b7280',
  },
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
  sourceUrl: string,
  config: LayoutConfig,
  theme: ThemeId
): string {
  const colors = THEME_COLORS[theme];
  const borderColor = theme === 'dark' ? config.darkBorderColor : config.borderColor;
  const domain = extractDomain(sourceUrl);
  const safeDomain = escapeHtml(domain);

  // Title処理
  let titleLines: string[] = [];
  if (config.titleMaxLines === 1) {
    // 横型: 1行のみ
    titleLines = [truncateText(title, config.textWidth, config.titleFontSize)];
  } else {
    // 縦型: 2行対応
    const wrapPoint = findWrapPoint(title, config.textWidth, config.titleFontSize);
    const line1 = title.substring(0, wrapPoint).trim();
    const line2 = title.substring(wrapPoint).trim();

    titleLines = [truncateText(line1, config.textWidth, config.titleFontSize)];
    if (line2) {
      titleLines.push(truncateText(line2, config.textWidth, config.titleFontSize));
    }
  }

  // Description処理（2行または3行）
  const descLines: string[] = [];
  let remainingDesc = description;

  for (let i = 0; i < config.descMaxLines && remainingDesc; i++) {
    const wrapPoint = findWrapPoint(remainingDesc, config.textWidth, config.descFontSize);
    const line = remainingDesc.substring(0, wrapPoint).trim();
    descLines.push(truncateText(line, config.textWidth, config.descFontSize));

    const nextStart = remainingDesc[wrapPoint] === ' ' ? wrapPoint + 1 : wrapPoint;
    remainingDesc = remainingDesc.substring(nextStart).trim();
  }

  // 画像がない場合のプレースホルダー
  const imageElement = imageDataUrl
    ? `<image href="${imageDataUrl}" x="0" y="0" width="${config.imageWidth}" height="${config.imageHeight}" preserveAspectRatio="xMidYMid slice" clip-path="url(#imageClip)" />`
    : `<rect x="0" y="0" width="${config.imageWidth}" height="${config.imageHeight}" fill="${colors.placeholderBackground}" clip-path="url(#imageClip)"/>
       <text x="${config.imageWidth / 2}" y="${config.imageHeight / 2}" font-family="Arial, sans-serif" font-size="60" fill="${colors.placeholderIcon}" text-anchor="middle" dominant-baseline="middle">📄</text>`;

  // Title SVG生成
  const titleSvg = titleLines.map((line, i) => {
    return `<tspan x="${config.textX}" dy="${i === 0 ? 0 : config.lineHeights.title}">${escapeHtml(line)}</tspan>`;
  }).join('');

  // Description SVG生成
  const descriptionY = config.textStartY + (titleLines.length * config.lineHeights.title) + config.titleDescMargin;
  const descSvg = descLines.map((line, i) => {
    return `<tspan x="${config.textX}" dy="${i === 0 ? 0 : config.lineHeights.description}">${escapeHtml(line)}</tspan>`;
  }).join('');

  // Image clip path with selective rounded corners
  const imageClipPath = config.imagePosition === 'top'
    ? `<path d="M ${config.borderRadius} 0
               L ${config.imageWidth - config.borderRadius} 0
               Q ${config.imageWidth} 0 ${config.imageWidth} ${config.borderRadius}
               L ${config.imageWidth} ${config.imageHeight}
               L 0 ${config.imageHeight}
               L 0 ${config.borderRadius}
               Q 0 0 ${config.borderRadius} 0 Z"/>`
    : `<rect x="0" y="0" width="${config.imageWidth}" height="${config.imageHeight}"/>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${config.cardWidth}" height="${config.cardHeight}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs>
    <clipPath id="imageClip">
      ${imageClipPath}
    </clipPath>
  </defs>

  <!-- Background -->
  <rect width="${config.cardWidth}" height="${config.cardHeight}" fill="${colors.background}" rx="${config.borderRadius}"/>

  <!-- Image -->
  ${imageElement}

  <!-- クリック可能なリンク（JavaScriptで処理） -->
  <rect x="0" y="0" width="${config.cardWidth}" height="${config.cardHeight}" fill="transparent" style="cursor: pointer;" onclick="window.open('${escapeHtml(sourceUrl)}', '_blank')"/>

  <!-- Title -->
  <text x="${config.textX}" y="${config.textStartY}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif" font-size="${config.titleFontSize}" font-weight="bold" fill="${colors.title}" pointer-events="none">
    ${titleSvg}
  </text>

  <!-- Description -->
  <text x="${config.textX}" y="${descriptionY}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif" font-size="${config.descFontSize}" fill="${colors.description}" pointer-events="none">
    ${descSvg}
  </text>

  <!-- Domain -->
  <text x="${config.textX}" y="${config.domainY}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif" font-size="${config.domainFontSize}" fill="${colors.domain}" pointer-events="none">
    🔗 ${safeDomain}
  </text>

  <!-- Border (最前面) -->
  <rect width="${config.cardWidth}" height="${config.cardHeight}" fill="none" stroke="${borderColor}" stroke-width="${config.borderWidth}" rx="${config.borderRadius}" pointer-events="none"/>
</svg>`;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const url = searchParams.get('url');
  const layout = searchParams.get('layout') || 'horizontal';
  const theme = searchParams.get('theme') || 'light';

  // Validate layout
  if (!['horizontal', 'vertical'].includes(layout)) {
    const errorSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="700" height="150" xmlns="http://www.w3.org/2000/svg">
  <rect width="700" height="150" fill="#fee2e2" rx="0"/>
  <rect width="700" height="150" fill="none" stroke="#ef4444" stroke-width="2" rx="0"/>
  <text x="350" y="75" font-family="Arial, sans-serif" font-size="18" fill="#991b1b" text-anchor="middle" dominant-baseline="middle">
    ❌ Invalid layout parameter (use 'horizontal' or 'vertical')
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

  // Validate theme
  if (!['light', 'dark'].includes(theme)) {
    const errorSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="700" height="150" xmlns="http://www.w3.org/2000/svg">
  <rect width="700" height="150" fill="#fee2e2" rx="0"/>
  <rect width="700" height="150" fill="none" stroke="#ef4444" stroke-width="2" rx="0"/>
  <text x="350" y="75" font-family="Arial, sans-serif" font-size="18" fill="#991b1b" text-anchor="middle" dominant-baseline="middle">
    ❌ Invalid theme parameter (use 'light' or 'dark')
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

  const config = LAYOUT_CONFIGS[layout];

  if (!url) {
    // エラー用のSVGを返す
    const errorSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${config.cardWidth}" height="${config.cardHeight}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${config.cardWidth}" height="${config.cardHeight}" fill="#fee2e2" rx="0"/>
  <rect width="${config.cardWidth}" height="${config.cardHeight}" fill="none" stroke="#ef4444" stroke-width="2" rx="0"/>
  <text x="${config.cardWidth / 2}" y="${config.cardHeight / 2}" font-family="Arial, sans-serif" font-size="18" fill="#991b1b" text-anchor="middle" dominant-baseline="middle">
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
<svg width="${config.cardWidth}" height="${config.cardHeight}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${config.cardWidth}" height="${config.cardHeight}" fill="#fee2e2" rx="0"/>
  <rect width="${config.cardWidth}" height="${config.cardHeight}" fill="none" stroke="#ef4444" stroke-width="2" rx="0"/>
  <text x="${config.cardWidth / 2}" y="${config.cardHeight / 2 - 10}" font-family="Arial, sans-serif" font-size="18" fill="#991b1b" text-anchor="middle" dominant-baseline="middle">
    ❌ Failed to fetch OGP data
  </text>
  <text x="${config.cardWidth / 2}" y="${config.cardHeight / 2 + 20}" font-family="Arial, sans-serif" font-size="14" fill="#991b1b" text-anchor="middle" dominant-baseline="middle">
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
    url,
    config,
    theme as ThemeId
  );

  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
