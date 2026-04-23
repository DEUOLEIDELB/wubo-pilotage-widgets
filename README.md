# Wubo Pilotage Widgets

Interface pour le doc Grist **Pilotage Wubo** (`cmTvfM75iZzS8eRsPAJdpy`). Mobile-first, dense, projection d'un coup d'oeil.

## Widgets

- **aujourdhui/** : 3 blocs du jour + dump integre. Raccourci iPhone recommande.
- **semaine/** : sprint complet en grille jours x tranches. Projection sans scroll.
- **dashboard/** : stats + objectifs + sujets a pousser.
- **dump/** : version longue de la capture avec historique.

## Utilisation dans Grist

Dans le doc Grist Pilotage Wubo : "Ajouter une section" > Custom > colle l'URL du widget.

```
https://deuoleidelb.github.io/wubo-pilotage-widgets/widgets/aujourdhui/
https://deuoleidelb.github.io/wubo-pilotage-widgets/widgets/semaine/
https://deuoleidelb.github.io/wubo-pilotage-widgets/widgets/dashboard/
https://deuoleidelb.github.io/wubo-pilotage-widgets/widgets/dump/
```

**Important** : dans le panneau de configuration a droite, regle "Access level" sur **Full document access**. Sans ca, les widgets affichent une erreur.

## Utilisation standalone iPhone (Raccourci ecran d'accueil)

Les widgets marchent aussi hors Grist via l'API REST Grist + cle stockee localement.

1. Sur ton ordi : https://grist.playwubo.com > clique ton avatar (haut droite) > Profile Settings > API Key > Create. Copie la cle.
2. Sur ton iPhone, ouvre dans Safari : `https://deuoleidelb.github.io/wubo-pilotage-widgets/widgets/aujourdhui/`
3. Un prompt te demande ta cle. Colle-la. Elle est stockee uniquement sur cet appareil (localStorage).
4. Bouton partage Safari > **Ajouter a l'ecran d'accueil**. Nomme "Pilotage" ou similaire.
5. L'icone sur ton home screen ouvre le widget en plein ecran (mode PWA, pas de barre Safari).

Idem pour `widgets/semaine/` si tu veux un 2e raccourci pour la projection du sprint.

## Reinitialiser la cle API

Console navigateur : `localStorage.removeItem('wubo_grist_api_key')`. Ou appelle `WuboGrist.resetApiKey()`.

## Structure

```
icon.svg                  # icone PWA
manifest.webmanifest      # manifest PWA
index.html                # landing page
lib/
  styles.css              # DA utilitaire commune
  dom.js                  # helpers DOM ($el, $clear, $replace)
  grist-api.js            # couche unifiee (iframe Grist OR REST standalone)
widgets/
  aujourdhui/             # vue du jour + dump integre
  semaine/                # projection sprint complet
  dashboard/              # objectifs + sujets
  dump/                   # capture longue avec historique
```

## DA

Utilitaire, dense, pas kit enfant. Fond neutre `#F4F4F1`, surfaces blanches bordees, un seul accent jaune `#FFDD0B` pour les actions principales, violet Wubo `#5914D0` pour le bloc courant uniquement. Typo systeme (San Francisco sur iOS, Segoe UI sur Windows). Pas d'ombres offset. Radius 4-6px max.

## Dev

Repo public pour GitHub Pages. Aucun secret cote serveur (la cle API Grist est stockee uniquement cote client).

Modifier > commit > push sur main. GitHub Pages redeploye en ~30 secondes.
