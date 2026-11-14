# Changelog

Alle nennenswerten Änderungen am LakuenLauncher.

## [0.1.0] – 2026-11-14

Erste Version.

### Bibliothek
- AppImages, Windows-Spiele (.exe) und Linux-Programme hinzufügen – per Dateiauswahl, Drag & Drop oder Ordner-Scan
- Eigene Namen, Sammlungen, Favoriten, Notizen und Ausblenden
- Eigenes Artwork pro Spiel: Cover, Banner, Logo und Icon; automatisch erzeugte Cover als Platzhalter
- Raster- und Listenansicht, Sortierung, Filter, Bühne „Weiterspielen“

### Starten
- .exe über Proton Experimental oder die neueste Proton-Version (automatische Erkennung inkl. GE-Proton und weiterer Steam-Bibliotheken)
- umu-launcher-Unterstützung, eigener Wine-Prefix pro Spiel, winecfg und winetricks
- Startoptionen mit `%command%`, Umgebungsvariablen, Arbeitsordner, MangoHud, GameMode, FSR
- Skripte vor dem Start und nach dem Beenden, Startprotokoll pro Spiel
- Menü- und Desktop-Verknüpfungen, die über den Launcher starten

### Spielzeit und Statistik
- Spielzeit zählt nur bei Start über den Launcher (inklusive Proton-Unterprozessen)
- Statistik mit Verlauf, Aktivitätskalender, meistgespielten Spielen, Tageszeit und Serie

### Komfort
- Schnellsuche (Strg+K), Tastatursteuerung, 9 Themes (dunkel/hell/OLED), Akzentfarbe, externe Themes als JSON
- Einführung beim ersten Start, erneut abrufbar in den Einstellungen
- Update-Prüfung über GitHub-Releases mit Desktop-Benachrichtigung
- Sicherung exportieren und importieren
- Keine Anmeldung, keine Datensammlung – alles bleibt lokal
