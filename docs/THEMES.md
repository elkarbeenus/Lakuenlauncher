# Eigene Themes

Ein Theme ist eine kleine JSON-Datei. Du bindest sie unter **Einstellungen → Darstellung → Theme importieren** ein. Importierte Themes liegen danach im Theme-Ordner (`~/.local/share/de.lesina.lakuenlauncher/themes/`) und erscheinen neben den eingebauten Themes.

Am einfachsten startest du mit **„Vorlage speichern“**: Das speichert das aktuell gewählte Theme als Datei, die du nur noch anpassen musst.

## Aufbau

```json
{
  "name": "Sakura Neon",
  "author": "Dein Name",
  "type": "dark",
  "colors": {
    "bg": "#0f0b1a",
    "bg2": "#0a0713",
    "surface": "#1a1330",
    "surface2": "#251b42",
    "border": "#33265a",
    "text": "#fbf3ff",
    "muted": "#b3a3d1",
    "accent": "#ff4fa3",
    "accent2": "#4fe3ff"
  }
}
```

| Feld | Bedeutung |
|---|---|
| `name` | Anzeigename (Pflicht) |
| `author` | optional |
| `type` | `dark` oder `light` – bestimmt u. a. die Farbe von Eingabefeldern und Scrollbalken |
| `colors.bg` | Hintergrund des Hauptbereichs |
| `colors.bg2` | Seitenleiste und tiefere Flächen |
| `colors.surface` | Karten, Panels, Buttons |
| `colors.surface2` | hervorgehobene Flächen (Hover, Balken-Hintergrund) |
| `colors.border` | Rahmen |
| `colors.text` | Haupttext |
| `colors.muted` | Nebentext |
| `colors.accent` | Akzent: Spielen-Button, Diagramme, Auswahl |
| `colors.accent2` | zweiter Akzent: Sammlungen, Tags |

Erlaubt sind Hex-Farben (`#rgb`, `#rrggbb`, `#rrggbbaa`) sowie `rgb()`/`rgba()`/`hsl()`. Fehlende Farben werden vom passenden eingebauten Theme übernommen. Die Textfarbe auf dem Akzent wird automatisch hell oder dunkel gewählt.
