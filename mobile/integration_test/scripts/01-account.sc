# Clip 01 - sign-in and account: language switch, verification, addresses (add with the map pin, edit, default, not served).
#pre resetAddresses
#pre unverify
include setup-logout.sc
flash
cap "The sign-in screen opens in French. The language button switches it.||L'écran de connexion s'ouvre en anglais. Le bouton de langue le change." 3.2
wait 3.2
tap key:lang-toggle 1.2
say "Sign in with the customer account||Connexion avec le compte client" 2.2
type key:login-email "customer@somba.app"
type key:login-password "{{DEMO_PASSWORD}}"
tap msg:sign_in 0.6
until icon:person_rounded 40
wait 1.5
tap icon:person_rounded
say "Account: orders, wishlist, wallet and language||Compte : commandes, favoris, portefeuille, langue" 2.8
# language switch: live, applied to the account
tap "text:FR||text:EN" 1.6
say "Language switch: the whole app changes at once and is saved on the account||Changement de langue : toute l'app bascule et le choix est enregistré sur le compte" 3.4
tap "text:EN||text:FR" 1.2
# email verification
tap key:email-badge 1.2
say "Email not verified yet. The sandbox shows the link token.||E-mail pas encore vérifié. Le bac à sable affiche le jeton du lien." 3.2
grab key:email-dev tok "([0-9a-f]{32,})"
act verifyEmail token=$tok
cap "Link opened: the email is verified||Lien ouvert : l'e-mail est vérifié" 2.4
tap msg:ve_continue 1.2
wait 1.6
# phone verification (profile)
scroll 400
tap msg:edit_profile 1.2
say "Edit profile: the phone is not verified yet||Modifier le profil : le téléphone n'est pas encore vérifié" 3
tap key:verify-phone 1.5
until key:otp-dev 10
grab key:otp-dev code "(\d{6})"
say "A code is sent by SMS (shown here in the dev build)||Un code est envoyé par SMS (affiché ici en version de développement)" 3
each otp- $code
tap msg:verify 1.5
wait 1.5
# addresses
back 1
scroll -800
tap "text:Addresses||text:Adresses" 1.4
say "Saved addresses: Home is the default one||Adresses enregistrées : Home est l'adresse par défaut" 2.8
tap key:add-address 1.2
say "New address: the delivery pin is required, so the rider goes exactly there||Nouvelle adresse : le repère sur la carte est obligatoire pour le livreur" 3.6
tap key:pick-location 2.5
cap "The map opens on my location: Masina||La carte s'ouvre sur ma position : Masina" 2.6
tap key:picker-my-location 3.5
type key:picker-street "Avenue Kimbuta 14"
tap key:picker-confirm 2.5
say "Province, city and commune fill in from the pin: Delivered from Entrepôt Limete||Province, ville et commune se remplissent depuis le repère : livrée depuis Entrepôt Limete" 4
type key:address-landmark "Near the Masina market, green gate||Près du marché de Masina, portail vert"
type field:0 "Work (Masina)||Travail (Masina)"
tap key:save-address 2.5
say "Saved: the new address is in the list||Enregistrée : la nouvelle adresse est dans la liste" 2.6
# edit it
tap keyp:address-menu-#last 0.9
tap key:address-edit 1.6
say "Edit an address: the landmark changes||Modifier une adresse : le point de repère change" 2.6
type key:address-landmark "Opposite the Masina market, green gate||En face du marché de Masina, portail vert"
tap key:save-address 2.4
# make it the default
tap keyp:address-menu-#last 0.9
tap key:address-make-default 1.8
say "Set as the default address: the Default tag moves||Adresse par défaut : l'étiquette Par défaut se déplace" 3
# an address outside the delivery zone
act location lat=-1.6792 lng=29.2228
tap key:add-address 1.2
tap key:pick-location 2.5
cap "A pin in Goma: the map follows it||Un repère à Goma : la carte le suit" 2.6
tap key:picker-my-location 3.5
type key:picker-street "Avenue de la Paix 3"
tap key:picker-confirm 2.5
say "Goma is filled in, but we don't deliver there yet||Goma est reconnue, mais nous n'y livrons pas encore" 3.6
type field:0 "Goma office||Bureau Goma"
tap key:save-address 2.5
say "It can still be saved: the list tags it Not served yet||Elle peut être enregistrée : la liste la marque Pas encore desservie" 3.4
scroll 300
wait 1.5
