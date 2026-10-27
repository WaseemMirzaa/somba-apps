# Entrepôts par zone — lancement RDC, entrepôt unique et multi-entrepôts

Version française de `WAREHOUSE-AREAS-USE-CASE.md` (la version anglaise fait foi pour le code).

Statut : cas d'usage et analyse des changements (2026-10-26). Rédigé par Opus 5.5. À réaliser par Sonnet 5.5.
Remplace la règle de l'« entrepôt le plus proche par distance » de `WAREHOUSE-SELLER-FLOWS-PLAN.md` §6.1 par la **couverture par zone**.
La distance n'est conservée que comme solution de repli et pour les frais de livraison. Les trois étapes (collecte → transfert → livraison) restent.

---

## 1. La géographie (RDC)

```
Pays          CD   République démocratique du Congo
└─ Province   26   p. ex. CD-KN Kinshasa (ville-province), CD-HK Haut-Katanga, CD-NK Nord-Kivu …
   └─ Ville   33 « villes » officielles, p. ex. Kinshasa, Lubumbashi, Likasi, Goma, Matadi …
      └─ District   Kinshasa uniquement : Funa, Lukunga, Mont-Amba, Tshangu
         └─ Commune 24 à Kinshasa (Gombe, Limete, Masina, Kimbanseke, Ngaliema …)
            └─ Quartier   facultatif, ajouté par les administrateurs au besoin (plusieurs centaines à Kinshasa)
```

- **Kinshasa est à la fois une province et une ville.** L'arborescence est : province CD-KN → ville de Kinshasa →
  4 districts → 24 communes. Les autres villes démarrent sans sous-niveaux, et les administrateurs peuvent ajouter des
  communes ou des quartiers à n'importe quelle ville par la suite.
- **Source des données :** `api/src/database/geo/drc.json` (vérifié lors de l'étape de recherche, avec ses sources dans
  `docs/DRC-GEOGRAPHY.md`).
- **Codes :** les provinces utilisent leur code **ISO 3166-2:CD** (`CD-KN`). Les villes, districts, communes et quartiers
  reçoivent des codes internes stables (`CD-KN-KIN`, `CD-KN-KIN-LUK`, `CD-KN-GOM` …).
- **Deux langues.** Chaque zone a un nom français (officiel) et un nom anglais. Google lui-même orthographie certaines
  provinces différemment selon la langue :

  | Langue | Exemples |
  |---|---|
  | Français | `Nord-Kivu`, `Kongo-Central`, `Équateur` |
  | Anglais | `North-Kivu`, `Kongo Central`, `Equator` |

  Chaque zone stocke donc les deux orthographes Google (`googleName` pour le français, `googleNameEn` pour l'anglais).
  Chaque écran s'affiche dans la langue de l'utilisateur, et une adresse géocodée dans l'une ou l'autre langue se
  résout vers la même zone. La version française de ce document est `WAREHOUSE-AREAS-USE-CASE.fr.md` (le présent
  fichier).
- **Noms tels que Google les écrit.** Chaque zone conserve :
  - `name` : le nom officiel ;
  - `googleName` : l'orthographe exacte renvoyée par Google Geocoding ;
  - `aliases` : les autres orthographes saisies par les utilisateurs, servant à la correspondance.

  La correspondance ignore les accents, la casse, les traits d'union, les apostrophes et les espaces.

  Ce que Google renvoie pour une adresse de Kinshasa :

  | Champ Google | Notre niveau | Exemple |
  |---|---|---|
  | `country` | pays | Democratic Republic of the Congo / République démocratique du Congo |
  | `administrative_area_level_1` | province | Kinshasa |
  | `locality` | ville | Kinshasa |
  | `sublocality_level_1` | commune | `Gombe`, `Limete`, `Ndjili` (et non « N'djili »), `Mont Ngafula` (sans trait d'union), `Kimbanseke` |

  Les districts n'apparaissent jamais dans les résultats Google. Le district d'une commune provient de notre propre
  arborescence.

## 2. Les entrepôts et les zones qu'ils couvrent

- **Un entrepôt se situe dans une zone (son emplacement),** généralement une ville ou une commune. Il a un repère sur la
  carte, une adresse, du personnel (opérateur / superviseur / responsable) et **ses propres livreurs**. Un livreur ou un
  membre du personnel appartient à un seul entrepôt.
- **Couverture :** l'administrateur affecte des zones à un entrepôt à n'importe quel niveau : une province entière, une
  ville, un district, une commune ou un quartier.
  - **Un seul propriétaire par zone.** Une zone ne peut être affectée qu'à un seul entrepôt. Affecter une zone qu'un
    autre entrepôt possède déjà est refusé, sauf si l'administrateur la déplace explicitement.
  - **L'affectation la plus précise l'emporte.** Exemple : l'entrepôt K couvre la province de Kinshasa, et l'entrepôt L
    couvre les districts Mont-Amba et Tshangu. Une adresse à Limete (Mont-Amba) va à L ; une adresse à Gombe (Lukunga)
    va à K.
  - **Desservi ou non.** Une zone est desservie lorsqu'elle, ou l'un de ses parents, est couverte par un entrepôt actif.
    Les zones non desservies affichent « bientôt disponible » et la validation de la commande y est refusée (« Nous ne
    livrons pas encore à Lubumbashi. »).
- **La même règle s'applique aux clients et aux vendeurs :**
  - **Entrepôt de destination** = l'entrepôt qui couvre l'adresse de livraison du **client**.
  - **Entrepôt d'origine** = l'entrepôt qui couvre l'adresse de collecte du **vendeur**.
  - Un vendeur dont l'adresse de collecte n'est pas dans une zone desservie peut configurer sa boutique mais ne peut pas
    vendre tant que la zone n'est pas desservie.

## 3. Comment une adresse obtient sa zone

1. **D'abord le repère.** Le client ou le vendeur place le repère sur la carte. L'application le géocode en sens inverse
   avec Google et fait correspondre `sublocality_level_1` → commune, `locality` → ville et
   `administrative_area_level_1` → province, à l'aide de `googleName` et des alias.
2. **Confirmer.** Le formulaire affiche Province → Ville → Commune (quartier facultatif) préremplis à partir du repère.
   L'utilisateur peut les corriger ; les sélecteurs listent d'abord les zones desservies et affichent les zones non
   desservies comme « bientôt disponible ».
3. **Enregistré sur l'adresse :** `areaId` (la zone la plus précise trouvée), le repère, et les champs texte comme
   aujourd'hui (`commune`, `city`, `region`, `country` — écrits avec les noms de Google).
4. **Anciennes adresses** sans `areaId` : elles sont rapprochées côté serveur à partir de leur texte de commune et de
   ville, puis de leur repère ; si rien ne correspond, elles se rabattent sur l'entrepôt de leur ville.

## 4. Règle de routage (serveur)

```
area(address)  → remonter : commune → district → ville → province → pays
               → la première zone qui a une ligne de couverture décide de l'entrepôt
l'entrepôt a ≥1 livreur actif ?   oui → l'utiliser
                                  non → entrepôt le plus proche AVEC livreurs dans la même ville, puis la province   (repli, administrateurs alertés)
aucune couverture à aucun niveau  → non desservi → validation de la commande refusée (message bilingue)
```

- **Origine** = route(adresse de collecte du vendeur) ; **destination** = route(adresse du client) ; une seule origine
  par vendeur dans une commande multi-vendeurs.
- **Frais :** base + frais au km entre l'**entrepôt de destination** et le repère du client (plafonné), plus les frais de
  transfert lorsque l'origine ≠ destination, plus un **frais spécifique par zone** facultatif sur une ligne de
  couverture (p. ex. Maluku, éloigné). Les administrateurs fixent tous ces montants ; le devis et la commande utilisent
  le même calcul.
- **Commandes inter-villes / inter-provinces** (p. ex. un vendeur à Kinshasa, un client à Lubumbashi) : elles
  fonctionnent de la même manière, avec l'entrepôt d'origine de Kinshasa → long transfert → entrepôt de Lubumbashi →
  livraison. Elles sont autorisées lorsque les deux zones sont desservies et que le paramètre `allowInterCityDelivery`
  est activé (activé par défaut). Les frais de transfert pourront être fixés par paire de provinces plus tard ; pour le
  lancement, il y a un seul tarif de transfert.

## 5. Cas d'usage

### UC-1 Lancement : un entrepôt couvre toute Kinshasa (mode entrepôt unique)
- **Configuration :** l'administrateur crée « Entrepôt Kinshasa » (dans la commune de Gombe, repère placé) et lui
  affecte la **province de Kinshasa (CD-KN)**. Les livreurs R1…Rn et le personnel lui appartiennent.
- **Déroulement :** un client à Masina achète chez un vendeur à Ngaliema.
  1. Les deux adresses sont dans CD-KN, donc origine = destination = Entrepôt Kinshasa. Il n'y a **pas d'étape de
     transfert** et pas de frais de transfert.
  2. **Étape de collecte :** le personnel affecte le livreur R1 → R1 collecte chez le vendeur (Ngaliema) → l'entrepôt le
     scanne à l'entrée.
  3. **Étape de livraison :** le personnel affecte le livreur R2 (ou de nouveau R1) → en cours de livraison → livré (avec
     le code s'il est activé).
- **Tout ce qui est en dehors de Kinshasa** affiche « bientôt disponible » ; la validation de la commande et
  l'activation des vendeurs y sont refusées.

### UC-2 Un deuxième entrepôt à Kinshasa (multi-entrepôts, même ville)
- **Configuration :** l'administrateur crée « Entrepôt Limete » (repère placé à Limete), lui donne ses propres livreurs,
  et lui affecte les districts **Mont-Amba** et **Tshangu**. Entrepôt Kinshasa conserve la province, il couvre donc
  toujours Lukunga et Funa.
- **UC-2a — même entrepôt :** vendeur à Gombe → client à Kalamu (Funa). Les deux sont couverts par Entrepôt Kinshasa, le
  déroulement est donc celui de UC-1.
- **UC-2b — vendeur près de A, client dans la zone de B** (le cas du propriétaire) :
  - **Vendeur à Gombe** → origine **A = Entrepôt Kinshasa**.
  - **Client à Masina (Tshangu)** → destination **B = Entrepôt Limete**.
  1. **Collecte :** le personnel de A affecte **un livreur de A** → vendeur → A scanne à l'entrée.
  2. **Transfert A → B :** le personnel de A affecte un livreur (de A, ou de B si A l'autorise) → A remet le colis (scan
     de sortie) → le livreur le conduit jusqu'à B → **B le scanne à l'entrée**.
  3. **Livraison :** le personnel de B affecte **un livreur de B** → client (Masina) → livré.
  - **Écran client :** « Collecté chez le vendeur → À l'Entrepôt Kinshasa → En transfert vers l'Entrepôt Limete → À
    votre entrepôt → En cours de livraison (nom du livreur, appeler) → Livré ».
  - **Frais :** base + km (Limete → Masina) + transfert.
- **UC-2c — sens inverse :** vendeur à Limete → client à Gombe. L'origine est B, la destination est A, et le transfert
  va de B vers A.

### UC-3 Commande multi-vendeurs répartie sur plusieurs entrepôts
- Un client à Gombe (destination A) achète chez un vendeur de Gombe (origine A) et chez un vendeur de N'djili
  (origine B).
  1. **Deux collectes :** le livreur de A collecte chez le vendeur de Gombe ; le livreur de B collecte chez le vendeur de
     N'djili.
  2. **Un seul transfert :** B → A, uniquement pour le colis de B.
  3. **Une seule étape de livraison :** le livreur de A livre une fois que **tous** les colis sont arrivés à A.

### UC-4 Retour (du client vers le vendeur)
- **Client à Masina (B), vendeur à Gombe (A) :**
  1. Le vendeur accepte le retour.
  2. **Collecte du retour :** le livreur de B collecte chez le client → B scanne à l'entrée.
  3. **Transfert du retour :** B → A → A scanne à l'entrée.
  4. **Retour au vendeur :** le livreur de A l'apporte au vendeur.
  5. Le remboursement est émis lorsque l'entrepôt scanne la marchandise (tel que déjà développé).

### UC-5 Remplacement / échange
- **Nouvelle unité :** vendeur → entrepôt d'origine → transfert si nécessaire → destination → `replacement_delivery`.
  Le livreur collecte aussi l'ancienne unité.
- **Ancienne unité :** elle retourne chez le vendeur par les étapes de retour lorsque le vendeur souhaite la récupérer.

### UC-6 Extension à une autre ville (Lubumbashi)
- **Configuration :** l'administrateur crée « Entrepôt Lubumbashi » dans la ville de Lubumbashi (province du
  Haut-Katanga) avec des livreurs, et lui affecte la **ville de Lubumbashi**. Lubumbashi devient desservie ; le reste du
  Haut-Katanga reste « bientôt disponible » tant que l'administrateur n'affecte pas la province entière.
- **Commandes locales** (les deux parties à Lubumbashi) : elles restent à l'intérieur de l'Entrepôt Lubumbashi.
- **Vendeur à Kinshasa → client à Lubumbashi :** entrepôt d'origine de Kinshasa → transfert Kinshasa → Lubumbashi
  (affecté par le personnel de Kinshasa à un chauffeur longue distance de l'un ou l'autre entrepôt) → livraison à
  Lubumbashi. La livraison estimée ajoute les jours de transfert inter-villes (paramètre `interCityTransferDays`,
  3 par défaut).

### UC-7 Déplacement de couverture (rééquilibrage)
- L'administrateur déplace la commune de Matete de A vers B.
  - **Les nouvelles commandes** sont routées vers B.
  - **Les commandes déjà en cours** gardent leurs étapes ; rien n'est réacheminé en cours de route.
  - **Les vendeurs** de Matete ont B pour origine sur les nouvelles commandes ; leur origine enregistrée est recalculée.

### UC-8 Entrepôt sans livreurs ou suspendu
- **L'entrepôt qui couvre la zone n'a aucun livreur actif :** les nouvelles commandes se rabattent sur l'entrepôt doté de
  livreurs le plus proche dans la même ville, puis dans la même province, et les administrateurs ainsi que cet entrepôt
  sont alertés.
- **Entrepôt suspendu (inactif) :** ses zones sont considérées comme non desservies jusqu'à leur réaffectation ou à sa
  réactivation, sauf si une zone parente est couverte par un autre entrepôt actif (c'est alors celui-ci qui prend le
  relais).

### UC-9 Adresse hors de toute zone desservie
- **Client :** la validation de la commande affiche « Nous ne livrons pas encore à <zone> » (EN/FR) et liste les villes
  desservies.
- **Vendeur :** la boutique peut être préparée mais reste inactive pour la vente, avec le même message.

### UC-10 Transferts multi-entrepôts (itinéraires à plusieurs étapes sur des liaisons)
- **Liaisons.** Les administrateurs définissent les liaisons entre entrepôts que des camions ou des chauffeurs assurent
  réellement, avec un temps de transit :
  - Entrepôt Limete ↔ Entrepôt Kinshasa : 4 h.
  - Entrepôt Kinshasa ↔ Entrepôt Kikwit : 24 h.
  - Entrepôt Kinshasa ↔ Entrepôt Lubumbashi : 72 h.
- **Itinéraire = la plus courte chaîne de liaisons actives** de l'entrepôt d'origine à l'entrepôt de destination, selon
  le temps de transit. Si aucune liaison n'est configurée, un transfert direct est utilisé ; c'est le réglage par défaut
  au lancement, et il se comporte comme UC-2.
- **Exemple — vendeur à Limete (origine L), client à Kikwit (destination W) :**
  - L'itinéraire est L → Kinshasa (K) → W.
  - **Collecte :** le livreur de L collecte chez le vendeur → L scanne à l'entrée.
  - **Étape 1, L → K :** un livreur de transfert est affecté par L → K scanne à l'entrée. K sait que le colis poursuit
    sa route, il crée donc automatiquement l'étape suivante.
  - **Étape 2, K → W :** un chauffeur de transfert est affecté par K → W scanne à l'entrée.
  - **Livraison :** le livreur de W livre au client.
- **Le suivi client** affiche chaque étape : « À l'Entrepôt Limete → En transfert vers l'Entrepôt Kinshasa → À
  l'Entrepôt Kinshasa → En transfert vers l'Entrepôt Kikwit → À votre entrepôt → En cours de livraison → Livré ».
- **Frais et estimation :**
  - Les frais de transfert sont facturés par étape (paramètre `deliveryTransferUsd`).
  - Une liaison peut remplacer ces frais par son propre coût.
  - L'estimation additionne les temps de transit des liaisons.
- **Aucun itinéraire possible** (des liaisons existent mais aucune ne relie les deux entrepôts) : repli sur un transfert
  direct et alerte aux administrateurs.
- **Les retours et les remplacements** suivent le même itinéraire en sens inverse.
- **Réacheminement :** un colis déjà en transit conserve son itinéraire. Une liaison désactivée en cours de route
  n'affecte que les étapes pas encore créées ; pour celles-ci, l'itinéraire est recalculé au prochain scan d'entrée.

### UC-11 Tournées de transfert groupées (un trajet, plusieurs colis)
- Dans un entrepôt, toutes les étapes de transfert en attente de départ vers le même entrepôt suivant sont regroupées en
  une **tournée de transfert** (un manifeste), par exemple « Tournée TR-0042 · Entrepôt Kinshasa → Entrepôt Limete · 18
  colis ».
- **Entrepôt expéditeur (superviseur et au-dessus) :** crée la tournée (proposée automatiquement par destination ou
  composée à la main), affecte un chauffeur, puis scanne la tournée en sortie → chaque colis qu'elle contient passe à
  `picked_up` avec ce chauffeur.
- **Chauffeur :** l'application livreur affiche la tournée sous la forme d'une seule carte avec son nombre de colis et
  l'entrepôt de destination (« Transfert vers l'Entrepôt Limete · 18 colis ») et la marque en route (`in_transit`).
- **Entrepôt destinataire :** scanne la tournée à l'entrée. Tous les colis arrivent d'un coup, ou le personnel les
  scanne colis par colis. Les colis manquants à la clôture deviennent une exception (« Colis manquant dans la tournée
  TR-0042 »), avec des notifications aux deux entrepôts et aux administrateurs.
- Un colis peut être retiré d'une tournée avant son départ. Une tournée ne peut plus être modifiée après l'expédition,
  sauf pour marquer des colis manquants.
- Les tournées fonctionnent aussi pour les itinéraires à plusieurs étapes (les colis de chaque étape rejoignent la
  tournée suivante sur cette liaison) et pour les transferts de retour.
- **Un chauffeur différent par étape.** Chaque étape est sa propre tournée, affectée par l'entrepôt expéditeur de cette
  étape. Le chauffeur A peut assurer l'entrepôt 1 → 2 et le chauffeur B, choisi par l'entrepôt 2, assurer 2 → 3 ; le
  chauffeur A n'est jamais reporté sur l'étape suivante. Pour un transfert entre entrepôts, l'entrepôt expéditeur peut
  choisir un chauffeur de son propre entrepôt ou de l'entrepôt destinataire.
- **Plusieurs chauffeurs sur la même liaison.** Quand les colis ne tiennent pas dans un seul véhicule, l'entrepôt
  expéditeur **scinde** la tournée : « Scinder la tournée » déplace les colis choisis dans une nouvelle tournée sur la
  même liaison, et chaque tournée reçoit son propre chauffeur (TR-0042 avec le chauffeur A, TR-0043 avec le chauffeur
  B). Chaque tournée a exactement un chauffeur ; plusieurs chauffeurs signifient plusieurs tournées. L'entrepôt
  destinataire voit et réceptionne chaque tournée séparément.
- **Analytique :** tournées par liaison, colis par tournée, temps de transit et colis manquants.

## 6. Écrans admin et entrepôt

- **Admin → Géographie (nouveau) :**
  - Une arborescence Pays → Province → Ville → District → Commune → Quartier, avec recherche.
  - Pour chaque zone : noms (officiel, Google, alias, EN/FR), code, repère, statut desservi, entrepôt qui la couvre, et
    nombre de clients, de vendeurs et de commandes.
  - Les administrateurs peuvent ajouter des quartiers ou des communes sous n'importe quelle ville.
- **Admin → Entrepôts :**
  - Créer un entrepôt dans une province/ville/commune : nom, adresse, repère sur la carte, capacité, actif.
  - **Éditeur de couverture :** une arborescence avec cases à cocher. Les zones qu'un autre entrepôt possède affichent son
    nom et une action « Déplacer ici » avec confirmation. L'éditeur affiche des avertissements pour les trous de
    couverture (une commune d'une ville desservie sans propriétaire) et pour les chevauchements.
  - Une carte de couverture avec les repères des communes colorés par entrepôt.
  - Livreurs et personnel par entrepôt, avec leurs niveaux.
- **Unique ou multiple :** rien à basculer. Avec un seul entrepôt couvrant la province, le système se comporte comme en
  entrepôt unique (pas de transferts). Ajouter des entrepôts avec une couverture plus précise active automatiquement
  les transferts.
- **Portail entrepôt :**
  - Chaque entrepôt ne voit que ses propres étapes : les collectes dans sa zone, les transferts qu'il envoie ou reçoit,
    les livraisons dans sa zone, les retours.
  - La vue de prise en charge montre les colis entrants, en stock et sortants.
- **Analytique :** commandes, délais de livraison et échecs par entrepôt et par commune.

## 7. Données initiales de lancement (amorçage de production)

- **Géographie :** pays CD avec les 26 provinces et les 33 villes. Kinshasa a ses 4 districts et ses 24 communes, avec
  les noms Google.
- **Un seul entrepôt :** « Entrepôt Kinshasa » (Gombe, repère placé) couvrant la province CD-KN. Seule Kinshasa est
  desservie.
- **Supprimés :** les anciens entrepôts de démonstration (Paris, Lubumbashi sans livreurs) sont retirés de l'amorçage.
- **Données de dev/démo :** Entrepôt Kinshasa (province) plus Entrepôt Limete (districts Mont-Amba et Tshangu), chacun
  avec des livreurs et du personnel, afin de pouvoir démontrer les transferts. Les deux vendeurs de démonstration sont
  placés à Gombe et à Limete, et le client de démonstration a des adresses à Gombe et à Masina.

## 8. Analyse des changements (ce qui change, et où)

| Domaine | Changement |
|---|---|
| **BD** | Nouvelle table `geo_areas` (id, code unique, level, name, nameEn, googleName, aliases JSON, parentId, path, depth, lat, lng, active, sortOrder). Nouvelle table `hub_coverage` (id, hubId, areaId **unique**, feeOverrideUsd, createdAt). `hubs.areaId` (emplacement). `addresses.areaId`. `sellers.pickupAreaId`. `orders.destinationAreaId`. Migration + données initiales à partir de `drc.json`. Les entrepôts existants reçoivent la zone de leur ville ; les adresses et vendeurs existants sont complétés par rapprochement du texte commune/ville, puis du repère. |
| **API — géo** | Nouveau module `geo` : `geo:tree {rootCode?, depth?}`, `geo:children {parentId}`, `geo:search {q}`, `geo:resolve {googleComponents | text | pin}` (renvoie la chaîne de zones), admin `geo:create`, `geo:update`, `geo:setActive`. |
| **API — couverture** | `hubs:coverage {hubId}`, `hubs:assign {hubId, areaIds, move?}` (refuse une zone déjà possédée sauf avec `move`), `hubs:unassign`, `coverage:map` (zone → entrepôt pour un sous-arbre), `coverage:gaps {areaId}`. La propriété d'une zone est garantie par le service et par l'index unique. |
| **API — routage** | `RoutingService.pickDestination` / `originFor` fonctionnent par zone (remontée jusqu'à la première zone couverte). La distance ne sert plus que de repli (aucun livreur). Non desservi → `BadRequest` "We don't deliver to {area} yet." (message mappé en FR). Le devis renvoie `served`, la chaîne `destinationArea` et les noms des entrepôts. L'activation du vendeur et la mise en vente des produits sont vérifiées par rapport à une zone de collecte desservie. Recalculer l'origine enregistrée lorsque la couverture ou l'adresse du vendeur change. |
| **API — adresses et vendeurs** | Acceptent et renvoient `areaId` et la chaîne de zones ; valident que la zone existe ; remplissent `commune/city/region/country` avec les noms Google. |
| **API — analytique** | Par entrepôt et par commune. |
| **Admin web** | Page Géographie ; création d'entrepôt (avec zone d'emplacement) ; éditeur et carte de couverture ; personnel et livreurs par entrepôt. |
| **Boutique web + vendeur** | Formulaire d'adresse : repère → sélecteurs Province/Ville/Commune préremplis (zones desservies en premier, « bientôt disponible » désactivé) ; message de zone non desservie à la validation de la commande ; zone de collecte du vendeur sur la vitrine. |
| **Application client** | Même formulaire d'adresse (géocodage inverse → correspondance de zone, sélecteurs) ; message de zone non desservie ; le suivi affiche les noms des entrepôts (déjà développé). |
| **Application livreur** | Aucun changement, hormis le nom de l'entrepôt sur le profil. |
| **Transferts (UC-10/11)** | Nouvelles tables `hub_lanes` (fromHubId, toHubId, transitHours, costUsd nullable, active ; paire unique) et `transfer_runs` (reference, fromHubId, toHubId, riderId, status planned→dispatched→arrived→closed, counts) ; `delivery_tasks.runId`, `delivery_tasks.finalHubId` (fin de la chaîne) et l'itinéraire prévu de la commande, `route` (identifiants d'entrepôts). Le routage calcule la chaîne d'étapes (transit le plus court sur les liaisons actives ; direct s'il n'y a aucune liaison) ; le scan d'entrée dans un entrepôt intermédiaire crée l'étape suivante. Événements desk pour les liaisons et les tournées ; carte de tournée dans l'application livreur ; le suivi client affiche chaque étape. |
| **Tests** | Specs de routage (la plus précise l'emporte, propriétaire unique, replis, non desservi, déplacement de couverture) ; smoke `warehouse-areas-smoke` couvrant UC-1…UC-9 sur une base initialisée ; smoke de routage existant mis à jour. |

## 9. Choix par défaut retenus (le propriétaire peut modifier n'importe lequel)

1. La couverture par zone remplace le plus proche par distance ; la distance sert de repli et détermine les frais.
2. Une zone a un seul propriétaire ; l'affectation la plus précise l'emporte.
3. Zones non desservies : validation de la commande refusée, les vendeurs ne peuvent pas encore vendre.
4. Zone de l'adresse issue du repère Google, confirmée avec les sélecteurs.
5. Transferts entre entrepôts : le personnel de l'origine affecte un livreur de l'origine ou de l'entrepôt de destination.
6. Commandes inter-villes autorisées lorsque les deux extrémités sont desservies, avec +3 jours.
7. Paris et les autres entrepôts à l'étranger sont retirés des données de lancement ; les langues restent EN/FR.
