# Clip R6 - earnings, history and support from the rider app.
act riderClear
include rsetup.sc
flash
say "Earnings: the total, deliveries completed and cash collected||Gains : le total, les livraisons effectuées et les espèces encaissées" 3.6
tap "icon:account_balance_wallet_rounded#last" 1.6
wait 2.6
say "Cash from cash-on-delivery is handed over at the warehouse, which records it||Les espèces sont remises à l'entrepôt, qui les enregistre" 3.6
tap "icon:two_wheeler_rounded#last" 1.4
tap key:tab-1 1.6
say "History: every finished task with its status||Historique : chaque tâche terminée avec son statut" 3
scroll 500
wait 1.4
say "Delivered, Scanned in, Failed: the rider keeps the full trail||Livrée, Réceptionnée, Échouée : le livreur garde tout l'historique" 3.4
tap "icon:person_rounded#last" 1.4
tap key:support-entry 1.8
say "Support: tickets to the Somba&Teka team, from the rider app||Support : des tickets à l'équipe Somba&Teka, depuis l'app livreur" 3.2
tap key:support-new 1.8
tap keyp:cat-#1 0.8
type key:ticket-subject "Gate closed at the warehouse||Portail fermé à l'entrepôt" 30
type key:ticket-message "The side gate was locked at 6 pm, I waited 15 minutes.||Le portail latéral était fermé à 18 h, j'ai attendu 15 minutes." 30
photo /Users/macuser/somba-build/appdemo/assets/seller-proof.png
tap key:ticket-add-photos 1
wait 1.4
say "A ticket with a photo attached||Un ticket avec une photo jointe" 2.8
tap key:ticket-submit 1.4
if key:ticket-submit tap key:ticket-submit 1.4
wait 1.2
say "The ticket is sent||Le ticket est envoyé" 2.4
cap "Somba support answers from the admin console||Le support Somba répond depuis la console d'administration" 3
act supportReply "text=Thanks Jean, we told the warehouse to leave the gate open.||text=Merci Jean, nous avons demandé à l'entrepôt de laisser le portail ouvert."
wait 3.4
say "The ticket opens as a thread: the reply appears live||Le ticket s'ouvre en fil : la réponse apparaît en direct" 3.4
wait 1
