export function formatContentDisposition(
  fileName: string,
  dispositionType: 'inline' | 'attachment',
) {
  const fallbackFileName =
    fileName
      .replace(/[\r\n"]/g, '_')
      .replace(/[^\x20-\x7E]/g, '_')
      .trim() || 'attachment';
  const encodedFileName = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (character) =>
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );

  return `${dispositionType}; filename="${fallbackFileName}"; filename*=UTF-8''${encodedFileName}`;
}
