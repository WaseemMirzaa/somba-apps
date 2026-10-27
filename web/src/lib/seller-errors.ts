/**
 * Server error messages in the seller portal, in the viewer's language.
 *
 * The API answers in stable English texts (see docs/contracts/*.md "Errors"). Like `auth-errors.ts`, a known message is
 * mapped to its French text (exact match, ignoring case and the final full stop) or by pattern when the text carries
 * numbers / names; anything else is passed through unchanged (an unknown message beats a hidden one).
 *
 * `errMessage(e)` in `seller-labels.ts` and `sellerRequest()` in `seller-api.ts` both use this, so a page that only
 * does `toast(errMessage(e), "error")` already speaks the portal's language.
 */

const key = (m: string) => m.trim().replace(/[.!\s]+$/, "").toLowerCase();

/** Exact texts (key = lower-case, no final full stop). */
const FR_EXACT: Record<string, string> = {};
function add(en: string, fr: string) {
  FR_EXACT[key(en)] = fr;
}

// ── Generic / socket ───────────────────────────────────────────────────────────────────────────────────────────────
add("Request failed", "La requête a échoué.");
add("Socket not connected", "Connexion au serveur perdue. Rechargez la page.");
add("Too many requests — slow down", "Trop de requêtes : ralentissez un peu.");
add("Too many requests - slow down", "Trop de requêtes : ralentissez un peu.");
add("Sellers only", "Réservé aux vendeurs.");
add("Customers only", "Réservé aux clients.");
add("Admins only", "Réservé aux administrateurs.");
add("Ops only", "Réservé à l'équipe opérationnelle.");
add("Warehouse staff only", "Réservé au personnel de l'entrepôt.");
add("Not allowed", "Action non autorisée.");
add("Open a store first", "Ouvrez d'abord une boutique.");
add("You do not work for a store", "Vous ne travaillez pour aucune boutique.");
add("Choose a store (sellerId)", "Choisissez une boutique.");
add(
  "Your store is suspended: you can only view orders and earnings until it is reinstated",
  "Votre boutique est suspendue : vous ne pouvez consulter que les commandes et les gains tant qu'elle n'est pas rétablie.",
);
add(
  "Two-factor authentication is required for seller accounts. Turn it on in Settings > Security",
  "L'authentification à deux facteurs est obligatoire pour les comptes vendeur. Activez-la dans Paramètres > Sécurité.",
);
add(
  "Your store is suspended: you can read messages but not reply",
  "Votre boutique est suspendue : vous pouvez lire les messages mais pas répondre.",
);

// ── Logistics (contracts/logistics.md §10) ─────────────────────────────────────────────────────────────────────────
add("Your warehouse assigns your tasks. You cannot accept a task yourself", "Votre entrepôt vous assigne vos tâches. Vous ne pouvez pas en accepter une vous-même.");
add("Your account is not linked to a warehouse. Ask an administrator", "Votre compte n'est lié à aucun entrepôt. Contactez un administrateur.");
add("Only supervisors and managers can assign riders", "Seuls les superviseurs et les responsables peuvent assigner des livreurs.");
add("This task belongs to another warehouse", "Cette tâche appartient à un autre entrepôt.");
add("This rider works at another warehouse", "Ce livreur travaille dans un autre entrepôt.");
add("Choose an active rider", "Choisissez un livreur actif.");
add("This delivery is no longer available", "Cette livraison n'est plus disponible.");
add("This parcel is not due at your warehouse", "Ce colis n'est pas attendu dans votre entrepôt.");
add("This parcel was already scanned in", "Ce colis a déjà été scanné.");
add("Pin your delivery address on the map", "Placez votre adresse de livraison sur la carte.");
add("Delivery is not available right now: no warehouse is open", "La livraison n'est pas disponible pour le moment : aucun entrepôt n'est ouvert.");
add("Enter a valid pickup location: latitude -90 to 90 and longitude -180 to 180", "Saisissez un lieu d'enlèvement valide : latitude de -90 à 90 et longitude de -180 à 180.");
add("Pin your pickup location on the map (Store settings) before listing products", "Placez votre lieu d'enlèvement sur la carte (Paramètres de la boutique) avant de publier des produits.");
// Areas: geography, coverage, served areas (docs/contracts/areas.md)
add("Choose where this warehouse is", "Choisissez où se trouve cet entrepôt.");
add("A lane connects two different warehouses", "Une liaison relie deux entrepôts différents.");
add("Active must be true or false", "« Active » doit être vrai ou faux.");
add("Bidirectional must be true or false", "« Dans les deux sens » doit être vrai ou faux.");
add("Aliases must be a list of names", "Les alias doivent être une liste de noms.");
add("An area with this code already exists", "Une zone avec ce code existe déjà.");
add("An area with this name already exists here", "Une zone portant ce nom existe déjà à cet endroit.");
add("Choose at least one area", "Choisissez au moins une zone.");
add("Choose at least one parcel", "Choisissez au moins un colis.");
add("Choose parcels of this run", "Choisissez des colis de cette tournée.");
add("Choose some of the parcels of this run, not all of them", "Choisissez une partie des colis de cette tournée, pas tous.");
add("Code may only contain letters, digits and hyphens", "Le code ne peut contenir que des lettres, des chiffres et des tirets.");
add("Hub not found", "Entrepôt introuvable.");
add("Account not found", "Compte introuvable.");
add("Super admin only", "Réservé au super administrateur.");
add("Only riders and warehouse staff can be switched on or off here", "Seuls les livreurs et le personnel d'entrepôt peuvent être activés ou désactivés ici.");
add("Lane not found", "Liaison introuvable.");
add("Run not found", "Tournée introuvable.");
add("That parcel is not in this run", "Ce colis n'est pas dans cette tournée.");
add("This run has no parcels left to send", "Cette tournée n'a plus de colis à envoyer.");
add("This run has not left yet", "Cette tournée n'est pas encore partie.");
add("This run is already closed", "Cette tournée est déjà clôturée.");
add("Staff only", "Réservé au personnel.");
add("Status must be in_transit", "Le statut doit être « en route ».");
add("Choose a warehouse", "Choisissez un entrepôt.");
add("Riders only", "Réservé aux livreurs.");
add("Delivery between cities is not available right now", "La livraison entre villes n'est pas disponible pour le moment.");
add("One seller in your cart cannot ship from their area yet", "Un vendeur de votre panier ne peut pas encore expédier depuis sa zone.");
add("This parcel is part of a transfer run. Manage it from the run", "Ce colis fait partie d'une tournée de transfert. Gérez-le depuis la tournée.");
add("We don't deliver to this area yet", "Nous ne livrons pas encore dans cette zone.");
add("Address not found", "Adresse introuvable.");
add("This run has already left", "Cette tournée est déjà partie.");
add("Only parcels waiting at this warehouse can join this run", "Seuls les colis qui attendent dans cet entrepôt peuvent rejoindre cette tournée.");
add("Choose a driver for this run first", "Choisissez d'abord un chauffeur pour cette tournée.");
add("These warehouses are not connected by any lane", "Ces entrepôts ne sont reliés par aucune liaison.");
add("Area not found", "Zone introuvable.");
add("A warehouse cannot cover an area it is not allowed to serve", "Un entrepôt ne peut pas couvrir une zone qu'il n'a pas le droit de desservir.");
add(
  "Your pickup area is not served yet. You can prepare your store; sales open when we deliver there",
  "Votre zone de collecte n'est pas encore desservie. Vous pouvez préparer votre boutique ; les ventes ouvriront dès que nous livrerons chez vous.",
);
add("This order has no destination warehouse", "Cette commande n'a pas d'entrepôt de destination.");
add("One of the returned items is not on this order", "Un des articles retournés ne figure pas sur cette commande.");
add("Delivery task not found", "Tâche de livraison introuvable.");
add("This delivery was just updated. Refresh and try again", "Cette livraison vient d'être mise à jour. Actualisez et réessayez.");
// Areas contract, second pass: validation, warehouse directory, addresses and desk sentences the first list omitted
add("Flatten must be 'commune'", "Le paramètre « flatten » doit valoir « commune ».");
add("Enter a valid latitude (-90 to 90) and longitude (-180 to 180)", "Saisissez une latitude (-90 à 90) et une longitude (-180 à 180) valides.");
add("Place the warehouse on the map: latitude and longitude are required", "Placez l'entrepôt sur la carte : la latitude et la longitude sont requises.");
add("A hub with this name already exists", "Un entrepôt portant ce nom existe déjà.");
add("You cannot deactivate the last active hub", "Vous ne pouvez pas désactiver le dernier entrepôt actif.");
add("Only managers can see the staff list", "Seuls les responsables peuvent voir la liste du personnel.");
add("Only managers can change staff tiers", "Seuls les responsables peuvent modifier le niveau du personnel.");
add("Tier must be one of: operator, supervisor, manager", "Le niveau doit être : opérateur, superviseur ou responsable.");
add("Only warehouse staff have a tier", "Seul le personnel d'entrepôt a un niveau.");
add("You cannot change your own tier", "Vous ne pouvez pas modifier votre propre niveau.");
add("This person works at another warehouse", "Cette personne travaille dans un autre entrepôt.");
add("Only an administrator can make someone a manager", "Seul un administrateur peut nommer un responsable.");
add("Street address and city are required", "La rue et la ville sont obligatoires.");
add("This parcel is not due at a warehouse", "Ce colis n'est attendu dans aucun entrepôt.");
add("This parcel does not leave from a warehouse", "Ce colis ne part d'aucun entrepôt.");
add("This task is finished by the rider, not scanned in", "Cette tâche est terminée par le livreur, pas par un scan.");
add("A failed task cannot be scanned in", "Une tâche échouée ne peut pas être scannée.");
add("A rider must collect this parcel before it can be scanned in", "Un livreur doit d'abord récupérer ce colis avant qu'il puisse être scanné.");
add("Assign a rider before handing the parcel over", "Assignez un livreur avant de lui remettre le colis.");
add("This parcel does not leave from your warehouse", "Ce colis ne part pas de votre entrepôt.");
add("A replacement or an exchange is required", "Un remplacement ou un échange est requis.");

// ── After-sale (contracts/after-sale.md §11) ───────────────────────────────────────────────────────────────────────
add("Order not found", "Commande introuvable.");
add("Please describe the problem (at least a few words)", "Décrivez le problème (quelques mots au moins).");
add("This order has not been paid for or was cancelled", "Cette commande n'a pas été payée ou a été annulée.");
add("You already have an open request for this order", "Vous avez déjà une demande en cours pour cette commande.");
add("Choose what is wrong from the list", "Choisissez le problème dans la liste.");
add("Photos must be a list of uploaded images", "Les photos doivent être une liste d'images téléversées.");
add("Photos must be images uploaded through the app", "Les photos doivent être des images téléversées via l'application.");
add("You can attach up to 6 photos", "Vous pouvez joindre jusqu'à 6 photos.");
add("You can return items once the order has been delivered", "Vous pouvez retourner des articles une fois la commande livrée.");
add("Returns are not accepted at the moment", "Les retours ne sont pas acceptés pour le moment.");
add("Choose at least one item to return", "Choisissez au moins un article à retourner.");
add("Choose how many of each item to return", "Indiquez la quantité à retourner pour chaque article.");
add("An item appears twice in the request", "Un article apparaît deux fois dans la demande.");
add("One of the items is not on this order", "Un des articles ne figure pas sur cette commande.");
add("Only returns need an accept or reject; reply to the customer instead", "Seuls les retours demandent une acceptation ou un refus ; répondez plutôt au client.");
add("Tell the customer why you are rejecting this return", "Indiquez au client pourquoi vous refusez ce retour.");
add("The response time has passed; Somba support decides now", "Le délai de réponse est dépassé ; le support Somba décide désormais.");
add("This request was already handled", "Cette demande a déjà été traitée.");
add("This request was just updated by someone else. Refresh and try again", "Cette demande vient d'être modifiée par quelqu'un d'autre. Actualisez et réessayez.");
add("Wait for the seller to answer, or for the response time to pass", "Attendez la réponse du vendeur ou la fin du délai de réponse.");
add("Only returns can be escalated; a dispute is already with Somba support", "Seuls les retours peuvent être escaladés ; un litige est déjà chez le support Somba.");
add("It is too late to cancel: the return is already on its way", "Il est trop tard pour annuler : le retour est déjà en route.");
add("Give the customer a reason for refusing the return", "Donnez au client la raison du refus du retour.");
add("Give the customer a reason for refusing", "Donnez au client la raison du refus.");
add("Returns are approved or refused with returns:decide", "Les retours sont approuvés ou refusés par le support.");
add("Use decide for disputes", "Les litiges sont tranchés par le support.");
add("Enter the amount to refund", "Saisissez le montant à rembourser.");
add("Nothing is left to refund on this order", "Il ne reste rien à rembourser sur cette commande.");
add("There is nothing left to refund for these items", "Il n'y a plus rien à rembourser pour ces articles.");
add("That money was just refunded. Refresh and try again", "Cet argent vient d'être remboursé. Actualisez et réessayez.");
add("Only admin or finance can issue a refund", "Seuls l'administrateur ou la finance peuvent émettre un remboursement.");
add("Mark the returned goods as received at the warehouse before refunding", "Marquez les articles retournés comme reçus à l'entrepôt avant de rembourser.");
add("These goods were already marked as received", "Ces articles ont déjà été marqués comme reçus.");
add("Only returns have goods to receive", "Seuls les retours ont des articles à réceptionner.");
add("Receive the returned goods first", "Réceptionnez d'abord les articles retournés.");
add("These goods were already graded", "Ces articles ont déjà été évalués.");
add("Grade each returned item", "Évaluez chaque article retourné.");
add("One of the items is not part of this return", "Un des articles ne fait pas partie de ce retour.");
add("Condition must be one of: resellable, damaged, unsellable", "L'état doit être : revendable, endommagé ou invendable.");
add("Only resellable goods go back on the shelf", "Seuls les articles revendables retournent en rayon.");
add("Only returns have goods to grade", "Seuls les retours ont des articles à évaluer.");
add("This request is closed", "Cette demande est clôturée.");
add("Write a message first", "Écrivez d'abord un message.");
add("Dispute not found", "Litige introuvable.");
add("Pick the item to replace", "Choisissez l'article à remplacer.");

// Replacements / exchanges
add("Order not found or not eligible for a replacement", "Commande introuvable ou non éligible à un remplacement.");
add("Order not found or not eligible for an exchange", "Commande introuvable ou non éligible à un échange.");
add("Say which item needs replacing", "Indiquez quel article doit être remplacé.");
add("Say which item you want to exchange and for what", "Indiquez quel article échanger et contre quoi.");
add("That item is not on this order", "Cet article ne figure pas sur cette commande.");
add("You already asked for a replacement of this item", "Vous avez déjà demandé le remplacement de cet article.");
add("You already asked to exchange this item", "Vous avez déjà demandé l'échange de cet article.");
add("Choose a different option to exchange for", "Choisissez une autre option pour l'échange.");
add("That product is no longer available", "Ce produit n'est plus disponible.");
add("Not enough stock of that item for an exchange", "Stock insuffisant de cet article pour un échange.");
add("Not enough stock to send a replacement. Restock the item or reject the request", "Stock insuffisant pour envoyer un remplacement. Réapprovisionnez l'article ou refusez la demande.");
add("Not enough stock for this exchange. Restock the item or reject the request", "Stock insuffisant pour cet échange. Réapprovisionnez l'article ou refusez la demande.");
add("Tell the customer why you are rejecting this replacement", "Indiquez au client pourquoi vous refusez ce remplacement.");
add("Tell the customer why you are rejecting this exchange", "Indiquez au client pourquoi vous refusez cet échange.");
add("This replacement was just updated by someone else. Refresh and try again", "Ce remplacement vient d'être modifié par quelqu'un d'autre. Actualisez et réessayez.");
add("This exchange was just updated by someone else. Refresh and try again", "Cet échange vient d'être modifié par quelqu'un d'autre. Actualisez et réessayez.");
add("Replacement not found", "Remplacement introuvable.");
add("Exchange not found", "Échange introuvable.");

// Q&A / reviews
add("Write your question first", "Écrivez d'abord votre question.");
add("Write an answer first", "Écrivez d'abord une réponse.");
add("Review not found", "Avis introuvable.");
add("Tell the moderators what is wrong with this review (5 to 500 characters)", "Expliquez aux modérateurs ce qui ne va pas dans cet avis (5 à 500 caractères).");
add("You already reported this review", "Vous avez déjà signalé cet avis.");
add("This review is already hidden", "Cet avis est déjà masqué.");
add("Write a reply of 2 to 1000 characters", "Écrivez une réponse de 2 à 1000 caractères.");
add("Give a rating and write a short review", "Donnez une note et écrivez un court avis.");
add("You can review a product after it has been delivered to you", "Vous pouvez noter un produit une fois qu'il vous a été livré.");
add("You have already reviewed this product", "Vous avez déjà noté ce produit.");

// Support
add("Subject and message are required", "Le sujet et le message sont obligatoires.");
add("Status must be one of: open, pending, resolved, closed", "Le statut doit être : ouvert, en attente, résolu ou fermé.");
add("Choose an active admin account", "Choisissez un compte administrateur actif.");
add("Ticket not found", "Ticket introuvable.");

// ── Commerce (contracts/commerce.md §7) ────────────────────────────────────────────────────────────────────────────
add("Enter a whole number of units to add or remove (not zero)", "Saisissez un nombre entier d'unités à ajouter ou à retirer (pas zéro).");
add("Reason must be one of: manual_adjust, replacement, return_restock", "Le motif doit être : ajustement manuel, remplacement ou remise en stock après retour.");
add("This product has no options", "Ce produit n'a pas d'options.");
add("The low-stock alert must be a whole number from 0 to 100,000", "L'alerte de stock bas doit être un nombre entier de 0 à 100 000.");
add("Add product options (size, colour…) before setting stock per option", "Ajoutez des options au produit (taille, couleur…) avant de définir le stock par option.");
add("At most 8 pictures per product", "8 photos maximum par produit.");
add("SKU can use letters, numbers and . _ - / # (up to 60 characters)", "Le SKU peut contenir des lettres, des chiffres et . _ - / # (60 caractères maximum).");
add("Import at most 500 products at a time", "Importez 500 produits au maximum à la fois.");
add("The file needs a \"name\" column", "Le fichier doit contenir une colonne « name ».");
add("The file needs a \"price\" column", "Le fichier doit contenir une colonne « price ».");
add("The file is too large (2 MB at most)", "Le fichier est trop volumineux (2 Mo maximum).");
add("The file is too large to send here (900 KB at most): split it, or give a link to it", "Le fichier est trop volumineux pour être envoyé ici (900 Ko maximum) : découpez-le ou donnez un lien.");
add("The file link must be a secure (https) address", "Le lien du fichier doit être une adresse sécurisée (https).");
add("Give the seller a reason for rejecting this campaign (at least 3 characters)", "Donnez au vendeur la raison du rejet de cette campagne (3 caractères minimum).");
add("The end date of this campaign has already passed: ask the seller to change the dates", "La date de fin de cette campagne est dépassée : demandez au vendeur de modifier les dates.");
add("Only a draft or a rejected campaign can be sent to marketing", "Seule une campagne en brouillon ou rejetée peut être envoyée au marketing.");
add("Kind must be \"view\" or \"click\"", "Le type doit être « view » ou « click ».");
add("The end of a flash sale must be after its start", "La fin d'une vente flash doit être postérieure à son début.");
add("You can only propose a flash sale on your own products", "Vous ne pouvez proposer une vente flash que sur vos propres produits.");
add("You already proposed a flash sale for this product: wait for marketing to answer", "Vous avez déjà proposé une vente flash pour ce produit : attendez la réponse du marketing.");
add("Give the date the flash sale ends", "Indiquez la date de fin de la vente flash.");
add("This flash sale is not waiting for a decision", "Cette vente flash n'attend pas de décision.");
add("Give the seller a reason for declining (at least 3 characters)", "Donnez au vendeur la raison du refus (3 caractères minimum).");
add("A store can hold 50 coupons: delete one you no longer use", "Une boutique peut avoir 50 coupons : supprimez-en un que vous n'utilisez plus.");
add("Your store must be approved before you can issue coupons", "Votre boutique doit être approuvée avant de pouvoir émettre des coupons.");
add("The expiry date must be in the future", "La date d'expiration doit être dans le futur.");
add("This coupon applies to one store’s products: add them to your cart first", "Ce coupon s'applique aux produits d'une seule boutique : ajoutez-les d'abord à votre panier.");
add("Choose a month like 2026-10", "Choisissez un mois comme 2026-10.");
add("That month has not started yet", "Ce mois n'a pas encore commencé.");

// ── Seller platform (contracts/seller-platform.md) ─────────────────────────────────────────────────────────────────
add("Enter a valid e-mail address", "Saisissez une adresse e-mail valide.");
add("Choose a role: manager, catalog, orders, finance, support", "Choisissez un rôle : manager, catalogue, commandes, finance ou support.");
add("You already own this store", "Vous êtes déjà propriétaire de cette boutique.");
add("This e-mail belongs to a shopper or staff account. Invite another address, or ask the person to open a separate seller account", "Cet e-mail appartient à un compte client ou employé. Invitez une autre adresse ou demandez à la personne d'ouvrir un compte vendeur distinct.");
add("This person already owns a store. A store owner cannot join another store as staff", "Cette personne possède déjà une boutique. Un propriétaire ne peut pas rejoindre une autre boutique comme employé.");
add("This person already works for another store", "Cette personne travaille déjà pour une autre boutique.");
add("This person is already on your team", "Cette personne fait déjà partie de votre équipe.");
add("This invitation is no longer valid", "Cette invitation n'est plus valide.");
add("This invitation has expired. Ask the store owner to send a new one", "Cette invitation a expiré. Demandez au propriétaire d'en envoyer une nouvelle.");
add("Sign in with your seller account to accept this invitation", "Connectez-vous avec votre compte vendeur pour accepter cette invitation.");
add("A store owner cannot join another store as staff", "Un propriétaire de boutique ne peut pas rejoindre une autre boutique comme employé.");
add("You already work for a store. Leave it first to join another one", "Vous travaillez déjà pour une boutique. Quittez-la d'abord pour en rejoindre une autre.");
add("You are sending too many invitations. Try again in an hour", "Vous envoyez trop d'invitations. Réessayez dans une heure.");
add("Team member not found", "Membre de l'équipe introuvable.");
add("You work for a store as staff. Leave its team before opening your own store", "Vous travaillez pour une boutique comme employé. Quittez son équipe avant d'ouvrir la vôtre.");

add("That code is not right. Check the time on your phone and try again", "Ce code n'est pas correct. Vérifiez l'heure de votre téléphone et réessayez.");
add("Two-factor authentication is already on. Turn it off first to set it up again", "L'authentification à deux facteurs est déjà activée. Désactivez-la d'abord pour la reconfigurer.");
add("Start the setup first", "Commencez d'abord la configuration.");
add("Two-factor authentication is not on", "L'authentification à deux facteurs n'est pas activée.");
add("Two-factor authentication is not on for this account", "L'authentification à deux facteurs n'est pas activée pour ce compte.");
add("This sign-in expired. Enter your password again", "Cette connexion a expiré. Saisissez à nouveau votre mot de passe.");
add("Two-factor authentication is required for seller accounts and cannot be turned off", "L'authentification à deux facteurs est obligatoire pour les comptes vendeur et ne peut pas être désactivée.");
add("Too many wrong codes. Try again in a few minutes", "Trop de codes erronés. Réessayez dans quelques minutes.");

add("Only shoppers can message a store", "Seuls les clients peuvent écrire à une boutique.");
add("Store not found", "Boutique introuvable.");
add("You cannot message your own store", "Vous ne pouvez pas écrire à votre propre boutique.");
add("A message can have up to 2000 characters", "Un message peut contenir 2000 caractères au maximum.");
add("That product does not belong to this store", "Ce produit n'appartient pas à cette boutique.");
add("That order has nothing from this store", "Cette commande ne contient rien de cette boutique.");
add("You are opening too many conversations. Try again later", "Vous ouvrez trop de conversations. Réessayez plus tard.");
add("You are sending messages too fast. Wait a moment", "Vous envoyez des messages trop vite. Patientez un instant.");
add("Conversation not found", "Conversation introuvable.");
add("Attach up to 4 photos", "Joignez 4 photos au maximum.");
add("Attachment must be an image uploaded through the platform", "La pièce jointe doit être une image téléversée via la plateforme.");
add("Nothing to translate", "Rien à traduire.");

add("Handling time must be a whole number of days from 0 to 14", "Le délai de préparation doit être un nombre entier de jours de 0 à 14.");
add("Enter a valid return date, or clear it to reopen the store", "Saisissez une date de retour valide, ou effacez-la pour rouvrir la boutique.");
add("Choose a return date in the future. To reopen now, clear the date", "Choisissez une date de retour dans le futur. Pour rouvrir maintenant, effacez la date.");
add("A vacation can last at most one year", "Des vacances ne peuvent pas durer plus d'un an.");
add("Returns policy must be 10-2000 characters", "La politique de retour doit faire de 10 à 2000 caractères.");
add("Shipping policy must be 10-2000 characters", "La politique d'expédition doit faire de 10 à 2000 caractères.");
add("Revenue goal must be a number from 0 to 1000000000", "L'objectif de chiffre d'affaires doit être un nombre de 0 à 1 000 000 000.");
add("notify must be an object of true/false switches", "Les préférences de notification sont invalides.");
add("The store owner has not saved a payout account yet", "Le propriétaire n'a pas encore enregistré de compte de versement.");

add("No file uploaded (field name \"file\")", "Aucun fichier téléversé.");
add("Only JPEG, PNG, WebP or PDF files are allowed", "Seuls les fichiers JPEG, PNG, WebP ou PDF sont acceptés.");
add("The file is too large (5 MB at most)", "Le fichier est trop volumineux (5 Mo maximum).");
add("Document is not valid. Upload it again", "Le document n'est pas valide. Téléversez-le à nouveau.");
add("File not found", "Fichier introuvable.");
add("Sign in to continue", "Connectez-vous pour continuer.");
add("Upload between 1 and 5 identity or business documents", "Téléversez entre 1 et 5 documents d'identité ou d'entreprise.");
add("Document is not a valid image", "Le document n'est pas une image valide.");
add("Only JPEG, PNG or WebP images are allowed", "Seules les images JPEG, PNG ou WebP sont acceptées.");
add("Only JPEG, PNG, WebP or HEIC images are allowed", "Seules les images JPEG, PNG, WebP ou HEIC sont acceptées.");
add("That image is larger than 5 MB", "Cette image dépasse 5 Mo.");

add("Enter your bank account (holder and IBAN / account number)", "Saisissez votre compte bancaire (titulaire et IBAN / numéro de compte).");
add("Enter the mobile-money number to pay", "Saisissez le numéro mobile money à créditer.");
add("Choose bank or mobile money", "Choisissez virement bancaire ou mobile money.");
add("Your store must be approved before you can request payouts", "Votre boutique doit être approuvée avant de pouvoir demander un versement.");
add("Payout not found", "Versement introuvable.");

// Auth REST messages the portal also shows
add("Current password is incorrect", "Le mot de passe actuel est incorrect.");
add("Password is incorrect", "Le mot de passe est incorrect.");
add("New password must be at least 8 characters", "Le nouveau mot de passe doit contenir au moins 8 caractères.");
add("Password must be at least 8 characters", "Le mot de passe doit contenir au moins 8 caractères.");

// ── Patterns (texts with numbers / names) ──────────────────────────────────────────────────────────────────────────
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
const RULES: Rule[] = [
  [/^(.+) must be (\d+)-(\d+) characters\.?$/i, (m) => `${areaField(m[1])} : ${m[2]} à ${m[3]} caractères.`],
  [/^(.+) must be (?:a number|a whole number) between (\d+) and (\d+)\.?$/i, (m) => `${areaField(m[1])} : un nombre entre ${m[2]} et ${m[3]}.`],
  [/^Level must be one of: .+$/i, () => "Le niveau doit être : pays, province, ville, district, commune ou quartier."],
  [/^A (\w+) cannot be added under a (\w+)\.?$/i, (m) => `Impossible d'ajouter ${AREA_LEVEL_ADD_FR[m[1]] ?? m[1]} sous ${AREA_LEVEL_ADD_FR[m[2]] ?? m[2]}.`],
  [/^Parcel missing from run (.+?)\.?$/i, (m) => `Colis manquant dans la tournée ${m[1]}.`],
  [/^This area is already covered by (.+?)\.?$/i, (m) => `Cette zone est déjà couverte par ${m[1]}.`],
  [/^We don[’']t deliver to this area yet\.?$/i, () => "Nous ne livrons pas encore dans cette zone."],
  [/^We don[’']t deliver to (.+?) yet\.?$/i, (m) => `Nous ne livrons pas encore à ${m[1]}.`],
  [/^Returns are accepted within (\d+) days? of delivery, and that time has passed\.?$/i, (m) => `Les retours sont acceptés dans les ${m[1]} jours suivant la livraison, et ce délai est dépassé.`],
  [/^You can return at most (\d+) of "(.+)"\.?$/i, (m) => `Vous pouvez retourner au maximum ${m[1]} × « ${m[2]} ».`],
  [/^That is more than what is left to refund on this order \((.+)\)\.?$/i, (m) => `C'est plus que ce qui reste à rembourser sur cette commande (${m[1]}).`],
  [/^Put back between 0 and (\d+) of "(.+)"\.?$/i, (m) => `Remettez en stock entre 0 et ${m[1]} × « ${m[2]} ».`],
  [/^Choose a (.+) for "(.+)"\.?$/i, (m) => `Choisissez : ${m[1]} pour « ${m[2]} ».`],
  [/^Your wallet balance is too low for the price difference \((.+)\)\. Top up your wallet and try again\.?$/i, (m) => `Le solde du portefeuille est insuffisant pour la différence de prix (${m[1]}). Rechargez-le et réessayez.`],
  [/^Can't move from (.+) to (.+)\.?$/i, (m) => `Passage impossible de « ${m[1]} » à « ${m[2]} ».`],
  [/^Not enough stock .*$/i, () => "Stock insuffisant."],
  [/^Only (\d+) of "(.+)" \((.+)\) left in stock\.?$/i, (m) => `Il ne reste que ${m[1]} × « ${m[2]} » (${m[3]}) en stock.`],
  [/^Only (\d+) of "(.+)" left in stock\.?$/i, (m) => `Il ne reste que ${m[1]} × « ${m[2]} » en stock.`],
  [/^"(.+)" \((.+)\) is out of stock\.?$/i, (m) => `« ${m[1]} » (${m[2]}) est en rupture de stock.`],
  [/^"(.+)" is out of stock\.?$/i, (m) => `« ${m[1]} » est en rupture de stock.`],
  [/^There are only (\d+) in stock for "(.+)": you cannot remove (\d+)\.?$/i, (m) => `Il n'y en a que ${m[1]} en stock pour « ${m[2]} » : vous ne pouvez pas en retirer ${m[3]}.`],
  [/^Stock for "(.+)" must be a whole number from 0 to 1,000,000\.?$/i, (m) => `Le stock de « ${m[1]} » doit être un nombre entier de 0 à 1 000 000.`],
  [/^Total stock \((\d+)\) is below the stock set per option \((\d+)\)\.?$/i, (m) => `Le stock total (${m[1]}) est inférieur au stock défini par option (${m[2]}).`],
  [/^Picture (\d+) must be an upload or a secure \(https\) link\.?$/i, (m) => `La photo ${m[1]} doit être un fichier téléversé ou un lien sécurisé (https).`],
  [/^The SKU "(.+)" is already used by another of your products\.?$/i, (m) => `Le SKU « ${m[1]} » est déjà utilisé par un autre de vos produits.`],
  [/^The SKU "(.+)" appears twice in this file\.?$/i, (m) => `Le SKU « ${m[1]} » apparaît deux fois dans ce fichier.`],
  [/^Your (.+) plan allows (\d+) listings?: upgrade it to add more\.?$/i, (m) => `Votre formule ${m[1]} autorise ${m[2]} annonce(s) : passez à une formule supérieure pour en ajouter.`],
  [/^Your (.+) plan does not include (.+)\. Upgrade your plan to use it\.?$/i, (m) => `Votre formule ${m[1]} n'inclut pas cette fonction (${m[2]}). Passez à une formule supérieure pour l'utiliser.`],
  [/^Your (.+) plan allows (\d+) team members?\. Upgrade your plan to invite more\.?$/i, (m) => `Votre formule ${m[1]} autorise ${m[2]} membre(s) d'équipe. Passez à une formule supérieure pour en inviter davantage.`],
  [/^A campaign that is (.+) cannot become (.+)\.?$/i, (m) => `Une campagne « ${m[1]} » ne peut pas passer à « ${m[2]} ».`],
  [/^The flash price must be below the normal price \((.+)\)\.?$/i, (m) => `Le prix flash doit être inférieur au prix normal (${m[1]}).`],
  [/^This coupon only applies to products from (.+)\.?$/i, (m) => `Ce coupon ne s'applique qu'aux produits de ${m[1]}.`],
  [/^There were no sales in (\d{4}-\d{2}): nothing to invoice\.?$/i, (m) => `Aucune vente en ${m[1]} : rien à facturer.`],
  [/^State must be one of: .*$/i, () => "L'état doit être : en cours, en délai de sécurité, disponible, en versement, versé ou retourné."],
  [/^Status must be one of: .*$/i, () => "Statut invalide."],
  [/^Outcome must be one of: .*$/i, () => "Résultat invalide."],
  [/^Your team role \((.+)\) does not allow this\. Ask the store owner\.?$/i, (m) => `Votre rôle d'équipe (${m[1]}) ne permet pas cette action. Demandez au propriétaire de la boutique.`],
  [/^This invitation was sent to another e-mail address\. Sign in with (.+)\.?$/i, (m) => `Cette invitation a été envoyée à une autre adresse e-mail. Connectez-vous avec ${m[1]}.`],
  [/^You still have (\d+) orders? in progress\. Finish or cancel them before deleting your account\.?$/i, (m) => `Vous avez encore ${m[1]} commande(s) en cours. Terminez-les ou annulez-les avant de supprimer votre compte.`],
  [/^A payout is still being processed\. Wait until it is paid before deleting your account\.?$/i, () => "Un versement est en cours de traitement. Attendez qu'il soit payé avant de supprimer votre compte."],
  [/^You still have (.+) to withdraw\. Request a payout first, then delete your account\.?$/i, (m) => `Il vous reste ${m[1]} à retirer. Demandez d'abord un versement, puis supprimez votre compte.`],
  [/^Unknown notification kind: (.+)\.?$/i, (m) => `Type de notification inconnu : ${m[1]}.`],
  [/^(.+) (?:revenue|orders|rating|listings) goal must be .*$/i, () => "Un de vos objectifs est invalide."],
  // Payout requests (api/src/payouts)
  [/^The minimum payout is (\$[\d.,]+)\.?$/i, (m) => `Le versement minimum est de ${m[1]}.`],
  [/^You can withdraw up to (\$[\d.,]+) right now\.?$/i, (m) => `Vous pouvez retirer jusqu'à ${m[1]} pour le moment.`],
  [/^Refunds and returns left your balance at -(\$[\d.,]+): nothing can be withdrawn until new sales cover it\.?$/i, (m) => `Les remboursements et retours ont laissé votre solde à -${m[1]} : rien ne peut être retiré tant que de nouvelles ventes ne le couvrent pas.`],
  [/^Request failed \((\d{3})\)$/i, (m) => `La requête a échoué (${m[1]}).`],
  [/failed to fetch|networkerror|network request failed|load failed|cannot reach the server/i, () => "Impossible de joindre le serveur. Vérifiez votre connexion et réessayez."],
  [/^timeout$|operation has timed out/i, () => "Le serveur met trop de temps à répondre. Réessayez."],
];

/** True when the interface is in French (the locale provider keeps `<html lang>` in sync). */
export function portalIsFrench(): boolean {
  return typeof document !== "undefined" && document.documentElement.lang === "fr";
}

/** Translate one server message into French (unchanged when unknown). */
export function frenchServerMessage(raw: string): string {
  const text = raw.trim();
  if (!text) return text;

  // The vacation refusal ships both languages in one text: "<EN> / <FR>".
  const both = /^([\s\S]* is on vacation [\s\S]*) \/ ([\s\S]* est en vacances [\s\S]*)$/.exec(text);
  if (both) return both[2].trim();

  const hit = FR_EXACT[key(text)];
  if (hit) return hit;
  for (const [re, fn] of RULES) {
    const m = re.exec(text);
    if (m) return fn(m);
  }
  return text;
}

/** For English: the vacation refusal's English half; every other text is returned as-is. */
export function englishServerMessage(raw: string): string {
  const both = /^([\s\S]* is on vacation [\s\S]*) \/ ([\s\S]* est en vacances [\s\S]*)$/.exec(raw.trim());
  return both ? both[1].trim() : raw;
}

/** The text of any error value in the viewer's language (`fr` defaults to the current `<html lang>`). */
export function sellerErrorText(err: unknown, fr: boolean = portalIsFrench(), fallback?: string): string {
  const raw = (err instanceof Error ? err.message : typeof err === "string" ? err : "").trim();
  if (!raw) return fallback ?? (fr ? "Une erreur est survenue. Réessayez." : "Something went wrong.");
  return fr ? frenchServerMessage(raw) : englishServerMessage(raw);
}
