/**
 * Escapes text for safe use inside HTML. Required for anything a guest or owner typed (names,
 * addresses, company details) before it goes into an HTML page that the server renders to PDF with
 * a headless browser: unescaped markup there could load internal URLs from the server.
 */
export const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
