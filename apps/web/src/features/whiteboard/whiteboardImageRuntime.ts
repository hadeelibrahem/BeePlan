export async function createRuntimeImageUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('Unable to create runtime image URL'))
    reader.readAsDataURL(file)
  })
}

export function assertValidRuntimeImageUrl(value: string): string {
  const parsed = new URL(value)
  if (parsed.protocol !== 'data:' || !value.startsWith('data:image/')) {
    throw new Error('Invalid runtime image URL')
  }
  return value
}
