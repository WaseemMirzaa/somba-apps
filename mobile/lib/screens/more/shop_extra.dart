import 'package:flutter/material.dart';
import '../../data/mock_data.dart';
import '../../data/catalog_live.dart';
import '../../data/catalog_meta.dart';
import '../../theme/app_theme.dart';
import '../../widgets/kit.dart';
import '../../widgets/common.dart';
import '../../widgets/product_card.dart';
import 'catalog_extra.dart';

/// Store front (CF-07).
class StoreScreen extends StatelessWidget {
  final Locale locale;
  final Seller? seller;
  const StoreScreen({super.key, this.locale = const Locale('en'), this.seller});

  String get _name => seller?.name ?? 'TechSphere Store';
  String get _initials {
    final parts = _name.split(' ').where((w) => w.isNotEmpty).toList();
    return (parts.length >= 2 ? '${parts[0][0]}${parts[1][0]}' : _name.substring(0, 2)).toUpperCase();
  }

  String get _tagline {
    if (seller == null) return 'Official electronics partner';
    switch (sellerCategory(seller!)) {
      case 'Fashion':
        return 'Fashion & apparel store';
      case 'Jewelery':
        return 'Fine jewelery boutique';
      default:
        return 'Electronics & gadgets store';
    }
  }

  String get _badgeLabel => (seller?.badge ?? SellerBadge.sombaAssured).label;
  int get _health => seller?.health ?? 97;
  String get _rating => (seller?.rating ?? 4.8).toString();
  int get _productCount => seller == null ? 128 : liveCatalog().where((p) => p.category == sellerCategory(seller!)).length;
  String get _followers => seller == null ? '12.4k' : '${((seller!.followers) / 1000).toStringAsFixed(1)}k';
  @override
  Widget build(BuildContext context) {
    final lang = locale.languageCode;
    final items = seller == null
        ? liveCatalog().take(6).toList()
        : liveCatalog().where((p) => p.category == sellerCategory(seller!)).toList();
    return Scaffold(
      body: CustomScrollView(slivers: [
        SliverToBoxAdapter(child: _header(context)),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
          sliver: SliverGrid(
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 2, childAspectRatio: 0.62, crossAxisSpacing: 14, mainAxisSpacing: 14),
            delegate: SliverChildBuilderDelegate((_, i) => ProductCard(product: items[i], lang: lang), childCount: items.length),
          ),
        ),
      ]),
    );
  }

  Widget _header(BuildContext context) {
    final top = MediaQuery.of(context).padding.top;
    return Container(
      padding: EdgeInsets.fromLTRB(20, top + 12, 20, 20),
      decoration: const BoxDecoration(gradient: AppColors.brandGradient, borderRadius: BorderRadius.vertical(bottom: Radius.circular(28))),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          CircleIconButton(icon: Icons.arrow_back_rounded, background: Colors.white.withValues(alpha: 0.2), color: Colors.white, onTap: () => Navigator.maybePop(context)),
          const Spacer(),
          CircleIconButton(icon: Icons.share_rounded, background: Colors.white.withValues(alpha: 0.2), color: Colors.white,
              onTap: () => ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Store link copied')))),
        ]),
        const SizedBox(height: 12),
        Row(children: [
          Container(height: 62, width: 62, decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(18)),
            child: Center(child: Text(_initials, style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w800, fontSize: 22, fontFamily: 'PlusJakartaSans')))),
          const SizedBox(width: 14),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Flexible(child: Text(_name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white, fontSize: 19, fontWeight: FontWeight.w800))),
              const SizedBox(width: 6),
              const Icon(Icons.verified_rounded, color: Colors.white, size: 18),
            ]),
            const SizedBox(height: 2),
            Text(_tagline, style: TextStyle(color: Colors.white.withValues(alpha: 0.9), fontSize: 12.5)),
            const SizedBox(height: 6),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.22), borderRadius: BorderRadius.circular(100)),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                const Icon(Icons.verified_rounded, color: Colors.white, size: 13),
                const SizedBox(width: 4),
                Text('$_badgeLabel · $_health% health', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 10.5)),
              ]),
            ),
          ])),
        ]),
        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.symmetric(vertical: 12),
          decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.16), borderRadius: BorderRadius.circular(16)),
          child: Row(children: [
            _stat('$_rating★', 'Rating'), _div(), _stat('$_productCount', 'Products'), _div(), _stat(_followers, 'Followers'),
          ]),
        ),
        const SizedBox(height: 14),
        Row(children: [
          Expanded(child: GestureDetector(
            onTap: () => ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Following TechSphere Store'))),
            child: _btn(Icons.add_rounded, 'Follow', true))),
          const SizedBox(width: 12),
          Expanded(child: GestureDetector(
            onTap: () => ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Opening chat with the store…'))),
            child: _btn(Icons.chat_bubble_outline_rounded, 'Chat', false))),
        ]),
      ]),
    );
  }

  Widget _stat(String v, String l) => Expanded(child: Column(children: [
        Text(v, style: const TextStyle(color: Colors.white, fontSize: 16.5, fontWeight: FontWeight.w800)),
        Text(l, style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 11.5)),
      ]));
  Widget _div() => Container(width: 1, height: 28, color: Colors.white.withValues(alpha: 0.25));
  Widget _btn(IconData i, String l, bool filled) => Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(color: filled ? Colors.white : Colors.white.withValues(alpha: 0.18), borderRadius: BorderRadius.circular(14)),
        child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          Icon(i, size: 18, color: filled ? AppColors.primary : Colors.white),
          const SizedBox(width: 6),
          Text(l, style: TextStyle(color: filled ? AppColors.primary : Colors.white, fontWeight: FontWeight.w700, fontSize: 13.5)),
        ]),
      );
}

/// Product reviews + write a review (CF-27).
class ReviewsScreen extends StatelessWidget {
  final Locale locale;
  const ReviewsScreen({super.key, this.locale = const Locale('en')});
  @override
  Widget build(BuildContext context) {
    const reviews = [
      ('Aline K.', 5, 'Absolutely love it — fast delivery and exactly as described.', '2d'),
      ('Patrick M.', 4, 'Great value for the price. Battery could be better.', '5d'),
      ('Sarah T.', 5, 'Premium quality, would buy again from this seller.', '1w'),
    ];
    return Scaffold(
      appBar: backAppBar(context, 'Reviews'),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
        Panel(child: Row(children: [
          Column(children: const [
            Text('4.8', style: TextStyle(fontSize: 40, fontWeight: FontWeight.w800, fontFamily: 'PlusJakartaSans', height: 1)),
            SizedBox(height: 4),
            RatingPill(4.8),
            SizedBox(height: 4),
            Text('2,341 reviews', style: TextStyle(color: AppColors.muted, fontSize: 12)),
          ]),
          const SizedBox(width: 20),
          Expanded(child: Column(children: List.generate(5, (i) {
            final star = 5 - i;
            final pct = [0.82, 0.12, 0.03, 0.02, 0.01][i];
            return Padding(padding: const EdgeInsets.symmetric(vertical: 2), child: Row(children: [
              Text('$star', style: const TextStyle(fontSize: 11, color: AppColors.muted)),
              const Icon(Icons.star_rounded, size: 12, color: AppColors.amber),
              const SizedBox(width: 6),
              Expanded(child: ClipRRect(borderRadius: BorderRadius.circular(100), child: LinearProgressIndicator(value: pct, minHeight: 6, backgroundColor: AppColors.line, color: AppColors.amber))),
            ]));
          }))),
        ])),
        const SizedBox(height: 14),
        ...reviews.map((r) => Padding(padding: const EdgeInsets.only(bottom: 12), child: Panel(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            CircleAvatar(radius: 18, backgroundColor: AppColors.primary.withValues(alpha: 0.12), child: Text(r.$1[0], style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w800))),
            const SizedBox(width: 10),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(r.$1, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
              Row(children: List.generate(5, (i) => Icon(i < r.$2 ? Icons.star_rounded : Icons.star_border_rounded, size: 14, color: AppColors.amber))),
            ])),
            Text(r.$4, style: const TextStyle(color: AppColors.faint, fontSize: 11.5)),
          ]),
          const SizedBox(height: 8),
          Text(r.$3, style: const TextStyle(fontSize: 13.5, height: 1.4, color: AppColors.inkSoft)),
        ])))),
      ]),
      bottomNavigationBar: Padding(
        padding: EdgeInsets.fromLTRB(16, 8, 16, 12 + MediaQuery.of(context).padding.bottom),
        child: PrimaryButton('Write a review',
            icon: Icons.rate_review_rounded,
            onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ReviewComposeScreen(locale: locale)))),
      ),
    );
  }
}

/// Dedicated payment screen with a failure/retry state (CF-11).
class PaymentScreen extends StatelessWidget {
  final Locale locale;
  final bool failed;
  const PaymentScreen({super.key, this.locale = const Locale('en'), this.failed = false});
  @override
  Widget build(BuildContext context) {
    const methods = [
      ('Credit / Debit Card', Icons.credit_card_rounded, true),
      ('Airtel Money', Icons.smartphone_rounded, false),
      ('M-Pesa', Icons.account_balance_wallet_rounded, false),
    ];
    return Scaffold(
      appBar: backAppBar(context, 'Payment'),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
        if (failed)
          Container(
            padding: const EdgeInsets.all(14),
            margin: const EdgeInsets.only(bottom: 14),
            decoration: BoxDecoration(color: AppColors.accent.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.accent.withValues(alpha: 0.3))),
            child: Row(children: const [
              Icon(Icons.error_outline_rounded, color: AppColors.accentDark),
              SizedBox(width: 10),
              Expanded(child: Text('Payment failed. No money was taken — please try another method.', style: TextStyle(color: AppColors.accentDark, fontWeight: FontWeight.w600, fontSize: 12.5))),
            ]),
          ),
        Panel(child: Column(children: [
          _row('Order total', '\$1,104'),
          const SizedBox(height: 8),
          _row('Delivery', '\$5'),
          const Divider(height: 22),
          _row('To pay', '\$1,109', bold: true),
        ])),
        const SizedBox(height: 16),
        const Text('Payment method', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
        const SizedBox(height: 10),
        ...methods.map((m) => Padding(padding: const EdgeInsets.only(bottom: 10), child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(16), border: Border.all(color: m.$3 ? AppColors.primary : AppColors.line, width: m.$3 ? 1.8 : 1.2)),
          child: Row(children: [
            Icon(m.$2, color: m.$3 ? AppColors.primary : AppColors.muted, size: 22),
            const SizedBox(width: 12),
            Expanded(child: Text(m.$1, style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14, color: m.$3 ? AppColors.ink : AppColors.inkSoft))),
            Icon(m.$3 ? Icons.radio_button_checked_rounded : Icons.radio_button_unchecked_rounded, color: m.$3 ? AppColors.primary : AppColors.faint, size: 22),
          ]),
        ))),
      ]),
      bottomNavigationBar: Padding(
        padding: EdgeInsets.fromLTRB(16, 8, 16, 12 + MediaQuery.of(context).padding.bottom),
        child: PrimaryButton(failed ? 'Retry payment · \$1,109' : 'Pay \$1,109',
            icon: Icons.lock_rounded,
            onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(failed ? 'Retrying payment…' : 'Payment successful')));
              Navigator.maybePop(context);
            }),
      ),
    );
  }

  Widget _row(String l, String v, {bool bold = false}) => Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
        Text(l, style: TextStyle(fontSize: bold ? 15 : 13.5, fontWeight: bold ? FontWeight.w800 : FontWeight.w500, color: bold ? AppColors.ink : AppColors.muted)),
        Text(v, style: TextStyle(fontSize: bold ? 17 : 13.5, fontWeight: FontWeight.w800, color: bold ? AppColors.primary : AppColors.ink)),
      ]);
}
