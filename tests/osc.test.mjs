import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const osc = createRequire(new URL('../package.json', import.meta.url))('osc');

// A stand-in for the main process: the same startOSC contract, so the test
// exercises the behaviour that was broken rather than a copy of it.
const { startOSC, stopOSC, sendOSC, probeUdpPort, status } = await import('./build/oscmain.mjs');

let pass = 0;
const ok = n => { pass++; console.log('  ✓', n); };

console.log('OSC transport');

// ── The reported failure: a bind that never happens must not report success.
{
  // Hold the port the way VRCX or a heart-rate bridge would.
  const squatter = new osc.UDPPort({ localAddress: '127.0.0.1', localPort: 19501, metadata: true });
  await new Promise(r => { squatter.once('ready', r); squatter.open(); });

  const res = await startOSC({ recvPort: 19501, sendPort: 19500 });
  assert.equal(res.ok, false, 'a taken port reported success');
  assert.match(res.error, /already taken|in use|EADDRINUSE/i, res.error);
  assert.equal(status().connected, false, 'status claims connected after a failed bind');
  ok('a port held by another app fails with a reason, instead of a green light');

  // And sending must refuse rather than silently doing nothing.
  const sent = sendOSC('/chatbox/input', ['hi']);
  assert.equal(sent.ok, false);
  ok('sending while unbound is refused, not swallowed');

  squatter.close();
}

// ── A clean bind works, reports itself, and can actually carry a message.
{
  const res = await startOSC({ recvPort: 19601, sendPort: 19600 });
  assert.equal(res.ok, true, res.error);
  assert.equal(status().connected, true);
  assert.equal(status().recvPort, 19601);
  ok('a free port binds and reports connected');

  // A listener standing in for VRChat.
  const vrchat = new osc.UDPPort({ localAddress: '127.0.0.1', localPort: 19600, metadata: true });
  const heard = new Promise(resolve => vrchat.on('message', resolve));
  await new Promise(r => { vrchat.once('ready', r); vrchat.open(); });

  const before = status().packetsOut;
  sendOSC('/chatbox/input', ['hello', true, false]);
  const msg = await Promise.race([heard, new Promise((_, rej) => setTimeout(() => rej(new Error('nothing arrived')), 2000))]);
  assert.equal(msg.address, '/chatbox/input');
  assert.deepEqual(msg.args.map(a => a.value), ['hello', true, false]);
  assert.equal(status().packetsOut, before + 1, 'the outgoing counter did not move');
  ok('a chatbox message reaches the listener with the right argument types');

  vrchat.close();
  stopOSC();
  assert.equal(status().connected, false);
  ok('stopping releases the socket');
}

// ── Restarting on the same port must work, not collide with itself.
{
  let r = await startOSC({ recvPort: 19701, sendPort: 19700 });
  assert.equal(r.ok, true, r.error);
  r = await startOSC({ recvPort: 19701, sendPort: 19700 });
  assert.equal(r.ok, true, `restart failed: ${r.error}`);
  ok('restarting on the same port succeeds instead of colliding with itself');
  stopOSC();
}

// ── The port probe answers the question the diagnostics panel asks.
{
  const free = await probeUdpPort(19801);
  assert.equal(free.free, true, 'an unused port reported as taken');

  const holder = new osc.UDPPort({ localAddress: '127.0.0.1', localPort: 19802, metadata: true });
  await new Promise(r => { holder.once('ready', r); holder.open(); });
  const taken = await probeUdpPort(19802);
  assert.equal(taken.free, false, 'a held port reported as free');
  assert.match(taken.error ?? '', /EADDRINUSE/);
  holder.close();
  ok('the port probe tells free from taken');
}

console.log(`\n${pass} cases passed`);
process.exit(0);
