# OGP Fetcher

A lightweight, secure API service for fetching Open Graph Protocol (OGP) metadata from any URL. Built with Next.js 14 and optimized for Vercel deployment.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## ⚠️ Important Notice

**This service is designed for personal use only.** While the code is open source, we strongly recommend deploying your own instance rather than using any public deployment. Public instances can be abused as scraping proxies, leading to unexpected costs and legal issues.

## Features

### 🚀 Performance & Reliability

- **Smart Caching**: Server-side caching (1 hour) + CDN edge caching with `stale-while-revalidate`
- **Timeout Protection**: 30-second request timeout prevents hanging on slow servers
- **Size Limits**: Maximum 10MB HTML processing to prevent memory exhaustion
- **Error Handling**: Graceful degradation with proper HTTP status codes

### 🔒 Security

Comprehensive security measures to prevent abuse:

#### SSRF Protection (Hardened)

Blocks access to private/internal networks:

**IPv4 Blocked Ranges**
- Loopback: `127.0.0.0/8`
- Private addresses: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`
- Link-local: `169.254.0.0/16`
- Multicast: `224.0.0.0/4`
- Broadcast: `255.255.255.255`
- Reserved: `0.0.0.0/8`

**IPv6 Blocked Ranges**
- Loopback: `::1`, `::ffff:127.x.x.x`
- ULA: `fc00::/7`, `fd00::/8`
- Link-local: `fe80::/10`
- Multicast: `ff00::/8`
- Unspecified: `::`

#### Application Security

- Protocol restriction (HTTP/HTTPS only)
- Security headers (X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, etc.)
- Error message sanitization (no internal info leakage)
- Content-Length validation

### 🎯 Convenience

- **Short Aliases**: `/i` for images, `/o` for metadata
- **Redirect Support**: Works with DOI links and URL shorteners
- **Markdown Ready**: Direct image embedding support

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Vercel account (for deployment)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/ogp-fetcher.git
cd ogp-fetcher

# Install dependencies
npm install
```

### Development

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

The API will be available at `http://localhost:3000`

### Deployment to Vercel

#### First-time Setup

1. **Install Vercel CLI**:
```bash
npm i -g vercel
```

2. **Login to Vercel**:
```bash
vercel login
```
Follow the prompts to authenticate (email or GitHub).

3. **Initial Deployment**:
```bash
vercel
```
This will:
- Ask you to link to an existing project or create a new one
- Set up the project configuration
- Deploy to a preview URL

4. **Deploy to Production**:
```bash
vercel --prod
```

#### Subsequent Deployments

After the first deployment, simply run:
```bash
vercel --prod
```

#### Post-Deployment Configuration

**Important**: After your first deployment, configure these settings:

1. **Budget Alerts** (Highly Recommended):
   - Go to [Vercel Dashboard](https://vercel.com/dashboard)
   - Navigate to Settings → Billing → Budget Alerts
   - Set a monthly limit (e.g., $10/month)

2. **Monitor Usage**:
   - Check Analytics regularly
   - Review function invocations
   - Watch for unusual traffic patterns

3. **Optional Security Enhancements**:
   - Implement rate limiting (see Security Considerations)
   - Add API key authentication
   - Set up domain allowlisting via environment variables

## API Reference

### Endpoints

#### `GET /api/ogp`
Fetch OGP metadata as JSON.

**Query Parameters**
- `url` (required): Target URL to fetch OGP data from

**Response**
```json
{
  "title": "Page Title",
  "description": "Page description",
  "image": "https://example.com/image.jpg"
}
```

**Example**
```bash
curl "https://your-deployment.vercel.app/api/ogp?url=https://github.com"
```

#### `GET /api/ogp-image`
Redirects to the OGP image URL.

**Query Parameters**
- `url` (required): Target URL to fetch OGP image from

**Example (Markdown)**
```markdown
![](https://your-deployment.vercel.app/api/ogp-image?url=https://github.com)
```

### Short Aliases

For convenience, short path aliases are available:

- `/i?url=...` → `/api/ogp-image?url=...` (image redirect)
- `/o?url=...` → `/api/ogp?url=...` (JSON metadata)

**Example**
```markdown
![GitHub](https://your-deployment.vercel.app/i?url=https://github.com)
```

### Use Cases

**Academic Citations with DOI**
```markdown
![Paper](https://your-deployment.vercel.app/i?url=https://doi.org/10.1000/example)
```

**URL Shorteners**
```markdown
![Article](https://your-deployment.vercel.app/i?url=https://bit.ly/example)
```

## Error Responses

```json
{
  "error": "Error message"
}
```

Common status codes:
- `400`: Invalid URL or missing parameters
- `404`: URL not found or no OGP image available
- `413`: Content too large (>10MB)
- `504`: Request timeout (>30s)
- `502`: Target server error (5xx responses)

## Security Considerations

### ⚠️ Risks of Public Deployment

Running a public OGP fetcher service exposes you to:

1. **Abuse as Scraping Proxy**: Attackers can use your service to scrape websites while hiding their IP
2. **DDoS Amplification**: Your service can be weaponized to attack third-party sites
3. **Unexpected Costs**: Vercel charges can escalate quickly if abused
4. **Legal Liability**: You may be held responsible for activities performed through your service

### 🛡️ Recommended Precautions

If you must run a public instance:

1. **Implement Rate Limiting**: Use Vercel Edge Middleware or a service like Upstash
2. **Set Budget Alerts**: Configure Vercel spending notifications
3. **Monitor Usage**: Regularly check analytics for unusual patterns
4. **Add Authentication**: Require API keys for access
5. **Whitelist Domains**: Only allow fetching from approved domains
6. **Add Terms of Service**: Clearly state acceptable use policies

### ✅ Best Practice: Private Use

**We strongly recommend keeping your deployment private:**
- Don't share your deployment URL publicly
- Use it only for personal projects
- Consider taking it down when not actively needed
- Set aggressive rate limits even for yourself

## Architecture

```
├── app/
│   ├── api/
│   │   ├── ogp/          # JSON metadata endpoint
│   │   └── ogp-image/    # Image redirect endpoint
│   └── lib/
│       ├── ogp-fetcher.ts # Core OGP fetching logic
│       ├── security.ts    # SSRF protection
│       └── types.ts       # TypeScript definitions
├── next.config.js         # Next.js config (rewrites, headers)
└── package.json
```

## Performance

- **Cache Hit Rate**: ~95% for repeated URLs (1-hour TTL)
- **Average Response Time**: <100ms (cached), <2s (uncached)
- **Max Content Size**: 10MB HTML
- **Timeout**: 30 seconds

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Disclaimer

This software is provided "as is", without warranty of any kind. The authors are not responsible for any damages or liabilities arising from the use of this software. Users are responsible for ensuring their use complies with applicable laws and the terms of service of websites they access through this service.

## Acknowledgments

- Built with [Next.js](https://nextjs.org/)
- HTML parsing by [Cheerio](https://cheerio.js.org/)
- Deployed on [Vercel](https://vercel.com/)

---

**Remember**: Deploy your own instance. Don't share it publicly. Use responsibly.
