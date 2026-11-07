// Texts of the rider's Vehicle and Documents screens (docs/contracts/rider-compliance.md): key -> (English, French).
// Merged into `kMessages` (messages.dart), so `Strings.t` and the translation tests see them like any other text.
// No imports on purpose: messages.dart and server_errors.dart import this file, and the typed accessors live in compliance_strings.dart.
// ignore_for_file: prefer_single_quote_strings

const Map<String, (String, String)> kComplianceMessages = {
  'vehicle_title': ('My vehicle', 'Mon véhicule'),
  'vehicle_sub': ('Model, plate, insurance and service dates', 'Modèle, plaque, assurance et dates d’entretien'),
  'vehicle_none': ('Your warehouse has not recorded your vehicle yet.', 'Votre entrepôt n’a pas encore enregistré votre véhicule.'),
  'vehicle_readonly': ('Your warehouse keeps these details up to date. Ask them if something is wrong.', 'Votre entrepôt tient ces informations à jour. Demandez-lui en cas d’erreur.'),
  'vehicle_model': ('Model', 'Modèle'),
  'vehicle_kind': ('Vehicle type', 'Type de véhicule'),
  'vehicle_plate': ('Plate number', 'Plaque d’immatriculation'),
  'vehicle_colour': ('Colour', 'Couleur'),
  'vehicle_odometer': ('Odometer', 'Compteur'),
  'vehicle_fuel': ('Fuel', 'Carburant'),
  'vehicle_insurance': ('Insurance valid until', 'Assurance valable jusqu’au'),
  'vehicle_last_service': ('Last service', 'Dernier entretien'),
  'vehicle_next_service': ('Next service', 'Prochain entretien'),
  'vtype_motorbike': ('Motorbike', 'Moto'),
  'vtype_scooter': ('Scooter (moped)', 'Scooter'),
  'vtype_bicycle': ('Bicycle', 'Vélo'),
  'vtype_car': ('Car', 'Voiture'),
  'vtype_van': ('Van', 'Camionnette'),
  'vtype_truck': ('Truck', 'Camion'),
  'vtype_other': ('Other', 'Autre'),
  'fuel_petrol': ('Petrol', 'Essence'),
  'fuel_diesel': ('Diesel (gasoil)', 'Diesel (gazole)'),
  'fuel_electric': ('Electric', 'Électrique'),
  'fuel_hybrid': ('Hybrid', 'Hybride'),
  'fuel_none': ('None (pedal power)', 'Aucun (à pédales)'),
  'insurance_expired': ('Insurance expired on {date}', 'Assurance expirée le {date}'),
  'insurance_expiring': ('Insurance ends in {n} days', 'L’assurance se termine dans {n} jours'),
  'insurance_expiring_today': ('Insurance ends today', 'L’assurance se termine aujourd’hui'),
  'service_overdue': ('Service overdue since {date}', 'Entretien en retard depuis le {date}'),
  'service_due': ('Service due in {n} days', 'Entretien à faire dans {n} jours'),
  'service_due_today': ('Service due today', 'Entretien à faire aujourd’hui'),
  'doc_title': ('My documents', 'Mes documents'),
  'doc_sub': ('Licence, insurance, registration and ID', 'Permis, assurance, carte grise et pièce d’identité'),
  'doc_none': ('No documents yet. Upload your licence, insurance and registration.', 'Aucun document pour le moment. Envoyez votre permis, votre assurance et votre carte grise.'),
  'doc_upload': ('Upload a document', 'Envoyer un document'),
  'doc_attention': ('Needs attention', 'À vérifier'),
  'doc_load_failed': ('Could not load. Pull down to try again.', 'Chargement impossible. Tirez vers le bas pour réessayer.'),
  'dtype_driver_licence': ('Driver licence', 'Permis de conduire'),
  'dtype_vehicle_insurance': ('Vehicle insurance', 'Assurance du véhicule'),
  'dtype_vehicle_registration': ('Vehicle registration', 'Carte grise'),
  'dtype_id_card': ('ID card', 'Pièce d’identité'),
  'dtype_other': ('Other document', 'Autre document'),
  'doc_status_pending': ('Waiting for review', 'En attente de vérification'),
  'doc_status_approved': ('Approved', 'Approuvé'),
  'doc_status_rejected': ('Rejected', 'Refusé'),
  'doc_number': ('Number {number}', 'Numéro {number}'),
  'doc_valid_until': ('Valid until {date}', 'Valable jusqu’au {date}'),
  'doc_no_expiry': ('No expiry date', 'Sans date d’expiration'),
  'doc_expired': ('Expired on {date}', 'Expiré le {date}'),
  'doc_expiring': ('Expires in {n} days ({date})', 'Expire dans {n} jours ({date})'),
  'doc_expiring_today': ('Expires today', 'Expire aujourd’hui'),
  'doc_rejected_reason': ('Reason: {reason}', 'Motif : {reason}'),
  'doc_checked_by': ('Checked by {name}', 'Vérifié par {name}'),
  'doc_warn_expired': ('Some of your documents have expired. Upload a new copy so your warehouse can check it.', 'Certains de vos documents ont expiré. Envoyez une nouvelle copie pour que votre entrepôt la vérifie.'),
  'doc_warn_expiring': ('Some of your documents expire within 30 days.', 'Certains de vos documents expirent dans les 30 jours.'),
  'doc_warn_note': ('You can keep working: this is only a reminder.', 'Vous pouvez continuer à travailler : ce n’est qu’un rappel.'),
  'up_type': ('Document type', 'Type de document'),
  'up_number': ('Document number (optional)', 'Numéro du document (facultatif)'),
  'up_expiry': ('Expiry date', 'Date d’expiration'),
  'up_expiry_pick': ('Choose a date', 'Choisir une date'),
  'up_photo': ('Photo of the document', 'Photo du document'),
  'up_photo_replace': ('Replace the photo', 'Remplacer la photo'),
  'up_photo_alt': ('Photo of your document', 'Photo de votre document'),
  'up_send': ('Send for review', 'Envoyer pour vérification'),
  'err_doc_type': ('Choose the document type.', 'Choisissez le type de document.'),
  'err_doc_photo': ('Add a photo of the document.', 'Ajoutez une photo du document.'),
  'doc_sent': ('Document sent. Your warehouse will review it.', 'Document envoyé. Votre entrepôt va le vérifier.'),
  'err_camera_denied': ('Camera access is off. Allow it in your phone settings to take a photo.', 'L’accès à l’appareil photo est désactivé. Autorisez-le dans les réglages du téléphone pour prendre une photo.'),
  'err_photos_denied': ('Photo access is off. Allow it in your phone settings to choose a photo.', 'L’accès aux photos est désactivé. Autorisez-le dans les réglages du téléphone pour choisir une photo.'),
};

/// Server sentences of the compliance events in French (docs/contracts/rider-compliance.md). Exact matches; the ones with a field
/// name inside are handled by [translateComplianceError].
const Map<String, String> kComplianceErrorsFr = {
  'Rider not found.': 'Livreur introuvable.',
  'Document not found.': 'Document introuvable.',
  'Upload the file first, then send it with its file id.': 'Envoyez d’abord le fichier, puis joignez-le au document.',
  'Upload the file again and retry.': 'Envoyez à nouveau le fichier puis réessayez.',
  'Only JPEG, PNG or PDF files are accepted.': 'Seuls les fichiers JPEG, PNG ou PDF sont acceptés.',
  'The file is too large (5 MB at most).': 'Le fichier est trop volumineux (5 Mo au maximum).',
  'This file was already sent. Upload a new one.': 'Ce fichier a déjà été envoyé. Envoyez-en un nouveau.',
  'You have reached the limit of documents. Ask your warehouse to review the ones you sent.': 'Vous avez atteint la limite de documents. Demandez à votre entrepôt de vérifier ceux déjà envoyés.',
};

/// French for a compliance sentence, or null when it is not one of ours.
String? translateComplianceError(String text) {
  final exact = kComplianceErrorsFr[text];
  if (exact != null) return exact;
  final date = RegExp(r'^(Insurance valid until|Last service|Next service|Expiry date) must be a date written YYYY-MM-DD\.$').firstMatch(text);
  if (date != null) {
    const names = {'Insurance valid until': 'La fin de l’assurance', 'Last service': 'Le dernier entretien', 'Next service': 'Le prochain entretien', 'Expiry date': 'La date d’expiration'};
    return '${names[date.group(1)]} doit être une date au format AAAA-MM-JJ.';
  }
  if (RegExp(r'^(Document type|Type|Fuel) must be one of: .+\.$').hasMatch(text)) return 'Choisissez une valeur de la liste.';
  final len = RegExp(r'^Document number must be (\d+)-(\d+) characters\.$').firstMatch(text);
  if (len != null) return 'Le numéro du document doit contenir de ${len.group(1)} à ${len.group(2)} caractères.';
  return null;
}
