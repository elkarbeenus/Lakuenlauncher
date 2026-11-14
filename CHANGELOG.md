# Changelog

Alle Änderungen an LakuenLauncher. Versionierung: 0.1.0, 0.1.1, … bis zur Version 1.

## [0.1.2] – 2026-11-14

### Artwork
- **Bild direkt auf ein Spiel ziehen**: Bild aus dem Dateimanager auf eine Spielkarte (oder in die Detailseite) ziehen – die Karte leuchtet auf, nach einer kurzen Rückfrage (Cover vorausgewählt, alternativ Banner/Logo/Icon) wird es übernommen
- **Zuschneiden & Skalieren**: Bild im Rahmen verschieben und zoomen (Maus, Mausrad, Pfeiltasten), „Füllen“, „Einpassen“, „Zentrieren“, freie Flächen unscharf, dunkel oder transparent – Ergebnis passt exakt in den Kasten (Cover 600×900, Banner 1920×620, Icon 512×512, Logo 1000×400)
- Vorhandenes Artwork jederzeit neu zuschneiden (Knopf am Bild im Editor)
- **Artwork generieren**: einzigartige Cover, Banner und Icons aus dem Spielnamen in 7 Stilen (Wellen, Geometrie, Sakura-Nacht, Synthwave, Kosmos, Pixel, Aurora) – neu würfeln, Namen ein-/ausblenden; komplett lokal
- „Fehlende Cover generieren“ für die ganze Bibliothek (Einstellungen → Bibliothek oder Strg+K)

### Spielen
- **Frame Generation** über lsfg-vk (Lossless Scaling für Linux): pro Spiel Aus / x2 / x3 / x4, plus Leistungsmodus; Standard in den Einstellungen; wird automatisch als Startoption gesetzt
- Erkennung von lsfg-vk und Lossless Scaling in „Werkzeuge auf diesem System“
- **Spielstatus**: Will ich spielen, Spiele ich gerade, Pausiert, Durchgespielt, Abgebrochen – mit Filtern in der Bibliothek

### Updates
- **1-Klick-Update im Launcher**: Download, Prüfung per SHA-256, Austausch der AppImage und Neustart – ohne manuellen Download. Bibliothek, Artwork und Statistik bleiben erhalten
- Fortschrittsanzeige in der Seitenleiste und in den Einstellungen

## [0.1.1] – 2026-11-14

### Flüssiger & sparsamer
- Oberfläche spürbar flüssiger: keine teuren Glas-/Weichzeichner-Effekte mehr (backdrop-filter), Hintergrund-Licht ohne Dauer-Animation
- Weichgezeichnete Banner und Stimmungslicht werden einmal vorberechnet statt bei jedem Bild neu gefiltert
- Karten-Hover nur noch über Transform/Deckkraft (GPU-freundlich), kleinere Schatten
- Kein Neuabspielen der Einblend-Animationen beim Aktualisieren – nur noch beim Navigieren
- Große Bibliotheken: Karten außerhalb des Sichtbereichs werden nicht gezeichnet, Bilder werden asynchron dekodiert
- Suche reagiert entprellt, ohne bei jedem Tastendruck alles neu aufzubauen

### Ressourcenarm im Hintergrund
- Minimiert oder ohne Fokus pausiert der Launcher alle Animationen
- Live-Timer laufen nur, wenn wirklich ein Spiel läuft und das Fenster sichtbar ist
- Controller-Abfrage nur noch, wenn ein Controller verbunden ist und das Fenster den Fokus hat (vorher Dauerschleife)

### Neu in den Einstellungen (Allgemein → Leistung)
- **Leichter Modus**: alle dekorativen Effekte aus – ideal fürs Steam Deck im Akkubetrieb
- **Grafik-Modus „Schnell“**: volle GPU-Beschleunigung von WebKit (nach Neustart). Bleibt das Fenster schwarz, zurück auf „Kompatibel“

## [0.1.0] – 2026-11-14

Erste Version von **LakuenLauncher** – erstellt von Dominic Lesina x Claude. 🌸

### Bibliothek
- AppImages, Linux-Programme und Windows-Spiele (.exe) zentral verwalten und starten
- Hinzufügen per Dateiauswahl, **Drag & Drop** ins Fenster oder **Ordner-Scan** (mit Namensvorschlägen)
- **Beobachtete Ordner**: neue Spiele werden beim Start erkannt und vorgeschlagen
- Eigene **Spielnamen** und eigenes **Artwork** (Cover, Banner, Logo, Icon) wie bei Nicht-Steam-Spielen – Bilder per Drag & Drop in den Editor
- Automatisch erzeugte, farbige Cover für Spiele ohne Artwork
- Favoriten, eigene **Sammlungen**, Ausblenden, Raster- und Listenansicht, Sortierung und Suche
- „Weiterspielen“-Banner mit dem zuletzt gespielten Spiel

### Starten & Kompatibilität
- .exe-Dateien laufen über **Proton** – standardmäßig die neueste Version oder Proton Experimental
- Automatische Erkennung aller Proton-Versionen (Steam, GE-Proton, Flatpak-Steam, weitere Bibliotheken)
- Startmethoden: **umu-launcher** (falls installiert), Proton in der **Steam Linux Runtime** oder Proton direkt
- Eigener Wine-Prefix pro Spiel, optional eigener Prefix-Ordner
- Pro Spiel: Startargumente, Umgebungsvariablen, MangoHud, GameMode, FSR, Wrapper (z. B. gamescope), Skripte vor/nach dem Start
- Prefix-Werkzeuge: winecfg, winetricks, Registry, Explorer, Prefix zurücksetzen
- Startprotokoll pro Spiel zur Fehlersuche
- Desktop-/Startmenü-Verknüpfungen (auch für Steam als Nicht-Steam-Spiel nutzbar – die Spielzeit zählt trotzdem)

### Spielzeit & Statistik
- Spielzeit wird **nur** gezählt, wenn das Spiel über den Launcher gestartet wurde (inkl. aller Proton-Unterprozesse)
- Statistik-Seite: Gesamtzeit, Verlauf (7/30/90 Tage, 12 Monate), Aktivitätskalender, meistgespielte Spiele, Wochentage, Lieblingsuhrzeit, Serien
- Detailseite pro Spiel mit Diagramm und allen Sitzungen

### Oberfläche & Komfort
- Modernes Design mit 8 dunklen und 3 hellen Themes, frei wählbarer Akzentfarbe
- **Externe Themes** als JSON-Datei importieren (optional mit eigenem CSS), Vorlage zum Speichern
- **Tutorial** beim ersten Start, jederzeit erneut über die Einstellungen
- **Schnellsuche / Befehlspalette** mit Strg+K, viele Tastenkürzel, Rechtsklick-Menüs
- Controller-Steuerung (Steuerkreuz, A/B/X/Y, LB/RB)
- Live-Timer für laufende Spiele, Benachrichtigung nach jeder Sitzung
- Optionaler Blütenregen 🌸 und Stimmungslicht aus dem Artwork

### Updates, Daten & Privatsphäre
- Update-Prüfung über die GitHub-Releases mit Desktop-Benachrichtigung (abschaltbar)
- Keine Anmeldung, keine Telemetrie – alles bleibt lokal
- Export/Import der kompletten Bibliothek, tägliche automatische Sicherung (7 Tage)
