import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './helpers/loadApp.js';

const run = async (code) => { const app = await loadApp(); return app.eval(`String(${code})`); };

test('html: escapa valores peligrosos', async () => {
  const out = await run(`html\`<b>\${'<script>alert(1)</script>'}</b>\``);
  assert.equal(out, '<b>&lt;script&gt;alert(1)&lt;/script&gt;</b>');
});
test('html: escapa comillas y apóstrofos en atributos', async () => {
  const out = await run(`html\`<input value="\${'a"b\\'c'}">\``);
  assert.equal(out, '<input value="a&quot;b&#39;c">');
});
test('html: no vuelve a escapar html anidado ni raw()', async () => {
  assert.equal(await run(`html\`<p>\${html\`<i>\${'&'}</i>\`}\${raw('<br>')}</p>\``), '<p><i>&amp;</i><br></p>');
});
test('html: arrays, null, undefined, false y 0', async () => {
  assert.equal(await run(`html\`[\${[1, html\`<u>x</u>\`, 'a<']}][\${null}][\${undefined}][\${false}][\${0}]\``), '[1<u>x</u>a&lt;][][][]' + '[0]');
});
test('html: condicionales con && no imprimen "false"', async () => {
  assert.equal(await run(`html\`\${1 > 2 && 'x'}ok\``), 'ok');
});
