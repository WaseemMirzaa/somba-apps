# Clip 10 - notifications inbox: a new notice arrives live, and tapping a notice opens the right screen.
act resetAddresses
include setup-home.sc
flash
say "Account, then Notifications: the inbox of every update||Compte puis Notifications : la boîte de tous les événements" 3.2
tap icon:person_rounded 1.2
tap "text:Notifications#0" 2.2
say "Newest first, with the time and an icon for each kind||Les plus récentes d'abord, avec l'heure et une icône par type" 3.2
cap "A seller writes to the customer: a new notice arrives live||Un vendeur écrit au client : une nouvelle notification arrive en direct" 3.4
act sellerChatReply "text=Your headset is ready to ship, Marie!||text=Votre casque est prêt à être expédié, Marie !"
wait 3.4
tap icon:chat_bubble_outline_rounded#0 2.4
say "A message notice opens the conversation||Une notification de message ouvre la conversation" 3
back 1.4
tap icon:assignment_return_rounded#0 2.4
say "A dispute notice opens the dispute and its thread||Une notification de litige ouvre le litige et sa conversation" 3.2
back 1.4
tap icon:local_shipping_rounded#0 2.4
say "A delivery notice opens the order tracking||Une notification de livraison ouvre le suivi de la commande" 3.2
back 1.4
tap icon:headset_mic_rounded#0 2.4
say "A support notice opens the ticket||Une notification du support ouvre le ticket" 3
back 1.4
tap msg:mark_all 1.6
say "Mark all: the unread badges clear||Tout marquer : les pastilles non lues disparaissent" 2.8
wait 1
