const state = {
  ids: [],
  encCache: {},
  lastKey: null,
  lastEncId: null
};
async function loadV() {
  const r = await fetch(`v.json`);
  if (!r.ok) throw new Error("Не найден v.json");
  return r.json();
}
async function loadEnc(id) {
  if (state.encCache[id]) return state.encCache[id];
  const r = await fetch(`${id}.json`);
  if (!r.ok) throw new Error("Не найден " + id + ".json");
  const j = await r.json();
  state.encCache[id] = j;
  return j;
}
function buildReverse(enc) {
  const rev = {};
  for (const [sym, code] of Object.entries(enc)) {
    if (sym === "id") continue;
    rev[code] = sym;
  }
  return rev;
}
function encode(text, enc) {
  const sepSym  = enc["_"];
  const lineSym = enc["#"];
  const lines = text.split(/\r?\n/);
  const groups = [];
  const bitParts = [];
  lines.forEach((line, li) => {
    const lineGroups = [];
    for (const ch of line) {
      if (enc[ch] === undefined) {
        throw new Error(`Символ "${ch}" отсутствует в кодировке "${enc.id}"`);
      }
      lineGroups.push(enc[ch]);
      groups.push(enc[ch]);
    }
    bitParts.push(lineGroups.join(sepSym));
    if (li < lines.length - 1) bitParts.push(lineSym);
  });
  const encoded = bitParts.join("");
  let key = "";
  if (groups.length > 0) {
    const first = groups[0];
    const third = groups[2] !== undefined ? groups[2] : groups[groups.length - 1];
    const last  = groups[groups.length - 1];
    key = first.slice(-1) + third.slice(-1) + last.slice(-1);
  }
  return { encoded, key };
}
function decode(bits, enc) {
  const rev = buildReverse(enc);
  const sepSym  = enc["_"];
  const lineSym = enc["#"];
  const sample = Object.entries(enc).find(([k]) => k !== "id")[1];
  const CODE_LEN = sample.length;
  const chunks = [];
  for (let i = 0; i < bits.length; i += CODE_LEN) {
    chunks.push(bits.slice(i, i + CODE_LEN));
  }
  let out = "";
  for (const c of chunks) {
    if (c === sepSym) continue;
    if (c === lineSym) { out += "\n"; continue; }
    if (rev[c] === undefined) throw new Error("Неизвестный код: " + c);
    out += rev[c];
  }
  return out;
}
function randomId(len = 8) {
  const abc = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < len; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return s;
}
function download(filename, content) {
  const blob = new Blob([content], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
function render(root) {
  root.innerHTML = `
    <h3>CatCode</h3>
    <div>
      <label>Тип кодировки:
        <select id="encSel"></select>
      </label>
    </div>
    <h4>Зашифровать</h4>
    <textarea id="plain" rows="5" cols="50" placeholder="Текст..."></textarea><br>
    <button id="btnEnc">Зашифровать → .catcode</button>
    <div id="encMsg"></div>
    <hr>
    <h4>Расшифровать</h4>
    <div>
      <input type="file" id="fileIn" accept=".catcode">
    </div>
    <div>
      <label>Ключ: <input id="keyIn" type="text" maxlength="3" size="5"></label>
    </div>
    <div>
      <label>Тип кодировки:
        <select id="encSel2"></select>
      </label>
    </div>
    <button id="btnDec">Расшифровать</button>
    <pre id="decOut"></pre>
    <div id="decMsg"></div>
  `;
  const fill = (sel) => {
    sel.innerHTML = "";
    for (const id of state.ids) {
      const o = document.createElement("option");
      o.value = id; o.textContent = id;
      sel.appendChild(o);
    }
  };
  fill(root.querySelector("#encSel"));
  fill(root.querySelector("#encSel2"));
  root.querySelector("#btnEnc").onclick = async () => {
    const encId = root.querySelector("#encSel").value;
    const text  = root.querySelector("#plain").value;
    const msg   = root.querySelector("#encMsg");
    msg.textContent = "";
    try {
      const enc = await loadEnc(encId);
      const { encoded, key } = encode(text, enc);
      const fname = `catcode_${randomId()}.catcode`;
      download(fname, encoded);
      state.lastKey = key;
      state.lastEncId = encId;
      msg.innerHTML = `Файл: <b>${fname}</b><br>Ключ: <b>${key}</b> (сохрани его!)`;
    } catch (e) {
      msg.textContent = "Ошибка: " + e.message;
    }
  };
  root.querySelector("#btnDec").onclick = async () => {
    const encId = root.querySelector("#encSel2").value;
    const keyIn = root.querySelector("#keyIn").value.trim();
    const fileEl = root.querySelector("#fileIn");
    const out = root.querySelector("#decOut");
    const msg = root.querySelector("#decMsg");
    out.textContent = "";
    msg.textContent = "";
    if (!fileEl.files[0]) { msg.textContent = "Выбери файл .catcode"; return; }
    try {
      const bits = (await fileEl.files[0].text()).trim();
      const enc = await loadEnc(encId);
      const { key: realKey } = keyFromBits(bits, enc);
      if (keyIn !== realKey) {
        msg.textContent = `Неверный ключ. Ожидался "${realKey}", введён "${keyIn}".`;
        return;
      }
      const text = decode(bits, enc);
      out.textContent = text;
      msg.textContent = "OK";
    } catch (e) {
      msg.textContent = "Ошибка: " + e.message;
    }
  };
}
function keyFromBits(bits, enc) {
  const sepSym  = enc["_"];
  const lineSym = enc["#"];
  const sample = Object.entries(enc).find(([k]) => k !== "id")[1];
  const CODE_LEN = sample.length;
  const chunks = [];
  for (let i = 0; i < bits.length; i += CODE_LEN) chunks.push(bits.slice(i, i + CODE_LEN));
  const groups = chunks.filter(c => c !== sepSym && c !== lineSym);
  let key = "";
  if (groups.length > 0) {
    const first = groups[0];
    const third = groups[2] !== undefined ? groups[2] : groups[groups.length - 1];
    const last  = groups[groups.length - 1];
    key = first.slice(-1) + third.slice(-1) + last.slice(-1);
  }
  return { key };
}
(async function main() {
  const root = document.getElementById("root");
  try {
    state.ids = await loadV();
  } catch (e) {
    root.textContent = "Ошибка загрузки v.json: " + e.message;
    return;
  }
  render(root);
})();