# Clip 09 - chat with the seller (Message the seller) and a platform support ticket with a photo.
#pre resetAddresses
#pre resetChats
include setup-home.sc
flash
say "Chat with a seller starts from the product page||Le chat avec un vendeur démarre depuis la fiche produit" 3
tap msg:search 1.2
type field:0 "sony||sony"
wait 1.5
tap "textc:Sony WH-1000||textc:Casque Sony" 2.4
scroll 450
tap key:message-seller 2
say "Message the seller: the product is attached to the conversation||Écrire au vendeur : le produit est joint à la conversation" 3.2
type key:compose-text "Hello, is the headset available in white too?||Bonjour, le casque existe-t-il aussi en blanc ?" 30
tap msg:chat_compose_send 2.6
say "The first message opens the thread||Le premier message ouvre la conversation" 2.8
cap "Kinshasa Traders answers from the seller portal||Kinshasa Traders répond depuis le portail vendeur" 3
act sellerChatReply "text=Hello Marie! Only black and silver for now.||text=Bonjour Marie ! Seulement noir et argent pour le moment."
wait 3.2
say "The answer arrives live in the thread||La réponse arrive en direct dans la conversation" 3
type key:chat-input "Silver is fine, thank you!||L'argent me va très bien, merci !" 30
tap key:chat-send 1.8
say "Replying from the app||On répond depuis l'app" 2.4
tohome
tap icon:person_rounded 1.2
scroll 600
tap key:menu-messages 2
say "My messages: every conversation with a seller||Mes messages : toutes les conversations avec les vendeurs" 3
back 1
tap key:menu-support 2
say "Support: tickets to the Somba&Teka team||Support : des tickets pour l'équipe Somba&Teka" 3
tap msg:ticket_new 2
tap key:ticket-cat-payment 0.8
type key:ticket-subject "Wallet top-up not showing||Recharge du portefeuille absente" 30
type key:ticket-message "I topped up by Orange Money but the receipt looks wrong.||J'ai rechargé par Orange Money mais le reçu semble faux." 30
photo /Users/macuser/somba-build/appdemo/assets/seller-proof.png
tap key:photo-add 1
tap key:photo-library 2.4
say "A new ticket: category, subject, message and a photo||Un nouveau ticket : catégorie, objet, message et une photo" 3.4
tap msg:support_create 2.8
say "The ticket is open with the photo attached||Le ticket est ouvert avec la photo jointe" 3
cap "Somba support answers from the admin console||Le support Somba répond depuis la console d'administration" 3
act supportReply "text=Thanks Marie, we checked: your wallet was credited correctly.||text=Merci Marie, nous avons vérifié : votre portefeuille a bien été crédité."
wait 3
say "The ticket shows In progress with an unread badge||Le ticket passe à En cours avec un badge non lu" 2.8
tap keyp:ticket-tile- 2.2
say "The reply appears in the ticket thread||La réponse apparaît dans le fil du ticket" 3.2
wait 1
