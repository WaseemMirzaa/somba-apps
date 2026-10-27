# Clip R2 - a pickup from a seller: Navigate, Picked up, hand over at the warehouse, waiting for the scan.
act riderClear
include rsetup.sc
flash
say "Jean is on shift: nothing assigned yet||Jean est en service : rien d'affecté pour l'instant" 2.8
act rFixture stage=pickup commune=Gombe pay=cod product=Instant -> ord
wait 1.5
say "The warehouse assigns a pickup: the card appears live||L'entrepôt affecte une collecte : la carte apparaît en direct" 3
say "Seller, address, parcel and where to bring it: Entrepôt Kinshasa||Vendeur, adresse, colis et lieu de dépôt : Entrepôt Kinshasa" 3.4
act resumeAppLater app=rider ms=4500
tap keyp:navigate- 0.5
cap "Navigate opens the route to the seller in the maps app||Naviguer ouvre l'itinéraire vers le vendeur dans l'app de cartes" 3.2
wait 3.4
act resumeApp app=rider
wait 1.6
tap keyp:next- 1.6
say "Picked up from the seller: now the hand-over at the warehouse||Récupéré chez le vendeur : place au dépôt à l'entrepôt" 3.4
tap keyp:next- 1.6
say "On the way: the live position is shared with the warehouses||En route : la position en direct est partagée avec les entrepôts" 3.4
say "Waiting for the warehouse to scan the parcel in||En attente que l'entrepôt réceptionne le colis" 2.8
act scanPickup
wait 2.2
say "Scanned in: the task leaves Active||Réceptionné : la tâche quitte les actives" 2.8
tap key:tab-1 1.6
say "It shows as Scanned in on the Done tab||Elle apparaît Réceptionnée dans l'onglet Terminées" 3
wait 1
