/**
 * Every piece of free text the demo seed puts on a record, in BOTH languages.
 *
 * The seed runs the real services, so each review, question, chat message... is written in ONE language (the one a
 * person of that demo account would use). This table is the other half: `demo-bilingual.ts` finds the record by its
 * text and writes the twin as an AUTHOR row in `translations` (never a machine row, so nothing is billed and a
 * French reader sees French straight away, with or without a translation key on the server).
 *
 * `src` is the language the demo wrote the text in. Add a text to a scenario => add its twin here, or
 * `demo-bilingual.spec.ts` fails (it scans the demo sources for human text that has no entry).
 */

export type DemoLang = 'en' | 'fr';

export type DemoTextKind =
  | 'review'
  | 'review_reply'
  | 'question'
  | 'answer'
  | 'chat_message'
  | 'ticket_subject'
  | 'ticket_message'
  /** A reason or a message inside a return / dispute / exchange / replacement: quoted by the notices about it. */
  | 'case'
  /** A staff note (warehouse incident, ledger, store status reason, payout...): shown in the portals. */
  | 'note'
  | 'store_policy'
  | 'cms'
  | 'campaign'
  | 'flash_sale'
  | 'promo';

export interface DemoText {
  kind: DemoTextKind;
  /** The language the scenario writes it in. */
  src: DemoLang;
  en: string;
  fr: string;
}

const t = (kind: DemoTextKind, src: DemoLang, en: string, fr: string): DemoText => ({ kind, src, en, fr });

export const DEMO_TEXTS: DemoText[] = [
  // ── Reviews (and the store's replies) ─────────────────────────────────────────────────────────
  t('review', 'en', 'Gorgeous print and a perfect fit. I got compliments all day at the wedding.', 'Superbe motif et coupe parfaite. J’ai reçu des compliments toute la journée au mariage.'),
  t('review', 'en', 'Comfortable and light. A bit tight at the start but they loosen after two days.', 'Confortables et légères. Un peu serrées au début, mais elles s’assouplissent après deux jours.'),
  t('review', 'en', 'Pure shea butter, no smell of chemicals. My skin is much softer.', 'Du beurre de karité pur, sans odeur chimique. Ma peau est beaucoup plus douce.'),
  t('review', 'en', 'Good battery, the camera is fine in daylight. Two SIM slots are very useful.', 'Bonne batterie, l’appareil photo est correct en plein jour. Les deux emplacements SIM sont très pratiques.'),
  t('review', 'en', 'Sound is okay for the price but the case is loose and the left bud disconnects sometimes.', 'Le son est correct pour le prix, mais le boîtier est lâche et l’écouteur gauche se déconnecte parfois.'),
  t('review', 'en', 'Charged my phone four times in one day. Works with all my cables.', 'J’ai rechargé mon téléphone quatre fois en une journée. Fonctionne avec tous mes câbles.'),
  t('review', 'en', 'Beautiful dress, the fabric is thick and the colours did not fade after washing. It fits as described. Delivered on time.', 'Belle robe, le tissu est épais et les couleurs n’ont pas déteint au lavage. Elle correspond à la description. Livrée à temps.'),
  t('review', 'en', 'Good oil, strong colour and smell. The bottle leaked a little at the cap but nothing was lost.', 'Bonne huile, couleur et odeur marquées. La bouteille a un peu fui au niveau du bouchon, mais rien n’a été perdu.'),
  t('review', 'en', 'Real honey, thick and fragrant. Better than the supermarket one.', 'Du vrai miel, épais et parfumé. Meilleur que celui du supermarché.'),
  t('review', 'fr', 'Very good palm oil, authentic colour and taste. The packaging could be better.', 'Très bonne huile de palme, couleur et goût authentiques. Emballage à améliorer.'),
  t('review', 'en', 'Rich coffee, smells wonderful when you open the bag.', 'Un café riche, qui sent merveilleusement bon à l’ouverture du sachet.'),
  t('review', 'en', 'Fresh and crunchy, well salted.', 'Frais et croustillant, bien salé.'),
  t('review', 'en', 'Looks much more expensive than it is. The strap is comfortable and the zip is solid.', 'Fait beaucoup plus cher que son prix. La bandoulière est confortable et la fermeture éclair est solide.'),
  t('review', 'en', 'Bright enough for the whole room during power cuts. Solar charging is slow on cloudy days.', 'Assez lumineuse pour toute la pièce pendant les coupures de courant. La recharge solaire est lente par temps nuageux.'),
  t('review', 'en', 'SCAM!!! Do not buy from this seller, they are thieves and liars!!! I want everything back!!!', 'ARNAQUE !!! N’achetez pas chez ce vendeur, ce sont des voleurs et des menteurs !!! Je veux tout récupérer !!!'),
  t('review', 'fr', 'Pure shea butter, very moisturising. Fast delivery, I recommend this seller.', 'Un beurre de karité pur, très hydratant. Livraison rapide, je recommande ce vendeur.'),

  t('review_reply', 'en', 'Thank you Esther! We are happy the dress fitted so well.', 'Merci Esther ! Nous sommes ravis que la robe vous aille si bien.'),
  t('review_reply', 'en', 'Thank you for the honest review. The solar panel needs direct sun; the USB cable charges it faster.', 'Merci pour cet avis honnête. Le panneau solaire a besoin de soleil direct ; le câble USB le recharge plus vite.'),
  t('review_reply', 'en', 'We are sorry you feel this way. The towel was delivered on time; please contact us so we can help.', 'Nous sommes désolés que vous le ressentiez ainsi. La serviette a été livrée à temps ; contactez-nous afin que nous puissions vous aider.'),

  // ── Questions and answers ─────────────────────────────────────────────────────────────────────
  t('question', 'en', 'Does this phone take two SIM cards and work on 4G in Kinshasa?', 'Ce téléphone accepte-t-il deux cartes SIM et fonctionne-t-il en 4G à Kinshasa ?'),
  t('answer', 'en', 'Yes, it has two nano SIM slots and supports 4G on all Kinshasa networks. A memory card can go in a third slot.', 'Oui, il a deux emplacements nano SIM et prend en charge la 4G sur tous les réseaux de Kinshasa. Une carte mémoire peut aller dans un troisième emplacement.'),
  t('question', 'en', 'Do you have these in size 45?', 'Les avez-vous en pointure 45 ?'),
  t('question', 'fr', 'Does this dress shrink in the wash? I wear a 40.', 'Est-ce que cette robe rétrécit au lavage ? Je fais du 40.'),
  t('answer', 'en', 'The fabric is pre-washed so it does not shrink. For a French size 40, take the M. Wash it at 30 degrees.', 'Le tissu est prélavé, il ne rétrécit donc pas. Pour un 40 français, prenez le M. Lavez-la à 30 degrés.'),
  t('question', 'en', 'Can I use only one earbud at a time?', 'Puis-je utiliser un seul écouteur à la fois ?'),
  t('answer', 'en', 'Yes, each earbud works alone.', 'Oui, chaque écouteur fonctionne seul.'),
  t('question', 'en', 'Is the oil sold in a plastic or a glass bottle?', 'L’huile est-elle vendue en bouteille plastique ou en verre ?'),
  t('question', 'en', 'How long does the bottle keep water cold?', 'Combien de temps la bouteille garde-t-elle l’eau froide ?'),

  // ── Chats ─────────────────────────────────────────────────────────────────────────────────────
  t('chat_message', 'en', 'Hello! Do you have this dress in green, like the one in my picture?', 'Bonjour ! Avez-vous cette robe en vert, comme celle de ma photo ?'),
  t('chat_message', 'en', 'Hello Grace, thank you for your message. We only have Blue and Red at the moment. A green one arrives next month.', 'Bonjour Grace, merci pour votre message. Nous n’avons que du bleu et du rouge pour le moment. Une version verte arrive le mois prochain.'),
  t('chat_message', 'en', 'Thanks! What size would you recommend for 1.70 m?', 'Merci ! Quelle taille me conseillez-vous pour 1,70 m ?'),
  t('chat_message', 'en', 'Size M fits 1.65 to 1.75 m. Here is our measuring guide.', 'La taille M convient de 1,65 m à 1,75 m. Voici notre guide des mesures.'),
  t('chat_message', 'en', 'Perfect, I will order the blue M today.', 'Parfait, je commande le M bleu aujourd’hui.'),
  t('chat_message', 'en', 'Good morning, when will my order be handed to the warehouse?', 'Bonjour, quand ma commande sera-t-elle remise à l’entrepôt ?'),
  t('chat_message', 'en', 'Good morning. It is packed and the rider comes to collect it this afternoon.', 'Bonjour. Elle est emballée et le livreur vient la récupérer cet après-midi.'),
  t('chat_message', 'fr', 'Hello, my dress is being delivered. Can you confirm that size S is really a 36?', 'Bonjour, ma robe est en livraison. Pouvez-vous me confirmer que la taille S correspond bien à du 36 ?'),
  t('chat_message', 'en', 'Hello! Yes, size S is a French 36. Your parcel is on its way and the rider will call you.', 'Bonjour ! Oui, la taille S correspond à un 36 français. Votre colis est en route et le livreur vous appellera.'),
  t('chat_message', 'fr', 'Thank you very much, great service!', 'Merci beaucoup, très bon service !'),

  // ── Support tickets (subjects and messages) ───────────────────────────────────────────────────
  t('ticket_subject', 'en', 'Where is my order of honey and oil?', 'Où est ma commande de miel et d’huile ?'),
  t('ticket_message', 'en', 'I ordered honey and hair oil this morning and I would like to know when the rider will come.', 'J’ai commandé du miel et de l’huile pour cheveux ce matin et j’aimerais savoir quand le livreur passera.'),
  t('ticket_message', 'en', 'Hello Grace, your order is packed by the seller and a rider is assigned to collect it today. You will get a notice when it is at our warehouse.', 'Bonjour Grace, votre commande est emballée par le vendeur et un livreur est assigné pour la récupérer aujourd’hui. Vous recevrez une notification dès qu’elle sera à notre entrepôt.'),
  t('ticket_subject', 'en', 'Wrong total on my receipt', 'Mauvais total sur mon reçu'),
  t('ticket_message', 'en', 'The total on my receipt does not match what was taken from my wallet. I attach a photo of the receipt.', 'Le total de mon reçu ne correspond pas à ce qui a été prélevé sur mon portefeuille. Je joins une photo du reçu.'),
  t('ticket_subject', 'en', 'How do I get on the Pro plan?', 'Comment passer à l’abonnement Pro ?'),
  t('ticket_message', 'en', 'We are on the Free plan and want coupons and flash sales. What is the next step?', 'Nous sommes sur l’abonnement Gratuit et voulons des coupons et des ventes flash. Quelle est la prochaine étape ?'),
  t('ticket_message', 'en', 'Hello, open Subscribe in your portal, choose Pro and pay with your wallet. The perks are on straight away.', 'Bonjour, ouvrez Abonnement dans votre portail, choisissez Pro et payez avec votre portefeuille. Les avantages sont actifs immédiatement.'),

  // ── Returns, disputes, exchanges, replacements (what the notices about them quote) ────────────
  t('case', 'en', 'The screen was cracked when I opened the box.', 'L’écran était fissuré quand j’ai ouvert la boîte.'),
  t('case', 'en', 'Screen cracked, not resellable.', 'Écran fissuré, invendable.'),
  t('case', 'en', 'The shirt is too large and I would like my money back.', 'La chemise est trop grande et je souhaite être remboursé.'),
  t('case', 'fr', 'The shirt has a stain near the collar.', 'La chemise a une tache près du col.'),
  t('case', 'en', 'Thank you for the photo. We are checking the stain with the seller and will decide within two days.', 'Merci pour la photo. Nous vérifions la tache avec le vendeur et déciderons sous deux jours.'),
  t('case', 'fr', 'The stain was already there when the parcel was opened, as the photo shows.', 'La tache était déjà là à l’ouverture du colis, comme le montre la photo.'),
  t('case', 'en', 'The box arrived crushed and two cushion covers were missing from the set.', 'La boîte est arrivée écrasée et deux housses de coussin manquaient dans le lot.'),
  t('case', 'en', 'We are sorry about this. Could you send a picture of the box and of the covers you received, so that we can check with the seller?', 'Nous en sommes désolés. Pourriez-vous envoyer une photo de la boîte et des housses reçues, afin que nous vérifions avec le vendeur ?'),
  t('case', 'en', 'The size is too small, I need a 42.', 'La taille est trop petite, il me faut du 42.'),
  t('case', 'fr', 'Too small, I would like size 41.', 'Trop petites, je voudrais la pointure 41.'),
  t('case', 'en', 'The lantern does not charge from the solar panel.', 'La lanterne ne se recharge pas avec le panneau solaire.'),
  t('case', 'en', 'Defective', 'Défectueux'),
  t('case', 'en', 'Insults and accusations; the order was delivered and the buyer never contacted us.', 'Insultes et accusations ; la commande a été livrée et l’acheteur ne nous a jamais contactés.'),

  // ── Staff notes (warehouse incidents, ledger, statuses, payout...) ────────────────────────────
  t('note', 'en', 'Shoe box crushed at one corner; the shoes look fine.', 'Boîte à chaussures écrasée sur un coin ; les chaussures semblent intactes.'),
  t('note', 'en', 'Two of the three steel bottles in the parcel were missing at scan-in.', 'Deux des trois bouteilles en acier du colis manquaient au scan d’entrée.'),
  t('note', 'en', 'Customer phone was off; rider could not confirm the address.', 'Le téléphone du client était éteint ; le livreur n’a pas pu confirmer l’adresse.'),
  t('note', 'en', 'Customer called back and confirmed the address.', 'Le client a rappelé et confirmé l’adresse.'),
  t('note', 'en', 'Customer not reachable: the phone was switched off and nobody opened the door.', 'Client injoignable : le téléphone était éteint et personne n’a ouvert la porte.'),
  t('note', 'en', 'Several customers reported items that never arrived. The store is suspended while we investigate.', 'Plusieurs clients ont signalé des articles jamais arrivés. La boutique est suspendue le temps de l’enquête.'),
  t('note', 'en', 'The ID document is unreadable and the RCCM number does not match the legal name. Please upload clear copies and submit again.', 'La pièce d’identité est illisible et le numéro RCCM ne correspond pas à la raison sociale. Veuillez téléverser des copies lisibles et soumettre à nouveau.'),
  t('note', 'en', 'Approved for the demo.', 'Approuvée pour la démonstration.'),
  t('note', 'en', 'Seller delivery (demo)', 'Livraison du vendeur (démo)'),
  t('note', 'en', 'Weekly count (demo)', 'Inventaire hebdomadaire (démo)'),
  t('note', 'en', 'Moved to the cold shelf', 'Déplacé vers l’étagère fraîche'),
  t('note', 'en', 'Cracked lenses found at shelving', 'Verres fissurés constatés au rangement'),
  t('note', 'en', 'Recount', 'Recomptage'),
  t('note', 'en', 'Supplier delivery', 'Livraison du fournisseur'),
  t('note', 'en', 'Leaking bottles removed', 'Bouteilles qui fuient retirées'),

  // ── Store policies of Maison Kinshasa ─────────────────────────────────────────────────────────
  t('store_policy', 'en', 'Returns within 7 days if the item is unused and in its box. Start a return from your order: KOMORIKO support decides and a rider collects the goods.', 'Retours dans les 7 jours si l’article est inutilisé et dans son emballage. Lancez le retour depuis votre commande : le support KOMORIKO décide et un livreur récupère les articles.'),
  t('store_policy', 'en', 'Returns are accepted within 7 days of delivery for unused items in their original packaging. Food and beauty products can only be returned unopened.', 'Les retours sont acceptés dans les 7 jours suivant la livraison pour les articles non utilisés dans leur emballage d’origine. Les produits alimentaires et de beauté doivent être non ouverts.'),
  t('store_policy', 'en', 'We pack every order within one working day and hand it to the KOMORIKO warehouse in Gombe.', 'Nous emballons chaque commande en un jour ouvré et la remettons à l’entrepôt KOMORIKO de la Gombe.'),

  // ── Banners, campaigns, flash sales, promo codes ──────────────────────────────────────────────
  t('cms', 'en', 'Demo shop: everything for the home', 'Boutique démo : tout pour la maison'),
  t('cms', 'en', 'Fashion, food and electronics from Kinshasa stores. Free delivery on your first order over $50.', 'Mode, alimentation et électronique de boutiques de Kinshasa. Livraison offerte dès 50 $ pour votre première commande.'),
  t('cms', 'en', 'Use code DEMO10 for 10% off', 'Code DEMO10 : 10 % de réduction'),
  t('cms', 'en', 'On orders over $20. Demo data, visible to everyone while it is installed.', 'Dès 20 $ d’achat. Données de démonstration, visibles par tous tant qu’elles sont installées.'),
  t('cms', 'en', 'Delivered by our own riders', 'Livré par nos propres livreurs'),
  t('cms', 'en', 'Track your parcel from the seller to your door, and give the 4-digit code to the rider.', 'Suivez votre colis du vendeur jusqu’à votre porte et donnez le code à 4 chiffres au livreur.'),
  t('campaign', 'en', 'Back to School', 'Rentrée scolaire'),
  t('campaign', 'en', 'Kitchen Month (draft)', 'Mois de la cuisine (brouillon)'),
  t('campaign', 'en', 'Home & Power Week', 'Semaine maison et énergie'),
  t('flash_sale', 'en', 'Smartphone A15 flash deal', 'Offre flash Smartphone A15'),
  t('flash_sale', 'en', 'Wireless Earbuds weekend deal', 'Écouteurs sans fil : offre du week-end'),
  t('flash_sale', 'en', 'Shea butter flash sale', 'Vente flash beurre de karité'),
  t('promo', 'en', 'Demo: 10% off orders over $20', 'Démo : 10 % de réduction dès 20 $ d’achat'),
  t('promo', 'en', 'Maison Kinshasa: $5 off orders over $30', 'Maison Kinshasa : 5 $ de réduction dès 30 $ d’achat'),
  t('promo', 'en', 'Demo: $3 off orders over $15', 'Démo : 3 $ de réduction dès 15 $ d’achat'),
  t('promo', 'en', 'Demo: a paused code (switch it on to test)', 'Démo : un code en pause (activez-le pour le tester)'),
];

const norm = (s: string) => s.trim();

/** Index of every text by its written form (either language). */
const BY_TEXT = new Map<string, DemoText>();
for (const d of DEMO_TEXTS) {
  BY_TEXT.set(norm(d.en), d);
  BY_TEXT.set(norm(d.fr), d);
}

/** The twin entry for a stored text (written in either language), or undefined for text the demo did not write. */
export const twinOf = (text: string | null | undefined): DemoText | undefined => (text ? BY_TEXT.get(norm(text)) : undefined);

/** The French of a demo English text. Throws when the table has no entry (a new demo text must come with its twin). */
export function frOf(en: string): string {
  const d = BY_TEXT.get(norm(en));
  if (!d) throw new Error(`demo-texts.ts has no French for: ${en.slice(0, 60)}`);
  return d.fr;
}

/** The text as the demo wrote it (its `src` language) and the other language. */
export const sourceText = (d: DemoText): string => d[d.src];
export const otherText = (d: DemoText): string => (d.src === 'en' ? d.fr : d.en);
export const otherLang = (d: DemoText): DemoLang => (d.src === 'en' ? 'fr' : 'en');

// ── Option labels (product variants) ───────────────────────────────────────────────────────────

/** French of the option groups and options the demo catalogue uses. Sizes and numbers are the same in both languages. */
export const VARIANT_FR: Record<string, string> = {
  Size: 'Taille',
  Colour: 'Couleur',
  Blue: 'Bleu',
  Red: 'Rouge',
  Black: 'Noir',
  Green: 'Vert',
  White: 'Blanc',
  Yellow: 'Jaune',
  Grey: 'Gris',
  Brown: 'Marron',
  Pink: 'Rose',
  Small: 'Petit',
  Medium: 'Moyen',
  Large: 'Grand',
  Default: 'Par défaut',
};

/** The French option groups of a product's English ones (anything unknown, such as "XL" or "42", is kept). */
export function variantsFr(groups: { name: string; options: string[] }[]): { name: string; options: string[] }[] {
  return groups.map((g) => ({ name: VARIANT_FR[g.name] ?? g.name, options: g.options.map((o) => VARIANT_FR[o] ?? o) }));
}
