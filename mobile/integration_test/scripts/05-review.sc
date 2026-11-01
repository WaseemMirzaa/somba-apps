# Clip 05 - review a delivered product; the seller's public reply appears on the product page.
# The review form of the app takes a rating and a text: it has no photo field.
act resetAddresses
act resetReviews
act deliveredOrder "product=Instant" commune=Masina -> ord
include setup-home.sc
flash
say "A delivered order: the order page asks how it went||Une commande livrée : la page commande demande comment ça s'est passé" 3.2
tap icon:receipt_long_rounded 1.5
tap "text:$ord" 2
scroll 700
say "One tap to write a review of each product||Un geste pour donner son avis sur chaque produit" 2.8
tap msg:review_write 1.8
say "Pick the stars and tell the story||Choisissez les étoiles et racontez votre expérience" 2.8
tap icon:star_rounded#3 1
type key:review-text "Works great, the delivery was fast and the box was well packed.||Fonctionne très bien, livraison rapide et colis bien emballé." 30
say "Four stars and a few words, then send||Quatre étoiles et quelques mots, puis envoi" 2.6
tap msg:review_submit 2.2
say "Thank you: the review is saved on the product||Merci : l'avis est enregistré sur le produit" 2.8
cap "Kinshasa Traders answers the review from the seller portal||Kinshasa Traders répond à l'avis depuis le portail vendeur" 3.2
act replyReview "text=Thank you Marie! Glad it arrived safely.||text=Merci Marie ! Ravis que le colis soit bien arrivé."
wait 3
tohome
tap icon:home_rounded 1
tap msg:search 1.2
type field:0 "instant"
wait 1.5
tap "textc:Instant Pot" 2.5
scroll 650
wait 0.6
say "On the product page: the review and the seller's reply||Sur la fiche produit : l'avis et la réponse du vendeur" 3.6
scroll 200
wait 2
