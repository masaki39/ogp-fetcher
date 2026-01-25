# OGP Fetcher

URLからOGP情報を取得するAPI

## 機能

### キャッシュ

パフォーマンス向上とコスト削減のため、以下のキャッシュ機能を実装しています：

- **サーバーサイドキャッシュ**: 同じURLへのリクエストは1時間キャッシュされます
- **CDNキャッシュ**: Vercel Edge Networkで1時間キャッシュ、最大1日間のstale-while-revalidate
- 同じURLを何度呼び出しても、元サイトへのアクセスは最小限に抑えられます

### パフォーマンス・安定性

- **タイムアウト設定**: 30秒でリクエストをタイムアウト（遅いサーバー対策）
- **サイズ制限**: 最大10MBのHTMLまで処理（メモリ枯渇対策）
- **HTTPステータスチェック**: 404や500エラーを適切にハンドリング
- **エラー情報の保護**: 内部エラー詳細を露出しない安全なエラーレスポンス

## セキュリティ

このAPIは以下のセキュリティ対策を実装しています：

### SSRF対策（強化版）

- **プロトコル制限**: HTTP/HTTPSのみ許可
- **包括的なIPブロック**: 内部ネットワークへのアクセスを完全にブロック

以下のアクセスは自動的にブロックされます：

**IPv4**
- ループバック全範囲: `127.0.0.0/8`
- プライベートアドレス: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`
- リンクローカル: `169.254.0.0/16`
- マルチキャスト: `224.0.0.0/4`
- ブロードキャスト: `255.255.255.255`
- その他予約済み: `0.0.0.0/8`

**IPv6**
- ループバック: `::1`, `::ffff:127.x.x.x`
- ULA (Unique Local): `fc00::/7`, `fd00::/8`
- リンクローカル: `fe80::/10`
- マルチキャスト: `ff00::/8`
- 未指定アドレス: `::`

### アプリケーションセキュリティ

- **セキュリティヘッダー**: X-Content-Type-Options, X-Frame-Options, X-XSS-Protection等を設定
- **タイムアウト保護**: 30秒のリクエストタイムアウト
- **コンテンツサイズ制限**: 最大10MBまで

## Setup

```bash
npm install
npm run dev
```

## Usage

### OGP情報を取得

```bash
curl "https://ogpf.vercel.app/api/ogp?url=https://github.com"
```

レスポンス例:
```json
{
  "title": "GitHub · Change is constant. GitHub keeps you ahead.",
  "description": "Join the world's most widely adopted, AI-powered developer platform...",
  "image": "https://images.ctfassets.net/8aevphvgewt8/4pe4eOtUJ0ARpZRE4fNekf/..."
}
```

### マークダウンでOGP画像を表示

```markdown
![](https://ogpf.vercel.app/api/ogp-image?url=https://github.com)
```

このエンドポイントはOGP画像URLにリダイレクトするため、マークダウンで直接使用できます。

**DOIリンクも対応**:
```markdown
![](https://ogpf.vercel.app/api/ogp-image?url=https://doi.org/10.1007/s00586-025-08979-7)
```

実際の表示例:
![GitHub OGP](https://ogpf.vercel.app/api/ogp-image?url=https://github.com)

### 短縮エイリアス

より短いURLでアクセスできるエイリアスを用意しています：

```markdown
![](https://ogpf.vercel.app/i?url=https://github.com)
```

- `/i` → `/api/ogp-image` のエイリアス（画像取得）
- `/o` → `/api/ogp` のエイリアス（JSON取得）

```bash
# 短縮形でJSON取得
curl "https://ogpf.vercel.app/o?url=https://github.com"
```

## デプロイURL

- 本番環境: https://ogpf.vercel.app

## Deploy

Vercelにデプロイ:
```bash
vercel --prod
```

### セキュリティ上の注意

このAPIは公開状態で使用できますが、以下の点に注意してください：

- **悪用のリスク**: 誰でもアクセス可能なため、スクレイピングの踏み台として使われる可能性があります
- **コスト**: Vercelの無料枠を超えた場合、課金が発生する可能性があります
- **対策**: SSRF攻撃（内部ネットワークへのアクセス）は自動的にブロックされます

より安全に使いたい場合は、以下を検討してください：
- プライベートリポジトリで管理
- 使用しないときはデプロイを削除
- Vercelの環境変数でドメインホワイトリストを実装
