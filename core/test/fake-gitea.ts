import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { MemoryBranches } from './memory-repo.js';

export const FAKE_TOKEN = 'gitea-fake-token-0123456789';
export const FAKE_REPO = 'octo/hello';

interface PullRequest {
  number: number;
  title: string;
  body: string;
  head: string;
  base: string;
  state: 'open' | 'closed';
  merged: boolean;
  sha?: string;
}

export interface FakeGitea {
  url: string;
  files(branch: string): Record<string, string>;
  branches(): string[];
  pulls: PullRequest[];
  requests: { method: string; path: string }[];
  failNextMerge(): void;
  close(): Promise<void>;
}

const INITIAL = { 'README.md': '# Hello\n', 'src/index.ts': 'export const x = 1;\n' };
const ROOT = '/api/v1/repos/octo/hello';

function blobSha(path: string, content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) hash = (hash * 33 + content.charCodeAt(i)) >>> 0;
  return `sha-${path}-${hash.toString(16)}`;
}

async function readJson(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

export async function startFakeGitea(): Promise<FakeGitea> {
  const repo = new MemoryBranches(INITIAL);
  const pulls: PullRequest[] = [];
  const requests: { method: string; path: string }[] = [];
  let failMerge = false;

  const server: Server = createServer(async (req, res) => {
    const send = (status: number, body?: unknown) => {
      if (body === undefined) {
        res.writeHead(status).end();
        return;
      }
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    const url = new URL(req.url ?? '/', 'http://fake');
    const path = decodeURIComponent(url.pathname);
    const method = req.method ?? 'GET';
    requests.push({ method, path: url.pathname });
    if (req.headers.authorization !== `token ${FAKE_TOKEN}`) return send(401, { message: 'token is invalid' });

    if (path === '/api/v1/user' && method === 'GET') return send(200, { login: 'octocat' });
    if (path === '/api/v1/user/repos' && method === 'GET') return send(200, [{ full_name: FAKE_REPO, description: 'Hello world' }]);
    if (path === ROOT && method === 'GET') return send(200, { full_name: FAKE_REPO, default_branch: 'main' });

    if (path === `${ROOT}/contents` && method === 'POST') {
      const body = await readJson(req);
      const base = String(body.branch);
      const branch = String(body.new_branch);
      if (!repo.branchFrom(base, branch)) return send(409, { message: 'branch already exists' });
      let failed: string | undefined;
      repo.update(branch, (files) => {
        for (const file of body.files as { operation: string; path: string; content?: string; sha?: string }[]) {
          const current = files.get(file.path);
          if (file.operation === 'delete') {
            if (current === undefined || blobSha(file.path, current) !== file.sha) {
              failed = 'sha mismatch';
              return;
            }
            files.delete(file.path);
            continue;
          }
          const text = Buffer.from(file.content ?? '', 'base64').toString('utf8');
          if (file.operation === 'update') {
            if (current === undefined || blobSha(file.path, current) !== file.sha) {
              failed = 'sha mismatch';
              return;
            }
          }
          files.set(file.path, text);
        }
      });
      if (failed) return send(422, { message: failed });
      return send(201, { commit: { sha: repo.tip(branch) } });
    }

    if (path.startsWith(`${ROOT}/contents`) && method === 'GET') {
      const filePath = path.slice(`${ROOT}/contents`.length).replace(/^\//, '');
      const listed = repo.list('main', filePath);
      if (listed === 'missing') return send(404, { message: 'not found' });
      if (listed === 'file') {
        const text = repo.read('main', filePath)!;
        return send(200, { type: 'file', path: filePath, size: text.length, sha: blobSha(filePath, text), encoding: 'base64', content: Buffer.from(text).toString('base64') });
      }
      return send(200, listed.map((entry) => ({ path: entry.path, type: entry.type, size: entry.size })));
    }

    const branchMatch = path.match(new RegExp(`^${ROOT}/branches/(.+)$`));
    if (branchMatch && method === 'DELETE') {
      const name = branchMatch[1]!;
      if (!repo.has(name)) return send(404, { message: 'branch not found' });
      repo.delete(name);
      return send(204);
    }

    if (path === `${ROOT}/pulls` && method === 'POST') {
      const body = await readJson(req);
      const pr: PullRequest = { number: pulls.length + 1, title: body.title, body: body.body ?? '', head: body.head, base: body.base, state: 'open', merged: false };
      pulls.push(pr);
      return send(201, { number: pr.number, html_url: `https://gitea.example/${FAKE_REPO}/pulls/${pr.number}` });
    }

    const prMatch = path.match(new RegExp(`^${ROOT}/pulls/(\\d+)(/merge)?$`));
    if (prMatch) {
      const pr = pulls[Number(prMatch[1]) - 1];
      if (!pr) return send(404, { message: 'not found' });
      if (prMatch[2] === '/merge' && method === 'POST') {
        if (failMerge) {
          failMerge = false;
          return send(405, { message: 'merge conflict' });
        }
        const body = await readJson(req);
        pr.sha = repo.replaceWith(pr.base, pr.head);
        pr.merged = true;
        pr.state = 'closed';
        if (body.delete_branch_after_merge) repo.delete(pr.head);
        return send(200, { sha: pr.sha });
      }
      if (method === 'GET') return send(200, { number: pr.number, state: pr.state, merged: pr.merged, merge_commit_sha: pr.sha });
      if (method === 'PATCH') {
        const body = await readJson(req);
        if (body.state === 'closed') pr.state = 'closed';
        return send(200, { state: pr.state, merged: pr.merged });
      }
    }

    return send(404, { message: `not found: ${method} ${path}` });
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
