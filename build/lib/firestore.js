// Minimal Firestore REST reader (works with public-read rules, no SDK needed).
function decode(v) {
  if (v == null) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decode);
  if ('mapValue' in v) return decodeFields(v.mapValue.fields || {});
  return null;
}
function decodeFields(fields) {
  const o = {};
  for (const [k, v] of Object.entries(fields)) o[k] = decode(v);
  return o;
}

const base = (pid) => `https://firestore.googleapis.com/v1/projects/${pid}/databases/(default)/documents`;

export async function fetchCollection(pid, name) {
  const out = [];
  let token = '';
  do {
    const url = `${base(pid)}/${name}?pageSize=300${token ? `&pageToken=${encodeURIComponent(token)}` : ''}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Firestore ${name}: HTTP ${res.status} ${await res.text()}`);
    const json = await res.json();
    for (const d of json.documents || []) {
      const id = d.name.split('/').pop();
      out.push({ id, ...decodeFields(d.fields || {}) });
    }
    token = json.nextPageToken || '';
  } while (token);
  return out;
}

export async function fetchDoc(pid, path) {
  const res = await fetch(`${base(pid)}/${path}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore ${path}: HTTP ${res.status}`);
  const d = await res.json();
  return decodeFields(d.fields || {});
}
