import type { DemoText, DemoTextKind } from './demo-texts';

/**
 * The words of the customer demo (docs: deploy/DEMO-SEED.md, "Customer app: what each demo customer can show"): the reviews, the
 * reasons on the after-sale cases, the notes of support and of the stores, and the support tickets of the new demo customers. Each
 * is `[English, French]`; the scenario writes the one its (demo) author would use and `demo-bilingual.ts` stores the other as an
 * author row (never a machine row). Kept apart from the scenarios so `demo-customers.ts` holds no sentence of its own.
 */
type Pair = readonly [en: string, fr: string];

/** Reviews. `fr` ones are written by a French-language customer, the others in English. */
export const REVIEW = {
  V1: ['Gorgeous dress, the blue is even nicer in real life. I wore it to a christening and everyone asked where I bought it.', 'Magnifique robe, le bleu est encore plus beau en vrai. Je l’ai portée à un baptême et tout le monde m’a demandé où je l’avais achetée.'],
  V2: ['A well-scented hibiscus tea, lovely chilled. The bag could close better.', 'Un bissap bien parfumé, délicieux frais. Le sachet pourrait mieux se refermer.'],
  V3: ['Solid power bank, it lasts the whole week of power cuts. I recommend it.', 'Une batterie solide, elle tient toute la semaine de coupures de courant. Je la recommande.'],
  V5: ['Thick, very fragrant honey, and the jar arrives well protected.', 'Un miel épais et très parfumé, le pot arrive bien protégé.'],
  V7: ['Quiet fan, the battery lasts a whole evening. A little heavy to move around.', 'Un ventilateur silencieux, la batterie tient toute une soirée. Un peu lourd à déplacer.'],
  V8: ['Very bright, perfect for evenings without power. Solar charging works well in the dry season.', 'Très lumineuse, parfaite pour les soirées sans courant. La recharge solaire marche bien en saison sèche.'],
  J1: ['Authentic black soap, gentle on the skin. I buy it again every time.', 'Un savon noir authentique, doux pour la peau. J’en rachète à chaque fois.'],
  J3: ['It heats quickly but the cord is too short for my kitchen.', 'Elle chauffe vite mais le cordon est trop court pour ma cuisine.'],
  J4: ['Good value for money, it charges my phone twice.', 'Un bon rapport qualité-prix, elle recharge deux fois mon téléphone.'],
  E1: ['Lovely honey, a little runny but the taste is real. Quick delivery.', 'Un très bon miel, un peu liquide mais le goût est vrai. Livraison rapide.'],
  E3: ['The bins are sturdy but one lid did not fit. The store replaced it quickly.', 'Les bacs sont solides mais un couvercle ne s’adaptait pas. La boutique l’a vite remplacé.'],
  K1: ['The exercise books are fine for the quantity, perfect for the start of the school year for our customers.', 'Les cahiers sont corrects pour la quantité, parfaits pour la rentrée scolaire de nos clients.'],
  T1: ['Pure and creamy, perfect for dry skin. The rider even called before arriving.', 'Pur et onctueux, parfait pour la peau sèche. Le livreur a même appelé avant d’arriver.'],
} as const satisfies Record<string, Pair>;

/** What the customer writes on a return, a dispute, an exchange or a replacement, and what support or a store answers. */
export const CASE = {
  J5: ['The shirt is too big and I would like my money back.', 'La chemise est trop grande et je voudrais être remboursé.'],
  J5NO: ['The shirt was worn and washed, so it cannot be returned. Returns are only accepted for unused items in their original packaging.', 'La chemise a été portée et lavée, elle ne peut donc pas être retournée. Les retours ne sont acceptés que pour les articles non utilisés dans leur emballage d’origine.'],
  J6: ['Size 40 is too tight, I prefer the 41.', 'La pointure 40 me serre trop, je préfère la 41.'],
  J11: ['The shirt is a little small, I would like the size L.', 'La chemise est un peu petite, je voudrais la taille L.'],
  J11NO: ['The size L of this shirt is not available at the moment. You can return the shirt instead.', 'La taille L de cette chemise n’est pas disponible pour le moment. Vous pouvez retourner la chemise à la place.'],
  E3: ['One lid of the storage bins does not fit.', 'Un couvercle des bacs de rangement ne s’adapte pas.'],
  E4: ['The steam iron arrived with a scratched base and a missing water tank cap.', 'Le fer à repasser est arrivé avec une semelle rayée et sans bouchon de réservoir.'],
  E4OK: ['We checked the photos with the store. You keep the iron and receive a partial refund of $5.', 'Nous avons vérifié les photos avec la boutique. Vous gardez le fer et recevez un remboursement partiel de 5 $.'],
  E5: ['I ordered the wrong plate set and I need to check with my family first.', 'J’ai commandé le mauvais service d’assiettes et je dois d’abord en parler à ma famille.'],
  E6: ['The strap of the handbag broke after two days.', 'La bandoulière du sac à main s’est cassée après deux jours.'],
  E7: ['The wooden blocks have a few scratches, I would like a new set.', 'Les cubes en bois ont quelques éraflures, je voudrais un nouvel ensemble.'],
  E7NO: ['Light marks on wooden toys are normal and do not make the set defective, so we cannot replace it.', 'De légères marques sur des jouets en bois sont normales et ne rendent pas l’ensemble défectueux, nous ne pouvons donc pas le remplacer.'],
  N4: ['The handbag zip broke and the lining is torn.', 'La fermeture éclair du sac à main est cassée et la doublure est déchirée.'],
  T0: ['I did not receive the second item of my order.', 'Je n’ai pas reçu le deuxième article de ma commande.'],
  T0NO: ['The delivery records show that both items were handed over and confirmed with your delivery code, so we cannot refund this order.', 'Les enregistrements de livraison montrent que les deux articles ont été remis et confirmés avec votre code de livraison, nous ne pouvons donc pas rembourser cette commande.'],
  K3: ['Two of the kettles do not heat, the light turns on but the water stays cold.', 'Deux des bouilloires ne chauffent pas, le voyant s’allume mais l’eau reste froide.'],
} as const satisfies Record<string, Pair>;

/** Why a store or KOMORIKO cancelled something. */
export const CANCEL = {
  N2: ['Sorry, the cassava flour is out of stock at the moment.', 'Désolé, la farine de manioc est en rupture de stock pour le moment.'],
  N3: ['The delivery address could not be confirmed with the customer.', 'L’adresse de livraison n’a pas pu être confirmée avec le client.'],
  E11: ['The steel water bottle is out of stock at the moment.', 'La bouteille d’eau en acier est en rupture de stock pour le moment.'],
} as const satisfies Record<string, Pair>;

/** The support tickets of the new demo customers (`fr` ones are written by a French-language customer, the answers in the customer's language). */
export const TICKET = {
  V_SUBJECT: ['Can I change the floor of my delivery address?', 'Puis-je modifier l’étage de mon adresse de livraison ?'],
  V_MESSAGE: ['I moved to the fifth floor of the same building and I would like the rider to know before he comes.', 'J’ai déménagé au cinquième étage du même immeuble et je voudrais que le livreur le sache avant de venir.'],
  V_REPLY: ['Hello Marie-Claire, we added the fifth floor to the landmark of your address. The rider will see it on his next delivery.', 'Bonjour Marie-Claire, nous avons ajouté le cinquième étage au repère de votre adresse. Le livreur le verra lors de sa prochaine livraison.'],
  E_SUBJECT: ['How long until my replacement arrives?', 'Quand le remplacement de ma commande arrivera-t-il ?'],
  E_MESSAGE: ['Support approved my replacement last week. Could you tell me when the rider will bring it?', 'Le support a approuvé mon remplacement la semaine dernière. Pouvez-vous me dire quand le livreur l’apportera ?'],
  A_SUBJECT: ['How do I top up my wallet?', 'Comment recharger le portefeuille de mon compte ?'],
  A_MESSAGE: ['Hello, I would like to top up my wallet with Airtel Money. Where do I tap?', 'Bonjour, je voudrais recharger mon portefeuille avec Airtel Money. Où dois-je appuyer ?'],
  A_REPLY: ['Hello, open Wallet, tap Top up, choose Airtel Money and enter your number. You then approve on your phone.', 'Bonjour, ouvrez Portefeuille, touchez Recharger, choisissez Airtel Money et saisissez votre numéro. Vous validez ensuite sur votre téléphone.'],
} as const satisfies Record<string, Pair>;

const entry = (kind: DemoTextKind, src: 'en' | 'fr', p: Pair): DemoText => ({ kind, src, en: p[0], fr: p[1] });

/** Reviews written in French (the others are English). */
const FR_REVIEWS: (keyof typeof REVIEW)[] = ['V1', 'V2', 'V3', 'V5', 'V7', 'V8', 'J1', 'J3', 'J4', 'K1'];
/** Texts written by a French-language person (the rest of the table is English). */
const FR_CASES: (keyof typeof CASE)[] = ['J5', 'J6', 'J11', 'K3'];

/** Every text above, with the language the scenario writes it in (for `demo-texts.ts`). */
export const CUSTOMER_TEXTS: DemoText[] = [
  ...(Object.keys(REVIEW) as (keyof typeof REVIEW)[]).map((k) => entry('review', FR_REVIEWS.includes(k) ? 'fr' : 'en', REVIEW[k])),
  ...(Object.keys(CASE) as (keyof typeof CASE)[]).map((k) => entry('case', FR_CASES.includes(k) ? 'fr' : 'en', CASE[k])),
  ...(Object.keys(CANCEL) as (keyof typeof CANCEL)[]).map((k) => entry('note', 'en', CANCEL[k])),
  entry('ticket_subject', 'fr', TICKET.V_SUBJECT),
  entry('ticket_message', 'fr', TICKET.V_MESSAGE),
  entry('ticket_message', 'fr', TICKET.V_REPLY),
  entry('ticket_subject', 'en', TICKET.E_SUBJECT),
  entry('ticket_message', 'en', TICKET.E_MESSAGE),
  entry('ticket_subject', 'fr', TICKET.A_SUBJECT),
  entry('ticket_message', 'fr', TICKET.A_MESSAGE),
  entry('ticket_message', 'fr', TICKET.A_REPLY),
];
