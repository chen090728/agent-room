import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { MemoryBranches } from './memory-repo.js';

export const FAKE_TOKEN = 'glpat-fake-0123456789';
export const FAKE_REPO = 'group/sub/hello';

interface PullRequest {
  iid: number;
  title: string;
  source: string;
  target: string;
  description: string;
  state: 'opened' | 'closed' | 'merged';
  sha?: string;
}

export interface FakeGitLab {
  url: string;
  files(branch: string): Record<string, string>;
  branches(): string[];
  pulls: PullRequest[];
  requests: { method: string; path: string }[];
  failNextMerge(): void;
  close(): Promise<void>;
}

const INITIAL = { 'README.md': '# Hello\n', 'src/index.ts': 'export const x = 1;\n' };

export async function startFakeGitLab(): Promise<FakeGitLab> {
  const repo = new MemoryBranches(INITIAL);
  const pulls: PullRequest[] = [];
  const requests: { method: string; path: string }[] = [];
  let failMerge = false;
  const project = `/api/v4/projects/${encodeURIComponent(FAKE_REPO)}`;

  const readJson = async (req: IncomingMessage) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    const text = Buffer.concat(chunks).toString('utf8');
    return text ? JSON.parse(text) : {};
  };

  const server: Server = createServer(async (req, res) => {
    const send = (status: number, body: unknown, type = 'application/json') => {
      const payload = type === 'application/json' ? JSON.stringify(body) : String(body ?? '');
      res.writeHead(status, { 'Content-Type': type });
      res.end(payload);
    };
    const url = new URL(req.url ?? '/', 'http://fake');
    const path = url.pathname;
    const method = req.method ?? 'GET';
    requests.push({ method, path });
    if (req.headers['private-token'] !== FAKE_TOKEN) return send(401, { message: '401 Unauthorized' });

    if (path === '/api/v4/user' && method === 'GET') return send(200, { username: 'octocat' });
    if (path === '/api/v4/projects' && method === 'GET') {
      return send(200, [{ path_with_namespace: FAKE_REPO, description: 'Hello world' }]);
    }
    if (!path.startsWith(project)) return send(404, { message: '404 Project Not Found' });
    const rest = path.slice(project.length);

    if (rest === '' && method === 'GET') return send(200, { default_branch: 'main', path_with_namespace: FAKE_REPO });

    if (rest === '/repository/tree' && method === 'GET') {
      const dir = url.searchParams.get('path') ?? '';
      const listed = repo.list('main', dir);
      if (listed === 'missing' || listed === 'file') return send(404, { message: '404 Tree Not Found' });
      return send(200, listed.map((entry) => ({ path: entry.path, type: entry.type === 'dir' ? 'tree' : 'blob' })));
    }

    const fileMatch = rest.match(/^\/repository\/files\/(.+?)(\/raw)?$/);
    if (fileMatch && method === 'GET') {
      const filePath = decodeURIComponent(fileMatch[1]!);
      const text = repo.read('main', filePath);
      if (text === undefined) return send(404, { message: '404 File Not Found' });
      if (fileMatch[2] === '/raw') return send(200, text, 'text/plain; charset=utf-8');
      return send(200, { file_path: filePath, encoding: 'base64', content: Buffer.from(text).toString('base64'), size: text.length });
    }

    if (rest === '/repository/commits' && method === 'POST') {
      const body = await readJson(req);
      if (!repo.branchFrom(String(body.start_branch), String(body.branch))) return send(400, { message: 'branch already exists' });
      repo.update(String(body.branch), (files) => {
        for (const action of body.actions as { action: string; file_path: string; content?: string }[]) {
          if (action.action === 'delete') files.delete(action.file_path);
          else files.set(action.file_path, action.content ?? '');
        }
      });
      return send(201, { id: repo.tip(String(body.branch)) });
    }

    const branchMatch = rest.match(/^\/repository\/branches\/(.+)$/);
    if (branchMatch && method === 'DELETE') {
      const name = decodeURIComponent(branchMatch[1]!);
      if (!repo.has(name)) return send(404, { message: '404 Branch Not Found' });
      repo.delete(name);
      res.writeHead(204).end();
      return;
    }

    if (rest === '/merge_requests' && method === 'POST') {
      const body = await readJson(req);
      const pr: PullRequest = {
        iid: pulls.length + 1,
        title: body.title,
        source: body.source_branch,
        target: body.target_branch,
        description: body.description ?? '',
        state: 'opened',
      };
      pulls.push(pr);
      return send(201, { iid: pr.iid, web_url: `https://gitlab.example/${FAKE_REPO}/-/merge_requests/${pr.iid}` });
    }

    const mrMatch = rest.match(/^\/merge_requests\/(\d+)(\/merge)?$/);
    if (mrMatch) {
      const pr = pulls[Number(mrMatch[1]) - 1];
      if (!pr) return send(404, { message: '404 Not Found' });
      if (mrMatch[2] === '/merge' && method === 'PUT') {
        const body = await readJson(req);
        if (failMerge) {
          failMerge = false;
          return send(405, { message: 'Branch cannot be merged' });
        }
        const sha = repo.replaceWith(pr.target, pr.source);
        pr.state = 'merged';
        pr.sha = sha;
        if (body.should_remove_source_branch) repo.delete(pr.source);
        return send(200, { state: 'merged', squash_commit_sha: sha, merge_commit_sha: sha });
      }
      if (method === 'GET') return send(200, { state: pr.state, squash_commit_sha: pr.sha, merge_commit_sha: pr.sha });
      if (method === 'PUT') {
        const body = await readJson(req);
        if (body.state_event === 'close') pr.state = 'closed';
        return send(200, { state: pr.state });
      }
    }

    return send(404, { message: `404 Not Found: ${method} ${path}` });
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
