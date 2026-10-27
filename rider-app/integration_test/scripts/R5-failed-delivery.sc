# Clip R5 - a failed delivery: "Could not deliver" with a reason, and what happens next.
act riderClear
act rFixture stage=delivery commune=Gombe pay=cod product=Instant assign=false -> ord
include rsetup.sc
flash
say "A delivery is on the road and the customer cannot be reached||Une livraison est en route et le client est injoignable" 3.4
act assignOpenDelivery
wait 1.2
tap keyp:next- 1.4
tap keyp:next- 1.6
say "On the way to the customer, location shared||En route vers le client, position partagée" 2.8
tap keyp:fail- 1.4
say "Could not deliver: the rider picks a reason||Livraison impossible : le livreur choisit un motif" 3
tap key:reason-unreachable 0.8
type field:0 "Called twice, no answer at the gate.||Appelé deux fois, personne au portail." 30
say "The warehouse sees the reason and decides what happens next||L'entrepôt voit le motif et décide de la suite" 3
tap msg:fail_submit 2.2
say "Marked as failed: the warehouse will reassign it||Marquée échouée : l'entrepôt la réaffectera" 3
tap key:tab-1 1.6
scrollto "textc:Called twice, no answer||textc:Appelé deux fois, personne"
wait 0.6
say "The attempt is kept in Done as Failed, with the reason||La tentative reste dans Terminées comme Échouée, avec le motif" 3.4
act assignOpenDelivery
tap key:tab-0 1.6
say "The desk reassigns it: the same order is back as Attempt 2||Le bureau la réaffecte : la même commande revient en Tentative 2" 3.6
wait 1
