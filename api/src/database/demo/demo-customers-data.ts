import { PINS } from './demo-catalog';

/**
 * The people and places of the customer demo (docs: deploy/DEMO-SEED.md, "Customer app: what each demo customer can show").
 * Kept apart from the order scenarios so the names, the Kinshasa addresses and the pins read as data. Every e-mail is
 * `<key>@demo.komoriko.test` (that is how the removal finds them) and every phone is in the unassigned `+243 900 000 xxx` range.
 *
 * The streets and landmarks are made up (the communes and the pins are real positions, as for the other demo addresses). People
 * type an address in the language they use, so a landmark is written once, in French, as in Kinshasa.
 */

export interface DemoAddress {
  label: string;
  line1: string;
  /** The landmark ("near the market, blue gate"): what a rider reads to find the door. */
  line2?: string;
  commune: string;
  code: string;
  lat: number;
  lng: number;
}

/** Addresses of the new customers. The first of each customer in `EXTRA_BOOK` is the default one. */
export const EXTRA_ADDRESSES = {
  vipHome: {
    label: 'Maison',
    line1: '48 Avenue Colonel Ebeya, quartier Gombe Résidentiel',
    line2: 'Immeuble Les Palmiers, 3e étage, porte 12',
    commune: 'Gombe',
    code: 'CD-KN-GOM',
    lat: -4.3074,
    lng: 15.3098,
  },
  vipOffice: {
    label: 'Bureau',
    line1: '17 Boulevard du 30 Juin',
    line2: 'En face de la Banque Centrale, 5e étage',
    commune: 'Gombe',
    code: 'CD-KN-GOM',
    lat: -4.3043,
    lng: 15.3053,
  },
  vipMama: {
    label: 'Chez maman',
    line1: '12 Avenue Mondjiba, quartier Joli Parc',
    line2: 'Portail vert, près du supermarché',
    commune: 'Ngaliema',
    code: 'CD-KN-NGL',
    ...PINS.ngaliemaCustomer,
  },
  joelHome: {
    label: 'Maison',
    line1: '33 Avenue de la Paix, quartier Salongo',
    line2: 'Derrière le marché de la Liberté, portail bleu',
    commune: 'Masina',
    code: 'CD-KN-MSN',
    ...PINS.masinaCustomer,
  },
  joelShop: {
    label: 'Boutique',
    line1: '4 Avenue Kasa-Vubu, quartier Ndolo',
    line2: 'À côté de la pharmacie du Peuple',
    commune: 'Kasa-Vubu',
    code: 'CD-KN-KSV',
    lat: -4.3395,
    lng: 15.3081,
  },
  priscillaHome: {
    label: 'Home',
    line1: '58 Avenue Sendwe, quartier Yolo',
    line2: 'Près de l’église Sainte-Thérèse',
    commune: 'Kalamu',
    code: 'CD-KN-KLM',
    lat: -4.3471,
    lng: 15.3241,
  },
  priscillaWork: {
    label: 'Work',
    line1: '9 Avenue Kabinda',
    line2: 'Résidence Sakombi, rez-de-chaussée',
    commune: 'Bandalungwa',
    code: 'CD-KN-BDL',
    lat: -4.3396,
    lng: 15.2872,
  },
  kasongoDepot: {
    label: 'Dépôt Kasongo & Fils',
    line1: '71 Avenue Kasa-Vubu, quartier Ndolo',
    line2: 'Quincaillerie Kasongo & Fils, grand portail rouge',
    commune: 'Kasa-Vubu',
    code: 'CD-KN-KSV',
    lat: -4.3409,
    lng: 15.3066,
  },
  kasongoHome: {
    label: 'Maison',
    line1: '22 Avenue de l’Université, quartier Binza',
    line2: 'Parcelle avec manguier, près du rond-point',
    commune: 'Ngaliema',
    code: 'CD-KN-NGL',
    lat: -4.3721,
    lng: 15.2512,
  },
  fabriceHome: {
    label: 'Home',
    line1: '6 Avenue Bokassa, quartier Mapela',
    line2: 'Près de l’arrêt de bus, maison jaune',
    commune: 'Masina',
    code: 'CD-KN-MSN',
    lat: -4.3689,
    lng: 15.3874,
  },
  sarahHome: {
    label: 'Home',
    line1: '3 Avenue des Aviateurs, Résidence Le Prestige',
    line2: 'Appartement 4B, gardien à l’entrée',
    commune: 'Gombe',
    code: 'CD-KN-GOM',
    lat: -4.3112,
    lng: 15.3139,
  },
  aimeeHome: {
    label: 'Maison',
    line1: '15 Avenue Moulaert, quartier Ma Campagne',
    line2: 'Maison blanche, en face de l’école',
    commune: 'Ngaliema',
    code: 'CD-KN-NGL',
    lat: -4.3688,
    lng: 15.2552,
  },
  aminaHome: {
    label: 'Home',
    line1: '27 Avenue des Poids Lourds, quartier Industriel',
    line2: 'Après la station Engen, portail noir',
    commune: 'Limete',
    code: 'CD-KN-LMT',
    lat: -4.3498,
    lng: 15.3403,
  },
} as const satisfies Record<string, DemoAddress>;

export type ExtraAddressKey = keyof typeof EXTRA_ADDRESSES;

/** The address book of each new customer (the first is the default). */
export const EXTRA_BOOK: Record<string, ExtraAddressKey[]> = {
  'customer.vip': ['vipHome', 'vipOffice', 'vipMama'],
  'customer.regular.fr': ['joelHome', 'joelShop'],
  'customer.regular.en': ['priscillaHome', 'priscillaWork'],
  'customer.business': ['kasongoDepot', 'kasongoHome'],
  'customer.cancelled': ['fabriceHome'],
  'customer.expat': ['sarahHome'],
  'customer.newfr': ['aimeeHome'],
  'customer.cart': ['aminaHome'],
};

/** The first-name-only version of the account's name: what a notice or a chat calls the person. */
export const firstName = (name: string): string => name.split(/\s+/)[0] ?? name;
