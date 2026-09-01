import assert from 'node:assert/strict';
import http from 'node:http';
import { vetPresenceImages } from './build/media.mjs';

let pass = 0;
const ok = (name) => { pass++; console.log('  ✓', name); };

const png = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a, 0,0,0,13, 73,72,68,82, 0,0,0,8, 0,0,0,8, 8,6,0,0,0,0,0,0,0]);
const server = http.createServer((req, res) => {
  if (req.url.startsWith('/gated')) { res.writeHead(401); return res.end('Missing Credentials'); }
  res.writeHead(200, { 'content-type': 'image/png' });
  res.end(png);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

console.log('vetPresenceImages');

// The reported bug: both slots hold VRChat URLs that need a login.
{
  const { activity, issues } = await vetPresenceImages({
    largeImageKey: `${base}/gated/world`,
    largeImageText: 'Illumination Media Player',
    smallImageKey: `${base}/gated/avatar`,
    smallImageText: 'DoNotResurrect_',
    fallbackImageKey: 'vrchat_logo',
  });
  assert.equal(activity.largeImageKey, 'vrchat_logo', 'large slot should fall back to the asset key');
  assert.equal(activity.smallImageKey, undefined, 'a badge over a fallback icon is noise');
  assert.equal(issues.length, 2);
  assert.match(issues[0], /^Large image: .*without a login.*401/);
  ok('auth-gated URLs are swapped for the asset key, with both reasons kept');
}

// No fallback configured: send nothing rather than a placeholder.
{
  const { activity, issues } = await vetPresenceImages({
    largeImageKey: `${base}/gated/world`,
    largeImageText: 'somewhere',
  });
  assert.equal(activity.largeImageKey, undefined);
  assert.equal(activity.largeImageText, undefined, 'hover text for an absent image is meaningless');
  assert.equal(issues.length, 1);
  ok('with no fallback key, the slot is left empty instead of broken');
}

// Asset keys are passed straight through and never probed.
{
  const { activity, issues } = await vetPresenceImages({
    largeImageKey: 'world_art',
    smallImageKey: 'avatar_art',
    smallImageText: 'me',
  });
  assert.equal(activity.largeImageKey, 'world_art');
  assert.equal(activity.smallImageKey, 'avatar_art');
  assert.equal(activity.smallImageText, 'me');
  assert.deepEqual(issues, []);
  ok('asset keys go through untouched — Discord resolves those itself');
}

// A URL that a stranger can read is kept.
{
  const { activity, issues } = await vetPresenceImages({
    largeImageKey: `${base}/public/world.png`,
    smallImageKey: `${base}/public/avatar.png`,
  });
  assert.equal(activity.largeImageKey, `${base}/public/world.png`);
  assert.equal(activity.smallImageKey, `${base}/public/avatar.png`);
  assert.deepEqual(issues, []);
  ok('a publicly readable URL is sent as-is');
}

// One good, one gated: keep the good one, drop only the bad slot.
{
  const { activity, issues } = await vetPresenceImages({
    largeImageKey: `${base}/public/world.png`,
    smallImageKey: `${base}/gated/avatar`,
    smallImageText: 'me',
    fallbackImageKey: 'vrchat_logo',
  });
  assert.equal(activity.largeImageKey, `${base}/public/world.png`);
  assert.equal(activity.smallImageKey, undefined);
  assert.equal(activity.smallImageText, undefined);
  assert.equal(issues.length, 1);
  assert.match(issues[0], /^Small image:/);
  ok('a bad badge does not cost you the large image');
}

// Discord rejects an over-long URL outright.
{
  const { activity, issues } = await vetPresenceImages({
    largeImageKey: `${base}/public/${'x'.repeat(300)}.png`,
    fallbackImageKey: 'vrchat_logo',
  });
  assert.equal(activity.largeImageKey, 'vrchat_logo');
  assert.match(issues[0], /too long/);
  ok('an over-long URL is caught before Discord refuses the whole push');
}

server.close();
console.log(`\n${pass} cases passed`);
