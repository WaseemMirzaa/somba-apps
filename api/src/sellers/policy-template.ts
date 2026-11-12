/**
 * The returns-policy template the seller portal offers (`sellers:policy:template`): a sensible starting text in both
 * languages that the seller edits and submits for approval. It states how returns really work on KOMORIKO (the customer asks
 * from their order, KOMORIKO support decides, a rider collects the goods, the refund follows once they are checked), so a
 * store's own policy never promises something the platform does not do. Plain text, each at most 2000 characters (the
 * policy limit); `{days}` is replaced with the platform's return window.
 */
export interface PolicyTemplate {
  returnsPolicy: { en: string; fr: string };
  /** The platform's return window in days (`returnWindowDays`), as used in the text. */
  returnWindowDays: number;
}

const EN = `Returns: you can return an item within {days} days of delivery if it is unused, in its original packaging and with all its accessories.
How it works: open the order in your KOMORIKO account and choose "Return an item". KOMORIKO support reviews every request and decides it; once approved, a rider collects the item from you.
Refunds: the money for the returned items goes back to your wallet (or your phone) after the goods have reached the warehouse and been checked.
Wrong, damaged or defective items: tell us on the return request and add a photo. We replace or refund them.
Not returnable: [list what you cannot take back, for example opened cosmetics, underwear, custom-made items].`;

const FR = `Retours : vous pouvez retourner un article dans les {days} jours qui suivent la livraison s'il est inutilisé, dans son emballage d'origine et avec tous ses accessoires.
Comment faire : ouvrez la commande dans votre compte KOMORIKO et choisissez « Retourner un article ». Le support KOMORIKO examine chaque demande et la traite ; une fois approuvée, un livreur vient récupérer l'article chez vous.
Remboursement : l'argent des articles retournés est reversé sur votre portefeuille (ou votre téléphone) une fois les articles arrivés à l'entrepôt et contrôlés.
Article erroné, abîmé ou défectueux : signalez-le dans la demande de retour et joignez une photo. Nous le remplaçons ou le remboursons.
Non retournable : [indiquez ce que vous ne reprenez pas, par exemple cosmétiques ouverts, sous-vêtements, articles sur mesure].`;

/** The template with the platform's return window filled in (a window of 0 or less reads "7", the default). */
export function policyTemplate(returnWindowDays: number): PolicyTemplate {
  const days = Number.isFinite(returnWindowDays) && returnWindowDays > 0 ? Math.trunc(returnWindowDays) : 7;
  const fill = (t: string) => t.replace(/\{days\}/g, String(days));
  return { returnsPolicy: { en: fill(EN), fr: fill(FR) }, returnWindowDays: days };
}
