import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request } from 'node:https';

export function publicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a,b,c] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113));
  }
  // Only global-unicast IPv6; reject mapped IPv4, local, multicast and documentation.
  if (/^2001:/i.test(address) && parseInt(address.split(':')[1] || '0',16) < 0x200) return false;
  if (/^3fff:/i.test(address)) return false;
  return isIP(address) === 6 && /^[23][0-9a-f]{3}:/i.test(address) && !/^2001:(?:db8|0|10|20):/i.test(address) && !/^2002:/i.test(address);
}
export function publicJobURL(value: string): URL {
  if (value.length > 2048) throw new Error('Invalid URL');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) throw new Error('Use a public HTTPS job URL.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || (isIP(host) && !publicAddress(host))) throw new Error('Use a public job URL.');
  url.hash = ''; return url;
}
export function createPublicJobReader(resolveHost: (host: string, options: {all: true}) => Promise<{address:string;family:number}[]> = lookup, makeRequest: typeof request = request) {
return async function read(value: string): Promise<{ html: string; url: string }> {
  const signal = AbortSignal.timeout(15000);
  let url = publicJobURL(value);
  for (let redirects = 0; redirects <= 3; redirects++) {
    const host = url.hostname.replace(/^\[|\]$/g, '');
    const addresses = await new Promise<{address: string; family: number}[]>((resolve, reject) => {
      const stop = () => reject(new Error('DNS lookup timed out'));
      signal.addEventListener('abort', stop, { once: true });
      resolveHost(host, { all: true }).then(resolve, reject).finally(() => signal.removeEventListener('abort', stop));
    });
    if (!addresses.length || addresses.some(item => !publicAddress(item.address))) throw new Error('Non-public destination');
    signal.throwIfAborted();
    const pinned = addresses[0];
    const result = await new Promise<{ html?: string; location?: string }>((resolve, reject) => {
      const req = makeRequest(url, { signal, family: pinned.family, lookup: (_host, _options, done) => done(null, pinned.address, pinned.family), headers: { 'User-Agent': 'MyNext9to5-JobImporter/1.0', Accept: 'text/html,application/xhtml+xml', 'Accept-Encoding': 'identity' } }, res => {
        if ([301,302,303,307,308].includes(res.statusCode || 0)) { res.destroy(); resolve({ location: res.headers.location }); return; }
        if (res.statusCode !== 200 || !/text\/html|application\/xhtml\+xml/i.test(res.headers['content-type'] || '')) { res.destroy(); reject(new Error('Not a readable job page')); return; }
        let size = 0; const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => { size += chunk.length; if (size > 1_000_000) { res.destroy(); reject(new Error('Page too large')); } else chunks.push(chunk); });
        res.on('error', reject); res.on('end', () => resolve({ html: Buffer.concat(chunks).toString('utf8') }));
      });
      req.on('error', reject); req.end();
    });
    if (result.html !== undefined) return { html: result.html, url: url.href };
    if (!result.location) throw new Error('Missing redirect');
    url = publicJobURL(new URL(result.location, url).href);
  }
  throw new Error('Too many redirects');
};
}
export const readPublicJobPage = createPublicJobReader();
function plain(value: unknown): string {
  return typeof value === 'string' ? value.replace(/<br\s*\/?>(|\r?\n)/gi, '\n').replace(/<\/(?:p|li|div|h[1-6])>/gi,'\n').replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/[ \t]+/g,' ').trim() : '';
}
export function extractStructuredJob(html: string, url: string) {
  const find = (value: any): any => {
    if (!value || typeof value !== 'object') return null;
    if (Array.isArray(value)) { for (const item of value) { const found = find(item); if (found) return found; } return null; }
    if ([value['@type']].flat().includes('JobPosting')) return value;
    return find(value['@graph']);
  };
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const job = find(JSON.parse(match[1])); if (!job) continue;
      const title = plain(job.title).slice(0,200), description = plain(job.description).slice(0,20000);
      if (!title || description.length < 40) continue;
      return { job_title: title, job_description: description, employer_name: plain(job.hiringOrganization?.name).slice(0,200), job_apply_link: url, source_url: url, extraction_method: 'JobPosting structured data', job_posted_at: plain(job.datePosted).slice(0,40), valid_through: plain(job.validThrough).slice(0,40) };
    } catch { /* Try other structured blocks without executing page scripts. */ }
  }
  throw new Error('This page has no readable JobPosting data. Paste the title and description instead.');
}
