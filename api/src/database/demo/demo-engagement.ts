import {
  Conversation,
  ProductQuestion,
  ProductView,
  Review,
  ReviewReport,
  StoreFollow,
  SupportTicket,
  WishlistItem,
} from '../entities';
import { ReviewsService } from '../../content/reviews.service';
import { WishlistService } from '../../content/wishlist.service';
import { FollowsService } from '../../follows/follows.service';
import { CartService } from '../../cart/cart.service';
import { ChatService } from '../../chat/chat.service';
import { SupportService } from '../../content/support.service';
import { SellerScoringService } from '../../sellers/seller-scoring.service';
import { log } from './demo-common';
import type { DemoCtx } from './demo-ctx';

const H = 3_600_000;
const D = 86_400_000;

/**
 * What customers and stores do besides ordering: wishlist, cart, followed stores, questions and answers, chats (with and
 * without photos), support tickets, review replies and votes, one reported review, daily product views for the
 * analytics pages, notices read and unread. Every part checks what exists first.
 */
export async function seedEngagement(ctx: DemoCtx): Promise<void> {
  await wishlistsAndCarts(ctx);
  await follows(ctx);
  await questions(ctx);
  await chats(ctx);
  await tickets(ctx);
  await reviewLife(ctx);
  await productViews(ctx);
  await noticesRead(ctx);
  await ctx.app
    .get(SellerScoringService)
    .recomputeAll()
    .catch(() => undefined);
  log(
    '✓ engagement: wishlists, carts, follows, questions, chats, tickets, review replies and votes',
  );
}

const user = (ctx: DemoCtx, key: string) => ctx.users.get(key)!;
const pid = (ctx: DemoCtx, sku: string) => ctx.products.get(sku)!.id;
const caller = (ctx: DemoCtx, key: string) => {
  const u = user(ctx, key);
  return { id: u.id, name: u.name, role: u.role };
};

async function wishlistsAndCarts(ctx: DemoCtx): Promise<void> {
  const wl = ctx.app.get(WishlistService);
  const cart = ctx.app.get(CartService);
  const lists: Record<string, string[]> = {
    'customer.full': ['MK-PHN', 'MK-DRS', 'MG-FIG', 'MK-HNY', 'MK-SNK'],
    'customer.fr': ['MK-SHB', 'MK-DRS'],
    'customer.unverified': ['MK-PHN', 'MK-EAR'],
  };
  for (const [key, skus] of Object.entries(lists)) {
    const u = user(ctx, key);
    const have = new Set(
      (
        await ctx.ds
          .getRepository(WishlistItem)
          .find({ where: { userId: u.id } })
      ).map((w) => w.productId),
    );
    for (const sku of skus)
      if (!have.has(pid(ctx, sku))) await wl.toggle(u.id, pid(ctx, sku));
  }
  const carts: Record<
    string,
    {
      lines: { sku: string; qty: number }[];
      saved?: { sku: string; qty: number }[];
    }
  > = {
    'customer.full': {
      lines: [
        { sku: 'MK-YOG', qty: 1 },
        { sku: 'MK-TOY', qty: 2 },
        { sku: 'MK-PLT', qty: 1 },
      ],
      saved: [
        { sku: 'MK-MAT', qty: 1 },
        { sku: 'MK-PHN', qty: 1 },
      ],
    },
    'customer.unverified': {
      lines: [
        { sku: 'MK-OIL', qty: 1 },
        { sku: 'MK-SHB', qty: 2 },
      ],
    },
    'customer.fr': { lines: [{ sku: 'MK-HNY', qty: 1 }] },
  };
  for (const [key, c] of Object.entries(carts)) {
    const u = user(ctx, key);
    const have = await ctx.ds.query(
      'SELECT COUNT(*) AS n FROM cart_lines WHERE userId = ?',
      [u.id],
    );
    if (Number(have[0].n) > 0) continue;
    const price = (sku: string) => ctx.products.get(sku)!.price;
    await cart.set(u.id, {
      lines: c.lines.map((l) => ({
        productId: pid(ctx, l.sku),
        qty: l.qty,
        variant: 'Default',
        priceWhenAdded: price(l.sku),
      })),
      saved: (c.saved ?? []).map((l) => ({
        productId: pid(ctx, l.sku),
        qty: l.qty,
        variant: 'Default',
        priceWhenAdded: price(l.sku),
      })),
    });
  }
}

async function follows(ctx: DemoCtx): Promise<void> {
  const f = ctx.app.get(FollowsService);
  const plan: Record<string, string[]> = {
    'customer.full': ['A', 'B', 'G'],
    'customer.fr': ['A'],
    'reviewer.1': ['A'],
    'reviewer.3': ['A', 'B'],
  };
  for (const [key, stores] of Object.entries(plan)) {
    const u = user(ctx, key);
    for (const s of stores) {
      const store = ctx.stores.get(s)!;
      if (
        !(await ctx.ds
          .getRepository(StoreFollow)
          .findOne({ where: { userId: u.id, sellerId: store.id } }))
      )
        await f.toggle({ id: u.id }, store.id, true);
    }
  }
}

async function questions(ctx: DemoCtx): Promise<void> {
  const reviews = ctx.app.get(ReviewsService);
  const repo = ctx.ds.getRepository(ProductQuestion);
  const ask = async (
    asker: string,
    sku: string,
    question: string,
    answer: { by: string; text: string } | null,
    agoH: number,
  ) => {
    const have = await repo.findOne({
      where: {
        askerId: user(ctx, asker).id,
        productId: pid(ctx, sku),
        question,
      },
    });
    if (have) return;
    const q = await reviews.ask(
      { id: user(ctx, asker).id, name: user(ctx, asker).name },
      { productId: pid(ctx, sku), question },
    );
    let answered = q;
    if (answer)
      answered = (await reviews.answer(q.id, answer.text, answer.by))!;
    await ctx.ds.query(
      'UPDATE product_questions SET createdAt = ?, answeredAt = IF(answeredAt IS NULL, NULL, ?) WHERE id = ?',
      [
        new Date(Date.now() - agoH * H),
        new Date(Date.now() - (agoH - 2) * H),
        answered.id,
      ],
    );
  };
  await ask(
    'customer.full',
    'MK-PHN',
    'Does this phone take two SIM cards and work on 4G in Kinshasa?',
    {
      by: 'Maison Kinshasa',
      text: 'Yes, it has two nano SIM slots and supports 4G on all Kinshasa networks. A memory card can go in a third slot.',
    },
    9 * 24,
  );
  await ask(
    'customer.full',
    'MK-SNK',
    'Do you have these in size 45?',
    null,
    5 * 24,
  );
  await ask(
    'customer.fr',
    'MK-DRS',
    'Est-ce que cette robe rétrécit au lavage ? Je fais du 40.',
    {
      by: 'Maison Kinshasa',
      text: 'The fabric is pre-washed so it does not shrink. For a French size 40, take the M. Wash it at 30 degrees.',
    },
    6 * 24,
  );
  await ask(
    'reviewer.2',
    'MK-EAR',
    'Can I use only one earbud at a time?',
    { by: 'Maison Kinshasa', text: 'Yes, each earbud works alone.' },
    30 * 24,
  );
  await ask(
    'reviewer.1',
    'MB-BTL',
    'How long does the bottle keep water cold?',
    null,
    3 * 24,
  );
  await ask(
    'customer.new',
    'MK-PLM',
    'Is the oil sold in a plastic or a glass bottle?',
    null,
    24,
  );
}

async function orderIdOf(
  ctx: DemoCtx,
  customer: string,
  sku: string,
): Promise<string | null> {
  const rows = await ctx.ds.query(
    'SELECT o.id FROM orders o JOIN order_items i ON i.orderId = o.id WHERE o.customerId = ? AND i.productId = ? ORDER BY o.createdAt DESC LIMIT 1',
    [user(ctx, customer).id, pid(ctx, sku)],
  );
  return rows[0]?.id ?? null;
}

async function chats(ctx: DemoCtx): Promise<void> {
  const chat = ctx.app.get(ChatService);
  const convRepo = ctx.ds.getRepository(Conversation);
  const talk = async (opts: {
    buyer: string;
    store: string;
    product?: string;
    orderId?: string | null;
    script: { by: string; text: string; photo?: string; agoH: number }[];
  }) => {
    const buyer = caller(ctx, opts.buyer);
    const store = ctx.stores.get(opts.store)!;
    const key = opts.orderId
      ? `o:${opts.orderId}`
      : opts.product
        ? `p:${pid(ctx, opts.product)}`
        : '';
    if (
      await convRepo.findOne({
        where: { buyerId: buyer.id, sellerId: store.id, contextKey: key },
      })
    )
      return;
    let convId = '';
    for (const m of opts.script) {
      const photos = m.photo ? [ctx.images.url(m.photo)] : [];
      let messageId: string;
      if (!convId) {
        const res = await chat.start(buyer, {
          sellerId: store.id,
          ...(opts.product ? { productId: pid(ctx, opts.product) } : {}),
          ...(opts.orderId ? { orderId: opts.orderId } : {}),
          text: m.text,
          attachments: photos,
        });
        convId = (res.conversation as { id: string }).id;
        messageId = (res.message as { id: string }).id;
      } else {
        const sent = (await chat.send(
          m.by === 'buyer' ? buyer : caller(ctx, m.by),
          { conversationId: convId, text: m.text, attachments: photos },
        )) as { id?: string; message?: { id: string } };
        messageId = sent.message?.id ?? (sent.id as string);
      }
      await ctx.ds.query(
        'UPDATE conversation_messages SET createdAt = ? WHERE id = ?',
        [new Date(Date.now() - m.agoH * H), messageId],
      );
    }
    const last = opts.script[opts.script.length - 1];
    await ctx.ds.query(
      'UPDATE conversations SET lastMessageAt = ? WHERE id = ?',
      [new Date(Date.now() - last.agoH * H), convId],
    );
  };
  // With photos: Grace asks about the dress in another colour; the support member of store A answers with a size photo.
  await talk({
    buyer: 'customer.full',
    store: 'A',
    product: 'MK-DRS',
    script: [
      {
        by: 'buyer',
        text: 'Hello! Do you have this dress in green, like the one in my picture?',
        photo: 'chat-1.jpg',
        agoH: 70,
      },
      {
        by: 'team.support',
        text: 'Hello Grace, thank you for your message. We only have Blue and Red at the moment. A green one arrives next month.',
        agoH: 69,
      },
      {
        by: 'buyer',
        text: 'Thanks! What size would you recommend for 1.70 m?',
        agoH: 68,
      },
      {
        by: 'team.support',
        text: 'Size M fits 1.65 to 1.75 m. Here is our measuring guide.',
        photo: 'chat-2.jpg',
        agoH: 67,
      },
      {
        by: 'buyer',
        text: 'Perfect, I will order the blue M today.',
        agoH: 66,
      },
    ],
  });
  // Without photos, about an order; the store's answer is the last message, unread by the customer.
  await talk({
    buyer: 'customer.full',
    store: 'B',
    orderId: await orderIdOf(ctx, 'customer.full', 'MB-PNT'),
    script: [
      {
        by: 'buyer',
        text: 'Good morning, when will my order be handed to the warehouse?',
        agoH: 6,
      },
      {
        by: 'seller.b',
        text: 'Good morning. It is packed and the rider comes to collect it this afternoon.',
        agoH: 4,
      },
    ],
  });
  // French customer writes French, the store answers in English (each side can translate on demand).
  await talk({
    buyer: 'customer.fr',
    store: 'A',
    orderId: await orderIdOf(ctx, 'customer.fr', 'MK-DRS'),
    script: [
      {
        by: 'buyer',
        text: 'Bonjour, ma robe est en livraison. Pouvez-vous me confirmer que la taille S correspond bien à du 36 ?',
        agoH: 20,
      },
      {
        by: 'seller.a',
        text: 'Hello! Yes, size S is a French 36. Your parcel is on its way and the rider will call you.',
        agoH: 18,
      },
      { by: 'buyer', text: 'Merci beaucoup, très bon service !', agoH: 17 },
    ],
  });
}

async function tickets(ctx: DemoCtx): Promise<void> {
  const support = ctx.app.get(SupportService);
  const repo = ctx.ds.getRepository(SupportTicket);
  const agentUser = user(ctx, 'admin.support');
  const agent = {
    id: agentUser.id,
    name: agentUser.name,
    role: agentUser.role as string,
  };
  const open = async (
    key: string,
    subject: string,
    message: string,
    extra: { orderOf?: [string, string]; photo?: string; category?: string },
    flow: (id: string) => Promise<void>,
    agoH: number,
  ) => {
    const u = user(ctx, key);
    if (await repo.findOne({ where: { userId: u.id, subject } })) return;
    const orderId = extra.orderOf
      ? await orderIdOf(ctx, extra.orderOf[0], extra.orderOf[1])
      : null;
    const t = await support.open(
      { id: u.id, name: u.name, role: u.role },
      {
        subject,
        message,
        category: extra.category,
        ...(orderId ? { orderId } : {}),
        ...(extra.photo ? { attachments: [ctx.images.url(extra.photo)] } : {}),
      },
    );
    await flow(t.id);
    // Date the whole thread: the opening message at `agoH` ago, the rest an hour later.
    const sec = Math.round(
      (new Date(t.createdAt).getTime() - (Date.now() - agoH * H)) / 1000,
    );
    await ctx.ds.query(
      `UPDATE support_tickets SET createdAt = DATE_SUB(createdAt, INTERVAL ${sec} SECOND), updatedAt = DATE_SUB(updatedAt, INTERVAL ${sec} SECOND) WHERE id = ?`,
      [t.id],
    );
    await ctx.ds.query(
      `UPDATE support_messages SET createdAt = DATE_SUB(createdAt, INTERVAL ${sec} SECOND) WHERE ticketId = ?`,
      [t.id],
    );
    await ctx.ds.query(
      'UPDATE notifications SET createdAt = DATE_SUB(createdAt, INTERVAL ? SECOND) WHERE entityId = ?',
      [sec, t.id],
    );
  };
  // Answered and closed.
  await open(
    'customer.full',
    'Where is my order of honey and oil?',
    'I ordered honey and hair oil this morning and I would like to know when the rider will come.',
    { orderOf: ['customer.full', 'MK-HNY'], category: 'order' },
    async (id) => {
      await support.reply(
        id,
        agent,
        'Hello Grace, your order is packed by the seller and a rider is assigned to collect it today. You will get a notice when it is at our warehouse.',
      );
      await support.setStatus(id, 'closed');
    },
    70,
  );
  // Open, with a photo, waiting for an answer.
  await open(
    'customer.full',
    'Wrong total on my receipt',
    'The total on my receipt does not match what was taken from my wallet. I attach a photo of the receipt.',
    { photo: 'support-1.jpg', category: 'payment' },
    async () => undefined,
    5,
  );
  // A store asks the platform.
  await open(
    'seller.b',
    'How do I get on the Pro plan?',
    'We are on the Free plan and want coupons and flash sales. What is the next step?',
    { category: 'account' },
    async (id) => {
      await support.reply(
        id,
        agent,
        'Hello, open Subscribe in your portal, choose Pro and pay with your wallet. The perks are on straight away.',
      );
    },
    30,
  );
}

async function reviewLife(ctx: DemoCtx): Promise<void> {
  const reviews = ctx.app.get(ReviewsService);
  const repo = ctx.ds.getRepository(Review);
  const find = async (sku: string, byKey: string) =>
    repo.findOne({
      where: { productId: pid(ctx, sku), userId: user(ctx, byKey).id },
    });
  // Replies by the stores.
  const replies: [string, string, string, string][] = [
    [
      'MK-DRS',
      'reviewer.1',
      'seller.a',
      'Thank you Esther! We are happy the dress fitted so well.',
    ],
    [
      'MK-LMP',
      'reviewer.4',
      'seller.a',
      'Thank you for the honest review. The solar panel needs direct sun; the USB cable charges it faster.',
    ],
    [
      'MB-TOW',
      'reviewer.4',
      'seller.b',
      'We are sorry you feel this way. The towel was delivered on time; please contact us so we can help.',
    ],
  ];
  for (const [sku, by, seller, text] of replies) {
    const r = await find(sku, by);
    if (r && !r.sellerReply) {
      const s = user(ctx, seller);
      await reviews.reply(
        { id: s.id, role: 'seller', name: s.name },
        r.id,
        text,
      );
    }
  }
  // Store B reports the abusive review (it appears in the admin review reports).
  const abusive = await find('MB-TOW', 'reviewer.4');
  if (
    abusive &&
    !(await ctx.ds
      .getRepository(ReviewReport)
      .count({ where: { reviewId: abusive.id } }))
  ) {
    const b = user(ctx, 'seller.b');
    await reviews.report(
      { id: b.id, name: b.name, role: 'seller' },
      abusive.id,
      'Insults and accusations; the order was delivered and the buyer never contacted us.',
    );
  }
  // Helpful votes from the other customers (one to four per review). A vote already given changes nothing.
  const voters = [
    'customer.full',
    'customer.fr',
    'reviewer.1',
    'reviewer.2',
    'reviewer.3',
    'reviewer.4',
  ];
  const productIds = new Set([...ctx.products.values()].map((p) => p.id));
  const all = (
    await repo.find({
      where: { status: 'visible' },
      order: { createdAt: 'ASC' },
    })
  ).filter((r) => productIds.has(r.productId));
  for (const [n, r] of all.entries()) {
    const take = 1 + (n % 4);
    let given = 0;
    for (const v of voters) {
      if (given >= take) break;
      if (user(ctx, v).id === r.userId) continue;
      await reviews.markHelpful(r.id, user(ctx, v).id);
      given++;
    }
  }
}

async function productViews(ctx: DemoCtx): Promise<void> {
  const repo = ctx.ds.getRepository(ProductView);
  const live = [...ctx.products.values()].filter((p) => p.status === 'live');
  for (const [i, p] of live.entries()) {
    if (await repo.count({ where: { productId: p.id } })) continue;
    const rows = Array.from({ length: 30 }, (_, d) => {
      const day = new Date(Date.now() - d * D).toISOString().slice(0, 10);
      // A gentle, repeatable curve per product (no randomness, so a re-run would write the same numbers).
      const views = 4 + (((i + 1) * 7 + d * 5) % 23) + (d < 7 ? 6 : 0);
      return repo.create({ productId: p.id, viewDate: day, views });
    });
    await repo.save(rows);
  }
}

/** Half of each demo account's older notices are marked read; the newest stay unread. */
async function noticesRead(ctx: DemoCtx): Promise<void> {
  for (const key of [
    'customer.full',
    'customer.fr',
    'seller.a',
    'seller.b',
    'reviewer.1',
  ]) {
    const u = user(ctx, key);
    const rows: { id: string }[] = await ctx.ds.query(
      'SELECT id FROM notifications WHERE userId = ? ORDER BY createdAt ASC',
      [u.id],
    );
    const older = rows.slice(0, Math.floor(rows.length / 2)).map((r) => r.id);
    if (older.length)
      await ctx.ds.query(
        `UPDATE notifications SET \`read\` = 1 WHERE id IN (${older.map(() => '?').join(',')}) AND \`read\` = 0`,
        older,
      );
  }
}
