// UI texts for round 3: phone and e-mail verification, two-step sign-in, sign-up recovery, the address pin fallback.
// key -> (English, French); placeholders are written {name}.
// ignore_for_file: prefer_single_quote_strings

const Map<String, (String, String)> kMessagesVerify = {
  // generic
  'err_server': ('The server had a problem. Please try again in a moment.', 'Le serveur a rencontré un problème. Réessayez dans un instant.'),
  // phone verification
  'ver_subtitle_phone_off': ('To confirm {value}', 'Pour confirmer {value}'),
  'ver_continue': ('Continue', 'Continuer'),
  'ver_phone_sending': ('Sending your code…', 'Envoi du code…'),
  'ver_phone_sent': ('We sent a 6-digit code by SMS to {to}. It expires in 10 minutes.', 'Nous avons envoyé un code à 6 chiffres par SMS au {to}. Il expire dans 10 minutes.'),
  'ver_phone_sent_plain': ('We sent a 6-digit code by SMS to your phone. It expires in 10 minutes.', 'Nous avons envoyé un code à 6 chiffres par SMS à votre téléphone. Il expire dans 10 minutes.'),
  'ver_sms_off_title': ('Text messages are not available yet', 'Les SMS ne sont pas encore disponibles'),
  'ver_sms_off_body': (
    'We could not text you a code. You can confirm your email address instead, or try again later.',
    'Nous n’avons pas pu vous envoyer de code par SMS. Vous pouvez confirmer votre adresse e-mail à la place, ou réessayer plus tard.'
  ),
  'ver_sms_failed_title': ('The code did not go out', 'Le code n’est pas parti'),
  'ver_sms_failed_body': ('Check that the number is right, then ask for a new code.', 'Vérifiez que le numéro est correct, puis demandez un nouveau code.'),
  'ver_use_email': ('Verify by email', 'Vérifier par e-mail'),
  'ver_use_phone': ('Verify by phone', 'Vérifier par téléphone'),
  'ver_change_number': ('Change number', 'Changer de numéro'),
  'ver_change_title': ('Change your mobile number', 'Changer votre numéro de mobile'),
  'ver_change_body': ('We will send a new code to this number.', 'Nous enverrons un nouveau code à ce numéro.'),
  'ver_change_save': ('Save and send code', 'Enregistrer et envoyer le code'),
  'ver_change_done': ('Number updated. A new code is on its way.', 'Numéro mis à jour. Un nouveau code arrive.'),
  'ver_code_resent': ('A new code was sent.', 'Un nouveau code a été envoyé.'),
  'ver_phone_done': ('Your phone number is verified.', 'Votre numéro de téléphone est vérifié.'),
  'ver_email_done': ('Your email address is verified.', 'Votre adresse e-mail est vérifiée.'),
  'ver_code_label': ('Verification code', 'Code de vérification'),
  'ver_box_label': ('Digit {n} of 6', 'Chiffre {n} sur 6'),
  // e-mail verification
  've_sent_to': ('We sent a confirmation link to {to}. It expires in 24 hours.', 'Nous avons envoyé un lien de confirmation à {to}. Il expire dans 24 heures.'),
  've_off_title': ('E-mail is not available yet', 'L’envoi d’e-mails n’est pas encore disponible'),
  've_off_body': (
    'We could not send you a link. You can confirm your phone number instead, or try again later.',
    'Nous n’avons pas pu vous envoyer de lien. Vous pouvez confirmer votre numéro de téléphone à la place, ou réessayer plus tard.'
  ),
  've_failed_title': ('The e-mail did not go out', 'L’e-mail n’est pas parti'),
  've_failed_body': ('Try again in a moment. Check your spam folder if it still does not arrive.', 'Réessayez dans un instant. Vérifiez vos courriers indésirables s’il n’arrive toujours pas.'),
  've_resent': ('A new link was sent.', 'Un nouveau lien a été envoyé.'),
  've_wait': ('You can ask for another link in {time}.', 'Vous pourrez demander un autre lien dans {time}.'),
  // checkout / wallet prompt
  'vp_phone_row': ('Phone', 'Téléphone'),
  'vp_email_row': ('Email address', 'Adresse e-mail'),
  'vp_verified': ('Verified', 'Vérifié'),
  'vp_not_verified': ('Not verified', 'Non vérifié'),
  'vp_no_phone': ('No number yet', 'Pas encore de numéro'),
  'vp_no_channel': ('We cannot send verification messages yet. Please try again later or contact support.', 'Nous ne pouvons pas encore envoyer de messages de vérification. Réessayez plus tard ou contactez l’assistance.'),
  'vp_choose': ('Choose one way to confirm your account:', 'Choisissez une façon de confirmer votre compte :'),
  // two-step sign-in
  'tf_title': ('Two-step sign-in', 'Connexion en deux étapes'),
  'tf_body': ('Enter the 6-digit code from your authenticator app, or one of your recovery codes.', 'Saisissez le code à 6 chiffres de votre application d’authentification, ou l’un de vos codes de secours.'),
  'tf_code': ('Code', 'Code à saisir'),
  'tf_code_hint': ('6 digits or a recovery code', '6 chiffres ou un code de secours'),
  'tf_submit': ('Confirm', 'Confirmer'),
  'tf_cancel': ('Cancel', 'Annuler'),
  'tf_err_empty': ('Enter the code.', 'Saisissez le code.'),
  // sign-up recovery
  'reg_exists_signin': ('This email already has an account. Sign in instead.', 'Cet e-mail a déjà un compte. Connectez-vous plutôt.'),
  'reg_recovered': ('Your account was already created: you are now signed in.', 'Votre compte était déjà créé : vous êtes connecté.'),
  'reg_go_signin': ('Sign in', 'Se connecter'),
  // recovery + phone login when the gateway is not set up
  'forgot_off': (
    'E-mail is not set up on this server yet, so no reset link could be sent. Please contact support.',
    'L’envoi d’e-mails n’est pas encore configuré sur ce serveur : aucun lien n’a pu être envoyé. Contactez l’assistance.'
  ),
  'phone_login_off': (
    'Text messages are not available yet. Sign in with your email and password.',
    'Les SMS ne sont pas encore disponibles. Connectez-vous avec votre e-mail et votre mot de passe.'
  ),
  // address pin without the map
  'addr_use_gps': ('Use my current position', 'Utiliser ma position actuelle'),
  'addr_gps_pinned': ('Pinned from your position', 'Épinglée à partir de votre position'),
  'addr_gps_done': ('Your position is saved as the delivery pin.', 'Votre position est enregistrée comme repère de livraison.'),
  'addr_location_off': ('Location services are turned off. Turn them on to use your position.', 'La localisation est désactivée. Activez-la pour utiliser votre position.'),
  'addr_location_settings': ('Settings', 'Réglages'),
  'addr_location_blocked': ('Location is blocked for this app. Allow it in Settings to use your position.', 'La localisation est bloquée pour cette application. Autorisez-la dans les réglages.'),
  'addr_location_denied_pin': ('Location permission is off. Allow it to pin your address with your position, or try again on a device with the map.', 'L’accès à la position est désactivé. Autorisez-le pour épingler votre adresse avec votre position, ou réessayez sur un appareil avec la carte.'),
  'addr_location_none': ('We could not find your position. Move to an open area and try again.', 'Nous n’avons pas pu trouver votre position. Placez-vous à l’air libre et réessayez.'),
  'addr_pin_needed_no_map': (
    'A pin is required for delivery. Use your current position, or try again on a device with the map.',
    'Un repère est requis pour la livraison. Utilisez votre position actuelle, ou réessayez sur un appareil avec la carte.'
  ),
};
