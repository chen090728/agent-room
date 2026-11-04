import assert from 'node:assert/strict';
import test from 'node:test';
import { initialPluginView, pluginChipSlots, pluginHelp, pluginsForFocus, type PluginInfo } from './plugins.ts';
import type { IntegrationView } from './protocol.ts';

const DEPLOY = ['cloudflare-pages', 'vercel', 'netlify', 'render', 'railway', 'fly', 'cloudflare-workers', 'azure-static-web-apps', 'webhook'];

function integration(type: string, id = type): IntegrationView {
  return { id, type, typeLabel: type, name: id, config: {}, secrets: {}, createdAt: 0 };
}

test('composer chips always offer a repo slot and a deploy slot', () => {
  const empty = pluginChipSlots(null, []);
  assert.deepEqual(
    empty.map((slot) => slot.kind),
    ['repo', 'deploy'],
  );
  assert.equal(empty[0]?.bound, null);
  assert.equal(empty[1]?.bound, null);

  const repoOnly = pluginChipSlots({ repo: { integrationId: 'gh', repo: 'octo/room' } }, [integration('github', 'gh')]);
  assert.equal(repoOnly[0]?.bound?.label, 'GitHub');
  assert.equal(repoOnly[0]?.bound?.detail, 'octo/room');
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

test('a GitHub chip opens connect or bind, and a deploy chip stays on the list', () => {
  const connect = initialPluginView('repo', []);
  assert.equal(connect.kind, 'connect');
  if (connect.kind === 'connect') assert.equal(connect.plugin.type, 'github');

  const bind = initialPluginView('repo', [integration('github', 'gh')]);
  assert.equal(bind.kind, 'bind');
  if (bind.kind === 'bind') {
    assert.equal(bind.plugin.type, 'github');
    assert.equal(bind.integrationId, 'gh');
  }

  assert.equal(initialPluginView('deploy', [integration('github', 'gh')]).kind, 'list');
  assert.equal(initialPluginView(undefined, []).kind, 'list');
});

test('deploy focus lists only deploy platforms', () => {
  const deploy = pluginsForFocus('deploy');
  assert.deepEqual(deploy.map((plugin) => plugin.type), DEPLOY);
  assert.ok(deploy.every((plugin: PluginInfo) => plugin.binds === 'deploy'));

  const all = pluginsForFocus(undefined);
  assert.equal(all.length, 1 + DEPLOY.length);
  assert.equal(all[0]?.type, 'github');
  assert.equal(pluginsForFocus('repo').length, 1 + DEPLOY.length);
});

test('new deploy plugins have help steps', () => {
  for (const type of ['railway', 'fly', 'cloudflare-workers', 'azure-static-web-apps', 'webhook']) {
    const help = pluginHelp(type);
    assert.equal(help?.length, 3, type);
    assert.ok(help!.every((line) => line.trim().length > 0));
  }
  assert.equal(pluginHelp('gitlab'), undefined);
});
