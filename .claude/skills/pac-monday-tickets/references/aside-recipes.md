# Aside repl recipes for PAC Monday

Write these to a file and run with:

```bash
aside repl "$(cat script.js)" > out.txt 2>&1
```

Then read `out.txt`. Do not pipe to `tail` — you lose everything.

---

## Read one ticket

```js
const p1 = await openTab('https://pac-crew.monday.com/boards/18414915876/pulses/12663709539');
await sleep(9000);

// Expand every truncated update
const s1 = await snapshot(p1, { interactive: true });
for (const m of s1.tree.match(/button "\.\.\. Ver mais" \[ref=(e\d+)\]/g) || []) {
  const ref = m.match(/\[ref=(e\d+)\]/)[1];
  try {
    await p1.locator(ref).click();
    await sleep(1200);
  } catch (e) {}
}

// Body text, trimmed of the left nav and board chrome
const t = await p1.evaluate(() => {
  const b = document.body.innerText;
  const i = b.indexOf('Agrupar por'); // last bit of board chrome before the item
  return (i > -1 ? b.slice(i + 11) : b).slice(0, 4000);
});
console.log(t);
```

The assignees appear in the interactive tree near the title:

```
- generic "<Ticket title>" [ref=eNN]
- generic [ref=eNN]:
  - button "Richard Visser" [ref=eNN]
  - button "Matheus Alexandre" [ref=eNN]     <- assigned to
```

## Map board rows to groups (the canvas workaround)

```js
const p1 = await openTab('https://pac-crew.monday.com/boards/18414915876');
await sleep(9000);
const rows = await p1.evaluate(() =>
  [...document.querySelectorAll('.pulse-component')].map(e => ({
    pulse: e.id.split('-').at(-2),
    top: Math.round(e.getBoundingClientRect().top + window.scrollY),
  }))
);
console.log(JSON.stringify(rows));
```

Group headers are elements whose exact `textContent` is the group name and which have no
children. Compare each row's `top` against the headers' `top` to assign groups. Only rendered
rows appear — collapsed or off-screen groups (e.g. a long "Resolved") may be absent.

## Read several tickets in one session

Reuse one tab with `goto`; opening a tab per ticket is slow and they all close at exit anyway.

```js
const ids = ['12663709539', '12704828240'];
const p1 = await openTab('https://pac-crew.monday.com/boards/18414915876/pulses/' + ids[0]);
await sleep(9000);
for (const id of ids) {
  await p1.goto('https://pac-crew.monday.com/boards/18414915876/pulses/' + id);
  await sleep(7000);
  const t = await p1.evaluate(() => {
    const b = document.body.innerText,
      i = b.indexOf('Agrupar por');
    return (i > -1 ? b.slice(i + 11) : b).slice(0, 4000);
  });
  console.log('===== ITEM ' + id + ' =====');
  console.log(t);
}
```

## Open an attachment at full size

```js
await p1.locator('img[src*="protected_static"]').first().click();
await sleep(6000);
await fs.mkdir('./artifacts', { recursive: true });
await p1.screenshot({ path: './artifacts/attachment.png' });
console.log('SHOT: ' + path.resolve('./artifacts/attachment.png'));
```

Read the printed absolute path afterwards. The inline thumbnail
(`custom_thumbnail_big.png`, ~450×283) is too small to read.

---

## Post a comment

Only after the user has approved the exact text.

```js
const MENTIONS = ['Lara', 'Richard'];
const PARAS = [`First paragraph.`, `Second paragraph.`];

const p1 = await openTab(URL);
await sleep(9000);

// Open the composer
const s1 = await snapshot(p1, { interactive: true });
const openBtn = s1.tree.match(
  /button "Escreva uma atualização e mencione outros com @" \[ref=(e\d+)\]/
);
await p1.locator(openBtn[1]).click();
await sleep(3000);

// Focus the editor
const s2 = await snapshot(p1, { interactive: true });
const edRef = s2.tree.match(/textbox "Editor de rich text" \[ref=(e\d+)\]/)[1];
await p1.locator(edRef).click();
await sleep(1200);

// Mentions first
for (const name of MENTIONS) {
  await p1.keyboard.type('@' + name, { delay: 60 });
  await sleep(2500);
  await p1.keyboard.press('Enter');
  await sleep(1200);
}

// Body - explicit Enter presses, never embedded \n
for (const para of PARAS) {
  await p1.keyboard.press('Enter');
  await sleep(350);
  await p1.keyboard.press('Enter');
  await sleep(350);
  await p1.keyboard.type(para, { delay: 4 });
  await sleep(700);
}
await sleep(1500);

// Verify through the editor's own locator
const readback = await p1.locator(edRef).innerText();
console.log('=== READBACK ===\n' + readback + '\n=== END ===');

const required = ['<distinctive phrase>', '<member id>'];
const missing = required.filter(r => !readback.includes(r));
const breaks = (readback.match(/\n/g) || []).length;

if (missing.length || breaks < PARAS.length) {
  console.log('ABORTED -', missing.join(', ') || 'too few paragraph breaks');
} else {
  const s3 = await snapshot(p1, { interactive: true });
  const post = s3.tree.match(/button "Atualizar" \[ref=(e\d+)\]/);
  await p1.locator(post[1]).click();
  await sleep(7000);
  await fs.mkdir('./artifacts', { recursive: true });
  await p1.screenshot({ path: './artifacts/posted.png' });
  console.log('POSTED\nSHOT: ' + path.resolve('./artifacts/posted.png'));
}
```

## Fix an already-posted update

Leaves a permanent "Editado" marker — prefer getting it right first time.

```js
const s1 = await snapshot(p1, { interactive: true });
const anchor = s1.tree.indexOf('Definir lembrete para Matheus Alexandre'); // your own update
const menuRef = s1.tree.slice(anchor).match(/button "Menu" \[ref=(e\d+)\]/)[1];
await p1.locator(menuRef).click();
await sleep(2500);

const s2 = await snapshot(p1, { interactive: true });
await p1.locator(s2.tree.match(/menuitem "Editar atualização" \[ref=(e\d+)\]/)[1]).click();
await sleep(4000);

const s3 = await snapshot(p1, { interactive: true });
const edRef = s3.tree.match(/textbox "Editor de rich text" \[ref=(e\d+)\]/)[1];
await p1.locator(edRef).click();
await p1.keyboard.press('Meta+a');
await p1.keyboard.press('Backspace');
// ... retype mentions + paragraphs as above ...
// save button is "Salvar", not "Atualizar"
```

## Verify what actually posted

```js
const m = s1.tree.match(/button "\.\.\. Ver mais" \[ref=(e\d+)\]/);
if (m) {
  await p1.locator(m[1]).click();
  await sleep(2500);
}
const txt = await p1.evaluate(() => {
  const b = document.body.innerText;
  const i = b.indexOf('<first words of your update>');
  const j = b.indexOf('Curtir', i);
  return i > -1 ? b.slice(i, j > i ? j : i + 2600) : '(not found)';
});
console.log(txt);
```

Check the interactive tree shows `link "@Name"` for each mention — if they render as plain text,
the mention did not attach and nobody was notified.

---

## Portuguese UI reference

| Portuguese                                        | Meaning                         |
| ------------------------------------------------- | ------------------------------- |
| `Escreva uma atualização e mencione outros com @` | open the update composer        |
| `Editor de rich text`                             | the editable textbox            |
| `Atualizar`                                       | post the update                 |
| `Salvar`                                          | save an edit                    |
| `... Ver mais` / `Ver menos`                      | expand / collapse a long update |
| `Editar atualização`                              | edit update (kebab menu)        |
| `Excluir atualização`                             | delete update                   |
| `Responder` / `Curtir`                            | reply / like                    |
| `Atualizações/N`                                  | updates tab, N updates          |
| `Arquivos`                                        | files tab                       |
| `Convidado`                                       | guest (your account level)      |
