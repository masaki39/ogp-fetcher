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

    const imageUrl = $('meta[property="og:image"]').attr('content');

    if (imageUrl) {
      const redirectResponse = NextResponse.redirect(imageUrl);
      // CDNキャッシュヘッダーを追加（1時間キャッシュ、1日はstale許容）
      redirectResponse.headers.set('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
      return redirectResponse;
    } else {
      return NextResponse.json(
        { error: 'No OGP image found' },
        { status: 404 }
      );
    }
  } catch (error) {
    console.error('OGP fetch error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch OGP image',
        message: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
