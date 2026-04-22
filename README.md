# Wubo Pilotage Widgets

Widgets personnalises pour le doc Grist **Pilotage Wubo** (doc_id `cmTvfM75iZzS8eRsPAJdpy`).

Chaque widget est une page HTML autonome qui se branche a une table Grist via le plugin API.

## Widgets disponibles

| Widget | Dossier | Table cible | Role |
|---|---|---|---|
| Aujourd'hui | `widgets/aujourdhui/` | Blocs_temps | Vue 3 blocs matin/aprem/soir du jour, avec taches liees |
| Dump notes | `widgets/dump/` | Dump_notes | Capture rapide de pensees, traces d'RDV, idees |
| Dashboard | `widgets/dashboard/` | Objectifs | Vue d'ensemble objectifs trimestre avec jauges progression |

## Hebergement

Trois options, a choisir selon tes preferences :

### Option A : GitHub Pages (repo public uniquement)
Rendre ce repo public puis activer GitHub Pages. URL : `https://<user>.github.io/wubo-pilotage-widgets/widgets/<nom>/`

### Option B : VPS Wubo + Traefik (repo prive ok)
Deployer sur le VPS via Traefik comme les autres services Wubo. URL : `https://pilotage-widgets.wubo.com/<nom>/`. Voir `wubo-vps` skill pour la procedure.

### Option C : Vercel (repo prive ok, gratuit)
Connecter le repo a Vercel, deploiement auto sur chaque push. URL : `https://wubo-pilotage-widgets.vercel.app/widgets/<nom>/`

Recommandation : **Option B** pour garder le prive + controle complet de la latence.

## Installation dans Grist

Dans le doc Grist "Pilotage Wubo", pour ajouter un widget :

1. Ouvrir la page souhaitee
2. Ajouter une nouvelle section > Custom
3. Coller l'URL du widget
4. Selectionner la table cible
5. Selectionner les colonnes si demande

## Convention DA

Toutes les styles respectent la DA Wubo :
- Palette : cream `#FAF5F2`, yellow `#FFDD0B`, purple `#5914D0`, pink `#D40272`
- Fonts : Outfit (titres) + Satoshi (body)
- Ombre signature : `4px 4px 0 <couleur>`
- Pas de tiret cadratin

Voir `lib/styles.css` pour la base commune.
