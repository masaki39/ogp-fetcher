'use client'

import { useEffect, useState } from 'react'

type LayoutId = 'horizontal' | 'vertical'
type ThemeId = 'light' | 'dark'

type OGPMetadata = {
  title?: string
  description?: string
  image?: string
}

const LAYOUT_LABELS: Record<LayoutId, string> = {
  horizontal: 'Horizontal',
  vertical: 'Vertical',
}

const THEME_LABELS: Record<ThemeId, string> = {
  light: 'Light',
  dark: 'Dark',
}

const PRESETS = ['https://github.com', 'https://nextjs.org', 'https://vercel.com']

const isLayoutId = (v: string | null): v is LayoutId => v === 'horizontal' || v === 'vertical'
const isThemeId = (v: string | null): v is ThemeId => v === 'light' || v === 'dark'

export default function Home() {
  const [input, setInput] = useState('')
  const [targetUrl, setTargetUrl] = useState('')
  const [layout, setLayout] = useState<LayoutId>('horizontal')
  const [theme, setTheme] = useState<ThemeId>('light')
  const [metadata, setMetadata] = useState<OGPMetadata | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [origin, setOrigin] = useState('')

  const buildCardPath = (url: string, layoutId: LayoutId, themeId: ThemeId) => {
    let path = `/api/ogp-card?url=${encodeURIComponent(url)}`
    if (layoutId !== 'horizontal') path += `&layout=${layoutId}`
    if (themeId !== 'light') path += `&theme=${themeId}`
    return path
  }

  const cardPath = targetUrl ? buildCardPath(targetUrl, layout, theme) : ''
  const cardUrl = `${origin}${cardPath}`

  // OGP画像は相対パスの場合があるので絶対URLに変換
  const imageUrl = (() => {
    if (!metadata?.image) return null
    try {
      return new URL(metadata.image, targetUrl).href
    } catch {
      return metadata.image
    }
  })()

  // 状態をクエリ文字列に反映（共有用）
  const syncQuery = (url: string, layoutId: LayoutId, themeId: ThemeId) => {
    const params = new URLSearchParams()
    if (url) params.set('url', url)
    if (layoutId !== 'horizontal') params.set('layout', layoutId)
    if (themeId !== 'light') params.set('theme', themeId)
    const query = params.toString()
    window.history.replaceState(null, '', query ? `/?${query}` : '/')
  }

  const fetchOGP = async (raw: string, layoutId: LayoutId = layout, themeId: ThemeId = theme) => {
    let url = raw.trim()
    if (!url) return
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`

    setInput(url)
    setTargetUrl(url)
    setMetadata(null)
    setError(null)
    setLoading(true)
    syncQuery(url, layoutId, themeId)

    try {
      const res = await fetch(`/api/ogp?url=${encodeURIComponent(url)}`)
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || `Request failed (${res.status})`)
      } else {
        setMetadata(data)
      }
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setOrigin(window.location.origin)
    const params = new URLSearchParams(window.location.search)
    const layoutParam = params.get('layout')
    const themeParam = params.get('theme')
    const layoutId = isLayoutId(layoutParam) ? layoutParam : 'horizontal'
    const themeId = isThemeId(themeParam) ? themeParam : 'light'
    setLayout(layoutId)
    setTheme(themeId)
    const url = params.get('url')
    if (url) fetchOGP(url, layoutId, themeId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const switchLayout = (layoutId: LayoutId) => {
    setLayout(layoutId)
    syncQuery(targetUrl, layoutId, theme)
  }

  const switchTheme = (themeId: ThemeId) => {
    setTheme(themeId)
    syncQuery(targetUrl, layout, themeId)
  }

  const copyText = async (text: string, message: string) => {
    await navigator.clipboard.writeText(text)
    alert(message)
  }

  const fileBaseName = () => {
    try {
      return `ogp-card-${new URL(targetUrl).hostname}-${layout}-${theme}`
    } catch {
      return 'ogp-card'
    }
  }

  const triggerDownload = (href: string, filename: string) => {
    const link = document.createElement('a')
    link.href = href
    link.download = filename
    link.click()
  }

  const downloadSVG = async () => {
    const res = await fetch(cardPath)
    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)
    triggerDownload(objectUrl, `${fileBaseName()}.svg`)
    URL.revokeObjectURL(objectUrl)
  }

  // SVG内の画像はbase64で埋め込まれているので、canvasに描画してもtaintされない
  const downloadPNG = async () => {
    const res = await fetch(cardPath)
    const svgText = await res.text()
    const svgUrl = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }))

    try {
      const img = new Image()
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('Failed to load SVG'))
        img.src = svgUrl
      })

      const scale = 2
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth * scale
      canvas.height = img.naturalHeight * scale
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas not supported')
      ctx.scale(scale, scale)
      ctx.drawImage(img, 0, 0)

      const pngBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (!pngBlob) throw new Error('Failed to encode PNG')
      const pngUrl = URL.createObjectURL(pngBlob)
      triggerDownload(pngUrl, `${fileBaseName()}.png`)
      URL.revokeObjectURL(pngUrl)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to create PNG')
    } finally {
      URL.revokeObjectURL(svgUrl)
    }
  }

  const markdownClickable = () => `[![${metadata?.title || 'Link card'}](${cardUrl})](${targetUrl})`
  const markdownImage = () => `![${metadata?.title || 'Link card'}](${cardUrl})`

  return (
    <div style={styles.container}>
      <style>{css}</style>
      <h1>ogp-fetcher Demo</h1>
      <div style={styles.descriptionSection}>
        Enter a URL to check its OGP metadata and generate a link card
        {' '}
        <a
          href="https://github.com/masaki39/ogp-fetcher"
          target="_blank"
          rel="noopener noreferrer"
          style={styles.descriptionLink}
        >
          → More details
        </a>
      </div>

      <div style={styles.controlRow}>
        <div style={styles.selector}>
          {(Object.keys(LAYOUT_LABELS) as LayoutId[]).map(id => (
            <button
              key={id}
              onClick={() => switchLayout(id)}
              style={layout === id ? styles.selectorButtonActive : styles.selectorButton}
            >
              {LAYOUT_LABELS[id]}
            </button>
          ))}
        </div>
        <div style={styles.selector}>
          {(Object.keys(THEME_LABELS) as ThemeId[]).map(id => (
            <button
              key={id}
              onClick={() => switchTheme(id)}
              style={theme === id ? styles.selectorButtonActive : styles.selectorButton}
            >
              {THEME_LABELS[id]}
            </button>
          ))}
        </div>
      </div>

      <div style={styles.inputSection}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && fetchOGP(input)}
          placeholder="e.g., https://github.com"
          style={styles.input}
        />
        <button onClick={() => fetchOGP(input)} style={styles.button} disabled={loading}>
          {loading ? 'Fetching…' : 'Fetch'}
        </button>
      </div>

      <div style={styles.presets}>
        {PRESETS.map(url => (
          <button key={url} style={styles.buttonSecondary} onClick={() => fetchOGP(url)}>
            {new URL(url).hostname}
          </button>
        ))}
      </div>

      {error && <div style={styles.error}>❌ {error}</div>}

      {targetUrl && (
        <>
          <h2 style={styles.sectionTitle}>Link Card</h2>
          <div style={styles.imageSection}>
            <img key={cardPath} src={cardPath} alt="OGP link card" style={styles.image} />
          </div>

          <div style={styles.copySection}>
            <input type="text" readOnly value={cardUrl} style={styles.urlInput} />
            <button onClick={() => copyText(cardUrl, 'URL copied to clipboard!')} style={styles.button}>
              Copy URL
            </button>
          </div>

          <div style={styles.buttonRow}>
            <button onClick={downloadSVG} style={styles.button}>
              Download SVG
            </button>
            <button onClick={downloadPNG} style={styles.button}>
              Download PNG
            </button>
            <button onClick={() => copyText(markdownClickable(), 'Markdown image link copied!')} style={styles.button}>
              Copy Markdown (clickable)
            </button>
            <button onClick={() => copyText(markdownImage(), 'Markdown image copied!')} style={styles.button}>
              Copy Markdown (image)
            </button>
          </div>
        </>
      )}

      {metadata && (
        <>
          <h2 style={styles.sectionTitle}>OGP Metadata</h2>
          <dl style={styles.metaList}>
            <dt style={styles.metaKey}>og:title</dt>
            <dd style={styles.metaValue}>{metadata.title || <span style={styles.muted}>(none)</span>}</dd>
            <dt style={styles.metaKey}>og:description</dt>
            <dd style={styles.metaValue}>{metadata.description || <span style={styles.muted}>(none)</span>}</dd>
            <dt style={styles.metaKey}>og:image</dt>
            <dd style={styles.metaValue}>
              {imageUrl ? (
                <a href={imageUrl} target="_blank" rel="noopener noreferrer" style={styles.descriptionLink}>
                  {imageUrl}
                </a>
              ) : (
                <span style={styles.muted}>(none)</span>
              )}
            </dd>
          </dl>

          {imageUrl && (
            <>
              <div style={styles.imageSection}>
                <img src={imageUrl} alt="OGP image" style={styles.ogImage} />
              </div>
              <div style={styles.buttonRow}>
                <a href={imageUrl} target="_blank" rel="noopener noreferrer" style={styles.buttonLink}>
                  Open Image in New Tab
                </a>
                <button onClick={() => copyText(imageUrl, 'Image URL copied!')} style={styles.buttonSecondary}>
                  Copy Image URL
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

const css = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, sans-serif; background: #1e1e1e; color: #fff; }
  button:disabled { opacity: 0.6; cursor: default; }
`

const button = {
  padding: '10px 20px',
  background: '#F97316',
  color: '#000',
  border: 'none',
  borderRadius: '6px',
  fontWeight: '600',
  cursor: 'pointer',
  fontSize: '14px',
} as const

const selectorButton = {
  padding: '6px 16px',
  background: 'transparent',
  color: '#888',
  border: 'none',
  borderRadius: '6px',
  fontWeight: '600',
  cursor: 'pointer',
  fontSize: '13px',
} as const

const styles = {
  container: {
    maxWidth: '900px',
    margin: '0 auto',
    padding: '40px 20px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    background: '#1e1e1e',
    color: '#fff',
  } as const,
  controlRow: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    marginBottom: '20px',
    flexWrap: 'wrap',
  } as const,
  selector: {
    display: 'flex',
    gap: '4px',
    background: '#2a2a2a',
    padding: '4px',
    borderRadius: '8px',
  } as const,
  selectorButton,
  selectorButtonActive: {
    ...selectorButton,
    background: '#F97316',
    color: '#000',
  } as const,
  inputSection: {
    display: 'flex',
    gap: '10px',
    marginBottom: '20px',
  } as const,
  input: {
    flex: 1,
    minWidth: 0,
    padding: '10px 12px',
    background: '#2a2a2a',
    color: '#fff',
    border: '1px solid #4a4a4a',
    borderRadius: '6px',
    fontSize: '14px',
  } as const,
  button,
  buttonSecondary: {
    ...button,
    background: '#3a3a3a',
    color: '#fff',
    border: '1px solid #4a4a4a',
  } as const,
  buttonLink: {
    ...button,
    textDecoration: 'none',
    display: 'inline-block',
  } as const,
  presets: {
    display: 'flex',
    gap: '10px',
    marginBottom: '30px',
    flexWrap: 'wrap',
  } as const,
  error: {
    padding: '12px 16px',
    background: '#3b1d1d',
    color: '#fca5a5',
    border: '1px solid #7f1d1d',
    borderRadius: '6px',
    fontSize: '14px',
    marginBottom: '20px',
  } as const,
  sectionTitle: {
    fontSize: '18px',
    marginTop: '40px',
  } as const,
  imageSection: {
    display: 'flex',
    justifyContent: 'center',
    margin: '20px 0',
    background: '#0a0a0a',
    padding: '20px',
    borderRadius: '8px',
    minHeight: '200px',
    alignItems: 'center',
    overflow: 'auto',
  } as const,
  image: {
    maxWidth: '100%',
    height: 'auto',
  } as const,
  ogImage: {
    maxWidth: '100%',
    maxHeight: '480px',
    height: 'auto',
  } as const,
  copySection: {
    display: 'flex',
    gap: '10px',
    alignItems: 'center',
    marginTop: '20px',
  } as const,
  buttonRow: {
    display: 'flex',
    gap: '10px',
    marginTop: '20px',
    flexWrap: 'wrap',
  } as const,
  urlInput: {
    flex: 1,
    minWidth: 0,
    padding: '10px 12px',
    background: '#2a2a2a',
    color: '#888',
    border: '1px solid #4a4a4a',
    borderRadius: '6px',
    fontSize: '12px',
  } as const,
  metaList: {
    display: 'grid',
    gridTemplateColumns: 'max-content 1fr',
    gap: '10px 20px',
    marginTop: '20px',
    background: '#2a2a2a',
    padding: '16px 20px',
    borderRadius: '8px',
    fontSize: '14px',
  } as const,
  metaKey: {
    color: '#888',
    fontFamily: 'ui-monospace, monospace',
  } as const,
  metaValue: {
    wordBreak: 'break-all',
  } as const,
  muted: {
    color: '#666',
  } as const,
  descriptionSection: {
    color: '#aaa',
    fontSize: '14px',
    marginBottom: '30px',
    marginTop: '12px',
  } as const,
  descriptionLink: {
    color: '#F97316',
    textDecoration: 'none',
  } as const,
}
