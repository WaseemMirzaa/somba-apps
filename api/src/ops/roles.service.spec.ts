import { ROLE_DEFS, RolesService } from './roles.service';

const NONE = {} as never;

describe('roles:defs', () => {
  it('serves every role with an English and a French scope', () => {
    const defs = new RolesService(NONE, NONE, NONE, NONE, NONE).defs();
    expect(defs).toBe(ROLE_DEFS);
    expect(defs.map((d) => d.key)).toEqual([
      'admin',
      'admin_operations',
      'admin_finance',
      'admin_support',
      'admin_marketing',
      'admin_moderation',
      'warehouse_staff',
      'rider',
    ]);
    for (const d of defs) {
      expect(d.scope.trim()).not.toBe('');
      expect(d.scopeFr.trim()).not.toBe('');
      expect(d.scopeFr).not.toBe(d.scope); // a copy of the English is not a translation
    }
  });

  it.each([
    ['admin', 'Full access', 'Accès complet'],
    ['admin_operations', 'Orders, fulfilment, riders', 'Commandes, préparation, livreurs'],
    ['admin_finance', 'Payments, payouts, refunds', 'Paiements, versements, remboursements'],
    ['admin_support', 'Tickets, disputes', 'Tickets d’assistance, litiges'],
    ['admin_marketing', 'Promos, CMS, broadcasts', 'Promotions, contenu (CMS), diffusions'],
    ['admin_moderation', 'Sellers, products, reviews', 'Vendeurs, produits, avis'],
    ['warehouse_staff', 'Hubs, parcels, inventory', 'Entrepôts, colis, inventaire'],
    ['rider', 'Deliveries, GPS, earnings', 'Livraisons, GPS, gains'],
  ])('%s: "%s" -> "%s"', (key, scope, scopeFr) => {
    expect(ROLE_DEFS.find((d) => d.key === key)).toMatchObject({ scope, scopeFr });
  });
});
