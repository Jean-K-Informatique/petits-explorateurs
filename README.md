# Petits Explorateurs

Jeu éducatif tactile en français, pour téléphone, tablette et ordinateur. La PWA s’installe depuis un navigateur compatible et met en cache ses photos et ses voix afin de fonctionner hors ligne après son premier chargement.

## Les mondes et les jeux

72 animaux photographiés, répartis dans six mondes de douze animaux : **la savane, la forêt, la ferme, l’océan, le pays des glaces et la jungle**. Sur l’accueil, l’enfant choisit un jeu, puis le monde à explorer ; chaque monde affiche combien d’animaux il a déjà découverts.

- **Les bulles** : Lila demande un animal (« Où est le zèbre ? »). Les bulles flottent dans tout l’espace libre, sans se chevaucher ; trois au départ, puis jusqu’à six quand l’enfant enchaîne les réussites.
  - Bonne réponse : la bulle éclate et l’animal s’affiche en grand, avec son nom et une anecdote racontée par Lila. L’enfant passe à la suite quand il le souhaite.
  - Erreur : la bulle touchée montre son nom et Lila le dit (« Non, ça, c’est un hippopotame. »), puis donne un indice sur l’animal cherché (« Le crocodile est vert, avec une longue queue. »). Deuxième erreur : un autre indice. Troisième : la bonne bulle se met à briller.
  - Les couleurs et les chiffres restent disponibles depuis l’écran des mondes, avec le même principe (« Ça, c’est la bulle rouge. »).
- **Le puzzle** : la photo de l’animal à reconstituer, modèle visible, quatre puis six pièces. L’animal terminé se dévoile avec son anecdote.
- **Les paires** : retrouver les photos identiques ; une paire trouvée peut être touchée pour réentendre son anecdote. Le nombre de paires s’adapte aux réussites.

Chaque partie propose d’abord les animaux que l’enfant n’a pas encore rencontrés. L’écran de fin montre les animaux découverts ; on peut les toucher pour les réécouter.

## Lancer

Depuis ce dossier, exécuter `python3 -m http.server 4173`, puis ouvrir <http://localhost:4173>. La première visite télécharge et met en cache les photos, les voix et le moteur (une vingtaine de mégaoctets). Pour une installation iOS/Android en dehors de localhost, servir le dossier en HTTPS, puis utiliser « Ajouter à l’écran d’accueil ».

Les parties se jouent à l’horizontale. Sur mobile, tourner l’appareil en paysage.

## Contenu

- `content/animals.json` : les mondes et leurs animaux. Pour chaque animal : nom affiché, formes avec article (`the` : « le zèbre », `a` : « un zèbre »), deux indices visuels et une anecdote. Les modèles de phrases communs (« Où est {the} ? »…) sont dans `lines`.
- `assets/animals/<id>.webp` : photo carrée 768 px de chaque animal ; `assets/themes/<monde>.webp` : paysage de fond.
- `content/credits.json` : auteur et licence de chaque photo (Wikimedia Commons, licences libres CC0, CC BY ou CC BY‑SA), affichés dans les réglages parents.
- `tools/crop-photo.py` : recadre une photo téléchargée au bon format (`animal` ou `background`).

Les anciennes illustrations dessinées (avant le passage aux photos) sont rangées dans `archive/illustrations/` ; le jeu ne les utilise plus.

Pour ajouter un animal : ajouter sa fiche dans `content/animals.json`, sa photo recadrée et son crédit, puis générer ses voix (voir ci-dessous).

## Voix française

La voix de Lila est générée avec [VoiceStudio](https://github.com/debpalash/VoiceStudio) et son moteur par défaut OmniVoice (`k2-fsa/OmniVoice`), entièrement en local. Le timbre a été conçu une fois (« female, young adult, moderate pitch », graine 1) puis figé dans `tools/lila-reference.wav` avec sa transcription `tools/lila-reference.txt` : chaque réplique est clonée à partir de cette référence pour que Lila garde la même voix partout, avec un débit ralenti (`SPEED = 0.8` dans le générateur) pour rester calme et facile à suivre. VoiceStudio est sous licence AGPL‑3.0 ; le code OmniVoice est sous Apache‑2.0, mais ses poids pré-entraînés sont sous **CC‑BY‑NC** (usage non commercial, à cause de ses données d’entraînement). Ces voix conviennent donc à un usage personnel ; une commercialisation demanderait de les régénérer avec un moteur dont la licence le permet.

Les répliques viennent de `voice-lines.json` (phrases générales, couleurs, chiffres, prénoms) et de `content/animals.json` (dix répliques par animal, intro et conclusion de chaque monde), soit environ 800 clips. Les originaux WAV sont gardés dans `voice-masters/` ; le jeu lit des versions AAC compressées dans `assets/voice/`.

Avec l’application VoiceStudio ouverte (son serveur écoute sur `http://127.0.0.1:3900`) :

- `python3 tools/generate-voicestudio-voice.py --missing` génère les répliques qui manquent. `--prefix a/lion/` limite à un animal, `--only <clé>` à une réplique, `--seed` change la prise, `--encode-only` recompresse les originaux.
- `python3 tools/check-voice.py` fait transcrire chaque clip par la reconnaissance vocale de VoiceStudio et liste ceux dont les mots ne correspondent pas au texte attendu, à regénérer avec une autre graine.

Penser ensuite à incrémenter `CACHE_NAME` dans `sw.js` pour que les appareils récupèrent les nouveaux fichiers. `tools/voice-candidates/` contient la page d’écoute qui a servi à choisir la voix ; l’ancien générateur Kokoro (`tools/generate-kokoro-voice.py`) ne couvre que les phrases générales. Ces outils ne sont pas requis pour installer ou jouer.

## Prénoms des enfants

Le bouton « Qui joue ? » en haut de l’écran permet d’ajouter plusieurs enfants et de choisir celui qui joue. Le prénom apparaît dans les textes (accueil, félicitations), et chaque enfant garde sa propre progression sur l’appareil (animaux découverts, niveau du jeu de paires, meilleurs scores).

Comme les voix sont préparées à l’avance, Lila ne peut prononcer que les prénoms dont les clips ont été générés ; ils sont marqués 🔊 dans la liste. Pour un autre prénom, le jeu fonctionne normalement et Lila parle sans le dire. Pour ajouter un prénom à la voix :

1. Dans `voice-lines.json`, ajouter une entrée sous `"names"` : la clé est le prénom en minuscules sans accents ni espaces (tirets à la place), la valeur est le texte que Lila prononce (on peut l’écrire phonétiquement si la prononciation n’est pas bonne), par exemple `"leo": "Léo"`.
2. Avec VoiceStudio ouvert, lancer `python3 tools/generate-voicestudio-voice.py --name leo`. Les clips sont créés dans `assets/voice/names/leo/`.
3. Incrémenter `CACHE_NAME` dans `sw.js`.

Les répliques personnalisées sont listées sous `"named"`, avec `{name}` à la place du prénom.

## Code

`game.js` gère les écrans, les mondes, les parties et la progression. `game-engine.js` dessine les bulles (photos, placement sans chevauchement, éclatement, ambiance de chaque monde : neige, bulles, feuilles, lucioles). `puzzle-game.js` découpe la photo en pièces, gère le glisser-déposer et les indices. `voice.js` joue les répliques, seules ou enchaînées.
