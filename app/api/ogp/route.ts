import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { isSafeUrl } from '@/app/lib/security';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'URL parameter is required' }, { status: 400 });
  }

  // URL安全性チェック（SSRF対策）
  const { safe, error } = isSafeUrl(url);
  if (!safe) {
    return NextResponse.json({ error: error || 'Invalid URL' }, { status: 400 });
  }

  try {
    // 1時間キャッシュ
    const response = await fetch(url, {
      next: { revalidate: 3600 }
    });
    const html = await response.text();
    const $ = cheerio.load(html);

    const metadata = {
      title: $('meta[property="og:title"]').attr('content') || $('title').text(),
      description: $('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content'),
      image: $('meta[property="og:image"]').attr('content'),
    };

    // CDNキャッシュヘッダーを追加（1時間キャッシュ、1日はstale許容）
    return NextResponse.json(metadata, {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    });
  } catch (error) {
    console.error('OGP fetch error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch OGP data',
        message: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
