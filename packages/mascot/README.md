# @git-manager/mascot

La mascotte pieuvre de Git Manager, assemblée depuis un sprite sheet et animée
(ondulation par tentacule, clignement, regard qui suit le curseur).

- **Consommateurs** : `<git-mascot>` (Web Component, via `@git-manager/mascot/element`)
  pour la landing page ; `<OctopusMascot>` (wrapper React) pour l'app desktop.

## Sources & génération

| Chemin                 | Rôle                                                                                                                                                              |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `assets/sprites.png`   | Le sprite sheet (fond vert) — source éditable.                                                                                                                    |
| `assets/layout.json`   | Zones de découpe + placements/profondeur/pivots/animations — source éditable (export de l'éditeur Storybook, schéma v1 ci-dessous).                               |
| `scripts/generate.mjs` | Pipeline chroma-key → découpe → WebP base64.                                                                                                                      |
| `src/generated/`       | **Sortie committée** (`sprites.ts`, `layout.ts`), importée par `mascotArt.ts` et disponible telle quelle pour les apps — aucun outillage image dans leurs builds. |

```bash
pnpm --filter @git-manager/mascot generate   # régénère src/generated/ depuis assets/
```

À lancer quand `assets/` change, puis committer la sortie. Ne jamais éditer
`src/generated/` à la main. `mascotArt.ts` garde ce que la génération ne
couvre pas : le calcul du visage, l'assemblage du markup/CSS et le système
d'animation.

## Storybook (debug & rig)

```bash
pnpm --filter @git-manager/mascot storybook   # http://localhost:6007
```

| Story             | Usage                                                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Assembled**     | Le composant tel que livré ; comparaison côte-à-côte et **surimpression alignée** de la référence de marque (opacité réglable). |
| **Parts**         | Chaque sprite découpé dans son cadre (dimensions, hover zoom, fond clair/sombre/damier) pour vérifier la découpe.               |
| **Rig debugger**  | Les couches dans l'ordre de peinture : survoler isole une couche, cases pour masquer, pivots d'ondulation, référence en ghost.  |
| **Layout editor** | Charge `assets/sprites.png` + `assets/layout.json` au démarrage ; le workflow ci-dessous.                                       |

## Workflow « modifier le rig / nouveau sheet »

1. Ouvre le **Layout editor** (le sheet et le layout du package sont déjà
   chargés ; un autre PNG peut être chargé par-dessus).
2. Ajuste la pipette/seuil de chroma-key si besoin, « redécouper ».
3. Trace/ajuste les **zones** (id + rôle : tentacle/head/eye/eyelid/mouth).
4. Place les pièces sur la scène : glisser, échelle/rotation/flip/opacité,
   **avant/arrière** (ordre de peinture), pivot (« poser pivot » puis clic),
   paramètres d'animation (amplitude/durée/délai), à valider avec « animer »
   et la référence en surimpression.
5. « Copier l'export » → remplace `assets/layout.json` → `pnpm generate` →
   commit (sources + `src/generated/`).

Schéma du JSON (`version: 1`) :

```jsonc
{
  "sheet": {
    "name": "sprites.png",
    "width": 2048,
    "height": 2048,
    "chroma": { "color": "#0dd445", "t0": 55, "t1": 150 },
  },
  "stage": { "width": 1000, "height": 1000 },
  "zones": [{ "id": "t1", "role": "tentacle", "x": 4, "y": 705, "w": 506, "h": 473 }],
  // ordre du tableau = ordre de peinture (premier = tout derrière)
  "placements": [
    {
      "zone": "t1",
      "x": 170,
      "y": 90,
      "scale": 0.9,
      "rot": -12,
      "flip": false,
      "opacity": 1,
      "pivot": { "x": 420, "y": 440 }, // ancre d'ondulation (unités scène)
      "anim": { "amp": 3, "dur": 3.6, "delay": 0 }, // degrés / secondes / secondes
    },
  ],
}
```
