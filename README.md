# 🏋️ ZAMPA'S GYM Coach (versione di prova con ruoli)

Come ZAMPA'S GYM, ma con **un account coach** (allenatore) e **un account per ogni atleta**.

- **Coach:** vede e modifica tutto di tutti, sceglie l'atleta da un menu in alto, prepara allenamenti e schede, crea gli account degli atleti (pulsante **+ Atleta**) e gestisce l'elenco esercizi condiviso.
- **Atleta:** accede con la propria email e password, vede e modifica **solo i propri dati**. Non vede gli altri atleti.
- Elenco esercizi: quello del coach è condiviso con tutti (gli atleti lo usano nella tendina ▾), e ogni atleta ha anche il proprio elenco personale.
- Ogni esercizio ha più righe di serie, ciascuna con le proprie ripetizioni, kg bilanciere e kg manubri (pulsante **+ Serie**), e un campo **Note** libero (per esempio il colore delle molle del reformer). Gruppo muscolare **Core** disponibile.

Questa versione è **separata** dall'originale: repository GitHub diverso, progetto Firebase diverso, dati diversi.

## 1. Crea il nuovo progetto Firebase

1. Console Firebase → **Aggiungi progetto** (es. `zampas-gym-coach`). Google Analytics non serve.
2. Nella pagina del progetto clicca l'icona **`</>`** (Web), nickname `zampas-gym-coach`, **senza** Firebase Hosting → *Register app*.
3. Copia i valori di `firebaseConfig` e incollali nel file **`firebase-config.js`** al posto di `INCOLLA-QUI` (su GitHub: apri il file, matita ✏️, incolla, *Commit changes*). Oppure mandameli e li inserisco io.

## 2. Accesso (Authentication)

1. **Authentication → Get started → Sign-in method → Email/Password → abilita**.
2. Scheda **Users → Add user**: crea l'account del **coach** (la tua email e una password).
3. Nella tabella degli utenti copia il **User UID** del coach (una stringa lunga di lettere e numeri).

## 3. Database (Firestore)

1. **Databases & Storage → Firestore → Create database** (edizione Standard, posizione europea, **production mode**).
2. Scheda **Data → Start collection** → ID raccolta: `admins` → *Next*:
   - **Document ID**: incolla il **User UID del coach**.
   - Aggiungi un campo qualsiasi, per esempio `coach` (tipo boolean) = `true`. → *Save*.
   Questo documento è ciò che fa riconoscere il coach: gli atleti non possono crearlo né modificarlo.
3. Scheda **Rules**: sostituisci tutto con il testo qui sotto e premi **Publish**.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function signedIn() { return request.auth != null; }
    function isAdmin() {
      return signedIn() && exists(/databases/$(database)/documents/admins/$(request.auth.uid));
    }

    // chi è coach: ognuno può leggere solo il proprio documento, nessuno può scriverlo dall'app
    match /admins/{id} {
      allow read: if signedIn() && request.auth.uid == id;
      allow write: if false;
    }

    // schede anagrafiche: il coach vede e gestisce tutte, l'atleta solo la propria
    match /profiles/{id} {
      allow read: if isAdmin() || (signedIn() && request.auth.uid == id);
      allow create, update: if isAdmin() ||
        (signedIn() && request.auth.uid == id && request.resource.data.keys().hasOnly(['name', 'email']));
      allow delete: if isAdmin();
    }

    // allenamenti e schede di ogni atleta
    match /users/{uid}/{document=**} {
      allow read, write: if isAdmin() || (signedIn() && request.auth.uid == uid);
    }

    // elenco esercizi condiviso: tutti gli utenti connessi leggono, solo il coach scrive
    match /config/{id} {
      allow read: if signedIn();
      allow write: if isAdmin();
    }
  }
}
```

## 4. Pubblica su GitHub

1. Crea un **nuovo repository** (es. `zampas-gym-coach`) e carica **tutti** i file di questa cartella nella radice.
2. **Settings → Pages** → *Deploy from a branch* → `main` → `/ (root)` → Save.
3. L'app sarà su `https://TUO-UTENTE.github.io/zampas-gym-coach/`. Su Android/Chrome si installa dal pulsante **⬇ Installa** o dal menu ⋮; su iPhone/iPad da Safari con *Condividi → Aggiungi a schermata Home*.

## 5. Primo utilizzo

1. Apri l'app ed entra con l'account del coach (in alto compare 🎓 Coach).
2. Premi **+ Atleta**: scrivi nome, email e una password iniziale. L'account viene creato e l'atleta compare nel menu in alto.
3. Comunica all'atleta email e password. Se la dimentica, nella schermata di accesso c'è **Password dimenticata?**: riceve un'email per sceglierne una nuova.
4. Scegli un atleta dal menu in alto e compila il suo allenamento o la sua scheda: lui lo vedrà subito sul suo telefono.

## Cose da sapere

- Un account creato direttamente in *Authentication → Users* compare nell'elenco del coach solo dopo il primo accesso dell'atleta.
- Il nome dell'atleta è quello scritto alla creazione (o la parte prima della @ dell'email, per gli account creati dalla console). Per cambiarlo, modifica il campo `name` del suo documento in *Firestore → profiles*.
- Per eliminare un atleta: *Authentication → Users* (cancella l'utente) e, se vuoi, *Firestore* (cancella i suoi documenti in `profiles` e `users`).
- L'app resta utilizzabile senza internet e sincronizza quando torna la connessione.
- Se vedi `unauthorized-domain`, aggiungi `TUO-UTENTE.github.io` in *Authentication → Settings → Authorized domains*.
- Il pulsante ☁ in alto mostra lo stato: `☁ ✓` sincronizzato, `☁ …` salvataggio, `☁ offline`, `☁ !` errore (tocca o passa sopra per i dettagli). Toccandolo da connessi puoi uscire dall'account.
- Il pulsante 💾 scarica un file di backup dei dati dell'atleta selezionato.
