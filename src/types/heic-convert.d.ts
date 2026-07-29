declare module 'heic-convert' {
  interface HeicConvertOptions {
    buffer: Buffer | ArrayBuffer
    format: 'JPEG' | 'PNG'
    quality?: number
  }

  export default function heicConvert(options: HeicConvertOptions): Promise<ArrayBuffer>
}
