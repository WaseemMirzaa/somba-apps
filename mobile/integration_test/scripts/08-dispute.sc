# Clip 08 - report a problem (dispute) and its thread with the seller.
act resetAddresses
act fillWallet
act deliveredOrder "product=Instant" pay=wallet commune=Masina -> ord
include setup-home.sc
flash
say "A delivered order with something missing in the box||Une commande livrée avec un article manquant dans le colis" 3.2
tap icon:receipt_long_rounded 1.5
tap "text:$ord" 2
tap key:report-problem 2
say "Report a problem: the seller replies first, support steps in if needed||Signaler un problème : le vendeur répond d'abord, le support intervient si besoin" 4
tap key:cat-missing 1
type key:dispute-details "The charger that should be in the box is missing.||Le chargeur qui devait être dans la boîte est manquant." 30
say "Pick what happened and describe it||Choisissez ce qui s'est passé et décrivez-le" 2.6
tap key:dispute-submit 2.8
say "The report opens a thread with the seller||Le signalement ouvre une conversation avec le vendeur" 3
cap "Kinshasa Traders answers from the seller portal||Kinshasa Traders répond depuis le portail vendeur" 3
act disputeSellerReply "text=Sorry about that, we are sending the charger today.||text=Désolé, nous envoyons le chargeur aujourd'hui."
wait 3
scroll 500
wait 1.2
say "The seller's message appears in the thread, and the status changes||Le message du vendeur apparaît dans la conversation et le statut change" 3.6
type key:reply-field "Thank you, please send it to the same address.||Merci, envoyez-le à la même adresse." 30
tap key:reply-send 1.8
say "The customer answers in the same thread||Le client répond dans la même conversation" 3
wait 1
