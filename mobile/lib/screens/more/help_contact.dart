import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../l10n/strings.dart';
import '../../services/realtime_store.dart';
import '../../theme/app_theme.dart';
import '../../widgets/feedback.dart';
import '../../widgets/common.dart' show SectionHeader;

/// Tests answer "open this link" instead of the phone's dialler, mail and WhatsApp apps.
@visibleForTesting
Future<bool> Function(Uri uri)? debugLaunch;

/// `wa.me` wants the number as digits only, country code first (`+243 970 000 111` -> `243970000111`).
Uri? whatsappLink(String number) {
  final digits = number.replaceAll(RegExp(r'\D'), '');
  return digits.length < 6 ? null : Uri.https('wa.me', '/$digits');
}

/// The numbers/addresses the platform publishes for Help (`supportPhone`, `supportEmail`, `supportWhatsapp`,
/// set by an admin in the platform settings). A blank one is not offered; with none set, nothing is shown.
List<HelpContact> helpContacts(RealtimeStore store) => [
      if (store.supportPhone.isNotEmpty)
        HelpContact('phone', Icons.call_outlined, store.supportPhone, Uri(scheme: 'tel', path: store.supportPhone.replaceAll(RegExp(r'[^\d+]'), ''))),
      if (store.supportEmail.isNotEmpty) HelpContact('email', Icons.mail_outline_rounded, store.supportEmail, Uri(scheme: 'mailto', path: store.supportEmail)),
      if (store.supportWhatsapp.isNotEmpty && whatsappLink(store.supportWhatsapp) != null)
        HelpContact('whatsapp', Icons.chat_outlined, store.supportWhatsapp, whatsappLink(store.supportWhatsapp)!),
    ];

class HelpContact {
  const HelpContact(this.id, this.icon, this.value, this.uri);
  final String id;
  final IconData icon;
  final String value;
  final Uri uri;
}

/// "Contact us": call, e-mail and WhatsApp rows under the support-ticket button. When the device cannot open the
/// link the value is copied and a snackbar says so, so a tap never does nothing.
class HelpContactCard extends StatelessWidget {
  const HelpContactCard({super.key});

  static Future<void> open(BuildContext context, HelpContact c) async {
    var ok = false;
    try {
      ok = await (debugLaunch ?? (u) => launchUrl(u, mode: LaunchMode.externalApplication))(c.uri);
    } catch (_) {
      ok = false;
    }
    if (ok || !context.mounted) return;
    await Clipboard.setData(ClipboardData(text: c.value));
    if (context.mounted) showSnack(context, Strings.of(context).helpOpenFailed(c.value));
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    return ListenableBuilder(
      listenable: RealtimeStore.instance,
      builder: (context, _) {
        final rows = helpContacts(RealtimeStore.instance);
        if (rows.isEmpty) return const SizedBox.shrink();
        String label(HelpContact c) => switch (c.id) { 'phone' => s.helpCall, 'email' => s.helpEmail, _ => s.helpWhatsapp };
        return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          SectionHeader(s.helpContactTitle, padding: const EdgeInsets.fromLTRB(4, 22, 4, 10)),
          Container(
            key: const ValueKey('help-contacts'),
            decoration: BoxDecoration(borderRadius: BorderRadius.circular(20), boxShadow: AppShadow.card),
            child: Material(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(20),
              clipBehavior: Clip.antiAlias,
              child: Column(children: [
                for (var i = 0; i < rows.length; i++) ...[
                  ListTile(
                    key: ValueKey('help-contact-${rows[i].id}'),
                    leading: Icon(rows[i].icon, color: AppColors.primary),
                    title: Text(label(rows[i]), style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                    subtitle: Text(rows[i].value, style: const TextStyle(color: AppColors.muted, fontSize: 13)),
                    onTap: () => open(context, rows[i]),
                  ),
                  if (i != rows.length - 1) const Divider(height: 1, indent: 16, endIndent: 16),
                ],
              ]),
            ),
          ),
        ]);
      },
    );
  }
}
