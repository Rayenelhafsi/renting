import 'package:flutter/material.dart';

enum UiLanguage { fr, en, ar }

class UiLanguageService {
  UiLanguageService._();

  static final ValueNotifier<UiLanguage> current =
      ValueNotifier<UiLanguage>(UiLanguage.fr);

  static const Map<String, Map<UiLanguage, String>> _dict =
      <String, Map<UiLanguage, String>>{
    'my_properties': {
      UiLanguage.fr: 'Mes Biens',
      UiLanguage.en: 'My Properties',
      UiLanguage.ar: 'عقاراتي',
    },
    'tab_properties': {
      UiLanguage.fr: 'Biens',
      UiLanguage.en: 'Properties',
      UiLanguage.ar: 'العقارات',
    },
    'tab_chat': {
      UiLanguage.fr: 'Chat',
      UiLanguage.en: 'Chat',
      UiLanguage.ar: 'الدردشة',
    },
    'tab_notifications': {
      UiLanguage.fr: 'Notif',
      UiLanguage.en: 'Notifications',
      UiLanguage.ar: 'الإشعارات',
    },
    'open': {
      UiLanguage.fr: 'Ouvrir',
      UiLanguage.en: 'Open',
      UiLanguage.ar: 'فتح',
    },
    'id': {
      UiLanguage.fr: 'ID',
      UiLanguage.en: 'ID',
      UiLanguage.ar: 'المعرف',
    },
    'maintenance_cleaning': {
      UiLanguage.fr: 'Ménage',
      UiLanguage.en: 'Cleaning',
      UiLanguage.ar: 'التنظيف',
    },
    'maintenance_plumber': {
      UiLanguage.fr: 'Plombier',
      UiLanguage.en: 'Plumber',
      UiLanguage.ar: 'السباك',
    },
    'maintenance_electrician': {
      UiLanguage.fr: 'Électricien',
      UiLanguage.en: 'Electrician',
      UiLanguage.ar: 'الكهربائي',
    },
    'maintenance_delivery': {
      UiLanguage.fr: 'Livraison',
      UiLanguage.en: 'Delivery',
      UiLanguage.ar: 'التوصيل',
    },
    'chat_admin': {
      UiLanguage.fr: 'Chat admin',
      UiLanguage.en: 'Admin chat',
      UiLanguage.ar: 'دردشة الإدارة',
    },
    'chat_hint': {
      UiLanguage.fr: 'Envoyez vos demandes à l admin depuis cet onglet.',
      UiLanguage.en: 'Send your requests to admin from this tab.',
      UiLanguage.ar: 'أرسل طلباتك إلى الإدارة من هذا القسم.',
    },
    'chat_empty': {
      UiLanguage.fr: 'Aucun message pour le moment.',
      UiLanguage.en: 'No messages yet.',
      UiLanguage.ar: 'لا توجد رسائل حالياً.',
    },
    'chat_input': {
      UiLanguage.fr: 'Écrire un message à l admin',
      UiLanguage.en: 'Write a message to admin',
      UiLanguage.ar: 'اكتب رسالة للإدارة',
    },
    'mark_read': {
      UiLanguage.fr: 'Marquer lu',
      UiLanguage.en: 'Mark read',
      UiLanguage.ar: 'تحديد كمقروء',
    },
    'owner_notifications_empty': {
      UiLanguage.fr: 'Aucune notification propriétaire.',
      UiLanguage.en: 'No owner notifications.',
      UiLanguage.ar: 'لا توجد إشعارات للمالك.',
    },
    'loading_error': {
      UiLanguage.fr: 'Erreur de chargement',
      UiLanguage.en: 'Loading error',
      UiLanguage.ar: 'خطأ في التحميل',
    },
    'no_properties': {
      UiLanguage.fr: 'Aucun bien trouvé pour ce propriétaire.',
      UiLanguage.en: 'No properties found for this owner.',
      UiLanguage.ar: 'لا توجد عقارات لهذا المالك.',
    },
    'lang_fr': {
      UiLanguage.fr: 'Français',
      UiLanguage.en: 'French',
      UiLanguage.ar: 'الفرنسية',
    },
    'lang_en': {
      UiLanguage.fr: 'Anglais',
      UiLanguage.en: 'English',
      UiLanguage.ar: 'الإنجليزية',
    },
    'lang_ar': {
      UiLanguage.fr: 'Arabe',
      UiLanguage.en: 'Arabic',
      UiLanguage.ar: 'العربية',
    },
    'owner_calendar': {
      UiLanguage.fr: 'Calendrier propriétaire',
      UiLanguage.en: 'Owner calendar',
      UiLanguage.ar: 'تقويم المالك',
    },
    'owner_calendar_help_close': {
      UiLanguage.fr:
          'Par défaut les dates sont vertes (disponibles). Sélectionnez une période à fermer (rouge) puis soumettez.',
      UiLanguage.en:
          'By default dates are green (available). Select a period to close (red) and submit.',
      UiLanguage.ar:
          'بشكل افتراضي التواريخ الخضراء متاحة. اختر فترة لإغلاقها (أحمر) ثم أرسل الطلب.',
    },
    'owner_calendar_help_open': {
      UiLanguage.fr:
          'Sélectionnez une période rouge à rouvrir (verte) puis soumettez.',
      UiLanguage.en: 'Select a red period to reopen (green) and submit.',
      UiLanguage.ar: 'اختر فترة حمراء لإعادة فتحها (أخضر) ثم أرسل الطلب.',
    },
    'owner_note': {
      UiLanguage.fr: 'Note pour admin',
      UiLanguage.en: 'Note for admin',
      UiLanguage.ar: 'ملاحظة للإدارة',
    },
    'close_period': {
      UiLanguage.fr: 'Fermer période',
      UiLanguage.en: 'Close period',
      UiLanguage.ar: 'إغلاق الفترة',
    },
    'open_period': {
      UiLanguage.fr: 'Rouvrir période',
      UiLanguage.en: 'Reopen period',
      UiLanguage.ar: 'إعادة فتح الفترة',
    },
    'submit_close': {
      UiLanguage.fr: 'Soumettre fermeture pour approbation admin',
      UiLanguage.en: 'Submit closing request for admin approval',
      UiLanguage.ar: 'إرسال طلب الإغلاق لموافقة الإدارة',
    },
    'submit_open': {
      UiLanguage.fr: 'Soumettre réouverture pour approbation admin',
      UiLanguage.en: 'Submit reopening request for admin approval',
      UiLanguage.ar: 'إرسال طلب إعادة الفتح لموافقة الإدارة',
    },
    'available': {
      UiLanguage.fr: 'Disponible',
      UiLanguage.en: 'Available',
      UiLanguage.ar: 'متاح',
    },
    'unavailable': {
      UiLanguage.fr: 'Indisponible',
      UiLanguage.en: 'Unavailable',
      UiLanguage.ar: 'غير متاح',
    },
    'owner_badge': {
      UiLanguage.fr: 'Propriétaire',
      UiLanguage.en: 'Owner',
      UiLanguage.ar: 'مالك',
    },
    'up_to_date': {
      UiLanguage.fr: 'À jour',
      UiLanguage.en: 'Up to date',
      UiLanguage.ar: 'محدّث',
    },
    'pending_validation': {
      UiLanguage.fr: 'Validation en attente',
      UiLanguage.en: 'Pending validation',
      UiLanguage.ar: 'بانتظار التحقق',
    },
    'calendar_pending_admin': {
      UiLanguage.fr: 'Demande calendrier en attente',
      UiLanguage.en: 'Calendar request pending',
      UiLanguage.ar: 'Ø·Ù„Ø¨ ØªÙ‚ÙˆÙŠÙ… Ù‚ÙŠØ¯ Ø§Ù„Ø§Ù†ØªØ¸Ø§Ø±',
    },
    'reservation_tracking_title': {
      UiLanguage.fr: 'Suivi reservation',
      UiLanguage.en: 'Reservation tracking',
      UiLanguage.ar: 'Ù…ØªØ§Ø¨Ø¹Ø© Ø§Ù„Ø­Ø¬Ø²',
    },
    'reservation_tracking_period': {
      UiLanguage.fr: 'Periode',
      UiLanguage.en: 'Period',
      UiLanguage.ar: 'Ø§Ù„ÙØªØ±Ø©',
    },
    'reservation_status_waiting_client': {
      UiLanguage.fr: 'Reponse positive en attente confirmation client',
      UiLanguage.en: 'Positive response awaiting client confirmation',
      UiLanguage.ar: 'Ø±Ø¯ Ø¥ÙŠØ¬Ø§Ø¨ÙŠ ÙÙŠ Ø§Ù†ØªØ¸Ø§Ø± ØªØ£ÙƒÙŠØ¯ Ø§Ù„Ø¹Ù…ÙŠÙ„',
    },
    'reservation_status_client_payment': {
      UiLanguage.fr: 'Client en cours de paiement',
      UiLanguage.en: 'Client payment in progress',
      UiLanguage.ar: 'Ø§Ù„Ø¹Ù…ÙŠÙ„ ÙÙŠ Ø·ÙˆØ± Ø§Ù„Ø¯ÙØ¹',
    },
    'reservation_status_receipt_sent': {
      UiLanguage.fr: 'Recu de paiement envoye',
      UiLanguage.en: 'Payment receipt sent',
      UiLanguage.ar: 'ØªÙ… Ø¥Ø±Ø³Ø§Ù„ Ø¥ÙŠØµØ§Ù„ Ø§Ù„Ø¯ÙØ¹',
    },
    'reservation_status_payment_success': {
      UiLanguage.fr: 'Succes paiement',
      UiLanguage.en: 'Payment success',
      UiLanguage.ar: 'Ù†Ø¬Ø§Ø­ Ø§Ù„Ø¯ÙØ¹',
    },
    'reservation_status_contract_done': {
      UiLanguage.fr: 'Contrat realise',
      UiLanguage.en: 'Contract completed',
      UiLanguage.ar: 'ØªÙ… Ø¥Ù†Ø¬Ø§Ø² Ø§Ù„Ø¹Ù‚Ø¯',
    },
    'availability_confirm_title': {
      UiLanguage.fr: 'Confirmer disponibilite',
      UiLanguage.en: 'Confirm availability',
      UiLanguage.ar: 'تأكيد التوفر',
    },
    'availability_arrival': {
      UiLanguage.fr: 'Arrivee',
      UiLanguage.en: 'Arrival',
      UiLanguage.ar: 'الوصول',
    },
    'availability_departure': {
      UiLanguage.fr: 'Depart',
      UiLanguage.en: 'Departure',
      UiLanguage.ar: 'المغادرة',
    },
    'availability_travelers': {
      UiLanguage.fr: 'Voyageurs',
      UiLanguage.en: 'Travelers',
      UiLanguage.ar: 'المسافرون',
    },
    'availability_adult_singular': {
      UiLanguage.fr: 'adulte',
      UiLanguage.en: 'adult',
      UiLanguage.ar: 'بالغ',
    },
    'availability_adult_plural': {
      UiLanguage.fr: 'adultes',
      UiLanguage.en: 'adults',
      UiLanguage.ar: 'بالغين',
    },
    'availability_child_singular': {
      UiLanguage.fr: 'enfant',
      UiLanguage.en: 'child',
      UiLanguage.ar: 'طفل',
    },
    'availability_child_plural': {
      UiLanguage.fr: 'enfants',
      UiLanguage.en: 'children',
      UiLanguage.ar: 'اطفال',
    },
    'availability_question': {
      UiLanguage.fr: 'Ce bien est-il disponible pour cette periode ?',
      UiLanguage.en: 'Is this property available for this period?',
      UiLanguage.ar: 'هل هذا العقار متاح خلال هذه الفترة؟',
    },
    'availability_no': {
      UiLanguage.fr: 'Non disponible',
      UiLanguage.en: 'Not available',
      UiLanguage.ar: 'غير متاح',
    },
    'availability_yes': {
      UiLanguage.fr: 'Oui disponible',
      UiLanguage.en: 'Yes available',
      UiLanguage.ar: 'نعم متاح',
    },
  };

  static String t(String key) {
    final byLang = _dict[key];
    if (byLang == null) return key;
    return byLang[current.value] ?? byLang[UiLanguage.fr] ?? key;
  }

  static TextDirection direction(UiLanguage language) {
    return language == UiLanguage.ar ? TextDirection.rtl : TextDirection.ltr;
  }

  static String localeName([UiLanguage? language]) {
    switch (language ?? current.value) {
      case UiLanguage.en:
        return 'en_US';
      case UiLanguage.ar:
        return 'ar';
      case UiLanguage.fr:
        return 'fr_FR';
    }
  }
}
