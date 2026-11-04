import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { MemoryBranches } from './memory-repo.js';

export const FAKE_TOKEN = 'bb-fake-token-0123456789';
export const FAKE_WORKSPACE = 'octo';
export const FAKE_REPO = 'octo/hello';

interface PullRequest {
  id: number;
  title: string;
  description: string;
  source: string;
  target: string;
  state: 'OPEN' | 'MERGED' | 'DECLINED';
  sha?: string;
}

export interface FakeBitbucket {
  url: string;
  files(branch: string): Record<string, string>;
  branches(): string[];
  pulls: PullRequest[];
  requests: { method: string; path: string }[];
  failNextMerge(): void;
  close(): Promise<void>;
}

const INITIAL = { 'README.md': '# Hello\n', 'src/index.ts': 'export const x = 1;\n' };
const ROOT = `/repositories/${FAKE_WORKSPACE}/hello`;

async function readRaw(req: IncomingMessage): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return new Uint8Array(Buffer.concat(chunks));
}

function authorized(header: string | undefined): boolean {
  if (!header) return false;
  if (header === `Bearer ${FAKE_TOKEN}`) return true;
  if (header.startsWith('Basic ')) {
    const decoded = Buffer.from(header.slice('Basic '.length), 'base64').toString('utf8');
    return decoded.endsWith(`:${FAKE_TOKEN}`);
  }
  return false;
}

export async function startFakeBitbucket(): Promise<FakeBitbucket> {
  const repo = new MemoryBranches(INITIAL);
  const pulls: PullRequest[] = [];
  const requests: { method: string; path: string }[] = [];
  let failMerge = false;

  const server: Server = createServer(async (req, res) => {
    const send = (status: number, body: unknown, type = 'application/json') => {
      const payload = type === 'application/json' ? JSON.stringify(body) : String(body ?? '');
      res.writeHead(status, { 'Content-Type': type });
      res.end(payload);
    };
    const url = new URL(req.url ?? '/', 'http://fake');
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const method = req.method ?? 'GET';
    requests.push({ method, path });
    if (!authorized(req.headers.authorization)) return send(401, { error: { message: 'Unauthorized' } });

    if (path === '/user' && method === 'GET') return send(200, { username: 'octocat', display_name: 'Octo Cat' });
    if (path === `/repositories/${FAKE_WORKSPACE}` && method === 'GET') {
      return send(200, { values: [{ full_name: FAKE_REPO, description: 'Hello world' }], pagelen: 100 });
    }
    if (path === `${ROOT}` && method === 'GET') return send(200, { full_name: FAKE_REPO, mainbranch: { name: 'main' } });

    if (path === `${ROOT}/refs/branches` && method === 'POST') {
      const body = JSON.parse(new TextDecoder().decode(await readRaw(req)));
      if (!repo.branchFromHash(String(body.target?.hash), String(body.name))) return send(400, { error: { message: 'branch exists or hash missing' } });
      return send(201, { name: body.name, target: { hash: repo.tip(String(body.name)) } });
    }

    const refMatch = path.match(new RegExp(`^${ROOT}/refs/branches/(.+)$`));
    if (refMatch && method === 'GET') {
      const name = decodeURIComponent(refMatch[1]!);
      const hash = repo.tip(name);
      return hash ? send(200, { name, target: { hash } }) : send(404, { error: { message: 'Not found' } });
    }
    if (refMatch && method === 'DELETE') {
      const name = decodeURIComponent(refMatch[1]!);
      if (!repo.has(name)) return send(404, { error: { message: 'Not found' } });
      repo.delete(name);
      res.writeHead(204).end();
      return;
    }

    const srcMatch = path.match(new RegExp(`^${ROOT}/src/([^/]+)(?:/(.*))?$`));
    if (srcMatch && method === 'GET') {
      const hash = decodeURIComponent(srcMatch[1]!);
      const filePath = decodeURIComponent(srcMatch[2] ?? '');
      const listed = repo.list(hash, filePath, true);
      if (listed === 'missing') return send(404, { error: { message: 'Not found' } });
      if (listed === 'file') return send(200, repo.textAt(hash, filePath) ?? '', 'text/plain; charset=utf-8');
      return send(200, {
        pagelen: 100,
        size: listed.length,
        values: listed.map((entry) => ({ path: entry.path, type: entry.type === 'dir' ? 'commit_directory' : 'commit_file', size: entry.size })),
      });
    }

    if (path === `${ROOT}/src` && method === 'POST') {
      const raw = await readRaw(req);
      const bytes = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
      const form = await new Request('http://fake/', { method: 'POST', headers: { 'content-type': req.headers['content-type'] ?? '' }, body: new Blob([bytes]) }).formData();
      const branch = String(form.get('branch') ?? '');
      if (!repo.has(branch)) return send(404, { error: { message: 'branch not found' } });
      const writes: [string, string][] = [];
      for (const [key, value] of form.entries()) {
        if (key === 'message' || key === 'branch' || key === 'files' || key === 'parents') continue;
        writes.push([key, typeof value === 'string' ? value : await value.text()]);
      }
      const removed = form.getAll('files').map(String);
      repo.update(branch, (files) => {
        for (const [key, text] of writes) files.set(key, text);
        for (const path of removed) files.delete(path);
      });
      return send(201, { hash: repo.tip(branch) });
    }

    if (path === `${ROOT}/pullrequests` && method === 'POST') {
      const body = JSON.parse(new TextDecoder().decode(await readRaw(req)));
      const pr: PullRequest = {
        id: pulls.length + 1,
        title: body.title,
        description: body.description ?? '',
        source: body.source?.branch?.name,
        target: body.destination?.branch?.name,
        state: 'OPEN',
      };
      pulls.push(pr);
      return send(201, { id: pr.id, links: { html: { href: `https://bitbucket.example/${FAKE_REPO}/pull-requests/${pr.id}` } } });
    }

    const prMatch = path.match(new RegExp(`^${ROOT}/pullrequests/(\\d+)(?:/(merge|decline))?$`));
    if (prMatch) {
      const pr = pulls[Number(prMatch[1]) - 1];
      if (!pr) return send(404, { error: { message: 'Not found' } });
      if (prMatch[2] === 'merge' && method === 'POST') {
        if (failMerge) {
          failMerge = false;
          return send(400, { error: { message: 'squash is not allowed' } });
        }
        const sha = repo.replaceWith(pr.target, pr.source);
        pr.state = 'MERGED';
        pr.sha = sha;
        repo.delete(pr.source);
        return send(200, { state: 'MERGED', merge_commit: { hash: sha } });
      }
      if (prMatch[2] === 'decline' && method === 'POST') {
        pr.state = 'DECLINED';
        return send(200, { state: 'DECLINED' });
      }
      if (method === 'GET') return send(200, { id: pr.id, state: pr.state, merge_commit: pr.sha ? { hash: pr.sha } : undefined });
    }

    return send(404, { error: { message: `Not found: ${method} ${path}` } });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    files: (branch) => repo.files(branch),
    branches: () => repo.names(),
    pulls,
    requests,
    failNextMerge: () => {
      failMerge = true;
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
