# Sidetone realtime via Web Serial (protocollo privato v1)

Il browser riusa `sidetoneOn/Off`, lo stesso AudioContext e frequenza/volume del gioco.
F9 resta un test manuale. Il firmware non emula una tastiera USB.

## Protocollo

1200 baud, 8 bit, nessuna parita, 2 stop bit, nessun flow control.
Dopo l'apertura della porta attendere 2 secondi per l'eventuale reset Nano.

| Direzione | Byte hex | Significato |
| --- | --- | --- |
| Browser -> keyer | 00 02 | Host open WinKey; azzera sempre la modalita Arcade |
| Browser -> keyer | 0E 40 | Abilita paddle echo, come nel sito precedente |
| Browser -> keyer | 00 E1 | Attiva Morse Arcade v1, richiede host aperto |
| Keyer -> browser | 1E 1F | Conferma estensione v1, seguita dallo stato corrente |
| Keyer -> browser | 1C | KEY DOWN |
| Keyer -> browser | 1D | KEY UP |
| Browser -> keyer | 00 E0 | Disattiva estensione, senza risposta |
| Browser -> keyer | 00 03 | Host close WinKey; disattiva estensione |

E0/E1 sono comandi **privati di questo fork**, non uno standard K1EL: non usati
nel dispatcher K3NG esaminato (SO2R usa F0/FF). Il namespace va ricontrollato
negli aggiornamenti del firmware. Non inviare questa estensione a dispositivi
di produttori diversi senza verificarne il protocollo.

1C/1D sono controlli non stampabili: distinti dalle lettere ASCII (20-7E),
dalla velocita (80-BF) e dallo stato WinKey (C0-FF). Le risposte admin binarie
arbitrarie, ad esempio EEPROM/echo, NON possono essere intercalate con questa
sessione: la pagina invia soltanto open, paddle echo, estensione e velocita.
La conferma viene riconosciuta solo durante la negoziazione (1 secondo), anche
se divisa in letture USB diverse. Senza conferma restano disponibili le lettere.
Riferimenti: [WinKey3](https://k1elsystems.com/files/WK3_Datasheet_v1.3.pdf),
[guida interfaccia](https://k1elsystems.com/files/WinkeyInterfaceGuide.pdf).

Il firmware parte disattivato; reset, ogni nuovo host open e host close lo
disattivano. Non salva questa modalita in EEPROM. Un crash del browser puo
impedire il close: riaprire una sessione WinKey (00 02) o riavviare il keyer
prima di usarlo con un altro programma. Non ci sono eventi aggiuntivi nelle
sessioni WinKey normali che non inviano 00 E1.

## Installazione e flash

Usare il branch coordinato `morse-arcade-realtime` del repository
`iz1jft/k3ng_cw_keyer`. In Arduino IDE aprire `k3ng_keyer/k3ng_keyer.ino`,
abilitare SOLO `HARDWARE_OPENCWKEYER_MK2` in `keyer_hardware.h`, selezionare
Arduino Nano / ATmega328P (Old Bootloader), verificare e caricare sulla porta
del proprio OpenCW MK2. Chiudere browser e monitor seriale che occupano la porta.
Il profilo hardware generale del repository non viene cambiato automaticamente.

Compilazione equivalente con CLI (l'opzione seleziona MK2 senza editare il file):

```sh
arduino-cli compile --fqbn arduino:avr:nano:cpu=atmega328old --build-property compiler.cpp.extra_flags=-DHARDWARE_OPENCWKEYER_MK2 --libraries libraries --build-path build-mk2 k3ng_keyer
arduino-cli upload --fqbn arduino:avr:nano:cpu=atmega328old --port COM4 --input-dir build-mk2 k3ng_keyer
```

COM4 e la porta indicata per questa installazione; altrove va adattata.
Distribuire ENTRAMBE le pagine HTML e `arcade-serial.js` nella stessa cartella.
Aprire tramite HTTPS o localhost in un browser con Web Serial (Chrome/Edge).
F8 nella schermata iniziale o CONNETTI KEYER nel menu usano la stessa connessione.
Attendere `KEYER: SIDETONE REALTIME`; `SOLO LETTERE` indica mancata conferma.

## Test e limiti

Eseguire `node --test tests/serial.test.cjs` per parser, handshake frammentato,
filtri stato/velocita, routing attract/gioco, watchdog, scritture serializzate,
chiusura e caricamento delle due pagine. Questi sono test software con seriale
e audio simulati; non dimostrano la latenza fisica USB/audio.

Sul dispositivo, con uscita radio scollegata:

1. Premere/rilasciare F9: tono immediato, nessuna lettera.
2. Collegare COM4; manipolare E, T, A, SOS: sentire ogni elemento mentre viene
   generato e ricevere le lettere soltanto quando il keyer le decodifica.
3. Ripetere nella schermata iniziale e in gioco, a diverse velocita e con squeeze.
4. Cambiare frequenza/volume; verificare che il sidetone segua le impostazioni.
5. Scollegare USB durante un tono, cambiare scheda e perdere il focus: il tono
   deve terminare. Ricollegare e verificare una nuova negoziazione.
6. Chiudere la pagina; aprire un client WinKey normale e verificare velocita,
   paddle echo e invio bufferizzato senza byte Arcade. Ripetere host open/close.

Watchdog browser: un KEY DOWN continuo viene limitato a 2 secondi; un nuovo
elemento riattiva il tono. Non adatto a un tono di accordo indefinito.
A 1200 baud ogni byte 8N2 occupa circa 9,17 ms, oltre a USB, code seriali e audio.
Non e una garanzia di latenza nulla: misurare sul PC reale. Il flusso CW resta
generato dal keyer; in caso di traffico seriale eccessivo la coda TX puo aggiungere
ritardo. Le risposte binarie diagnostiche non fanno parte della sessione Arcade.

Rollback: usare il firmware precedente e le pagine precedenti, oppure un client
WinKey normale. Non occorre cancellare EEPROM o modificare le memorie.

## Verifica eseguita il 25 settembre 2026

- Compilazione Nano ATmega328P Old Bootloader, profilo OpenCW MK2: 26.694 byte
  flash (86%), 882 byte RAM (43%). Caricamento riuscito su COM4.
- 16 scambi reali: versione 17 hex; nessun evento in modalita normale;
  enable -> 1E 1F 1D; down -> 1C; down ripetuto -> nessun byte; up -> 1D;
  disable, host open successivo e host close ripristinano il comportamento normale.
  Enable a host chiuso non emette byte. Traccia e script ripetibile nella PR firmware,
  cartella tests (script da eseguire solo a radio scollegata).
- La traccia del dispositivo reale e stata riprodotta, un byte per lettura,
  nel parser di produzione: sequenza audio UP/DOWN/UP corretta.
- Test automatici sito: 6 passati. Pagina verificata nel browser senza errori.
- Diego ha provato la pagina locale con il Keyer e confermato che audio realtime
  e lettere funzionano. Il buzzer fisico resta attivo secondo la configurazione
  del keyer: e indipendente dal sidetone browser, disattivabile dal menu locale.
- Latenza fisica non misurata con strumentazione; compatibilita con client WinKey
  terzi non provata in un'applicazione esterna. Verificata la sessione WinKey
  normale sul dispositivo attraverso i comandi sopra.
