// ZAMPA'S GYM Coach - accesso (Firebase Authentication) e dati online (Firestore) con due ruoli:
//  - coach: vede e modifica i dati di tutti gli atleti, crea gli atleti, gestisce l'elenco esercizi condiviso
//  - atleta: vede e modifica solo i propri dati
// I permessi veri sono nelle regole di sicurezza di Firestore (vedi README): questo file è solo l'interfaccia.

const cfg = window.FIREBASE_CONFIG;
const BASE = 'https://www.gstatic.com/firebasejs/10.12.2/';
const $ = id => document.getElementById(id);
const btn = $('cl'), ov = $('lg'), who = $('who'), addBtn = $('addath'), na = $('na');
const setState = (t, tip) => { btn.textContent = t; btn.title = tip || 'Sincronizzazione online'; };
window.ATHS = []; window.IS_ADMIN = false;
window.cloud = { mark() {}, select() {}, pushAll() {} };

async function main() {
  if (!cfg || !cfg.apiKey || /INCOLLA/i.test(cfg.apiKey)) {
    setState('☁ config', 'Manca la configurazione Firebase');
    $('lge').textContent = 'Configurazione Firebase mancante: apri il file firebase-config.js e incolla i dati del tuo progetto.';
    ov.hidden = false; return;
  }
  let A, Au, F;
  try {
    [A, Au, F] = await Promise.all([
      import(BASE + 'firebase-app.js'),
      import(BASE + 'firebase-auth.js'),
      import(BASE + 'firebase-firestore.js')
    ]);
  } catch (e) {
    setState('☁ ✕', 'Sincronizzazione non disponibile (nessuna connessione?)');
    $('lge').textContent = 'Impossibile caricare Firebase: controlla la connessione.'; ov.hidden = false; return;
  }

  const app = A.initializeApp(cfg), auth = Au.getAuth(app);
  let fs;
  try { fs = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) }); }
  catch (e) { fs = F.getFirestore(app); }

  const META = { includeMetadataChanges: true };
  let uid = null, admin = false, unsubs = [], aUnsubs = [], dirty = new Map(), timer = 0;
  let pending = false, warned = false, lastLib = '[]', selectAfter = null, lastAths = '';
  const enc = JSON.stringify;
  const clean = v => JSON.parse(JSON.stringify(v));
  const key = (t, a, x) => enc([t, a, String(x)]);
  const colA = (a, n) => F.collection(fs, 'users', a, n);
  const libRef = () => admin ? F.doc(fs, 'config', 'lib') : F.doc(fs, 'users', uid, 'meta', 'lib');
  const sched = () => { clearTimeout(timer); timer = setTimeout(flush, 900); setState('☁ …', 'Salvataggio in corso…'); };

  // ---- scrittura (con ritardo, per non inviare ogni tasto premuto) ----
  window.cloud.mark = function () {
    if (!uid) return;
    if (st.ath && st.ath in db.athletes) dirty.set(key(st.view === 'plan' ? 'p' : 'd', st.ath, st.view === 'plan' ? st.pd : st.date), 1);
    if (enc(db.lib || []) !== lastLib) dirty.set('l', 1);
    if (dirty.size) sched();
  };

  async function flush() {
    timer = 0;
    if (!uid || !dirty.size) return;
    const keys = [...dirty.keys()]; dirty.clear();
    const batches = []; let b = F.writeBatch(fs), n = 0;
    const add = fn => { fn(b); if (++n >= 400) { batches.push(b); b = F.writeBatch(fs); n = 0; } };
    keys.forEach(k => {
      if (k === 'l') { add(x => x.set(libRef(), { lib: clean(db.lib || []) })); return; }
      const [t, a, v] = JSON.parse(k);
      if (!(a in db.athletes)) return;             // atleta non più caricato: non si tocca niente
      const g = t === 'd' ? (db.athletes[a] || {})[v] : ((db.plans || {})[a] || {})[v];
      const r = F.doc(colA(a, t === 'd' ? 'days' : 'plans'), String(v));
      add(x => g && g.length
        ? x.set(r, t === 'd' ? { date: v, groups: clean(g) } : { wd: Number(v), groups: clean(g) })
        : x.delete(r));
    });
    if (n) batches.push(b);
    try {
      for (const x of batches) await x.commit();
      lastLib = enc(db.lib || []);
      if (!dirty.size) setState('☁ ✓', 'Sincronizzato');
    } catch (e) {
      keys.forEach(k => dirty.set(k, 1));
      setState('☁ !', 'Errore di salvataggio: ' + (e.code || e.message));
    }
  }

  // ---- lettura (aggiornamenti in tempo reale) ----
  function refresh() {
    const a = document.activeElement;
    if (a && /INPUT|TEXTAREA/.test(a.tagName)) { pending = true; return; }
    render();
  }
  document.addEventListener('focusout', () => {
    if (!pending) return;
    setTimeout(() => {
      const a = document.activeElement;
      if (pending && !(a && /INPUT|TEXTAREA/.test(a.tagName))) { pending = false; refresh(); }
    }, 300);
  });
  function done(ch, fromCache) {
    if (ch) { refresh(); }
    if (!dirty.size) setState(fromCache ? '☁ offline' : '☁ ✓', fromCache ? 'Offline: i dati si sincronizzeranno al ritorno della connessione' : 'Sincronizzato');
  }
  function onErr(e) {
    setState('☁ !', 'Errore: ' + (e.code || e.message));
    if (e.code === 'permission-denied' && !warned) { warned = true; alert('Firestore ha negato l\'accesso: controlla di aver incollato le regole di sicurezza e di aver creato il documento del coach.'); }
  }

  function applyDays(id, snap) {
    if (st.ath !== id) return;
    const o = db.athletes[id] || (db.athletes[id] = {}); let ch = false;
    snap.docChanges().forEach(c => {
      if (c.doc.metadata.hasPendingWrites) return;
      const k = c.doc.id, d = c.doc.data();
      if (c.type === 'removed') { if (o[k]) { delete o[k]; ch = true; } }
      else if (enc(o[k]) !== enc(d.groups)) { o[k] = d.groups; ch = true; }
    });
    done(ch, snap.metadata.fromCache);
  }
  function applyPlans(id, snap) {
    if (st.ath !== id) return;
    const o = db.plans[id] || (db.plans[id] = {}); let ch = false;
    snap.docChanges().forEach(c => {
      if (c.doc.metadata.hasPendingWrites) return;
      const k = c.doc.id, d = c.doc.data();
      if (c.type === 'removed') { if (o[k]) { delete o[k]; ch = true; } }
      else if (enc(o[k]) !== enc(d.groups)) { o[k] = d.groups; ch = true; }
    });
    done(ch, snap.metadata.fromCache);
  }

  // ---- scelta dell'atleta (il coach) ----
  function select(id) {
    if (dirty.size) { clearTimeout(timer); flush(); }   // salva subito le modifiche dell'atleta precedente
    aUnsubs.forEach(f => f()); aUnsubs = [];
    st.ath = id || '';
    db.athletes = {}; db.plans = {};
    if (id) {
      db.athletes[id] = {}; db.plans[id] = {};
      try { localStorage.setItem('gymcoach_last_' + uid, id); } catch (e) {}
      aUnsubs.push(
        F.onSnapshot(colA(id, 'days'), META, s => applyDays(id, s), onErr),
        F.onSnapshot(colA(id, 'plans'), META, s => applyPlans(id, s), onErr)
      );
    }
    render();
  }
  window.cloud.select = select;

  function setAths(list) {
    list.sort((a, b) => a.name.localeCompare(b.name, 'it'));
    const sig = enc(list);
    window.ATHS = list;
    if (selectAfter && list.some(x => x.id === selectAfter)) { const s = selectAfter; selectAfter = null; lastAths = sig; select(s); return; }
    if (!list.some(x => x.id === st.ath)) {
      let last = ''; try { last = localStorage.getItem('gymcoach_last_' + uid) || ''; } catch (e) {}
      lastAths = sig;
      select(list.some(x => x.id === last) ? last : (list[0] ? list[0].id : ''));
    } else if (sig !== lastAths) { lastAths = sig; refresh(); }
  }

  // ---- elenco esercizi: condiviso (scrive solo il coach) + personale dell'atleta ----
  function listenLib() {
    const handler = (target) => s => {
      if (s.metadata.hasPendingWrites || dirty.has('l')) return;
      const r = s.exists() ? (s.data().lib || []) : [];
      if (enc(r) !== enc(db[target] || [])) { db[target] = r; refresh(); }
      if (target === 'lib') lastLib = enc(db.lib || []);
    };
    unsubs.push(F.onSnapshot(F.doc(fs, 'config', 'lib'), META, handler(admin ? 'lib' : 'shared'), onErr));
    if (!admin) unsubs.push(F.onSnapshot(F.doc(fs, 'users', uid, 'meta', 'lib'), META, handler('lib'), onErr));
  }

  // ---- ruolo e profilo ----
  async function checkAdmin() {
    const ck = 'gymcoach_admin_' + uid;
    try {
      const s = await F.getDoc(F.doc(fs, 'admins', uid)), v = s.exists();
      try { localStorage.setItem(ck, v ? '1' : '0'); } catch (e) {}
      return v;
    } catch (e) { try { return localStorage.getItem(ck) === '1'; } catch (e2) { return false; } }
  }
  async function ensureProfile(u) {
    const ref = F.doc(fs, 'profiles', u.uid), dflt = { name: (u.email || 'atleta').split('@')[0], email: u.email || '' };
    try {
      const s = await F.getDoc(ref);
      if (s.exists()) return s.data();
      await F.setDoc(ref, dflt); return dflt;
    } catch (e) { return dflt; }
  }
  function resetData() {
    db.athletes = {}; db.plans = {}; db.lib = []; db.shared = []; st.ath = ''; lastLib = '[]'; lastAths = '';
    window.ATHS = [];
  }

  Au.onAuthStateChanged(auth, async u => {
    unsubs.forEach(f => f()); unsubs = []; aUnsubs.forEach(f => f()); aUnsubs = [];
    dirty.clear(); clearTimeout(timer); resetData();
    if (!u) {
      uid = null; admin = false; window.IS_ADMIN = false; who.textContent = ''; addBtn.hidden = true;
      setState('☁ Accedi', 'Non connesso: tocca per accedere'); ov.hidden = false; render(); return;
    }
    uid = u.uid; ov.hidden = true; setState('☁ …', 'Connessione…');
    admin = await checkAdmin(); window.IS_ADMIN = admin; addBtn.hidden = !admin;
    const prof = await ensureProfile(u);
    who.textContent = admin ? '🎓 Coach' : '👤 ' + (prof.name || '');
    listenLib();
    if (admin) {
      unsubs.push(F.onSnapshot(F.collection(fs, 'profiles'), META, s => {
        setAths(s.docs.map(d => ({ id: d.id, name: d.data().name || d.data().email || d.id })));
        done(false, s.metadata.fromCache);
      }, onErr));
    } else {
      window.ATHS = [{ id: uid, name: prof.name || '' }];
      select(uid);
    }
  });

  // ---- schermata di accesso ----
  const msg = e => {
    const c = e.code || '';
    return /invalid-credential|wrong-password|user-not-found/.test(c) ? 'Email o password non corrette'
      : /invalid-email/.test(c) ? 'Email non valida'
      : /email-already-in-use/.test(c) ? 'Questa email è già registrata'
      : /weak-password/.test(c) ? 'Password troppo corta (almeno 6 caratteri)'
      : /network/.test(c) ? 'Nessuna connessione'
      : /too-many/.test(c) ? 'Troppi tentativi, riprova tra poco'
      : 'Errore: ' + (c || e.message);
  };
  $('lgf').onsubmit = async ev => {
    ev.preventDefault(); $('lge').textContent = '';
    try { await Au.signInWithEmailAndPassword(auth, $('lgm').value.trim(), $('lgp').value); $('lgp').value = ''; }
    catch (e) { $('lge').textContent = msg(e); }
  };
  $('lgr').onclick = async () => {
    const m = $('lgm').value.trim();
    if (!m) { $('lge').textContent = 'Scrivi prima la tua email'; return; }
    try { await Au.sendPasswordResetEmail(auth, m); $('lge').textContent = 'Ti ho inviato un\'email per reimpostare la password (controlla anche lo spam).'; }
    catch (e) { $('lge').textContent = msg(e); }
  };
  btn.onclick = () => {
    if (uid) { if (confirm('Uscire dall\'account? I dati restano salvati online.')) Au.signOut(auth); }
    else ov.hidden = false;
  };

  // ---- nuovo atleta (solo coach) ----
  addBtn.onclick = () => { $('nae2').textContent = ''; na.hidden = false; };
  $('nax').onclick = () => { na.hidden = true; };
  $('naf').onsubmit = async ev => {
    ev.preventDefault();
    const er = $('nae2'); er.textContent = '';
    const name = $('nan').value.trim(), email = $('nae').value.trim(), pw = $('nap').value;
    if (!name) { er.textContent = 'Scrivi il nome'; return; }
    try {
      // un'app Firebase "secondaria" crea l'account senza far uscire il coach
      const sapp = A.getApps().find(x => x.name === 'sec') || A.initializeApp(cfg, 'sec'), sauth = Au.getAuth(sapp);
      const cr = await Au.createUserWithEmailAndPassword(sauth, email, pw), nid = cr.user.uid;
      await Au.signOut(sauth);
      await F.setDoc(F.doc(fs, 'profiles', nid), { name, email });
      selectAfter = nid; na.hidden = true;
      ['nan', 'nae', 'nap'].forEach(i => { $(i).value = ''; });
    } catch (e) { er.textContent = msg(e); }
  };
}
main();
