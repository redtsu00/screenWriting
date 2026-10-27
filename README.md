# Ciak — scrivi la tua sceneggiatura

Ciak è un'app per scrivere sceneggiature nel formato standard, annotare idee e scene e costruire il flow chart della storia.
Funziona nel browser, si installa su **Mac** e su **iPhone/iPad** come un'app vera, funziona anche offline e non richiede account: i copioni restano sul tuo dispositivo.

## Cosa fa

### Copione
Tutti gli elementi del formato sceneggiatura, impaginati automaticamente in Courier 12pt:

| Elemento | In inglese | Esempio |
|---|---|---|
| Scena | Scene Heading | `INT. VILLETTA - CUCINA - NOTTE` |
| Azione | Action | Cosa vediamo e sentiamo |
| Personaggio | Character | `FILIPPO` |
| Estensione | Extension | `(V.O.)` `(O.S.)` `(O.C.)` `(CONT'D)` |
| Parentetica | Parenthetical | `(al telefono)` |
| Dialogo | Dialogue | La battuta |
| Transizione | Transition | `CUT TO:` `FADE IN:` |
| Inquadratura | Shot | `POV DI FILIPPO` |
| Sotto-scena | Subheader | `CORRIDOIO` |
| Intercut | Intercut | `INTERCUT CONVERSAZIONE TELEFONICA` |
| Numeri di scena | Scene numbers | a sinistra e a destra (da attivare nelle impostazioni) |

- **Invio** passa da solo all'elemento giusto (dopo il Personaggio viene il Dialogo, dopo la Scena l'Azione…). Invio su una riga vuota cambia tipo.
- **Tab / ⇧Tab** cambiano il tipo della riga, **⌥1…⌥9** lo scelgono direttamente; la barra in alto (in basso su telefono) mostra il tipo attivo.
- Suggerimenti automatici: nomi dei personaggi (con l'alternanza di chi parla), `INT./EST.`, luoghi già usati, `GIORNO/NOTTE`, transizioni e inquadrature.
- Scrivi `int.` o `est.` e la riga diventa un'intestazione; scrivi `(` in un dialogo e diventa una parentetica.
- Barra laterale con l'elenco delle scene (trascinale per riordinarle) e dei personaggi con il numero di battute.
- Conteggio di pagine, minuti e parole. Annulla/Ripeti.

### Idee & Scene
Una bacheca con quattro colonne — **Idee, Scene, Personaggi, Note** — per scrivere le idee prima di scriverle nel copione. Le schede si colorano, si cercano e si riordinano trascinandole (anche da una colonna all'altra).
- "Importa scene dal copione" crea una scheda per ogni scena già scritta.
- Su una scheda scena, "Scrivi nel copione" aggiunge la scena in fondo al copione.
- I personaggi creati qui vengono suggeriti mentre scrivi.

### Flow chart
Le stesse schede diventano un diagramma della storia:
- trascina il pallino sotto una scheda fino a un'altra per collegarle (oppure tocca la scheda → **Collega**);
- tocca una freccia per darle un'etichetta (es. "se scende" / "se non scende") o invertirla;
- **Disponi** riordina automaticamente il diagramma, **Solo scene** nasconde idee e note;
- zoom con pizzico (telefono) o trackpad, trascina lo sfondo per spostarti.

### Esportazione
- **PDF / Stampa** in formato standard con frontespizio (A4 o US Letter).
- **Fountain** (`.fountain`) per Highland, WriterDuet, Slugline, Fade In…
- **Final Draft** (`.fdx`).
- **Backup del progetto** (`.json`) con copione, idee e flow chart.
- **Importa** backup `.json`, file Fountain, Final Draft o testo semplice.

## Metterla online (GitHub Pages)

L'app è fatta di soli file statici, non serve nessun server.

1. Su GitHub apri il repository → **Settings** → **Pages**.
2. In *Build and deployment* scegli **Source: Deploy from a branch**.
3. Seleziona il branch con questi file e la cartella **/ (root)**, poi **Save**.
4. Dopo un minuto l'app è su `https://redtsu00.github.io/screenWriting/`.

## Installarla

**iPhone / iPad** — apri l'indirizzo con Safari → pulsante Condividi → **Aggiungi alla schermata Home**.

**Mac** — Safari (macOS Sonoma o successivo): **File → Aggiungi al Dock**. Con Chrome o Edge: icona **Installa** nella barra degli indirizzi.

Una volta installata si apre nella sua finestra e funziona anche senza connessione.

## Spostare un copione tra Mac e iPhone

Ogni dispositivo salva i propri copioni (nel browser, in automatico). Per portarne uno dall'altra parte:
1. **Menu → Backup del progetto** e salvalo su iCloud Drive;
2. sull'altro dispositivo **Menu → Importa file…** e scegli **Sostituisci** per aggiornare la versione che c'è già.

Fai un backup ogni tanto: se cancelli i dati del browser, i copioni salvati lì si perdono.

## Provarla sul computer

```sh
python3 -m http.server 8000
```
poi apri <http://localhost:8000>.

## Struttura

```
index.html            pagina dell'app
css/app.css           stile (chiaro/scuro, Mac e telefono)
css/print.css         impaginazione del PDF
js/util.js            funzioni di supporto
js/store.js           salvataggio dei progetti e progetto di esempio
js/formats.js         Fountain e Final Draft
js/editor.js          editor del copione
js/cards.js           schede e collegamenti
js/ideas.js           bacheca Idee & Scene
js/flow.js            flow chart
js/sortable.js        trascinamento per riordinare
js/app.js             navigazione, menu, esportazione
sw.js                 funzionamento offline
fonts/                Courier Prime (SIL Open Font License, vedi fonts/OFL.txt)
```
