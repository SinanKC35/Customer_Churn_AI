const PREFIX = '/api';

export async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(`${PREFIX}${path}`, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
    });
  } catch {
    throw new Error('Cannot connect to the FastAPI service. Check that it is running.');
  }
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(`The server returned an unreadable response (HTTP ${response.status}).`);
  }
  if (!response.ok) {
    const first = Array.isArray(result.detail) ? result.detail[0] : result.detail;
    const message = typeof first === 'string'
      ? first
      : first?.msg && first?.loc
        ? `${first.loc.join(' → ')}: ${first.msg}`
        : `Request failed (HTTP ${response.status}).`;
    throw new Error(message);
  }
  return result;
}
