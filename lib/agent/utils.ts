export function sseEncode(event: string, data: unknown): Uint8Array {
    const encoder = new TextEncoder();
    return encoder.encode(`event: ${event}\n` + `data: ${JSON.stringify(data)}\n\n`);
  }
  
  export function sseComment(comment: string): Uint8Array {
    const encoder = new TextEncoder();
    return encoder.encode(`:${comment}\n\n`);
  }