import assert from 'node:assert/strict';
import test from 'node:test';
import { initialPluginView, pluginChipSlots, pluginHelp, pluginsForFocus, type PluginInfo } from './plugins.ts';
import type { IntegrationView } from './protocol.ts';

const DEPLOY = ['cloudflare-pages', 'vercel', 'netlify', 'render', 'railway', 'fly', 'cloudflare-workers', 'azure-static-web-apps', 'webhook'];

function integration(type: string, id = type, typeLabel = type): IntegrationView {
  return { id, type, typeLabel, name: id, config: {}, secrets: {}, createdAt: 0 };
}

test('composer chips always offer a repo slot and a deploy slot', () => {
  const empty = pluginChipSlots(null, []);
  assert.deepEqual(
    empty.map((slot) => slot.kind),
    ['repo', 'deploy'],
  );
  assert.equal(empty[0]?.bound, null);
  assert.equal(empty[1]?.bound, null);

  const repoOnly = pluginChipSlots({ repo: { integrationId: 'gh', repo: 'octo/room' } }, [integration('github', 'gh', 'GitHub')]);
  assert.equal(repoOnly[0]?.bound?.label, 'GitHub');
  assert.equal(repoOnly[0]?.bound?.detail, 'octo/room');
  const gitlab = pluginChipSlots({ repo: { integrationId: 'gl', repo: 'group/sub/room' } }, [integration('gitlab', 'gl', 'GitLab')]);
  assert.equal(gitlab[0]?.bound?.label, 'GitLab');
  assert.equal(gitlab[0]?.bound?.detail, 'group/sub/room');
  const missing = pluginChipSlots({ repo: { integrationId: 'gone', repo: 'octo/room' } }, []);
  assert.equal(missing[0]?.bound?.label, 'plugins.fallbackRepo');
  assert.equal(repoOnly[1]?.bound, null);

  const both = pluginChipSlots(
    {
      repo: { integrationId: 'gh', repo: 'octo/room' },
      deploy: { integrationId: 'vercel', project: 'prj', name: 'Room' },
    },
    [integration('github', 'gh'), integration('vercel')],
  );
  assert.equal(both[1]?.bound?.label, 'vercel');
  assert.equal(both[1]?.bound?.detail, 'Room');
});

test('a repo chip lists hosts, and opens bind only when one code host is connected', () => {
  assert.equal(initialPluginView('repo', []).kind, 'list');

  const bind = initialPluginView('repo', [integration('github', 'gh')]);
  assert.equal(bind.kind, 'bind');
  if (bind.kind === 'bind') {
    assert.equal(bind.plugin.type, 'github');
    assert.equal(bind.integrationId, 'gh');
  }

  const gitlab = initialPluginView('repo', [integration('gitlab', 'gl')]);
  assert.equal(gitlab.kind, 'bind');
  if (gitlab.kind === 'bind') assert.equal(gitlab.plugin.type, 'gitlab');

  assert.equal(initialPluginView('repo', [integration('github', 'gh'), integration('gitlab', 'gl')]).kind, 'list');
  assert.equal(initialPluginView('deploy', [integration('github', 'gh')]).kind, 'list');
  assert.equal(initialPluginView(undefined, []).kind, 'list');
});

test('deploy focus lists only deploy platforms', () => {
  const deploy = pluginsForFocus('deploy');
  assert.deepEqual(deploy.map((plugin) => plugin.type), DEPLOY);
  assert.ok(deploy.every((plugin: PluginInfo) => plugin.binds === 'deploy'));

  const repos = pluginsForFocus('repo');
  assert.deepEqual(
    repos.map((plugin) => plugin.type),
    ['github', 'gitlab', 'bitbucket', 'gitea'],
  );
  assert.ok(repos.every((plugin: PluginInfo) => plugin.binds === 'repo'));

  const all = pluginsForFocus(undefined);
  assert.equal(all.length, 4 + DEPLOY.length);
  assert.equal(all[0]?.type, 'github');
  assert.equal(pluginsForFocus('repo').length, 4);
});

test('code hosts and new deploy plugins have help steps', () => {
  for (const type of ['railway', 'fly', 'cloudflare-workers', 'azure-static-web-apps', 'webhook']) {
    const help = pluginHelp(type);
    assert.equal(help?.length, 3, type);
    assert.ok(help!.every((line) => line.trim().length > 0));
  }
  for (const type of ['gitlab', 'bitbucket', 'gitea']) {
    const help = pluginHelp(type);
    assert.ok(help && help.length >= 3, type);
  }
});
