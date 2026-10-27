# Clip 07 - replacement and exchange requests and their status pages.
act resetAddresses
act fillWallet
act deliveredOrder "product=Instant" pay=wallet commune=Masina -> ordA
act deliveredOrder "product=Nike" pay=wallet commune=Masina "variant=Size: 42 · Colour: Black" -> ordB
include setup-home.sc
flash
say "Replacement: the same item again, because it arrived damaged||Remplacement : le même article, parce qu'il est arrivé abîmé" 3.4
tap icon:receipt_long_rounded 1.5
tap "text:$ordA" 2
tap key:item-issue 2
say "Replace or exchange: pick the item and what is wrong||Remplacer ou échanger : choisissez l'article et le problème" 3.2
tap key:cond-damaged 0.8
type key:issue-reason "The lid is cracked, please send a new one.||Le couvercle est fissuré, merci d'envoyer un neuf." 30
photo /Users/macuser/somba-build/appdemo/assets/crushed-box.png
tap key:photo-add 1
tap key:photo-library 2.4
tap key:issue-submit 2.6
say "Request sent: waiting for the seller's answer||Demande envoyée : en attente de la réponse du vendeur" 3
cap "Kinshasa Traders approves the replacement||Kinshasa Traders accepte le remplacement" 2.8
act approveRequest kind=replacements
wait 3
cap "A rider brings the new item and collects the old one||Un livreur apporte le nouvel article et reprend l'ancien" 3.2
act walkRequest kind=replacements upTo=onway
wait 3.2
cap "Delivered: the replacement is complete||Livré : le remplacement est terminé" 3
act walkRequest kind=replacements
wait 3.4
tohome
say "Exchange: swap for another size or colour||Échange : un autre modèle, une autre taille ou couleur" 3.2
tap icon:receipt_long_rounded 1.5
tap "text:$ordB" 2
tap key:item-issue 2
tap msg:issue_exchange 1.6
say "Choose the new option: size 43 instead of 42||Choisissez la nouvelle option : pointure 43 au lieu de 42" 3.2
tap key:opt-Size-43 1
type key:issue-reason "The shoes are a bit small.||Les chaussures sont un peu petites." 30
tap key:issue-submit 2.6
say "Exchange request sent with its status page||Demande d'échange envoyée, avec sa page de suivi" 3
cap "The seller approves the exchange||Le vendeur accepte l'échange" 2.8
act approveRequest kind=exchanges
wait 3.4
cap "Returns & refunds lists returns, replacements and exchanges||Retours et remboursements liste retours, remplacements et échanges" 3.4
tohome
tap icon:person_rounded 1.2
tap msg:returns_refunds 2
wait 1.5
tap msg:as_tab_replacements 1.8
wait 1.2
tap msg:as_tab_exchanges 1.8
wait 2
