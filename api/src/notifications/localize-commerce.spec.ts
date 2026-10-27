import { localizeNotice } from './localize';

const fr = (title: string, body: string) => localizeNotice(title, body, 'fr');
const NB = ' ';

describe('French commerce notices', () => {
  it.each([
    ['Low stock', 'Stock bas'],
    ['Out of stock', 'Rupture de stock'],
    ['Low stock alert', 'Alerte de stock bas'],
    ['Flash sale started', 'Vente flash démarrée'],
    ['Flash sale scheduled', 'Vente flash programmée'],
    ['Flash sale ended', 'Vente flash terminée'],
    ['Flash sale nominated', 'Vente flash proposée'],
    ['Flash sale approved', 'Vente flash approuvée'],
    ['Flash sale declined', 'Vente flash refusée'],
    ['Campaign rejected', 'Campagne refusée'],
    ['Campaign budget used', 'Budget de campagne épuisé'],
    ['Commission invoice ready', 'Facture de commission disponible'],
    ['Payout settled', 'Versement réglé'],
    ['Payout declined', 'Versement refusé par la finance'],
  ])('titles: %s', (title, french) => {
    expect(fr(title, '')?.title).toBe(french);
  });

  it('the super admin’s payout lines', () => {
    expect(fr('Payout settled', 'PO-1 · Kinshasa Traders · $50.00 was paid.')?.body).toBe(`PO-1 · Kinshasa Traders · 50,00${NB}$ réglé.`);
    expect(fr('Payout settled', 'PO-1 · TechZone · $1234.50 was paid through pawaPay.')?.body).toBe(`PO-1 · TechZone · 1${NB}234,50${NB}$ réglé via pawaPay.`);
    expect(fr('Payout declined', 'PO-1 · TechZone · $50.00 was rejected.')?.body).toBe(`PO-1 · TechZone · 50,00${NB}$ refusé.`);
    expect(fr('Payout declined', 'PO-1 · TechZone · $50.00 was rejected (Wrong account).')?.body).toBe(`PO-1 · TechZone · 50,00${NB}$ refusé (Wrong account).`);
  });

  it('flash sale lines are not swallowed by the general "X is now Y." rule', () => {
    expect(fr('Flash sale started', 'Phone case is now on flash sale at $4.50.')?.body).toBe(`Phone case est maintenant en vente flash à 4,50${NB}$.`);
    expect(fr('Order update', 'SOM-1001 is now confirmed.')?.body).toBe('SOM-1001 est maintenant confirmée.'); // unchanged
  });

  it('a one-word product name works', () => {
    expect(fr('Low stock', 'Lamp is down to 2 (alert at 10). Restock soon.')?.body).toBe('Lamp : plus que 2 en stock (alerte à 10). Pensez à réapprovisionner.');
  });

  it('stays English for English recipients', () => {
    expect(localizeNotice('Low stock', 'x', 'en')).toBeNull();
  });
});
