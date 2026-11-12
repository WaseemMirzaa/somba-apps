import 'package:flutter/material.dart';
import '../../l10n/strings.dart';
import '../../services/realtime_store.dart';
import '../../widgets/kit.dart';
import 'support_screens.dart';

/// "Contact support": opens a new support ticket with the order, product or store the shopper is looking at filled in.
/// It replaces "Message the seller" (messaging stores is closed). The support module owns this widget; other screens only
/// place it. Give [orderId] (the ticket is linked to that order) or [about] (a product or store name: it becomes the subject, editable).
///
/// When the ticket is created the conversation opens, so the shopper sees it was received.
class ContactSupportButton extends StatelessWidget {
  const ContactSupportButton({super.key, this.orderId, this.about, this.locale = const Locale('en')});

  final String? orderId;
  final String? about;
  final Locale locale;

  Future<void> _open(BuildContext context, Strings s) async {
    final nav = Navigator.of(context);
    final hasOrder = (orderId ?? '').isNotEmpty;
    final name = (about ?? '').trim();
    final ticket = await nav.push<TicketView>(MaterialPageRoute<TicketView>(
      builder: (_) => NewTicketScreen(
        orderId: orderId,
        category: hasOrder ? 'order' : null,
        initialSubject: !hasOrder && name.isNotEmpty ? s.supportAboutProduct(name) : null,
        locale: locale,
      ),
    ));
    if (ticket != null) {
      await nav.push<void>(MaterialPageRoute<void>(builder: (_) => SupportTicketDetailScreen(ticket: ticket, locale: locale)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = RealtimeStore.instance.user;
    // Only a signed-in shopper has tickets.
    if (user == null || user.role != 'customer') return const SizedBox.shrink();
    final s = Strings.of(context);
    return OutlinedButton(
      key: const ValueKey('contact-support'),
      onPressed: () => _open(context, s),
      child: ButtonLabel(s.contactSupport),
    );
  }
}
