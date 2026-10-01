const state = { ids: [], ic: null, revIC: null, encCache: {} };
async function loadV() {
  const r = await fetch("v.json");
  if (!r.ok) throw new Error("Не найден v.json");
  return r.json();
}
async function loadIC() {
  const r = await fetch("ic.json");
  if (!r.ok) throw new Error("Не найден ic.json");
  return r.json();
}
async function loadEnc(id) {
  if (state.encCache[id]) return state.encCache[id];
  const r = await fetch(id + ".json");
  if (!r.ok) throw new Error("Не найден " + id + ".json");
  const j = await r.json();
  state.encCache[id] = j;
  return j;
}
function buildRevIC(ic) {
  const rev = {};
  for (const [sym, num] of Object.entries(ic)) rev[num] = sym;
  return rev;
}
function buildReverse(enc) {
  const rev = {};
  for (const [k, code] of Object.entries(enc)) {
    if (k === "id") continue;
    rev[code] = k;
  }
  return rev;
}
function digitsToNums(str) {
  return str.replace(/\s+/g, "").split("").map((d) => d);
}
function encode(input, enc) {
  const sep = enc["_"];
  const nums = digitsToNums(input);
  const codes = [];
  for (const n of nums) {
    if (!/^[0-9]$/.test(n)) throw new Error(`Недопустимый символ "${n}", нужны только цифры`);
    const code = enc[n];
    if (code === undefined) throw new Error(`Цифра "${n}" отсутствует в кодировке "${enc.id}"`);
    codes.push(code);
  }
  const encoded = codes.join(sep);
  let key = "";
  if (codes.length > 0) {
    const first = codes[0];
    const third = codes[2] !== undefined ? codes[2] : codes[codes.length - 1];
    const last = codes[codes.length - 1];
    key = first.slice(-1) + third.slice(-1) + last.slice(-1);
  }
  return { encoded, key };
}
function decode(bits, enc) {
  const rev = buildReverse(enc);
  const sep = enc["_"];
  const sample = Object.entries(enc).find(([k]) => k !== "id")[1];
  const LEN = sample.length;
  const chunks = [];
  for (let i = 0; i < bits.length; i += LEN) chunks.push(bits.slice(i, i + LEN));
  let out = "";
  for (const c of chunks) {
    if (c === sep) continue;
    const n = rev[c];
    if (n === undefined) throw new Error("Неизвестный код: " + c);
    if (!/^[0-9]$/.test(n)) continue;
    out += n;
  }
  return out;
}
function keyFromBits(bits, enc) {
  const sep = enc["_"];
  const sample = Object.entries(enc).find(([k]) => k !== "id")[1];
  const LEN = sample.length;
  const chunks = [];
  for (let i = 0; i < bits.length; i += LEN) chunks.push(bits.slice(i, i + LEN));
  const groups = chunks.filter((c) => c !== sep);
  let key = "";
  if (groups.length > 0) {
    const first = groups[0];
    const third = groups[2] !== undefined ? groups[2] : groups[groups.length - 1];
    const last = groups[groups.length - 1];
    key = first.slice(-1) + third.slice(-1) + last.slice(-1);
  }
  return { key };
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
    <div><label>Тип кодировки: <select id="encSel"></select></label></div>
    <h4>Зашифровать</h4>
    <textarea id="plain" rows="5" cols="50" placeholder="Число, например 234"></textarea><br>
    <button id="btnEnc">Зашифровать → .catcode</button>
    <div id="encMsg"></div>
    <hr>
    <h4>Расшифровать</h4>
    <input type="file" id="fileIn" accept=".catcode">
    <div><label>Ключ: <input id="keyIn" type="text" maxlength="3" size="5"></label></div>
    <div><label>Тип кодировки: <select id="encSel2"></select></label></div>
    <button id="btnDec">Расшифровать</button>
    <pre id="decOut"></pre>
    <div id="decMsg"></div>
  `;
  const fill = (sel) => {
    sel.innerHTML = "";
    for (const id of state.ids) {
      const o = document.createElement("option");
      o.value = id;
      o.textContent = id;
      sel.appendChild(o);
    }
  };
  fill(root.querySelector("#encSel"));
  fill(root.querySelector("#encSel2"));
  root.querySelector("#btnEnc").onclick = async () => {
    const encId = root.querySelector("#encSel").value;
    const text = root.querySelector("#plain").value.trim();
    const msg = root.querySelector("#encMsg");
    msg.textContent = "";
    try {
      const enc = await loadEnc(encId);
      const { encoded, key } = encode(text, enc);
      const fname = "catcode_" + randomId() + ".catcode";
      download(fname, encoded);
      msg.innerHTML = "Файл: <b>" + fname + "</b><br>Ключ: <b>" + key + "</b>";
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
        msg.textContent = 'Неверный ключ. Ожидался "' + realKey + '", введён "' + keyIn + '".';
        return;
      }
      out.textContent = decode(bits, enc);
      msg.textContent = "OK";
    } catch (e) {
      msg.textContent = "Ошибка: " + e.message;
    }
  };
}

(async function main() {
  const root = document.getElementById("root");
  try {
    state.ic = await loadIC();
    state.revIC = buildRevIC(state.ic);
    state.ids = await loadV();
  } catch (e) {
    root.textContent = "Ошибка загрузки: " + e.message;
    return;
  }
  render(root);
})();
