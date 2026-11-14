# Changelog

Alle Änderungen an LakuenLauncher. Versionierung: 0.1.0, 0.1.1, … bis zur Version 1.

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
