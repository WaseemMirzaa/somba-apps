# Clip 04 - tracking a cross-warehouse order: seller pickup, transfer run, at your warehouse, out for delivery with the rider and
# the 4-digit code, delivered; then the receipt and Buy again. The warehouse and rider steps are driven from a script
# (drive.cjs, the same socket events the desks and the rider app send); the app updates live.
#pre resetAddresses
#pre fillWallet
#pre defaultMasina
act placeOrder "product=Instant" pay=wallet commune=Masina -> ord
include setup-home.sc
include setup-cart.sc
flash
say "A wallet-paid order for Masina is placed (Instant Pot from Kinshasa Traders)||Commande payée par portefeuille pour Masina passée (Instant Pot, Kinshasa Traders)" 3.6
tap icon:receipt_long_rounded 1.5
say "My Orders: the new order is confirmed||Mes commandes : la nouvelle commande est confirmée" 2.6
tap "text:$ord" 2
say "Order detail: items, totals, how it was paid||Détail : articles, totaux et mode de paiement" 2.8
tap msg:order_track 2
say "Tracking starts: the seller is packing the order||Le suivi commence : le vendeur prépare la commande" 2.8
cap "The seller presses Package Ready||Le vendeur appuie sur Colis prêt" 2.4
act life step=ready ref=$ord
wait 2.4
cap "A rider collects it from the seller, the warehouse scans it in||Un livreur le récupère chez le vendeur, l'entrepôt le réceptionne" 3.2
act life step=pickup ref=$ord
say "Picked up from the seller, at Entrepôt Kinshasa||Récupéré chez le vendeur, à l'Entrepôt Kinshasa" 3
cap "The desk puts the parcel on a transfer run to Entrepôt Limete||Le bureau place le colis sur une tournée vers l'Entrepôt Limete" 3.2
act life step=run ref=$ord
wait 3
cap "The run leaves: the step shows the run number and its driver||La tournée part : l'étape montre le numéro et le chauffeur" 3.2
act life step=runroad ref=$ord
wait 3.2
cap "Entrepôt Limete receives the run: your warehouse||L'Entrepôt Limete reçoit la tournée : votre entrepôt" 3
act life step=receive ref=$ord
wait 3
cap "A rider is assigned to the delivery||Un livreur est affecté à la livraison" 2.8
act life step=assign ref=$ord
wait 2.6
cap "Out for delivery: the rider, a Call button and your 4-digit code||En livraison : le livreur, un bouton Appeler et votre code à 4 chiffres" 3.6
act life step=out ref=$ord
wait 3.6
act ping lat=-4.3850 lng=15.3860
cap "The rider shares a live position on the map||Le livreur partage sa position en direct sur la carte" 3
wait 3
act ping lat=-4.3838 lng=15.3896
wait 2.4
cap "The rider types the code at the door: delivered||Le livreur saisit le code à la porte : livré" 3
act life step=deliver ref=$ord
wait 3.4
back 1.2
say "Delivered: the order page now offers Return, Report a problem and Buy again||Livrée : la page commande propose Retour, Signaler un problème et Racheter" 3.6
scroll 600
wait 1
tap key:order-receipt 1.8
say "The receipt, ready to share||Le reçu, prêt à partager" 2.8
back 1.2
tap key:buy-again 2
say "Buy again puts the same item back in the cart||Racheter remet le même article dans le panier" 3
