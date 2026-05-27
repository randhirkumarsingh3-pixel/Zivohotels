export const getImageUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('http') || url.startsWith('blob:') || url.startsWith('data:')) {
    return url;
  }
  const apiBase = import.meta.env.VITE_API_URL || 'http://127.0.0.1:5000/api/v1';
  const domain = apiBase.replace('/api/v1', '');
  return `${domain}${url}`;
};
