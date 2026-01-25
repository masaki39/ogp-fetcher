import { NextRequest, NextResponse } from 'next/server';
import { fetchOGPMetadata } from '@/app/lib/ogp-fetcher';
import type { ErrorResponse } from '@/app/lib/types';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json(
      { error: 'URL parameter is required' } as ErrorResponse,
      { status: 400 }
    );
  }

  const result = await fetchOGPMetadata(url);

  if (!result.success) {
    return NextResponse.json(
      { error: result.error } as ErrorResponse,
      { status: result.statusCode }
    );
  }

  const imageUrl = result.metadata.image;

  if (imageUrl) {
    const redirectResponse = NextResponse.redirect(imageUrl);
    // CDNキャッシュヘッダーを追加（1時間キャッシュ、1日はstale許容）
    redirectResponse.headers.set('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    return redirectResponse;
  } else {
    return NextResponse.json(
      { error: 'No OGP image found' } as ErrorResponse,
      { status: 404 }
    );
  }
}
