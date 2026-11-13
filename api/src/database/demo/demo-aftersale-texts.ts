import type { DemoText } from './demo-texts';

/**
 * The words of the seller portal's after-sale demo (docs/contracts/admin-controls.md §13): what customers wrote on the demo
 * returns, exchanges and replacements, and the private seller <-> support threads. Each is `[English, French]`; the seed writes
 * the English and `demo-bilingual.ts` adds the French as an author row (never a machine row). Kept apart from the scenarios so
 * `demo-aftersale.ts` holds no sentence of its own.
 */
type Pair = readonly [en: string, fr: string];

/** Why the customer returns (`R`), exchanges (`X`) or asks to replace (`P`) the goods of store A, B and C. */
export const REASONS = {
  RA1: ['The cooking oil bottle arrived leaking and half empty.', 'La bouteille d’huile de cuisine est arrivée en train de fuir et à moitié vide.'],
  RA2: ['The soap bars are not the ones shown in the photos.', 'Les savons ne sont pas ceux des photos.'],
  RA3: ['I bought three coffee packs by mistake and only need one.', 'J’ai acheté trois paquets de café par erreur et je n’en veux qu’un.'],
  RB1: ['The peanuts taste stale and the bag was already open.', 'Les arachides ont un goût de rance et le sachet était déjà ouvert.'],
  RB2: ['The tea boxes were crushed and some bags are torn.', 'Les boîtes de thé étaient écrasées et certains sachets sont déchirés.'],
  RB3: ['The cassava flour has a strange smell, I do not trust it.', 'La farine de manioc a une odeur étrange, je ne lui fais pas confiance.'],
  RC1: ['The kettle does not heat up: the light turns on but the water stays cold.', 'La bouilloire ne chauffe pas : le voyant s’allume mais l’eau reste froide.'],
  RC2: ['The iron leaks water on the clothes when I use the steam.', 'Le fer à repasser fuit sur les vêtements quand j’utilise la vapeur.'],
  RC3: ['Two of the chargers stopped working after one day.', 'Deux des chargeurs ont cessé de fonctionner après un jour.'],
  XA4: ['I ordered three notebooks but I only need one, I would like the earbuds instead.', 'J’ai commandé trois cahiers mais je n’en veux qu’un, je voudrais les écouteurs à la place.'],
  XA5: ['I prefer the cooking oil to the palm oil: it is better for frying.', 'Je préfère l’huile de cuisine à l’huile de palme : elle est meilleure pour la friture.'],
  XB4: ['The bins are too big for my kitchen, I would like the steel bottles instead.', 'Les bacs sont trop grands pour ma cuisine, je voudrais les bouteilles en acier à la place.'],
  XB5: ['I ordered the notebooks by mistake, I really wanted the storage bins.', 'J’ai commandé les cahiers par erreur, je voulais vraiment les bacs de rangement.'],
  XC4: ['I already have a fan at home, I would like an iron instead.', 'J’ai déjà un ventilateur à la maison, je voudrais un fer à repasser à la place.'],
  XC5: ['I was given a kettle twice, please swap this one for a stand fan.', 'On m’a offert deux bouilloires, merci d’échanger celle-ci contre un ventilateur sur pied.'],
  PA6: ['One of the two plates arrived with a broken edge.', 'Une des deux assiettes est arrivée avec un bord cassé.'],
  PA7: ['The solar lantern does not charge, the battery looks dead.', 'La lanterne solaire ne se recharge pas, la batterie semble morte.'],
  PB6: ['The bath towel has a big hole near the edge.', 'La serviette de bain a un gros trou près du bord.'],
  PB7: ['The cap of one bottle does not close and it leaks.', 'Le bouchon d’une bouteille ne ferme pas et elle fuit.'],
  PC6: ['The charger gets very hot and smells burnt.', 'Le chargeur chauffe beaucoup et sent le brûlé.'],
  PC7: ['The iron arrived with a cracked handle.', 'Le fer à repasser est arrivé avec la poignée fissurée.'],
} satisfies Record<string, Pair>;

/** Messages of the private seller <-> support threads, and one customer <-> support exchange. */
export const THREAD = {
  S1: ['The customer is waiting for an answer on this return. Can you tell me when support will decide?', 'Le client attend une réponse sur ce retour. Pouvez-vous me dire quand le support décidera ?'],
  K1: ['Thank you for asking. We are checking the photos and will decide today. You do not need to do anything.', 'Merci de votre message. Nous vérifions les photos et déciderons aujourd’hui. Vous n’avez rien à faire.'],
  S2: ['Understood. If it is approved, tell me when the goods are coming back so that I can receive them.', 'Compris. Si le retour est approuvé, dites-moi quand les articles reviennent pour que je puisse les réceptionner.'],
  K2: ['The return is approved and the rider has collected the goods. They will come back to your store in a few days.', 'Le retour est approuvé et le livreur a récupéré les articles. Ils reviendront à votre boutique dans quelques jours.'],
  S3: ['I have not received the goods yet. Can you confirm the delivery day?', 'Je n’ai pas encore reçu les articles. Pouvez-vous confirmer le jour de livraison ?'],
  K3: ['The parcel is at the warehouse. A rider will bring it to your store tomorrow.', 'Le colis est à l’entrepôt. Un livreur le ramènera à votre boutique demain.'],
  S4: ['The customer asked about the exchange. Is the price difference already paid?', 'Le client a posé une question sur l’échange. La différence de prix est-elle déjà payée ?'],
  K4: ['Yes, the customer paid the difference and the exchange is approved. A rider will bring the new item.', 'Oui, le client a payé la différence et l’échange est approuvé. Un livreur apportera le nouvel article.'],
  K5: ['A replacement was approved for this item. Please keep a spare unit ready for the rider.', 'Un remplacement a été approuvé pour cet article. Merci de garder une unité de rechange prête pour le livreur.'],
  S5: ['I checked my stock: the unit is available and packed.', 'J’ai vérifié mon stock : l’unité est disponible et emballée.'],
  K6: ['The refund was sent to the customer. Thank you for your patience on this return.', 'Le remboursement a été envoyé au client. Merci de votre patience sur ce retour.'],
  S6: ['Is there anything I should check on my side for this case?', 'Y a-t-il quelque chose à vérifier de mon côté pour ce dossier ?'],
  K7: ['Nothing for now. We will write here as soon as the decision is taken.', 'Rien pour l’instant. Nous écrirons ici dès que la décision sera prise.'],
  C1: ['Hello, I sent the pictures of the bottle this morning. When will you decide?', 'Bonjour, j’ai envoyé les photos de la bouteille ce matin. Quand déciderez-vous ?'],
  K8: ['Thank you for the pictures. We are looking at your request and you will hear from us today.', 'Merci pour les photos. Nous examinons votre demande et vous aurez de nos nouvelles aujourd’hui.'],
} satisfies Record<string, Pair>;

const text = ([en, fr]: Pair): DemoText => ({ kind: 'case', src: 'en', en, fr });
export const AFTER_SALE_TEXTS: DemoText[] = [...Object.values(REASONS), ...Object.values(THREAD)].map(text);
