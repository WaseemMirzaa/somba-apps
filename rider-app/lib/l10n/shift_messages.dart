// The texts of the "Shift & attendance" screen: key -> (English, French). Spread into `kMessages` (messages.dart), typed
// accessors in shift_strings.dart.

const Map<String, (String, String)> kShiftMessages = {
  'shift_title': ('Shift & attendance', 'Service et présence'),
  'shift_entry_sub': ('Clock in, take breaks and see your last 7 days.', 'Pointez, faites des pauses et voyez vos 7 derniers jours.'),
  'shift_current': ('Current shift', 'Service en cours'),
  'shift_status_off': ('Off shift', 'Hors service'),
  'shift_status_on': ('On shift', 'En service'),
  'shift_status_break': ('On break', 'En pause'),
  'shift_not_clocked': ('You are not clocked in.', 'Vous n’avez pas pointé.'),
  'shift_started': ('Started {when}', 'Commencé {when}'),
  'shift_last_ended': ('Last shift ended {when}', 'Dernier service terminé {when}'),
  'shift_worked': ('Worked {time}', 'Travaillé : {time}'),
  'shift_breaks': ('Breaks: {time}', 'Pauses : {time}'),
  'shift_start': ('Start shift', 'Commencer le service'),
  'shift_end': ('End shift', 'Terminer le service'),
  'shift_break_start': ('Take a break', 'Prendre une pause'),
  'shift_break_end': ('End break', 'Reprendre'),
  'shift_end_title': ('End your shift?', 'Terminer votre service ?'),
  'shift_end_body': ('Your hours are saved. You can start a new shift at any time.', 'Vos heures sont enregistrées. Vous pourrez recommencer à tout moment.'),
  'shift_done_start': ('Shift started. Have a good day!', 'Service commencé. Bonne journée !'),
  'shift_done_end': ('Shift ended. Your hours are saved.', 'Service terminé. Vos heures sont enregistrées.'),
  'shift_done_break_start': ('Break started.', 'Pause commencée.'),
  'shift_done_break_end': ('Back on shift.', 'Retour en service.'),
  'shift_week': ('Last 7 days', '7 derniers jours'),
  'shift_stat_shifts': ('Shifts', 'Services'),
  'shift_stat_hours': ('Hours', 'Heures'),
  'shift_history_empty': ('No shifts in the last 7 days.', 'Aucun service ces 7 derniers jours.'),
  'shift_in_out': ('In {in} · Out {out}', 'Début {in} · Fin {out}'),
  'shift_in_progress': ('In {in} · In progress', 'Début {in} · En cours'),
  'shift_break_line': ('Break {time}', 'Pause {time}'),
  'shift_auto_closed': ('Closed automatically', 'Clôturé automatiquement'),
  'shift_load_failed': ('Could not load your shifts.', 'Impossible de charger vos services.'),
  'shift_retry': ('Try again', 'Réessayer'),
};

/// The server's own messages for the shift events (always English), in French.
const Map<String, String> kShiftServerErrorsFr = {
  'Start your shift first.': 'Commencez d’abord votre service.',
  'Your account is switched off. Ask an administrator.': 'Votre compte est désactivé. Contactez un administrateur.',
  'Rider not found.': 'Livreur introuvable.',
};
