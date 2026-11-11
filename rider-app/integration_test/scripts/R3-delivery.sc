# Clip R3 - a delivery: navigate, on the way with location sharing, the customer's code, delivered.
act riderClear
act rFixture stage=delivery commune=Gombe pay=wallet product=Instant assign=false -> ord
include rsetup.sc
flash
say "Jean is on shift: the next task is an order paid in advance||Jean est en service : la prochaine tâche est une commande payée d'avance" 3.4
act assignOpenDelivery
wait 1.2
say "The delivery card: customer, where to collect, where to deliver||La carte de livraison : client, lieu de retrait, lieu de livraison" 3.4
act resumeAppLater app=rider ms=4500
tap keyp:navigate- 0.5
cap "Navigate opens the route in the maps app||Naviguer ouvre l'itinéraire dans l'app de cartes" 3
wait 3.2
act resumeApp app=rider
wait 1.6
tap keyp:next- 1.6
say "Picked up at the warehouse: the customer's address is now the target||Récupéré à l'entrepôt : l'adresse du client devient la destination" 3.4
tap keyp:next- 1.8
say "On the way: the live position is shared with the customer||En route : la position en direct est partagée avec le client" 3.4
act deliveryCode -> code
tap keyp:next- 1.4
say "Delivered: the customer's 4-digit code is asked||Livré : on demande le code à 4 chiffres du client" 3
say "It is shown in the customer app||Il est affiché dans l'app client" 3.2
type field:0 "$code" 150
tap msg:code_confirm 2.6
say "Delivered: the task moves to Done||Livrée : la tâche passe dans Terminées" 2.8
tap key:tab-1 1.6
say "Done: the delivery||Terminées : la livraison" 3
wait 1
