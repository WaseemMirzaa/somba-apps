# Clip 06 - return a delivered item: reason and photo, status page (seller accepts, pickup, scan, refund to the wallet), wallet history.
act resetAddresses
act fillWallet
act deliveredOrder "product=Instant" pay=wallet commune=Masina -> ord
include setup-home.sc
flash
say "A delivered order paid from the wallet: Return is on the order page||Une commande livrée et payée par le portefeuille : Retour est sur la page commande" 3.6
tap icon:receipt_long_rounded 1.5
tap "text:$ord" 2
tap key:order-return 2.2
say "The return window, what can be returned and the refund preview||Le délai de retour, ce qui peut être retourné et le remboursement estimé" 3.6
tap key:cat-damaged 1
type key:return-details "The box arrived crushed and the lid is cracked.||Le carton est arrivé écrasé et le couvercle est fissuré." 30
photo /Users/macuser/somba-build/appdemo/assets/crushed-box.png
tap key:photo-add 1
tap key:photo-library 2.5
say "Reason, details and a photo of the damage||Motif, détails et une photo des dégâts" 3
tap key:return-submit 2.5
say "Return request sent: waiting for the seller||Demande de retour envoyée : en attente du vendeur" 3
cap "Kinshasa Traders accepts the return||Kinshasa Traders accepte le retour" 2.6
act returnRespond accept=true
wait 3.4
cap "The warehouse assigns a rider to collect the item||L'entrepôt affecte un livreur pour récupérer l'article" 3
act returnStep step=assign
wait 3.4
cap "The rider collects the item at your door||Le livreur récupère l'article à votre porte" 3
act returnStep step=collect
wait 3.4
cap "The warehouse scans the parcel in: the refund is issued||L'entrepôt réceptionne le colis : le remboursement est émis" 3.4
act returnStep step=scan
wait 3.6
scroll 300
wait 1.4
tohome
tap icon:person_rounded 1.2
tap "text:Wallet#1||text:Portefeuille#1" 1.8
say "Wallet history: the refund is credited||Historique du portefeuille : le remboursement est crédité" 3.4
wait 1.2
