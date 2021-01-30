interface FetchResponse {
  statusCode: number
  ok: boolean
  text: string
}

// https://javascript.info/fetch-progress
export async function fetchWithProgress(
  url: string,
  progress: (bytes: number, total: number) => Promise<void>
): Promise<FetchResponse> {
  const response = await fetch(url)
  if (!response.body) {
    return {
      statusCode: response.status,
      ok: response.ok,
      text: ''
    }
  }

  const reader = response.body.getReader()
  const contentLength = parseInt(
    response.headers.get('Content-Length') || '0',
    10
  )
  let receivedLength = 0
  let chunks: Uint8Array[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    chunks.push(value)
    receivedLength += value.length
    progress(receivedLength, contentLength)
  }

  let chunksAll = new Uint8Array(receivedLength)
  let position = 0
  for (let chunk of chunks) {
    chunksAll.set(chunk, position)
    position += chunk.length
  }
  const text = new TextDecoder('utf-8').decode(chunksAll)
  return {
    statusCode: response.status,
    ok: response.ok,
    text
  }
}
