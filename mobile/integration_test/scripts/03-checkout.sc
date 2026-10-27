# Clip 03 - cart and checkout: promo code and Airtel Money (sandbox), wallet top-up by Orange Money, an order paid from the wallet.
# The app offers wallet and three mobile-money networks; cash on delivery and card are not in the app's checkout.
#pre resetAddresses
#pre defaultMasina
include setup-home.sc
include setup-cart.sc
flash
say "Order 1: the French-written running shoes, shown in English||Commande 1 : les baskets écrites en français, affichées en anglais" 3.2
tap msg:search 1.2
type field:0 "running||baskets"
wait 1.5
tap "textc:Lightweight||textc:Baskets" 2.4
say "Add to cart||Ajouter au panier" 1.4
tap key:pd-add-to-cart 1.6
tohome
tap icon:shopping_bag_outlined 1.8
say "Cart: quantity, save for later, remove and a promo code||Panier : quantité, mise de côté, retrait et code promo" 3.6
type field:0 "SOMBA10"
tap msg:apply 1.4
say "Promo code SOMBA10 is applied to the total||Le code promo SOMBA10 est appliqué au total" 3
tap msgc:checkout 2.2
say "Checkout: the delivery address, delivery estimate and payment choices||Paiement : adresse de livraison, délai estimé et modes de paiement" 3.6
scroll 600
say "The summary shows the route through the warehouses and the transfer fee||Le récapitulatif montre le trajet entre entrepôts et les frais de transfert" 4
tap key:place-order 0.5
until key:pending-title 15
say "Airtel Money sandbox: approve the request on your phone||Airtel Money (bac à sable) : approuvez la demande sur votre téléphone" 2.4
until msg:trackOrder 20
say "Payment confirmed: the order is placed||Paiement confirmé : la commande est passée" 2.8
tap msg:trackOrder 2.5
say "Order 1 is tracked from the first minute||La commande 1 est suivie dès la première minute" 3
tohome
tap icon:person_rounded 1.2
tap "text:Wallet#1||text:Portefeuille#1" 1.8
say "Wallet: balance and history, topped up from mobile money||Portefeuille : solde et historique, rechargé par mobile money" 3.4
tap key:wallet-topup 1.5
type key:topup-amount "100"
tap key:mm-orange_money 0.8
say "Top up $100 with Orange Money (sandbox)||Recharge de 100 $ par Orange Money (bac à sable)" 2.8
tap key:topup-submit 0.5
wait 4
say "The wallet is credited and the transaction is in the history||Le portefeuille est crédité et la transaction apparaît dans l'historique" 3.6
tohome
say "Order 2: the English-written T-shirt, shown in French, paid from the wallet||Commande 2 : le t-shirt écrit en anglais, affiché en français, payé par le portefeuille" 3.8
tap icon:home_rounded 0.8
tap msg:search 1.2
type field:0 "cotton||coton"
wait 1.5
tap "textc:Blue Cotton||textc:T-shirt bleu" 2.4
tap key:pd-buy-now 2.4
tap key:pay-wallet 1
say "Pay with the Somba&Teka wallet||Paiement avec le portefeuille Somba&Teka" 2.6
scroll 600
tap key:place-order 0.5
until msg:trackOrder 20
say "Paid from the wallet: confirmed at once||Payé par le portefeuille : confirmé aussitôt" 3
tap msg:trackOrder 2.5
wait 1.5
