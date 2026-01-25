# OGP Fetcher

URLからOGP情報を取得するAPI

## セキュリティ

このAPIは以下のセキュリティ対策を実装しています：

- **SSRF対策**: 内部IP・localhostへのアクセスをブロック
- **プロトコル制限**: HTTP/HTTPSのみ許可

以下のアクセスは自動的にブロックされます：
- `localhost`, `127.0.0.1`, `0.0.0.0`
- プライベートIPアドレス (10.x.x.x, 172.16-31.x.x, 192.168.x.x)
- リンクローカルアドレス (169.254.x.x)
- IPv6ローカルアドレス

## Setup

```bash
npm install
npm run dev
```

## Usage

### OGP情報を取得

```bash
curl "https://ogp-fetcher-delta.vercel.app/api/ogp?url=https://github.com"
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
![](https://ogp-fetcher-delta.vercel.app/api/ogp-image?url=https://github.com)
```

このエンドポイントはOGP画像URLにリダイレクトするため、マークダウンで直接使用できます。

**DOIリンクも対応**:
```markdown
![](https://ogp-fetcher-delta.vercel.app/api/ogp-image?url=https://doi.org/10.1007/s00586-025-08979-7)
```

実際の表示例:
![GitHub OGP](https://ogp-fetcher-delta.vercel.app/api/ogp-image?url=https://github.com)

## デプロイURL

- 本番環境: https://ogp-fetcher-delta.vercel.app

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
