/**
 * Server error messages in the viewer's language.
 *
 * The API answers every failure with a stable English sentence (`{ ok: false, error }`). `socketClient.request` runs the
 * message through `localizeApiError` before it rejects, so every page that shows `error.message` shows French to a
 * French reader without knowing about it. English readers get the sentence untouched.
 *
 * Exact sentences live in `EXACT`; sentences with a number, a name or a status in them live in `PATTERNS`.
 * A message we do not know is passed through as-is: showing English beats hiding the problem.
 * Source of every sentence: `docs/contracts/{logistics,commerce,after-sale,seller-platform}.md`.
 */

export type ErrLocale = "en" | "fr";

const EXACT: Record<string, string> = {
  // ── generic / auth ──
  "Request failed.": "La requête a échoué.",
  "Socket not connected.": "Connexion perdue. Réessayez dans un instant.",
  "Sign in to continue.": "Connectez-vous pour continuer.",
  "Not allowed.": "Action non autorisée.",
  "Customers only.": "Réservé aux clients.",
  "Sellers only.": "Réservé aux vendeurs.",
  "Admins only.": "Réservé aux administrateurs.",
  "Ops only.": "Réservé à l'équipe opérations.",
  "Warehouse staff only.": "Réservé au personnel d'entrepôt.",
  "Too many requests — slow down.": "Trop de requêtes. Ralentissez un instant.",
  "Too many requests - slow down.": "Trop de requêtes. Ralentissez un instant.",

  // ── logistics ──
  "Your warehouse assigns your tasks. You cannot accept a task yourself.": "Votre entrepôt vous assigne vos tâches. Vous ne pouvez pas en accepter une vous-même.",
  "Your account is not linked to a warehouse. Ask an administrator.": "Votre compte n'est lié à aucun entrepôt. Contactez un administrateur.",
  "Only supervisors and managers can assign riders.": "Seuls les superviseurs et les responsables peuvent assigner des livreurs.",
  "Only managers can change staff tiers.": "Seuls les responsables peuvent modifier le niveau du personnel.",
  "Only managers can see the staff list.": "Seuls les responsables peuvent voir la liste du personnel.",
  "Only an administrator can make someone a manager.": "Seul un administrateur peut nommer un responsable.",
  "You cannot change your own tier.": "Vous ne pouvez pas modifier votre propre niveau.",
  "This person works at another warehouse.": "Cette personne travaille dans un autre entrepôt.",
  "Only warehouse staff have a tier.": "Seul le personnel d'entrepôt a un niveau.",
  "This task belongs to another warehouse.": "Cette tâche appartient à un autre entrepôt.",
  "This rider works at another warehouse.": "Ce livreur travaille dans un autre entrepôt.",
  "Choose an active rider.": "Choisissez un livreur actif.",
  "This delivery is no longer available.": "Cette livraison n'est plus disponible.",
  "This parcel is not due at your warehouse.": "Ce colis n'est pas attendu dans votre entrepôt.",
  "This parcel was already scanned in.": "Ce colis a déjà été scanné.",
  "A failed task cannot be scanned in.": "Une tâche échouée ne peut pas être scannée.",
  "This task is finished by the rider, not scanned in.": "Cette tâche est terminée par le livreur, pas par un scan.",
  "This leg ends at the warehouse: warehouse staff scan the parcel in.": "Ce trajet se termine à l'entrepôt : le personnel scanne le colis à l'arrivée.",
  "This parcel does not leave from your warehouse.": "Ce colis ne part pas de votre entrepôt.",
  "Assign a rider before handing the parcel over.": "Assignez un livreur avant de lui remettre le colis.",
  "Pin your delivery address on the map.": "Placez votre adresse de livraison sur la carte.",
  "Delivery is not available right now: no warehouse is open.": "La livraison n'est pas disponible pour le moment : aucun entrepôt n'est ouvert.",
  // ── areas: geography, coverage, served areas (docs/contracts/areas.md) ──
  "Choose where this warehouse is.": "Choisissez où se trouve cet entrepôt.",
  "A lane connects two different warehouses.": "Une liaison relie deux entrepôts différents.",
  "Active must be true or false.": "« Active » doit être vrai ou faux.",
  "Bidirectional must be true or false.": "« Dans les deux sens » doit être vrai ou faux.",
  "Aliases must be a list of names.": "Les alias doivent être une liste de noms.",
  "An area with this code already exists.": "Une zone avec ce code existe déjà.",
  "An area with this name already exists here.": "Une zone portant ce nom existe déjà à cet endroit.",
  "Choose at least one area.": "Choisissez au moins une zone.",
  "Choose at least one parcel.": "Choisissez au moins un colis.",
  "Choose parcels of this run.": "Choisissez des colis de cette navette.",
  "Choose some of the parcels of this run, not all of them.": "Choisissez une partie des colis de cette navette, pas tous.",
  "Code may only contain letters, digits and hyphens.": "Le code ne peut contenir que des lettres, des chiffres et des tirets.",
  "Hub not found.": "Entrepôt introuvable.",
  "Lane not found.": "Liaison introuvable.",
  "Run not found.": "Navette introuvable.",
  "That parcel is not in this run.": "Ce colis n'est pas dans cette navette.",
  "This run has no parcels left to send.": "Cette navette n'a plus de colis à envoyer.",
  "This run has not left yet.": "Cette navette n'est pas encore partie.",
  "This run is already closed.": "Cette navette est déjà clôturée.",
  "Staff only.": "Réservé au personnel.",
  "Status must be in_transit.": "Le statut doit être « en route ».",
  // checkout routing + runs (docs/contracts/areas.md, "Routing and checkout" / "Lanes and runs")
  "Delivery between cities is not available right now.": "La livraison entre villes n'est pas disponible pour le moment.",
  "One seller in your cart cannot ship from their area yet.": "Un vendeur de votre panier ne peut pas encore expédier depuis sa zone.",
  "This parcel is part of a transfer run. Manage it from the run.": "Ce colis fait partie d'une navette de transfert. Gérez-le depuis la navette.",
  "We don't deliver to this area yet.": "Nous ne livrons pas encore dans cette zone.",
  "Address not found.": "Adresse introuvable.",
  "A hub with this name already exists.": "Un entrepôt portant ce nom existe déjà.",
  "You cannot deactivate the last active hub.": "Vous ne pouvez pas désactiver le dernier entrepôt actif.",
  // lanes and transfer runs (docs/contracts/areas.md, Multi-warehouse transfers)
  "This run has already left.": "Cette navette est déjà partie.",
  "Only parcels waiting at this warehouse can join this run.": "Seuls les colis qui attendent dans cet entrepôt peuvent rejoindre cette navette.",
  "Choose a driver for this run first.": "Choisissez d'abord un chauffeur pour cette navette.",
  "These warehouses are not connected by any lane.": "Ces entrepôts ne sont reliés par aucune liaison.",
  "Area not found.": "Zone introuvable.",
  "A warehouse cannot cover an area it is not allowed to serve.": "Un entrepôt ne peut pas couvrir une zone qu'il n'a pas le droit de desservir.",
  "Your pickup area is not served yet. You can prepare your store; sales open when we deliver there.": "Votre zone de collecte n'est pas encore desservie. Vous pouvez préparer votre boutique ; les ventes ouvriront dès que nous livrerons chez vous.",
  "Place the warehouse on the map: latitude and longitude are required.": "Placez l'entrepôt sur la carte : la latitude et la longitude sont requises.",
  "Enter a valid latitude (-90 to 90) and longitude (-180 to 180).": "Saisissez une latitude (-90 à 90) et une longitude (-180 à 180) valides.",
  "Enter a valid pickup location: latitude -90 to 90 and longitude -180 to 180.": "Saisissez un lieu de collecte valide : latitude -90 à 90 et longitude -180 à 180.",
  "Pin your pickup location on the map (Store settings) before listing products.": "Placez votre lieu de collecte sur la carte (Paramètres de la boutique) avant de publier des produits.",
  "Riders and warehouse staff must belong to a warehouse. Pick one from the list.": "Les livreurs et le personnel d'entrepôt doivent appartenir à un entrepôt. Choisissez-en un dans la liste.",
  "Pick an active warehouse from the list.": "Choisissez un entrepôt actif dans la liste.",
  "This order has no destination warehouse.": "Cette commande n'a pas d'entrepôt de destination.",
  "One of the returned items is not on this order.": "L'un des articles retournés ne figure pas sur cette commande.",
  "Choose a warehouse.": "Choisissez un entrepôt.",
  "Riders only.": "Réservé aux livreurs.",
  "Invalid code.": "Code invalide.",
  "This code has expired.": "Ce code a expiré.",
  "This code is no longer available.": "Ce code n'est plus disponible.",
  "You have already used this code.": "Vous avez déjà utilisé ce code.",
  "Delivery task not found.": "Tâche de livraison introuvable.",
  "This delivery was just updated. Refresh and try again.": "Cette livraison vient d'être mise à jour. Actualisez et réessayez.",
  "Wrong delivery code. Ask the customer for the 4-digit code shown in their app.": "Code de livraison incorrect. Demandez au client le code à 4 chiffres affiché dans son application.",
  "Delivery attempt failed": "Tentative de livraison échouée",

  // ── commerce: finance / inventory / promotions / products / orders ──
  "Enter a whole number of units to add or remove (not zero).": "Saisissez un nombre entier d'unités à ajouter ou retirer (pas zéro).",
  "Reason must be one of: manual_adjust, replacement, return_restock.": "Le motif doit être : manual_adjust, replacement ou return_restock.",
  "This product has no options.": "Ce produit n'a pas d'options.",
  "The low-stock alert must be a whole number from 0 to 100,000.": "L'alerte de stock bas doit être un nombre entier de 0 à 100 000.",
  "Add product options (size, colour…) before setting stock per option.": "Ajoutez des options (taille, couleur…) avant de définir le stock par option.",
  "At most 8 pictures per product.": "8 photos maximum par produit.",
  "SKU can use letters, numbers and . _ - / # (up to 60 characters).": "Le SKU peut contenir des lettres, des chiffres et . _ - / # (60 caractères maximum).",
  "Import at most 500 products at a time.": "Importez 500 produits au maximum à la fois.",
  'The file needs a "name" column.': "Le fichier doit contenir une colonne « name ».",
  'The file needs a "price" column.': "Le fichier doit contenir une colonne « price ».",
  "The file is too large (2 MB at most).": "Le fichier est trop volumineux (2 Mo maximum).",
  "The file is too large to send here (900 KB at most): split it, or give a link to it.": "Le fichier est trop volumineux pour être envoyé ici (900 Ko maximum) : découpez-le ou donnez un lien.",
  "The file link must be a secure (https) address.": "Le lien du fichier doit être une adresse sécurisée (https).",
  "Give the seller a reason for rejecting this campaign (at least 3 characters).": "Donnez au vendeur un motif de rejet de cette campagne (3 caractères minimum).",
  "The end date of this campaign has already passed: ask the seller to change the dates.": "La date de fin de cette campagne est déjà passée : demandez au vendeur de modifier les dates.",
  "Only a draft or a rejected campaign can be sent to marketing.": "Seule une campagne en brouillon ou rejetée peut être envoyée au marketing.",
  'Kind must be "view" or "click".': "Le type doit être « view » ou « click ».",
  "The end of a flash sale must be after its start.": "La fin d'une vente flash doit être postérieure à son début.",
  "You can only propose a flash sale on your own products.": "Vous ne pouvez proposer une vente flash que sur vos propres produits.",
  "You already proposed a flash sale for this product: wait for marketing to answer.": "Vous avez déjà proposé une vente flash pour ce produit : attendez la réponse du marketing.",
  "Give the date the flash sale ends.": "Indiquez la date de fin de la vente flash.",
  "This flash sale is not waiting for a decision.": "Cette vente flash n'attend pas de décision.",
  "Give the seller a reason for declining (at least 3 characters).": "Donnez au vendeur un motif de refus (3 caractères minimum).",
  "A store can hold 50 coupons: delete one you no longer use.": "Une boutique peut avoir 50 coupons : supprimez-en un que vous n'utilisez plus.",
  "Your store must be approved before you can issue coupons.": "Votre boutique doit être approuvée avant de pouvoir émettre des coupons.",
  "The expiry date must be in the future.": "La date d'expiration doit être dans le futur.",
  "This coupon applies to one store’s products: add them to your cart first.": "Ce coupon s'applique aux produits d'une seule boutique : ajoutez-les d'abord à votre panier.",
  "This coupon applies to one store's products: add them to your cart first.": "Ce coupon s'applique aux produits d'une seule boutique : ajoutez-les d'abord à votre panier.",
  "Choose a month like 2026-10.": "Choisissez un mois comme 2026-10.",
  "State must be one of: in_progress, clearing, available, in_payout, paid_out, returned.": "L'état doit être : in_progress, clearing, available, in_payout, paid_out ou returned.",
  "That month has not started yet.": "Ce mois n'a pas encore commencé.",
  "Choose a store (sellerId).": "Choisissez une boutique (sellerId).",

  // ── after-sale: returns / disputes ──
  "Order not found.": "Commande introuvable.",
  "Please describe the problem (at least a few words).": "Décrivez le problème (quelques mots au moins).",
  "This order has not been paid for or was cancelled.": "Cette commande n'a pas été payée ou a été annulée.",
  "You already have an open request for this order.": "Vous avez déjà une demande en cours pour cette commande.",
  "Choose what is wrong from the list.": "Choisissez le problème dans la liste.",
  "Photos must be a list of uploaded images.": "Les photos doivent être une liste d'images téléversées.",
  "Photos must be images uploaded through the app.": "Les photos doivent être des images téléversées via l'application.",
  "You can attach up to 6 photos.": "Vous pouvez joindre jusqu'à 6 photos.",
  "You can return items once the order has been delivered.": "Vous pouvez retourner des articles une fois la commande livrée.",
  "Returns are not accepted at the moment.": "Les retours ne sont pas acceptés pour le moment.",
  "Choose at least one item to return.": "Choisissez au moins un article à retourner.",
  "Choose how many of each item to return.": "Choisissez la quantité à retourner pour chaque article.",
  "An item appears twice in the request.": "Un article apparaît deux fois dans la demande.",
  "One of the items is not on this order.": "L'un des articles ne figure pas sur cette commande.",
  "Only returns need an accept or reject; reply to the customer instead.": "Seuls les retours demandent d'accepter ou de refuser ; répondez plutôt au client.",
  "Tell the customer why you are rejecting this return.": "Expliquez au client pourquoi vous refusez ce retour.",
  "The response time has passed; Somba support decides now.": "Le délai de réponse est dépassé ; le support Somba décide désormais.",
  "This request was already handled.": "Cette demande a déjà été traitée.",
  "This request was just updated by someone else. Refresh and try again.": "Cette demande vient d'être mise à jour par quelqu'un d'autre. Actualisez et réessayez.",
  "Wait for the seller to answer, or for the response time to pass.": "Attendez la réponse du vendeur, ou la fin du délai de réponse.",
  "Only returns can be escalated; a dispute is already with Somba support.": "Seuls les retours peuvent être escaladés ; un litige est déjà chez le support Somba.",
  "It is too late to cancel: the return is already on its way.": "Il est trop tard pour annuler : le retour est déjà en cours.",
  "Give the customer a reason for refusing the return.": "Donnez au client un motif de refus du retour.",
  "Give the customer a reason for refusing.": "Donnez au client un motif de refus.",
  "Returns are approved or refused with returns:decide.": "Les retours sont approuvés ou refusés via la décision de retour.",
  "Use decide for disputes.": "Utilisez la décision pour les litiges.",
  "Outcome must be one of: refund_full, refund_partial, replacement, reject.": "Le résultat doit être : remboursement total, partiel, remplacement ou rejet.",
  "Enter the amount to refund.": "Saisissez le montant à rembourser.",
  "There is nothing left to refund for these items.": "Il ne reste rien à rembourser pour ces articles.",
  "That money was just refunded. Refresh and try again.": "Cet argent vient d'être remboursé. Actualisez et réessayez.",
  "Only admin or finance can issue a refund.": "Seuls l'administrateur ou la finance peuvent émettre un remboursement.",
  "Mark the returned goods as received at the warehouse before refunding.": "Marquez les articles retournés comme reçus à l'entrepôt avant de rembourser.",
  "These goods were already marked as received.": "Ces articles ont déjà été marqués comme reçus.",
  "Only returns have goods to receive.": "Seuls les retours ont des articles à recevoir.",
  "Receive the returned goods first.": "Recevez d'abord les articles retournés.",
  "These goods were already graded.": "Ces articles ont déjà été évalués.",
  "Grade each returned item.": "Évaluez chaque article retourné.",
  "One of the items is not part of this return.": "L'un des articles ne fait pas partie de ce retour.",
  "Condition must be one of: resellable, damaged, unsellable.": "L'état doit être : revendable, endommagé ou invendable.",
  "Only resellable goods go back on the shelf.": "Seuls les articles revendables retournent en rayon.",
  "Only returns have goods to grade.": "Seuls les retours ont des articles à évaluer.",
  "This request is closed.": "Cette demande est clôturée.",
  "Write a message first.": "Écrivez d'abord un message.",
  "Dispute not found.": "Litige introuvable.",
  "Pick the item to replace.": "Choisissez l'article à remplacer.",

  // ── replacements / exchanges ──
  "Order not found or not eligible for a replacement.": "Commande introuvable ou non éligible à un remplacement.",
  "Order not found or not eligible for an exchange.": "Commande introuvable ou non éligible à un échange.",
  "Say which item needs replacing.": "Indiquez quel article doit être remplacé.",
  "Say which item you want to exchange and for what.": "Indiquez l'article à échanger et contre quoi.",
  "That item is not on this order.": "Cet article ne figure pas sur cette commande.",
  "You already asked for a replacement of this item.": "Vous avez déjà demandé le remplacement de cet article.",
  "You already asked to exchange this item.": "Vous avez déjà demandé l'échange de cet article.",
  "Choose a different option to exchange for.": "Choisissez une autre option pour l'échange.",
  "That product is no longer available.": "Ce produit n'est plus disponible.",
  "Not enough stock of that item for an exchange.": "Stock insuffisant de cet article pour un échange.",
  "Not enough stock to send a replacement. Restock the item or reject the request.": "Stock insuffisant pour envoyer un remplacement. Réapprovisionnez l'article ou refusez la demande.",
  "Not enough stock for this exchange. Restock the item or reject the request.": "Stock insuffisant pour cet échange. Réapprovisionnez l'article ou refusez la demande.",
  "Tell the customer why you are rejecting this replacement.": "Expliquez au client pourquoi vous refusez ce remplacement.",
  "Tell the customer why you are rejecting this exchange.": "Expliquez au client pourquoi vous refusez cet échange.",
  "This replacement was just updated by someone else. Refresh and try again.": "Ce remplacement vient d'être mis à jour par quelqu'un d'autre. Actualisez et réessayez.",
  "This exchange was just updated by someone else. Refresh and try again.": "Cet échange vient d'être mis à jour par quelqu'un d'autre. Actualisez et réessayez.",
  "Replacement not found.": "Remplacement introuvable.",
  "Exchange not found.": "Échange introuvable.",

  // ── Q&A / reviews ──
  "Write your question first.": "Écrivez d'abord votre question.",
  "Write an answer first.": "Écrivez d'abord une réponse.",
  "Review not found.": "Avis introuvable.",
  "Tell the moderators what is wrong with this review (5 to 500 characters).": "Dites aux modérateurs ce qui ne va pas dans cet avis (5 à 500 caractères).",
  "You already reported this review.": "Vous avez déjà signalé cet avis.",
  "This review is already hidden.": "Cet avis est déjà masqué.",
  "Write a reply of 2 to 1000 characters.": "Écrivez une réponse de 2 à 1000 caractères.",
  "Give a rating and write a short review.": "Donnez une note et rédigez un court avis.",
  "You can review a product after it has been delivered to you.": "Vous pouvez noter un produit une fois qu'il vous a été livré.",
  "You have already reviewed this product.": "Vous avez déjà noté ce produit.",

  // ── support ──
  "Subject and message are required.": "Le sujet et le message sont requis.",
  "Status must be one of: open, pending, resolved, closed.": "Le statut doit être : ouvert, en attente, résolu ou fermé.",
  "Choose an active admin account.": "Choisissez un compte administrateur actif.",
  "Ticket not found.": "Ticket introuvable.",

  // ── seller platform ──
  "Enter a valid e-mail address.": "Saisissez une adresse e-mail valide.",
  "Choose a role: manager, catalog, orders, finance, support.": "Choisissez un rôle : manager, catalogue, commandes, finance, support.",
  "You already own this store.": "Vous possédez déjà cette boutique.",
  "This e-mail belongs to a shopper or staff account. Invite another address, or ask the person to open a separate seller account.": "Cet e-mail appartient à un compte client ou personnel. Invitez une autre adresse, ou demandez à la personne d'ouvrir un compte vendeur distinct.",
  "This person already owns a store. A store owner cannot join another store as staff.": "Cette personne possède déjà une boutique. Un propriétaire ne peut pas rejoindre une autre boutique comme employé.",
  "This person already works for another store.": "Cette personne travaille déjà pour une autre boutique.",
  "This person is already on your team.": "Cette personne fait déjà partie de votre équipe.",
  "This invitation is no longer valid.": "Cette invitation n'est plus valide.",
  "This invitation has expired. Ask the store owner to send a new one.": "Cette invitation a expiré. Demandez au propriétaire d'en envoyer une nouvelle.",
  "Sign in with your seller account to accept this invitation.": "Connectez-vous avec votre compte vendeur pour accepter cette invitation.",
  "A store owner cannot join another store as staff.": "Un propriétaire ne peut pas rejoindre une autre boutique comme employé.",
  "You already work for a store. Leave it first to join another one.": "Vous travaillez déjà pour une boutique. Quittez-la d'abord pour en rejoindre une autre.",
  "You are sending too many invitations. Try again in an hour.": "Vous envoyez trop d'invitations. Réessayez dans une heure.",
  "Team member not found.": "Membre de l'équipe introuvable.",
  "You do not work for a store.": "Vous ne travaillez pour aucune boutique.",
  "You work for a store as staff. Leave its team before opening your own store.": "Vous travaillez pour une boutique. Quittez son équipe avant d'ouvrir la vôtre.",
  "That code is not right. Check the time on your phone and try again.": "Ce code n'est pas correct. Vérifiez l'heure de votre téléphone et réessayez.",
  "Two-factor authentication is already on. Turn it off first to set it up again.": "L'authentification à deux facteurs est déjà activée. Désactivez-la d'abord pour la reconfigurer.",
  "Start the setup first.": "Commencez d'abord la configuration.",
  "Two-factor authentication is not on.": "L'authentification à deux facteurs n'est pas activée.",
  "Two-factor authentication is not on for this account.": "L'authentification à deux facteurs n'est pas activée pour ce compte.",
  "This sign-in expired. Enter your password again.": "Cette connexion a expiré. Saisissez à nouveau votre mot de passe.",
  "Two-factor authentication is required for seller accounts and cannot be turned off.": "L'authentification à deux facteurs est obligatoire pour les comptes vendeurs et ne peut pas être désactivée.",
  "Two-factor authentication is required for seller accounts. Turn it on in Settings > Security.": "L'authentification à deux facteurs est obligatoire pour les comptes vendeurs. Activez-la dans Paramètres > Sécurité.",
  "Too many wrong codes. Try again in a few minutes.": "Trop de codes erronés. Réessayez dans quelques minutes.",
  "Only shoppers can message a store.": "Seuls les clients peuvent écrire à une boutique.",
  "Store not found.": "Boutique introuvable.",
  "You cannot message your own store.": "Vous ne pouvez pas écrire à votre propre boutique.",
  "A message can have up to 2000 characters.": "Un message peut contenir 2000 caractères au maximum.",
  "That product does not belong to this store.": "Ce produit n'appartient pas à cette boutique.",
  "That order has nothing from this store.": "Cette commande ne contient rien de cette boutique.",
  "You are opening too many conversations. Try again later.": "Vous ouvrez trop de conversations. Réessayez plus tard.",
  "You are sending messages too fast. Wait a moment.": "Vous envoyez des messages trop vite. Patientez un instant.",
  "Conversation not found.": "Conversation introuvable.",
  "Attach up to 4 photos.": "Joignez jusqu'à 4 photos.",
  "Attachment must be an image uploaded through the platform.": "La pièce jointe doit être une image téléversée via la plateforme.",
  "Your store is suspended: you can read messages but not reply.": "Votre boutique est suspendue : vous pouvez lire les messages mais pas répondre.",
  "Nothing to translate.": "Rien à traduire.",
  "Handling time must be a whole number of days from 0 to 14.": "Le délai de préparation doit être un nombre entier de jours de 0 à 14.",
  "Enter a valid return date, or clear it to reopen the store.": "Saisissez une date de retour valide, ou effacez-la pour rouvrir la boutique.",
  "Choose a return date in the future. To reopen now, clear the date.": "Choisissez une date de retour dans le futur. Pour rouvrir maintenant, effacez la date.",
  "A vacation can last at most one year.": "Des vacances peuvent durer un an au maximum.",
  "Returns policy must be 10-2000 characters.": "La politique de retour doit faire entre 10 et 2000 caractères.",
  "Open a store first.": "Ouvrez d'abord une boutique.",
  "Your store is suspended: you can only view orders and earnings until it is reinstated.": "Votre boutique est suspendue : vous ne pouvez consulter que les commandes et les gains jusqu'à sa réactivation.",
  "notify must be an object of true/false switches.": "notify doit être un objet d'interrupteurs vrai/faux.",
  "The store owner has not saved a payout account yet.": "Le propriétaire n'a pas encore enregistré de compte de versement.",
  "No file uploaded (field name \"file\").": "Aucun fichier téléversé.",
  "Only JPEG, PNG, WebP or PDF files are allowed.": "Seuls les fichiers JPEG, PNG, WebP ou PDF sont autorisés.",
  "Only JPEG, PNG, WebP or HEIC images are allowed.": "Seules les images JPEG, PNG, WebP ou HEIC sont acceptées.",
  "The file is too large (5 MB at most).": "Le fichier est trop volumineux (5 Mo maximum).",
  "Document is not valid. Upload it again.": "Le document n'est pas valide. Téléversez-le à nouveau.",
  "File not found.": "Fichier introuvable.",
  "Upload between 1 and 5 identity or business documents.": "Téléversez entre 1 et 5 documents d'identité ou d'entreprise.",
  "Document is not a valid image.": "Le document n'est pas une image valide.",

  // ── areas contract, second pass: validation, warehouse directory, addresses and desk sentences the first list omitted ──
  "Flatten must be 'commune'.": "Le paramètre « flatten » doit valoir « commune ».",
  "Tier must be one of: operator, supervisor, manager.": "Le niveau doit être : opérateur, superviseur ou responsable.",
  "Street address and city are required.": "La rue et la ville sont obligatoires.",
  "This parcel is not due at a warehouse.": "Ce colis n'est attendu dans aucun entrepôt.",
  "This parcel does not leave from a warehouse.": "Ce colis ne part d'aucun entrepôt.",
  "A rider must collect this parcel before it can be scanned in.": "Un livreur doit d'abord récupérer ce colis avant qu'il puisse être scanné.",
  "A replacement or an exchange is required.": "Un remplacement ou un échange est requis.",

  // ── misc existing ──
  "Not enough stock": "Stock insuffisant",
  "Order not found": "Commande introuvable",
};

type Rule = [RegExp, (m: RegExpExecArray) => string];

/** French for the fields the geography and lane forms validate (`str` / `num` messages on the server). */
const AREA_FIELDS_FR: Record<string, string> = {
  Name: "Le nom",
  "English name": "Le nom anglais",
  "Google name": "Le nom Google",
  "Google name (English)": "Le nom Google (anglais)",
  Alias: "Un alias",
  Code: "Le code",
  "Transit time (hours)": "Le temps de transit (heures)",
  "Lane cost": "Le coût de la liaison",
  "Flat delivery fee": "Le tarif de livraison fixe",
  Order: "L'ordre d'affichage",
  "Hub name": "Le nom de l'entrepôt",
  Hub: "L'entrepôt",
  City: "La ville",
  Country: "Le pays",
  Address: "L'adresse",
  Capacity: "La capacité",
  Case: "Le dossier",
};
const AREA_LEVEL_ADD_FR: Record<string, string> = { country: "un pays", province: "une province", city: "une ville", district: "un district", commune: "une commune", quartier: "un quartier" };
const areaField = (f: string) => AREA_FIELDS_FR[f] ?? f;

const PATTERNS: Rule[] = [
  [/^(.+) must be (\d+)-(\d+) characters\.$/, (m) => `${areaField(m[1])} : ${m[2]} à ${m[3]} caractères.`],
  [/^(.+) must be (?:a number|a whole number) between (\d+) and (\d+)\.$/, (m) => `${areaField(m[1])} : un nombre entre ${m[2]} et ${m[3]}.`],
  [/^Level must be one of: .+\.$/, () => "Le niveau doit être : pays, province, ville, district, commune ou quartier."],
  [/^A (\w+) cannot be added under a (\w+)\.$/, (m) => `Impossible d'ajouter ${AREA_LEVEL_ADD_FR[m[1]] ?? m[1]} sous ${AREA_LEVEL_ADD_FR[m[2]] ?? m[2]}.`],
  [/^Parcel missing from run (.+)\.$/, (m) => `Colis manquant dans la navette ${m[1]}.`],
  [/^This area is already covered by (.+)\.$/, (m) => `Cette zone est déjà couverte par ${m[1]}.`],
  [/^We don[’']t deliver to (.+) yet\.$/, (m) => `Nous ne livrons pas encore à ${m[1]}.`],
  [/^Returns are accepted within (\d+) days? of delivery, and that time has passed\.$/, (m) => `Les retours sont acceptés dans les ${m[1]} jours suivant la livraison, et ce délai est dépassé.`],
  [/^You can return at most (\d+) of "(.+)"\.$/, (m) => `Vous pouvez retourner au maximum ${m[1]} × « ${m[2]} ».`],
  [/^That is more than what is left to refund on this order \(\$([\d.,]+)\)\.$/, (m) => `C'est plus que ce qu'il reste à rembourser sur cette commande ($${m[1]}).`],
  [/^Put back between 0 and (\d+) of "(.+)"\.$/, (m) => `Remettez en rayon entre 0 et ${m[1]} × « ${m[2]} ».`],
  [/^Choose a (.+) for "(.+)"\.$/, (m) => `Choisissez : ${m[1]} pour « ${m[2]} ».`],
  [/^Your wallet balance is too low for the price difference \(\$([\d.,]+)\)\. Top up your wallet and try again\.$/, (m) => `Le solde de votre portefeuille est trop bas pour la différence de prix ($${m[1]}). Rechargez-le et réessayez.`],
  [/^Can't move from (\w+) to (\w+)\.$/, (m) => `Passage impossible de « ${m[1]} » à « ${m[2]} ».`],
  [/^A campaign that is (\w+) cannot become (\w+)\.$/, (m) => `Une campagne « ${m[1]} » ne peut pas passer à « ${m[2]} ».`],
  [/^Only (\d+) of "(.+)" \((.+)\) left in stock\.$/, (m) => `Il ne reste que ${m[1]} × « ${m[2]} » (${m[3]}) en stock.`],
  [/^Only (\d+) of "(.+)" left in stock\.$/, (m) => `Il ne reste que ${m[1]} × « ${m[2]} » en stock.`],
  [/^"(.+)" \((.+)\) is out of stock\.$/, (m) => `« ${m[1]} » (${m[2]}) est en rupture de stock.`],
  [/^"(.+)" is out of stock\.$/, (m) => `« ${m[1]} » est en rupture de stock.`],
  [/^There are only (\d+) in stock for "(.+)": you cannot remove (\d+)\.$/, (m) => `Il n'y en a que ${m[1]} en stock pour « ${m[2]} » : vous ne pouvez pas en retirer ${m[3]}.`],
  [/^Stock for "(.+)" must be a whole number from 0 to 1,000,000\.$/, (m) => `Le stock de « ${m[1]} » doit être un nombre entier de 0 à 1 000 000.`],
  [/^Total stock \((\d+)\) is below the stock set per option \((\d+)\)\.$/, (m) => `Le stock total (${m[1]}) est inférieur au stock défini par option (${m[2]}).`],
  [/^Picture (\d+) must be an upload or a secure \(https\) link\.$/, (m) => `La photo ${m[1]} doit être un fichier téléversé ou un lien sécurisé (https).`],
  [/^The SKU "(.+)" is already used by another of your products\.$/, (m) => `Le SKU « ${m[1]} » est déjà utilisé par un autre de vos produits.`],
  [/^The SKU "(.+)" appears twice in this file\.$/, (m) => `Le SKU « ${m[1]} » apparaît deux fois dans ce fichier.`],
  [/^Your (.+) plan allows (\d+) listings?: upgrade it to add more\.$/, (m) => `Votre offre ${m[1]} autorise ${m[2]} annonce(s) : passez à une offre supérieure pour en ajouter.`],
  [/^Your (.+) plan does not include (.+)\. Upgrade your plan to use it\.$/, (m) => `Votre offre ${m[1]} n'inclut pas ${planPerkFr(m[2])}. Passez à une offre supérieure pour l'utiliser.`],
  [/^Your (.+) plan allows (\d+) team members?\. Upgrade your plan to invite more\.$/, (m) => `Votre offre ${m[1]} autorise ${m[2]} membre(s) d'équipe. Passez à une offre supérieure pour en inviter davantage.`],
  [/^Your team role \((\w+)\) does not allow this\. Ask the store owner\.$/, (m) => `Votre rôle d'équipe (${m[1]}) ne permet pas cette action. Demandez au propriétaire de la boutique.`],
  [/^This coupon only applies to products from (.+)\.$/, (m) => `Ce coupon ne s'applique qu'aux produits de ${m[1]}.`],
  [/^There were no sales in (\d{4}-\d{2}): nothing to invoice\.$/, (m) => `Aucune vente en ${m[1]} : rien à facturer.`],
  [/^Status must be one of: pending, .*to_pack, ready, at_hub\.$/, () => "Statut invalide pour ce filtre."],
  [/^You still have (\d+) orders? in progress\. Finish or cancel them before deleting your account\.$/, (m) => `Vous avez encore ${m[1]} commande(s) en cours. Terminez-les ou annulez-les avant de supprimer votre compte.`],
  [/^A payout is still being processed\. Wait until it is paid before deleting your account\.$/, () => "Un versement est en cours de traitement. Attendez qu'il soit payé avant de supprimer votre compte."],
  [/^You still have \$([\d.,]+) to withdraw\. Request a payout first, then delete your account\.$/, (m) => `Il vous reste $${m[1]} à retirer. Demandez d'abord un versement, puis supprimez votre compte.`],
  [/^Revenue goal must be a number from 0 to 1000000000\.$/, () => "L'objectif de revenus doit être un nombre de 0 à 1 000 000 000."],
  [/^(Orders|Rating|Listings) goal must be a number .*$/, (m) => `L'objectif « ${m[1]} » doit être un nombre valide.`],
  [/^Unknown notification kind: (.+)\.$/, (m) => `Type de notification inconnu : ${m[1]}.`],
  [/^This invitation was sent to another e-mail address\. Sign in with (.+)\.$/, (m) => `Cette invitation a été envoyée à une autre adresse e-mail. Connectez-vous avec ${m[1]}.`],
  [/^Minimum order \$([\d.,]+)\.$/, (m) => `Commande minimum : $${m[1]}.`],
  [/^Not enough stock .*$/, () => "Stock insuffisant."],
  [/^(.+) is on vacation until .+ and is not taking new orders\. \/ (.+)$/, (m) => m[2]],
];

function planPerkFr(perk: string): string {
  const p = perk.toLowerCase();
  if (p.includes("coupon")) return "les coupons vendeur";
  if (p.includes("flash")) return "les ventes flash";
  if (p.includes("import")) return "l'import en masse";
  if (p.includes("promotion")) return "les promotions";
  if (p.includes("team")) return "les comptes d'équipe";
  return perk;
}

const normalise = (m: string) => m.trim().replace(/\s+/g, " ");

/** The message in `locale`. English (and unknown sentences) come back untouched. */
export function localizeApiError(message: string | null | undefined, locale: ErrLocale): string {
  const raw = (message ?? "").toString();
  if (locale !== "fr" || !raw) return raw;
  const msg = normalise(raw);
  const exact = EXACT[msg];
  if (exact) return exact;
  // The same sentence with curly vs straight apostrophes.
  const straight = EXACT[msg.replace(/’/g, "'")];
  if (straight) return straight;
  for (const [re, fn] of PATTERNS) {
    const m = re.exec(msg);
    if (m) return fn(m);
  }
  // A bilingual sentence ("English / Français"): keep the French half.
  const slash = msg.split(" / ");
  if (slash.length === 2 && /\b(est|sont|vous|votre|une?|le|la|les)\b/i.test(slash[1])) return slash[1];
  return raw;
}

/** The locale this tab reads the site in (same storage keys as the LocaleProvider); French by default. */
export function currentLocale(): ErrLocale {
  try {
    if (typeof window === "undefined") return "fr";
    const v = window.localStorage.getItem("somba-locale") ?? window.localStorage.getItem("somba-locale-account");
    return v === "en" ? "en" : "fr";
  } catch {
    return "fr";
  }
}
