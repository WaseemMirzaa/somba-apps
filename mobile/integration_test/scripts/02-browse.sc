# Clip 02 - browse and search: categories, deals and flash sale, filters, a search with typos, product page with options,
# delivery time, store page, wishlist, a question to the seller.
#pre resetBrowse
include setup-home.sc
flash
say "Home: search, quick links, top categories and deals||Accueil : recherche, raccourcis, catégories populaires et offres" 3.2
scroll 420
wait 1
tap icon:local_fire_department_rounded 1.5
say "Deals tab: the flash sale runs on a live countdown||Onglet Offres : la vente flash suit un compte à rebours en direct" 3.4
scroll 300
wait 0.8
tap icon:grid_view_rounded 1.3
say "Categories, with the number of items in each||Catégories, avec le nombre d'articles de chacune" 2.8
tap "text:Fashion||text:Mode" 1.8
say "Fashion: sort chips on top, a Filters button next to them||Mode : des tris en haut et un bouton Filtres à côté" 3
tap "textc:Filters||textc:Filtres" 1.5
say "Filters: sort, category, price range, rating, deals only||Filtres : tri, catégorie, prix, note, promotions uniquement" 3.2
tap msg:filter_sort_1 0.8
tap "text:4.0★+" 0.8
cap "Cheapest first, rated 4.0 and up||Du moins cher au plus cher, noté 4,0 et plus" 2.6
tap "type:FilledButton > textc:results||type:FilledButton > textc:résultats" 1.8
wait 1.5
back 1
tap icon:home_rounded 1
tap msg:search 1.5
say "Search tolerates typos: type 'sonny hedphones'||La recherche tolère les fautes : on tape « cqsque sonny »" 3
type field:0 "sonny hedphones||cqsque sonny"
wait 1.5
say "The Sony headphones are found anyway||Le casque Sony est trouvé malgré tout" 2.6
tap "textc:Sony WH-1000||textc:Casque Sony" 2.5
say "Product page: price, stock, delivery time and the seller||Fiche produit : prix, stock, délai de livraison et vendeur" 3.4
tap key:pd-delivery 0.3
scroll 250
tap icon:favorite_border_rounded#0 1
cap "Heart: saved to the wishlist||Cœur : ajouté aux favoris" 2.4
wait 2.4
tap key:visit-store 2.5
say "Seller store page: rating, products and a way to message the seller||Page boutique : note, produits et message au vendeur" 3.6
scroll 300
wait 1
back 1.2
back 1.2
back 1.2
tap icon:home_rounded 1
tap msg:search 1.5
type field:0 "nike"
wait 1.5
tap "text:Nike Air Max 270" 2.5
say "Product with options: size and colour||Produit avec options : pointure et couleur" 3
tap key:variant-Size-42 0.8
tap key:variant-Colour-Black 0.8
say "The chosen options travel with the order||Les options choisies suivent la commande" 2.6
scroll 700
tap key:qa-ask 1.2
type key:qa-field "Does the black pair run true to size?||La paire noire taille-t-elle normalement ?"
cap "Ask the seller a question about the product||Poser une question au vendeur sur le produit" 2.6
tap "msg:pd_submit_question" 2
say "The question waits for the seller's answer||La question attend la réponse du vendeur" 2.6
act answerQuestion "text=Yes, order your usual size.||text=Oui, prenez votre pointure habituelle."
say "The seller answers: it appears at once under the question||Le vendeur répond : la réponse apparaît aussitôt sous la question" 3.4
back 1.2
back 1.2
tap icon:person_rounded 1.2
tap "text:Wishlist||text:Favoris" 1.8
say "Wishlist: the Sony headphones saved earlier||Favoris : le casque Sony enregistré tout à l'heure" 3
wait 1
