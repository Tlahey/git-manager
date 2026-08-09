# @git-manager/mascot

La mascotte pieuvre de Git Manager, assemblée depuis neuf pièces (une tête +
huit tentacules, un fichier par élément) et animée (ondulation par tentacule,
clignement, regard qui suit le curseur). La bouche fait partie du dessin de
la tête ; les yeux (blancs) aussi, mais sans pupille — un calque de
pupilles/paupière entièrement dessiné en code (mesuré sur le sprite de tête et
sur l'art de référence de la pupille) les rend mobiles — voir `behaviors.ts`
et la section « Yeux » de `mascotArt.ts`.

- **Consommateurs** : `<git-mascot>` (Web Component, via `@git-manager/mascot/element`)
  pour la landing page ; `<OctopusMascot>` (wrapper React) pour l'app desktop.

## Sources & génération

| Chemin                   | Rôle                                                                                                                                                                                                                   |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `assets/parts/*.png`     | Un fichier par élément (`head.png`, `t1.png`…`t8.png`), déjà transparent (pas de chroma-key) — sources éditables.                                                                                                      |
| `assets/parts/pupil.png` | Référence de la pupille (rayon, reflet, couleur) — **pas** consommée par `generate.mjs` (la pupille reste dessinée en code, voir `mascotArt.ts`) ; sert seulement à re-mesurer sa géométrie si cet asset est régénéré. |
| `assets/layout.json`     | Liste des pièces + placements/profondeur/pivots/animations — source éditable (export de l'éditeur Storybook, schéma v2 ci-dessous).                                                                                    |
| `scripts/generate.mjs`   | Pipeline découpe alpha → WebP base64.                                                                                                                                                                                  |
| `src/generated/`         | **Sortie committée** (`sprites.ts`, `layout.ts`), importée par `mascotArt.ts` et disponible telle quelle pour les apps — aucun outillage image dans leurs builds.                                                      |

```bash
pnpm --filter @git-manager/mascot generate   # régénère src/generated/ depuis assets/
```

À lancer quand `assets/` change, puis committer la sortie. Ne jamais éditer
`src/generated/` à la main. `mascotArt.ts` garde ce que la génération ne
couvre pas : le calcul du visage, l'assemblage du markup/CSS et le système
d'animation.

**Les fichiers de `assets/parts/` partagent un même repère.** Ce ne sont pas
des découpes arbitraires : chaque export garde la taille et la position de
son calque dans l'illustration mère (2048×2048), donc superposer les 9
fichiers tels quels (sans aucun repositionnement) reconstitue le poulpe
assemblé — c'est ce qui permet de calculer les `placements` de `layout.json`
une seule fois par une simple mise à l'échelle/translation globale (au lieu
d'un alignement manuel pièce par pièce). Un nouvel export doit garder cette
propriété : si l'outil de l'artiste recadre chaque calque à son propre
contenu (perdant le repère commun), les placements ci-dessous ne seront plus
valables et il faudra les réaligner (à la main, ou via l'éditeur Storybook).

## Storybook (debug & rig)

```bash
pnpm --filter @git-manager/mascot storybook   # http://localhost:6007
```

| Story             | Usage                                                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Assembled**     | Le composant tel que livré ; comparaison côte-à-côte et **surimpression alignée** de la référence de marque (opacité réglable). |
| **Parts**         | Chaque sprite découpé dans son cadre (dimensions, hover zoom, fond clair/sombre/damier) pour vérifier la découpe.               |
| **Rig debugger**  | Les couches dans l'ordre de peinture : survoler isole une couche, cases pour masquer, pivots d'ondulation, référence en ghost.  |
| **Layout editor** | Charge `assets/parts/*.png` + `assets/layout.json` au démarrage ; le workflow ci-dessous.                                       |

## Workflow « modifier le rig / nouvelles pièces »

1. Ouvre le **Layout editor** (les pièces et le layout du package sont déjà
   chargés ; chaque pièce peut être remplacée individuellement par un autre
   PNG). Un fichier chargé est automatiquement recadré à sa boîte englobante
   alpha (+ un peu de marge), comme le fera `generate.mjs` — pas d'étape de
   chroma-key, les sources sont déjà transparentes.
2. Pour une pièce pas encore sur la scène, « add » l'y place.
3. Place les pièces sur la scène : glisser, échelle/rotation/flip/opacité,
   **avant/arrière** (ordre de peinture), pivot (« poser pivot » puis clic),
   paramètres d'animation (amplitude/durée/délai), à valider avec « animer »
   et la référence en surimpression.
4. « Copier l'export » → remplace `assets/layout.json` → `pnpm generate` →
   commit (sources + `src/generated/`).

Si les nouvelles pièces partagent le même repère que l'illustration mère
(voir plus haut), les placements n'ont en général pas besoin d'être retouchés
à la main — c'est surtout un outil de vérification/ajustement fin.

Schéma du JSON (`version: 2`) :

```jsonc
{
  "parts": [{ "id": "t1", "role": "tentacle", "file": "t1.png" }],
  "stage": { "width": 1000, "height": 1000 },
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
