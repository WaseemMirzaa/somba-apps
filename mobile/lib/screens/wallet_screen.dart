import 'package:flutter/material.dart';
import '../l10n/strings.dart';
import '../services/models.dart';
import '../services/realtime_store.dart';
import '../theme/app_theme.dart';
import '../util/format.dart';
import '../widgets/kit.dart';
import '../widgets/mobile_money.dart';

/// Wallet: balance, history and top-up through mobile money. The balance only
/// changes when the network confirms — the server pushes `wallet:updated`.
class WalletScreen extends StatefulWidget {
  final Locale locale;
  const WalletScreen({super.key, required this.locale});

  @override
  State<WalletScreen> createState() => _WalletScreenState();
}

class _WalletScreenState extends State<WalletScreen> {
  String get _lang => widget.locale.languageCode;

  void _topUp() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (_) => _TopUpSheet(locale: widget.locale),
    );
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings(_lang);
    return ListenableBuilder(
      listenable: RealtimeStore.instance,
      builder: (context, _) {
        final store = RealtimeStore.instance;
        final pending = store.payments.where((p) => p.purpose == 'topup' && p.isPending).toList();
        return Scaffold(
          appBar: backAppBar(context, s.wallet),
          body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(gradient: AppColors.brandGradient, borderRadius: BorderRadius.circular(24)),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(s.isFr ? 'Solde disponible' : 'Available balance',
                    style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 13)),
                const SizedBox(height: 6),
                Text(money(store.walletBalance),
                    key: const ValueKey('wallet-balance'),
                    style: const TextStyle(color: Colors.white, fontSize: 34, fontWeight: FontWeight.w800)),
                if (secondaryMoney(store.walletBalance) != null)
                  Text(secondaryMoney(store.walletBalance)!, style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 13)),
                const SizedBox(height: 16),
                FilledButton.icon(
                  key: const ValueKey('wallet-topup'),
                  onPressed: _topUp,
                  style: FilledButton.styleFrom(backgroundColor: Colors.white, foregroundColor: AppColors.primary),
                  icon: const Icon(Icons.add_rounded),
                  label: Text(s.isFr ? 'Recharger via Mobile Money' : 'Top up with mobile money'),
                ),
              ]),
            ),
            for (final p in pending) ...[
              const SizedBox(height: 14),
              _PendingTopUp(payment: p, lang: _lang),
            ],
            const SizedBox(height: 22),
            Text(s.isFr ? 'Historique' : 'History', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 10),
            if (store.walletTransactions.isEmpty)
              const Panel(child: Text('No transactions yet.', style: TextStyle(color: AppColors.muted)))
            else
              Panel(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                child: Column(children: [
                  for (var i = 0; i < store.walletTransactions.length; i++) ...[
                    _txTile(store.walletTransactions[i]),
                    if (i != store.walletTransactions.length - 1) const Divider(height: 1),
                  ],
                ]),
              ),
          ]),
        );
      },
    );
  }

  Widget _txTile(WalletTransactionDto t) {
    final credit = const {'credit', 'cashback', 'refund', 'topup'}.contains(t.type);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Row(children: [
        Container(
          height: 38,
          width: 38,
          decoration: BoxDecoration(color: (credit ? AppColors.success : AppColors.danger).withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)),
          child: Icon(credit ? Icons.south_west_rounded : Icons.north_east_rounded, size: 20, color: credit ? AppColors.success : AppColors.danger),
        ),
        const SizedBox(width: 12),
        Expanded(child: Text(t.description, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5))),
        Text('${credit ? '+' : '−'}${money(t.amount)}',
            style: TextStyle(fontWeight: FontWeight.w800, color: credit ? AppColors.success : AppColors.ink)),
      ]),
    );
  }
}

class _PendingTopUp extends StatelessWidget {
  final PaymentDto payment;
  final String lang;
  const _PendingTopUp({required this.payment, required this.lang});

  @override
  Widget build(BuildContext context) {
    final s = Strings(lang);
    return Container(
      key: const ValueKey('topup-pending'),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: AppColors.amber.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(18)),
      child: Row(children: [
        const SizedBox(height: 22, width: 22, child: CircularProgressIndicator(strokeWidth: 2.4)),
        const SizedBox(width: 12),
        Expanded(
          child: Text(
            s.isFr
                ? 'Approuvez la demande ${s.paymentLabel(payment.method)} de ${money(payment.amountUsd)} sur votre téléphone.'
                : 'Approve the ${s.paymentLabel(payment.method)} request for ${money(payment.amountUsd)} on your phone.',
            style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5),
          ),
        ),
      ]),
    );
  }
}

class _TopUpSheet extends StatefulWidget {
  final Locale locale;
  const _TopUpSheet({required this.locale});
  @override
  State<_TopUpSheet> createState() => _TopUpSheetState();
}

class _TopUpSheetState extends State<_TopUpSheet> {
  final _amount = TextEditingController(text: '20');
  late final TextEditingController _phone = TextEditingController(text: RealtimeStore.instance.user?.phone ?? '');
  String _method = 'airtel_money';
  String? _amountErr, _phoneErr;
  bool _busy = false;

  @override
  void dispose() {
    _amount.dispose();
    _phone.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final fr = widget.locale.languageCode == 'fr';
    final amount = double.tryParse(_amount.text.replaceAll(',', '.'));
    setState(() {
      _amountErr = (amount == null || amount < 1) ? (fr ? 'Montant minimum 1 \$' : 'Enter an amount of at least \$1') : null;
      _phoneErr = validateMobileNumber(_phone.text, fr: fr);
    });
    if (_amountErr != null || _phoneErr != null) return;
    setState(() => _busy = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      await RealtimeStore.instance.topUpWallet(amount!, method: _method, phone: _phone.text.trim());
      if (!mounted) return;
      Navigator.pop(context);
      messenger.showSnackBar(SnackBar(content: Text(fr ? 'Approuvez la demande sur votre téléphone.' : 'Approve the request on your phone.')));
    } catch (e) {
      if (mounted) setState(() => _busy = false);
      messenger.showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  @override
  Widget build(BuildContext context) {
    final fr = widget.locale.languageCode == 'fr';
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 20, 20, 20 + MediaQuery.of(context).viewInsets.bottom),
      child: SingleChildScrollView(
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(fr ? 'Recharger le portefeuille' : 'Top up wallet', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 19, fontFamily: 'PlusJakartaSans')),
          const SizedBox(height: 14),
          TextField(
            key: const ValueKey('topup-amount'),
            controller: _amount,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: InputDecoration(labelText: fr ? 'Montant (USD)' : 'Amount (USD)', prefixText: '\$ ', errorText: _amountErr),
          ),
          const SizedBox(height: 14),
          MobileMoneyPicker(
            locale: widget.locale.languageCode,
            method: _method,
            onMethod: (m) => setState(() => _method = m),
            phone: _phone,
            phoneError: _phoneErr,
          ),
          const SizedBox(height: 18),
          FilledButton(
            key: const ValueKey('topup-submit'),
            onPressed: _busy ? null : _submit,
            child: Text(_busy ? '…' : (fr ? 'Envoyer la demande' : 'Send request')),
          ),
        ]),
      ),
    );
  }
}
