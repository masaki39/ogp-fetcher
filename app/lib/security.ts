/**
 * SSRF攻撃を防ぐためのURL検証
 */
export function isSafeUrl(urlString: string): { safe: boolean; error?: string } {
  try {
    const url = new URL(urlString);

    // プロトコルチェック（http/httpsのみ許可）
    if (!['http:', 'https:'].includes(url.protocol)) {
      return { safe: false, error: 'Only HTTP and HTTPS protocols are allowed' };
    }

    // hostnameチェック
    const hostname = url.hostname.toLowerCase();

    // localhostブロック
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0') {
      return { safe: false, error: 'Access to localhost is not allowed' };
    }

    // 内部IPアドレスブロック
    const internalIpPatterns = [
      /^10\./,                    // 10.0.0.0/8
      /^172\.(1[6-9]|2\d|3[01])\./, // 172.16.0.0/12
      /^192\.168\./,              // 192.168.0.0/16
      /^169\.254\./,              // 169.254.0.0/16 (リンクローカル)
      /^fc00:/,                   // IPv6 ULA
      /^fe80:/,                   // IPv6 リンクローカル
      /^::1$/,                    // IPv6 localhost
    ];

    for (const pattern of internalIpPatterns) {
      if (pattern.test(hostname)) {
        return { safe: false, error: 'Access to private IP addresses is not allowed' };
      }
    }

    return { safe: true };
  } catch (error) {
    return { safe: false, error: 'Invalid URL format' };
  }
}
