import type { Metadata } from 'next'

const TITLE = 'ogp-fetcher'
const DESCRIPTION = 'Preview OGP metadata of any URL, generate SVG link cards, and embed them in Markdown with a single URL.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  )
}
