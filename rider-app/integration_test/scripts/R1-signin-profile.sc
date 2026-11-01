# Clip R1 - rider sign-in, profile (home warehouse, areas, language) and the online state.
act riderClear
include rsetup-logout.sc
flash
cap "The rider app starts in French here: the language button switches it||L'app livreur démarre en anglais ici : le bouton de langue la change" 3.6
wait 3.6
tap key:lang-toggle 1.2
say "Sign in with the rider account created by the fleet team||Connexion avec le compte livreur créé par l'équipe flotte" 3
type key:rider-email "rider@somba.app"
type key:rider-password "{{DEMO_PASSWORD}}"
tap key:rider-signin 0.5
until key:conn-status 40
wait 1.2
say "Signed in: the shift is Online, with Active and Done tabs||Connecté : le service est En ligne, avec les onglets Actives et Terminées" 3.6
tap "icon:person_rounded#last" 1.4
say "Profile: name, phone and language||Profil : nom, téléphone et langue" 2.8
tap "text:FR||text:EN" 1.4
say "The language changes at once||La langue change aussitôt" 2.4
tap "text:EN||text:FR" 1.2
say "Home warehouse: Entrepôt Kinshasa, with its address||Entrepôt d'attache : Entrepôt Kinshasa, avec son adresse" 3.4
scroll 250
say "Areas we cover: the warehouse assigns the tasks of these areas||Zones couvertes : l'entrepôt affecte les tâches de ces zones" 3.6
scroll 400
say "Support and the notifications of new tasks||Le support et les notifications de nouvelles tâches" 3
tap "icon:two_wheeler_rounded#last" 1.4
say "Back on Deliveries: nothing assigned yet, new tasks appear live||De retour sur les livraisons : rien d'affecté, les nouvelles tâches arrivent en direct" 3.6
wait 1
