import 'package:get/get.dart';

/// GetX translations — French is the default locale, English the fallback.
class AppTranslations extends Translations {
  @override
  Map<String, Map<String, String>> get keys => {
        'en': _en,
        'fr': _fr,
      };

  static const Map<String, String> _en = {
    // Common
    'app_name': 'Somba Rider',
    'splash_tagline': 'Pickups & deliveries — Somba&Teka',
    'common_close': 'Close',
    'common_cancel': 'Cancel',
    'common_not_found': 'Item not found.',

    // Login
    'login_title': 'Welcome back',
    'login_subtitle': 'Sign in to start your shift.',
    'login_phone': 'Phone number',
    'login_phone_hint': '+243 8XX XXX XXX',
    'login_password': 'Password',
    'login_button': 'Sign in',
    'login_demo_title': 'Demo credentials',
    'login_demo_body':
        'Use any phone number with the password "somba123" to sign in.',
    'login_error_phone': 'Please enter your phone number.',
    'login_error_credentials':
        'Incorrect credentials. Use the password "somba123".',

    // First password
    'fp_title': 'Set your password',
    'fp_subtitle':
        'This is your first sign-in. Please choose a new personal password.',
    'fp_new': 'New password',
    'fp_confirm': 'Confirm password',
    'fp_rule_length': 'At least 6 characters.',
    'fp_error_match': 'The two passwords do not match.',
    'fp_button': 'Save password',
    'fp_success_title': 'Password updated',
    'fp_success_body': 'Your new password has been saved.',

    // KYC
    'kyc_title': 'Identity verification',
    'kyc_subtitle':
        'Please submit your documents so the operations team can verify your profile.',
    'kyc_id_number': 'ID document number',
    'kyc_id_doc': 'ID document',
    'kyc_photo': 'Profile photo',
    'kyc_attached': 'Attached',
    'kyc_tap_attach': 'Tap to attach',
    'kyc_vehicle_type': 'Vehicle type',
    'kyc_plate': 'License plate',
    'kyc_submit': 'Submit for review',
    'kyc_error_fields': 'Please fill in all fields and attach both documents.',
    'kyc_pending_title': 'Under review',
    'kyc_pending_body':
        'Your documents have been submitted. The operations team is reviewing your profile.',
    'kyc_continue': 'Continue (demo approval)',
    'kyc_approved': 'KYC approved',
    'kyc_pending': 'KYC pending',
    'vehicle_motorcycle': 'Motorcycle',
    'vehicle_car': 'Car',
    'vehicle_bicycle': 'Bicycle',

    // Shell tabs
    'tab_tasks': 'Tasks',
    'tab_map': 'Map',
    'tab_history': 'History',
    'tab_profile': 'Profile',

    // Tasks tab
    'tasks_greeting': 'Hello, @name',
    'tasks_subtitle': 'Here are your assigned tasks.',
    'tasks_online': 'You are online',
    'tasks_offline': 'You are offline',
    'tasks_go_online_title': 'You are offline',
    'tasks_go_online_body': 'Go online to receive tasks.',
    'tasks_empty_title': 'All caught up!',
    'tasks_empty_body': 'No tasks assigned for the moment.',
    'tasks_delivery_section': 'DELIVERY BATCH',
    'tasks_pickups_section': 'PICKUPS',
    'tasks_batch_stops': '@done of @total stops completed',
    'tasks_km': '@km km',
    'tasks_parcels': '@count parcel(s)',

    // Statuses and types
    'status_assigned': 'Assigned',
    'status_in_progress': 'In progress',
    'status_to_warehouse': 'To warehouse',
    'status_completed': 'Completed',
    'status_failed': 'Failed',
    'type_pickup': 'Pickup',
    'type_delivery': 'Delivery',

    // Pickup task detail
    'task_seller': 'SELLER',
    'task_address': 'Address',
    'task_distance': 'Distance',
    'task_parcels': 'Parcels',
    'task_navigate': 'Navigate',
    'task_arrived': 'Arrived at seller',

    // Pickup proof
    'proof_title': 'Proof of pickup',
    'proof_scan_instruction':
        'Scan the barcode of each parcel, then enter the seller\'s OTP code.',
    'proof_scan': 'Scan',
    'proof_scanned': 'Scanned',
    'proof_otp_label': 'SELLER OTP CODE',
    'proof_otp_help': 'Demo code: 4321',
    'proof_otp_error': 'Incorrect OTP code. Please try again.',
    'proof_scan_all_error': 'Please scan all parcels first.',
    'proof_confirm_pickup': 'Confirm pickup',
    'proof_done_title': 'Pickup confirmed',
    'proof_done_body': 'Now bring the parcels to the warehouse.',

    // Warehouse check-in
    'wh_title': 'Warehouse check-in',
    'wh_route_info': 'Drop off @count parcel(s) at the warehouse',
    'wh_checkin': 'Check in at warehouse',
    'wh_success_title': 'Check-in successful',
    'wh_success_body': 'Task @id is completed. Parcels received at the warehouse.',
    'wh_back_to_tasks': 'Back to tasks',

    // Batch
    'batch_stops_title': 'ORDERED STOPS',
    'batch_start_route': 'Start route',
    'batch_resume_route': 'Resume route',
    'batch_view_summary': 'View summary',
    'batch_complete_title': 'Batch completed!',
    'batch_complete_body': 'Batch @id is finished. Great job!',
    'batch_delivered': 'Delivered',
    'batch_failed_count': 'Failed',
    'batch_back_home': 'Back to tasks',

    // Stop detail
    'stop_customer': 'CUSTOMER',
    'stop_arrived': 'Arrived',
    'stop_failed_link': 'Delivery failed',
    'stop_parcel': 'PARCEL',

    // Proof of delivery
    'pod_title': 'Proof of delivery',
    'pod_instruction':
        'Scan the parcel, then enter the customer\'s OTP code to confirm delivery.',
    'pod_otp_label': 'CUSTOMER OTP CODE',
    'pod_confirm': 'Confirm delivery',
    'pod_next_title': 'Stop completed',
    'pod_next_body': 'Next stop: @name',

    // Failed delivery
    'fail_title': 'Failed delivery',
    'fail_reason': 'Reason',
    'fail_reason_absent': 'Customer absent',
    'fail_reason_wrong_address': 'Wrong address',
    'fail_reason_refused': 'Parcel refused',
    'fail_reason_unreachable': 'Customer unreachable',
    'fail_note': 'Note',
    'fail_note_hint': 'Add a comment (optional)…',
    'fail_photo': 'Photo evidence',
    'fail_photo_tap': 'Tap to attach a photo (mock)',
    'fail_photo_attached': 'Photo attached',
    'fail_confirm': 'Confirm failure',

    // Map tab
    'map_you': 'You',
    'map_active_task': 'ACTIVE TASK',
    'map_no_active': 'No active task at the moment.',

    // History
    'history_title': 'History',
    'history_empty': 'No completed tasks yet.',
    'history_today': 'Today',
    'history_yesterday': 'Yesterday',

    // Notifications
    'notif_title': 'Notifications',
    'notif_empty': 'No notifications.',
    'notif_task_assigned_title': 'New task assigned',
    'notif_task_assigned_body': 'Pickup @id in @commune has been assigned to you.',
    'notif_batch_ready_title': 'Batch ready for delivery',
    'notif_batch_ready_body':
        'Batch @id (@count stops) is ready at the warehouse.',
    'notif_announce_hours_title': 'Warehouse opening hours',
    'notif_announce_hours_body':
        'The central warehouse is open from 7:30 AM to 6:00 PM, Monday to Saturday.',
    'notif_announce_safety_title': 'Safety reminder',
    'notif_announce_safety_body':
        'Always wear your helmet and check your vehicle before each route.',
    'time_min_ago': '@m min ago',
    'time_hours_ago': '@h h ago',
    'time_days_ago': '@d d ago',

    // Profile
    'profile_title': 'Profile',
    'profile_city': 'City',
    'profile_vehicle': 'Vehicle',
    'profile_rating': 'Rating',
    'profile_language': 'LANGUAGE',
    'profile_support': 'SUPPORT',
    'profile_support_tile': 'Contact support',
    'profile_support_subtitle': 'Operations team — Somba&Teka',
    'profile_logout': 'Log out',
    'logout_confirm_title': 'Log out?',
    'logout_confirm_body': 'Are you sure you want to log out?',
    'language_fr': 'Français',
    'language_en': 'English',
    'support_title': 'Support',
    'support_body':
        'Contact the operations team for any issue with your tasks.',
    'support_phone': 'Phone',
    'support_email': 'Email',
    'support_hours': 'Hours',
    'support_hours_value': 'Mon–Sat, 7:30 AM – 6:00 PM',
  };

  static const Map<String, String> _fr = {
    // Commun
    'app_name': 'Somba Rider',
    'splash_tagline': 'Collectes & livraisons — Somba&Teka',
    'common_close': 'Fermer',
    'common_cancel': 'Annuler',
    'common_not_found': 'Élément introuvable.',

    // Connexion
    'login_title': 'Bon retour',
    'login_subtitle': 'Connectez-vous pour commencer votre service.',
    'login_phone': 'Numéro de téléphone',
    'login_phone_hint': '+243 8XX XXX XXX',
    'login_password': 'Mot de passe',
    'login_button': 'Se connecter',
    'login_demo_title': 'Identifiants de démonstration',
    'login_demo_body':
        'Utilisez n\'importe quel numéro de téléphone avec le mot de passe « somba123 ».',
    'login_error_phone': 'Veuillez saisir votre numéro de téléphone.',
    'login_error_credentials':
        'Identifiants incorrects. Utilisez le mot de passe « somba123 ».',

    // Premier mot de passe
    'fp_title': 'Définir votre mot de passe',
    'fp_subtitle':
        'Première connexion détectée. Veuillez choisir un nouveau mot de passe personnel.',
    'fp_new': 'Nouveau mot de passe',
    'fp_confirm': 'Confirmer le mot de passe',
    'fp_rule_length': 'Au moins 6 caractères.',
    'fp_error_match': 'Les deux mots de passe ne correspondent pas.',
    'fp_button': 'Enregistrer le mot de passe',
    'fp_success_title': 'Mot de passe mis à jour',
    'fp_success_body': 'Votre nouveau mot de passe a été enregistré.',

    // KYC
    'kyc_title': 'Vérification d\'identité',
    'kyc_subtitle':
        'Veuillez soumettre vos documents afin que l\'équipe des opérations puisse vérifier votre profil.',
    'kyc_id_number': 'Numéro de la pièce d\'identité',
    'kyc_id_doc': 'Pièce d\'identité',
    'kyc_photo': 'Photo de profil',
    'kyc_attached': 'Jointe',
    'kyc_tap_attach': 'Appuyez pour joindre',
    'kyc_vehicle_type': 'Type de véhicule',
    'kyc_plate': 'Plaque d\'immatriculation',
    'kyc_submit': 'Soumettre pour vérification',
    'kyc_error_fields':
        'Veuillez remplir tous les champs et joindre les deux documents.',
    'kyc_pending_title': 'En cours de vérification',
    'kyc_pending_body':
        'Vos documents ont été soumis. L\'équipe des opérations vérifie votre profil.',
    'kyc_continue': 'Continuer (approbation démo)',
    'kyc_approved': 'KYC approuvé',
    'kyc_pending': 'KYC en attente',
    'vehicle_motorcycle': 'Moto',
    'vehicle_car': 'Voiture',
    'vehicle_bicycle': 'Vélo',

    // Onglets
    'tab_tasks': 'Tâches',
    'tab_map': 'Carte',
    'tab_history': 'Historique',
    'tab_profile': 'Profil',

    // Onglet Tâches
    'tasks_greeting': 'Bonjour, @name',
    'tasks_subtitle': 'Voici vos tâches assignées.',
    'tasks_online': 'Vous êtes en ligne',
    'tasks_offline': 'Vous êtes hors ligne',
    'tasks_go_online_title': 'Vous êtes hors ligne',
    'tasks_go_online_body': 'Passez en ligne pour recevoir des tâches.',
    'tasks_empty_title': 'Tout est à jour !',
    'tasks_empty_body': 'Aucune tâche assignée pour le moment.',
    'tasks_delivery_section': 'LOT DE LIVRAISON',
    'tasks_pickups_section': 'COLLECTES',
    'tasks_batch_stops': '@done arrêts sur @total terminés',
    'tasks_km': '@km km',
    'tasks_parcels': '@count colis',

    // Statuts et types
    'status_assigned': 'Assignée',
    'status_in_progress': 'En cours',
    'status_to_warehouse': 'Vers entrepôt',
    'status_completed': 'Terminée',
    'status_failed': 'Échouée',
    'type_pickup': 'Collecte',
    'type_delivery': 'Livraison',

    // Détail de collecte
    'task_seller': 'VENDEUR',
    'task_address': 'Adresse',
    'task_distance': 'Distance',
    'task_parcels': 'Colis',
    'task_navigate': 'Itinéraire',
    'task_arrived': 'Arrivé chez le vendeur',

    // Preuve de collecte
    'proof_title': 'Preuve de collecte',
    'proof_scan_instruction':
        'Scannez le code-barres de chaque colis, puis saisissez le code OTP du vendeur.',
    'proof_scan': 'Scanner',
    'proof_scanned': 'Scanné',
    'proof_otp_label': 'CODE OTP DU VENDEUR',
    'proof_otp_help': 'Code démo : 4321',
    'proof_otp_error': 'Code OTP incorrect. Veuillez réessayer.',
    'proof_scan_all_error': 'Veuillez d\'abord scanner tous les colis.',
    'proof_confirm_pickup': 'Confirmer la collecte',
    'proof_done_title': 'Collecte confirmée',
    'proof_done_body': 'Apportez maintenant les colis à l\'entrepôt.',

    // Arrivée entrepôt
    'wh_title': 'Arrivée à l\'entrepôt',
    'wh_route_info': 'Déposez @count colis à l\'entrepôt',
    'wh_checkin': 'Enregistrer à l\'entrepôt',
    'wh_success_title': 'Enregistrement réussi',
    'wh_success_body':
        'La tâche @id est terminée. Colis reçus à l\'entrepôt.',
    'wh_back_to_tasks': 'Retour aux tâches',

    // Lot
    'batch_stops_title': 'ARRÊTS ORDONNÉS',
    'batch_start_route': 'Démarrer la tournée',
    'batch_resume_route': 'Reprendre la tournée',
    'batch_view_summary': 'Voir le résumé',
    'batch_complete_title': 'Tournée terminée !',
    'batch_complete_body': 'Le lot @id est terminé. Excellent travail !',
    'batch_delivered': 'Livrés',
    'batch_failed_count': 'Échoués',
    'batch_back_home': 'Retour aux tâches',

    // Détail d'arrêt
    'stop_customer': 'CLIENT',
    'stop_arrived': 'Arrivé',
    'stop_failed_link': 'Livraison échouée',
    'stop_parcel': 'COLIS',

    // Preuve de livraison
    'pod_title': 'Preuve de livraison',
    'pod_instruction':
        'Scannez le colis, puis saisissez le code OTP du client pour confirmer la livraison.',
    'pod_otp_label': 'CODE OTP DU CLIENT',
    'pod_confirm': 'Confirmer la livraison',
    'pod_next_title': 'Arrêt terminé',
    'pod_next_body': 'Prochain arrêt : @name',

    // Livraison échouée
    'fail_title': 'Livraison échouée',
    'fail_reason': 'Motif',
    'fail_reason_absent': 'Client absent',
    'fail_reason_wrong_address': 'Mauvaise adresse',
    'fail_reason_refused': 'Colis refusé',
    'fail_reason_unreachable': 'Client injoignable',
    'fail_note': 'Note',
    'fail_note_hint': 'Ajoutez un commentaire (facultatif)…',
    'fail_photo': 'Photo justificative',
    'fail_photo_tap': 'Appuyez pour joindre une photo (démo)',
    'fail_photo_attached': 'Photo jointe',
    'fail_confirm': 'Confirmer l\'échec',

    // Onglet Carte
    'map_you': 'Vous',
    'map_active_task': 'TÂCHE ACTIVE',
    'map_no_active': 'Aucune tâche active pour le moment.',

    // Historique
    'history_title': 'Historique',
    'history_empty': 'Aucune tâche terminée pour l\'instant.',
    'history_today': 'Aujourd\'hui',
    'history_yesterday': 'Hier',

    // Notifications
    'notif_title': 'Notifications',
    'notif_empty': 'Aucune notification.',
    'notif_task_assigned_title': 'Nouvelle tâche assignée',
    'notif_task_assigned_body':
        'La collecte @id à @commune vous a été assignée.',
    'notif_batch_ready_title': 'Lot prêt pour livraison',
    'notif_batch_ready_body':
        'Le lot @id (@count arrêts) est prêt à l\'entrepôt.',
    'notif_announce_hours_title': 'Horaires de l\'entrepôt',
    'notif_announce_hours_body':
        'L\'entrepôt central est ouvert de 7 h 30 à 18 h 00, du lundi au samedi.',
    'notif_announce_safety_title': 'Rappel de sécurité',
    'notif_announce_safety_body':
        'Portez toujours votre casque et vérifiez votre véhicule avant chaque tournée.',
    'time_min_ago': 'il y a @m min',
    'time_hours_ago': 'il y a @h h',
    'time_days_ago': 'il y a @d j',

    // Profil
    'profile_title': 'Profil',
    'profile_city': 'Ville',
    'profile_vehicle': 'Véhicule',
    'profile_rating': 'Note',
    'profile_language': 'LANGUE',
    'profile_support': 'ASSISTANCE',
    'profile_support_tile': 'Contacter l\'assistance',
    'profile_support_subtitle': 'Équipe des opérations — Somba&Teka',
    'profile_logout': 'Se déconnecter',
    'logout_confirm_title': 'Se déconnecter ?',
    'logout_confirm_body': 'Êtes-vous sûr de vouloir vous déconnecter ?',
    'language_fr': 'Français',
    'language_en': 'English',
    'support_title': 'Assistance',
    'support_body':
        'Contactez l\'équipe des opérations pour tout problème lié à vos tâches.',
    'support_phone': 'Téléphone',
    'support_email': 'E-mail',
    'support_hours': 'Horaires',
    'support_hours_value': 'Lun–Sam, 7 h 30 – 18 h 00',
  };
}
