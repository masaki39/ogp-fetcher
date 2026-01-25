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
    if (hostname === 'localhost' || hostname === '0.0.0.0') {
      return { safe: false, error: 'Access to localhost is not allowed' };
    }

    // 危険なIPアドレスパターンをブロック
    const blockedPatterns = [
      // IPv4 ループバック範囲全体
      /^127\./,                   // 127.0.0.0/8

      // IPv4 プライベートアドレス
      /^10\./,                    // 10.0.0.0/8
      /^172\.(1[6-9]|2\d|3[01])\./, // 172.16.0.0/12
      /^192\.168\./,              // 192.168.0.0/16

      // IPv4 リンクローカル
      /^169\.254\./,              // 169.254.0.0/16

      // IPv4 マルチキャスト
      /^2(2[4-9]|3\d)\./,         // 224.0.0.0/4

      // IPv4 ブロードキャスト・予約済み
      /^255\.255\.255\.255$/,     // ブロードキャスト
      /^0\./,                     // 0.0.0.0/8 (予約済み)

      // IPv6 ループバック
      /^::1$/,                    // ::1
      /^::ffff:127\./,            // IPv4-mapped IPv6 (::ffff:127.x.x.x)
      /^::ffff:0:127\./,          // IPv4-mapped IPv6 alternative

      // IPv6 プライベート・リンクローカル
      /^fc00:/,                   // IPv6 ULA (Unique Local Address)
      /^fd00:/,                   // IPv6 ULA
      /^fe80:/,                   // IPv6 リンクローカル

      // IPv6 マルチキャスト
      /^ff0[0-9a-f]:/,            // IPv6 マルチキャスト (ff00::/8)

      // IPv6 その他予約済み
      /^::/,                      // :: (未指定アドレス)
      /^::ffff:0:0$/,             // IPv4-mapped IPv6 unspecified
    ];

    for (const pattern of blockedPatterns) {
      if (pattern.test(hostname)) {
        return { safe: false, error: 'Access to private/reserved IP addresses is not allowed' };
      }
    }

    return { safe: true };
  } catch (error) {
    return { safe: false, error: 'Invalid URL format' };
  }
}
