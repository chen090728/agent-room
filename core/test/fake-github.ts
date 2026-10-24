// A small in-memory imitation of the GitHub REST endpoints AgentHub uses, so the
// integration can be tested end to end without a real account.
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export const FAKE_TOKEN = 'github_pat_fake_0123456789';
export const FAKE_REPO = 'octo/hello';

type Files = Map<string, string>;

interface PullRequest {
  number: number;
  title: string;
  head: string;
  base: string;
  body: string;
  state: 'open' | 'closed';
  merged: boolean;
}

export interface FakeGitHub {
  url: string;
  /** Files on a branch's tip. */
  files(branch: string): Record<string, string>;
  branches(): string[];
  pulls: PullRequest[];
  requests: { method: string; path: string }[];
  /** Make the next merge fail like a conflict. */
  failNextMerge(): void;
  close(): Promise<void>;
}

function lineStats(before: string | undefined, after: string | undefined) {
  const a = (before ?? '').split('\n').filter(Boolean);
  const b = (after ?? '').split('\n').filter(Boolean);
  return {
    additions: b.filter((l) => !a.includes(l)).length,
    deletions: a.filter((l) => !b.includes(l)).length,
  };
}

export async function startFakeGitHub(initial: Record<string, string> = { 'README.md': '# Hello\n', 'src/index.ts': 'export const x = 1;\n' }): Promise<FakeGitHub> {
  let counter = 0;
  const commits = new Map<string, { tree: string; parent?: string }>();
  const trees = new Map<string, Files>();
  const refs = new Map<string, string>();
  const pulls: PullRequest[] = [];
  const requests: { method: string; path: string }[] = [];
  let failMerge = false;

  const newId = (prefix: string) => `${prefix}-${++counter}`;
  const rootTree = newId('tree');
  trees.set(rootTree, new Map(Object.entries(initial)));
  const rootCommit = newId('commit');
  commits.set(rootCommit, { tree: rootTree });
  refs.set('main', rootCommit);

  const tipFiles = (branch: string): Files => trees.get(commits.get(refs.get(branch)!)!.tree)!;

  const readBody = async (req: IncomingMessage) => {
    let data = '';
    for await (const chunk of req) data += chunk;
    return data ? JSON.parse(data) : {};
  };

  const server: Server = createServer(async (req, res) => {
    const send = (status: number, body: unknown, type = 'application/json') => {
      res.writeHead(status, { 'Content-Type': type });
      res.end(type === 'application/json' ? JSON.stringify(body) : String(body));
    };
    const url = new URL(req.url ?? '/', 'http://fake');
    const path = decodeURIComponent(url.pathname);
    const method = req.method ?? 'GET';
    requests.push({ method, path });

    if (req.headers.authorization !== `Bearer ${FAKE_TOKEN}`) return send(401, { message: 'Bad credentials' });
    const body = method === 'GET' || method === 'DELETE' ? {} : await readBody(req);

    if (path === '/user') return send(200, { login: 'octocat' });
    if (path === '/user/repos') return send(200, [{ full_name: FAKE_REPO, description: 'Hello world' }]);

    const repoPrefix = `/repos/${FAKE_REPO}`;
    if (!path.startsWith(repoPrefix)) return send(404, { message: 'Not Found' });
    const rest = path.slice(repoPrefix.length);

    if (rest === '' && method === 'GET') return send(200, { default_branch: 'main' });

    if (rest.startsWith('/contents')) {
      const sub = rest.slice('/contents'.length).replace(/^\/+/, '');
      const files = tipFiles('main');
      if (sub && files.has(sub)) {
        const text = files.get(sub)!;
        if ((req.headers.accept ?? '').includes('raw')) return send(200, text, 'application/vnd.github.raw');
        return send(200, { type: 'file', path: sub, size: text.length, encoding: 'base64', content: Buffer.from(text).toString('base64') });
      }
      const prefix = sub ? `${sub}/` : '';
      const entries = new Map<string, { type: 'file' | 'dir'; size: number }>();
      for (const [file, text] of files) {
        if (!file.startsWith(prefix)) continue;
        const [first, ...more] = file.slice(prefix.length).split('/');
        entries.set(prefix + first, more.length ? { type: 'dir', size: 0 } : { type: 'file', size: text.length });
      }
      if (!entries.size) return send(404, { message: 'Not Found' });
      return send(200, [...entries].map(([p, e]) => ({ path: p, name: p.split('/').pop(), ...e })));
    }

    const refMatch = rest.match(/^\/git\/ref\/heads\/(.+)$/);
    if (refMatch && method === 'GET') {
      const sha = refs.get(refMatch[1]);
      return sha ? send(200, { object: { sha } }) : send(404, { message: 'Not Found' });
    }

    const commitMatch = rest.match(/^\/git\/commits\/([\w-]+)$/);
    if (commitMatch && method === 'GET') {
      const c = commits.get(commitMatch[1]);
      return c ? send(200, { tree: { sha: c.tree } }) : send(404, { message: 'Not Found' });
    }

    if (rest === '/git/trees' && method === 'POST') {
      const base = trees.get(body.base_tree);
      if (!base) return send(422, { message: 'Invalid base_tree' });
      const next = new Map(base);
      for (const e of body.tree as { path: string; content?: string; sha?: string | null }[]) {
        if (e.sha === null) next.delete(e.path);
        else next.set(e.path, e.content ?? '');
      }
      const id = newId('tree');
      trees.set(id, next);
      return send(201, { sha: id });
    }

    if (rest === '/git/commits' && method === 'POST') {
      const id = newId('commit');
      commits.set(id, { tree: body.tree, parent: body.parents?.[0] });
      return send(201, { sha: id });
    }

    if (rest === '/git/refs' && method === 'POST') {
      refs.set(String(body.ref).replace(/^refs\/heads\//, ''), body.sha);
      return send(201, { ref: body.ref });
    }

    const delRef = rest.match(/^\/git\/refs\/heads\/(.+)$/);
    if (delRef && method === 'DELETE') {
      refs.delete(delRef[1]);
      res.writeHead(204).end();
      return;
    }

    if (rest === '/pulls' && method === 'POST') {
      const pr: PullRequest = { number: pulls.length + 1, title: body.title, head: body.head, base: body.base, body: body.body ?? '', state: 'open', merged: false };
      pulls.push(pr);
      return send(201, { number: pr.number, html_url: `https://github.example/${FAKE_REPO}/pull/${pr.number}` });
    }

    const prMatch = rest.match(/^\/pulls\/(\d+)(\/files|\/merge)?$/);
    if (prMatch) {
      const pr = pulls[Number(prMatch[1]) - 1];
      if (!pr) return send(404, { message: 'Not Found' });
      const sub = prMatch[2];

      if (sub === '/files' && method === 'GET') {
        const head = tipFiles(pr.head);
        const base = tipFiles(pr.base);
        const changed = [...new Set([...head.keys(), ...base.keys()])].filter((f) => head.get(f) !== base.get(f)).sort();
        return send(
          200,
          changed.map((f) => ({
            filename: f,
            status: !base.has(f) ? 'added' : !head.has(f) ? 'removed' : 'modified',
            ...lineStats(base.get(f), head.get(f)),
          })),
        );
      }

      if (sub === '/merge' && method === 'PUT') {
        if (failMerge) {
          failMerge = false;
          return send(405, { message: 'Pull Request is not mergeable' });
        }
        const id = newId('commit');
        commits.set(id, { tree: commits.get(refs.get(pr.head)!)!.tree, parent: refs.get(pr.base) });
        refs.set(pr.base, id);
        pr.merged = true;
        pr.state = 'closed';
        return send(200, { merged: true, sha: id });
      }

      if (!sub && method === 'GET') return send(200, { state: pr.state, merged: pr.merged });
      if (!sub && method === 'PATCH') {
        if (body.state) pr.state = body.state;
        return send(200, { state: pr.state });
      }
    }

    return send(404, { message: `Not Found: ${method} ${path}` });
  });

  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;

  return {
    url: `http://127.0.0.1:${port}`,
    files: (branch) => Object.fromEntries(tipFiles(branch)),
    branches: () => [...refs.keys()],
    pulls,
    requests,
    failNextMerge: () => {
      failMerge = true;
    },
    close: () =>
      new Promise<void>((r) => {
        server.closeAllConnections();
        server.close(() => r());
      }),
  };
}
