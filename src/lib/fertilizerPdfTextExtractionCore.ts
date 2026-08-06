/**
 * Extracts readable text from simple PDF documents without external dependencies.
 * Handles common literal strings and basic text-stream content.
 */
export function extractPdfTextFromBytes(bytes: Uint8Array): string | null {
  const raw = new TextDecoder('latin1').decode(bytes)
  if (!raw.includes('%PDF')) {
    return null
  }

  const literalMatches = raw.match(/\((?:\\.|[^\\)])*\)/g) ?? []
  const literalText = literalMatches
    .map((segment) =>
      segment
        .slice(1, -1)
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\\(/g, '(')
        .replace(/\\\)/g, ')')
        .replace(/\\\\/g, '\\'),
    )
    .join(' ')

  const streamMatches = raw.match(/stream[\s\S]*?endstream/g) ?? []
  const streamText = streamMatches
    .map((block) => block.replace(/^stream\r?\n?/, '').replace(/\r?\nendstream$/, ''))
    .join(' ')

  const combined = `${literalText} ${streamText}`.replace(/\s+/g, ' ').trim()
  return combined.length > 0 ? combined : null
}
