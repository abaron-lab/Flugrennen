# ✈️ Flugrennen

Arcade-Flugzeugrennen im Splitscreen für 2 Spieler – gesteuert mit den Händen vor der Kamera
(MacBook-Webcam oder iPhone-Frontkamera). Läuft komplett im Browser, keine Installation nötig.

## Spielidee

- Zwei Spieler sitzen nebeneinander vor dem Bildschirm: **Spieler 1 links (blau)**, **Spieler 2 rechts (orange)**.
- Die Kamera erkennt die Hände (MediaPipe Hand Landmarker). Jeder hält seine Hände wie an ein Steuerhorn –
  unten im eigenen Bildschirm wird das Lenkrad mit den blau bzw. orange markierten Händen eingeblendet.
- **Lenkrad drehen** (eine Hand hoch, die andere runter) → nach links/rechts fliegen.
- **Beide Hände heben/senken** → steigen/sinken, ±20 m um die Reiseflughöhe von 150 m.
- Das Rennen beginnt auf der Startbahn, dauert **90 Sekunden** und die Flugzeuge sind von hinten zu sehen.
- Hindernisse: Bergspitzen, Hochhausspitzen, entgegenkommende Zeppeline, Heißluftballons und
  **Hochhäuser mit Loch, durch das man hindurchfliegen muss**.
- Jeder hat **5 Leben** (Punkte oben in der Ecke). Wer ohne Treffer fliegt, wird schneller.
  Am Ende gewinnt, wer am weitesten gekommen ist (bzw. wer nicht abgestürzt ist).
- Vor dem Rennen wählt jeder sein Flugzeug (Propeller, Jet, Doppeldecker) und die Farbe.
- Ohne Kamera spielbar mit Tastatur: Spieler 1 `W A S D`, Spieler 2 Pfeiltasten.

## Starten

Die Kamera funktioniert im Browser nur über `https://` oder `localhost`.

**Am Mac:**

```bash
cd Flugrennen
python3 -m http.server 8000
# dann http://localhost:8000 in Chrome oder Safari öffnen
```

**Auf dem iPhone:** Die Seite muss per HTTPS erreichbar sein, z. B. über GitHub Pages
(Repository → Settings → Pages → Branch auswählen) und dann in Safari öffnen. iPhone quer halten.

## Tipps für gute Erkennung

- Gutes Licht von vorne, ca. 1–2 m Abstand, beide Spieler vollständig mit Händen im Bild.
- Während der Startbahn-Phase merkt sich das Spiel eure normale Handhöhe (Kalibrierung).
  Das Rennen startet automatisch, sobald beide Spieler ihre Hände kurz ruhig halten – oder mit Leertaste/Tippen.
- Das kleine Kamerabild unten in der Mitte zeigt, welche Hände erkannt werden.

## Aufbau

| Datei | Inhalt |
|---|---|
| `index.html`, `style.css` | Menü, Ergebnisbildschirm, Kamera-Vorschau |
| `js/main.js` | Spielablauf, Physik, Eingabe |
| `js/hands.js` | Handerkennung und Umrechnung in Lenken/Steigen |
| `js/render.js` | Pseudo-3D-Grafik (Canvas 2D) und HUD |
| `js/track.js` | Streckengenerator und Kollisionen |
| `js/planes.js` | Flugzeugtypen, Farben, Zeichnen der Flugzeuge |
| `js/audio.js` | Motor- und Effektsounds (WebAudio) |
| `vendor/mediapipe`, `models/` | MediaPipe Tasks Vision 0.10.14 (Apache-2.0) und Handmodell, lokal eingebunden |
