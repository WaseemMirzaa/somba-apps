/**
 * Vocabulary the French error sentences are built from: the labels the validators put in front of a message
 * ("{label} must be 2-100 characters.") and the status words that sit inside one ("An order that is shipped ...").
 *
 * Labels come with their article ("Le nom", "L’adresse", "Les frais express") so a sentence reads as French.
 * `error-fr.spec.ts` collects every label literal passed to the validators and fails when one is missing here.
 */

export const FIELD_FR: Record<string, string> = {
  Action: 'L’action',
  Actor: 'L’auteur',
  Address: 'L’adresse',
  Alias: 'Un alias',
  'Auto-assignment rule': 'La règle d’affectation automatique',
  Banner: 'La bannière',
  'Base delivery fee': 'Les frais de livraison de base',
  'Batch size': 'La taille du lot',
  Body: 'Le texte',
  Brand: 'La marque',
  Budget: 'Le budget',
  'Campaign name': 'Le nom de la campagne',
  Capacity: 'La capacité',
  Cart: 'Le panier',
  Case: 'Le dossier',
  City: 'La ville',
  'Clearance hours': 'Le délai de déblocage (heures)',
  'Closing time': 'L’heure de fermeture',
  Code: 'Le code',
  Colour: 'La couleur',
  Commission: 'La commission',
  Condition: 'L’état',
  Country: 'Le pays',
  'Delivery time (days)': 'Le délai de livraison (jours)',
  'Delivery-time target': 'L’objectif de délai de livraison',
  Description: 'La description',
  Discount: 'La remise',
  Document: 'Le document',
  'Document number': 'Le numéro du document',
  'Document type': 'Le type de document',
  Email: 'L’e-mail',
  End: 'La fin',
  'End date': 'La date de fin',
  'English name': 'Le nom anglais',
  Entity: 'L’élément concerné',
  'Exchange rate': 'Le taux de change',
  'Expiry date': 'La date d’expiration',
  'Express base fee': 'Les frais de base express',
  'Express delivery days': 'Les jours de livraison express',
  'Express delivery flag': 'L’option de livraison express',
  'Express fee per km': 'Les frais express par km',
  'Express maximum distance': 'La distance maximale express',
  Features: 'Les atouts',
  'Features (FR)': 'Les atouts (FR)',
  'Fee per km': 'Les frais par km',
  'Flash price': 'Le prix flash',
  'Flat delivery fee': 'Le tarif de livraison fixe',
  'Fraud threshold': 'Le seuil de fraude',
  'French body': 'Le texte en français',
  'French description': 'La description en français',
  'French name': 'Le nom en français',
  'French product title': 'Le titre du produit en français',
  'French title': 'Le titre en français',
  From: 'La date de début',
  Fuel: 'Le carburant',
  'Google name': 'Le nom Google',
  'Google name (English)': 'Le nom Google (anglais)',
  Hub: 'L’entrepôt',
  'Hub address': 'L’adresse de l’entrepôt',
  'Hub name': 'Le nom de l’entrepôt',
  'ID number': 'Le numéro de la pièce d’identité',
  Icon: 'L’icône',
  Image: 'L’image',
  'Insurance valid until': 'La fin de l’assurance',
  'Inter-city transfer days': 'Les jours de transfert entre villes',
  Key: 'La clé',
  'Lane cost': 'Le coût de la liaison',
  'Last service': 'Le dernier entretien',
  'Legal name': 'La raison sociale',
  Level: 'Le niveau',
  'Local delivery days': 'Les jours de livraison locale',
  Logo: 'Le logo',
  'Max uses': 'Le nombre d’utilisations maximal',
  'Maximum delivery fee': 'Le plafond des frais de livraison',
  'Maximum express fee': 'Le plafond des frais express',
  'Minimum order': 'La commande minimale',
  'Minimum payout': 'Le versement minimal',
  Model: 'Le modèle',
  'Moderation flag': 'L’indicateur de modération',
  Name: 'Le nom',
  'Next service': 'Le prochain entretien',
  Notes: 'Les notes',
  Odometer: 'Le compteur',
  'Opening time': 'L’heure d’ouverture',
  Order: 'L’ordre d’affichage',
  Outcome: 'Le résultat',
  'Payment method': 'Le moyen de paiement',
  'Per-customer limit': 'La limite par client',
  Phone: 'Le téléphone',
  'Pickup address': 'L’adresse de collecte',
  'Pinned address flag': 'L’indicateur d’adresse épinglée',
  'Plan id': 'L’identifiant de l’offre',
  'Plan length (months)': 'La durée de l’offre (mois)',
  'Plan name': 'Le nom de l’offre',
  'Plan name (FR)': 'Le nom de l’offre (FR)',
  'Plan price': 'Le prix de l’offre',
  Plate: 'La plaque',
  'Preparation time (days)': 'Le délai de préparation (jours)',
  Price: 'Le prix',
  Product: 'Le produit',
  'Product limit': 'La limite de produits',
  'Product title': 'Le titre du produit',
  Products: 'Les produits',
  'RCCM number': 'Le numéro RCCM',
  Reason: 'Le motif',
  'Return window': 'Le délai de retour',
  'Returns policy': 'La politique de retour',
  'Returns policy (French)': 'La politique de retour (français)',
  Role: 'Le rôle',
  SKU: 'Le SKU',
  'Saved for later': 'Les articles gardés pour plus tard',
  Search: 'La recherche',
  'Support response time': 'Le délai de réponse du support',
  Severity: 'La gravité',
  'Shipping policy': 'La politique d’expédition',
  'Shipping policy (French)': 'La politique d’expédition (français)',
  'Sort order': 'L’ordre de tri',
  'Split delivery hours': 'Les heures avant livraison partielle',
  Start: 'Le début',
  'Start date': 'La date de début',
  State: 'L’état',
  Status: 'Le statut',
  Stock: 'Le stock',
  'Store name': 'Le nom de la boutique',
  Task: 'La tâche',
  'Tax number': 'Le numéro fiscal',
  'Team seats': 'Le nombre de membres d’équipe',
  Tier: 'Le niveau',
  'Time zone': 'Le fuseau horaire',
  Title: 'Le titre',
  To: 'La date de fin',
  'Transfer fee': 'Les frais de transfert',
  'Transit time (hours)': 'Le temps de transit (heures)',
  Type: 'Le type',
  Warehouse: 'L’entrepôt',
  'Weight (g)': 'Le poids (g)',
  'Weight (kg)': 'Le poids (kg)',
  photo: 'La photo',
  signature: 'La signature',
  'Handling time': 'Le délai de préparation',
  'Revenue goal': 'L’objectif de revenus',
  'Orders goal': 'L’objectif de commandes',
  'Rating goal': 'L’objectif de note',
  'Listings goal': 'L’objectif d’annonces',
};

/** "Picture 3" and "Alert level 2 age" carry a number: the label without it is looked up, then it is put back. */
export function fieldFr(label: string): string {
  const direct = FIELD_FR[label];
  if (direct) return direct;
  let m = /^Picture (\d+)$/.exec(label);
  if (m) return `La photo ${m[1]}`;
  m = /^Alert level (\d+) age$/.exec(label);
  if (m) return `L’âge de l’alerte de niveau ${m[1]}`;
  return label;
}

/** Is the label one this file knows (a literal passed to a validator must be). */
export const knownField = (label: string): boolean => fieldFr(label) !== label;

/** A field label after "de": "Le nom" -> "du nom", "La photo 1" -> "de la photo 1", "L’adresse" -> "de l’adresse". */
export function ofField(label: string): string {
  const f = fieldFr(label);
  if (/^Le /.test(f)) return `du ${f.slice(3)}`;
  if (/^La /.test(f)) return `de la ${f.slice(3)}`;
  if (/^Les /.test(f)) return `des ${f.slice(4)}`;
  if (/^L’/.test(f)) return `de l’${f.slice(2)}`;
  if (/^Un /.test(f)) return `d’un ${f.slice(3)}`;
  return `de ${f}`;
}

/** One status or step word in French ("out_for_delivery" and "out for delivery" are the same word). */
const STATUS_WORDS: Record<string, string> = {
  pending: 'en attente',
  confirmed: 'confirmée',
  processing: 'en préparation',
  shipped: 'expédiée',
  out_for_delivery: 'en cours de livraison',
  delivered: 'livrée',
  cancelled: 'annulée',
  returned: 'retournée',
  succeeded: 'confirmé',
  failed: 'échoué',
  refunded: 'remboursé',
  unassigned: 'disponible',
  assigned: 'assignée',
  picked_up: 'récupérée',
  in_transit: 'en route',
  draft: 'brouillon',
  scheduled: 'programmée',
  active: 'active',
  ended: 'terminée',
  rejected: 'refusée',
  approved: 'approuvée',
  open: 'ouverte',
  closed: 'clôturée',
  resolved: 'résolue',
  requested: 'demandée',
  received: 'reçue',
  ready: 'prête',
  paid: 'payé',
};

/** A status word in French, or the word as given when it is not one we know. */
export const statusFr = (s: string): string => STATUS_WORDS[s.trim().toLowerCase().replace(/\s+/g, '_')] ?? s;

/** The steps of an exchange or a replacement (both masculine: "Échange approuvé", "Remplacement expédié"). */
const AFTER_SALE_STEPS: Record<string, string> = {
  requested: 'demandé',
  approved: 'approuvé',
  rejected: 'refusé',
  completed: 'terminé',
  received: 'reçu',
  ready: 'prêt',
  allocated: 'attribué',
  dispatched: 'expédié',
  delivered: 'livré',
};
export const afterSaleStepFr = (s: string): string => AFTER_SALE_STEPS[s.trim().toLowerCase()] ?? s;

/** What a delivery leg is called, with its article and its gender ("Une livraison express" is feminine, "Un ramassage" masculine). */
const LEG_KINDS: Record<string, [label: string, feminine: boolean]> = {
  pickup: ['Un ramassage', false],
  transfer: ['Un transfert', false],
  delivery: ['Une livraison', true],
  'express delivery': ['Une livraison express', true],
  'return to seller': ['Un retour au vendeur', false],
};
export const legKindFr = (k: string): string => LEG_KINDS[k.trim().toLowerCase()]?.[0] ?? `Une étape « ${k} »`;

/** A leg's status in the gender of the leg ("Un ramassage « récupéré »", "Une livraison « récupérée »"). */
const LEG_STATUSES: Record<string, [masculine: string, feminine: string]> = {
  unassigned: ['disponible', 'disponible'],
  assigned: ['assigné', 'assignée'],
  picked_up: ['récupéré', 'récupérée'],
  in_transit: ['en route', 'en route'],
  delivered: ['livré', 'livrée'],
  failed: ['échoué', 'échouée'],
};
export function legStatusFr(kind: string, status: string): string {
  const feminine = LEG_KINDS[kind.trim().toLowerCase()]?.[1] ?? true;
  const pair = LEG_STATUSES[status.trim().toLowerCase().replace(/\s+/g, '_')];
  return pair ? pair[feminine ? 1 : 0] : status;
}

const NBSP = ' ';

/** A dollar amount the French way: comma decimals, a non-breaking space between thousands and before the sign ("52.00" -> "52,00 $"). Anything that is not a plain number is kept. */
export function moneyFr(amount: string): string {
  const raw = String(amount).trim();
  const m = /^(\d+)(?:\.(\d+))?$/.exec(raw);
  if (!m) return `${raw}${NBSP}$`;
  const whole = m[1].replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return `${whole}${m[2] !== undefined ? `,${m[2]}` : ''}${NBSP}$`;
}
